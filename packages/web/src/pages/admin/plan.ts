/**
 * /admin/plan[/<planId>] —— 排菜单（#21；docs/specs/v03-admin-frontend-contract.md §4.2）。
 *
 * 屏上有什么（§4.2）：周导航 ‹ 第 N 周 › · 按天卡片（午 / 晚，本周任一天排过 breakfast 就多一行早餐）· 点一格展开
 * （选菜 + 份数步进器 ±10 / 长按 ±50 + 「上周排的：X」提示）· 右上角 日 / 周 / 月 原生 <select> · 复制上周（可撤销）·
 * 采购单预览（浏览器内跑 @canteenos/core，不落库）· 保存本周 · 顶部「粘贴导入」入口。
 *
 * 数据来源：api.getPlan(planId)（404 → null → 空周新建态）；store.getDraftPlan(planId) 优先于服务端内容（#22 导入 / 本屏复制上周）；
 * api.getPlan(上一周) 供「复制上周」与「上周排的」；api.getCatalog() 供选菜与预览；三关卡在浏览器内用 core 的 readiness() 现算
 * （不用 build.json.readiness —— 那是上次发布的快照）。「上周实际」第一轮用上周计划数代替，界面明确标注（执行简报 §3 v0.3）。
 *
 * 推论 A（硬条）：语言切换 = 整页重新 render。本屏所有未提交的输入（工作副本、展开的格、搜索词、视图、日视图的日期……）
 * 都在模块级变量 `state` 里，render 时按 planId 回填；render 只在 planId 变了时才重建 state。
 *
 * 周号（D-06）：planId = `week-<ISO 周号>`（不补零；week-41 → 2026-10-05，与 data/menu-plans/week-41.json 一致）。
 * 换算只有 core 一份：isoWeekOf / weekStartOfPlanId / planIdOfDate 从 @canteenos/core 引；planId 里没有年份，
 * weekStartOfPlanId 在今天所在 ISO 年的前后各一年里取离今天最近的那个周一（年末排下年第 1 周、年初看上年第 52 周都对）。
 *
 * 分包（§3.6）：本文件由 pages/admin.ts 动态 import，@canteenos/core 的运行时（expand / renderPurchaseOrders / readiness …）
 * 在这里静态 import —— 它只被本屏引用，所以只进本屏的分包，不进首屏。
 *
 * 只改本文件与 plan.css（§3.3）；缺的小部件（选菜列表、月历、预览表）都写在这里（§3.4 规则 0）。
 * 文本一律 textContent（dom.ts 的 h()）；样式全部 .adm-plan 前缀；文案三语（uk 初稿待帮厨校对）。
 */
import "./plan.css";

import {
  expand,
  formatAllPurchaseOrdersText,
  isoWeekOf,
  planIdOfDate,
  readiness,
  renderPurchaseOrders,
  type Dish,
  type I18nString,
  type MealType,
  type MenuPlan,
  type MenuPlanMeal,
  type Money,
  type PendingLine,
  type ProcurementIssue,
  type PurchaseOrder,
  type Quantity,
  type Readiness,
  weekStartOfPlanId,
} from "@canteenos/core";

import {
  adm,
  apiMessage,
  applyFieldErrors,
  busy,
  button,
  clearFieldErrors,
  errorCard,
  fieldRow,
  notice,
  sessionExpired,
  stepper,
  topBar,
} from "../../admin/kit";
import { clearDraftPlan, getDraftPlan, getDraftSource, setDraftPlan, undoDraftPlan, type DraftSource } from "../../admin/store";
import { getApi } from "../../api/client";
import { isApiError, type Catalog, type FieldError } from "../../api/types";
import { h, replace } from "../../dom";
import { LANG_TAG, pick, type Lang } from "../../i18n";
import type { PageCtx } from "../../types";
import { adminHref } from "../admin";

// ---------------------------------------------------------------------------
// 文案（§5.4 最小集 + 本屏自用；zh 权威，en 直译，uk 初稿待帮厨校对）
// ---------------------------------------------------------------------------

const T = {
  "plan.title": { uk: "Меню на тиждень", zh: "排菜单", en: "Plan the menu" },
  "plan.week": { uk: "Тиждень {n}", zh: "第 {n} 周", en: "Week {n}" },
  "plan.prevWeek": { uk: "Попередній тиждень", zh: "上一周", en: "Previous week" },
  "plan.nextWeek": { uk: "Наступний тиждень", zh: "下一周", en: "Next week" },
  "plan.view": { uk: "Вигляд", zh: "视图", en: "View" },
  "plan.view.day": { uk: "День", zh: "日", en: "Day" },
  "plan.view.week": { uk: "Тиждень", zh: "周", en: "Week" },
  "plan.view.month": { uk: "Місяць", zh: "月", en: "Month" },
  "plan.meal.breakfast": { uk: "Сніданок", zh: "早餐", en: "Breakfast" },
  "plan.meal.lunch": { uk: "Обід", zh: "午餐", en: "Lunch" },
  "plan.meal.dinner": { uk: "Вечеря", zh: "晚餐", en: "Dinner" },
  "plan.mealShort.breakfast": { uk: "Сн", zh: "早", en: "B" },
  "plan.mealShort.lunch": { uk: "Об", zh: "午", en: "L" },
  "plan.mealShort.dinner": { uk: "Вч", zh: "晚", en: "D" },
  "plan.dow.0": { uk: "Пн", zh: "周一", en: "Mon" },
  "plan.dow.1": { uk: "Вт", zh: "周二", en: "Tue" },
  "plan.dow.2": { uk: "Ср", zh: "周三", en: "Wed" },
  "plan.dow.3": { uk: "Чт", zh: "周四", en: "Thu" },
  "plan.dow.4": { uk: "Пт", zh: "周五", en: "Fri" },
  "plan.dow.5": { uk: "Сб", zh: "周六", en: "Sat" },
  "plan.dow.6": { uk: "Нд", zh: "周日", en: "Sun" },
  "plan.empty": { uk: "Цього тижня ще нічого не заплановано", zh: "这周还没排", en: "Nothing planned this week yet" },
  "plan.empty.hint": {
    uk: "Можна скопіювати минулий тиждень або вставити повідомлення з WeChat",
    zh: "可以从上周复制，或者把微信里那段话粘进来",
    en: "Copy last week, or paste in the WeChat message",
  },
  "plan.copyLastWeek": { uk: "Скопіювати минулий тиждень", zh: "复制上周", en: "Copy last week" },
  "plan.copyLastWeek.none": { uk: "Минулого тижня плану не було", zh: "上周没有计划", en: "There was no plan last week" },
  "plan.copyLastWeek.confirm": {
    uk: "Це замінить {n} страв, уже запланованих на цей тиждень. Продовжити?",
    zh: "会覆盖这周已排的 {n} 餐，继续？",
    en: "This will replace the {n} meals already planned this week. Continue?",
  },
  "plan.copied": { uk: "Скопійовано {n} страв з минулого тижня · ще не збережено", zh: "已复制上周 {n} 餐 · 还没保存", en: "Copied {n} meals from last week · not saved yet" },
  "plan.import": { uk: "Вставити з тексту", zh: "粘贴导入", en: "Paste import" },
  "plan.imported": { uk: "Імпортовано {n} рядків · ще не збережено", zh: "已导入 {n} 行 · 还没保存", en: "Imported {n} lines · not saved yet" },
  "plan.unsaved": { uk: "Є незбережені зміни", zh: "有改动还没保存", en: "Unsaved changes" },
  "plan.planned": { uk: "Заплановано страв: {n}", zh: "已排 {n} 餐", en: "{n} planned" },
  "plan.outside": {
    uk: "Ще {n} страв поза датами цього тижня — при збереженні вони залишаться",
    zh: "还有 {n} 餐不在这周的日期里，保存时会原样保留",
    en: "{n} more meals fall outside this week's dates — they're kept on save",
  },
  "plan.pickDish": { uk: "Обрати страву", zh: "选菜", en: "Pick a dish" },
  "plan.addDish": { uk: "Додати страву", zh: "加一道菜", en: "Add a dish" },
  "plan.searchDish": { uk: "Пошук страви", zh: "搜菜名", en: "Search dishes" },
  "plan.noDish": { uk: "Нічого не заплановано", zh: "还没排", en: "Nothing planned" },
  "plan.noMatch": { uk: "Такої страви не знайдено", zh: "没有叫这个名字的菜", en: "No dish matches" },
  "plan.servings": { uk: "Порції", zh: "份数", en: "Servings" },
  "plan.servings.unit": { uk: "порц.", zh: "份", en: "srv" },
  "plan.servings.aria": { uk: "Порції: {day}, {meal}", zh: "{day} {meal} 的份数", en: "Servings for {day} {meal}" },
  "plan.lastWeek": { uk: "Минулого тижня заплановано: {n}", zh: "上周排的：{n}", en: "Last week planned: {n}" },
  "plan.lastWeek.note": {
    uk: "Даних «скільки насправді приготували» ще немає — це планова кількість минулого тижня",
    zh: "本轮还没有「实际做了多少」的数，这里是上周计划数",
    en: "There's no “actually cooked” figure yet — this is last week's planned number",
  },
  "plan.ready.teach": { uk: "Можна навчити", zh: "能教", en: "Teachable" },
  "plan.ready.plan": { uk: "Можна планувати", zh: "能排", en: "Plannable" },
  "plan.ready.procure": { uk: "Можна закупити", zh: "能采", en: "Purchasable" },
  "plan.ready.cannotPlan": { uk: "Цю страву ще не можна планувати", zh: "这道菜还排不了", en: "This dish can't be planned yet" },
  "plan.dish.draft": { uk: "Чернетка", zh: "草稿", en: "Draft" },
  "plan.dish.archived": { uk: "В архіві", zh: "已归档", en: "Archived" },
  "plan.dish.missing": { uk: "Такої страви немає в базі", zh: "库里没有这道菜", en: "Not in the dish library" },
  "plan.prep": { uk: "Підготовка", zh: "切配", en: "Prep" },
  "plan.remove": { uk: "Прибрати з цього прийому їжі", zh: "从这餐去掉", en: "Remove from this meal" },
  "plan.catalog.loading": { uk: "Читаю інгредієнти та страви…", zh: "正在读食材和菜…", en: "Loading ingredients and dishes…" },
  "plan.catalog.failed": {
    uk: "Інгредієнти та страви не завантажилися — вибір страв і попередній перегляд закупівлі поки недоступні",
    zh: "食材和菜没读出来，选菜和采购单预览先用不了",
    en: "Couldn't load ingredients and dishes — picking dishes and the purchase preview are unavailable for now",
  },
  "plan.preview": { uk: "Попередній перегляд закупівлі", zh: "采购单预览", en: "Purchase preview" },
  "plan.preview.note": { uk: "Лише перегляд — нічого не зберігається", zh: "只是看看，不会存进去", en: "Just a look — nothing is saved" },
  "plan.preview.failed": { uk: "Не вдалося порахувати, тому що:", zh: "算不出来，因为：", en: "Can't calculate, because:" },
  "plan.preview.empty": { uk: "Ще нічого не заплановано — нічого рахувати", zh: "这周还没排菜，没什么可算的", en: "Nothing planned yet — nothing to calculate" },
  "plan.preview.ingredient": { uk: "Інгредієнт", zh: "食材", en: "Ingredient" },
  "plan.preview.packs": { uk: "Упаковок", zh: "件数", en: "Packs" },
  "plan.preview.qty": { uk: "Кількість", zh: "数量", en: "Quantity" },
  "plan.preview.amount": { uk: "Сума", zh: "金额", en: "Amount" },
  "plan.preview.total": { uk: "Разом", zh: "合计", en: "Total" },
  "plan.preview.pending": { uk: "Потрібно доповнити (не в замовленні)", zh: "待补全（未计入采购单）", en: "Incomplete (not in the order)" },
  "plan.preview.text": { uk: "Текст для WeChat", zh: "微信文本", en: "WeChat text" },
  "plan.preview.close": { uk: "Закрити перегляд", zh: "关闭预览", en: "Close preview" },
  "plan.save": { uk: "Зберегти тиждень", zh: "保存本周", en: "Save this week" },
  "plan.saved.warnings": { uk: "Примітки кабінету: {w}", zh: "后台提醒：{w}", en: "Back-office notes: {w}" },
  "plan.warn.dangling-ref": { uk: "деяких страв немає в базі", zh: "有菜在库里找不到", en: "some dishes aren't in the library" },
  "plan.warn.plan-id-shape": { uk: "номер тижня має незвичну форму", zh: "周号的形状不对", en: "the week id has an unusual shape" },
  "plan.conflict": { uk: "Хтось щойно змінив це — перечитайте і спробуйте ще раз", zh: "有人刚改过，刷新后重试", en: "Someone just changed this — reload and try again" },
  "plan.reload": { uk: "Перечитати", zh: "重新读取", en: "Reload" },
  "plan.reloaded": { uk: "Перечитано; незбережені зміни відкинуто", zh: "已重新读取，刚才没保存的改动已丢弃", en: "Reloaded; unsaved changes were discarded" },
  "plan.err.servings": { uk: "Щонайменше 1 порція", zh: "份数至少 1", en: "At least 1 serving" },
  "plan.err.emptyWeek": { uk: "Ще нічого не заплановано — нічого зберігати", zh: "这周还没排任何一餐，没什么可保存的", en: "Nothing planned yet — nothing to save" },
  "plan.breakfast.show": { uk: "Показати рядок сніданку", zh: "加早餐行", en: "Show breakfast row" },
  "plan.day.prev": { uk: "Попередній день", zh: "前一天", en: "Previous day" },
  "plan.day.next": { uk: "Наступний день", zh: "后一天", en: "Next day" },
  "plan.month.readonly": {
    uk: "Місячний вигляд лише показує, що заплановано; змінювати тут не можна",
    zh: "月视图只看有没有排，不能改",
    en: "Month view only shows what's planned; nothing can be edited here",
  },
  "plan.month.loading": { uk: "Читаю інші тижні цього місяця…", zh: "正在读这个月的其它几周…", en: "Loading the other weeks of this month…" },
  "plan.month.failed": { uk: "Деякі тижні не вдалося прочитати", zh: "有几周没读出来", en: "Some weeks couldn't be loaded" },
  "plan.month.planned": { uk: "{n} страв", zh: "{n} 餐", en: "{n} meals" },
} as const satisfies Record<string, Record<Lang, string>>;

type Key = keyof typeof T;

/** 当前语言：render 时从 ctx.lang 取；异步回调里的 paint() 也用它（语言切换后新 render 会先更新它）。kit 的 adm() 一律显式传它，不依赖 i18n 模块内部状态 */
let lang: Lang = "uk";

function tt(key: Key, params?: Record<string, string | number>): string {
  let s: string = T[key][lang];
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

const MEAL_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner"];
const MEAL_KEY: Record<MealType, Key> = { breakfast: "plan.meal.breakfast", lunch: "plan.meal.lunch", dinner: "plan.meal.dinner" };
const MEAL_SHORT_KEY: Record<MealType, Key> = { breakfast: "plan.mealShort.breakfast", lunch: "plan.mealShort.lunch", dinner: "plan.mealShort.dinner" };
const DOW_KEY: readonly Key[] = ["plan.dow.0", "plan.dow.1", "plan.dow.2", "plan.dow.3", "plan.dow.4", "plan.dow.5", "plan.dow.6"];
const WARN_KEY: Partial<Record<string, Key>> = { "dangling-ref": "plan.warn.dangling-ref", "plan-id-shape": "plan.warn.plan-id-shape" };

/** 新加一道菜时的默认份数：上周同餐次 → 同一格里已有的那道 → 这个数 */
const DEFAULT_SERVINGS = 100;

// ---------------------------------------------------------------------------
// 周号 ↔ 日期（D-06：换算只有 core 一份，这里只剩 ISO 日期字符串的小工具；全部按 UTC 日历算，避免时区把日期挪一天）
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const PLAN_ID_RE = /^week-(\d{1,2})$/;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function shiftIso(s: string, days: number): string {
  const d = parseIso(s);
  return d ? isoDate(new Date(d.getTime() + days * DAY_MS)) : s;
}

/** 本地「今天」，落到 UTC 午夜的 Date（只用它的日历部分） */
function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

/** 周号 → planId 只是拼字符串（上一周 / 下一周导航、月历格子）；形状（不补零）以 core 的 planIdOfDate 为准 */
function planIdOfWeek(n: number): string | null {
  return n >= 1 && n <= 53 ? `week-${n}` : null;
}

/** `#/admin/plan` 不带 planId 时的「当前周」（D-06，core 的 planIdOfDate）；算不出来就退回 ctx.planId */
function currentPlanId(fallback: string | null): string {
  return planIdOfDate(isoDate(todayUtc())) ?? fallback ?? "week-1";
}

interface WeekInfo {
  /** ISO 周号；planId 不是 week-NN 形状时 = 今天所在周（日期照今天所在周画，planId 原样保留） */
  n: number;
  year: number;
  monday: Date;
  /** 周一 … 周日，ISO 日期 */
  days: string[];
}

function weekInfo(planId: string): WeekInfo {
  const today = isoDate(todayUtc());
  const m = PLAN_ID_RE.exec(planId);
  const cur = isoWeekOf(today);
  const n = m ? Number(m[1]) : (cur?.week ?? 1);
  // core：planId 里没有年份，在今天所在 ISO 年前后各一年里取离今天最近的那个周一；算不出（形状不对）就退回今天所在周
  const mondayIso = weekStartOfPlanId(`week-${n}`, today);
  const monday = (mondayIso ? parseIso(mondayIso) : null) ?? todayUtc();
  const year = isoWeekOf(isoDate(monday))?.year ?? cur?.year ?? monday.getUTCFullYear();
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(isoDate(new Date(monday.getTime() + i * DAY_MS)));
  return { n, year, monday, days };
}

/** 10.05 这种短日期 */
function fmtMd(iso: string): string {
  return iso.length >= 10 ? `${iso.slice(5, 7)}.${iso.slice(8, 10)}` : iso;
}

// ---------------------------------------------------------------------------
// 屏内状态（推论 A：全部在模块级，语言切换重新 render 时按 planId 回填）
// ---------------------------------------------------------------------------

type View = "day" | "week" | "month";

/** 顶部横幅。文案是 thunk：paint 时才按当前语言取值，切语言后横幅也跟着换语言（推论 A） */
interface Banner {
  kind: "ok" | "warn" | "info";
  text: () => string;
  /** 右侧链接（已存好 → 去发布） */
  action?: { label: () => string; href: string };
  /** 右侧「撤销」（复制上周 / 导入草稿） */
  undo?: boolean;
}

interface ErrorBox {
  /** thunk：worker 的 message 原样；非 ApiError 时是本地文案，按当前语言取 */
  text: () => string;
  /** 409：给「重新读取」 */
  reload?: boolean;
  /** 其它：给「重试」 */
  retry?: () => void;
}

interface PreviewResult {
  pos: PurchaseOrder[];
  pending: PendingLine[];
  issues: ProcurementIssue[];
  text: string;
  /** 引擎抛异常时的原话 */
  error: string | null;
}

interface ScreenState {
  planId: string;
  week: WeekInfo;
  /** 工作副本（未保存的一切都在这里） */
  plan: MenuPlan;
  /** 服务端当前版本的 blobSha（保存时 If-Match）；新周 = null */
  blobSha: string | null;
  dirty: boolean;
  loaded: boolean;
  loading: boolean;
  loadError: unknown;
  /** 最近一次从 store 采纳的草稿（序列化），用来判断 store 里是不是来了新的一份（#22 导入后回到本屏） */
  draftJson: string | null;
  draftAdopted: boolean;
  /** 采纳草稿之前的工作副本：store 撤销回到「没有草稿」时用它 */
  stash: { plan: MenuPlan; dirty: boolean } | null;
  /** undefined = 还没读；null = 上周没有 */
  lastWeek: MenuPlan | null | undefined;
  catalog: Catalog | null;
  catalogLoading: boolean;
  catalogError: unknown;
  ready: Map<string, Readiness>;
  techNames: Map<string, I18nString>;
  view: View;
  dayIndex: number;
  /** 展开的格：`${date}/${mealType}/${dishRef}`；`${date}/${mealType}/+` = 该餐次的「加一道菜」选菜器 */
  open: string | null;
  /** 展开的格里是否正在换菜 */
  picking: boolean;
  search: string;
  showBreakfast: boolean;
  banner: Banner | null;
  error: ErrorBox | null;
  warnings: string[];
  fieldErrors: readonly FieldError[] | null;
  preview: PreviewResult | null;
  saving: boolean;
  monthPlans: Map<string, MenuPlan | null>;
  monthLoading: boolean;
  monthFailed: number;
}

let state: ScreenState | null = null;
/** 最近一次 render 的根元素；异步回来时只往它里面画，且它已摘掉就不画 */
let root: HTMLElement | null = null;

function clone<Tv>(v: Tv): Tv {
  return structuredClone(v);
}

function emptyPlan(week: WeekInfo): MenuPlan {
  return { schemaVersion: "2", dateRange: { start: week.days[0] ?? "", end: week.days[6] ?? "" }, meals: [] };
}

function sortMeals(meals: MenuPlanMeal[]): void {
  meals.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType)));
}

function mealKey(m: MenuPlanMeal): string {
  return `${m.date}/${m.mealType}/${m.dishRef}`;
}

function freshState(planId: string): ScreenState {
  const week = weekInfo(planId);
  const todayIdx = week.days.indexOf(isoDate(todayUtc()));
  return {
    planId,
    week,
    plan: emptyPlan(week),
    blobSha: null,
    dirty: false,
    loaded: false,
    loading: false,
    loadError: null,
    draftJson: null,
    draftAdopted: false,
    stash: null,
    lastWeek: undefined,
    catalog: null,
    catalogLoading: false,
    catalogError: null,
    ready: new Map(),
    techNames: new Map(),
    view: "week",
    dayIndex: todayIdx >= 0 ? todayIdx : 0,
    open: null,
    picking: false,
    search: "",
    showBreakfast: false,
    banner: null,
    error: null,
    warnings: [],
    fieldErrors: null,
    preview: null,
    saving: false,
    monthPlans: new Map(),
    monthLoading: false,
    monthFailed: 0,
  };
}

/** 草稿来源 → 顶部黄条（可撤销）：已导入 N 行 / 已复制上周 N 餐 / 有改动还没保存 */
function draftBanner(source: DraftSource | null, n: number): Banner {
  if (source === "import") return { kind: "warn", text: () => tt("plan.imported", { n }), undo: true };
  if (source === "copy-last-week") return { kind: "warn", text: () => tt("plan.copied", { n }), undo: true };
  return { kind: "warn", text: () => tt("plan.unsaved"), undo: true };
}

/** store 里的草稿优先于服务端内容（§4.2 数据来源）；同一份只采纳一次，之后屏内的改动不会被它覆盖 */
function adoptDraft(s: ScreenState): void {
  const draft = getDraftPlan(s.planId);
  if (!draft) return;
  const json = JSON.stringify(draft);
  if (json === s.draftJson) return;
  if (!s.draftAdopted) s.stash = { plan: clone(s.plan), dirty: s.dirty };
  sortMeals(draft.meals);
  s.plan = draft;
  s.draftJson = json;
  s.draftAdopted = true;
  s.dirty = true;
  s.open = null;
  s.picking = false;
  s.preview = null;
  const source = getDraftSource(s.planId);
  s.banner = draftBanner(source, draft.meals.length);
}

function markDirty(s: ScreenState): void {
  s.dirty = true;
  s.warnings = [];
  s.preview = null;
  if (s.banner?.kind === "ok") s.banner = null;
}

let unloadBound = false;
function bindUnload(): void {
  if (unloadBound) return;
  unloadBound = true;
  window.addEventListener("beforeunload", (ev) => {
    if (state?.dirty && root?.isConnected) {
      ev.preventDefault();
      ev.returnValue = "";
    }
  });
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export async function render(el: HTMLElement, ctx: PageCtx, rest: string): Promise<void> {
  lang = ctx.lang;
  bindUnload();
  const planId = rest || currentPlanId(ctx.planId);
  root = h("div", { class: "adm adm-plan" });
  el.append(root);
  if (!state || state.planId !== planId) state = freshState(planId);
  const s = state;
  adoptDraft(s);
  paint();
  if (!s.loaded && !s.loading) await load(s);
}

// ---------------------------------------------------------------------------
// 读：本周 / 上周 / catalog / 月视图的其它周
// ---------------------------------------------------------------------------

function expired(): void {
  if (root) sessionExpired(root, lang);
  state = null;
}

async function load(s: ScreenState): Promise<void> {
  s.loading = true;
  s.loadError = null;
  try {
    const src = await getApi().getPlan(s.planId);
    if (state !== s) return;
    s.blobSha = src?.blobSha ?? null;
    const server = src ? clone(src.content) : emptyPlan(s.week);
    sortMeals(server.meals);
    if (s.draftAdopted) {
      if (s.stash) s.stash = { plan: server, dirty: false };
    } else {
      s.plan = server;
    }
    s.loaded = true;
  } catch (err) {
    if (state !== s) return;
    if (isApiError(err) && err.status === 401) {
      expired();
      return;
    }
    s.loadError = err;
  } finally {
    if (state === s) s.loading = false;
  }
  paint();
  if (s.lastWeek === undefined) void loadLastWeek(s);
  if (!s.catalog && !s.catalogLoading) void loadCatalog(s);
}

async function loadLastWeek(s: ScreenState): Promise<void> {
  const prevId = planIdOfWeek(s.week.n - 1);
  if (!prevId) {
    s.lastWeek = null;
    paint();
    return;
  }
  try {
    const src = await getApi().getPlan(prevId);
    if (state !== s) return;
    s.lastWeek = src ? src.content : null;
  } catch (err) {
    if (state !== s) return;
    if (isApiError(err) && err.status === 401) {
      expired();
      return;
    }
    s.lastWeek = null; // 读不到当作没有：只影响「复制上周」与提示，不阻塞排菜
  }
  paint();
}

async function loadCatalog(s: ScreenState): Promise<void> {
  s.catalogLoading = true;
  s.catalogError = null;
  paint();
  try {
    const c = await getApi().getCatalog();
    if (state !== s) return;
    s.catalog = c;
    s.ready = new Map(Object.entries(c.dishes).map(([id, d]) => [id, readiness(d, c.ingredients)]));
    s.techNames = new Map(c.techniques.map((t) => [t.id, t.name]));
  } catch (err) {
    if (state !== s) return;
    if (isApiError(err) && err.status === 401) {
      expired();
      return;
    }
    s.catalogError = err;
  } finally {
    if (state === s) s.catalogLoading = false;
  }
  paint();
}

async function loadMonth(s: ScreenState, ids: readonly string[]): Promise<void> {
  const todo = ids.filter((id) => id !== s.planId && !s.monthPlans.has(id));
  if (todo.length === 0 || s.monthLoading) return;
  s.monthLoading = true;
  for (const id of todo) {
    try {
      const src = await getApi().getPlan(id);
      if (state !== s) return;
      s.monthPlans.set(id, src ? src.content : null);
    } catch (err) {
      if (state !== s) return;
      if (isApiError(err) && err.status === 401) {
        expired();
        return;
      }
      s.monthPlans.set(id, null);
      s.monthFailed++;
    }
  }
  s.monthLoading = false;
  paint();
}

async function reload(s: ScreenState): Promise<void> {
  clearDraftPlan(s.planId);
  s.error = null;
  s.loaded = false;
  s.dirty = false;
  s.draftAdopted = false;
  s.draftJson = null;
  s.stash = null;
  s.open = null;
  s.picking = false;
  s.preview = null;
  s.warnings = [];
  s.banner = { kind: "info", text: () => tt("plan.reloaded") };
  paint();
  await load(s);
}

// ---------------------------------------------------------------------------
// 动作：离开 / 换周 / 复制上周 / 撤销 / 选菜 / 保存 / 预览
// ---------------------------------------------------------------------------

/** 自己的返回 / 导航按钮：有未保存改动先二次确认（§4.0）；确认离开 = 丢弃 */
function leave(href: string): void {
  const s = state;
  if (s?.dirty) {
    if (!window.confirm(adm("adm.leave.confirm", undefined, lang))) return;
    state = null;
  }
  location.hash = href;
}

function goWeek(n: number): void {
  const id = planIdOfWeek(n);
  if (id) leave(adminHref("plan", id));
}

function lastWeekServings(s: ScreenState, date: string, mealType: MealType): number | null {
  const lw = s.lastWeek;
  if (!lw) return null;
  const prevDate = shiftIso(date, -7);
  let sum = 0;
  let found = false;
  for (const m of lw.meals) {
    if (m.date === prevDate && m.mealType === mealType) {
      sum += m.plannedServings;
      found = true;
    }
  }
  return found ? sum : null;
}

function defaultServings(s: ScreenState, date: string, mealType: MealType): number {
  const lw = lastWeekServings(s, date, mealType);
  if (lw !== null) return lw;
  const sibling = s.plan.meals.find((m) => m.date === date && m.mealType === mealType);
  return sibling ? sibling.plannedServings : DEFAULT_SERVINGS;
}

function copyLastWeek(): void {
  const s = state;
  const lw = s?.lastWeek;
  if (!s || !lw) return;
  if (s.plan.meals.length > 0 && !window.confirm(tt("plan.copyLastWeek.confirm", { n: s.plan.meals.length }))) return;
  const meals = lw.meals.map((m) => ({ ...m, date: shiftIso(m.date, 7) }));
  sortMeals(meals);
  const next: MenuPlan = { schemaVersion: "2", dateRange: { start: s.week.days[0] ?? "", end: s.week.days[6] ?? "" }, meals };
  if (s.plan.name) next.name = s.plan.name;
  const margin = s.plan.margin ?? lw.margin;
  if (margin !== undefined) next.margin = margin;
  if (!s.draftAdopted) s.stash = { plan: clone(s.plan), dirty: s.dirty };
  setDraftPlan(s.planId, next, "copy-last-week");
  s.plan = clone(next);
  s.draftJson = JSON.stringify(getDraftPlan(s.planId));
  s.draftAdopted = true;
  s.open = null;
  s.picking = false;
  markDirty(s);
  s.banner = draftBanner("copy-last-week", meals.length);
  paint();
}

/** 一层撤销（store.undoDraftPlan）：回到上一份草稿，或回到采纳草稿之前的工作副本 */
function undo(): void {
  const s = state;
  if (!s) return;
  undoDraftPlan(s.planId);
  const d = getDraftPlan(s.planId);
  s.open = null;
  s.picking = false;
  s.preview = null;
  if (d) {
    sortMeals(d.meals);
    s.plan = d;
    s.draftJson = JSON.stringify(d);
    s.dirty = true;
    s.banner = draftBanner(getDraftSource(s.planId), d.meals.length);
  } else {
    s.plan = s.stash ? s.stash.plan : emptyPlan(s.week);
    s.dirty = s.stash ? s.stash.dirty : false;
    s.stash = null;
    s.draftJson = null;
    s.draftAdopted = false;
    s.banner = null;
  }
  paint();
}

function choose(s: ScreenState, index: number | null, date: string, mealType: MealType, dishId: string): void {
  if (index === null) {
    const existing = s.plan.meals.find((m) => m.date === date && m.mealType === mealType && m.dishRef === dishId);
    if (existing) {
      s.open = mealKey(existing);
    } else {
      const meal: MenuPlanMeal = { date, mealType, dishRef: dishId, plannedServings: defaultServings(s, date, mealType) };
      s.plan.meals.push(meal);
      sortMeals(s.plan.meals);
      s.open = mealKey(meal);
      markDirty(s);
    }
  } else {
    const m = s.plan.meals[index];
    if (m && m.dishRef !== dishId) {
      m.dishRef = dishId;
      markDirty(s);
    }
    if (m) s.open = mealKey(m);
  }
  s.picking = false;
  s.search = "";
  paint();
}

function removeMeal(s: ScreenState, index: number): void {
  s.plan.meals.splice(index, 1);
  s.open = null;
  s.picking = false;
  markDirty(s);
  paint();
}

/** 保存前的本地校验（§4.2 bullet 7）：份数 < 1、菜品不可排 → 逐字段标黄；catalog 没读到就不查菜 */
function localErrors(s: ScreenState): FieldError[] {
  const errs: FieldError[] = [];
  s.plan.meals.forEach((m, i) => {
    if (!(Number.isInteger(m.plannedServings) && m.plannedServings >= 1)) {
      errs.push({ path: `/meals/${i}/plannedServings`, code: "minimum", message: tt("plan.err.servings") });
    }
    if (s.catalog) {
      if (!s.catalog.dishes[m.dishRef]) errs.push({ path: `/meals/${i}/dishRef`, code: "enum", message: tt("plan.dish.missing") });
      else if (!s.ready.get(m.dishRef)?.canPlan) errs.push({ path: `/meals/${i}/dishRef`, code: "enum", message: tt("plan.ready.cannotPlan") });
    }
  });
  return errs;
}

/** 把第一处错误所在的格展开（并切到能看见它的视图），好让 applyFieldErrors 精确命中 */
function openFirstError(s: ScreenState, errs: readonly FieldError[]): void {
  for (const e of errs) {
    const m = /^\/meals\/(\d+)(?:\/([A-Za-z]+))?/.exec(e.path);
    if (!m) continue;
    const meal = s.plan.meals[Number(m[1])];
    if (!meal) continue;
    s.open = mealKey(meal);
    s.picking = m[2] === "dishRef";
    if (s.view === "month") s.view = "week";
    const di = s.week.days.indexOf(meal.date);
    if (s.view === "day" && di >= 0) s.dayIndex = di;
    return;
  }
}

/** 保存用的计划：只带 schema 认识的字段（meals[] 与顶层都是 additionalProperties: false） */
function toSavePlan(s: ScreenState): MenuPlan {
  const out: MenuPlan = {
    schemaVersion: "2",
    meals: s.plan.meals.map((m) => {
      const o: MenuPlanMeal = { date: m.date, mealType: m.mealType, dishRef: m.dishRef, plannedServings: m.plannedServings };
      if (m.serviceWindow) o.serviceWindow = m.serviceWindow;
      return o;
    }),
  };
  if (s.plan.name) out.name = s.plan.name;
  if (s.plan.dateRange) out.dateRange = s.plan.dateRange;
  if (s.plan.margin !== undefined) out.margin = s.plan.margin;
  return out;
}

async function save(btn: HTMLButtonElement | null): Promise<void> {
  const s = state;
  if (!s || !root || s.saving || !s.loaded) return;
  clearFieldErrors(root);
  s.error = null;
  s.fieldErrors = null;
  if (s.plan.meals.length === 0) {
    s.banner = { kind: "warn", text: () => tt("plan.err.emptyWeek") };
    paint();
    return;
  }
  const local = localErrors(s);
  if (local.length > 0) {
    openFirstError(s, local);
    paint();
    if (root) applyFieldErrors(root, local);
    return;
  }
  const body = toSavePlan(s);
  s.saving = true;
  const done = btn ? busy(btn, adm("adm.saving", undefined, lang)) : (): void => undefined;
  try {
    const res = await getApi().savePlan(s.planId, body, s.blobSha ? { ifMatch: s.blobSha } : undefined);
    if (state !== s) return;
    s.blobSha = res.blobSha;
    s.plan = body;
    s.dirty = false;
    clearDraftPlan(s.planId);
    s.draftJson = null;
    s.draftAdopted = false;
    s.stash = null;
    s.warnings = res.warnings.filter((w) => w !== "no-if-match");
    const unchanged = res.unchanged;
    s.banner = {
      kind: "ok",
      text: () => (unchanged ? adm("adm.saved.unchanged", undefined, lang) : adm("adm.saved", undefined, lang)),
      action: { label: () => adm("adm.saved.goPublish", undefined, lang), href: adminHref("publish") },
    };
  } catch (err) {
    if (state !== s) return;
    if (isApiError(err) && err.status === 401) {
      done();
      s.saving = false;
      expired();
      return;
    }
    if (isApiError(err) && err.hasFieldErrors) {
      s.fieldErrors = err.errors;
      openFirstError(s, err.errors);
    } else if (isApiError(err) && err.status === 409) {
      const msg = err.message;
      s.error = { text: () => msg || tt("plan.conflict"), reload: true };
    } else {
      s.error = { text: () => apiMessage(err, lang), retry: () => void save(null) };
    }
  } finally {
    done();
    if (state === s) s.saving = false;
  }
  paint();
  if (s.fieldErrors && root) {
    applyFieldErrors(root, s.fieldErrors);
    s.fieldErrors = null;
  }
}

/** 采购单预览：本地跑 core 引擎，不落库（§4.2 bullet 5）；引擎的 issues / pending 原样列出 */
function runPreview(): void {
  const s = state;
  if (!s?.catalog) return;
  const plan = toSavePlan(s);
  try {
    const { lines, pending, issues } = expand(plan, s.catalog.dishes, s.catalog.ingredients);
    const pos = renderPurchaseOrders(lines, plan, { generatedAt: new Date().toISOString(), menuPlanRef: s.planId });
    const text = formatAllPurchaseOrdersText(pos, { ingredients: s.catalog.ingredients, lang, pending });
    s.preview = { pos, pending, issues, text, error: null };
  } catch (err) {
    s.preview = { pos: [], pending: [], issues: [], text: "", error: err instanceof Error ? err.message : String(err) };
  }
  paint();
  const card = root?.querySelector<HTMLElement>(".adm-plan-preview");
  if (card) {
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

// ---------------------------------------------------------------------------
// 画：整屏由 state 重画；步进器 / 搜索框的连续输入只改 state 与就地文本，不重画（长按连发不能被打断）
// ---------------------------------------------------------------------------

function paint(): void {
  const s = state;
  if (!s || !root || !root.isConnected) return;
  const active = document.activeElement;
  const focusKey = active instanceof HTMLElement && root.contains(active) ? (active.closest<HTMLElement>("[data-key]")?.dataset.key ?? null) : null;

  const empty = s.loaded && !s.loadError && s.plan.meals.length === 0;
  let body: HTMLElement;
  if (s.loadError) body = errorCard(apiMessage(s.loadError, lang), () => void load(s));
  else if (s.view === "month") body = monthView(s);
  else if (s.view === "day") body = dayView(s);
  else body = weekView(s, empty);

  replace(
    root,
    topBar({ back: () => leave(adminHref()), title: tt("plan.title"), actions: [viewSelect(s)] }),
    weekNav(s),
    statusLine(s),
    s.error ? errorBox(s) : null,
    s.banner ? bannerEl(s) : null,
    s.warnings.length > 0 ? warningsEl(s) : null,
    s.catalogError ? errorCard(`${tt("plan.catalog.failed")}（${apiMessage(s.catalogError, lang)}）`, () => void loadCatalog(s)) : null,
    empty && !s.loadError && s.view === "week" ? emptyBlock(s) : null,
    !empty && !s.loadError ? actionRow(s) : null,
    body,
    s.preview ? previewPanel(s) : null,
    bottomBar(s),
  );

  if (focusKey) root.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

function viewSelect(s: ScreenState): HTMLElement {
  const sel = h(
    "select",
    { class: "adm-plan-view", "aria-label": tt("plan.view"), "data-key": "view" },
    h("option", { value: "day", selected: s.view === "day" ? true : null }, tt("plan.view.day")),
    h("option", { value: "week", selected: s.view === "week" ? true : null }, tt("plan.view.week")),
    h("option", { value: "month", selected: s.view === "month" ? true : null }, tt("plan.view.month")),
  );
  sel.addEventListener("change", () => {
    const v = sel.value;
    s.view = v === "day" || v === "month" ? v : "week";
    s.open = null;
    s.picking = false;
    paint();
  });
  return sel;
}

function weekNav(s: ScreenState): HTMLElement {
  const prev = button({ label: "‹", ariaLabel: tt("plan.prevWeek"), class: "adm-plan-weeknav-btn", disabled: s.week.n <= 1, onClick: () => goWeek(s.week.n - 1) });
  prev.dataset.key = "prev";
  const next = button({ label: "›", ariaLabel: tt("plan.nextWeek"), class: "adm-plan-weeknav-btn", disabled: s.week.n >= 53, onClick: () => goWeek(s.week.n + 1) });
  next.dataset.key = "next";
  const first = s.week.days[0] ?? "";
  const last = s.week.days[6] ?? "";
  const title = h("div", { class: "adm-plan-weeknav-title" }, tt("plan.week", { n: s.week.n }), h("small", {}, `${fmtMd(first)}–${fmtMd(last)}`));
  return h("div", { class: "adm-plan-weeknav" }, prev, title, next);
}

function statusLine(s: ScreenState): HTMLElement {
  const outside = s.plan.meals.filter((m) => !s.week.days.includes(m.date)).length;
  return h(
    "p",
    { class: "adm-plan-status", "aria-live": "polite" },
    h("span", {}, s.loaded ? tt("plan.planned", { n: s.plan.meals.length }) : adm("adm.loading", undefined, lang)),
    h("span", { class: "adm-plan-dirty", hidden: s.dirty ? null : true }, tt("plan.unsaved")),
    outside > 0 ? h("span", {}, tt("plan.outside", { n: outside })) : null,
  );
}

function errorBox(s: ScreenState): HTMLElement {
  const e = s.error;
  if (!e) return h("div");
  const card = errorCard(e.text(), e.retry);
  if (e.reload) card.append(h("div", { class: "adm-error-actions" }, button({ label: tt("plan.reload"), onClick: () => void reload(s) })));
  return card;
}

function bannerEl(s: ScreenState): HTMLElement {
  const b = s.banner;
  if (!b) return h("div");
  const action = b.undo ? { label: adm("adm.undo", undefined, lang), onClick: undo } : b.action ? { label: b.action.label(), href: b.action.href } : undefined;
  return notice({ kind: b.kind, text: b.text(), action });
}

function warningsEl(s: ScreenState): HTMLElement {
  const words = s.warnings.map((w) => {
    const k = WARN_KEY[w];
    return k ? tt(k) : w;
  });
  return notice({ kind: "warn", text: tt("plan.saved.warnings", { w: words.join("；") }) });
}

/** 复制上周（上周没有就不画）+ 粘贴导入 */
function actionRow(s: ScreenState): HTMLElement {
  const copy = s.lastWeek ? button({ label: tt("plan.copyLastWeek"), onClick: copyLastWeek }) : null;
  const imp = h("a", { class: "adm-btn", href: adminHref("plan", s.planId, "import") }, tt("plan.import"));
  imp.addEventListener("click", (ev) => {
    if (s.dirty && !window.confirm(adm("adm.leave.confirm", undefined, lang))) ev.preventDefault();
  });
  return h("div", { class: "adm-plan-actions" }, copy, imp);
}

function emptyBlock(s: ScreenState): HTMLElement {
  return h(
    "div",
    { class: "adm-plan-empty card", role: "status" },
    h("p", { class: "adm-plan-empty-title" }, tt("plan.empty")),
    h("p", { class: "muted" }, tt("plan.empty.hint")),
    s.lastWeek === null ? h("p", { class: "muted" }, tt("plan.copyLastWeek.none")) : null,
    actionRow(s),
  );
}

function mealsToShow(s: ScreenState): MealType[] {
  const breakfast = s.showBreakfast || s.plan.meals.some((m) => m.mealType === "breakfast");
  return breakfast ? ["breakfast", "lunch", "dinner"] : ["lunch", "dinner"];
}

function breakfastToggle(s: ScreenState, meals: readonly MealType[]): HTMLElement | null {
  if (meals.includes("breakfast")) return null;
  return button({
    label: `+ ${tt("plan.breakfast.show")}`,
    kind: "ghost",
    onClick: () => {
      s.showBreakfast = true;
      paint();
    },
  });
}

// ---------- 周视图 ----------

function weekView(s: ScreenState, _empty: boolean): HTMLElement {
  const meals = mealsToShow(s);
  const card = h("div", { class: "adm-plan-days card" });
  s.week.days.forEach((iso, i) => card.append(dayEl(s, iso, i, meals, false)));
  return h("div", { class: "adm-plan-week" }, card, breakfastToggle(s, meals));
}

function dayEl(s: ScreenState, iso: string, dayIdx: number, meals: readonly MealType[], big: boolean): HTMLElement {
  const today = iso === isoDate(todayUtc());
  const el = h(
    "div",
    { class: `adm-plan-day${today ? " adm-plan-today" : ""}` },
    h("div", { class: "adm-plan-day-head" }, h("b", {}, tt(DOW_KEY[dayIdx] ?? "plan.dow.0")), h("span", {}, fmtMd(iso))),
  );
  for (const mt of meals) el.append(slotEl(s, iso, dayIdx, mt, big));
  return el;
}

function slotEl(s: ScreenState, iso: string, dayIdx: number, mealType: MealType, big: boolean): HTMLElement {
  const entries: { m: MenuPlanMeal; i: number }[] = [];
  s.plan.meals.forEach((m, i) => {
    if (m.date === iso && m.mealType === mealType) entries.push({ m, i });
  });
  const addKey = `${iso}/${mealType}/+`;
  const body = h("div", { class: "adm-plan-slot-body" });
  for (const e of entries) body.append(entryEl(s, e.m, e.i, dayIdx, big));
  if (s.open === addKey) {
    body.append(pickerEl(s, addKey, null, iso, mealType));
  } else {
    const add = h(
      "button",
      { type: "button", class: "adm-plan-add", "data-key": `add:${addKey}`, disabled: s.catalogError ? true : null },
      `+ ${entries.length > 0 ? tt("plan.addDish") : tt("plan.pickDish")}`,
    );
    add.addEventListener("click", () => {
      s.open = addKey;
      s.picking = false;
      s.search = "";
      paint();
    });
    body.append(add);
  }
  const label = h("span", { class: "adm-plan-slot-label" }, h("span", { "aria-hidden": "true" }, tt(MEAL_SHORT_KEY[mealType])), h("span", { class: "sr-only" }, tt(MEAL_KEY[mealType])));
  return h("div", { class: "adm-plan-slot" }, label, body);
}

function statusChip(dish: Dish): HTMLElement | null {
  const st = dish.status ?? "draft";
  if (st === "active") return null;
  return h("span", { class: "chip ghost" }, st === "archived" ? tt("plan.dish.archived") : tt("plan.dish.draft"));
}

/** 能教 / 能排 / 能采三 chip（core 的 readiness 现算）+ 非 active 的状态 chip */
function chipsEl(r: Readiness | undefined, dish: Dish): HTMLElement {
  const chip = (ok: boolean, text: string): HTMLElement => h("span", { class: `chip ${ok ? "ok" : "warn"}` }, `${ok ? "✓" : "✗"} ${text}`);
  const el = h("span", { class: "adm-plan-chips" });
  if (r) el.append(chip(r.canTeach, tt("plan.ready.teach")), chip(r.canPlan, tt("plan.ready.plan")), chip(r.canProcure, tt("plan.ready.procure")));
  const st = statusChip(dish);
  if (st) el.append(st);
  return el;
}

function dishName(s: ScreenState, id: string): string {
  const d = s.catalog?.dishes[id];
  return d ? pick(d.name, lang) || id : id;
}

/** 一格 = 一个 .adm-field（data-pointer=/meals/N）：applyFieldErrors 的父指针回退靠它把整格标黄 */
function entryEl(s: ScreenState, m: MenuPlanMeal, i: number, dayIdx: number, big: boolean): HTMLElement {
  const key = mealKey(m);
  const open = big || s.open === key;
  const dish = s.catalog?.dishes[m.dishRef];
  const nameEl = h("span", { class: "adm-plan-entry-name" }, dishName(s, m.dishRef));
  if (dish) nameEl.append(chipsEl(s.ready.get(m.dishRef), dish));
  else if (s.catalog) nameEl.append(h("small", {}, tt("plan.dish.missing")));
  const sv = h("span", { class: "adm-plan-sv" }, String(m.plannedServings), h("small", {}, tt("plan.servings.unit")));
  const head = big
    ? h("div", { class: "adm-plan-entry-head" }, nameEl, sv)
    : h("button", { type: "button", class: "adm-plan-entry-head", "aria-expanded": open ? "true" : "false", "data-key": `entry:${key}` }, nameEl, sv);
  if (!big) {
    head.addEventListener("click", () => {
      s.open = open ? null : key;
      s.picking = false;
      s.search = "";
      paint();
    });
  }
  const field = h("div", { class: `adm-field adm-plan-entry${open ? " adm-plan-open" : ""}`, "data-pointer": `/meals/${i}` }, head, h("p", { class: "adm-field-error", hidden: true }));
  if (open) field.append(panelEl(s, m, i, dayIdx, key, sv));
  return field;
}

function prepSummary(s: ScreenState, dish: Dish): string {
  if (!s.catalog || !dish.components?.length) return "";
  const parts: string[] = [];
  for (const c of dish.components) {
    const ing = s.catalog.ingredients[c.ingredientRef];
    const name = ing ? pick(ing.name, lang) || c.ingredientRef : c.ingredientRef;
    const tech = c.prep?.techniqueRef ? pick(s.techNames.get(c.prep.techniqueRef), lang) : "";
    parts.push(tech ? `${name} · ${tech}` : name);
  }
  return parts.join(lang === "zh" ? "、" : ", ");
}

/** 展开面板：份数步进器（±10，长按 / Shift+↑↓ ±50）+ 上周提示 + 换菜 + 去掉 */
function panelEl(s: ScreenState, m: MenuPlanMeal, i: number, dayIdx: number, key: string, sv: HTMLElement): HTMLElement {
  const dayName = tt(DOW_KEY[dayIdx] ?? "plan.dow.0");
  const mealName = tt(MEAL_KEY[m.mealType]);
  const st = stepper({
    value: m.plannedServings,
    min: 0,
    step: 10,
    bigStep: 50,
    label: tt("plan.servings.aria", { day: dayName, meal: mealName }),
    onChange: (v) => {
      m.plannedServings = v;
      markDirty(s);
      // 就地更新，不重画（重画会打断长按连发）
      replace(sv, String(v), h("small", {}, tt("plan.servings.unit")));
      root?.querySelector<HTMLElement>(".adm-plan-dirty")?.removeAttribute("hidden");
      root?.querySelector(".adm-plan-preview")?.remove();
    },
  });
  st.querySelector("input")?.setAttribute("data-key", `sv:${key}`);
  const servingsRow = fieldRow({ idPrefix: "adm-plan", name: `m${i}-servings`, pointer: `/meals/${i}/plannedServings`, label: tt("plan.servings"), control: st });

  const lw = lastWeekServings(s, m.date, m.mealType);
  const hint = lw === null ? null : h("p", { class: "adm-plan-hint" }, h("b", {}, tt("plan.lastWeek", { n: lw })), " · ", tt("plan.lastWeek.note"));

  const dish = s.catalog?.dishes[m.dishRef];
  const prep = dish ? prepSummary(s, dish) : "";
  const prepEl = prep ? h("p", { class: "adm-plan-hint" }, h("b", {}, `${tt("plan.prep")}：`), prep) : null;

  const swap = button({
    label: tt("plan.pickDish"),
    kind: "ghost",
    disabled: !!s.catalogError,
    onClick: () => {
      s.picking = !s.picking;
      s.search = "";
      paint();
    },
  });
  swap.setAttribute("aria-expanded", s.picking ? "true" : "false");
  const remove = button({ label: tt("plan.remove"), kind: "ghost", onClick: () => removeMeal(s, i) });
  const dishRow = s.picking
    ? fieldRow({ idPrefix: "adm-plan", name: `m${i}-dish`, pointer: `/meals/${i}/dishRef`, label: tt("plan.pickDish"), control: pickerEl(s, key, i, m.date, m.mealType) })
    : null;

  return h("div", { class: "adm-plan-panel" }, servingsRow, hint, prepEl, h("div", { class: "adm-plan-entry-actions" }, swap, remove), dishRow);
}

interface PickItem {
  id: string;
  dish: Dish;
  name: string;
  r: Readiness | undefined;
}

/** 选菜：从全库搜索；能教 / 能排 / 能采三 chip；不可排的 disabled（灰掉且不可选） */
function pickerEl(s: ScreenState, key: string, index: number | null, date: string, mealType: MealType): HTMLElement {
  const wrap = h("div", { class: "adm-plan-picker" });
  const cancel = button({
    label: adm("adm.cancel", undefined, lang),
    kind: "ghost",
    onClick: () => {
      if (index === null) s.open = null;
      else s.picking = false;
      s.search = "";
      paint();
    },
  });
  if (s.catalogError) {
    wrap.append(h("p", { class: "adm-plan-nodish" }, tt("plan.catalog.failed")), cancel);
    return wrap;
  }
  const catalog = s.catalog;
  if (!catalog) {
    wrap.append(h("p", { class: "adm-plan-nodish", "aria-live": "polite" }, tt("plan.catalog.loading")), cancel);
    return wrap;
  }
  const current = index !== null ? (s.plan.meals[index]?.dishRef ?? null) : null;
  const items: PickItem[] = Object.entries(catalog.dishes).map(([id, dish]) => ({ id, dish, name: pick(dish.name, lang) || id, r: s.ready.get(id) }));
  items.sort((a, b) => Number(!!b.r?.canPlan) - Number(!!a.r?.canPlan) || a.name.localeCompare(b.name, LANG_TAG[lang]));

  const input = h("input", {
    type: "search",
    class: "adm-input adm-plan-search",
    placeholder: tt("plan.searchDish"),
    "aria-label": tt("plan.searchDish"),
    autocomplete: "off",
    value: s.search,
    "data-key": `search:${key}`,
  });
  const list = h("ul", { class: "adm-plan-picker-list" });

  function matches(it: PickItem, q: string): boolean {
    if (!q) return true;
    const names = [it.name, it.id, it.dish.name.zh ?? "", it.dish.name.en ?? "", it.dish.name.uk ?? ""];
    return names.some((n) => n.toLowerCase().includes(q));
  }
  function itemEl(it: PickItem): HTMLElement {
    const can = it.r?.canPlan === true;
    const why = it.r && !can && it.r.missing.length > 0 ? it.r.missing.join("；") : "";
    const nameEl = h("span", { class: "adm-plan-entry-name" }, it.name, chipsEl(it.r, it.dish));
    if (!can) nameEl.append(h("small", {}, why ? `${tt("plan.ready.cannotPlan")}：${why}` : tt("plan.ready.cannotPlan")));
    const btn = h(
      "button",
      {
        type: "button",
        class: "adm-plan-dish",
        disabled: can ? null : true,
        "aria-disabled": can ? null : "true",
        "aria-pressed": it.id === current ? "true" : null,
        "data-key": `dish:${key}:${it.id}`,
      },
      nameEl,
    );
    if (can) btn.addEventListener("click", () => choose(s, index, date, mealType, it.id));
    return h("li", {}, btn);
  }
  function fill(): void {
    const q = s.search.trim().toLowerCase();
    const shown = items.filter((it) => matches(it, q)).map(itemEl);
    replace(list, ...shown);
    if (shown.length === 0) list.append(h("li", { class: "adm-plan-nomatch muted" }, tt("plan.noMatch")));
  }
  input.addEventListener("input", () => {
    s.search = input.value;
    fill();
  });
  fill();
  wrap.append(input, list, cancel);
  return wrap;
}

// ---------- 日视图 ----------

function dayView(s: ScreenState): HTMLElement {
  const idx = Math.min(6, Math.max(0, s.dayIndex));
  const iso = s.week.days[idx] ?? "";
  const prev = button({ label: "‹", ariaLabel: tt("plan.day.prev"), class: "adm-plan-weeknav-btn", disabled: idx <= 0, onClick: () => { s.dayIndex = idx - 1; paint(); } });
  prev.dataset.key = "dprev";
  const next = button({ label: "›", ariaLabel: tt("plan.day.next"), class: "adm-plan-weeknav-btn", disabled: idx >= 6, onClick: () => { s.dayIndex = idx + 1; paint(); } });
  next.dataset.key = "dnext";
  const nav = h("div", { class: "adm-plan-daynav" }, prev, h("div", { class: "adm-plan-daynav-title" }, tt(DOW_KEY[idx] ?? "plan.dow.0"), h("small", {}, iso)), next);
  const meals = mealsToShow(s);
  const card = h("div", { class: "adm-plan-days card" }, dayEl(s, iso, idx, meals, true));
  return h("div", { class: "adm-plan-dayview" }, nav, card, breakfastToggle(s, meals));
}

// ---------- 月视图（只读） ----------

function monthView(s: ScreenState): HTMLElement {
  const y = s.week.monday.getUTCFullYear();
  const mo = s.week.monday.getUTCMonth();
  const first = new Date(Date.UTC(y, mo, 1));
  const last = new Date(Date.UTC(y, mo + 1, 0));
  const startOffset = (first.getUTCDay() || 7) - 1;
  const gridStart = new Date(first.getTime() - startOffset * DAY_MS);
  const endOffset = 7 - (last.getUTCDay() || 7);
  const gridEnd = new Date(last.getTime() + endOffset * DAY_MS);

  const grid = h("div", { class: "adm-plan-month-grid", role: "grid", "aria-readonly": "true" });
  for (let i = 0; i < 7; i++) grid.append(h("div", { class: "adm-plan-month-dow", role: "columnheader" }, tt(DOW_KEY[i] ?? "plan.dow.0")));

  const ids: string[] = [];
  for (let t = gridStart.getTime(); t <= gridEnd.getTime(); t += 7 * DAY_MS) {
    const rowMonday = new Date(t);
    const wk = isoWeekOf(isoDate(rowMonday));
    // planId 里没有年份：跨年的那几行不去猜别的年的周，只画本 ISO 年的
    const id = wk && wk.year === s.week.year ? planIdOfWeek(wk.week) : null;
    if (id) ids.push(id);
    const plan = id === null ? null : id === s.planId ? s.plan : (s.monthPlans.get(id) ?? null);
    for (let d = 0; d < 7; d++) {
      const day = new Date(t + d * DAY_MS);
      const iso = isoDate(day);
      const count = plan ? plan.meals.filter((m) => m.date === iso).length : 0;
      const out = day.getUTCMonth() !== mo;
      const cur = id !== null && id === s.planId;
      const cls = ["adm-plan-month-cell", out ? "adm-plan-month-out" : "", count > 0 ? "adm-plan-month-has" : "", cur ? "adm-plan-month-cur" : ""].filter(Boolean).join(" ");
      const label = count > 0 ? tt("plan.month.planned", { n: count }) : tt("plan.noDish");
      grid.append(h("div", { class: cls, role: "gridcell", "aria-label": `${iso} · ${label}` }, h("b", {}, String(day.getUTCDate())), count > 0 ? h("span", {}, label) : null));
    }
  }
  void loadMonth(s, ids);

  const title = new Intl.DateTimeFormat(LANG_TAG[lang], { year: "numeric", month: "long", timeZone: "UTC" }).format(first);
  const pendingIds = ids.filter((id) => id !== s.planId && !s.monthPlans.has(id));
  return h(
    "div",
    { class: "adm-plan-month card" },
    h("p", { class: "adm-plan-month-title" }, title),
    grid,
    h("p", { class: "adm-plan-month-note" }, tt("plan.month.readonly")),
    pendingIds.length > 0 ? h("p", { class: "adm-plan-month-note", "aria-live": "polite" }, tt("plan.month.loading")) : null,
    s.monthFailed > 0 ? h("p", { class: "adm-plan-month-note" }, tt("plan.month.failed")) : null,
  );
}

// ---------- 采购单预览 ----------

function fmtQty(q: Quantity | null | undefined): string {
  if (!q) return "—";
  return q.value === undefined ? q.unit : `${q.value} ${q.unit}`;
}

function fmtMoney(m: Money | undefined): string {
  return m ? `${m.amount.toFixed(2)} ${m.currency}` : "—";
}

function ingredientName(s: ScreenState, id: string): string {
  const ing = s.catalog?.ingredients[id];
  return ing ? pick(ing.name, lang) || id : id;
}

function poTable(s: ScreenState, po: PurchaseOrder): HTMLElement {
  const head = h(
    "tr",
    {},
    h("th", {}, tt("plan.preview.ingredient")),
    h("th", { class: "adm-plan-num" }, tt("plan.preview.packs")),
    h("th", { class: "adm-plan-num" }, tt("plan.preview.qty")),
    h("th", { class: "adm-plan-num" }, tt("plan.preview.amount")),
  );
  const rows = po.lines.map((l) =>
    h(
      "tr",
      {},
      h("td", {}, ingredientName(s, l.ingredientRef)),
      h("td", { class: "adm-plan-num" }, `${l.packs} × ${l.trace.packSize} ${l.trace.packUnit}`),
      h("td", { class: "adm-plan-num" }, fmtQty(l.qty)),
      h("td", { class: "adm-plan-num" }, fmtMoney(l.amount)),
    ),
  );
  const foot = po.totalAmount ? h("tfoot", {}, h("tr", {}, h("td", { colspan: "3" }, tt("plan.preview.total")), h("td", { class: "adm-plan-num" }, fmtMoney(po.totalAmount)))) : null;
  return h(
    "div",
    {},
    h("h4", {}, po.supplier),
    po.notes ? h("p", { class: "adm-plan-preview-notes" }, po.notes) : null,
    h("table", {}, h("thead", {}, head), h("tbody", {}, ...rows), foot),
  );
}

function previewPanel(s: ScreenState): HTMLElement {
  const p = s.preview;
  if (!p) return h("div");
  const card = h(
    "div",
    { class: "adm-plan-preview card", role: "region", "aria-label": tt("plan.preview"), tabindex: "-1" },
    h(
      "div",
      { class: "adm-plan-preview-head" },
      h("h3", {}, tt("plan.preview")),
      button({
        label: tt("plan.preview.close"),
        kind: "ghost",
        onClick: () => {
          s.preview = null;
          paint();
        },
      }),
    ),
    h("p", { class: "muted" }, tt("plan.preview.note")),
  );
  const problems: string[] = [];
  if (p.error) problems.push(p.error);
  for (const issue of p.issues) problems.push(issue.message);
  if (problems.length > 0) {
    card.append(h("p", { class: "adm-plan-preview-failed" }, tt("plan.preview.failed")), h("ul", { class: "adm-plan-preview-issues" }, ...problems.map((t) => h("li", {}, t))));
  }
  if (!p.error && p.pos.length === 0 && p.pending.length === 0) card.append(h("p", { class: "muted" }, tt("plan.preview.empty")));
  for (const po of p.pos) card.append(poTable(s, po));
  if (p.pending.length > 0) {
    card.append(
      h("h4", {}, tt("plan.preview.pending")),
      h(
        "ul",
        { class: "adm-plan-preview-issues" },
        ...p.pending.map((l) => h("li", {}, `${ingredientName(s, l.ingredientRef)} · ${fmtQty(l.grossNeed ?? l.netNeed)} · ${l.reason}`)),
      ),
    );
  }
  if (p.text) card.append(h("details", {}, h("summary", {}, tt("plan.preview.text")), h("pre", {}, p.text)));
  return card;
}

// ---------- 底部主操作 ----------

function bottomBar(s: ScreenState): HTMLElement {
  const preview = button({ label: tt("plan.preview"), disabled: !s.catalog || !s.loaded, onClick: runPreview });
  preview.dataset.key = "preview-btn";
  const saveBtn = button({
    label: tt("plan.save"),
    kind: "primary",
    class: "adm-plan-save",
    disabled: !s.loaded || s.saving,
    onClick: (ev) => void save(ev.currentTarget instanceof HTMLButtonElement ? ev.currentTarget : null),
  });
  saveBtn.dataset.key = "save";
  if (s.saving) busy(saveBtn, adm("adm.saving", undefined, lang));
  return h("div", { class: "adm-plan-bottom" }, preview, saveBtn);
}
