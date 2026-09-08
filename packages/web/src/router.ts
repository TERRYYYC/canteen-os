/**
 * hash 路由（无后端、静态托管；execution-brief §1.4）。
 *
 *   #/prep  #/purchase  #/menu  #/admin  #/qr  默认 #/prep（#/qr = 三张码的 A4 打印页，不进抽屉，师傅从链接进）
 *   #/prep/<rest>                              页面段之后的部分原样交给页面（onRoute 的第二个参数），
 *                                              路由器不解释；#9 备料单 B 版详情等可用它做子状态。
 *
 * 未知 / 空 hash → location.replace 到默认页（不产生历史记录）。
 */
export type Route = "prep" | "purchase" | "menu" | "admin" | "qr";

export const ROUTES: readonly Route[] = ["prep", "purchase", "menu", "admin", "qr"];
export const DEFAULT_ROUTE: Route = "prep";

export interface RouteState {
  page: Route;
  /** 页面段之后的部分（已 decodeURIComponent，不含开头的 "/"）；无则 "" */
  rest: string;
}

function isRoute(s: string): s is Route {
  return (ROUTES as readonly string[]).includes(s);
}

/** 解析任意 hash（"#/prep/x" / "#prep" / ""）；不合法返回 null */
export function parseHash(hash: string): RouteState | null {
  const m = /^#\/?([^/?#]*)(?:\/(.*))?$/.exec(hash);
  if (!m) return null;
  const page = m[1] ?? "";
  if (!isRoute(page)) return null;
  let rest = m[2] ?? "";
  try {
    rest = decodeURIComponent(rest);
  } catch {
    /* 保留原样 */
  }
  return { page, rest };
}

export function hrefOf(page: Route, rest = ""): string {
  return `#/${page}${rest ? `/${encodeURIComponent(rest)}` : ""}`;
}

/** 当前页面；hash 不合法时返回默认页（并不改 URL——normalize() 才改） */
export function route(): Route {
  return parseHash(location.hash)?.page ?? DEFAULT_ROUTE;
}

export function routeState(): RouteState {
  return parseHash(location.hash) ?? { page: DEFAULT_ROUTE, rest: "" };
}

/** 跳转（写 hash，触发 hashchange → onRoute 回调） */
export function navigate(page: Route, rest = ""): void {
  const next = hrefOf(page, rest);
  if (location.hash === next) return;
  location.hash = next;
}

/** 不合法 / 空 hash 时替换成默认页 URL（不留历史记录）；返回是否改过 */
export function normalize(): boolean {
  if (parseHash(location.hash)) return false;
  location.replace(hrefOf(DEFAULT_ROUTE));
  return true;
}

type Listener = (page: Route, rest: string) => void;
const listeners = new Set<Listener>();
let bound = false;

/** 订阅路由变化；立即以当前路由调用一次（immediate=true，默认）。返回取消函数。 */
export function onRoute(fn: Listener, immediate = true): () => void {
  listeners.add(fn);
  if (!bound) {
    bound = true;
    window.addEventListener("hashchange", () => {
      if (normalize()) return; // replace 会再触发一次 hashchange
      const { page, rest } = routeState();
      for (const l of listeners) l(page, rest);
    });
  }
  if (immediate) {
    const { page, rest } = routeState();
    fn(page, rest);
  }
  return () => {
    listeners.delete(fn);
  };
}
