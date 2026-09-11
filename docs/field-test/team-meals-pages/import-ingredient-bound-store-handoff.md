---
feature_ids: [team-meals]
topics: [pages, import, ingredient, authentication, handoff, review]
doc_kind: implementation-evidence
created: 2026-09-11
---

# Import / Ingredient bound draft store integration

What: Consume the approved C shared implementation `d8bb568` merged at D `88125b62c0a33ee9af0eeeae186f830fd6fecf9a`. Import and Ingredient call `bindDraftStore(api)` once at their synchronous render entry. Import's notice, undo, handoff and asynchronous import completion use the same captured `drafts` handle. Ingredient passes the entry handle into synchronous owner creation to consume its handoff. Neither page rebinds from an old callback. No C implementation is edited.

Why: I-R2 in `/private/tmp/canteen-home-import-review-b45d403/REVIEW.md` observed an A imported draft and undo notice surviving an API auth change to B, causing B to skip its own Source GET and import into A's private full plan. The C implementation now deliberately rejects naked exports with `store_scope_required`. `red-import-ingredient-bound-store.txt` records those exact consumer failures before this migration.

Tradeoff: Shared store is the only owner of imported JSON drafts, previous undo entries and handoff. Existing page raw owners are retained; no extra authentication map or fallback to the old exports is introduced. API instance, mode and session validation remain C's responsibility. Shared auxiliary registration and its separately approved auth-ticket enhancement remain outside this checkpoint.

Validation:
- Import 26 + Ingredient 24 = **50/50** targeted tests in `green-import-ingredient-bound-store.txt`; the earlier raw-owner and precise servings cases remain intact.
- Added actual-renderer checks cover same-auth notice/navigation preservation, A draft/other-plan/undo/handoff isolation after B render, B's own Source GET, old Source completion unable to modify B, all old handle operations rejected, detached old Undo/Create button callbacks unable to rebind, separate API instances with equal session keys, and Ingredient same-API take-once handoff versus changed identity.
- All maintained Import and Ingredient tests/fixtures use captured scoped handles. No production or maintained fixture imports any naked shared-store method.
- Web typecheck and scoped production/test diff-check pass in the shared working tree.

Actual browser: parent ran its available IAB and archived both results, then this sub-agent read the complete JSON files. The unchanged original b45 archive at `http://127.0.0.1:4207/test/independent-import-browser.html` reproduced **5/8** in `red-import-auth-original-browser.json`: I-R1's invalid-but-enabled action and both I-R2 privacy/base findings. The current D fixture at `http://127.0.0.1:4195/test/team-meals-pages-import-auth-browser.html` passes **15/15** in `green-import-auth-browser.json`. B now performs its own Source GET and yields only B-plan / margin 9. The full Import -> Plan -> Import -> Plan round trip preserves supplied 6 and original duplicate 11 / unrelated 19 counts; five stale-handle operations are blocked without changing B. Ingredient receives only the same-API handoff once, and equal session numbers on different API instances remain isolated. Transport is explicit local GET-only mock; Ingredient runs in mock mode. These are composition behavior checks, not production or visual acceptance.
Next: parent fixes a review target and returns the combined page composition to the original non-author. The separate Ingredient ING-R1/ING-R2 repair at 4e24c33 has since received bounded independent approval; that approval does not cover this store migration. No commit, self-approval, real remote upload/save or deployment occurs here.

Production SHA256:

| File | SHA256 |
|---|---|
| packages/web/src/pages/admin/import.ts | 4a733e73da30b9c5be824310e790ebdbed23f2ad5a32f6adede91394aed08520 |
| packages/web/src/pages/admin/ingredient-new.ts | 83413304064c30826968b3985b046f7f637cc9fc632b363f49755e9a27315b00 |
| packages/web/test/team-meals-pages-import.test.mjs | 9260d93f8ef6d2d9f655b4585b31fe3444b56d471efff90aab75da41b44d3702 |
| packages/web/test/team-meals-pages-ingredient.test.mjs | e08accff95c1b3c44b7de66ea88a20dbaec8b584ef7b3711cb82f7da119c75ee |
| packages/web/test/team-meals-pages-import-auth-probe.ts | 17c78ddfa94c87d5a22db3872b90b136655fd216a62cd16418b866134f2f490f |
