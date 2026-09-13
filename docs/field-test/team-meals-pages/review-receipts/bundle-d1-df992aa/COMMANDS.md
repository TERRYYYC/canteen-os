---
feature_ids: [APP-BUNDLE-D1]
topics: [independent-review, commands]
doc_kind: evidence
created: 2026-09-11
---

# Independent execution and reproduction

Working directory: `/private/tmp/canteen-bundle-d1-review-df992aa`, created by Git archive of `df992aad3807638c2ef1a092cdb38d01b9d60f6d`. Dependencies are reused read-only; the web core dependency points to this archive and was rebuilt. Production files were not edited.

Actual Node executable for all Node commands: `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node` (abbreviated below as `node20`; no shell alias is required). `reviewer-runtime.json` records its actual process and dependency paths. These commands reconstruct the performed checks and map them to the saved original outputs; this file is not an automatic shell transcript.

```sh
node20 packages/core/node_modules/typescript/bin/tsc -p packages/core/tsconfig.build.json
node20 --test packages/web/test/*.test.mjs
node20 packages/web/node_modules/typescript/bin/tsc -p packages/web/tsconfig.json --noEmit
node20 scripts/build-data.mjs
PATH=/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin:$PATH npm --prefix packages/web run prebuild
node20 docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" "$PWD/build-default"
VITE_WORKER_URL=https://application-api.local.invalid node20 docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" "$PWD/build-http"
node20 reviewer-graph.mjs build-default reviewer-budget-default.json
node20 reviewer-graph.mjs build-http reviewer-budget-http.json
node20 --test packages/web/test/reviewer-d1-owner.test.mjs
node20 reviewer-assertions.mjs
python3 reviewer-integrity.py
node20 reviewer-browser-build.mjs
```

The original full Web 467/467 run occurred **before** adding `reviewer-d1-owner.test.mjs`. Re-running the wildcard afterward intentionally includes its eight extra tests and is expected to expose the three failing tests. The original exact test suite log is `reviewer-full-node20.log`. Core/type/data/prebuild/build logs have corresponding `reviewer-*` names.

The reviewer owner file grew from two tests (`reviewer-owner-first.log`: 0/2), to seven (`reviewer-owner-sweep.log`: 5/7), to eight (`reviewer-owner-final.log`: 5/8). Original logs are retained. `reviewer-assertions.log` is the first temporary-tool module-resolution error; `reviewer-assertions-corrected.log` is the successful unchanged-assertion comparison. Likewise `reviewer-browser-build.log` is the initial temporary builder import-resolution error and `reviewer-browser-build-corrected.log` is the successful build of the same production source. The final corrected tool files are retained.

Browser build root is `browser-web`. Its 56 `src` files are byte-identical to the target. It adds `test/application-d1.ts` before the original main entry solely for visible review controls, explicit mock API, state projections and observed Workbox events. `reviewer-browser-build.mjs` generates real published fixture assets using the production fixture producer. `browser-web/dist/reviewer-module-graph.json` maps actual emitted module paths.

The exact unmodified archived local server was used four times, each with a separate evidence directory:

```sh
node20 docs/field-test/team-meals-pages/bundle-d1-browser/serve-gated-dist.mjs browser-web/dist native-ingredient-route
node20 docs/field-test/team-meals-pages/bundle-d1-browser/serve-gated-dist.mjs browser-web/dist native-dish-route
node20 docs/field-test/team-meals-pages/bundle-d1-browser/serve-gated-dist.mjs browser-web/dist native-inline-handoff
node20 docs/field-test/team-meals-pages/bundle-d1-browser/serve-gated-dist.mjs browser-web/dist native-inline-failure
```

Each server chooses a loopback port. The state file controls only actual module transport. The first two selected `assets/client-C6VYsiFN.js`, hold→pass after departure. The third selected `assets/ingredient-form-1JCVb91m.js`, hold→pass after retained language/navigation. The fourth selected that form chunk, hold→fail for actual HTTP 503, then pass only after unavailable/Cancel/no-image save evidence. Root clicked the reviewer-prescribed buttons in order, waited for each result, and saved raw `#review-output` JSON without editing. The final same-URL diagnostic still rejected after server restoration and caused no additional GET. All four servers were explicitly stopped; see `reviewer-servers.json`.

The browser test build is separate from both budget builds. Its entry chunk includes fixture code and cannot be used to claim production entry bytes. No runtime network call went to a real Worker; the explicit private API origin was handled by the local test transport.
