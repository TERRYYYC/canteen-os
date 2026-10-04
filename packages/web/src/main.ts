/**
 * 入口：挂应用壳 → 同版资料/共享计划选择 → hash 路由分发到 pages/<route>.ts。
 * 语言切换 = 重画壳层 + 重新 render 当前页；主题在壳层内切换（theme.ts）。
 * PWA（SW 注册、「有新版本」提示条、iOS 提示）在 pwa.ts，这里只调 initPwa(shell)。
 * 页面契约见 src/types.ts。
 */
import "./tokens.css";
import "./styles.css";

import { dataApi, PublishedDataError, type Publication } from "./data";
import { getLang, onLangChange, t } from "./i18n";
import { initPwa } from "./pwa";
import { normalize, onRoute, type Route } from "./router";
import { mountShell } from "./shell";
import { applyTheme } from "./theme";
import type { PageCtx, PageRender } from "./types";
import { createPageReloadCoverage } from './view-models/reload-safety';
import { consumeTokenFromRest, getAuthSessionVersion, peekAuthSessionVersion,onAuthSessionChange } from './admin/token';
import {createPlanSelection,routePlanId,planHref} from './plan-selection';

// Native module caching retains each renderer's editor/auxiliary state across visits.
const PAGES: Record<Route, () => Promise<{ render: PageRender }>> = {
  prep: () => import('./pages/prep'),
  purchase: () => import('./pages/purchase'),
  menu: () => import('./pages/menu'),
  admin: () => import('./pages/admin'),
  qr: () => import('./pages/qr'),
};
/** 顶栏标题键 */
const TITLE = { prep: "page.prep", purchase: "page.purchase", menu: "page.menu", admin: "page.admin", qr: "page.qr" } as const;

function boot(): void {
  applyTheme();
  const root = document.getElementById("app");
  if (!root) throw new Error("#app not found");
  const shell = mountShell(root);
  const selection=createPlanSelection(typeof sessionStorage==='undefined'?null:sessionStorage);
  let selectionAuth=getAuthSessionVersion();
  initPwa(shell, { refreshPublication: () => refreshPublication(true) });

  let publication: Publication | null = null;
  let publicationError: PublishedDataError | null = null;
  let publicationRequest = 0;
  const reloadCoverage = createPageReloadCoverage();
  let ready = false; // build.json 读完（成功或失败）之前不画页面，只画「加载中…」
  let current: { route: Route; rest: string } | null = null;
  let renderGeneration = 0;
  let pageStarted = false;
  function updateSelection():void {
    const auth=getAuthSessionVersion();
    if(auth!==selectionAuth){selectionAuth=auth;selection.clearPrivateNames();}
    shell.setPlanSelection?.(selection.snapshot(),id=>{
      selection.select(id);
      updateSelection();
      if(!current)return;
      const {route,rest}=current;
      const target=route==='admin'&&rest.startsWith('plan')?`plan/${id}`:route==='menu'||route==='prep'?'':route==='purchase'&&(!rest||rest.startsWith('new'))?`new/${id}`:rest;
      location.hash=planHref(route,target,id);
    });
  }

  function renderPage(): void {
    if (!current) return;
    const generation = ++renderGeneration;
    pageStarted = false;
    const { route, rest } = current;
    const auth = getAuthSessionVersion(), lang = getLang(), source = publication, failure = publicationError;
    const planId=selection.id;
    updateSelection();
    shell.setActive(route, rest);
    shell.setTitle(t(route === "menu" && publication?.kind === "team-meals" ? "page.teamMenu" : TITLE[route]));
    const el = shell.newOutlet();
    const loading = document.createElement("p");
    loading.className = "muted";
    loading.textContent = t("data.loading");
    el.append(loading);
    // No renderer has started: do not create coverage or retire an earlier unresolved page.
    if (!ready) return;
    function isCurrent(): boolean {
      if (generation !== renderGeneration || !el.isConnected) return false;
      if(planId!==selection.id)return false;
      if (peekAuthSessionVersion() !== auth || getLang() !== lang || publication !== source || publicationError !== failure) {
        renderPage();
        return false;
      }
      return true;
    }
    async function loadPage(): Promise<void> {
      try {
        const { render } = await PAGES[route]();
        if (!isCurrent()) return;
        loading.remove();
        pageStarted = true;
        const ctx: PageCtx = { lang, planId,planSelection:{...selection.snapshot(),select(id,name){
            // A background publication refresh cannot invalidate an active editor.
            if(generation!==renderGeneration||!el.isConnected||peekAuthSessionVersion()!==auth||getLang()!==lang||selection.id!==planId)return;
            selection.select(id,name);updateSelection();
            // Keep legacy page rest and never preserve a credential route in a copyable link.
            if(current)history.replaceState(history.state,'',selection.href(current.route,current.rest));
          }}, route, rest, data: dataApi, t, publication: source, publicationError: failure,
          setReloadCoverage: reloadCoverage.beginRender(route, rest),
        };
        ctx.planSelection!.selectSlot=(date,mealType)=>{
          if(generation!==renderGeneration||!el.isConnected||peekAuthSessionVersion()!==auth||getLang()!==lang||selection.id!==planId)return;
          selection.selectSlot(date,mealType);updateSelection();
          if(current&&(route==='menu'||route==='prep'))history.replaceState(history.state,'',selection.href(route,current.rest));
        };
        await render(el, ctx);
      } catch (err: unknown) {
        console.error(err);
        if (generation !== renderGeneration || !el.isConnected) return;
        // Once started, the page owns coverage; a renderer failure cannot acknowledge it.
        if (!pageStarted && !isCurrent()) return;
        loading.remove();
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = t("data.notReady");
        el.append(p);
      }
    }
    void loadPage();
  }

  onAuthSessionChange(()=>{selection.clearPrivateNames();selectionAuth=getAuthSessionVersion();updateSelection();});

  normalize();
  onRoute((route, rest,linkedPlan,linkedMeal) => {
    // Never retain a credential-bearing route in page identity, PageCtx, or language redraw state.
    current = { route, rest: route === 'admin' ? consumeTokenFromRest(rest) : rest };
    const chosen=routePlanId(route,current.rest)??linkedPlan;
    if(chosen)selection.select(chosen);
    if(linkedMeal&&(route==='menu'||route==='prep'))selection.selectSlot(current.rest.split('/')[0]??'',linkedMeal);
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
    await selection.resolve(next,dataApi);
    if(request!==publicationRequest)return;
    publication = next;
    publicationError = failure;
    ready = true;
    shell.setBuild(next?.manifest ?? null, next?.kind);
    updateSelection();
    // Reader updates must not replace an active editor DOM or its pending operations.
    if (initial || !pageStarted || (current?.route !== 'admin' && current?.route !== 'purchase')) renderPage();
  }
  void refreshPublication();
}

boot();
