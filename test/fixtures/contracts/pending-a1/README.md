---
feature_ids: []
topics: [team-meals, fixtures, v3, shopping-list]
doc_kind: fixture-guide
created: 2026-09-11
---

# A0-derived samples: formal A1 format results

Exact contract: `8448d49525da02c2e3fceb65167c8cedb3d6df11`,
`docs/specs/team-meals-contract.md`, independently checked by dispatch. These
19 samples were prepared against its stated shapes. They now run through the
formal schemas/API at reviewed RC-A A1
`c9131559b8c703a3a8f3b823bc93c2acb3dd879c`. **19/19 format expectations match:
7 accepted, 12 rejected.** Each record retains its original expected boolean and
sample bytes, records the actual format result and exact schema commit, and
pins an intended error field/keyword for negative cases. The directory name is
historical; it does not mean formal A1 validation is still pending.

The parent inventory locks bytes; the fixture CLI reports 22 v2 cases and 19
new-format cases separately. `--formats` runs only these 19 samples. An expected
schema rejection counts as a matched test, never as valid production data.

MenuPlan v3 omits servings on two rows while preserving the third explicit 2;
empty meals is represented separately. Dish v3 omits unknown qty while keeping
genuine to-taste. ShoppingList uses only A0's version/id/basis/items and legal
check/buy/available, bought and nonrecursive previous shapes. Negative samples
keep 0/null/missing quantity value, steps.n, bought on non-buy, invalid revision,
repeated selection, invalid previous and persisted names distinct.

At the frozen A1 checkpoint, `semantic/duplicate-ingredient.json` passed shape
validation and awaited semantic rejection. The subsequent A2-S03 check now calls
reviewed core `reconcileShoppingList` and observes `invalid_selection`; HTTP
admission still awaits Worker verification. The manifest's semantic fields are
the preserved A1-stage record; the newer pure-core scope is recorded separately
in `../semantic-expectations.json` and `a2-semantic-evidence.md`. A passing schema does not
validate candidate-set equality, path ID, ancestry, historical previous state
or revision availability.

ShoppingList sourceRevision uses an existing full Git SHA solely as a format
token. The sample catalog is under `test/fixtures/contracts`, not the live
`data/` path. **No ShoppingList here has a verified real Worker basis or previous
history.** Do not send these samples to any live endpoint. For future HTTP mock
checks, explicitly inject the matching fixed inputs; for real L2, first seed an
isolated test repository, record its actual commit, and construct the basis from
that commit. Never replace unknown revisions with main/local/fabricated hashes.

Use `docs/field-test/team-meals/a1-format-evidence.md` for repeatable commands and
validation boundaries, and the acceptance matrix at
`docs/field-test/team-meals/acceptance-matrix.md` for subsequent semantic, API,
browser and real round-trip evidence. T01–T09 are still not executed end to end.
No future DOM is assumed.
