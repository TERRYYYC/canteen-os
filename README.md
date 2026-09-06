# CanteenOS

> Spec-first 的食堂开源系统：**一个中国师傅带乌克兰帮厨，在海外做中餐、买对料**。
> A spec-first, open-source canteen system: one Chinese chef + a Ukrainian helper, cooking Chinese food abroad and buying the right ingredients.

---

## 中文

**CanteenOS** = 一个知识库（`data/` 目录），每天出**三张单**：**备料单**（给乌克兰帮厨，配图）、**采购单**（给采购员，按供应商分组、按包装取整、可转微信）、**菜单**（给顾客，三语）。知识库的输入通道是做菜视频——视频解析 skill 直出菜品草稿，师傅审 PR 即入库。

2026-09-06 起执行 v2 收窄（[ADR-0006](docs/adr/0006-scope-reduction-v2.md)）：实体从 9 个减到 **5 个**，`examples/` 由 **`data/`（目录即知识库）** 取代，删除供应商/量纲/反馈/dishpack 中间层与 PO 状态机。当前仓库 = 设计文档 + JSON Schema + data/ 种子知识库 + TS 类型与引擎骨架，**尚无可运行应用**。

### 模块地图

| 模块 | 说明 | 文档 |
|---|---|---|
| ① 菜品知识库 | Ingredient / Technique（单文件受控词表）/ Dish；允许不完整（只有名字也能导入），readiness 关卡：能教/能排/能采；一实体一文件、文件名即 ID | [docs/modules/knowledge-base.md](docs/modules/knowledge-base.md) |
| ② 菜单计划→采购单引擎 | BOM 展开 → 按份数缩放 → ÷yield ×margin（pcs 不套 yield 不乘 margin）→ 扣 onHand → `max(minPacks, ceil(需求/packSize))` → 按供应商字符串分组出快照；每行带 trace，无 PO 状态机 | [docs/modules/procurement.md](docs/modules/procurement.md) |
| ③ 点餐/评分/反馈 | **deferred（ADR-0006）**，设计稿保留 | [docs/modules/feedback.md](docs/modules/feedback.md) |

### 两条护城河（开源空白）

- **菜单计划→采购单转换**：开源菜谱软件止步于"家庭购物清单"，ERP 止步于通用 BOM；中间的"菜单 × 净料率 × 备量系数 × 现有量 × 包装取整 × 起订量"无人做开源（详见调研报告）。
- **内容级三语（中文/English/Українська）**：不只是 UI 翻译——每个可展示实体（菜品、食材、技法、步骤）都携带 `{zh, en, uk}` 内容（见 [docs/i18n.md](docs/i18n.md)）。

### 视频导入（可扩展 skill）

"做菜视频 → `data/dishes/<菜>.json`（draft）+ `images/` 截帧 → git PR 审核入库"。Gemini 主 / Qwen 备（ADR-0006 裁决），yt-dlp 下载（Unlicense 裁决可用）；每个配料"被切的几秒"截帧写进 `prep.image`，步骤带视频片段 `clip`；技法输出闭集引用 `data/techniques.json`。契约见 [docs/video-import.md](docs/video-import.md) 与 [skills/video-recipe-ingest/SKILL.md](skills/video-recipe-ingest/SKILL.md)。

### 快速导航

- 产品需求：[docs/prd.md](docs/prd.md) ｜ 总体架构：[docs/architecture.md](docs/architecture.md)
- 决策记录：[docs/adr/](docs/adr/)（ADR-0001 ~ 0006）
- 数据模型单一事实源：[schemas/](schemas/)（JSON Schema draft 2020-12，5 实体 + common）
- 知识库数据（通过校验）：[data/](data/)（番茄炒蛋全链路：5 食材 + 32 技法 + 菜品 + 第 41 周菜单 + 采购验收基准）
- 调研报告：[docs/research/](docs/research/)（开源调研 + v2 八场景调研）
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md) ｜ AI agent 规范：[AGENTS.md](AGENTS.md)

### 协作入口

本仓库为 spec-first：任何行为变更按 **schema → types → data → docs** 的顺序提交（见 CONTRIBUTING.md）。CI 用 ajv 校验 `data/` 与 `schemas/` 的一致性（含跨文件引用检查），本地可用 `python3 scripts/local-validate.py`。人类与 AI agent 一视同仁：同一套 PR checklist 与 CODEOWNERS 评审。

---

## English

**CanteenOS** = one knowledge base (the `data/` directory) producing **three sheets a day**: a **prep list** (for the Ukrainian helper, with photos), a **purchase order** (for the purchaser, grouped by supplier string, rounded up to pack sizes, WeChat-shareable), and a **menu** (for customers, trilingual). Knowledge enters through cooking videos — the parsing skill emits draft dishes directly and the chef merges a PR to accept them.

Since 2026-09-06 the v2 scope reduction ([ADR-0006](docs/adr/0006-scope-reduction-v2.md)) applies: 9 schema entities narrowed to **5**, `examples/` replaced by **`data/` (directory-as-knowledge-base)**, and the supplier/unit-conversion/feedback entities, the video interchange bundle, and the PO state machine removed. The repo currently holds design docs + JSON Schemas + the seed `data/` knowledge base + TS types and an engine skeleton. **No runnable application yet.**

### Modules

1. **Dish knowledge base** — Ingredient / Technique (single-file controlled vocabulary) / Dish. Incomplete dishes allowed (a name alone imports); readiness gates: teach / plan / buy. One file per entity, filename = ID. See [docs/modules/knowledge-base.md](docs/modules/knowledge-base.md).
2. **Menu-plan → purchase-order engine** — BOM expansion, serving scaling, ÷yield ×margin (pcs items skip both), on-hand deduction, `max(minPacks, ceil(need/packSize))`, PO snapshots grouped by supplier string with a per-line trace. No PO state machine. See [docs/modules/procurement.md](docs/modules/procurement.md).
3. **Ordering / rating / feedback** — **deferred (ADR-0006)**; design kept at [docs/modules/feedback.md](docs/modules/feedback.md).

### Two differentiators (open-source gaps)

- **Menu-plan → purchase-order conversion**: recipe apps stop at household shopping lists; ERPs stop at generic BOMs. The middle ground (menus × yield × margin × stock × pack rounding × min-packs) is open-source greenfield.
- **Content-level trilingualism (zh / en / uk)**: not just UI translation — every displayable entity carries `{zh, en, uk}` content ([docs/i18n.md](docs/i18n.md)).

### Video import (extensible skill)

"Cooking video → `data/dishes/<dish>.json` (draft) + `images/` frames → merge PR to accept." Gemini primary / Qwen fallback; yt-dlp for downloads (Unlicense, ruled acceptable). Frames of "the seconds each ingredient is being cut" land in `prep.image`; steps carry video `clip` ranges; technique references are a closed set from `data/techniques.json`. Contract: [docs/video-import.md](docs/video-import.md) and [skills/video-recipe-ingest/SKILL.md](skills/video-recipe-ingest/SKILL.md).

### Quick links

- PRD: [docs/prd.md](docs/prd.md) ｜ Architecture: [docs/architecture.md](docs/architecture.md)
- Decisions: [docs/adr/](docs/adr/) (ADR-0001 ~ 0006)
- Single source of truth for data models: [schemas/](schemas/) (JSON Schema draft 2020-12)
- Knowledge-base data (validated): [data/](data/) (full tomato-and-egg chain: 5 ingredients + 32 techniques + dish + week-41 menu + procurement acceptance baseline)
- Research reports: [docs/research/](docs/research/)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) ｜ AI agent rules: [AGENTS.md](AGENTS.md)

### How to collaborate

This repo is spec-first: submit behavioral changes in the order **schema → types → data → docs** (see CONTRIBUTING.md). CI validates `data/` against `schemas/` with ajv (including cross-file reference checks); locally run `python3 scripts/local-validate.py`. Humans and AI agents follow the same PR checklist and CODEOWNERS review.

---

## License

[Apache-2.0](LICENSE) — 选择理由见 [ADR-0002](docs/adr/0002-license-apache2.md)。
