---
feature_ids: [team-meals]
topics: [web, independent-review, browser, pwa]
doc_kind: evidence
created: 2026-09-11
---
# Independent native observations at e79fe3b

Reviewer `/root/c1_review`, Chrome through CUA, own local server. This is a transcription of directly observed UI evidence; not a server-generated raw JSON export. Fixed source `e79fe3b49b2a5d3c06c5d7298d9207adc5cc3c71`.

Actual-application server: `http://127.0.0.1:52293/canteen/`, source snapshots `/private/tmp/c2b-real-sw-6rwB1W/a` and `/private/tmp/c2b-real-sw-6rwB1W/b`. Production main and all pages are unchanged. Original non-author `application-review.ts` is inserted before main solely for test controls and a local simulated API. Formal producer and generated native SW are real. Source equality for all 52 tracked Web src files is recorded in `source-verification.json`. No real backend/L2 claims.

Clicked `1 Run actual application matrix`: **31/31**. Observed retained raw owners for Plan, Import, Dish, Ingredient and Purchase across actual routes/language; offscreen held/unknown C1 save, two-read ACK reconciliation retaining later input, old-auth initialization/ticket isolation, Publish known-run terminal proof, two separate clipboard tickets and C2 all-check-before-write flow. This checks integration risks of loading; it does not repeat the full D acceptance matrix.

First-document registration started without controller. Retained Workbox ledger explicitly showed installed/activating/controlling with `controllerAtProbeStart:false`, and controlling `isUpdate:false`, followed by `controllerNow:true`. Switched own server to B. Clicked `2 Request real SW check` and `3 Verify dirty update dialog`; UI evidence became **33/33**, adding “new generated service worker waits without reload or activation” and “actual update requires one explicit discard decision.” Actual Plan input was `11`, reason dirty, boot 1, original same editor until consent.

Clicked `Confirm production dirty-discard update` exactly once. Final UI evidence showed head e79fe3b, boot **2**, summary **2/2**, `nativeReloadStable:true`; checks were “new application JS lifetime follows exactly one user-authorized reload” (beforeBoot 1, actualBoot 2, case explicit-dirty-discard:plan) and “native reload remains exactly once after the update settles” (expected 2, actual 2). Safety clear. Retained `nativeIntent.beforeEvidence` contained the above 33/33 and first-document ledger. Reinspection after unrelated graph/offline work still showed stable boot 2. This directly verifies R3 first-document behavior survives the route-loading change.

A separate uninstrumented original-config application on port 63832 established execution-vs-precache distinction. Initially locked Admin: only entry/Admin/Workbox-window module resources executed; all 20 application JS cached, missing []. First unopened Menu loaded its Menu and shared Prep modules from SW with network disabled. JSON failure was isolated and recorded separately in OFFLINE-FINDING.md. A later controlled-document offline reload rendered full same-revision B Menu from real cached JSON.
