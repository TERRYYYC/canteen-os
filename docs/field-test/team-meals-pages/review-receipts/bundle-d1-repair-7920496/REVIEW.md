---
feature_ids: [APP-BUNDLE-D1]
topics: [independent-review, repair, deferred-modules, bundle-budget]
doc_kind: review
created: 2026-09-11
reviewerIdentity: /root/plan_review
reviewSource: local_cat
reviewedHeadSha: 7920496e06996eedac6e08e862fa097453ed9462
productionEquivalentSha: 734e295edbfa03b360e0052a782f8b5c6f0c980c
reviewSubjectRef: task:01a08db7-43f3-7952-adb5-75106389e557
reviewTargetId: app-bundle-d1-repair-7920496
acceptedSourceRef: docs/design/team-meals-pages/APP-BUNDLE-D1-contract.md
acceptedRevision: b5ccc0abad0bc07fd783b40e880321372c44b384
engagement: iterative
verdict: APPROVE
localReviewVerdict: approved
---

# Independent repair review

**APPROVE for this fixed D bundle slice. D1-R1 and D1-R2 are closed; no open P1/P2 remains in the reviewed delta and affected combination.** This is the original non-author reviewer `/root/plan_review`, returning the result to the same root local_cat carrier. The reviewer did not implement either repair.

The subject is exactly `7920496e06996eedac6e08e862fa097453ed9462`, archived at `/private/tmp/canteen-bundle-d1-repair-review-7920496`. All packages are byte-identical to production `734e295edbfa03b360e0052a782f8b5c6f0c980c`. Relative to the previously reviewed `df992aad3807638c2ef1a092cdb38d01b9d60f6d`, production changes are restricted to `dish-new.ts` and `ingredient-new.ts`, with additions to the D bundle test and its harness. No shared API, client, main, reader, PWA, configuration, core, or Worker production change is included.

The accepted contract has not moved: `git log -1` for the accepted path at this target resolves to `b5ccc0abad0bc07fd783b40e880321372c44b384`. Its bytes equal the accepted revision, SHA256 `e58bcdf9b1b27bf757ac37c3dc4431ec380a014fe839457243e752b49fc8a3dd`. Original D0 and the original STANDARD source remain the anchors already read in the first report; this repair does not reinterpret them. Architecture remains RC-D, no map delta. Reviewed risks remain behavior/security high, data/contract medium, irreversible low.

## Finding closure

| Finding | Fixed mechanism and evidence | Result |
|---|---|---|
| **D1-R1**, Ingredient late unsent save (`ingredient-new.ts:337`) | After legacy loading and auth validation, checks the mounted owner, connected element and matching document hash. A departed known-unsent attempt clears only its attempt/saving phase; its raw draft remains dirty. Original independent reproduction now passes. Added independent detach-only case confirms no POST, idle phase, null attempt, settled read, retained text and usable explicit save on return. | Closed |
| **D1-R1**, Dish late unsent upload (`dish-new.ts:798`) | Uses `operation.current()` before the first upload. The existing current check includes the original auth and active record. Original read/finally settles without an upload when the record is no longer current. Original independent reproduction and frozen real-module browser reproduction both pass. | Closed |
| **D1-R2**, inline save cancelled by language (`dish-new.ts:1844`) | Replaces obsolete paint-lifetime admission with current owner plus exact row/buffer admission. An authenticated same-owner language repaint continues the accepted snapshot without installing an old DOM. The original independent language test passes; a new independent test confirms later raw edits remain in the buffer while only the pre-load snapshot is saved once. | Closed |

The change acts at the new module await boundary before the first write. It does not cancel requests that already crossed that boundary. A return to the same current owner before module readiness still permits continuation. No new auth map, generation, operation ticket, persistence or fallback transport was introduced.

The original reviewer probe `reviewer-d1-owner.test.mjs` was copied **byte-for-byte**, SHA256 `259d993c13ba394810f597fcee2c3721d31886e5a0ca21678f6e7c829990643d`. It changes from **5/8 on df992 to 8/8 here**. The earlier original report and all 67 original evidence files remain intact, both in the previous review archive and in the committed receipt directory; the reviewer independently rechecked every hash. The previous REQUEST_CHANGES report remains historical evidence, SHA256 `3749ee46ef84057e69f6d2198289735c9650f2ad62bf1b7ac4db10f89a33e2ba`.

## Independent execution

All Node work used the actual executable `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node`, version **v20.20.2**, darwin arm64. The exact archive's core was rebuilt and the Web core dependency points to that archive. Read-only dependency reuse does not redirect the tested core to a previous review's output. `reviewer-runtime.json` records the actual paths.

| Check | Result |
|---|---|
| Fixed original full Web suite | **491/491**, zero failure, cancellation or skip |
| Core compilation / Web typecheck | Exit **0 / 0** |
| Unchanged original reviewer owner sweep | **8/8** |
| Additional independent repair boundaries | **4/4** after correcting one reviewer-only field-path mistake |
| Original assertions / previous custody | No original assertion removed; 67/67 prior files unchanged |
| New author evidence manifests | **22/22** Node/build and **20/20** browser files match their hashes and exact Git |
| Browser Web source hashes | **56/56** match this fixed target and the declared production 734 |

The four added independent boundary checks cover:

1. Physical DOM removal while the old Ingredient hash still matches: no new transport, raw retained, known-unsent state ends, explicit save is available on return.
2. An already-dispatched actual `HttpAdminApi` Ingredient save, followed by later A input and navigation to another Ingredient B: the ACK settles A only, preserves later A raw, and leaves B's current private input untouched.
3. An already-dispatched Dish upload, followed by later A input and navigation to Dish B: the upload settles into original A, retains later A raw, does not write the hidden Dish body, leaves B untouched, and does not upload again when A is explicitly saved on return.
4. Inline save held on legacy loading, language repaint, then newer Chinese input: one request contains the original snapshot; the current buffer retains the newer text and remains dirty after ACK.

The first added-boundary run was **3/4**, because the reviewer mistakenly read `DishDraft.zh` rather than the actual `DishDraft.name.zh`. The raw failed log and initial test are retained. Only that test field access changed; production was not altered. The corrected run is **4/4**. This is a review-tool correction, not a hidden product repair. The original eight-test probe needed no correction.

The fixed full suite ran before adding the two reviewer-only test files. Its 491 count is not inflated by those 12 independent cases. The full suite includes the author's 24 new route cases as well as original ACK, unknown, unload, shopping, auth, image and module-handling tests. AST comparison confirms all pre-existing assertion expressions in the changed bundle test/harness remain; ACK, Ingredient, unload and Shopping raw test files are unchanged in this repair.

## Native browser evidence consumed

This iteration **does not claim a new reviewer-operated native browser run**. It consumes the author's already completed, frozen native run after inspecting the fixture, raw outputs, real module request journals, source hashes and build provenance. The first review's independently designed native RED still supplies the baseline. This is appropriate for the small admission-only repair and is supplemented here by the reviewer's unchanged original tests and new controlled boundaries.

The R1 browser control bodies are exactly equal to the original reviewer bodies, independently compared in `reviewer-native-custody.json`. The emitted module was actually held by the local server and then served unchanged as `assets/client-MzYSCKZV.js`; no test resolved a fake import promise in the native run.

- Ingredient: before **1/1**, away **2/2**, after real client delivery **4/4**. The final ledger has **zero POST**, settled loading protection and current Plan raw `13`.
- Dish photo: same **1/1 → 2/2 → 4/4**, with **zero upload or save POST** and retained Plan raw `13`.
- Inline language: **3/3 held → 5/5 completed**, exactly one `POST /ingredient/language-owner`; the current Dish row uses the ACKed ingredient and no old inline form returns. Root's R2 probe uses actual editable loading text to avoid premature automatic translation, then enters values and clicks the real save before changing language. The observed create request has empty conditional headers; no unobserved header is inferred.

These are cumulative counts per origin, not additive independent totals. The native photos use an explicit fixture File/DataTransfer and actual decode/Canvas, not a claimed successful operating-system picker. Actual C1/API/session/renderers and emitted-module requests are used with an explicit simulated private API; there is no real Worker write. The author stopped its three servers. This reviewer started no browser or server for the repair iteration.

The previous native module HTTP 503, honest unavailable state, Cancel/no-image C1 path, same-URL persistent rejection, automatic translation handoff and loaded-action real retry evidence remains valid through source continuity outside the three changed admission sites. Those broad native sequences were not repeated or relabelled as new runs. The original same-URL import failure was not turned into a recovery claim.

## Independent final budget and precache

Both production configurations were independently rebuilt with the unchanged Vite config and original data/core/prebuild path. The original independent `reviewer-graph.mjs` was copied unchanged. It parses actual emitted JavaScript, validates transitive static edges and Vite preload arrays, resolves Prep even with a null facade by module membership, sums distinct gzip chunks, and includes immediate Workbox in normal-SW totals. No-SW uses the closure without that immediate runtime. The instrumented native browser build is not used for these numbers.

| Entry | Default SW | Default no SW | HTTP SW | HTTP no SW |
|---|---:|---:|---:|---:|
| Prep | 32197 | 29854 | 32194 | 29851 |
| Menu | 38326 | 35983 | 38323 | 35980 |
| Purchase | 53264 | 50921 | 53284 | 50941 |
| QR | 20796 | 18453 | 20795 | 18452 |
| Locked admin | 20330 | 17987 | 20330 | 17987 |
| Home | 55242 | 52899 | 55298 | 52955 |
| Plan | 59667 | 57324 | 59690 | 57347 |
| Import | 50848 | 48505 | 50871 | 48528 |
| Ingredient new | 50152 | 47809 | 50177 | 47834 |
| Dish new | 57970 | 55627 | 57993 | 55650 |
| Publish | 56309 | 53966 | 56366 | 54023 |

All **44** route/configuration/SW combinations are at most **60,000 gzip bytes**. The tightest is HTTP Plan at **59,690**, leaving **310 bytes**. Each build has **24 application JavaScript chunks**, all present in the actual precache, and **12** checked preload groups, with no missing precached application JS. Full file sets, raw/gzip byte totals, static and dynamic graph edges, preload maps, and SW/runtime accounting are retained in the two `reviewer-budget-*.json` files. Every emitted JS hash is recorded separately.

This closes the D consumer entry-budget requirement on the fixed combination. It does not claim reduced full cold-install download or measured runtime speed.

## Acceptance boundary and evidence

The review approves the exact D bundle implementation plus this repair under the accepted b5 contract. It does not reopen or expand approved C responsibilities, change the original requirements, grant whole-application/D1 vision acceptance, permit remote publication, or unlock Q/L2. No remote operation, deployment, real private write or root-worktree modification occurred.

`COMMANDS.md` records reproduction commands, file roles, and the reviewer-tool correction. `reviewer-integrity.json` records exact source/custody checks; `reviewer-native-custody.json` records the inspected native results and journals. `reviewer-artifact-manifest.json` binds this report, independent scripts and raw outputs, emitted graphs and the consumed author evidence by SHA256 and byte size. The preceding 67 artifacts remain unmodified and are linked through their original hashes rather than rewritten. There are no remaining P1/P2 requests for this local_cat review episode's fixed D bundle target.
