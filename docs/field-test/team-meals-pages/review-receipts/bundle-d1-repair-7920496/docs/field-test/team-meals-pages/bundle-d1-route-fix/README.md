---
feature_ids: [APP-BUNDLE-D1]
topics: [review-repair, route-ownership, validation]
doc_kind: evidence
created: 2026-09-11
---

# D1 route ownership repair — author evidence

What: repair the two original non-author P2 findings on `df992aad3807638c2ef1a092cdb38d01b9d60f6d`, plus the same-boundary inline language regression found by the author sweep. Production changes only `dish-new.ts` and `ingredient-new.ts`; no shared/config/client/store/PWA/core/Worker changes. Tests extend the existing D bundle test and its explicit local harness. Original `bundle-d1` evidence is immutable.

Why: the post-module check proved that auth and original record still existed, but did not prove it was the current document. Ingredient could start save, and Dish could start its pending-photo upload, after the user left. INV-B5 prohibits starting a previously unsent write in that case. Both independent assertions were copied verbatim (test names only changed) into the actual D renderer/real C1+aux registry test and reproduced on current production: **0/2**, with 17 unrelated tests filtered, in `original-two-red.log`. The original reviewer test/log were read without modification; their paths and hashes are in `runtime.json`. Root separately reproduced the emitted-module/native HTTP path in the review archive; that is independent raw evidence, not this Node test.

Repair: Ingredient checks the mounted original owner, connection and matching document route after legacy loading. A departed known-unsent attempt clears only its attempt/saving phase and preserves the same raw draft/dirty state; it can be explicitly saved on return. Dish checks `operation.current()` after legacy loading and before the first upload, then uses its original finally to settle. Inline saving checks current owner plus exact row and raw buffer at that same boundary, allowing current language rebinds instead of cancelling on an obsolete paint generation. Current auth validation remains included in these checks. Already-started uploads/save requests preserve their original settlement, metadata, acknowledgement and unknown handling. No request is cancelled or assumed acknowledged by navigation.

Tradeoff: route departure cancels only the unsent continuation. A return to the same owner before module readiness still permits the original action. Normal language changes also continue. No new operation/auth map, generation, persistence, fallback loader, or retry layer was added. Native module failure remains the approved honest unavailable-capability state; this repair does not change that platform boundary.

## Failure-mode sweep

| New module wait / next effect | Result |
|---|---|
| Ingredient legacy → first save, existing/new and photo/no-photo | Fixed current document admission; known-unsent phase returns idle |
| Dish legacy → first photo upload | Fixed original current record admission |
| Dish inline legacy → upload/save | Was departure-safe but incorrectly rejected current language repaint; fixed using current owner + exact row/buffer |
| Ingredient legacy → translation; image module → decode | Existing task owner/auth/raw validation remains; existing D1 held-module and late-auth tests rerun |
| Dish legacy → translation; image module → decode; inline module → form | Existing original owner, row/buffer and current subscriber behavior retained; original D1 tests rerun |
| Work that crossed its write boundary before departure | Existing owner settlement retained; new direct Http save and held upload cases verify later raw and no repeated image upload |

There is no new fallback branch chain. The repository has no `scripts/check-fallback-layers.mjs`; the added conditions are admission checks and a known-unsent state transition, not alternative transport/loading routes.

## RED → GREEN and regression

The expanded 19-case R1 selection initially had **8 pass / 11 fail** (17 original D1 tests filtered): original 2 + eight Home/other-record cases + inline language continuation. It then became **19/19**. `sweep-red.log` and `sweep-red-corrected.log` preserve the iteration in which the test learned that a detached Dish controller's active `draft` getter is null; the final assertion inspects the captured original draft/record metadata and verifies identical draft on return. The product failure remained present in both runs.

Five additional tests cover already-started Ingredient save / Ingredient photo / Dish photo across departure and inline save release on Home/another record. The direct Ingredient started-write case uses the actual HttpAdminApi mocked fetch gate; photo cases use explicit local upload responses. The initial extra-test run and strengthened actual-fetch rerun are both preserved.

- `target-final.log`: **119/119** = prior 95 + 24 R1 cases. Original ACK12 and unload7 assertions remain; no claim to the independent extra16 ACK sweep.
- `full-web-node20.log`: **491/491**, no fail/cancel/skip.
- `type-node20.log`: typecheck exit **0**.
- Source/test `git diff --check`: clear. Raw RED logs retain original output whitespace.

Exact local Node20.20.2/npm/executable/source hashes are in `runtime.json`. No browser result or independent approval is inferred from Node tests.

## Rebuilt budget and cache

Both original configurations were rebuilt from these exact production file hashes, using the original data/core/prebuild scripts and the unchanged Vite config through the already-fixed observe-only `bundle-d1/measure.mjs`. No source/config parameter changes. `default/http-graph.json` preserve every final emitted static/dynamic dependency; `preload-validation.json` resolves actual generated Vite preload indices against those closures, all `outsideStaticClosure=[]`.

Default and configured HTTP (`https://application-api.local.invalid`) each pass **11/11** at 60,000 gzip bytes. Default/HTTP: Ingredient **50,152/50,177**; Dish **57,970/57,993**; tightest Plan **59,667/59,690** (333/310 bytes margin). Full 11-route normal-SW and no-SW totals plus raw byte sums are in `default.json` and `http.json`.

All **24 application JS** remain precached, `missingPrecachedJs=[]`. Default/HTTP all-application JS cache: **169,954/170,016 gzip**, **432,334/432,436 UTF8 bytes**. SW + runtime is separate **9,512/9,515 gzip**. No reduction of cold installation transfer is claimed. Exact final dist: `/private/tmp/canteen-d1-route-final-default` and `/private/tmp/canteen-d1-route-final-http`.

Commands (workspace and PATH are in `runtime.json`; stdout/stderr are adjacent raw logs):

```sh
node --test --test-name-pattern='D1-R1 reproduction' packages/web/test/team-meals-pages-bundle.test.mjs
node --test --test-name-pattern='D1-R1' packages/web/test/team-meals-pages-bundle.test.mjs
node --test packages/web/test/team-meals-pages-bundle.test.mjs packages/web/test/team-meals-pages-dish.test.mjs packages/web/test/team-meals-pages-ingredient.test.mjs packages/web/test/team-meals-pages-ack.test.mjs packages/web/test/team-meals-pages-unload.test.mjs
npm --prefix packages/web test
npm --prefix packages/web run typecheck
node scripts/build-data.mjs
npm --prefix packages/core run build
npm --prefix packages/web run prebuild
node docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" /private/tmp/canteen-d1-route-final-default
VITE_WORKER_URL=https://application-api.local.invalid node docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" /private/tmp/canteen-d1-route-final-http
```

`bundle-d1/totals.mjs` was then run against each final `bundle-attribution-final.json` and its dist to produce the adjacent JSON/log. `measure.mjs`/`totals.mjs` themselves were not changed. No remote API calls, real saves or publications occurred.

Open Questions: author native emitted-module RED→GREEN and the original non-author focused re-review are pending outside this Node/build handoff. Next Action: root freezes this commit, executes the real browser matrix on that exact source, and returns it to the original reviewer. This evidence is author validation, not self-approval or overall application/L2 acceptance.
