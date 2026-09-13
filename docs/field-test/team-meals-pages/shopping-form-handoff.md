---
feature_ids: [team-meals]
topics: [shopping-list, controller, c1, c2a, verification]
doc_kind: implementation-handoff
created: 2026-09-11
status: author-tested-awaiting-page-integration
---

# Purchase controller handoff

What: `pages/purchase-form.ts` exports `createPurchaseForm(api,{at})` to connect actual C2a fixed input/collection/review logic with the actual C1 ShoppingList editor. Why: purchase UI needs explicit all-check create, saved rebase before manual confirmation, and same-version details without copying domain algorithms. Tradeoff: controller stores only original C2 handles and presentation metadata; C1 is the sole current document store. Open Questions: root owns browser/UI integration and non-author review; no real Worker environment. Next Action: use the exports below, run integrated page checks, then fix a local SHA; no remote writes.

Fixed starting HEAD verified: `1770524a2bac346a87ac3e669dcd92dffc101686`, branch `codex/team-meals-pages`, worktree `/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages`. C2a code approval is `531aa266ab0368257c7522867a5cdcb6b477fc5d`; controller reads the root-merged fixed implementation, no floating C worktree. D0-contract and C2a contract/handoff read before changes. Only controller, `test/team-meals-pages-shopping.test.mjs`, and this evidence authored in this bounded subtask; not staged/committed by child.

## Root-facing interface

`createPurchaseForm(api,{at})` returns:

- `session` (actual C1 editor), `api`, `basis` (original frozen `SavedTeamMealsView|null`), `review` (`PurchaseReview|null`), `canDecide`, `canRebase`.
- `load(id,isCurrent?) → Promise<SavedTeamMealsView|null>`: load stored list then its basis revision. Known lists resume C1 state, including unknown writes and local rebase draft. Optional callback fences page liveness.
- `create(id,SavedViewRequest,isCurrent?) → Promise<SavedTeamMealsView|null>`: uses actual VM.loadSaved then createList; creates local all-check document. **Does not save**. Existing locally known ID raises conflict instead of silently replacing it.
- `rebase(SavedViewRequest,isCurrent?) → Promise<PurchaseReview|null>`: requires a clean acknowledged source; dirty/conflict/pending returns null and makes no request/write. Loads next fixed inputs, calls actual reviewList on acknowledged old body, and binds its whole result.list to C1. **Does not save**.
- `decide(ref,decision,bought?,contextId?) → boolean`: barriers/stale contexts return false; formal core errors still throw. Decisions remain dirty until explicit `save(contextId?)`.
- `compareRemote(isCurrent?) → Promise<PurchaseConflict|null>`: valid only in conflict, loads fresh source + genuine handle. `adoptRemote(remote,'remote'|'keep-local',isCurrent?) → Promise<boolean>` uses a privately captured source lock; cloned/fabricated comparison packets return false.
- `reconcileUnknown(contextId?)`: C1 current + exact-commit force reads, never writes.
- `getAsset(owner,pointer)`: uses active basis revision. Details use `basis.projection` directly; do not clone the handle.
- `refresh()` → C1 refreshView; `detach()` → invalidate; `dispose()` refuses while any unresolved C1 operation remains. Do not drop the controller when false. New auth creates a new controller/VM; previous handles reject session_changed.

`review` contains `{previous,added,removed,reviewRequired,retained}`; previous is the original C2 handle, arrays are defensive copies. It deliberately omits `result.list` because that body lives only in C1. Removed bought material notices remain outside current items and survive detach/return in memory; they are not a permanent archive.

## Required UI sequence and conflict semantics

Create → render all-check → user Save → await C1 ACK → enable decisions → user decision → separate Save with acknowledged If-Match.

Dirty list → user Save → ACK → request rebase → render formal full reset/review → user Save → ACK → enable later manual confirmations. `canDecide` derives from actual `state.source.content.basis == state.draft.basis == original handle basis`, with no pending operation or conflict. No boolean is used to pretend an ACK occurred. While an operation is unresolved manual controls are disabled; language refresh retains it.

Same-basis keep-local conflict preserves the entire local body and explicitly adopts the compared source lock. **Different-basis keep-local keeps only the local desired scope/version**: actual core review is run from the fresh remote list into that local basis, so old local manual decisions are not replayed. Label this action “保留本地范围并重新核对” (keep local scope and review again), not unconditional “keep my decisions”. The resulting basis differs from acknowledged remote basis, so the save-before-confirm barrier applies again. Adopting remote directly uses its body and handle and clears local review metadata.

## Observed verification

Initial `node --test packages/web/test/team-meals-pages-shopping.test.mjs`: **RED 0/8** with exact missing factory assertion `purchase page must expose its real C2+C1 controller` (`undefined` vs `function`). Tests bundle actual C1 API/editor and C2 VM/core; only fetch is mocked. Q boundary fixtures are read unchanged and revisions are labelled scenario tokens, not claims about Git history.

After implementation and adversarial additions:

| Command | Actual output |
|---|---|
| `node --test packages/web/test/team-meals-pages-shopping.test.mjs` | 15 tests, 15 pass, 0 fail |
| `npm --prefix packages/web run typecheck` | exit 0 |
| `git diff --check -- packages/web/src/pages/purchase-form.ts packages/web/test/team-meals-pages-shopping.test.mjs` | exit 0 |

Tests cover all-check first body, If-None-Match/If-Match, no inline auto-save, dirty-old rejection, whole core rebase, previous/bought retention, cancelled scope and removed notices, unknown creation/rebase two reads, not-saved recovery keeping barrier closed, language refresh, same/different basis conflicts, comparison packet tampering, source/basis commit separation, exact asset revision, auth fencing, refusal to dispose unresolved offscreen writes, fresh source load, later edits invalidating pending rebase, and detach invalidating pending loads.

No controller/browser claim beyond these local transport tests; UI scenarios are root's active implementation. No production data, permanent inventory, Ingredient/Dish writes, deployment, real GitHub history or L2 save has been exercised here. This is author evidence, not independent approval or T01–T09 completion.

Latest integrated typecheck while root is writing purchase UI: exit 2 at `src/pages/purchase-list.ts:2`, `AnyIngredient` is not exported from core. Controller-owned typecheck previously passed; this concurrent UI import failure was reported to root and not edited outside ownership. A later full pass is required before root's integrated completion claim.
