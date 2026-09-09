/**
 * /admin 工作台（#20b 填内容；docs/specs/v03-admin-frontend-contract.md §4.1）。
 * #20a 只留空壳：标题 + 「本屏由 #20b 实现」。
 *   - 签名 render(el, ctx, rest)：rest 是 pages/admin.ts 剥掉屏关键字后的那段（工作台恒为 ""）；
 *   - 样式放同目录 home.css，每条选择器以 .adm-home 开头（§3.4）；
 *   - 文案放本文件的私有字典，前缀 `home.`，三语齐全（§5.4 已给最小集）；共用文案用 admin/kit.ts 的 adm()。
 */
import "./home.css";

import { h } from "../../dom";
import type { Lang } from "../../i18n";
import type { PageCtx } from "../../types";
import { topBar } from "../../admin/kit";

const T = {
  "home.title": { uk: "Кабінет шефа", zh: "师傅后台", en: "Back office" },
  "home.todo": { uk: "Цей екран реалізує #20b", zh: "本屏由 #20b 实现", en: "This screen is implemented in #20b" },
} as const satisfies Record<string, Record<Lang, string>>;

export function render(el: HTMLElement, ctx: PageCtx, rest: string): void {
  const lang = ctx.lang;
  void rest;
  el.append(h("div", { class: "adm adm-home" }, topBar({ title: T["home.title"][lang] }), h("p", { class: "muted" }, T["home.todo"][lang])));
}
