# ADR-0004: 内容级三语数据模型（zh / en / uk）

> **English summary.** All displayable content uses `I18nString {zh, en, uk}` (at least one language required), resolved by the fallback chain zh → en → uk. This is a data-model decision, not a UI concern; UI chrome uses i18next on the client. The design fills a documented open-source gap: Mealie and Tandoor have 37–42 UI languages but monolingual content (Mealie Discussion #5448).

- Status: Accepted（2026-10）
- Deciders: @TERRYYYC

## Context

详见 [../i18n.md](../i18n.md) §1。要点：CanteenOS 的目标场景（中文食堂、英语环境、乌克兰语使用方并存）要求**用户数据本身**多语言；现有开源项目全部"UI 多语言 + 内容单语言"，这是社区自己承认的痛点。

备选方案：

1. 单语言内容 + 运行时机器翻译：质量不可控，且违反"内容可追溯"原则（评论原文必须保留）。
2. 每语言一条记录（行级多语言）：JOIN 复杂、fallback 逻辑散落各处。
3. **字段级 I18nString（本决策）**：结构自包含，schema 可强制约束。

## Decision

1. 可展示文本一律 `I18nString {zh?, en?, uk?}`，`anyOf` 保证至少一种语言；新增语言须改 schema 并写 ADR。
2. Fallback 链统一为 **zh → en → uk**（展示层按请求语言优先、沿链兜底）。
3. 数量与单位**不本地化存储**：`Quantity {value, unit}` + 规范单位符号，本地化只发生在展示层；换算走 UnitConversion 表。
4. 用户生成内容（评论）例外处理：存 `original + originalLang`，翻译放 `translations`，不用 fallback 冒充原文。
5. UI chrome 文案不进数据模型，客户端用 i18next。

## Consequences

- 正面：三语成为数据模型的固有属性，客户端实现简单；形成对 Mealie/Tandoor 的明确差异化。
- 负面：
  - 所有可展示字段的存储与编辑 UI 复杂度 ×3。
  - 机器翻译质量（尤其乌克兰语）未经验证，POC 需实测（video-import.md §6）。
  - `additionalProperties: false` 意味着加语言是 schema 破坏性演进，治理成本存在但可控。
