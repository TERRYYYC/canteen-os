---
feature_ids: [APP-BUNDLE-D1]
topics: [independent-review, bundle-budget, deferred-modules, owner-lifetime]
doc_kind: review
created: 2026-09-11
reviewerIdentity: /root/plan_review
reviewSource: local_cat
reviewedHeadSha: df992aad3807638c2ef1a092cdb38d01b9d60f6d
productionEquivalentSha: 80948be59b068da11855e3bf0c018f3fa13a8117
reviewSubjectRef: task:01a08db7-43f3-7952-adb5-75106389e557
reviewTargetId: app-bundle-d1-df992aa
acceptedSourceRef: docs/design/team-meals-pages/APP-BUNDLE-D1-contract.md
acceptedRevision: b5ccc0abad0bc07fd783b40e880321372c44b384
engagement: iterative
verdict: REQUEST_CHANGES
---

# Independent review: fixed D bundle consumer slice

**REQUEST_CHANGES: two open P2 findings.** All measured final entry budgets pass, and the original 467-test Web suite passes on actual Node 20.20.2. Those results do not close the deferred-write lifetime gaps below. This reviewer did not author the implementation, integration, or proposed repair. Root acted only as the operator for the reviewer's prescribed browser fixtures and original-result capture; the reviewer designed the added probes, controlled the real module response gates, read the results, and made this decision.

The review consumes only the fixed `df992aad3807638c2ef1a092cdb38d01b9d60f6d` archive at `/private/tmp/canteen-bundle-d1-review-df992aa`. All packages match production `80948be59b068da11855e3bf0c018f3fa13a8117`. The later repair candidate `734e295edbfa03b360e0052a782f8b5c6f0c980c` was announced while this report was being frozen; its implementation and author results are not consumed as evidence for this verdict.

The accepted contract was read at its fixed revision and compared byte-for-byte with the archived copy. Its SHA256 is `e58bcdf9b1b27bf757ac37c3dc4431ec380a014fe839457243e752b49fc8a3dd`, including the dispatch-approved native import failure clarification. Original D0 remains anchored at `ad5651787be4a54ef28060f6345f61187e78cd9d`. The original `STANDARD-DATA-AND-ACCEPTANCE.md` was read and independently hashed to `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352`.

## D1-R1 — P2: a deferred legacy module can start a write after the editor leaves

Locations in the fixed archive:

- `packages/web/src/pages/admin/ingredient-new.ts:334`, immediately after the new `await loadLegacyApi()` at line 323.
- `packages/web/src/pages/admin/dish-new.ts:798`, immediately after the new `await read(record, auxiliary)` at line 797.

For Ingredient, `ownerValid(owner)` only establishes that the original authentication/owner remains valid; it does not establish that the editor is still current. For Dish, `operation.valid()` similarly permits an inactive original record. The existing Dish `operation.current()` check at line 808 is reached after `uploadImage`, so it cannot prevent that new write.

Reproduction with the real emitted client module held before delivery:

1. Open Ingredient `salt`, edit its Chinese name, and click Save; alternatively open Dish `soup`, attach a real decoded fixture photo, and click Save draft.
2. Verify that the original owner is protected as saving and no POST has been dispatched while the legacy module is pending.
3. Navigate to Plan `reviewer-away` and edit its servings field to `13`.
4. Release the exact emitted `client-C6VYsiFN.js` response.
5. The original hidden Ingredient starts `POST /ingredient/salt` with `If-Match: ingredient-salt-original`; the hidden Dish starts `POST /image/dishes/soup`.

These are new unsent writes admitted after route departure, not callbacks settling a request that had already been sent. This violates the contract's current-owner/route rule at the new await boundary. Stop the unsent continuation when its editor is no longer current, settle only its original loading operation, retain the draft, and leave it usable when the user returns. Already-sent writes must still settle their own original owner.

Independent evidence: `reviewer-owner-first.log` reproduces both paths (0/2); the same failures persist in `reviewer-owner-final.log`. Actual-browser files `native-ingredient-before.json`, `native-ingredient-away.json`, `native-ingredient-late.json` and the equivalent `native-dish-*` files show the complete before/after path and transport. Each final browser result is **2/4**: one failed business assertion plus the button's catch record of that same exception. This is not four independent findings. The subsequent Plan raw assertion was not executed after the throw; the recorded DOM still contains `13`, but it is not counted as a passed assertion.

The Dish browser fixture's upload response is intentionally minimal and is not a proof of a valid upload ACK; its final unknown state is therefore not a second production finding. The decisive fact is the new upload POST. The independent Node probe separately uses a valid upload result and reproduces the same late dispatch.

## D1-R2 — P2: language-only repaint silently cancels an accepted inline save

Location: `packages/web/src/pages/admin/dish-new.ts:1844`, the new guard immediately after the deferred `owner.read(loadLegacyApi)`.

The added `alive()` test belongs to the old rendered form. Switching language replaces that paint while retaining the same authenticated current Dish owner, component row, and exact `IngredientDraft`. When the module arrives, this test returns from the pending save without sending it. Raw values remain, but the requested save silently disappears.

Independent reproduction in `packages/web/test/reviewer-d1-owner.test.mjs`, eighth test:

1. Add an inline ingredient with an empty seed; wait for the reusable form to load, avoiding an automatic translation that would load the legacy client early.
2. Enter Chinese name `Same buffer` and ID `reviewer-local`, hold the legacy module, and click Save this ingredient.
3. Verify busy protection with zero writes; render the same Dish in Ukrainian and verify the same row still owns the same buffer.
4. Release the module. Expected: one save of the original accepted snapshot under the current owner. Actual: zero writes.

`reviewer-owner-final.log` independently records this third failure. The code path was also reported by the author during the repair sweep, but this finding uses the reviewer's own exact-archive probe and source inspection. It is separate from R1: language continuity must remain allowed while route departure must stop new writes. Preserve the original snapshot, exact row/buffer and authentication ownership, and allow only the current owner to continue; avoid installing an old DOM subtree into the new view.

## Independent verification completed

Actual runtime: `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node`, version `v20.20.2`, darwin arm64. Runtime/dependency paths are in `reviewer-runtime.json`. The web `@canteenos/core` dependency resolves to this exact archive's core, which was rebuilt before testing, rather than the older archive used for read-only dependency reuse.

| Verification | Independent result |
|---|---|
| Fixed original Web suite | 467/467, zero failures, cancellations, or skips |
| Core compilation and Web typecheck | Exit 0 |
| Reviewer owner sweep | 5/8; R1's two paths and R2 fail |
| Existing ACK assertions | All 15 original assertion expressions retained |
| Existing Ingredient assertions | All 147 retained; one image-admission assertion added |
| Unload and Shopping raw tests | Byte-identical to approved C-composition baseline |
| Source identity | All 56 Web source files equal exact Git and the browser build's source copies |
| Author evidence custody | Both archived manifests independently checked against file bytes and Git: 50/50 and 59/59 |

The five passing independent owner siblings cover: cancelling the pending inline buffer before code arrival without translation; removing and restoring the same buffer with exactly one translation of its latest text; two independent old-auth image/legacy tickets settling individually without changing a newer editor; Ingredient pre-load save snapshot versus later raw text; and Dish pre-load image metadata snapshot versus later pending metadata. These add to the original suite's authentication, unknown outcome, ACK, upload, unload, and shopping checks.

The extraction was also inspected for pure type imports and absence of a page backedge. `editor-image.ts` preserves the original decode/canvas/compression algorithm. The optional loader caches a native module failure as unavailable for the current document; it does not invent another module identity or turn a failed code read into an unknown write. Inline readiness is assigned before its single `finish(true)` notification; the real-browser handoff below confirms that the resulting current repaint starts one automatic translation without a clean protection gap or duplicate request.

## Actual-browser evidence and limits

The browser build has the original Vite config, application main, PWA, and all 56 production sources unchanged. An additional explicit test entry supplies simulated private API responses and visible probe buttons. Its bundle is not used for budget measurement. Real emitted JavaScript requests were held or failed by a loopback server; production dynamic imports, native module caching, image decoding, Canvas, page renderers, C1, and the shared protection registry were exercised.

Root ran exactly one UI operator at a time, waited for the prescribed step to settle, and saved the complete raw output. The reviewer independently read all new check records and the server request journals. The four origins and explicit stopped sessions are recorded in `reviewer-servers.json`; all review listeners were stopped after final capture.

- Inline module held across language, departure and return: **9/9**, including one automatic translation after readiness and the retained buffer/result. See `native-inline-handoff.json`.
- An already loaded translation API returns a real simulated HTTP 503, then a second user request succeeds: cumulative **11/11**. Its ledger contains one automatic request and two action requests. See `native-inline-real-retry.json`.
- A real emitted inline form request returns HTTP 503: retained editable raw, dirty protection, no false retry and no unknown write; explicit Cancel permits one no-image C1 save with the original conditional header: **7/7**. See `native-unavailable-visible.json` and `native-unavailable-cancel-save.json`.
- After the server is restored, a direct import of that same emitted URL remains rejected, with no new GET and no new POST: cumulative **8/8**. This is a positive diagnostic of persistent native unavailability, not a successful recovery. See `native-unavailable-same-url.json` and `native-inline-failure/transport-requests.json`.
- The two native late-write regressions are described under R1; they remain RED.

The actual photo used by the Dish probe was an explicit fixture `File` supplied through `DataTransfer` to the real file input, followed by native decode and Canvas. It does not claim successful use of the operating-system file picker. Failed precaching of the deliberately failed optional JS is visible as a redundant worker; no production precache policy was changed to hide this fault.

## Final emitted-byte budget

These are independent measurements of the production build, not the test-entry build. `reviewer-graph.mjs` parses the final JavaScript AST, checks static and dynamic edges against emitted metadata, resolves Vite preload maps, finds null-facade Prep by module membership, and sums each distinct gzip-compressed chunk. Normal SW includes the immediately requested Workbox window chunk; no-SW uses the corresponding actual closure without it. Action-only modules remain separate.

| Entry | Default SW | Default no SW | HTTP SW | HTTP no SW |
|---|---:|---:|---:|---:|
| Prep | 32204 | 29861 | 32199 | 29856 |
| Menu | 38333 | 35990 | 38330 | 35987 |
| Purchase | 53278 | 50935 | 53291 | 50948 |
| QR | 20805 | 18462 | 20799 | 18456 |
| Locked admin | 20341 | 17998 | 20330 | 17987 |
| Home | 55253 | 52910 | 55298 | 52955 |
| Plan | 59686 | 57343 | 59693 | 57350 |
| Import | 50865 | 48522 | 50871 | 48528 |
| Ingredient new | 50148 | 47805 | 50146 | 47803 |
| Dish new | 57991 | 55648 | 57992 | 55649 |
| Publish | 56322 | 53979 | 56366 | 54023 |

All 44 combinations meet the exact 60,000 gzip-byte limit. The tightest is HTTP Plan at **59,693 bytes**, leaving **307 bytes**. Each build has 24 application JS chunks and 12 inspected preload groups; every application JS chunk is present in the actual SW precache, with no missing entries. Full per-entry files, raw bytes, edge lists, preload arrays and SW/runtime bytes are in `reviewer-budget-default.json` and `reviewer-budget-http.json`; emitted file hashes are in `reviewer-emitted-sha256.json`.

The original exceeded-budget baseline is consumed from the already approved C history and the verified author baseline artifacts; this review independently rebuilt and measured the final fixed production twice. This proves the requested entry-budget contract, not a smaller full installation download or a general performance improvement claim.

## Scope and evidence handling

The package delta against approved C history `587d24bfee5cb92715db42a3a2d1014f61a543d2` is exactly six D production files and four D test files (`reviewer-scope.txt`). No shared API, main, reader, PWA, config, core or Worker production change is included in this D review. The approved full C histories remain prerequisites; prior 948 native-update, public continuity, three-language, R1/R2/ACK and shopping evidence is not being overwritten or newly claimed as rerun here. No live Worker, external save, publish, deployment, L2, Q release, or whole-application acceptance occurred.

Raw failed results remain intact: the first two-test RED, intermediate seven-test sweep, final eight-test sweep, the two native 2/4 results, the native 503/same-URL failure, and initial reviewer build/AST-tool setup errors. The browser-build and assertion-tool setup failures were dependency-resolution mistakes in temporary review tooling; corrected logs are separate. They were not fixed in production and are not product findings. Author v1/v2/v3 failed or corrected evidence was inspected through the immutable archived manifests and was not rewritten.

Reproduction commands and artifact roles are recorded in `COMMANDS.md`. `reviewer-artifact-manifest.json` records SHA256 and byte size for this report, the independent tools, all new raw logs/results, identity and assertion checks, production graphs, and transport journals. The review remains open until both P2 findings are verified on a newly frozen candidate by this original non-author reviewer.
