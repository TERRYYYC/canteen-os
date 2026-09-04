# ADR-0003: Spec-first Monorepo，以 JSON Schema 为单一事实源

> **English summary.** CanteenOS is a spec-first pnpm-workspaces monorepo. JSON Schemas (draft 2020-12) under `schemas/` are the single source of truth; TypeScript types, validated examples, docs, and future implementations all derive from them. Changes land in the fixed order schema → types → examples → docs, enforced by CI (ajv validation) and CODEOWNERS review.

- Status: Accepted（2026-10）
- Deciders: @TERRYYYC

## Context

协作背景特殊：**多个人类 + 多个 AI agent 并行开发**。此类协作的最大风险是"事实源漂移"——文档、类型、实现各自演化，最终互相矛盾。同时产品的核心资产恰恰是数据模型（内容级三语、菜单→采购链路），模型先行比实现先行更符合当前阶段（阶段 0 只交付设计）。

备选方案：

1. 代码先行（TS 类型为事实源，schema 生成）：实现导向，但阶段 0 没有实现可锚定，且 JSON Schema 的校验生态（ajv + CI）弱于先写 schema。
2. 文档先行（Markdown 表格为事实源）：人友好但机器不可校验。
3. **Schema 先行（本决策）**：机器可校验、语言中立、与未来的 OpenAPI/数据库 DDL 均可衔接。

## Decision

1. 仓库为 **pnpm workspaces monorepo**：`packages/core`（类型+引擎）起步，未来 `web`、`api` 加入同一 workspace。
2. `schemas/`（JSON Schema draft 2020-12）是**单一事实源**；所有实体的字段、枚举、约束以它为准。
3. 变更顺序硬性规定：**schema → types → examples → docs**（CONTRIBUTING.md §一；AGENTS.md §3）。
4. CI 用 ajv（draft 2020-12 + ajv-formats）校验 `examples/` 对 `schemas/` 的一致性，任一失败阻断合入。
5. `packages/core/src/types.ts` 阶段 0 手写保持与 schema 同步；实体数 > 15 或嵌套 > 4 层时切换 json-schema-to-typescript 生成（architecture.md Open Question #1）。

## Consequences

- 正面：
  - AI agent 有确定的协作入口（读 schema 即知全貌），减少幻觉式改动。
  - CI 把"文档与数据不一致"变成构建错误。
  - 未来的服务端（任意语言）可复用同一套 schema 做入参校验。
- 负面：
  - 手写 types.ts 存在与 schema 漂移风险（缓解：PR checklist + CODEOWNERS）。
  - 纯实现改动也要走文档同步，小额迭代略重。
