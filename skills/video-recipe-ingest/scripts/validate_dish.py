#!/usr/bin/env python3
"""validate_dish.py — dish 草稿校验器（video-recipe-ingest skill，v2 契约，ADR-0006）。

校验两层内容：
  A. JSON Schema 全量校验 —— 只读复用仓库 scripts/local-validate.py 的 validate()（其 CLI
     只支持 data/↔schemas 固定映射，故此处通过 importlib 加载模块，不修改原文件），
     目标是 schemas/dish.schema.json。复用失败时降级为本文件内置的最小校验并打印警告。
  B. SKILL.md §2/§3/§4/§7 验收清单的可机器化契约检查（schema 无法表达的部分）：
     - 所有 techniqueRef（components[].prep 与 steps[]）必须 ∈ data/techniques.json 闭集 —— 硬性
     - ingredientRef 必须指向 data/ingredients/ 已有食材；留空（缺失）即判错
       （匹配不到的配料应在 parse_video.py 阶段就转入复核清单，不得带入库文件）
     - confidence.value < 0.85 → 列入「待人工确认」复核清单（不判错，PR 描述逐条人工确认）
     - steps[].clip.start < end（§4 溯源完整性）；clip 缺失记复核项（§2 要求必填）
     - steps[].clip.videoUrl 与 provenance.videoUrl 不一致 → 复核项
     - provenance.source="video" 必须带 videoUrl；name 至少含 zh（en/uk 缺失记复核项）
     - 有 prep（切配动作）的配料缺 prep.image → 复核项（§2：备料单上帮厨要看的图）

复核清单以文本块形式打印（与 parse_video.py 写出的 <slug>.review.md 同构），
可直接贴进 PR 描述；复核项不影响退出码，硬性错误才判 FAIL。

用法：
  python3 validate_dish.py <dish.json> [更多 dish.json ...]

退出码：0 = 通过（可含复核项）；1 = 校验失败；2 = 用法/读取错误。
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = SKILL_ROOT.parent.parent
SCHEMA_FILE = REPO_ROOT / "schemas" / "dish.schema.json"
TECHNIQUES_FILE = REPO_ROOT / "data" / "techniques.json"
INGREDIENTS_DIR = REPO_ROOT / "data" / "ingredients"
LOCAL_VALIDATE = REPO_ROOT / "scripts" / "local-validate.py"

CONFIDENCE_THRESHOLD = 0.85
STATUS_ENUM = {"draft", "active", "archived"}
CONTENT_LANGS = ("zh", "en", "uk")


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.review: list[str] = []  # 待人工确认清单（PR 描述用，不判错）

    def err(self, msg: str):
        self.errors.append(msg)

    def warn(self, msg: str):
        self.warnings.append(msg)

    def rev(self, msg: str):
        self.review.append(msg)


# ---------------------------------------------------------------- 闭集与语料加载


def load_technique_ids(rep: Report) -> set[str] | None:
    if not TECHNIQUES_FILE.is_file():
        rep.warn(f"未找到 {TECHNIQUES_FILE}，跳过 techniqueRef 闭集检查")
        return None
    try:
        entries = json.loads(TECHNIQUES_FILE.read_text(encoding="utf-8"))
        return {e["id"] for e in entries if isinstance(e, dict) and e.get("id")}
    except json.JSONDecodeError as exc:
        rep.warn(f"技法词表解析失败（{exc}），跳过 techniqueRef 闭集检查")
        return None


def load_ingredient_ids(rep: Report) -> set[str] | None:
    if not INGREDIENTS_DIR.is_dir():
        rep.warn(f"未找到 {INGREDIENTS_DIR}，跳过 ingredientRef 存在性检查")
        return None
    return {f.stem for f in INGREDIENTS_DIR.glob("*.json")}


# ---------------------------------------------------------------- A. schema 校验


def schema_validate(data: dict, rep: Report) -> bool:
    """优先复用仓库 local-validate.py；失败则降级最小校验。"""
    if LOCAL_VALIDATE.exists():
        try:
            sys.dont_write_bytecode = True  # importlib 加载不在 scripts/ 下产生 __pycache__
            spec = importlib.util.spec_from_file_location("local_validate", LOCAL_VALIDATE)
            lv = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(lv)  # main() 受 __name__ 保护，不会执行
            lv.errors.clear()
            lv.validate(data, lv.load_schema(SCHEMA_FILE), SCHEMA_FILE, "dish")
            for e in lv.errors:
                rep.err(f"[schema] {e}")
            return True
        except Exception as exc:  # noqa: BLE001 —— 复用失败不应中断契约检查
            rep.warn(f"复用 scripts/local-validate.py 失败（{exc!r}），降级为内置最小 schema 校验")
    else:
        rep.warn("未找到 scripts/local-validate.py，降级为内置最小 schema 校验")
    _minimal_schema_check(data, rep)
    return False


def _minimal_schema_check(data: dict, rep: Report):
    """最小必要校验：仅在无法复用仓库校验器时兜底。"""
    if not isinstance(data.get("name"), dict):
        rep.err("[schema-min] 缺少必填字段: name（I18nString）")
    for i, comp in enumerate(data.get("components") or []):
        for field in ("ingredientRef", "qty"):
            if field not in comp:
                rep.err(f"[schema-min] components[{i}] 缺少必填字段: {field}")
    for i, step in enumerate(data.get("steps") or []):
        if "text" not in step:
            rep.err(f"[schema-min] steps[{i}] 缺少必填字段: text")
    status = data.get("status")
    if status is not None and status not in STATUS_ENUM:
        rep.err(f"[schema-min] status={status!r} 不在 {sorted(STATUS_ENUM)}")


# ---------------------------------------------------------------- B. 契约检查（SKILL.md §2/§3/§4/§7 可机器化部分）


def contract_checks(data: dict, rep: Report, technique_ids: set[str] | None, ingredient_ids: set[str] | None):
    # B1. name 至少含 zh（§2：zh 权威必填）
    name = data.get("name") or {}
    if isinstance(name, dict):
        if not name.get("zh"):
            rep.err("[契约] name 缺少 zh（SKILL.md §2：zh 为权威必填）")
        for lang in ("en", "uk"):
            if not name.get(lang):
                rep.rev(f"i18n-missing: name 缺少 {lang}（三语齐全为目标，机翻初稿可后补）")

    # B2. components：ingredientRef 存在性 + 技法闭集 + 置信度门槛 + prep.image
    for i, comp in enumerate(data.get("components") or []):
        label = f"components[{i}]"
        ref = comp.get("ingredientRef")
        if not ref:
            # schema 层同样会报 required 缺失；此处强调契约后果：留空配料不得入库
            rep.err(f"[契约] {label} 缺少 ingredientRef——匹配不到的配料必须转入复核清单，不得以留空状态入库（SKILL.md §2）")
        elif ingredient_ids is not None and ref not in ingredient_ids:
            rep.err(f"[契约] {label}.ingredientRef={ref!r} 在 data/ingredients/ 不存在（SKILL.md §7）")
        else:
            label = f"components[{i}]({ref})"

        prep = comp.get("prep")
        if isinstance(prep, dict):
            tref = prep.get("techniqueRef")
            if tref and technique_ids is not None and tref not in technique_ids:
                rep.err(f"[契约] {label}.prep.techniqueRef={tref!r} 不在 techniques.json 闭集内（§3 硬性）")
            if tref and "image" not in prep:
                rep.rev(f"missing-prep-image: {label} 有切配动作（{tref}）但缺 prep.image 截帧（§2 备料单看图）")

        conf = comp.get("confidence")
        if isinstance(conf, dict):
            value = conf.get("value")
            if isinstance(value, (int, float)) and not isinstance(value, bool) and value < CONFIDENCE_THRESHOLD:
                rep.rev(f"low-confidence: {label} confidence={value:g} < {CONFIDENCE_THRESHOLD}（§4，PR 描述逐条人工确认）")

    # B3. steps：技法闭集 + clip 溯源（§4）
    provenance_url = (data.get("provenance") or {}).get("videoUrl")
    for i, step in enumerate(data.get("steps") or []):
        label = f"steps[{i}]"
        tref = step.get("techniqueRef")
        if tref and technique_ids is not None and tref not in technique_ids:
            rep.err(f"[契约] {label}.techniqueRef={tref!r} 不在 techniques.json 闭集内（§3 硬性）")
        clip = step.get("clip")
        if clip is None:
            rep.rev(f"missing-clip: {label} 缺少 clip（§2 要求每步对齐视频时间段，便于回放核对）")
        elif isinstance(clip, dict):
            start, end = clip.get("start"), clip.get("end")
            if (isinstance(start, (int, float)) and not isinstance(start, bool)
                    and isinstance(end, (int, float)) and not isinstance(end, bool)):
                if start >= end:
                    rep.err(f"[契约] {label}.clip start({start:g}) >= end({end:g})（§4 溯源完整性）")
            if provenance_url and clip.get("videoUrl") and clip["videoUrl"] != provenance_url:
                rep.rev(f"clip-url-mismatch: {label}.clip.videoUrl 与 provenance.videoUrl 不一致，请核对来源")

    # B4. provenance：视频来源必须可回溯
    provenance = data.get("provenance") or {}
    if provenance.get("source") == "video" and not provenance.get("videoUrl"):
        rep.err("[契约] provenance.source=\"video\" 但缺少 videoUrl（§2/§4 溯源完整性）")

    # B5. 整体置信度均值提示（§4：均值 < 0.85 → PR 标题标 [需重点审核]，禁止自动合并）
    confs = [
        c["confidence"]["value"] for c in (data.get("components") or [])
        if isinstance(c.get("confidence"), dict)
        and isinstance(c["confidence"].get("value"), (int, float))
        and not isinstance(c["confidence"]["value"], bool)
    ]
    if confs:
        mean = sum(confs) / len(confs)
        if mean < CONFIDENCE_THRESHOLD:
            rep.rev(f"[需重点审核] components 置信度均值 {mean:.2f} < {CONFIDENCE_THRESHOLD}，PR 标题须标注且禁止自动合并（§4）")


# ---------------------------------------------------------------- main


def validate_one(target: Path) -> int:
    rep = Report()
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"FAIL  {target}\n  - 非法 JSON: {exc}")
        return 1
    if not isinstance(data, dict):
        print(f"FAIL  {target}\n  - 顶层必须是 object")
        return 1

    reused = schema_validate(data, rep)
    technique_ids = load_technique_ids(rep)
    ingredient_ids = load_ingredient_ids(rep)
    contract_checks(data, rep, technique_ids, ingredient_ids)

    for w in rep.warnings:
        print(f"WARN  {w}")
    if rep.errors:
        print(f"FAIL  {target}")
        for e in rep.errors:
            print(f"  - {e}")
        if rep.review:
            print("  待人工确认清单:")
            for r in rep.review:
                print(f"  * {r}")
        return 1
    schema_note = "schema（复用 scripts/local-validate.py）" if reused else "schema（内置最小校验）"
    print(f"PASS  {target}  ✓ {schema_note} + 契约检查（{len(rep.warnings)} 条警告，{len(rep.review)} 条待人工确认）")
    if rep.review:
        print("  待人工确认清单（可贴入 PR 描述）:")
        for r in rep.review:
            print(f"  - [ ] {r}")
    return 0


def main(argv: list[str]) -> int:
    targets = [Path(a) for a in argv[1:] if a not in ("-h", "--help")]
    if len(argv) < 2 or not targets:
        print(__doc__)
        return 2
    rc = 0
    for target in targets:
        if not target.is_file():
            print(f"FAIL  {target}\n  - 文件不存在")
            rc = 1
            continue
        if validate_one(target) != 0:
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv))
