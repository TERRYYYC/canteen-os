---
feature_ids: []
topics: [team-meals, worker, formats, dependency]
doc_kind: implementation-evidence
created: 2026-09-11
status: B2-in-progress
---

# B2 dependency and evidence record

Reviewed A1 `c9131559b8c703a3a8f3b823bc93c2acb3dd879c` is integrated by merge `21a04295ad41fc9adb39dd017d405e2fd69d4c6f`. A/Q's original commits and authorship remain visible, including Q fixed fixtures `3d9f2aac7fb3f76225d315e34ec5aad7d00dcf96`. These upstream files are dependencies, not RC-B authored deliverables.

Format slice: v2/v3 validators selected explicitly, ShoppingList v1 precompiled validator registered, v3 optional values and empty meals preserved, v2 constraints unchanged, current blob format checked after the condition lock before idempotence, and v3 dateRange cross-field checks. No inventory/recipe values are inferred. A1's uniqueItems required an additional standalone JSON equality helper; generation first failed on a forbidden runtime require, then succeeded with a dependency-free helper. Object key order does not determine JSON equality.

Fresh checks: 10 format tests (9 red, 1 existing green) → 10 green, whole Worker 145/145; typecheck/check:validators pass. Logs `b2-formats-red.txt`, `b2-validator-red.txt`, `b2-formats-green.txt`. ShoppingList endpoint semantics and complete rollback validation are still in progress; these checks are not B2 acceptance.

Technical clarifications from dispatch: same-basis explicit applyShoppingDecision(...,'check') may clear previous, but ordinary render/recompute must not. Only the shared pure function's result is allowed. Rollback invalid candidate schema/ref is 422 invalid_source with precise source path; v3 deletion/downgrade remains 409 first, and upstream/revision failures retain their own mapping. Only review_required errors may add the top-level reviewRequired ID list.

All tests remain L1 FakeRepo; real Worker/repository L2 is unverified. Package files remain exclusively RC-CI-owned. No PR/branch has been externally published, and no main merge is performed.
