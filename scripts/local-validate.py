#!/usr/bin/env python3
"""CanteenOS 本地校验器（一次性的 spec 子集实现，用于无 ajv 环境下的 data/↔schemas 一致性核对）。

校验范围（ADR-0006 起，examples/ 已由 data/ 取代——目录即知识库，一实体一文件、文件名即 ID）：
  data/ingredients/*.json      → schemas/ingredient.schema.json
  data/dishes/*.json           → schemas/dish.schema.json
  data/menu-plans/*.json       → schemas/menu-plan.schema.json
  data/purchase-orders/*.json  → schemas/purchase-order.schema.json
  data/techniques.json         → schemas/techniques.schema.json（单文件词表合集）

除 schema 校验外还做跨文件引用检查：ingredientRef / techniqueRef / dishRef / menuPlanRef
必须能解析到 data/ 下真实存在的文件或词表条目；baseUnit=pcs 的食材不得设置 yield
（pcs 不套 yield，ADR-0006）。

支持特性：$ref（同文件/跨文件 #/$defs）、type（含 "null" 与类型数组）、properties、required、
additionalProperties、enum、const、pattern、minimum/maximum、exclusiveMinimum、minLength、
minItems、uniqueItems、items、anyOf、allOf、if/then。format 仅作注解不校验。

注意：skills/video-recipe-ingest/scripts/validate_dishpack.py 通过 importlib 复用本文件的
validate() / load_schema() / errors 模块级 API——修改时请保持这三个名字可用。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "schemas"
DATA_DIR = ROOT / "data"

# (数据相对路径, schema 文件, 是否目录)。目录下所有 *.json 逐一校验；单文件直接校验。
TARGETS = [
    ("ingredients", "ingredient.schema.json", True),
    ("dishes", "dish.schema.json", True),
    ("menu-plans", "menu-plan.schema.json", True),
    ("purchase-orders", "purchase-order.schema.json", True),
    ("techniques.json", "techniques.schema.json", False),
]

ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*$")

_schema_cache: dict[str, dict] = {}


def load_schema(path: Path) -> dict:
    key = str(path.resolve())
    if key not in _schema_cache:
        _schema_cache[key] = json.loads(path.read_text(encoding="utf-8"))
    return _schema_cache[key]


def resolve_ref(ref: str, current_file: Path):
    """返回 (schema 节点, 所属文件路径)。file_part 为空表示文件内 ref。"""
    if "#" in ref:
        file_part, frag = ref.split("#", 1)
    else:
        file_part, frag = ref, ""
    target_file = (
        (current_file.parent / file_part).resolve() if file_part else current_file.resolve()
    )
    doc = load_schema(target_file)
    node = doc
    if frag:
        for part in frag.lstrip("/").split("/"):
            node = node[part]
    return node, target_file


errors: list[str] = []

TYPE_MAP = {
    "object": dict,
    "array": list,
    "string": str,
    "number": (int, float),
    "integer": int,
    "boolean": bool,
    "null": type(None),
}


def fail(path: str, msg: str):
    errors.append(f"{path}: {msg}")


def _type_ok(node, stype: str) -> bool:
    py = TYPE_MAP[stype]
    if not isinstance(node, py):
        return False
    # bool 是 int 的子类，除 boolean 外一律不接受 True/False
    if stype != "boolean" and isinstance(node, bool):
        return False
    if stype == "integer" and isinstance(node, float):
        return False
    return True


def validate(node, schema: dict, current_file: Path, path: str):
    if "$ref" in schema:
        target, tfile = resolve_ref(schema["$ref"], current_file)
        validate(node, target, tfile, path)
        return

    if "const" in schema and node != schema["const"]:
        fail(path, f"const 不符: 期望 {schema['const']!r} 实际 {node!r}")
    if "enum" in schema and node not in schema["enum"]:
        fail(path, f"enum 不符: {node!r} 不在 {schema['enum']}")

    stype = schema.get("type")
    if stype:
        types = stype if isinstance(stype, list) else [stype]
        if not any(_type_ok(node, t) for t in types):
            fail(path, f"类型错误: 期望 {stype} 实际 {type(node).__name__}")
            return

    if isinstance(node, str):
        if "minLength" in schema and len(node) < schema["minLength"]:
            fail(path, f"minLength={schema['minLength']} 不满足: {node!r}")
        if "pattern" in schema and not re.match(schema["pattern"], node):
            fail(path, f"pattern 不匹配: {node!r} vs {schema['pattern']}")

    if isinstance(node, (int, float)) and not isinstance(node, bool):
        if "minimum" in schema and node < schema["minimum"]:
            fail(path, f"< minimum {schema['minimum']}: {node}")
        if "maximum" in schema and node > schema["maximum"]:
            fail(path, f"> maximum {schema['maximum']}: {node}")
        if "exclusiveMinimum" in schema and node <= schema["exclusiveMinimum"]:
            fail(path, f"<= exclusiveMinimum {schema['exclusiveMinimum']}: {node}")

    if isinstance(node, list):
        if "minItems" in schema and len(node) < schema["minItems"]:
            fail(path, f"minItems={schema['minItems']} 不满足: 长度 {len(node)}")
        if schema.get("uniqueItems"):
            seen = []
            for it in node:
                if it in seen:
                    fail(path, f"uniqueItems 违反: {it!r}")
                seen.append(it)
        if "items" in schema:
            for i, it in enumerate(node):
                validate(it, schema["items"], current_file, f"{path}[{i}]")

    if isinstance(node, dict):
        for r in schema.get("required", []):
            if r not in node:
                fail(path, f"缺少必填字段: {r}")
        props = schema.get("properties", {})
        for k, v in node.items():
            if k in props:
                validate(v, props[k], current_file, f"{path}.{k}")
            elif schema.get("additionalProperties") is False:
                fail(path, f"存在未声明字段: {k}")

    if "anyOf" in schema:
        ok = False
        for sub in schema["anyOf"]:
            before = len(errors)
            validate(node, sub, current_file, path)
            if len(errors) == before:
                ok = True
            else:
                del errors[before:]
        if not ok:
            fail(path, "anyOf 无一满足")

    for sub in schema.get("allOf", []):
        if "if" in sub:
            before = len(errors)
            validate(node, sub["if"], current_file, path)
            matched = len(errors) == before
            del errors[before:]
            if matched and "then" in sub:
                validate(node, sub["then"], current_file, path)
        else:
            validate(node, sub, current_file, path)


def _entity_ids(subdir: str) -> set[str]:
    d = DATA_DIR / subdir
    if not d.is_dir():
        return set()
    return {f.stem for f in d.glob("*.json")}


def check_references(loaded: dict[str, tuple[Path, object]]):
    """跨文件引用完整性 + 文件名即 ID 约定 + pcs/yield 互斥（ADR-0006）。"""
    ingredients = _entity_ids("ingredients")
    dishes = _entity_ids("dishes")
    menu_plans = _entity_ids("menu-plans")
    technique_ids: set[str] = set()

    # 文件名即 ID：所有实体文件名必须 kebab-case
    for subdir in ("ingredients", "dishes", "menu-plans", "purchase-orders"):
        for f in sorted((DATA_DIR / subdir).glob("*.json")):
            if not ID_PATTERN.match(f.stem):
                fail(str(f.relative_to(ROOT)), f"文件名 {f.name} 不是 kebab-case（文件名即 ID）")

    tech_file = DATA_DIR / "techniques.json"
    if tech_file.exists():
        for entry in json.loads(tech_file.read_text(encoding="utf-8")):
            tid = entry.get("id", "?")
            if tid in technique_ids:
                fail("techniques.json", f"技法 id 重复: {tid}")
            technique_ids.add(tid)

    for name, (path, data) in loaded.items():
        rel = str(path.relative_to(ROOT))
        if not isinstance(data, dict):
            continue
        if path.parent.name == "ingredients":
            if data.get("baseUnit") == "pcs" and "yield" in data:
                fail(rel, "baseUnit=pcs 的食材不得设置 yield（pcs 不套 yield，ADR-0006）")
        if path.parent.name == "dishes":
            for i, comp in enumerate(data.get("components") or []):
                ref = comp.get("ingredientRef")
                if ref and ref not in ingredients:
                    fail(rel, f"components[{i}].ingredientRef={ref!r} 在 data/ingredients/ 不存在")
                tref = (comp.get("prep") or {}).get("techniqueRef")
                if tref and tref not in technique_ids:
                    fail(rel, f"components[{i}].prep.techniqueRef={tref!r} 不在 techniques.json 闭集内")
            for i, step in enumerate(data.get("steps") or []):
                tref = step.get("techniqueRef")
                if tref and tref not in technique_ids:
                    fail(rel, f"steps[{i}].techniqueRef={tref!r} 不在 techniques.json 闭集内")
        if path.parent.name == "menu-plans":
            for i, meal in enumerate(data.get("meals") or []):
                ref = meal.get("dishRef")
                if ref and ref not in dishes:
                    fail(rel, f"meals[{i}].dishRef={ref!r} 在 data/dishes/ 不存在")
        if path.parent.name == "purchase-orders":
            mp = data.get("menuPlanRef")
            if mp and mp not in menu_plans:
                fail(rel, f"menuPlanRef={mp!r} 在 data/menu-plans/ 不存在")
            for i, line in enumerate(data.get("lines") or []):
                ref = line.get("ingredientRef")
                if ref and ref not in ingredients:
                    fail(rel, f"lines[{i}].ingredientRef={ref!r} 在 data/ingredients/ 不存在")


def main():
    loaded: dict[str, tuple[Path, object]] = {}
    checked = 0
    for rel, schema_name, is_dir in TARGETS:
        schema_file = SCHEMA_DIR / schema_name
        schema = load_schema(schema_file)
        target = DATA_DIR / rel
        files = sorted(target.glob("*.json")) if is_dir else [target]
        if not is_dir and not target.exists():
            errors.append(f"{rel}: 词表文件缺失")
            continue
        for f in files:
            if not f.exists():
                continue
            label = str(f.relative_to(ROOT))
            data = json.loads(f.read_text(encoding="utf-8"))
            loaded[label] = (f, data)
            before = len(errors)
            validate(data, schema, schema_file, label)
            if len(errors) == before:
                checked += 1
                print(f"PASS  {label}  ✓ {schema_name}")
            else:
                print(f"FAIL  {label}  ✗ {schema_name}")
    check_references(loaded)
    if errors:
        print("\n错误明细:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print(f"\n全部通过：{checked} 个数据文件与 schema 一致，跨文件引用完整。")


if __name__ == "__main__":
    main()
