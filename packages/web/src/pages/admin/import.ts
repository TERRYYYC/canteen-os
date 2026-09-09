/**
 * /admin/plan[/<planId>]/import —— 粘贴导入（issue #22；docs/specs/v03-admin-frontend-contract.md §4.3）。
 *
 * 师傅现在就是在微信里发「周一午番茄炒蛋200」，这一屏就是把那条消息粘进来：
 *   1. 大 textarea + 「解析」：粘贴后 300 ms 自动解析（@canteenos/core 的 parsePlanText，纯函数，本 PR 的前置 PR）；
 *   2. 逐行结果：每行一张卡，✓ / ! / ? / ✕ 图标 + 文字 + 颜色三重编码；
 *      ! 菜名不存在 → 「新建」（store.setHandoff → #/admin/dish/new）/「换一个」（行内下拉，就地改）；
 *      ? 有草稿不能排 → 「去补全」（setHandoff → #/admin/dish/<id>）；日期落在下周 → 标注「这天在下周」仍可导入；
 *   3. CSV 上传走同一条结果表：手写 CSV 解析（引号 / 逗号 / 分号 / Tab / CRLF / BOM / GBK 回退），四列自动识别，
 *      认不出就给四个下拉让人手工点；**文件只在浏览器里读，不上传任何地方**（隐私红线）；
 *      xlsx 本轮不做（不加依赖）：文件选择器只收 .csv / .txt，界面上写「Excel 请先另存为 CSV」；
 *   4. 底部 sticky 「导入 N 行，跳过 M 行」→ 合并成 MenuPlan → store.setDraftPlan(planId, plan, "import")
 *      → 跳 #/admin/plan/<planId>；导入本身不调任何写入端点。已有导入草稿时顶部可「撤销」（store.undoDraftPlan）。
 *
 * 推论 A：textarea 内容、上传的表、解析结果、行内改动全部存模块级变量，切语言 = 重新 render 时回填。
 * 目标周：rest 里的 planId，缺省 = 今天所在 ISO 周（D-06：week-<ISO 周号>，换算只有 core 那一份实现）。
 * 样式：根元素 class="adm adm-import"，import.css 里每条选择器以 .adm-import 开头（§3.4）。
 * 文案：本文件私有字典，前缀 `import.`，三语齐全（§5.2 / §5.4）；共用文案用 admin/kit.ts 的 adm()。
 */
import "./import.css";

import type { MealType, MenuPlan, MenuPlanMeal, ParsedLine } from "@canteenos/core";
import { isoWeekOf, mondayOfIsoWeek, parsePlanText, planIdOfDate, weekStartOfPlanId } from "@canteenos/core";
import { adm, apiMessage, button, errorCard, notice, sessionExpired, topBar } from "../../admin/kit";
import { getDraftPlan, getDraftSource, setDraftPlan, setHandoff, undoDraftPlan } from "../../admin/store";
import { getApi } from "../../api/client";
import type { Catalog } from "../../api/types";
import { isApiError } from "../../api/types";
import { append, h, replace } from "../../dom";
import { pick, type Lang } from "../../i18n";
import type { PageCtx } from "../../types";
import { adminHref } from "../admin";

// ---------------------------------------------------------------------------
// 私有文案（§5.4 最小集 + 本屏自用；三语缺一即编译错误）
// ---------------------------------------------------------------------------

const T = {
  "import.title": { uk: "Вставити список", zh: "粘贴导入", en: "Paste to import" },
  "import.paste.label": { uk: "Вставте сюди повідомлення з WeChat", zh: "把微信里那段话粘进来", en: "Paste the WeChat message here" },
  "import.paste.placeholder": {
    uk: "пн обід Смажені томати з яйцем 200\nвт вечеря Тушкована яловичина з картоплею 180",
    zh: "周一午 番茄炒蛋 200\n周二晚 土豆烧牛肉 180",
    en: "Mon lunch Tomato & egg stir-fry 200\nTue dinner Braised beef with potato 180",
  },
  "import.paste.hint": {
    uk: "Формат вільний: день тижня або дата · сніданок / обід / вечеря · страва · порції. Нерозпізнані рядки буде позначено, а не відхилено всі разом.",
    zh: "格式随便：星期或日期 · 早/午/晚 · 菜名 · 份数。认不出的会标出来，不会整批拒绝。",
    en: "Any format: weekday or date · breakfast / lunch / dinner · dish · servings. Unrecognised lines get flagged, not rejected as a batch.",
  },
  "import.parse": { uk: "Розібрати", zh: "解析", en: "Parse" },
  "import.clear": { uk: "Очистити", zh: "清空", en: "Clear" },
  "import.catalog.loading": { uk: "Читаю список страв…", zh: "正在读菜品名单", en: "Loading the dish list…" },
  "import.week": { uk: "Тиждень від {d}", zh: "本周从 {d} 起", en: "Week starting {d}" },

  "import.upload": { uk: "Або завантажте таблицю", zh: "或者上传表格", en: "Or upload a table" },
  "import.upload.title": { uk: "CSV, чотири стовпчики", zh: "CSV，四列", en: "CSV, four columns" },
  "import.upload.hint": {
    uk: "Дата · прийом їжі · страва · порції — назви стовпчиків будь-які, розпізнаються автоматично",
    zh: "四列：日期 · 餐次 · 菜名 · 份数——列名随便，会自动认",
    en: "Date · meal · dish · servings — any column names, detected automatically",
  },
  "import.upload.xlsx": { uk: "Excel: спершу «Зберегти як CSV»", zh: "Excel 请先「另存为 CSV」再上传", en: "Excel: use “Save as CSV” first" },
  "import.upload.pick": { uk: "Обрати файл", zh: "选文件", en: "Choose file" },
  "import.upload.columns": {
    uk: "Не зрозуміло, який стовпчик за що відповідає — вкажіть самі",
    zh: "这张表认不出哪一列是什么，自己点一下",
    en: "Can't tell which column is which — pick them yourself",
  },
  "import.upload.columns.ok": { uk: "Стовпчики розпізнано; якщо не так — поправте", zh: "已认出四列，不对就改", en: "Columns detected; adjust if wrong" },
  "import.upload.tooBig": { uk: "Файл завеликий (понад 256 KB)", zh: "文件太大（超过 256 KB）", en: "File too large (over 256 KB)" },
  "import.upload.empty": { uk: "Файл порожній", zh: "这个文件是空的", en: "This file is empty" },
  "import.upload.truncated": { uk: "Прочитано лише перші {n} рядків", zh: "只读了前 {n} 行", en: "Only the first {n} rows were read" },
  "import.upload.failed": { uk: "Не вдалося прочитати файл", zh: "文件读不出来", en: "Couldn't read the file" },
  "import.col.date": { uk: "Дата", zh: "日期", en: "Date" },
  "import.col.meal": { uk: "Прийом їжі", zh: "餐次", en: "Meal" },
  "import.col.dish": { uk: "Страва", zh: "菜名", en: "Dish" },
  "import.col.servings": { uk: "Порції", zh: "份数", en: "Servings" },
  "import.col.none": { uk: "(не використовувати)", zh: "（不用）", en: "(not used)" },
  "import.col.n": { uk: "стовпчик {n}", zh: "第 {n} 列", en: "column {n}" },

  "import.result.title": { uk: "Розпізнано · {n} рядк.", zh: "识别结果 · {n} 行", en: "Recognised · {n} lines" },
  "import.result.from": { uk: "з файлу {f}", zh: "来自 {f}", en: "from {f}" },
  "import.result.ok": { uk: "Розпізнано", zh: "认出来了", en: "Recognised" },
  "import.result.unknownDish": { uk: "Такої страви немає в базі", zh: "食材库里没有这道菜", en: "This dish isn't in the library" },
  "import.result.draftDish": { uk: "Ця страва ще чернетка, її не можна ставити в меню", zh: "这道菜还是草稿，排不了", en: "This dish is still a draft and can't be planned" },
  "import.result.nextWeek": { uk: "Цей день — наступного тижня", zh: "这天在下周", en: "This day is next week" },
  "import.result.unparsed": { uk: "Цей рядок не розпізнано", zh: "这行认不出来", en: "Couldn't read this line" },
  "import.result.matched": { uk: "у тексті", zh: "原文", en: "typed as" },
  "import.result.lineNo": { uk: "рядок {n}", zh: "第 {n} 行", en: "line {n}" },
  "import.action.new": { uk: "Створити", zh: "新建", en: "Create" },
  "import.action.swap": { uk: "Замінити", zh: "换一个", en: "Swap" },
  "import.action.complete": { uk: "Дозаповнити", zh: "去补全", en: "Complete it" },
  "import.swap.candidates": { uk: "Схожі", zh: "相近的", en: "Close matches" },
  "import.swap.all": { uk: "Усі страви", zh: "全部菜", en: "All dishes" },
  "import.swap.draft": { uk: "(чернетка)", zh: "（草稿）", en: "(draft)" },
  "import.servings": { uk: "порц.", zh: "份", en: "servings" },
  "import.servings.default": { uk: "за замовчуванням", zh: "默认", en: "default" },
  "import.none": { uk: "Жодного рядка не розпізнано", zh: "一行都没认出来", en: "Nothing was recognised" },
  "import.none.hint": {
    uk: "Найчастіша причина: назви страв не збігаються з тими, що в базі",
    zh: "常见原因：菜名和食材库里的对不上",
    en: "Most common cause: dish names don't match the library",
  },
  "import.submit": { uk: "Імпортувати {n}, пропустити {m}", zh: "导入 {n} 行，跳过 {m} 行", en: "Import {n}, skip {m}" },
  "import.submit.none": { uk: "Немає що імпортувати", zh: "没有能导入的行", en: "Nothing to import" },
  "import.draft.exists": {
    uk: "Уже є імпортована чернетка ({n} страв) · ще не збережено",
    zh: "已有一份导入的草稿（{n} 餐）· 还没保存",
    en: "There's already an imported draft ({n} meals) · not saved yet",
  },
  "import.draft.undone": { uk: "Імпорт скасовано", zh: "已撤销刚才的导入", en: "Import undone" },
  "import.goPlan": { uk: "До меню", zh: "去排菜单", en: "Go to the plan" },
  "import.meal.breakfast": { uk: "сніданок", zh: "早", en: "breakfast" },
  "import.meal.lunch": { uk: "обід", zh: "午", en: "lunch" },
  "import.meal.dinner": { uk: "вечеря", zh: "晚", en: "dinner" },
  "import.wd.1": { uk: "пн", zh: "周一", en: "Mon" },
  "import.wd.2": { uk: "вт", zh: "周二", en: "Tue" },
  "import.wd.3": { uk: "ср", zh: "周三", en: "Wed" },
  "import.wd.4": { uk: "чт", zh: "周四", en: "Thu" },
  "import.wd.5": { uk: "пт", zh: "周五", en: "Fri" },
  "import.wd.6": { uk: "сб", zh: "周六", en: "Sat" },
  "import.wd.7": { uk: "нд", zh: "周日", en: "Sun" },
} as const satisfies Record<string, Record<Lang, string>>;

type Key = keyof typeof T;

function tt(lang: Lang, key: Key, params?: Record<string, string | number>): string {
  let s: string = T[key][lang];
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 没写份数时的默认值（§9 矛盾 10：基准份数 50 是常量，本轮没有全局设置页） */
const DEFAULT_SERVINGS = 50;
/** 粘贴后自动解析的防抖（§4.3 移动端与键盘） */
const PARSE_DEBOUNCE_MS = 300;
/** CSV 文件上限：与 worker 的 JSON 请求体上限同一个数（契约 D-07），够排半年 */
const MAX_FILE_BYTES = 256 * 1024;
/** 最多读多少数据行（执行简报：≤ 80 行即可；留余量） */
const MAX_ROWS = 200;
const MEAL_ORDER: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2 };

// ---------------------------------------------------------------------------
// 模块级状态（推论 A：切语言 = 重新 render，靠这些回填）
// ---------------------------------------------------------------------------

type ColRole = "date" | "meal" | "dish" | "servings";
type ColMap = Record<ColRole, number>; // -1 = 没有这一列

interface CsvState {
  name: string;
  /** 表头（第一行认出是表头才有；否则 null，列名显示「第 N 列」） */
  header: string[] | null;
  rows: string[][];
  mapping: ColMap;
  /** 自动识别是否可信；false 时显示「自己点一下」 */
  confident: boolean;
  /** 「只读了前 N 行」这类提示 */
  note: string | null;
}

/** 行内改动：换一个 / 改份数；key = 结果数组下标 */
interface LineEdit {
  dishRef?: string;
  servings?: number;
}

interface State {
  /** 这份状态属于哪一周；换周即清空 */
  planId: string;
  text: string;
  source: "paste" | "csv";
  csv: CsvState | null;
  parsed: ParsedLine[] | null;
  edits: Map<number, LineEdit>;
  /** 本屏刚做过导入（离开确认用） */
  imported: boolean;
}

let state: State = freshState("");

function freshState(planId: string): State {
  return { planId, text: "", source: "paste", csv: null, parsed: null, edits: new Map(), imported: false };
}

/** 有解析结果且还没导入 → 刷新 / 关标签页前提醒（§4.0） */
function isDirty(): boolean {
  return !!state.parsed && state.parsed.length > 0 && !state.imported;
}

/** 只在本屏是当前屏时才拦 beforeunload（模块级状态在别的屏也活着，但那时不该打扰） */
function onImportScreen(): boolean {
  return /^#\/admin\/plan(\/[^/]+)?\/import$/.test(location.hash);
}

let unloadGuardInstalled = false;
function installUnloadGuard(): void {
  if (unloadGuardInstalled) return;
  unloadGuardInstalled = true;
  window.addEventListener("beforeunload", (ev) => {
    if (!isDirty() || !onImportScreen()) return;
    ev.preventDefault();
    ev.returnValue = "";
  });
}

// ---------------------------------------------------------------------------
// 周 / 日期小工具（换算本身在 core：D-06 只有那一份实现）
// ---------------------------------------------------------------------------

function todayIso(): string {
  const d = new Date();
  const p = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
  const p = (x: number): string => (x < 10 ? `0${x}` : String(x));
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

function dayOffset(iso: string, weekStart: string): number {
  const a = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const b = Date.UTC(Number(weekStart.slice(0, 4)), Number(weekStart.slice(5, 7)) - 1, Number(weekStart.slice(8, 10)));
  return Math.round((a - b) / 86_400_000);
}

/** 目标周：rest 里的 planId，缺省今天所在 ISO 周（D-06）；weekStart 从 planId 反推，推不出就用本周一 */
function resolveWeek(rest: string, ctx: PageCtx): { planId: string; weekStart: string } {
  const today = todayIso();
  const planId = rest || planIdOfDate(today) || ctx.planId || "week-1";
  const w = isoWeekOf(today);
  const thisMonday = (w && mondayOfIsoWeek(w.year, w.week)) || today;
  return { planId, weekStart: weekStartOfPlanId(planId, today) ?? thisMonday };
}

/** 「周一 10.05」 */
function fmtDay(lang: Lang, iso: string, weekStart: string): string {
  const off = dayOffset(iso, weekStart);
  const wd = (((off % 7) + 7) % 7) + 1;
  const key = `import.wd.${wd}` as Key;
  return `${T[key] ? tt(lang, key) : ""} ${iso.slice(5, 7)}.${iso.slice(8, 10)}`.trim();
}

// ---------------------------------------------------------------------------
// CSV：手写解析（引号 / 逗号 / 分号 / Tab / CRLF / BOM），四列识别
// ---------------------------------------------------------------------------

function sniffDelimiter(firstLine: string): string {
  const counts: Array<[string, number]> = [",", "\t", ";", "|"].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0] && counts[0][1] > 0 ? counts[0][0] : ",";
}

/** RFC 4180 风格：双引号包裹的字段里可以有分隔符 / 换行 / 两个双引号 = 一个双引号 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstNl = src.indexOf("\n");
  const delim = sniffDelimiter(firstNl === -1 ? src : src.slice(0, firstNl));
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i] ?? "";
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ""));
}

const HEADER_WORDS: Record<ColRole, RegExp> = {
  date: /^(日期|星期|周|天|date|day|weekday|дата|день)$/i,
  meal: /^(餐次|餐|时段|meal|mealtype|meal type|slot|прийом|прийом їжі)$/i,
  dish: /^(菜名|菜品|菜|名称|dish|dish name|name|item|страва|назва)$/i,
  servings: /^(份数|份|人数|数量|servings?|qty|quantity|count|portions?|порції|кількість)$/i,
};

const CELL_DATE = /^(\d{4}[-/.年]\s*\d{1,2}[-/.月]\s*\d{1,2}日?|\d{1,2}[./-]\d{1,2}|\d{1,2}月\d{1,2}[日号]?|(下|本|这)?(周|星期|礼拜|週)[一二三四五六日天1-7]|(next\s+)?(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*|пн|вт|ср|чт|пт|сб|нд|понеділок|вівторок|середа|четвер|п['’]?ятниця|субота|неділя)$/i;
const CELL_MEAL = /^(早|午|中|晚|早餐|午餐|晚餐|早饭|午饭|晚饭|中餐|中午|breakfast|lunch|dinner|supper|сніданок|обід|вечеря)$/i;
const CELL_NUM = /^(\d+(\.\d+)?\s*(份|人份|人)?|[零〇一二两三四五六七八九十百千]+(份|人份)?)$/;

function looksLikeHeader(row: string[]): boolean {
  let hits = 0;
  for (const cell of row) for (const re of Object.values(HEADER_WORDS)) if (re.test(cell)) hits++;
  return hits >= 2;
}

/** 四列自动识别：先看表头名字，再按内容猜（日期像不像日期、餐次像不像餐次、份数是不是数字，剩下最长的当菜名） */
function detectColumns(header: string[] | null, rows: string[][]): { mapping: ColMap; confident: boolean } {
  const mapping: ColMap = { date: -1, meal: -1, dish: -1, servings: -1 };
  const width = Math.max(header?.length ?? 0, ...rows.map((r) => r.length));
  const taken = new Set<number>();
  if (header) {
    for (const role of ["date", "meal", "dish", "servings"] as const) {
      const idx = header.findIndex((cell, i) => !taken.has(i) && HEADER_WORDS[role].test(cell));
      if (idx >= 0) {
        mapping[role] = idx;
        taken.add(idx);
      }
    }
  }
  const sample = rows.slice(0, 40);
  const score = (i: number, re: RegExp): number => {
    let n = 0;
    let total = 0;
    for (const r of sample) {
      const v = r[i] ?? "";
      if (!v) continue;
      total++;
      if (re.test(v)) n++;
    }
    return total === 0 ? 0 : n / total;
  };
  const guess = (role: ColRole, re: RegExp): void => {
    if (mapping[role] >= 0) return;
    let best = -1;
    let bestScore = 0.6;
    for (let i = 0; i < width; i++) {
      if (taken.has(i)) continue;
      const s = score(i, re);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (best >= 0) {
      mapping[role] = best;
      taken.add(best);
    }
  };
  guess("date", CELL_DATE);
  guess("meal", CELL_MEAL);
  guess("servings", CELL_NUM);
  if (mapping.dish < 0) {
    // 剩下的列里，平均最长的那列当菜名
    let best = -1;
    let bestLen = 0;
    for (let i = 0; i < width; i++) {
      if (taken.has(i)) continue;
      const lens = sample.map((r) => (r[i] ?? "").length).filter((n) => n > 0);
      const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
      if (avg > bestLen) {
        bestLen = avg;
        best = i;
      }
    }
    if (best >= 0) mapping.dish = best;
  }
  const confident = mapping.dish >= 0 && mapping.date >= 0 && (mapping.meal >= 0 || mapping.servings >= 0);
  return { mapping, confident };
}

/** 单元格里的顿号 / 逗号 / 分号是内容不是分隔（"土豆, 烧牛肉"），拼成一行前先换成空格，免得解析器把一格拆成两道菜 */
function cellText(v: string | undefined): string {
  return (v ?? "").replace(/[、,，;；|]+/g, " ").replace(/\s+/g, " ").trim();
}

/** 按列映射把每一行拼成「日期 餐次 菜名 份数」一行文本，交给同一个解析器（结果表只有一条路） */
function csvToText(csv: CsvState): string {
  const { mapping } = csv;
  const anyMapped = Object.values(mapping).some((i) => i >= 0);
  return csv.rows
    .map((r) => {
      if (!anyMapped) return r.map(cellText).filter(Boolean).join(" ");
      return (["date", "meal", "dish", "servings"] as const)
        .map((role) => (mapping[role] >= 0 ? cellText(r[mapping[role]]) : ""))
        .filter(Boolean)
        .join(" ");
    })
    .join("\n");
}

function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  // 老一点的 iOS 没有 Blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(fr.error ?? new Error("read failed"));
    fr.readAsArrayBuffer(file);
  });
}

async function readFileText(file: File): Promise<string> {
  const buf = await readArrayBuffer(file);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // Windows 上 Excel 另存的 CSV 多半是 GBK；浏览器不支持这个编码时退回宽松 UTF-8
    try {
      return new TextDecoder("gbk").decode(buf);
    } catch {
      return new TextDecoder("utf-8").decode(buf);
    }
  }
}

// ---------------------------------------------------------------------------
// 解析 + 行的有效状态（含行内改动）
// ---------------------------------------------------------------------------

type DishList = ReadonlyArray<{ id: string; name: Catalog["dishes"][string]["name"]; status?: Catalog["dishes"][string]["status"] }>;

function dishList(catalog: Catalog): DishList {
  return Object.entries(catalog.dishes).map(([id, d]) => ({ id, name: d.name, status: d.status }));
}

function currentText(): string {
  return state.source === "csv" && state.csv ? csvToText(state.csv) : state.text;
}

function runParse(catalog: Catalog, weekStart: string): void {
  const text = currentText();
  if (!text.trim()) {
    state.parsed = null;
    state.edits = new Map();
    return;
  }
  let lines: ParsedLine[];
  try {
    lines = parsePlanText({ text, dishes: dishList(catalog), weekStart }).lines;
  } catch {
    // 解析器抛异常 → 视为整表 unparsed，不允许白屏（§4.3 错误态）
    lines = text
      .split("\n")
      .map((raw, i) => ({ lineNo: i + 1, raw: raw.trim(), status: "unparsed" as const }))
      .filter((l) => l.raw);
  }
  state.parsed = lines;
  state.imported = false;
}

type EffStatus = ParsedLine["status"];

interface Effective {
  status: EffStatus;
  dishRef?: string;
  servings: number;
  servingsDefaulted: boolean;
  importable: boolean;
}

function effective(line: ParsedLine, edit: LineEdit | undefined, catalog: Catalog, weekStart: string): Effective {
  const servings = edit?.servings ?? line.plannedServings ?? DEFAULT_SERVINGS;
  const servingsDefaulted = edit?.servings === undefined && line.plannedServings === undefined;
  const base: Effective = { status: line.status, servings, servingsDefaulted, importable: false };
  if (line.status === "unparsed" || !line.date || !line.mealType) return base;
  const dishRef = edit?.dishRef ?? line.dishRef;
  const dish = dishRef ? catalog.dishes[dishRef] : undefined;
  if (!dishRef || !dish || dish.status === "archived") return { ...base, status: "unknown-dish" };
  if (dish.status === "draft") return { ...base, status: "draft-dish", dishRef };
  const off = dayOffset(line.date, weekStart);
  return { ...base, status: off >= 7 ? "next-week" : "ok", dishRef, importable: true };
}

/** 结果 → MenuPlan：以已有草稿 / 已保存计划为底，同一（日期 × 餐次 × 菜）覆盖份数，其余追加；按日期、餐次排序 */
function mergePlan(base: MenuPlan | null, meals: MenuPlanMeal[], planId: string, weekStart: string): MenuPlan {
  const plan: MenuPlan = base ? structuredClone(base) : { schemaVersion: "2", meals: [] };
  plan.schemaVersion = "2";
  const list = Array.isArray(plan.meals) ? [...plan.meals] : [];
  for (const m of meals) {
    const i = list.findIndex((x) => x.date === m.date && x.mealType === m.mealType && x.dishRef === m.dishRef);
    if (i >= 0) list[i] = { ...list[i], ...m };
    else list.push(m);
  }
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType]));
  plan.meals = list;
  const maxDate = list.reduce((acc, m) => (m.date > acc ? m.date : acc), addDaysIso(weekStart, 6));
  const start = plan.dateRange?.start && plan.dateRange.start < weekStart ? plan.dateRange.start : weekStart;
  const end = plan.dateRange?.end && plan.dateRange.end > maxDate ? plan.dateRange.end : maxDate;
  plan.dateRange = { start, end };
  if (!plan.name) {
    const w = isoWeekOf(weekStart);
    const m = /^week-(\d{1,2})$/.exec(planId);
    if (w && m) plan.name = { zh: `${w.year} 年第 ${m[1]} 周菜单`, en: `${w.year} Week ${m[1]} Menu`, uk: `Меню на ${m[1]} тиждень ${w.year}` };
  }
  return plan;
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

export async function render(el: HTMLElement, ctx: PageCtx, rest: string): Promise<void> {
  const lang = ctx.lang;
  const { planId, weekStart } = resolveWeek(rest, ctx);
  if (state.planId !== planId) state = freshState(planId);
  installUnloadGuard();

  const returnTo = adminHref("plan", planId, "import");
  const planHref = adminHref("plan", planId);

  const root = h("div", { class: "adm adm-import" });
  const noticeHost = h("div", { class: "adm-import-notices" });
  const pasteHost = h("section", { class: "adm-import-paste" });
  const uploadHost = h("section", { class: "adm-import-upload" });
  const resultHost = h("section", { class: "adm-import-results" });
  const bottom = h("div", { class: "adm-import-bottom" });

  const goBack = (): void => {
    if (isDirty() && !window.confirm(adm("adm.leave.confirm", undefined, lang))) return;
    location.hash = planHref;
  };
  root.append(
    topBar({ back: goBack, title: tt(lang, "import.title") }),
    h("p", { class: "muted adm-import-week" }, tt(lang, "import.week", { d: weekStart })),
    noticeHost,
    pasteHost,
    uploadHost,
    resultHost,
    bottom,
  );
  el.append(root);

  // —— 已有导入草稿：可撤销（§4.3 DoD「未保存前可撤销」）——
  function paintDraftNotice(): void {
    replace(noticeHost);
    const draft = getDraftPlan(planId);
    if (!draft || getDraftSource(planId) !== "import") return;
    const bar = notice({
      kind: "ok",
      text: tt(lang, "import.draft.exists", { n: draft.meals.length }),
      action: {
        label: adm("adm.undo", undefined, lang),
        onClick: () => {
          undoDraftPlan(planId);
          paintDraftNotice();
          noticeHost.prepend(notice({ kind: "info", text: tt(lang, "import.draft.undone") }));
        },
      },
    });
    bar.append(h("a", { class: "adm-notice-action", href: planHref }, tt(lang, "import.goPlan")));
    noticeHost.append(bar);
  }
  paintDraftNotice();

  // —— 粘贴框 ——
  const ta = h("textarea", {
    class: "adm-import-ta",
    id: "adm-import-text",
    rows: "5",
    placeholder: tt(lang, "import.paste.placeholder"),
    enterkeyhint: "done",
    autocapitalize: "off",
    autocomplete: "off",
    spellcheck: "false",
    "aria-describedby": "adm-import-hint",
  });
  ta.value = state.text;
  const fitRows = (): void => {
    const n = ta.value.split("\n").length + 1;
    ta.rows = Math.min(14, Math.max(5, n));
  };
  fitRows();
  const parseBtn = button({ label: tt(lang, "import.parse"), kind: "primary", class: "adm-import-parse", disabled: true });
  const clearBtn = button({
    label: tt(lang, "import.clear"),
    kind: "ghost",
    class: "adm-import-clear",
    onClick: () => {
      state = freshState(planId);
      ta.value = "";
      fitRows();
      fileInput.value = "";
      paintUpload();
      paintResults();
    },
  });
  const catalogHint = h("p", { class: "muted adm-import-catalog", id: "adm-import-hint" }, tt(lang, "import.catalog.loading"));
  pasteHost.append(
    h("label", { class: "section-label adm-import-label", for: "adm-import-text" }, tt(lang, "import.paste.label")),
    ta,
    h("p", { class: "muted adm-import-hint" }, tt(lang, "import.paste.hint")),
    h("div", { class: "adm-import-row" }, parseBtn, clearBtn, catalogHint),
  );

  // —— 上传区 ——
  const fileInput = h("input", {
    type: "file",
    id: "adm-import-file",
    class: "adm-import-file",
    accept: ".csv,.txt,text/csv,text/plain",
  });
  const uploadMsg = h("p", { class: "muted adm-import-upload-msg" });
  const colsHost = h("div", { class: "adm-import-cols" });
  uploadHost.append(
    h("p", { class: "section-label adm-import-label" }, tt(lang, "import.upload")),
    h(
      "div",
      { class: "card adm-import-upload-card" },
      h("div", { class: "adm-import-upload-text" }, h("b", {}, tt(lang, "import.upload.title")), h("span", { class: "muted" }, tt(lang, "import.upload.hint"))),
      h("label", { class: "adm-btn adm-import-pick", for: "adm-import-file" }, tt(lang, "import.upload.pick")),
      fileInput,
    ),
    h("p", { class: "muted adm-import-xlsx" }, tt(lang, "import.upload.xlsx")),
    uploadMsg,
    colsHost,
  );

  // —— 数据：菜品名单 ——
  let catalog: Catalog | null = null;

  function paintUpload(): void {
    replace(uploadMsg);
    replace(colsHost);
    const csv = state.csv;
    if (!csv) return;
    append(
      uploadMsg,
      h("span", {}, csv.name),
      csv.note ? h("span", {}, ` · ${csv.note}`) : null,
      h("span", { class: csv.confident ? "" : "adm-import-cols-warn" }, ` · ${tt(lang, csv.confident ? "import.upload.columns.ok" : "import.upload.columns")}`),
    );
    const width = Math.max(csv.header?.length ?? 0, ...csv.rows.map((r) => r.length));
    const first = csv.rows[0] ?? [];
    for (const role of ["date", "meal", "dish", "servings"] as const) {
      const sel = h("select", { class: "adm-input adm-import-col", id: `adm-import-col-${role}`, "aria-label": tt(lang, `import.col.${role}`) });
      sel.append(h("option", { value: "-1" }, tt(lang, "import.col.none")));
      for (let i = 0; i < width; i++) {
        const name = csv.header?.[i] || tt(lang, "import.col.n", { n: i + 1 });
        const sample = first[i] ? ` · ${first[i]}` : "";
        sel.append(h("option", { value: String(i) }, `${name}${sample}`));
      }
      sel.value = String(csv.mapping[role]);
      sel.addEventListener("change", () => {
        csv.mapping[role] = Number(sel.value);
        state.source = "csv";
        if (catalog) runParse(catalog, weekStart);
        paintResults();
      });
      colsHost.append(h("label", { class: "adm-import-col-row", for: `adm-import-col-${role}` }, h("span", {}, tt(lang, `import.col.${role}`)), sel));
    }
  }
  paintUpload();

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    replace(uploadMsg);
    if (file.size > MAX_FILE_BYTES) {
      state.csv = null;
      uploadMsg.append(h("span", { class: "adm-import-cols-warn" }, tt(lang, "import.upload.tooBig")));
      return;
    }
    let text: string;
    try {
      text = await readFileText(file);
    } catch {
      uploadMsg.append(h("span", { class: "adm-import-cols-warn" }, tt(lang, "import.upload.failed")));
      return;
    }
    if (!el.isConnected) return;
    let rows = parseCsv(text);
    if (rows.length === 0) {
      state.csv = null;
      uploadMsg.append(h("span", { class: "adm-import-cols-warn" }, tt(lang, "import.upload.empty")));
      return;
    }
    const header = looksLikeHeader(rows[0] ?? []) ? (rows[0] ?? []) : null;
    if (header) rows = rows.slice(1);
    let note: string | null = null;
    if (rows.length > MAX_ROWS) {
      rows = rows.slice(0, MAX_ROWS);
      note = tt(lang, "import.upload.truncated", { n: MAX_ROWS });
    }
    const { mapping, confident } = detectColumns(header, rows);
    state.csv = { name: file.name, header, rows, mapping, confident, note };
    state.source = "csv";
    state.edits = new Map();
    paintUpload();
    if (catalog) runParse(catalog, weekStart);
    paintResults();
  });

  // —— 结果表 ——
  function paintResults(): void {
    replace(resultHost);
    replace(bottom);
    const lines = state.parsed;
    if (!catalog || !lines) return;
    const cat = catalog;
    const csvLabel = state.source === "csv" && state.csv ? ` · ${tt(lang, "import.result.from", { f: state.csv.name })}` : "";
    resultHost.append(h("p", { class: "section-label adm-import-label" }, `${tt(lang, "import.result.title", { n: lines.length })}${csvLabel}`));

    const effs = lines.map((l, i) => effective(l, state.edits.get(i), cat, weekStart));
    const okCount = effs.filter((e) => e.importable).length;

    if (okCount === 0 && lines.every((l) => l.status === "unparsed")) {
      resultHost.append(
        h(
          "div",
          { class: "card adm-import-none", role: "status" },
          h("p", { class: "adm-import-none-title" }, tt(lang, "import.none")),
          h("p", { class: "muted" }, tt(lang, "import.none.hint")),
          h("pre", { class: "adm-import-raw" }, currentText()),
        ),
      );
    }

    const list = h("div", { class: "card adm-import-list", role: "list" });
    lines.forEach((line, i) => list.append(lineCard(line, i, effs[i] ?? effective(line, undefined, cat, weekStart), cat)));
    if (lines.length > 0) resultHost.append(list);

    const skip = lines.length - okCount;
    const submit = button({
      label: okCount > 0 ? tt(lang, "import.submit", { n: okCount, m: skip }) : tt(lang, "import.submit.none"),
      kind: "primary",
      class: "adm-import-submit",
      disabled: okCount === 0,
      onClick: () => void doImport(submit),
    });
    bottom.append(submit);
  }

  function dishName(id: string): string {
    const d = catalog?.dishes[id];
    return d ? pick(d.name, lang) || id : id;
  }

  function lineCard(line: ParsedLine, idx: number, eff: Effective, cat: Catalog): HTMLElement {
    const icon =
      eff.status === "ok" || eff.status === "next-week"
        ? ["✓", "adm-import-ic-ok"]
        : eff.status === "unknown-dish"
          ? ["!", "adm-import-ic-bad"]
          : eff.status === "draft-dish"
            ? ["?", "adm-import-ic-warn"]
            : ["✕", "adm-import-ic-x"];
    const statusKey: Key =
      eff.status === "ok"
        ? "import.result.ok"
        : eff.status === "next-week"
          ? "import.result.nextWeek"
          : eff.status === "unknown-dish"
            ? "import.result.unknownDish"
            : eff.status === "draft-dish"
              ? "import.result.draftDish"
              : "import.result.unparsed";

    const main = h("div", { class: "adm-import-main" });
    const head = h("div", { class: "adm-import-head" });
    if (line.date && line.mealType) {
      head.append(h("b", {}, `${fmtDay(lang, line.date, weekStart)} ${tt(lang, `import.meal.${line.mealType}`)}`), " · ");
    } else {
      head.append(h("span", { class: "muted" }, tt(lang, "import.result.lineNo", { n: line.lineNo })), " · ");
    }
    if (eff.dishRef) {
      head.append(h("b", {}, dishName(eff.dishRef)));
      const fuzzy = line.dishNameRaw && (line.candidates?.[0]?.distance ?? 0) > 0 && eff.dishRef === line.dishRef;
      if (fuzzy || (state.edits.get(idx)?.dishRef && line.dishNameRaw)) {
        head.append(h("span", { class: "muted" }, ` · ${tt(lang, "import.result.matched")} ${line.dishNameRaw}`));
      }
    } else if (line.dishNameRaw) {
      head.append(h("b", {}, line.dishNameRaw));
    } else {
      head.append(h("span", { class: "adm-import-raw-inline" }, line.raw));
    }
    main.append(head);

    const sub = h("p", { class: `adm-import-status adm-import-status-${eff.status}` }, tt(lang, statusKey));
    if (eff.status === "unparsed") {
      if (line.reason) sub.append(` · ${line.reason}`);
      main.append(sub, h("pre", { class: "adm-import-raw" }, line.raw));
    } else {
      main.append(sub);
    }

    const side = h("div", { class: "adm-import-side" });
    if (eff.importable) {
      const inp = h("input", {
        class: "adm-import-servings",
        type: "number",
        inputmode: "numeric",
        min: "1",
        step: "1",
        value: String(eff.servings),
        "aria-label": tt(lang, "import.servings"),
      });
      inp.addEventListener("change", () => {
        const v = Math.round(Number(inp.value));
        const edit = state.edits.get(idx) ?? {};
        if (Number.isFinite(v) && v >= 1) edit.servings = v;
        else delete edit.servings;
        state.edits.set(idx, edit);
        inp.value = String(edit.servings ?? line.plannedServings ?? DEFAULT_SERVINGS);
        paintBottomOnly();
      });
      append(
        side,
        h("div", { class: "adm-import-servings-wrap" }, inp, h("span", { class: "muted" }, tt(lang, "import.servings"))),
        eff.servingsDefaulted ? h("span", { class: "muted adm-import-default" }, tt(lang, "import.servings.default")) : null,
      );
    }

    const actions = h("div", { class: "adm-import-actions" });
    if (eff.status === "unknown-dish") {
      actions.append(
        button({
          label: tt(lang, "import.action.new"),
          class: "adm-import-act",
          onClick: () => {
            setHandoff({ newDishName: line.dishNameRaw ?? "", returnTo });
            location.hash = adminHref("dish", "new");
          },
        }),
        swapSelect(line, idx, eff, cat),
      );
    } else if (eff.status === "draft-dish" && eff.dishRef) {
      const id = eff.dishRef;
      actions.append(
        button({
          label: tt(lang, "import.action.complete"),
          class: "adm-import-act",
          onClick: () => {
            setHandoff({ returnTo });
            location.hash = adminHref("dish", id);
          },
        }),
        swapSelect(line, idx, eff, cat),
      );
    } else if (eff.importable && ((line.candidates?.length ?? 0) > 1 || (line.candidates?.[0]?.distance ?? 0) > 0 || state.edits.get(idx)?.dishRef)) {
      actions.append(swapSelect(line, idx, eff, cat));
    }
    if (actions.childElementCount > 0) main.append(actions);

    return h("div", { class: `adm-import-line adm-import-line-${eff.status}`, role: "listitem" }, h("span", { class: `adm-import-ic ${icon[1]}`, "aria-hidden": "true" }, icon[0]), main, side);
  }

  /** 「换一个」：行内下拉，候选在前、全部菜在后（草稿标出来），就地改不跳转 */
  function swapSelect(line: ParsedLine, idx: number, eff: Effective, cat: Catalog): HTMLElement {
    const sel = h("select", { class: "adm-input adm-import-swap", "aria-label": tt(lang, "import.action.swap") });
    sel.append(h("option", { value: "" }, tt(lang, "import.action.swap")));
    const seen = new Set<string>();
    if (line.candidates && line.candidates.length > 0) {
      const g = h("optgroup", { label: tt(lang, "import.swap.candidates") });
      for (const c of line.candidates) {
        if (!cat.dishes[c.id]) continue;
        seen.add(c.id);
        g.append(h("option", { value: c.id }, `${dishName(c.id)}${cat.dishes[c.id]?.status === "draft" ? ` ${tt(lang, "import.swap.draft")}` : ""}`));
      }
      sel.append(g);
    }
    const all = h("optgroup", { label: tt(lang, "import.swap.all") });
    const ids = Object.keys(cat.dishes)
      .filter((id) => cat.dishes[id]?.status !== "archived")
      .sort((a, b) => dishName(a).localeCompare(dishName(b), lang));
    for (const id of ids) {
      if (seen.has(id)) continue;
      all.append(h("option", { value: id }, `${dishName(id)}${cat.dishes[id]?.status === "draft" ? ` ${tt(lang, "import.swap.draft")}` : ""}`));
    }
    sel.append(all);
    sel.value = eff.dishRef ?? "";
    sel.addEventListener("change", () => {
      const edit = state.edits.get(idx) ?? {};
      if (sel.value) edit.dishRef = sel.value;
      else delete edit.dishRef;
      state.edits.set(idx, edit);
      paintResults();
    });
    return sel;
  }

  function paintBottomOnly(): void {
    if (!catalog || !state.parsed) return;
    const cat = catalog;
    const effs = state.parsed.map((l, i) => effective(l, state.edits.get(i), cat, weekStart));
    const okCount = effs.filter((e) => e.importable).length;
    const btn = bottom.querySelector<HTMLButtonElement>(".adm-import-submit");
    if (btn) {
      btn.textContent = okCount > 0 ? tt(lang, "import.submit", { n: okCount, m: effs.length - okCount }) : tt(lang, "import.submit.none");
      btn.disabled = okCount === 0;
    }
  }

  // —— 导入：合并成 MenuPlan → store（不调写入端点）→ 跳周视图 ——
  async function doImport(btn: HTMLButtonElement): Promise<void> {
    if (!catalog || !state.parsed) return;
    const cat = catalog;
    const meals: MenuPlanMeal[] = [];
    state.parsed.forEach((line, i) => {
      const eff = effective(line, state.edits.get(i), cat, weekStart);
      if (!eff.importable || !eff.dishRef || !line.date || !line.mealType) return;
      meals.push({ date: line.date, mealType: line.mealType, dishRef: eff.dishRef, plannedServings: eff.servings });
    });
    if (meals.length === 0) return;
    const done = busyButton(btn);
    try {
      let base = getDraftPlan(planId);
      if (!base) {
        const saved = await getApi().getPlan(planId);
        base = saved?.content ?? null;
      }
      if (!el.isConnected) return;
      setDraftPlan(planId, mergePlan(base, meals, planId, weekStart), "import");
      state.imported = true;
      location.hash = planHref;
    } catch (err) {
      if (!el.isConnected) return;
      if (isApiError(err) && err.status === 401) {
        sessionExpired(el, lang);
        return;
      }
      replace(noticeHost, errorCard(apiMessage(err, lang), () => void doImport(btn)));
      noticeHost.scrollIntoView({ block: "start", behavior: "smooth" });
    } finally {
      done();
    }
  }

  function busyButton(btn: HTMLButtonElement): () => void {
    const text = btn.textContent;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("adm-busy");
    return () => {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.classList.remove("adm-busy");
      btn.textContent = text;
    };
  }

  // —— 交互：输入 → 300 ms 防抖解析；「解析」按钮立即解析 ——
  let timer: number | null = null;
  const scheduleParse = (): void => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      if (!catalog || !el.isConnected) return;
      runParse(catalog, weekStart);
      paintResults();
    }, PARSE_DEBOUNCE_MS);
  };
  ta.addEventListener("input", () => {
    state.text = ta.value;
    state.source = "paste";
    state.edits = new Map();
    fitRows();
    parseBtn.disabled = !catalog || !ta.value.trim();
    scheduleParse();
  });
  parseBtn.addEventListener("click", () => {
    if (!catalog) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    state.text = ta.value;
    state.source = "paste";
    runParse(catalog, weekStart);
    paintResults();
  });

  // —— 读菜品名单（模糊匹配的字典）；失败 → errorCard + 重试；401 → 锁屏 ——
  async function loadCatalog(): Promise<void> {
    replace(catalogHint, tt(lang, "import.catalog.loading"));
    try {
      const c = await getApi().getCatalog();
      if (!el.isConnected) return;
      catalog = c;
      replace(catalogHint);
      paintDraftNotice(); // 重试成功后把 errorCard 撤掉
      parseBtn.disabled = !ta.value.trim();
      // 回填：有旧结果（切语言 / 从「新建」回来）就用新的名单重算一遍，行内改动按下标保留
      if (currentText().trim()) runParse(catalog, weekStart);
      paintResults();
    } catch (err) {
      if (!el.isConnected) return;
      if (isApiError(err) && err.status === 401) {
        sessionExpired(el, lang);
        return;
      }
      replace(catalogHint);
      replace(noticeHost, errorCard(apiMessage(err, lang), () => void loadCatalog()));
    }
  }
  await loadCatalog();
}
