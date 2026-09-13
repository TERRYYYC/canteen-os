---
feature_ids: [team-meals]
topics: [web, bundle, performance, ownership]
doc_kind: diagnosis
created: 2026-09-11
---
# Read-only bundle diagnosis after R3 review

Scope: dispatch requested attribution and candidate ownership only, after the original non-author approved R3. No source, route, configuration, dependency or caching policy was changed. All measurements below bind `7f3b4e65c03b4329ffd5b72ad4846937830f6d9c`; baseline is `34dd3364ad9397cac3ded4b8ee5460dac09fc879`.

## Measured boundary

Both builds use the same installed dependencies, Node20.20.2 and original Vite configuration. Baseline entry gzip is **63,617 bytes**, candidate **63,675 bytes**: R3 adds **58 bytes**, while the baseline already exceeds the 60 KB budget. Vite prints these as63.62/63.68 kB. The diagnostic build only observes Rollup module/chunk metadata; its final entry bytes match the original candidate build exactly.

Gzip calculations use Node20's zlib on final UTF-8 files, matching the Vite reporting environment. Rollup's earlier generateBundle snapshot is not used for final transfer totals. Module `renderedLength` below is a pre-minification character count, useful for locating large contributors; it is not an additive gzip allocation. Compression across modules prevents assigning exact independent gzip shares without changing code.

## Actual loading graph

The built index references one entry script and no static JS modulepreload. `main.ts:12–16` statically imports Admin's dispatcher, Menu, Prep, Purchase and QR. Consequently the entry includes all of those reader/purchase modules on every route, even though only one renderer runs. Default hash and manifest start_url are `#/prep`.

`initPwa` registers immediately when Service Worker is available. The installed registration client dynamically imports workbox-window, so normal secure-context startup also loads that2.343 kB gzip chunk. The existing Admin dispatcher already dynamically loads its selected screen after authentication; its transitive imports add to that route's first view.

| Route/execution closure | Distinct page-executed JS | Combined gzip bytes |
| --- | --- | ---: |
| Prep/Menu/Purchase/QR, or unauthenticated Admin | entry + workbox-window | 66,018 |
| Authenticated Admin Home | entry + workbox-window + home + parse-plan-text + client | 87,572 |
| Authenticated Plan | entry + workbox-window + plan + parse-plan-text + store + servings-input | 78,623 |

These totals are derived from the final actual chunk dependency graph and startup branches, using one copy of each chunk. They are compressed-content estimates, not a claim that the local HTTP server sent gzip or a browser network timing measurement. A no-SW context omits workbox-window. CSS, fonts, HTML, JSON and media are outside these JS sums.

Separately, the generated Service Worker precache explicitly lists **all12 application JS chunks**, totaling **155,758 gzip bytes / 418,923 UTF-8 bytes**, including the deferred Admin screens. Its own `sw.js` and Workbox runtime add **9,287 gzip bytes**. Thus a cold installation schedules all application JS for caching regardless of the visible route. Moving existing code into a different chunk alone does not establish a smaller first-install download; a static import elsewhere can also pull it straight back into the initial graph.

## Largest entry contributors

| Source module | Rollup rendered characters | Ownership / reason it enters |
| --- | ---: | --- |
| pages/prep.ts | 35,904 | D; main imports it, and Menu imports its frozen presenters/selectors |
| pages/purchase.ts | 21,148 | D; main imports the entire purchase renderer |
| pages/menu.ts | 20,001 | D; main imports it on every route |
| view-models/published.ts | 16,532 | C; shared validated publication reader |
| admin/kit.ts | 15,762 | Shared boundary; Purchase imports apiMessage, while lazy Admin screens consume the same module's other exports |
| view-models/edit-session.ts | 15,014 | C1; Purchase's form imports the write/session machinery |
| pages/published-meals.ts | 14,560 | D; formal Menu/Prep publication presentation |
| core/src/team-meals.ts | 14,410 | A; the Purchase/C2 dependency closure retains team operations |
| pages/team-details.ts | 9,855 | D; Purchase imports detail rendering; purchase-list also statically imports quantityText from it |
| view-models/reload-safety.ts | 9,740 | C; application protection and current page owners |

Other substantial entry modules include purchase-form9,244, shell8,692, PWA8,314, purchase-list7,868, procurement engine7,365 and i18n7,275 rendered characters. Main itself is2,681. No large third-party UI framework is present in this entry. The dominant issue is the eager application dependency graph, rather than the R3 increment.

## Candidate boundaries for dispatch

These are read-only findings, not implemented or benchmarked fixes. They require owner assignment and a concrete before/after measurement of the same initial route plus cold-install behavior.

| Candidate | Smallest relevant files / owner | Constraint before claiming savings |
| --- | --- | --- |
| Load only the requested top-level renderer | C main.ts; D page renderers stay intact | Preserve stale-route/auth/coverage handling and retained editor instances. Verify transitive imports; the current precache still downloads all chunks, so route splitting alone is insufficient for first-install transfer reduction. |
| Stop a single error formatter from eagerly loading the complete Admin kit | Shared kit.ts plus D purchase.ts consumer; dispatch coordinates ownership | Extract only the error-formatting dependencies into a small shared module. The current entry retains12 kit exports because deferred Admin screens share that module. Recount actual startup dependencies, not only the entry filename. |
| Keep recipe/detail code behind its actual detail action | D purchase.ts, purchase-list.ts, team-details.ts | purchase-list's static quantityText import must move to a small common formatter; otherwise a dynamic detail import still loads the detail module eagerly. Do not alter source/asset provenance or detail completeness. |
| Separate legacy and formal public presentations at their real publication branch | D menu.ts/prep.ts/published-meals.ts | Both compatibility paths are currently supported. Menu imports frozen Prep functions, so merely delaying the Prep route cannot remove that dependency. Preserve actual legacy behavior and formal recipe links; no estimated savings claimed. |
| Make first-install transfer match a defined offline scope, if dispatch chooses that path | C vite.config.ts / PWA policy with explicit product scope | Current glob precaches every JS chunk. Any narrower policy changes offline guarantees and needs coordinated acceptance. No such configuration change is made here. |

A genuine total-byte reduction can also come from measured elimination/consolidation of redundant emitted logic, but this read-only scan has not proved a safe deletion or quantified one. It is not acceptable to remove compatibility, validation, owner protection or required recipe content just to meet the counter.

Raw evidence: [final chunk/module attribution](APP-MAIN-R3-evidence/bundle-attribution-final.json), [loading totals](APP-MAIN-R3-evidence/loading-totals.json), [observer script](APP-MAIN-R3-evidence/bundle-diagnostic.mjs), original/independent baseline and candidate build logs in the same evidence directory. The artifact contains original paths for traceability. Budget remains open with dispatch; no budget pass or bundle repair is claimed.
