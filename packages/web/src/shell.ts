/**
 * 应用壳：左上角目录角标 + 抽屉、顶栏标题、右上角语言下拉、主内容容器（outlet）。
 * 结构与文案照 docs/design/screens-v2.html「抽屉打开态」那一屏：
 *   抽屉 = 品牌行 + 备料 / 采购 / 菜单 三项 + 菜单计划占位（标 "2-й етап"）+ 主题三态 + 底部（builtAt + 在线/离线副本/离线）。
 * 可访问性：角标 aria-label / aria-expanded / aria-controls；抽屉 role="dialog" aria-modal，Esc 关闭、Tab 圈在抽屉内、
 * 关闭后焦点回到角标；打开时主内容 inert；语言下拉是原生 <select>。
 */
import type { BuildManifest } from "@canteenos/core";
import { h, replace } from "./dom";
import { LANGS, LANG_CHIP, LANG_NAME, LANG_TAG, getLang, setLang, t, type Lang } from "./i18n";
import { hrefOf, type Route } from "./router";
import { THEMES, getTheme, setTheme } from "./theme";

export interface Shell {
  /** 换一个全新的空 outlet 挂到主区域（旧的摘掉），返回给页面 render 用 */
  newOutlet(): HTMLElement;
  setTitle(text: string): void;
  setActive(route: Route): void;
  /** build.json 读到后喂进来（null = 读失败，底部显示「未知」） */
  setBuild(build: BuildManifest | null): void;
  /** 语言变了 / SW 接管了本页（src/pwa.ts）：重画壳层全部文案与抽屉底部状态 */
  refresh(): void;
  openDrawer(): void;
  closeDrawer(): void;
  isDrawerOpen(): boolean;
}

/** 抽屉条目：设计稿里的方格字 + 文案键 */
const NAV: ReadonlyArray<{ route: Route; icon: string; l1: "drawer.prep" | "drawer.purchase" | "drawer.menu"; l2: "drawer.prep.role" | "drawer.purchase.role" | "drawer.menu.role" }> = [
  { route: "prep", icon: "П", l1: "drawer.prep", l2: "drawer.prep.role" },
  { route: "purchase", icon: "采", l1: "drawer.purchase", l2: "drawer.purchase.role" },
  { route: "menu", icon: "М", l1: "drawer.menu", l2: "drawer.menu.role" },
];

const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function cornerGlyph(): HTMLElement[] {
  return [h("i"), h("i"), h("i"), h("i")];
}

export function formatBuiltAt(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return t("foot.updated.unknown");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(LANG_TAG[lang], { dateStyle: "medium", timeStyle: "short" }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/** 抽屉底部的网络状态：navigator.onLine + 本页是否已由 service worker 接管（#12） */
export type NetState = "online" | "cached" | "offline";
export function netState(): NetState {
  if (navigator.onLine) return "online";
  const sw = navigator.serviceWorker;
  return sw && sw.controller ? "cached" : "offline";
}

export function mountShell(root: HTMLElement): Shell {
  let active: Route = "prep";
  let build: BuildManifest | null = null;
  let open = false;

  // ---- 顶栏 ----
  const corner = h("button", { class: "corner", type: "button", "aria-expanded": "false", "aria-controls": "drawer" }, ...cornerGlyph());
  const title = h("h1", { class: "t" });
  const select = h("select", { id: "lang" });
  const langLabel = h("span", { class: "sr-only" });
  const dd = h("label", { class: "dd", for: "lang" }, langLabel, select);
  const appbar = h("header", { class: "appbar" }, corner, title, dd);

  // ---- 主内容 ----
  const main = h("main", { id: "main" });

  // ---- 抽屉 ----
  const scrim = h("div", { class: "scrim", hidden: true });
  const drawer = h("div", { id: "drawer", class: "drawer", role: "dialog", "aria-modal": "true", hidden: true });

  root.replaceChildren(appbar, main, scrim, drawer);

  // ---- 语言下拉 ----
  for (const l of LANGS) select.append(h("option", { value: l, title: LANG_NAME[l] }, LANG_CHIP[l]));
  select.addEventListener("change", () => {
    const v = select.value;
    if ((LANGS as readonly string[]).includes(v)) setLang(v as Lang);
  });

  // ---- 抽屉内容 ----
  function renderDrawer(): void {
    const lang = getLang();
    const items: HTMLElement[] = NAV.map(({ route, icon, l1, l2 }) =>
      h(
        "a",
        { class: "di", href: hrefOf(route), "aria-current": route === active ? "page" : null },
        h("span", { class: "ic", "aria-hidden": "true" }, icon),
        h("span", { class: "tx" }, h("span", { class: "l1" }, t(l1)), h("span", { class: "l2" }, t(l2))),
      ),
    );
    const soon = h(
      "div",
      { class: "di soon", "aria-disabled": "true" },
      h("span", { class: "ic", "aria-hidden": "true" }, "计"),
      h("span", { class: "tx" }, h("span", { class: "l1" }, t("drawer.plan")), h("span", { class: "l2" }, t("drawer.plan.role"))),
      h("span", { class: "later" }, t("drawer.plan.later")),
    );

    const themeLabel = h("span", { class: "label", id: "theme-label" }, t("theme.label"));
    const toggle = h("div", { class: "toggle", role: "group", "aria-labelledby": "theme-label" });
    const cur = getTheme();
    for (const th of THEMES) {
      const b = h("button", { type: "button", "aria-pressed": th === cur ? "true" : "false", "data-theme-value": th }, t(`theme.${th}`));
      b.addEventListener("click", () => {
        setTheme(th);
        for (const x of toggle.querySelectorAll<HTMLButtonElement>("button")) {
          x.setAttribute("aria-pressed", x.dataset["themeValue"] === th ? "true" : "false");
        }
      });
      toggle.append(b);
    }

    // 三态（#12）：在线 / 离线但 SW 已接管本页（离线副本可用）/ 离线且没有 SW（第一次打开就断网）
    const state = netState();
    const foot = h(
      "div",
      { class: "foot" },
      h("span", {}, `${t("foot.updated")} `, h("b", {}, formatBuiltAt(build?.builtAt, lang))),
      h(
        "span",
        { class: state === "online" ? "online" : state === "cached" ? "offline cached" : "offline" },
        h("b", {}, state === "online" ? t("foot.online") : state === "cached" ? t("foot.offlineCached") : t("foot.offline")),
      ),
    );

    drawer.setAttribute("aria-label", t("drawer.title"));
    replace(
      drawer,
      h(
        "div",
        { class: "brand" },
        h("span", { class: "corner", "aria-hidden": "true" }, ...cornerGlyph()),
        h("div", {}, h("div", { class: "n" }, t("app.name")), h("div", { class: "s" }, t("app.tagline"))),
      ),
      h("nav", { "aria-label": t("drawer.title") }, ...items, soon),
      h("div", { class: "theme" }, themeLabel, toggle),
      foot,
    );
  }

  function renderChrome(): void {
    const lang = getLang();
    document.documentElement.lang = LANG_TAG[lang];
    select.value = lang;
    langLabel.textContent = t("lang.label");
    corner.setAttribute("aria-label", open ? t("drawer.close") : t("drawer.open"));
    renderDrawer();
  }

  // ---- 打开 / 关闭 ----
  function openDrawer(): void {
    if (open) return;
    open = true;
    renderDrawer(); // 刷新在线状态与高亮
    scrim.hidden = false;
    drawer.hidden = false;
    main.setAttribute("inert", "");
    corner.setAttribute("aria-expanded", "true");
    corner.setAttribute("aria-label", t("drawer.close"));
    corner.classList.add("open");
    const first = drawer.querySelector<HTMLElement>('a[aria-current="page"]') ?? drawer.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }
  function closeDrawer(restoreFocus = true): void {
    if (!open) return;
    open = false;
    scrim.hidden = true;
    drawer.hidden = true;
    main.removeAttribute("inert");
    corner.setAttribute("aria-expanded", "false");
    corner.setAttribute("aria-label", t("drawer.open"));
    corner.classList.remove("open");
    if (restoreFocus) corner.focus();
  }

  corner.addEventListener("click", () => (open ? closeDrawer() : openDrawer()));
  scrim.addEventListener("click", () => closeDrawer());
  drawer.addEventListener("click", (e) => {
    // 点条目：不拦默认跳转（hash 变化由 router 处理），只收起抽屉；焦点回角标，键盘用户不会掉到 body
    if ((e.target as HTMLElement).closest("a.di")) closeDrawer();
  });
  drawer.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeDrawer();
      return;
    }
    if (e.key === "Tab") {
      const els = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => !x.hasAttribute("aria-disabled"));
      if (els.length === 0) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  window.addEventListener("online", () => open && renderDrawer());
  window.addEventListener("offline", () => open && renderDrawer());

  renderChrome();

  return {
    newOutlet() {
      const el = h("section", { class: "outlet" });
      main.replaceChildren(el);
      return el;
    },
    setTitle(text) {
      title.textContent = text;
      document.title = text ? `${text} · ${t("app.name")}` : t("app.name");
    },
    setActive(route) {
      active = route;
      for (const a of drawer.querySelectorAll<HTMLAnchorElement>("a.di")) {
        const isActive = a.getAttribute("href") === hrefOf(route);
        if (isActive) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }
    },
    setBuild(b) {
      build = b;
      renderDrawer();
    },
    refresh: renderChrome,
    openDrawer,
    closeDrawer: () => closeDrawer(),
    isDrawerOpen: () => open,
  };
}
