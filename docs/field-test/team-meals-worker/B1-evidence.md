---
feature_ids: []
topics: [team-meals, worker, persistence, revision, verification]
doc_kind: implementation-evidence
created: 2026-09-11
status: B1-awaiting-independent-review
---

# RC-B B1 evidence

Branch: `codex/team-meals-worker`. Base: `8448d49525da02c2e3fceb65167c8cedb3d6df11` (A0, not merged main). Accepted source: `docs/specs/team-meals-contract.md` at that SHA. Issue/PR: not published; dispatch is checking external publication authorization.

Scope: Worker files only, excluding package.json and lockfiles; this evidence directory. Architecture ownership: RC-B Worker; Map delta: none. Root worktree and A's worktree unchanged; dependencies copied from existing local installs into ignored node_modules, no manifest change.

The user flow remains menu → all recorded ingredients → this shopping decision → same-revision material/source. B1 is the authorized infrastructure checkpoint, not completed RC-B or a deployable team-meals release. No UI changes or frontend acceptance claimed.

## Implementation and risk coverage

- Plan/dish creation requires If-None-Match:*; updates require a strict blob If-Match. Both headers, malformed/weak/list/empty tags are rejected. Conditions precede idempotence and are rechecked each ref attempt. Ingredient retains its existing interface. Semantic warning reads use each attempt's H. The writer has a verify hook before any write and idempotence for B2.
- Source/catalog read explicit full SHA only when equal to H or proven ancestral using compare status and merge base; omitted revisions capture H once. Invalid JSON/schema is an explicit invalid_source. Catalog and GitHub tree limits fail closed. Network and malformed upstream JSON map to upstream_error, not absence.
- Asset resolves only schema ImageRef pointers on allowed owners, at the requested revision. It reads blob bytes, rejects symlinks/escaping paths, and does not fetch external URLs or current images. CORS exposes the source revision.
- Rollback patches only ingredients/dishes/menu-plans/techniques/translations; current shopping-lists/purchase-orders/other paths survive byte-for-byte. Each attempt reconstructs from H and repeats ancestry/version protection. Deleting/downgrading v3 is refused before any write. B2 full candidate schema/ref validation has an explicit extension point.
- FakeRepo now rejects non-fast-forward updates, enabling a meaningful simultaneous-create failure. This is still an in-memory simulation, not real GitHub L2 evidence.

Risk axes: behavior (HTTP changes), data (lost updates/rollback), security (revision/asset boundaries), contract (A0 conditional reads/writes), irreversibility (new Git commits only; no production writes). Independent review is required for these boundaries. Clowder-specific gate scripts do not exist in this repository; use the actual Worker checks below.

## Fresh checks

- Baseline before edits: `npm --prefix packages/worker test`, 76/76 pass.
- Red: `node --test packages/worker/test/team-write.test.mjs` (required conditions and dual create), team-read (revision and asset), team-rollback (allowlist/version protection), github-boundary (malformed upstream), and per-attempt/symlink additions. Logs alongside this file. Failures are assertions against existing behavior, not missing imports or tooling.
- Green: `npm --prefix packages/worker test`, 129/129 pass (`b1-green.txt`).
- `npm --prefix packages/worker run typecheck`: pass.
- `npm --prefix packages/worker run check:validators`: pass, four generated validators including techniques, no runtime eval/dependencies.
- `git diff --check`: pass.

Author exercise: actual Worker fetch handler → bearer auth → endpoint → GitHub fetch stub → Git tree/commit/ref → readback; historical image response is checked as bytes. No HTTP server, deployed Worker or isolated external test repository was available. L2 belongs to RC-Q/environment provisioning and remains unverified. No production data was written.

## Pending RC-B work

B2 waits for reviewed A1 schemas/types and fixed A2 pure functions, plus RC-CI's core dependency declaration. ShoppingList route/validators, v3 plan/dish dual writes and downgrade protection, exact create/reconcile/decision transitions, fixed previous bases and full rollback candidate format/ref checks are not yet delivered. Do not deploy B1 as full support for v3/ShoppingList.

Independent review: requested against the commit containing this packet; verdict and any changes will be recorded separately. PR draft and branch publication remain with dispatch authorization check; no merge/main push authorized.
