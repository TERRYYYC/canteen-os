/**
 * /menu 菜单 —— 占位（#11 实现日期条、餐次 chip、菜品行、底部详情抽屉）。
 * 契约见 src/types.ts。本 PR 只证明数据层通了：标题 + 「数据已加载 N 天」。
 */
import { h } from "../dom";
import type { PageCtx } from "../types";

export async function render(el: HTMLElement, ctx: PageCtx): Promise<void> {
  const status = h("p", { class: "muted" }, ctx.t("data.loading"));
  el.append(h("div", { class: "card placeholder" }, h("h2", {}, ctx.t("drawer.menu")), status));
  if (!ctx.planId) {
    status.textContent = ctx.t("data.notReady");
    return;
  }
  try {
    const sheet = await ctx.data.loadMenu(ctx.planId);
    status.textContent = `${ctx.t("data.days", { n: sheet.days.length })} · ${ctx.t("data.plan")} ${ctx.planId}`;
  } catch {
    status.textContent = ctx.t("data.notReady");
  }
}
