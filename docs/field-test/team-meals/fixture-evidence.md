---
feature_ids: []
topics: [team-meals, fixtures, verification, arithmetic]
doc_kind: verification-evidence
created: 2026-09-11
---

# RC-Q v2 checkpoint

Scope: fixed shared inputs, new fixture validator/tests, evidence only. Base:
`1fdaf7bf78264199ce87c80d20a4d37976cf05f2`; branch `codex/team-meals-acceptance`.
Implementation commit is the commit carrying this checkpoint (resolve with
`git log -1 --format=%H -- scripts/validate-contract-fixtures.mjs`). The dispatch
work package is RC-Q; GitHub issue assignment remains with dispatch.

All four design drafts were read by absolute path in `canteen-os-design`; they
were uncommitted inputs, not approved schemas or copied into this branch.

| Draft | SHA256 |
|---|---|
| feature-specs/2026-09-10-data-hld.md | ab0e68deb104872c2d5f55ae09ef666a567c1de1226390a6976e808f310c22ad |
| feature-specs/2026-09-10-reference-v3-integration.md | a887edc526c6a7eeb0bc80f582c456e19c0dc8284a83820fd25d55b95e24dd9c |
| docs/design/reference-v3/SCREEN-CONTRACTS.md | e05d43554181c4ebed52269d7f20cafd8b35d4d687e56c8ae52b127684ce3652 |
| docs/design/reference-v3/STANDARD-DATA-AND-ACCEPTANCE.md | 6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352 |

## Executed local verification

- Initial RED: 19 tests, 3 pass / 16 fail. The initial behavior seam returned
  `actualFailureLayer: none` for every input; the 16 deliberate negatives failed
  assertions at their expected JSON/schema/reference/asset layer (not setup or
  syntax errors). See `red-v2.txt` for the captured summary.
- First integration exposed macOS `/var` versus `/private/var` comparison on the
  positive image. Diagnostic was `image-path escapes fixture data`; realpath
  output confirmed aliasing. Canonical containment fixed it; same 19 tests green.
- Added three boundary cases, inventory and isolation tests and independent
  arithmetic oracles. Inventory initially omitted the new oracle file, then
  included all non-document inputs. Trace assertions use 0.000051 tolerance
  because existing core rounds trace quantities to four decimals; expected
  mathematical values were retained and package/money assertions remain exact.
- `node --test scripts/validate-contract-fixtures.test.mjs`: 32/32 pass.
- Formal production baseline (read only): `node scripts/validate-schemas.mjs`
  14/14; `python3 scripts/local-validate.py` 14 plus references pass.
- Fixed golden `build-data --root test/fixtures/contracts/valid/golden --check
  --compare-snapshots --at 2026-09-10T00:00:00.000Z`: 5 lines, 0 snapshot
  differences, 0 issues, 0 pending; no output written.

These are **formal local validation / computation** results. No prototype UI,
new team-meals collector, shared saving, real API round-trip, browser or kitchen
acceptance is claimed. No production data, existing core tests, schemas, Worker,
Web business code, existing scripts, CI, package manifest or lockfile changed.

## Independent C01/C03 arithmetic

`golden_math` independently read the fixed recipe/ingredients and calculated
without calling expand or generating expected from engine output. Recipe base
50; margin 1.1 applies to every unit; yield applies only to g/ml. Per S servings:

| Ingredient | Formula before packaging | Rule/price |
|---|---|---|
| tomato | 150×S÷0.85×1.1 g | 5000 g; min 2; CNY 28.50 |
| egg | 1.5×S×1.1 pcs | 180 pcs; min 1; CNY 150 |
| scallion | 5×S÷0.8×1.1 g | 1000 g; min 1; CNY 12 |
| salt | max(0,1.5×S×1.1−500) g | 500 g; if positive min 20; CNY 2.50 |
| cooking-oil | max(0,10×S×1.1−1000) ml | 5000 ml; if positive min 2; CNY 68 |

| S / scope | Tomato packs / CNY | Egg packs | Scallion packs | Salt packs | Oil packs | Total CNY |
|---|---|---|---|---|---|---|
| 480, original three meals | 19 / 541.50 | 5 | 4 | 20 | 2 | 1525.50 |
| 500, first 200→220 | 20 / 570 | 5 | 4 | 20 | 2 | 1554 |
| 200, first meal preview only | 8 / 228 | 2 | 2 | no line | 2 | 688 |

Tomato needs before packaging: 93176.47058823529 g, 97058.82352941176 g,
38823.5294117647 g. Exact arithmetic precedes ceiling; no display rounding is
used to decide packages. At 200 servings salt is 330 g against 500 g available,
so no order line despite minPacks=20. This does not mean the new manual candidate
list may omit salt or automatically mark it available. The original plan and
recipe bytes remain unchanged in all three tests.

## Remaining ownership and review

RC-A consumes golden paths and owns existing core/build/translate test rewiring
and the reusable Ajv API. Future MenuPlan/Dish v3 and ShoppingList samples follow
fixed A0; formal legality waits for A1. E2E waits for registered page wiring and
tool dependencies. `l2-environment.md` records the independent real-environment
unknowns. A non-author reviews this test PR; author self-tests are not approval.
