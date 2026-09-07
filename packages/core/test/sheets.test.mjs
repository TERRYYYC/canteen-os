/**
 * 三张单结构化渲染器（sheets.ts / render/prep.ts / render/menu.ts）+ 备料单分组文本 +
 * readiness 别名键 + uk/en 标点锁（issue #5，v0.1）。node:test，跑编译产物 dist/。
 *
 * 黄金数字（手算，按当前 data/，非 issue 里的旧数据）：
 *   番茄炒蛋 baseServings 50，每份：
 *     番茄   7500 g / 50 = 150 g
 *     鸡蛋   75 pcs / 50 = 1.5 pcs × pcsToGram 55 = 82.5 g
 *     食盐   75 g / 50   = 1.5 g（调料计入克重、不进成分句）
 *     小葱   250 g / 50  = 5 g
 *     食用油 500 ml / 50 = 10 ml ≈ 10 g（ml 按 1:1）
 *   合计 150 + 82.5 + 1.5 + 5 + 10 = 249 → approxGrams = 249（四舍五入到整数）
 *   （issue 正文的 "≈ 243" 按旧数据 盐 37.5 g / 油 220 ml 算，已过时）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  DEFAULT_PREP_TIMING,
  PREP_GROUP_ORDER,
  approxGramsOf,
  buildMenuSheet,
  buildPrepSheet,
  prepGroupOf,
  readiness,
  renderMenu,
  renderPrepList,
} from "../dist/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const loadDir = (sub) =>
  Object.fromEntries(
    readdirSync(path.join(ROOT, "data", sub))
      .filter((f) => f.endsWith(".json"))
      .map((f) => [f.replace(/\.json$/, ""), readJson(`data/${sub}/${f}`)]),
  );
const ingredients = loadDir("ingredients");
const dishes = loadDir("dishes");
const techniques = readJson("data/techniques.json");
const week41 = readJson("data/menu-plans/week-41.json");

const plan1 = (dishRef, extra = {}) => ({
  schemaVersion: "2",
  meals: [{ date: "2026-10-05", mealType: "lunch", dishRef, plannedServings: 10, ...extra }],
});

// 全角标点锁：整体不得含 ，（）：；标题行以外不得含 【】（标题 【…】 是既有测试锁定的格式）
const assertAsciiPunct = (text, label) => {
  assert.doesNotMatch(text, /[，（）：]/, `${label} 含全角标点`);
  const body = text.split("\n").slice(1).join("\n");
  assert.doesNotMatch(body, /[【】]/, `${label} 正文含【】`);
};

test("buildMenuSheet：番茄炒蛋 approxGrams = 249（手算），成分句去调料按配料序，allergens []，serviceWindow 透传", () => {
  const menu = buildMenuSheet(week41, dishes, ingredients);
  assert.equal(menu.issues.length, 0, JSON.stringify(menu.issues));
  assert.deepEqual(menu.name, week41.name);
  assert.deepEqual(menu.dateRange, week41.dateRange);
  assert.deepEqual(
    menu.days.map((d) => d.date),
    ["2026-10-05", "2026-10-07", "2026-10-09"],
  );
  const lunch = menu.days[0].meals[0];
  assert.equal(lunch.mealType, "lunch");
  assert.equal(lunch.serviceWindow, "12:00-14:00");
  assert.equal(menu.days[2].meals[0].mealType, "dinner");
  assert.equal(menu.days[2].meals[0].serviceWindow, "18:00-20:00");
  assert.equal(lunch.dishes.length, 1);
  const d = lunch.dishes[0];
  assert.equal(d.id, "tomato-egg-stir-fry");
  assert.deepEqual(d.name, dishes["tomato-egg-stir-fry"].name);
  assert.deepEqual(d.description, dishes["tomato-egg-stir-fry"].description);
  // 手算：150 + 82.5 + 1.5 + 5 + 10 = 249
  assert.equal(d.approxGrams, 249);
  assert.equal(d.approxGramsIncomplete, undefined); // 全部可折算，无缺口标记
  // 成分：按配料顺序 tomato → egg → (salt 跳过) → scallion → (cooking-oil 跳过)
  assert.deepEqual(
    d.composition.map((c) => c.ingredientRef),
    ["tomato", "egg", "scallion"],
  );
  assert.deepEqual(d.composition[0].name, { zh: "番茄", en: "Tomato", uk: "Помідор" });
  assert.deepEqual(d.allergens, []); // 第一轮 ingredient 无 allergens 字段 → 恒空
  assert.equal(d.issue, undefined);
});

test("buildMenuSheet：克重规则 g/kg/ml/l/pcs×pcsToGram、to-taste 跳过；无 pcsToGram 或 tbsp → approxGramsIncomplete；缺 baseServings → null", () => {
  // 手算（baseServings 10）：番茄 1 kg = 1000 g；油 0.5 l = 500 ml ≈ 500 g；鸡蛋 10 pcs × 55 = 550 g；
  //   盐 to-taste 跳过；合计 2050 g ÷ 10 = 205
  const ds = {
    ok: {
      name: { zh: "折算菜" },
      status: "active",
      baseServings: 10,
      components: [
        { ingredientRef: "tomato", qty: { value: 1, unit: "kg" } },
        { ingredientRef: "cooking-oil", qty: { value: 0.5, unit: "l" } },
        { ingredientRef: "egg", qty: { value: 10, unit: "pcs" } },
        { ingredientRef: "salt", qty: { unit: "to-taste" } },
      ],
    },
    // 盐按 pcs 计但 salt 无 pcsToGram → 跳过并标不完整；tbsp 无折算路径同理
    partial: {
      name: { zh: "缺口菜" },
      status: "active",
      baseServings: 10,
      components: [
        { ingredientRef: "tomato", qty: { value: 1000, unit: "g" } },
        { ingredientRef: "salt", qty: { value: 2, unit: "pcs" } },
        { ingredientRef: "sugar", qty: { value: 1, unit: "tbsp" } },
      ],
    },
    // 四舍五入：1000 g ÷ 3 = 333.33 → 333；2000 ÷ 3 = 666.67 → 667
    round3: {
      name: { zh: "三份菜" },
      status: "active",
      baseServings: 3,
      components: [{ ingredientRef: "tomato", qty: { value: 2000, unit: "g" } }],
    },
    noBase: {
      name: { zh: "无基准份数" },
      status: "active",
      components: [{ ingredientRef: "tomato", qty: { value: 100, unit: "g" } }],
    },
  };
  const plan = {
    schemaVersion: "2",
    meals: ["ok", "partial", "round3", "noBase"].map((dishRef) => ({
      date: "2026-10-05",
      mealType: "lunch",
      dishRef,
      plannedServings: 10,
    })),
  };
  const menu = buildMenuSheet(plan, ds, ingredients);
  const byId = Object.fromEntries(menu.days[0].meals[0].dishes.map((d) => [d.id, d]));
  assert.equal(byId.ok.approxGrams, 205);
  assert.equal(byId.ok.approxGramsIncomplete, undefined);
  assert.deepEqual(
    byId.ok.composition.map((c) => c.ingredientRef),
    ["tomato", "egg"],
  ); // 油 role=seasoning、盐 to-taste 均不进成分句
  assert.equal(byId.partial.approxGrams, 100); // 只剩番茄 1000 ÷ 10
  assert.equal(byId.partial.approxGramsIncomplete, true);
  assert.equal(byId.round3.approxGrams, 667);
  assert.equal(byId.noBase.approxGrams, null);
  assert.ok(menu.issues.some((i) => i.code === "dish-incomplete" && i.dishRef === "noBase"));
  // 单位折算函数直接断言
  assert.equal(approxGramsOf({ value: 2, unit: "kg" }), 2000);
  assert.equal(approxGramsOf({ value: 250, unit: "ml" }), 250);
  assert.equal(approxGramsOf({ value: 3, unit: "pcs" }, ingredients.egg), 165);
  assert.equal(approxGramsOf({ value: 3, unit: "pcs" }, ingredients.salt), null);
  assert.equal(approxGramsOf({ unit: "to-taste" }), 0);
  assert.equal(approxGramsOf({ value: 1, unit: "pinch" }), null);
});

test("buildMenuSheet：同日期同餐次多道菜合并为一个 meal；菜品缺失/未激活带 issue 不静默", () => {
  const ds = {
    a: { name: { zh: "甲" }, status: "active", baseServings: 10, components: [{ ingredientRef: "tomato", qty: { value: 100, unit: "g" } }] },
    b: { name: { zh: "乙" }, status: "draft", baseServings: 10, components: [{ ingredientRef: "egg", qty: { value: 1, unit: "pcs" } }] },
  };
  const plan = {
    schemaVersion: "2",
    meals: [
      { date: "2026-10-06", mealType: "dinner", dishRef: "a", plannedServings: 10, serviceWindow: "18:00-20:00" },
      { date: "2026-10-05", mealType: "lunch", dishRef: "a", plannedServings: 10 },
      { date: "2026-10-05", mealType: "lunch", dishRef: "b", plannedServings: 10, serviceWindow: "12:00-14:00" },
      { date: "2026-10-05", mealType: "lunch", dishRef: "ghost", plannedServings: 10 },
    ],
  };
  const menu = buildMenuSheet(plan, ds, ingredients);
  assert.deepEqual(menu.days.map((d) => d.date), ["2026-10-05", "2026-10-06"]); // 按日期排序
  const lunch = menu.days[0].meals[0];
  assert.equal(menu.days[0].meals.length, 1); // 三条 meal 合并为一个午餐
  assert.deepEqual(lunch.dishes.map((d) => d.id), ["a", "b", "ghost"]); // 保持计划内顺序
  assert.equal(lunch.serviceWindow, "12:00-14:00"); // 取首个非空
  assert.equal(lunch.dishes[1].issue.code, "dish-not-active");
  assert.equal(lunch.dishes[1].approxGrams, 6); // 55 ÷ 10 = 5.5 → 6，未激活仍算
  assert.equal(lunch.dishes[2].issue.code, "missing-dish");
  assert.deepEqual(lunch.dishes[2].name, { zh: "ghost", en: "ghost", uk: "ghost" });
  assert.deepEqual(lunch.dishes[2].composition, []);
  assert.equal(lunch.dishes[2].approxGrams, null);
  assert.deepEqual(menu.issues.map((i) => i.code), ["dish-not-active", "missing-dish"]);
});

test("buildPrepSheet：week-41 结构（3 天各 1 餐）、qty 按份数缩放、steps 编号与技法名、isSeasoning/group", () => {
  const prep = buildPrepSheet(week41, dishes, techniques, ingredients);
  assert.equal(prep.issues.length, 0, JSON.stringify(prep.issues));
  assert.deepEqual(prep.days.map((d) => d.date), ["2026-10-05", "2026-10-07", "2026-10-09"]);
  assert.deepEqual(prep.days.map((d) => d.meals.length), [1, 1, 1]);
  const m = prep.days[0].meals[0];
  assert.equal(m.mealType, "lunch");
  assert.equal(m.dishRef, "tomato-egg-stir-fry");
  assert.equal(m.servings, 200);
  assert.deepEqual(m.dish.name, dishes["tomato-egg-stir-fry"].name);
  assert.equal(m.issue, undefined);
  // 缩放 200/50 = 4：番茄 7500 g → 30000 g；鸡蛋 75 → 300 pcs；盐 75 → 300 g；小葱 250 → 1000 g；油 500 → 2000 ml
  assert.deepEqual(
    m.components.map((c) => [c.ingredientRef, c.qty.value, c.qty.unit]),
    [
      ["tomato", 30000, "g"],
      ["egg", 300, "pcs"],
      ["salt", 300, "g"],
      ["scallion", 1000, "g"],
      ["cooking-oil", 2000, "ml"],
    ],
  );
  assert.deepEqual(
    m.components.map((c) => [c.isSeasoning, c.group]),
    [
      [false, "morning"],
      [false, "morning"], // 鸡蛋无 prep → 缺省归早上
      [true, "at-hand"],
      [false, "morning"],
      [true, "at-hand"],
    ],
  );
  const tomato = m.components[0];
  assert.equal(tomato.prep.techniqueRef, "roll-cut-chunks");
  assert.deepEqual(tomato.prep.technique.name, { zh: "滚刀块", en: "Roll-cut chunks", uk: "Шматки рулонним нарізанням" });
  assert.equal(tomato.prep.size, "3–4 cm");
  assert.equal(tomato.prep.timing, "morning");
  assert.deepEqual(tomato.prep.note, dishes["tomato-egg-stir-fry"].components[0].prep.note);
  assert.equal(m.components[1].prep, undefined); // 鸡蛋无 prep：不编造
  // 晚餐 120 份 scale 2.4：番茄 18000 g
  assert.equal(prep.days[2].meals[0].components[0].qty.value, 18000);
  // steps：1-based 编号、text 三语、techniqueRef + 词表名、clip 透传
  assert.deepEqual(m.steps.map((s) => s.n), [1, 2, 3]);
  assert.equal(m.steps[0].techniqueRef, "roll-cut-chunks");
  assert.deepEqual(m.steps[1].technique.name, { zh: "炒", en: "Stir-frying", uk: "Смаження з постійним помішуванням" });
  assert.deepEqual(m.steps[0].clip, dishes["tomato-egg-stir-fry"].steps[0].clip);
  assert.deepEqual(m.steps[2].text, dishes["tomato-egg-stir-fry"].steps[2].text);
});

test("buildPrepSheet：prep.timing 缺省 morning；day-before/before-service 透传；调料有 timing 仍归 at-hand；to-taste 视为调料", () => {
  assert.equal(DEFAULT_PREP_TIMING, "morning");
  assert.deepEqual(PREP_GROUP_ORDER, ["day-before", "morning", "before-service", "at-hand"]);
  assert.equal(prepGroupOf(false, undefined), "morning");
  assert.equal(prepGroupOf(false, "day-before"), "day-before");
  assert.equal(prepGroupOf(true, "day-before"), "at-hand");
  const ds = {
    d1: {
      name: { zh: "分组菜" },
      status: "active",
      baseServings: 10,
      components: [
        { ingredientRef: "tomato", qty: { value: 1000, unit: "g" }, prep: { techniqueRef: "chunks", timing: "day-before" } },
        { ingredientRef: "scallion", qty: { value: 100, unit: "g" }, prep: { techniqueRef: "minced" } }, // 无 timing
        { ingredientRef: "egg", qty: { value: 10, unit: "pcs" }, prep: { techniqueRef: "blanch", timing: "before-service" } },
        { ingredientRef: "salt", qty: { value: 20, unit: "g" }, prep: { techniqueRef: "marinate", timing: "day-before" } }, // 调料带 timing
        { ingredientRef: "ketchup", qty: { unit: "to-taste" } },
        { ingredientRef: "tomato", qty: { unit: "to-taste" } }, // 主料 to-taste → 也算调料（备在手边）
      ],
      steps: [{ text: { zh: "x" } }],
    },
  };
  const prep = buildPrepSheet(plan1("d1"), ds, techniques, ingredients);
  const comps = prep.days[0].meals[0].components;
  assert.deepEqual(
    comps.map((c) => [c.ingredientRef, c.prep?.timing ?? null, c.isSeasoning, c.group]),
    [
      ["tomato", "day-before", false, "day-before"],
      ["scallion", "morning", false, "morning"], // 缺省填 morning
      ["egg", "before-service", false, "before-service"],
      ["salt", "day-before", true, "at-hand"], // 调料无视 timing
      ["ketchup", null, true, "at-hand"],
      ["tomato", null, true, "at-hand"],
    ],
  );
  assert.deepEqual(comps[4].qty, { unit: "to-taste" }); // to-taste 不缩放、无 value
  assert.equal(prep.issues.length, 0);
});

test("buildPrepSheet：missing-dish / dish-not-active / dish-incomplete 逐餐次带 issue；missing-ingredient / missing-technique 按菜去重", () => {
  const ds = {
    draft: { name: { zh: "草稿" }, status: "draft", baseServings: 10, components: [{ ingredientRef: "tomato", qty: { value: 1, unit: "g" } }] },
    nobom: { name: { zh: "无配料" }, status: "active", baseServings: 10 },
    bad: {
      name: { zh: "坏引用" },
      status: "active",
      baseServings: 10,
      components: [
        { ingredientRef: "ghost-ing", qty: { value: 10, unit: "g" }, prep: { techniqueRef: "ghost-cut" } },
        { ingredientRef: "tomato", qty: { value: 10, unit: "g" } },
      ],
      steps: [{ text: { zh: "x" }, techniqueRef: "ghost-heat" }],
    },
  };
  const plan = {
    schemaVersion: "2",
    meals: [
      { date: "2026-10-05", mealType: "lunch", dishRef: "ghost", plannedServings: 10 },
      { date: "2026-10-05", mealType: "dinner", dishRef: "draft", plannedServings: 10 },
      { date: "2026-10-06", mealType: "lunch", dishRef: "nobom", plannedServings: 10 },
      { date: "2026-10-06", mealType: "dinner", dishRef: "bad", plannedServings: 10 },
      { date: "2026-10-07", mealType: "lunch", dishRef: "bad", plannedServings: 20 }, // 同菜第二次：食材/技法问题不重复
    ],
  };
  const prep = buildPrepSheet(plan, ds, techniques, ingredients);
  const meals = prep.days.flatMap((d) => d.meals);
  assert.deepEqual(
    meals.map((m) => [m.dishRef, m.issue?.code ?? null, m.components.length]),
    [
      ["ghost", "missing-dish", 0],
      ["draft", "dish-not-active", 0],
      ["nobom", "dish-incomplete", 0],
      ["bad", null, 2],
      ["bad", null, 2],
    ],
  );
  assert.deepEqual(meals[0].dish.name, { zh: "ghost", en: "ghost", uk: "ghost" }); // 名字回退为 id
  const badMeal = meals[3];
  assert.deepEqual(badMeal.components[0].name, { zh: "ghost-ing", en: "ghost-ing", uk: "ghost-ing" });
  assert.equal(badMeal.components[0].prep.techniqueMissing, true);
  assert.deepEqual(badMeal.components[0].prep.technique.name, {});
  assert.equal(badMeal.steps[0].technique, undefined);
  assert.deepEqual(
    prep.issues.map((i) => [i.code, i.dishRef, i.ingredientRef ?? null, i.techniqueRef ?? null]),
    [
      ["missing-dish", "ghost", null, null],
      ["dish-not-active", "draft", null, null],
      ["dish-incomplete", "nobom", null, null],
      ["missing-ingredient", "bad", "ghost-ing", null],
      ["missing-technique", "bad", "ghost-ing", "ghost-cut"],
      ["missing-technique", "bad", null, "ghost-heat"],
    ],
  );
});

test("renderPrepList：餐次内按 timing 分组（前一天 → 早上 → 开餐前 → 备在手边），调料归备在手边且无切配提示，三语组标题", () => {
  const ds = {
    d1: {
      name: { zh: "分组菜", en: "Grouped dish", uk: "Страва" },
      status: "active",
      baseServings: 10,
      components: [
        { ingredientRef: "egg", qty: { value: 10, unit: "pcs" } }, // 无 prep → 早上 + 提示
        { ingredientRef: "salt", qty: { value: 20, unit: "g" } }, // 调料 → 备在手边，无提示
        { ingredientRef: "tomato", qty: { value: 1000, unit: "g" }, prep: { techniqueRef: "chunks", timing: "day-before" } },
        { ingredientRef: "scallion", qty: { value: 100, unit: "g" }, prep: { techniqueRef: "minced", timing: "before-service" } },
        { ingredientRef: "cooking-oil", qty: { unit: "to-taste" } },
      ],
      steps: [{ text: { zh: "x" } }],
    },
  };
  const uk = renderPrepList(plan1("d1"), ds, techniques, "uk", ingredients);
  const ukLines = uk.split("\n");
  // 组标题顺序与内容（配料原顺序被分组重排：番茄先于鸡蛋）
  assert.deepEqual(
    ukLines.filter((l) => l.startsWith("  ▸ ")),
    ["  ▸ Напередодні", "  ▸ Вранці", "  ▸ Перед подачею", "  ▸ Приправи — під рукою"],
  );
  const idx = (re) => ukLines.findIndex((l) => re.test(l));
  assert.ok(idx(/▸ Напередодні/) < idx(/· Помідор — 1 кг — Шматки/));
  assert.ok(idx(/· Помідор/) < idx(/▸ Вранці/));
  assert.ok(idx(/▸ Вранці/) < idx(/· Яйця курячі — 10 шт \(без специфікації нарізки\)/));
  assert.ok(idx(/▸ Перед подачею/) < idx(/· Зелена цибуля — 100 г — Дрібно рублене/));
  assert.ok(idx(/▸ Приправи — під рукою/) < idx(/· Сіль — 20 г$/));
  assert.match(uk, /· Олія рослинна — за смаком$/m); // to-taste 归备在手边
  assert.equal((uk.match(/без специфікації нарізки/g) ?? []).length, 1); // 只有鸡蛋（主料）提示
  // zh / en 组标题
  const zh = renderPrepList(plan1("d1"), ds, techniques, "zh", ingredients);
  assert.deepEqual(
    zh.split("\n").filter((l) => l.startsWith("  ▸ ")),
    ["  ▸ 前一天", "  ▸ 早上", "  ▸ 开餐前", "  ▸ 调料 · 备在手边"],
  );
  const en = renderPrepList(plan1("d1"), ds, techniques, "en", ingredients);
  assert.deepEqual(
    en.split("\n").filter((l) => l.startsWith("  ▸ ")),
    ["  ▸ Day before", "  ▸ Morning", "  ▸ Before service", "  ▸ Seasonings — at hand"],
  );
  // week-41：无 timing 的鸡蛋与带 morning 的番茄/小葱同组，盐/油在备在手边；每餐次恰好两组
  const w = renderPrepList(week41, dishes, techniques, "zh", ingredients);
  assert.deepEqual(
    w.split("\n").filter((l) => l.startsWith("  ▸ ")),
    Array(3).fill(["  ▸ 早上", "  ▸ 调料 · 备在手边"]).flat(),
  );
  assert.match(w, /—— 2026-10-05 ——\n午餐：番茄炒蛋 ×200 份\n {2}▸ 早上\n {2}· 番茄 — 30 kg — 滚刀块，3–4 cm（去皮口感更好）/);
});

test("标点锁：en/uk 的 renderPrepList / renderMenu 输出不含全角标点 ，（）：（标题行外亦无【】）", () => {
  for (const lang of ["en", "uk"]) {
    assertAsciiPunct(renderPrepList(week41, dishes, techniques, lang, ingredients), `renderPrepList ${lang}`);
    assertAsciiPunct(renderMenu(week41, dishes, lang), `renderMenu ${lang}`);
    assertAsciiPunct(renderMenu(week41, dishes, lang, ingredients), `renderMenu+ingredients ${lang}`);
    // 词表缺失 / 菜品缺失 / 未激活 等 ⚠ 分支也走 ASCII 括号
    const ds = {
      draft: { name: { zh: "草稿" }, status: "draft" },
      bad: {
        name: { zh: "坏" },
        status: "active",
        baseServings: 10,
        components: [{ ingredientRef: "tomato", qty: { value: 1, unit: "g" }, prep: { techniqueRef: "ghost-cut" } }],
      },
    };
    const plan = {
      schemaVersion: "2",
      meals: [
        { date: "2026-10-05", mealType: "lunch", dishRef: "ghost", plannedServings: 10 },
        { date: "2026-10-05", mealType: "dinner", dishRef: "draft", plannedServings: 10 },
        { date: "2026-10-06", mealType: "lunch", dishRef: "bad", plannedServings: 10 },
      ],
    };
    assertAsciiPunct(renderPrepList(plan, ds, techniques, lang, ingredients), `renderPrepList ⚠ ${lang}`);
    assertAsciiPunct(renderMenu(plan, ds, lang, ingredients), `renderMenu ⚠ ${lang}`);
  }
  // zh 保持全角（对照，不是回归）
  assert.match(renderPrepList(week41, dishes, techniques, "zh", ingredients), /午餐：番茄炒蛋/);
});

test("renderMenu：传 ingredients 追加成分句（去调料）+ 每份 ≈ 克重；不传时输出逐字不变", () => {
  const zh = renderMenu(week41, dishes, "zh", ingredients);
  assert.match(zh, /2026-10-05\n {2}午餐：番茄炒蛋\n {4}成分：番茄、鸡蛋、小葱 · ≈ 249 g/);
  const uk = renderMenu(week41, dishes, "uk", ingredients);
  assert.match(uk, /Обід: Смажені яйця з томатами\n {4}Склад: Помідор, Яйця курячі, Зелена цибуля · ≈ 249 г/);
  const en = renderMenu(week41, dishes, "en", ingredients);
  assert.match(en, /Lunch: Tomato and egg stir-fry\n {4}Ingredients: Tomato, Chicken egg, Scallion · ≈ 249 g/);
  // 不传 ingredients：与去掉成分行后的输出逐字相同（旧行为不变）
  const plain = renderMenu(week41, dishes, "zh");
  assert.doesNotMatch(plain, /成分|≈/);
  assert.equal(plain, zh.split("\n").filter((l) => !l.startsWith("    ")).join("\n"));
  // 克重不完整（pcs 无 pcsToGram）时不显示数字，只给成分
  const ds = {
    p: { name: { zh: "缺口菜" }, status: "active", baseServings: 10, components: [
      { ingredientRef: "tomato", qty: { value: 100, unit: "g" } },
      { ingredientRef: "salt", qty: { value: 1, unit: "pcs" } },
    ] },
  };
  const t = renderMenu(plan1("p"), ds, "zh", ingredients);
  assert.match(t, /午餐：缺口菜\n {4}成分：番茄$/m);
  assert.doesNotMatch(t, /≈/);
});

test("readiness：canTeach/canPlan/canProcure 与 teach/plan/buy 同值；missingKeys 机器键与 missing 同序", () => {
  const r = readiness(dishes["tomato-egg-stir-fry"], ingredients);
  assert.deepEqual([r.canTeach, r.canPlan, r.canProcure], [r.teach, r.plan, r.buy]);
  assert.deepEqual([r.canTeach, r.canPlan, r.canProcure], [false, true, true]);
  assert.deepEqual(r.missingKeys, ["prep:egg", "prep:salt", "prep:cooking-oil"]);
  assert.equal(r.missingKeys.length, r.missing.length);
  // 只有名字：components / steps / baseServings
  const empty = readiness({ name: { zh: "只有名字" } }, ingredients);
  assert.deepEqual(empty.missingKeys, ["components", "steps", "baseServings"]);
  assert.deepEqual([empty.canTeach, empty.canPlan, empty.canProcure], [false, false, false]);
  // qty 缺 / 食材不存在 / 缺采购规格
  const partial = readiness(
    {
      name: { zh: "半成品" },
      baseServings: 10,
      components: [
        { ingredientRef: "ghost-ing", qty: { unit: "g" }, prep: { techniqueRef: "chunks" } },
        { ingredientRef: "sugar", qty: { value: 5, unit: "g" }, prep: { techniqueRef: "chunks" } },
      ],
      steps: [{ text: { zh: "x" } }],
    },
    ingredients,
  );
  assert.deepEqual(partial.missingKeys, ["qty:ghost-ing", "ingredient:ghost-ing", "purchase:sugar"]);
  assert.deepEqual([partial.canTeach, partial.canPlan, partial.canProcure], [true, false, false]);
  // 完整菜：全过、无待办
  const full = readiness(
    {
      name: { zh: "完整菜" },
      baseServings: 10,
      components: [{ ingredientRef: "tomato", qty: { value: 100, unit: "g" }, prep: { techniqueRef: "chunks" } }],
      steps: [{ text: { zh: "炒。" } }],
    },
    ingredients,
  );
  assert.deepEqual([full.canTeach, full.canPlan, full.canProcure, full.missingKeys], [true, true, true, []]);
});

test("确定性与 JSON 往返：两次 build deepEqual；序列化后无 undefined 键泄漏", () => {
  const prepA = buildPrepSheet(week41, dishes, techniques, ingredients);
  const prepB = buildPrepSheet(week41, dishes, techniques, ingredients);
  assert.deepEqual(prepA, prepB);
  assert.deepEqual(JSON.parse(JSON.stringify(prepA)), prepA);
  const menuA = buildMenuSheet(week41, dishes, ingredients);
  assert.deepEqual(menuA, buildMenuSheet(week41, dishes, ingredients));
  assert.deepEqual(JSON.parse(JSON.stringify(menuA)), menuA);
  // 输入不被修改
  assert.deepEqual(week41, readJson("data/menu-plans/week-41.json"));
  assert.deepEqual(dishes["tomato-egg-stir-fry"], readJson("data/dishes/tomato-egg-stir-fry.json"));
});
