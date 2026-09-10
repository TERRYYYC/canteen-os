---
feature_ids: []
topics: [team-meals, references, manual-decisions, estimates]
doc_kind: module-contract
created: 2026-09-11
---

# 小团队 core 接口

事实合同是 [team-meals-contract](../specs/team-meals-contract.md)；实现位于 packages/core/src/team-meals.ts，经 core 主出口导出。输入先由正式 schema 校验。函数纯粹接收输入、不读 Git/网络/时间，调用者负责按指定 sourceRevision 提供全部知识资料。函数测试不证明真实保存或同版网络读取已实现。

| 导出 | 返回 / 调用责任 |
|---|---|
| collectIngredientReferences(inputs,selection) | items 每个 ID 一行、所有原始索引来源；issues、coverage 三维分开 |
| normalizeSelection(selection) | 日期/餐次/plan 元组排序去重，原菜单重复来源不去重 |
| normalizeDemand(inputs,selection) | selection + ingredients 的稳定需求表达；不持久化摘要 |
| createShoppingList(id,basis,inputs) | 全 check；需要完整 revision、非空 selection 和存在的 plan |
| applyShoppingDecision(list,ingredientRef,decision,bought?) | 深拷贝，只写该材料；非 buy 不能带 bought；人工操作清 previous；Worker 另禁止确认悬空 Ingredient |
| reconcileShoppingList(previous,previousInputs,nextBasis,nextInputs) | list、added、removed、reviewRequired、retained；两套 inputs 必须各属其真实基线 |
| estimateShoppingList(inputs,selection,at) | 每材料 complete 或 unavailable、精确原因、可选原 core 行；budgetStatus 独立 |
| projectTeamMeals(inputs,context,options?) | projectionVersion/sourceRevision、原 JSON 知识字段、引用和 coverage；资产 bytes 仍需同版适配 |

ShoppingBasis 是持久清单基线，selection 至少一项。TeamProjectionContext 为只读投影上下文，可空 selection；空计划需 options.emptyMenuPlanRefs 明确传真实空计划 ID。缺计划、非空计划、非空 selection 搭配该 option 均拒绝，不造日期，也不把投影 context 当合法持久清单基线。

版本内来源地址保留原 mealIndex/componentIndex。需求比较不用索引，使用有重复次数的来源集合和真实数量输入。排序、三语、图片、包装价格或 onHand 参考变化不清人工判断；范围、日期、菜品、来源数量、用量、份数、基准份数、margin、yield/转换参数变化需复核。未知来源上下文变化也需复核，防止非空候选掩盖漏录。

同量纲单位按十进制有效位/指数比较，1001 g 与 1.001 kg 相等，真实小差异仍会触发复核。未知菜品或未录成分来源的份数、margin、基准份数/status 也进入比较。

reconcile 不把旧已买复活到新需求。变化项为 check，previous 最多一份最后人工判断；移除项只在 removed 中带原状态，UI 必须提示取消排菜不撤销购买。再次加回已移除材料为新的 check。basis/items 的原子保存、条件头和 409 review_required 由 Worker 实现，返回 reviewRequired 顶层机器字段，不从 message 解析。

估算仅在某材料所有来源齐全时送原 expand；缺份数/基准/qty/包装、适量、单位问题或非 active 均不输出该材料部分总量。无法读取来源会让整体预算不完整。多计划数量聚合明确 unavailable/multiple-plans，材料引用和人工判断仍可用；缺价/混币种不声称完整预算。库存足够产生空原采购行，但材料候选保留。

原引擎返回后先递归检查数值有限性，再深拷贝；溢出项 unavailable/engine-issue，无 null 数值行。显式人工选 check 可以清 previous；相同 basis 的纯复算保留 previous。

旧黄金消费来自 RC-Q 固定提交 3d9f2aac7fb3f76225d315e34ec5aad7d00dcf96，test/fixtures/contracts/valid/golden/data；A 通过合流消费，未改 fixture 字节。engine/sheets/build/translate 测试仅切输入路径，expected 原样。实测番茄 19 件 ¥541.50、全单 ¥1525.50、5 行快照 0 差异。构建/CI 接线仍分各自负责人，不用这些结果声称 API 或页面完成。
