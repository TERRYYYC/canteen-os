# CanteenOS

> Spec-first 的食堂（团餐）全链路开源系统。
> A spec-first, open-source system covering the full canteen / mass-catering chain.

---

## 中文

**CanteenOS** 贯穿食堂全链路：**菜品知识库 → 菜单计划（日/周/月）→ 自动生成采购单 → 顾客点菜与评分 → 运营报告**。当前仓库处于"阶段 0：设计与 Schema"——完整的产品设计文档 + 数据模型 JSON Schema + TypeScript 类型骨架 + 多人/多 AI agent 协作规范，**尚无可运行的应用代码**。

### 三大模块

| 模块 | 说明 | 文档 |
|---|---|---|
| ① 菜品知识库 | Dish / Ingredient / Seasoning / Supplier / UnitConversion / DishPack；版本与状态机（draft→review→published）；视频导入可扩展 skill 机制 | [docs/modules/knowledge-base.md](docs/modules/knowledge-base.md) |
| ② 菜单计划→采购单引擎 | BOM 展开 → 按份数缩放 → 损耗率 → 食材聚合 → 扣库存 → 按供应商包装规格/MOQ 取整 → 拆分为 PO 草稿 | [docs/modules/procurement.md](docs/modules/procurement.md) |
| ③ 点餐/评分/反馈 | 预定点餐驱动计划份数；1–5 星 + 标签 + 三语评论；菜品热度/口碑与周/月运营报告 | [docs/modules/feedback.md](docs/modules/feedback.md) |

### 两条护城河（开源空白）

- **菜单计划→采购单转换**：开源菜谱软件止步于"家庭购物清单"，ERP 止步于通用 BOM；中间的"菜单周期 × 库存抵扣 × 供应商 × MOQ × 损耗率"无人做开源（详见调研报告第五节）。
- **内容级三语（中文/English/Українська）**：不只是 UI 翻译——每个可展示实体（菜品、食材、步骤、评论）都携带 `{zh, en, uk}` 内容（见 [docs/i18n.md](docs/i18n.md)）。

### 视频导入（可扩展 skill）

"做菜视频 → 结构化菜谱 → 打包导入知识库"。解析可跑在云端/第三方（首选 Gemini 2.5 Flash 单调用输出 schema.org/Recipe JSON-LD，约 $0.02–0.05/条；备选 Qwen3-VL），本地只导入标准 **dishpack** 包；易错字段带置信度，低于阈值进人工确认队列。契约见 [docs/video-import.md](docs/video-import.md) 与 [skills/video-recipe-ingest/SKILL.md](skills/video-recipe-ingest/SKILL.md)。

### 快速导航

- 产品需求：[docs/prd.md](docs/prd.md) ｜ 总体架构：[docs/architecture.md](docs/architecture.md)
- 决策记录：[docs/adr/](docs/adr/)（ADR-0001 ~ 0005）
- 数据模型单一事实源：[schemas/](schemas/)（JSON Schema draft 2020-12）
- 通过校验的样例：[examples/](examples/)（番茄炒蛋全链路）
- 调研报告：[docs/research/](docs/research/)（开源调研 + 视频技术调研）
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md) ｜ AI agent 规范：[AGENTS.md](AGENTS.md)

### 协作入口

本仓库为 spec-first：任何行为变更按 **schema → types → examples → docs** 的顺序提交（见 CONTRIBUTING.md）。CI 会用 ajv 校验 `examples/` 与 `schemas/` 的一致性。人类与 AI agent 一视同仁：同一套 PR checklist 与 CODEOWNERS 评审。

---

## English

**CanteenOS** covers the full canteen chain: **dish knowledge base → menu planning (day/week/month) → auto-generated purchase orders → customer ordering & ratings → operations reports**. The repo is currently at "Phase 0: Design & Schemas" — complete product design docs, JSON Schemas as the single source of truth, a TypeScript type skeleton, and collaboration rules for humans and AI agents. **No runnable application code yet.**

### Three core modules

1. **Dish knowledge base** — Dish / Ingredient / Seasoning / Supplier / UnitConversion / DishPack entities, a draft→review→published state machine, and an extensible video-import skill mechanism. See [docs/modules/knowledge-base.md](docs/modules/knowledge-base.md).
2. **Menu-plan → purchase-order engine** — BOM expansion, serving scaling, loss rates, ingredient aggregation, inventory deduction, supplier package/MOQ rounding, PO draft splitting. See [docs/modules/procurement.md](docs/modules/procurement.md).
3. **Ordering / rating / feedback** — pre-ordering drives planned servings; 1–5 stars + tags + trilingual comments; dish popularity metrics and weekly/monthly ops reports. See [docs/modules/feedback.md](docs/modules/feedback.md).

### Two differentiators (open-source gaps)

- **Menu-plan → purchase-order conversion**: recipe apps stop at household shopping lists; ERPs stop at generic BOMs. The middle ground (menu cycles × inventory deduction × suppliers × MOQ × loss rates) is open-source greenfield (research report §5).
- **Content-level trilingualism (zh / en / uk)**: not just UI translation — every displayable entity carries `{zh, en, uk}` content ([docs/i18n.md](docs/i18n.md)).

### Video import (extensible skill)

"Cooking video → structured recipe → packaged import into the knowledge base." Parsing may run in the cloud or on third-party services (primary: Gemini 2.5 Flash single-call emitting schema.org/Recipe JSON-LD, ~$0.02–0.05 per video; fallback: Qwen3-VL); the local system only imports standard **dishpack** bundles. Error-prone fields carry confidence scores and fall below-threshold entries into a human review queue. Contract: [docs/video-import.md](docs/video-import.md) and [skills/video-recipe-ingest/SKILL.md](skills/video-recipe-ingest/SKILL.md).

### Quick links

- PRD: [docs/prd.md](docs/prd.md) ｜ Architecture: [docs/architecture.md](docs/architecture.md)
- Decisions: [docs/adr/](docs/adr/) (ADR-0001 ~ 0005)
- Single source of truth for data models: [schemas/](schemas/) (JSON Schema draft 2020-12)
- Validated examples: [examples/](examples/) (a full tomato-and-egg stir-fry chain)
- Research reports: [docs/research/](docs/research/)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) ｜ AI agent rules: [AGENTS.md](AGENTS.md)

### How to collaborate

This repo is spec-first: submit behavioral changes in the order **schema → types → examples → docs** (see CONTRIBUTING.md). CI validates `examples/` against `schemas/` with ajv. Humans and AI agents follow the same PR checklist and CODEOWNERS review.

---

## License

[Apache-2.0](LICENSE) — 选择理由见 [ADR-0002](docs/adr/0002-license-apache2.md)。
