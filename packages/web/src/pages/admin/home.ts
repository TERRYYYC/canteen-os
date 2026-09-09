/**
 * /admin 工作台（#20b；docs/specs/v03-admin-frontend-contract.md §4.1，版式照 docs/design/backoffice-v1.html 第 1 屏）。
 *
 * 屏上：顶部状态条「N 项改动还没发布 · 上次发布 hh:mm」+ 右侧「发布」chip，整条可点 → #/admin/publish；
 * 下面七个入口块（issue #20 正文 7 项，§9 矛盾 4）：排菜单（大块）/ 加一道菜 / 待确认 / 食材库 / 翻译待审 / 二维码 / 发布记录。
 *
 * 数据（§4.1 表；没有一个数字写死）：
 *   getChanges()              → unpublished.length / lastPublishedAt
 *   getPlan(currentPlanId())  → meals.length；不存在（null）→ 0。currentPlanId = core 的 planIdOfDate(今天)，算不出退回 ctx.planId（D-06）
 *   getCatalog()              → 草稿菜数（status 缺省视为 draft，core/types.ts）/ 食材数 / 调料缺口（< 20）/ translations.machine
 *
 * 四种态：加载态先画齐入口块、数字位「—」（导航不依赖数字，不做骨架闪烁）；N = 0 → 「都发布了」+ 发布 chip 置灰（条仍可点）；
 * getChanges 失败 → 状态条换 errorCard + 重试，入口块照常；getCatalog / getPlan 失败 → 该块数字「—」+ 小字「数字暂时取不到」，块仍可点；
 * 离线（netState() !== "online"）→ 顶部灰条「现在没网，后台只能看不能存」+ 写入入口置灰；401 → kit.sessionExpired（清令牌 + 锁屏）。
 *
 * 推论 A（语言切换 = 整页重新 render）：已取到的数字放模块级 snapshot。由语言切换触发的那次 render 只用 snapshot 重画、不再请求；
 * 换路由回来则重新取（api 层自有缓存，任何写入成功后自动失效，§3.5）。晚到的请求结果写进 snapshot 并画到**当前**挂着的那份 DOM。
 *
 * 待确认块（D-10）：指向第一条草稿（id 升序）的编辑屏 #/admin/dish/<id>；0 条置灰不可点。翻译待审：本轮没有审阅屏，置灰只显示数字（§7）。
 * 红点数字带 .sr-only 文字等价物；入口块是 <a>，min-height 44px；焦点顺序 = DOM 顺序：状态条 → 排菜单 → 其余块。
 *
 * 只动本文件与 home.css（§3.3）；缺的小件（状态条、入口块、红点）都写在这里，不改 kit.ts（§3.4 规则 0）。
 * 文本一律 textContent（dom.ts 的 h()）；样式全部 .adm-home 前缀。
 */
import "./home.css";

import { planIdOfDate } from "@canteenos/core";

import { adm, apiMessage, errorCard, notice, sessionExpired, topBar } from "../../admin/kit";
import { getApi } from "../../api/client";
import type { Catalog, Changes } from "../../api/types";
import { isApiError } from "../../api/types";
import { h, replace } from "../../dom";
import { type Lang, onLangChange, type TParams } from "../../i18n";
import { hrefOf, onRoute } from "../../router";
import { formatBuiltAt, netState } from "../../shell";
import type { PageCtx } from "../../types";
import { adminHref } from "../admin";

// ---------------------------------------------------------------------------
// 文案（§5.4 `home.` 最小集 + 本屏自用；zh 权威，en 直译，uk 初稿待帮厨校对）
// ---------------------------------------------------------------------------

const T = {
  "home.title": { uk: "Кабінет шефа", zh: "师傅后台", en: "Back office" },
  "home.nav": { uk: "Розділи кабінету", zh: "后台入口", en: "Back-office sections" },
  "home.unpublished": { uk: "Змін ще не опубліковано: {n}", zh: "{n} 项改动还没发布", en: "{n} changes not published yet" },
  "home.unpublished.none": { uk: "Усе опубліковано", zh: "都发布了", en: "Everything is published" },
  "home.lastPublished": { uk: "Остання публікація: {t}", zh: "上次发布 {t}", en: "Last published {t}" },
  "home.lastPublished.never": { uk: "Ще жодного разу не публікувалося", zh: "还没发布过", en: "Never published yet" },
  "home.publish": { uk: "Опублікувати", zh: "发布", en: "Publish" },
  "home.block.plan": { uk: "Скласти меню", zh: "排菜单", en: "Plan the menu" },
  "home.block.plan.week": { uk: "Тиждень {n}", zh: "第 {n} 周", en: "Week {n}" },
  "home.block.plan.sub": { uk: "Цього тижня заплановано прийомів їжі: {n}", zh: "本周已排 {n} 餐", en: "{n} meals planned this week" },
  "home.block.dish": { uk: "Додати страву", zh: "加一道菜", en: "Add a dish" },
  "home.block.dish.sub": { uk: "Ввести вручну", zh: "手动输入这道菜", en: "Type it in by hand" },
  "home.block.draft": { uk: "На підтвердження", zh: "待确认", en: "To confirm" },
  "home.block.draft.sub": { uk: "Чернеток страв: {n}", zh: "{n} 道草稿", en: "{n} draft dishes" },
  "home.block.draft.none": { uk: "Нічого підтверджувати", zh: "没有要确认的", en: "Nothing to confirm" },
  "home.block.ingredient": { uk: "Інгредієнти", zh: "食材库", en: "Ingredients" },
  "home.block.ingredient.sub": { uk: "Інгредієнтів: {n}", zh: "{n} 个食材", en: "{n} ingredients" },
  "home.block.ingredient.seasoning": { uk: "Бракує ще {n} звичних приправ", zh: "常用调料还差 {n} 个", en: "{n} common seasonings still missing" },
  "home.block.translate": { uk: "Переклади на перевірку", zh: "翻译待审", en: "Translations to review" },
  "home.block.translate.sub": { uk: "Машинних перекладів: {n}", zh: "{n} 条机翻", en: "{n} machine-translated" },
  "home.block.translate.later": { uk: "Екран перевірки буде наступного разу", zh: "审阅屏下一轮做", en: "Review screen comes in a later round" },
  "home.block.qr": { uk: "QR-коди", zh: "二维码", en: "QR codes" },
  "home.block.qr.sub": { uk: "Роздрукувати на стіну: підготовка / закупівля / меню", zh: "打印贴墙：备料 / 采购 / 菜单", en: "Print and pin up: prep / purchasing / menu" },
  "home.block.log": { uk: "Історія публікацій", zh: "发布记录", en: "Publish history" },
  "home.block.log.sub": { uk: "Можна повернутися до попередньої версії", zh: "可以回到上一版", en: "You can go back to the previous version" },
  "home.number.unknown": { uk: "Цифри поки недоступні", zh: "数字暂时取不到", en: "Numbers unavailable right now" },
  "home.badge.sr": { uk: "Очікують: {n}", zh: "{n} 项待处理", en: "{n} pending" },
} as const satisfies Record<string, Record<Lang, string>>;

type HomeKey = keyof typeof T;

function tt(lang: Lang, key: HomeKey, params?: TParams): string {
  let s: string = T[key][lang];
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** 数字还没到 / 取不到时数字位显示的占位（§4.1 加载态） */
const DASH = "—";
/** 执行简报 §3 v0.4「含常用调料 ≥ 20」：调料少于这个数就提示缺口（阈值来自简报；屏上显示的缺口数现算） */
const SEASONING_TARGET = 20;

// ---------------------------------------------------------------------------
// 模块级状态（推论 A：切语言不重新请求、数字不丢）
// ---------------------------------------------------------------------------

type Loaded<V> = { ok: true; value: V } | { ok: false; error: unknown };

interface PlanCount {
  planId: string | null;
  meals: number;
}

interface Snapshot {
  /** 缺 = 还在读 */
  changes?: Loaded<Changes>;
  catalog?: Loaded<Catalog>;
  plan?: Loaded<PlanCount>;
}

let snapshot: Snapshot = {};

/** 取数的代数：新一轮 load() / 401 之后，上一轮晚到的结果一律丢弃 */
let generation = 0;

/** 当前挂着的那份 DOM：晚到的请求结果画到它上面（旧 el 已被壳层摘掉，画不画都无害） */
let mounted: { el: HTMLElement; paint(): void; expire(): void } | null = null;

/**
 * 下一次 render 是不是语言切换触发的。main.ts 的 onLangChange 监听先注册、先执行（它同步走到 pages/admin.ts 的
 * `await import(...)` 才让出），随后才轮到这里把标记置 true；本屏的 render 在那之后的微任务里跑，读到 true 就只重画不请求。
 * hashchange（换路由 / 从别的屏回来）先把标记清掉，所以那种情况仍会重新取数。
 */
let langSwitch = false;
onLangChange(() => {
  langSwitch = true;
});
onRoute(() => {
  langSwitch = false;
}, false);

/** 在线 / 离线变化：只重画离线条与置灰，不请求 */
function onNet(): void {
  if (mounted && mounted.el.isConnected) mounted.paint();
}
window.addEventListener("online", onNet);
window.addEventListener("offline", onNet);

// ---------------------------------------------------------------------------
// 周号（D-06：换算只有 core 一份 —— planIdOfDate；算不出退回 ctx.planId）
// ---------------------------------------------------------------------------

/**
 * 本周的 planId：core 的 planIdOfDate（`week-<ISO 周号>`，**不补零**：week-5 / week-41，与 data/menu-plans/week-41.json 同形）；
 * 拿不到就退回 ctx.planId（= build.json.plans[0]）。now 取本地日历日（今天几号以用户所在时区为准），再按 core 的 UTC 规则算周。
 */
function currentPlanId(ctx: PageCtx, now: Date = new Date()): string | null {
  if (Number.isNaN(now.getTime())) return ctx.planId;
  const localDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
  return planIdOfDate(localDay) ?? ctx.planId;
}

/** 「week-41」→ 41；不是这个形状 → null（子标题里的「第 N 周」只在认得出时显示） */
function weekOf(planId: string | null): number | null {
  const m = planId ? /^week-(\d{1,2})$/.exec(planId) : null;
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// 从 catalog 算屏上的数
// ---------------------------------------------------------------------------

/** 草稿菜 id，升序（D-10 的「第一条」= 排序后的第一个） */
function draftIds(catalog: Catalog): string[] {
  // core/types.ts：status 缺省视为 draft
  return Object.entries(catalog.dishes)
    .filter(([, d]) => (d.status ?? "draft") === "draft")
    .map(([id]) => id)
    .sort();
}

function seasoningCount(catalog: Catalog): number {
  return Object.values(catalog.ingredients).filter((i) => i.role === "seasoning").length;
}

// ---------------------------------------------------------------------------
// 取数：三路并行，各自到了就写 snapshot 并重画当前 DOM
// ---------------------------------------------------------------------------

async function settle<V>(p: Promise<V>): Promise<Loaded<V>> {
  try {
    return { ok: true, value: await p };
  } catch (error) {
    return { ok: false, error };
  }
}

function load(ctx: PageCtx): void {
  const api = getApi();
  const planId = currentPlanId(ctx);
  const gen = ++generation;

  function arrived<K extends keyof Snapshot>(key: K, r: NonNullable<Snapshot[K]>): void {
    if (gen !== generation) return; // 已经有新一轮 / 已 401：丢弃
    snapshot[key] = r;
    if (!mounted || !mounted.el.isConnected) return;
    if (!r.ok && isApiError(r.error) && r.error.status === 401) mounted.expire();
    else mounted.paint();
  }

  void settle(api.getChanges()).then((r) => arrived("changes", r));
  void settle(api.getCatalog()).then((r) => arrived("catalog", r));
  const meals: Promise<PlanCount> = planId
    ? api.getPlan(planId).then((s) => ({ planId, meals: s?.content.meals.length ?? 0 })) // 不存在 → null → 0
    : Promise.resolve({ planId, meals: 0 });
  void settle(meals).then((r) => arrived("plan", r));
}

// ---------------------------------------------------------------------------
// 小件：入口块、红点、状态条（本屏私有，不进 kit.ts）
// ---------------------------------------------------------------------------

interface Tile {
  el: HTMLAnchorElement;
  name: HTMLElement;
  sub: HTMLElement;
  note: HTMLElement;
  badge: HTMLElement | null;
  badgeNum: HTMLElement | null;
  badgeSr: HTMLElement | null;
  /** 写入入口：离线时置灰 */
  writes: boolean;
  /** 正常（在线、有目标）时的 href；null = 本身就没有去处（翻译待审、0 条草稿） */
  href: string | null;
}

function tile(opts: { key: string; big?: boolean; badge?: boolean; writes: boolean }): Tile {
  const name = h("span", { class: "adm-home-tile-name" });
  const sub = h("span", { class: "adm-home-tile-sub" });
  const note = h("span", { class: "adm-home-tile-note", hidden: true });
  let badge: HTMLElement | null = null;
  let badgeNum: HTMLElement | null = null;
  let badgeSr: HTMLElement | null = null;
  if (opts.badge) {
    badgeNum = h("span", { "aria-hidden": "true" });
    badgeSr = h("span", { class: "sr-only" });
    badge = h("span", { class: "adm-home-badge", hidden: true }, badgeNum, badgeSr);
  }
  const el = h(
    "a",
    { class: `adm-home-tile adm-home-tile-${opts.key}${opts.big ? " adm-home-tile-big" : ""}` },
    badge,
    h("span", { class: "adm-home-tile-text" }, name, sub, note),
  );
  return { el, name, sub, note, badge, badgeNum, badgeSr, writes: opts.writes, href: null };
}

/** 置灰 = 去掉 href（不可点、不进焦点序）+ aria-disabled；恢复 = 放回 href */
function setEnabled(t: Tile, enabled: boolean): void {
  if (enabled && t.href) {
    t.el.setAttribute("href", t.href);
    t.el.removeAttribute("aria-disabled");
    t.el.classList.remove("adm-home-tile-off");
  } else {
    t.el.removeAttribute("href");
    t.el.setAttribute("aria-disabled", "true");
    t.el.classList.add("adm-home-tile-off");
  }
}

/** 红点：数字 aria-hidden，旁边一份 .sr-only 文字等价物（§4.1 移动端与键盘）；null / 0 → 不显示 */
function setBadge(t: Tile, lang: Lang, n: number | null): void {
  if (!t.badge || !t.badgeNum || !t.badgeSr) return;
  const show = n !== null && n > 0;
  t.badge.hidden = !show;
  t.badgeNum.textContent = show ? String(n) : "";
  t.badgeSr.textContent = show ? tt(lang, "home.badge.sr", { n }) : "";
}

function setNote(t: Tile, text: string | null): void {
  t.note.hidden = !text;
  t.note.textContent = text ?? "";
}

interface StatBar {
  el: HTMLAnchorElement;
  main: HTMLElement;
  sub: HTMLElement;
  chip: HTMLElement;
}

/** 顶部状态条：整条是 <a> → #/admin/publish；右侧「发布」chip 只是视觉 */
function statBar(lang: Lang): StatBar {
  const main = h("b", { class: "adm-home-stat-main" });
  const sub = h("span", { class: "adm-home-stat-sub" });
  const chip = h("span", { class: "chip adm-home-stat-chip" }, tt(lang, "home.publish"));
  const el = h(
    "a",
    { class: "adm-home-stat card", href: adminHref("publish"), "data-state": "loading" },
    h("span", { class: "adm-home-stat-dot", "aria-hidden": "true" }),
    h("span", { class: "adm-home-stat-body" }, main, sub),
    chip,
  );
  return { el, main, sub, chip };
}

function paintStat(bar: StatBar, lang: Lang, changes: Changes | null, offline: boolean): void {
  if (!changes) {
    bar.el.dataset.state = "loading";
    bar.main.textContent = adm("adm.loading", undefined, lang);
    bar.sub.textContent = "";
  } else {
    const n = changes.unpublished.length;
    bar.el.dataset.state = n > 0 ? "pending" : "clean";
    bar.main.textContent = n > 0 ? tt(lang, "home.unpublished", { n }) : tt(lang, "home.unpublished.none");
    bar.sub.textContent = changes.lastPublishedAt
      ? tt(lang, "home.lastPublished", { t: formatBuiltAt(changes.lastPublishedAt, lang) })
      : tt(lang, "home.lastPublished.never");
  }
  // 发布 chip：有未发布且在线才亮；N = 0 或离线置灰（整条仍可点进发布屏看记录）
  const live = !!changes && changes.unpublished.length > 0 && !offline;
  bar.chip.classList.toggle("accent", live);
  bar.chip.setAttribute("aria-disabled", live ? "false" : "true");
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

export function render(el: HTMLElement, ctx: PageCtx, rest: string): void {
  void rest; // 工作台没有子状态
  const lang = ctx.lang;

  const offlineSlot = h("div", { class: "adm-home-offline-slot" });
  const statSlot = h("div", { class: "adm-home-stat-slot" });

  const plan = tile({ key: "plan", big: true, writes: true });
  const dish = tile({ key: "dish", writes: true });
  const draft = tile({ key: "draft", badge: true, writes: true });
  const ingredient = tile({ key: "ingredient", writes: true });
  const translate = tile({ key: "translate", badge: true, writes: false });
  const qr = tile({ key: "qr", writes: false });
  const log = tile({ key: "log", writes: false });
  const tiles = [plan, dish, draft, ingredient, translate, qr, log];

  // 固定文案 + 固定去处（不依赖数字，加载态就能点）
  plan.name.textContent = tt(lang, "home.block.plan");
  plan.href = adminHref("plan");
  dish.name.textContent = tt(lang, "home.block.dish");
  dish.sub.textContent = tt(lang, "home.block.dish.sub");
  dish.href = adminHref("dish", "new");
  draft.name.textContent = tt(lang, "home.block.draft");
  ingredient.name.textContent = tt(lang, "home.block.ingredient");
  ingredient.href = adminHref("ingredient", "new");
  translate.name.textContent = tt(lang, "home.block.translate");
  translate.href = null; // §7：本轮没有审阅屏，只显示数字
  qr.name.textContent = tt(lang, "home.block.qr");
  qr.sub.textContent = tt(lang, "home.block.qr.sub");
  qr.href = hrefOf("qr");
  log.name.textContent = tt(lang, "home.block.log");
  log.sub.textContent = tt(lang, "home.block.log.sub");
  log.href = adminHref("publish");

  const nav = h("nav", { class: "adm-home-tiles", "aria-label": tt(lang, "home.nav") }, ...tiles.map((t) => t.el));
  el.append(h("div", { class: "adm adm-home" }, topBar({ title: tt(lang, "home.title") }), offlineSlot, statSlot, nav));

  let bar: StatBar | null = null;
  let expired = false;

  function paint(): void {
    if (expired) return;
    const offline = netState() !== "online";

    // 离线：顶部灰条；写入入口在最后一段统一置灰
    replace(offlineSlot, offline ? notice({ kind: "info", text: adm("adm.offline", undefined, lang) }) : null);

    // 状态条：读失败 → errorCard（worker 的 message 原样；网络错 = 「连不上后台」）+ 重试；否则只更新文字
    const ch = snapshot.changes;
    if (ch && !ch.ok) {
      bar = null;
      replace(
        statSlot,
        errorCard(apiMessage(ch.error, lang), () => {
          delete snapshot.changes;
          paint();
          load(ctx);
        }),
      );
    } else {
      if (!bar) {
        bar = statBar(lang);
        replace(statSlot, bar.el);
      }
      paintStat(bar, lang, ch ? ch.value : null, offline);
    }

    // 排菜单：第 N 周 · 本周已排 n 餐
    const pl = snapshot.plan;
    const week = weekOf(pl && pl.ok ? pl.value.planId : currentPlanId(ctx));
    const mealsText = tt(lang, "home.block.plan.sub", { n: pl && pl.ok ? pl.value.meals : DASH });
    plan.sub.textContent = week === null ? mealsText : `${tt(lang, "home.block.plan.week", { n: week })} · ${mealsText}`;
    setNote(plan, pl && !pl.ok ? tt(lang, "home.number.unknown") : null);

    // 目录：草稿 / 食材 / 翻译
    const cat = snapshot.catalog;
    const catalog = cat && cat.ok ? cat.value : null;
    const catNote = cat && !cat.ok ? tt(lang, "home.number.unknown") : null;

    const drafts = catalog ? draftIds(catalog) : null;
    const draftN = drafts ? drafts.length : null;
    const firstDraft = drafts?.[0];
    draft.href = firstDraft ? adminHref("dish", firstDraft) : null; // D-10：第一条草稿的编辑屏；0 条 / 取不到 → 没有去处
    draft.sub.textContent =
      draftN === null ? tt(lang, "home.block.draft.sub", { n: DASH }) : draftN === 0 ? tt(lang, "home.block.draft.none") : tt(lang, "home.block.draft.sub", { n: draftN });
    setBadge(draft, lang, draftN);
    setNote(draft, catNote);

    const ingN = catalog ? Object.keys(catalog.ingredients).length : null;
    const seasoningGap = catalog ? Math.max(0, SEASONING_TARGET - seasoningCount(catalog)) : 0;
    let ingText = tt(lang, "home.block.ingredient.sub", { n: ingN ?? DASH });
    if (seasoningGap > 0) ingText += ` · ${tt(lang, "home.block.ingredient.seasoning", { n: seasoningGap })}`;
    ingredient.sub.textContent = ingText;
    ingredient.sub.classList.toggle("adm-home-tile-warn", seasoningGap > 0);
    setNote(ingredient, catNote);

    const machineN = catalog ? catalog.translations.machine : null;
    translate.sub.textContent = tt(lang, "home.block.translate.sub", { n: machineN ?? DASH });
    setBadge(translate, lang, machineN);
    setNote(translate, catNote ?? tt(lang, "home.block.translate.later"));

    // 可点性：没有去处的置灰；离线时写入入口也置灰
    for (const t of tiles) setEnabled(t, !!t.href && !(offline && t.writes));
  }

  /** 401：清令牌 + 锁屏；snapshot 清空，在途结果作废 */
  function expire(): void {
    if (expired) return;
    expired = true;
    snapshot = {};
    generation++;
    mounted = null;
    sessionExpired(el, lang);
  }

  mounted = { el, paint, expire };
  paint();

  // 推论 A：语言切换触发的 render 只重画（上面已画），不再请求；还没到的那几路会在到达时画到这份 DOM 上
  const isLangSwitch = langSwitch;
  langSwitch = false;
  if (isLangSwitch && (snapshot.changes || snapshot.catalog || snapshot.plan)) return;
  load(ctx);
}
