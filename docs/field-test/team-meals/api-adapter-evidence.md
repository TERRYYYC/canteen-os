---
feature_ids: []
topics: [team-meals, fixtures, ajv, dependencies, verification]
doc_kind: verification-evidence
created: 2026-09-11
---

# RC-Q follow-up: shared Ajv API consumer

This follow-up runs in `codex/team-meals-acceptance-next` in the same isolated
acceptance worktree. The remote v2 PR #92 stays frozen at
`3d9f2aac7fb3f76225d315e34ec5aad7d00dcf96` and is not updated by this work.

| Provenance | Commit / ownership |
|---|---|
| Original implementation input | `1fdaf7bf78264199ce87c80d20a4d37976cf05f2` |
| Independently reviewed v2 fixture | `3d9f2aac7fb3f76225d315e34ec5aad7d00dcf96`, RC-Q |
| A0-derived preparation | `2c9c7e1a70b0749afbccad5020c05b0fb915293f`, RC-Q; based on contract `8448d49525da02c2e3fceb65167c8cedb3d6df11` |
| Accepted upstream API | `35a8658c96c294c77de127366fbf63a5387d680d`, RC-A; includes API introduction `5b0b028a9b8c18d215a6a0a977c8c3ff1eca4b09` and stdin guard fix |
| Mechanical dependency integration | `2f1b4c4` merge of only the reviewed upstream API ancestry; no unreviewed A1 candidate included |
| Q adapter implementation | Resolve the commit carrying this file and `scripts/validate-contract-fixtures.mjs` |

The six upstream files (scope ADR/contract, core schema-contract tests, existing
Ajv/type checker scripts/tests) retain RC-A authorship. Q edits only its own
new validator/test and fixture documentation. The adapter calls
`validateData({root: temporaryFixtureRoot, schemaDir: officialSchemaDirectory})`.
It consumes structured results, without an Ajv implementation, version-guessing
fallback, CLI copy, stdout/stderr parsing or production write. The existing
reference/source Python APIs are unchanged.

RED: a fixture root containing official schemas and existing reference/source
modules, but intentionally no Ajv CLI file or node_modules, could not be
validated by the old copy-based adapter. The focused test failed at copyFileSync
for missing validate-schemas.mjs (1 test / 1 fail). The shared API must work with
such an input root because its implementation/dependencies live in the caller's
repository. GREEN: direct API invocation passes that test and the original
32 checks, for 33/33. Infrastructure failures still throw rather than matching
an expected invalid fixture layer. The frozen numerical inputs/expected remain
byte-identical.

Preparation review is separate: non-author `v2_review` approved exact
`2c9c7e1a70b0749afbccad5020c05b0fb915293f`, subject
`task:01a08d74-9915-7191-ba9f-3177c587e52a/RC-Q-A0-preparation`,
message `rcq-a0-prep-review-2c9c7e1-20260911`, against A0
`8448d49525da02c2e3fceb65167c8cedb3d6df11`. It checked 19 JSON shapes and expected
failure layers against the contract, inventory continuity and T01–T09 fidelity.
That verdict does not certify formal A1 legality, new semantic behavior or L2.

A1 remains a distinct dependency. All 19 new-format records still say
`formatValidation: pending-A1`; the 22-case CLI result concerns v2 only. A later
A1 integration must run the actual version-selecting official schemas and
semantic cases before changing those statuses. UI/mock/real L2 remain unrun.
