/**
 * 菜单文本宽松解析器（src/import/parse-plan-text.ts；issue #22，前端契约 §4.3 / D-07）。node:test，跑编译产物 dist/。
 *
 * 覆盖 §4.3 DoD：星期 / 日期两种写法、三种餐次、中文数字（「五十份」「50份」「50」）、混排、多余空格、全角标点、
 * 认不出的行返回结构化的 unparsed（带人话 reason）而不是抛错；外加 D-06 的周号换算。
 *
 * 固定 weekStart = 2026-10-05（ISO 第 41 周周一，与 data/menu-plans/week-41.json 一致）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  editDistance,
  isoWeekOf,
  matchDishName,
  mondayOfIsoWeek,
  parseChineseNumber,
  parsePlanText,
  planIdOfDate,
  weekStartOfPlanId,
} from "../dist/index.js";

const WEEK_START = "2026-10-05";

const dishes = [
  { id: "tomato-egg-stir-fry", name: { zh: "番茄炒蛋", en: "Tomato & egg stir-fry", uk: "Смажені томати з яйцем" }, status: "active" },
  { id: "braised-beef-potato", name: { zh: "土豆烧牛肉", en: "Braised beef with potato" }, status: "active" },
  { id: "scallion-egg-pancake", name: { zh: "葱花蛋饼" }, status: "draft" },
  { id: "old-dish", name: { zh: "老菜" }, status: "archived" },
  { id: "rice", name: { zh: "米饭", en: "Rice" } },
  { id: "fried-rice", name: { zh: "炒饭" } },
];

const parse = (text, extra = {}) => parsePlanText({ text, dishes, weekStart: WEEK_START, ...extra }).lines;
const one = (text, extra) => {
  const lines = parse(text, extra);
  assert.equal(lines.length, 1, `期望 1 条结果，得到 ${lines.length}：${JSON.stringify(lines)}`);
  return lines[0];
};
const pickCore = (l) => ({ status: l.status, date: l.date, mealType: l.mealType, dishRef: l.dishRef, plannedServings: l.plannedServings });

// ---------------------------------------------------------------------------
// 日期：星期与日期两种写法
// ---------------------------------------------------------------------------

test("星期：周一 / 星期二 / 礼拜三 / 週四 / 周5 / Mon / Friday / пн 都落到 weekStart 起的具体日期", () => {
  const cases = [
    ["周一午 番茄炒蛋 200", "2026-10-05"],
    ["星期二午 番茄炒蛋 200", "2026-10-06"],
    ["礼拜三午 番茄炒蛋 200", "2026-10-07"],
    ["週四午 番茄炒蛋 200", "2026-10-08"],
    ["周5 午 番茄炒蛋 200", "2026-10-09"],
    ["周六午 番茄炒蛋 200", "2026-10-10"],
    ["周日午 番茄炒蛋 200", "2026-10-11"],
    ["周天午 番茄炒蛋 200", "2026-10-11"],
    ["Mon lunch 番茄炒蛋 200", "2026-10-05"],
    ["Friday lunch 番茄炒蛋 200", "2026-10-09"],
    ["пн обід 番茄炒蛋 200", "2026-10-05"],
  ];
  for (const [text, date] of cases) {
    const l = one(text);
    assert.equal(l.status, "ok", `${text} → ${JSON.stringify(l)}`);
    assert.equal(l.date, date, text);
  }
});

test("日期：10.05 / 10/05 / 10月5日 / 2026-10-05 / 2026年10月5日 都认；月.日用 weekStart 的年", () => {
  for (const text of ["10.05 午 番茄炒蛋 200", "10/05 午 番茄炒蛋 200", "10月5日 午 番茄炒蛋 200", "10月5号 午 番茄炒蛋 200", "2026-10-05 午 番茄炒蛋 200", "2026年10月5日 午 番茄炒蛋 200", "2026.10.05 午 番茄炒蛋 200"]) {
    const l = one(text);
    assert.equal(l.status, "ok", `${text} → ${JSON.stringify(l)}`);
    assert.equal(l.date, "2026-10-05", text);
  }
});

test("月.日跨年：weekStart 在 12 月底时「1.4」落到下一年", () => {
  const l = one("1.4 午 番茄炒蛋 200", { weekStart: "2026-12-28" });
  assert.equal(l.date, "2027-01-04");
  assert.equal(l.status, "next-week");
});

// ---------------------------------------------------------------------------
// 餐次
// ---------------------------------------------------------------------------

test("餐次：早 / 早餐 / breakfast / сніданок → breakfast；午 / 中 / 午餐 / 中餐 / lunch / обід → lunch；晚 / 晚餐 / dinner / supper / вечеря → dinner", () => {
  const cases = [
    ["周一早 番茄炒蛋 50", "breakfast"],
    ["周一 早餐 番茄炒蛋 50", "breakfast"],
    ["周一 早饭 番茄炒蛋 50", "breakfast"],
    ["Mon breakfast 番茄炒蛋 50", "breakfast"],
    ["пн сніданок 番茄炒蛋 50", "breakfast"],
    ["周一午 番茄炒蛋 50", "lunch"],
    ["周一中 番茄炒蛋 50", "lunch"],
    ["周一 午餐 番茄炒蛋 50", "lunch"],
    ["周一 中餐 番茄炒蛋 50", "lunch"],
    ["周一 中午 番茄炒蛋 50", "lunch"],
    ["Mon lunch 番茄炒蛋 50", "lunch"],
    ["пн обід 番茄炒蛋 50", "lunch"],
    ["周一晚 番茄炒蛋 50", "dinner"],
    ["周一 晚餐 番茄炒蛋 50", "dinner"],
    ["周一 晚饭 番茄炒蛋 50", "dinner"],
    ["Mon dinner 番茄炒蛋 50", "dinner"],
    ["Mon supper 番茄炒蛋 50", "dinner"],
    ["пн вечеря 番茄炒蛋 50", "dinner"],
  ];
  for (const [text, meal] of cases) {
    const l = one(text);
    assert.equal(l.status, "ok", `${text} → ${JSON.stringify(l)}`);
    assert.equal(l.mealType, meal, text);
  }
});

test("餐次在菜名后面也认：「周一 番茄炒蛋 200 晚」", () => {
  const l = one("周一 番茄炒蛋 200 晚");
  assert.deepEqual(pickCore(l), { status: "ok", date: "2026-10-05", mealType: "dinner", dishRef: "tomato-egg-stir-fry", plannedServings: 200 });
});

// ---------------------------------------------------------------------------
// 份数：阿拉伯 / 中文数字，带不带「份」
// ---------------------------------------------------------------------------

test("份数：「五十份」「50份」「50」三种写法都是 50；「200人」「x200」「×200」「200 份」也认", () => {
  const cases = [
    ["周一午 番茄炒蛋 五十份", 50],
    ["周一午 番茄炒蛋 50份", 50],
    ["周一午 番茄炒蛋 50", 50],
    ["周一午 番茄炒蛋 五十", 50],
    ["周一午番茄炒蛋五十份", 50],
    ["周一午 番茄炒蛋 200人", 200],
    ["周一午 番茄炒蛋 200人份", 200],
    ["周一午 番茄炒蛋 x200", 200],
    ["周一午 番茄炒蛋×200", 200],
    ["周一午 番茄炒蛋 200 份", 200],
    ["周一午 番茄炒蛋 约200份", 200],
    ["Mon lunch Rice 300 servings", 300],
  ];
  for (const [text, n] of cases) {
    const l = one(text);
    assert.equal(l.status, "ok", `${text} → ${JSON.stringify(l)}`);
    assert.equal(l.plannedServings, n, text);
  }
});

test("中文数字：五十 / 两百 / 一百五（=150）/ 一百五十 / 二百零五 / 二零零 / 十五 / 三千 / 一千两百", () => {
  const cases = [
    ["五十", 50],
    ["两百", 200],
    ["二百", 200],
    ["一百五", 150],
    ["一百五十", 150],
    ["二百零五", 205],
    ["二零零", 200],
    ["十五", 15],
    ["十", 10],
    ["三千", 3000],
    ["一千两百", 1200],
    ["两千五", 2500],
  ];
  for (const [s, n] of cases) assert.equal(parseChineseNumber(s), n, s);
  assert.equal(parseChineseNumber("五x"), null);
  assert.equal(parseChineseNumber(""), null);
  // 整行里也一样
  assert.equal(one("周一午 番茄炒蛋 两百").plannedServings, 200);
  assert.equal(one("周一午 番茄炒蛋 一百五份").plannedServings, 150);
  assert.equal(one("周一午 番茄炒蛋 二百零五").plannedServings, 205);
});

test("菜名里的中文数字不当份数：「三杯鸡」整个是菜名", () => {
  const withSanbei = [...dishes, { id: "three-cup-chicken", name: { zh: "三杯鸡" } }];
  const l = parsePlanText({ text: "周一午 三杯鸡 100", dishes: withSanbei, weekStart: WEEK_START }).lines[0];
  assert.equal(l.status, "ok");
  assert.equal(l.dishRef, "three-cup-chicken");
  assert.equal(l.plannedServings, 100);
});

test("没写份数：status 仍按菜名判定，plannedServings 缺省；「0份」同样缺省", () => {
  const a = one("周一午 番茄炒蛋");
  assert.equal(a.status, "ok");
  assert.equal(a.plannedServings, undefined);
  const b = one("周一午 番茄炒蛋 0份");
  assert.equal(b.status, "ok");
  assert.equal(b.plannedServings, undefined);
});

// ---------------------------------------------------------------------------
// 菜名模糊匹配
// ---------------------------------------------------------------------------

test("模糊匹配：编辑距离 ≤ 2 命中（番茄炒鸡蛋 → tomato-egg-stir-fry，distance 1）；三语名都算", () => {
  const zh = one("周一午 番茄炒鸡蛋 200");
  assert.equal(zh.status, "ok");
  assert.equal(zh.dishRef, "tomato-egg-stir-fry");
  assert.deepEqual(zh.candidates, [{ id: "tomato-egg-stir-fry", distance: 1 }]);
  assert.equal(zh.dishNameRaw, "番茄炒鸡蛋");

  const en = one("Mon lunch Tomato egg stir fry x200"); // 大小写、& 与 - 都不算差异
  assert.equal(en.status, "ok");
  assert.equal(en.dishRef, "tomato-egg-stir-fry");
  assert.equal(en.candidates[0].distance, 0);

  const uk = one("пн обід Смажені томати з яйцем 200");
  assert.equal(uk.status, "ok");
  assert.equal(uk.dishRef, "tomato-egg-stir-fry");
});

test("认不出的菜名 → unknown-dish，带 dishNameRaw 供「新建」预填；距离 > 2 不算候选", () => {
  const l = one("周四晚 西红柿炒蛋 200");
  assert.equal(l.status, "unknown-dish");
  assert.equal(l.dishNameRaw, "西红柿炒蛋");
  assert.equal(l.dishRef, undefined);
  assert.equal(l.candidates, undefined);
  assert.deepEqual({ date: l.date, mealType: l.mealType, plannedServings: l.plannedServings }, { date: "2026-10-08", mealType: "dinner", plannedServings: 200 });
});

test("候选按距离升序 ≤ 3 个，精确命中排第一；两个字的菜最多错一个字（米饭 → rice，炒饭是候选）", () => {
  const l = one("周一午 米饭 300");
  assert.equal(l.status, "ok");
  assert.equal(l.dishRef, "rice");
  assert.deepEqual(l.candidates, [
    { id: "rice", distance: 0 },
    { id: "fried-rice", distance: 1 },
  ]);
  // 直接调匹配器：一个字的名字必须全等
  assert.deepEqual(matchDishName("饭", dishes), []);
  assert.deepEqual(matchDishName("米饭", dishes).map((c) => c.id), ["rice", "fried-rice"]);
  assert.ok(matchDishName("x", dishes).length === 0);
});

test("maxDistance 可调：设 0 时「番茄炒鸡蛋」就认不出了", () => {
  const l = one("周一午 番茄炒鸡蛋 200", { maxDistance: 0 });
  assert.equal(l.status, "unknown-dish");
});

test("草稿菜 → draft-dish（带 dishRef，供「去补全」）；archived 的菜当作不存在", () => {
  const draft = one("周五午 葱花蛋饼 100");
  assert.equal(draft.status, "draft-dish");
  assert.equal(draft.dishRef, "scallion-egg-pancake");
  const gone = one("周五晚 老菜 20");
  assert.equal(gone.status, "unknown-dish");
  assert.equal(gone.dishNameRaw, "老菜");
});

test("editDistance：按码点、带上限提前返回", () => {
  assert.equal(editDistance("番茄炒蛋", "番茄炒鸡蛋"), 1);
  assert.equal(editDistance("番茄炒蛋", "西红柿炒蛋"), 3);
  assert.equal(editDistance("番茄炒蛋", "西红柿炒蛋", 2), 3); // cap + 1
  assert.equal(editDistance("", "abc"), 3);
  assert.equal(editDistance("abc", "abc"), 0);
});

// ---------------------------------------------------------------------------
// 下周 / 不在范围
// ---------------------------------------------------------------------------

test("日期落在下周 → next-week（「下周一」与「10.14」两种写法），仍带 dishRef 可导入", () => {
  const a = one("下周一 午 番茄炒蛋 200");
  assert.deepEqual(pickCore(a), { status: "next-week", date: "2026-10-12", mealType: "lunch", dishRef: "tomato-egg-stir-fry", plannedServings: 200 });
  const b = one("10.14 午 番茄炒蛋 200");
  assert.equal(b.status, "next-week");
  assert.equal(b.date, "2026-10-14");
  const c = one("next mon lunch 番茄炒蛋 200");
  assert.equal(c.status, "next-week");
  assert.equal(c.date, "2026-10-12");
});

test("「下周」标题：之后的「周一」整体挪到下周；「本周」归零；「下周一」不重复挪", () => {
  const lines = parse(["周一午 番茄炒蛋 200", "下周", "周一午 米饭 100", "本周", "周三午 米饭 100", "下周 周四午 米饭 50", "下周一 午 米饭 20", "next week", "Mon lunch 米饭 10"].join("\n"));
  assert.deepEqual(
    lines.map((l) => [l.lineNo, l.status, l.date]),
    [
      [1, "ok", "2026-10-05"],
      [3, "next-week", "2026-10-12"],
      [5, "ok", "2026-10-07"],
      [6, "next-week", "2026-10-15"],
      [7, "next-week", "2026-10-12"],
      [9, "next-week", "2026-10-12"],
    ],
  );
});

test("日期既不在本周也不在下周 → unparsed，reason 说明本周从哪天起；下下周同理", () => {
  const a = one("9.1 午 番茄炒蛋 200");
  assert.equal(a.status, "unparsed");
  assert.match(a.reason, /不在本周也不在下周/);
  assert.match(a.reason, /2026-10-05/);
  const b = one("下下周一 午 番茄炒蛋 200");
  assert.equal(b.status, "unparsed");
});

// ---------------------------------------------------------------------------
// 认不出的行：结构化 unparsed，从不抛错
// ---------------------------------------------------------------------------

test("整行认不出 → unparsed + 人话 reason；缺日期 / 缺餐次 / 缺菜名各有各的原因", () => {
  const noDate = one("番茄炒蛋 200");
  assert.equal(noDate.status, "unparsed");
  assert.match(noDate.reason, /日期/);
  assert.equal(noDate.dishNameRaw, "番茄炒蛋"); // 部分信息保留，界面能显示
  assert.equal(noDate.plannedServings, 200);

  const noMeal = one("周一 番茄炒蛋 200");
  assert.equal(noMeal.status, "unparsed");
  assert.match(noMeal.reason, /餐次/);

  const noDish = one("周一午 200");
  assert.equal(noDish.status, "unparsed");
  assert.match(noDish.reason, /菜名/);
  assert.equal(noDish.plannedServings, 200);

  const garbage = one("你好啊");
  assert.equal(garbage.status, "unparsed");
  assert.equal(garbage.raw, "你好啊");
  assert.ok(garbage.reason);
});

test("输入形状不对也不抛：text 不是字符串 → 空结果；weekStart 不合法 → 每行 unparsed 并说明", () => {
  assert.deepEqual(parsePlanText({ text: null, dishes: undefined, weekStart: "bad" }), { lines: [] });
  assert.deepEqual(parsePlanText({}), { lines: [] });
  const bad = parsePlanText({ text: "周一午 番茄炒蛋 200", dishes, weekStart: "2026-13-01" }).lines;
  assert.equal(bad.length, 1);
  assert.equal(bad[0].status, "unparsed");
  assert.match(bad[0].reason, /起始日/);
  // dishes 里有坏条目也不抛
  const weird = parsePlanText({ text: "周一午 番茄炒蛋 200", dishes: [null, {}, { id: "x" }, ...dishes], weekStart: WEEK_START }).lines;
  assert.equal(weird[0].status, "ok");
});

// ---------------------------------------------------------------------------
// 多行、上下文、一行多菜、混排、空格与全角
// ---------------------------------------------------------------------------

test("空行跳过，lineNo 按原文行号（1-based）；CRLF 也行", () => {
  const lines = parse("\r\n\r\n周一午 番茄炒蛋 200\r\n\r\n周二午 番茄炒蛋 100");
  assert.deepEqual(lines.map((l) => l.lineNo), [3, 5]);
  assert.equal(lines[0].raw, "周一午 番茄炒蛋 200");
});

test("标题行沿用：「周一」一行只给日期，下面几行「午 A」「晚 B」沿用它；缺餐次的行沿用上一行的餐次", () => {
  const lines = parse(["周一", "午 番茄炒蛋 200", "晚 土豆烧牛肉 180", "周二", "午 米饭 300", "番茄炒蛋 100"].join("\n"));
  assert.deepEqual(
    lines.map((l) => [l.lineNo, l.status, l.date, l.mealType, l.dishRef, l.plannedServings]),
    [
      [2, "ok", "2026-10-05", "lunch", "tomato-egg-stir-fry", 200],
      [3, "ok", "2026-10-05", "dinner", "braised-beef-potato", 180],
      [5, "ok", "2026-10-06", "lunch", "rice", 300],
      [6, "ok", "2026-10-06", "lunch", "tomato-egg-stir-fry", 100],
    ],
  );
});

test("一行多道菜：「周一午：番茄炒蛋、土豆烧牛肉 各200」→ 两条，同一 lineNo，份数各 200；「A、B，200」同理", () => {
  const a = parse("周一午：番茄炒蛋、土豆烧牛肉 各200");
  assert.equal(a.length, 2);
  assert.deepEqual(
    a.map((l) => [l.lineNo, l.status, l.date, l.mealType, l.dishRef, l.plannedServings]),
    [
      [1, "ok", "2026-10-05", "lunch", "tomato-egg-stir-fry", 200],
      [1, "ok", "2026-10-05", "lunch", "braised-beef-potato", 200],
    ],
  );
  const b = parse("周一午：番茄炒蛋、土豆烧牛肉，200");
  assert.deepEqual(b.map((l) => l.plannedServings), [200, 200]);
  const c = parse("周一午 番茄炒蛋 200、土豆烧牛肉 180；米饭");
  assert.deepEqual(c.map((l) => [l.dishRef, l.plannedServings]), [["tomato-egg-stir-fry", 200], ["braised-beef-potato", 180], ["rice", undefined]]);
});

test("一行里「份数 空格 菜名」也拆：「周三 午 番茄炒蛋 200 土豆烧牛肉 180」→ 两条", () => {
  const lines = parse("周三 午 番茄炒蛋 200 土豆烧牛肉 180");
  assert.deepEqual(lines.map((l) => [l.status, l.dishRef, l.plannedServings]), [["ok", "tomato-egg-stir-fry", 200], ["ok", "braised-beef-potato", 180]]);
  const cn = parse("周二 晚 番茄炒蛋 两百 米饭 三百");
  assert.deepEqual(cn.map((l) => [l.dishRef, l.plannedServings]), [["tomato-egg-stir-fry", 200], ["rice", 300]]);
});

test("混排：中英乌日期 / 餐次 / 菜名混着写", () => {
  const lines = parse(["Mon 午 番茄炒蛋 200", "周二 lunch Rice x300", "Wed обід 土豆烧牛肉 180份", "Tue dinner Rice x300 Tomato egg stir-fry x200"].join("\n"));
  assert.deepEqual(
    lines.map((l) => [l.status, l.date, l.mealType, l.dishRef, l.plannedServings]),
    [
      ["ok", "2026-10-05", "lunch", "tomato-egg-stir-fry", 200],
      ["ok", "2026-10-06", "lunch", "rice", 300],
      ["ok", "2026-10-07", "lunch", "braised-beef-potato", 180],
      ["ok", "2026-10-06", "dinner", "rice", 300],
      ["ok", "2026-10-06", "dinner", "tomato-egg-stir-fry", 200],
    ],
  );
});

test("多余空格与全角标点 / 全角数字：「周一　午：　番茄炒蛋，２００份」= 周一午 番茄炒蛋 200", () => {
  const l = one("  周一　午：　番茄炒蛋，２００份  ");
  assert.deepEqual(pickCore(l), { status: "ok", date: "2026-10-05", mealType: "lunch", dishRef: "tomato-egg-stir-fry", plannedServings: 200 });
  const tabs = one("周一\t\t午\t番茄炒蛋\t\t200");
  assert.deepEqual(pickCore(tabs), pickCore(l));
  const punct = one("【周一】（午）番茄炒蛋——200份！");
  assert.deepEqual(pickCore(punct), pickCore(l));
});

test("时间段不当份数：「周一午 番茄炒蛋 12:00-14:00 200」份数是 200", () => {
  const l = one("周一午 番茄炒蛋 12:00-14:00 200");
  assert.equal(l.status, "ok");
  assert.equal(l.plannedServings, 200);
  assert.equal(l.dishRef, "tomato-egg-stir-fry");
});

test("典型微信整段：结果按行序，一条 unknown-dish、一条 draft-dish、其余 ok", () => {
  const text = "周一午 番茄炒蛋 200\n周一晚 土豆烧牛肉 180\n周二午 西红柿炒蛋 200\n周二晚 葱花蛋饼 100\n周三午 米饭 300";
  const lines = parse(text);
  assert.deepEqual(lines.map((l) => l.status), ["ok", "ok", "unknown-dish", "draft-dish", "ok"]);
  assert.deepEqual(lines.map((l) => l.lineNo), [1, 2, 3, 4, 5]);
});

// ---------------------------------------------------------------------------
// 周号换算（D-06：只有这一份实现）
// ---------------------------------------------------------------------------

test("ISO 周：2026-10-05 是第 41 周周一；第 43 周周一 = 2026-10-19（worker 契约 §0）", () => {
  assert.deepEqual(isoWeekOf("2026-10-05"), { year: 2026, week: 41 });
  assert.deepEqual(isoWeekOf("2026-10-11"), { year: 2026, week: 41 });
  assert.deepEqual(isoWeekOf("2026-10-19"), { year: 2026, week: 43 });
  assert.deepEqual(isoWeekOf("2027-01-01"), { year: 2026, week: 53 }); // 2026 有 53 周
  assert.equal(isoWeekOf("nope"), null);
  assert.equal(mondayOfIsoWeek(2026, 41), "2026-10-05");
  assert.equal(mondayOfIsoWeek(2026, 43), "2026-10-19");
  assert.equal(mondayOfIsoWeek(2026, 1), "2025-12-29");
  assert.equal(mondayOfIsoWeek(2027, 1), "2027-01-04");
  assert.equal(mondayOfIsoWeek(2026, 0), null);
  assert.equal(planIdOfDate("2026-10-19"), "week-43");
  assert.equal(planIdOfDate("2026-10-05"), "week-41");
  assert.equal(planIdOfDate("bad"), null);
});

test("planId → 周一：week-41 从 2026-09-09 看是 2026-10-05；年末看 week-1 落到下一年；形状不对 → null", () => {
  assert.equal(weekStartOfPlanId("week-41", "2026-09-09"), "2026-10-05");
  assert.equal(weekStartOfPlanId("week-1", "2026-12-28"), "2027-01-04");
  assert.equal(weekStartOfPlanId("week-52", "2027-01-05"), "2026-12-21");
  assert.equal(weekStartOfPlanId("week-41", "bad"), null);
  assert.equal(weekStartOfPlanId("nope", "2026-09-09"), null);
  assert.equal(weekStartOfPlanId("week-99", "2026-09-09"), null);
});
