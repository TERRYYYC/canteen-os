---
feature_ids: []
topics: [team-meals, worker, pull-request]
doc_kind: local-pr-draft
created: 2026-09-11
status: local-only-awaiting-publication-authorization
---

# Worker: save per-list shopping decisions against pinned meal revisions

## Proposed PR body

The new shopping flow needs to retain every recorded ingredient reference when portions or quantities are unknown, while keeping manual decisions tied to the saved menu and recipe revision. This change adds `POST /shopping-list/:id` and its source reader, consuming the reviewed core functions for candidate collection, manual decisions and reconciliation. A changed basis accepts only the exact reconciliation result; a separate locked save confirms new decisions. `409 review_required` includes the deterministic `reviewRequired` array, including an empty array when the requested payload still differs from reconciliation.

Plan and dish writes now support explicit v2/v3 formats with required create/update conditions and reject deletion or downgrade of upgraded data. Source, catalog and asset reads capture a fixed controlled-history revision. Assets return that revision's validated local image bytes; unavailable and external unpinned images do not fall back to current data. Rollback validates the complete candidate knowledge tree, references and local image containers while retaining current shopping lists, purchase orders and unrelated data paths byte-for-byte.

Validation: Worker 259/259 tests, TypeScript and standalone-validator checks pass; the committed diff has no whitespace errors. Tests cover concurrent creation, stale locks before idempotence, ancestry revalidation on retry, invalid stored history, exact candidates and previous judgments, unresolved ingredients, repeated reconciliation, and POST/GET of an empty menu followed by empty and repopulated lists. The normal nine-ingredient flow also stays within an injected 50-fetch limit when confirmation retries after a competing HEAD update. Full original data path/mode/blob identity matches A0. Independent non-author review approved 32e674cd9bdc9f565cd1cfff263aa1f8c4367cde with no open P1/P2; its original four P2 were repaired and rechecked (B2-review.md).

These are L1 fetch-handler/FakeRepo results. No deployed Worker or real GitHub save/rollback has been exercised because the isolated repository, credentials and endpoint are not ready. The existing production-targeted deployment configuration was not used. Image checks validate container structure and extension; they do not fully decode pixels. No Web or new build-target completion is claimed.

Dependencies preserve their original commits and ownership: A1 `c9131559b8c703a3a8f3b823bc93c2acb3dd879c`, A2 `ad1f427ae8d7ffc6841bfd2e51c279d2c90381d2`, Q fixed golden `3d9f2aac7fb3f76225d315e34ec5aad7d00dcf96`, and CI package entries `15d117df517b476e2655adeaf2411557ba714af8`. B-authored changes are Worker code/tests/generation and `docs/field-test/team-meals-worker`; manifests, schemas, core and shared fixtures are dependency changes. Review the Worker diff excluding its package manifest separately from those already reviewed dependencies.

## Local delivery metadata

- Branch: codex/team-meals-worker.
- B1 independently approved implementation: 865be4c30a094e8874c43067f2b6db034a4c7057.
- B2 independently approved implementation: 32e674cd9bdc9f565cd1cfff263aa1f8c4367cde.
- Contract revision: ad1f427ae8d7ffc6841bfd2e51c279d2c90381d2, docs/specs/team-meals-contract.md.
- Publication is paused by dispatch pending explicit external-action authorization. This file is a local draft; no PR URL exists and no push/PR/merge is requested by this artifact.
