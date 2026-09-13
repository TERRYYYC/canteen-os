---
feature_ids: [team-meals]
topics: [independent-review, pwa, first-document, APP-MAIN-R3]
doc_kind: review-report
created: 2026-09-11
---

# APP-MAIN-R3 independent review

**APPROVE — bounded R3 increment.** Original APP-MAIN-R3/P2 is closed on the exact reviewed implementation. No new P1/P2 found within this scope. This is not full combination CI or L2 approval.

- Reviewer: `/root/c1_review`, original non-author shared reviewer; identity unchanged.
- Engagement: `local_cat`, iterative.
- reviewedHeadSha: `7f3b4e65c03b4329ffd5b72ad4846937830f6d9c`
- Baseline: `34dd3364ad9397cac3ded4b8ee5460dac09fc879`
- Review-Subject-Ref: `task:01a08d94-5d2e-7162-8f34-689ed87e391e:APP-MAIN-R3`
- Accepted-Source-Ref: `docs/field-test/team-meals-web-shared/APP-MAIN-R3-contract.md`
- Accepted-Revision: `dfb68c8923290cd8d16988678f6d2a16414c3d23`, read directly from this Git object.
- Original finding: `/private/tmp/canteen-app-r2-review-34dd336/APP-MAIN-R3.md`; original first-document and controlled-start JSON were read before the review.

## Fixed boundary

The activation target is captured from the actual waiting ServiceWorker object immediately before the existing plugin activation call. Native controllerchange and plugin onNeedReload both require navigator.serviceWorker.controller to equal that exact object; matching script URLs or unrelated callbacks cannot spend consent. Both signals enter the existing coordinator's synchronous all-owner stamp and consent check. That check occurs before publication-reader refresh begins.

The target is cleared on completion, activation error, explicit cancellation, timeout, language cancellation or a new request. The coordinator remains the sole reload authority, consumes consent before reload, and prevents duplicate callbacks from reloading twice. No owner/draft/coverage clearing, forced reload, automatic retry, timeout extension, dependency or D-page change was introduced.

## Independent code and controlled-event checks

- Fixed source was archived in this directory. Author branch/HEAD and clean worktree were checked before and after. The exact diff contains only pwa.ts, pwa-integration.test.mjs and the diagnostic contract. Exact range diff check passed; other source, D evidence, Worker, config and lockfile are unchanged.
- Independent RED with the new tests against exact baseline source: **3 failures / 10 passes**, matching the two uncontrolled callback paths and unrelated-worker identity defect. `/private/tmp/app-main-r3-independent-red-34dd336.log`. The overlay is preserved as `packages/web/test/r3-review-new-pwa.red.mjs` in `/private/tmp/app-main-r3-independent-base-34dd336-zxzDCr`; it is outside the full-suite test glob.
- Candidate PWA/coordinator tests: **26/26**, Node 20. `/private/tmp/app-main-r3-independent-targeted-7f3b4e6.log`. Includes callback order/duplicates, exact identity, generation/pending/unknown changes, timeout/cancel, offscreen C1 saves and old-auth anonymous protection.
- Independent subreview added five event-order cases and passed **18/18** including the original 13 PWA cases: early plugin signal before controller change; language cancellation; stale discarded button; old worker after fresh re-consent; synchronous takeover before activation promise settlement. `/private/tmp/app-main-r3-independent-7f3b4e6.test.mjs`.
- Node 20 core build and whole Web typecheck passed.

## Independent native evidence

The original non-author application-review.ts and application-review-server.mjs were copied unchanged into this exact archive. They retain actual main, all fixed D source and actual PWA. Only local API responses and synthetic credentials are simulated. The passive Workbox observer preserves original dispatch. The original index has only the permitted diagnostic script inserted before main. No production API was contacted.

Using the original Vite configuration and formal producer, the helper generated real native workers at `/private/tmp/c2b-real-sw-aIfiD7/{a,a-time,b}`. All source files and the original index plus permitted probe were independently compared for all three variants. A fixture revision was `a968dcc67ee565abf0cb71735a5d42e26f756ca6`; B was `61adfd667712f4b1e1e31e106246f6574070b665` (data identities, not implementation revisions).

- Fresh origin 64365: first document began controller=false; A's native claim was observed. Actual Plan changed servings 8→11; B waited. A single explicit production dirty-discard decision completed **boot1→boot2**, then remained stable. Before-decision checks **3/3**, after-reload checks **2/2**, reason clear, **0 POST**. No second intent or reload was required.
- Origin 64366: A was warmed in a clean document; a separate new document started controller=true with boot1. The same waiting-B and single-consent flow completed **boot1→boot2**, stable, **2/2**, reason clear, **0 POST**.
- Fresh origin 64367: without update consent, real external B activation preserved the identical editing input/value11 and boot1 while refreshing the reader. An actual C1 save was then held and moved offscreen; the update UI offered no discard override. Its locally simulated lost ACK left unknown with no override or reload. Final result **6/6**, boot1, unknown, exactly **1 locally intercepted POST** `/plan/sw-plan`. The update did not settle or erase that unresolved save.

Native summaries were observed directly from the original diagnostic output in Chrome through CUA. Review tabs and the three local listeners were closed after collection. No full D page matrix was repeated.

## Inherited failures remain open

Independent full Web runs under the same Node **20.20.2** and installed dependency set reproduced:

| Source | Total | Pass | Fail | Cancelled |
| --- | ---: | ---: | ---: | ---: |
| Baseline34dd336 | 419 | 411 | 3 | 5 |
| Candidate7f3b4e6 | 429 | 421 | 3 | 5 |

The exact failed/cancelled tests and causes match: missing navigator in the D clipboard harness; read-only Event.returnValue in two D unload cases; five dependent test cancellations. Logs: `/private/tmp/app-main-r3-independent-web-node20-34dd336.log` and `/private/tmp/app-main-r3-independent-web-node20-7f3b4e6.log`. The author's supplemental Node24 green result was not substituted for these Node20 results.

Independent original-config Node20 builds both complete, but the entry gzip remains over the 60 KB budget: baseline **63.62 KB**, candidate **63.68 KB**. Logs: `/private/tmp/app-main-r3-independent-build-34dd336.log` and `/private/tmp/app-main-r3-independent-build-7f3b4e6.log`. No D/config changes were made to hide either inherited limitation.

This approval is confined to R3's worker/consent completion repair. It does not declare the entire application, CI, performance budget, D matrix, real Worker or L2 complete.
