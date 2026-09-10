---
feature_ids: []
topics: [team-meals, fixtures, v3, shopping-list]
doc_kind: fixture-preparation
created: 2026-09-11
---

# A0-derived samples: formal A1 validation pending

Exact contract: `8448d49525da02c2e3fceb65167c8cedb3d6df11`,
`docs/specs/team-meals-contract.md`, independently checked by dispatch. These
19 samples implement its stated shapes; the formal new schemas are not yet in
this branch. A `valid/` path means expected valid against A1, **not an executed
Ajv pass**. Every entry records `formatValidation: pending-A1` in this manifest.
The parent inventory locks bytes only; its 22/22 result covers only v2 cases.

MenuPlan v3 omits servings on two rows while preserving the third explicit 2;
empty meals is represented separately. Dish v3 omits unknown qty while keeping
genuine to-taste. ShoppingList uses only A0's version/id/basis/items and legal
check/buy/available, bought and nonrecursive previous shapes. Negative samples
keep 0/null/missing quantity value, steps.n, bought on non-buy, invalid revision,
repeated selection, invalid previous and persisted names distinct.

`semantic/duplicate-ingredient.json` is expected to pass shape validation but
fail semantic admission for repeated ingredientRef. A passing schema would not
validate candidate-set equality, path ID, ancestry, historical previous state
or revision availability.

ShoppingList sourceRevision uses an existing full Git SHA solely as a format
token. The sample catalog is under `test/fixtures/contracts`, not the live
`data/` path. **No ShoppingList here has a verified real Worker basis or previous
history.** Do not send these samples to any live endpoint. For future HTTP mock
checks, explicitly inject the matching fixed inputs; for real L2, first seed an
isolated test repository, record its actual commit, and construct the basis from
that commit. Never replace unknown revisions with main/local/fabricated hashes.

After RC-A publishes A1, Q will validate with its actual exported formal API and
record the exact upstream implementation/schema commit. Use the acceptance
matrix at `docs/field-test/team-meals/acceptance-matrix.md` for subsequent
semantic, API, browser and real round-trip evidence. No future DOM is assumed.
