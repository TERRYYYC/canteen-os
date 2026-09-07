/**
 * /admin 师傅后台 —— v0.3 占位（execution-brief §3 v0.3；设计稿 docs/design/backoffice-v1.html）。
 * 本版只显示 "3-й етап / v0.3"，不做任何写入（§1.4 无后端）。
 */
import { h } from "../dom";
import type { PageCtx } from "../types";

export function render(el: HTMLElement, ctx: PageCtx): void {
  el.append(
    h("div", { class: "card placeholder" }, h("h2", {}, ctx.t("page.admin")), h("p", { class: "muted" }, ctx.t("admin.placeholder"))),
  );
}
