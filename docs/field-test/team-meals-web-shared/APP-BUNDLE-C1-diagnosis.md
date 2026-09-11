---
feature_ids: [team-meals]
topics: [web, bundle, ownership]
doc_kind: diagnosis
created: 2026-09-11
---
# APP-BUNDLE-C1 execution budget and remaining consumer boundaries

Implementation `e79fe3b49b2a5d3c06c5d7298d9207adc5cc3c71`; accepted contract `94ce6c74c79ca94523e32f1b8311c72aab83924b`. Baseline `4f65c1cef864ad348fdadf2ad06d0f40c8869b58` production sources equal approved `7f3b4e6`; full D948026 test/evidence history is preserved. Only main and C tests changed. This is a bounded loading improvement, **not complete budget approval**.

## Same-environment measurements

Node20.20.2 zlib gzip of final UTF-8 JS files, distinct entry + immediate SW registration dependency + selected top route + selected Admin screen + all static dependencies/preloads. The observer does not alter production Vite configuration. Main's module facade is index.html; Prep's shared chunk has a null facade, so its source module membership is also resolved (omitting it would undercount). Native exact-build Prep confirms entry/Prep/workbox only. CSS/HTML/data/images are excluded. These are compressed-content estimates, not measured wire transfers.

Default uses no VITE_WORKER_URL, matching the earlier050 diagnosis/current checked-in CI environment. Configured uses `https://application-api.local.invalid` only to compile the real HTTP branch; actual native API calls are intercepted locally. The working project's environment/configuration is unchanged. Normal operation needs configured HTTP, so both modes remain in the acceptance matrix.

| First view | Default before | Default after | Default no SW after | HTTP before | HTTP after | HTTP no SW after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| prep | 66,018 | 32,099 | 29,756 | 66,043 | 32,103 | 29,760 |
| menu | 66,018 | 38,227 | 35,884 | 66,043 | 38,233 | 35,890 |
| purchase | 66,018 | 52,441 | 50,098 | 66,043 | 52,476 | 50,133 |
| qr | 66,018 | 20,698 | 18,355 | 66,043 | 20,704 | 18,361 |
| locked-admin | 66,018 | 20,180 | 17,837 | 66,043 | 20,182 | 17,839 |
| home | 87,572 | 52,859 | 50,516 | 89,147 | 54,444 | 52,101 |
| plan | 78,623 | 58,846 | 56,503 | 78,648 | 58,883 | 56,540 |
| import | 84,738 | 50,042 | 47,699 | 84,764 | 50,077 | 47,734 |
| ingredient-new | 93,517 | 58,826 | 56,483 | 95,092 | 60,414 | 58,071 |
| dish-new | 116,223 | 84,090 | 81,747 | 117,798 | 85,682 | 83,339 |
| publish | 88,639 | 53,926 | 51,583 | 90,215 | 55,509 | 53,166 |

With SW, default Dish remains24,090 bytes over60,000. HTTP Ingredient remains414 over; HTTP Dish25,682 over. No-SW figures do not excuse the normal SW requirement.

Background caching remains separate: default all application JS12→20 chunks,155,758→164,233 gzip bytes (+8,475),418,923→421,662 UTF-8 bytes; SW+Workbox9,287→9,466 gzip. HTTP application JS157,333→165,834 (+8,501),423,701→426,438 UTF-8; SW+Workbox9,283→9,459. Every20 app chunk is listed by generated SW in each candidate. More chunk boundaries increase compressed total; no cold-install total reduction is claimed.

## Exact default Dish closure

| Final JS file | Gzip bytes |
| --- | ---: |
| assets/admin-ClR1t7JZ.js | 1,612 |
| assets/client-DBf-T-ku.js | 11,161 |
| assets/dish-new-XgdSPY-V.js | 22,753 |
| assets/edit-session-CbDKY5c-.js | 2,511 |
| assets/index-CqcMpFug.js | 16,225 |
| assets/ingredient-new-RQkCJG8U.js | 15,475 |
| assets/store-BWF_Zuub.js | 919 |
| assets/team-ui-9JWp_aO-.js | 11,091 |
| assets/workbox-window.prod.es5-BqEJf4Xk.js | 2,343 |

Total84,090. HTTP exact filenames/weights and all route closure lists are in configured-graph.json/configured-totals.json; default equivalents accompany them. Chunk gzip is additive across distinct files; module renderedLength is pre-minification character count and is not an additive gzip allocation.

## Smallest consumer boundary for dispatch to assign (read-only)

Main→Admin dispatcher→Dish is now deferred. Dish's initial static imports still include its whole92,182-rendered-character module, Ingredient's56,305-character module, shared kit/team-ui/transport, C1 edit session/store and client. In the default build client contains38,742 rendered characters of mock API; the configured build instead retains the HTTP implementation. Do not remove supported modes to shrink the number.

Initial Dish editing genuinely needs current Source/catalog, auth identity, retained draft and raw buffers, fields/components/steps, validation, C1 saving/unknown protection and existing image metadata. Those remain required. The clearest conditional actions are new inline Ingredient (`dish-new.ts:1576` and `:1679`), image decoding/compression after file selection (`:1319`), translation (`:1096`), upload and inline Ingredient submission. A returned editor with an already-open inline Ingredient buffer must restore that state, not silently drop it.

Dish statically imports `buildIngredientForm`, `compressImage`, `createIngredientDraft`, `slugify`, `submitIngredientForm` from Ingredient (`dish-new.ts:17–25`). `slugify` is also used synchronously for the new Dish ID (`:1237`), so changing just one import to dynamic would leave a static backedge. Minimum coherent D assignment: Dish consumer plus a small shared helper/image or inline-form module extracted from Ingredient as needed; keep small synchronous helpers available without importing the full Ingredient renderer. Load full inline form only for the action/retained inline buffer, compression only after selection, and maintain owner operation tickets and auth/render/component identity across each await. This is still a hypothesis requiring actual rebuild/test, not quantified savings.

Dish also calls legacy `getApi()` unconditionally at render start (`:872`) and passes it into painting, although its initial Source/catalog and normal Dish saves use TeamMealsApi. Legacy API use in the UI is for translation/image/inline Ingredient operations. An assigned D consumer change can investigate delaying that auxiliary client until those real actions, together with the Ingredient boundary (otherwise Ingredient's static client import retains it). Shared `api/client.ts`/kit need not change for that consumer investigation; any shared API contract change needs separate C/dispatch scope. Simply removing the entire current Ingredient and client chunks from the arithmetic would leave57,454 default bytes, but that is an unattainable proof-by-subtraction: helpers/loading glue and regrouping would change output, so it is **not a promised budget result**.

HTTP Ingredient's414-byte excess can be investigated in the same D-owned image/action boundary (`ingredient-new.ts:447` compression, `:535` form, `:1058` submit, `:1228` page). Its initial field/state/read/validation protections must stay; no precise saving has been demonstrated. Shared kit is11,091 gzip only as part of a larger combined chunk, so attributing that whole amount to kit or deleting it is invalid.

No D source, kit/client, configuration, dependencies, precache ranges, core, Worker, legacy handling, validation or recipe content was changed. Dispatch chooses the next ownership scope after fixed review; Q still waits.
