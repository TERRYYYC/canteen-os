/**
 * /admin/plan[/<planId>]/import —— 空壳（#22 填内容；docs/specs/v03-admin-frontend-contract.md §4）。
 * #20a 只画标题 + 「本屏由 #22 实现」。
 *   - 签名 render(el, ctx, rest)：rest 是 pages/admin.ts 剥掉屏关键字后的那段（见其文件头的表）；
 *   - 本屏样式放同目录 import.css（本文件顶部 import），每条选择器以 .adm-import 开头（§3.4）；
 *   - 文案放本文件的私有字典，前缀 `import.`，三语齐全（§5.2 / §5.4）；共用文案用 admin/kit.ts 的 adm()；
 *   - 未提交的表单值存模块级变量，render 时回填（推论 A：切语言 = 重新 render）。
 */
import { h } from "../../dom";
import type { Lang } from "../../i18n";
import type { PageCtx } from "../../types";
import { topBar } from "../../admin/kit";
import { adminHref } from "../admin";

const T = {
  "import.title": { uk: "Вставити список", zh: "粘贴导入", en: "Paste to import" },
  "import.todo": { uk: "Цей екран реалізує #22", zh: "本屏由 #22 实现", en: "This screen is implemented in #22" },
} as const satisfies Record<string, Record<Lang, string>>;

export function render(el: HTMLElement, ctx: PageCtx, rest: string): void {
  const lang = ctx.lang;
  void rest; // #22：从这里读子状态
  el.append(
    h("div", { class: "adm adm-import" }, topBar({ back: adminHref(), title: T["import.title"][lang] }), h("p", { class: "muted" }, T["import.todo"][lang])),
  );
}
