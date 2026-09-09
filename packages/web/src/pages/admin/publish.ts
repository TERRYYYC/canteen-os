/**
 * /admin/publish —— 发布屏（#25；docs/specs/v03-admin-frontend-contract.md §4.6）。
 *
 * 屏上四块（版式照 docs/design/backoffice-v1.html 第 7 屏）：
 *   1. 还没发布的改动：api.getChanges() 的 unpublished，按 endpoint + commit 首行拼人话（commit 级，不做逐字段 diff，§7 第 10 条）；
 *   2. 「发布」→ api.publish() → 拿 runId → 按 worker 契约 §4.6 轮询 api.getPublish(runId)，四步纵向进度 + 耗时；
 *      四步文案按 steps[].key 查本文件字典出三语（D-12 / §9 矛盾 8），key 认不出才兜底用 worker 的 label；
 *   3. 发布记录（最近 10 次，当前线上版标注）+「回到这版」→ 二次确认 → api.rollback(sha)；回退 ≠ 上线（ADR-0007 §7）；
 *   4. 打印贴墙 → #/qr（既有路由，不改）。
 *
 * 轮询（worker 契约 §4.6 / §4.4，D-16 / D-14）：
 *   - 前 30 秒每 2 秒一次，之后每 5 秒；status ∈ {success, failure, timeout, unmapped} 即停；
 *   - 429 → 退避 15 秒，最多 3 次，仍 429 → 停 + 「查太频繁了，去 Actions 页面看」；
 *   - runId 为 null（D-17：dispatch 返回 204，run 可能还没出现）→ 改轮 api.getPublishLatest()，拿到**新的** runId 再切回 getPublish；
 *     3 分钟仍找不到 → 停 + 提示去 Actions；
 *   - 页面隐藏（visibilitychange）暂停，回前台立即补一次；hashchange 离开本屏立即停；
 *   - 每次真正发请求前都看 el.isConnected：旧 el 被壳层摘掉（切屏 / 切语言）就不再动它。
 *
 * 推论 A：正在进行的 run、进度、已读到的 changes 全部放模块级变量（poll / changes / rollbackDone …），
 * 切语言 = 壳层换新 el 重新 render —— 这里只是把同一份状态用新语言再画一遍，轮询不中断、不重复起第二条
 * （render 只在 poll 处于 paused 时才补一次 tick）。
 *
 * 只写 textContent（dom.ts 的 h()）；worker 的 message / failureReason 原样显示，不翻译（§4.0，worker 契约 §1.5）。
 * 样式在同目录 publish.css，每条选择器以 .adm-pub 开头（§3.4）。
 */
import "./publish.css";

import { adm, apiMessage, busy, button, errorCard, notice, sessionExpired, topBar } from "../../admin/kit";
import { getApi } from "../../api/client";
import type { ChangeItem, Changes, PublishProgress, PublishRecord, PublishResult, PublishStep, PublishStepKey } from "../../api/types";
import { isApiError } from "../../api/types";
import { h, replace } from "../../dom";
import type { Lang, TParams } from "../../i18n";
import type { PageCtx } from "../../types";
import { adminHref } from "../admin";

// ---------------------------------------------------------------------------
// 文案（§5.4 `pub.*` 最小集 + 本屏自用；zh 是权威语言，uk 初稿待帮厨校对）
// ---------------------------------------------------------------------------

const T = {
  "pub.title": { uk: "Публікація", zh: "发布", en: "Publish" },
  "pub.changes": { uk: "Неопубліковані зміни", zh: "还没发布的改动", en: "Unpublished changes" },
  "pub.changes.count": { uk: "Неопубліковані зміни · {n}", zh: "还没发布的改动 · {n}", en: "Unpublished changes · {n}" },
  "pub.changes.none": { uk: "Усе опубліковано", zh: "都发布了", en: "Everything is published" },
  "pub.changes.truncated": { uk: "Показано лише останні 30", zh: "只显示最近 30 条", en: "Showing the latest 30 only" },
  "pub.lastPublished": { uk: "Остання публікація {at}", zh: "上次发布 {at}", en: "Last published {at}" },
  "pub.lastPublished.never": { uk: "Ще не публікувалося", zh: "还没发布过", en: "Never published yet" },
  "pub.online.unknown": { uk: "Невідомо, яка версія зараз онлайн", zh: "线上是哪一版还不清楚", en: "Can't tell which version is live" },
  "pub.publish": { uk: "Опублікувати", zh: "发布", en: "Publish" },
  "pub.publishing": { uk: "Публікую…", zh: "正在发布…", en: "Publishing…" },
  "pub.progress": { uk: "Триває публікація", zh: "正在发布", en: "Publishing" },
  "pub.result": { uk: "Результат публікації", zh: "发布结果", en: "Publish result" },
  "pub.step.validate": { uk: "Перевірка даних", zh: "检查数据", en: "Check data" },
  "pub.step.translate": { uk: "Доповнення перекладів", zh: "补翻译", en: "Fill in translations" },
  "pub.step.build": { uk: "Формування трьох аркушів", zh: "生成三张单", en: "Build the three sheets" },
  "pub.step.deploy": { uk: "Вихід онлайн", zh: "上线", en: "Go live" },
  "pub.state.pending": { uk: "Очікує", zh: "等着", en: "Waiting" },
  "pub.state.running": { uk: "Виконується", zh: "正在做", en: "In progress" },
  "pub.state.success": { uk: "Готово", zh: "好了", en: "Done" },
  "pub.state.failure": { uk: "Помилка", zh: "出错了", en: "Failed" },
  "pub.state.skipped": { uk: "Пропущено", zh: "跳过了", en: "Skipped" },
  "pub.queued": { uk: "Запущено — шукаю цю збірку…", zh: "已经让它开始了，正在找这次构建…", en: "Started — looking for this build…" },
  "pub.slow": {
    uk: "Повільніше, ніж зазвичай, — можна подивитися на сторінці Actions",
    zh: "比平时慢，可以去 Actions 页面看看",
    en: "Slower than usual — you can check the Actions page",
  },
  "pub.timeout": {
    uk: "Чекаємо надто довго — подивіться на сторінці Actions, що сталося",
    zh: "等太久了，去 Actions 页面看看到底怎么了",
    en: "Waited too long — check the Actions page to see what happened",
  },
  "pub.unmapped": {
    uk: "Процес публікації змінився — прогрес може показуватися неточно",
    zh: "发布流程变了，进度显示不准",
    en: "The publish flow changed — this progress view may be inaccurate",
  },
  "pub.openActions": { uk: "Відкрити сторінку Actions", zh: "打开 Actions 页面", en: "Open the Actions page" },
  "pub.failedAt": { uk: "Зупинилося на «{step}»", zh: "卡在「{step}」", en: "Stuck at “{step}”" },
  "pub.done": { uk: "Онлайн · усі побачать за дві хвилини", zh: "上线了 · 大家两分钟内能看到", en: "Live · everyone will see it within two minutes" },
  "pub.mode.pushTrigger": {
    uk: "Публікація йде тимчасовим каналом — прогрес може з'явитися на кілька секунд пізніше",
    zh: "发布走的是临时通道，进度可能晚几秒出现",
    en: "Publishing via the temporary channel — progress may appear a few seconds late",
  },
  "pub.mode.off": {
    uk: "Публікацію тимчасово вимкнено — чекаємо, поки Terry надасть доступ. Усі ваші зміни збережено ({n} неопублікованих); щойно доступ з'явиться, вони вийдуть разом.",
    zh: "发布暂时关着：等 Terry 把权限打开。你排的改动都已经存好了（{n} 项未发布），权限一开就能一次发出去。",
    en: "Publishing is switched off for now — waiting for Terry to grant access. Your changes are all saved ({n} unpublished); once access is granted they go out in one go.",
  },
  "pub.rateLimited": {
    uk: "Надто часті запити — подивіться на сторінці Actions",
    zh: "查太频繁了，去 Actions 页面看",
    en: "Checking too often — look at the Actions page instead",
  },
  "pub.noRun": {
    uk: "Минуло три хвилини, а збірку не знайдено — подивіться на сторінці Actions",
    zh: "三分钟了还没找到这次构建，去 Actions 页面看看",
    en: "Three minutes and still no build found — check the Actions page",
  },
  "pub.pollError": {
    uk: "Прогрес тимчасово недоступний ({msg}) — чекаємо далі",
    zh: "进度暂时读不到（{msg}），继续等",
    en: "Can't read the progress right now ({msg}) — still waiting",
  },
  "pub.total": { uk: "Разом {t}", zh: "一共 {t}", en: "Total {t}" },
  "pub.log": { uk: "Історія публікацій", zh: "发布记录", en: "Publish history" },
  "pub.log.online": { uk: "Зараз онлайн саме ця версія", zh: "现在线上就是这版", en: "This is what's live now" },
  "pub.log.run": { uk: "збірка #{id}", zh: "构建 #{id}", en: "build #{id}" },
  "pub.rollback": { uk: "Повернутися до цієї версії", zh: "回到这版", en: "Go back to this version" },
  "pub.rollback.confirm": { uk: "Повернути дані до {sha} (版本 від {at})?", zh: "要把数据退回到 {sha}（{at} 那版）吗？", en: "Roll the data back to {sha} (the {at} version)?" },
  "pub.rollback.note": {
    uk: "Повертаються лише дані — онлайн нічого не зміниться саме собою; після цього натисніть «Опублікувати» ще раз.",
    zh: "只退回数据，不会自动上线；退回之后要再点一次「发布」。",
    en: "Only the data is rolled back — nothing goes live by itself; press “Publish” again afterwards.",
  },
  "pub.rollback.go": { uk: "Повернути", zh: "退回", en: "Roll back" },
  "pub.rollback.busy": { uk: "Повертаю…", zh: "正在退回…", en: "Rolling back…" },
  "pub.rollback.done": {
    uk: "Повернуто до {sha} · змінено файлів: {n} · ще не онлайн — натисніть «Опублікувати» ще раз",
    zh: "已回退到 {sha} · 改了 {n} 个文件 · 还没上线，要上线请再点一次发布",
    en: "Rolled back to {sha} · {n} files changed · not live yet — press Publish again to go live",
  },
  "pub.rollback.noop": {
    uk: "{sha} збігається з поточними даними — нічого не змінено",
    zh: "{sha} 和现在的数据一模一样，什么都没改",
    en: "{sha} is identical to the current data — nothing changed",
  },
  "pub.rollback.wait": { uk: "Спочатку дочекайтеся кінця публікації", zh: "正在发布，先等它完成", en: "Wait for the publish to finish first" },
  "pub.print": { uk: "Друк на стіну", zh: "打印贴墙", en: "Print for the wall" },
  "pub.qr": { uk: "Роздрукувати QR-коди", zh: "打印二维码", en: "Print the QR codes" },
  "pub.qr.hint": {
    uk: "Три коди — заготовка, закупівля, меню — на одному аркуші A4",
    zh: "备料 / 采购 / 菜单三张码，A4 一页贴墙",
    en: "Prep, purchase and menu codes on one A4 sheet",
  },
  "pub.chg.plan": { uk: "Меню на тиждень {n}", zh: "第 {n} 周菜单", en: "Week {n} menu" },
  "pub.chg.plan.other": { uk: "Меню {id}", zh: "菜单 {id}", en: "Menu {id}" },
  "pub.chg.ingredient": { uk: "Інгредієнт · {id}", zh: "食材 · {id}", en: "Ingredient · {id}" },
  "pub.chg.dish": { uk: "Страва · {id}", zh: "菜 · {id}", en: "Dish · {id}" },
  "pub.chg.dishDraft": { uk: "Чернетка страви · {id}", zh: "草稿菜 · {id}", en: "Draft dish · {id}" },
  "pub.chg.rollback": { uk: "Повернення до {sha}", zh: "回退到 {sha}", en: "Rollback to {sha}" },
  "pub.chg.manual": { uk: "Ручна зміна", zh: "手工改动", en: "Manual change" },
  "pub.chg.files": { uk: "файлів: {n}", zh: "{n} 个文件", en: "{n} files" },
  "pub.role.chef": { uk: "шеф", zh: "师傅", en: "chef" },
  "pub.role.buyer": { uk: "закупівельник", zh: "采购", en: "buyer" },
  "pub.role.admin": { uk: "адміністратор", zh: "管理员", en: "admin" },
} as const satisfies Record<string, Record<Lang, string>>;

type Key = keyof typeof T;

function tt(lang: Lang, key: Key, params?: TParams): string {
  let s: string = T[key][lang];
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** 四步文案按 key 出三语（D-12）；key 不在这里 → 兜底用 worker 的 label */
const STEP_KEY: Record<PublishStepKey, Key> = {
  validate: "pub.step.validate",
  translate: "pub.step.translate",
  build: "pub.step.build",
  deploy: "pub.step.deploy",
};
const STEP_ORDER: readonly PublishStepKey[] = ["validate", "translate", "build", "deploy"];

function stepName(lang: Lang, step: Pick<PublishStep, "key" | "label">): string {
  const key = (STEP_KEY as Record<string, Key | undefined>)[step.key];
  return key ? tt(lang, key) : step.label;
}

const STATE_KEY: Record<PublishStep["state"], Key> = {
  pending: "pub.state.pending",
  in_progress: "pub.state.running",
  success: "pub.state.success",
  failure: "pub.state.failure",
  skipped: "pub.state.skipped",
};

/** 每步图标（图标 + 文字，不只靠颜色，§4.6 移动端与键盘） */
const STATE_ICON: Record<PublishStep["state"], string> = { pending: "·", in_progress: "●", success: "✓", failure: "✗", skipped: "–" };

// ---------------------------------------------------------------------------
// 时间
// ---------------------------------------------------------------------------

/** Intl 用的语言标签（与 i18n.ts 的 LANG_TAG 同值；这里抄一份，免得主 chunk 为本屏多导出一个符号） */
const INTL_TAG: Record<Lang, string> = { uk: "uk", zh: "zh-Hans", en: "en" };

/** 三张码的 A4 打印页：既有顶层路由 #/qr（router.ts），本轮不改；直接写字面量，不从主 chunk 导入 hrefOf */
const QR_HREF = "#/qr";

function fmtWhen(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameDay = d.toDateString() === new Date().toDateString();
  try {
    return new Intl.DateTimeFormat(INTL_TAG[lang], sameDay ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/** 0:03 / 1:21 */
function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function ms(iso: string | null): number | null {
  if (!iso) return null;
  const v = new Date(iso).getTime();
  return Number.isNaN(v) ? null : v;
}

/** 某一步的耗时：完成的用 completedAt − startedAt，进行中的用 now − startedAt；没开始 → null */
function stepElapsed(step: PublishStep, now: number): number | null {
  const start = ms(step.startedAt);
  if (start === null) return null;
  const end = ms(step.completedAt);
  if (end !== null) return end - start;
  return step.state === "in_progress" ? now - start : null;
}

/** 整次发布的耗时：第一步开始 → 最后一步完成（还没完就到 now） */
function totalElapsed(p: PublishProgress, now: number): number | null {
  let first: number | null = null;
  let last: number | null = null;
  let running = false;
  for (const s of p.steps) {
    const a = ms(s.startedAt);
    const b = ms(s.completedAt);
    if (a !== null && (first === null || a < first)) first = a;
    if (b !== null && (last === null || b > last)) last = b;
    if (s.state === "in_progress") running = true;
  }
  if (first === null) return null;
  const terminal = p.status === "success" || p.status === "failure" || p.status === "timeout" || p.status === "unmapped";
  return (running || !terminal ? now : (last ?? now)) - first;
}

// ---------------------------------------------------------------------------
// 模块级状态（推论 A：切语言 = 重新 render，一切都从这里回填）
// ---------------------------------------------------------------------------

const TERMINAL: ReadonlySet<PublishProgress["status"]> = new Set(["success", "failure", "timeout", "unmapped"]);
const FAST_MS = 2000;
const SLOW_MS = 5000;
const FAST_WINDOW_MS = 30_000;
const BACKOFF_MS = 15_000;
const MAX_BACKOFF = 3;
const NO_RUN_MS = 3 * 60_000;

type StopReason = "terminal" | "rate-limited" | "no-run" | "expired";

interface Poll {
  seq: number;
  runId: number | null;
  mode: PublishResult["mode"];
  startedAt: number;
  progress: PublishProgress | null;
  /** polling = 有定时器在等；paused = 页面隐藏 / 已离开本屏（回来会补一次）；done = 终态，不再发请求 */
  state: "polling" | "paused" | "done";
  timer: number | null;
  inflight: boolean;
  rateLimited: number;
  stop: StopReason | null;
  /** 读进度时的临时错误（非 429 / 401）：显示一行，继续轮 */
  transientError: string | null;
  /** 发布前发布记录里已有的 runId：getPublishLatest 返回其中之一 = 旧 run，还没认领到这次的 */
  knownRunIds: ReadonlySet<number>;
}

let poll: Poll | null = null;
let pollSeq = 0;
let changes: Changes | null = null;
let changesError: string | null = null;
let changesLoading = false;
let publishing = false;
/** 503 dispatch_unavailable：按钮置灰 + 一行说明（worker 契约 §5.2 D2） */
let publishOff = false;
let publishError: string | null = null;
let rollbackDone: { sha: string; n: number } | null = null;
let ticker: number | null = null;
let listenersBound = false;

interface View {
  el: HTMLElement;
  root: HTMLElement;
  lang: Lang;
  btn: HTMLButtonElement;
  notices: HTMLElement;
  changes: HTMLElement;
  progress: HTMLElement;
  log: HTMLElement;
  noticeSig: string;
  statusLine: HTMLElement | null;
  /** 上次画发布记录时 pollActive() 的值：变了才重画（轮询中「回到这版」置灰） */
  logWaiting: boolean | null;
}

let view: View | null = null;

/** 当前还挂在 DOM 上的视图；旧 el 被壳层摘掉后为 null */
function live(): View | null {
  return view && view.el.isConnected ? view : null;
}

function pollActive(): boolean {
  return poll !== null && poll.state !== "done";
}

// ---------------------------------------------------------------------------
// 轮询（worker 契约 §4.6）
// ---------------------------------------------------------------------------

function clearTimer(): void {
  if (poll?.timer != null) window.clearTimeout(poll.timer);
  if (poll) poll.timer = null;
}

function schedule(delay: number): void {
  if (!poll || poll.state === "done") return;
  clearTimer();
  poll.state = "polling";
  poll.timer = window.setTimeout(() => void tick(), delay);
}

function nextDelay(): number {
  return poll && Date.now() - poll.startedAt < FAST_WINDOW_MS ? FAST_MS : SLOW_MS;
}

function pausePolling(): void {
  if (!poll || poll.state === "done") return;
  clearTimer();
  poll.state = "paused";
}

function finish(reason: StopReason): void {
  if (!poll) return;
  clearTimer();
  poll.state = "done";
  poll.stop = reason;
  stopTicker();
}

function isOnThisScreen(): boolean {
  return /^#\/admin\/publish\/?$/.test(location.hash);
}

async function tick(): Promise<void> {
  const p = poll;
  if (!p || p.state === "done" || p.inflight) return;
  const v = live();
  if (!v || document.hidden) {
    pausePolling();
    return;
  }
  p.inflight = true;
  const seq = p.seq;
  const api = getApi();
  try {
    const progress = p.runId !== null ? await api.getPublish(p.runId) : await api.getPublishLatest();
    if (poll !== p || p.seq !== seq) return; // 期间点了新一次发布：这条作废
    p.rateLimited = 0;
    p.transientError = null;
    if (p.runId === null && progress.runId !== null && !p.knownRunIds.has(progress.runId)) {
      p.runId = progress.runId; // 认领到了，之后走 getPublish(runId)
    }
    if (p.runId === null) {
      // 最近一次 run 还是旧的（或 runId 仍是 null）：这次的还没出现，当 queued 继续等（D-17）
      if (Date.now() - p.startedAt > NO_RUN_MS) finish("no-run");
      else schedule(nextDelay());
    } else {
      p.progress = progress;
      if (TERMINAL.has(progress.status)) {
        finish("terminal");
        if (progress.status === "success") void loadChanges(true); // 未发布计数刷成 0，发布记录顶部多一条
      } else {
        schedule(nextDelay());
      }
    }
  } catch (err) {
    if (poll !== p || p.seq !== seq) return;
    if (isApiError(err) && err.status === 401) {
      finish("expired");
      const lv = live();
      if (lv) sessionExpired(lv.el, lv.lang);
      return;
    }
    if (isApiError(err) && err.status === 429) {
      p.rateLimited += 1;
      if (p.rateLimited > MAX_BACKOFF) finish("rate-limited");
      else schedule(Math.max(BACKOFF_MS, (err.retryAfter ?? 0) * 1000));
    } else if (isApiError(err) && err.status === 404 && p.runId === null) {
      // 还没有任何 run（真实 worker 的 GET /publish/latest 会 404）：继续找，3 分钟为限
      if (Date.now() - p.startedAt > NO_RUN_MS) finish("no-run");
      else schedule(nextDelay());
    } else {
      p.transientError = apiMessage(err);
      schedule(nextDelay());
    }
  } finally {
    p.inflight = false;
  }
  const lv = live();
  if (lv) {
    paintProgress(lv);
    paintNotices(lv);
    paintLogIfWaitingChanged(lv);
    syncButton(lv);
  }
}

/** render 时：轮询被暂停过（切屏又回来 / 切语言时定时器恰好打空）就补一次；正在等定时器的不动（不起第二条） */
function ensurePolling(): void {
  if (!poll || poll.state === "done") return;
  ensureTicker();
  if (poll.state === "paused" && !document.hidden) void tick();
}

/** 每秒刷新进行中那一步与总耗时（只改时间文本，不动 aria-live 的那一行） */
function ensureTicker(): void {
  if (ticker !== null) return;
  ticker = window.setInterval(() => {
    const v = live();
    if (!v || !poll || poll.state === "done") {
      stopTicker();
      return;
    }
    paintTimes(v);
  }, 1000);
}

function stopTicker(): void {
  if (ticker !== null) window.clearInterval(ticker);
  ticker = null;
}

function bindListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  window.addEventListener("hashchange", () => {
    if (!isOnThisScreen()) pausePolling(); // 离开本屏立即停（worker 契约 §4.6 终止条件）
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pausePolling();
    else if (live()) ensurePolling(); // 回前台立即补一次
  });
}

// ---------------------------------------------------------------------------
// 数据
// ---------------------------------------------------------------------------

async function loadChanges(force: boolean): Promise<void> {
  if (changesLoading) return;
  changesLoading = true;
  const v0 = live();
  if (v0) {
    paintChanges(v0);
    syncButton(v0);
  }
  try {
    changes = await getApi().getChanges(force ? { force: true } : undefined);
    changesError = null;
  } catch (err) {
    if (isApiError(err) && err.status === 401) {
      changesLoading = false;
      const lv = live();
      if (lv) sessionExpired(lv.el, lv.lang);
      return;
    }
    changesError = apiMessage(err);
  } finally {
    changesLoading = false;
  }
  const v = live();
  if (v) {
    paintChanges(v);
    paintLog(v);
    paintNotices(v);
    syncButton(v);
  }
}

async function onPublish(): Promise<void> {
  const v = live();
  if (!v || publishing || pollActive() || publishOff || !changes || changes.unpublished.length === 0) return;
  publishing = true;
  publishError = null;
  // 上一次的结果卡 / 绿条先撤掉：这次 publish() 若抛 503，屏上绝不能还留着「上线了」（worker 契约 §5.2）
  if (poll) finish("terminal");
  stopTicker();
  poll = null;
  rollbackDone = null;
  paintProgress(v);
  paintNotices(v);
  const done = busy(v.btn, tt(v.lang, "pub.publishing"));
  const known = new Set<number>();
  for (const rec of changes.publishes) if (rec.runId !== null) known.add(rec.runId);
  try {
    const res = await getApi().publish();
    poll = {
      seq: ++pollSeq,
      runId: res.runId,
      mode: res.mode,
      startedAt: Date.now(),
      progress: null,
      state: "polling",
      timer: null,
      inflight: false,
      rateLimited: 0,
      stop: null,
      transientError: null,
      knownRunIds: known,
    };
    ensureTicker();
    void tick(); // 立即读一次；之后按间隔
  } catch (err) {
    if (isApiError(err) && err.status === 401) {
      publishing = false;
      done();
      const lv = live();
      if (lv) sessionExpired(lv.el, lv.lang);
      return;
    }
    if (isApiError(err) && err.status === 503) publishOff = true; // 绝不能显示成「发布成功」
    else publishError = apiMessage(err);
  } finally {
    publishing = false;
    done();
  }
  const lv = live();
  if (lv) {
    paintNotices(lv);
    paintProgress(lv);
    paintLogIfWaitingChanged(lv);
    syncButton(lv);
  }
}

// ---------------------------------------------------------------------------
// 改动的人话化（commit 级；endpoint trailer + commit 首行，worker 契约 §3.6）
// ---------------------------------------------------------------------------

const ENDPOINT_RE = /^(?:POST|PUT|PATCH|DELETE)\s+\/(plan|ingredient|dish|rollback)\/([^/\s]+)(\/draft)?/;
const CONVENTIONAL_RE = /^[a-z]+(?:\([^)]*\))?!?:\s*/;

function changeTitle(c: ChangeItem, lang: Lang): string {
  const m = c.endpoint ? ENDPOINT_RE.exec(c.endpoint) : null;
  const kind = m?.[1];
  const id = m?.[2] ?? "";
  switch (kind) {
    case "plan": {
      const w = /^week-(\d{1,2})$/.exec(id);
      return w?.[1] ? tt(lang, "pub.chg.plan", { n: Number(w[1]) }) : tt(lang, "pub.chg.plan.other", { id });
    }
    case "ingredient":
      return tt(lang, "pub.chg.ingredient", { id });
    case "dish":
      return tt(lang, m?.[3] ? "pub.chg.dishDraft" : "pub.chg.dish", { id });
    case "rollback":
      return tt(lang, "pub.chg.rollback", { sha: id.slice(0, 7) });
    default:
      return tt(lang, "pub.chg.manual");
  }
}

function roleName(role: string | null, lang: Lang): string | null {
  if (role === "chef") return tt(lang, "pub.role.chef");
  if (role === "buyer") return tt(lang, "pub.role.buyer");
  if (role === "admin") return tt(lang, "pub.role.admin");
  return role;
}

function changeRow(c: ChangeItem, lang: Lang): HTMLElement {
  const subject = c.subject.replace(CONVENTIONAL_RE, "").trim();
  const meta = [subject, roleName(c.role, lang), fmtWhen(c.at, lang), tt(lang, "pub.chg.files", { n: c.files.length })].filter(Boolean).join(" · ");
  return h(
    "li",
    { class: "adm-pub-chg" },
    h("span", { class: "adm-pub-chg-dot", "aria-hidden": "true" }),
    h("div", { class: "adm-pub-chg-body" }, h("b", { class: "adm-pub-chg-title" }, changeTitle(c, lang)), h("span", { class: "adm-pub-chg-meta" }, meta)),
    h("code", { class: "adm-pub-sha" }, c.shortSha),
  );
}

// ---------------------------------------------------------------------------
// 画：各块只画自己，互不清空（轮询每 2–5 秒只重画进度块与提示条）
// ---------------------------------------------------------------------------

function sectionLabel(text: string): HTMLElement {
  return h("h3", { class: "section-label adm-pub-label" }, text);
}

function syncButton(v: View): void {
  const n = changes?.unpublished.length ?? 0;
  const disabled = publishing || pollActive() || publishOff || changesLoading || n === 0;
  v.btn.disabled = disabled;
  if (!publishing) v.btn.textContent = pollActive() ? tt(v.lang, "pub.publishing") : tt(v.lang, "pub.publish");
}

function paintChanges(v: View): void {
  const lang = v.lang;
  const box = v.changes;
  replace(box);
  if (!changes) {
    box.append(sectionLabel(tt(lang, "pub.changes")));
    if (changesError && !changesLoading) box.append(errorCard(changesError, () => void loadChanges(true)));
    else box.append(h("p", { class: "muted adm-pub-loading" }, adm("adm.loading", undefined, lang)));
    return;
  }
  const list = changes.unpublished;
  box.append(sectionLabel(list.length > 0 ? tt(lang, "pub.changes.count", { n: list.length }) : tt(lang, "pub.changes")));
  if (changesError) box.append(errorCard(changesError, () => void loadChanges(true)));
  if (list.length === 0) {
    box.append(h("div", { class: "card adm-pub-empty" }, h("p", {}, tt(lang, "pub.changes.none"))));
  } else {
    const ul = h("ul", { class: "adm-pub-list" });
    for (const c of list) ul.append(changeRow(c, lang));
    box.append(h("div", { class: "card" }, ul));
  }
  const bits: string[] = [];
  bits.push(changes.lastPublishedAt ? tt(lang, "pub.lastPublished", { at: fmtWhen(changes.lastPublishedAt, lang) }) : tt(lang, "pub.lastPublished.never"));
  if (changes.onlineCommit) bits.push(changes.onlineCommit.slice(0, 7));
  else bits.push(tt(lang, "pub.online.unknown"));
  if (changes.truncated) bits.push(tt(lang, "pub.changes.truncated"));
  box.append(h("p", { class: "muted adm-pub-foot" }, bits.join(" · ")));
}

/** 顶部提示条；签名没变就不重画（免得 role=alert 的条每 2 秒被重新播报一遍） */
function paintNotices(v: View): void {
  const lang = v.lang;
  const items: HTMLElement[] = [];
  const sig: string[] = [];
  const n = changes?.unpublished.length ?? 0;
  const actions = (href: string | undefined): { label: string; href: string } | undefined => (href ? { label: tt(lang, "pub.openActions"), href } : undefined);

  if (publishOff) {
    sig.push(`off:${n}`);
    // 「重试」只是解开置灰再让师傅点一次发布；权限没开的话 worker 还会 503，回到这条
    items.push(
      notice({
        kind: "warn",
        role: "status",
        text: tt(lang, "pub.mode.off", { n }),
        action: {
          label: adm("adm.retry", undefined, lang),
          onClick: () => {
            publishOff = false;
            const lv = live();
            if (lv) {
              paintNotices(lv);
              syncButton(lv);
              lv.btn.focus();
            }
          },
        },
      }),
    );
  }
  if (publishError) {
    sig.push(`perr:${publishError}`);
    items.push(errorCard(publishError, () => void onPublish()));
  }
  if (poll) {
    const p = poll.progress;
    const url = p?.htmlUrl;
    if (poll.mode === "push-trigger" && poll.state !== "done") {
      sig.push("push");
      items.push(notice({ kind: "warn", role: "status", text: tt(lang, "pub.mode.pushTrigger") }));
    }
    if (poll.stop === "rate-limited") {
      sig.push("429");
      items.push(notice({ kind: "warn", text: tt(lang, "pub.rateLimited"), action: actions(url) }));
    } else if (poll.stop === "no-run") {
      sig.push("norun");
      items.push(notice({ kind: "warn", text: tt(lang, "pub.noRun"), action: actions(url) }));
    } else if (p) {
      switch (p.status) {
        case "success":
          sig.push("ok");
          items.push(notice({ kind: "ok", text: tt(lang, "pub.done") }));
          break;
        case "failure": {
          const failed = p.steps.find((s) => s.key === p.failedStep) ?? (p.failedStep ? { key: p.failedStep as PublishStepKey, label: p.failedStep } : null);
          const at = failed ? tt(lang, "pub.failedAt", { step: stepName(lang, failed) }) : tt(lang, "pub.state.failure");
          sig.push(`fail:${p.failedStep ?? ""}:${p.failureReason ?? ""}`);
          const bar = notice({ kind: "warn", role: "alert", text: at, action: actions(url) });
          bar.classList.add("adm-pub-fail");
          if (p.failureReason) bar.append(h("code", { class: "adm-pub-reason" }, p.failureReason)); // 原样，不翻译
          items.push(bar);
          break;
        }
        case "timeout":
          sig.push("timeout");
          items.push(notice({ kind: "warn", text: tt(lang, "pub.timeout"), action: actions(url) }));
          break;
        case "unmapped":
          sig.push(`unmapped:${p.unmappedSteps.join(",")}`);
          items.push(notice({ kind: "warn", text: tt(lang, "pub.unmapped"), action: actions(url) }));
          break;
        default:
          if (p.slow) {
            sig.push("slow");
            items.push(notice({ kind: "warn", role: "status", text: tt(lang, "pub.slow"), action: actions(url) }));
          }
      }
    }
    if (poll.transientError && poll.state !== "done") {
      sig.push(`terr:${poll.transientError}`);
      items.push(notice({ kind: "info", text: tt(lang, "pub.pollError", { msg: poll.transientError }) }));
    }
  }
  if (rollbackDone) {
    sig.push(`rb:${rollbackDone.sha}:${rollbackDone.n}`);
    items.push(
      notice({
        kind: rollbackDone.n > 0 ? "warn" : "info",
        role: "status",
        text: rollbackDone.n > 0 ? tt(lang, "pub.rollback.done", { sha: rollbackDone.sha, n: rollbackDone.n }) : tt(lang, "pub.rollback.noop", { sha: rollbackDone.sha }),
      }),
    );
  }
  const next = sig.join("|");
  if (next === v.noticeSig) return;
  v.noticeSig = next;
  replace(v.notices, ...items);
}

/** 一句话状态（role=status，只在文字变了才改，播报一次） */
function statusText(lang: Lang): string {
  if (!poll) return "";
  const p = poll.progress;
  if (poll.stop === "rate-limited") return tt(lang, "pub.rateLimited");
  if (poll.stop === "no-run") return tt(lang, "pub.noRun");
  if (!p || p.status === "queued") return tt(lang, "pub.queued");
  switch (p.status) {
    case "success":
      return tt(lang, "pub.done");
    case "failure": {
      const failed = p.steps.find((s) => s.key === p.failedStep);
      return failed ? tt(lang, "pub.failedAt", { step: stepName(lang, failed) }) : tt(lang, "pub.state.failure");
    }
    case "timeout":
      return tt(lang, "pub.timeout");
    case "unmapped":
      return tt(lang, "pub.unmapped");
    default: {
      const running = p.steps.find((s) => s.state === "in_progress");
      return running ? `${tt(lang, "pub.state.running")}${lang === "zh" ? "：" : ": "}${stepName(lang, running)}` : tt(lang, "pub.state.running");
    }
  }
}

function paintProgress(v: View): void {
  const lang = v.lang;
  const box = v.progress;
  if (!poll) {
    replace(box);
    v.statusLine = null;
    return;
  }
  const p = poll.progress;
  const now = Date.now();
  const steps: PublishStep[] = p?.steps.length ? p.steps : STEP_ORDER.map((key) => ({ key, label: key, state: "pending", startedAt: null, completedAt: null }));
  const terminal = poll.state === "done";
  const text = statusText(lang);
  let status = v.statusLine;
  if (!status || !status.isConnected) {
    status = h("p", { class: "adm-pub-status", role: "status", "aria-live": "polite" }, text);
    v.statusLine = status;
  } else if (status.textContent !== text) {
    status.textContent = text;
  }

  const ol = h("ol", { class: "adm-pub-steps" });
  steps.forEach((s, i) => {
    const elapsed = stepElapsed(s, now);
    ol.append(
      h(
        "li",
        { class: "adm-pub-step", "data-state": s.state },
        h("span", { class: "adm-pub-step-icon", "aria-hidden": "true" }, s.state === "pending" ? String(i + 1) : STATE_ICON[s.state]),
        h("div", { class: "adm-pub-step-text" }, h("b", {}, stepName(lang, s)), h("small", {}, tt(lang, STATE_KEY[s.state]))),
        h("span", { class: "adm-pub-step-time", "data-key": s.key }, elapsed === null ? "" : fmtDur(elapsed)),
      ),
    );
  });
  const total = p ? totalElapsed(p, now) : null;
  const foot = h("div", { class: "adm-pub-progress-foot" });
  foot.append(h("span", { class: "adm-pub-total muted" }, total === null ? "" : tt(lang, "pub.total", { t: fmtDur(total) })));
  if (p?.htmlUrl) foot.append(h("a", { class: "adm-pub-link", href: p.htmlUrl, target: "_blank", rel: "noopener" }, tt(lang, "pub.openActions")));
  const card = h("div", { class: "card adm-pub-progress", "data-done": terminal ? "true" : null }, status, ol, foot);
  replace(box, sectionLabel(tt(lang, terminal ? "pub.result" : "pub.progress")), card);
}

/** 只刷时间文本（每秒一次） */
function paintTimes(v: View): void {
  const p = poll?.progress;
  if (!p) return;
  const now = Date.now();
  for (const s of p.steps) {
    const cell = v.progress.querySelector<HTMLElement>(`.adm-pub-step-time[data-key="${s.key}"]`);
    if (!cell) continue;
    const elapsed = stepElapsed(s, now);
    const text = elapsed === null ? "" : fmtDur(elapsed);
    if (cell.textContent !== text) cell.textContent = text;
  }
  const total = totalElapsed(p, now);
  const cell = v.progress.querySelector<HTMLElement>(".adm-pub-total");
  if (cell) {
    const text = total === null ? "" : tt(v.lang, "pub.total", { t: fmtDur(total) });
    if (cell.textContent !== text) cell.textContent = text;
  }
}

function paintLogIfWaitingChanged(v: View): void {
  if (v.logWaiting !== pollActive()) paintLog(v);
}

function paintLog(v: View): void {
  const lang = v.lang;
  const box = v.log;
  v.logWaiting = pollActive();
  replace(box, sectionLabel(tt(lang, "pub.log")));
  if (!changes) return;
  const list = changes.publishes.slice(0, 10);
  if (list.length === 0) {
    box.append(h("div", { class: "card adm-pub-empty" }, h("p", { class: "muted" }, tt(lang, "pub.lastPublished.never"))));
    return;
  }
  const ul = h("ul", { class: "adm-pub-list" });
  const unpublished = changes.unpublished.length;
  for (const rec of list) {
    const body = h("div", { class: "adm-pub-hist-body" });
    body.append(h("b", {}, rec.sha.slice(0, 7)));
    if (rec.runId !== null) body.append(h("span", { class: "muted" }, ` · ${tt(lang, "pub.log.run", { id: rec.runId })}`));
    const right = h("div", { class: "adm-pub-hist-actions" });
    if (rec.isOnline) right.append(h("span", { class: "chip ok adm-pub-online" }, tt(lang, "pub.log.online")));
    // 线上那版只有在还有未发布改动时才值得回退（否则 changedFiles 必为 0）
    if (!rec.isOnline || unpublished > 0) {
      const waiting = pollActive();
      const rb = button({
        label: tt(lang, "pub.rollback"),
        kind: "ghost",
        class: "adm-pub-rollback",
        disabled: waiting,
        ariaLabel: `${tt(lang, "pub.rollback")} · ${rec.sha.slice(0, 7)}`,
        onClick: () => openRollbackDialog(rec),
      });
      if (waiting) rb.title = tt(lang, "pub.rollback.wait");
      right.append(rb);
    }
    ul.append(
      h(
        "li",
        { class: "adm-pub-hist", "data-online": rec.isOnline ? "true" : null },
        h("span", { class: "adm-pub-hist-time" }, fmtWhen(rec.at, lang)),
        body,
        right,
      ),
    );
  }
  box.append(h("div", { class: "card" }, ul));
}

function paintPrint(v: View): void {
  const lang = v.lang;
  v.root.append(
    sectionLabel(tt(lang, "pub.print")),
    h(
      "div",
      { class: "card adm-pub-print" },
      h("a", { class: "adm-pub-qr", href: QR_HREF }, h("b", {}, tt(lang, "pub.qr")), h("small", { class: "muted" }, tt(lang, "pub.qr.hint"))),
    ),
  );
}

// ---------------------------------------------------------------------------
// 「回到这版」二次确认（自建对话框：Esc 关闭 + 焦点圈定 + 关闭后焦点归位，照 menu.ts 的底部抽屉）
// ---------------------------------------------------------------------------

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function openRollbackDialog(rec: PublishRecord): void {
  const v = live();
  if (!v || pollActive()) return;
  const lang = v.lang;
  const short = rec.sha.slice(0, 7);
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const titleId = "adm-pub-dialog-title";

  const cancel = button({ label: adm("adm.cancel", undefined, lang), onClick: () => close() });
  const confirm = button({ label: tt(lang, "pub.rollback.go"), kind: "primary", class: "adm-pub-rollback-go" });
  const errSlot = h("div", { class: "adm-pub-dialog-error" });
  const dlg = h(
    "div",
    { class: "adm-pub-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabindex: "-1" },
    h("h3", { id: titleId, class: "adm-pub-dialog-title" }, tt(lang, "pub.rollback")),
    h("p", {}, tt(lang, "pub.rollback.confirm", { sha: short, at: fmtWhen(rec.at, lang) })),
    h("p", { class: "muted" }, tt(lang, "pub.rollback.note")),
    errSlot,
    h("div", { class: "adm-pub-dialog-actions" }, cancel, confirm),
  );
  const scrim = h("div", { class: "adm-pub-scrim" });

  const prevOverflow = document.body.style.overflow;
  v.root.setAttribute("inert", "");
  document.body.style.overflow = "hidden";
  v.el.append(scrim, dlg);

  let disposed = false;
  const close = (): void => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("hashchange", close);
    v.root.removeAttribute("inert");
    document.body.style.overflow = prevOverflow;
    scrim.remove();
    dlg.remove();
    if (opener && opener.isConnected) opener.focus();
  };
  window.addEventListener("hashchange", close);
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

  confirm.addEventListener("click", () => {
    void (async () => {
      replace(errSlot);
      const done = busy(confirm, tt(lang, "pub.rollback.busy"));
      cancel.disabled = true;
      try {
        const res = await getApi().rollback(rec.sha);
        done();
        close();
        rollbackDone = { sha: res.restoredFrom.slice(0, 7), n: res.changedFiles };
        if (poll && poll.state === "done") poll = null; // 上一次的发布结果卡不再有意义
        publishError = null;
        const lv = live();
        if (lv) {
          paintProgress(lv);
          paintNotices(lv);
          lv.notices.querySelector<HTMLElement>(".adm-notice")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        await loadChanges(true); // 未发布计数会变成非零
      } catch (err) {
        done();
        cancel.disabled = false;
        if (isApiError(err) && err.status === 401) {
          close();
          const lv = live();
          if (lv) sessionExpired(lv.el, lv.lang);
          return;
        }
        // 403「你这条链接不能做这件事」等：worker 的 message 原样（§4.0）
        replace(errSlot, errorCard(apiMessage(err)));
        confirm.focus();
      }
    })();
  });

  confirm.focus();
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function render(el: HTMLElement, ctx: PageCtx, rest: string): void {
  void rest; // 本屏没有子状态
  const lang = ctx.lang;
  bindListeners();

  const btn = button({ label: tt(lang, "pub.publish"), kind: "primary", class: "adm-pub-publish", onClick: () => void onPublish() });
  const notices = h("div", { class: "adm-pub-notices" });
  const changesBox = h("div", { class: "adm-pub-section adm-pub-changes" });
  const progressBox = h("div", { class: "adm-pub-section adm-pub-progress-box" });
  const logBox = h("div", { class: "adm-pub-section adm-pub-log" });
  const root = h("div", { class: "adm adm-pub" }, topBar({ back: adminHref(), title: tt(lang, "pub.title"), actions: [btn] }), notices, changesBox, progressBox, logBox);
  el.append(root);

  const v: View = { el, root, lang, btn, notices, changes: changesBox, progress: progressBox, log: logBox, noticeSig: "", statusLine: null, logWaiting: null };
  view = v;

  // 先用模块级状态画一遍（切语言时不闪），再让 api 层决定要不要真的重读（它自己有缓存，写入 / 发布 / 回退后会失效）
  paintChanges(v);
  paintLog(v);
  paintProgress(v);
  paintNotices(v);
  paintPrint(v);
  syncButton(v);
  void loadChanges(false);
  ensurePolling();
}
