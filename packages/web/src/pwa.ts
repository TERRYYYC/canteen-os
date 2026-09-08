/**
 * PWA 壳层逻辑（issue #12）：service worker 注册 + 「有新版本」提示 + build.json 版本检查 + iOS 加到主屏幕提示。
 *
 *   initPwa(shell)   —— main.ts 挂完壳后调一次；没有 serviceWorker 的环境（file://、旧浏览器、jsdom）只挂 iOS 提示。
 *
 * 更新流程（vite.config.ts registerType "prompt"，不自动刷新）：
 *   1. 新 SW 装好在等待（precache 清单变了——build.json 每次构建必变，所以每次部署都会到这一步）
 *      → onNeedRefresh → 顶栏下方出一条 .update-bar「有新版本 · 点此刷新」；
 *   2. 用户点它 → updateSW() 发 SKIP_WAITING → 新 SW 接管 → workbox-window 的 controlling 事件 → reload。
 *      没有等待中的 SW（只是 build.json 检查发现了新 commit）→ 直接 reload，网络上已经是新页面。
 *   3. 另一层：页面回到前台（visibilitychange → visible）且距上次检查 ≥ 10 分钟，
 *      带时间戳参数拉一次 ./data/build.json（绕过 precache 与 HTTP 缓存），commit 与内存里的不同
 *      → 同样出提示条，并让浏览器立刻查一次 SW 更新（registration.update()）。
 *
 * 文案全部走 i18n.ts（update.* / offline.ready / ios.*）；语言切换时由 shell/main 重画页面，提示条自己监听 onLangChange 重写文字。
 * localStorage 只记一个键：canteenos.iosHintDismissed = "1"（try/catch，隐私模式下静默）。
 */
/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from "virtual:pwa-register";
import { dataUrl, loadBuild } from "./data";
import { h } from "./dom";
import { onLangChange, t } from "./i18n";
import type { Shell } from "./shell";

/** 两次 build.json 检查之间的最短间隔 */
export const CHECK_INTERVAL_MS = 10 * 60 * 1000;
/** 「已保存离线副本」一次性状态条的显示时长 */
const OFFLINE_READY_MS = 4000;
const IOS_HINT_KEY = "canteenos.iosHintDismissed";

export interface PwaHandle {
  /** 手动触发一次 build.json 版本检查（忽略 10 分钟间隔；测试用） */
  checkVersion(): Promise<void>;
}

/** 是否 iOS / iPadOS（iPadOS 13+ 的 UA 伪装成 Mac，靠触点数识别） */
export function isIOS(nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> = navigator): boolean {
  return /iP(?:hone|ad|od)/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

/** 已装到主屏幕（iOS 的 navigator.standalone，或任何平台的 display-mode: standalone） */
export function isStandalone(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  try {
    return win.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(IOS_HINT_KEY) === "1";
  } catch {
    return false;
  }
}
function writeDismissed(): void {
  try {
    localStorage.setItem(IOS_HINT_KEY, "1");
  } catch {
    /* 记不住就算了：本次会话不再显示 */
  }
}

// ---------------------------------------------------------------------------
// 提示条（顶栏下方）
// ---------------------------------------------------------------------------

interface UpdateBar {
  showUpdate(onReload: () => void): void;
  showOfflineReady(): void;
}

function mountUpdateBar(root: HTMLElement): UpdateBar {
  const msg = h("span", { class: "msg" });
  const act = h("span", { class: "act" });
  const btn = h("button", { type: "button" }, msg, act);
  const bar = h("div", { class: "update-bar", role: "status", "aria-live": "polite", hidden: true }, btn);
  // 顶栏（sticky）之后、主内容之前；找不到顶栏就放到 root 最前面
  const appbar = root.querySelector<HTMLElement>("header.appbar");
  if (appbar) appbar.insertAdjacentElement("afterend", bar);
  else root.prepend(bar);

  let mode: "update" | "ready" | null = null;
  let reload: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function paint(): void {
    if (mode === "update") {
      msg.textContent = t("update.available");
      act.textContent = t("update.reload");
      act.hidden = false;
    } else if (mode === "ready") {
      msg.textContent = t("offline.ready");
      act.textContent = "";
      act.hidden = true;
    }
  }
  btn.addEventListener("click", () => {
    if (mode === "update") reload?.();
  });
  onLangChange(paint);

  return {
    showUpdate(onReload) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      mode = "update";
      reload = onReload;
      bar.classList.remove("ok");
      paint();
      bar.hidden = false;
    },
    showOfflineReady() {
      if (mode === "update") return; // 「有新版本」优先，不被盖掉
      mode = "ready";
      bar.classList.add("ok");
      paint();
      bar.hidden = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (mode === "ready") {
          bar.hidden = true;
          mode = null;
        }
        timer = null;
      }, OFFLINE_READY_MS);
    },
  };
}

// ---------------------------------------------------------------------------
// iOS 加到主屏幕提示（页面底部，可关闭，localStorage 记住）
// ---------------------------------------------------------------------------

export function mountIosHint(root: HTMLElement, env: { ios: boolean; standalone: boolean; dismissed: boolean }): HTMLElement | null {
  if (!env.ios || env.standalone || env.dismissed) return null;
  const text = h("p");
  const close = h("button", { type: "button" });
  const hint = h("div", { class: "ios-hint", role: "note" }, text, close);
  function paint(): void {
    text.textContent = t("ios.addToHome");
    close.textContent = t("ios.dismiss");
    close.setAttribute("aria-label", t("ios.dismiss"));
  }
  paint();
  const off = onLangChange(paint);
  close.addEventListener("click", () => {
    writeDismissed();
    off();
    hint.remove();
  });
  root.append(hint);
  return hint;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function initPwa(shell: Shell): PwaHandle {
  const root = document.getElementById("app") ?? document.body;

  mountIosHint(root, { ios: isIOS(), standalone: isStandalone(), dismissed: readDismissed() });

  const bar = mountUpdateBar(root);
  let registration: ServiceWorkerRegistration | undefined;
  let lastCheck = Date.now(); // 首屏刚读过 build.json，从现在起算 10 分钟

  const hasSW = typeof navigator !== "undefined" && Boolean(navigator.serviceWorker); // file:// / 旧浏览器 / 非安全上下文没有

  const updateSW = hasSW
    ? registerSW({
        immediate: true,
        onNeedRefresh() {
          bar.showUpdate(reload);
        },
        onOfflineReady() {
          bar.showOfflineReady();
          shell.refresh(); // 抽屉底部：SW 已接管 → 离线时显示「离线副本已保存」
        },
        onRegisteredSW(_url, reg) {
          registration = reg;
        },
        onRegisterError(err: unknown) {
          console.error("[pwa] service worker registration failed", err);
        },
      })
    : null;

  /** 点「点此刷新」：有等待中的 SW → skipWaiting，接管后 workbox-window 会 reload；否则直接 reload（网络上已是新页面）。
   *  兜底：2 秒内没被接管也强制 reload，不让用户点了没反应。 */
  function reload(): void {
    if (updateSW && registration?.waiting) {
      void updateSW(true);
      setTimeout(() => location.reload(), 2000);
    } else {
      location.reload();
    }
  }

  if (hasSW) {
    navigator.serviceWorker.addEventListener("controllerchange", () => shell.refresh());
  }

  /** build.json.commit 变了？（带时间戳参数：precache 只认原 URL，参数一变就走网络；no-store 再绕过 HTTP 缓存） */
  async function checkVersion(): Promise<void> {
    lastCheck = Date.now();
    if (!navigator.onLine) return;
    let baseline: string | undefined;
    try {
      baseline = (await loadBuild()).commit;
    } catch {
      return; // 首屏都没读到 build.json，没有可比较的基线
    }
    let fresh: { commit?: unknown } | null = null;
    try {
      const res = await fetch(`${dataUrl.build()}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      fresh = (await res.json()) as { commit?: unknown };
    } catch {
      return; // 离线 / 网络抖动：下次再查
    }
    if (typeof fresh?.commit === "string" && fresh.commit !== baseline) {
      bar.showUpdate(reload);
      void registration?.update().catch(() => undefined);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
    void checkVersion();
  });

  return { checkVersion };
}
