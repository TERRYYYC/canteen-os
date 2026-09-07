/**
 * /purchase 采购单 —— 占位（#10 实现按 supplier 分组、trace 展开、复制微信文本、周切换）。
 * 契约见 src/types.ts。本 PR 只证明数据层通了：标题 + 「N 张供应商单」。
 */
import { h } from "../dom";
import type { PageCtx } from "../types";

export async function render(el: HTMLElement, ctx: PageCtx): Promise<void> {
  const status = h("p", { class: "muted" }, ctx.t("data.loading"));
  el.append(h("div", { class: "card placeholder" }, h("h2", {}, ctx.t("drawer.purchase")), status));
  if (!ctx.planId) {
    status.textContent = ctx.t("data.notReady");
    return;
  }
  try {
    const sheet = await ctx.data.loadPurchase(ctx.planId);
    status.textContent = `${ctx.t("data.orders", { n: sheet.orders.length })} · ${ctx.t("data.plan")} ${ctx.planId}`;
  } catch {
    status.textContent = ctx.t("data.notReady");
  }
}
