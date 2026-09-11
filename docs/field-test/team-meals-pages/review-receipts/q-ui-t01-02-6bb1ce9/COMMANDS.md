---
feature_ids: []
topics: [team-meals, q-ui-t01-02, independent-review]
doc_kind: verification-commands
created: 2026-09-11
---

# Fixed local checks

Target: `6bb1ce916c9b4117b6e03db23a78a5d0b9724a10`, archived from D into `/private/tmp/canteen-q-t01-review-6bb1ce9`. All commands below run there. Existing dependencies are read-only links; Web's core link resolves to this archive's own core. No production or author test was changed.

`NODE20` below means `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node`. `reviewer-runtime.json` records the actual executable/version/cwd. The same executable directory was first in PATH for npm prebuild.

| Actual check | Output | Result |
|---|---|---|
| `NODE20 packages/core/node_modules/typescript/bin/tsc -p packages/core/tsconfig.build.json` | `reviewer-core-node20-v2.log` | exit 0 |
| `NODE20 --test packages/web/test/*.test.mjs`, before adding reviewer probes | `reviewer-full-node20.log` | 539/539, no skip/cancel/fail |
| `NODE20 packages/web/node_modules/typescript/bin/tsc --noEmit -p packages/web/tsconfig.json` | `reviewer-type-node20.log` | exit 0 |
| `NODE20 scripts/build-data.mjs` | `reviewer-data.log` | exit 0 |
| `npm --prefix packages/web run prebuild` | `reviewer-prebuild.log` | exit 0 |
| `NODE20 docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" "$PWD/build-default"` | `reviewer-build-default.log` | exit 0 |
| Same build to `build-http`, with `VITE_WORKER_URL=https://application-api.local.invalid` | `reviewer-build-http.log` | exit 0 |
| `NODE20 reviewer-graph.mjs build-default reviewer-budget-default.json 6bb1ce916c9b4117b6e03db23a78a5d0b9724a10` | `reviewer-budget-default.log` | 22 combinations pass |
| Same graph command for HTTP/output `reviewer-budget-http.json`, same explicit full SHA | `reviewer-budget-http.log` | 22 combinations pass |
| `NODE20 --test packages/web/test/reviewer-q-t01.test.mjs` | `reviewer-extra-node20.log` | 6/6 |
| `python3 reviewer-dependency-continuity.py` | `reviewer-dependency-continuity.log` / `.json` | Baseline dependency comparison passes |
| `git diff --check 85be50155723114256d8e597160e7db7a8c2995a..6bb1ce916c9b4117b6e03db23a78a5d0b9724a10 -- packages` in D repository | Tool output | exit 0 |

The budget builder retains the original Vite configuration and adds only an observation asset. The independent graph reader parses emitted static/dynamic imports and Vite preloads, handles Prep's null facade through module membership, counts immediate Workbox in normal-SW entries and checks actual JS precache. The full target SHA is a required argument, never inherited from a prior review.

Six reviewer cases reuse the original composition harness without changing it, with new scenario bodies. It bundles real Plan/Import renderers, C API/session/store and explicit fake HTTP envelopes. The test-build getter exposes the original session; C methods and renderers are not replaced. Unknown-baseline probes explicitly change modeled source truth back to its original source/absence before recovery; they do not claim a real transport rollback. These are Node DOM-double cases, not browser evidence.

Source integrity checks every tracked package file against exact Git 6bb1ce9 after execution. The emitted hash record includes both builds' 24 app JS, SW and Workbox runtime. The dependency comparison consumes the prior fixed 5049 review's build graph/bytes read-only. Only the new D `plan-import.ts` enters the Plan and Import static closures; the pre-existing `parse-plan-text-DBZQVSv5.js` remains byte-identical.

Setup corrections are preserved honestly: system Python did not support `tarfile.extractall(filter=...)`, so no archive was extracted on the first attempt; the consequent core command failed before source/dependencies existed (`reviewer-core-node20.log`). The setup note preserves the error; the archive was then extracted with system tar. The first dependency comparison failed because its normalizer left the two archives' index.html absolute paths different (`reviewer-dependency-first.log`, tool-output transcript). The corrected normalizer changes only the archive prefix. Neither was a product failure or changed a business assertion.

Author original RED and setup/budget-check failures remain separate evidence. Browser observations are root-operated actual main/C/Worker with fixed local FakeRepo, consumed and checked independently by this reviewer after receipt; no second browser/native matrix is represented by the Node results above.

Final read-only evidence validation:

- `python3 reviewer-custody.py > reviewer-custody.log 2>&1`: copies only fixed Git evidence into new reviewer folders, checks 33 author +26 native green +14 native red entries against original bytes/hashes, verifies evidence commits' packages equality and 58 browser/5 author source hashes. Exit 0.
- `python3 reviewer-browser-recompute.py > reviewer-browser-recompute.log 2>&1`: the received predicate script with only its input/output locations redirected to the reviewer archive. It writes a new receipt; all15 captured predicates pass, original receipt untouched. Exit 0.
- `python3 reviewer-final-check.py > reviewer-final-check.log 2>&1`: 18 consistency checks including exact original/recomputed receipt equality, Source/ACK conditional headers, seven requests/two writes, held five-row snapshot versus later sixth row, final source/emitted hashes and current target metadata. Exit 0.
- `python3 reviewer-manifest.py > reviewer-manifest-check.log 2>&1`: builds and verifies the final artifact manifest. The manifest excludes itself and this derived post-manifest verification log to avoid a hash cycle; consumed original manifests are included unchanged.

No final evidence command starts a browser, server, new matrix or rebuild. Author raw logs were originally written directly in the fixed Git evidence directory; browser raw originals were checked against their original tmp paths. Copies in consumed-* retain their original bytes.
