/**
 * 后台共用件（docs/specs/v03-admin-frontend-contract.md §3.2；签名钉死，#21–#25 只用不改 —— 缺什么写进自己那屏）。
 *
 *   stepper(opts)                 ± 步进器：#21 的份数（±10，长按 ±50）与 #23/#24 的数字字段共用
 *   fieldRow(opts)                一行表单：<label for> + 控件 + 说明 + 错误位；id = `${idPrefix}-${name}`（§3.4 DOM id 规则）
 *   applyFieldErrors(root, errs)  把 worker 的 errors[] 按 JSON Pointer 标黄；未命中的集中显示在表单顶部；已登记 code 显示本地化文案，未登记才原样显示 message（#113）
 *   clearFieldErrors(root)
 *   topBar(opts)                  页内第一行：左「←」回上一屏、中标题、右主操作（§4.0）
 *   emptyCard(text) / errorCard(text, onRetry?)
 *   busy(el, label?)              请求进行中：禁用 + aria-busy + 进行态文案；返回 done() 恢复
 *
 * 顺带提供（非契约钉死，但六屏都要用，宁可这里一份也别各抄五份）：
 *   adm(key, params?, lang?)      §5.4 的 `adm.*` 共用文案（三语）
 *   button(opts) / notice(opts)   ≥ 44px 的按钮；顶部绿条 / 黄条 / 灰条
 *   apiMessage(err)               ApiError → 给师傅看的一句话（已登记 code 用本地化文案，未登记才原样用 message；非 ApiError → 「连不上后台」）
 *   sessionExpired(el, lang)      401：清令牌 + 回锁屏（§4.0）
 *
 * 文本一律 textContent（dom.ts 的 h()）；样式在 pages/admin/admin.css，全部 `.adm-` 前缀（§3.4）。
 * 本模块只被六屏（动态分包）引用，不进首屏。
 */
import "../pages/admin/admin.css";

import type { FieldError } from "../api/types";
import { isApiError } from "../api/types";
import { append, h, replace } from "../dom";
import { getLang, type Lang, type TParams } from "../i18n";
import { clearToken, renderLockScreen } from "./token";

// ---------------------------------------------------------------------------
// `adm.*` 共用文案（§5.4 最小集 + 本文件自用的几条）
// ---------------------------------------------------------------------------

const ADM = {
  "adm.notFound": { uk: "Такого екрана немає", zh: "没找到这一屏", en: "No such screen" },
  "adm.back.home": { uk: "На головну", zh: "回工作台", en: "Back to dashboard" },
  "adm.back": { uk: "Назад", zh: "返回", en: "Back" },
  "adm.save": { uk: "Зберегти", zh: "保存", en: "Save" },
  "adm.saving": { uk: "Зберігаю…", zh: "正在保存…", en: "Saving…" },
  "adm.saved": { uk: "Збережено · ще не опубліковано", zh: "已存好 · 还没发布", en: "Saved · not published yet" },
  "adm.saved.unchanged": { uk: "Змін немає, нічого не збережено", zh: "没有改动，什么都没存", en: "No changes, nothing saved" },
  "adm.saved.goPublish": { uk: "До публікації", zh: "去发布", en: "Go publish" },
  "adm.cancel": { uk: "Скасувати", zh: "取消", en: "Cancel" },
  "adm.retry": { uk: "Спробувати ще раз", zh: "重试", en: "Retry" },
  "adm.undo": { uk: "Скасувати дію", zh: "撤销", en: "Undo" },
  "adm.discarded": {
    uk: "На попередньому екрані були незбережені зміни — їх відкинуто",
    zh: "刚才那屏有没保存的改动，已丢弃",
    en: "The previous screen had unsaved changes — they were discarded",
  },
  "adm.leave.confirm": {
    uk: "На цьому екрані є незбережені зміни. Справді вийти?",
    zh: "这一屏有还没保存的改动，真的离开吗？",
    en: "This screen has unsaved changes. Leave anyway?",
  },
  "adm.loading": { uk: "Читаю…", zh: "正在读…", en: "Loading…" },
  "adm.offline": {
    uk: "Немає мережі: кабінет можна лише переглядати, зберегти не вийде",
    zh: "现在没网，后台只能看不能存",
    en: "No network: the back office is read-only until you're back online",
  },
  "adm.err.network": { uk: "Немає зв'язку з кабінетом", zh: "连不上后台", en: "Can't reach the back office" },
  "adm.err.expired": {
    uk: "Посилання більше не діє — попросіть у Terry нове",
    zh: "链接失效了，找 Terry 要新的",
    en: "This link has expired — ask Terry for a new one",
  },
  "adm.err.hasFieldErrors": {
    uk: "Треба виправити {n} — вони позначені",
    zh: "有 {n} 处要改，已经标出来了",
    en: "{n} things to fix — they're highlighted",
  },
  "adm.machineTranslated": { uk: "Машинний переклад, можна змінити", zh: "机翻，可改", en: "Machine-translated, editable" },

  // 本文件自用
  "adm.stepper.minus": { uk: "Менше на {n}", zh: "减 {n}", en: "Minus {n}" },
  "adm.stepper.plus": { uk: "Більше на {n}", zh: "加 {n}", en: "Plus {n}" },
  "adm.errors.summary": { uk: "Є що виправити", zh: "有几处要改", en: "Something needs fixing" },
  "adm.empty": { uk: "Поки що порожньо", zh: "这里还没有内容", en: "Nothing here yet" },
} as const satisfies Record<string, Record<Lang, string>>;

export type AdmKey = keyof typeof ADM;

/** `adm.*` 共用文案；lang 缺省 = 当前语言（与 i18n.ts 的 t() 同一习惯）。屏自己的文案放屏文件，别往这里加。 */
export function adm(key: AdmKey, params?: TParams, lang: Lang = getLang()): string {
  let s: string = ADM[key][lang];
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// ---------------------------------------------------------------------------
// 按钮 / 顶栏 / 卡片
// ---------------------------------------------------------------------------

export interface ButtonOpts {
  label: string;
  onClick?: (ev: MouseEvent) => void;
  /** primary = 主操作（实心）；ghost = 次要；默认描边 */
  kind?: "primary" | "ghost" | "default";
  /** 语义型的额外类（如 "adm-plan-save"），空格分隔 */
  class?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  ariaLabel?: string;
}

/** ≥ 44px 的按钮（styles.css 头注释：所有触控目标 ≥ 44px） */
export function button(opts: ButtonOpts): HTMLButtonElement {
  const cls = ["adm-btn", opts.kind === "primary" ? "adm-btn-primary" : opts.kind === "ghost" ? "adm-btn-ghost" : "", opts.class ?? ""]
    .filter(Boolean)
    .join(" ");
  const btn = h(
    "button",
    { type: opts.type ?? "button", class: cls, disabled: opts.disabled ? true : null, "aria-label": opts.ariaLabel ?? null },
    opts.label,
  );
  if (opts.onClick) btn.addEventListener("click", opts.onClick);
  return btn;
}

export interface TopBarOpts {
  /** 字符串 = href（如 adminHref()）；函数 = 自己处理（有未保存改动时先二次确认，§4.0）；缺省 = 不画返回 */
  back?: string | (() => void);
  title: string;
  /** 右侧主操作（按钮 / 链接） */
  actions?: HTMLElement[];
  /** 返回键的无障碍名；缺省「返回」 */
  backLabel?: string;
}

/** 页内第一行：左「←」、中 <h2>、右主操作。顶栏 <h1> 恒为 t("page.admin")，屏标题在这里（D-02）。 */
export function topBar(opts: TopBarOpts): HTMLElement {
  const label = opts.backLabel ?? adm("adm.back");
  let back: HTMLElement | null = null;
  if (typeof opts.back === "string") {
    back = h("a", { class: "adm-topbar-back", href: opts.back, "aria-label": label }, h("span", { "aria-hidden": "true" }, "←"));
  } else if (typeof opts.back === "function") {
    const fn = opts.back;
    back = h("button", { type: "button", class: "adm-topbar-back", "aria-label": label }, h("span", { "aria-hidden": "true" }, "←"));
    back.addEventListener("click", () => fn());
  }
  const actions = h("div", { class: "adm-topbar-actions" });
  append(actions, ...(opts.actions ?? []));
  return h("div", { class: "adm-topbar" }, back, h("h2", { class: "adm-topbar-title" }, opts.title), actions);
}

/** 空态卡 */
export function emptyCard(text: string): HTMLElement {
  return h("div", { class: "adm-empty card" }, h("p", { class: "muted" }, text || adm("adm.empty")));
}

/** 错误卡：文案原样（worker 的 message），附「重试」 */
export function errorCard(text: string, onRetry?: () => void): HTMLElement {
  const card = h("div", { class: "adm-error card", role: "alert" }, h("p", {}, text));
  if (onRetry) card.append(h("div", { class: "adm-error-actions" }, button({ label: adm("adm.retry"), onClick: () => onRetry() })));
  return card;
}

export interface NoticeOpts {
  /** ok = 绿条（已存好）；warn = 黄条（悬空引用 / 临时通道）；info = 灰条（没网、已丢弃） */
  kind: "ok" | "warn" | "info";
  text: string;
  /** 右侧动作：链接（href）或按钮（onClick） */
  action?: { label: string; href?: string; onClick?: () => void };
  /** 缺省 role="status"；warn 用 alert */
  role?: "status" | "alert";
}

/** 顶部一条提示（§4.2 的绿条「已存好 · 还没发布」+「去发布」就是它） */
export function notice(opts: NoticeOpts): HTMLElement {
  const bar = h("div", { class: `adm-notice adm-${opts.kind}`, role: opts.role ?? (opts.kind === "warn" ? "alert" : "status") }, h("p", {}, opts.text));
  if (opts.action) {
    const { label, href, onClick } = opts.action;
    if (href) bar.append(h("a", { class: "adm-notice-action", href }, label));
    else bar.append(button({ label, kind: "ghost", class: "adm-notice-action", onClick: onClick ? () => onClick() : undefined }));
  }
  return bar;
}

// ---------------------------------------------------------------------------
// 进行态
// ---------------------------------------------------------------------------

/**
 * 请求进行中：el 加 aria-busy + .adm-busy，是表单控件就 disabled，给了 label 就临时换文案（如 adm("adm.saving")）。
 * 返回 done()：恢复原样。用法：const done = busy(btn, adm("adm.saving")); try { await api.save(…) } finally { done(); }
 */
export function busy(el: HTMLElement, label?: string): () => void {
  const control = el as HTMLElement & { disabled?: boolean };
  const hadDisabled = control.disabled === true;
  const text = el.textContent;
  el.setAttribute("aria-busy", "true");
  el.classList.add("adm-busy");
  if ("disabled" in control) control.disabled = true;
  if (label !== undefined) el.textContent = label;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    el.removeAttribute("aria-busy");
    el.classList.remove("adm-busy");
    if ("disabled" in control) control.disabled = hadDisabled;
    if (label !== undefined) el.textContent = text;
  };
}

// ---------------------------------------------------------------------------
// 表单行 + 字段级错误
// ---------------------------------------------------------------------------

const LABELABLE = "input, select, textarea, button, output, meter, progress";
/** 控件是外层容器（stepper / 自定义组合）时，id 只落在里面真正接受输入的元素上——不含 button：stepper 的第一个子元素是「−」按钮 */
const FORM_CONTROL = "input, select, textarea";

export interface FieldRowOpts {
  /** 如 "adm-ing" */
  idPrefix: string;
  /** 如 "packSize"；最终 id = `${idPrefix}-${name}` */
  name: string;
  /** JSON Pointer，如 "/purchase/packSize"；applyFieldErrors 靠它标黄 */
  pointer: string;
  label: string;
  hint?: string;
  control: HTMLElement;
}

/**
 * 一行表单：<label for> + 控件 + 说明 + 错误位。
 * 控件本身不是可标注元素（如 stepper 的外层）时，id 落在它里面第一个 input/select/textarea 上；都没有才落在控件本身。
 */
export function fieldRow(opts: FieldRowOpts): HTMLElement {
  const id = `${opts.idPrefix}-${opts.name}`;
  // 里层查找用 FORM_CONTROL 而不是 LABELABLE：stepper 的 DOM 是 [button −, input, button +]，按 LABELABLE 找会把 id 落在「−」按钮上，
  // <label for> 随之指向按钮而不是 <input>，读屏器读不对（#23 报出）。
  const target = opts.control.matches(LABELABLE) ? opts.control : (opts.control.querySelector<HTMLElement>(FORM_CONTROL) ?? opts.control);
  target.id = id;
  const hintId = `${id}-hint`;
  const errId = `${id}-error`;
  const described = [opts.hint ? hintId : "", errId].filter(Boolean).join(" ");
  target.setAttribute("aria-describedby", described);
  const row = h(
    "div",
    { class: "adm-field", "data-pointer": opts.pointer },
    h("label", { class: "adm-field-label", for: id }, opts.label),
    h("div", { class: "adm-field-control" }, opts.control),
    opts.hint ? h("p", { class: "adm-field-hint muted", id: hintId }, opts.hint) : null,
    h("p", { class: "adm-field-error", id: errId, hidden: true }),
  );
  return row;
}

/** 从 worker 的 required 文案（「这项必须填：plannedServings」）里取缺的字段名 */
function missingProperty(message: string): string | null {
  const m = /[：:]\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(message);
  return m?.[1] ?? null;
}

function findField(root: HTMLElement, pointer: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`.adm-field[data-pointer="${pointer.replace(/"/g, '\\"')}"]`);
}

/** 命中规则：先精确；required 再试 `${path}/${缺的字段}`；再逐级往父指针找（/meals/0/qty/value → /meals/0/qty → /meals/0） */
function resolveField(root: HTMLElement, err: FieldError): HTMLElement | null {
  if (err.path === "") return null;
  const exact = findField(root, err.path);
  if (exact) return exact;
  if (err.code === "required") {
    const prop = missingProperty(err.message);
    if (prop) {
      const child = findField(root, `${err.path}/${prop}`);
      if (child) return child;
    }
  }
  let parent = err.path;
  while (parent.includes("/")) {
    parent = parent.slice(0, parent.lastIndexOf("/"));
    if (parent === "") break;
    const hit = findField(root, parent);
    if (hit) return hit;
  }
  return null;
}

/**
 * 把 worker 的 errors[] 按 JSON Pointer 标黄（.adm-invalid + aria-invalid + 错误位显示 fieldErrorText 的结果）；
 * 未命中 pointer 的错误（含 path 为 "" 的整单级错误）集中显示在 root 顶部（role="alert"）。
 * 之后把焦点移到第一个出错控件（没有就移到顶部汇总），并滚到可见（§4.2 / §4.4）。
 */
export function applyFieldErrors(root: HTMLElement, errors: readonly FieldError[]): void {
  clearFieldErrors(root);
  const lang = getLang();
  const unmatched: FieldError[] = [];
  let first: HTMLElement | null = null;
  for (const err of errors) {
    const field = resolveField(root, err);
    if (!field) {
      unmatched.push(err);
      continue;
    }
    field.classList.add("adm-invalid");
    const slot = field.querySelector<HTMLElement>(".adm-field-error");
    if (slot) {
      const text = fieldErrorText(err, lang);
      slot.textContent = slot.textContent ? `${slot.textContent} · ${text}` : text;
      slot.hidden = false;
    }
    const control = field.querySelector<HTMLElement>(LABELABLE);
    if (control) control.setAttribute("aria-invalid", "true");
    if (!first) first = control ?? field;
  }
  if (unmatched.length > 0) {
    const list = h("ul", { class: "adm-form-errors-list" });
    for (const err of unmatched) {
      list.append(h("li", {}, err.path ? h("code", {}, err.path) : null, err.path ? " " : "", fieldErrorText(err, lang)));
    }
    const box = h("div", { class: "adm-form-errors", role: "alert", tabindex: "-1" }, h("p", { class: "adm-form-errors-title" }, adm("adm.errors.summary")), list);
    root.prepend(box);
    if (!first) first = box;
  }
  if (first) {
    first.focus({ preventScroll: true });
    first.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

export function clearFieldErrors(root: HTMLElement): void {
  for (const field of root.querySelectorAll<HTMLElement>(".adm-field.adm-invalid")) {
    field.classList.remove("adm-invalid");
    const slot = field.querySelector<HTMLElement>(".adm-field-error");
    if (slot) {
      slot.textContent = "";
      slot.hidden = true;
    }
    field.querySelector<HTMLElement>("[aria-invalid]")?.removeAttribute("aria-invalid");
  }
  for (const box of root.querySelectorAll<HTMLElement>(".adm-form-errors")) box.remove();
}

// ---------------------------------------------------------------------------
// ± 步进器
// ---------------------------------------------------------------------------

export interface StepperOpts {
  value: number;
  min?: number;
  max?: number;
  /** 默认 1；#21 传 10 */
  step?: number;
  /** 长按 / Shift+↑↓ 用；缺省 = step × 5；#21 传 50 */
  bigStep?: number;
  /** 无障碍名（「周三午餐份数」） */
  label: string;
  onChange(v: number): void;
}

/** 长按多久进入连发（§4.2：pointerdown 起 400 ms） */
const HOLD_DELAY_MS = 400;
const HOLD_INTERVAL_MS = 160;

/**
 * ± 步进器：− / + 各 ≥ 44×44；中间 <input inputmode="numeric"> 可直接改；
 * 长按 ±bigStep 连发（pointerup / pointercancel / pointerleave / blur 都停）；键盘 ↑/↓ = ±step，Shift+↑/↓ = ±bigStep；
 * aria-live="polite" 播报数值。返回外层元素，当前值可从里面的 <input> 读。
 */
export function stepper(opts: StepperOpts): HTMLElement {
  const step = opts.step ?? 1;
  const big = opts.bigStep ?? step * 5;
  const min = opts.min ?? 0;
  const max = opts.max ?? Number.MAX_SAFE_INTEGER;
  let value = min;

  function clamp(v: number): number {
    if (!Number.isFinite(v)) return value;
    return Math.min(max, Math.max(min, Math.round(v)));
  }
  value = clamp(opts.value);

  const minus = h("button", { type: "button", class: "adm-stepper-btn", "aria-label": adm("adm.stepper.minus", { n: step }) }, "−");
  const plus = h("button", { type: "button", class: "adm-stepper-btn", "aria-label": adm("adm.stepper.plus", { n: step }) }, "+");
  const input = h("input", {
    class: "adm-stepper-input",
    type: "text",
    inputmode: "numeric",
    pattern: "[0-9]*",
    autocomplete: "off",
    "aria-label": opts.label,
    value: String(value),
  });
  const live = h("span", { class: "sr-only", "aria-live": "polite" });
  const root = h("div", { class: "adm-stepper", role: "group", "aria-label": opts.label }, minus, input, plus, live);

  function paint(): void {
    input.value = String(value);
    minus.setAttribute("aria-disabled", value <= min ? "true" : "false");
    plus.setAttribute("aria-disabled", value >= max ? "true" : "false");
  }

  function set(next: number): void {
    const v = clamp(next);
    if (v === value) {
      paint();
      return;
    }
    value = v;
    paint();
    live.textContent = `${opts.label}: ${value}`;
    opts.onChange(value);
  }

  // 长按连发：pointerdown 起 400 ms 后按 bigStep 连发；随后的 click 要吞掉（否则松手时又多走一步）
  function bindHold(btn: HTMLButtonElement, dir: 1 | -1): void {
    let timer: number | null = null;
    let interval: number | null = null;
    let held = false;
    const stop = (): void => {
      if (timer !== null) window.clearTimeout(timer);
      if (interval !== null) window.clearInterval(interval);
      timer = null;
      interval = null;
    };
    btn.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      held = false;
      stop();
      timer = window.setTimeout(() => {
        held = true;
        set(value + dir * big);
        interval = window.setInterval(() => set(value + dir * big), HOLD_INTERVAL_MS);
      }, HOLD_DELAY_MS);
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave", "blur"]) btn.addEventListener(type, stop);
    btn.addEventListener("contextmenu", (ev) => ev.preventDefault());
    btn.addEventListener("click", () => {
      if (held) {
        held = false;
        return;
      }
      set(value + dir * step);
    });
  }
  bindHold(minus, -1);
  bindHold(plus, 1);

  input.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") {
      if (ev.key === "Enter") {
        ev.preventDefault();
        commit();
      }
      return;
    }
    ev.preventDefault();
    const delta = (ev.shiftKey ? big : step) * (ev.key === "ArrowUp" ? 1 : -1);
    set(value + delta);
  });
  function commit(): void {
    const raw = input.value.trim();
    const parsed = raw === "" ? Number.NaN : Number(raw);
    if (Number.isFinite(parsed)) set(parsed);
    else paint(); // 认不出就回到当前值
  }
  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);

  paint();
  return root;
}

// ---------------------------------------------------------------------------
// 错误 → 文案；401 → 锁屏
// ---------------------------------------------------------------------------

/**
 * ApiError → 给师傅看的一句话：契约已登记的 code 用本文件的本地化文案，未登记的 code 才原样显示 worker 的 message
 * （ADR-0007 §5 的例外，2026-09-16 / #113；§4.0）；不是 ApiError（fetch 抛的 TypeError、动态分包加载失败…）→ 「连不上后台」。
 */
const CONTRACT_ERRORS: Record<string, Record<Lang, string>> = {
  conflict: { zh: "有人改过这份资料，本地草稿已保留，请先核对", en: "This document changed. Your draft is kept; review it before saving", uk: "Документ змінився. Чернетку збережено локально; перевірте зміни" },
  format_downgrade: { zh: "这份资料已用新版格式保存，不能用旧格式覆盖", en: "This document uses a newer format and cannot be overwritten with the old format", uk: "Документ має новий формат; старий формат не може його перезаписати" },
  review_required: { zh: "来源或范围变了，请先保存复核结果，再逐项确认", en: "Sources or scope changed. Save the reviewed list, then confirm each item", uk: "Джерела або обсяг змінилися. Збережіть перевірений список, потім підтвердьте позиції" },
  unsupported_format: { zh: "这个编辑页暂不支持资料的新格式", en: "This editor does not yet support the document format", uk: "Цей редактор поки не підтримує формат документа" },
  revision_unavailable: { zh: "无法读取指定版本的资料", en: "The requested version is unavailable", uk: "Запитана версія недоступна" },
  basis_unavailable: { zh: "无法读取这份清单的来源版本，判断已保留", en: "The list's source version is unavailable; decisions are kept", uk: "Версія джерел списку недоступна; рішення збережено" },
  revision_mismatch: { zh: "返回的资料版本不一致，请重新读取", en: "The returned version does not match. Reload the document", uk: "Отримана версія не збігається. Завантажте документ знову" },
  invalid_source: { zh: "这份来源资料格式有误，无法读取", en: "The source document has an invalid format", uk: "Документ джерела має некоректний формат" },
  external_asset_unpinned: { zh: "外链图片未保留此版本，暂不能显示同版图片", en: "This external image was not preserved for this version", uk: "Це зовнішнє зображення не збережено для цієї версії" },
  asset_unavailable: { zh: "此版本的图片不可用", en: "The image for this version is unavailable", uk: "Зображення для цієї версії недоступне" },
  invalid_revision: { zh: "资料版本无效，请重新打开来源", en: "Invalid document version. Reopen the source", uk: "Некоректна версія документа. Відкрийте джерело знову" },
  precondition_required: { zh: "缺少保存依据，请先重新读取并核对草稿", en: "A save condition is missing. Reload and compare your draft first", uk: "Немає умови збереження. Завантажте документ і звірте чернетку" },
  invalid_precondition: { zh: "保存依据无效，请先重新读取并核对草稿", en: "The save condition is invalid. Reload and compare your draft", uk: "Умова збереження некоректна. Завантажте документ і звірте чернетку" },
  worker_unconfigured: { zh: "尚未连接保存服务，改动只在本页", en: "Saving is not connected. Changes are only on this page", uk: "Сервіс збереження не підключено. Зміни лише на цій сторінці" },
  session_changed: { zh: "访问会话已变更，请重新打开资料", en: "Your access session changed. Reopen the document", uk: "Сеанс доступу змінився. Відкрийте документ знову" },
  invalid_view: { zh: "这份预览不能作为保存依据，请重新读取资料", en: "This preview cannot be used as a saved source. Reload the document", uk: "Цей перегляд не може бути збереженим джерелом. Завантажте документ знову" },
  basis_mismatch: { zh: "清单和资料的版本或范围不一致，请先复核", en: "The list and source versions or selections differ. Review the list first", uk: "Версії або обсяг списку та джерел відрізняються. Спочатку перевірте список" },
  unresolved_ingredient: { zh: "这项材料的资料缺失，暂时只能标为待核对", en: "This ingredient's details are missing. Keep it marked for checking", uk: "Дані інгредієнта відсутні. Залиште його на перевірці" },
  invalid_selection: { zh: "清单范围或材料不一致，请重新选择并复核", en: "The list selection or ingredients do not match. Select and review again", uk: "Обсяг списку або інгредієнти не збігаються. Виберіть і перевірте знову" },
  invalid_decision: { zh: "只有待买材料可以标记购买进度", en: "Only items marked to buy can have purchase progress", uk: "Стан купівлі можна вказати лише для позицій, які потрібно купити" },
  // #113 方案 B：以下 17 条覆盖 worker 能发出但前端原先没有译文的 code；zh 一列逐字取自 packages/worker/src/http.ts 的 MESSAGES（改了也算二次编造）
  bad_id: { zh: "名称只能用小写字母、数字和短横线", en: "Names may use lowercase letters, digits and hyphens only", uk: "Назва може містити лише малі літери, цифри та дефіси" },
  bad_path: { zh: "这个位置不允许写入", en: "Writing to this location is not allowed", uk: "Запис у це розташування заборонено" },
  bad_json: { zh: "数据没发全，重试一次", en: "The data did not arrive complete. Try again", uk: "Дані надійшли неповністю. Спробуйте ще раз" },
  bad_image: { zh: "这张图片打不开，换一张再试", en: "This image cannot be opened. Try another one", uk: "Це зображення не відкривається. Спробуйте інше" },
  unauthorized: { zh: "链接失效了，找 Terry 要新的", en: "This link has expired. Ask Terry for a new one", uk: "Посилання недійсне. Попросіть у Террі нове" },
  forbidden: { zh: "你这条链接不能做这件事", en: "Your link is not allowed to do this", uk: "Ваше посилання не дозволяє виконати цю дію" },
  not_found: { zh: "没找到这个版本", en: "This version was not found", uk: "Цю версію не знайдено" },
  too_large: { zh: "照片太大了，从后台页面正常上传", en: "The photo is too large. Upload it from the admin page", uk: "Фото завелике. Завантажте його зі сторінки адміністрування" },
  rate_limited: { zh: "操作太频繁，等几分钟再试", en: "Too many requests. Wait a few minutes and try again", uk: "Забагато запитів. Зачекайте кілька хвилин і повторіть" },
  upstream_error: { zh: "GitHub 那边出问题了，先看看 PAT 是不是到期了", en: "GitHub returned an error. Check whether the PAT has expired", uk: "GitHub повернув помилку. Перевірте, чи не минув термін дії PAT" },
  dispatch_unavailable: { zh: "发布功能暂时关着", en: "Publishing is currently turned off", uk: "Публікацію наразі вимкнено" },
  not_configured: { zh: "这项功能还没配好，找 Terry", en: "This feature is not configured yet. Ask Terry", uk: "Цю функцію ще не налаштовано. Зверніться до Террі" },
  internal_error: { zh: "后台出了点问题，把这一步再试一次", en: "Something went wrong on the server. Try this step again", uk: "На сервері сталася помилка. Повторіть цей крок" },
  unresolved_reference: { zh: "这个材料的资料不可用，暂时不能确认", en: "This ingredient's details are unavailable; it cannot be confirmed yet", uk: "Дані цього інгредієнта недоступні; підтвердити поки не можна" },
  // 字段级三条：message 由调用点现写、带着前端拿不到的具体值，所以 fieldErrorText 在译文后拼上分隔符之后那一段
  required: { zh: "这项必须填", en: "This field is required", uk: "Це поле обов'язкове" },
  type: { zh: "这一项的格式不对", en: "This value has the wrong format", uk: "Некоректний формат значення" },
  enum: { zh: "这一项只能从给定的几个选项里选", en: "Choose one of the allowed options", uk: "Виберіть один із дозволених варіантів" },
};

/** 字段级 code：message 是调用点现写的，带着具体值（「只能选：en / uk」），所以译文之后要把分隔符后那一段拼回来（#113） */
const FIELD_DETAIL_CODES = new Set(["required", "type", "enum"]);

/** 拼接用的分隔符按各语言自己的标点习惯：zh 全角，en / uk 半角 */
const FIELD_DETAIL_SEP: Record<Lang, string> = { zh: "：", en: ": ", uk: ": " };

/** message 里第一个 "：" / ":" 之后的具体值（「只能选：en / uk」→「en / uk」）；没有分隔符就没有可拼的部分 */
function messageDetail(message: string): string {
  const i = message.search(/[：:]/);
  return i < 0 ? "" : message.slice(i + 1).trim();
}

/**
 * 一条 errors[] 给师傅看的文字：code 有登记译文就用译文，message 降为「没有 code 译文时的兜底」；
 * 未登记的 code 仍原样显示 message（ADR-0007 §5 的例外，2026-09-16 / #113）。
 * required / type / enum 这三条字段级 code 在译文之后拼上 message 中分隔符后的具体值（有才拼）。
 */
export function fieldErrorText(err: FieldError, lang: Lang = getLang()): string {
  const copy = CONTRACT_ERRORS[err.code]?.[lang];
  if (!copy) return err.message;
  if (!FIELD_DETAIL_CODES.has(err.code)) return copy;
  const detail = messageDetail(err.message);
  return detail ? `${copy}${FIELD_DETAIL_SEP[lang]}${detail}` : copy;
}

export function apiMessage(err: unknown, lang: Lang = getLang()): string {
  if (isApiError(err)) {
    if (err.status === 401) return adm("adm.err.expired", undefined, lang);
    return CONTRACT_ERRORS[err.code]?.[lang] || err.message || adm("adm.err.network", undefined, lang);
  }
  return adm("adm.err.network", undefined, lang);
}

/** 401：清掉 sessionStorage 里的令牌，把 el 换成「链接失效了」+ 锁屏（§4.0） */
export function sessionExpired(el: HTMLElement, lang: Lang = getLang()): void {
  clearToken();
  replace(el, notice({ kind: "warn", text: adm("adm.err.expired", undefined, lang) }));
  renderLockScreen(el, lang);
}
