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
 *   - 前 30 秒每 2 秒一次，之后每 5 秒；同一 runId 且 runCompleted=true 才证明结束；其余 legacy 终态保留未知保护并可只读核实；
 *   - 429 → 退避 15 秒，最多 3 次，仍 429 → 停 + 「查太频繁了，去 Actions 页面看」；
 *   - runId 为 null 或确认丢失 → 结果未知；legacy API 无关联凭据，禁止用 latest 认领本次；
 *   - 页面隐藏（visibilitychange）暂停，回前台立即补一次；hashchange 离开本屏立即停；
 *   - 每次真正发请求前都看 el.isConnected：旧 el 被壳层摘掉（切屏 / 切语言）就不再动它。
 *
 * 推论 A：正在进行的发布/回退、进度、已读到的 changes 由页内会话 owner 持有，
 * 切语言 = 壳层换新 el 重新 render —— 这里只是把同一份状态用新语言再画一遍，轮询不中断、不重复起第二条
 * （render 只在 poll 处于 paused 时才补一次 tick）。
 *
 * 只写 textContent（dom.ts 的 h()）；worker 的 message / failureReason 原样显示，不翻译（§4.0，worker 契约 §1.5）。
 * 样式在同目录 publish.css，每条选择器以 .adm-pub 开头（§3.4）。
 */
import "./publish.css";

import { adm, apiMessage, button, errorCard, notice, sessionExpired, topBar } from "../../admin/kit";
import { getApi, type AdminApi } from "../../api/client";
import { getTeamMealsApi, type TeamMealsApi } from "../../api/team-meals";
import { onAuthSessionChange } from "../../admin/token";
import { registerAuxiliaryEdits, type AuxiliaryEditHandle, type AuxiliaryOperation } from "../../view-models/reload-safety";
import type { ChangeItem, Changes, PublishProgress, PublishRecord, PublishResult, PublishStep, PublishStepKey } from "../../api/types";
import { ApiError, isApiError } from "../../api/types";
import { h, replace } from "../../dom";
import type { Lang, TParams } from "../../i18n";
import type { PageCtx } from "../../types";
import { adminHref } from "../admin";
import { text as teamText } from "../team-ui";

// ---------------------------------------------------------------------------
// 文案（§5.4 `pub.*` 最小集 + 本屏自用；zh 是权威语言，uk 初稿待帮厨校对）
// ---------------------------------------------------------------------------

const T = {
  "pub.unknown": { zh: "操作结果未知；请先核实，当前不能再次发布或回退", en: "Operation outcome unknown; verify before publishing or rolling back again", uk: "Результат операції невідомий; перевірте перед повторною публікацією чи поверненням" },
  "pub.noIdentity": { zh: "没有这次构建的编号，无法用最近一次构建证明结果。请联系管理员核实。", en: "This build has no known ID. The latest build cannot prove its outcome. Ask the administrator to verify.", uk: "Номер цієї збірки невідомий. Остання збірка не підтверджує її результат. Попросіть адміністратора перевірити." },
  "pub.rollback.unknown": { zh: "回退确认未收到；刷新改动列表不能证明这次回退结果。请联系管理员核实。", en: "Rollback acknowledgement was not received. Refreshing changes cannot prove this rollback's outcome. Ask the administrator to verify.", uk: "Підтвердження повернення не отримано. Оновлення списку змін не доводить його результат. Попросіть адміністратора перевірити." },
  "pub.verify": { zh: "只读取这次构建的结果", en: "Check this build's outcome", uk: "Перевірити результат цієї збірки" },
  "pub.session.changed": { zh: "登录会话已变化，请重新打开发布页", en: "Session changed. Open the publish page again", uk: "Сеанс змінився. Відкрийте сторінку публікації знову" },
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
  "pub.ended.unknown": { uk: "Збірку завершено · результат публікації невідомий", zh: "构建已结束 · 发布结果未知", en: "Build ended · publication outcome unknown" },
  "pub.ended.failure": { uk: "Збірка завершилася помилкою", zh: "构建已结束，发布失败", en: "Build ended with a failure" },
  "pub.ended.cancelled": { uk: "Збірку скасовано", zh: "构建已取消", en: "Build was cancelled" },
  "pub.ended.timeout": { uk: "Збірку завершено через ліміт часу", zh: "构建已因超时结束", en: "Build ended after its time limit" },
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
  "pub.rollback.confirm": { uk: "Повернути дані до {sha} (версія від {at})?", zh: "要把数据退回到 {sha}（{at} 那版）吗？", en: "Roll the data back to {sha} (the {at} version)?" },
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
  const terminal = p.runCompleted === true;
  return (running || !terminal ? now : (last ?? now)) - first;
}

// ---------------------------------------------------------------------------
// 模块级状态（推论 A：切语言 = 重新 render，一切都从这里回填）
// ---------------------------------------------------------------------------

const TERMINAL: ReadonlySet<PublishProgress["status"]> = new Set(["success", "failure", "timeout", "unmapped"]);
/** A confirmed end and a recognized result are separate facts. Legacy status proves neither. */
function completedOutcome(p: PublishProgress): Key | null {
  if (p.runCompleted !== true) return null;
  switch (p.runConclusion) {
    case "success": return "pub.done";
    case "failure": return "pub.ended.failure";
    case "cancelled": return "pub.ended.cancelled";
    case "timed_out": return "pub.ended.timeout";
    default: return "pub.ended.unknown";
  }
}
const FAST_MS = 2000;
const SLOW_MS = 5000;
const FAST_WINDOW_MS = 30_000;
const BACKOFF_MS = 15_000;
const MAX_BACKOFF = 3;

type StopReason = "terminal" | "rate-limited" | "no-run" | "expired" | "unknown";

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
interface PublishOwner { readonly identity: number; readonly team: TeamMealsApi; readonly session: number; readonly api: AdminApi; registration: AuxiliaryEditHandle; operation: Operation | null; reads: number; generation: number }
interface Operation { readonly kind: "publish" | "rollback"; phase: "busy" | "unknown"; readonly target?: string; readonly ticket: AuxiliaryOperation }
let owner: PublishOwner | null = null;
let ownerSequence = 0;
let operation: Operation | null = null;
let operationGeneration = 0;
let closeDialog: (() => void) | null = null;

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

/** Current presentation metadata; each original owner retains its own registered operation. */
export function readPublishAuxiliary(): { identity: number | null; generation: number; dirty: boolean; phase: "idle" | "busy" | "unknown" } {
  return { identity: owner?.identity ?? null, generation: operationGeneration, dirty: operation !== null, phase: operation?.phase ?? "idle" };
}
function changeOperation(next: Operation | null): void {
  operation = next; operationGeneration++;
  if (owner) { owner.operation = next; owner.generation++; }
}
function beginWrite(context: PublishOwner, kind: Operation["kind"], target?: string): Operation {
  const next: Operation = { kind, phase: "busy", ticket: context.registration.beginOperation("write"), ...(target ? { target } : {}) };
  changeOperation(next); return next;
}
function settleWrite(context: PublishOwner, original: Operation, outcome: "completed" | "failed"): void {
  if (context.operation !== original) return;
  context.operation = null; context.generation++;
  if (owner === context && operation === original) { operation = null; operationGeneration++; }
  context.registration.settleOperation(original.ticket, outcome);
}
function unknownWrite(context: PublishOwner, original: Operation): void {
  if (context.operation !== original) return;
  original.phase = "unknown"; context.generation++;
  if (owner === context) operationGeneration++;
  context.registration.markUnknown(original.ticket);
}
function beginRead(context: PublishOwner): () => void {
  const ticket = context.registration.beginOperation("read");
  context.reads++; context.generation++;
  return () => { context.reads--; context.generation++; context.registration.settleOperation(ticket, "completed"); };
}
function invalidateOwner(): void {
  if (owner?.operation) unknownWrite(owner, owner.operation);
  owner?.registration.dispose();
  closeDialog?.(); clearTimer(); stopTicker(); owner = null; poll = null; pollSeq++;
  changes = null; changesError = null; changesLoading = false; publishing = false;
  publishOff = false; publishError = null; rollbackDone = null; changeOperation(null);
  const old = live(); view = null;
  if (old) replace(old.el, h("p", { role: "status" }, tt(old.lang, "pub.session.changed")));
}
onAuthSessionChange(invalidateOwner);
function current(candidate: PublishOwner | null): candidate is PublishOwner {
  return candidate !== null && owner === candidate && candidate.team.mode === "real" && candidate.team.sessionKey() === candidate.session && owner === candidate;
}
function writeBlocked(): boolean { return operation !== null || publishing || pollActive(); }
function repaint(): void {
  const v = live(); if (!v) return;
  paintNotices(v); paintProgress(v); paintLogIfWaitingChanged(v); syncButton(v);
}
function markUnknown(): void {
  if (owner && operation) unknownWrite(owner, operation);
}

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
  const p = poll, context = owner;
  if (!p || p.state === "done" || p.inflight || !current(context)) return;
  if (!live() || document.hidden) { pausePolling(); return; }
  // No request ID survives the legacy facade. A latest run is not this operation's identity.
  if (p.runId === null) { markUnknown(); finish("unknown"); repaint(); return; }
  const original = context.operation;
  if (!original || original.kind !== "publish") return;
  const endRead = beginRead(context);
  p.inflight = true;
  try {
    const progress = await context.api.getPublish(p.runId);
    if (progress.runId !== p.runId || !["queued", "in_progress", "success", "failure", "timeout", "unmapped"].includes(progress.status) || !Array.isArray(progress.steps)) throw new ApiError(502, "bad_response", "");
    if (progress.runCompleted === true) settleWrite(context, original, "completed");
    if (!current(context) || poll !== p) return;
    p.rateLimited = 0; p.transientError = null; p.progress = progress;
    if (progress.runCompleted === true) {
      finish("terminal");
      if (progress.runConclusion === "success") void loadChanges(true);
    } else if (TERMINAL.has(progress.status)) {
      // Worker can report failedStep/unmapped before run completion, and timeout while running.
      markUnknown(); finish("unknown");
    } else schedule(nextDelay());
  } catch (err) {
    if (!current(context) || poll !== p) { unknownWrite(context, original); return; }
    if (isApiError(err) && err.status === 401) {
      finish("expired"); const v = live(); if (v) sessionExpired(v.el, v.lang); return;
    }
    if (isApiError(err) && err.status === 429) {
      p.rateLimited++;
      if (p.rateLimited > MAX_BACKOFF) { markUnknown(); finish("rate-limited"); }
      else schedule(Math.max(BACKOFF_MS, (err.retryAfter ?? 0) * 1000));
    } else if (isApiError(err) && (err.status === 404 || err.code === "bad_response")) {
      p.transientError = apiMessage(err); markUnknown(); finish("unknown");
    } else { p.transientError = apiMessage(err); schedule(nextDelay()); }
  } finally { p.inflight = false; endRead(); }
  if (current(context)) repaint();
}

function verifyPublish(): void {
  if (!current(owner) || operation?.kind !== "publish" || operation.phase !== "unknown" || !poll || poll.runId === null || poll.inflight) return;
  operation.phase = "busy"; changeOperation(operation); poll.stop = null; poll.state = "paused";
  repaint(); ensurePolling();
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
  window.addEventListener("beforeunload", (event: BeforeUnloadEvent) => {
    if (!operation) return;
    event.preventDefault(); event.returnValue = "";
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
  const context = owner;
  if (changesLoading || !current(context)) return;
  const endRead = beginRead(context);
  changesLoading = true;
  const v0 = live(); if (v0) { paintChanges(v0); syncButton(v0); }
  try {
    const result = await context.api.getChanges(force ? { force: true } : undefined);
    if (!current(context)) return;
    changes = result; changesError = null;
  } catch (err) {
    if (!current(context)) return;
    if (isApiError(err) && err.status === 401) {
      const v = live(); if (v) sessionExpired(v.el, v.lang); return;
    }
    changesError = apiMessage(err);
  } finally { endRead(); if (current(context)) changesLoading = false; }
  if (!current(context)) return;
  const v = live(); if (v) { paintChanges(v); paintLog(v); paintNotices(v); syncButton(v); }
}

/** These Worker errors prove rejection before a ref update/dispatch. Generic 5xx/transport errors do not. */
function definitelyRejected(err: unknown): boolean {
  if (!isApiError(err)) return false;
  const status: Record<string, number> = { bad_id: 400, bad_path: 400, bad_json: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, too_large: 413, rate_limited: 429, dispatch_unavailable: 503, not_configured: 503 };
  return Object.hasOwn(status, err.code) && status[err.code] === err.status;
}

async function onPublish(): Promise<void> {
  const context = owner;
  if (!live() || !current(context) || writeBlocked() || publishOff || changesLoading || !changes?.unpublished.length) return;
  const original = beginWrite(context, "publish"); publishing = true;
  publishError = null; clearTimer(); stopTicker(); poll = null; rollbackDone = null; repaint();
  try {
    const result = await context.api.publish();
    if (!["dispatch", "push-trigger"].includes(result.mode) || (result.runId !== null && (!Number.isSafeInteger(result.runId) || result.runId <= 0))) throw new ApiError(502, "bad_response", "");
    if (!current(context)) { unknownWrite(context, original); return; }
    poll = { seq: ++pollSeq, runId: result.runId, mode: result.mode, startedAt: Date.now(), progress: null,
      state: result.runId === null ? "done" : "polling", timer: null, inflight: false, rateLimited: 0,
      stop: result.runId === null ? "unknown" : null, transientError: null };
    if (result.runId === null) markUnknown();
    else { ensureTicker(); void tick(); }
  } catch (err) {
    if (definitelyRejected(err)) settleWrite(context, original, "failed");
    else unknownWrite(context, original);
    if (!current(context)) return;
    if (definitelyRejected(err)) {
      if (isApiError(err) && err.status === 401) { const v = live(); if (v) sessionExpired(v.el, v.lang); return; }
      if (isApiError(err) && err.code === "dispatch_unavailable") publishOff = true;
      else publishError = apiMessage(err);
    } else publishError = apiMessage(err);
  } finally { if (current(context)) { publishing = false; repaint(); } }
}

async function onRollback(sha: string): Promise<void> {
  const context = owner;
  if (!live() || !current(context) || writeBlocked()) return;
  const original = beginWrite(context, "rollback", sha);
  rollbackDone = null; publishError = null; repaint();
  try {
    const result = await context.api.rollback(sha);
    if (typeof result.commit !== "string" || !/^[0-9a-f]{40}$/.test(result.commit) || result.restoredFrom !== sha || !Number.isSafeInteger(result.changedFiles) || result.changedFiles < 0) throw new ApiError(502, "bad_response", "");
    settleWrite(context, original, "completed");
    if (!current(context)) return;
    rollbackDone = { sha: result.restoredFrom.slice(0, 7), n: result.changedFiles };
    if (poll?.state === "done") poll = null;
    await loadChanges(true);
  } catch (err) {
    if (definitelyRejected(err)) settleWrite(context, original, "failed");
    else unknownWrite(context, original);
    if (!current(context)) return;
    if (definitelyRejected(err)) {
      if (isApiError(err) && err.status === 401) { const v = live(); if (v) sessionExpired(v.el, v.lang); return; }
    }
    publishError = apiMessage(err);
  } finally { if (current(context)) repaint(); }
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
  const disabled = !current(owner) || writeBlocked() || publishOff || changesLoading || n === 0;
  v.btn.disabled = disabled;
  v.btn.textContent = operation?.kind === "publish" && operation.phase === "busy" ? tt(v.lang, "pub.publishing") : tt(v.lang, "pub.publish");
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

  if (operation?.phase === "unknown") {
    sig.push(`unknown:${operation.kind}:${poll?.runId ?? ""}`);
    items.push(notice({ kind: "warn", role: "status", text: tt(lang, "pub.unknown"),
      ...(operation.kind === "publish" && poll?.runId != null ? { action: { label: tt(lang, "pub.verify"), onClick: verifyPublish } } : {}) }));
    if (operation.kind === "rollback" || poll?.runId == null) items.push(h("p", { class: "muted" }, tt(lang, operation.kind === "rollback" ? "pub.rollback.unknown" : "pub.noIdentity")));
  } else if (operation?.kind === "rollback") {
    sig.push("rollback-busy");
    items.push(notice({ kind: "info", role: "status", text: tt(lang, "pub.rollback.busy") }));
  }

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
    items.push(errorCard(publishError));
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
    } else if (p && completedOutcome(p)) {
      const outcome = completedOutcome(p)!;
      sig.push(`completed:${outcome}`);
      items.push(notice({ kind: outcome === "pub.done" ? "ok" : "warn", text: tt(lang, outcome), ...(outcome === "pub.done" ? {} : { action: actions(url) }) }));
    } else if (p) {
      switch (p.status) {
        case "success":
          // Old Workers may report success without overall run completion evidence.
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
  if (p && completedOutcome(p)) return tt(lang, completedOutcome(p)!);
  if (!p || p.status === "queued") return tt(lang, "pub.queued");
  switch (p.status) {
    case "success":
      return tt(lang, "pub.unknown");
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
  if (v.logWaiting !== writeBlocked()) paintLog(v);
}

function paintLog(v: View): void {
  const lang = v.lang;
  const box = v.log;
  v.logWaiting = writeBlocked();
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
      const waiting = writeBlocked();
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
  if (!v || !current(owner) || writeBlocked()) return;
  closeDialog?.();
  const context = owner;
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
    if (closeDialog === close) closeDialog = null;
    window.removeEventListener("hashchange", close);
    v.root.removeAttribute("inert");
    document.body.style.overflow = prevOverflow;
    scrim.remove();
    dlg.remove();
    if (opener && opener.isConnected) opener.focus();
  };
  closeDialog = close;
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
    if (disposed || !current(context) || writeBlocked()) return;
    close(); void onRollback(rec.sha);
  });

  confirm.focus();
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function render(el: HTMLElement, ctx: PageCtx, rest: string): void {
  void rest; // 本屏没有子状态
  const lang = ctx.lang;
  closeDialog?.();
  const team = getTeamMealsApi(), session = team.sessionKey();
  if (team.mode !== "real") {
    invalidateOwner();
    replace(el, h("div", { class: "adm adm-pub", "data-mode": team.mode }, topBar({ back: adminHref(), title: tt(lang, "pub.title") }), h("p", { role: "status" }, teamText(lang, team.mode === "mock" ? "mock" : "unconfigured"))));
    ctx.setReloadCoverage?.("read-only"); return;
  }
  if (!owner || owner.team !== team || owner.session !== session) {
    invalidateOwner();
    const context: PublishOwner = { identity: ++ownerSequence, team, session, api: getApi(), operation: null, reads: 0, generation: 0,
      registration: registerAuxiliaryEdits({ ownerId: "publish-operations", identity: { kind: "publish", id: "publish" }, boundary: team, operationTracking: "tickets",
        read: () => ({ generation: context.generation, dirty: context.operation !== null, phase: context.operation?.phase === "unknown" ? "unknown" : context.operation || context.reads ? "busy" : "idle" }) }) };
    owner = context;
  }
  bindListeners();

  const btn = button({ label: tt(lang, "pub.publish"), kind: "primary", class: "adm-pub-publish", onClick: () => void onPublish() });
  const notices = h("div", { class: "adm-pub-notices" });
  const changesBox = h("div", { class: "adm-pub-section adm-pub-changes" });
  const progressBox = h("div", { class: "adm-pub-section adm-pub-progress-box" });
  const logBox = h("div", { class: "adm-pub-section adm-pub-log" });
  const root = h("div", { class: "adm adm-pub" }, topBar({ back: adminHref(), title: tt(lang, "pub.title"), actions: [btn] }), notices, changesBox, progressBox, logBox);
  replace(el, root);

  const v: View = { el, root, lang, btn, notices, changes: changesBox, progress: progressBox, log: logBox, noticeSig: "", statusLine: null, logWaiting: null };
  view = v;

  // 先用模块级状态画一遍（切语言时不闪），再让 api 层决定要不要真的重读（它自己有缓存，写入 / 发布 / 回退后会失效）
  paintChanges(v);
  paintLog(v);
  paintProgress(v);
  paintNotices(v);
  paintPrint(v);
  syncButton(v);
  void loadChanges(false).finally(() => ctx.setReloadCoverage?.("tracked"));
  ensurePolling();
}
