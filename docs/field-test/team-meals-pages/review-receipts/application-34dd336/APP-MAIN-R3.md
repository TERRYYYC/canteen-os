---
feature_ids: [team-meals]
topics: [independent-review, pwa, regression]
doc_kind: review-finding
created: 2026-09-11
---

# APP-MAIN-R3 — P2: first-installed document activates an update without finishing the approved reload

reviewedHeadSha: `34dd3364ad9397cac3ded4b8ee5460dac09fc879`
owner: C shared PWA integration, not the four D page guard-removal author
status: changes_requested
source location: `packages/web/src/pwa.ts:222–225` (exclusive final callback), `:239–245` (native controller observer refreshes reader only)

On a fresh origin, keep the first document open after its initial service worker claims the page. When a later generated worker waits, choose the production update action and confirm discarding a stable dirty draft. The new worker activates, but the application never calls its reload boundary; after two seconds it reports that the update did not complete. The page remains boot1. A second explicit user intent works because there is no longer a waiting worker and the coordinator takes its direct reload path.

This is independently reproduced with actual main and actual generated native workers for Ingredient, Import and Dish (`ingredient-native-reload.json` 7/8, `import-native-reload.json` 3/4, `dish-native-reload.json` 3/4). All three consent snapshots are identical before/after; their separate retries boot2 once and remain stable (`*-native-retry.json` 2/2 each). The original private beforeunload regression is therefore repaired; this is a distinct remaining callback gap.

A separate passive Workbox-event observer, preserving every original dispatch, isolates the cause on real Plan: `native-first-document-diagnostic.json` 3/4. At first startup `controllerAtProbeStart:false`; the subsequent waiting worker has `isExternal:true`, and its actual controlling event is `{isUpdate:false,isExternal:true}`. No native beforeunload is reached; the safety stamp remains byte-identical. The declared installed `workbox-window@7.4.1` assigns `_isUpdate = Boolean(navigator.serviceWorker.controller)` only during register (`Workbox.js:294`) and forwards that captured value for later controlling events (`:223–227`). The declared `vite-plugin-pwa@1.3.0` prompt listener calls the supplied `onNeedReload` only inside `if (event.isUpdate)` (`dist/client/build/register.js:57–60`). `initPwa` currently relies exclusively on that callback to finish waiting-worker consent.

Expected: a valid user intent and unchanged safety snapshot can finish exactly one reload after actual activation, including a document that began before the initial service-worker claim. External activation without consent, changed generations, pending and unknown must remain blocked. Do not solve this by bypassing the coordinator, clearing owners or automatically replaying expired consent.

Reproduce reviewer site `http://127.0.0.1:4250/canteen/`: fresh origin A → Minimal Plan dirty setup → serve B at `/private/tmp/c2b-real-sw-FrLD2T/state.json` → 2 Request real SW check → Confirm production dirty-discard update → wait5s → Inspect live state. Exact tool and server sources are in the review archive; no real API or remote writes. Further controlled-start comparison is being collected separately and is not needed to relabel this failure.

Controlled-start comparison completed independently: `native-controlled-update.json` is 2/2, actual boot1→2 exactly once after a waiting worker and explicit discard. Its beforeEvidence records `controllerAtProbeStart:true` and `isExternal:true` for the waiting update, whereas the failed first-document trace starts false. Both use the same candidate production and real generated workers; only the new document's initial control state differs. Thus external classification alone is not the failure; the captured initial-control/isUpdate gate is decisive.
