#!/usr/bin/env python3
"""Prepare local audio, timed frames, OCR and ASR; never generate/approve a recipe."""
import argparse
import fcntl
import hashlib
import json
import math
import os
import platform
import re
import shutil
import subprocess
import sys
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path

CONTRACT = "video-evidence-prepare/v1"
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]


def repository_boundary(module_root):
    """Keep script lookup module-relative while excluding the whole checkout/archive from caches."""
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
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def save_json(path, value):
    """Only replace our own manifest; derived files live in unique attempt dirs."""
    path = Path(path)
    temp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    with temp.open("x", encoding="utf-8") as file:
        file.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        file.flush()
        os.fsync(file.fileno())
    os.replace(temp, path)


def now():
    return datetime.now(timezone.utc).isoformat()


def executable(value):
    found = shutil.which(str(value))
    if not found:
        raise ValueError(f"executable not found: {value}")
    # Preserve the venv path: resolving python's symlink would lose its packages.
    return str(Path(found).absolute())


def identity_for(media, settings):
    fps = settings.get("fps", 2)
    if fps not in (1, 2):
        raise ValueError("fps must be 1 or 2")
    language = settings.get("language", "zh")
    if not re.fullmatch(r"[a-z]{2,3}", language):
        raise ValueError("language must be an explicit Whisper language code")
    model = Path(settings["asr_model"]).expanduser().resolve()
    if not model.is_dir() or not (model / "config.json").is_file():
        raise ValueError("asr_model must be an existing local MLX model directory (no download)")
    if not any((model / name).is_file() for name in ("weights.npz", "weights.safetensors")):
        raise ValueError("local MLX model has no weights.npz or weights.safetensors")
    tools = {name: executable(settings.get(name, name)) for name in ("ffmpeg", "ffprobe", "swift")}
    tools["asr_python"] = executable(settings["asr_python"])
    prefix = Path(tools["asr_python"]).parent.parent
    env_files = sorted(prefix.glob("lib/python*/site-packages/*.dist-info/METADATA"))
    if (prefix / "pyvenv.cfg").is_file():
        env_files.append(prefix / "pyvenv.cfg")
    identity = {
        "contract": CONTRACT,
        "media": {"sha256": digest(media), "bytes": media.stat().st_size},
        "settings": {"fps": fps, "language": language, "audioSampleRate": 16000,
                     "conditionOnPreviousText": False, "temperature": 0.0,
                     "ocrLanguages": ["zh-Hans", "zh-Hant", "en-US"]},
        "implementation": {file.name: digest(file) for file in sorted(HERE.glob("*"))
                           if file.suffix in (".py", ".swift")},
        "tools": {name: {"path": path, "sha256": digest(path)} for name, path in tools.items()},
        "asrEnvironment": {str(file.relative_to(prefix)): digest(file) for file in env_files},
        "model": {"path": str(model), "files": {str(file.relative_to(model)): digest(file)
                  for file in sorted(model.rglob("*")) if file.is_file()}},
        "host": {"system": platform.system(), "release": platform.release(), "machine": platform.machine()},
    }
    return identity, tools, model


def run_process(command, *, env):
    return subprocess.run(command, env=env, capture_output=True, text=True, check=False)


def checked_artifact(base, relative):
    path = Path(relative)
    if path.is_absolute() or not path.parts or any(part in (".", "..") for part in path.parts):
        raise ValueError("unsafe cache artifact path")
    candidate = base / path
    if not candidate.is_file() or any(p.is_symlink() for p in [candidate, *candidate.parents] if p != base.parent):
        raise ValueError("missing or symlinked cache artifact")
    if not candidate.resolve().is_relative_to(base.resolve()):
        raise ValueError("cache artifact escaped its attempt")
    return candidate


def cache_lookup(entry, identity, key):
    try:
        receipt = json.loads((entry / "complete.json").read_text())
        relative = Path(receipt["manifest"])
        if len(relative.parts) != 2 or not relative.parts[0].startswith("attempt-") or relative.parts[1] != "manifest.json":
            return None
        path = checked_artifact(entry, relative)
        if digest(path) != receipt["sha256"]:
            return None
        manifest = json.loads(path.read_text())
        if (manifest["status"] != "ready_for_analysis" or manifest["identity"] != identity
                or manifest["cacheKey"] != key):
            return None
        if not manifest["artifacts"]:
            return None
        for item in manifest["artifacts"]:
            artifact = checked_artifact(path.parent, item["path"])
            if artifact.stat().st_size != item["bytes"] or digest(artifact) != item["sha256"]:
                return None
        return path
    except (OSError, ValueError, KeyError, TypeError):
        return None


def seconds_ms(value, label):
    try:
        numeric = float(value)
    except (ValueError, TypeError):
        raise ValueError(f"{label}: missing/invalid time") from None
    if not math.isfinite(numeric) or numeric < 0:
        raise ValueError(f"{label}: invalid time")
    return round(numeric * 1000)


def source_info(probe):
    videos = [s for s in probe["streams"] if s["codec_type"] == "video" and not s.get("disposition", {}).get("attached_pic")]
    audios = [s for s in probe["streams"] if s["codec_type"] == "audio"]
    if len(videos) != 1 or len(audios) > 1:
        raise ValueError("probe: requires one primary video and at most one audio stream; select multi-track sources explicitly first")
    origin = float(probe["format"].get("start_time", 0))
    result = {"streams": {"video": True, "audio": bool(audios)}, "selectedStreams": {"video": videos[0]["index"]},
              "durationMs": seconds_ms(probe["format"]["duration"], "format duration")}
    for name, stream in (("video", videos[0]), ("audio", audios[0] if audios else None)):
        result[name + "DurationMs"] = seconds_ms(stream["duration"], name + " duration") if stream else 0
        if stream and result[name + "DurationMs"] <= 0:
            raise ValueError(f"probe: {name} duration must be positive")
        result[name + "TimelineOffsetMs"] = seconds_ms(max(0, float(stream.get("start_time", origin)) - origin), name + " offset") if stream else 0
        if stream:
            result["selectedStreams"][name] = stream["index"]
    return result


def audio_info(path):
    with wave.open(str(path), "rb") as file:
        if file.getnchannels() != 1 or file.getframerate() != 16000 or file.getsampwidth() != 2:
            raise ValueError("audio: expected 16 kHz mono PCM16")
        frames = file.getnframes()
        if frames <= 0 or len(file.readframes(frames)) != frames * 2:
            raise ValueError("audio: WAV data is empty/truncated")
    return {"sampleRate": 16000, "frames": frames, "durationMs": round(frames / 16)}


def speech_coverage(asr, audio):
    if asr.get("audio") != audio or asr.get("settings", {}).get("conditionOnPreviousText") is not False:
        raise ValueError("asr: full input audio/settings receipt mismatch")
    spans = []
    for segment in asr["result"]["segments"]:
        start = seconds_ms(segment["start"], "ASR start")
        end = seconds_ms(segment["end"], "ASR end")
        if end < start or end > audio["durationMs"] + 250 or not isinstance(segment["text"], str):
            raise ValueError("asr: invalid segment bounds/text")
        if segment["text"].strip():
            spans.append([min(start, audio["durationMs"]), min(end, audio["durationMs"])])
    merged = []
    for start, end in sorted(spans):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    missing, cursor = [], 0
    for start, end in merged:
        if start > cursor:
            missing.append([cursor, start])
        cursor = end
    if cursor < audio["durationMs"]:
        missing.append([cursor, audio["durationMs"]])
    return {"speechSpans": merged, "speechSpanMs": sum(b - a for a, b in merged),
            "unverifiedAudioSpans": missing}


def prepare(media, cache, settings, *, runner=None):
    media, cache = Path(media).expanduser().resolve(), Path(cache).expanduser().resolve()
    if cache.is_relative_to(repository_boundary(REPO)):
        raise ValueError("cache must be outside the repository")
    if not media.is_file() or media.stat().st_size == 0:
        raise ValueError("media must be an existing nonempty local file")
    identity, tools, model = identity_for(media, settings)
    key = hashlib.sha256(canonical(identity).encode()).hexdigest()
    entry = cache / key
    if entry.is_symlink():
        raise ValueError("cache entry must not be a symlink")
    entry.mkdir(parents=True, exist_ok=True)
    runner = runner or run_process
    env = {**os.environ, "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_DATASETS_OFFLINE": "1"}

    def result(path, hit):
        return {"status": "ready_for_analysis", "cacheHit": hit, "cacheKey": key,
                "manifestPath": str(path), "mediaPath": str(media), "recipeAnalysisComplete": False}

    # Advisory OS lock is automatically released after interruption; no stale-lock deletion.
    lock_path = entry / ".lock"
    if lock_path.is_symlink() or (lock_path.exists() and not lock_path.is_file()):
        raise ValueError("cache lock must be a regular file, not a symlink")
    with os.fdopen(os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), "a") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        cached = cache_lookup(entry, identity, key)
        if cached:
            return result(cached, True)
        attempt = entry / ("attempt-" + uuid.uuid4().hex)
        attempt.mkdir()
        (attempt / "frames").mkdir()
        (attempt / "logs").mkdir()
        manifest_path = attempt / "manifest.json"
        manifest = {"contract": CONTRACT, "cacheKey": key, "identity": identity, "status": "running",
                    "startedAt": now(), "mediaPath": str(media), "stages": {}, "recipeAnalysisComplete": False}
        save_json(manifest_path, manifest)
        stage = "probe"

        def execute(name, command):
            nonlocal stage
            stage = name
            manifest["stages"][name] = {"status": "running", "command": command}
            save_json(manifest_path, manifest)
            completed = runner(command, env=env)
            (attempt / "logs" / (name + ".stdout.log")).write_text(completed.stdout or "")
            (attempt / "logs" / (name + ".stderr.log")).write_text(completed.stderr or "")
            if completed.returncode:
                raise RuntimeError(f"{name}: process exited {completed.returncode}; see {attempt / 'logs'}")
            manifest["stages"][name]["status"] = "processed"
            return completed

        try:
            probe = execute("probe", [tools["ffprobe"], "-v", "error", "-show_streams", "-show_format", "-of", "json", str(media)])
            (attempt / "probe.json").write_text(probe.stdout)
            source = source_info(json.loads(probe.stdout))
            manifest["source"] = {**identity["media"], **source}
            coverage = {"audioProcessedThroughMs": 0, "speechSpanMs": 0, "speechSpans": [], "unverifiedAudioSpans": []}
            audio = None
            base = [tools["ffmpeg"], "-nostdin", "-hide_banner", "-xerror", "-i", str(media)]
            if source["streams"]["audio"]:
                execute("audio", base + ["-map", "0:" + str(source["selectedStreams"]["audio"]), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(attempt / "audio.wav")])
                audio = audio_info(attempt / "audio.wav")
                if abs(audio["durationMs"] - source["audioDurationMs"]) > 250:
                    raise ValueError("audio: decoded duration does not cover the source audio (250 ms tolerance)")
                coverage["audioProcessedThroughMs"] = audio["durationMs"]
                coverage["audioDurationDeltaMs"] = audio["durationMs"] - source["audioDurationMs"]
            else:
                manifest["stages"]["audio"] = {"status": "not_present"}

            # Select real decoded frames and retain their PTS. fps filter would invent
            # grid timestamps for duplicate/drop decisions and hide irregular samples.
            fps = identity["settings"]["fps"]
            select = f"setpts=PTS-STARTPTS,select='isnan(prev_selected_t)+gt(floor(t*{fps}),floor(prev_selected_t*{fps}))',showinfo"
            decoded = execute("frames", base + ["-map", "0:" + str(source["selectedStreams"]["video"]), "-an", "-vf", select,
                                                "-fps_mode", "vfr", "-q:v", "2", str(attempt / "frames" / "%08d.jpg")])
            samples = re.findall(r"\[Parsed_showinfo[^\]]*\]\s+n:\s*(\d+).*?\bpts_time:([^\s]+)", decoded.stderr)
            times = [seconds_ms(t, "frame timestamp") for _, t in samples]
            frame_files = sorted((attempt / "frames").glob("*.jpg"))
            if (not times or len(frame_files) != len(times) or any(not file.stat().st_size for file in frame_files)
                    or [int(n) for n, _ in samples] != list(range(len(times)))):
                raise ValueError("frames: missing frames or decoded timestamps")
            gaps = [b - a for a, b in zip(times, times[1:])]
            ending_gap = source["videoDurationMs"] - times[-1]
            if times[0] != 0 or any(gap <= 0 or gap > 2000 for gap in gaps) or not -250 <= ending_gap <= 2000:
                raise ValueError("frames: incomplete/invalid source coverage (maximum 2000 ms gap)")
            frame_index = [{"path": str(file.relative_to(attempt)), "timeMs": time,
                            "sourceTimeMs": source["videoTimelineOffsetMs"] + time} for file, time in zip(frame_files, times)]
            save_json(attempt / "frames.json", frame_index)
            coverage.update({"frameCount": len(times), "firstFrameMs": times[0], "lastFrameMs": times[-1],
                             "maxFrameGapMs": max(gaps, default=0), "endingFrameGapMs": ending_gap,
                             "videoProcessedThroughMs": source["videoDurationMs"]})
            execute("ocr", [tools["swift"], str(HERE / "ocr.swift"), str(attempt / "frames.json"), str(attempt / "ocr.json")])
            ocr = json.loads((attempt / "ocr.json").read_text())
            if len(ocr) != len(frame_index) or any(record.get("error") or record.get("frame") != frame["path"]
                    or record.get("timeMs") != frame["timeMs"] or not isinstance(record.get("lines"), list)
                    for record, frame in zip(ocr, frame_index)):
                raise ValueError("ocr: missing/failed/mismatched frame observations")
            if audio:
                execute("asr", [tools["asr_python"], str(HERE / "asr.py"), str(attempt / "audio.wav"), str(model),
                                identity["settings"]["language"], str(attempt / "asr.json")])
                asr = json.loads((attempt / "asr.json").read_text())
                if asr.get("settings", {}).get("language") != identity["settings"]["language"]:
                    raise ValueError("asr: language receipt mismatch")
                coverage.update(speech_coverage(asr, audio))
            else:
                manifest["stages"]["asr"] = {"status": "not_present"}
            stage = "integrity"
            # Avoid publishing a key for bytes changed while tools read the input.
            if digest(media) != identity["media"]["sha256"] or media.stat().st_size != identity["media"]["bytes"]:
                raise ValueError("media changed during preparation")
            manifest["coverage"] = coverage
            manifest["limitations"] = ["Raw ASR/OCR needs culinary and visual-action review; no recipe has been generated.",
                                       "ASR gaps are unverified audio, not verified silence.",
                                       "Sampled frames may miss brief captions; densify disputed spans before claiming recipe completeness.",
                                       "Times are relative to each stream; sourceTimeMs/videoTimelineOffsetMs/audioTimelineOffsetMs preserve alignment."]
            manifest["artifacts"] = [{"path": str(file.relative_to(attempt)), "bytes": file.stat().st_size, "sha256": digest(file)}
                                     for file in sorted(attempt.rglob("*")) if file.is_file() and file != manifest_path]
            manifest["status"] = "ready_for_analysis"
            manifest["finishedAt"] = now()
            save_json(manifest_path, manifest)
            save_json(entry / "complete.json", {"manifest": str(manifest_path.relative_to(entry)), "sha256": digest(manifest_path)})
            return result(manifest_path, False)
        except BaseException as error:
            manifest["status"] = "interrupted" if isinstance(error, (KeyboardInterrupt, SystemExit)) else "failed"
            manifest["failedStage"] = stage
            manifest["error"] = str(error)
            manifest["finishedAt"] = now()
            save_json(manifest_path, manifest)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media", type=Path, required=True)
    parser.add_argument("--cache", type=Path, default=Path.home() / ".local/share/canteen-video/evidence")
    parser.add_argument("--asr-python", required=True, help="Python executable in your persistent mlx-whisper environment")
    parser.add_argument("--asr-model", required=True, help="Existing local MLX model directory; never a remote repo ID")
    parser.add_argument("--fps", type=int, choices=(1, 2), default=2)
    parser.add_argument("--language", default="zh")
    for name in ("ffmpeg", "ffprobe", "swift"):
        parser.add_argument("--" + name, default=name)
    args = vars(parser.parse_args())
    media, cache = args.pop("media"), args.pop("cache")
    try:
        print(json.dumps(prepare(media, cache, args), ensure_ascii=False, indent=2))
    except (Exception, KeyboardInterrupt) as error:
        print(json.dumps({"status": "interrupted" if isinstance(error, KeyboardInterrupt) else "failed", "error": str(error)}), file=sys.stderr)
        return 130 if isinstance(error, KeyboardInterrupt) else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
