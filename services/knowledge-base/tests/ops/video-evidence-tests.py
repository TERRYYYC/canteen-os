"""Contract tests exercise real files and observable subprocess boundaries."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
import wave
from unittest.mock import patch
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("video_prepare", REPO / "scripts/video-evidence/prepare.py")
prepare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare)


class FakeTools:
    """External programs supply independently fixed, non-grid frame times."""
    def __init__(self, *, fail=None, short_audio=False, late_gap=False, ocr_error=False, bad_asr=False):
        self.calls = []
        self.fail = fail
        self.short_audio = short_audio
        self.late_gap = late_gap
        self.ocr_error = ocr_error
        self.bad_asr = bad_asr

    def __call__(self, command, *, env):
        self.calls.append(command)
        assert isinstance(command, list)
        assert env["HF_HUB_OFFLINE"] == "1"
        stage = ("probe" if "-show_streams" in command else
                 "audio" if "pcm_s16le" in command else
                 "frames" if "-vf" in command else
                 "ocr" if any(str(arg).endswith("ocr.swift") for arg in command) else "asr")
        if self.fail == stage:
            return subprocess.CompletedProcess(command, 7, "", f"{stage}: deliberately failed")
        if stage == "probe":
            data = {"format": {"duration": "4.200", "start_time": "0.0"}, "streams": [
                {"index": 0, "codec_type": "video", "duration": "4.200", "start_time": "0.0"},
                {"index": 1, "codec_type": "audio", "duration": "4.200", "start_time": "0.0"},
            ]}
            return subprocess.CompletedProcess(command, 0, json.dumps(data), "")
        if stage == "audio":
            with wave.open(command[-1], "wb") as wav:
                wav.setnchannels(1)
                wav.setframerate(16000)
                wav.setsampwidth(2)
                wav.writeframes(b"\x00\x00" * (16000 if self.short_audio else 67200))
        if stage == "frames":
            times = [0, 0.52, 1.04, 1.52, 2.04, 2.52, 3.04, 3.52, 4.04]
            if self.late_gap:
                times = times[:3]
            for i, time in enumerate(times, 1):
                Path(command[-1].replace("%08d", f"{i:08d}")).write_bytes(f"image {time}".encode())
            logs = "\n".join(f"[Parsed_showinfo_2 @ abc] n: {i} pts: {i} pts_time:{t} duration:1" for i, t in enumerate(times))
            return subprocess.CompletedProcess(command, 0, "", logs)
        if stage == "ocr":
            frames = json.loads(Path(command[-2]).read_text())
            result = [{"frame": frame["path"], "timeMs": frame["timeMs"], "lines": [],
                       "error": "bad image" if self.ocr_error else None} for frame in frames]
            Path(command[-1]).write_text(json.dumps(result))
        if stage == "asr":
            Path(command[-1]).write_text(json.dumps({
                "engine": "mlx-whisper", "settings": {"conditionOnPreviousText": False, "language": "zh"},
                "audio": {"sampleRate": 16000, "frames": 67200, "durationMs": 4200},
                "result": {"text": "放入牛肉", "segments": [{"start": 0.5, "end": 8 if self.bad_asr else 1.3, "text": "放入牛肉"}]},
            }))
        return subprocess.CompletedProcess(command, 0, "", "")


class PrepareTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="video-evidence-test-")
        self.root = Path(self.temp.name)
        self.media = self.root / "source ' $(touch nope).mp4"
        self.media.write_bytes(b"synthetic media input")
        self.model = self.root / "model"
        self.model.mkdir()
        (self.model / "config.json").write_text("{}")
        (self.model / "weights.npz").write_bytes(b"offline model")
        self.cache = self.root / "cache"
        self.settings = {"asr_python": sys.executable, "asr_model": str(self.model),
                         "ffmpeg": sys.executable, "ffprobe": sys.executable, "swift": sys.executable,
                         "fps": 2, "language": "zh"}

    def tearDown(self):
        self.temp.cleanup()

    def run_prepare(self, tools=None, **changes):
        return prepare.prepare(self.media, self.cache, self.settings | changes, runner=tools or FakeTools())

    def test_full_package_and_actual_frame_times(self):
        tools = FakeTools()
        result = self.run_prepare(tools)
        self.assertEqual(result["status"], "ready_for_analysis")
        self.assertFalse(result["cacheHit"])
        manifest = json.loads(Path(result["manifestPath"]).read_text())
        coverage = manifest["coverage"]
        self.assertEqual(coverage["audioProcessedThroughMs"], 4200)
        self.assertEqual(coverage["frameCount"], 9)
        self.assertEqual(coverage["lastFrameMs"], 4040)
        self.assertEqual(coverage["maxFrameGapMs"], 520)
        self.assertEqual(coverage["speechSpanMs"], 800)
        self.assertEqual(coverage["unverifiedAudioSpans"], [[0, 500], [1300, 4200]])
        self.assertIn(str(self.media.resolve()), tools.calls[0])
        self.assertFalse((self.root / "nope").exists())

    def test_cache_hit_skips_every_external_call_and_is_content_addressed(self):
        first = self.run_prepare()
        duplicate = self.root / "other-name.mp4"
        duplicate.write_bytes(self.media.read_bytes())
        def forbidden(*args, **kwargs):
            self.fail("a verified cache hit called an external tool")
        result = prepare.prepare(duplicate, self.cache, self.settings, runner=forbidden)
        self.assertEqual(result["status"], "ready_for_analysis")
        self.assertTrue(result["cacheHit"])
        self.assertEqual(first["manifestPath"], result["manifestPath"])

    def test_missing_or_corrupt_artifact_never_hits_cache(self):
        for kind in ["missing", "corrupt"]:
            with self.subTest(kind=kind):
                first = self.run_prepare()
                manifest = json.loads(Path(first["manifestPath"]).read_text())
                artifact = next(a for a in manifest["artifacts"] if a["path"].endswith("ocr.json"))
                path = Path(first["manifestPath"]).parent / artifact["path"]
                if kind == "missing":
                    path.unlink()
                else:
                    path.write_bytes(b"X" * path.stat().st_size)
                tools = FakeTools()
                second = self.run_prepare(tools)
                self.assertFalse(second["cacheHit"])
                self.assertTrue(tools.calls)
                self.assertNotEqual(first["manifestPath"], second["manifestPath"])

    def test_changed_media_model_and_settings_have_distinct_keys(self):
        a = self.run_prepare()
        b = self.run_prepare(fps=1)
        self.media.write_bytes(b"different media")
        c = self.run_prepare()
        (self.model / "weights.npz").write_bytes(b"different offline model")
        d = self.run_prepare()
        self.assertEqual(len({x["cacheKey"] for x in [a, b, c, d]}), 4)

    def test_failed_external_stage_is_not_complete_and_can_be_retried(self):
        for stage in ["probe", "audio", "frames", "ocr", "asr"]:
            with self.subTest(stage=stage):
                cache = self.root / ("failure-" + stage)
                with self.assertRaisesRegex(Exception, stage):
                    prepare.prepare(self.media, cache, self.settings, runner=FakeTools(fail=stage))
                self.assertFalse(list(cache.rglob("complete.json")))
                attempts = list(cache.rglob("manifest.json"))
                self.assertEqual(len(attempts), 1)
                self.assertEqual(json.loads(attempts[0].read_text())["status"], "failed")
                result = prepare.prepare(self.media, cache, self.settings, runner=FakeTools())
                self.assertEqual(result["status"], "ready_for_analysis")
                self.assertEqual(len(list(cache.rglob("manifest.json"))), 2)

    def test_incomplete_or_invalid_output_never_becomes_ready(self):
        for option in ["short_audio", "late_gap", "ocr_error", "bad_asr"]:
            with self.subTest(option=option):
                cache = self.root / option
                with self.assertRaises(Exception):
                    prepare.prepare(self.media, cache, self.settings, runner=FakeTools(**{option: True}))
                self.assertFalse(list(cache.rglob("complete.json")))

    def test_cache_under_repo_is_rejected_before_subprocesses(self):
        tools = FakeTools()
        with self.assertRaisesRegex(Exception, "outside.*repository"):
            prepare.prepare(self.media, REPO / "derived-media", self.settings, runner=tools)
        self.assertFalse(tools.calls)

    def test_cache_under_enclosing_checkout_or_archive_is_rejected_before_subprocesses(self):
        for marker_type in ("directory", "worktree-file", "source-archive"):
            with self.subTest(marker_type=marker_type):
                checkout = self.root / marker_type
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
                tools = FakeTools()
                with patch.object(prepare, "REPO", module), self.assertRaisesRegex(ValueError, "outside.*repository"):
                    prepare.prepare(self.media, cache, self.settings, runner=tools)
                self.assertFalse(cache.exists())
                self.assertFalse(tools.calls)

    def test_source_archive_without_git_protects_module_root(self):
        module = self.root / "source-archive"
        module.mkdir()
        tools = FakeTools()
        with patch.object(prepare, "REPO", module), self.assertRaisesRegex(ValueError, "outside.*repository"):
            prepare.prepare(self.media, module / "private-cache", self.settings, runner=tools)
        self.assertFalse((module / "private-cache").exists())
        self.assertFalse(tools.calls)

    def test_symlinked_cache_entry_is_rejected_without_writing_target(self):
        first = self.run_prepare()
        other_cache = self.root / "other-cache"
        other_cache.mkdir()
        unrelated = self.root / "unrelated"
        unrelated.mkdir()
        (other_cache / first["cacheKey"]).symlink_to(unrelated, target_is_directory=True)
        with self.assertRaisesRegex(Exception, "symlink"):
            prepare.prepare(self.media, other_cache, self.settings, runner=FakeTools())
        self.assertEqual(list(unrelated.iterdir()), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
