---
feature_ids: [team-meals, knowledge-base]
topics: [collaboration, contributing, getting-started, review]
doc_kind: collaboration-guide
created: 2026-10-14
---

# 一起建设 CanteenOS / Contributing

CanteenOS 服务小团队每天吃什么、厨房怎么备料、采购员需要确认买什么。欢迎报告问题、讨论功能、改进设计与文档、提交代码，以及提供有来源的菜谱资料。人类贡献者和 AI agent 使用同一套 issue、PR 与验收流程。

**English.** Start with the current scope and the problem you want to solve. External contributors use a fork and pull request; collaborators may use a branch in this repository. Material changes need an agreed scope, relevant verification and a reviewer other than the author. Recipe evidence remains a candidate until explicit kitchen confirmation and version adoption; merging a GitHub PR does not approve a recipe.

## 1. 从这里开始

1. 读 [README](README.md)，了解当前能力与使用入口。
2. 读 [当前工作合同](docs/current-contract.md)，确认角色、范围、数据与版本边界；AI agent 同时读 [AGENTS.md](AGENTS.md)。
3. 查 [现有 issues](https://github.com/TERRYYYC/canteen-os/issues) 和 [未合并 PR](https://github.com/TERRYYYC/canteen-os/pulls)，避免重复工作。准备改页面时，再读 [设计索引](docs/design/README.md) 和对应页面/API 合同。

当前任务以实际 GitHub issue 为准。`.github/backlog/round-1.json`、第一轮波次与旧里程碑保留作历史记录，不用于覆盖或重建当前队列。[#128](https://github.com/TERRYYYC/canteen-os/issues/128) 保留 alpha.4 工程验收与发行回执；它不代表真实师傅已经批准候选或正式服务已经激活。

| 想参与什么 | 从哪里提交 | 需要讲清楚什么 |
|---|---|---|
| 报告缺陷 | [Bug Report](https://github.com/TERRYYYC/canteen-os/issues/new?template=bug_report.yml) | 角色、页面、环境、复现步骤、预期与实际结果，脱敏后的截图或日志 |
| 提议功能或流程改进 | [Feature Request](https://github.com/TERRYYYC/canteen-os/issues/new?template=feature_request.yml) | 谁在什么工作场景遇到问题、期望结果、范围和备选方案 |
| 实施已接受的任务 | [Task](https://github.com/TERRYYYC/canteen-os/issues/new?template=task.yml) 或已有 issue | 责任人、依赖、涉及文件、可观察的完成条件 |
| 提供菜谱、食材或技法资料 | [菜谱与资料贡献](https://github.com/TERRYYYC/canteen-os/issues/new?template=dish_contribution.yml) | 来源、原文、已知资料、未核实项及使用权情况 |
| 改进文档或明确的小修复 | 直接开 PR，关联已有 issue（如有） | 改了什么、为什么、如何验证 |

实质新功能或范围变化先通过 issue 讨论，再由维护者确认范围、依赖与验收方式。已有 issue 或本次协作中明确接受的范围可以继续实施；拼写、链接等明确的小改动可直接提 PR。任务沿用 GitHub issue 号，不需要贡献者自行分配另一套 Feature 编号。

## 2. Fork、分支与 Pull Request

没有本仓写权限的贡献者使用 **Fork + PR**：

可以在 GitHub 网页点击 **Fork**，克隆自己的仓库、提交分支，再点 **Compare & pull request**，将目标设为 `TERRYYYC/canteen-os` 的 `main`。下面的命令方式需要另外安装 GitHub CLI（`gh`），并先用 `gh auth login` 登录；不使用 CLI 也能通过网页完成 Fork 与 PR。

```bash
gh repo fork TERRYYYC/canteen-os --clone
cd canteen-os
git remote -v
git switch -c feat/menu-summary

# 按第 3 节准备环境，修改并执行与改动相关的检查。
# 只暂存本次涉及的变更；新文件需按路径另行 git add。
git add -p
git commit -m "feat(menu): explain the selected meal"
git push -u origin feat/menu-summary
gh pr create --repo TERRYYYC/canteen-os --base main
```

确认 `origin` 指向自己的 fork，`upstream` 指向 `TERRYYYC/canteen-os`；已有 clone 缺少 upstream 时，再添加 `https://github.com/TERRYYYC/canteen-os.git`。从 upstream 的最新 main 开始任务；已有修改先安全保留，再按当前分支情况同步，避免覆盖自己的工作。

有写权限的协作者可从本仓最新 `main` 建独立分支，推送该分支后提 PR。代码和脚本使用独立 worktree；文档也应避开已有未提交修改和同路径争用。不要直接在使用中的运行目录修改或替换用户数据。

分支名使用 `feat/<scope>-<描述>`、`fix/<scope>-<描述>`、`docs/<描述>` 等；Codex 新分支默认使用 `codex/<描述>`。提交信息使用 `feat`、`fix`、`docs`、`refactor`、`test` 或 `chore` 等类型，例如 `fix(prep): distinguish recorded text from missing quantity`。

## 3. 本地环境与只读预览

需要 Git、Node.js **20 或更高**、pnpm **9.15.0**。固定图片工具的准备支持 macOS/Linux 的 arm64/x64，需要网络及 `cc`、`make`、`tar`。在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
node scripts/prepare-team-image-tools.mjs
pnpm -C packages/core build
node scripts/build-data.mjs --target team-meals --revision "$(git rev-parse HEAD)"
SITE_URL=http://127.0.0.1:4173/ pnpm -C packages/web build
pnpm -C packages/web preview --host 127.0.0.1 --port 4173 --strictPort
```

打开 <http://127.0.0.1:4173/#/menu>；备料与采购入口为 `#/prep`、`#/purchase`。需要前端热更新时，在以上资料已生成后使用 `pnpm -C packages/web dev --host 127.0.0.1 --port 5173 --strictPort`。

- `team-meals` 构建读取指定 **Git commit 中的资料**。修改 `data/` 后，要在自己的分支提交并重新生成资料；dev server 不会自动更新发布资料。
- `SITE_URL` 指定本地二维码地址；不设置时，二维码使用公开 Pages 地址。
- 未配置 Worker 时，这只是固定资料的只读预览，不能保存采购判断、编辑日常知识库或发布菜单。
- 本项目的开发服务避开 Clowder AI 保留端口 3003/3004。若额外服务需要 Redis，使用开发端口 6398，不连接生产端口 6399。

完整可写运行需要显式配置 Worker 和独立 SQLite 知识库。公开仓库不包含私有知识库源码包、日常数据库或媒体资料。配置入口见 [web 环境变量示例](packages/web/.env.example)、[alpha.4 配套与发行说明](docs/releases/alpha4.md)、[运行核查清单](docs/field-test/week-43/ops-checklist.md)。`VITE_*` 会进入浏览器产物，只能放可公开的配置，不能放凭据。

## 4. 讨论、实施与独立审查

```text
issue / 已接受需求 → 确认范围与验收 → 独立分支实施 → 作者自检
                 → PR → 非作者审查 → 修正与复验 → 合入及状态回执
```

| 角色 | 负责什么 |
|---|---|
| Terry / 维护者 | 产品范围、优先级与设计取舍；明确合入、部署和厨房验收的授权范围 |
| 调度 | 核对需求、拆依赖、协调共享文件、核查证据与完成状态 |
| 实施者 | 在约定范围实施、保留用户状态、完成相关检查，说明未完成项 |
| 非作者 reviewer | 对最终变更检查相关代码、合同、数据或真实页面；同一人不能审查自己的代码 |

调度与实施、测试分开；一个任务明确一个实施责任人和非作者 reviewer。开工前确认相关 PR 的实际文件范围；发现重叠时通过当前协作渠道协调。不要把“创建了任务、推送了分支或开了 PR”记成完成。

交接使用 **What / Why / Tradeoff / Open Questions / Next Action**，附 PR、精确 commit、检查结果和必要截图。收到反馈后，修正并复验受影响路径；新问题单独记录，不悄悄扩大本次范围。缺陷先复现、查明原因，再用能捕获该问题的失败检查验证修复。

## 5. 合同、数据与菜谱贡献

`schemas/` 是受控 Git 实体的数据合同；日常 Candidate、Recipe、不可变修订和来源证据由独立 SQLite 知识库管理。涉及 Git 实体结构时按 **schema → types → data → docs** 同步，保留跨文件引用和旧资料兼容。纯实现或文档改动只更新实际受影响项，不为了流程新增字段或数据。破坏性变更必须标注 `BREAKING`，说明迁移与回滚方式。

菜谱资料遵循：**来源候选 → 完整阅读与核查 → 正式菜谱编辑 → 厨房核定 → 明确采用版本 → 计划与发布资料**。GitHub issue 可以提供公开资料与来源线索；私有原片、截图、审核备注和日常候选通过受控知识库入口处理。受控种子、兼容资料或发布依赖的工程贡献才按对应 schema 进入 `data/`。合并 PR 不代替厨房核定，也不自动批准菜谱或公开来源图片。

- 保留原方与厨房修订的各自来源。用量、份数、时间、单位、净料率等未知时保持未知，不默认补 1、50 或虚构“适量”。
- 结构化数量使用 `Quantity {value, unit}`；原文用量单独保留。`Dish.components` 通过 `ingredientRef` 引用食材，不用同名字符串代替身份。
- 可展示的实体内容使用 `I18nString {zh, en, uk}`，至少一种语言；界面文案按现有中英乌本地化约定处理，不伪造未核实译文。
- 采用与发布固定明确版本；新编辑不能静默改变旧菜单、采购单来源基线或人工判断。保护权限、条件写入、冲突、未知保存结果与未保存输入。
- 涉及采购计算、包装或金额的变更，附逐行手算和相关回归，由非作者独立核对。

## 6. 验证与 PR 内容

按变更影响选择检查，完整 CI 顺序见 [ci.yml](.github/workflows/ci.yml)。下面是常用命令，不是要求每个文档 PR 全部运行：

| 改动 | 常用检查 |
|---|---|
| schema / Git 数据 / 类型 | `node scripts/validate-schemas.mjs`；`node scripts/check-types-vs-schema.mjs` |
| core / 采购计算 | `pnpm -C packages/core test`，以及受影响数字的手算 |
| Worker / 权限 / 写入合同 | `pnpm -C packages/worker test`，再核查受影响接口 |
| Web | 先构建 core 与 Worker，再运行 `pnpm -C packages/web typecheck`、`pnpm -C packages/web test`、`node --test packages/web/test/e2e/team-meals/api-contract.test.mjs`；页面变化补真实操作与截图 |
| 脚本 | `node --test scripts/*.test.mjs`，或与改动对应的测试文件 |
| 文档与模板 | 检查事实、命令、链接、YAML 结构和与当前合同的一致性 |

Web 测试依赖生成产物，可用 `pnpm -C packages/core build`、`pnpm -C packages/worker build` 先准备。公共 clone 未配置 `KB_SOURCE_ROOT` 时，实际 SQLite 相关用例会跳过；报告跳过与失败原因，不把部分检查写成完整知识库验收。

PR 写清：**问题与修改后的行为、具体变更、检查命令和结果、未完成项、关联 issue**。页面变化注明角色、语言、设备尺寸和关键状态；资料或版本变化说明兼容、迁移与回滚。仅当本 PR 覆盖整个 issue 的完成条件时使用 `Closes #编号`；部分工作使用 `Refs #编号` 并保留剩余任务。

合入由维护者按当前授权、独立审查和相关 CI 结果处理。分别记录源码合入、实际部署、工程复验与真实厨房验收；绿色 CI 或工程副本中的审核操作不能代替线上服务核实或真实师傅批准。

## 7. 资料、许可证与沟通

不提交密钥、token、cookie、私有服务地址、数据库或私有媒体。截图和日志先脱敏，保留可公开的来源引用与可复核证据；不得编造调研数据或来源。图片使用权未核实，不自动公开。

遵守 [ADR-0002](docs/adr/0002-license-apache2.md) 与现有许可证约束：新增依赖默认采用 OSI 认可的宽松许可证（如 MIT、Apache-2.0、BSD），LGPL 需个案评审。不复制或引入 GPL/AGPL、Commons Clause、source-available 或无许可证代码和依赖。新增依赖注明来源、版本和许可证，不确定时由维护者审查。历史调研保持原文，已有 ADR 通过新 ADR 补充或废弃。

issue / PR 可用中文或英文；涉及乌克兰语时保留原文并附说明。讨论围绕具体角色、行为和证据，开放问题写在 issue / PR 中，重要结论进入仓库文档。入门说明维护在本指南与 README；开放 issue 用于仍需处理的工作。

本指南借鉴 [Clowder AI 的合作入口](https://github.com/zts212653/clowder-ai/issues/1)及其[迁入文档的说明](https://github.com/zts212653/clowder-ai/issues/1#issuecomment-4231491469)，按 CanteenOS 当前范围改写。
