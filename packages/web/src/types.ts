/**
 * 页面契约（给 #9 /prep、#10 /purchase、#11 /menu、v0.3 /admin 看）。
 *
 * 每个页面是 src/pages/<route>.ts，只导出一个函数：
 *
 *   export function render(el: HTMLElement, ctx: PageCtx): void | Promise<void>
 *
 * 约定：
 *   - el 是本次渲染专属的空容器（<section class="outlet">），已经挂在 DOM 上；页面往里 append 即可，不用清空。
 *     路由或语言一变，壳层会换一个新 el 再调 render；旧 el 已从 DOM 摘掉，
 *     所以晚到的异步渲染写进旧 el 是无害的（不需要自己做取消）。
 *   - 语言切换 = 重新 render（ctx.lang 变了）；页面不要自己缓存翻译结果。
 *   - 内容文本用 pick(i18nString, ctx.lang)（src/i18n.ts）；UI 文案用 ctx.t(key)——
 *     页面专属文案自己在 pages/<x>.ts 里建小字典即可，不必都塞进 i18n.ts。
 *   - 数据只从 ctx.data 拿（有内存缓存）；失败抛 DataError，页面显示 ctx.t("data.notReady")。
 *   - 文本一律 textContent（src/dom.ts 的 h()），三张单 JSON 不进 innerHTML。
 *   - 页面私有样式：pages/<x>.css，在 pages/<x>.ts 顶部 import；共用样式（.card .chip …）在 styles.css。
 *   - 子状态（如 B 版详情）用 hash 的第二段：#/prep/<rest>，见 src/router.ts；页面从 ctx.rest 读。
 */
import type { DataApi } from "./data";
import type { Lang, TParams, UiKey } from "./i18n";
import type { Route } from "./router";

export interface PageCtx {
  /** 当前语言（内容 + UI） */
  lang: Lang;
  /**
   * 当前菜单计划 id（= build.json.plans[0]；第一轮只有 week-41）。
   * build.json 读不到 / plans 为空时为 null——页面显示「数据未就绪」。
   */
  planId: string | null;
  /** 当前路由与 hash 第二段（#/prep/<rest> 的 rest，无则 ""） */
  route: Route;
  rest: string;
  /** 数据层（src/data.ts 的 dataApi） */
  data: DataApi;
  /** UI 文案（当前语言） */
  t: (key: UiKey, params?: TParams) => string;
}

export type PageRender = (el: HTMLElement, ctx: PageCtx) => void | Promise<void>;
