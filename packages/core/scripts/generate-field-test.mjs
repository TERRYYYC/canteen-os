/**
 * generate-field-test.mjs — 用引擎实际渲染 week-41 真人测试材料，回填 docs/field-test/week-41/。
 *
 * 用法（零依赖，需先构建）：node packages/core/scripts/generate-field-test.mjs
 *
 * 产出（全部为引擎渲染结果，非手写）：
 *  - purchase-order-<slug>.txt ：微信转发格式采购单（scenario-f 排版，formatPurchaseOrderText）
 *  - prep-list-uk.md            ：乌克兰语备料单（renderPrepList）
 * README.md（用法指南 + 反馈记录表）是手写文档，不由本脚本生成。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  expand,
  formatPurchaseOrderText,
  renderPurchaseOrders,
  renderPrepList,
} from "../dist/procurement/engine.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const MENU_PLAN_ID = "week-41";
const CTX = { generatedAt: "2026-10-03T00:00:00.000Z", menuPlanRef: MENU_PLAN_ID };

/** 供应商字符串 → 文件名 slug（与 generate-week41.mjs 同一胶水映射） */
const SUPPLIER_SLUG = {
  绿源农产品配送: "lvyuan",
  宏达粮油调味批发: "hongda",
};

const loadDir = (sub) =>
  Object.fromEntries(
    readdirSync(path.join(ROOT, "data", sub))
      .filter((f) => f.endsWith(".json"))
      .map((f) => [f.replace(/\.json$/, ""), readJson(`data/${sub}/${f}`)]),
  );
const ingredients = loadDir("ingredients");
const dishes = loadDir("dishes");
const techniques = readJson("data/techniques.json");
const menuPlan = readJson(`data/menu-plans/${MENU_PLAN_ID}.json`);

const { lines, pending, issues } = expand(menuPlan, dishes, ingredients);
if (issues.length > 0 || pending.length > 0) {
  console.error("⚠ 存在 issue/pending，真人测试材料应在干净数据上生成：");
  for (const i of issues) console.error(`  [${i.kind}] ${i.code}: ${i.message}`);
  process.exit(1);
}
const pos = renderPurchaseOrders(lines, menuPlan, CTX);

const outDir = path.join(ROOT, "docs/field-test/week-41");
mkdirSync(outDir, { recursive: true });

for (const po of pos) {
  const slug = SUPPLIER_SLUG[po.supplier] ?? "unspecified";
  const file = path.join(outDir, `purchase-order-${slug}.txt`);
  writeFileSync(file, formatPurchaseOrderText(po, { ingredients }) + "\n", "utf8");
  console.log(`已写入 ${path.relative(ROOT, file)}`);
}

const prepFile = path.join(outDir, "prep-list-uk.md");
writeFileSync(prepFile, renderPrepList(menuPlan, dishes, techniques, "uk", ingredients) + "\n", "utf8");
console.log(`已写入 ${path.relative(ROOT, prepFile)}`);
