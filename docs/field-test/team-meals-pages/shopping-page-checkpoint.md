---
feature_ids: []
topics: [team-meals, shopping, details, checkpoint]
doc_kind: verification
created: 2026-09-11
---
# Shopping page checkpoint

Goal: select saved dates/meals, collect every recorded ingredient reference and independently decide check/buy/available/bought for this ShoppingList. Original D0 contract/T01–T09 remain the scope. Source C2a implementation531aa266/handoff99381cd; writes use C1 supplied-body editor only.

`purchase-form.ts` owns page metadata and original C2 branded views, C1 alone owns draft/source/save state. New list is all-check and creation must acknowledge before manual decisions; changed range/basis uses core review and whole-body save before reconfirmation. Storage Source.commit and ingredient/menu basis.sourceRevision display separately. An existing dirty/unknown/conflicting list cannot silently rebase. Removed purchase references display outside current items. Detail routes read the current list's original basis; current information is a separate editor link. No private/public fallback or estimation is implemented in the page.

Actual-browser author evidence: `/test/team-meals-pages-shopping-browser.html` executes production page, real C1/C2 and explicit mock fetch. `shopping-main-flow.txt` reports PASS; `shopping-main-flow-ledger.json` contains request shapes and scenario assertions, not credentials. Covers all-check creation condition, separate manual write lock, loaded original basis, source-detail links, revised scope and full reset acknowledgement, removed bought reference, manual reconfirmation, copy rejection/text alternative, held save, unknown response+two Source reads, leave/return and explicit conflict comparison/adoption. It does not prove actual Worker, historical fixture revisions, publication or image-byte decoding.

`team-meals-pages-shopping.test.mjs`:15 page-controller checks with real C1/C2. Copy tests2, details tests2. Root actual17-probe browser and non-author dish_compat helper review caught and repaired missing-ingredient early-return hiding known source navigation; independent recheck17/17 and matching file digests returned no remaining helper findings. Subsequent technique-image addition separately resolves by techniqueRef against full catalog at exact basis before obtaining original-index bytes; filtered projection indices are never treated as raw technique indices. Full helper/page review still required for this delta.

Plan now exposes explicit unsaved local preview through formal `previewTeamMealsDraft`, no fabricated revision or persistent list. `plan-local-preview.txt` captures original quantities, seasonings, incomplete recipe warnings and unavailable calculation reasons from actual browser. Create-list link carries only plan ID and rereads saved data in purchase page.

Current complete worktree Web151/151, typecheck, legacy data generation and Web build passed. Menu/prep presentation is still uncommitted preparation and published loader is unavailable at this checkpoint; these build results are not new team publication proof. No remote write/deployment/production data change. Independent page review and final three-language/two-viewport evidence remain pending.
