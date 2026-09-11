---
feature_ids: [team-meals]
topics: [independent-review, actual-main, pwa, composition]
doc_kind: review
created: 2026-09-11
---
# Final C/D composition review — 9480260

**Decision: APPROVE, bounded local composition.**

- `reviewedHeadSha`: `94802608447a3a6dbc60a8ca21cb9b6b0ad83a11`
- Review subject: final C/D actual-main/PWA composition, scoped by parent dispatch in task `01a08db7-43f3-7952-adb5-75106389e557`.
- Reviewer: `/root/plan_review`, original non-author reviewer of APP-MAIN-R1/R2/R3 and D Node20 harness. No reviewed production code was authored by this reviewer.
- Carrier: iterative `local_cat`, returned directly to `/root`.
- P1 findings: none. P2 findings: none in this fixed scope. Original APP-MAIN-R3 closes for this composition; prior R1/R2/ACK closures remain supported as described below.
- This is **not** whole-application or D1 completion, performance acceptance, a Q unlock, L2/real Worker evidence, publication, deployment, or authorization to perform those actions. The known first-load gzip **63.68 KB > 60,000 bytes remains OPEN**. Later floating C performance work was not consumed.

## Accepted inputs and fixed scope

Original accepted D source is `docs/design/team-meals-pages/D0-contract.md@ad5651787be4a54ef28060f6345f61187e78cd9d`, with original task dispatch. The original acceptance source `STANDARD-DATA-AND-ACCEPTANCE.md` has SHA256 `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352`. The resumed C defect contract is `docs/field-test/team-meals-web-shared/APP-MAIN-R3-contract.md@dfb68c8923290cd8d16988678f6d2a16414c3d23`.

The final merge preserves both parents: `f2b5354dbca4460d5b393e7b081f0f5dee54459b` and approved C `7f3b4e65c03b4329ffd5b72ad4846937830f6d9c`. Approved D test repair `b1c84349f322601488a751961b646c97d24d55c7` is an ancestor. `accepted-inputs.json` records the actual ancestry. `review-inputs.json` records the three immutable prior reports and verified SHA256 values, including original C report `44bf62e4cbde1dad6c2eb3c2f0de0533188ffb34e0a3f747f20bfbf3298fb1b7`.

I archived this exact commit to `/private/tmp/canteen-final-composition-review-9480260`. I independently verified all 95 production/config/test entries in `production-integrity.json` and rechecked them at the end. Final production equals approved C 7f, and the two D test files equal approved b1. Relative to my prior 34dd review, **the only changed production source is `packages/web/src/pwa.ts`**. Main, pages, public presenters, C1/C2/auxiliary owners, core, worker, index and Vite config were not replaced or patched for this review. All nine served browser variants contain the exact 52 production Web source files; `server-integrity.json` binds each build to its exact reviewer injection.

Risk under review: worker completion and exactly-once behavior; preservation of private/raw/offscreen state; stale consent and auth protection; immutable public revision continuity. No irreversible action or live external write was performed.

## Independent execution

All offline checks used the actual Node **v20.20.2 darwin-arm64 executable**, not a version label or Node24 alias. `runtime-node20.json` identifies it. The full Web suite passed **429/429**, with zero failures, cancellations or skips. Typecheck and prerequisite core compilation exited 0. Affected PWA integration plus reload-safety targets passed **26/26**; these are a subset, not 26 additional distinct full-suite tests. Raw logs and reproduction commands are retained in `COMMANDS.md` and the four named logs.

For browser evidence I designed and inspected the probes and decided outcomes. `/root` operated the real IAB UI serially, waited each step to settle, and saved the complete original JSON. I read the resulting files, including failures and intermediate snapshots. The fixture injects explicit simulated private API responses before the unchanged actual main singleton. It uses the real producer, Vite output, generated service workers, native controller changes, actual dialogs, actual location.reload, and actual pages. Workbox event instrumentation only observes and forwards the original event; it does not manufacture activation/reload callbacks. Application boot count records a new JavaScript document lifetime. The test owns only its review-prefixed evidence/intent markers; it does not clear production owners or drafts to pass checks.

| Required behavior | Exact final evidence and result |
| --- | --- |
| First document begins without a controller, A claims it, later B waits, one stable explicit dirty-discard consent completes reload | `first-before.json`, `first-waiting.json`, `first-native-update.json`: initial `controllerAtStart=false`; waiting remains boot1; one actual consent produces boot1→2, **2/2**, stable after five seconds. This closes the original R3 native symptom. |
| Controlled-start comparison | `controlled-install-baseline.json` is setup only; a separate document begins controlled in `controlled-before.json`. `controlled-native-update.json`: one consent, boot1→2, **2/2**, stable. |
| External activation without consent refreshes the reader and preserves editing DOM | `external-no-consent.json`: **3/3 cumulative**, boot1, dirty Plan input 11 and same input node retained; no update consent was issued. |
| Offscreen pending and unknown saves block update override | `pending-block.json` **3/3**, then `unknown-block.json` **4/4**: actual saving/unknown state and only the continue-editing choice. |
| Source proof restores unknown without repost or unsolicited reload | `source-recovery-no-reload.json`: **5/5**, exactly two additional Source reads, unchanged POST count, clear state, still boot1. |
| Old-auth late write stays protected and anonymous | `old-auth-before-native-check.json` **7/7**, `old-auth-protected.json` **8/8**: old transport completion does not expose the previous private identity or provide a discard/update override; current document remains boot1/unknown. |
| New input invalidates the consent snapshot | `consent-input-invalidated.json`: **3/3**, actual selected-worker takeover with Workbox `isUpdate=false/isExternal=true`; boot1, raw 12 and dirty state survive, zero POSTs. The comparison captures the DOM after the real input handler's legitimate repaint. |
| Cancelled/expired consent cannot be spent by its late selected worker | Fresh split-phase `cancel-split-verified.json`: **3/3**, saved exact worker object equals the actual current controller, state activated, boot1, raw 11/dirty preserved. The actual language cancellation and subsequent timeout/keep-editing state are retained in `cancel-split-started.json` and `cancel-split-modal-state.json`. |
| Fresh consent after cancellation/timeout completes once | `cancel-split-fresh-retry.json`: a new actual Ukrainian discard dialog is accepted once; boot1→2, **2/2**, clear and stable. The before-evidence retains raw 11 and the new decision; trusted native beforeunload is recorded with `prevented=false`. |
| Updated public entry retains one published revision and complete original recipe/assets | `public-after-update.json`: **10/10 cumulative** (2 boot checks plus 8 public checks). After the successful first-document update, actual Menu→full recipe→material Prep uses B `42dbfe22d092e3a36eba744dfa4c0eeff591c3db`: five components, three steps, original 7500 g with no servings multiplication, decoded 2×2 same-revision image, no private API fallback. Offscreen invalid Plan raw survives the trip and languages. |

Counts above are per-file cumulative ledgers; they must not be added together as independent test totals.

## Retained unsuccessful/intermediate evidence

The first combined cancellation probe on 4280 successfully completed the input-change case, then its second update reached a real waiting worker. Its immediate language-cancel helper did **not** observe the selected controller within the helper's 15-second deadline: `consent-language-cancelled-later.json` remains **4/5**, boot1/dirty/raw12. The earlier `consent-language-cancelled.json` is an intermediate 4/4 snapshot while that helper was still running, not a completed cancellation pass.

The actual page displayed the approved two-second update-timeout dialog in Ukrainian. I inspected its original JPEG and DOM (`consent-language-timeout-dialog.jpg/.json`). Attempts to click the outside Inspect button while this modal was open did not execute because the modal made outside controls inert; the two `consent-language-native-state*.json` snapshots contain **no** native registration result and are not claimed as such. After the actual sole keep-editing action, `consent-language-native-after-keep.json` records late native controlling, publication time changing to A-time, no remaining waiting worker, and raw12/boot1/dirty preserved. No new consent was issued there and the original failed assertion was not rewritten.

The cause of the browser's delayed delivery in that cancelled multi-update case was not established. It is not evidence that an unchanged valid consent failed: consent was deliberately cancelled, and the contract explicitly expires it after two seconds. The required safety result is no forced/replayed reload, followed by a separately authorized retry. To verify that result without guessing timing or weakening the failed assertion, I used a fresh origin and split the action and observation into two visible controls. The new probe retains the exact selected worker by identity across tasks, checks its real takeover and retained raw, then removes only its own no-reload test marker after verification. A subsequent ordinary production confirmation proves recovery. Both original and split-phase probe sources and all original failed files are retained. There is no blanket claim that every attempted browser assertion was green or that all activations meet a latency bound.

Before running the input-change probe I corrected a reviewer-only DOM comparison to capture the post-input repaint; the earlier built injection remains `application-review-initial.ts`. This was a pre-run fixture correction, not a product RED. Separately, the first 4281 local server bind failed with sandbox EPERM; its log is retained alongside the authorized successful listener restart. Neither event changed production or the immutable 34dd/b1 evidence.

## Source reasoning and inherited coverage

`pwa.ts` captures the exact waiting ServiceWorker immediately before activation, then requires that object to become the current controller. Both plugin and native signals enter the same synchronous coordinator check. The native completion check runs before reader refresh. Cancellation, timeout and a new request clear the target; coordinator consent is consumed before reload and rejects changed safety stamps. Thus unrelated workers, duplicate callbacks and later evidence cannot spend a stale intent. The independent affected tests also cover both callback orders, duplicate signals, same-URL/different-object rejection, generation/pending/unknown changes, cancellation and timeout.

The prior 34dd report and its 83 original evidence files remain immutable. I consume its R1 real team navigation, empty/legacy distinctions, R2 private-listener removal, ACK current/late type guards, startup-read failure handling, three-language pages and corrected Plan→preview→Purchase continuity evidence because their production sources are byte-identical here. The new actual-native success and protection chains validate the changed shared PWA composition rather than merely copying the C approval. The new public check establishes post-update version continuity; the full earlier public traversal/matrix was not mechanically repeated.

Offline/no-SW variants, a full three-language navigation matrix, purchase's large page matrix, and every page-specific suite were **not** rerun in the browser in this final pass. Existing approved shared evidence and unchanged source may be consumed for those specific bounds; this report does not claim every browser, operating system, offline environment or whole-site condition was newly exercised. Private APIs are explicitly simulated. No real Worker, irreversible write, publication, rollback, remote operation, or deployment was used.

## Handoff

- **What:** approve this exact final C/D main/PWA composition and close original APP-MAIN-R3 at 948026; retain prior R1/R2/ACK closures.
- **Why:** real first-document and controlled-start native reloads complete once; external/invalidated/cancelled/pending/unknown/old-auth chains remain protected; later fresh consent recovers; updated public revision remains coherent; actual Node20 CI scope passes.
- **Tradeoff:** use targeted actual native paths and byte-proven inherited page coverage instead of repeating every previous page matrix. Original timing failure and all intermediate artifacts remain explicit.
- **Open questions / limits:** no open P1/P2 in this bounded scope. First-load 63.68 KB versus 60,000-byte budget remains open; performance, Q, L2 and entire application/D1 acceptance are outside this verdict.
- **Next action:** parent may archive this original report and its manifest as the local composition receipt. Any later production change, including the floating performance candidate, needs its own exact-version review and applicable combination evidence.
