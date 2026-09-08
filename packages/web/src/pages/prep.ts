/**
 * /prep 备料单（issue #9）：A 版列表为主视图，点配料行进 B 版详情，C 版的时间分组做成筛选 chip。
 * UI 事实源 docs/design/screens-v2.html「备料单」三版；契约见 src/types.ts：render(el, ctx)。
 *
 * 子状态走 hash 第二段（ctx.rest，路由器不解释）：
 *   #/prep                                   列表，日期 = 「今天」（days 里 ≥ 本地今天的第一天；都过去了取最后一天）
 *   #/prep/<date>                            选中日期（第一餐次）
 *   #/prep/<date>/<mealType>                 选中日期 + 餐次（列表）
 *   #/prep/<date>/<mealType>/<ingredientRef> B 版详情
 * timing 筛选不入 hash：模块级状态，切语言 / 切日期时保留。
 *
 * 页面不做任何算术：数量已按份数缩放好；只做单位显示换算（≥ 1000 g → kg、≥ 1000 ml → l，见 formatQty）。
 * 文案：页面私有三语小字典 T（chip 标签、单位、占位、"з відео"…）；乌克兰语动作词只从数据（技法词表）取，
 * 这里没有任何技法词。图片 src 以 http 开头直接用，否则相对 BASE_URL。
 */
import "./prep.css";

import type {
  I18nString,
  MealType,
  PrepGroup,
  PrepSheet,
  PrepSheetComponent,
  PrepSheetDay,
  PrepSheetMeal,
  PrepSheetStep,
  Quantity,
  SheetIssue,
  SheetIssueCode,
  Unit,
} from "@canteenos/core";
import { append, h, replace } from "../dom";
import { LANG_TAG, pick, type Lang } from "../i18n";
import { hrefOf } from "../router";
import type { PageCtx } from "../types";

// ---------------------------------------------------------------------------
// 页面私有文案
// ---------------------------------------------------------------------------

const T = {
  "meal.breakfast": { uk: "Сніданок", zh: "早餐", en: "Breakfast" },
  "meal.lunch": { uk: "Обід", zh: "午餐", en: "Lunch" },
  "meal.dinner": { uk: "Вечеря", zh: "晚餐", en: "Dinner" },
  servings: { uk: "порцій", zh: "份", en: "servings" },

  "nav.dates": { uk: "День", zh: "日期", en: "Day" },
  "nav.meals": { uk: "Прийом їжі", zh: "餐次", en: "Meal" },
  "nav.filter": { uk: "Коли готувати", zh: "备料时机", en: "When to prep" },

  "filter.all": { uk: "Усе", zh: "全部", en: "All" },
  "group.morning": { uk: "Вранці", zh: "早上", en: "Morning" },
  "group.before-service": { uk: "Перед подачею", zh: "出餐前", en: "Before service" },
  "group.day-before": { uk: "Напередодні", zh: "前一天", en: "Day before" },
  "group.at-hand": { uk: "Приправи — під рукою", zh: "调料 · 备在手边", en: "Seasonings — at hand" },

  "photo.none": { uk: "фото ще немає", zh: "还没有照片", en: "no photo yet" },
  "photo.none.long": {
    uk: "Фото ще немає — додати з відео або камери",
    zh: "还没有照片——从视频或相机添加",
    en: "No photo yet — add from video or camera",
  },
  "from.video": { uk: "з відео", zh: "来自视频", en: "from video" },
  "prep.none": { uk: "Спосіб підготовки не вказано", zh: "还没写怎么切", en: "No prep spec yet" },
  "technique.missing": { uk: "Техніку не знайдено", zh: "技法词表里没有", en: "Technique not found" },

  steps: { uk: "Кроки", zh: "步骤", en: "Steps" },
  "steps.related": { uk: "Кроки з цим інгредієнтом", zh: "相关步骤", en: "Steps with this ingredient" },
  "steps.all": { uk: "Усі кроки", zh: "全部步骤", en: "All steps" },
  "steps.none": { uk: "Кроків ще немає", zh: "还没有步骤", en: "No steps yet" },
  "clip.open": { uk: "Відкрити відео на цій секунді", zh: "打开视频到这一秒", en: "Open the video at this second" },

  back: { uk: "Назад до списку", zh: "返回列表", en: "Back to list" },
  "qty.toTaste": { uk: "за смаком", zh: "适量", en: "to taste" },

  "empty.day": { uk: "На цей день нічого готувати", zh: "这天没有备料", en: "Nothing to prep this day" },
  "empty.filter": { uk: "У цей час нічого готувати", zh: "这个时段没有要备的", en: "Nothing to prep at this time" },
  "empty.sheet": { uk: "У цьому плані ще немає днів", zh: "这份计划还没有日期", en: "No days in this plan yet" },
  "notFound.ingredient": { uk: "Інгредієнт не знайдено", zh: "没找到这个配料", en: "Ingredient not found" },

  "issues.sheet": {
    uk: "У даних цього тижня є проблеми: {n}",
    zh: "本周数据有 {n} 处问题",
    en: "Data issues this week: {n}",
  },
  "issue.missing-dish": { uk: "Страву не знайдено", zh: "菜品不存在", en: "Dish not found" },
  "issue.dish-not-active": { uk: "Страва ще не активна", zh: "菜品还没上线", en: "Dish not active yet" },
  "issue.dish-incomplete": { uk: "Страва заповнена не повністю", zh: "菜品资料不全", en: "Dish incomplete" },
  "issue.missing-ingredient": { uk: "Інгредієнт не знайдено", zh: "食材不存在", en: "Ingredient not found" },
  "issue.missing-technique": { uk: "Техніку не знайдено", zh: "技法不存在", en: "Technique not found" },
} as const satisfies Record<string, Record<Lang, string>>;

type Key = keyof typeof T;

function tt(lang: Lang, key: Key, params?: Record<string, string | number>): string {
  let s: string = T[key][lang];
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** 单位显示：uk кг/шт/г/л，zh kg/个/g/L，en kg/pcs/g/L（issue #9） */
const UNIT: Record<Unit, Record<Lang, string>> = {
  g: { uk: "г", zh: "g", en: "g" },
  kg: { uk: "кг", zh: "kg", en: "kg" },
  ml: { uk: "мл", zh: "ml", en: "ml" },
  l: { uk: "л", zh: "L", en: "L" },
  pcs: { uk: "шт", zh: "个", en: "pcs" },
  pack: { uk: "уп.", zh: "包", en: "pack" },
  tbsp: { uk: "ст. л.", zh: "汤匙", en: "tbsp" },
  tsp: { uk: "ч. л.", zh: "茶匙", en: "tsp" },
  pinch: { uk: "дрібка", zh: "撮", en: "pinch" },
  "to-taste": { uk: "за смаком", zh: "适量", en: "to taste" },
};

const MEAL_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner"];
/** 分节顺序 = core 的 PREP_GROUP_ORDER（前一天 → 早上 → 开餐前 → 备在手边）；本地复制一份，web 只 import type，core 不进产物 */
const GROUP_ORDER = ["day-before", "morning", "before-service", "at-hand"] as const satisfies readonly PrepGroup[];
/** 筛选 chip 顺序照 issue：全部 / 早上 / 出餐前 / 前一天（分节顺序另按 PREP_GROUP_ORDER） */
const FILTERS: ReadonlyArray<PrepGroup | "all"> = ["all", "morning", "before-service", "day-before"];
const ISSUE_CODES: readonly SheetIssueCode[] = ["missing-dish", "dish-not-active", "dish-incomplete", "missing-ingredient", "missing-technique"];

// ---------------------------------------------------------------------------
// 页内状态（timing 筛选不入 hash；切语言 / 切日期时保留）
// ---------------------------------------------------------------------------

let filter: PrepGroup | "all" = "all";

// ---------------------------------------------------------------------------
// 格式化助手（以后统一抽出）
// ---------------------------------------------------------------------------

/** 本地今天，ISO 日期（build.json 的 builtAt 是构建时刻，不是今天） */
function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "2026-10-05" → 本地日期对象（不经 UTC，避免时区漂移一天） */
function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 日期 chip 文案：星期 + 日（uk「пн, 5 жовт.」/ zh「10月5日周一」/ en「Mon, Oct 5」） */
function formatDay(iso: string, lang: Lang): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  try {
    return new Intl.DateTimeFormat(LANG_TAG[lang], { weekday: "short", day: "numeric", month: "short" }).format(d);
  } catch {
    return iso;
  }
}

function formatNumber(n: number, lang: Lang, maxFrac: number): string {
  try {
    return new Intl.NumberFormat(LANG_TAG[lang], { maximumFractionDigits: maxFrac }).format(n);
  } catch {
    return String(Math.round(n * 10 ** maxFrac) / 10 ** maxFrac);
  }
}

/**
 * 数量显示（页面唯一的「换算」，只改显示单位，不改数据）：
 *   ≥ 1000 g → kg（保留 1 位小数：30 kg、1.5 kg）；≥ 1000 ml → l；
 *   to-taste / 无 value → 只显示「适量 / за смаком / to taste」（word=true，字号小一档）。
 */
function formatQty(qty: Quantity, lang: Lang): { value: string; unit: string; word: boolean } {
  if (qty.unit === "to-taste" || qty.value === undefined || qty.value === null) {
    return { value: tt(lang, "qty.toTaste"), unit: "", word: true };
  }
  let value = qty.value;
  let unit: Unit = qty.unit;
  let maxFrac = 2;
  if (unit === "g" && value >= 1000) {
    value = value / 1000;
    unit = "kg";
    maxFrac = 1;
  } else if (unit === "ml" && value >= 1000) {
    value = value / 1000;
    unit = "l";
    maxFrac = 1;
  }
  return { value: formatNumber(value, lang, maxFrac), unit: UNIT[unit][lang], word: false };
}

/** 秒 → mm:ss（≥ 1 小时时 h:mm:ss） */
function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${r}`;
  return `${String(m).padStart(2, "0")}:${r}`;
}

/** 视频 URL 定位到第 start 秒：YouTube 用 t=<s>s 查询参数，bilibili 用 t=<s>，其它平台用 #t=<s>（媒体片段） */
function clipHref(url: string, start: number): string {
  const s = Math.max(0, Math.floor(start));
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, "");
    if (host === "youtube.com" || host === "youtu.be") u.searchParams.set("t", `${s}s`);
    else if (host === "bilibili.com" || host.endsWith(".bilibili.com") || host === "b23.tv") u.searchParams.set("t", String(s));
    else u.hash = `t=${s}`;
    return u.toString();
  } catch {
    return url;
  }
}

/** 图片地址：http(s) 直接用；仓库内相对路径挂在 BASE_URL 下 */
function imgSrc(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return `${import.meta.env.BASE_URL}${src.replace(/^\/+/, "")}`;
}

/** hash：#/prep/<date>/<mealType>/<ingredientRef>，逐段编码（router 的 hrefOf 会把 "/" 编成 %2F，这里保持可读） */
function prepHref(...segs: string[]): string {
  const rest = segs.filter(Boolean).map(encodeURIComponent).join("/");
  return rest ? `${hrefOf("prep")}/${rest}` : hrefOf("prep");
}

function isMealType(s: string): s is MealType {
  return (MEAL_TYPES as readonly string[]).includes(s);
}

function isIssueCode(s: string): s is SheetIssueCode {
  return (ISSUE_CODES as readonly string[]).includes(s);
}

/** 缺 / 空 I18nString 时回退到 id，不留空白 */
function nameOf(s: I18nString | undefined, lang: Lang, fallback: string): string {
  return pick(s, lang) || fallback;
}

// ---------------------------------------------------------------------------
// 子状态解析
// ---------------------------------------------------------------------------

interface Sel {
  day: PrepSheetDay;
  meal: PrepSheetMeal | null;
  /** B 版：ingredientRef（可能在 components 里找不到 → 显示「没找到」） */
  ingredientRef: string | null;
}

function pickDefaultDay(days: readonly PrepSheetDay[]): PrepSheetDay | null {
  if (days.length === 0) return null;
  const today = todayIso();
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return sorted.find((d) => d.date >= today) ?? sorted[sorted.length - 1] ?? null;
}

function resolve(sheet: PrepSheet, rest: string): Sel | null {
  const [dateSeg = "", mealSeg = "", ingSeg = ""] = rest.split("/").filter(Boolean);
  const day = sheet.days.find((d) => d.date === dateSeg) ?? pickDefaultDay(sheet.days);
  if (!day) return null;
  const meal = (isMealType(mealSeg) ? day.meals.find((m) => m.mealType === mealSeg) : undefined) ?? day.meals[0] ?? null;
  const ingredientRef = ingSeg && meal ? ingSeg : null;
  return { day, meal, ingredientRef };
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

export async function render(el: HTMLElement, ctx: PageCtx): Promise<void> {
  const { lang } = ctx;
  const status = h("p", { class: "muted" }, ctx.t("data.loading"));
  el.append(status);
  if (!ctx.planId) {
    status.textContent = ctx.t("data.notReady");
    return;
  }
  let sheet: PrepSheet;
  try {
    sheet = await ctx.data.loadPrep(ctx.planId);
  } catch {
    status.textContent = ctx.t("data.notReady");
    return;
  }
  status.remove();

  const days = [...sheet.days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const sel = resolve({ ...sheet, days }, ctx.rest);
  const root = h("div", { class: "prep" });
  el.append(root);

  if (sheet.issues.length > 0) {
    root.append(
      h(
        "div",
        { class: "card notice", role: "status" },
        h("span", { class: "chip warn" }, "⚠", h("span", { class: "n" }, String(sheet.issues.length))),
        h("span", {}, tt(lang, "issues.sheet", { n: sheet.issues.length })),
      ),
    );
  }

  if (!sel) {
    root.append(h("div", { class: "card empty" }, tt(lang, "empty.sheet")));
    return;
  }

  if (sel.ingredientRef && sel.meal) {
    renderDetail(root, ctx, sel.day, sel.meal, sel.ingredientRef);
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* jsdom 等无滚动实现 */
    }
    return;
  }
  renderList(root, ctx, days, sel.day, sel.meal);
}

// ---------- 顶部 chip 行 ----------

function mealLabel(meal: PrepSheetMeal, lang: Lang): HTMLElement[] {
  return [h("span", {}, tt(lang, `meal.${meal.mealType}`)), h("span", { class: "n" }, ` · ${formatNumber(meal.servings, lang, 0)}`)];
}

function dateTabs(days: readonly PrepSheetDay[], current: PrepSheetDay, lang: Lang): HTMLElement {
  const nav = h("nav", { class: "tabs dates", "aria-label": tt(lang, "nav.dates") });
  for (const d of days) {
    const on = d.date === current.date;
    nav.append(
      h(
        "a",
        { class: on ? "chip solid" : "chip", href: prepHref(d.date), "aria-current": on ? "date" : null, "data-date": d.date },
        h("time", { datetime: d.date }, formatDay(d.date, lang)),
      ),
    );
  }
  return nav;
}

function mealTabs(day: PrepSheetDay, current: PrepSheetMeal | null, lang: Lang): HTMLElement {
  const nav = h("nav", { class: "tabs meals", "aria-label": tt(lang, "nav.meals") });
  for (const m of day.meals) {
    const on = current !== null && m.mealType === current.mealType;
    nav.append(
      h(
        "a",
        { class: on ? "chip accent" : "chip", href: prepHref(day.date, m.mealType), "aria-current": on ? "true" : null, "data-meal": m.mealType },
        ...mealLabel(m, lang),
      ),
    );
  }
  return nav;
}

// ---------- A：列表 ----------

function renderList(root: HTMLElement, ctx: PageCtx, days: readonly PrepSheetDay[], day: PrepSheetDay, meal: PrepSheetMeal | null): void {
  const { lang } = ctx;
  root.append(dateTabs(days, day, lang));
  if (day.meals.length === 0 || !meal) {
    root.append(h("div", { class: "card empty" }, tt(lang, "empty.day")));
    return;
  }
  root.append(mealTabs(day, meal, lang));
  root.append(dishHead(meal, lang));

  if (meal.issue) {
    root.append(issueCard(meal.issue, lang));
    return;
  }

  // 时机筛选 chip（页内状态）
  const counts = new Map<PrepGroup, number>();
  for (const c of meal.components) counts.set(c.group, (counts.get(c.group) ?? 0) + 1);
  const filters = h("div", { class: "tabs filters", role: "group", "aria-label": tt(lang, "nav.filter") });
  const list = h("div", { class: "list" });
  const buttons: HTMLButtonElement[] = [];
  for (const f of FILTERS) {
    const b = h(
      "button",
      { type: "button", class: "chip", "aria-pressed": f === filter ? "true" : "false", "data-filter": f },
      f === "all" ? tt(lang, "filter.all") : tt(lang, `group.${f}`),
      f === "all" ? null : h("span", { class: "cnt" }, ` · ${formatNumber(counts.get(f) ?? 0, lang, 0)}`),
    );
    b.addEventListener("click", () => {
      filter = f;
      for (const x of buttons) x.setAttribute("aria-pressed", x.dataset["filter"] === f ? "true" : "false");
      fillList(list, meal, day, lang);
    });
    buttons.push(b);
    filters.append(b);
  }
  root.append(filters, list);
  fillList(list, meal, day, lang);

  // 步骤（设计稿 A 版底部）
  root.append(...stepsSection(meal.steps, lang, tt(lang, "steps")));
}

function dishHead(meal: PrepSheetMeal, lang: Lang): HTMLElement {
  const name = nameOf(meal.dish.name, lang, meal.dishRef);
  const img = meal.dish.image
    ? h("img", { src: imgSrc(meal.dish.image.src), alt: "" })
    : h("div", { class: "thumb ph", "aria-hidden": "true" }, tt(lang, "photo.none"));
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "dish-head" },
      img,
      h(
        "div",
        {},
        h("h2", { class: "n" }, name),
        h("div", { class: "s" }, h("span", { class: "num" }, formatNumber(meal.servings, lang, 0)), ` ${tt(lang, "servings")}`),
      ),
    ),
  );
}

function issueCard(issue: SheetIssue, lang: Lang): HTMLElement {
  const label = isIssueCode(issue.code) ? tt(lang, `issue.${issue.code}`) : issue.code;
  return h(
    "div",
    { class: "card issue", role: "status" },
    h("span", { class: "chip warn" }, "⚠ ", label),
    h("p", { class: "muted" }, issue.message),
  );
}

/** 按 filter 重填列表：主料按 PREP_GROUP_ORDER 分节；调料（at-hand）始终显示在末尾，不受筛选影响 */
function fillList(list: HTMLElement, meal: PrepSheetMeal, day: PrepSheetDay, lang: Lang): void {
  const nodes: Node[] = [];
  let shown = 0;
  for (const g of GROUP_ORDER) {
    if (g === "at-hand") continue;
    if (filter !== "all" && filter !== g) continue;
    const items = meal.components.filter((c) => c.group === g);
    if (items.length === 0) continue;
    shown += items.length;
    nodes.push(
      h("div", { class: "section-label" }, tt(lang, `group.${g}`), ` · ${formatNumber(items.length, lang, 0)}`),
      h("div", { class: "card", "data-group": g }, ...items.map((c) => row(c, day, meal, lang, false))),
    );
  }
  if (shown === 0) {
    nodes.push(h("div", { class: "card empty" }, tt(lang, filter === "all" ? "empty.day" : "empty.filter")));
  }
  const seasonings = meal.components.filter((c) => c.group === "at-hand");
  if (seasonings.length > 0) {
    nodes.push(
      h("div", { class: "section-label" }, tt(lang, "group.at-hand")),
      h("div", { class: "card", "data-group": "at-hand" }, ...seasonings.map((c) => row(c, day, meal, lang, true))),
    );
  }
  replace(list, ...nodes);
}

function qtyBlock(qty: Quantity, lang: Lang): HTMLElement {
  const q = formatQty(qty, lang);
  return h(
    "div",
    { class: "qty" },
    h("div", { class: q.word ? "v num word" : "v num" }, q.value),
    q.unit ? h("div", { class: "u" }, q.unit) : null,
  );
}

function techLine(c: PrepSheetComponent, lang: Lang): string {
  if (!c.prep) return "";
  const tech = c.prep.techniqueMissing ? `${tt(lang, "technique.missing")}: ${c.prep.techniqueRef}` : nameOf(c.prep.technique.name, lang, c.prep.techniqueRef);
  return c.prep.size ? `${tech}, ${c.prep.size}` : tech;
}

function row(c: PrepSheetComponent, day: PrepSheetDay, meal: PrepSheetMeal, lang: Lang, small: boolean): HTMLElement {
  const name = nameOf(c.name, lang, c.ingredientRef);
  const body = h("div", { class: "body" }, h("div", { class: "name" }, name));
  if (!small) {
    const tech = techLine(c, lang);
    if (tech) append(body, h("div", { class: "tech" }, tech));
    else append(body, h("div", { class: "tech none" }, tt(lang, "prep.none")));
    const note = pick(c.prep?.note, lang);
    if (note) append(body, h("div", { class: "note" }, note));
  }
  const img = c.prep?.image ?? c.image;
  const thumb = small
    ? null
    : img
      ? h("img", { class: "thumb", src: imgSrc(img.src), alt: "", loading: "lazy" })
      : h("div", { class: "thumb ph" }, tt(lang, "photo.none"));
  return h(
    "a",
    { class: small ? "li small" : "li", href: prepHref(day.date, meal.mealType, c.ingredientRef), "data-ingredient": c.ingredientRef },
    thumb,
    body,
    qtyBlock(c.qty, lang),
  );
}

// ---------- 步骤 ----------

function clipNode(clip: NonNullable<PrepSheetStep["clip"]>, lang: Lang, range: boolean): HTMLElement {
  const text = range ? `${mmss(clip.start)}–${mmss(clip.end)}` : mmss(clip.start);
  if (clip.videoUrl) {
    return h("a", { class: "clip", href: clipHref(clip.videoUrl, clip.start), target: "_blank", rel: "noopener", title: tt(lang, "clip.open") }, text);
  }
  return h("span", { class: "clip" }, text);
}

function stepsSection(steps: readonly PrepSheetStep[], lang: Lang, label: string): HTMLElement[] {
  if (steps.length === 0) return [h("div", { class: "section-label" }, label), h("div", { class: "card empty" }, tt(lang, "steps.none"))];
  const card = h("div", { class: "card steps" });
  for (const s of steps) {
    const tx = h("div", { class: "tx" }, h("span", {}, pick(s.text, lang)));
    if (s.clip) append(tx, h("div", {}, clipNode(s.clip, lang, true)));
    card.append(h("div", { class: "step" }, h("div", { class: "k" }, String(s.n)), tx));
  }
  return [h("div", { class: "section-label" }, `${label} · ${formatNumber(steps.length, lang, 0)}`), card];
}

/**
 * 与该配料相关的步骤（数据里没有配料 ↔ 步骤的显式关联，这里是启发式）：
 *   - 步骤技法 = 该配料的备料技法；或
 *   - 步骤文本（任一语言）含配料名（任一语言）：整名，或名字里 ≥ 3 字母的词（≥ 5 字母只取前 5 字母做词干，
 *     兼容乌语 / 英语的词形变化：томат→томати、цибул→цибулею、egg→eggs）。
 */
const LANGS3 = ["uk", "zh", "en"] as const;

function nameKeys(name: I18nString): string[] {
  const keys = new Set<string>();
  for (const l of LANGS3) {
    const whole = (name[l] ?? "").trim().toLowerCase();
    if (whole.length >= 2) keys.add(whole);
    for (const w of whole.split(/[\s,.;:()]+/)) {
      if (w.length >= 5) keys.add(w.slice(0, 5));
      else if (w.length >= 3) keys.add(w);
    }
  }
  return [...keys];
}

function relatedSteps(c: PrepSheetComponent, steps: readonly PrepSheetStep[]): PrepSheetStep[] {
  const keys = nameKeys(c.name);
  return steps.filter((s) => {
    if (c.prep && s.techniqueRef && s.techniqueRef === c.prep.techniqueRef) return true;
    const texts = LANGS3.map((l) => (s.text[l] ?? "").toLowerCase());
    return keys.some((k) => texts.some((t) => t.includes(k)));
  });
}

// ---------- B：详情 ----------

function renderDetail(root: HTMLElement, ctx: PageCtx, day: PrepSheetDay, meal: PrepSheetMeal, ingredientRef: string): void {
  const { lang } = ctx;
  const listHref = prepHref(day.date, meal.mealType);
  root.append(h("a", { class: "back", href: listHref }, tt(lang, "back")));
  root.append(
    h(
      "nav",
      { class: "tabs" },
      h("a", { class: "chip solid", href: prepHref(day.date) }, h("time", { datetime: day.date }, formatDay(day.date, lang))),
      h("a", { class: "chip accent", href: listHref }, h("span", {}, nameOf(meal.dish.name, lang, meal.dishRef)), h("span", { class: "n" }, ` · ${formatNumber(meal.servings, lang, 0)}`)),
    ),
  );

  const c = meal.components.find((x) => x.ingredientRef === ingredientRef);
  if (!c) {
    root.append(h("div", { class: "card empty" }, `${tt(lang, "notFound.ingredient")}: ${ingredientRef}`));
    return;
  }

  const related = relatedSteps(c, meal.steps);
  const firstClip = related.find((s) => s.clip)?.clip;
  const q = formatQty(c.qty, lang);
  const img = c.prep?.image ?? c.image;

  const card = h("div", { class: "card pc" });
  if (img) {
    const media = h("div", { class: "media" }, h("img", { src: imgSrc(img.src), alt: "" }), h("div", { class: "ov" }));
    if (firstClip) {
      const srcText = `${tt(lang, "from.video")} ${mmss(firstClip.start)}`;
      media.append(
        firstClip.videoUrl
          ? h("a", { class: "src", href: clipHref(firstClip.videoUrl, firstClip.start), target: "_blank", rel: "noopener" }, srcText)
          : h("span", { class: "src" }, srcText),
      );
    }
    media.append(h("div", { class: "qv num" }, q.value, q.unit ? h("small", {}, q.unit) : null));
    card.append(media);
  } else {
    card.append(
      h(
        "div",
        { class: "ph" },
        h("b", { class: "num" }, q.value, q.unit ? " " : null, q.unit ? h("span", {}, q.unit) : null),
        h("span", {}, tt(lang, "photo.none.long")),
      ),
    );
  }

  const cap = h("div", { class: "cap" }, h("h2", { class: "name" }, nameOf(c.name, lang, c.ingredientRef)));
  if (c.prep) {
    const tech = h("div", { class: "tech" });
    if (c.prep.techniqueMissing) tech.append(h("span", { class: "chip warn" }, `${tt(lang, "technique.missing")}: ${c.prep.techniqueRef}`));
    else tech.append(h("span", { class: "chip accent" }, nameOf(c.prep.technique.name, lang, c.prep.techniqueRef)));
    if (c.prep.size) tech.append(h("span", { class: "chip" }, c.prep.size));
    tech.append(h("span", { class: "chip ghost" }, tt(lang, `group.${c.group}`)));
    cap.append(tech);
    const note = pick(c.prep.note, lang);
    if (note) cap.append(h("div", { class: "note" }, note));
  } else if (!c.isSeasoning) {
    cap.append(h("div", { class: "tech" }, h("span", { class: "chip ghost" }, tt(lang, "prep.none"))));
  } else {
    cap.append(h("div", { class: "tech" }, h("span", { class: "chip ghost" }, tt(lang, "group.at-hand"))));
  }
  card.append(cap);
  root.append(card);

  // 该配料相关步骤；没有相关的就给全部步骤（不留空）
  if (related.length > 0) root.append(...stepsSection(related, lang, tt(lang, "steps.related")));
  else root.append(...stepsSection(meal.steps, lang, tt(lang, "steps.all")));
}
