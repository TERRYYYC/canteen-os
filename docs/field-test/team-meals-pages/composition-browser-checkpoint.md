---
feature_ids: [team-meals]
topics: [browser, integration, plan, shopping, responsive-layout]
doc_kind: verification-checkpoint
created: 2026-09-11
---

# Approved shared implementation with Plan and Purchase

Production base: `3eb2f351755b73122b26f2a2cee5a523dee49aaa`, the complete C `4ebaa9410634e7850200037341b497a7b55773da` history merged with approved D pages. Later `23b1543` changes only evidence documents. These observations exclude concurrent unfinished Menu/Prep public-entry edits and do not approve the complete application or L2.

What: root ran the actual Plan and Purchase renderers with the approved C1/C2/auxiliary implementation in IAB at `127.0.0.1:4195`, using committed explicit local transport fixtures. Why: verify the previously approved page workflows and retained raw input against the newly released shared history. Tradeoff: fixture navigation supplies PageCtx directly; actual main/router/native SW are being independently checked in a separate exact archive. No real service or repository write occurred.

## Recorded outcomes

- `composition-plan-flow.json`: actual Plan + C1 PASS. Saving while editing, language redraw, route detach/return, lost response and exact-source recovery preserve the later value. The request ledger contains complete plans and conditional writes; the original remaining unknown count stays absent.
- `composition-shopping-flow.json`: actual Purchase + C1/C2 PASS, 46 recorded assertions. Exact all-check creation is acknowledged before a separate manual decision write; same-version ingredient/recipe details retain the original source; changed scope requires the full reset before later confirmation; removed bought materials retain their notice. Clipboard rejection shows readable export text, held save survives navigation, lost ACK uses read-only recovery, and conflict compare/adopt retains explicit decisions.
- `composition-plan-shopping-layout.json`: 12 actual DOM observations, each with the requested viewport and the measured `innerWidth`, `innerHeight`, `scrollWidth`, visible text and inputs. Plan and Purchase both pass zh/en/uk at 393×852 and 1440×900. Every observation has `scrollWidth === innerWidth`. Input arrays and the Purchase decision pattern remain identical across languages and sizes.
- `composition-{plan,shopping}-{zh,en,uk}-{393,1440}.jpg`: direct viewport captures. IAB returned original JPEG bytes, preserved without transcoding. Root inspected the Ukrainian mobile and English desktop layouts. These are author presentation evidence and remain distinct from independent approval.

The observed product states show the simulation notice, separate storage/source revisions, unknown counts, seasoning candidates, distinct IDs for same-name materials, and incomplete numerical references. No customer or inventory transaction flow is introduced.

## Superseded fixture and capture attempts

The first Purchase attempt accidentally used historical `team-meals-pages-shopping-browser.html`. Its language step creates a second renderer for the exact same API/owner scope, triggering the registry's `Duplicate auxiliary owner` guard. `composition-shopping-obsolete-fixture-failure.json` preserves the failing result and complete request ledger. Inspection traced the exception to that duplicate `createPurchaseRenderer(api)` call. The actual production module has one renderer, and the already approved `team-meals-pages-shopping-raw-regression-browser.html` reuses it for language/navigation. Root switched to that committed regression entry and the full workflow passed; no production change was made to suppress the guard.

Runtime preflight identified the local preview listener as port 4195 / Node PID 31257. Process start-time inspection was denied by the local sandbox, so no claim about process age or stale compilation is made. Browser-loaded source is the current worktree's Vite module. Relevant production checksums below identify the observed composition.

Initial full-page screenshot attempts had stitched repetitions that were absent from the actual DOM. They are preserved outside the repository as `/private/tmp/shopping-stitch-intermediate-{zh,en,uk}-{393,1440}.png` and are not layout evidence. An initial multi-tab viewport sweep targeted only the last created IAB tab; its measured mismatch is retained at `/private/tmp/composition-layout-initial-target-mismatch.json`. The final sweep used an isolated tab per page, checked the actual dimensions before each capture, and produced the 12 matching observations above. No failed measurement is represented as a pass.

## Production identity

| File under `packages/web/src` | SHA256 |
| --- | --- |
| pages/admin/plan.ts | 8f7e8552bfcc7c4da7360e48474df95fc82e8921ca7bb79ea60e3273fbe0cbf4 |
| pages/purchase.ts | 176b0a7af1ae0276b6a395415a1e5fbb09593d01affd4714f812513e07ac3acd |
| pages/purchase-form.ts | 0ba62e8ca2860a9d009f02ea2c4c1fb909dbc10b766bdfdb42d4f6f3121a4089 |
| pages/team-details.ts | 7e11c51482927ac11b2e75d8604e01a3de8d6fadd9b0e2db4d4fc8ccf43c2aab |
| view-models/reload-safety.ts | 50ea7bf0702885b7a4dd87915a6cce1e40b7a03e7d766cb834613077b59e8b03 |

Open: complete and independently review formal Menu/Prep entry wiring, then consume the separate actual-main/D-page/native-SW report. Original individual page review receipts retain their own scope. Real Worker roundtrips, genuine deployment, publication and isolated L2 remain untested here.
