## 变更摘要

<!-- 一句话说明本 PR 做什么。涉及数据结构时，按 schema → types → data → docs 分别列出改动点 -->

- schema:
- types:
- data:
- docs:
- 其他:

## 关联

Closes #<!-- issue 编号 -->

## Checklist

- [ ] 遵循 spec-first 变更顺序（schema → types → data → docs），纯实现变更已说明理由
- [ ] `node scripts/validate-schemas.mjs` 通过（或说明本地无法运行的原因）
- [ ] 新增/修改实体在 `data/` 有对应数据文件，字段名与 schema 严格一致
- [ ] 可展示文本一律使用 `I18nString`，未引入单语言字符串字段
- [ ] Dish.components 使用 `ingredientRef` 引用，未内联食材字符串
- [ ] 数量使用 `Quantity {value, unit}` 结构
- [ ] 文档已同步（数据模型表 / mermaid 流程图 / Open Questions）
- [ ] 未引入 AGPL / GPL / Commons Clause / 无许可证依赖或代码
- [ ] 未提交密钥、token、内部 URL
- [ ] 若为破坏性 schema 变更：已标注 BREAKING 并给出迁移说明

## 数字自洽性（如涉及 data/ 中的计算）

<!-- 如提交/修改了 menu-plan 或采购单，请给出从菜单→BOM→聚合→÷yield→×margin→扣库存→取整的推导过程 -->
