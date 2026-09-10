---
feature_ids: [team-meals]
topics: [web, view-models, core, integration]
doc_kind: implementation-plan
created: 2026-09-11
---
# C2a public view-model contract and implementation plan

**Feature:** team-meals, approved A0 contract in `docs/specs/team-meals-contract.md`.
**Goal:** Pages can load one fixed set of inputs and use formal core candidates, estimates and list reconciliation without copying algorithms.
**Acceptance criteria:** Preserve every recorded reference and original optional values; retain unknown/partial status; use one revision for source details and assets; list decisions remain local until explicitly saved by C1; changes use core review/previous/removed semantics; unsaved previews cannot become saved bases. No implicit current-data fallback.
**Architecture cell:** RC-C shared Web ownership; RC-D owns pages/CSS.
**Map delta:** none. Existing shared module boundary only.
**Architecture:** Stateless projections plus an authenticated, disposable reader. Formal core owns all demand algorithms. C1 owns HTTP, caching and editing; this module has no writes, store or autosave.
**Tech stack:** existing TypeScript, core browser export, C1 TeamMealsApi, Node tests with browser bundling.
**Frontend validation:** Yes, shared mock browser harness; D/Q own actual page and backend acceptance.

Dependencies: accepted C1 `5b8bdd50d1775cce441d0457f6be7f589a7bb673`, approved A2 `ad1f427ae8d7ffc6841bfd2e51c279d2c90381d2`, approved Q `afc328992a151a2ecc390a083b195dc060f86736`. Local dependency merge `f443298d495463a43a44dea9fa9e91228c526b72` preserves both A/Q histories. B2 and new build are excluded until fixed approval. No push or PR.

## Page-facing exports (implementation target)

Module: `packages/web/src/view-models/team-meals.ts`.

```ts
import { createTeamMealsViewModel, previewTeamMealsDraft } from '../view-models/team-meals';
import { getTeamMealsApi } from '../api/team-meals';
const vm = createTeamMealsViewModel(getTeamMealsApi());
```

Types below reuse core and C1 types; they do not define a parallel schema.

```ts
interface SavedViewRequest {
  revision: string; // full SHA from a successful C1 source/catalog read or saved acknowledgement
  selection: ShoppingSelection[];
  at: string; // caller-owned estimation context; no ambient clock
  emptyMenuPlanRefs?: string[]; // only with selection:[], for actual saved empty plans
  force?: boolean;
}
interface SavedTeamMealsView {
  readonly kind: 'saved';
  readonly mode: 'real' | 'mock';
  readonly sourceRevision: string;
  readonly projection: TeamMealsProjection; // selected plans/dishes/materials/techniques, full original JSON
  readonly estimate: ShoppingEstimate; // no additional totals invented by Web
}
interface DraftViewRequest {
  inputs: TeamMealInputs; // caller owns an explicit unsaved working copy
  selection: ShoppingSelection[];
  at: string;
}
interface DraftTeamMealsView {
  kind: 'draft';
  selection: ShoppingSelection[];
  collection: IngredientCollection;
  estimate: ShoppingEstimate;
  // intentionally no revision, basis, saved projection or list
}
interface ShoppingListView {
  source: Source<ShoppingList>; // list blob/commit for C1 editor lock; NOT the ingredient basis revision
  basis: SavedTeamMealsView;
}
interface ShoppingReviewView {
  previous: SavedTeamMealsView;
  next: SavedTeamMealsView;
  result: ReconciledShoppingList; // list, added, removed, reviewRequired, retained from core
}
interface TeamMealsViewModel {
  loadSaved(request: SavedViewRequest): Promise<SavedTeamMealsView>;
  loadList(id: string, options: {at:string; revision?:string; force?:boolean}): Promise<ShoppingListView | null>;
  createList(id: string, basis: SavedTeamMealsView): ShoppingList;
  decide(list: ShoppingList, basis: SavedTeamMealsView, ingredientRef:string,
    decision: ShoppingDecision, bought?:boolean): ShoppingList;
  reviewList(previous: ShoppingList, next: SavedTeamMealsView,
    options:{at:string; force?:boolean}): Promise<ShoppingReviewView>;
  getAsset(basis: SavedTeamMealsView, query: Omit<AssetQuery,'revision'>): Promise<RevisionAsset>;
  dispose(): void;
}
function createTeamMealsViewModel(api: TeamMealsApi): TeamMealsViewModel;
function previewTeamMealsDraft(request: DraftViewRequest): DraftTeamMealsView;
```

`SavedTeamMealsView` is a frozen handle issued by this VM. Keep the returned instance, do not clone/reconstruct it or use another VM's view. The public type also has a private brand. The VM retains its original input snapshot in a WeakMap; pages cannot turn edited JSON or a typed cast into a saved basis. UI derived values stay pure; there is no separate candidate/decision cache.

`loadSaved` reads the catalog and each unique plan at exactly `revision`. Empty plans use `selection:[], emptyMenuPlanRefs:[id]`; this is read-only and `createList` rejects it. A nonempty selection whose meal was removed remains a valid scope and lets core return an empty list plus removed-item history during review. Missing selected plans fail `basis_unavailable`; absent dish/material references stay in core issues/candidates. All HTTP and revision failures propagate, with no latest fallback.

`loadList` obtains the list source (current or explicitly pinned), then loads its **basis.sourceRevision**, not its storage commit. It checks exact candidate membership through core. `reviewList` captures the caller's whole previous list before waiting, loads its old basis independently, and delegates to core with the next fixed inputs. It never stores the result. The page submits `result.list` as one whole body through the C1 editor; after rebase is acknowledged, later manual confirmations use a separate save. Removed items stay outside the current list and retain old bought information for a notice; removal does not undo a purchase.

`decide` checks that list scope/revision and candidate membership match the supplied handle, then calls core. Unresolved ingredient IDs can remain `check` but cannot be marked buy/available; the API remains authoritative. `getAsset` forces the handle's revision and returns authenticated bytes for an object URL owned/revoked by the page. Read material/dish/step JSON from `projection`, including original image, clip, provenance and source-index metadata. Missing records must remain visibly unresolved.

All these functions are read/derive only. `mode:'mock'` remains visible and does not promise shared persistence. The factory rejects network/list operations when Worker is unconfigured; `previewTeamMealsDraft` is always available and remains a local preview. For edits, use the existing C1 editor with `authSession:()=>api.sessionKey()`, whole bodies, and captured context IDs. No persistent menu-row IDs, inferred servings/quantities or copied procurement math.

Errors: existing C1 errors are preserved. VM-origin errors use `ApiError`: `invalid_view` for forged/foreign/cloned handles; `session_changed`/`worker_unconfigured` for unavailable scope; `basis_mismatch` for a list with a different revision/selection; `unresolved_ingredient` for forbidden confirmation; `basis_unavailable` for missing selected plans. Core list/projection errors (e.g. `invalid_selection`, `invalid_revision`) retain their code and become `ApiError` so D can pass them to C1 kit. Five new codes have zh/en/uk labels owned by C.

## Lifecycle and test obligations

Owner is the app's one VM per authenticated C1 API lifetime; no persistence or subscriptions. Census: the VM lifetime, pending read calls, and immutable saved handles; all projected lists and estimates are derived values. C1 continues to own HTTP cache and editor lifecycle.

| State × event | Transition / rule | Test |
|---|---|---|
| active × load | capture request; fixed concurrent reads; mint handle only after all succeed | mutation while awaiting and exact requests |
| active × auth change | seal VM, release handle registry; late returns reject | token/identity changed mid-read and after load |
| active × dispose | seal VM and release handle registry; API lifetime remains caller-owned | pending read, old handle, new operations reject |
| saved handle × UI mutation/clone/other VM | frozen; clone/foreign handles fail | nested mutation and forged-preview rejection |
| active × read failure | propagate; do not mint a partial handle or try current | revision denial, missing plan/catalog and upstream errors |

INV-C2-1: each handle is backed by exact revision and session (request/cross-revision tests).
INV-C2-2: saved provenance cannot originate in unsaved input (preview and forged-handle tests).
INV-C2-3: all candidates, estimates and decisions use formal core (Q fixture outputs and frozen golden arithmetic).
INV-C2-4: no operation writes or changes input bodies (request-method count/deep comparison).
INV-C2-5: old and next inputs are independent; review results preserve previous/removed (A/B mock fixtures).
INV-C2-6: no reference/unknown/status/price filter hides candidates (boundary fixture and missing material/dish cases).

## Implementation sequence

1. Commit this contract and send to dispatch for D before implementation. Scope stays in the existing isolated worktree per dispatch authorization; do not edit main or shared feature specs.
2. Add `packages/web/test/team-meals-view-model.test.mjs`, bundling the actual browser module and C1 API. Read Q fixtures unchanged and validate fixture entities with A1's formal validator. Record a red run for absent public exports.
3. Implement `packages/web/src/view-models/team-meals.ts`; add only needed shared error labels in `packages/web/src/admin/kit.ts`. Tests cover fixed reads, empty/cancelled plans, missing fields, all Q candidates, saved/draft provenance, real core numerical oracles, review semantics, mode/auth/disposal, and no writes.
4. Add `packages/web/test/team-meals-view-model-browser.html` for a mock-only browser flow with actual shared modules. Run Web tests/typecheck and the browser harness; no product-page claim.
5. Run repository commands confirmed from package scripts: `npm --prefix packages/core test`, `node --test scripts/validate-contract-fixtures.test.mjs`, `npm --prefix packages/web test`, `npm --prefix packages/web run typecheck`, `node scripts/build-data.mjs`, `npm --prefix packages/web run build`, `git diff --check`. No formatter is configured; avoid broad formatting edits.
6. Fix a local implementation commit, request independent non-author review, resolve findings with red/green evidence, and report exact approved SHA and limits to dispatch. All remote work and real B2/build integration remain paused.

Open questions: none requiring a product decision. D routes shared router/dictionary/data needs through C. Backend shape validation/provenance acceptance is the Worker contract; mock reads exercise orchestration only and cannot prove real repository history or assets.

Dependency update after initial contract: dispatch approved B2 code `32e674cd9bdc9f565cd1cfff263aa1f8c4367cde` with documentation-only head `a75250c36dfd2b280af2bb2d949c1e632af967e4` for local integration. C2a remains a fixed-input/shared-layer delivery; it has not merged that backend or claimed an HTTP integration run. C2b may now use that fixed backend; the new build pipeline still requires its own approval.
