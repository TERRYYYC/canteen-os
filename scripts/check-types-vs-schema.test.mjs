/**
 * scripts/check-types-vs-schema.mjs 测试（node:test，零依赖）。
 *   node --test scripts/check-types-vs-schema.test.mjs
 *
 * 覆盖：本仓库正例（exit 0）/ 临时副本原样正例 + 编程接口 /
 *       反例：schema 字段改名 · 必填集合变化 · 枚举值变化 · const 变化 ·
 *             覆盖性（schema 新增嵌套对象未登记、types.ts 多出声明、$defs 被删）· TS 接口改名 /
 *       定义收集器不进 allOf/if · typescript 缺失时报清楚错误。
 * 反例做法：把 schemas/ 与 packages/core/src/types.ts 复制到临时目录改后，用 --root 跑真实 CLI。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAPPING, SCHEMA_DIR, TYPES_FILE, check, collectSchemaDefinitions, loadSchemas, loadTypeScript } from "./check-types-vs-schema.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SCRIPT = path.join(HERE, "check-types-vs-schema.mjs");

function runCli(args, script = SCRIPT) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, NODE_PATH: "" } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** 复制 schemas/ + types.ts 到临时目录（不带 node_modules；typescript 由脚本从自身仓库解析） */
function makeTempRepo() {
  const tmp = mkdtempSync(path.join(tmpdir(), "canteenos-types-check-"));
  cpSync(path.join(ROOT, SCHEMA_DIR), path.join(tmp, SCHEMA_DIR), { recursive: true });
  mkdirSync(path.dirname(path.join(tmp, TYPES_FILE)), { recursive: true });
  cpSync(path.join(ROOT, TYPES_FILE), path.join(tmp, TYPES_FILE));
  return tmp;
}

function editSchema(tmp, file, mutate) {
  const p = path.join(tmp, SCHEMA_DIR, file);
  const doc = JSON.parse(readFileSync(p, "utf8"));
  mutate(doc);
  writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
}

function editTypes(tmp, mutate) {
  const p = path.join(tmp, TYPES_FILE);
  writeFileSync(p, mutate(readFileSync(p, "utf8")));
}

/** 建临时副本跑 fn，结束后清理（fn 可同步或返回 Promise） */
async function withTemp(fn) {
  const tmp = makeTempRepo();
  try {
    return await fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------

test("正例：本仓库 schemas/ 与 types.ts 一致 → exit 0，逐项 OK，无 MISMATCH/ERROR/UNMAPPED", () => {
  const { status, out } = runCli([]);
  assert.equal(status, 0, out);
  assert.ok((out.match(/^OK {8}/gm) ?? []).length >= MAPPING.length, out);
  assert.doesNotMatch(out, /^(MISMATCH|ERROR|UNMAPPED)/m);
  assert.match(out, /MISMATCH 0 · ERROR 0 · UNMAPPED 0/);
  assert.match(out, /types\.ts 与 schemas\/ 一致/);
});

test("正例：临时副本原样 → --root 跑 exit 0；编程接口 check() 返回 ok 且每个 MAPPING 项都有结果", async () => {
  await withTemp(async (tmp) => {
    const { status, out } = runCli(["--root", tmp]);
    assert.equal(status, 0, out);
    const ts = await loadTypeScript(tmp);
    const report = check({ root: tmp, ts });
    assert.equal(report.ok, true);
    assert.equal(report.counts.ok, MAPPING.length);
    assert.equal(report.counts.unmapped, 0);
    assert.deepEqual(report.results.map((r) => r.status), MAPPING.map(() => "OK"));
    const kinds = new Set(report.results.map((r) => r.kind));
    for (const k of ["object", "enum", "alias", "primitive"]) assert.ok(kinds.has(k), `应覆盖比对种类 ${k}`);
  });
});

test("反例：schema 字段改名（dish.description → descriptionX）而 types 未同步 → exit 1，两边差集都打印", async () => {
  await withTemp((tmp) => {
    editSchema(tmp, "dish.schema.json", (d) => {
      d.properties.descriptionX = d.properties.description;
      delete d.properties.description;
    });
    const { status, out } = runCli(["--root", tmp]);
    assert.equal(status, 1, out);
    assert.match(out, /^MISMATCH {2}object {4}dish\.schema\.json# {2}↔ {2}Dish/m);
    assert.match(out, /schema 有而 types 没有: descriptionX/);
    assert.match(out, /types 有而 schema 没有: description\b/);
    assert.match(out, /MISMATCH 1 · ERROR 0 · UNMAPPED 0/);
  });
});

test("反例：必填集合变化（ingredient 去掉 trackStock 必填；dish 把 image 改必填）→ exit 1，方向分别打印", async () => {
  await withTemp((tmp) => {
    editSchema(tmp, "ingredient.schema.json", (d) => {
      d.required = d.required.filter((k) => k !== "trackStock");
    });
    editSchema(tmp, "dish.schema.json", (d) => {
      d.required.push("image");
    });
    const { status, out } = runCli(["--root", tmp]);
    assert.equal(status, 1, out);
    assert.match(out, /必填不一致 · types 必填但 schema 可选: trackStock/);
    assert.match(out, /必填不一致 · schema 必填但 types 可选: image/);
    assert.match(out, /MISMATCH 2 · ERROR 0/);
  });
});

test("反例：枚举值变化（prep.timing 加值 / Unit 删值 / role 内联枚举改值）与 const 变化 → exit 1", async () => {
  await withTemp((tmp) => {
    editSchema(tmp, "dish.schema.json", (d) => {
      d.properties.components.items.properties.prep.properties.timing.enum.push("week-before");
    });
    editSchema(tmp, "common.schema.json", (d) => {
      d.$defs.Unit.enum = d.$defs.Unit.enum.filter((u) => u !== "pinch");
    });
    editSchema(tmp, "ingredient.schema.json", (d) => {
      d.properties.role.enum = ["main", "condiment"];
      d.properties.schemaVersion.const = "3";
    });
    const { status, out } = runCli(["--root", tmp]);
    assert.equal(status, 1, out);
    assert.match(out, /MISMATCH {2}enum .*PrepTiming[\s\S]*?schema 有而 types 没有: week-before/);
    assert.match(out, /MISMATCH {2}enum .*↔ {2}Unit[\s\S]*?types 有而 schema 没有: pinch/);
    assert.match(out, /Ingredient\.role[\s\S]*?schema 有而 types 没有: condiment[\s\S]*?types 有而 schema 没有: seasoning/);
    assert.match(out, /const 不一致 · schemaVersion: schema const "3"，types "2"/);
    assert.match(out, /MISMATCH 4 · ERROR 0/);
  });
});

test("反例：覆盖性——schema 新增嵌套对象未登记 / types.ts 多出声明 / $defs 被删 → UNMAPPED 与 ERROR，exit 1", async () => {
  await withTemp((tmp) => {
    editSchema(tmp, "dish.schema.json", (d) => {
      d.properties.nutrition = { type: "object", properties: { kcal: { type: "number" } }, additionalProperties: false };
    });
    editSchema(tmp, "common.schema.json", (d) => {
      delete d.$defs.MealType;
    });
    editTypes(tmp, (src) => `${src}\nexport interface Orphan {\n  a: string;\n}\n`);
    const { status, out } = runCli(["--root", tmp]);
    assert.equal(status, 1, out);
    assert.match(out, /^UNMAPPED {2}object {4}dish\.schema\.json#\/properties\/nutrition/m);
    assert.match(out, /^UNMAPPED {2}interface — {2}↔ {2}Orphan/m);
    assert.match(out, /^ERROR .*common\.schema\.json#\/\$defs\/MealType[\s\S]*?schema 定义不存在/m);
    // nutrition 同时体现在 Dish 的属性差集里
    assert.match(out, /Dish[\s\S]*?schema 有而 types 没有: nutrition/);
    assert.match(out, /ERROR 1 · UNMAPPED 2/);
  });
});

test("反例：types.ts 里接口改名（Dish → DishX）→ ERROR（找不到 Dish）+ UNMAPPED（DishX 无 schema），exit 1", async () => {
  await withTemp((tmp) => {
    editTypes(tmp, (src) => src.replace("export interface Dish {", "export interface DishX {"));
    const { status, out } = runCli(["--root", tmp]);
    assert.equal(status, 1, out);
    assert.match(out, /^ERROR .*dish\.schema\.json# {2}↔ {2}Dish\n {12}types\.ts 里没有顶层声明 Dish/m);
    assert.match(out, /^UNMAPPED {2}interface — {2}↔ {2}DishX/m);
  });
});

test("定义收集器：只沿 $defs/properties/items 下钻，不进 allOf/if（Quantity 的 to-taste 条件枚举不算定义）", () => {
  const defs = collectSchemaDefinitions(loadSchemas(ROOT));
  assert.ok(defs.includes("common.schema.json#/$defs/Quantity"));
  assert.ok(defs.includes("dish.schema.json#/properties/steps/items/properties/clip"));
  assert.ok(defs.includes("techniques.schema.json#/items"));
  assert.ok(!defs.some((d) => d.includes("/allOf/") || d.includes("/if/") || d.includes("/anyOf/")), defs.join("\n"));
  // 本仓库的每个定义都在 MAPPING 里（覆盖性的静态保证）
  const mapped = new Set(MAPPING.map((e) => e.schema));
  assert.deepEqual(defs.filter((d) => !mapped.has(d)), []);
});

test("typescript 缺失：脚本副本放到没有 node_modules 的目录运行 → exit 1，报错指明如何安装", async () => {
  await withTemp((tmp) => {
    mkdirSync(path.join(tmp, "scripts"));
    const copy = path.join(tmp, "scripts", "check-types-vs-schema.mjs");
    cpSync(SCRIPT, copy);
    const { status, out } = runCli(["--root", tmp], copy);
    assert.equal(status, 1, out);
    assert.match(out, /找不到 typescript 模块/);
    assert.match(out, /pnpm install --dir packages\/core/);
  });
});

test('stdin imports do not resolve dash as an entry file or execute validation', () => {
  for (const name of ['check-types-vs-schema.mjs','validate-schemas.mjs']) {
    const url = new URL(name, import.meta.url).href;
    const r = spawnSync(process.execPath, ['--input-type=module','-'], {
      input:`await import(${JSON.stringify(url)}); console.log('IMPORT_OK');`, encoding:'utf8',
    });
    assert.equal(r.status,0,r.stderr);
    assert.equal(r.stdout,'IMPORT_OK\n');
    assert.equal(r.stderr,'');
  }
});

test('union coverage includes inline definitions nested under oneOf and anyOf', () => {
  for (const keyword of ['oneOf','anyOf']) {
    const defs=collectSchemaDefinitions(new Map([['x.schema.json',{
      [keyword]:[{type:'object',properties:{a:{type:'string'}}},{type:'object',properties:{b:{enum:['yes','no']}}}],
    }]]));
    assert.ok(defs.includes(`x.schema.json#/${keyword}/0`),defs.join('\n'));
    assert.ok(defs.includes(`x.schema.json#/${keyword}/1/properties/b`),defs.join('\n'));
  }
});

test('version union cannot silently lose a TypeScript alternative', async () => {
  await withTemp(tmp => {
    editTypes(tmp, src=>src.replace('export type AnyMenuPlan = MenuPlan | MenuPlanV3;','export type AnyMenuPlan = MenuPlan;'));
    const {status,out}=runCli(['--root',tmp]);
    assert.equal(status,1,out);
    assert.match(out,/union.*AnyMenuPlan[\s\S]*MenuPlanV3/);
  });
});

test('oneOf duplicate version branch is rejected before it invalidates both readers', async () => {
  await withTemp(tmp => {
    editSchema(tmp,'any-menu-plan.schema.json',s=>s.oneOf.push({...s.oneOf[0]}));
    const {status,out}=runCli(['--root',tmp]);
    assert.equal(status,1,out);
    assert.match(out,/oneOf.*重复.*MenuPlan/);
  });
});
