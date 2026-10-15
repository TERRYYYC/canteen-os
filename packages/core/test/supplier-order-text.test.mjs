/**
 * formatSupplierOrderText：团队采购单「复制给菜贩」的单个供应商消息（node:test，跑 dist/）。
 * zh、单一币种且没有「数量待定」行时，必须与 formatPurchaseOrderText（week-41 真人测试过的格式）逐字相同；
 * 待定行只写名称，不进合计；不同币种不相加；en/uk 用同一格式的本地化固定词。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  UNSPECIFIED_SUPPLIER,
  expand,
  formatPurchaseOrderText,
  formatSupplierOrderText,
  pickI18n,
  renderPurchaseOrders,
} from "../dist/procurement/engine.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../test/fixtures/contracts/valid/golden");
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const load = (sub) =>
  Object.fromEntries(
    readdirSync(path.join(ROOT, "data", sub))
      .filter((f) => f.endsWith(".json"))
      .map((f) => [f.replace(/\.json$/, ""), readJson(`data/${sub}/${f}`)]),
  );
const ingredients = load("ingredients");
const dishes = load("dishes");
const week41 = readJson("data/menu-plans/week-41.json");
const CTX = { generatedAt: "2026-10-03T00:00:00.000Z", menuPlanRef: "week-41" };
const pos = renderPurchaseOrders(expand(week41, dishes, ingredients).lines, week41, CTX);
const named = (lines, lang = "zh") =>
  lines.map((line) => ({ name: pickI18n(ingredients[line.ingredientRef].name, lang), line }));
const group = (po, lang = "zh", unquantified = []) => ({ supplier: po.supplier, lines: named(po.lines, lang), unquantified });
const FIELD_TEST = path.resolve(HERE, "../../../docs/field-test/week-41");

test("zh：只有估算行时与 formatPurchaseOrderText 和 week-41 真人测试稿逐字相同", () => {
  assert.equal(pos.length, 2);
  for (const po of pos) {
    const text = formatSupplierOrderText(group(po), { date: "2026-10-03" });
    assert.equal(text, formatPurchaseOrderText(po, { ingredients }));
    const slug = po.supplier === "绿源农产品配送" ? "lvyuan" : "hongda";
    assert.equal(`${text}\n`, readFileSync(path.join(FIELD_TEST, `purchase-order-${slug}.txt`), "utf8"));
  }
});

test("zh：未指定供应商、部分缺价、全部缺价的单头与合计句同 formatPurchaseOrderText", () => {
  const lvyuan = pos.find((p) => p.supplier === "绿源农产品配送");
  const blank = { ...structuredClone(ingredients), tomato: { ...structuredClone(ingredients.tomato) } };
  blank.tomato.purchase = { ...blank.tomato.purchase, supplier: " " };
  const [unspecified] = renderPurchaseOrders(expand(week41, dishes, blank).lines.filter((l) => l.ingredientRef === "tomato"), week41, CTX);
  assert.equal(unspecified.supplier, UNSPECIFIED_SUPPLIER);
  assert.equal(formatSupplierOrderText(group(unspecified), { date: "2026-10-03" }), formatPurchaseOrderText(unspecified, { ingredients }));
  const unpriced = ({ unitPrice: _u, amount: _a, ...line }) => line;
  // 鸡蛋缺上次价：已估价 = 小葱 48 + 番茄 541.50 = ¥589.50
  const partly = { ...lvyuan, lines: lvyuan.lines.map((l) => (l.ingredientRef === "egg" ? unpriced(l) : l)) };
  delete partly.totalAmount;
  assert.equal(formatSupplierOrderText(group(partly), { date: "2026-10-03" }), formatPurchaseOrderText(partly, { ingredients }));
  assert.match(formatSupplierOrderText(group(partly), { date: "2026-10-03" }), /共 3 样 · 已估价 ¥589\.50（1 样缺上次价）$/);
  const none = { ...lvyuan, lines: lvyuan.lines.map(unpriced) };
  delete none.totalAmount;
  assert.equal(formatSupplierOrderText(group(none), { date: "2026-10-03" }), formatPurchaseOrderText(none, { ingredients }));
});

test("数量待定：只写名称、不给数字，不进合计，合计句说明条数", () => {
  const lvyuan = pos.find((p) => p.supplier === "绿源农产品配送");
  const tomato = lvyuan.lines.filter((l) => l.ingredientRef === "tomato");
  const text = formatSupplierOrderText(
    { supplier: lvyuan.supplier, lines: named(tomato), unquantified: ["排骨"] },
    { date: "2026-10-19 – 2026-10-21" },
  );
  assert.equal(
    text,
    [
      "【采购单】2026-10-19 – 2026-10-21 · 绿源农产品配送",
      "────────────────",
      "番茄  19 包 × 5 kg（共 95 kg）",
      "排骨  数量待定",
      "────────────────",
      "共 2 样 · 预估 ¥541.50（按上次价） · 1 样数量待定，未计入预估",
    ].join("\n"),
  );
  const onlyPending = formatSupplierOrderText({ supplier: UNSPECIFIED_SUPPLIER, lines: [], unquantified: ["排骨", "小米辣"] }, { date: "2026-10-19" });
  assert.equal(
    onlyPending,
    [
      "【采购单】2026-10-19 · ⚠️ 未指定供应商（请先指派再下单）",
      "────────────────",
      "排骨  数量待定",
      "小米辣  数量待定",
      "────────────────",
      "共 2 样 · 2 样数量待定",
      "⚠️ 未指定供应商：请指派供应商后再下单",
    ].join("\n"),
  );
  assert.doesNotMatch(onlyPending, /¥|预估|无上次价/);
});

test("en/uk：同一格式的本地化固定词；数字与 formatPurchaseOrderText 相同", () => {
  const lvyuan = pos.find((p) => p.supplier === "绿源农产品配送");
  const en = formatSupplierOrderText(group(lvyuan, "en", ["Pork ribs"]), { date: "2026-10-05", lang: "en" });
  assert.equal(
    en,
    [
      "【Purchase order】2026-10-05 · 绿源农产品配送",
      "────────────────",
      "Chicken egg  5 packs × 180 pcs (total 900 pcs)",
      "Scallion  4 packs × 1 kg (total 4 kg)",
      "Tomato  19 packs × 5 kg (total 95 kg)",
      "Pork ribs  quantity to confirm",
      "────────────────",
      "4 items · estimated ¥1339.50 (at last price) · 1 with quantity to confirm, not in the estimate",
    ].join("\n"),
  );
  const uk = formatSupplierOrderText({ supplier: UNSPECIFIED_SUPPLIER, lines: named(lvyuan.lines.slice(0, 1), "uk"), unquantified: [] }, { date: "2026-10-05", lang: "uk" });
  assert.equal(
    uk,
    [
      "【Замовлення】2026-10-05 · ⚠️ Постачальника не вказано (призначте перед замовленням)",
      "────────────────",
      "Яйця курячі  5 уп. × 180 шт (разом 900 шт)",
      "────────────────",
      "Позицій: 1 · орієнтовно ¥750.00 (за останньою ціною)",
      "⚠️ Постачальника не вказано: призначте постачальника перед замовленням",
    ].join("\n"),
  );
  const one = formatSupplierOrderText({ supplier: "X", lines: named(lvyuan.lines.slice(0, 1), "en").map((r) => ({ ...r, line: { ...r.line, packs: 1 } })), unquantified: [] }, { date: "2026-10-05", lang: "en" });
  assert.match(one, /^Chicken egg {2}1 pack × 180 pcs/m);
  assert.match(one, /^1 item · /m);
});

test("不同币种不相加：按币种分列小计并注明不合计，缺价另计（zh/en/uk）", () => {
  const lvyuan = pos.find((p) => p.supplier === "绿源农产品配送");
  const unpriced = ({ unitPrice: _u, amount: _a, ...line }) => line;
  const priced = (currency) => (line) => ({ ...line, unitPrice: { ...line.unitPrice, currency }, amount: { ...line.amount, currency } });
  const vary = (changes) => lvyuan.lines.map((line) => changes[line.ingredientRef]?.(line) ?? line);
  const footer = (lines, lang = "zh") =>
    formatSupplierOrderText({ supplier: lvyuan.supplier, lines: named(lines, lang), unquantified: [] }, { date: "2026-10-05", lang }).split("\n").at(-1);
  // 单一币种保持原输出
  assert.equal(footer(lvyuan.lines), "共 3 样 · 预估 ¥1339.50（按上次价）");
  // 两种币种：鸡蛋 ¥750 + 小葱 ¥48 = ¥798.00；番茄 ₴541.50 单列，不换算
  const two = vary({ tomato: priced("UAH") });
  assert.equal(footer(two), "共 3 样 · 预估 ¥798.00、₴541.50（按上次价；币种不同不合计）");
  assert.equal(footer(two, "en"), "3 items · estimated ¥798.00, ₴541.50 (at last price; currencies differ, not added)");
  assert.equal(footer(two, "uk"), "Позицій: 3 · орієнтовно ¥798.00, ₴541.50 (за останньою ціною; різні валюти, не додано)");
  // 三种币种
  const three = vary({ scallion: priced("USD"), tomato: priced("UAH") });
  assert.equal(footer(three), "共 3 样 · 预估 ¥750.00、$48.00、₴541.50（按上次价；币种不同不合计）");
  assert.equal(footer(three, "en"), "3 items · estimated ¥750.00, $48.00, ₴541.50 (at last price; currencies differ, not added)");
  // 混币且缺价：鸡蛋无上次价，小葱 ¥48.00，番茄 ₴541.50
  const missing = vary({ egg: unpriced, tomato: priced("UAH") });
  assert.equal(footer(missing), "共 3 样 · 已估价 ¥48.00、₴541.50（币种不同不合计；1 样缺上次价）");
  assert.equal(footer(missing, "en"), "3 items · priced ¥48.00, ₴541.50 (currencies differ, not added; 1 without last price)");
  assert.equal(footer(missing, "uk"), "Позицій: 3 · оцінено ¥48.00, ₴541.50 (різні валюти, не додано; без останньої ціни: 1)");
  for (const lines of [two, three, missing]) assert.doesNotMatch(footer(lines), /1339\.50|589\.50/);
});
