#!/usr/bin/env node
/**
 * CanteenOS schema 一致性校验（CI 入口）。
 * 用法: node scripts/validate-schemas.mjs
 * 逻辑: examples/<prefix>-*.example.json 按前缀映射到 schemas/<prefix>.schema.json，
 *       用 ajv（draft 2020-12）+ ajv-formats 校验；任一失败即退出码 1。
 * 注意: 前缀按长度降序匹配，避免 "dishpack-*" 被 "dish" 前缀截获。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_DIR = join(ROOT, "schemas");
const EXAMPLE_DIR = join(ROOT, "examples");

/** 文件名前缀 → schema 文件名（新增 schema 时在此登记） */
const PREFIX_MAP = {
  ingredient: "ingredient.schema.json",
  supplier: "supplier.schema.json",
  dishpack: "dishpack.schema.json",
  dish: "dish.schema.json",
  "menu-plan": "menu-plan.schema.json",
  "purchase-order": "purchase-order.schema.json",
  feedback: "feedback.schema.json",
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

// 预加载全部 schema，使跨文件 $ref（如 common.schema.json#/$defs/Id）可解析
for (const file of readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".schema.json"))) {
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), "utf8"));
  ajv.addSchema(schema, file);
}

const validators = new Map();
for (const [prefix, schemaFile] of Object.entries(PREFIX_MAP)) {
  validators.set(prefix, ajv.compile(JSON.parse(readFileSync(join(SCHEMA_DIR, schemaFile), "utf8"))));
}

const prefixes = Object.keys(PREFIX_MAP).sort((a, b) => b.length - a.length);

let passed = 0;
let failed = 0;

const examples = readdirSync(EXAMPLE_DIR).filter((f) => f.endsWith(".json")).sort();
if (examples.length === 0) {
  console.error("ERROR: examples/ 下没有任何 .json 样例");
  process.exit(1);
}

for (const file of examples) {
  const prefix = prefixes.find((p) => file.startsWith(p));
  if (!prefix) {
    console.error(`FAIL  ${file}: 无法匹配任何 schema 前缀（${prefixes.join(", ")}）`);
    failed++;
    continue;
  }
  const validate = validators.get(prefix);
  const data = JSON.parse(readFileSync(join(EXAMPLE_DIR, file), "utf8"));
  if (validate(data)) {
    console.log(`PASS  ${file}  ✓ ${PREFIX_MAP[prefix]}`);
    passed++;
  } else {
    console.error(`FAIL  ${file}  ✗ ${PREFIX_MAP[prefix]}`);
    for (const err of validate.errors ?? []) {
      console.error(`      ${err.instancePath || "(root)"} ${err.message}`);
    }
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${examples.length} total`);
process.exit(failed === 0 ? 0 : 1);
