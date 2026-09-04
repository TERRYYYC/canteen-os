# CanteenOS 产品需求文档（PRD）

> **English summary.** CanteenOS is a spec-first, open-source system for canteens (mass catering) covering the full chain: dish knowledge base → menu planning → auto-generated purchase orders → customer ordering & ratings → operations reports. This PRD defines four roles (chef, purchaser, customer, admin), the three core modules, the content-level trilingual requirement (zh/en/uk), and the extensible video-to-recipe import skill. Two capabilities are deliberate open-source differentiators: menu-plan→purchase-order conversion and content-level i18n. Non-goals for the current phase are listed at the end.

- 版本：v0.1（阶段 0：设计与 Schema）
- 依据调研：[docs/research/open-source-research-canteen-system.md](research/open-source-research-canteen-system.md)、[docs/research/video-to-recipe-tech-survey.md](research/video-to-recipe-tech-survey.md)

---

## 1. 产品定位

现有开源生态存在两端断点：**菜谱软件（Mealie/Tandoor）不懂"食堂"**（无采购、无点餐、无成本），**ERP（Odoo/ERPNext）不懂"菜谱"**（无菜品语义、无三语、无视频导入）。CanteenOS 占据中间地带，以"菜单计划→采购单引擎"和"内容级三语"为自研护城河（调研报告第五节、第七节）。

## 2. 角色（Personas）

| 角色 | 描述 | 核心诉求 |
|---|---|---|
| 厨师 / 菜品管理员（Chef） | 维护菜品知识库、审核视频导入结果 | 菜品录入/修订高效；视频转菜谱省去手工录入；步骤与用量准确 |
| 采购员（Purchaser） | 根据菜单计划生成并执行采购单 | 不用手算；按供应商拆单；MOQ/包装规格不用脑补；不错过提前期 |
| 顾客（Customer） | 提前订餐、取餐核销、评分评论 | 看到自己语言的菜单；订餐简单；反馈被听见 |
| 管理员（Admin） | 配置供应商/库存/用户，看运营报告 | 数据贯通；成本与浪费可视化；三语内容治理 |

## 3. 场景故事

1. **菜单到采购（采购员）**：周五下午，采购员打开下周菜单计划（已根据预定点餐更新份数），一键生成采购单草稿：番茄按 5 kg 装取整、鸡蛋按 180 枚/箱取整、食盐因 MOQ 20 袋而多买。确认后系统自动按供应商拆分、标注预计到货日。
2. **视频建菜（厨师）**：厨师在 B 站看到一道适合食堂的菜品视频，把链接丢给视频导入 skill；10 分钟后在人工确认队列里审核：两条低置信度食材映射（"适量盐"、"一把葱花"被量化成 3 g / 10 g），修正后一键入库，菜品三语名称已生成。
3. **订餐与反馈（顾客）**：乌克兰学生用手机看到 Смажені яйця з томатами（番茄炒蛋），预定周二午餐 1 份；取餐扫码核销后给出 4 星 + "portion-small" 标签。管理员在周报里看到该菜"份量偏小"标签集中度 23%，决定把 baseServings 份量上调。
4. **运营报告（管理员）**：月初自动生成上月报告：菜品热度榜/口碑榜、采购准确度（计划量 vs 实际消耗）、成本汇总、浪费反馈（no-show 率）。

## 4. 三大模块需求

### 4.1 模块一：菜品知识库（详见 [modules/knowledge-base.md](modules/knowledge-base.md)）

- 实体：Dish / Ingredient（含调料，isSeasoning 区分）/ Supplier(+SKU) / UnitConversion / DishPack。
- 菜品版本管理（version 自增）与状态机：`draft → review → published`（可 `archived`）。
- Dish.components 必须引用 Ingredient（ingredientRef），禁止内联字符串——采购引擎 BOM 展开的前提。
- 可扩展性：dishpack 标准包导入；云端解析 skill 输出契约统一为 schema.org/Recipe JSON-LD；线上线下同步策略。

### 4.2 模块二：菜单计划→采购单引擎（详见 [modules/procurement.md](modules/procurement.md)）

- 输入：MenuPlan（日期×餐次×菜品×计划份数）。
- 管线：BOM 展开 → 按 `plannedServings/baseServings` 缩放 → 应用损耗率 → 按食材聚合 → 扣减库存 → 按供应商包装规格/MOQ 向上取整 → 按供应商拆分为 PO 草稿。
- PO 状态机：`draft → confirmed → ordered → received → settled`。
- 确定性核心（纯函数，可测试）+ 可插拔人数预测。

### 4.3 模块三：点餐/评分/反馈（详见 [modules/feedback.md](modules/feedback.md)）

- 预定点餐（mealOrder）驱动 plannedServings；取餐核销；no-show 统计。
- 评分：1–5 星 + 受控标签词表 + 评论（原文 + 三语翻译存储）。
- 指标：菜品热度（点单量）、口碑（评分分布）；周/月运营报告规格：菜品榜、采购准确度、成本、浪费反馈。

## 5. 内容级三语需求（详见 [i18n.md](i18n.md)）

- **所有可展示实体**（菜品名/描述、食材名、步骤、评论）携带 `{zh, en, uk}` 结构，至少一种语言。
- fallback 链：`zh → en → uk`。
- 食材计量单位本地化显示；内部统一规范单位符号。
- UI chrome（按钮、菜单等界面文案）用 i18next，留给客户端实现，不在本仓库数据模型内。

## 6. 视频导入需求（详见 [video-import.md](video-import.md)）

- 输入：视频文件或 URL（B 站/抖音/YouTube/TikTok/Instagram），可带语言提示。
- 管线：首选 Gemini 2.5 Flash 单调用（responseSchema 约束输出 schema.org/Recipe JSON-LD，约 $0.02–0.05/条）；备选 Qwen3-VL（国内合规/中文优势）、自托管 WhisperX+Qwen-VL（大批量/离线）。
- 输出：dishpack 标准包（manifest = JSON-LD + provenance + confidence + transcript + 媒体引用，含 packVersion）。
- 易错字段（用量、份量）带置信度，低于阈值（默认 0.85）进入人工确认队列。

## 7. 非目标（Non-Goals，本阶段明确不做）

- ❌ 不做完整可运行应用（阶段 0 只交付 spec、schema、类型骨架与协作规范）。
- ❌ 不做餐厅桌台/堂食 POS（我们面向食堂档口与团餐，参考 POSR 但不做桌台管理）。
- ❌ 不做支付清结算；PO 的 settled 状态只记录对账结果。
- ❌ 不做员工排班、HR、食安证照（HACCP）管理（OpenKitchen 有，可参考但非本期目标）。
- ❌ 不做 UI 层 i18n 资源文件（i18next 资源由客户端项目自理）。
- ❌ 不自建视频解析服务（本地只导入 dishpack；解析由云端/第三方 skill 实现）。
- ❌ 不做营养配餐推荐算法（nutrition 字段仅作数据预留）。

## 8. Open Questions

1. 多食堂/多租户模型（参考 Mealie Group/Household）是否进入阶段 1 范围？
2. 预定点餐的截止时间规则（前一日 18:00？）是否需要 per-canteen 配置？
3. 运营报告的"浪费反馈"是否需要对接称重/剩菜登记硬件，还是纯评分标签推断？
