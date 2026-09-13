# CanteenOS

> **团队用餐计划、备料与采购协作**，支持中文、English、Українська。
> **Meal planning, preparation and purchasing for a team**, in Chinese, English and Ukrainian.

---

## 中文

**CanteenOS** 把团队每天吃什么、厨房如何备料、采购员需要确认购买什么放在同一套资料里。师傅排菜或粘贴导入菜单，维护菜品和食材；团队查看用餐安排，帮厨查看备料，采购员人工确认并保存采购清单。`data/` 是 Git 中的知识库，允许不完整资料并明确显示缺项。

**当前源码版本：0.3.0-alpha.1（2026-09-13，预发布）。** 网页已实现菜单计划、备料、菜单、采购、菜品/食材编辑及发布入口；支持三语、PWA 和 QR。写入通过显式配置的 Cloudflare Worker，未配置时为只读，不能把本地测试用的模拟接口当成服务上线。应用版本在抽屉底部显示，资料更新时间单独显示。

**上线边界：** 本地产品与接口已有独立审查、浏览器及构建证据；真实 Worker、隔离目标环境、配套凭据和真实菜谱/厨房流程仍待核实。此版本不宣称完整可写生产上线。当前验收与授权见 [团队调度状态](feature-specs/2026-09-11-team-meals-dispatch.md)、[发布检查表](docs/field-test/week-43/ops-checklist.md)，版本历史见 [CHANGELOG](CHANGELOG.md)。

### 打开

GitHub Pages 地址如下。成功合并到 `main` 会触发发布工作流；以实际 Actions 结果和抽屉版本为准，源码版本不代表该版本已经部署：

- 备料单：<https://terryyyc.github.io/canteen-os/#/prep>
- 采购单：<https://terryyyc.github.io/canteen-os/#/purchase>
- 团队用餐安排：<https://terryyyc.github.io/canteen-os/#/menu>

流水线是 [`.github/workflows/build-deploy.yml`](.github/workflows/build-deploy.yml)：validate → translate（有 `DEEPL_API_KEY` 才跑，译文由 bot 回写）→ build-data → vite build → Pages；任一步红即不部署。

### 开工

| 你是 | 先读 |
|---|---|
| Terry | [docs/plan-for-terry.md](docs/plan-for-terry.md) — 节奏、三道门、每周三件事 |
| AI agent | [AGENTS.md](AGENTS.md) → [docs/execution-brief.md](docs/execution-brief.md) — 冻结事项、任务、规则、接口契约 |
| 调度 agent | [docs/operating-model.md](docs/operating-model.md) — 波次派工、交接四行、审查跑命令 |
| 任何人 | [docs/project-summary.md](docs/project-summary.md) — 一页现状 |

任务在 [`.github/backlog/round-1.json`](.github/backlog/round-1.json)（38 个 issue，5 个里程碑，带完成定义与依赖；`node scripts/backlog-waves.mjs` 看可并行的波次）。同步到 GitHub：

```bash
gh auth login                              # 一次
node scripts/create-issues.mjs --dry-run   # 先看
node scripts/create-issues.mjs             # 建标签 / 里程碑 / issue / 依赖 / 跟踪 issue，幂等
```

本地验证现有成果：

```bash
pnpm install --frozen-lockfile
node scripts/prepare-team-image-tools.mjs               # 显式准备固定图片工具
node scripts/validate-schemas.mjs
pnpm -C packages/core test
pnpm -C packages/worker test
pnpm -C packages/web test
node --test packages/web/test/e2e/team-meals/api-contract.test.mjs
# 完整检查及同版资料构建顺序见 .github/workflows/ci.yml
```

### 模块地图

| 模块 | 说明 | 文档 |
|---|---|---|
| ① 菜品知识库 | Ingredient / Technique（单文件受控词表）/ Dish；允许不完整（只有名字也能导入），readiness 关卡：能教/能排/能采；一实体一文件、文件名即 ID | [docs/modules/knowledge-base.md](docs/modules/knowledge-base.md) |
| ② 团队计划与采购 | 按天/餐次排菜，基于已记录的配方汇总需求与缺项，由采购员人工确认并保存；旧版按包装计算的数值引擎仍以固定黄金夹具回归 | [docs/modules/procurement.md](docs/modules/procurement.md) |
| ③ 点餐/评分/反馈 | **deferred（ADR-0006）**，设计稿保留 | [docs/modules/feedback.md](docs/modules/feedback.md) |

### 两条护城河（开源空白）

- **菜单计划→采购单转换**：开源菜谱软件止步于"家庭购物清单"，ERP 止步于通用 BOM；中间的"菜单 × 净料率 × 备量系数 × 现有量 × 包装取整 × 起订量"无人做开源（详见调研报告）。
- **内容级三语（中文/English/Українська）**：不只是 UI 翻译——每个可展示实体（菜品、食材、技法、步骤）都携带 `{zh, en, uk}` 内容（见 [docs/i18n.md](docs/i18n.md)）。

### 视频导入（可扩展 skill）

"做菜视频 → `data/dishes/<菜>.json`（draft）+ `images/` 截帧 → git PR 审核入库"。Gemini 主 / Qwen 备（ADR-0006 裁决），yt-dlp 下载（Unlicense 裁决可用）；每个配料"被切的几秒"截帧写进 `prep.image`，步骤带视频片段 `clip`；技法输出闭集引用 `data/techniques.json`。契约见 [docs/video-import.md](docs/video-import.md) 与 [skills/video-recipe-ingest/SKILL.md](skills/video-recipe-ingest/SKILL.md)。

### 快速导航

- 产品需求：[docs/prd.md](docs/prd.md) ｜ 总体架构：[docs/architecture.md](docs/architecture.md)
- 决策记录：[docs/adr/](docs/adr/)（含团队用餐 ADR 与写入通道 ADR）
- 数据模型单一事实源：[schemas/](schemas/)（JSON Schema draft 2020-12；兼容旧资料并支持团队计划和采购清单）
- 知识库数据（通过校验）：[data/](data/)（当前种子与示例，不等于已完成真实厨房验收）
- 调研报告：[docs/research/](docs/research/)（开源调研 + v2 八场景调研）
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md) ｜ AI agent 规范：[AGENTS.md](AGENTS.md)

### 协作入口

本仓库为 spec-first：任何行为变更按 **schema → types → data → docs** 的顺序提交（见 CONTRIBUTING.md）。CI 用 ajv 校验 `data/` 与 `schemas/` 的一致性（含跨文件引用检查），本地可用 `python3 scripts/local-validate.py`。人类与 AI agent 一视同仁：同一套 PR checklist 与 CODEOWNERS 评审。

---

## English

**CanteenOS** keeps a team's meal plan, kitchen preparation and purchasing in one shared knowledge base. The chef plans meals or imports a menu, maintains dishes and ingredients, helpers read preparation instructions, and the buyer confirms and saves the shopping list. Incomplete recipes remain visible with explicit missing information; `data/` is stored in Git.

**Current source version: 0.3.0-alpha.1 (2026-09-13, prerelease).** The web app includes planning, preparation, meals, purchasing, dish/ingredient editing and publishing, with Chinese/English/Ukrainian UI, PWA support and QR links. Writes require an explicitly configured Cloudflare Worker; an unconfigured build stays read-only. The drawer shows the application version separately from the publication timestamp.

**Release boundary:** local product, API, browser and build evidence is available. A real Worker, isolated target environment, credentials, recipes and kitchen operations still need verification. This is not an accepted fully writable production release. See the [current integration status](feature-specs/2026-09-11-team-meals-dispatch.md), [release checklist](docs/field-test/week-43/ops-checklist.md) and [version history](CHANGELOG.md).

### Modules

1. **Dish knowledge base** — Ingredient / Technique (single-file controlled vocabulary) / Dish. Incomplete dishes allowed (a name alone imports); readiness gates: teach / plan / buy. One file per entity, filename = ID. See [docs/modules/knowledge-base.md](docs/modules/knowledge-base.md).
2. **Team planning and purchasing** — Plan dishes by day and meal, aggregate recorded recipe requirements and missing information, then let the buyer confirm and save the list. The legacy numeric procurement engine remains covered by fixed golden fixtures. See [docs/modules/procurement.md](docs/modules/procurement.md).
3. **Ordering / rating / feedback** — **deferred (ADR-0006)**; design kept at [docs/modules/feedback.md](docs/modules/feedback.md).

### Two differentiators (open-source gaps)

- **Menu-plan → purchase-order conversion**: recipe apps stop at household shopping lists; ERPs stop at generic BOMs. The middle ground (menus × yield × margin × stock × pack rounding × min-packs) is open-source greenfield.
- **Content-level trilingualism (zh / en / uk)**: not just UI translation — every displayable entity carries `{zh, en, uk}` content ([docs/i18n.md](docs/i18n.md)).

### Video import (extensible skill)

"Cooking video → `data/dishes/<dish>.json` (draft) + `images/` frames → merge PR to accept." Gemini primary / Qwen fallback; yt-dlp for downloads (Unlicense, ruled acceptable). Frames of "the seconds each ingredient is being cut" land in `prep.image`; steps carry video `clip` ranges; technique references are a closed set from `data/techniques.json`. Contract: [docs/video-import.md](docs/video-import.md) and [skills/video-recipe-ingest/SKILL.md](skills/video-recipe-ingest/SKILL.md).

### Quick links

- GitHub Pages (merging to `main` triggers deployment; check Actions and the drawer version for the deployed result): <https://terryyyc.github.io/canteen-os/> — [#/prep](https://terryyyc.github.io/canteen-os/#/prep) · [#/purchase](https://terryyyc.github.io/canteen-os/#/purchase) · [#/menu](https://terryyyc.github.io/canteen-os/#/menu)
- PRD: [docs/prd.md](docs/prd.md) ｜ Architecture: [docs/architecture.md](docs/architecture.md)
- Decisions: [docs/adr/](docs/adr/) (including team-meals and write-channel decisions)
- Single source of truth for data models: [schemas/](schemas/) (JSON Schema draft 2020-12)
- Knowledge-base data (validated): [data/](data/) (current seeds and examples; not a completed real-kitchen acceptance)
- Research reports: [docs/research/](docs/research/)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) ｜ AI agent rules: [AGENTS.md](AGENTS.md)

### How to collaborate

This repo is spec-first: submit behavioral changes in the order **schema → types → data → docs** (see CONTRIBUTING.md). CI validates `data/` against `schemas/` with ajv (including cross-file reference checks); locally run `python3 scripts/local-validate.py`. Humans and AI agents follow the same PR checklist and CODEOWNERS review.

---

## License

[Apache-2.0](LICENSE) — 选择理由见 [ADR-0002](docs/adr/0002-license-apache2.md)。
