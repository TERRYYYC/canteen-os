---
feature_ids: [team-meals]
topics: [web, bundle, loading, reload-safety]
doc_kind: contract
created: 2026-09-11
---
# APP-BUNDLE-C1: top-level route loading

Accepted source: dispatch task `01a08d6d-be28-7142-ad8e-3f964658d3f4`, 2026-09-11 bounded C assignment. Baseline `4f65c1cef864ad348fdadf2ad06d0f40c8869b58` preserves full D `94802608447a3a6dbc60a8ca21cb9b6b0ad83a11` and C `0504456` histories. R3 production code remains byte-identical.

Cause: main's five eager page imports put every top-level page into the initial execution graph. Existing final Node20 gzip entry is63,675 bytes; normal SW reader startup totals66,018. Evidence: APP-MAIN-R3-bundle-diagnosis and its final graph. The repair changes only main's route loading boundary and its tests/evidence; D pages, core, Worker, dependencies and Vite/precache configuration are unchanged.

Load only the selected top-level module, reusing the browser's cached module/renderer and its retained editor/auxiliary state. Every new asynchronous boundary checks current render generation, connected outlet, language, auth session and winning publication before starting a renderer. A late result cannot start old private requests, replace new DOM or acknowledge another render's coverage. Publication updates may redraw a pending loader, but never an already-started editor. Loading/failure/abandonment before a renderer starts creates no page owner; existing real unresolved coverage/owners remain protected. Once the renderer starts, it owns its original coverage acknowledgement and failures cannot be declared read-only by main.

RED: delayed-module tests against actual main plus existing excessive execution totals. GREEN: targeted lifecycle/coverage/R3 tests, full Web tests/typecheck under Node20, and original-config final chunk graph. A deterministic test loader seam controls only import completion; native verification uses actual application modules and generated SW.

Measurement: conservatively60,000 gzip bytes, summing each distinct final JS file needed by entry, immediate PWA setup, selected page and its transitive imports/preloads. Report Prep/Menu/Purchase/QR/locked Admin plus authenticated Home/Plan/Import/Ingredient/Dish/Publish; no-SW separately. CSS/data/media excluded. Report all background precached JS and SW runtime independently, without claiming route splitting lowers cold-install total download. No change to the existing full offline cache contract.

Verification: actual cold SW install still caches every declared JS asset; after installation, an initially unopened route works offline. Original non-author review binds a fixed implementation SHA and examines actual execution graph, current/late routes, auth/publication/language, retained owner safety and R3. Any remaining over-budget route is reported with exact contributors/minimum additional owner scope; no cross-owner repair is implied.
