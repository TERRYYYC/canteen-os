# data/purchase-orders/ — 采购单（引擎输出目录）

本目录存放**采购引擎的输出快照**（schema：`schemas/purchase-order.schema.json`），一单一文件，
文件名即单号（建议 `po-<日期>-<供应商slug>`，如 `po-2026-10-03-greenfarm.json`）。

- **不要手工编辑本目录的 JSON**：数字由引擎（`packages/core`）从 `data/menu-plans/` +
  `data/dishes/` + `data/ingredients/` 推导生成；要改结果就改上游数据后重跑。
- 每行必须带 `trace`（哪个菜、多少份、净需求、÷yield、×margin、扣 onHand、÷packSize
  向上取整、minPacks）——"为什么买这个数"永远可追溯。无状态机：确认/下单/收货在线下完成。
- **已实现并回填**：`packages/core` 引擎（ADR-0006 执行顺序：先引擎后 POC）已生成
  `week-41-lvyuan.json` / `week-41-hongda.json`，输出与下面手写推导的验收基准逐行一致（黄金测试锁定）。

## 验收基准（menu-plans/week-41.json：番茄炒蛋 200+160+120 = 480 份，margin 1.1）

| 食材 | 净需求 | ÷yield | ×margin | 扣 onHand | ÷packSize | 取整/minPacks | 采购量 | 金额 |
|---|---|---|---|---|---|---|---|---|
| 番茄 | 72000 g | ÷0.85 | ×1.1 = 93176.5 g | 0 | ÷5 kg = 18.64 | ceil→19 | 19 件 ×5 kg = **95 kg** | ¥541.50 |
| 鸡蛋 | 720 pcs | —（pcs 不套） | —（pcs 不乘） | 0 | ÷180 枚 = 4.0 | ceil→4 | 4 箱 ×180 = **720 枚** | ¥600.00 |
| 小葱 | 2400 g | ÷0.80 | ×1.1 = 3300 g | 0 | ÷1 kg = 3.3 | ceil→4 | 4 件 ×1 kg = **4 kg** | ¥48.00 |
| 食盐 | 720 g | ÷1（无 yield） | ×1.1 = 792 g | −500 g = 292 g | ÷500 g = 0.584 | ceil→1，minPacks→20 | 20 袋 ×500 g = **10 kg** | ¥50.00 |
| 食用油 | 4800 ml | ÷1（无 yield） | ×1.1 = 5280 ml | −1000 ml = 4280 ml | ÷5 L = 0.856 | ceil→1，minPacks→2 | 2 桶 ×5 L = **10 L** | ¥136.00 |

按供应商分单：**绿源农产品配送**（番茄+鸡蛋+小葱）¥1189.50；**宏达粮油调味批发**（食盐+食用油）¥186.00；
合计 **¥1375.50 / 480 份 ≈ ¥2.87/份**。完整推导规则见 [docs/modules/procurement.md](../../docs/modules/procurement.md) §2。
