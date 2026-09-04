# AGENTS.md — AI Coding Agent 协作规范

> 本文件是给 AI coding agent（Claude Code / Codex / Kimi / Cursor 等）的仓库协作契约。
> 人类贡献者请读 [CONTRIBUTING.md](CONTRIBUTING.md)；两份文件冲突时以更严格的为准。

---

## 1. 仓库地图（改代码前先看这里）

| 路径 | 内容 | 变更影响面 |
|---|---|---|
| `schemas/` | JSON Schema draft 2020-12，**单一事实源** | 牵动 types / examples / docs / CI |
| `examples/` | 每个 schema 至少 1 个通过 ajv 校验的样例 | CI 直接校验 |
| `packages/core/` | `@canteenos/core`：TS 类型 + 采购引擎纯函数骨架 | 依赖 schemas 语义 |
| `docs/prd.md` | 产品需求 | 需求级变更需 owner 评审 |
| `docs/architecture.md` | 总体架构与路线图 | 架构变更须先写 ADR |
| `docs/i18n.md` | 内容级三语设计 | 涉及所有 I18nString |
| `docs/modules/` | 三大模块详细设计 | 模块行为的事实源 |
| `docs/video-import.md` | 视频解析 skill 规范 | 与 skills/ 契约联动 |
| `docs/adr/` | 架构决策记录（只增不改，废弃用新 ADR 标记） | 新决策追加文件 |
| `docs/research/` | 前期调研报告（只读，作为引用依据） | 不改 |
| `skills/video-recipe-ingest/` | 解析 skill 输入/输出契约 | 供云端/agent 实现 |
| `scripts/validate-schemas.mjs` | CI 校验脚本 | 改前缀映射时同步 |
| `.github/` | issue 模板、PR 模板、CI workflow | 流程变更需 owner 评审 |

## 2. 改代码前必读文件（按任务类型）

- **改任何实体字段** → 先读对应 `schemas/*.schema.json` + `docs/i18n.md` + `docs/modules/` 对应模块文档
- **改采购逻辑** → `docs/modules/procurement.md` + `docs/adr/0005-procurement-engine-design.md`
- **改视频导入契约** → `docs/video-import.md` + `skills/video-recipe-ingest/SKILL.md` + `schemas/dishpack.schema.json`
- **提新架构决策** → `docs/adr/0001-adr-process.md`（流程与模板）

## 3. 变更顺序（硬性）

```
schema → types → examples → docs
```

详见 CONTRIBUTING.md 第一节。**不要**先写实现再补 schema。CI 会校验 examples↔schemas 一致性；若本地无 Node/依赖，至少保证 JSON 字段名与 schema 逐字一致，并在 PR 中说明。

## 4. 禁止事项（违反一律打回）

1. ❌ 不引入 AGPL / GPL / Commons Clause / 无许可证依赖或代码（Mealie、Tandoor、KitchenOwl、RecipeSage 均在此列；只可借鉴模型概念）。
2. ❌ 不提交密钥、token、cookie、内部域名/URL；`.env` 已在 .gitignore。
3. ❌ 不把可展示文本建成单语言 string 字段——一律 `I18nString {zh, en, uk}`（至少其一）。
4. ❌ 不在 Dish.components 内联食材字符串——必须 `ingredientRef` 引用 Ingredient。
5. ❌ 不绕过 `Quantity {value, unit}` 结构存裸数字或拼接字符串（如 `"300g"`）。
6. ❌ 不修改 `docs/research/` 下调研报告（只读史料）；不改已有 ADR 内容（用新 ADR 废弃）。
7. ❌ 不破坏 examples 与 schemas 的一致性（CI 红线）。
8. ❌ 不伪造调研数据/来源 URL；引用以 `docs/research/` 两份报告为准。

## 5. 给 agent 的工作方式建议

- 任务先拆成"schema / types / examples / docs"四类变更，分别列在 PR 描述里。
- 数字示例必须自洽：examples 中 PO 的 qty/packageCount/amount 要能从 menu-plan + dish + ingredient + supplier 数据推导出来。
- 写文档时优先引用仓库内文件相对路径，避免外部 URL 失效。
- 不确定的开放问题写进对应文档的 "Open Questions" 小节，不要自行拍脑袋定死。
- 多 agent 并行时按目录认领（见 CODEOWNERS），避免同一 PR 混合多模块变更。
