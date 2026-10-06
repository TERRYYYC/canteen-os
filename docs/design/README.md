---
feature_ids: [team-meals, knowledge-base]
topics: [canteen-os, design, reference-v3, favorites-inbox]
doc_kind: design-index
created: 2026-10-01
updated: 2026-10-07
---

# 当前设计入口与历史稿

当前小团队目标和页面范围见 [当前工作合同](../current-contract.md) 与 [D0 合同](team-meals-pages/D0-contract.md)。Reference v3 是本轮排菜、菜单、备料和采购页面的布局与结构目标；2026-10-07 起配色改为 CanteenOS 设计系统的搪瓷蓝（Enamel blue）浅色单一配色，取代原绿色主色，不再提供深色模式。旧 v2/backoffice 的历史“定稿”不覆盖后续方向。视觉对照通过和真实业务往返验收分别记录，不能只换颜色或以组件测试代替页面验收。

| 来源/文件 | 应用范围 | 状态与边界 |
|---|---|---|
| CanteenOS 设计系统 · 搪瓷蓝（2026-10-07 起） | 全站配色：只有浅色一套，token 以 `packages/web/src/tokens.css` 为准；深色模式和主题切换已移除 | 只替换配色，布局、结构和页面范围仍按下行 Reference v3 与 D0；青花纹样色 `--qinghua` 已登记，页面尚未使用 |
| [Reference v3 固定来源](https://github.com/TERRYYYC/canteen-os/tree/2f890d8f182d02e8ed4acb55a865e8aa086416dd/docs/design/reference-v3) | 当前小团队页面布局与结构：浅背景、无衬线层级、紧凑日期/餐次、图文菜品行、核心导航和主要动作（原绿色主色 2026-10-07 起由搪瓷蓝取代） | 依据后续调度/D0 的明确采用范围；[PR #91](https://github.com/TERRYYYC/canteen-os/pull/91) 十画板整体仍为提案，顾客/订单/反馈/报告不搬入 |
| [D0 小团队页面合同](team-meals-pages/D0-contract.md)及[screen register](team-meals-pages/screen-register.md) | 页面路由、份数可空、人工采购、同版资料及受影响状态 | 合同和记录不是完整真实用户闭环通过声明；完成状态消费 #128 的实际验证 |
| [favorites-inbox-v2.html](favorites-inbox-v2.html) | 师傅查菜、完整阅读和来源审核；管理工具、正式编辑器和私有原片参考图的专用验证稿 | 2026-10-04 验证稿；收件箱主操作和采集管理分离继续由 #127 验收 |
| [knowledge-library-v1.md](knowledge-library-v1.md) | SQLite 菜谱列表、编辑和历史的分支页面合同 | 保留既有实施依据；通用核定/采用下一步由 #124 贯通，不能将旧 token 或此合同视作全站视觉签收 |
| [screens-v2.html](screens-v2.html) / [backoffice-v1.html](backoffice-v1.html) | 2026-09-07 前台/后台设计及后续局部补注 | 历史稿；部分行为仍用于兼容，字体/配色/导航/布局不覆盖当前小团队目标 |
| [favorites-inbox-v1.html](favorites-inbox-v1.html) / [screens-v1.html](screens-v1.html) | 早期方案 | 历史对照，非当前设计来源 |

Reference v3 的小团队适配：份数可留空、旧值保留、不突出总人数/总份数、不补 1；采购围绕人工判断，保留所有食材调料和未知量。原型工具栏、假状态栏和演示状态不进入实际页面。

历史 HTML 可在浏览器直接打开；其中演示数据、外部字体回退和来源图片只用于各稿自身的对照，不说明当前发布内容、图片使用权或厨师批准。当前页样式和素材仍受已接受的无 UI/CSS 框架约束及许可规则约束，旧稿 token 不再作为小团队四页的唯一 UI 真源。

改页面前确认适用合同、角色、语言、尺寸和状态；必要设计差异先明确更新合同，再实施。中文手机、EN/UA、桌面与错误/未保存状态按真实变化验收。所有原稿和研究记录保留，未签收的画板不在文档中追认为定稿。
