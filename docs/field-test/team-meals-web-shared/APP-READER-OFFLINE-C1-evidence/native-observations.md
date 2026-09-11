---
feature_ids: [team-meals]
topics: [web, offline, browser, evidence]
doc_kind: evidence
created: 2026-09-11
---
# Author native verification at 3dd9db9

Implementation: 3dd9db9d07ec8fdc67990ecbb77a0578f2dc2338. Worktree: /Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-web-shared. Native IAB tab19, own fresh loopback origin http://127.0.0.1:60610/inspect.html, application frame /canteen/#/admin. Node20.20.2; original Vite configuration, exact production src and index without instrumentation. The diagnostic controls live outside the application SW scope. source-integrity.json checks all52 src files plus index in both A/B fixture sources against the fixed Git source. Test data is emitted by the approved formal producer from isolated real Git fixtures, not a remote Worker.

Formal A revision: c47f3501e13b1853836f2929fb9135bb4ee750bd. B revision: d3b6dd2b72a1fa845634f160fa93921a919bcb20. Source fixtures use original publishedFixture(image-a/image-b). Installed images are excluded by original policy. Network-off destroys all local application responses, including JSON, modules and image bytes; the diagnostic controls and external fonts remain reachable. No real production write or device-wide network setting was changed.

The JSON files below are raw values collected by explicit diagnostic UI actions: actual frame DOM, CacheStorage URLs/bodies, native registration state, browser performance origin, and the server's actual network-request ledger/state. This document summarizes the observed facts. It does not promote inferred fields into raw observations. SW-served ordinary requests do not reach the server ledger; the successful full page with application responses disabled is the cache-use evidence.

| Evidence | Observation |
|---|---|
| native/01-inspect.json | First document after initial claim; controller active, only entry/Admin/Workbox-window executed; installed build/projection both A. There is no pre-claim boolean snapshot: first claim is evidenced by fresh-origin installation and the actual tagged manifest request after the initial untagged document/build requests. |
| native/02-offline.json;03-inspect.json | Disable app responses, then first-open Menu. Full A menu shows all recorded ingredients and servings200 at the same boot1789103628049.9. Tagged projection request fails; ordinary installed projection succeeds. |
| native/04–07 | Setup transitions: restore A, navigate to locked Admin, serve B and request update. The “Reload locked Admin” control changes only the hash when the path matches, so 05 is explicitly not counted as a new document. |
| native/08-inspect.json | Explicit reload creates a new document, boot1789103724035.9. A still controls and B is waiting; only entry/Admin/Workbox-window executed, so Menu is unopened in this document. Waiting B installation temporarily keeps A and B cache entries. |
| native/09-inspect.json;10-inspect.json | External waiting-worker SKIP_WAITING, without app consent. 09 is transitional activating. By10, B is activated, A cache entries have retired, B manifest has been verified fresh, and the same document boot remains. |
| native/11-offline.json;12-inspect.json | Disable app responses, first-open Menu in this document. Full B menu/servings200/recorded ingredients render with the same boot. No A content is adopted. |
| native/13-inspect.json | Open actual recipe link offline. Full recorded steps/materials retain B. Previously unread images explicitly show 同版图片不可用 and recorded licenses. Requests use B-bound asset paths, never current source image URLs. |
| native/14-inspect.json | Still offline, explicitly reload at the recipe route. New boot1789103809136, full B recipe succeeds from ordinary installed JSON; unseen images remain unavailable. |

Exact failed first-claim request: /canteen/data/team-meals/week-41.json?__publication=1789103628298-1-1. Its prior fresh manifest uses the same query and succeeds. Cache keys at01/03 end in build.json?__WB_REVISION__=5a6b335e16d4f53b4464113f6e026d74 and team-meals/week-41.json?__WB_REVISION__=f3252dc73adf52a7caf9b246a202e010; both bodies identify A.

Exact failed external-B request: /canteen/data/team-meals/week-41.json?__publication=1789103736206-1-1. The preceding same-tag B manifest succeeds, while the failed projection ledger says available:false/network-disabled. By10/12 only B build/projection cache bodies remain. Raw full keys and bodies are preserved in each JSON, without rewriting to a synthetic common build.

The author did not repeat the entire D matrix or real L2. Missing/wrong-copy, HTTP refusal, JSON/version/binding validation, timeout, probe/brand/old-handle and late-generation negatives are separately covered by published-offline.test.mjs. Original R3 coordinator/PWA/main/D/config source is unchanged. Original non-author native verification is a separate evidence source. This does not claim legacy, QR index or unseen assets are fully offline-capable. The own server and tab were closed after capture.
