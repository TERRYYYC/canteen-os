---
feature_ids: [team-meals, knowledge-base]
topics: [canteen-quantities, quantity-provenance, recipe-unknowns, fixtures]
doc_kind: fixture-guide
created: 2026-10-19
---

# ADR-0012 合同夹具

这里的菜、食材和规则都是测试用的，不是厨房菜谱，也不是师傅定的规则，数字不能拿去用。

- `valid/`：要能通过。带全部新字段的菜（份数 1，每个有数的用量都有出处）、份数 2 没写出处的 v3 菜、份数 1 的 v2 菜、带出处的食材、两条测试规则。
- `invalid/`：要被拒。每个文件只坏一处，拒在哪一层、哪个位置，记在 `scripts/validate-schemas.test.mjs` 的 `INVALID` 表里。
  - 语义层（JSON Schema 管不到，只有 `scripts/validate-schemas.mjs` 查）：份数 1 的菜有用量没出处、「没说清」的位置越界、规则 id 重复。
  - schema 层：其余文件。测试同时用 CLI、重新生成的 Worker 校验器和 Python 子集校验器跑这些，三边要一致。

- `references/`：按规则填的值要引用对规则（跨文件，`scripts/build-data.mjs` 的 team-meals 目标查，CI 的 `--check` 会跑）。每个文件单独放进一份固定数据里，和 `references/chef-rules.json` 一起构建：
  - `valid/`：引用对了，要能通过。
  - `invalid/`：要报错。分别是：规则 id 不存在；`qtySource` 引用的不是每份用量规则；规则的单位和 `qty` 的单位不一样；`yieldSource` 引用的不是净料率规则；`pcsToGramSource` 引用的不是每个多少克规则。

Worker 固定时的语义校验和规则引用检查归 #181、#174；那之前 Worker 只拦 schema 层。

```sh
pnpm -C packages/worker build
node --test scripts/validate-schemas.test.mjs
node --test --test-name-pattern='rule-sourced' scripts/build-data.test.mjs
```
