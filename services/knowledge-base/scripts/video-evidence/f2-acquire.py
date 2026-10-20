#!/usr/bin/env python3
"""Acquire a complete public video through F2, once, into a verified cache."""
import argparse
import asyncio
import contextlib
import fcntl
import hashlib
import importlib.metadata
import importlib.util
import io
import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True

CONTRACT = "f2-video-acquire/v1"
REPO = Path(__file__).resolve().parents[2]


def repository_boundary(module_root):
    """Exclude the containing checkout/archive, or the module in a standalone distribution."""
    module_root = Path(module_root).resolve()
    for parent in (module_root, *module_root.parents):
        if (parent / ".git").exists():
            return parent
    for parent in (module_root, *module_root.parents):
        if all((parent / marker).is_file() for marker in (
                "pnpm-workspace.yaml", "packages/core/package.json", "schemas/dish.schema.json")):
            return parent
    return module_root


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def build_f2_kwargs(token_provider, headers):
    token = token_provider()
    if not isinstance(token, str) or not token or any(char in token for char in "\r\n;"):
        raise ValueError("F2 visitor initialization did not return a usable ttwid")
    return {"cookie": f"ttwid={token}", "headers": headers, "verify": True,
            "max_retries": 1, "timeout": 15, "max_connections": 1, "max_tasks": 1,
            "music": False, "cover": False, "desc": False, "folderize": False,
            "naming": "{aweme_id}", "interval": "all"}


def validate_probe(data, expected_duration_ms=None):
    def milliseconds(value, *, positive=False):
        number = float(value)
        if not math.isfinite(number) or (positive and number <= 0):
            raise ValueError("media has an invalid duration")
        return round(number * 1000)
    streams = data.get("streams", [])
    videos = [s for s in streams if s.get("codec_type") == "video"
              and not s.get("disposition", {}).get("attached_pic")]
    audios = [s for s in streams if s.get("codec_type") == "audio"]
    if len(videos) != 1 or len(audios) != 1:
        raise ValueError("complete recipe media requires one video and one audio stream")
    duration = milliseconds(data["format"]["duration"], positive=True)
    video_ms = milliseconds(videos[0]["duration"], positive=True)
    audio_ms = milliseconds(audios[0]["duration"], positive=True)
    video_start = milliseconds(videos[0].get("start_time", 0))
    audio_start = milliseconds(audios[0].get("start_time", 0))
    if max(video_start + video_ms, audio_start + audio_ms) > duration + 250:
        raise ValueError("stream timeline exceeds container duration")
    if expected_duration_ms is not None:
        expected = float(expected_duration_ms)
        if not math.isfinite(expected) or expected <= 0 or abs(video_ms - expected) > 1000:
            raise ValueError("download duration differs from F2 source detail")
    return {"videoDurationMs": video_ms, "audioDurationMs": audio_ms,
            "videoStartMs": video_start, "audioStartMs": audio_start,
            "containerDurationMs": duration}


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def manifest_sha(record):
    return hashlib.sha256(canonical({k: v for k, v in record.items()
                                     if k != "manifestSha256"}).encode()).hexdigest()


def safe_child(base, relative):
    path = Path(relative)
    if path.is_absolute() or not path.parts or any(p in (".", "..") for p in path.parts):
        raise ValueError("invalid cache-relative path")
    current = Path(base)
    for part in path.parts:
        current /= part
        if current.is_symlink():
            raise ValueError("cache entry is a symlink")
    return current


def save_json(path, value):
    path = Path(path)
    temp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    with temp.open("x", encoding="utf-8") as file:
        file.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        file.flush()
        os.fsync(file.fileno())
    os.replace(temp, path)


@contextlib.contextmanager
def working_directory(directory):
    # F2 writes a relative user DB from its downloader. This CLI runs one work per process.
    previous = Path.cwd()
    os.chdir(directory)
    try:
        yield
    finally:
        os.chdir(previous)


def read_cache(base, identity):
    try:
        path = safe_child(base, "complete.json")
        if not path.is_file():
            return None
        record = json.loads(path.read_text())
        if (record.get("status") != "media_ready" or record.get("identity") != identity
                or record.get("manifestSha256") != manifest_sha(record)
                or record["source"]["workId"] != identity["workId"]):
            return None
        media = safe_child(base, record["source"]["path"])
        if (not media.is_file() or media.stat().st_size != record["source"]["bytes"]
                or digest(media) != record["source"]["sha256"]):
            return None
        if min(record["probe"]["videoDurationMs"], record["probe"]["audioDurationMs"]) <= 0:
            return None
        return record
    except (ValueError, TypeError, KeyError, OSError):
        return None


class AcquisitionError(Exception):
    def __init__(self, record, path):
        self.record = record
        self.path = str(path)
        super().__init__(record.get("stage", "acquisition"))


class F2Backend:
    def __init__(self, source_tree):
        self.source_tree = Path(source_tree).expanduser().resolve()

    def fingerprint(self):
        def git(*args):
            return subprocess.run(["git", "-C", str(self.source_tree), *args],
                                  capture_output=True, text=True, check=True).stdout.strip()
        remote = git("remote", "get-url", "origin").rstrip("/")
        if remote not in ("https://github.com/Johnserf-Seed/f2.git", "https://github.com/Johnserf-Seed/f2",
                          "git@github.com:Johnserf-Seed/f2.git"):
            raise ValueError("F2 source tree is not the official repository")
        commit = git("rev-parse", "HEAD")
        tracked = set(git("ls-tree", "-r", "--name-only", "HEAD", "--", "f2").splitlines())
        if git("diff", "HEAD", "--", "f2"):
            raise ValueError("F2 source tree has changed runtime files")
        spec = importlib.util.find_spec("f2")
        if spec is None or not spec.origin:
            raise ValueError("F2 is not installed in this Python environment")
        installed = Path(spec.origin).resolve().parent
        files = {}
        for file in sorted(installed.rglob("*")):
            if file.suffix not in (".py", ".yaml", ".js", ".json") or "__pycache__" in file.parts:
                continue
            relative = file.relative_to(installed)
            if "f2/" + relative.as_posix() not in tracked:
                raise ValueError("installed F2 runtime is not tracked by the source commit")
            source = self.source_tree / "f2" / relative
            if not source.is_file() or digest(file) != digest(source):
                raise ValueError("installed F2 runtime differs from the source commit")
            files[str(relative)] = digest(file)
        if "apps/douyin/crawler.py" not in files or "conf/conf.yaml" not in files:
            raise ValueError("F2 installed runtime is incomplete")
        return {"officialRepository": remote, "sourceCommit": commit,
                "packageVersion": importlib.metadata.version("f2"), "runtimeFiles": files}

    async def fetch(self, work_id, directory, record):
        # This isolated process disables F2 logs, whose errors may carry signed URLs.
        logging.disable(logging.CRITICAL)
        import httpx
        from f2.apps.douyin import handler as handler_module
        from f2.apps.douyin.crawler import DouyinCrawler
        from f2.apps.douyin.utils import ClientConfManager, TokenManager
        observations = record.setdefault("http", [])
        expected = {}

        def observe(response):
            data = {"stage": ("detail" if response.request.url.path == "/aweme/v1/web/aweme/detail/"
                              else "visitor_bootstrap" if "ttwid" in response.request.url.host else "ms_token"),
                    "host": response.request.url.host, "path": response.request.url.path,
                    "httpStatus": response.status_code,
                    "contentType": response.headers.get("content-type"), "responseBytes": len(response.content)}
            try:
                body = response.json()
                if isinstance(body, dict):
                    data["statusCode"] = body.get("status_code")
                    detail = body.get("aweme_detail")
                    if isinstance(detail, dict):
                        data["returnedWorkId"] = str(detail.get("aweme_id"))
                        video = detail.get("video") or {}
                        expected["durationMs"] = video.get("duration") or detail.get("duration")
            except (ValueError, TypeError):
                public_error = re.search(r"Blocked by ArgusSecurityPlugin (?:Uifid Not Found|Signature Not Found|Sign Invalid|Sign Expired)", response.text[:256])
                if public_error:
                    data["publicError"] = public_error.group(0)
            observations.append(data)

        original_post = httpx.Client.post
        original_crawler = handler_module.DouyinCrawler
        handler = None

        def observed_post(client, *pos, **kw):
            host = httpx.URL(pos[0] if pos else kw["url"]).host
            record["stage"] = "visitor_bootstrap" if "ttwid" in host else "ms_token"
            response = original_post(client, *pos, **kw)
            observe(response)
            return response

        class ObservedCrawler(DouyinCrawler):
            def __init__(self, *pos, **kw):
                super().__init__(*pos, **kw)
                async def request_hook(request):
                    record["stage"] = "detail"
                async def hook(response):
                    await response.aread()
                    observe(response)
                self.aclient.event_hooks["request"].append(request_hook)
                self.aclient.event_hooks["response"].append(hook)

        httpx.Client.post = observed_post
        handler_module.DouyinCrawler = ObservedCrawler
        try:
            record["stage"] = "visitor_bootstrap"
            kwargs = build_f2_kwargs(TokenManager.gen_ttwid, ClientConfManager.headers())
            handler = handler_module.DouyinHandler(kwargs)
            record["stage"] = "detail"
            video = await handler.fetch_one_video(work_id)
            if str(video.aweme_id) != work_id:
                raise ValueError("F2 returned a different work ID")
            record["detail"] = {"workId": work_id, "author": video.nickname, "title": video.desc,
                                "expectedVideoDurationMs": expected.get("durationMs")}
            record["stage"] = "download"
            # Each attempt has an empty dedicated directory; old MP4s cannot count as this download.
            await handler.downloader.create_download_tasks(kwargs, video._to_dict(), directory)
            path = directory / (work_id + "_video.mp4")
            if not path.is_file() or path.is_symlink() or path.stat().st_size == 0:
                raise ValueError("F2 did not produce this attempt's complete MP4")
            return {"path": path, "workId": str(video.aweme_id),
                    "expectedDurationMs": expected.get("durationMs")}
        finally:
            try:
                if handler is not None:
                    await handler.downloader.close()
            finally:
                httpx.Client.post = original_post
                handler_module.DouyinCrawler = original_crawler


async def acquire(work_id, cache, *, backend, ffprobe="ffprobe", runner=subprocess.run):
    if not re.fullmatch(r"\d{19}", str(work_id)):
        raise ValueError("work-id must be a 19 digit Douyin work ID")
    work_id = str(work_id)
    cache = Path(cache).expanduser().absolute()
    if cache.is_symlink() or cache.resolve().is_relative_to(repository_boundary(REPO)):
        raise ValueError("cache must be outside the repository and cannot be a symlink")
    cache = cache.resolve()
    tool = shutil.which(ffprobe)
    if tool is None:
        raise ValueError("ffprobe is not installed")
    identity = {"contract": CONTRACT, "workId": work_id,
                "sourceUrl": f"https://www.douyin.com/video/{work_id}",
                "adapterSha256": digest(__file__), "f2": backend.fingerprint(),
                "ffprobe": {"path": str(Path(tool).absolute()), "sha256": digest(tool)}}
    key = hashlib.sha256(canonical(identity).encode()).hexdigest()
    base = cache / "f2" / work_id / key
    # Every directory component is checked before mkdir or writing the lock.
    current = cache
    for part in ("f2", work_id, key):
        current = safe_child(current, part)
        current.mkdir(parents=True, exist_ok=True)
    lock_path = safe_child(base, ".lock")
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        cached = read_cache(base, identity)
        if cached:
            return {"status": "media_ready", "cacheHit": True, "cacheKey": key,
                    "manifestPath": str(base / "complete.json"),
                    "mediaPath": str(safe_child(base, cached["source"]["path"]))}
        attempt = base / ("attempt-" + uuid.uuid4().hex)
        attempt.mkdir()
        manifest = attempt / "manifest.json"
        record = {"status": "running", "startedAt": datetime.now(timezone.utc).isoformat(),
                  "identity": identity, "stage": "visitor_bootstrap", "http": [],
                  "acquisitionMethod": "f2", "browserSessionRead": False}
        save_json(manifest, record)
        try:
            with working_directory(attempt):
                media = await backend.fetch(work_id, attempt, record)
            if media.get("workId") != work_id:
                raise ValueError("download source work ID does not match")
            file = Path(media["path"])
            if (not file.is_file() or file.is_symlink() or file.stat().st_size <= 0
                    or not file.resolve().is_relative_to(attempt.resolve())):
                raise ValueError("download did not create a complete file in the new attempt")
            record["stage"] = "media_verification"
            result = runner([tool, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(file)],
                            capture_output=True, text=True, check=False)
            if result.returncode != 0 or result.stderr.strip():
                raise ValueError("ffprobe rejected the downloaded file")
            raw_probe = json.loads(result.stdout)
            record["probe"] = validate_probe(raw_probe, media.get("expectedDurationMs"))
            save_json(attempt / "ffprobe.json", raw_probe)
            record["source"] = {"workId": work_id, "path": str(file.relative_to(base)),
                                "bytes": file.stat().st_size, "sha256": digest(file)}
            record["status"] = "media_ready"
            record["stage"] = "complete"
            record["manifestSha256"] = manifest_sha(record)
            save_json(manifest, record)
            save_json(base / "complete.json", record)
            return {"status": "media_ready", "cacheHit": False, "cacheKey": key,
                    "manifestPath": str(base / "complete.json"), "mediaPath": str(file)}
        except BaseException as exc:
            record["status"] = "failed"
            record["errorType"] = type(exc).__name__
            # Exception text can contain credentials and signed URLs; only type/stage are saved.
            save_json(manifest, record)
            if isinstance(exc, (KeyboardInterrupt, SystemExit, asyncio.CancelledError)):
                raise
            raise AcquisitionError(record, manifest) from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-id", required=True)
    parser.add_argument("--cache", required=True)
    parser.add_argument("--f2-source", required=True, help="Clean official F2 checkout matching the installed package")
    parser.add_argument("--ffprobe", default="ffprobe")
    args = parser.parse_args(argv)
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            result = asyncio.run(acquire(args.work_id, args.cache,
                                        backend=F2Backend(args.f2_source), ffprobe=args.ffprobe))
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except AcquisitionError as exc:
        print(json.dumps({"status": "failed", "stage": exc.record["stage"],
                          "errorType": exc.record["errorType"], "manifestPath": exc.path}, ensure_ascii=False))
        return 1
    except KeyboardInterrupt:
        print(json.dumps({"status": "interrupted"}))
        return 130
    except Exception as exc:
        print(json.dumps({"status": "failed", "stage": "preflight", "errorType": type(exc).__name__}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
