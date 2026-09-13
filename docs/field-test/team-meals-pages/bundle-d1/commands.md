---
feature_ids: [APP-BUNDLE-D1]
topics: [commands, runtime, evidence]
doc_kind: evidence
created: 2026-09-11
---

# Commands and scope

All commands ran in the workspace path recorded in `final-runtime.json`, with `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin` prepended to PATH. No installation/configuration or remote operations. Runtime, exact source hashes, Node executable and npm version are in that JSON.

Baseline input packages: `84f8f3e` = released `fee400/e79`. D implementation checkpoint: `1d0cd35a2037e486492410fa21d2165c61883ac7`. Final production composition: `4278f1a80966c23be70ffc05001aa31920b5b4d1` (complete released reader history `587d24b`). Later root custody commits are documentation only.

The executed preparation commands (baseline and final, each with its corresponding log prefix):

```sh
node scripts/build-data.mjs
npm --prefix packages/core run build
npm --prefix packages/web run prebuild
```

Risk-targeted commands:

```sh
node --test packages/web/test/team-meals-pages-bundle.test.mjs
node --test packages/web/test/team-meals-pages-bundle.test.mjs packages/web/test/team-meals-pages-dish.test.mjs packages/web/test/team-meals-pages-ingredient.test.mjs packages/web/test/team-meals-pages-ack.test.mjs packages/web/test/team-meals-pages-unload.test.mjs
npm --prefix packages/web test
npm --prefix packages/web run typecheck
```

Final tests: 467/467 full Web, typecheck exit 0. The 95-test target is the pre-reader checkpoint (17 D1 + 28 Dish + 31 Ingredient + ACK 12 + unload 7). Full Web contains all those same tests plus the approved reader regression tests. No separate claim to the independent reviewer’s 16 ACK probes, native SW approval, or live Worker verification.

The build/graph command uses the approved C observational build script copied into D evidence: `measure.mjs` calls Vite `build` with the unchanged original `packages/web/vite.config.ts`, an isolated output directory and one observe-only `generateBundle` hook. It emits graph metadata and does not change JavaScript/CSS/modules/rollup settings or precache policy. It then gzip-measures every actual emitted chunk. Data/icons/QR are built through the original scripts above.

```sh
node docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" /private/tmp/canteen-d-bundle-final-default
VITE_WORKER_URL=https://application-api.local.invalid node docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" /private/tmp/canteen-d-bundle-final-http
node docs/field-test/team-meals-pages/bundle-d1/totals.mjs /private/tmp/canteen-d-bundle-final-default/bundle-attribution-final.json docs/field-test/team-meals-pages/bundle-d1/final-default.json /private/tmp/canteen-d-bundle-final-default
node docs/field-test/team-meals-pages/bundle-d1/totals.mjs /private/tmp/canteen-d-bundle-final-http/bundle-attribution-final.json docs/field-test/team-meals-pages/bundle-d1/final-http.json /private/tmp/canteen-d-bundle-final-http
```

Baseline/first builds used the same commands with `baseline`/`first` output prefixes. `totals.mjs` now additionally records raw closure bytes and explicit missing-precache entries; its page lookup supports module-membership fallback when a facade is null (including Prep). The closure sums distinct final entry, selected route/page, static/transitive imports and immediate Workbox window script. Vite selected-page preloads reference that same static dependency set; deferred form/client/image chunks are separate action edges. Full chunk arrays and final editor-only adjacency are preserved for independent inspection.

Source/test diff whitespace check is scoped to `packages/web/src` and `packages/web/test`; raw failed test logs deliberately retain emitted whitespace and stack paths. Runtime commands neither contacted the configured invalid API domain nor sent a real publish/save.
