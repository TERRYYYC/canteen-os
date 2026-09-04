#!/usr/bin/env python3
"""validate_dishpack.py — dishpack 标准包校验器（video-recipe-ingest skill）。

校验两层内容：
  A. JSON Schema 全量校验 —— 只读复用仓库 scripts/local-validate.py 的 validate()（其 CLI
     只支持 examples↔schemas 固定映射，故此处通过 importlib 加载模块，不修改原文件）。
     复用失败时降级为本文件内置的最小校验并打印警告。
  B. SKILL.md §6 验收清单的可机器化契约检查（schema 无法表达的部分）：
     - recipe.recipeIngredient 与 ingredientMappings 一一对应、raw 逐字相等、顺序一致
     - 所有 quantity.unit 属于规范 Unit 枚举
     - suggestedDish.name 至少含 zh（en/uk 缺失记警告）
     - needsReview 与置信度阈值一致（confidence.value < 0.85 必为 true）
     - reviewQueue 状态机：有待审项不得 approved；overallConfidence < 0.85 必须 pending；
       rejected 必须给出 reasons
     - prepTime/cookTime 为 ISO 8601 duration
     - stepMapping 每条保留 timestampRange 且 endSec >= startSec（§4 溯源完整性）

用法：
  python3 validate_dishpack.py <dishpack.json>

退出码：0 = 通过；1 = 校验失败；2 = 用法/读取错误。
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = SKILL_ROOT.parent.parent
SCHEMA_FILE = REPO_ROOT / "schemas" / "dishpack.schema.json"
LOCAL_VALIDATE = REPO_ROOT / "scripts" / "local-validate.py"

CONFIDENCE_THRESHOLD = 0.85
UNIT_ENUM = {"g", "kg", "ml", "l", "pcs", "pack", "tbsp", "tsp", "pinch"}
REVIEW_STATES = {"pending", "approved", "rejected"}
ISO8601_DURATION = re.compile(r"^PT(\d+H)?(\d+M)?(\d+S)?$")

errors: list[str] = []
warnings: list[str] = []


def err(msg: str):
    errors.append(msg)


def warn(msg: str):
    warnings.append(msg)


# ---------------------------------------------------------------- A. schema 校验


def schema_validate(data: dict):
    """优先复用仓库 local-validate.py；失败则降级最小校验。"""
    if LOCAL_VALIDATE.exists():
        try:
            sys.dont_write_bytecode = True  # importlib 加载不在 scripts/ 下产生 __pycache__
            spec = importlib.util.spec_from_file_location("local_validate", LOCAL_VALIDATE)
            lv = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(lv)  # main() 受 __name__ 保护，不会执行
            lv.errors.clear()
            lv.validate(data, lv.load_schema(SCHEMA_FILE), SCHEMA_FILE, "dishpack")
            for e in lv.errors:
                err(f"[schema] {e}")
            return True
        except Exception as exc:  # noqa: BLE001 —— 复用失败不应中断契约检查
            warn(f"复用 scripts/local-validate.py 失败（{exc!r}），降级为内置最小 schema 校验")
    else:
        warn("未找到 scripts/local-validate.py，降级为内置最小 schema 校验")
    _minimal_schema_check(data)
    return False


def _minimal_schema_check(data: dict):
    """最小必要校验：顶层必填字段与关键常量（仅在无法复用仓库校验器时兜底）。"""
    for field in ("packVersion", "id", "createdAt", "generator", "source", "manifest", "reviewQueue"):
        if field not in data:
            err(f"[schema-min] 缺少顶层必填字段: {field}")
    if data.get("packVersion") != "1":
        err(f"[schema-min] packVersion 必须为 \"1\"，实际 {data.get('packVersion')!r}")
    manifest = data.get("manifest", {})
    for field in ("recipe", "ingredientMappings", "overallConfidence"):
        if field not in manifest:
            err(f"[schema-min] manifest 缺少必填字段: {field}")
    recipe = manifest.get("recipe", {})
    for field in ("@context", "@type", "name", "recipeIngredient", "recipeInstructions"):
        if field not in recipe:
            err(f"[schema-min] recipe 缺少必填字段: {field}")


# ---------------------------------------------------------------- B. 契约检查（SKILL.md §6 可机器化部分）


def contract_checks(data: dict):
    manifest = data.get("manifest") or {}
    recipe = manifest.get("recipe") or {}
    mappings = manifest.get("ingredientMappings") or []

    # B1. recipeIngredient ↔ ingredientMappings 一一对应、raw 逐字相等、顺序一致
    raw_list = recipe.get("recipeIngredient") or []
    if len(raw_list) != len(mappings):
        err(f"[契约] recipeIngredient({len(raw_list)} 条) 与 ingredientMappings({len(mappings)} 条) 数量不一致")
    for i, (raw, m) in enumerate(zip(raw_list, mappings)):
        if m.get("raw") != raw:
            err(f"[契约] 第 {i} 条映射 raw 不逐字相等: recipeIngredient={raw!r} vs ingredientMappings.raw={m.get('raw')!r}")

    # B2. quantity.unit 属于规范 Unit 枚举；B4. needsReview 与置信度阈值一致
    for i, m in enumerate(mappings):
        raw = m.get("raw", f"#{i}")
        qty = m.get("quantity")
        if qty is not None:
            unit = qty.get("unit")
            if unit not in UNIT_ENUM:
                err(f"[契约] {raw!r} 的 quantity.unit={unit!r} 不在规范 Unit 枚举 {sorted(UNIT_ENUM)}")
            if not isinstance(qty.get("value"), (int, float)) or qty["value"] <= 0:
                err(f"[契约] {raw!r} 的 quantity.value 必须为正数")
        conf = (m.get("confidence") or {}).get("value")
        needs_review = m.get("needsReview")
        if conf is None:
            err(f"[契约] {raw!r} 缺少 confidence.value")
            continue
        if conf < CONFIDENCE_THRESHOLD and needs_review is not True:
            err(f"[契约] {raw!r} confidence={conf} < {CONFIDENCE_THRESHOLD} 但 needsReview 不为 true")
        # ingredientRef 缺失（词典未匹配）必须 needsReview —— 与 SKILL.md §3 核心义务一致
        if "ingredientRef" not in m and needs_review is not True:
            err(f"[契约] {raw!r} 缺少 ingredientRef 但 needsReview 不为 true")

    # B3. suggestedDish.name 语言齐全性
    dish_name = ((manifest.get("suggestedDish") or {}).get("name")) or {}
    if "zh" not in dish_name:
        err("[契约] suggestedDish.name 缺少 zh（验收清单要求至少 zh + 请求语言）")
    for lang in ("en", "uk"):
        if lang not in dish_name:
            warn(f"[契约] suggestedDish.name 缺少 {lang}（三语齐全为目标，记警告）")

    # B5. reviewQueue 状态机
    rq = data.get("reviewQueue") or {}
    status = rq.get("status")
    if status not in REVIEW_STATES:
        err(f"[契约] reviewQueue.status={status!r} 非法，应为 {sorted(REVIEW_STATES)}")
    any_needs_review = any(m.get("needsReview") for m in mappings)
    if any_needs_review and status == "approved":
        err("[契约] 存在 needsReview=true 的 ingredientMappings，reviewQueue 不得为 approved")
    overall = (manifest.get("overallConfidence") or {}).get("value")
    if overall is None:
        err("[契约] 缺少 manifest.overallConfidence.value")
    else:
        if not 0 <= overall <= 1:
            err(f"[契约] overallConfidence.value={overall} 超出 [0,1]")
        if overall < CONFIDENCE_THRESHOLD and status != "pending":
            err(f"[契约] overallConfidence={overall} < {CONFIDENCE_THRESHOLD}，reviewQueue.status 必须为 pending（§4 禁止自动入库）")
    if status == "rejected" and not rq.get("reasons"):
        err("[契约] reviewQueue.status=rejected 时必须给出 reasons")

    # B6. ISO 8601 duration
    for field in ("prepTime", "cookTime"):
        value = recipe.get(field)
        if value is not None and not ISO8601_DURATION.match(str(value)):
            err(f"[契约] recipe.{field}={value!r} 不是 ISO 8601 duration（如 PT10M）")

    # B7. stepMapping 溯源：timestampRange 必填且区间合法（§4 溯源完整性）
    for i, step in enumerate(manifest.get("stepMapping") or []):
        tr = step.get("timestampRange")
        if tr is None:
            err(f"[契约] stepMapping[{i}] 缺少 timestampRange（§4 要求步骤可回溯到视频时间段）")
        elif tr.get("endSec", 0) < tr.get("startSec", 0):
            err(f"[契约] stepMapping[{i}].timestampRange endSec < startSec")

    # 溯源完整性补充：transcript 强烈建议保留
    if "transcript" not in data:
        warn("[契约] 缺少 transcript（§4 溯源完整性强烈建议保留原文转写）")


# ---------------------------------------------------------------- main


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 2
    target = Path(argv[1])
    if not target.is_file():
        print(f"ERROR: 文件不存在: {target}", file=sys.stderr)
        return 2
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: 非法 JSON: {exc}", file=sys.stderr)
        return 1

    reused = schema_validate(data)
    contract_checks(data)

    for w in warnings:
        print(f"WARN  {w}")
    if errors:
        print(f"FAIL  {target}")
        for e in errors:
            print(f"  - {e}")
        return 1
    schema_note = "schema（复用 scripts/local-validate.py）" if reused else "schema（内置最小校验）"
    print(f"PASS  {target}  ✓ {schema_note} + 契约检查（{len(warnings)} 条警告）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
