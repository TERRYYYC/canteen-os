---
feature_ids: [team-meals]
topics: [web, bundle, loading, independent-review]
doc_kind: review
created: 2026-09-11
---
# APP-BUNDLE-C1 independent review

**APPROVE — bounded top-level route-loading improvement.** No new P1/P2 found in the reviewed delta. This does not approve every route's size, complete offline behavior, D's entire feature matrix, deployment or real Worker L2.

- Reviewer: original non-author `/root/c1_review`, identity unchanged; local_cat, iterative.
- ReviewedHeadSha: `e79fe3b49b2a5d3c06c5d7298d9207adc5cc3c71`.
- Review-Subject-Ref: `task:01a08d94-5d2e-7162-8f34-689ed87e391e:APP-BUNDLE-C1`.
- Accepted-Source-Ref: `docs/field-test/team-meals-web-shared/APP-BUNDLE-C1-contract.md`.
- Accepted-Revision / delta base: `94ce6c74c79ca94523e32f1b8311c72aab83924b`.
- Source worktree: `/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-web-shared`, branch `codex/team-meals-web-shared`. Initially verified exact e79 and clean; at final check author HEAD is doc-only `f266fdae255e3c79223daa78b988bd125d472707`, clean, with zero packages diff from reviewed e79. Contract blob at accepted revision and e79 is identical (`5f08cc5c9c1d5e8c6ea77a9ff3f1a2c35329ffde`). Review execution used this isolated archive.

## Checked behavior

Only main.ts and two C tests change in the fixed range (128 additions, 29 removals). D/kit/core/Worker/PWA/config/dependencies remain unchanged. Native module reuse retains the original editor and auxiliary state. Source review and actual-main controlled-import tests cover route ABA, same pending module reused across visits/language, auth changes before completion, changed or failed publication, disconnected outlets, late import rejection, old started-renderer rejection while a new loader is pending, and prior unresolved offscreen coverage. Main creates coverage only immediately before the current renderer starts; import failure/abandonment does not acknowledge existing owners. A started renderer owns its original coverage. Publication refresh redraws a pending loader but preserves an already-started editor DOM.

The independent subreview `/root/c1_review/c2_core_boundary` found no new P1/P2. Its extra 13-case probe was pinned to this exact archive and rerun here: `/private/tmp/app-bundle-c1-independent-e79fe3b4.test.mjs`, log `/private/tmp/app-bundle-c1-independent-extra-e79fe3b.log` (**13/13**).

## Independent execution evidence

- Node **20.20.2** full Web **437/437**, zero failed/cancelled/skipped: `/private/tmp/app-bundle-c1-independent-web-e79fe3b.log`.
- Whole Web typecheck exit 0: `/private/tmp/app-bundle-c1-independent-typecheck-e79fe3b.log`. Core build also completed for the formal producer. No pnpm download or dependency/config alteration.
- Original-config candidate builds succeeded in both absent-Worker and configured-HTTP environments. Logs `/private/tmp/app-bundle-c1-independent-build-e79fe3b.log` and `/private/tmp/app-bundle-c1-independent-configured-build-e79fe3b.log`.
- Independent AST analysis of actual final JS verified **20** static/dynamic import graphs and **10** Vite preload groups. Preloads do not pull unrelated routes beyond each selected static closure. Actual final gzip measured per distinct file using Node zlib; reports `/private/tmp/app-bundle-c1-independent-graph-e79fe3b.json` and `/private/tmp/app-bundle-c1-independent-configured-graph-e79fe3b.json`. Script `/private/tmp/app-bundle-c1-independent-graph.mjs` parses final JS rather than trusting only Rollup metadata.
- Native actual main/module matrix **31/31**; first-document R3 update reached one explicit dirty-discard consent and **boot 1 → 2, stable 2/2**. See `NATIVE-OBSERVATIONS.md`. Actual test API is simulated; native SW and formal static producer are real.
- Uninstrumented cold installation cached **20/20** application JS. Initial locked Admin executed only entry/Admin/Workbox-window. An unopened Menu module then loaded offline. Its separate JSON limitation is recorded below, so no claim that every unopened route fully works offline.
- All 52 tracked Web src files match exact e79 in archive and both native application build sources; `source-verification.json`. Fixed range `git diff --check` passes. No author files were edited.

## Budget remains partially failing

Conservative sum includes immediate PWA setup and each distinct selected final JS import/preload; gzip bytes, not CSS/data/media. Both independently built environments are reported:

| Route | Worker URL absent | Configured HTTP URL |
|---|---:|---:|
| Prep | 32,099 | 32,103 |
| Menu | 38,227 | 38,233 |
| Purchase | 52,441 | 52,476 |
| QR | 20,698 | 20,704 |
| Locked Admin | 20,180 | 20,182 |
| Home | 52,859 | 54,444 |
| Plan | 58,846 | 58,883 |
| Import | 50,042 | 50,077 |
| Ingredient | 58,826 | **60,414** |
| Dish | **84,090** | **85,682** |
| Publish | 53,926 | 55,509 |

Threshold is 60,000: default **10/11**, configured HTTP **9/11**. Configured URL was `https://application-api.local.invalid`; this measures the actual HTTP facade bundle without using a real remote backend. The no-SW figures are separately preserved in the two JSON reports. Dish still statically pulls the Ingredient module, shared client, editor/store/UI closure. Default Dish module alone is 22,753 gzip, Ingredient 15,475, client 11,161, shared editor chunk 2,511, entry 16,225; remaining transitive files are explicit in the graph. A next owner assignment should examine these D/client dependencies; no cross-owner fix is implied by this review.

All background application JS increases: candidate **20 files / 164,233 gzip / 421,662 raw bytes** (configured: 165,834 gzip / 426,438 raw). The supplied baseline totals record 12 files / 155,758 gzip, making default background JS +8,475; baseline is author evidence, candidate was independently built/measured. In this independent fixture the generated sw.js and Workbox runtime add a separate **9,160 gzip bytes** (1,620 + 7,540), excluded from document-executed route totals. Full precache remains unchanged in policy; route splitting does not reduce cold-install total transfer.

## Separate inherited finding and limits

**Existing P2 requires its own reader repair:** both first controller claim and unsolicited external B activation leave a persistent `__publication` query on later JSON, bypassing the exact same-revision installed cache. I independently reproduced both, captured actual failed requests plus CacheStorage JSON identities, and verified a controlled-document reload succeeds while still offline. Formal report and raw paths: `OFFLINE-FINDING.md`. This is unchanged reader/PWA/config behavior from 7f3b4e6, not introduced by the loading delta; no claim of complete offline acceptance is made. Preserve same-revision validation in any repair.

No real backend/L2, no complete D matrix reapproval, no overall 60 KB budget pass, and no deployment/merge/push authorization is inferred. All work was local and isolated. Existing independent approval of R3 is retained; this run specifically verifies first-document behavior after loading changes.
