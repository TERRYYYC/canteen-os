/**
 * 入口：挂应用壳 → 读 build.json（planId = plans[0]）→ hash 路由分发到 pages/<route>.ts。
 * 语言切换 = 重画壳层 + 重新 render 当前页；主题在壳层内切换（theme.ts）。
 * PWA（SW 注册、「有新版本」提示条、iOS 提示）在 pwa.ts，这里只调 initPwa(shell)。
 * 页面契约见 src/types.ts。
 */
import "./tokens.css";
import "./styles.css";

import { dataApi, PublishedDataError, type Publication } from "./data";
import { getLang, onLangChange, t } from "./i18n";
import { render as admin } from "./pages/admin";
import { render as menu } from "./pages/menu";
import { render as prep } from "./pages/prep";
import { render as purchase } from "./pages/purchase";
import { render as qr } from "./pages/qr";
import { initPwa } from "./pwa";
import { normalize, onRoute, type Route } from "./router";
import { mountShell } from "./shell";
import { applyTheme } from "./theme";
import type { PageCtx, PageRender } from "./types";
import { createPageReloadCoverage } from './view-models/reload-safety';
import { consumeTokenFromRest } from './admin/token';

const PAGES: Record<Route, PageRender> = { prep, purchase, menu, admin, qr };
/** 顶栏标题键 */
const TITLE = { prep: "page.prep", purchase: "page.purchase", menu: "page.menu", admin: "page.admin", qr: "page.qr" } as const;

function boot(): void {
  applyTheme();
  const root = document.getElementById("app");
  if (!root) throw new Error("#app not found");
  const shell = mountShell(root);
  initPwa(shell, { refreshPublication: () => refreshPublication(true) });

  let publication: Publication | null = null;
  let publicationError: PublishedDataError | null = null;
  let publicationRequest = 0;
  const reloadCoverage = createPageReloadCoverage();
  let planId: string | null = null;
  let ready = false; // build.json 读完（成功或失败）之前不画页面，只画「加载中…」
  let current: { route: Route; rest: string } | null = null;

  function renderPage(): void {
    if (!current) return;
    const { route, rest } = current;
    const setReloadCoverage = reloadCoverage.beginRender(route, rest);
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
    const ctx: PageCtx = { lang: getLang(), planId, route, rest, data: dataApi, t, publication, publicationError,
      setReloadCoverage,
    };
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
    // Never retain a credential-bearing route in page identity, PageCtx, or language redraw state.
    current = { route, rest: route === 'admin' ? consumeTokenFromRest(rest) : rest };
    renderPage();
  });
  onLangChange(() => {
    shell.refresh();
    renderPage();
  });

  async function refreshPublication(fresh = false): Promise<void> {
    const request = ++publicationRequest;
    let next: Publication | null = null;
    let failure: PublishedDataError | null = null;
    try { next = await dataApi.loadPublication({ fresh }); }
    catch (error) { failure = error instanceof PublishedDataError ? error : new PublishedDataError('unavailable', 'manifest', '', null); }
    if (request !== publicationRequest) return;
    const initial = !ready;
    publication = next;
    publicationError = failure;
    planId = next?.manifest.plans[0] ?? null;
    ready = true;
    shell.setBuild(next?.manifest ?? null);
    // Reader updates must not replace an active editor DOM or its pending operations.
    if (initial || (current?.route !== 'admin' && current?.route !== 'purchase')) renderPage();
  }
  void refreshPublication();
}

boot();
