---
feature_ids: [team-meals, knowledge-base]
topics: [agent-workflow, current-scope, authority]
doc_kind: agent-entry
created: 2026-10-05
---

# AGENTS.md — AI Coding Agent 协作规范

> 本文件是给 AI coding agent（Claude Code / Codex / Kimi / Cursor 等）的仓库协作契约。
> 人类贡献者请读 [CONTRIBUTING.md](CONTRIBUTING.md)；两份文件冲突时以更严格的为准。
>
> **当前开工顺序：先读 [docs/current-contract.md](docs/current-contract.md)、本次 issue 全文及其 schema/API/页面合同。** [第一轮执行简报](docs/execution-brief.md) 保留历史范围和兼容记录；其中旧视觉、无数据库、固定排期与 backlog 波次不覆盖后续已接受目标。本文的许可证、凭据保护、数据一致性和独立审查约束继续有效。

---

## 1. 仓库地图（改代码前先看这里）

| 路径 | 内容 | 变更影响面 |
|---|---|---|
| `schemas/` | JSON Schema draft 2020-12，**单一事实源**（5 实体，见 ADR-0006） | 牵动 types / data / docs / CI |
| `data/` | Git 固定发布依赖、菜单/采购工作记录和旧数据；日常 Recipe/Candidate 位于独立 SQLite 知识库 | Git 数据由 CI 校验；两真源不自动双向同步 |
| `packages/core/` | `@canteenos/core`：类型 + 采购引擎 + 三个渲染器 + readiness（已实现，23 测试） | 依赖 schemas 语义；改数字须手算 |
| `packages/web/` | Vite 页面及师傅后台；当前小团队视觉来源与专用页面合同见设计索引 | 首屏 JS ≤ 60 KB gzip，无 UI/CSS 框架 |
| `packages/worker/` | Git 数据写入/发布及受控 SQLite 知识库网关；各通道权限和版本边界分开 | 见 ADR-0007/0009/0010 与对应 API 合同 |
| `docs/design/` | 当前 Reference v3 小团队目标、专用页面合同与历史稿索引；PR #91 十画板仍为提案 | 按当前适用合同对照设计，不追认全部签收 |
| `docs/current-contract.md` | 当前小团队目标、数据真源、设计来源和 #128 验收入口 | 新实施的范围入口 |
| `docs/execution-brief.md` | 第一轮历史执行简报与兼容依据 | 旧范围不覆盖当前合同 |
| `docs/plan-for-terry.md` | 第一轮排期、三道门和厨房验收的历史记录 | 当前日期/任务状态以实际对象和本次合同为准 |
| `docs/field-test/` | 真人测试材料与日志 | 测试周只读代码、只写日志 |
| `.github/backlog/round-1.json` | 第一轮历史任务清单和波次工具输入 | 不代表当前全部 GitHub issue，不用于重建当前队列 |
| `docs/operating-model.md` | 工作模式：调度 thread + 子 thread，派工 / 交接 / 审查 / 节拍 | 领任务、交付格式以此为准 |
| `docs/prd.md` | 第一轮历史产品需求；当前范围见 current-contract | 新需求取舍仍需 owner 评审 |
| `docs/architecture.md` | 历史架构；当前 SQLite/Git 分工见 current-contract、ADR-0009/0010 | 新架构决策仍按 ADR 流程 |
| `docs/i18n.md` | 内容级三语设计 | 涉及所有 I18nString |
| `docs/modules/` | 模块文档（feedback 已 deferred，见 ADR-0006） | 模块行为的事实源 |
| `docs/video-import.md` | 视频解析 skill 规范 | 与 skills/ 契约联动 |
| `docs/adr/` | 架构决策记录（只增不改，废弃用新 ADR 标记） | 新决策追加文件 |
| `docs/research/` | 前期调研报告（只读，作为引用依据） | 不改 |
| `skills/video-recipe-ingest/` | 解析 skill 输入/输出契约 | 供云端/agent 实现 |
| `scripts/validate-schemas.mjs` | CI 校验脚本（ajv 校验 data/ ↔ schemas/） | 改 DATA_TARGETS 映射时同步 |
| `.github/` | issue 模板、PR 模板、CI workflow | 流程变更需 owner 评审 |

## 2. 改代码前必读文件（按任务类型）

- **改任何实体字段** → 先读对应 `schemas/*.schema.json` + `docs/i18n.md` + `docs/modules/` 对应模块文档
- **改采购逻辑** → `docs/modules/procurement.md` + `docs/adr/0005-procurement-engine-design.md` + `docs/adr/0006-scope-reduction-v2.md`
- **改视频导入契约** → `docs/video-import.md` + `skills/video-recipe-ingest/SKILL.md` + `schemas/dish.schema.json`
- **改任何页面** → 先读 `docs/design/README.md` + 当前适用设计/页面/API 合同；小团队四页使用 Reference v3 目标和 D0 合同，旧稿只用于历史兼容
- **改采购数字或 data/ 里的份数/包装/价格** → PR 必附手算算式（`docs/execution-brief.md` §4.2）
- **领任务** → 读实际 GitHub issue 与 #128 依赖；按调度分工和本次明确文件范围实施，避免共享文件争用；旧 round-1 JSON 不作为当前队列真源
- **提新架构决策** → `docs/adr/0001-adr-process.md`（流程与模板）；第一轮每版最多一篇新 ADR

## 3. 变更顺序（硬性）

```
schema → types → data → docs
```

详见 CONTRIBUTING.md 第一节。**不要**先写实现再补 schema。CI 会校验 data↔schemas 一致性；若本地无 Node/依赖，至少保证 JSON 字段名与 schema 逐字一致，并在 PR 中说明。

## 4. 禁止事项（违反一律打回）

1. ❌ 不引入 AGPL / GPL / Commons Clause / 无许可证依赖或代码（Mealie、Tandoor、KitchenOwl、RecipeSage 均在此列；只可借鉴模型概念）。
2. ❌ 不提交密钥、token、cookie、内部域名/URL；`.env` 已在 .gitignore。
3. ❌ 不把可展示文本建成单语言 string 字段——一律 `I18nString {zh, en, uk}`（至少其一）。
4. ❌ 不在 Dish.components 内联食材字符串——必须 `ingredientRef` 引用 Ingredient。
5. ❌ 不绕过 `Quantity {value, unit}` 结构存裸数字或拼接字符串（如 `"300g"`）。
6. ❌ 不修改 `docs/research/` 下调研报告（只读史料）；不改已有 ADR 内容（用新 ADR 废弃）。
7. ❌ 不破坏 data 与 schemas 的一致性（CI 红线）。
8. ❌ 不伪造调研数据/来源 URL；引用以 `docs/research/` 调研报告为准。

## 5. 给 agent 的工作方式建议

- 任务先拆成"schema / types / data / docs"四类变更，分别列在 PR 描述里。
- 数字必须自洽：data/ 中 PO 各行的 packs / qty / amount 与 trace（netNeed → ÷yield → ×margin → −onHand → ÷packSize 向上取整 → minPacks）要能从 menu-plan + dish + ingredient 数据推导出来。
- 写文档时优先引用仓库内文件相对路径，避免外部 URL 失效。
- 不确定的开放问题写进对应文档的 "Open Questions" 小节，不要自行拍脑袋定死。
- 多 agent 并行时按目录认领（见 CODEOWNERS），避免同一 PR 混合多模块变更。
