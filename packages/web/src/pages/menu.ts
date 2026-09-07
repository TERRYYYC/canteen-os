/**
 * /menu 菜单（issue #11）：日期条 + 餐次 chip + 菜品行 + 底部详情抽屉。
 * 骨架照 docs/design/screens-v2.html「菜单」两屏（.days .tabs .mtitle .mlist .mr / .dsheet .arow .comp），
 * 借 Expirenza 的骨架，不借价格强调与收藏；加三语并列与「成分」。
 *
 * 子状态走 hash 第二段（src/router.ts，页面从 ctx.rest 读）：
 *   #/menu                    默认日 = ≥ 今天（本地日期）的第一天；都过去了取最后一天
 *   #/menu/<date>             选中日
 *   #/menu/<date>/<dishId>    详情抽屉（浏览器返回键 = 关抽屉）
 * 餐次选择是页面内状态（模块级记忆，重渲染后保持），不进 hash。
 *
 * 三语并列：主语言 = ctx.lang（pick 只取主语言）；另两语按 uk → zh → en 去掉主语言后排列，直接读 name[l]，缺失不显示。
 * 示例菜（provenance.source=example）由 scripts/build-data.mjs 排除；MenuSheetDish 没有 provenance 字段，
 * 页面层只能兑底 dish.issue（构建期标出的问题）→ 行内 warn 卡。
 * 过敏原：第一轮 allergens 恒为 []（schema 冻结，见 core/sheets.ts）——为空时如实写「暂无信息」，不是「无过敏原」。
 */
import "./menu.css";

import type { I18nString, ImageRef, MealType, MenuSheet, MenuSheetDay, MenuSheetDish, MenuSheetMeal } from "@canteenos/core";
import { h, replace } from "../dom";
import { LANGS, LANG_TAG, pick, type Lang } from "../i18n";
import { hrefOf } from "../router";
import type { PageCtx } from "../types";

// ---------------------------------------------------------------------------
// 页面私有文案（types.ts：页面专属文案自己建小字典）
// ---------------------------------------------------------------------------

const UI = {
  days: { uk: "Дні тижня", zh: "日期", en: "Days of the week" },
  today: { uk: "сьогодні", zh: "今天", en: "today" },
  meals: { uk: "Прийоми їжі", zh: "餐次", en: "Meals" },
  notServed: { uk: "Сьогодні не подається", zh: "今天不供应", en: "Not served today" },
  noMenuDay: { uk: "На цей день меню немає", zh: "这一天没有菜单", en: "No menu for this day" },
  noMenuWeek: { uk: "Меню на цей тиждень ще немає", zh: "本周还没有菜单", en: "No menu for this week yet" },
  composition: { uk: "Склад", zh: "成分", en: "Ingredients" },
  photo: { uk: "фото", zh: "图片", en: "photo" },
  allergen: { uk: "Алерген", zh: "过敏原", en: "Allergen" },
  allergens: { uk: "Алергени", zh: "过敏原", en: "Allergens" },
  allergensNone: { uk: "інформації немає", zh: "暂无信息", en: "no data" },
  allergensHas: { uk: "Містить алергени", zh: "含过敏原", en: "Contains allergens" },
  gramsIncomplete: {
    uk: "Частину інгредієнтів не перераховано в грами",
    zh: "部分配料未折算",
    en: "Some ingredients are not converted to grams",
  },
  close: { uk: "Закрити", zh: "关闭", en: "Close" },
  issue: { uk: "Проблема з даними", zh: "数据有问题", en: "Data issue" },
} as const satisfies Record<string, Record<Lang, string>>;

type UiKey = keyof typeof UI;

function ui(key: UiKey, lang: Lang): string {
  return UI[key][lang];
}

/** 与 core/procurement/engine.ts 的 MEAL_LABEL 同词（那张表未导出） */
const MEAL: Record<Lang, Record<MealType, string>> = {
  uk: { breakfast: "Сніданок", lunch: "Обід", dinner: "Вечеря" },
  zh: { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" },
  en: { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" },
};
const MEAL_ORDER: readonly MealType[] = ["breakfast", "lunch", "dinner"];

/** 菜数：uk 有 one/few/many 三种形态（Intl.PluralRules） */
const DISH_COUNT: Record<Lang, Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }> = {
  uk: { one: "{n} страва", few: "{n} страви", many: "{n} страв", other: "{n} страви" },
  zh: { other: "{n} 道菜" },
  en: { one: "{n} dish", other: "{n} dishes" },
};

/** 克重单位（uk 照 core 文本渲染器用「г」） */
const GRAM: Record<Lang, string> = { uk: "г", zh: "g", en: "g" };
/** 成分句连接符 */
const JOIN: Record<Lang, string> = { uk: ", ", zh: "、", en: ", " };
/** 冒号 */
const COLON: Record<Lang, string> = { uk: ": ", zh: "：", en: ": " };

// ---------------------------------------------------------------------------
// 模块级状态（重渲染后保持）
// ---------------------------------------------------------------------------

/** 用户点过的餐次 chip；下次渲染同一天有该餐次就沿用 */
let rememberedMeal: MealType | null = null;
/** 菜品行点击时记下目标 hash：关抽屉时若当前 hash 仍是它 → history.back()，否则 location.replace 到列表 */
let viaHistoryHash: string | null = null;
/** 关抽屉后要把焦点还给的菜品行 */
let focusAfterClose: { date: string; dishId: string } | null = null;
/** 当前打开的抽屉（语言切换重渲染 / hashchange 时先拆掉） */
let openSheetDispose: (() => void) | null = null;

function teardownSheet(): void {
  const d = openSheetDispose;
  openSheetDispose = null;
  d?.();
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 本地日期 YYYY-MM-DD（「今天」= 设备本地日期） */
function todayIso(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDate(lang: Lang, opts: Intl.DateTimeFormatOptions, d: Date): string {
  try {
    return new Intl.DateTimeFormat(LANG_TAG[lang], opts).format(d);
  } catch {
    return d.toDateString();
  }
}

/** uk 的 Intl 星期是小写（пн / понеділок）；设计稿是首字母大写 */
function capitalize(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s;
}

function weekdayShort(lang: Lang, iso: string): string {
  const d = parseIsoDate(iso);
  return d ? capitalize(fmtDate(lang, { weekday: "short" }, d)) : iso;
}

function dishCount(n: number, lang: Lang): string {
  let rule: Intl.LDMLPluralRule = "other";
  try {
    rule = new Intl.PluralRules(LANG_TAG[lang]).select(n);
  } catch {
    /* 无 ICU 时用 other */
  }
  const forms = DISH_COUNT[lang];
  return (forms[rule] ?? forms.other).replace("{n}", String(n));
}

/** 另两语：固定序 uk → zh → en 去掉主语言 */
function otherLangs(lang: Lang): Lang[] {
  return LANGS.filter((l) => l !== lang);
}

/** 另两语的文本：直接读 name[l]，缺失或与主语言显示文本相同（pick 回退时）不重复显示 */
function otherNames(s: I18nString, lang: Lang): Array<{ lang: Lang; text: string }> {
  const main = pick(s, lang);
  const out: Array<{ lang: Lang; text: string }> = [];
  for (const l of otherLangs(lang)) {
    const v = s[l];
    if (v && v !== main) out.push({ lang: l, text: v });
  }
  return out;
}

function namesLine(s: I18nString, lang: Lang): HTMLElement | null {
  const others = otherNames(s, lang);
  if (others.length === 0) return null;
  return h("div", { class: "n2" }, ...others.map((o) => h("span", { lang: LANG_TAG[o.lang] }, o.text)));
}

/** http(s) 直接用；仓库相对路径挂到 BASE_URL 下 */
function imgSrc(img: ImageRef | undefined): string | null {
  const src = img?.src;
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  return `${import.meta.env.BASE_URL}${src.replace(/^\/+/, "")}`;
}

/** 成分句：composition 各 name 主语言用「、」(zh) / ", "(uk/en) 连接 */
function compositionSentence(dish: MenuSheetDish, lang: Lang): string {
  return dish.composition
    .map((c) => pick(c.name, lang))
    .filter((s) => s.length > 0)
    .join(JOIN[lang]);
}

/** ≈克重：null 不显示；approxGramsIncomplete 加「+」 */
function gramsText(dish: MenuSheetDish, lang: Lang): string | null {
  if (dish.approxGrams === null || dish.approxGrams === undefined) return null;
  return `≈ ${dish.approxGrams}${dish.approxGramsIncomplete ? "+" : ""} ${GRAM[lang]}`;
}

function gramsNode(dish: MenuSheetDish, lang: Lang, cls: string): HTMLElement | null {
  const text = gramsText(dish, lang);
  if (!text) return null;
  const note = dish.approxGramsIncomplete ? ui("gramsIncomplete", lang) : null;
  return h("span", { class: cls, title: note }, text, note ? h("span", { class: "sr-only" }, ` (${note})`) : null);
}

function menuHref(date: string, dishId?: string): string {
  // hrefOf 会把 rest 里的 "/" 编码成 %2F，所以第二段在这里拼；parseHash 解码后 rest = "<date>/<dishId>"
  const base = hrefOf("menu", date);
  return dishId ? `${base}/${encodeURIComponent(dishId)}` : base;
}

function sortMeals(meals: MenuSheetMeal[]): MenuSheetMeal[] {
  return [...meals].sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType));
}

// ---------------------------------------------------------------------------
// 列表
// ---------------------------------------------------------------------------

function renderDays(days: MenuSheetDay[], selected: MenuSheetDay, today: string, lang: Lang): HTMLElement {
  const nav = h("nav", { class: "days", "aria-label": ui("days", lang) });
  for (const day of days) {
    const d = parseIsoDate(day.date);
    const isSel = day === selected;
    const isToday = day.date === today;
    nav.append(
      h(
        "a",
        {
          class: `d${isSel ? " on" : ""}${isToday ? " today" : ""}`,
          href: menuHref(day.date),
          "aria-current": isSel ? "page" : null,
          title: d ? fmtDate(lang, { dateStyle: "full" }, d) : day.date,
        },
        h("span", { class: "w" }, weekdayShort(lang, day.date)),
        h("span", { class: "n" }, d ? String(d.getDate()) : day.date),
        isToday ? h("span", { class: "sr-only" }, `, ${ui("today", lang)}`) : null,
      ),
    );
  }
  return nav;
}

function allergenChips(dish: MenuSheetDish, lang: Lang): HTMLElement[] {
  if (dish.allergens.length === 0) {
    return [h("span", { class: "chip ghost" }, `${ui("allergens", lang)}${COLON[lang]}${ui("allergensNone", lang)}`)];
  }
  return dish.allergens.map((a) => h("span", { class: "chip warn" }, `${ui("allergen", lang)}${COLON[lang]}${a}`));
}

function renderRow(dish: MenuSheetDish, day: MenuSheetDay, lang: Lang): HTMLElement {
  const href = menuHref(day.date, dish.id);
  const src = imgSrc(dish.image);
  const body = h(
    "div",
    { class: "b" },
    h("div", { class: "n1" }, pick(dish.name, lang)),
    namesLine(dish.name, lang),
    h("div", { class: "ds" }, `${ui("composition", lang)}${COLON[lang]}${compositionSentence(dish, lang)}`),
    gramsNode(dish, lang, "wt"),
    h("div", { class: "tags" }, ...allergenChips(dish, lang)),
    dish.issue ? h("div", { class: "issue" }, `⚠ ${ui("issue", lang)}${COLON[lang]}${dish.issue.message}`) : null,
  );
  const pic = src
    ? h("img", { src, alt: "", loading: "lazy", width: 112, height: 112 })
    : h("div", { class: "pimg", "aria-hidden": "true" }, ui("photo", lang));
  const a = h("a", { class: "mr", href, "data-dish": dish.id }, body, pic);
  a.addEventListener("click", () => {
    // 不拦默认跳转：hash 变化由 router 处理，壳层重渲染本页并带 rest = "<date>/<dishId>" → 打开抽屉
    viaHistoryHash = href;
  });
  return a;
}

function renderMealSection(meal: MenuSheetMeal, day: MenuSheetDay, lang: Lang): HTMLElement[] {
  const d = parseIsoDate(day.date);
  const when = d ? capitalize(fmtDate(lang, { weekday: "long", day: "numeric", month: "long" }, d)) : day.date;
  const title = h(
    "h2",
    { class: "mtitle" },
    MEAL[lang][meal.mealType],
    h("small", {}, `${when} · ${dishCount(meal.dishes.length, lang)}`),
  );
  const list = h("div", { class: "mlist" }, ...meal.dishes.map((dish) => renderRow(dish, day, lang)));
  return [title, list];
}

// ---------------------------------------------------------------------------
// 底部抽屉（.dsheet；不用 shell.ts 的 .drawer / .scrim）
// ---------------------------------------------------------------------------

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function allergenRow(dish: MenuSheetDish, lang: Lang): HTMLElement {
  if (dish.allergens.length === 0) {
    return h(
      "div",
      { class: "arow" },
      h("div", { class: "ic na", "aria-hidden": "true" }, "?"),
      h("div", {}, h("b", {}, ui("allergens", lang)), h("span", {}, ui("allergensNone", lang))),
    );
  }
  return h(
    "div",
    { class: "arow" },
    h("div", { class: "ic", "aria-hidden": "true" }, "!"),
    h("div", {}, h("b", {}, ui("allergensHas", lang)), h("span", {}, dish.allergens.join(JOIN[lang]))),
  );
}

/** 成分横滑：食材图（无图占位）+ 双语名 = 主语言 + uk→zh→en 里第一个非主语言 */
function compositionRow(dish: MenuSheetDish, lang: Lang): HTMLElement {
  const second = otherLangs(lang)[0] ?? lang;
  const items = dish.composition.map((c) => {
    const src = imgSrc(c.image);
    const main = pick(c.name, lang);
    const alt = c.name[second];
    return h(
      "div",
      { class: "ci" },
      src ? h("img", { src, alt: "", loading: "lazy", width: 72, height: 72 }) : h("div", { class: "ph", "aria-hidden": "true" }, ui("photo", lang)),
      h("b", {}, main),
      alt && alt !== main ? h("small", { lang: LANG_TAG[second] }, alt) : null,
    );
  });
  return h(
    "div",
    { class: "arow col" },
    h("b", {}, `${ui("composition", lang)} · ${UI.composition[second]}`),
    h("div", { class: "comp" }, ...items),
  );
}

function openSheet(el: HTMLElement, page: HTMLElement, day: MenuSheetDay, meal: MenuSheetMeal, dish: MenuSheetDish, lang: Lang): void {
  const titleId = "dsheet-title";
  const src = imgSrc(dish.image);
  const closeBtn = h("button", { type: "button", class: "x", "aria-label": ui("close", lang) }, "×");
  const hero = h(
    "div",
    { class: "hero" },
    src ? h("img", { src, alt: "", loading: "lazy" }) : h("div", { class: "ph", "aria-hidden": "true" }, ui("photo", lang)),
    closeBtn,
  );
  const desc = pick(dish.description, lang);
  const body = h(
    "div",
    { class: "body" },
    h("h2", { class: "n1", id: titleId }, pick(dish.name, lang)),
    namesLine(dish.name, lang),
    // 无 description 时这里只放成分句
    h("p", { class: "ds" }, desc || `${ui("composition", lang)}${COLON[lang]}${compositionSentence(dish, lang)}`),
    h(
      "div",
      { class: "meta" },
      gramsNode(dish, lang, "chip ghost"),
      h("span", { class: "chip ghost" }, `${MEAL[lang][meal.mealType]} · ${weekdayShort(lang, day.date)}`),
    ),
    allergenRow(dish, lang),
    compositionRow(dish, lang),
  );
  const scrim = h("div", { class: "dsheet-scrim" });
  const dlg = h("div", { class: "dsheet", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabindex: "-1" }, hero, body);

  const prevOverflow = document.body.style.overflow;
  page.setAttribute("inert", "");
  document.body.style.overflow = "hidden";
  el.append(scrim, dlg);

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("hashchange", dispose);
    page.removeAttribute("inert");
    document.body.style.overflow = prevOverflow;
    scrim.remove();
    dlg.remove();
  };
  // 任何 hash 变化（返回键 / 关闭钮 / 跳别的页）都先拆抽屉；壳层随后重渲染
  window.addEventListener("hashchange", dispose);
  openSheetDispose = dispose;

  const close = (): void => {
    focusAfterClose = { date: day.date, dishId: dish.id };
    const list = menuHref(day.date);
    if (viaHistoryHash !== null && location.hash === viaHistoryHash) {
      viaHistoryHash = null;
      history.back(); // 行点击压入的那条历史 → 回列表
    } else {
      location.replace(list); // 直接打开的详情链接：不留历史记录地回列表
    }
  };
  closeBtn.addEventListener("click", close);
  scrim.addEventListener("click", close);
  dlg.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      const els = Array.from(dlg.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (els.length === 0) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // 焦点进抽屉——但语言切换时焦点在顶栏下拉上，不抢
  const ae = document.activeElement;
  if (!ae || ae === document.body || !ae.isConnected) dlg.focus();
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export async function render(el: HTMLElement, ctx: PageCtx): Promise<void> {
  teardownSheet();
  const lang = ctx.lang;
  if (!ctx.planId) {
    el.append(h("p", { class: "muted" }, ctx.t("data.notReady")));
    return;
  }
  let sheet: MenuSheet;
  try {
    sheet = await ctx.data.loadMenu(ctx.planId);
  } catch {
    el.append(h("p", { class: "muted" }, ctx.t("data.notReady")));
    return;
  }
  if (!el.isConnected) return; // 晚到的渲染：壳层已换 outlet，别再动焦点 / 抽屉

  const page = h("div", { class: "menu-page" });
  el.append(page);

  if (sheet.issues.length > 0) {
    page.append(h("div", { class: "card issues" }, ...sheet.issues.map((i) => h("p", {}, `⚠ ${i.message}`))));
  }

  const days = sheet.days;
  if (days.length === 0) {
    page.append(h("p", { class: "muted" }, ui("noMenuWeek", lang)));
    return;
  }

  const [restDate = "", restDish = ""] = ctx.rest.split("/");
  const today = todayIso();
  const day = days.find((d) => d.date === restDate) ?? days.find((d) => d.date >= today) ?? days[days.length - 1]!;
  const meals = sortMeals(day.meals);
  const weekMealTypes = MEAL_ORDER.filter((t) => days.some((d) => d.meals.some((m) => m.mealType === t)));

  // hash 里的菜：只在选中日里找
  let open: { meal: MenuSheetMeal; dish: MenuSheetDish } | null = null;
  if (restDish) {
    for (const meal of meals) {
      const dish = meal.dishes.find((x) => x.id === restDish);
      if (dish) {
        open = { meal, dish };
        break;
      }
    }
  }

  let mealType: MealType | null =
    open?.meal.mealType ?? (rememberedMeal !== null && meals.some((m) => m.mealType === rememberedMeal) ? rememberedMeal : null) ?? meals[0]?.mealType ?? null;
  if (open) rememberedMeal = open.meal.mealType;

  const tabs = h("div", { class: "tabs", role: "group", "aria-label": ui("meals", lang) });
  for (const meal of meals) {
    const b = h(
      "button",
      { type: "button", class: "chip", "aria-pressed": "false", "data-meal": meal.mealType },
      `${MEAL[lang][meal.mealType]}${meal.serviceWindow ? ` · ${meal.serviceWindow}` : ""}`,
    );
    b.addEventListener("click", () => {
      mealType = meal.mealType;
      rememberedMeal = meal.mealType;
      paint();
    });
    tabs.append(b);
  }
  const body = h("div", { class: "menu-body" });

  function paint(): void {
    for (const b of tabs.querySelectorAll<HTMLButtonElement>("button")) {
      const on = b.dataset["meal"] === mealType;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("accent", on);
    }
    const nodes: HTMLElement[] = [];
    const meal = meals.find((m) => m.mealType === mealType);
    if (meal) nodes.push(...renderMealSection(meal, day, lang));
    else nodes.push(h("p", { class: "muted" }, ui("noMenuDay", lang)));
    // 本周有、这天没有的餐次：照设计稿显示一条压暗的标题「今天不供应」
    for (const t of weekMealTypes) {
      if (meals.some((m) => m.mealType === t)) continue;
      nodes.push(h("h2", { class: "mtitle off" }, MEAL[lang][t], h("small", {}, ui("notServed", lang))));
    }
    replace(body, ...nodes);
  }

  page.append(renderDays(days, day, today, lang), tabs, body);
  paint();

  if (open) {
    openSheet(el, page, day, open.meal, open.dish, lang);
    return;
  }
  // 刚关掉抽屉：焦点回该菜品行（这是重渲染出来的新元素）
  const back = focusAfterClose;
  focusAfterClose = null;
  if (back && back.date === day.date) {
    const row = Array.from(body.querySelectorAll<HTMLElement>("a.mr")).find((x) => x.dataset["dish"] === back.dishId);
    const ae = document.activeElement;
    if (row && (!ae || ae === document.body || !ae.isConnected)) row.focus();
  }
}
