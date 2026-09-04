# ADR-0001: 采用 ADR 流程记录架构决策

> **English summary.** We adopt Architecture Decision Records (ADRs) to document significant decisions. Each ADR is immutable once accepted; supersession happens via a new ADR. This first ADR defines the process and the template.

- Status: Accepted（2026-10）
- Deciders: @TERRYYYC

## Context

CanteenOS 将有大量人类与 AI agent 并行协作（见 AGENTS.md）。没有决策记录时，agent 无法判断"为什么这样设计"，容易重复已否决的方案或引入违反既定约束的变更（如 copyleft 依赖）。调研报告中的大量权衡（许可证、路线选型）也需要一个正式的沉淀处。

## Decision

1. 所有**重要架构决策**（选型、数据模型演进规则、模块边界、流程规范）以 ADR 形式记录于 `docs/adr/`。
2. 命名：`NNNN-kebab-case-title.md`，编号单调递增，不复用。
3. ADR 一旦 Accepted **只增不改**；废弃或推翻时用新 ADR 声明（旧 ADR Status 改为 `Superseded by ADR-NNNN`，此为唯一允许的回改）。
4. 什么情况需要 ADR：新增/替换技术选型、schema 破坏性变更、模块边界变化、许可证相关决定、协作流程变化。纯文档修订、bug 修复、examples 增补不需要。

### 模板

```markdown
# ADR-NNNN: 标题

- Status: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
- Deciders: <负责人>

## Context
<背景、约束、可选方案>

## Decision
<决定是什么>

## Consequences
<正面/负面影响、需要跟进的事项>
```

## Consequences

- 正面：决策可追溯；AI agent 有明确的"改代码前必读"清单（AGENTS.md §2）；新成员 onboarding 成本低。
- 负面：小额决策也有文档开销；需要 owner 在 PR 评审中强制执行。
