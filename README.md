---
feature_ids: [team-meals, knowledge-base]
topics: [canteen-os, current-scope, getting-started]
doc_kind: project-entry
created: 2026-10-05
updated: 2026-10-14
---

# CanteenOS

> **团队用餐计划、备料与采购协作**，支持中文、English、Українська。
> **Meal planning, preparation and purchasing for a team**, in Chinese, English and Ukrainian.

---

## SQLite 知识库接入分支（2026-09-19）

本分支把日常菜谱管理接到独立 SQLite 知识库，入口为 `#/admin/knowledge`。同名菜谱各有独立身份，编辑保留历史版本；CanteenOS Worker 负责现有角色鉴权。`data/` 继续保存菜单、备料与采购使用的固定发布资料。知识库是独立工程；本仓接入代码不等于完整知识库部署源码。发行需单独核对配套源码包、manifest 和实际依赖版本。两者的版本边界见 [当前工作合同](docs/current-contract.md) 和 [ADR-0009](docs/adr/0009-sqlite-knowledge-base.md)。

This integration branch adds a SQLite recipe library at `#/admin/knowledge`, behind the existing role-based gateway. Existing meal plans keep their fixed Git publication data; recipe edits do not silently change those plans.

Ця гілка додає бібліотеку рецептів SQLite (`#/admin/knowledge`) з чинною перевіркою ролей. Плани харчування зберігають фіксовані опубліковані дані Git; редагування рецептів не змінює їх автоматично.

## 中文

**CanteenOS** 把团队每天吃什么、厨房如何备料、采购员需要确认购买什么放在同一套资料里。师傅排菜或粘贴导入菜单，维护菜品和食材；团队查看用餐安排，帮厨查看备料，采购员人工确认并保存采购清单。日常菜谱和来源证据以 SQLite 为真源，`data/` 保存显式固定的 Git 发布资料和旧数据；允许不完整资料并明确显示缺项。

**当前分支源码版本：0.3.0-alpha.4（2026-10-05，工程预发布）。** 师傅后台可查看抖音菜谱候选的完整食材、步骤、来源及待核验项；人工确认后可建立正式菜谱、固定版本，并排入本周菜单。来源截图只供有权限的师傅在审核和编辑时参考；使用权未核实的图片不会自动进入帮厨或顾客页面。原片通过来源链接查看，应用内完整视频播放尚未实现。写入通过显式配置的 Worker，未配置时为只读。抽屉里的应用版本与资料更新时间分开显示。

**本版工作流：** 完整来源或手工菜谱 → 普通正式菜谱编辑 → 厨房核定 → 明确采用版本 → 所选菜单计划保存、发布 → 同版菜单与备料 → 人工确认采购并保存/重开。标准食材按明确身份合并，采购规格和技法保留不可变版本；未知量、单位、净料率和时间显示待补，不补成数字。知识库配套版本为 **0.1.2（schema 6）**，以单独私有源码包交付。具体复跑与验收边界见 [alpha.4 发行说明](docs/releases/alpha4.md) 和 [#128](https://github.com/TERRYYYC/canteen-os/issues/128)。真实候选仍待师傅逐条确认；本机工程副本、源码合入与远端部署各自有独立回执，当前文档不宣称真实厨房已投入使用。

知识库菜谱列表、明细和历史可能包含来源原文与媒体地址，现仅师傅和管理员令牌可读；采购角色仍可使用已发布的菜单、备料与采购数据。

### 打开

GitHub Pages 地址如下。成功合并到 `main` 会触发发布工作流；以实际 Actions 结果和抽屉版本为准，源码版本不代表该版本已经部署：

- 备料单：<https://terryyyc.github.io/canteen-os/#/prep>
- 采购单：<https://terryyyc.github.io/canteen-os/#/purchase>
- 团队用餐安排：<https://terryyyc.github.io/canteen-os/#/menu>

流水线是 [`.github/workflows/build-deploy.yml`](.github/workflows/build-deploy.yml)：validate → translate（有 `DEEPL_API_KEY` 才跑，译文由 bot 回写）→ build-data → vite build → Pages；任一步红即不部署。

### 开工

| 你是 | 先读 |
|---|---|
| Terry / 任何人 | [当前工作合同](docs/current-contract.md) → [项目摘要](docs/project-summary.md) |
| AI agent | [AGENTS](AGENTS.md) → 当前工作合同 → 本次 issue → 对应 schema/API/页面合同 |
| 调度 agent | [当前 issues](https://github.com/TERRYYYC/canteen-os/issues) → [工作模式的当前补充](docs/operating-model.md)；[#128](https://github.com/TERRYYYC/canteen-os/issues/128) 保留 alpha.4 工程验收与发行回执 |
| 页面实施者 | [设计索引](docs/design/README.md) → [D0 小团队页面合同](docs/design/team-meals-pages/D0-contract.md) |

当前任务以实际 GitHub issue 为准；`.github/backlog/round-1.json` 和波次脚本是第一轮历史计划，不是当前全部 issue 的生成真源。[旧执行简报](docs/execution-brief.md) 与 [给 Terry 的旧排期](docs/plan-for-terry.md) 保留兼容和历史依据，不恢复固定人数、材料数或旧视觉目标。

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
| ① 菜品知识库 | SQLite 中的候选、Recipe 与不可变修订；显式采用版本固定到 Git，旧 Ingredient/Technique/Dish 保留兼容 | [docs/modules/knowledge-base.md](docs/modules/knowledge-base.md) |
| ② 团队计划与采购 | 按天/餐次排菜，基于已记录的配方汇总需求与缺项，由采购员人工确认并保存；旧版按包装计算的数值引擎仍以固定黄金夹具回归 | [docs/modules/procurement.md](docs/modules/procurement.md) |
| ③ 点餐/评分/反馈 | **deferred（ADR-0006）**，设计稿保留 | [docs/modules/feedback.md](docs/modules/feedback.md) |

### 两条护城河（开源空白）

- **菜单计划→采购单转换**：开源菜谱软件止步于"家庭购物清单"，ERP 止步于通用 BOM；中间的"菜单 × 净料率 × 备量系数 × 现有量 × 包装取整 × 起订量"无人做开源（详见调研报告）。
- **内容级三语（中文/English/Українська）**：不只是 UI 翻译——每个可展示实体（菜品、食材、技法、步骤）都携带 `{zh, en, uk}` 内容（见 [docs/i18n.md](docs/i18n.md)）。

### 视频导入与来源审核

真实媒体及分析缓存保留来源和 media hash，候选进入 SQLite 收件箱等待师傅阅读审核。正式菜谱仍需厨房核定和明确版本采用，之后才形成 Git 固定依赖用于计划发布。Git PR 是工程变更/固定资料的交付载体，不是日常候选的厨师审核队列；合并 PR 不批准菜谱。原方未知量保持未知，原片参考图与可公开菜照分开。旧 JSON 输出契约和解析 skill 仍是兼容资料，见 [知识库模块](docs/modules/knowledge-base.md)、[视频导入历史规范](docs/video-import.md) 与 [解析 skill](skills/video-recipe-ingest/SKILL.md)。

### 快速导航

- 当前范围与架构边界：[当前工作合同](docs/current-contract.md)；历史 PRD / 总体架构：[docs/prd.md](docs/prd.md) / [docs/architecture.md](docs/architecture.md)
- 决策记录：[docs/adr/](docs/adr/)（含团队用餐 ADR 与写入通道 ADR）
- 数据模型单一事实源：[schemas/](schemas/)（JSON Schema draft 2020-12；兼容旧资料并支持团队计划和采购清单）
- Git 固定资料与旧种子：[data/](data/)（不等于日常 SQLite 库或真实厨房验收）
- 调研报告：[docs/research/](docs/research/)（开源调研 + v2 八场景调研）
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md) ｜ AI agent 规范：[AGENTS.md](AGENTS.md)

### 协作入口

欢迎人类与 AI agent 一起建设 CanteenOS：**提出问题 → 确认范围与验收 → 独立分支实施 → PR → 非作者审查 → 合入与状态回执**。外部贡献者使用 Fork + PR，有写权限的协作者使用本仓分支 + PR。完整步骤、[本地只读预览](CONTRIBUTING.md#3-本地环境与只读预览)、任务交接与菜谱来源贡献见 [合作指南](CONTRIBUTING.md)。

涉及 Git 实体结构时遵循 **schema → types → data → docs**；纯实现或文档只更新实际受影响项。菜谱来源先作为候选核查，GitHub PR 合并不代替厨房核定。CI 校验 `data/` 与 `schemas/` 的一致性；当前任务以实际 issue 为准。

---

## English

**CanteenOS** keeps a team's meal plan, kitchen preparation and purchasing in one shared knowledge base. The chef plans meals or imports a menu, maintains dishes and ingredients, helpers read preparation instructions, and the buyer confirms and saves the shopping list. Incomplete recipes remain visible with explicit missing information. SQLite owns daily recipes and source evidence; Git stores explicitly frozen publication data and legacy records.

**Current branch source version: 0.3.0-alpha.4 (2026-10-05, engineering prerelease).** The chef can read a Douyin recipe candidate's complete ingredients, steps, source and unresolved questions, then explicitly create a recipe, freeze a version and schedule it into the current week. Source frames remain chef-only references while rights are unresolved; they do not automatically enter helper or guest pages. The original video is available through its source link, not an in-app full-video player. Writes require an explicitly configured Worker; an unconfigured build stays read-only. The drawer shows the application version separately from the publication timestamp.

**This workflow:** complete source or manual recipe → normal versioned recipe editor → kitchen confirmation → explicit version adoption → selected plan save/publication → matching menu/preparation → manual shopping decisions saved and reopened. Explicit standard ingredient identities merge; purchasing specifications and techniques keep immutable revisions. Unknown quantities, units, yields and timings stay unknown. Companion KB **0.1.2 (schema 6)** is delivered as a separate private source package. See [alpha.4 release notes](docs/releases/alpha4.md) and [#128](https://github.com/TERRYYYC/canteen-os/issues/128) for reproduction and acceptance evidence. Engineering-copy approval, merging source and remote deployment are distinct; actual candidates still need chef approval.

### Modules

1. **Recipe knowledge base** — SQLite candidates, recipes and immutable revisions; explicitly adopt a version to freeze complete Git publication dependencies. Legacy Ingredient/Technique/Dish data remains compatible. See [docs/modules/knowledge-base.md](docs/modules/knowledge-base.md).
2. **Team planning and purchasing** — Plan dishes by day and meal, aggregate recorded recipe requirements and missing information, then let the buyer confirm and save the list. The legacy numeric procurement engine remains covered by fixed golden fixtures. See [docs/modules/procurement.md](docs/modules/procurement.md).
3. **Ordering / rating / feedback** — **deferred (ADR-0006)**; design kept at [docs/modules/feedback.md](docs/modules/feedback.md).

### Two differentiators (open-source gaps)

- **Menu-plan → purchase-order conversion**: recipe apps stop at household shopping lists; ERPs stop at generic BOMs. The middle ground (menus × yield × margin × stock × pack rounding × min-packs) is open-source greenfield.
- **Content-level trilingualism (zh / en / uk)**: not just UI translation — every displayable entity carries `{zh, en, uk}` content ([docs/i18n.md](docs/i18n.md)).

### Video evidence and chef review

Preserve source/media hashes and reuse completed analysis caches. Candidates enter the SQLite inbox for explicit chef review, kitchen confirmation and version adoption; adopted dependencies are frozen into Git for publication. Merging an engineering PR does not approve a recipe. Unknown amounts stay unknown, and private source frames are separate from licensed public dish images. See the [knowledge-base module](docs/modules/knowledge-base.md); the [legacy JSON import contract](docs/video-import.md) and [ingest skill](skills/video-recipe-ingest/SKILL.md) remain compatibility references.

### Quick links

- GitHub Pages (merging to `main` triggers deployment; check Actions and the drawer version for the deployed result): <https://terryyyc.github.io/canteen-os/> — [#/prep](https://terryyyc.github.io/canteen-os/#/prep) · [#/purchase](https://terryyyc.github.io/canteen-os/#/purchase) · [#/menu](https://terryyyc.github.io/canteen-os/#/menu)
- Current scope and authority: [current work contract](docs/current-contract.md); historical [PRD](docs/prd.md) / [architecture](docs/architecture.md)
- Decisions: [docs/adr/](docs/adr/) (including team-meals and write-channel decisions)
- Single source of truth for data models: [schemas/](schemas/) (JSON Schema draft 2020-12)
- Frozen Git publication data and legacy seeds: [data/](data/) (separate from the daily SQLite library and real-kitchen acceptance)
- Research reports: [docs/research/](docs/research/)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) ｜ AI agent rules: [AGENTS.md](AGENTS.md)

### How to collaborate

Humans and AI agents follow the same collaboration flow: **problem → agreed scope and verification → branch → PR → non-author review → merge and status evidence**. External contributors use a fork; collaborators may use a branch in this repository. See [Contributing](CONTRIBUTING.md) for local preview, issue types, handoff and recipe-source contributions.

Git entity changes follow **schema → types → data → docs**; implementation-only and documentation changes update the affected parts. Recipe sources require explicit kitchen confirmation and version adoption; merging a PR does not approve a recipe. CI validates Git data against schemas, and live GitHub issues are the current task queue.

---

## License

[Apache-2.0](LICENSE) — 选择理由见 [ADR-0002](docs/adr/0002-license-apache2.md)。
