/** Back-office entries use the selected saved plan and explicitly qualified publication status. */
import "./home.css";

import type {AnyMenuPlan} from '@canteenos/core';

import { adm, apiMessage, errorCard, notice, sessionExpired, topBar } from "../../admin/kit";
import { onAuthSessionChange } from "../../admin/token";
import { getApi } from "../../api/client";
import { getTeamMealsApi, type TeamCatalog, type TeamMealsApi } from "../../api/team-meals";
import type { Changes } from "../../api/types";
import { isApiError } from "../../api/types";
import { h, replace } from "../../dom";
import { pick, type Lang, onLangChange, type TParams } from "../../i18n";
import { hrefOf, onRoute } from "../../router";
import { formatBuiltAt, netState } from "../../shell";
import type { PageCtx } from "../../types";
import { adminHref } from "../admin";
import { text as teamText } from "../team-ui";
import { registerAuxiliaryEdits, type AuxiliaryEditHandle } from "../../view-models/reload-safety";
import {currentPlan,selectPlan} from './plan-context';

// ---------------------------------------------------------------------------
// 文案（§5.4 `home.` 最小集 + 本屏自用；zh 权威，en 直译，uk 初稿待帮厨校对）
// ---------------------------------------------------------------------------

const T = {
  "home.title": { uk: "Кабінет шефа", zh: "师傅后台", en: "Back office" },
  "home.nav": { uk: "Розділи кабінету", zh: "后台入口", en: "Back-office sections" },
  "home.unpublished": { uk: "Змін ще не опубліковано: {n}", zh: "{n} 项改动还没发布", en: "{n} changes not published yet" },
  "home.unpublished.none": { uk: "Немає змін, що очікують публікації", zh: "没有待发布的改动", en: "No changes awaiting publication" },
  "home.lastPublished": { uk: "Остання публікація: {t}", zh: "上次发布 {t}", en: "Last published {t}" },
  "home.lastPublished.never": { uk: "Немає доступних записів публікації", zh: "没有可用的发布记录", en: "No publication history available" },
  "home.publish": { uk: "Опублікувати", zh: "发布", en: "Publish" },
  "home.block.plan": { uk: "Скласти меню", zh: "排菜单", en: "Plan the menu" },
  "home.block.plan.week": { uk: "Тиждень {n}", zh: "第 {n} 周", en: "Week {n}" },
  "home.block.plan.sub": { uk: "Заплановано прийомів їжі: {n}", zh: "已排 {n} 餐", en: "{n} meal slots planned" },
  "home.block.dish": { uk: "Додати страву", zh: "加一道菜", en: "Add a dish" },
  "home.block.dish.sub": { uk: "Ввести вручну", zh: "手动输入这道菜", en: "Type it in by hand" },
  "home.block.draft": { uk: "На підтвердження", zh: "待确认", en: "To confirm" },
  "home.block.draft.sub": { uk: "Чернеток страв: {n}", zh: "{n} 道草稿", en: "{n} draft dishes" },
  "home.block.draft.none": { uk: "Нічого підтверджувати", zh: "没有要确认的", en: "Nothing to confirm" },
  "home.block.ingredient": { uk: "Додати інгредієнт", zh: "新增食材", en: "Add ingredient" },
  "home.block.ingredient.sub": { uk: "Інгредієнтів: {n}", zh: "{n} 个食材", en: "{n} ingredients" },
  "home.block.ingredient.seasoning": { uk: "Бракує ще {n} звичних приправ", zh: "常用调料还差 {n} 个", en: "{n} common seasonings still missing" },
  "home.block.translate": { uk: "Переклади на перевірку", zh: "翻译待审", en: "Translations to review" },
  "home.block.translate.sub": { uk: "Машинних перекладів: {n}", zh: "{n} 条机翻", en: "{n} machine-translated" },
  "home.block.translate.later": { uk: "Окремого екрана перевірки немає. Перевіряйте переклад у редакторі страви або інгредієнта.", zh: "暂不支持集中审阅；可在对应菜品或食材编辑页核对译文。", en: "Bulk review is unavailable. Check translations in the relevant dish or ingredient editor." },
  "home.block.qr": { uk: "QR-коди", zh: "二维码", en: "QR codes" },
  "home.block.qr.sub": { uk: "Роздрукувати на стіну: підготовка / закупівля / меню", zh: "打印贴墙：备料 / 采购 / 菜单", en: "Print and pin up: prep / purchasing / menu" },
  "home.block.log": { uk: "Історія публікацій", zh: "发布记录", en: "Publish history" },
  "home.block.log.sub": { uk: "Можна повернутися до попередньої версії", zh: "可以回到上一版", en: "You can go back to the previous version" },
  "home.number.unknown": { uk: "Цифри поки недоступні", zh: "数字暂时取不到", en: "Numbers unavailable right now" },
  "home.session.changed": { uk: "Сеанс змінився. Відкрийте кабінет знову", zh: "登录会话已变化，请重新打开工作台", en: "Session changed. Open the dashboard again" },
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

// ---------------------------------------------------------------------------
// 模块级状态（推论 A：切语言不重新请求、数字不丢）
// ---------------------------------------------------------------------------

type Loaded<V> = { ok: true; value: V } | { ok: false; error: unknown };

interface PlanCount {
  planId: string | null;
  meals: number|null;
  name?:AnyMenuPlan['name'];
}

interface Snapshot {
  /** 缺 = 还在读 */
  changes?: Loaded<Changes>;
  catalog?: Loaded<TeamCatalog>;
  plan?: Loaded<PlanCount>;
}

let snapshot: Snapshot = {};
interface HomeOwner { api: TeamMealsApi; session: number; registration: AuxiliaryEditHandle; generation: number; reads: number }
let snapshotOwner: HomeOwner | null = null;

/** 取数的代数：新一轮 load() / 401 之后，上一轮晚到的结果一律丢弃 */
let generation = 0;

/** 当前挂着的那份 DOM：晚到的请求结果画到它上面（旧 el 已被壳层摘掉，画不画都无害） */
let mounted: { el: HTMLElement; paint(): void; expire(): void; invalidate(): void } | null = null;

/** Logout/auth replacement removes private numbers immediately, without clearing a newer token. */
onAuthSessionChange(() => {
  snapshotOwner?.registration.dispose();
  snapshot = {};
  snapshotOwner = null;
  generation++;
  if (mounted?.el.isConnected) mounted.invalidate();
  mounted = null;
});

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

/** The explicit in-session plan wins, followed by the validated public manifest selection. */
function currentPlanId(ctx: PageCtx): string | null {
  return currentPlan(ctx,getTeamMealsApi()).id;
}

// ---------------------------------------------------------------------------
// 从 catalog 算屏上的数
// ---------------------------------------------------------------------------

/** 草稿菜 id，升序（D-10 的「第一条」= 排序后的第一个） */
function draftIds(catalog: TeamCatalog): string[] {
  // core/types.ts：status 缺省视为 draft
  return Object.entries(catalog.dishes)
    .filter(([, d]) => (d.status ?? "draft") === "draft")
    .map(([id]) => id)
    .sort();
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

function load(ctx: PageCtx, api: TeamMealsApi): void {
  if (api.mode === "unconfigured") return;
  const session = api.sessionKey();
  const owner = snapshotOwner;
  if (!owner || owner.api !== api || owner.session !== session) return;
  const planId = currentPlanId(ctx);
  const gen = ++generation;

  function arrived<K extends keyof Snapshot>(key: K, r: NonNullable<Snapshot[K]>): void {
    if (gen !== generation || snapshotOwner?.api !== api || snapshotOwner.session !== session || api.sessionKey() !== session) return;
    snapshot[key] = r;
    if (!mounted || !mounted.el.isConnected) return;
    if (!r.ok && isApiError(r.error) && r.error.status === 401) mounted.expire();
    else mounted.paint();
  }

  async function read<V>(request: () => Promise<V>): Promise<Loaded<V>> {
    const ticket = owner!.registration.beginOperation("read");
    owner!.reads++; owner!.generation++;
    try { return await settle(request()); }
    catch (error) { return { ok: false, error }; }
    finally { owner!.reads--; owner!.generation++; owner!.registration.settleOperation(ticket, "completed"); }
  }
  const requests: Promise<void>[] = [];
  if (api.mode === "real") requests.push(read(() => getApi().getChanges()).then((r) => arrived("changes", r)));
  requests.push(read(() => api.getCatalog()).then((r) => arrived("catalog", r)));
  requests.push(read<PlanCount>(() => planId ? api.getPlan(planId).then((s) => ({ planId, name:s?.content.name, meals: s?new Set(s.content.meals.map(m=>`${m.date}/${m.mealType}`)).size:0 })) : Promise.resolve({ planId, meals: null })).then((r) => {if(r.ok&&r.value.planId&&gen===generation&&owner===snapshotOwner&&api.sessionKey()===session&&currentPlan(ctx,api).id===planId)selectPlan(api,r.value.planId,r.value.name);arrived("plan", r);}));
  void Promise.allSettled(requests).finally(() => ctx.setReloadCoverage?.("tracked"));
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
    if(!changes.onlineCommit)bar.sub.textContent+=lang==='zh'?' · 线上版本尚未核实':lang==='en'?' · Live version is unverified':' · Поточну версію онлайн не перевірено';
    if(changes.truncated)bar.sub.textContent+=lang==='zh'?' · 仅取得部分改动':lang==='en'?' · Only some changes were retrieved':' · Отримано лише частину змін';
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
  const api = getTeamMealsApi();
  const session = api.sessionKey();
  const sameSession = snapshotOwner?.api === api && snapshotOwner.session === session;
  if (!sameSession) {
    snapshotOwner?.registration.dispose();
    snapshot = {};
    generation++;
    if (api.mode === "unconfigured") snapshotOwner = null;
    else {
      const owner: HomeOwner = { api, session, generation: 0, reads: 0,
        registration: registerAuxiliaryEdits({ ownerId: "home-reads", identity: { kind: "home", id: "home" }, boundary: api, operationTracking: "tickets",
          read: () => ({ generation: owner.generation, dirty: false, phase: owner.reads ? "busy" : "idle" }) }) };
      snapshotOwner = owner;
    }
  }

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
  plan.href = adminHref("plan",currentPlanId(ctx)??'');
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
    if (api.sessionKey() !== session || (api.mode !== "unconfigured" && (snapshotOwner?.api !== api || snapshotOwner.session !== session))) {
      invalidate();
      return;
    }
    const offline = netState() !== "online";
    const unconfigured = api.mode === "unconfigured";

    // 离线：顶部灰条；写入入口在最后一段统一置灰
    replace(offlineSlot, offline ? notice({ kind: "info", text: adm("adm.offline", undefined, lang) }) : null);

    // 状态条：读失败 → errorCard（worker 的 message 原样；网络错 = 「连不上后台」）+ 重试；否则只更新文字
    const ch = snapshot.changes;
    if (api.mode !== "real") {
      bar = null;
      replace(statSlot, notice({ kind: "info", text: teamText(lang, unconfigured ? "unconfigured" : "mock") }));
    } else if (ch && !ch.ok) {
      bar = null;
      replace(
        statSlot,
        errorCard(apiMessage(ch.error, lang), () => {
          delete snapshot.changes;
          paint();
          load(ctx, api);
        }),
      );
    } else {
      if (!bar) {
        bar = statBar(lang);
        replace(statSlot, bar.el);
      }
      paintStat(bar, lang, ch ? ch.value : null, offline);
    }

    // The named saved plan and unique date/meal slots, independent of dish rows.
    const pl = snapshot.plan;
    const chosen=currentPlan(ctx,api),name=pick(pl&&pl.ok?pl.value.name:chosen.name,lang);
    const mealsText = tt(lang, "home.block.plan.sub", { n: pl && pl.ok ? pl.value.meals??DASH : DASH });
    plan.href=adminHref('plan',chosen.id??'');
    plan.sub.textContent = name?`${name} · ${mealsText}`:mealsText;
    setNote(plan, unconfigured || (pl && !pl.ok) ? tt(lang, "home.number.unknown") : null);

    // 目录：草稿 / 食材 / 翻译
    const cat = snapshot.catalog;
    const catalog = cat && cat.ok ? cat.value : null;
    const catNote = unconfigured || (cat && !cat.ok) ? tt(lang, "home.number.unknown") : null;

    const drafts = catalog ? draftIds(catalog) : null;
    const draftN = drafts ? drafts.length : null;
    const firstDraft = drafts?.[0];
    draft.href = firstDraft ? adminHref("dish", firstDraft) : null; // D-10：第一条草稿的编辑屏；0 条 / 取不到 → 没有去处
    draft.sub.textContent =
      draftN === null ? tt(lang, "home.block.draft.sub", { n: DASH }) : draftN === 0 ? tt(lang, "home.block.draft.none") : tt(lang, "home.block.draft.sub", { n: draftN });
    setBadge(draft, lang, draftN);
    setNote(draft, catNote);

    const ingN = catalog ? Object.keys(catalog.ingredients).length : null;
    ingredient.sub.textContent = tt(lang, "home.block.ingredient.sub", { n: ingN ?? DASH });
    setNote(ingredient, catNote);

    const machineN = catalog ? catalog.translations.machine : null;
    translate.sub.textContent = tt(lang, "home.block.translate.sub", { n: machineN ?? DASH });
    setBadge(translate, lang, machineN);
    setNote(translate, catNote ?? tt(lang, "home.block.translate.later"));

    // 可点性：没有去处的置灰；离线时写入入口也置灰
    for (const t of tiles) setEnabled(t, !!t.href && !(offline && t.writes));
  }

  function invalidate(): void {
    if (expired) return;
    expired = true;
    replace(el, notice({ kind: "info", text: tt(lang, "home.session.changed") }));
  }

  /** 401：清令牌 + 锁屏；snapshot 清空，在途结果作废 */
  function expire(): void {
    if (expired) return;
    expired = true;
    snapshot = {};
    snapshotOwner?.registration.dispose();
    snapshotOwner = null;
    generation++;
    mounted = null;
    sessionExpired(el, lang);
  }

  mounted = { el, paint, expire, invalidate };
  paint();

  // 推论 A：语言切换触发的 render 只重画（上面已画），不再请求；还没到的那几路会在到达时画到这份 DOM 上
  const isLangSwitch = langSwitch;
  langSwitch = false;
  if (api.mode === "unconfigured") { ctx.setReloadCoverage?.("read-only"); return; }
  if (isLangSwitch && sameSession) { ctx.setReloadCoverage?.("tracked"); return; }
  load(ctx, api);
}
