# ADR-0002: 许可证选择 Apache-2.0

> **English summary.** CanteenOS is licensed Apache-2.0. The choice is driven directly by the open-source research: Mealie (AGPL-3.0) and Tandoor (AGPLv3 + Commons Clause, no commercial use) cannot be forked for a product that may include commercial/private deployments; RecipeSage has no LICENSE at all (legally unusable). Apache-2.0 maximizes adoption, permits commercial use, and adds an express patent grant.

- Status: Accepted（2026-10）
- Deciders: @TERRYYYC

## Context

前期调研（[../research/open-source-research-canteen-system.md](../research/open-source-research-canteen-system.md) §一、§七）揭示了清晰的许可证雷区：

- **Mealie**（AGPL-3.0）：fork 衍生必须开源，产品若走闭源/私有化收费则不可用。
- **Tandoor**（AGPLv3 + Commons Clause）：LICENSE.md 明确禁止商用销售——早期资料称 MIT，已变更，这是"以为能用其实不能"的典型教训。
- **RecipeSage**：无 LICENSE 文件，法律上不可复用任何代码。
- **POSR**：自有 source-available 协议，禁止 SaaS 转售。
- 相对地，**Grocy（MIT）、pick-a-recipe（MIT）、recipe-scrapers（MIT）、Cooklang 工具链（MIT）**可自由借鉴。

CanteenOS 自身的分发模式未定：可能 SaaS、可能私有化部署给食堂运营方、也可能出现商业发行版。

## Decision

1. 本仓库采用 **Apache-2.0**（LICENSE 文件为官方全文）。
2. 借鉴规则写入 CONTRIBUTING.md 与 AGENTS.md 红线：Mealie/Tandoor 等只借**数据模型概念**，不 fork、不复制代码；新依赖只允许 OSI 批准的宽松协议（MIT/Apache-2.0/BSD），LGPL 个案评审，GPL/AGPL/Commons Clause 一律拒绝。
3. 每个 PR 的 checklist 包含许可证确认项；CI 未来可加 license 扫描（Open Question）。

## Consequences

- 正面：
  - 商用无忧：SaaS、私有化、二次发行均不受限，最大化采用面。
  - 相比 MIT 多了明确的专利授权与报复条款，对企业贡献者更友好。
  - 与可借鉴生态（MIT 系）完全兼容。
- 负面：
  - 宽松协议意味着别人可以闭源 fork 我们的成果商用——接受这一点，护城河在数据模型沉淀与社区，而非协议约束。
  - 需要持续的依赖许可证纪律（红线已写入协作规范）。
