---
feature_ids: []
topics: [team-meals, worker, formats, shopping-list, rollback]
doc_kind: implementation-evidence
created: 2026-09-11
status: B2-local-implementation-approved
---

# B2 Worker implementation and review evidence

The requirement remains “dates/meals/dishes → all recorded ingredient and seasoning references → per-list check/buy/available/bought → same-revision knowledge and images.” Portions/quantities stay optional. This is the Worker slice; it does not establish Web completion, production deployment or real-repository L2 acceptance.

## Fixed dependencies and ownership

| Dependency | Reviewed revision | Local integration |
|---|---|---|
| A1 formats and Q fixed golden fixtures | c9131559b8c703a3a8f3b823bc93c2acb3dd879c (includes Q 3d9f2aac7fb3f76225d315e34ec5aad7d00dcf96) | 21a04295ad41fc9adb39dd017d405e2fd69d4c6f |
| CI package dependency and Node/browser entry points | 15d117df517b476e2655adeaf2411557ba714af8 | f3f1e9f73f866feaaa59854de6ddd5d95699f843 |
| A2 pure reference/manual-list core | ad1f427ae8d7ffc6841bfd2e51c279d2c90381d2 | 4cf67371dd24d8ea2e4fc44e5392be5e1b5c937a |

Dispatch released A2 only after the non-author approved its corrected exact revision. The earlier ca44989 candidate was not integrated while under changes-requested review. A/Q/CI original commits and authorship remain visible; their schemas, core, fixtures, manifests and lock changes are dependencies, not B-authored deliverables. The new build target is outside that approval. B authored Worker files excluding manifests and this evidence directory only.

## Behavior and risk evidence

| Requirement / risk | Implementation | Evidence |
|---|---|---|
| Explicit formats and no downgrade | Seven precompiled validators; strict v2/v3 selection, full ShoppingList v1; current v3 guard after lock, including empty v3 plan and range relationships | 10 format tests; b2-formats-red/green.txt |
| Full reference candidates, no parallel demand engine | Direct core create/apply/reconcile/normalizeSelection consumption; runtime imports through the approved package entry | shopping-transitions and shopping-write endpoint tests |
| Atomic manual state and concurrency | One list blob contains basis/items; required create/update headers; H-parent non-force commit; each retry revalidates conditions, all revision ancestry and semantics before idempotence | Concurrent creators, stale identical payload, idempotence, unrelated-head retry and source-error tests |
| Two-save baseline review | Only exact normalized reconcile output on a changed basis; 409 includes sorted unique reviewRequired even when empty; separate locked manual decision clears previous | Handwritten expected results, not core-generated oracles |
| Old references cannot be erased to bypass checks | Validate stored old basis and every previous revision/selected plan before accepting a request that drops them; preserve unresolved ingredient as check and reject its manual confirmation | Unavailable history, fake previous, candidate mismatch and partial unresolved-reference tests |
| Saved sources stay pinned | One source tree per explicit basis; all source JSON/schema parsed, missing selected plan is basis_unavailable; malformed stored list candidates rejected; no current-head substitution | shopping-inputs 9 tests; shopping-source semantic red/green |
| Safe rollback | Complete candidate schema, plan/dish/ingredient/technique refs and local image paths/containers; v3 guard first; latest shopping/PO/unknown paths retained byte-for-byte; retries repeat checks | 57 rollback tests (40 new validation tests), JSON/ref and image red/green logs |
| Asset path consistency | Existing reviewed asset resolver extracted into shared localAssetPath; HTTP(S) stays unpinned metadata; neither asset reads nor rollback fetch mutable external bytes | Existing asset suite and rollback image tests |

Standalone generation first failed because Ajv uniqueItems emitted a runtime require. The Worker generator now embeds a small JSON equality helper; source schemas are unchanged and emitted runtime validators remain free of runtime Ajv/eval. Object property order does not change equality.

The source semantic probes initially returned 200 for a missing/bad selected plan and duplicated ingredient IDs. They now reject those states with 422 and a source/field path. The nine adapter tests initially had a missing-module scaffold red; that log is not presented as endpoint behavior evidence. Actual endpoint reds are separately retained. Test fixtures were checked against formal schema; successful old rollback fixtures were corrected to include required v2 values and referenced files, while protected shopping/PO bytes intentionally remain arbitrary to prove non-interference.

## Quality gate and limits

Risk: behavior high (manual decisions/reconcile), data high (writes and rollback), security medium (existing role model plus revision/path boundary), contract high (new endpoint and error field), irreversible low for this local delivery (no external write/deploy/merge). Independent stateful review is required for the final B implementation. Prior B1 approval covers 865be4c30a094e8874c43067f2b6db034a4c7057 only.

Architecture cell: RC-B Worker as assigned by dispatch. Map delta: none; extends existing routes and Git write adapter, consumes the single A core. No frontend/UI or .pen files are changed; no new frontend preview claim. Clowder-specific gate/tips scripts are absent from this repository; actual Worker tests/typecheck/generated-validator checks and committed-range whitespace checks are used.

Dogfood boundary: real fetch-handler calls through L1 FakeRepo cover create → source read → locked choice → changed plan → reconcile save → source read → separately locked confirmation. These are endpoint round trips against an in-memory GitHub adapter, not a deployed Worker or actual GitHub writes. The real isolated Worker/repository/PAT remains unavailable in the recorded environment audit; dispatch owns provisioning/authorization and has been notified. Production-targeted wrangler.toml is not used for testing.

Production data entries remain identical by path, mode and Git blob to A0. Existing unrelated main workspace files, .DS_Store and .poc-venv were not changed. No main merge, production data write, deployment, external PR/issue/comment, or branch publication has occurred. Local commits are reviewable; publication remains a dispatch authorization check.

Initial candidate verification: `npm --prefix packages/worker test` passed 237/237; `npm --prefix packages/worker run typecheck` and `check:validators` passed; working diff and `git diff --check 8448d495..HEAD` passed. Full current outputs are b2-worker-green.txt, b2-typecheck.txt and b2-validators.txt. These commands build core before Worker through the approved CI dependency; no package metadata was changed by B.

Independent review of 7188e0d returned four P2 despite passing baseline checks. Repair details and the exact review target are tracked in B2-review.md; that candidate is not approved.

Post-review repair verification: Worker 259/259, typecheck and standalone-validator checks pass; see b2-repair-worker-green.txt, b2-repair-typecheck.txt and b2-repair-validators.txt. The nine-candidate quota test counts every injected fetch, including a complete ref retry, with 21/23/25/38 calls for create/buy/reconcile/confirm. Only successful immutable trees/blobs are cached per request; ancestry cache keys include captured H and are recreated per attempt. All conditions and semantic validation still run on each attempt. Rollback now rejects duplicate technique IDs, preserves downgrade priority and emits precise owner#field pointers.

Final independent verdict: APPROVE for 32e674cd9bdc9f565cd1cfff263aa1f8c4367cde; all four P2 closed, no open P1/P2. The non-author independently repeated the 259-test suite and runtime-budget/rollback probes. See B2-review.md. Approval remains local implementation only; real L2, external publication and overall Web/build acceptance are not implied.
