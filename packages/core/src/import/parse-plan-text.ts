/**
 * 菜单文本宽松解析器（issue #22；docs/specs/v03-admin-frontend-contract.md §4.3 / D-07）。
 *
 * 师傅在微信里发的是「周一午番茄炒蛋200」这种话；本模块把这样的文本逐行落成
 * 「日期 × 餐次 × 菜品 id × 份数」，认不出的行给出人话原因，**从不抛错**。
 *
 * 纯函数：不 fetch、不读 DOM、不认时区（「本周」由调用方以 weekStart 传进来）、无依赖。
 *
 * 认什么（§4.3「必须认的输入」）：
 *   日期   周一 / 星期一 / 礼拜一 / 週一 / 周1 · Mon / Monday · пн / понеділок · 下周一（→ 下周）
 *          10.05 / 10/05 / 10-05 / 10月5日 / 2026-10-05 / 2026.10.05 / 2026年10月5日
 *   餐次   早 / 早餐 / 早饭 · 午 / 中 / 午餐 / 午饭 / 中餐 / 中午 · 晚 / 晚餐 / 晚饭 · breakfast / lunch / dinner / supper · сніданок / обід / вечеря
 *   份数   200 / 200份 / 200人 / x200 / ×200 · 五十份 / 两百 / 一百五 / 二百零五 / 二零零（中文数字，可带「份」）
 *   菜名   剩下的那部分；对三语名做编辑距离 ≤ maxDistance（默认 2）的模糊匹配，候选按距离升序 ≤ 3 个
 *
 * 宽松规则（比 issue 原文多认的，都是微信里的真实写法）：
 *   - 一行里用 、 ， ； ： | 分开的多道菜各成一条结果（「周一午：番茄炒蛋、土豆烧牛肉 各200」→ 两条）；
 *     只有数字的一段（「各200」「200」）补给同一行里还没有份数的菜。
 *   - 只有日期 / 餐次、没有菜名的行是「标题行」（「周一」「周二 午」）：不产生结果，但后面缺日期 / 餐次的行沿用它。
 *   - 空行跳过；lineNo 仍按原文行号（1-based）。
 *   - 全角标点 / 全角数字 / 多余空格：先 NFKC 归一再解析。
 *   - 时间段（12:00 / 12:00-14:00）直接忽略，不当份数。
 *   - 没写份数 → status 仍按菜名判定，plannedServings 缺省（界面自行给默认值）。
 *
 * 状态优先级（一行只有一个 status）：unparsed > unknown-dish > draft-dish > next-week > ok。
 *   - 日期落在下周（weekStart+7 ~ +13）→ next-week（标注，仍可导入）；
 *   - 日期既不在本周也不在下周 → unparsed（人话原因）；
 *   - archived 的菜不参与匹配（当作不存在）。
 *
 * 顺带导出周号换算（D-06：week-NN ↔ 日期 **只准有一份实现**，core 归 #22，就放这里）：
 *   isoWeekOf / mondayOfIsoWeek / planIdOfDate / weekStartOfPlanId。全部按 UTC 算，不碰本地时区。
 */
import type { DishStatus, I18nString, Id, MealType } from "../types.js";

// ---------------------------------------------------------------------------
// 契约（§4.3，D-07 钉死）
// ---------------------------------------------------------------------------

export interface ParsePlanInput {
  text: string;
  dishes: ReadonlyArray<{ id: Id; name: I18nString; status?: DishStatus }>;
  /** 本周第一天（ISO date，周一），用来把「周一」落成具体日期 */
  weekStart: string;
  /** 允许的最大编辑距离，默认 2 */
  maxDistance?: number;
}

export type ParsedLineStatus =
  | "ok" // ✓ 匹配
  | "unknown-dish" // ! 菜名不存在 → 新建 / 换一个
  | "draft-dish" // ? 有草稿不能排 → 去补全
  | "next-week" // 日期落在下周（标注，仍可导入）
  | "unparsed"; // 整行认不出

export interface ParsedLine {
  /** 原文行号，1-based；一行拆成多道菜时共用同一个 lineNo */
  lineNo: number;
  /** 这条结果对应的原文（NFKC 归一、去首尾空白；一行多道菜时是那一段） */
  raw: string;
  status: ParsedLineStatus;
  /** ISO date */
  date?: string;
  mealType?: MealType;
  dishRef?: Id;
  /** 模糊匹配的候选（按距离升序，≤ 3 个），供「换一个」下拉用；ok / draft-dish 时第一个就是 dishRef */
  candidates?: Array<{ id: Id; distance: number }>;
  /** 原文里的菜名，供「新建」预填 */
  dishNameRaw?: string;
  plannedServings?: number;
  /** 认不出时的原因（人话，中文） */
  reason?: string;
}

export const DEFAULT_MAX_DISTANCE = 2;
/** 候选最多几个（§4.3：≤ 3 个） */
export const MAX_CANDIDATES = 3;

// ---------------------------------------------------------------------------
// 日期工具（UTC；ISO date 字符串进出）
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function fmtIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 严格的 YYYY-MM-DD → Date（UTC 零点）；不合法 → null */
function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return makeUtcDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

function makeUtcDate(y: number, mo: number, d: number): Date | null {
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

/** ISO 8601 周：周一为一周之始，含 1 月 4 日的那周是第 1 周 */
export function isoWeekOf(iso: string): { year: number; week: number } | null {
  const d = parseIsoDate(iso);
  if (!d) return null;
  const t = new Date(d.getTime());
  const dayNum = t.getUTCDay() || 7; // 周一 1 … 周日 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum); // 移到同一周的周四，它所在的年就是 ISO 年
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

/** ISO 周的周一（ISO date）；week 不在 1..53 → null */
export function mondayOfIsoWeek(year: number, week: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayNum = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (dayNum - 1) * DAY_MS + (week - 1) * 7 * DAY_MS);
  return fmtIso(monday);
}

/** 日期 → planId（worker 契约 §0：`week-<ISO 周号>`，不补零，如 week-41） */
export function planIdOfDate(iso: string): string | null {
  const w = isoWeekOf(iso);
  return w ? `week-${w.week}` : null;
}

/**
 * planId（week-NN）→ 那一周的周一。planId 里没有年份：在 today 所在 ISO 年的前后各一年里，
 * 取离 today 最近的那个周一（年末排下年第 1 周、年初看上年第 52 周都对）。形状不对 → null。
 */
export function weekStartOfPlanId(planId: string, today: string): string | null {
  const m = /^week-(\d{1,2})$/.exec(planId);
  const ref = parseIsoDate(today);
  if (!m || !ref) return null;
  const week = Number(m[1]);
  const year = isoWeekOf(today)?.year ?? ref.getUTCFullYear();
  let best: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const y of [year - 1, year, year + 1]) {
    const monday = mondayOfIsoWeek(y, week);
    const d = monday ? parseIsoDate(monday) : null;
    if (!monday || !d) continue;
    const dist = Math.abs(diffDays(d, ref));
    if (dist < bestDist) {
      bestDist = dist;
      best = monday;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 中文数字
// ---------------------------------------------------------------------------

const CN_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
const CN_NUM_CLASS = "[零〇一二两三四五六七八九十百千万]";

/**
 * 中文数字 → 整数：五十 / 两百 / 一百五（=150，口语省「十」）/ 一百五十 / 二百零五 / 十五 / 二零零（=200，按位读）。
 * 不是纯中文数字 → null。
 */
export function parseChineseNumber(s: string): number | null {
  if (!s) return null;
  let total = 0;
  let digits = 0; // 尚未挂单位的数字（按位累积：二零零 → 200）
  let nDigits = 0;
  let lastUnit = 0;
  let zeroAfterUnit = false;
  for (const ch of s) {
    const d = CN_DIGIT[ch];
    const u = CN_UNIT[ch];
    if (d !== undefined) {
      if (d === 0) {
        zeroAfterUnit = true;
        if (nDigits > 0) {
          digits *= 10;
          nDigits++;
        }
        continue;
      }
      digits = digits * 10 + d;
      nDigits++;
    } else if (u !== undefined) {
      total += (nDigits > 0 ? digits : 1) * u;
      digits = 0;
      nDigits = 0;
      lastUnit = u;
      zeroAfterUnit = false;
    } else {
      return null;
    }
  }
  if (nDigits > 0) {
    // 「一百五」= 150、「两千五」= 2500：单个尾数且前面没有「零」时，按上一单位的十分之一算
    if (nDigits === 1 && lastUnit >= 10 && !zeroAfterUnit) total += digits * (lastUnit / 10);
    else total += digits;
  }
  return total;
}

// ---------------------------------------------------------------------------
// 编辑距离 + 菜名模糊匹配
// ---------------------------------------------------------------------------

/** 匹配用的归一：NFKC、小写、去掉所有空白与标点符号（「Tomato & egg stir-fry」与「tomato egg stir fry」等价） */
function normName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** Levenshtein（按码点）；超过 cap 就提前返回 cap + 1 */
export function editDistance(a: string, b: string, cap = Number.POSITIVE_INFINITY): number {
  const s = Array.from(a);
  const t = Array.from(b);
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  if (Math.abs(s.length - t.length) > cap) return cap + 1;
  let prev: number[] = [];
  for (let j = 0; j <= t.length; j++) prev.push(j);
  for (let i = 1; i <= s.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      const v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[t.length] ?? 0;
}

type DishLike = ParsePlanInput["dishes"][number];

/**
 * 菜名 → 候选（按距离升序、同距离按 id，≤ MAX_CANDIDATES 个）。
 * 三语名各算一次取最小；archived 不参与。
 * 阈值 = min(maxDistance, 菜名长度 − 1)：两个字的菜最多错一个字，一个字的必须全等，免得「米饭」把「炒饭」「蛋饭」全拉进来。
 */
export function matchDishName(name: string, dishes: ReadonlyArray<DishLike>, maxDistance = DEFAULT_MAX_DISTANCE): Array<{ id: Id; distance: number }> {
  const q = normName(name);
  if (!q) return [];
  const limit = Math.max(0, Math.min(maxDistance, Array.from(q).length - 1));
  const out: Array<{ id: Id; distance: number }> = [];
  for (const dish of dishes) {
    if (!dish || typeof dish.id !== "string" || dish.status === "archived") continue;
    const names = dish.name ? [dish.name.zh, dish.name.en, dish.name.uk] : [];
    let best = Number.POSITIVE_INFINITY;
    for (const n of names) {
      if (!n) continue;
      const d = editDistance(q, normName(n), limit);
      if (d < best) best = d;
      if (best === 0) break;
    }
    if (best <= limit) out.push({ id: dish.id, distance: best });
  }
  out.sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out.slice(0, MAX_CANDIDATES);
}

// ---------------------------------------------------------------------------
// 一段文本 → 日期 / 餐次 / 份数 / 剩下的菜名
// ---------------------------------------------------------------------------

interface SegTokens {
  date?: string;
  /** date 来自不带「下 / 本 / next」前缀的星期写法（「周一」），可被 「下周」标题整体往后挪 */
  weekdayBased?: boolean;
  /** 段里单独出现的「下周」（7）/「本周」（0）：给后面的星期写法整体挪周 */
  weekShift?: number;
  meal?: MealType;
  servings?: number;
  /** 有没有出现份数写法（哪怕是 0） */
  hasServings: boolean;
  /** 去掉日期 / 餐次 / 份数之后剩下的（应是菜名），已去首尾标点 */
  rest: string;
}

const WEEKDAY_ZH: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7 };
const WEEKDAY_EN: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
const WEEKDAY_UK: Record<string, number> = { пн: 1, вт: 2, ср: 3, чт: 4, пт: 5, сб: 6, нд: 7, понеділок: 1, вівторок: 2, середа: 3, четвер: 4, пятниця: 5, субота: 6, неділя: 7 };

const RE_DATE_FULL = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*[日号]?/;
const RE_DATE_MD_ZH = /(^|[^\d.])(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/;
const RE_DATE_MD = /(^|[^\d.])(\d{1,2})[./-](\d{1,2})(?![\d.])/;
const RE_WEEKDAY_ZH = /(下下|下|本|这|這)?\s*(周|星期|礼拜|禮拜|週)\s*([一二三四五六日天1-7])/;
const RE_WEEKDAY_EN = /(^|[^a-z])(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)(?![a-z])/i;
const RE_WEEKDAY_UK = /(^|[^а-яіїєґ'’])(наступн[а-яіїєґ]*\s+)?(понеділок|вівторок|середа|четвер|п['’]?ятниця|субота|неділя|пн|вт|ср|чт|пт|сб|нд)(?![а-яіїєґ'’])/i;

const RE_MEAL_ZH_LONG = /(早餐|早饭|早上|早点|午餐|午饭|中餐|中午|午间|晚餐|晚饭|晚上|晚间)/;
const RE_MEAL_ZH_SHORT = /(^|[\s\d])(早|午|中|晚)(?=$|[\s\d])/;
const RE_MEAL_ZH_LEAD = /^(早|午|中|晚)/;
const RE_MEAL_EN = /(^|[^a-z])(breakfast|lunch|dinner|supper)(?![a-z])/i;
const RE_MEAL_UK = /(^|[^а-яіїєґ])(сніданок|обід|вечеря)(?![а-яіїєґ])/i;

const RE_TIME = /(^|[^\d])\d{1,2}:\d{2}(\s*[-~]\s*\d{1,2}:\d{2})?/g;
const RE_WEEK_NEXT = /(^|\s)(下周|下星期|下礼拜|下禮拜|下週|next\s+week|наступного\s+тижня)(?=$|\s)/i;
const RE_WEEK_THIS = /(^|\s)(本周|这周|這周|本星期|本礼拜|本週|this\s+week|цього\s+тижня)(?=$|\s)/i;

const RE_SERV_UNIT = /(?:(^|[^a-z])[x×*]\s*)?(\d+(?:\.\d+)?)\s*(?:人份|份|人|位|servings?|serves|порці[а-яіїєґ]*|порц\.?)(?![a-z])/i;
const RE_SERV_CN_UNIT = new RegExp(`(${CN_NUM_CLASS}+)\\s*(?:人份|份|人|位)`);
const RE_SERV_X = /(^|[^a-z])[x×*]\s*(\d+(?:\.\d+)?)/i;
const RE_SERV_TRAIL = /(^|[^\d.])(\d+(?:\.\d+)?)\s*$/;
const RE_SERV_LEAD = /^(\d+(?:\.\d+)?)(?=\s|$)/;
const RE_SERV_ALONE = /(^|\s)(\d+(?:\.\d+)?)(?=\s|$)/g;
const RE_SERV_CN_ALONE = new RegExp(`(^|\\s)(${CN_NUM_CLASS}+)(?=\\s|$)`);
const RE_SERV_CN_TRAIL = new RegExp(`(${CN_NUM_CLASS}{2,})$`);

const RE_EDGE_PUNCT = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;
const RE_LEAD_FILLER = /^(各|共|约|大约|每人|每份|菜名|品名|菜品)(?=\s|$|[\p{L}])/u;
const RE_TRAIL_FILLER = /(?:^|\s)(各|共|约|大约|左右|人份|份)$/u;

function mealOf(word: string): MealType {
  const w = word.toLowerCase();
  if (w.startsWith("早") || w === "breakfast" || w === "сніданок") return "breakfast";
  if (w.startsWith("晚") || w === "dinner" || w === "supper" || w === "вечеря") return "dinner";
  return "lunch";
}

/** 把 s[start, start+len) 换成一个空格 */
function cut(s: string, start: number, len: number): string {
  return `${s.slice(0, start)} ${s.slice(start + len)}`;
}

function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function weekdayOffset(re: RegExp, table: Record<string, number>, keyGroup: number, nextGroup: number, s: string, keyNorm: (k: string) => string): { index: number; len: number; days: number; bare: boolean } | null {
  const m = re.exec(s);
  if (!m) return null;
  const key = keyNorm(m[keyGroup] ?? "");
  const day = table[key];
  if (day === undefined) return null;
  const prefix = (m[nextGroup] ?? "").toLowerCase();
  let weeks = 0;
  if (prefix.startsWith("下下")) weeks = 2;
  else if (prefix.startsWith("下") || prefix.startsWith("next") || prefix.startsWith("наступн")) weeks = 1;
  // 英/乌的正则第 1 组是边界字符，不属于日期本身
  const lead = re === RE_WEEKDAY_ZH ? 0 : (m[1] ?? "").length;
  return { index: m.index + lead, len: m[0].length - lead, days: day - 1 + weeks * 7, bare: prefix.trim() === "" };
}

/** 从一段里摘出日期（返回 ISO 与要剔除的区间）；weekStart 用来把星期落成日期，月.日用 weekStart 的年 */
function takeDate(s: string, weekStart: Date): { iso: string; index: number; len: number; weekdayBased?: boolean } | null {
  const full = RE_DATE_FULL.exec(s);
  if (full) {
    const d = makeUtcDate(Number(full[1]), Number(full[2]), Number(full[3]));
    if (d) return { iso: fmtIso(d), index: full.index, len: full[0].length };
  }
  for (const re of [RE_DATE_MD_ZH, RE_DATE_MD]) {
    const m = re.exec(s);
    if (!m) continue;
    const lead = (m[1] ?? "").length;
    const mo = Number(m[2]);
    const day = Number(m[3]);
    let d = makeUtcDate(weekStart.getUTCFullYear(), mo, day);
    if (!d) continue;
    // 年末排下年一月、年初看上年十二月：离 weekStart 超过半年就换一年
    if (diffDays(d, weekStart) < -180) d = makeUtcDate(weekStart.getUTCFullYear() + 1, mo, day) ?? d;
    else if (diffDays(d, weekStart) > 180) d = makeUtcDate(weekStart.getUTCFullYear() - 1, mo, day) ?? d;
    return { iso: fmtIso(d), index: m.index + lead, len: m[0].length - lead };
  }
  const wd =
    weekdayOffset(RE_WEEKDAY_ZH, WEEKDAY_ZH, 3, 1, s, (k) => k) ??
    weekdayOffset(RE_WEEKDAY_EN, WEEKDAY_EN, 3, 2, s, (k) => k.toLowerCase().slice(0, 3)) ??
    weekdayOffset(RE_WEEKDAY_UK, WEEKDAY_UK, 3, 2, s, (k) => k.toLowerCase().replace(/['’]/g, ""));
  if (wd) return { iso: fmtIso(addDays(weekStart, wd.days)), index: wd.index, len: wd.len, weekdayBased: wd.bare };
  return null;
}

function takeMeal(s: string): { meal: MealType; index: number; len: number } | null {
  let m = RE_MEAL_ZH_LONG.exec(s);
  if (m) return { meal: mealOf(m[1] ?? ""), index: m.index, len: m[0].length };
  m = RE_MEAL_EN.exec(s) ?? RE_MEAL_UK.exec(s);
  if (m) {
    const lead = (m[1] ?? "").length;
    return { meal: mealOf(m[2] ?? ""), index: m.index + lead, len: m[0].length - lead };
  }
  m = RE_MEAL_ZH_SHORT.exec(s);
  if (m) {
    const lead = (m[1] ?? "").length;
    return { meal: mealOf(m[2] ?? ""), index: m.index + lead, len: m[0].length - lead };
  }
  m = RE_MEAL_ZH_LEAD.exec(s);
  if (m) return { meal: mealOf(m[1] ?? ""), index: 0, len: m[0].length };
  return null;
}

function takeServings(s: string): { value: number | undefined; index: number; len: number } | null {
  const num = (raw: string): number | undefined => {
    const n = Math.round(Number(raw));
    return Number.isFinite(n) && n >= 1 ? n : undefined;
  };
  let m = RE_SERV_UNIT.exec(s);
  if (m) {
    const lead = (m[1] ?? "").length;
    return { value: num(m[2] ?? ""), index: m.index + lead, len: m[0].length - lead };
  }
  m = RE_SERV_CN_UNIT.exec(s);
  if (m) {
    const n = parseChineseNumber(m[1] ?? "");
    return { value: n !== null && n >= 1 ? n : undefined, index: m.index, len: m[0].length };
  }
  m = RE_SERV_X.exec(s);
  if (m) {
    const lead = (m[1] ?? "").length;
    return { value: num(m[2] ?? ""), index: m.index + lead, len: m[0].length - lead };
  }
  m = RE_SERV_TRAIL.exec(s);
  if (m) {
    const lead = (m[1] ?? "").length;
    return { value: num(m[2] ?? ""), index: m.index + lead, len: m[0].length - lead };
  }
  m = RE_SERV_LEAD.exec(s);
  if (m) return { value: num(m[1] ?? ""), index: 0, len: m[0].length };
  let last: RegExpExecArray | null = null;
  RE_SERV_ALONE.lastIndex = 0;
  for (let hit = RE_SERV_ALONE.exec(s); hit; hit = RE_SERV_ALONE.exec(s)) {
    last = hit;
    if (hit[0].length === 0) RE_SERV_ALONE.lastIndex++;
  }
  if (last) {
    const lead = (last[1] ?? "").length;
    return { value: num(last[2] ?? ""), index: last.index + lead, len: last[0].length - lead };
  }
  m = RE_SERV_CN_ALONE.exec(s);
  if (m) {
    const lead = (m[1] ?? "").length;
    const n = parseChineseNumber(m[2] ?? "");
    if (n !== null) return { value: n >= 1 ? n : undefined, index: m.index + lead, len: m[0].length - lead };
  }
  m = RE_SERV_CN_TRAIL.exec(s);
  if (m) {
    const n = parseChineseNumber(m[1] ?? "");
    if (n !== null) return { value: n >= 1 ? n : undefined, index: m.index, len: m[0].length };
  }
  return null;
}

function cleanRest(s: string): string {
  let r = squash(s).replace(RE_EDGE_PUNCT, "");
  for (let i = 0; i < 3; i++) {
    const before = r;
    r = squash(r.replace(RE_LEAD_FILLER, "").replace(RE_TRAIL_FILLER, "")).replace(RE_EDGE_PUNCT, "");
    if (r === before) break;
  }
  return r;
}

/** 一段（一行，或一行里被 、，； 分开的一段）→ 日期 / 餐次 / 份数 / 菜名 */
function tokenize(seg: string, weekStart: Date): SegTokens {
  let s = squash(seg);
  const out: SegTokens = { hasServings: false, rest: "" };
  const date = takeDate(s, weekStart);
  if (date) {
    out.date = date.iso;
    if (date.weekdayBased) out.weekdayBased = true;
    s = squash(cut(s, date.index, date.len));
  }
  const next = RE_WEEK_NEXT.exec(s);
  const thisWeek = next ? null : RE_WEEK_THIS.exec(s);
  const shift = next ?? thisWeek;
  if (shift) {
    out.weekShift = next ? 7 : 0;
    const lead = (shift[1] ?? "").length;
    s = squash(cut(s, shift.index + lead, shift[0].length - lead));
  }
  const meal = takeMeal(s);
  if (meal) {
    out.meal = meal.meal;
    s = squash(cut(s, meal.index, meal.len));
  }
  const serv = takeServings(s);
  if (serv) {
    out.hasServings = true;
    if (serv.value !== undefined) out.servings = serv.value;
    s = squash(cut(s, serv.index, serv.len));
  }
  out.rest = cleanRest(s);
  return out;
}

// ---------------------------------------------------------------------------
// 逐行解析
// ---------------------------------------------------------------------------

/** 一行里的分段符：、 ， ； ｜ 与不跟数字的冒号（12:00 已先被剔掉，这里再保险一次） */
const RE_SEG_SPLIT = /\s*(?:[、,;|]|:(?!\d))\s*/;
/**
 * 「份数 空格 字」也当分段：「番茄炒蛋 200 土豆烧牛肉 180」→ 两段；「周1 午 …」「10.05 午 …」拆出来的日期段是标题段，不影响结果。
 * 后面跟 月/日/号/年 的数字（「10 月 5 日」）不拆。
 */
const RE_NUM_THEN_WORD = new RegExp(
  `(\\d(?:\\s*(?:人份|份|人|位|servings?))?|(?:^|\\s)${CN_NUM_CLASS}+(?:人份|份|人|位)?)\\s+(?=\\p{L})(?!月|日|号|年|servings?(?![a-z])|serves(?![a-z])|порц)`,
  "giu",
);

/** 装饰性标点（括号、书名号、引号、感叹号、破折号…）一律当空格；保留 - . / :（日期、时间）与 '（п'ятниця） */
const RE_NOISE = /[【】[\]()（）《》〈〉<>「」『』"“”‘’!！?？。…—–~～_•·*]+/gu;

/** 分段用的哨兵字符（NUL；正文里不会出现） */
const SENTINEL = String.fromCharCode(0);

function splitSegments(line: string): string[] {
  return line
    .replace(RE_NOISE, " ")
    .replace(RE_TIME, "$1 ")
    .replace(RE_NUM_THEN_WORD, `$1${SENTINEL}`)
    .split(SENTINEL)
    .flatMap((part) => part.split(RE_SEG_SPLIT))
    .map(squash)
    .filter(Boolean);
}

interface Entry {
  raw: string;
  date?: string;
  meal?: MealType;
  servings?: number;
  name: string;
}

/** 日期是否落在本周或下周（weekStart 起 14 天内） */
function inWindow(iso: string, weekStart: Date): boolean {
  const d = parseIsoDate(iso);
  if (!d) return false;
  const offset = diffDays(d, weekStart);
  return offset >= 0 && offset < 14;
}

const REASON_NO_DATE = "没认出日期，写「周一」或「10.05」";
const REASON_NO_MEAL = "没认出餐次，写「早 / 午 / 晚」";
const REASON_NO_DISH = "没认出菜名";
const REASON_BAD_WEEKSTART = "本周起始日不对，没法把「周一」落成日期";
const REASON_ERROR = "这行解析时出错";

function resolveEntry(lineNo: number, e: Entry, weekStart: Date, dishes: ReadonlyArray<DishLike>, maxDistance: number): ParsedLine {
  const line: ParsedLine = { lineNo, raw: e.raw, status: "ok" };
  if (e.date) line.date = e.date;
  if (e.meal) line.mealType = e.meal;
  if (e.servings !== undefined) line.plannedServings = e.servings;
  if (e.name) line.dishNameRaw = e.name;

  const fail = (reason: string): ParsedLine => {
    line.status = "unparsed";
    line.reason = reason;
    return line;
  };
  if (!e.date) return fail(REASON_NO_DATE);
  if (!e.meal) return fail(REASON_NO_MEAL);
  if (!e.name) return fail(REASON_NO_DISH);

  const d = parseIsoDate(e.date);
  const offset = d ? diffDays(d, weekStart) : Number.NaN;
  if (!d || offset < 0 || offset >= 14) {
    return fail(`这天不在本周也不在下周（本周从 ${fmtIso(weekStart)} 起）`);
  }

  const candidates = matchDishName(e.name, dishes, maxDistance);
  if (candidates.length > 0) line.candidates = candidates;
  const best = candidates[0];
  if (!best) {
    line.status = "unknown-dish";
    return line;
  }
  line.dishRef = best.id;
  const dish = dishes.find((x) => x?.id === best.id);
  if (dish?.status === "draft") {
    line.status = "draft-dish";
    return line;
  }
  line.status = offset >= 7 ? "next-week" : "ok";
  return line;
}

/**
 * 菜单文本 → 逐行结果。从不抛错：认不出的行是 status "unparsed" + reason；输入形状不对也只是返回空结果。
 */
export function parsePlanText(input: ParsePlanInput): { lines: ParsedLine[] } {
  const lines: ParsedLine[] = [];
  const text = typeof input?.text === "string" ? input.text : "";
  const dishes: ReadonlyArray<DishLike> = Array.isArray(input?.dishes) ? input.dishes : [];
  const maxDistance =
    typeof input?.maxDistance === "number" && Number.isFinite(input.maxDistance) && input.maxDistance >= 0 ? Math.floor(input.maxDistance) : DEFAULT_MAX_DISTANCE;
  const weekStart = typeof input?.weekStart === "string" ? parseIsoDate(input.weekStart) : null;

  const rawLines = text.replace(/\r\n?/g, "\n").split("\n");
  let ctxDate: string | undefined;
  let ctxMeal: MealType | undefined;
  /** 「下周」标题之后，「周一」这类写法整体往后挪的天数（「本周」归零） */
  let ctxWeekShift = 0;

  rawLines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const normalized = squash(rawLine.normalize("NFKC"));
    if (!normalized) return;
    if (!weekStart) {
      lines.push({ lineNo, raw: normalized, status: "unparsed", reason: REASON_BAD_WEEKSTART });
      return;
    }
    try {
      const segments = splitSegments(normalized);
      const entries: Entry[] = [];
      let lineDate: string | undefined;
      let lineMeal: MealType | undefined;
      let pending: { raw: string; servings: number | undefined } | null = null;
      let sawHeader = false;
      const multi = segments.length > 1;

      for (const seg of segments) {
        const tok = tokenize(seg, weekStart);
        if (tok.weekShift !== undefined) {
          ctxWeekShift = tok.weekShift;
          sawHeader = true;
        }
        let segDate = tok.date;
        if (segDate && tok.weekdayBased && ctxWeekShift) {
          const d = parseIsoDate(segDate);
          if (d) segDate = fmtIso(addDays(d, ctxWeekShift));
        }
        if (segDate) lineDate = segDate;
        if (tok.meal) lineMeal = tok.meal;
        if (tok.rest) {
          const entry: Entry = { raw: multi ? seg : normalized, name: tok.rest };
          // 先用本段自己的、再用本行前面几段给的；行尾才出现的（「番茄炒蛋 200 晚」）在循环后补
          const date = segDate ?? lineDate;
          const meal = tok.meal ?? lineMeal;
          if (date) entry.date = date;
          if (meal) entry.meal = meal;
          if (tok.servings !== undefined) entry.servings = tok.servings;
          else if (pending && pending.servings !== undefined) {
            entry.servings = pending.servings;
            pending = null;
          }
          entries.push(entry);
          continue;
        }
        if (tok.hasServings) {
          // 只有数字的一段：补给前面还没份数的菜；前面没有菜就先记着给下一道
          let applied = false;
          for (const e of entries) {
            if (e.servings === undefined && tok.servings !== undefined) {
              e.servings = tok.servings;
              applied = true;
            }
          }
          if (!applied) pending = { raw: multi ? seg : normalized, servings: tok.servings };
          continue;
        }
        if (segDate || tok.meal) sawHeader = true;
      }

      if (entries.length === 0) {
        if (pending) {
          // 有份数没菜名（「周一午 200」）：这是一条认不出的结果，不是标题
          const e: Entry = { raw: pending.raw, name: "" };
          const date = lineDate ?? ctxDate;
          const meal = lineMeal ?? ctxMeal;
          if (date) e.date = date;
          if (meal) e.meal = meal;
          if (pending.servings !== undefined) e.servings = pending.servings;
          lines.push(resolveEntry(lineNo, e, weekStart, dishes, maxDistance));
        } else if (sawHeader) {
          // 标题行：只更新上下文，不产生结果
          if (lineDate) ctxDate = lineDate;
          if (lineMeal) ctxMeal = lineMeal;
        } else {
          lines.push({ lineNo, raw: normalized, status: "unparsed", reason: REASON_NO_DISH });
        }
        return;
      }

      for (const e of entries) {
        if (!e.date && (lineDate ?? ctxDate)) e.date = lineDate ?? ctxDate;
        if (!e.meal && (lineMeal ?? ctxMeal)) e.meal = lineMeal ?? ctxMeal;
      }
      // 「番茄炒蛋、土豆烧牛肉 各200」「A、B 200」：同一行里没写份数的菜，沿用后面那道的份数
      for (let k = entries.length - 2; k >= 0; k--) {
        const cur = entries[k];
        const next = entries[k + 1];
        if (cur && cur.servings === undefined && next?.servings !== undefined) cur.servings = next.servings;
      }
      if (entries.length === 1 && entries[0]) entries[0].raw = normalized;

      for (const e of entries) lines.push(resolveEntry(lineNo, e, weekStart, dishes, maxDistance));
      const lastEntry = entries[entries.length - 1];
      if (lastEntry?.date && inWindow(lastEntry.date, weekStart)) ctxDate = lastEntry.date;
      if (lastEntry?.meal) ctxMeal = lastEntry.meal;
    } catch {
      lines.push({ lineNo, raw: normalized, status: "unparsed", reason: REASON_ERROR });
    }
  });

  return { lines };
}
