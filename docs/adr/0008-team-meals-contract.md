---
feature_ids: []
topics: [team-meals, scope, schema-evolution, shopping-list]
doc_kind: adr
created: 2026-09-11
status: proposed-technical-contract
---

# ADR-0008: 小团队餐食范围与显式格式演进

- Status: Proposed（技术 A0 待调度独立核查；用户的小团队范围已于 2026-09-11 明确授权，不重新审批）
- Deciders: Terry（产品范围）；调度与非作者 reviewer（技术合同核查）
- Contract: [小团队餐食终态合同](../specs/team-meals-contract.md)

## Context

原执行简报、ADR-0006 的“五实体冻结、份数必填、采购仅数量输出”服务旧主流程。用户明确改为自己小团队排每天吃什么、列全已录材料和调料、人工判断本次需买什么，并查看同版资料。份数可选；顾客、订单、反馈、报告和库存流水不在本次范围。仅改页面标题无法覆盖被 expand/菜单投影过滤的材料，严格 PO v2 也不能保存人工判断。

基线为 main `1fdaf7bf78264199ce87c80d20a4d37976cf05f2`。设计四份未提交草稿的内容和摘要列在合同；PR #91 仍为 draft 视觉提案。新范围优先于旧冻结，但不原地改历史 ADR 或把提案标成实现。

## Decision

1. 本次仅在以下方面取代旧执行简报 §1.2/§7、ADR-0006 的冻结：允许显式 MenuPlan v3 可选 plannedServings、Dish v3 可选 component.qty，以及独立 ShoppingList v1。其他旧字段和 v2 校验不放宽；Ingredient、Technique、PurchaseOrder 和原数量算法保留。
2. 读新/旧并存；显式升级保留全部真实值，不补份数、数量或适量。已升级对象禁止旧客户端或 rollback 降级，即使有最新锁。无需迁移永久菜单行 ID。
3. core 直接收集所有 components 引用，按材料身份去重并保留所有版本内来源；缺项如实报告。收集成功不等于真实配方完整，active 不当人工确认依据。
4. ShoppingList 只存来源基线、选中范围和本次判断/可选已买。来源与失效由纯比较得到；需求变化变 check，旧判断最多保留一份参考，移除项退出当前集合。判断不写 onHand/Dish/PO。
5. 扩展 ADR-0007 的写入合同：plan/dish/list 新建需 If-None-Match:*，更新需 If-Match，基线与判断原子保存，固定 revision 读取和同版资产不可读时显式失败。回退只恢复受控知识路径并保留工作清单；禁止删除或降级已升级资料。其余授权、限流、受控 Git 写入及保存/发布分离不变。
6. 构建显式分 legacy-numeric 与 team-meals。新主流程缺数量只关闭参考，不遗漏材料；引用/格式/本地资产错误仍是发布阻断。旧数值黄金在固定样本独立运行，不按正常生产菜单变动改 expected。
7. 历史 Git revision 足以作为本期资料基线；完整快照平台不是前置，不推导供餐、消耗或浪费。所有 API/Web/CI 由唯一 owner 消费共享合同；RC-A 仅交 schema/core/build。

## Consequences

小团队可先排菜和辨认需买材料；保留旧数字与既有来源、三语、图片许可。代价是显式双格式校验、需求比较和防降级读写，不能只放宽一个可选字段就让旧引擎接收未知量。多计划引用与判断支持，跨计划数量聚合暂不提供；同材料任一来源未知时不呈现总量。

实施顺序是 A0 独立核查 → schema/types/固定样本消费 → core/build → Worker 与共享 Web 接线 → 页面/真实往返。此 ADR 是授权范围的技术记录，不表示下游已完成；T04/T05/T07 真实保存、并发与回退仍需隔离环境证据。作者可提交自己分支及 PR，不合并、不推 main；旧历史文档保持原样。
