#!/usr/bin/env python3
"""parse_video.py — video-recipe-ingest 参考实现：做菜视频 → dish 草稿 + images/ 截帧目录。

v2 契约（ADR-0006，见 SKILL.md）：不再有中间包，直接产出
  <output-dir>/dishes/<slug>.json        符合 schemas/dish.schema.json，status="draft"（允许不完整，required 仅 name）
  <output-dir>/dishes/<slug>.review.md   PR 描述用的「待人工确认」复核清单文本块（旧 needsReview/reviewQueue 的继任者）
  <output-dir>/images/<slug>/            截帧占位说明文件（真实抽帧由引擎侧后续实现，见 extract_frame_ffmpeg 的 TODO）

引擎可插拔（统一接口 parse(input, lang_hint, techniques) -> raw_recipe dict）：
  fixture  离线确定性路径：读取 fixtures/tomato-egg/ 预置的模拟引擎输出与转写，
           跑完整后处理管线。CI 与默认演示路径，开箱即跑、零密钥。
  gemini   Google Gemini（generateContent + responseSchema 约束 JSON 输出）。
           需要环境变量 GEMINI_API_KEY；视频 <20MB 走 inline base64，更大走 Files API；
           YouTube URL 走 file_data.file_uri，其余平台 URL 需先下载为本地文件。
  qwen     阿里云百炼 Qwen-VL（OpenAI 兼容接口）。需要环境变量 DASHSCOPE_API_KEY。

公共后处理（与引擎无关）：
  raw_recipe → 清洗/归一 → 技法闭集校验（启动时加载 data/techniques.json；词表外技法
  字段留空并记入复核清单，SKILL.md §3）→ ingredient 词典匹配生成 ingredientRef
  （fixtures/ingredient-dictionary.json；匹配不到则该配料留空并记入复核清单）→
  食堂尺度放大（默认 50 份）→ 质量门槛（SKILL.md §4：confidence<0.85 逐条列入复核清单；
  均值<0.85 标 [需重点审核]）→ 调 validate_dish.py 校验（不通过按 §4 重试 ≤2 次）→
  写 dishes/ + images/。

退出码：0 成功；1 校验失败；2 配置错误（如缺 API key）；3 引擎调用失败。

用法：
  python3 parse_video.py --input <视频文件或URL> --engine <gemini|qwen|fixture> \
      [--lang-hint zh|en|uk] --output-dir <输出目录>
示例（离线演示）：
  python3 parse_video.py --input fixtures --engine fixture --output-dir /tmp/skill-out
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
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = SKILL_ROOT.parent.parent
FIXTURE_ROOT = SKILL_ROOT / "fixtures"
DEFAULT_FIXTURE = FIXTURE_ROOT / "tomato-egg"
DICTIONARY_FILE = FIXTURE_ROOT / "ingredient-dictionary.json"
PROMPT_FILE = SKILL_ROOT / "prompts" / "extract-recipe.md"
VALIDATOR = SKILL_ROOT / "scripts" / "validate_dish.py"
TECHNIQUES_FILE = REPO_ROOT / "data" / "techniques.json"

CONFIDENCE_THRESHOLD = 0.85
UNIT_ENUM = ("g", "kg", "ml", "l", "pcs", "pack", "tbsp", "tsp", "pinch")
GENERATOR_NAME = "video-recipe-ingest"
DEFAULT_SERVINGS = 50  # SKILL.md §2：baseServings 默认按食堂尺度 50 份产出

GEMINI_MODEL_DEFAULT = "gemini-2.5-flash"
GEMINI_INLINE_LIMIT = 20 * 1024 * 1024  # 超过则走 Files API
QWEN_MODEL_DEFAULT = "qwen3-vl-plus"

CONTENT_LANGS = ("zh", "en", "uk")


class EngineError(Exception):
    """引擎调用失败（exit 3）。"""


class MissingConfigError(Exception):
    """配置缺失（如 API key，exit 2）。"""


# --------------------------------------------------------------------------- 技法闭集（启动时加载）


def load_techniques() -> list[dict]:
    """加载 data/techniques.json 闭集词表（cut/heat/pretreat 三类受控词表）。"""
    if not TECHNIQUES_FILE.is_file():
        raise EngineError(f"技法闭集词表缺失: {TECHNIQUES_FILE}")
    entries = json.loads(TECHNIQUES_FILE.read_text(encoding="utf-8"))
    return [e for e in entries if isinstance(e, dict) and e.get("id")]


def render_technique_vocab(techniques: list[dict]) -> str:
    """把闭集词表渲染为 prompt 用的选择清单（id + 三语名 + 定义，SKILL.md §3）。"""
    lines = []
    for e in techniques:
        name = e.get("name") or {}
        note = (e.get("note") or {}).get("zh", "")
        trilingual = " / ".join(filter(None, (name.get("zh"), name.get("en"), name.get("uk"))))
        line = f"- `{e['id']}`（{e.get('kind', '?')}）：{trilingual}"
        if note:
            line += f" —— {note}"
        lines.append(line)
    return "\n".join(lines)


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


def render_prompt(template: str, lang_hint: str | None, techniques: list[dict]) -> str:
    if lang_hint:
        line = {
            "zh": "语言提示：视频旁白主语言大概率为中文（zh）。",
            "en": "Language hint: the narration is most likely English (en).",
            "uk": "Підказка: озвучення ймовірно українською (uk).",
        }[lang_hint]
    else:
        line = "语言未知，请自行检测并在 detectedLang 中如实标注。/ Language unknown — detect it and report in detectedLang."
    return template.replace("{LANG_HINT}", line).replace(
        "{TECHNIQUE_VOCAB}", render_technique_vocab(techniques)
    )


# --------------------------------------------------------------------------- 词典与数量解析


def load_dictionary() -> dict:
    return json.loads(DICTIONARY_FILE.read_text(encoding="utf-8"))


def match_ingredient(raw: str, name_hint: str | None, dictionary: dict) -> str | None:
    """字符串 → 知识库 Ingredient 的词典匹配。

    策略：nameHint 精确命中别名优先；否则在 raw 中取最长别名子串匹配
    （最长优先可缓解「油」命中「酱油」类误配）。
    返回 ingredientRef（如 tomato，即 data/ingredients/<id>.json 的文件名）或 None。

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
# 统一接口：parse(input_value, lang_hint, techniques) -> raw_recipe(dict)
# raw_recipe 契约（与 prompts/extract-recipe.md 的 responseSchema 对应，v2）：
#   detectedLang, durationSeconds?,
#   dishName{zh,en,uk}, slug?, baseServings?（引擎产出的基准份数，后处理放大到食堂尺度）,
#   components[{raw, nameHint?, quantity{value,unit}?, confidence,
#               prep?{techniqueRef(闭集 id), size?, note{zh,en,uk}?, frameSec?}}],
#   steps[{order, instruction{zh,en,uk}, techniqueRef?(闭集 id), duration?(ISO 8601),
#          timestampRange{startSec,endSec}, confidence}],
#   overallConfidence, transcript{lang, text, segments?}, media?
# 真实引擎的 meta（engine/engineVersion/promptVersion/source 等）由 adapter 依据 CLI 输入注入。


class FixtureEngine:
    """离线确定性引擎：读预置的模拟引擎输出，用于 CI 与演示。"""

    engine = "fixture"

    def __init__(self, fixture_dir: Path | None = None):
        self.fixture_dir = fixture_dir or DEFAULT_FIXTURE

    def parse(self, input_value: str, lang_hint: str | None, techniques: list[dict]) -> dict:
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

    def parse(self, input_value: str, lang_hint: str | None, techniques: list[dict]) -> dict:
        prompt_template, schema, prompt_version = load_prompt_assets()
        prompt = render_prompt(prompt_template, lang_hint, techniques)
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

    def parse(self, input_value: str, lang_hint: str | None, techniques: list[dict]) -> dict:
        prompt_template, schema, prompt_version = load_prompt_assets()
        prompt = render_prompt(prompt_template, lang_hint, techniques)
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


# --------------------------------------------------------------------------- 公共后处理：raw_recipe → dish 草稿

ISO8601_DURATION = re.compile(r"^PT(\d+H)?(\d+M)?(\d+S)?$")


def _sanitize_duration(value) -> str | None:
    """ISO 8601 duration 归一；尽力把 "10 minutes" 类自然语言转为 PT10M，失败则返回 None。"""
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


def _kebab(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _i18n(value: dict | None) -> dict:
    """过滤出 zh/en/uk 非空文本，保持 I18nString 结构合法。"""
    return {
        lang: str(text) for lang, text in (value or {}).items()
        if lang in CONTENT_LANGS and str(text).strip()
    }


def _clamp_conf(value, default: float = 0.5) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return default


def _scale_qty(qty: dict, factor: float) -> dict:
    value = qty["value"] * factor
    if abs(value - round(value)) < 1e-9:
        value = int(round(value))
    else:
        value = round(value, 2)
    return {"value": value, "unit": qty["unit"]}


def _image_ref(slug: str, filename: str) -> dict:
    """视频截帧为自有演绎（SKILL.md §4）：license=own，sourceUrl 填仓库内路径。"""
    src = f"images/{slug}/{filename}"
    return {"src": src, "license": "own", "sourceUrl": src}


def extract_frame_ffmpeg(video_path: str, timestamp_sec: float, out_path: Path) -> bool:
    """TODO(引擎侧后续实现): 真实截帧。

    计划实现（SKILL.md §5 推荐管线）：
      1. 粗定位：ffmpeg -ss <timestamp_sec> -i <video> -frames:v 1 -q:v 2 <out_path>
      2. 窗内挑帧：PySceneDetect 在 clip 时间窗内切镜头 + Laplacian 清晰度 + pHash 去重；
      3. 双路校验：VLM temporal grounding ∪ ASR 词级时刻（±2s），见 SKILL.md §5。

    当前版本不调用 ffmpeg（保持纯标准库零依赖、CI 无 ffmpeg 也可跑），
    一律返回 False，由调用方写出占位说明文件。
    """
    return False


def _write_image_placeholder(out_path: Path, description: str, video_url: str, timestamp_sec: float | None) -> None:
    """真实截帧就绪前的占位说明文件（<name>.jpg.PLACEHOLDER.txt）。"""
    lines = [
        f"占位说明：{description}",
        f"来源视频：{video_url}",
    ]
    if timestamp_sec is not None:
        lines.append(f"参考时刻：{timestamp_sec:g}s")
        lines.append(f"抽帧命令（实现后）：ffmpeg -ss {timestamp_sec:g} -i <video> -frames:v 1 -q:v 2 {out_path.name}")
    lines.append("TODO：由 parse_video.py 的 extract_frame_ffmpeg() 真实抽帧后替换本文件。")
    out_path.with_name(out_path.name + ".PLACEHOLDER.txt").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


def build_dish(
    raw: dict,
    engine_cli: str,
    input_value: str,
    dish_id: str | None,
    target_servings: int,
    technique_ids: set[str],
) -> tuple[dict, list[str], list[tuple[str, str, float | None]], str]:
    """raw_recipe → (dish, 复核清单条目, 预期截帧列表[(文件名, 说明, 时刻)], slug)。

    质量门槛（SKILL.md §4）与技法闭集（§3）在此落实：
    匹配不到 ingredientRef / techniqueRef 的字段一律留空（为通过 schema 则整条/整项省略），
    并逐条记入复核清单——即旧 needsReview/reviewQueue 逻辑在 v2 的形态（PR 描述文本块）。
    """
    dictionary = load_dictionary()
    meta = raw.get("meta") or {}
    review: list[str] = []
    frames: list[tuple[str, str, float | None]] = []  # (filename, 说明, timestamp)

    video_url = (meta.get("source") or {}).get("videoUrl") or _input_to_uri(input_value)

    # --- 菜名与 slug ---
    name = _i18n(raw.get("dishName"))
    slug = dish_id or (raw.get("slug") if isinstance(raw.get("slug"), str) else None)
    if not slug:
        slug = _kebab(name.get("en", ""))
    if not slug:
        digest = hashlib.sha1(video_url.encode("utf-8")).hexdigest()[:8]
        slug = f"video-{digest}"

    # --- 食堂尺度放大（SKILL.md §2：默认 50 份；家常尺度按比例放大并列入复核清单） ---
    src_servings = raw.get("baseServings")
    if not isinstance(src_servings, int) or isinstance(src_servings, bool) or src_servings < 1:
        src_servings = None
    factor = 1.0
    if src_servings and src_servings != target_servings:
        factor = target_servings / src_servings
        review.append(
            f"servings-scaled: 视频为 {src_servings} 份家常尺度，已 ×{factor:g} 放大到 {target_servings} 份食堂尺度，用量请师傅核对"
        )

    # --- components：ingredientRef 词典匹配 + 技法闭集 + 置信度门槛 ---
    components: list[dict] = []
    for item in raw.get("components") or []:
        raw_str = str(item.get("raw", "")).strip()
        if not raw_str:
            continue
        conf = _clamp_conf(item.get("confidence"))

        ref = match_ingredient(raw_str, item.get("nameHint"), dictionary)
        if not ref:
            review.append(f"unmatched-ingredient: {raw_str!r} 未匹配到 data/ingredients/ 已有食材，本条未写入 components，请师傅决定新建食材还是改映射")
            continue

        qty = item.get("quantity")
        if not (isinstance(qty, dict) and qty.get("unit") in UNIT_ENUM
                and isinstance(qty.get("value"), (int, float)) and not isinstance(qty.get("value"), bool)
                and qty["value"] > 0):
            qty = parse_quantity_from_raw(raw_str, dictionary)
        if not qty:
            review.append(f"unit-conversion-missing: {raw_str!r} 无法解析/换算用量，本条未写入 components")
            continue

        comp: dict = {
            "ingredientRef": ref,
            "qty": _scale_qty(qty, factor),
        }

        prep = item.get("prep")
        if isinstance(prep, dict):
            tref = prep.get("techniqueRef")
            if isinstance(tref, str) and tref in technique_ids:
                prep_out: dict = {"techniqueRef": tref}
                if isinstance(prep.get("size"), str) and prep["size"].strip():
                    prep_out["size"] = prep["size"].strip()
                note = _i18n(prep.get("note"))
                if note:
                    prep_out["note"] = note
                frame_sec = prep.get("frameSec")
                frame_sec = frame_sec if isinstance(frame_sec, (int, float)) and not isinstance(frame_sec, bool) else None
                filename = f"prep-{ref}.jpg"
                prep_out["image"] = _image_ref(slug, filename)
                frames.append((filename, f"配料 {raw_str!r}「被切的几秒」代表帧（→ components[].prep.image）", frame_sec))
                comp["prep"] = prep_out
            else:
                review.append(
                    f"unmatched-technique: {raw_str!r} 的 prep.techniqueRef={tref!r} 不在 techniques.json 闭集内，"
                    "prep 已留空；请选语义最近的已有词条（差异写 note）或提议新增词条"
                )

        comp["confidence"] = {"value": conf, "source": "video"}
        if conf < CONFIDENCE_THRESHOLD:
            review.append(f"low-confidence: components[{len(components)}] {ref}（{raw_str}）confidence={conf:g} < {CONFIDENCE_THRESHOLD}")
        components.append(comp)

    # --- steps：clip 对齐视频时间段（§4 溯源完整性） + 技法闭集 ---
    duration_seconds = raw.get("durationSeconds")
    duration_seconds = duration_seconds if isinstance(duration_seconds, (int, float)) and not isinstance(duration_seconds, bool) else None
    keyframes = [
        m for m in (raw.get("media") or [])
        if isinstance(m, dict) and m.get("kind") == "keyframe" and isinstance(m.get("timestampSec"), (int, float))
    ]
    steps: list[dict] = []
    for i, step in enumerate(raw.get("steps") or []):
        text = _i18n(step.get("instruction"))
        if not text:
            continue
        entry: dict = {"text": text}

        tref = step.get("techniqueRef")
        if isinstance(tref, str) and tref.strip():
            if tref in technique_ids:
                entry["techniqueRef"] = tref
            else:
                review.append(
                    f"unmatched-technique: steps[{len(steps)}].techniqueRef={tref!r} 不在 techniques.json 闭集内，该字段已留空"
                )

        # ISO 8601 duration 仅作格式校验与信息记录（dish schema v2 无时长字段，不入库）
        if step.get("duration") is not None and not _sanitize_duration(step.get("duration")):
            review.append(f"invalid-duration: steps[{len(steps)}].duration={step.get('duration')!r} 不是 ISO 8601 duration，已丢弃")

        tr = step.get("timestampRange")
        if (isinstance(tr, dict)
                and isinstance(tr.get("startSec"), (int, float)) and isinstance(tr.get("endSec"), (int, float))
                and not isinstance(tr.get("startSec"), bool) and not isinstance(tr.get("endSec"), bool)):
            start, end = tr["startSec"], tr["endSec"]
            if start < end:
                entry["clip"] = {"videoUrl": video_url, "start": start, "end": end}
                if duration_seconds and end > duration_seconds + 2:
                    review.append(f"clip-beyond-duration: steps[{len(steps)}].clip.end={end:g} 超出视频时长 {duration_seconds:g}s，请核对")
                for kf in keyframes:
                    if start <= kf["timestampSec"] <= end:
                        filename = f"step-{len(steps) + 1}.jpg"
                        entry["image"] = _image_ref(slug, filename)
                        frames.append((filename, f"步骤 {len(steps) + 1} 关键帧（→ steps[].image）", kf["timestampSec"]))
                        break
            else:
                review.append(f"invalid-clip: steps[{len(steps)}] timestampRange start({start:g}) >= end({end:g})，clip 已留空")
        else:
            review.append(f"missing-clip: steps[{len(steps)}] 缺少 timestampRange，clip 已留空（SKILL.md §2 要求 clip 必填）")

        step_conf = _clamp_conf(step.get("confidence"), default=1.0)
        if step_conf < CONFIDENCE_THRESHOLD:
            review.append(f"low-confidence: steps[{len(steps)}] confidence={step_conf:g} < {CONFIDENCE_THRESHOLD}，请按 clip 回放核对步骤内容")
        steps.append(entry)

    # --- 整体置信度：均值 < 0.85 → PR 标题标 [需重点审核]（§4） ---
    if components:
        mean_conf = sum(c["confidence"]["value"] for c in components) / len(components)
        if mean_conf < CONFIDENCE_THRESHOLD:
            review.insert(0, f"[需重点审核] components 置信度均值 {mean_conf:.2f} < {CONFIDENCE_THRESHOLD}，禁止自动合并")

    # --- 组装 dish（schemas/dish.schema.json；允许不完整，缺失项由 readiness 关卡分级） ---
    dish: dict = {"schemaVersion": "2", "name": name or {"zh": slug}}

    cover = next((m for m in (raw.get("media") or []) if isinstance(m, dict) and m.get("kind") == "cover"), None)
    if cover is not None:
        dish["image"] = _image_ref(slug, "cover.jpg")
        frames.insert(0, ("cover.jpg", "成品图（→ dish.image）", None))

    dish["baseServings"] = target_servings
    if components:
        dish["components"] = components
    if steps:
        dish["steps"] = steps
    dish["provenance"] = {"source": "video", "videoUrl": video_url}
    dish["status"] = "draft"  # SKILL.md §2：skill 永远只产草稿
    return dish, review, frames, slug


def render_review_md(dish: dict, slug: str, review: list[str], meta: dict, raw: dict) -> str:
    """PR 描述用的复核清单文本块（旧 reviewQueue.reasons 的 v2 形态）。"""
    name_zh = (dish.get("name") or {}).get("zh", slug)
    lines = [
        f"# 待人工确认 · {name_zh}（{slug}）",
        "",
        f"> 由 {GENERATOR_NAME} 自动生成（engine={meta.get('engine', '?')}，"
        f"engineVersion={meta.get('engineVersion', '?')}，promptVersion={meta.get('promptVersion', '?')}），"
        "作为 PR 描述的一部分；师傅在 PR 里直接改 JSON 即完成确认（SKILL.md §6）。",
        f"> 视频：{(dish.get('provenance') or {}).get('videoUrl', '?')}",
        "",
    ]
    if review:
        lines += [f"- [ ] {item}" for item in review]
    else:
        lines.append("本次无待确认项：全部 ingredientRef/techniqueRef 命中闭集，置信度均 ≥ 0.85。")
    transcript = (raw.get("transcript") or {}).get("text")
    if transcript:
        lines += ["", "## 转写原文（溯源存档，§4）", "", transcript.strip()]
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------- 校验（复用 validate_dish.py）


def validate_dish(dish: dict) -> tuple[bool, str]:
    """写临时文件后 subprocess 调 validate_dish.py，返回 (是否通过, 输出)。"""
    with tempfile.NamedTemporaryFile("w", suffix=".json", prefix="dish-", delete=False, encoding="utf-8") as fh:
        json.dump(dish, fh, ensure_ascii=False, indent=2)
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
    ap = argparse.ArgumentParser(description="做菜视频 → dish 草稿 + images/ 截帧目录（video-recipe-ingest 参考实现，v2）")
    ap.add_argument("--input", required=True, help="视频文件路径或 URL；fixture 模式下该值仅作记录")
    ap.add_argument("--engine", required=True, choices=sorted(ENGINES), help="解析引擎")
    ap.add_argument("--lang-hint", choices=["zh", "en", "uk"], default=None, help="旁白语言提示")
    ap.add_argument("--output-dir", required=True, help="输出目录（下含 dishes/<slug>.json 与 images/<slug>/）")
    ap.add_argument("--dish-id", default=None, help="覆盖自动生成的菜品 ID（kebab-case，即 data/dishes/ 文件名）")
    ap.add_argument("--servings", type=int, default=DEFAULT_SERVINGS, help=f"目标基准份数（默认 {DEFAULT_SERVINGS}，食堂尺度）")
    ap.add_argument("--fixture-dir", default=None, help="fixture 引擎的 fixture 目录（默认内置 tomato-egg）")
    ap.add_argument("--model", default=None, help="覆盖引擎默认模型名")
    args = ap.parse_args(argv[1:])

    if args.servings < 1:
        print("配置错误: --servings 必须为正整数", file=sys.stderr)
        return 2

    # 技法闭集启动时加载（SKILL.md §3：引擎输出只允许引用该词表）
    try:
        techniques = load_techniques()
    except EngineError as exc:
        print(f"引擎调用失败: {exc}", file=sys.stderr)
        return 3
    technique_ids = {e["id"] for e in techniques}

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
        raw = engine.parse(args.input, args.lang_hint, techniques)
    except (EngineError, MissingConfigError) as exc:
        print(f"引擎调用失败: {exc}", file=sys.stderr)
        return 3 if isinstance(exc, EngineError) else 2

    print("[2/4] 公共后处理：组装 dish 草稿 + 词典/技法闭集匹配 + 质量门槛")
    dish, review, frames, slug = build_dish(
        raw, args.engine, args.input, args.dish_id, args.servings, technique_ids
    )

    # [3/4] 校验；§4：不通过自动重试（≤2 次），仍失败则放弃并在日志说明
    print("[3/4] 校验 dish（dish.schema.json + 契约）")
    ok, report = validate_dish(dish)
    attempts = 0
    while not ok and attempts < 2:
        attempts += 1
        print(f"  校验未通过（第 {attempts} 次重试，重新组装清洗）...")
        dish, review, frames, slug = build_dish(
            raw, args.engine, args.input, args.dish_id, args.servings, technique_ids
        )
        ok, report = validate_dish(dish)
    if not ok:
        print(f"校验失败（已重试 {attempts} 次），放弃产出（§4）:\n{report}", file=sys.stderr)
        return 1

    print(f"[4/4] 写出: {args.output_dir}/dishes/{slug}.json + images/{slug}/")
    out_root = Path(args.output_dir)
    dishes_dir = out_root / "dishes"
    images_dir = out_root / "images" / slug
    dishes_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)

    dish_path = dishes_dir / f"{slug}.json"
    dish_path.write_text(json.dumps(dish, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    review_path = dishes_dir / f"{slug}.review.md"
    review_path.write_text(render_review_md(dish, slug, review, raw.get("meta") or {}, raw), encoding="utf-8")

    video_url = dish["provenance"]["videoUrl"]
    for filename, description, timestamp in frames:
        if not extract_frame_ffmpeg(args.input, timestamp or 0.0, images_dir / filename):
            _write_image_placeholder(images_dir / filename, description, video_url, timestamp)

    n_low = sum(1 for item in review if item.startswith(("low-confidence", "[需重点审核]")))
    print(
        f"完成: dishes/{slug}.json（status=draft，components {len(dish.get('components') or [])} 条，"
        f"steps {len(dish.get('steps') or [])} 步，截帧占位 {len(frames)} 个）；"
        f"复核清单 {len(review)} 条（{n_low} 条低置信）→ dishes/{slug}.review.md"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
