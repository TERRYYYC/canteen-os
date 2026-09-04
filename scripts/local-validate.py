#!/usr/bin/env python3
"""CanteenOS 本地校验器（一次性的 spec 子集实现，用于无 ajv 环境下的 examples↔schemas 一致性核对）。
支持特性：$ref（同文件/跨文件 #/$defs）、type、properties、required、additionalProperties、
enum、const、pattern、minimum/maximum、exclusiveMinimum、minLength、minItems、uniqueItems、
items、anyOf、allOf、if/then。format 仅作注解不校验。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "schemas"
EXAMPLE_DIR = ROOT / "examples"

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
}


def fail(path: str, msg: str):
    errors.append(f"{path}: {msg}")


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
        py = TYPE_MAP[stype]
        if not isinstance(node, py) or (stype != "boolean" and isinstance(node, bool)):
            fail(path, f"类型错误: 期望 {stype} 实际 {type(node).__name__}")
            return
        if stype == "integer" and isinstance(node, float):
            fail(path, f"类型错误: 期望 integer 实际 float {node!r}")
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


def main():
    mapping = {
        "ingredient": "ingredient.schema.json",
        "supplier": "supplier.schema.json",
        "dish": "dish.schema.json",
        "menu-plan": "menu-plan.schema.json",
        "purchase-order": "purchase-order.schema.json",
        "feedback": "feedback.schema.json",
        "dishpack": "dishpack.schema.json",
    }
    checked = 0
    for f in sorted(EXAMPLE_DIR.glob("*.json")):
        prefix = next(
            (p for p in sorted(mapping, key=len, reverse=True) if f.name.startswith(p)),
            None,
        )
        if prefix is None:
            errors.append(f"{f.name}: 无法匹配 schema 前缀")
            continue
        schema_file = SCHEMA_DIR / mapping[prefix]
        data = json.loads(f.read_text(encoding="utf-8"))
        before = len(errors)
        validate(data, load_schema(schema_file), schema_file, f.name)
        if len(errors) == before:
            checked += 1
            print(f"PASS  {f.name}  ✓ {mapping[prefix]}")
        else:
            print(f"FAIL  {f.name}  ✗ {mapping[prefix]}")
    if errors:
        print("\n错误明细:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print(f"\n全部通过：{checked} 个样例与 schema 一致。")


if __name__ == "__main__":
    main()
