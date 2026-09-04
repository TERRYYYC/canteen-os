# 贡献指南 / Contributing to CanteenOS

> 本指南同时适用于人类贡献者与 AI coding agent。AI agent 请先阅读 [AGENTS.md](AGENTS.md)。
> This guide applies to both human contributors and AI coding agents. Agents: read [AGENTS.md](AGENTS.md) first.

---

## 一、Spec-first 变更流程（最重要）

CanteenOS 以 `schemas/` 为**单一事实源**。任何涉及数据结构或行为的变更必须按以下顺序提交，建议一个 PR 内完成整条链：

```
schemas/*.schema.json      1. 先改 JSON Schema（单一事实源）
        ↓
packages/core/src/types.ts 2. 同步 TypeScript 类型
        ↓
examples/*.example.json    3. 更新/新增样例，确保通过 CI 校验
        ↓
docs/**/*.md               4. 同步文档（数据模型表、流程图、Open Questions）
```

- 只改实现逻辑不改数据结构时，可以跳过 1 和 3，但 4（文档）不能跳。
- 破坏性 schema 变更（删字段、改类型、收窄枚举）必须在 PR 描述中标注 `BREAKING` 并给出迁移说明。
- CI 会用 ajv 校验 `examples/` 与 `schemas/` 的一致性；本地可用 `pnpm validate`（需 Node 20，见 package.json，**不强制安装依赖也可只提交 schema+examples**）。

## 二、分支命名

```
feat/<scope>-<short-desc>     新功能，如 feat/procurement-moq-rounding
fix/<scope>-<short-desc>      修复，如 fix/schema-i18n-anyof
docs/<short-desc>             纯文档，如 docs/adr-0006
schema/<entity>-<change>      纯 schema 演进，如 schema/dish-add-cuisine
skill/<name>-<change>         skills/ 下解析 skill 契约变更
```

`<scope>` 建议取值：`knowledge-base` / `procurement` / `feedback` / `video-import` / `core` / `repo`。

## 三、Conventional Commits

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

```
<type>(<scope>): <subject>

[optional body]
[optional footer: BREAKING CHANGE / Refs #123]
```

- type：`feat` / `fix` / `docs` / `schema` / `refactor` / `test` / `chore`
- scope：同分支命名的 scope 取值
- 示例：`schema(dish): add lossRateOverride to components`
- 示例：`feat(procurement): add MOQ rounding step to engine skeleton`

## 四、PR Checklist

提交 PR 前逐项确认（模板会自动加载到 PR 描述）：

- [ ] 变更遵循 schema → types → examples → docs 顺序
- [ ] `node scripts/validate-schemas.mjs` 通过（或说明为何本地无法运行）
- [ ] 新增/修改的实体在 `examples/` 有对应样例且字段名与 schema 严格一致
- [ ] 所有可展示文本使用 `I18nString`（至少一种语言），未引入单语言字符串字段
- [ ] 文档已同步（含数据模型表与 Open Questions）
- [ ] 未引入 AGPL / Commons Clause / 无许可证的依赖或代码片段（见下方红线）
- [ ] 未提交任何密钥、token、内部 URL

## 五、许可证红线（血的教训，见调研报告）

- ❌ **禁止** fork / 复制代码自 Mealie（AGPL-3.0）、Tandoor（AGPL + Commons Clause，禁商用）、KitchenOwl（AGPL）、RecipeSage（无 LICENSE）。只可参考其**数据模型概念**。
- ❌ 禁止引入任何 copyleft（GPL/AGPL/LGPL 需个案评审）或 source-available 依赖。
- ✅ MIT / Apache-2.0 / BSD 依赖与概念借鉴是安全的（Grocy、pick-a-recipe、recipe-scrapers、Cooklang 工具链）。
- 不确定时：在 PR 中 @CODEOWNERS 对应目录的 owner 确认。

## 六、数据贡献（菜品/食材）

非代码贡献同样欢迎：菜品、食材、供应商数据请使用 **dish_contribution** issue 模板（`.github/ISSUE_TEMPLATE/dish_contribution.yml`），按 schema 字段提供三语名称与用量；维护者会转为符合 schema 的 JSON 并通过 CI 校验后合入。

## 七、沟通语言

- issue / PR 标题与描述可用中文或英文；涉及乌克兰语内容时请保留原文并附中文或英文说明。
- 文档正文以中文为主、附英文摘要（见各 docs/ 文件头部格式）。
