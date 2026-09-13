---
feature_ids: []
topics: [team-meals, dish, review, raw-buffers, auxiliary-writes]
doc_kind: implementation-evidence
created: 2026-09-11
---

# Dish independent review — implementation response

Input: `/private/tmp/canteen-dish-review-6ca272d/REVIEW.md`, reviewed production `6ca272d1f34e525f6680177cffa24a51353fa828`, engagement local_cat / iterative. Original reviewer is `/root/plan_review`; this response is from the repair author, not an independent approval. The direct review carrier remains RC-D root. Accepted source: original RC-D dispatch, D0-contract.md and dish-editor.md, especially raw optional values, whole-snapshot C1 save ownership and language/route preservation.

| Finding / mechanism | Repair | Evidence |
|---|---|---|
| D-R1: Add another tested the active existing dish, then deleted a different `new` record | It checks the record being replaced. A dirty, unresolved or busy new record is resumed. Only a resolved replaceable record is removed | Copied independent adapter probe failed with dirty/empty id before repair and now retains outcome-unknown/new-soup. Browser confirms the verify action and original fields survive |
| D-R2: JSON dirty overwrote raw-form dirty, although pending image and inline ingredient were not serialized | Raw pending image, inline ingredient and detached unsynchronized edits contribute to the owner’s dirty state. Refresh does not erase them; status and beforeunload include raw state | Independent photo probe red→green; browser beforeunload true before/after Ukrainian redraw while preview remains; inline buffer and navigation tests |
| D-R3: `saving` and `busyNow` belonged to a paint closure, so redraw enabled duplicate auxiliary requests | Per-document auxiliary operation ownership survives language and navigation; all newly painted controls consult it. Main photo save uses the click-time JSON/metadata snapshot and reapplies later edits as a separate C1 generation | Browser observes upload count 1 and disabled save before/after redraw. Adapter tests preserve later name/attribution edits and prevent upload repetition after return |

Failure-mode sweep: the shared failure mode was a document lifetime being represented by a view lifetime. Inline ingredient writes received the same guard; their input controls stay locked during their own write. A submitted ingredient snapshot is frozen before upload; late input changes remain as a raw draft and an acknowledged blob lock is retained for a subsequent explicit save. Success binds an ingredient reference only if the raw fields still match the submitted document. Browser observes one auxiliary write across redraw, disabled input/save, and the expected ingredient reference afterward. No fallback layers were added; ownership moved into the already-existing Dish page record. The repository has no `check-fallback-layers.mjs`; no fake checker result is claimed.

Auxiliary state preparation: each existing record now has a monotonically increasing raw generation, incremented on inputs, auxiliary start/result and explicit replacement. `readAuxiliary(key)` returns a read-only `{generation,dirty,phase}` derived from its real buffer/operation state. Phase can be idle/busy/unknown. Unknown auxiliary outcomes retain the record and reject repeat writes. No JSON field, global update aggregator, reload module import or `PageCtx.setReloadCoverage` claim was added. This prepares the approved C2b-aux contract `a175d876d829fdffacf11a7813b33523d8ba557a`; the shared implementation and true registration still belong to C/root.

C1 boundary: if an upload completes while another Dish is active, the successful ImageRef stays with the original raw record, whose draft remains unsaved. Returning and explicitly saving consumes that reference without uploading again. The adapter does not switch C1’s current document in the background or invent an offscreen-save method. Unknown image/ingredient auxiliary results have no supplied verification-read contract; the page reports the unresolved state and keeps its protection. It does not pretend to recover them or silently retry.

Validation: original Dish 10 tests plus the independent D-R1/D-R2 probes produced 10 pass / 2 fail before repair (`red-dish-review.txt`). The current targeted suite is 17/17 (`green-dish-review.txt`). Additional cases cover original submitted snapshot, later image attribution, detached completion, inline raw lifetime and unknown auxiliary protection. Web suite passed 179/179; typecheck and diff-check passed. All source conversions preserve optional values and source metadata under the original tests.

Actual browser: CUA Chrome at the exact workspace’s stable local port 4195, `test/team-meals-pages-dish-browser.html`, clicking “Run dish review probes”. All four rendered-DOM checks passed; copied observed output is `dish-review-browser.json`. The fixture exercises the production renderer and C1 editor with explicitly replaced local API methods; the `real` UI branch is used only to enable auxiliary controls. The image is generated locally. This does not prove a real Worker, real upload, deployment, all viewports/languages, or visual signoff. The iab provider was unavailable; Chrome was used for the bounded local verification. A temporary 4186 preview was used earlier and is stopped after this task.

Files: only `packages/web/src/pages/admin/dish-new.ts`, its existing Dish test/browser fixture, and these D evidence files. Home/import/shared/API/router/store/Q E2E were not edited in this repair. Workspace branch is `codex/team-meals-pages`; start HEAD `631298aec7d89bba4ee884f4a5ef4258ddaad38d`, parent later advanced to `b45d40393886f2d8f4cf6d1bc94aa4091c1c7e21`. Repair remains uncommitted; no remote operations.

Next action: root can capture a fixed commit and return the changed source and evidence through the original iterative review carrier. These author checks close the repair work, not the independent review or full feature acceptance.
