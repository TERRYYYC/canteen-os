---
feature_ids: []
topics: [team-meals, q-ui-t08-01, independent-review]
doc_kind: verification-commands
created: 2026-09-11
---

# Fixed local verification

All work ran in `/private/tmp/canteen-q-t08-review-5049f0a`, created with `git archive 5049f0a47c76c4149a91a288a6a9b6edf279b1ea` from the D repository. No production or author test was edited. Existing dependencies were reused read-only; the Web `@canteenos/core` link points to this archive's core. `reviewer-integrity.json` verifies every one of the 227 tracked package files against the fixed Git target after the checks.

Node executable throughout Node/build/type checks: `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node`. Its directory was first in PATH for the npm prebuild. `reviewer-runtime.json` records actual version, executable and cwd. In commands below `NODE20` denotes that exact executable, not the system `node`.

| Check / reproduction command | Original output | Result |
|---|---|---|
| Compile archived core with its TypeScript compiler and `-p packages/core/tsconfig.build.json` | `reviewer-core-node20.log` | exit 0 |
| `NODE20 --test packages/web/test/*.test.mjs` (before adding the reviewer test) | `reviewer-full-node20.log` | 509/509, no skip/cancel/fail |
| Archived Web TypeScript compiler with `--noEmit -p packages/web/tsconfig.json` | `reviewer-type-node20.log` | exit 0 |
| `NODE20 scripts/build-data.mjs` | `reviewer-data.log` | exit 0 |
| `npm --prefix packages/web run prebuild` with Node20 PATH | `reviewer-prebuild.log` | exit 0 |
| `NODE20 docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" "$PWD/build-default"` | `reviewer-build-default.log` | exit 0 |
| Same build, output `build-http`, with `VITE_WORKER_URL=https://application-api.local.invalid` | `reviewer-build-http.log` | exit 0 |
| `NODE20 reviewer-graph.mjs build-default reviewer-budget-default.json 5049f0a47c76c4149a91a288a6a9b6edf279b1ea` | `reviewer-budget-default.log` | 22/22 bounds, all JS precached |
| Same graph command with `build-http` and `reviewer-budget-http.json`, same explicit SHA | `reviewer-budget-http.log` | 22/22 bounds, all JS precached |
| `NODE20 --test packages/web/test/reviewer-q-t08.test.mjs` | `reviewer-extra-node20.log`, then `reviewer-extra-node20-v2.log` | First reviewer syntax failure retained; corrected probe 6/6 |
| `python3 reviewer-integrity.py` | `reviewer-integrity.log`, then `reviewer-integrity-v2.log` | First manifest-format assumption failure retained; final all provenance checks pass |
| `python3 reviewer-browser-recheck.py` | `reviewer-browser-recheck.log` / `.json` | Original 32/32 receipt recomputed exactly; ACK and initial-check observations pass |
| `git diff --check 842b778bd352c0dba8921584ce142d94665e5ca2..5049f0a47c76c4149a91a288a6a9b6edf279b1ea -- packages` in D repository | Tool result | exit 0 |

The budget builder uses the original Vite configuration with one observation-only graph asset; no renderer/main/SW configuration is substituted. `reviewer-graph.mjs` independently parses actual emitted import/preload graphs, resolves Prep through module membership when its facade is null, and adds immediately loaded Workbox to normal-SW totals. The required full target SHA is an explicit argument validated by the tool; both JSON headers and source/build integrity use 5049f0a.

`consumed-author` is the byte-exact evidence directory from e6aef33e8f9e910c6f5d17b5a4e0b85030194a44. `consumed-browser` is the byte-exact evidence directory from eb42e575b8cce463ff34653d9382e7b58eea60d5. Both commits have zero package diff from 5049f0a. The browser recheck reads the preserved observations and writes only new reviewer output; it neither changes those copies nor operates a browser/server. Root supplied and operated the actual native run.

Preserved reviewer-tool failures are not product failures: a missing closing parenthesis prevented the first independent test from compiling; the integrity reader initially assumed an array manifest, whereas the author's manifest is a path-to-hash map. The fixes changed only these new reviewer tools. Original logs are not overwritten. The original author's RED, overbroad zero-token regexp failure and browser setup failures are copied unchanged with their original manifests.
