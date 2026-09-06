/**
 * generate-week41.mjs — 读取 data/ 实际生成 week-41 采购单快照，回填 data/purchase-orders/。
 *
 * 用法（零依赖，需先构建）：npm run build && node scripts/generate-week41.mjs
 *   或从仓库根：  node packages/core/scripts/generate-week41.mjs
 *
 * 说明：
 *  - 引擎（packages/core/src/procurement/engine.ts）是纯函数；本脚本负责全部 I/O：
 *    读 data/ 的 JSON → expand → renderPurchaseOrders → 写 data/purchase-orders/week-41-*.json。
 *  - generatedAt 固定注入（默认 2026-10-03，week-41 开始前的采购日），重跑幂等、可复现；
 *    要换时间用 `node scripts/generate-week41.mjs --at 2026-10-04T08:00:00.000Z`。
 *  - 文件命名 week-41-<供应商slug>：供应商名 → slug 的映射是本脚本的一次性胶水
 *    （数据模型里供应商只是字符串，无 slug 字段），新增供应商时在 SUPPLIER_SLUG 补一行。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  expand,
  formatAllPurchaseOrdersText,
  readiness,
  renderMenu,
  renderPurchaseOrders,
  renderPrepList,
} from "../dist/procurement/engine.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

// --- CLI：--at <ISO date-time> 覆盖注入的生成时间（默认固定值保证幂等） ---
const atIdx = process.argv.indexOf("--at");
const generatedAt = atIdx > 0 ? process.argv[atIdx + 1] : "2026-10-03T00:00:00.000Z";
const MENU_PLAN_ID = "week-41";

/** 供应商字符串 → 文件名 slug（胶水映射；新供应商在此补充） */
const SUPPLIER_SLUG = {
  绿源农产品配送: "lvyuan",
  宏达粮油调味批发: "hongda",
};
const slugOf = (supplier) => {
  if (SUPPLIER_SLUG[supplier]) return SUPPLIER_SLUG[supplier];
  const ascii = supplier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || "unspecified";
};

// --- 装载 data/（一实体一文件、文件名即 ID） ---
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

// --- 引擎管线 ---
const { lines, pending, issues } = expand(menuPlan, dishes, ingredients);
for (const i of issues) console.error(`[${i.kind}] ${i.code}: ${i.message}`);
if (issues.some((i) => i.kind === "error")) {
  console.error("存在 error 级 issue，仍照常输出可出部分（pending 区不阻断）。");
}
const pos = renderPurchaseOrders(lines, menuPlan, { generatedAt, menuPlanRef: MENU_PLAN_ID });

// --- 回填 data/purchase-orders/week-41-<slug>.json ---
const outDir = path.join(ROOT, "data/purchase-orders");
mkdirSync(outDir, { recursive: true });
for (const po of pos) {
  const file = path.join(outDir, `${MENU_PLAN_ID}-${slugOf(po.supplier)}.json`);
  writeFileSync(file, JSON.stringify(po, null, 2) + "\n", "utf8");
  console.log(`已写入 ${path.relative(ROOT, file)}`);
}

// --- 控制台输出三张单（供人工核对 / 微信转发） ---
console.log("\n===== 采购单（微信文本） =====");
console.log(formatAllPurchaseOrdersText(pos, { ingredients, pending }));
console.log("\n===== 备料单（uk） =====");
console.log(renderPrepList(menuPlan, dishes, techniques, "uk", ingredients));
console.log("\n===== 菜单（uk） =====");
console.log(renderMenu(menuPlan, dishes, "uk"));
console.log("\n===== readiness（番茄炒蛋） =====");
console.log(JSON.stringify(readiness(dishes["tomato-egg-stir-fry"], ingredients), null, 2));

const grand = pos.reduce((s, p) => s + (p.totalAmount?.amount ?? 0), 0);
console.log(`\n合计：¥${grand.toFixed(2)}（${pos.length} 张单，${lines.length} 行，待补全 ${pending.length} 行）`);
