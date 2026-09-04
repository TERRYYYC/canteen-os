#!/usr/bin/env python3
"""parse_video.py — video-recipe-ingest 参考实现：做菜视频 → dishpack 标准包。

引擎可插拔（统一接口 parse(input, lang_hint) -> raw_recipe dict）：
  fixture  离线确定性路径：读取 fixtures/tomato-egg/ 预置的模拟引擎输出与转写，
           跑完整后处理管线。CI 与默认演示路径，开箱即跑、零密钥。
  gemini   Google Gemini（generateContent + responseSchema 约束 JSON 输出）。
           需要环境变量 GEMINI_API_KEY；视频 <20MB 走 inline base64，更大走 Files API；
           YouTube URL 走 file_data.file_uri，其余平台 URL 需先下载为本地文件。
  qwen     阿里云百炼 Qwen-VL（OpenAI 兼容接口）。需要环境变量 DASHSCOPE_API_KEY。

公共后处理（与引擎无关）：
  raw_recipe → 清洗/归一 → 组装 dishpack（packVersion/id/createdAt/generator/source/
  manifest/transcript/reviewQueue，严格按 SKILL.md §2-§3）→ 词典匹配生成
  ingredientMappings（fixtures/ingredient-dictionary.json）→ 质量门槛（SKILL.md §4：
  置信度 <0.85 标 needsReview 并写 reviewQueue.reasons）→ 调 validate_dishpack.py
  校验（不通过按 §4 重试/标记 rejected）→ 写输出文件。

退出码：0 成功；1 校验失败；2 配置错误（如缺 API key）；3 引擎调用失败。

用法：
  python3 parse_video.py --input <视频文件或URL> --engine <gemini|qwen|fixture> \
      [--lang-hint zh|en|uk] --output <dishpack.json>
示例（离线演示）：
  python3 parse_video.py --input fixtures --engine fixture --output /tmp/dishpack-out.json
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = SKILL_ROOT.parent.parent
FIXTURE_ROOT = SKILL_ROOT / "fixtures"
DEFAULT_FIXTURE = FIXTURE_ROOT / "tomato-egg"
DICTIONARY_FILE = FIXTURE_ROOT / "ingredient-dictionary.json"
PROMPT_FILE = SKILL_ROOT / "prompts" / "extract-recipe.md"
VALIDATOR = SKILL_ROOT / "scripts" / "validate_dishpack.py"

CONFIDENCE_THRESHOLD = 0.85
UNIT_ENUM = ("g", "kg", "ml", "l", "pcs", "pack", "tbsp", "tsp", "pinch")
GENERATOR_NAME = "video-recipe-ingest"

GEMINI_MODEL_DEFAULT = "gemini-2.5-flash"
GEMINI_INLINE_LIMIT = 20 * 1024 * 1024  # 超过则走 Files API
QWEN_MODEL_DEFAULT = "qwen3-vl-plus"


class EngineError(Exception):
    """引擎调用失败（exit 3）。"""


class MissingConfigError(Exception):
    """配置缺失（如 API key，exit 2）。"""


# --------------------------------------------------------------------------- prompt 资产加载


def load_prompt_assets() -> tuple[str, dict, str]:
    """从 prompts/extract-recipe.md 解析 (指令文本, responseSchema, promptVersion)。"""
    text = PROMPT_FILE.read_text(encoding="utf-8")
    m = re.search(r"<!--\s*PROMPT_VERSION:\s*(\S+)\s*-->", text)
    version = m.group(1) if m else "unknown"
    m = re.search(r"<!--\s*SCHEMA:BEGIN\s*-->\s*```json\s*(\{.*?\})\s*```\s*<!--\s*SCHEMA:END\s*-->", text, re.S)
    if not m:
        raise EngineError(f"无法从 {PROMPT_FILE} 解析 responseSchema（SCHEMA:BEGIN/END 标记缺失）")
    schema = json.loads(m.group(1))
    return text, schema, version


def render_prompt(template: str, lang_hint: str | None) -> str:
    if lang_hint:
        line = {
            "zh": "语言提示：视频旁白主语言大概率为中文（zh）。",
            "en": "Language hint: the narration is most likely English (en).",
            "uk": "Підказка: озвучення ймовірно українською (uk).",
        }[lang_hint]
    else:
        line = "语言未知，请自行检测并在 detectedLang 中如实标注。/ Language unknown — detect it and report in detectedLang."
    return template.replace("{LANG_HINT}", line)


# --------------------------------------------------------------------------- 词典与数量解析


def load_dictionary() -> dict:
    return json.loads(DICTIONARY_FILE.read_text(encoding="utf-8"))


def match_ingredient(raw: str, name_hint: str | None, dictionary: dict) -> str | None:
    """字符串 → 知识库 Ingredient 的词典匹配。

    策略：nameHint 精确命中别名优先；否则在 raw 中取最长别名子串匹配
    （最长优先可缓解「油」命中「酱油」类误配）。
    返回 ingredientRef（如 ing-tomato）或 None。

    TODO(prod): 接真实知识库 API（全量词条 + 模糊匹配/向量召回），
    本 fixture 词典仅为演示与 CI 的最小子集。
    """
    candidates: list[tuple[str, str]] = []  # (alias, ingredientRef)
    for entry in dictionary["ingredients"]:
        for aliases in entry["aliases"].values():
            for alias in aliases:
                candidates.append((alias, entry["id"]))
    if name_hint:
        hint = name_hint.strip().lower()
        for alias, ref in candidates:
            if alias.lower() == hint:
                return ref
    lowered = raw.lower()
    best: tuple[int, str | None] = (0, None)
    for alias, ref in candidates:
        if len(alias) > best[0] and alias.lower() in lowered:
            best = (len(alias), ref)
    return best[1]


def parse_quantity_from_raw(raw: str, dictionary: dict) -> dict | None:
    """从 "番茄 300 克" 这类字符串兜底解析 {value, unit}（引擎未给 quantity 时使用）。"""
    alias_to_unit = {
        alias: unit for unit, aliases in dictionary["unitAliases"].items() for alias in aliases
    }
    # 数字 + 单位别名（按别名长度降序，避免「升」抢在「毫升」前）
    aliases = sorted(alias_to_unit, key=len, reverse=True)
    pattern = re.compile(r"(\d+(?:\.\d+)?)\s*(" + "|".join(re.escape(a) for a in aliases) + ")", re.I)
    m = pattern.search(raw)
    if not m:
        return None
    value = float(m.group(1))
    unit = alias_to_unit[m.group(2).lower()] if m.group(2).lower() in alias_to_unit else alias_to_unit[m.group(2)]
    if value <= 0 or unit not in UNIT_ENUM:
        return None
    return {"value": int(value) if value == int(value) else value, "unit": unit}


# --------------------------------------------------------------------------- 引擎统一接口与三个 adapter
#
# 统一接口：parse(input_value, lang_hint) -> raw_recipe(dict)
# raw_recipe 契约（与 prompts/extract-recipe.md 的 responseSchema 对应）：
#   detectedLang, durationSeconds?, recipe{...schema.org/Recipe...},
#   ingredients[{raw, nameHint?, quantity{value,unit}, confidence}],
#   steps[{order, instruction{zh,en,uk}, durationMinutes?, tools?, timestampRange, confidence}],
#   suggestedDish{name{zh,en,uk}, category, baseServings},
#   overallConfidence, transcript{lang, text, segments?}, media?
# 真实引擎的 meta（id/createdAt/engine/source 等）由 adapter 依据 CLI 输入注入。


class FixtureEngine:
    """离线确定性引擎：读预置的模拟引擎输出，用于 CI 与演示。"""

    engine = "fixture"

    def __init__(self, fixture_dir: Path | None = None):
        self.fixture_dir = fixture_dir or DEFAULT_FIXTURE

    def parse(self, input_value: str, lang_hint: str | None) -> dict:
        output_file = self.fixture_dir / "engine-output.json"
        if not output_file.is_file():
            raise EngineError(f"fixture 缺少 {output_file}")
        raw = json.loads(output_file.read_text(encoding="utf-8"))
        transcript_ref = raw.pop("transcriptFile", "transcript.zh.txt")
        transcript_file = self.fixture_dir / transcript_ref
        if not transcript_file.is_file():
            raise EngineError(f"fixture 缺少转写文件 {transcript_file}")
        raw.setdefault("transcript", {})["text"] = transcript_file.read_text(encoding="utf-8")
        raw["transcript"]["lang"] = raw["transcript"].get("lang") or raw.get("detectedLang", "zh")
        return raw


class GeminiEngine:
    """Google Gemini generateContent + responseSchema。需要 GEMINI_API_KEY。"""

    engine = "gemini"

    def __init__(self, model: str | None = None):
        self.model = model or os.environ.get("GEMINI_MODEL", GEMINI_MODEL_DEFAULT)
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if not self.api_key:
            raise MissingConfigError(
                "缺少 GEMINI_API_KEY 环境变量。\n"
                "获取方式：访问 https://aistudio.google.com/apikey 创建 API key（免费档可 POC），\n"
                "然后 export GEMINI_API_KEY=<your-key> 后重试。"
            )

    def parse(self, input_value: str, lang_hint: str | None) -> dict:
        prompt_template, schema, prompt_version = load_prompt_assets()
        prompt = render_prompt(prompt_template, lang_hint)
        video_part = self._build_video_part(input_value)
        body = {
            "contents": [{"parts": [{"text": prompt}, video_part]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema,
            },
        }
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        resp = self._post_json(url, body)
        try:
            text = resp["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise EngineError(f"Gemini 响应结构异常: {exc}; 原始响应片段: {str(resp)[:500]}") from exc
        raw = _parse_json_loose(text)
        raw["meta"] = self._build_meta(input_value, prompt_version)
        return raw

    def _build_video_part(self, input_value: str) -> dict:
        if re.match(r"^https?://", input_value):
            if re.search(r"(^|\.)youtube\.com/|youtu\.be/", input_value):
                # Gemini 原生支持 YouTube URL
                return {"file_data": {"file_uri": input_value}}
            raise EngineError(
                f"Gemini 仅直接支持 YouTube URL；当前 URL（{input_value}）"
                "请先用 yt-dlp 等工具下载为本地文件后重试。"
            )
        path = Path(input_value)
        if not path.is_file():
            raise EngineError(f"视频文件不存在: {path}")
        size = path.stat().st_size
        mime = mimetypes.guess_type(path.name)[0] or "video/mp4"
        if size <= GEMINI_INLINE_LIMIT:
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            return {"inline_data": {"mime_type": mime, "data": data}}
        # 大文件走 Files API（resumable upload）
        file_uri = self._upload_file(path, mime, size)
        return {"file_data": {"file_uri": file_uri}}

    def _upload_file(self, path: Path, mime: str, size: int) -> str:
        start_url = f"https://generativelanguage.googleapis.com/upload/v1beta/files?key={self.api_key}"
        req = urllib.request.Request(
            start_url,
            method="POST",
            data=b"",
            headers={
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length": str(size),
                "X-Goog-Upload-Header-Content-Type": mime,
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            upload_url = resp.headers["X-Goog-Upload-URL"]
        req = urllib.request.Request(
            upload_url,
            method="POST",
            data=path.read_bytes(),
            headers={
                "X-Goog-Upload-Command": "upload, finalize",
                "X-Goog-Upload-Offset": "0",
                "Content-Length": str(size),
            },
        )
        with urllib.request.urlopen(req, timeout=600) as resp:
            info = json.loads(resp.read().decode("utf-8"))
        return info["file"]["uri"]

    def _post_json(self, url: str, body: dict) -> dict:
        req = urllib.request.Request(
            url,
            method="POST",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:500]
            raise EngineError(f"Gemini API HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise EngineError(f"Gemini API 网络错误: {exc.reason}") from exc

    def _build_meta(self, input_value: str, prompt_version: str) -> dict:
        engine_tag = "gemini-pro" if "pro" in self.model else "gemini-flash"
        return {
            "engine": engine_tag,
            "engineVersion": self.model,
            "promptVersion": prompt_version,
            "source": {
                "videoUrl": _input_to_uri(input_value),
                "platform": _detect_platform(input_value),
            },
        }


class QwenEngine:
    """阿里云百炼 Qwen-VL，OpenAI 兼容接口。需要 DASHSCOPE_API_KEY。"""

    engine = "qwen"

    def __init__(self, model: str | None = None):
        self.model = model or os.environ.get("DASHSCOPE_MODEL", QWEN_MODEL_DEFAULT)
        self.api_key = os.environ.get("DASHSCOPE_API_KEY")
        if not self.api_key:
            raise MissingConfigError(
                "缺少 DASHSCOPE_API_KEY 环境变量。\n"
                "获取方式：登录阿里云百炼平台 https://bailian.console.aliyun.com/ 开通并创建 API-KEY，\n"
                "然后 export DASHSCOPE_API_KEY=<your-key> 后重试。"
            )

    def parse(self, input_value: str, lang_hint: str | None) -> dict:
        prompt_template, schema, prompt_version = load_prompt_assets()
        prompt = render_prompt(prompt_template, lang_hint)
        video_content = self._build_video_content(input_value)
        body = {
            "model": self.model,
            "messages": [
                {"role": "user", "content": [video_content, {"type": "text", "text": prompt}]}
            ],
            "response_format": {"type": "json_object"},
        }
        url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        req = urllib.request.Request(
            url,
            method="POST",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:500]
            raise EngineError(f"Qwen API HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise EngineError(f"Qwen API 网络错误: {exc.reason}") from exc
        try:
            text = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise EngineError(f"Qwen 响应结构异常: {exc}; 原始响应片段: {str(payload)[:500]}") from exc
        raw = _parse_json_loose(text)
        raw["meta"] = {
            "engine": "qwen-vl",
            "engineVersion": self.model,
            "promptVersion": prompt_version,
            "source": {
                "videoUrl": _input_to_uri(input_value),
                "platform": _detect_platform(input_value),
            },
        }
        return raw

    def _build_video_content(self, input_value: str) -> dict:
        if re.match(r"^https?://", input_value):
            return {"type": "video_url", "video_url": {"url": input_value}}
        path = Path(input_value)
        if not path.is_file():
            raise EngineError(f"视频文件不存在: {path}")
        # DashScope 兼容模式支持 file:// 本地路径；若部署环境不支持，请先上传 OSS 换公网 URL。
        return {"type": "video_url", "video_url": {"url": f"file://{path.resolve()}"}}


ENGINES = {"fixture": FixtureEngine, "gemini": GeminiEngine, "qwen": QwenEngine}


def _parse_json_loose(text: str) -> dict:
    """容错解析模型输出：剥离可能的 markdown 围栏后 json.loads。"""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise EngineError(f"引擎输出不是合法 JSON: {exc}; 片段: {cleaned[:300]}") from exc


def _input_to_uri(input_value: str) -> str:
    if re.match(r"^https?://", input_value):
        return input_value
    return f"file://{Path(input_value).resolve()}"


def _detect_platform(input_value: str) -> str:
    host = input_value.lower()
    for name in ("youtube", "youtu.be", "bilibili", "douyin", "tiktok", "instagram"):
        if name in host:
            return "youtube" if name == "youtu.be" else name
    return "other" if re.match(r"^https?://", input_value) else "local-file"


# --------------------------------------------------------------------------- 公共后处理：raw_recipe → dishpack

ISO8601_DURATION = re.compile(r"^PT(\d+H)?(\d+M)?(\d+S)?$")
RECIPE_KEYS = {
    "@context", "@type", "name", "description", "recipeYield", "recipeIngredient",
    "recipeInstructions", "prepTime", "cookTime", "recipeCuisine", "keywords", "tool",
}


def _sanitize_duration(value) -> str | None:
    """ISO 8601 duration 归一；尽力把 "10 minutes" 类自然语言转为 PT10M，失败则丢弃该字段。"""
    if not isinstance(value, str):
        return None
    if ISO8601_DURATION.match(value):
        return value
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|小时|分钟|分|秒)", value, re.I)
    if not m:
        return None
    num = int(float(m.group(1)))
    unit = m.group(2).lower()
    if unit.startswith(("h", "小时")):
        return f"PT{num}H"
    if unit.startswith(("m", "分")) or unit == "分钟":
        return f"PT{num}M"
    return f"PT{num}S"


def _sanitize_recipe(recipe: dict) -> dict:
    """按 dishpack schema 清洗 recipe（additionalProperties=false，多余字段一律剥离）。"""
    out = {k: v for k, v in recipe.items() if k in RECIPE_KEYS}
    out["@context"] = "https://schema.org"
    out["@type"] = "Recipe"
    steps = []
    for i, step in enumerate(recipe.get("recipeInstructions") or []):
        if not isinstance(step, dict) or not step.get("text"):
            continue
        steps.append({
            "@type": "HowToStep",
            "position": step.get("position") if isinstance(step.get("position"), int) else i + 1,
            "text": str(step["text"]),
        })
    out["recipeInstructions"] = steps
    out["recipeIngredient"] = [str(s) for s in recipe.get("recipeIngredient") or [] if str(s).strip()]
    for field in ("prepTime", "cookTime"):
        if field in out:
            fixed = _sanitize_duration(out[field])
            if fixed:
                out[field] = fixed
            else:
                del out[field]
    return out


def _kebab(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug


def build_dishpack(raw: dict, engine_cli: str, input_value: str, pack_id: str | None, created_at: str | None) -> dict:
    """raw_recipe → dishpack（SKILL.md §2-§3），含词典映射与质量门槛（§4）。"""
    dictionary = load_dictionary()
    meta = raw.get("meta") or {}
    recipe = _sanitize_recipe(raw.get("recipe") or {})

    # --- ingredientMappings：字符串 → ingredientRef（SKILL.md §3 核心义务） ---
    reasons: list[str] = []
    mappings = []
    ingredients = raw.get("ingredients") or [
        {"raw": s, "confidence": 0.5} for s in recipe["recipeIngredient"]
    ]
    for item in ingredients:
        raw_str = str(item.get("raw", "")).strip()
        if not raw_str:
            continue
        try:
            conf = max(0.0, min(1.0, float(item.get("confidence", 0.5))))
        except (TypeError, ValueError):
            conf = 0.5
        mapping = {
            "raw": raw_str,
            "confidence": {"value": conf, "source": "video-import"},
        }
        needs_review = False
        ref = match_ingredient(raw_str, item.get("nameHint"), dictionary)
        if ref:
            mapping["ingredientRef"] = ref
        else:
            needs_review = True
            reasons.append(f"unmatched-ingredient: {raw_str}")
        qty = item.get("quantity")
        if not (isinstance(qty, dict) and qty.get("unit") in UNIT_ENUM
                and isinstance(qty.get("value"), (int, float)) and qty["value"] > 0):
            qty = parse_quantity_from_raw(raw_str, dictionary)
        if qty:
            mapping["quantity"] = qty
        else:
            needs_review = True
            reasons.append(f"unit-conversion-missing: {raw_str}")
        if conf < CONFIDENCE_THRESHOLD:
            needs_review = True
            reasons.append(f"low-confidence-ingredient: {raw_str} ({conf:g})")
        mapping["needsReview"] = needs_review
        mappings.append(mapping)

    # --- stepMapping：保留 timestampRange（§4 溯源完整性） ---
    step_mapping = []
    for i, step in enumerate(raw.get("steps") or []):
        instruction = {
            lang: str(text) for lang, text in (step.get("instruction") or {}).items()
            if lang in ("zh", "en", "uk") and str(text).strip()
        }
        if not instruction:
            continue
        entry = {
            "order": step.get("order") if isinstance(step.get("order"), int) else i + 1,
            "instruction": instruction,
        }
        if isinstance(step.get("durationMinutes"), (int, float)) and step["durationMinutes"] > 0:
            entry["durationMinutes"] = step["durationMinutes"]
        if isinstance(step.get("tools"), list) and step["tools"]:
            entry["tools"] = [str(t) for t in step["tools"]]
        tr = step.get("timestampRange")
        if isinstance(tr, dict) and isinstance(tr.get("startSec"), (int, float)) and isinstance(tr.get("endSec"), (int, float)):
            entry["timestampRange"] = {"startSec": tr["startSec"], "endSec": tr["endSec"]}
        step_mapping.append(entry)

    # --- 质量门槛（§4）：整体置信度 < 0.85 → 禁止自动入库 ---
    try:
        overall = max(0.0, min(1.0, float(raw.get("overallConfidence", 0.5))))
    except (TypeError, ValueError):
        overall = 0.5
    if overall < CONFIDENCE_THRESHOLD:
        reasons.append(f"low-overall-confidence ({overall:g})")

    # --- 组装顶层字段（§2） ---
    source = dict(meta.get("source") or {})
    source.setdefault("videoUrl", _input_to_uri(input_value))
    source.setdefault("platform", _detect_platform(input_value))
    detected = raw.get("detectedLang") or "other"
    source["detectedLang"] = detected if detected in ("zh", "en", "uk", "other") else "other"
    if isinstance(raw.get("durationSeconds"), (int, float)) and raw["durationSeconds"] > 0:
        source["durationSeconds"] = raw["durationSeconds"]

    if not pack_id:
        pack_id = meta.get("id")
    if not pack_id:
        slug = _kebab(str(recipe.get("name", "")))
        if not slug:
            digest = hashlib.sha1(source["videoUrl"].encode("utf-8")).hexdigest()[:8]
            slug = f"video-{digest}"
        pack_id = f"dishpack-{slug}-001"

    pack = {
        "packVersion": "1",
        "id": pack_id,
        "createdAt": created_at or meta.get("createdAt") or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generator": {
            "name": GENERATOR_NAME,
            "engine": meta.get("engine", "self-hosted-pipeline"),
            "engineVersion": meta.get("engineVersion", engine_cli),
            "promptVersion": meta.get("promptVersion", "unknown"),
        },
        "source": source,
        "manifest": {
            "recipe": recipe,
            "ingredientMappings": mappings,
            "overallConfidence": {"value": overall, "source": "video-import"},
        },
        "reviewQueue": {
            "status": "pending",  # §2：产出时通常为 pending，人工确认后才可 approved
            "reasons": reasons,
        },
    }
    if step_mapping:
        pack["manifest"]["stepMapping"] = step_mapping
    suggested = raw.get("suggestedDish")
    if suggested:
        pack["manifest"]["suggestedDish"] = suggested
    transcript = raw.get("transcript")
    if transcript and transcript.get("text"):
        entry = {"lang": transcript.get("lang", "other"), "text": transcript["text"]}
        if isinstance(transcript.get("segments"), list):
            entry["segments"] = [
                {"startSec": s["startSec"], "endSec": s["endSec"], "text": s["text"]}
                for s in transcript["segments"]
                if isinstance(s, dict) and all(k in s for k in ("startSec", "endSec", "text"))
            ]
        pack["transcript"] = entry
    if isinstance(raw.get("media"), list) and raw["media"]:
        pack["media"] = [
            m for m in raw["media"]
            if isinstance(m, dict) and m.get("kind") in ("keyframe", "cover", "clip") and m.get("ref")
        ]
    return pack


# --------------------------------------------------------------------------- 校验（复用 validate_dishpack.py）


def validate_pack(pack: dict) -> tuple[bool, str]:
    """写临时文件后 subprocess 调 validate_dishpack.py，返回 (是否通过, 输出)。"""
    with tempfile.NamedTemporaryFile("w", suffix=".json", prefix="dishpack-", delete=False, encoding="utf-8") as fh:
        json.dump(pack, fh, ensure_ascii=False, indent=2)
        tmp = fh.name
    try:
        proc = subprocess.run(
            [sys.executable, str(VALIDATOR), tmp],
            capture_output=True, text=True, timeout=120,
        )
        return proc.returncode == 0, (proc.stdout + proc.stderr).strip()
    finally:
        Path(tmp).unlink(missing_ok=True)


# --------------------------------------------------------------------------- main


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="做菜视频 → dishpack 标准包（video-recipe-ingest 参考实现）")
    ap.add_argument("--input", required=True, help="视频文件路径或 URL；fixture 模式下该值仅作记录")
    ap.add_argument("--engine", required=True, choices=sorted(ENGINES), help="解析引擎")
    ap.add_argument("--lang-hint", choices=["zh", "en", "uk"], default=None, help="旁白语言提示")
    ap.add_argument("--output", required=True, help="dishpack 输出路径（JSON）")
    ap.add_argument("--pack-id", default=None, help="覆盖自动生成的包 ID（kebab-case）")
    ap.add_argument("--created-at", default=None, help="覆盖 createdAt（ISO date-time，用于可复现测试）")
    ap.add_argument("--fixture-dir", default=None, help="fixture 引擎的 fixture 目录（默认内置 tomato-egg）")
    ap.add_argument("--model", default=None, help="覆盖引擎默认模型名")
    args = ap.parse_args(argv[1:])

    engine_cls = ENGINES[args.engine]
    try:
        if engine_cls is FixtureEngine:
            engine = FixtureEngine(Path(args.fixture_dir) if args.fixture_dir else None)
        else:
            engine = engine_cls(args.model)
    except MissingConfigError as exc:
        print(f"配置错误: {exc}", file=sys.stderr)
        return 2

    print(f"[1/4] 引擎 {args.engine} 解析输入: {args.input}")
    try:
        raw = engine.parse(args.input, args.lang_hint)
    except (EngineError, MissingConfigError) as exc:
        print(f"引擎调用失败: {exc}", file=sys.stderr)
        return 3 if isinstance(exc, EngineError) else 2

    print("[2/4] 公共后处理：组装 dishpack + 词典映射 + 质量门槛")
    pack = build_dishpack(raw, args.engine, args.input, args.pack_id, args.created_at)

    # [3/4] 校验；§4：不通过自动重试（≤2 次），仍失败整包标记 rejected 并说明
    print("[3/4] 校验 dishpack（schema + 契约）")
    ok, report = validate_pack(pack)
    attempts = 0
    while not ok and attempts < 2:
        attempts += 1
        print(f"  校验未通过（第 {attempts} 次重试，重新组装清洗）...")
        pack = build_dishpack(raw, args.engine, args.input, args.pack_id, args.created_at)
        ok, report = validate_pack(pack)
    if not ok:
        reasons = pack["reviewQueue"].setdefault("reasons", [])
        reasons.append(f"schema-validation-failed: {report.splitlines()[-1] if report else 'unknown'}")
        pack["reviewQueue"]["status"] = "rejected"
        ok, report = validate_pack(pack)
        if not ok:
            print(f"校验失败，rejected 标记后仍不合规:\n{report}", file=sys.stderr)
            return 1
        print(f"  校验未通过，整包已标记 rejected（§4）: {pack['reviewQueue']['reasons'][-1]}")

    print(f"[4/4] 写出: {args.output}")
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    n_review = sum(1 for m in pack["manifest"]["ingredientMappings"] if m["needsReview"])
    print(
        f"完成: id={pack['id']} 状态={pack['reviewQueue']['status']} "
        f"食材映射 {len(pack['manifest']['ingredientMappings'])} 条（{n_review} 条待人工确认）"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
