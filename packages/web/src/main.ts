/**
 * 入口：挂应用壳 → 读 build.json（planId = plans[0]）→ hash 路由分发到 pages/<route>.ts。
 * 语言切换 = 重画壳层 + 重新 render 当前页；主题在壳层内切换（theme.ts）。
 * 页面契约见 src/types.ts。
 */
import "./tokens.css";
import "./styles.css";

import type { BuildManifest } from "@canteenos/core";
import { dataApi } from "./data";
import { getLang, onLangChange, t } from "./i18n";
import { render as admin } from "./pages/admin";
import { render as menu } from "./pages/menu";
import { render as prep } from "./pages/prep";
import { render as purchase } from "./pages/purchase";
import { normalize, onRoute, type Route } from "./router";
import { mountShell } from "./shell";
import { applyTheme } from "./theme";
import type { PageCtx, PageRender } from "./types";

const PAGES: Record<Route, PageRender> = { prep, purchase, menu, admin };
/** 顶栏标题键 */
const TITLE = { prep: "page.prep", purchase: "page.purchase", menu: "page.menu", admin: "page.admin" } as const;

function boot(): void {
  applyTheme();
  const root = document.getElementById("app");
  if (!root) throw new Error("#app not found");
  const shell = mountShell(root);

  let build: BuildManifest | null = null;
  let planId: string | null = null;
  let ready = false; // build.json 读完（成功或失败）之前不画页面，只画「加载中…」
  let current: { route: Route; rest: string } | null = null;

  function renderPage(): void {
    if (!current) return;
    const { route, rest } = current;
    shell.setActive(route);
    shell.setTitle(t(TITLE[route]));
    if (!ready) {
      const el = shell.newOutlet();
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = t("data.loading");
      el.append(p);
      return;
    }
    const ctx: PageCtx = { lang: getLang(), planId, route, rest, data: dataApi, t };
    const el = shell.newOutlet();
    void Promise.resolve(PAGES[route](el, ctx)).catch((err: unknown) => {
      console.error(err);
      if (el.isConnected) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = t("data.notReady");
        el.append(p);
      }
    });
  }

  normalize();
  onRoute((route, rest) => {
    current = { route, rest };
    renderPage();
  });
  onLangChange(() => {
    shell.refresh();
    renderPage();
  });

  void dataApi
    .loadBuild()
    .then((b) => {
      build = b;
      planId = b.plans[0] ?? null;
    })
    .catch((err: unknown) => {
      console.error(err);
      build = null;
      planId = null;
    })
    .finally(() => {
      ready = true;
      shell.setBuild(build);
      renderPage(); // build.json 到了（或失败了）再画：planId 现在才知道
    });
}

boot();
