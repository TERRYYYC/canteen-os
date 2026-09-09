/**
 * 后台令牌（docs/specs/v03-admin-frontend-contract.md §2.3 / §3.5；ADR-0007 §4；worker 契约 §2.2）。
 *
 * 链接形状：`#/admin/t/<43 字符 base64url 令牌>`。处理步骤（§2.3）：
 *   1. rest 以 "t/" 开头 → 第二段是令牌；
 *   2. 长度不是 43 → 当作无令牌（与 worker 契约 §2.3 第 2 步同一个「先判长度」思路）；
 *   3. 写 sessionStorage["canteenos.token"]，包 try/catch（照 i18n.ts 的 readStored()）；
 *   4. history.replaceState 抹掉地址栏里的令牌（不触发 hashchange，壳层不重渲染，所以 ctx.rest 会短暂陈旧 ——
 *      因此这里是幂等的：sessionStorage 里已有令牌就忽略 rest 里的那份）；
 *   5. 返回剥掉令牌段后的 rest，分发器继续渲染。
 *
 * 红线：令牌不得写 localStorage、不得进 query string、不得进 console、不得出现在 data-* 属性或 DOM 文本里。
 * 前端不解析令牌、不推断角色（§7 排除 4）；越权靠 worker 的 403 兜底。
 *
 * 本文件被 pages/admin.ts 静态 import，进首屏主 chunk —— 只放令牌与锁屏，别往里加东西。
 */
import { h } from "../dom";
import type { Lang } from "../i18n";
import { hrefOf } from "../router";

const STORAGE_KEY = "canteenos.token";
/** worker 签发的令牌是 32 字节的 base64url（无填充）= 43 个字符（worker 契约 §2.1） */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** sessionStorage 不可用（隐私模式等）时的本页内存兜底：关标签页即失，与 sessionStorage 生命周期一致 */
let memory: string | null = null;

const T = {
  "adm.lock.title": { uk: "Відкрийте за посиланням шефа", zh: "请用师傅链接打开", en: "Open with the chef link" },
  "adm.lock.body": {
    uk: "Ця сторінка відкривається лише за спеціальним посиланням, яке вам надіслав Terry. Якщо посилання загубилося — попросіть у нього нове.",
    zh: "这一页要用 Terry 发给你的那条专用链接才能打开。链接丢了就找他再要一条。",
    en: "This page only opens with the private link Terry sent you. If you lost it, ask him for a new one.",
  },
} as const satisfies Record<string, Record<Lang, string>>;

function tt(lang: Lang, key: keyof typeof T): string {
  return T[key][lang];
}

/** 当前会话的令牌；没有 / 形状不对 → null */
export function getToken(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v !== null) return TOKEN_RE.test(v) ? v : null;
  } catch {
    /* 隐私模式：退回内存 */
  }
  return memory;
}

/** 401 时调用：清掉令牌，随后由屏自己回锁屏（kit.sessionExpired 已把这两步包在一起） */
export function clearToken(): void {
  memory = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 没存过 */
  }
}

function storeToken(token: string): void {
  memory = token;
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* 隐私模式：只在本页内存里有效 */
  }
}

/** `#/admin` 或 `#/admin/<segs…>`（逐段编码；与 pages/admin.ts 的 adminHref 同形，这里不能 import 它——会成环） */
function adminUrl(rest: string): string {
  const encoded = rest
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return encoded ? `${hrefOf("admin")}/${encoded}` : hrefOf("admin");
}

/**
 * 消费 rest 里的令牌段（`t/<token>[/<rest…>]`），返回剥掉令牌段后的 rest。
 * 幂等：已有令牌时忽略 rest 里的那份；令牌串为空或长度不是 43 → 当作无令牌（仍然把它从地址栏抹掉）。
 */
export function consumeTokenFromRest(rest: string): string {
  if (rest !== "t" && !rest.startsWith("t/")) return rest;
  const segs = rest.split("/");
  const candidate = segs[1] ?? "";
  const remainder = segs.slice(2).join("/");
  if (getToken() === null && TOKEN_RE.test(candidate)) storeToken(candidate);
  // 无论存没存成功，令牌都不能留在地址栏（红线）。replaceState 不触发 hashchange。
  if (/^#\/?admin\/t(\/|$)/.test(location.hash)) {
    try {
      history.replaceState(null, "", adminUrl(remainder));
    } catch {
      /* 极端环境（file:// 等）不允许 replaceState：只能留着，不阻塞渲染 */
    }
  }
  return remainder;
}

/** 无令牌时的锁屏：只画一张卡，一个请求都不发（§2.2 降级语义）；role="status"，进入时把焦点放上去（§4.1） */
export function renderLockScreen(el: HTMLElement, lang: Lang): void {
  const card = h(
    "div",
    { class: "adm adm-lock card", role: "status", tabindex: "-1" },
    h("h2", {}, tt(lang, "adm.lock.title")),
    h("p", { class: "muted" }, tt(lang, "adm.lock.body")),
  );
  el.append(card);
  card.focus({ preventScroll: true });
}
