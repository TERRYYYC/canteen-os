# 量纲转换（UnitConversion）

> **English summary.** UnitConversionRule is a first-class, versioned entity that anchors every conversion rule to a triple context — (dishRef?, ingredientRef?, from→to) — with a fixed priority chain: **dish-specific > ingredient-specific > global**. Rules are never edited in place: an adjustment creates a new version that `supersedes` the old one, and `[effectiveFrom, effectiveTo)` (half-open, `effectiveTo` optional = open-ended) bounds each rule's validity interval. The procurement engine resolves the rule in force on the menu date (`asOfDate`), so historical purchase orders remain recomputable and unit-basis adjustments never pollute history. Resolution failures produce structured errors (`unit-conversion-missing` / `ambiguous` / `cycle`) — the engine never guesses. Cross-dimension compatibility (mass g↔kg, volume ml↔l, count↔mass being ingredient-bound) is a documented convention, not schema-enforced (Open Question #1). Embedded simple conversions (e.g. supplier SKU package sizes) still use `common.schema.json`'s `$defs.UnitConversion`.

- schema：`schemas/unit-conversion.schema.json`
- 样例：`examples/unit-conversion-*.example.json`
- 代码骨架：`packages/core/src/procurement/engine.ts`（"量纲换算器（UnitConverter）"一节）
- 关联模块：[knowledge-base.md](knowledge-base.md)（规则作为知识库实体管理）、[procurement.md](procurement.md)（引擎调用点）

---

## 1. 三元组模型

每条规则锚定一个三元组上下文 **(dishRef?, ingredientRef?, from→to)**，`context` 的两个引用决定规则的适用层级：

| context | 层级 | 示例 |
|---|---|---|
| `{dishRef, ingredientRef}` | 菜品特定 | 番茄炒蛋中番茄 1 pcs = 150 g（小果口径，覆盖食材级 180 g） |
| `{ingredientRef}` | 食材特定 | 鸡蛋 1 pcs = 55 g（带壳）→ 50 g（去壳口径，2026-11-01 起） |
| `{}`（皆空） | 全局通用 | 1 kg = 1000 g |

约束：

- **dishRef 必须与 ingredientRef 同现**（schema 层 `if/then` 强制）——菜品级规则的语义是"某食材在本菜品中的口径覆盖"，不允许脱离食材悬空。
- **量纲相容性为文档约束，schema 不做跨量纲校验**（Open Question #1）：
  - 质量内：`g ↔ kg` 可登记全局规则；
  - 体积内：`ml ↔ l` 可登记全局规则；
  - 计数/约量 → 质量/体积：`pcs / pack / tbsp / tsp / pinch → g / kg / ml / l` 与食材的单件重量或密度相关，**必须**登记在食材级或菜品级，禁止全局；
  - 质量 ↔ 体积跨量纲：必须食材级（密度是食材属性），禁止全局。

### 数据模型表（UnitConversionRule）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Id | ✅ | kebab-case 稳定 ID，如 `uc-egg-pcs-g-v1` |
| schemaVersion | `"1"` | ✅ | 实体 schema 版本 |
| context | object | ✅ | `{dishRef?, ingredientRef?}`，三元组上下文 |
| from / to | Unit | ✅ | 换算方向，复用 common 的 Unit 枚举 |
| factor | number >0 | ✅ | from × factor = to |
| effectiveFrom | ISO date | ✅ | 生效起始日（含当日），区间左闭 |
| effectiveTo | ISO date | | 生效截止日（不含当日），缺省 = 无限期 |
| supersedes | Id | | 取代的旧规则 id，形成版本调整链 |
| source | object | ✅ type | type ∈ manual / measured / video-import / supplier-spec；附 supplierRef / dishpackRef / detail |
| confidence | Confidence | | 机器来源置信度；人工/实测省略（视为 1.0/manual） |
| note | I18nString | | 口径说明（如"去壳净蛋"） |
| status | enum | ✅ | draft / active / deprecated（语义见 §3） |

## 2. 优先级链

解析固定按 **菜品特定 > 食材特定 > 全局通用** 取最高优先级层，同层内部再按生效期裁决（§3）。

以 `examples/` 中的规则集为例，查询"2026-10-07 番茄炒蛋的番茄 pcs→g"：

1. 菜品特定命中 `uc-dish-tomato-egg-tomato-pcs-g`（dish-tomato-egg-stir-fry × ing-tomato，150 g/个）→ **采用，不再向下查找**；
2. 若查询换成其他菜品的番茄，则落到食材级（`ing-tomato` 内嵌默认 180 g/个，迁移后即为食材级规则）；
3. `kg→g` 这类与食材无关的换算走全局层（`uc-global-kg-g`，factor 1000）。

注意现有样例的数值自洽性：2026 年第 41 周菜单（10-05/07/09）的番茄炒蛋，鸡蛋按食材级 v1 规则 55 g/枚 解析（v2 的 50 g 自 2026-11-01 才生效），与 [procurement.md](procurement.md) §2 推导样例"809 pcs ≈ 44.5 kg"一致；番茄用量全程以 g 计，菜品级 pcs→g 规则不影响该周数字。

## 3. 生效期与复算语义

核心原则：**规则不原地修改**。调整量纲 = 新增一条 `supersedes` 旧规则的版本：

- 生效区间为 **[effectiveFrom, effectiveTo) 左闭右开**，`effectiveTo` 缺省表示无限期；
- `supersedes` 是审计谱系（谁取代了谁），解析本身只依赖生效区间自洽——建议治理时保持区间边界衔接（示例中 `uc-egg-pcs-g-v1.effectiveTo = uc-egg-pcs-g-v2.effectiveFrom = 2026-11-01`）；
- `status` 语义：`draft` 不参与解析；`active` 正常参与；`deprecated` 是"已被新版取代"的管理标记，**仍按其历史生效区间参与解析**——这是复算的前提；
- **可复算性（reproducibility）**：同一份 MenuPlan + 同一批规则快照 + 同一 asOfDate 口径 ⇒ 同一份采购单。历史 PO 无论何时重算，都取当时生效的规则版本，调整量纲不污染历史。

解析算法（与 `engine.ts` 的 `resolveConversionFactor(rules, query)` 骨架一一对应）：

```text
0. from === to            → factor = 1，不查表
1. 候选过滤                → from/to 一致 ∧ status ≠ draft
                            ∧ effectiveFrom <= asOfDate < (effectiveTo ?? 无限期)
2. 优先级分层              → 菜品特定 > 食材特定 > 全局通用，取最高命中层
3. 同层裁决                → effectiveFrom 最新者优先；仍并列 → ambiguous 错误
4. 无命中                  → missing 错误；链式多跳换算留待阶段 2（需环检测 cycle）
```

## 4. 与采购引擎的衔接

量纲换算在七步管线（[procurement.md](procurement.md) §2）中有两个调用点，均通过 `resolveConversionFactor(rules, {ingredientRef, dishRef?, from, to, asOfDate})`：

| 调用点 | 换算内容 | asOfDate 口径 |
|---|---|---|
| **步骤 4（aggregateByIngredient，聚合归一）** | 各 component 的 gross 用量 → `Ingredient.baseUnit` | **该条 meal 的日期**（`meal.date`） |
| **步骤 6（roundUpToPackages，包装取整）** | baseUnit → SKU `packageUnit`（包装规格换算） | **菜单周期截止日**（`menuPlan.dateRange.end`） |

- 步骤 4 按"各 meal 当日生效规则"换算后再聚合：若菜单周恰好跨过规则生效边界，不同日期的用量会用不同 factor 归一——这是有意的正确语义，保证每一天的用量都按当日口径。
- 步骤 6 发生在聚合之后，已无单一 meal 日期，统一取菜单周期截止日作为口径，并随 trace 记录命中规则 id 以便审计。
- 失败处理与现行约定一致：换算失败 → `unit-conversion-missing` issue，该食材行跳过，**绝不猜测**。
- 与内嵌 struct 的分工：`Ingredient.unitConversions` / SKU 包装规格中的 `common $defs.UnitConversion` 保留为**内嵌静态简单换算**；一切需要动态调整、版本化、生效期管理的换算（菜单→采购推演链路）以 UnitConversionRule 独立实体为准。数据迁移与双写期的取舍见 Open Question #4。

## 5. 边界情况

| 情况 | 处理 |
|---|---|
| 换算缺失（如 pcs→l 无任何规则） | `unit-conversion-missing` 错误，绝不猜测；人工补规则后重跑 |
| 冲突规则（同层、区间重叠且 effectiveFrom 相同的多条命中） | `unit-conversion-ambiguous` 错误 + `candidateRuleIds`，人工裁决；属数据质量问题 |
| 同层区间重叠但 effectiveFrom 不同 | 不算冲突：取 effectiveFrom 最新者（后发优先） |
| 循环换算（链式解析 A→B→A 成环） | `unit-conversion-cycle` 错误；schema 不做跨规则图校验，链式解析时以访问集检测 |
| 反向换算（查 g→pcs 但只有 pcs→g 规则） | v1 不自动取倒数，必须显式登记反向规则（Open Question #2） |
| `draft` 规则 | 不参与解析 |
| `deprecated` 规则 | 仍按历史生效区间参与解析（复算需要），仅禁止新引用 |
| 跨量纲无路径（质量↔体积无食材级密度规则） | 视同换算缺失 |
| 跨规则生效边界的菜单周 | 步骤 4 按各 meal.date 分别取当日规则换算后聚合（§4）；是否按边界拆单见 Open Question #3 |

## 6. 开放问题（Open Questions）

1. **量纲相容性是否进 schema/CI 校验？** 需要引入"单位→量纲维度"表（mass/volume/count/approx）并写跨规则校验器；当前仅文档约束，schema 层不做跨量纲校验。
2. **反向换算是否允许引擎自动取倒数（1/factor）并在 trace 标注？** 涉及浮点精度与审计口径，v1 选择显式登记。
3. **跨生效边界的菜单周是否按边界日拆分采购？** 当前语义是"按日换算、合并聚合"；若食材级口径变化显著（如 55 g→50 g 差 9%），可能需要按边界拆成两张 PO。
4. **Ingredient.unitConversions 内嵌表与独立实体的迁移策略**：阶段 2 实现引擎时是一次性迁移（内嵌表只读保留给展示层），还是双写一段时间？涉及 dishpack 导入器写入侧的改造。
