/**
 * Prompt-only PWA updates. A controller change refreshes publication data without
 * replacing editor views; application reloads require a fresh all-owner safety check.
 * The installed plugin's onNeedReload hook owns the final synchronous check.
 * A two-second timeout cancels update consent and offers a retry, never a forced reload.
 */
/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from "virtual:pwa-register";
import { dataApi, publicationKey } from "./data";
import { h } from "./dom";
import { onLangChange, t } from "./i18n";
import type { Shell } from "./shell";
import { createReloadCoordinator, inspectReloadSafety, type ReloadDecision } from './view-models/reload-safety';

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

export function initPwa(shell: Shell, hooks: { refreshPublication(): Promise<void> } = { refreshPublication: async () => {} }): PwaHandle {
  const root = document.getElementById("app") ?? document.body;

  mountIosHint(root, { ios: isIOS(), standalone: isStandalone(), dismissed: readDismissed() });

  const bar = mountUpdateBar(root);
  let registration: ServiceWorkerRegistration | undefined;
  let lastCheck = Date.now(); // 首屏刚读过 build.json，从现在起算 10 分钟

  const hasSW = typeof navigator !== "undefined" && Boolean(navigator.serviceWorker); // file:// / 旧浏览器 / 非安全上下文没有
  let updateTimer: ReturnType<typeof setTimeout> | undefined;
  let approvedReload = false;
  let dialog: HTMLDialogElement | null = null;
  let lastController = hasSW ? navigator.serviceWorker.controller : null;
  const coordinator = createReloadCoordinator({
    reload() { approvedReload = true; location.reload(); },
    hasWaiting: () => !!registration?.waiting,
    async activate() {
      if (!updateSW || !registration?.waiting) throw new Error('No waiting worker');
      // This plugin ignores updateSW(false); onNeedReload is the final reload gate.
      await updateSW();
    },
  });

  function closeDecision(): void { dialog?.remove(); dialog = null; }
  function showDecision(result: ReloadDecision, timedOut = false): void {
    closeDecision();
    if (result.status === 'started') {
      clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        coordinator.timeout();
        showDecision({ status: 'blocked', snapshot: inspectReloadSafety() }, true);
      }, 2000);
      return;
    }
    const reason = result.snapshot.reason;
    const previousSession = result.snapshot.records.some(r => r.phase === 'unknown' && r.id.startsWith('previous-session-'));
    const key = timedOut ? 'update.timeout' : result.status === 'confirm-discard' ? 'update.dirty' :
      reason === 'saving' ? 'update.saving' : reason === 'unknown' ? previousSession ? 'update.previousSession' : 'update.unknown' : reason === 'untracked' ? 'update.untracked' : 'update.changed';
    const keep = h('button', { type: 'button', autofocus: true }, t('update.continue'));
    const list = h('ul');
    const identities = new Set(result.snapshot.records.filter(r => r.dirty || r.pending || r.recovering || ['unknown', 'outcome-unknown', 'busy', 'untracked'].includes(r.phase)).map(r => `${r.kind}: ${r.id}`));
    for (const identity of identities) list.append(h('li', {}, identity));
    const currentDialog = h('dialog', { 'aria-label': t('update.checkTitle') }, h('h2', {}, t('update.checkTitle')), h('p', {}, t(key)), list, keep);
    keep.addEventListener('click', () => { coordinator.cancel(); closeDecision(); });
    currentDialog.addEventListener('cancel', () => { coordinator.cancel(); closeDecision(); });
    if (result.status === 'confirm-discard') {
      const discard = h('button', { type: 'button' }, t('update.discard'));
      discard.addEventListener('click', () => { discard.disabled = true; void coordinator.confirmDiscard(result.snapshot).then(showDecision); });
      currentDialog.append(discard);
    }
    dialog = currentDialog;
    root.append(currentDialog);
    currentDialog.showModal();
  }
  function requestUpdate(): void {
    clearTimeout(updateTimer);
    void coordinator.requestUpdate().then(showDecision);
  }
  onLangChange(() => { coordinator.cancel(); closeDecision(); });

  const updateSW = hasSW
    ? registerSW({
        immediate: true,
        onNeedRefresh() {
          bar.showUpdate(requestUpdate);
        },
        onNeedReload() {
          clearTimeout(updateTimer);
          if (!coordinator.onNeedReload()) bar.showUpdate(requestUpdate);
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

  if (hasSW) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      shell.refresh();
      const controller = navigator.serviceWorker.controller;
      if (controller === lastController) return;
      lastController = controller;
      void hooks.refreshPublication();
    });
  }
  window.addEventListener('beforeunload', event => {
    if (!approvedReload && inspectReloadSafety().reason !== 'clear') { event.preventDefault(); event.returnValue = ''; }
  });

  /** Probe the complete validated publication identity; probing never adopts it. */
  async function checkVersion(): Promise<void> {
    lastCheck = Date.now();
    if (!navigator.onLine) return;
    let baseline: string;
    try {
      baseline = publicationKey(await dataApi.loadPublication());
    } catch {
      return; // 首屏都没读到 build.json，没有可比较的基线
    }
    let fresh: string;
    try {
      fresh = publicationKey(await dataApi.probePublication());
    } catch {
      return; // 离线 / 网络抖动：下次再查
    }
    if (fresh !== baseline) {
      bar.showUpdate(requestUpdate);
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
