---
feature_ids: [APP-BUNDLE-D1]
topics: [independent-review, commands, repair]
doc_kind: evidence
created: 2026-09-11
---

# Execution and reproduction

Exact Git archive: `7920496e06996eedac6e08e862fa097453ed9462` at `/private/tmp/canteen-bundle-d1-repair-review-7920496`. Actual Node executable (abbreviated `node20` below): `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node`. Runtime paths are recorded in `reviewer-runtime.json`. Commands below reconstruct execution; this document is not an automatic shell transcript.

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
node20 --test packages/web/test/reviewer-d1-repair-boundaries.test.mjs
node20 reviewer-assertions.mjs
python3 reviewer-integrity.py
```

The full original suite ran before the two reviewer-only test files were added and produced `reviewer-full-node20.log` (491/491). The old original eight-test probe was copied verbatim and produced `reviewer-original-sweep-node20.log` (8/8). The added four-test probe first produced `reviewer-new-boundaries-node20.log` (3/4); its initial file is retained as `reviewer-boundaries-initial.mjs`. The sole test correction is `a.zh` to `a.name.zh` for the Dish draft, confirmed against the fixed source interface. `reviewer-new-boundaries-corrected-node20.log` is 4/4. No production fix or assertion deletion occurred while correcting this reviewer mistake.

The graph tool is byte-identical to the prior review's independent AST verifier. The source/builds being measured are this new target. Budget build outputs are `build-default` and `build-http`; generated `bundle-attribution-final.json` files and final emitted JS hashes are included as evidence. The normal generated application data came from the original scripts in this archive, with no network API requests.

For native evidence, no new server/browser was started by this reviewer. The frozen author package at `docs/field-test/team-meals-pages/bundle-d1-route-browser` contains the exact builder, visible probe controls, real module server, module graph, 56-source hash ledger, eight raw browser results and three request journals. Its 20-file manifest and the 22-file author Node/build manifest were checked against their bytes and exact Git. `reviewer-native-custody.json` records the original R1 control-body equality and inspected outcomes. The full paths, original origin/session details, and declared synthetic fixture File boundary remain in the author README; no original JSON was edited.

The old `/private/tmp/canteen-bundle-d1-review-df992aa` archive and all 67 committed receipts were independently checked against their original manifest. The accepted contract's current content revision equals b5ccc0a and target bytes match that fixed revision. The packages match 734e295 and contain only the two-page/two-test repair delta relative to df992. These facts are recorded by `reviewer-integrity.py` in `reviewer-integrity.json`.
