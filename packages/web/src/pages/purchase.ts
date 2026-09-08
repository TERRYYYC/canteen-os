/**
 * /purchase 采购单（issue #10）：按供应商分组、每行可展开 trace、复制微信文本、周切换 chip。
 * 契约见 src/types.ts；UI 照 docs/design/screens-v2.html「采购单」屏；样式在 ./purchase.css。
 *
 * 只用中文：采购员是中国人（issue #10）；语言下拉切换时本页文案不变（标题由壳层管）。
 *
 * 页面不做采购算术——每个数字都直接来自 purchase/<planId>.json：
 *   packs / qty / unitPrice / amount / totalAmount /
 *   trace.{netNeed, yieldApplied, marginApplied, onHandDeducted, grossNeed, packSize, packUnit, packsRaw, minPacksApplied}
 * 例外（调度裁决）：
 *   - 汇总「预估」= 各单 totalAmount 相加（唯一允许的加法；供应商数 / 品项数是计数）；
 *   - 建议下单日 = 该供应商各行 trace.meals[].date 最早一天 − 2 天（第一轮固定提前期；日期运算）；
 *   - 数量展示 g/ml ≥ 1000 时升为 kg/l（与 core displayQty 同一条展示规则，原值放 title）。
 * 食材 / 菜名：purchase JSON 只有 ingredientRef / dishRef，中文名从同一 plan 的 prep/<planId>.json 取；取不到退回 ref。
 * 微信文本 = sheet.wechatText[supplier] 原样；主按钮复制全部供应商（两个换行拼接，顺序同页面）。
 */
import "./purchase.css";

import type {
  BuildManifest,
  I18nString,
  Id,
  MealType,
  Money,
  PendingLine,
  PrepSheet,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseSheet,
  Quantity,
  Unit,
} from "@canteenos/core";
import { append, h } from "../dom";
import { pick } from "../i18n";
import { hrefOf } from "../router";
import type { PageCtx } from "../types";

// ---------------------------------------------------------------------------
// 文案（只有中文）
// ---------------------------------------------------------------------------

const LEAD_DAYS = 2;

const T = {
  loading: "加载中…",
  notReady: "数据未就绪",
  weeks: "切换周",
  sumSuppliers: "供应商",
  sumItems: "品项",
  sumTotal: "预估",
  unitSupplier: "家",
  unitItem: "样",
  noPrice: "—",
  orderOn: (d: string) => `建议 ${d}下单 · 提前 ${LEAD_DAYS} 天`,
  orderOnUnknown: "下单日待定（无用餐日）",
  copy: "复制",
  copied: "已复制 ✓",
  copyFailed: "复制失败",
  copyAll: "复制微信文本",
  share: "分享图片",
  shareLater: "分享图片：本版未做",
  total: "共",
  lastPrice: "上次价",
  perPack: "/包",
  noLastPrice: "无上次价",
  minPacks: (n: number, need: string) => `起订 ${n} 包 · 实需 ${need} · 余量入库`,
  trace: {
    need: (n: number) => `菜单需求（${n} 个餐次）`,
    yieldLabel: "净料率（洗切后能用的比例）",
    yieldNa: "不适用（按个计）",
    margin: "备量系数（防少买）",
    marginNa: "未加备量",
    onHand: "扣掉现有库存",
    onHandNa: "无（未记库存）",
    gross: "取整前需求",
    perPackOf: (s: string) => `每包 ${s}`,
    rawPacks: (s: string) => `${s} 包（未取整）`,
    ceil: "向上取整",
    ceilMin: (n: number) => `向上取整 · 起订 ${n} 包`,
    packs: (n: number) => `${n} 包`,
    tot: (buy: string, packs: number, pack: string, need: string) => `采购 ${buy}（${packs} 包 × ${pack}）· 需求 ${need}`,
    totExtra: "，多出的入库",
  },
  pendingTitle: "待补全",
  pendingSub: "未计入任何供应商单",
  pendingNeed: (s: string) => `需求约 ${s}`,
  pendingNeedUnknown: "需求待定",
  pendingReason: { "no-purchase-spec": "缺采购规格（供应商 / 包装）", "unit-conversion-missing": "单位无法换算" } as const,
  issuesTitle: (n: number) => `⚠ ${n} 条问题`,
  empty: "本周没有需要采购的食材",
  priceNote: "价格按各供应商上次报价估算，以实际为准。",
  dialogTitle: "复制微信文本",
  dialogHint: "这台设备不允许自动复制：长按 / 全选下面的文字后复制。",
  close: "关闭",
  servings: "份",
} as const;

const MEAL_ZH: Record<MealType, string> = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" };
const WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;
const UNIT_ZH: Partial<Record<Unit, string>> = {
  pcs: "个",
  pack: "包",
  tbsp: "汤匙",
  tsp: "茶匙",
  pinch: "撮",
  "to-taste": "适量",
};
const CURRENCY_SYMBOL: Record<string, string> = { CNY: "¥", USD: "$", UAH: "₴", EUR: "€" };

// ---------------------------------------------------------------------------
// 格式化（只格式化，不算采购数）
// ---------------------------------------------------------------------------

const moneyFmt = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function money(m: Money): string {
  return `${CURRENCY_SYMBOL[m.currency] ?? m.currency}${moneyFmt.format(m.amount)}`;
}

/** 数字去浮点尾差、最多 2 位小数、去尾零 */
function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function unitZh(u: Unit): string {
  return UNIT_ZH[u] ?? u;
}

/** 原值（不升单位）：放 title 供核对 */
function rawQty(q: Quantity): string {
  return q.value === undefined ? unitZh(q.unit) : `${q.value} ${unitZh(q.unit)}`;
}

/** 展示用数量：g/ml ≥ 1000 升为 kg/l（与 core displayQty 同规则） */
function qtyText(q: Quantity): string {
  if (q.value === undefined || q.unit === "to-taste") return unitZh("to-taste");
  let v = q.value;
  let u: Unit = q.unit;
  if ((u === "g" || u === "ml") && v >= 1000) {
    v = v / 1000;
    u = u === "g" ? "kg" : "l";
  }
  return `${num(v)} ${unitZh(u)}`;
}

/** "YYYY-MM-DD" → 本地日期（不经 UTC，避免时区把日子挪走） */
function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function mmdd(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 建议下单日 = 该单各行 trace.meals[].date 最早一天 − LEAD_DAYS；显示 MM-DD（周X） */
function orderDateText(po: PurchaseOrder): string | null {
  let earliest: string | null = null;
  for (const line of po.lines) {
    for (const meal of line.trace.meals) {
      if (earliest === null || meal.date < earliest) earliest = meal.date;
    }
  }
  const d = earliest === null ? null : parseIsoDate(earliest);
  if (!d) return null;
  d.setDate(d.getDate() - LEAD_DAYS);
  return `${mmdd(d)}（${WEEKDAY_ZH[d.getDay()]}）`;
}

/** 周 chip 文案：week-41 → 第 41 周；其它 planId 原样 */
function planLabel(planId: string): string {
  const m = /^week-(\d+)$/.exec(planId);
  return m ? `第 ${Number(m[1])} 周` : planId;
}

/** 10.05–10.11 */
function rangeText(range: { start: string; end: string } | undefined): string | null {
  if (!range) return null;
  const a = parseIsoDate(range.start);
  const b = parseIsoDate(range.end);
  if (!a || !b) return null;
  const f = (d: Date): string => `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  return `${f(a)}–${f(b)}`;
}

/** 汇总「预估」= 各单 totalAmount 相加（唯一允许的加法）；任一单缺价或币种不一致 → null */
function sumTotals(orders: readonly PurchaseOrder[]): Money | null {
  let amount = 0;
  let currency: Money["currency"] | null = null;
  for (const po of orders) {
    if (!po.totalAmount) return null;
    if (currency !== null && currency !== po.totalAmount.currency) return null;
    currency = po.totalAmount.currency;
    amount += po.totalAmount.amount;
  }
  return currency === null ? null : { amount: Math.round(amount * 100) / 100, currency };
}

// ---------------------------------------------------------------------------
// 名字：purchase JSON 只有 ref，中文名从 prep/<planId>.json 取
// ---------------------------------------------------------------------------

interface Names {
  ingredient: Map<Id, I18nString>;
  dish: Map<Id, I18nString>;
}

function collectNames(prep: PrepSheet | null): Names {
  const names: Names = { ingredient: new Map(), dish: new Map() };
  if (!prep) return names;
  for (const day of prep.days) {
    for (const meal of day.meals) {
      if (!names.dish.has(meal.dishRef)) names.dish.set(meal.dishRef, meal.dish.name);
      for (const c of meal.components) {
        if (!names.ingredient.has(c.ingredientRef)) names.ingredient.set(c.ingredientRef, c.name);
      }
    }
  }
  return names;
}

function nameOf(map: Map<Id, I18nString>, ref: Id): string {
  return pick(map.get(ref), "zh") || ref;
}

// ---------------------------------------------------------------------------
// 复制
// ---------------------------------------------------------------------------

async function writeClipboard(text: string): Promise<boolean> {
  try {
    const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clip || typeof clip.writeText !== "function") return false;
    await clip.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 回退层：<dialog> + 只读 textarea（自动全选） */
function buildFallbackDialog(): { dialog: HTMLDialogElement; show: (text: string) => void } {
  const ta = h("textarea", { readonly: true, rows: 12, "aria-label": T.dialogTitle, spellcheck: "false" });
  const closeBtn = h("button", { type: "button", class: "btn s" }, T.close);
  const dialog = h(
    "dialog",
    { class: "copy-dialog", "aria-labelledby": "purchase-copy-title" },
    h("h2", { id: "purchase-copy-title" }, T.dialogTitle),
    h("p", { class: "muted" }, T.dialogHint),
    ta,
    h("div", { class: "row" }, closeBtn),
  );
  const close = (): void => {
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  };
  closeBtn.addEventListener("click", close); // Esc 由 <dialog> 原生 cancel 关闭
  const show = (text: string): void => {
    ta.value = text;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    ta.focus();
    ta.select();
  };
  return { dialog, show };
}

/** 复制按钮：成功 → 文字短暂变「已复制 ✓」；失败 → 弹回退层 */
function bindCopy(btn: HTMLButtonElement, getText: () => string, fallback: (text: string) => void, live: HTMLElement): void {
  const label = btn.textContent ?? "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  btn.addEventListener("click", () => {
    const text = getText();
    if (!text) return;
    void writeClipboard(text).then((ok) => {
      if (!ok) {
        live.textContent = T.copyFailed;
        fallback(text);
        return;
      }
      btn.textContent = T.copied;
      live.textContent = T.copied;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        btn.textContent = label;
        timer = null;
      }, 1500);
    });
  });
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

function renderTabs(plans: readonly string[], current: string, range: string | null): HTMLElement {
  const tabs = h("nav", { class: "tabs", "aria-label": T.weeks });
  const ids = plans.includes(current) ? plans : [current, ...plans];
  for (const id of ids) {
    const on = id === current;
    const text = on && range ? `${planLabel(id)} · ${range}` : planLabel(id);
    tabs.append(
      h("a", { class: on ? "chip solid" : "chip", href: hrefOf("purchase", id), "aria-current": on ? "page" : null, "data-plan": id, title: id }, text),
    );
  }
  return tabs;
}

function renderIssues(issues: NonNullable<PurchaseSheet["issues"]>): HTMLElement {
  return h(
    "div",
    { class: "notice", role: "status" },
    h("b", {}, T.issuesTitle(issues.length)),
    h("ul", {}, ...issues.map((i) => h("li", {}, i.message))),
  );
}

function renderSummary(orders: readonly PurchaseOrder[]): HTMLElement {
  const items = orders.reduce((n, po) => n + po.lines.length, 0);
  const total = sumTotals(orders);
  const cell = (label: string, value: string, unit?: string): HTMLElement =>
    h("div", {}, h("div", { class: "l" }, label), h("div", { class: "v num" }, value, unit ? h("small", {}, ` ${unit}`) : null));
  return h(
    "div",
    { class: "sum" },
    cell(T.sumSuppliers, String(orders.length), T.unitSupplier),
    cell(T.sumItems, String(items), T.unitItem),
    cell(T.sumTotal, total ? money(total) : T.noPrice),
  );
}

function renderTrace(line: PurchaseOrderLine, names: Names): HTMLElement {
  const tr = line.trace;
  const grid = h("div", { class: "trace" });
  const row = (op: string, label: string, value: string, valueTitle?: string): void => {
    append(grid, h("span", { class: "op", "aria-hidden": "true" }, op), h("span", {}, label), h("span", { class: "r", title: valueTitle }, value));
  };
  const packText = `${tr.packSize} ${unitZh(tr.packUnit)}`;

  row("", T.trace.need(tr.meals.length), qtyText(tr.netNeed), rawQty(tr.netNeed));
  grid.append(
    h(
      "ul",
      { class: "meals" },
      ...tr.meals.map((m) => h("li", {}, `${m.date.slice(5)} ${MEAL_ZH[m.mealType] ?? m.mealType} · ${nameOf(names.dish, m.dishRef)} · ${m.servings} ${T.servings}`)),
    ),
  );
  if (tr.yieldApplied === null) row("÷", T.trace.yieldLabel, T.trace.yieldNa);
  else row("÷", T.trace.yieldLabel, String(tr.yieldApplied));
  if (tr.marginApplied === null) row("×", T.trace.margin, T.trace.marginNa);
  else row("×", T.trace.margin, String(tr.marginApplied));
  if (tr.onHandDeducted === null) row("−", T.trace.onHand, T.trace.onHandNa);
  else row("−", T.trace.onHand, qtyText(tr.onHandDeducted), rawQty(tr.onHandDeducted));
  row("=", T.trace.gross, qtyText(tr.grossNeed), rawQty(tr.grossNeed));
  row("÷", T.trace.perPackOf(packText), T.trace.rawPacks(num(tr.packsRaw)), String(tr.packsRaw));
  row("→", tr.minPacksApplied ? T.trace.ceilMin(line.packs) : T.trace.ceil, T.trace.packs(line.packs));
  grid.append(
    h(
      "span",
      { class: "tot" },
      T.trace.tot(qtyText(line.qty), line.packs, packText, qtyText(tr.grossNeed)) + (tr.minPacksApplied ? T.trace.totExtra : ""),
    ),
  );
  return grid;
}

function renderLine(line: PurchaseOrderLine, names: Names): HTMLElement {
  const tr = line.trace;
  const top = h(
    "div",
    { class: "top" },
    h("span", { class: "nm" }, nameOf(names.ingredient, line.ingredientRef)),
    h("span", { class: "pk" }, h("b", { class: "num" }, String(line.packs)), ` ${unitZh("pack")} × ${tr.packSize} ${unitZh(tr.packUnit)}`),
    h("span", { class: "amt num" }, line.amount ? money(line.amount) : T.noPrice),
    h("span", { class: "chev", "aria-hidden": "true" }),
  );
  const sub = h(
    "div",
    { class: "sub" },
    h("span", {}, `${T.total} ${qtyText(line.qty)} · ${line.unitPrice ? `${T.lastPrice} ${money(line.unitPrice)}${T.perPack}` : T.noLastPrice}`),
    tr.minPacksApplied ? h("span", { class: "chip warn" }, T.minPacks(line.packs, qtyText(tr.grossNeed))) : null,
  );
  return h("details", { class: "pl", "data-ingredient": line.ingredientRef }, h("summary", {}, top, sub), renderTrace(line, names));
}

function renderOrder(po: PurchaseOrder, text: string, names: Names, fallback: (t: string) => void, live: HTMLElement): HTMLElement {
  const when = orderDateText(po);
  const cp = h("button", { type: "button", class: "cp", "aria-label": `${T.copy}：${po.supplier}` }, T.copy);
  bindCopy(cp, () => text, fallback, live);
  const card = h(
    "section",
    { class: "card supplier", "data-supplier": po.supplier },
    h(
      "div",
      { class: "sup" },
      h("div", { class: "hd" }, h("h2", { class: "n" }, po.supplier), h("div", { class: "s" }, when ? T.orderOn(when) : T.orderOnUnknown)),
      h("div", { class: "amt num" }, po.totalAmount ? money(po.totalAmount) : T.noPrice),
      cp,
    ),
  );
  for (const line of po.lines) card.append(renderLine(line, names));
  if (po.notes) card.append(h("div", { class: "pl" }, h("div", { class: "sub" }, po.notes)));
  return card;
}

function renderPending(pending: readonly PendingLine[], names: Names): HTMLElement {
  const card = h(
    "section",
    { class: "card pending" },
    h("div", { class: "sup" }, h("div", { class: "hd" }, h("h2", { class: "n" }, T.pendingTitle), h("div", { class: "s" }, T.pendingSub))),
  );
  for (const p of pending) {
    const need = p.grossNeed ?? p.netNeed;
    card.append(
      h(
        "div",
        { class: "pl", "data-ingredient": p.ingredientRef },
        h("div", { class: "top" }, h("span", { class: "nm" }, nameOf(names.ingredient, p.ingredientRef)), h("span", { class: "chip warn" }, T.pendingReason[p.reason])),
        h("div", { class: "sub" }, need ? T.pendingNeed(qtyText(need)) : T.pendingNeedUnknown),
      ),
    );
  }
  return card;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export async function render(el: HTMLElement, ctx: PageCtx): Promise<void> {
  const root = h("div", { class: "purchase" });
  const status = h("p", { class: "muted" }, T.loading);
  root.append(status);
  el.append(root);

  const planId = ctx.rest || ctx.planId;
  if (!planId) {
    status.textContent = T.notReady;
    return;
  }

  let sheet: PurchaseSheet;
  let build: BuildManifest | null;
  let prep: PrepSheet | null;
  try {
    [sheet, build, prep] = await Promise.all([
      ctx.data.loadPurchase(planId),
      ctx.data.loadBuild().catch(() => null),
      ctx.data.loadPrep(planId).catch(() => null),
    ]);
  } catch {
    status.textContent = T.notReady;
    return;
  }
  status.remove();

  const names = collectNames(prep);
  const plans = build?.plans?.length ? build.plans : [planId];
  const orders = sheet.orders;
  const textOf = (po: PurchaseOrder): string => sheet.wechatText[po.supplier] ?? "";
  const allText = (): string => orders.map(textOf).filter((t) => t.length > 0).join("\n\n");

  const live = h("span", { class: "sr-only", role: "status", "aria-live": "polite" });
  const { dialog, show } = buildFallbackDialog();

  root.append(renderTabs(plans, planId, rangeText(prep?.dateRange)));
  if (sheet.issues && sheet.issues.length > 0) root.append(renderIssues(sheet.issues));
  root.append(renderSummary(orders));

  if (orders.length === 0) {
    root.append(h("div", { class: "card empty muted" }, T.empty));
  } else {
    for (const po of orders) root.append(renderOrder(po, textOf(po), names, show, live));
  }
  if (sheet.pending && sheet.pending.length > 0) root.append(renderPending(sheet.pending, names));
  root.append(h("p", { class: "muted note" }, T.priceNote));

  const copyAll = h("button", { type: "button", class: "btn p", disabled: orders.length === 0 }, T.copyAll);
  bindCopy(copyAll, allText, show, live);
  const share = h("button", { type: "button", class: "btn s", disabled: true, title: T.shareLater, "aria-disabled": "true" }, T.share);
  root.append(h("div", { class: "bottom" }, h("div", { class: "in" }, copyAll, share)), live, dialog);
}
