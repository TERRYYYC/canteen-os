---
feature_ids: [team-meals, knowledge-base]
topics: [current-scope, authority, acceptance, real-recipes, design]
doc_kind: current-work-contract
created: 2026-10-05
---

# CanteenOS 当前工作合同

当前目标是小团队“每天吃什么、需要买什么”：真实来源菜谱经师傅确认后，明确采用版本，排入所选计划，保存并发布，再查看同版菜单、按原配方备料、核对采购并重开继续操作。份数是可选参考；客户订单、履约、实际供餐统计、顾客反馈、经营报告和库存流水不在本轮范围。

本入口依据后续已接受的小团队目标、[团队页面合同](design/team-meals-pages/D0-contract.md)、SQLite/来源权限决策和 [真实厨房闭环计划 #128](https://github.com/TERRYYYC/canteen-os/issues/128)。它统一现行范围和文档适用性，不替代 schema/API 合同，也不把历史决定改写为当时已经接受的新方案。

## 从哪里开始

| 使用者/任务 | 当前入口 |
|---|---|
| 了解现状 | [项目摘要](project-summary.md)、实际 GitHub issue/PR 和对应 HEAD 的验证记录 |
| 开始实施 | [AGENTS](../AGENTS.md) → 本合同 → 本次 issue 全文 → 对应 schema/API/页面合同 |
| 调度与验收 | [#128 总计划](https://github.com/TERRYYYC/canteen-os/issues/128)、[工作模式的当前补充](operating-model.md) |
| 设计与页面 | [设计索引](design/README.md)、[D0 小团队页面合同](design/team-meals-pages/D0-contract.md) |
| 菜谱与固定依赖 | [知识库模块](modules/knowledge-base.md)、[ADR-0009](adr/0009-sqlite-knowledge-base.md)、[ADR-0010](adr/0010-knowledge-source-access.md) |
| 历史决策和排期 | [第一轮执行简报](execution-brief.md)、[给 Terry 的第一轮计划](plan-for-terry.md)、[v2 路线图](roadmap-v2.md)；用于追溯当时范围和兼容行为 |

本文件中的当前业务、视觉、状态和验收要求可在新的 clone 内独立阅读；D0 和历史调度文档里的本机绝对路径、外部工作树及未提交附件仅作来源追溯，不是执行本合同所需的隐含文件。具体字段/API 仍读取本仓受控 schema 与对应已核实合同；若旧附件与本文件的现行范围冲突，以现行范围为准。

GitHub 当前 issue 是任务队列；#128 维护这次闭环依赖和退出条件。`.github/backlog/round-1.json` 与 `backlog-waves.mjs` 保存第一轮计划，不能据其旧清单覆盖、重新生成或关闭后来实际存在的全部 issue。每次执行和完成声明仍须核对实时状态、精确 HEAD 与对应证据。

## 当前视觉来源与历史稿

绿色 [Reference v3 固定设计来源](https://github.com/TERRYYYC/canteen-os/tree/2f890d8f182d02e8ed4acb55a865e8aa086416dd/docs/design/reference-v3) 是当前小团队页面的视觉目标：绿色主色、浅背景、无衬线层级、紧凑日期/餐次、图文菜品行、明确主要动作和核心导航。具体应用范围及小团队差异以 D0 和本合同为准，份数可空、不补 1，不搬入原型工具栏、顾客或报告模块。

[PR #91](https://github.com/TERRYYYC/canteen-os/pull/91) 的十画板全套仍是设计提案，没有整体签收或全部实现声明。`screens-v2.html` / `backoffice-v1.html` 保留历史视觉、行为和兼容资料；“2026-09-07 定稿”不覆盖后续小团队页面目标。知识库和收件箱的专用合同、验证稿仍需结合本轮实际页面验收，不能把其中旧 token 或提案状态扩成全站新签收。

## 数据和状态的各自真源

| 对象 | 真源与版本边界 | 使用要求 |
|---|---|---|
| 来源捕获、候选、日常 Recipe、不可变修订及媒体证据 | 独立 SQLite 知识库；同名菜保留独立身份，更新保留版本和原始证据 | 来源审核、厨房核定与采用是明确阶段；`needs_review` 不是正式批准。CanteenOS Worker 提供受控网关，浏览器不直接访问数据库 |
| 菜单采用的 Recipe 与依赖 | 显式选择 `recipeId + version`，导出完整固定依赖并写入 Git | 日常 KB 编辑不修改旧菜单；新版本另行核定、主动采用。标准材料身份、采购和厨房规格合同由 #124/#125 完成，不因文档列出目标而声明已实现 |
| 菜单计划与公开菜单/备料 | 保存和发布分开；公开投影绑定所选计划和真实发布 commit | 同版资料读取，不能用 KB 当前版本偷偷补旧版；当前/历史计划选择由 #123 贯通 |
| 已保存 ShoppingList | 工作清单自己的 `basis`、计划范围、来源版本和人工判断 | `check/buy/available/bought` 仅属于该清单；需求改变需显式复核；公共换版不自动迁移已有/已买判断，不写回配方、食材、库存或旧 PO |
| Git JSON、schema v2 与旧 PO | 固定发布资料、旧数据兼容及数值引擎回归；实际字段以 `schemas/` 为准 | 不把 `data/` 称为新的日常 SQLite 写入库；Git SHA、SQLite version 和 UUID 不能互相冒充 |

SQLite 知识库是独立本地工程、服务和数据库；CanteenOS 的 #120/#121 接入网关、页面和固定桥，不包含完整可部署的知识库源码。发行使用的私有配套源码白名单包、manifest、依赖版本及数据迁移由发布负责人单独核对；本合同不声称源码包已提供或服务已随 CanteenOS 上线。

原方未知用量、份数、勺容量、净料率、时间继续未知，不默认填 1、0 或虚构“适量”。全部已录 `components[].ingredientRef` 食材和调料都进入人工采购清单，保留所有菜品来源；缺量/缺包装只关闭不成立的计算，不阻止人工排菜和采购判断。跨菜合并依赖厨师显式标准食材映射，不能只按同名字符串合并。

原方和厨房修订分别可追溯。原片文字、自由审核备注、媒体证据及原片参考图按 ADR-0010 的分支权限留给师傅/管理员；采购和帮厨使用已发布且固定版本的资料。公开菜照与参考图分开，使用权未核实不能为了完整页面自动公开。

## 本次收口依赖（2026-10-05）

| 包 | 跟踪对象 | 退出条件概要 |
|---|---|---|
| W0 基线 | [#122](https://github.com/TERRYYYC/canteen-os/issues/122)、[#101](https://github.com/TERRYYYC/canteen-os/issues/101) | 对齐 main 修复并裁决缓存方案；Node20/22 图片、未来日期及同版 reader 回归，保留权限和用户未保存状态 |
| W1 所选计划 | [#123](https://github.com/TERRYYYC/canteen-os/issues/123) | 排菜、菜单、备料、采购新建入口延续同一所选计划；旧演示仍在时真实计划可达，已有工作单 basis 保留 |
| W2 正式采用 | [#124](https://github.com/TERRYYYC/canteen-os/issues/124) | 收藏、手工和旧导入均能按 recipeId+version 核定/采用；不退回收件箱绕路，旧版冻结、权限/冲突/未知结果可恢复 |
| W3 标准材料 | [#125](https://github.com/TERRYYYC/canteen-os/issues/125) | 稳定材料身份与快照版本分开，合法补采购/厨房规格；共享材料一项多来源，未知量仍可操作 |
| W4 发布与体验 | [#110](https://github.com/TERRYYYC/canteen-os/issues/110)、[#111](https://github.com/TERRYYYC/canteen-os/issues/111)、[#113](https://github.com/TERRYYYC/canteen-os/issues/113)、[#126](https://github.com/TERRYYYC/canteen-os/issues/126)、[#127](https://github.com/TERRYYYC/canteen-os/issues/127) | 同代升级/离线/回滚、无后台只读、三语错误、清楚的厨师主路径和一致文档入口；复用 #117/#118/#119 |
| W5 全流程 | [#128](https://github.com/TERRYYYC/canteen-os/issues/128) | 两条真实视频证据菜谱、一条手工菜谱；空业务和旧演示共存两场景；完整往返、固定版本/发布 SHA/请求/截图及非作者验收 |

这些是实施及验收要求，完成状态以实际 issue、合入对象和对应验证记录为准。保存、发布、核定、采用、厨师批准不能合并成一个“完成”状态。

## 证据与当前交付边界

| 证据层 | 能证明什么 | 不能替代什么 |
|---|---|---|
| 示例和组件测试 | 指定 fixture、算法、接口与页面分支通过 | 真实菜谱来源完整、真实使用往返或厨师批准 |
| 隔离本机模型 | 实际 Worker/producer/web 和副本数据的请求、页面与持久化行为 | 模拟 GitHub/Actions/Pages 不等于实际平台发布；测试角色在副本的批准不是真实厨师确认 |
| 实际部署 | 对应应用 HEAD、依赖版本、真实工作流、客户端发布版、权限及升级/回滚结果 | 源码版本和绿色 CI 本身不证明已部署或厨房可用 |
| 厨师批准与厨房验收 | 师傅阅读原方、确认关键未知/厨房资料并明确采用版本 | 不能由 agent 批量批准生产候选来代替 |

2026-10-05 的收口从 `0.3.0-alpha.3` 集成候选开始；当前完整真实厨房闭环仍待验收，真实候选仍需师傅确认。版本更新由发布负责人按实际交付同步包清单、显示版本和 CHANGELOG；本合同不把拟定版本或本机模型称作已部署版本。已有本机用户数据、未保存表单和历史发布资料保留；验收在单独环境/数据库副本进行。

工程验收复用已保存的真实媒体、hash 和分析缓存，不重复 AI 阅读同一原片。副本/测试代理的审核操作必须明示为工程测试，不能写入或宣称真实厨师审批。只有逐项满足 #128 的实际退出条件，才能声明这次闭环完成。
