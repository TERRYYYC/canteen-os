#!/usr/bin/env node
/**
 * CanteenOS schema 一致性校验（CI 入口）。
 * 用法: node scripts/validate-schemas.mjs
 * 逻辑: 遍历 data/ 知识库（ADR-0006 起取代 examples/——目录即知识库，一实体一文件、
 *       文件名即 ID），按下表映射到 schemas/*.schema.json，用 ajv（draft 2020-12）+
 *       ajv-formats 校验；任一失败即退出码 1。
 *       跨文件引用检查（techniqueRef 闭集等）在 scripts/local-validate.py 中。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_DIR = join(ROOT, "schemas");
const DATA_DIR = join(ROOT, "data");

/** 数据路径 → schema 文件名（新增实体时在此登记）。dir 校验目录下全部 .json；file 校验单文件。 */
const DATA_TARGETS = [
  { path: "ingredients", schema: "ingredient.schema.json", kind: "dir" },
  { path: "dishes", schema: "dish.schema.json", kind: "dir" },
  { path: "menu-plans", schema: "menu-plan.schema.json", kind: "dir" },
  { path: "purchase-orders", schema: "purchase-order.schema.json", kind: "dir" },
  { path: "techniques.json", schema: "techniques.schema.json", kind: "file" },
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

// 预加载全部 schema，使跨文件 $ref（如 common.schema.json#/$defs/Id）可解析
for (const file of readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".schema.json"))) {
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), "utf8"));
  ajv.addSchema(schema, file);
}

// addSchema(schema, file) 已同时按文件 key 与 schema 内 $id 注册；
// 此处必须复用已注册的 schema（getSchema），若再 compile 同一份 JSON
// 会因重复注册同一 $id 抛 "schema with key or id already exists"。
const validators = new Map();
for (const { schema } of DATA_TARGETS) {
  const validate = ajv.getSchema(schema);
  if (!validate) {
    console.error(`ERROR: schema 未注册成功: ${schema}`);
    process.exit(1);
  }
  validators.set(schema, validate);
}

let passed = 0;
let failed = 0;
let total = 0;

for (const { path, schema, kind } of DATA_TARGETS) {
  const abs = join(DATA_DIR, path);
  const files =
    kind === "dir"
      ? existsSync(abs)
        ? readdirSync(abs)
            .filter((f) => f.endsWith(".json"))
            .sort()
            .map((f) => join(abs, f))
        : []
      : [abs];
  if (kind === "file" && !existsSync(abs)) {
    console.error(`FAIL  ${path}: 文件缺失`);
    failed++;
    continue;
  }
  for (const file of files) {
    total++;
    const label = relative(ROOT, file);
    const validate = validators.get(schema);
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (validate(data)) {
      console.log(`PASS  ${label}  ✓ ${schema}`);
      passed++;
    } else {
      console.error(`FAIL  ${label}  ✗ ${schema}`);
      for (const err of validate.errors ?? []) {
        console.error(`      ${err.instancePath || "(root)"} ${err.message}`);
      }
      failed++;
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${total} total`);
process.exit(failed === 0 ? 0 : 1);
