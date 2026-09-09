/**
 * /admin 师傅后台 —— 路由分发器（#20a；docs/specs/v03-admin-frontend-contract.md §2 / §3.6）。
 *
 * 本文件被 main.ts 静态 import，进首屏主 chunk，所以只做三件事：令牌、锁屏、分发。
 * 六屏一律 `await import("./admin/<screen>.js")` 动态加载；api/、kit、store 都不在这里 import。
 *
 * rest 形状（§2.2；planId / id 都是 `^[a-z][a-z0-9-]*$`，段内不会有 "/"）：
 *   ""                              工作台            → admin/home.ts     rest ""
 *   t/<token>[/<rest…>]             消费令牌，然后按剩下的 rest 分发（admin/token.ts）
 *   plan[/<planId>]                 排菜单            → admin/plan.ts     rest "<planId>" | ""
 *   plan[/<planId>]/import          粘贴导入          → admin/import.ts   rest "<planId>" | ""
 *   ingredient/new | ingredient/<id> 新食材 / 改食材  → admin/ingredient-new.ts  rest "new" | "<id>"
 *   dish/new | dish/<id>            加一道菜 / 改菜   → admin/dish-new.ts rest "new" | "<id>"
 *   publish                         发布              → admin/publish.ts  rest ""
 *   其它                            「没找到这一屏」+「回工作台」（不 location.replace 到 #/prep：rest 归页面解释）
 *
 * 无令牌：任何 #/admin/* 都只画锁屏，一个请求都不发（连屏的分包都不加载）。
 * 顶栏 <h1> 恒为 t("page.admin")（D-02），屏标题各屏自己画（kit.topBar）。
 */
import { consumeTokenFromRest, getToken, renderLockScreen } from "../admin/token";
import { h, replace } from "../dom";
import type { Lang } from "../i18n";
import { hrefOf } from "../router";
import type { PageCtx } from "../types";

/** 屏的 render 签名：与 PageCtx 相同，外加剥掉屏关键字之后的 rest（见文件头的表） */
export type ScreenRender = (el: HTMLElement, ctx: PageCtx, rest: string) => void | Promise<void>;
export type AdminScreen = "home" | "plan" | "import" | "ingredient-new" | "dish-new" | "publish";

/** `#/admin` 或 `#/admin/<seg>/<seg>…`：逐段 encodeURIComponent 后用 "/" 连接（照 prep.ts 的 prepHref；不走 hrefOf(page, rest)） */
export function adminHref(...segs: string[]): string {
  const rest = segs.filter(Boolean).map(encodeURIComponent).join("/");
  return rest ? `${hrefOf("admin")}/${rest}` : hrefOf("admin");
}

const T = {
  "adm.notFound": { uk: "Такого екрана немає", zh: "没找到这一屏", en: "No such screen" },
  "adm.back.home": { uk: "На головну", zh: "回工作台", en: "Back to dashboard" },
  "adm.loading": { uk: "Читаю…", zh: "正在读…", en: "Loading…" },
  "adm.err.load": { uk: "Не вдалося завантажити цей екран", zh: "这一屏没加载出来", en: "Couldn't load this screen" },
  "adm.retry": { uk: "Спробувати ще раз", zh: "重试", en: "Retry" },
} as const satisfies Record<string, Record<Lang, string>>;

function tt(lang: Lang, key: keyof typeof T): string {
  return T[key][lang];
}

const LOADERS: Record<AdminScreen, () => Promise<{ render: ScreenRender }>> = {
  home: () => import("./admin/home.js"),
  plan: () => import("./admin/plan.js"),
  import: () => import("./admin/import.js"),
  "ingredient-new": () => import("./admin/ingredient-new.js"),
  "dish-new": () => import("./admin/dish-new.js"),
  publish: () => import("./admin/publish.js"),
};

/** rest → 屏 + 交给屏的 rest；认不出 → null */
function resolve(rest: string): { screen: AdminScreen; rest: string } | null {
  const segs = rest.split("/").filter(Boolean);
  const [a, b, c] = segs;
  if (segs.length === 0) return { screen: "home", rest: "" };
  switch (a) {
    case "plan":
      if (segs.length === 1) return { screen: "plan", rest: "" };
      if (segs.length === 2) return b === "import" ? { screen: "import", rest: "" } : { screen: "plan", rest: b ?? "" };
      if (segs.length === 3 && c === "import" && b !== "import") return { screen: "import", rest: b ?? "" };
      return null;
    case "ingredient":
      return segs.length === 2 && b ? { screen: "ingredient-new", rest: b } : null;
    case "dish":
      return segs.length === 2 && b ? { screen: "dish-new", rest: b } : null;
    case "publish":
      return segs.length === 1 ? { screen: "publish", rest: "" } : null;
    default:
      return null;
  }
}

function notFound(el: HTMLElement, lang: Lang): void {
  el.append(
    h(
      "div",
      { class: "adm adm-notfound card", role: "status" },
      h("h2", {}, tt(lang, "adm.notFound")),
      h("p", {}, h("a", { class: "chip solid", href: adminHref() }, tt(lang, "adm.back.home"))),
    ),
  );
}

export async function render(el: HTMLElement, ctx: PageCtx): Promise<void> {
  const rest = consumeTokenFromRest(ctx.rest);
  if (getToken() === null) {
    renderLockScreen(el, ctx.lang);
    return;
  }
  const target = resolve(rest);
  if (!target) {
    notFound(el, ctx.lang);
    return;
  }
  const loading = h("p", { class: "muted adm-loading" }, tt(ctx.lang, "adm.loading"));
  el.append(loading);
  let mod: { render: ScreenRender };
  try {
    mod = await LOADERS[target.screen]();
  } catch (err) {
    console.error(err);
    if (!el.isConnected) return;
    const retry = h("button", { type: "button", class: "chip solid" }, tt(ctx.lang, "adm.retry"));
    retry.addEventListener("click", () => {
      replace(el);
      void render(el, ctx);
    });
    replace(el, h("div", { class: "adm adm-notfound card", role: "alert" }, h("p", {}, tt(ctx.lang, "adm.err.load")), h("p", {}, retry)));
    return;
  }
  if (!el.isConnected) return; // 路由 / 语言已经变了：旧 el 已摘掉，不用再画
  loading.remove();
  await mod.render(el, ctx, target.rest);
}
