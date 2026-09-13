---
feature_ids: [team-meals]
topics: [web, shopping, auxiliary-edits, auth, reload-safety]
doc_kind: author-handoff
created: 2026-09-11
---
# Purchase raw owner and formal auxiliary registration

Author evidence only; this is not an independent review or approval. No commit, remote call, real Worker write, publication, or rollback was performed.

## What

Only production `packages/web/src/pages/purchase.ts` changed. It keeps page-owned list ID, plan IDs and scope selection in the existing per-document View, with a monotonic generation and a captured applied baseline. `createPurchaseRenderer(api).readAuxiliary(key)` exposes a frozen, pure metadata snapshot (or null when the API's pure identity peek no longer matches). Keys are the existing route document key, e.g. `new/team-week` or `team-shop`; no credentials or bodies enter identities.

The owner registers synchronously with the approved C `registerAuxiliaryEdits`, stable `purchase-buffer/<key>` ownerId, the same API boundary, and `operationTracking:'tickets'`. The returned handle lives with the View. Cross-language/route paints reuse it; auth changes do not invent another identity map. The registry keeps unresolved old-auth operations protected and retires them only after their original closures settle their original tickets.

Relevant production anchors:

- `purchase.ts:19–34`: raw owner, baseline, registration.
- `purchase.ts:53–64`: readonly tickets, operation guard shared across paints, raw input events.
- `purchase.ts:125–157`: late scope result fence, preserved explicit selection, captured create/rebase consumption.
- `purchase.ts:175–197`: conflict adoption baselines, local clipboard tickets and readable failure fallback.
- `purchase.ts:201–208`: original `ctx.setReloadCoverage` in finally and pure exported metadata.

Every page-level non-C1 readonly work item has its own read ticket: initialization, scope batch, C2 creation/rebase derivation, comparison/adoption, each asset request and the technique catalog request. Dependent C2 internal reads remain within their enclosing work item's ticket; purchase-form and shared APIs were not modified. C1 save and `reconcileUnknown` retain sole ownership of their own operations and acquire no auxiliary ticket. Clipboard promises hold independent local write tickets until the API resolves or rejects.

The formal PageCtx field is consumed directly after approved C source `873526e6` / D cherry-pick `5d5ff7f`. No intersection type or fake registration was added.

## Why

The old per-render busy flag disappeared on language/navigation. Latest-plan reads overwrote later plan-ID inputs and reset unchecked selections. A pending creation derived `captured-id` but navigated using the later `view.listId`, opening another ID. Inputs had no reload owner, and original initialization coverage could remain unknown after an auth transition.

A final sweep also reproduced a stale scope version after adopting a different remote basis (`red-shopping-raw-adoption.txt`: 1/2). Explicit successful adoption now advances the real baseline and refreshes untouched scope inputs; an input changed after the C1 replacement notification remains pending.

The new raw notice explicitly says the ID/scope choices have not been applied. Initial fields are clean defaults; reading an unapplied new scope or changing choices makes the raw owner dirty. Existing list initialization starts from its genuine C1/C2 source. Applying a scope successfully consumes only its captured baseline; later text remains dirty through rebase and save ACK. Changing plan IDs prevents applying an older loaded scope until the chosen plans are read.

## Tradeoff

C1 remains the only ShoppingList JSON owner. This page stores input/baseline/source presentation metadata, not a second list body or auth map. A readonly result abandoned by route/auth changes cannot consume the pending inputs. Pending readonly work stays protected until its real completion; no timeout is treated as success. C's ticket state supplies busy/unknown to the aggregate; the exported raw metadata's phase is idle because it describes local inputs only.

This is page-level integration. Browser fixtures inject a real `createPageReloadCoverage().beginRender(...)` callback. They do not certify main.ts / service-worker shell integration, which belongs to C/root.

## Evidence

Original page used for RED: `acd44750b0593f682fa14ecd16daeff898655078:packages/web/src/pages/purchase.ts`.

- Initial actual-page RED: 0/9, `red-shopping-raw-owner.txt`.
- Expanded reproduction against that original page, with corrected complete fixture ingredients: 0/15, `red-shopping-raw-final-sweep.txt`. The test's optional `PURCHASE_PAGE_BASELINE` esbuild hook loads an explicitly supplied original source file; no production file was swapped during the reproduction.
- Final raw suite: 18/18, plus existing controller/copy regression = 35/35, `green-shopping-raw-owner.txt`.
- Full web suite before the final two-case conflict-adoption sweep: 323/323. After that fix, the latest shared worktree run was 325/329: the four failures are concurrent Publish registry tests at `team-meals-pages-publish.test.mjs:125,128,131,137`, outside this task; see `intermediate-shopping-raw-web-publish-wip.txt`. All purchase tests passed. This is not a whole-worktree green claim.
- Web TypeScript and `git diff --check`: pass.
- Actual Chrome against HMR-disabled local port 4195: raw registry workflow 15/15. `shopping-raw-browser-results.txt` contains actual DOM result and fixture request/assertion ledger.
- Actual original shopping workflow on new D regression fixture: PASS (`shopping-raw-regression-browser-results.txt`) — all-check create + If-None-Match ACK, later manual bought + If-Match, original ingredient/dish version, changed scope whole-check rebase, removed bought notice outside current list, later confirmation, held save and return, lost-response exact read recovery, conflict compare/adopt, clipboard fallback.
- Six viewport/language observations: 393/1440 × zh/en/uk all retained `review-this-raw`, translated pending notice, and `scrollWidth === innerWidth`; see `shopping-raw-browser-layout.json`.
- Screenshots: `shopping-raw-en-1440.png`, `shopping-raw-uk-393.png`. Widths were verified from the actual tab; the first temporary narrow capture targeted another tab and was overwritten with a confirmed 393 px capture.
- Raw browser error console: empty.

The sweep includes different-basis conflict adoption with untouched and later-edited raw, late plan-ID reads, selected/unchecked scope, creation failure/route cancellation, rebase/ACK after later raw, C1 unknown without duplicate auxiliary tickets, independent concurrent reads, coalesced identical GETs, A→B initialization settlement, stale language/auth input handlers, stale discard proposal, unconfigured/malformed readonly coverage, and two independently settling clipboard promises.

Fixture caveats: Q afc3289 objects and revision tokens are explicit local samples, not asserted historical commits. The first browser attempt failed because the harness waited only for the hash to change before route paint; this was corrected to wait for the actual detached DOM before return. The passing rerun exercises the production page. The added remote-adoption browser assertion also waits for the page operation to finish (read button enabled), since C1 replacement legitimately notifies before the auxiliary baseline settlement; checking only the clean C1 phase observed an intermediate busy state. The legacy regression fixture's manual same-API renderer replacement would correctly violate stable-owner registration; the new D copy reuses the same renderer for language/reopen. Cold controller reads remain covered by the unchanged controller test. The original fixture was left untouched.

## Open questions and next action

No implementation blocker remains for this bounded page work. Root should fix a checkpoint containing only the listed page/tests/fixtures/evidence and send it to a non-author reviewer, including initialization/auth cancellation, raw baseline consumption and same-source shopping invariants. Root/C still own actual shell integration. Do not treat these author checks as approval.

Browser entrypoints:

- `/test/team-meals-pages-shopping-raw-browser.html`: `#run`, `#lang`, `#hold-read`, `#release-read`, `#auth`, `#away`, `#safety`; production selectors `[data-focus="new-list-id"]`, `[data-focus="plan-ids"]`, `[data-purchase-raw-pending]`, `.tm-slot input`.
- `/test/team-meals-pages-shopping-raw-regression-browser.html`: `#run` executes the prior full shopping workflow through the actual renderer, C1 and C2.

Final production SHA-256: `176b0a7af1ae0276b6a395415a1e5fbb09593d01affd4714f812513e07ac3acd`.
Final raw test SHA-256: `49cb68d3c6c66fa160be9b040b78c7a6cfc66eabf23e8109e93b117c0bacb295`.
