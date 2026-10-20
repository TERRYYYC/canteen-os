#!/usr/bin/env python3
"""Offline MLX Whisper adapter; called only with a complete local WAV/model."""
import json
import os
import sys
import wave
from pathlib import Path


def main():
    audio_path, model_path, language, output_path = sys.argv[1:]
    if not Path(model_path).is_dir():
        raise ValueError("ASR requires an existing local model directory")
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_DATASETS_OFFLINE="1")
    import mlx_whisper
    with wave.open(audio_path, "rb") as wav:
        if wav.getframerate() != 16000 or wav.getnchannels() != 1:
            raise ValueError("ASR input must be the full 16 kHz mono WAV")
        frames = wav.getnframes()
    result = mlx_whisper.transcribe(audio_path, path_or_hf_repo=model_path, language=language,
                                    condition_on_previous_text=False, temperature=0.0, verbose=None)
    payload = {"engine": "mlx-whisper", "modelPath": model_path,
               "settings": {"conditionOnPreviousText": False, "language": language, "temperature": 0.0},
               "audio": {"sampleRate": 16000, "frames": frames, "durationMs": round(frames / 16)},
               "result": result}
    Path(output_path).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
