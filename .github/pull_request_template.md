## 改了什么

<!-- 一句话。涉及数据结构时，按 schema → types → data → docs 分别列出改动点 -->

- schema:
- types:
- data:
- docs:
- 代码:

## 怎么验证的

<!-- 贴命令与输出摘要（不是"已测试"两个字）。例：
python3 scripts/local-validate.py → 14/14
cd packages/core && node --test → 29/29
node scripts/build-data.mjs --check → 3 plans, 0 errors
浏览器：/prep 切 uk/zh/en 三次，截图见下 -->

## 没做什么

<!-- 本 PR 明确不包含的、评审可能以为包含的东西；以及发现但未处理的问题（写进对应 issue） -->

## 手算算式（涉及 data/ 或引擎数字时必填）

<!-- 黄金测试锁的是"写下来的数字"不是"正确的数字"。每一行：
菜单需求 → ÷yield（仅 g/ml）→ ×margin（所有食材）→ −onHand → ÷packSize 向上取整 → 与 minPacks 取大 → 金额
例：番茄 300 g × 480 = 72.0 kg ÷ 0.85 = 84.7 kg × 1.1 = 93.2 kg → 5 kg/袋 → 19 袋（≥2）→ 19 × ¥28.50 = ¥541.50 -->

## 关联

Closes #<!-- issue 编号；来自 .github/backlog/round-1.lock.json -->

## Checklist

- [ ] 遵循 spec-first 变更顺序（schema → types → data → docs），纯实现变更已说明理由
- [ ] 未新增实体、未新增必填字段、未删字段（`docs/execution-brief.md` §1.2）
- [ ] `python3 scripts/local-validate.py` 或 `node scripts/validate-schemas.mjs` 通过
- [ ] `packages/core` 测试通过；若改了黄金数字，上方算式已逐行给出且 reviewer 已核对
- [ ] 可展示文本一律 `I18nString`；`Dish.components` 用 `ingredientRef`；数量用 `Quantity {value, unit}`
- [ ] 文档已同步；本版本新增 ADR ≤ 1 篇
- [ ] 未引入 AGPL / GPL / Commons Clause / 无许可证依赖或代码；UI 框架 ≤ 10 KB gzip，无 CSS 框架
- [ ] 未提交密钥、token、内部 URL；图片 ≤ 200 KB / 1280 px
- [ ] 不在"第一轮不做"清单内（`docs/plan-for-terry.md` §7）
- [ ] 若为破坏性 schema 变更：已标注 BREAKING 并给出迁移说明
