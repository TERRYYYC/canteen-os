/**
 * 采购引擎黄金测试 + 边界测试（node:test，零依赖，跑编译产物 dist/）。
 *
 * 黄金基准：data/purchase-orders/README.md 的手写验收表（menu-plans/week-41.json
 * 番茄炒蛋 480 份，margin 1.1）。
 *
 * ⚠️ 已知基准偏离（ scallion / 小葱一行 ）：
 *   data/dishes/tomato-egg-stir-fry.json 登记小葱 250 g / 50 份 → 净需求 480×5 = 2400 g；
 *   README 与 docs/modules/procurement.md §2 的表写作 4800 g（与其自身"配方 250 g"一行
 *   自相矛盾：480×5=2400，4800 需 500 g/50 份）。引擎忠实于数据本体，小葱行输出
 *   4×1kg / ¥48.00，两单合计 ¥1375.50 而非 README 的 ¥1411.50。本测试断言数据推导值，
 *   并显式记录该偏离（见 scallion 断言块注释）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  DEFAULT_MARGIN,
  UNSPECIFIED_SUPPLIER,
  convertQuantity,
  expand,
  formatAllPurchaseOrdersText,
  formatPurchaseOrderText,
  readiness,
  renderMenu,
  renderPrepList,
  renderPurchaseOrders,
} from "../dist/procurement/engine.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

// --- 装载 data/（调用方读文件注入，引擎纯函数） ---
const ingredients = Object.fromEntries(
  readdirSync(path.join(ROOT, "data/ingredients"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f.replace(/\.json$/, ""), readJson(`data/ingredients/${f}`)]),
);
const dishes = Object.fromEntries(
  readdirSync(path.join(ROOT, "data/dishes"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f.replace(/\.json$/, ""), readJson(`data/dishes/${f}`)]),
);
const techniques = readJson("data/techniques.json");
const week41 = readJson("data/menu-plans/week-41.json");

const CTX = { generatedAt: "2026-10-03T00:00:00.000Z", menuPlanRef: "week-41" };

const approx = (actual, expected, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < eps, `expected ≈${expected}, got ${actual}`);

const golden = expand(week41, dishes, ingredients);
const lineOf = (ref) => {
  const l = golden.lines.find((x) => x.ingredientRef === ref);
  assert.ok(l, `缺少采购行 ${ref}`);
  return l;
};

test("黄金测试：expand 无 issue 无 pending，5 行齐备，meals trace 完整", () => {
  assert.equal(golden.issues.length, 0, JSON.stringify(golden.issues, null, 2));
  assert.equal(golden.pending.length, 0);
  assert.equal(golden.lines.length, 5);
  for (const l of golden.lines) {
    assert.deepEqual(
      l.line.trace.meals,
      [
        { date: "2026-10-05", mealType: "lunch", dishRef: "tomato-egg-stir-fry", servings: 200 },
        { date: "2026-10-07", mealType: "lunch", dishRef: "tomato-egg-stir-fry", servings: 160 },
        { date: "2026-10-09", mealType: "dinner", dishRef: "tomato-egg-stir-fry", servings: 120 },
      ],
      `${l.ingredientRef} trace.meals 不符`,
    );
  }
});

test("黄金：番茄 19×5kg ¥541.50（÷0.85 ×1.1 = 93176.4706 g → 18.6353 → ceil 19）", () => {
  const { supplier, line } = lineOf("tomato");
  assert.equal(supplier, "绿源农产品配送");
  const t = line.trace;
  assert.deepEqual(t.netNeed, { value: 72000, unit: "g" });
  assert.equal(t.yieldApplied, 0.85);
  assert.equal(t.marginApplied, 1.1);
  assert.equal(t.onHandDeducted, null); // trackStock=false 不扣库存
  approx(t.grossNeed.value, 93176.4706, 1e-4);
  assert.equal(t.grossNeed.unit, "g");
  assert.equal(t.packSize, 5);
  assert.equal(t.packUnit, "kg");
  approx(t.packsRaw, 18.6353, 1e-4);
  assert.equal(line.packs, 19);
  assert.equal(t.minPacksApplied, false); // ceil(18.64)=19 > minPacks 2
  assert.deepEqual(line.qty, { value: 95, unit: "kg" });
  assert.deepEqual(line.unitPrice, { amount: 28.5, currency: "CNY" });
  assert.deepEqual(line.amount, { amount: 541.5, currency: "CNY" });
});

test("黄金：鸡蛋 720 pcs 直通 = 4 箱 ¥600.00（pcs 不套 yield、不乘 margin）", () => {
  const { supplier, line } = lineOf("egg");
  assert.equal(supplier, "绿源农产品配送");
  const t = line.trace;
  assert.deepEqual(t.netNeed, { value: 720, unit: "pcs" }); // 480 份 × 1.5 枚
  assert.equal(t.yieldApplied, null); // pcs 不套 yield
  assert.equal(t.marginApplied, null); // pcs 不乘 margin
  assert.equal(t.onHandDeducted, null);
  assert.deepEqual(t.grossNeed, { value: 720, unit: "pcs" }); // 直通，一分不多
  assert.equal(t.packSize, 180);
  assert.equal(t.packUnit, "pcs");
  assert.equal(t.packsRaw, 4); // 720 ÷ 180 = 4.0 整
  assert.equal(line.packs, 4);
  assert.equal(t.minPacksApplied, false);
  assert.deepEqual(line.qty, { value: 720, unit: "pcs" });
  assert.deepEqual(line.amount, { amount: 600, currency: "CNY" });
});

test("黄金：食盐 minPacks 20 触发 + trackStock 扣 500 g（292 g → 0.584 → ceil 1 → 20 袋 ¥50.00）", () => {
  const { supplier, line } = lineOf("salt");
  assert.equal(supplier, "宏达粮油调味批发");
  const t = line.trace;
  assert.deepEqual(t.netNeed, { value: 720, unit: "g" });
  assert.equal(t.yieldApplied, null); // 无 yield → ÷1 记 null
  assert.equal(t.marginApplied, 1.1);
  assert.deepEqual(t.onHandDeducted, { value: 500, unit: "g" }); // 792 − 500
  assert.deepEqual(t.grossNeed, { value: 292, unit: "g" });
  approx(t.packsRaw, 0.584, 1e-4);
  assert.equal(line.packs, 20); // minPacks 20 抬高
  assert.equal(t.minPacksApplied, true);
  assert.deepEqual(line.qty, { value: 10000, unit: "g" });
  assert.deepEqual(line.amount, { amount: 50, currency: "CNY" });
});

test("黄金：食用油 minPacks 2 触发（4800 ml ×1.1 −1000 = 4280 ml → 0.856 → 2 桶 ¥136.00）", () => {
  const { supplier, line } = lineOf("cooking-oil");
  assert.equal(supplier, "宏达粮油调味批发");
  const t = line.trace;
  assert.deepEqual(t.netNeed, { value: 4800, unit: "ml" });
  assert.equal(t.yieldApplied, null);
  assert.equal(t.marginApplied, 1.1);
  assert.deepEqual(t.onHandDeducted, { value: 1000, unit: "ml" });
  assert.deepEqual(t.grossNeed, { value: 4280, unit: "ml" });
  approx(t.packsRaw, 0.856, 1e-4);
  assert.equal(line.packs, 2);
  assert.equal(t.minPacksApplied, true);
  assert.deepEqual(line.qty, { value: 10, unit: "l" });
  assert.deepEqual(line.amount, { amount: 136, currency: "CNY" });
});

test("黄金：小葱 ÷0.80 ×1.1（⚠ 基准表偏离行：数据 250 g/50 份 → 净需求 2400 g → 4×1kg ¥48.00）", () => {
  const { supplier, line } = lineOf("scallion");
  assert.equal(supplier, "绿源农产品配送");
  const t = line.trace;
  // 数据本体推导值（README 手写基准误作 4800 g → 7 kg ¥84.00；480×5=2400，见其表头注释）
  assert.deepEqual(t.netNeed, { value: 2400, unit: "g" });
  assert.equal(t.yieldApplied, 0.8);
  assert.equal(t.marginApplied, 1.1);
  assert.equal(t.onHandDeducted, null);
  approx(t.grossNeed.value, 3300, 1e-6); // 2400 ÷ 0.8 × 1.1
  approx(t.packsRaw, 3.3, 1e-4);
  assert.equal(line.packs, 4);
  assert.equal(t.minPacksApplied, false);
  assert.deepEqual(line.qty, { value: 4, unit: "kg" });
  assert.deepEqual(line.amount, { amount: 48, currency: "CNY" });
});

test("黄金：renderPurchaseOrders 按供应商分单 + 合计金额", () => {
  const pos = renderPurchaseOrders(golden.lines, week41, CTX);
  assert.equal(pos.length, 2);
  const bySupplier = Object.fromEntries(pos.map((p) => [p.supplier, p]));
  // 绿源：番茄 541.5 + 鸡蛋 600 + 小葱 48 = 1189.5（README 基准 1225.50 含小葱错行）
  assert.deepEqual(bySupplier["绿源农产品配送"].totalAmount, { amount: 1189.5, currency: "CNY" });
  assert.equal(bySupplier["绿源农产品配送"].lines.length, 3);
  // 宏达：食盐 50 + 油 136 = 186
  assert.deepEqual(bySupplier["宏达粮油调味批发"].totalAmount, { amount: 186, currency: "CNY" });
  assert.equal(bySupplier["宏达粮油调味批发"].lines.length, 2);
  // 合计 1375.50（README 基准 1411.50，差 36 = 小葱 84−48）
  const grand = pos.reduce((s, p) => s + p.totalAmount.amount, 0);
  approx(grand, 1375.5);
  for (const po of pos) {
    assert.equal(po.schemaVersion, "2");
    assert.equal(po.menuPlanRef, "week-41");
    assert.equal(po.generatedAt, CTX.generatedAt);
  }
});

test("边界：缺 purchase 的食材进「待补全」区（no-purchase-spec），不阻断其余行", () => {
  const ings = {
    "no-purchase-ing": {
      schemaVersion: "2",
      name: { zh: "干辣椒" },
      baseUnit: "g",
      trackStock: false,
    },
    tomato: ingredients.tomato,
  };
  const ds = {
    d1: {
      name: { zh: "测试菜" },
      baseServings: 10,
      status: "active",
      components: [
        { ingredientRef: "no-purchase-ing", qty: { value: 100, unit: "g" } },
        { ingredientRef: "tomato", qty: { value: 500, unit: "g" } },
      ],
    },
  };
  const plan = {
    schemaVersion: "2",
    meals: [{ date: "2026-10-05", mealType: "lunch", dishRef: "d1", plannedServings: 10 }],
  };
  const r = expand(plan, ds, ings);
  assert.equal(r.lines.length, 1); // tomato 照常出单
  assert.equal(r.lines[0].ingredientRef, "tomato");
  assert.equal(r.pending.length, 1);
  assert.equal(r.pending[0].ingredientRef, "no-purchase-ing");
  assert.equal(r.pending[0].reason, "no-purchase-spec");
  assert.equal(r.pending[0].supplier, UNSPECIFIED_SUPPLIER);
  assert.deepEqual(r.pending[0].netNeed, { value: 100, unit: "g" });
  assert.deepEqual(r.pending[0].grossNeed, { value: 110, unit: "g" }); // 默认 margin 1.1
  assert.equal(r.issues.filter((i) => i.code === "no-purchase-spec").length, 1);
  assert.equal(r.issues[0].kind, "warning");
  // 文本端单独成区
  const pos = renderPurchaseOrders(r.lines, plan, CTX);
  const text = formatAllPurchaseOrdersText(pos, { ingredients: ings, pending: r.pending });
  assert.match(text, /⚠️ 待补全（未计入采购单）/);
  assert.match(text, /干辣椒 {2}需求约 110 克?g? — 缺采购规格/);
});

test("边界：purchase.supplier 为空串 → 归「未指定供应商」组并排最后", () => {
  const ings = {
    ...ingredients,
    "no-supplier-ing": {
      schemaVersion: "2",
      name: { zh: "神秘食材" },
      baseUnit: "g",
      trackStock: false,
      purchase: { supplier: "  ", packSize: 1, packUnit: "kg" },
    },
  };
  const ds = {
    d1: {
      name: { zh: "菜" },
      baseServings: 10,
      status: "active",
      components: [{ ingredientRef: "no-supplier-ing", qty: { value: 2500, unit: "g" } }],
    },
  };
  const plan = {
    schemaVersion: "2",
    meals: [{ date: "2026-10-05", mealType: "lunch", dishRef: "d1", plannedServings: 10 }],
  };
  const r = expand(plan, ds, ings);
  assert.equal(r.lines[0].supplier, UNSPECIFIED_SUPPLIER);
  const pos = renderPurchaseOrders(r.lines, plan, CTX);
  assert.equal(pos[0].supplier, UNSPECIFIED_SUPPLIER);
  assert.match(pos[0].notes, /未指定供应商/);
  const text = formatPurchaseOrderText(pos[0], { ingredients: ings });
  assert.match(text, /【采购单】2026-10-03 · ⚠️ 未指定供应商（请先指派再下单）/);
  assert.match(text, /神秘食材 {2}3 包 × 1 kg（共 3 kg）/); // 2500×1.1=2750 g → 2.75 kg → ceil 3
  assert.match(text, /无上次价记录/);
});

test("边界：需求单位与 baseUnit 不相容（l→g）→ unit-conversion-missing，整食材进待补全", () => {
  const ings = { salt: ingredients.salt };
  const ds = {
    d1: {
      name: { zh: "错单位菜" },
      baseServings: 10,
      status: "active",
      components: [{ ingredientRef: "salt", qty: { value: 2, unit: "l" } }],
    },
  };
  const plan = {
    schemaVersion: "2",
    meals: [{ date: "2026-10-05", mealType: "lunch", dishRef: "d1", plannedServings: 10 }],
  };
  const r = expand(plan, ds, ings);
  assert.equal(r.lines.length, 0);
  assert.equal(r.pending.length, 1);
  assert.equal(r.pending[0].reason, "unit-conversion-missing");
  assert.equal(r.pending[0].netNeed, null); // 不给误导性部分值
  const issue = r.issues.find((i) => i.code === "unit-conversion-missing");
  assert.equal(issue.kind, "error");
  assert.match(issue.message, /l 无法换算到基准单位 g/);
});

test("边界：packUnit 与 baseUnit 不相容（g 食材按 pcs 包装且无 pcsToGram）→ 待补全", () => {
  const ings = {
    "weird-pack": {
      schemaVersion: "2",
      name: { zh: "怪包装" },
      baseUnit: "g",
      trackStock: false,
      purchase: { supplier: "某供应商", packSize: 10, packUnit: "pcs" },
    },
  };
  const ds = {
    d1: {
      name: { zh: "菜" },
      baseServings: 10,
      status: "active",
      components: [{ ingredientRef: "weird-pack", qty: { value: 100, unit: "g" } }],
    },
  };
  const plan = {
    schemaVersion: "2",
    meals: [{ date: "2026-10-05", mealType: "lunch", dishRef: "d1", plannedServings: 10 }],
  };
  const r = expand(plan, ds, ings);
  assert.equal(r.lines.length, 0);
  assert.equal(r.pending[0].reason, "unit-conversion-missing");
  assert.deepEqual(r.pending[0].grossNeed, { value: 110, unit: "g" }); // grossNeed 可算，卡在包装换算
});

test("边界：pcs↔g 只靠 pcsToGram（番茄 2 pcs → 360 g 净需求）", () => {
  const ds = {
    d1: {
      name: { zh: "个装番茄菜" },
      baseServings: 10,
      status: "active",
      components: [{ ingredientRef: "tomato", qty: { value: 2, unit: "pcs" } }],
    },
  };
  const plan = {
    schemaVersion: "2",
    meals: [{ date: "2026-10-05", mealType: "lunch", dishRef: "d1", plannedServings: 10 }],
  };
  const r = expand(plan, ds, ingredients);
  assert.equal(r.issues.length, 0);
  assert.deepEqual(r.lines[0].line.trace.netNeed, { value: 360, unit: "g" }); // 2 × 180
});

test("边界：convertQuantity 同量纲/跨量纲/无路径", () => {
  assert.equal(convertQuantity(2.5, "kg", "g"), 2500);
  assert.equal(convertQuantity(500, "ml", "l"), 0.5);
  assert.equal(convertQuantity(3, "pcs", "g", ingredients.tomato), 540);
  assert.equal(convertQuantity(110, "g", "pcs", ingredients.egg), 2); // 110 ÷ 55
  assert.equal(convertQuantity(1, "pcs", "kg", ingredients.tomato), 0.18); // pcs→g→kg 链
  assert.equal(convertQuantity(1, "l", "g"), null); // 体积→质量无路径
  assert.equal(convertQuantity(1, "tbsp", "ml"), null); // tbsp 无换算路径
  assert.equal(convertQuantity(1, "pcs", "g", ingredients.salt), null); // 无 pcsToGram
});

test("边界：missing-dish / dish-not-active / dish-incomplete 三类 issue", () => {
  const plan = {
    schemaVersion: "2",
    meals: [
      { date: "2026-10-05", mealType: "lunch", dishRef: "ghost", plannedServings: 10 },
      { date: "2026-10-06", mealType: "lunch", dishRef: "draft-dish", plannedServings: 10 },
      { date: "2026-10-07", mealType: "lunch", dishRef: "no-bom", plannedServings: 10 },
    ],
  };
  const ds = {
    "draft-dish": { name: { zh: "草稿菜" }, status: "draft" },
    "no-bom": { name: { zh: "无配料菜" }, status: "active", baseServings: 10 },
  };
  const r = expand(plan, ds, ingredients);
  assert.equal(r.lines.length, 0);
  assert.deepEqual(
    r.issues.map((i) => i.code),
    ["missing-dish", "dish-not-active", "dish-incomplete"],
  );
});

test("readiness：番茄炒蛋 能教✗（egg/salt/cooking-oil 无 prep）能排✓ 能采✓", () => {
  const r = readiness(dishes["tomato-egg-stir-fry"], ingredients);
  assert.equal(r.teach, false);
  assert.equal(r.plan, true);
  assert.equal(r.buy, true);
  assert.ok(r.missing.some((m) => m.includes("egg") && m.includes("prep")));
  assert.ok(r.missing.some((m) => m.includes("salt")));
  assert.ok(r.missing.some((m) => m.includes("cooking-oil")));
});

test("readiness：只有名字的草稿菜 三关卡全不过；完整菜全过", () => {
  const empty = readiness({ name: { zh: "只有名字" } }, ingredients);
  assert.deepEqual(
    [empty.teach, empty.plan, empty.buy],
    [false, false, false],
  );
  const full = readiness(
    {
      name: { zh: "完整菜" },
      baseServings: 10,
      components: [
        {
          ingredientRef: "tomato",
          qty: { value: 100, unit: "g" },
          prep: { techniqueRef: "chunks" },
        },
      ],
      steps: [{ text: { zh: "炒。" } }],
    },
    ingredients,
  );
  assert.deepEqual([full.teach, full.plan, full.buy], [true, true, true]);
  assert.equal(full.missing.length, 0);
  // 引用了不存在食材 → 能采✗
  const badRef = readiness(
    {
      name: { zh: "坏引用菜" },
      baseServings: 10,
      components: [{ ingredientRef: "ghost-ing", qty: { value: 1, unit: "g" } }],
      steps: [{ text: { zh: "x" } }],
    },
    ingredients,
  );
  assert.equal(badRef.buy, false);
});

test("renderMenu：zh/uk 取值与 fallback 链 zh→en→uk", () => {
  const zh = renderMenu(week41, dishes, "zh");
  assert.match(zh, /【菜单】2026 年第 41 周菜单（2026-10-05 — 2026-10-11）/);
  assert.match(zh, /2026-10-05\n {2}午餐：番茄炒蛋/);
  assert.match(zh, /2026-10-09\n {2}晚餐：番茄炒蛋/);
  const uk = renderMenu(week41, dishes, "uk");
  assert.match(uk, /Обід：Смажені яйця з томатами/);
  assert.match(uk, /Вечеря：Смажені яйця з томатами/);
  // fallback：只有中文名的菜在 uk 下回退中文
  const onlyZh = renderMenu(
    {
      schemaVersion: "2",
      meals: [{ date: "2026-10-05", mealType: "lunch", dishRef: "d1", plannedServings: 10 }],
    },
    { d1: { name: { zh: "只有中文名" } } },
    "uk",
  );
  assert.match(onlyZh, /只有中文名/);
});

test("renderPrepList：uk 输出按日期/餐次分组，含缩放净量与词表切法名", () => {
  const text = renderPrepList(week41, dishes, techniques, "uk", ingredients);
  assert.match(text, /【Підготовча відомість】Меню на 41 тиждень 2026/);
  assert.match(text, /—— 2026-10-05 ——/);
  assert.match(text, /Обід：Смажені яйця з томатами ×200 порцій/);
  // 番茄 7500 g × (200/50) = 30000 g → 30 кг；滚刀块 uk 词表名 + size + note
  assert.match(text, /Помідор — 30 кг — Шматки рулонним нарізанням，3–4 cm（Очищені від шкірки/);
  // 鸡蛋 75 × 4 = 300 шт；无 prep → 标注
  assert.match(text, /Яйця курячі — 300 шт \(без специфікації нарізки\)/);
  // 油 500 ml × 4 = 2000 ml → 2 л
  assert.match(text, /Олія рослинна — 2 л/);
  // 晚餐场 120 份 scale 2.4：番茄 18 кг
  assert.match(text, /Вечеря：Смажені яйця з томатами ×120 порцій/);
  assert.match(text, /Помідор — 18 кг/);
});

test("微信文本：scenario-f 排版（单头/分隔线/预估总价/缺价提示）", () => {
  const pos = renderPurchaseOrders(golden.lines, week41, CTX);
  const text = formatAllPurchaseOrdersText(pos, { ingredients, pending: golden.pending });
  const lvyuan = pos.find((p) => p.supplier === "绿源农产品配送");
  const section = formatPurchaseOrderText(lvyuan, { ingredients });
  assert.match(section, /【采购单】2026-10-03 · 绿源农产品配送/);
  assert.match(section, /番茄 {2}19 包 × 5 kg（共 95 kg）/);
  assert.match(section, /鸡蛋 {2}4 包 × 180 个（共 720 个）/);
  assert.match(section, /共 3 样 · 预估 ¥1189\.50（按上次价）/);
  assert.match(text, /共 2 样 · 预估 ¥186\.00（按上次价）/);
  // 缺价行：部分预估提示
  const tomatoLine = golden.lines.find((l) => l.ingredientRef === "tomato").line;
  const noPriceLine = structuredClone(tomatoLine);
  noPriceLine.ingredientRef = "egg";
  delete noPriceLine.unitPrice;
  delete noPriceLine.amount;
  const noPrice = {
    schemaVersion: "2",
    supplier: "某供应商",
    generatedAt: CTX.generatedAt,
    lines: [tomatoLine, noPriceLine],
  };
  assert.match(
    formatPurchaseOrderText(noPrice, { ingredients }),
    /共 2 样 · 已估价 ¥541\.50（1 样缺上次价）/,
  );
});

test("确定性：同输入必同输出（expand 两次 deepEqual）", () => {
  assert.deepEqual(expand(week41, dishes, ingredients), golden);
});

test("常量契约：DEFAULT_MARGIN = 1.1；UNSPECIFIED_SUPPLIER = 未指定供应商", () => {
  assert.equal(DEFAULT_MARGIN, 1.1);
  assert.equal(UNSPECIFIED_SUPPLIER, "未指定供应商");
});
