---
feature_ids: []
topics: [team-meals, fixtures, v3, shopping-list, verification]
doc_kind: verification-evidence
created: 2026-09-11
---

# RC-Q: formal A1 format validation

The 19 samples prepared at Q `2c9c7e1` against contract
`8448d49525da02c2e3fceb65167c8cedb3d6df11` have now been executed through RC-A's
formal schemas/API. All 19 expectations match: 7 accepted shapes and 12 rejected
shapes. Expected booleans and sample entity bytes did not change to obtain this
result. The manifest now records actual outcomes, schema dispatch and the exact
dependency. Its historical directory name `pending-a1` is retained for stable paths.

| Dependency / subject | Fixed commit |
|---|---|
| Frozen v2 fixture PR #92 | `3d9f2aac7fb3f76225d315e34ec5aad7d00dcf96` |
| Reviewed Q API adapter | `78b1c3b966f0c35e3afaacebd4fa6937212cfec3` |
| Reviewed upstream A1, released by dispatch | `c9131559b8c703a3a8f3b823bc93c2acb3dd879c` |
| Mechanical A1 dependency merge in Q next branch | `e26ee915c06d90f11de96aca31d9b2fb2fbf8b66` |
| Q format runner/evidence subject | Resolve the commit carrying this file; independent review follows on that fixed commit |

The A1 schema/type/validator changes are RC-A dependencies, not Q-authored
business logic. Q calls `createSchemaValidators({schemaDir}).validateEntity`
from the official module. It asserts the schema actually selected and matches
each negative against its intended JSON pointer, keyword and relevant parameter.
There is no schema copy, replacement validator or semantic fallback.

RED: the focused CLI test requested `--formats`; the previous Q adapter rejected
that option with its old usage error (1 test, 1 fail). GREEN: the new option runs
the 19 formal format samples; a default run reports those separately from the
22 v2 cases. The focused test and full suite pass. Additional regression checks
prevent a malformed JSON or unrelated date error from satisfying a format
negative, accidental v2 dispatch, unknown kinds and missing schemas. Validator
infrastructure errors are thrown instead of being counted as expected rejects.

```sh
npm --prefix packages/core run build
node --test scripts/validate-contract-fixtures.test.mjs
node scripts/validate-contract-fixtures.mjs
node scripts/validate-contract-fixtures.mjs --formats
node scripts/validate-schemas.mjs
node scripts/build-data.mjs --root test/fixtures/contracts/valid/golden --check --compare-snapshots --at 2026-09-10T00:00:00.000Z
```

Observed: core builds; Q suite 56/56; v2 expectations 22/22; A1 format expectations
19/19; official current-data Ajv 14/14. The golden build has 5 matching purchase
lines, 0 snapshot differences, 0 issues and 0 pending items, and writes no files.
The original 15 golden JSON files and hand-calculated expected numbers remain
unchanged. The same 19 shape results were independently obtained by `golden_math`
before Q's runner was completed; the acceptance matrix records individual cases.

These are format results only. `semantic/duplicate-ingredient.json` is accepted
by schema and still awaits a semantic rejection; candidate equality, coverage,
path ID, revision availability/ancestry, historical previous states, HTTP
preconditions, same-revision asset serving, UI flows and real save/read/publish/
rollback are not tested here. ShoppingList sourceRevision remains a full-SHA
format token with no verified real Worker basis. T01–T09 have not passed end to
end. A2 core/build and B2 Worker implementations need their own released commits
and subsequent evidence. No live endpoint or production repository was written.
