"""Offline protection for the observed missing visitor state and false cache success."""
import importlib.util
import hashlib
import asyncio
import json
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("f2_acquire", REPO / "scripts/video-evidence/f2-acquire.py")
acquire = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(acquire)


class ContractTests(unittest.TestCase):
    def test_bootstrap_uses_f2_visitor_token_once(self):
        calls = []
        def provider():
            calls.append(True)
            return "visitor-from-platform"
        kwargs = acquire.build_f2_kwargs(provider, {"User-Agent": "official-config"})
        self.assertEqual(kwargs["cookie"], "ttwid=visitor-from-platform")
        self.assertEqual(len(calls), 1)
        self.assertTrue(kwargs["verify"])
        self.assertEqual(kwargs["max_retries"], 1)

    def test_empty_bootstrap_token_is_failure(self):
        with self.assertRaises(ValueError):
            acquire.build_f2_kwargs(lambda: "", {})

    def test_missing_audio_video_and_short_source_are_rejected(self):
        video = {"codec_type": "video", "duration": "10", "start_time": "0"}
        audio = {"codec_type": "audio", "duration": "10", "start_time": "0"}
        for streams in [[], [video], [audio], [video, audio, video]]:
            with self.subTest(streams=streams), self.assertRaises(ValueError):
                acquire.validate_probe({"format": {"duration": "10"}, "streams": streams}, 10000)
        with self.assertRaises(ValueError):
            acquire.validate_probe({"format": {"duration": "10"}, "streams": [video, audio]}, 60000)
        valid = acquire.validate_probe({"format": {"duration": "10"}, "streams": [video, audio]}, 10000)
        self.assertEqual(valid["audioDurationMs"], 10000)

    def test_cache_rejects_wrong_source_and_same_size_corruption(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            media = base / "source.mp4"
            media.write_bytes(b"original video")
            identity = {"workId": "7000000000000000003"}
            record = {"status": "media_ready", "identity": identity, "source": {
                "workId": identity["workId"], "path": "source.mp4", "bytes": media.stat().st_size,
                "sha256": acquire.digest(media)}, "probe": {"videoDurationMs": 10000, "audioDurationMs": 10000}}
            record["manifestSha256"] = hashlib.sha256(json.dumps(record, sort_keys=True, ensure_ascii=False,
                    separators=(",", ":")).encode()).hexdigest()
            (base / "complete.json").write_text(json.dumps(record))
            self.assertIsNotNone(acquire.read_cache(base, identity))
            self.assertIsNone(acquire.read_cache(base, {"workId": "other-source"}))
            media.write_bytes(b"X" * media.stat().st_size)
            self.assertIsNone(acquire.read_cache(base, identity))

    def test_untracked_installed_runtime_cannot_be_attributed_to_git_commit(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "checkout"
            installed = root / "site-packages/f2"
            source.mkdir()
            subprocess.run(["git", "init", str(source)], capture_output=True, check=True)
            subprocess.run(["git", "-C", str(source), "remote", "add", "origin",
                            "https://github.com/Johnserf-Seed/f2.git"], check=True)
            for relative in ["__init__.py", "apps/douyin/crawler.py", "conf/conf.yaml"]:
                file = source / "f2" / relative
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text("# tracked fixture\n")
                copy = installed / relative
                copy.parent.mkdir(parents=True, exist_ok=True)
                copy.write_bytes(file.read_bytes())
            subprocess.run(["git", "-C", str(source), "add", "f2"], check=True)
            subprocess.run(["git", "-C", str(source), "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                            "commit", "-m", "fixture"], capture_output=True, check=True)
            # Both directories contain matching bytes, but this file belongs to no source commit.
            (source / "f2/untracked.py").write_text("# untracked runtime\n")
            (installed / "untracked.py").write_text("# untracked runtime\n")
            with patch.object(acquire.importlib.util, "find_spec", return_value=SimpleNamespace(origin=str(installed / "__init__.py"))), \
                 patch.object(acquire.importlib.metadata, "version", return_value="fixture"):
                with self.assertRaises(ValueError):
                    acquire.F2Backend(source).fingerprint()


class FakeBackend:
    def __init__(self, mode="success", wrong_id=False):
        self.calls = 0
        self.mode = mode
        self.wrong_id = wrong_id

    def fingerprint(self):
        return {"sourceCommit": "offline-fixture"}

    async def fetch(self, work_id, directory, record):
        self.calls += 1
        record["stage"] = "detail"
        if self.mode == "fail":
            raise RuntimeError("Cookie=must-not-save; https://example.test/?msToken=must-not-save")
        if self.mode == "relative-state":
            Path("douyin_users.db").write_bytes(b"relative F2 state")
        file = directory / (work_id + "_video.mp4")
        if self.mode != "missing":
            file.write_bytes(b"independent fixture media bytes")
        record["stage"] = "download"
        return {"path": file, "workId": "different" if self.wrong_id else work_id,
                "expectedDurationMs": 10000}


class AcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.cache = Path(self.temp.name) / "cache"
        self.backend = FakeBackend()
        self.probe_calls = []

    def tearDown(self):
        self.temp.cleanup()

    def probe(self, command, **kwargs):
        self.probe_calls.append(command)
        return subprocess.CompletedProcess(command, 0, json.dumps({"format": {"duration": "10"},
            "streams": [{"codec_type": "video", "duration": "10", "start_time": "0"},
                        {"codec_type": "audio", "duration": "9.96", "start_time": "0"}]}), "")

    def run_acquire(self, **changes):
        import sys
        return asyncio.run(acquire.acquire("7000000000000000003", self.cache,
            backend=changes.get("backend", self.backend), ffprobe=sys.executable,
            runner=changes.get("runner", self.probe)))

    def test_cache_hit_has_no_network_or_probe_and_corruption_refetches(self):
        first = self.run_acquire()
        self.assertFalse(first["cacheHit"])
        second = self.run_acquire()
        self.assertTrue(second["cacheHit"])
        self.assertEqual(first["mediaPath"], second["mediaPath"])
        self.assertEqual(self.backend.calls, 1)
        self.assertEqual(len(self.probe_calls), 1)
        media = Path(first["mediaPath"])
        media.write_bytes(b"X" * media.stat().st_size)
        third = self.run_acquire()
        self.assertFalse(third["cacheHit"])
        self.assertEqual(self.backend.calls, 2)
        self.assertNotEqual(first["mediaPath"], third["mediaPath"])

    def test_failure_is_retained_redacted_and_can_retry(self):
        backend = FakeBackend("fail")
        with self.assertRaises(acquire.AcquisitionError) as error:
            self.run_acquire(backend=backend)
        saved = Path(error.exception.path).read_text()
        self.assertNotIn("must-not-save", saved)
        self.assertEqual(json.loads(saved)["status"], "failed")
        self.assertEqual(json.loads(saved)["stage"], "detail")
        self.assertFalse(list(self.cache.rglob("complete.json")))
        recovered = self.run_acquire()
        self.assertEqual(recovered["status"], "media_ready")
        self.assertEqual(len(list(self.cache.rglob("manifest.json"))), 2)

    def test_no_file_wrong_work_id_and_bad_probe_never_publish_completion(self):
        for backend in [FakeBackend("missing"), FakeBackend(wrong_id=True)]:
            with self.subTest(backend=backend), self.assertRaises(acquire.AcquisitionError):
                self.run_acquire(backend=backend)
            self.assertFalse(list(self.cache.rglob("complete.json")))
        def bad_probe(command, **kwargs):
            return subprocess.CompletedProcess(command, 1, "", "broken mp4")
        with self.assertRaises(acquire.AcquisitionError) as error:
            self.run_acquire(runner=bad_probe)
        self.assertEqual(error.exception.record["stage"], "media_verification")
        self.assertFalse(list(self.cache.rglob("complete.json")))
        def misleading_success(command, **kwargs):
            result = self.probe(command, **kwargs)
            result.stderr = "codec error while probing"
            return result
        with self.assertRaises(acquire.AcquisitionError):
            self.run_acquire(runner=misleading_success)
        self.assertFalse(list(self.cache.rglob("complete.json")))

    def test_cli_failed_acquisition_exits_nonzero(self):
        import io
        import sys
        output = io.StringIO()
        with patch.object(acquire, "F2Backend", return_value=FakeBackend("fail")), \
             patch.dict(os.environ, {"PATH": ""}), \
             patch("sys.stdout", output):
            code = acquire.main(["--work-id", "7000000000000000003", "--cache", str(self.cache),
                                 "--f2-source", "unused-fixture", "--ffprobe", sys.executable])
        self.assertEqual(code, 1)
        result = json.loads(output.getvalue())
        self.assertEqual(result["stage"], "detail")
        self.assertEqual(result["errorType"], "RuntimeError")
        self.assertNotIn("must-not-save", output.getvalue())

    def test_cli_missing_ffprobe_fails_before_fetch(self):
        import io
        output = io.StringIO()
        backend = FakeBackend("fail")
        with patch.object(acquire, "F2Backend", return_value=backend), \
             patch("sys.stdout", output):
            code = acquire.main(["--work-id", "7000000000000000003", "--cache", str(self.cache),
                                 "--f2-source", "unused-fixture", "--ffprobe", str(self.cache / "missing-ffprobe")])
        self.assertEqual(code, 1)
        result = json.loads(output.getvalue())
        self.assertEqual(result["stage"], "preflight")
        self.assertEqual(result["errorType"], "ValueError")
        self.assertEqual(backend.calls, 0)
        self.assertFalse(self.cache.exists())

    def test_cache_under_enclosing_checkout_or_archive_is_rejected_before_fetch(self):
        import sys
        for marker_type in ("directory", "worktree-file", "source-archive"):
            with self.subTest(marker_type=marker_type):
                checkout = Path(self.temp.name) / marker_type
                module = checkout / "services" / "knowledge-base"
                module.mkdir(parents=True)
                marker = checkout / ".git"
                if marker_type == "directory":
                    marker.mkdir()
                elif marker_type == "worktree-file":
                    marker.write_text("gitdir: /external/example-worktree-metadata\n")
                else:
                    for relative in ("pnpm-workspace.yaml", "packages/core/package.json", "schemas/dish.schema.json"):
                        fixture = checkout / relative
                        fixture.parent.mkdir(parents=True, exist_ok=True)
                        fixture.write_text("source-archive marker\n")
                cache = checkout / "private-video-cache"
                backend = FakeBackend()
                with patch.object(acquire, "REPO", module), self.assertRaisesRegex(ValueError, "outside.*repository"):
                    asyncio.run(acquire.acquire("7000000000000000003", cache,
                        backend=backend, ffprobe=sys.executable, runner=self.probe))
                self.assertFalse(cache.exists())
                self.assertEqual(backend.calls, 0)

    def test_source_archive_without_git_protects_module_root(self):
        import sys
        module = Path(self.temp.name) / "source-archive"
        module.mkdir()
        with patch.object(acquire, "REPO", module), self.assertRaisesRegex(ValueError, "outside.*repository"):
            asyncio.run(acquire.acquire("7000000000000000003", module / "private-cache",
                backend=FakeBackend(), ffprobe=sys.executable, runner=self.probe))
        self.assertFalse((module / "private-cache").exists())

    def test_relative_f2_state_is_kept_inside_attempt_not_callers_cwd(self):
        caller = Path(self.temp.name) / "caller"
        caller.mkdir()
        original = Path.cwd()
        try:
            os.chdir(caller)
            result = self.run_acquire(backend=FakeBackend("relative-state"))
            self.assertEqual(Path.cwd(), caller.resolve())
            self.assertFalse((caller / "douyin_users.db").exists())
            self.assertTrue((Path(result["mediaPath"]).parent / "douyin_users.db").is_file())
        finally:
            os.chdir(original)


if __name__ == "__main__":
    unittest.main()
