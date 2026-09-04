# ADR-0005: 采购引擎设计——确定性纯函数核心 + 可插拔预测

> **English summary.** The menu-plan→purchase-order engine is designed as a deterministic pure function (same inputs → same outputs, fully testable and replayable) with seven explicit steps: BOM expansion, serving scaling, loss-rate application, aggregation in base units, inventory deduction, package/MOQ round-up, and per-supplier PO split. Headcount forecasting is pluggable; inventory is an injected port; failures (missing supplier, failed unit conversion) produce structured errors instead of guesses. The paradigm follows Odoo MRP's "BOM explosion → aggregate by supplier → PO", not recipe-app shopping lists.

- Status: Accepted（2026-10）
- Deciders: @TERRYYYC

## Context

调研结论（[../research/open-source-research-canteen-system.md](../research/open-source-research-canteen-system.md) §二、§四、§五）：

- 菜谱软件（Mealie/Tandoor/KitchenOwl/Grocy）都实现了"菜单→聚合购物清单"，但**终点是家庭购物清单**——无供应商、无 MOQ、无库存抵扣、无 PO 状态机。
- ERP（Odoo MRP、ERPNext）有"BOM 展开 × 需求数量 → 按供应商汇总 → 生成 PO"的标准范式，但无餐饮语义（份量、损耗率、保质期）。
- 中间地带只有闭源商业产品（Apicbase）。**这是开源空白，也是产品护城河**——因此引擎设计必须自己定义，且要经得起推敲。

关键设计约束：

- 多人/多 agent 协作下，引擎逻辑必须**可测试、可回放、可审计**（采购错了是真金白银）。
- 人数预测天然不确定（订餐率、天气、节假日），不能污染确定性的展开/聚合/取整逻辑。
- 单位换算是主要错误源（调研报告 §四"术语归一"），失败必须显式报错而非猜测。

## Decision

1. **确定性核心**：`planProcurement(menuPlan, dishes, ingredients, suppliers, unitConversions, ctx)` 为纯函数——无 I/O、无时钟依赖、无随机性；同输入必同输出。
2. **七步管线**（见 [../modules/procurement.md](../modules/procurement.md) §2 伪代码）：BOM 展开 → `plannedServings/baseServings` 缩放 → 损耗率放大（`lossRateOverride ?? lossRate`）→ 归一到 baseUnit 聚合 → 扣减库存 → 包装规格/MOQ 向上取整（`max(moq, ceil(net/packageSize))`）→ 按供应商拆 PO 草稿。
3. **可插拔边缘**：
   - 人数预测器接口注入（模块三订餐汇总 / 历史模型 / 外部 AI 均可）；
   - 库存为注入端口（空表=保守全量采购 + trace 标记）。
4. **显式错误而非猜测**：`no-supplier`、`unit-conversion-missing`、`ambiguous-supplier` 等结构化错误进 trace，该行跳过、其余继续；告警类（`shelf-life-risk`、`lead-time-missed`）不阻断。
5. **PO 状态机**：`draft → confirmed → ordered → received → settled`；`expectedAt = 下单日 + leadTimeDays`。
6. 采购量全程携带 trace（从哪道菜、哪餐次、缩放系数、损耗率），支撑模块三的"采购准确度"指标。

## Consequences

- 正面：
  - 纯函数核心可用 examples/ 中的数据直接做黄金测试（golden tests）；examples 的 PO 样例本身就是可验证的推导基准。
  - 预测器/库存可以独立演进、独立测试。
  - 审计与对账（"为什么多买了 20 袋盐"→ MOQ 规则）有完整证据链。
- 负面：
  - 所有非确定性能力（预测、库存、实时价格）都必须走端口，初版接口设计需克制（已在 procurement.md 列 Open Questions）。
  - trace 数据量随菜单规模增长，需约定保留策略（待定，阶段 2 实现时定）。
