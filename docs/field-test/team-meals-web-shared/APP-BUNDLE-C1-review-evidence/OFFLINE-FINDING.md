---
feature_ids: [team-meals]
topics: [web, published-data, offline, independent-review]
doc_kind: review
created: 2026-09-11
---
# Inherited P2: refresh-tagged JSON bypasses the installed offline publication

Reviewer: original non-author `/root/c1_review`; local_cat, iterative. Observed implementation: `e79fe3b49b2a5d3c06c5d7298d9207adc5cc3c71`. This is a separate existing shared reader/PWA integration finding, not a new defect in APP-BUNDLE-C1's route-loading delta. No production repair was made.

## Finding and cause

**P2 — after a service worker takes control, an unopened published page can fail offline despite its exact publication being installed.** At `packages/web/src/view-models/published.ts:85`, `clearCache()` assigns a persistent `refreshTag`. The default tag is used by subsequent JSON reads at lines 76, 86 and 101, including the projection request at line 178. `loadPublication({fresh:true})` enters this path at lines 127–129. Main wires PWA publication refresh to `fresh:true` at `packages/web/src/main.ts:36`; the native controller handler invokes it at `packages/web/src/pwa.ts:258–266`.

The original generated SW precaches ordinary `data/**/*.json` paths. A later `?__publication=...` request does not match that route; no JSON runtime-cache rule handles it. The tag is needed for freshness checks, but retaining it for every subsequent read leaves a same-revision offline copy inaccessible. This is observed failure, not a proposed relaxation of revision validation. Version-bound assets explicitly pass an empty tag and are outside this finding.

## Independent real-browser reproductions

Chrome, own loopback origin `http://127.0.0.1:63832`, exact source, original Vite configuration and generated native SW. The production app ran uninstrumented inside an outer diagnostic frame. The outer controls changed only local network availability, route, and external SW activation; cache inspection was read-only. Data came from the formal producer. Network-off destroys the local app-content response, so any successful app-content read then must be supplied by the installed SW/cache. No remote Worker or production API was involved.

1. **First document / first claim.** Start at locked Admin with no controlling SW; wait for original SW installation/claim and successful fresh manifest request. All 20 application JS files were cached (missing `[]`), while the document initially executed only entry, Admin and Workbox-window. Disable app network, then first-open Menu. Menu and its shared Prep module load; projection fails with `unavailable · projection · a968dcc67ee565abf0cb71735a5d42e26f756ca6`.

   Exact failed request: `/canteen/data/team-meals/week-41.json?__publication=1789102208211-1-1`. The ledger marks it `available:false`; the earlier manifest request used the same tag.

   Real cache `workbox-precache-v2-http://127.0.0.1:63832/canteen/` contains:
   - `data/build.json?__WB_REVISION__=89a88e8db59c2743672ee2bc3d5f5b37`
   - `data/team-meals/week-41.json?__WB_REVISION__=69591257d7352a56ab1fccb13696d3a3`

   Both cached JSON bodies identify `a968dcc67ee565abf0cb71735a5d42e26f756ca6`. Raw ledger: `/private/tmp/app-bundle-c1-independent-first-claim-requests.json`. Actual JSON-cache capture: `/private/tmp/app-bundle-c1-offline-evidence/01-first-claim-cached-json.json`. The diagnostic server was restarted solely to add cache-body inspection after the failure; this capture was taken before installing B. It is not a new first-claim run.

2. **Already controlled document / unsolicited external B activation.** Load a new locked-Admin document controlled by A. Serve formal B and check the real registration; B waits. Activate its waiting worker externally with `SKIP_WAITING`, without an app reload consent. The same document remains mounted. B claims control; A precache entries are retired; the reader successfully obtains fresh B manifest. Disable app network, then first-open Menu. Modules load, but Menu displays `unavailable · projection · 5fdc7caff707c01a49979d8a90ceadd274493a78`.

   Exact failed request: `/canteen/data/team-meals/week-41.json?__publication=1789102525388-1-1`. Exact preceding fresh manifest request: `/canteen/data/build.json?__publication=1789102525388-1-1`.

   Same real cache contains:
   - `data/build.json?__WB_REVISION__=3629a96808dcb61636c68738ad32b5f7`
   - `data/team-meals/week-41.json?__WB_REVISION__=6eaedd51a5b53d791d6d1656c23f3cb3`

   Both bodies identify `5fdc7caff707c01a49979d8a90ceadd274493a78`. Raw before/after activation: `/private/tmp/app-bundle-c1-offline-evidence/03-external-worker.json`, `04-external-worker.json`. Failure plus exact requests, network-off state and cache comparison: `05-external-worker.json` in that directory.

3. **Positive control without restoring network.** Reload that controlled document at Menu. Initial reader uses untagged `data/build.json` and `data/team-meals/week-41.json`. Full B Menu renders from the same cache, showing source revision `5fdc7caf`, the full hash, servings 200 and recorded ingredients. Raw evidence: `/private/tmp/app-bundle-c1-offline-evidence/06-external-worker.json`. This isolates query identity from missing JS, malformed projection or wrong cached revision.

## Provenance and next-scope acceptance

Independent Git comparison confirms `view-models/published.ts`, `data.ts`, `pwa.ts` and `vite.config.ts` are byte-identical from previously reviewed `7f3b4e6` through `e79fe3b`. The bounded delta from accepted `94ce6c7` changes only main and two C tests; it preserves the same refresh hook. The author also supplied a separate native baseline reproduction at 7f; this report's own native runs are at e79, so that baseline run is not represented as my execution.

Assign a bounded reader/offline repair with RED tests for both cases above and the offline controlled-document control. Preserve fresh manifest verification and all same-revision/old-handle rules; an unverified older projection must never become a successful fallback. Skipping only the first controller claim cannot fix the demonstrated external-update path. This report does not prescribe a new cache policy or authorize config changes. It does not claim QR data/offline completeness; QR's separate unprecached path was reported by the author and was not independently retested here.
