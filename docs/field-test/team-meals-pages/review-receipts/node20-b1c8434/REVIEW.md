---
feature_ids: [team-meals]
topics: [independent-review, node20, test-harness]
doc_kind: review
created: 2026-09-11
---

# Independent Node20 harness repair review

**APPROVE**, bounded to the two test-environment repairs and their evidence. No actionable P1/P2 finding.

- reviewedHeadSha: `b1c84349f322601488a751961b646c97d24d55c7`
- parentSha: `73693f81b77db2668adf01441456683d9d5a4c87`
- production anchor: `34dd3364ad9397cac3ded4b8ee5460dac09fc879`
- reviewer: `/root/plan_review`, non-author; engagement: iterative local_cat
- exact archive: `/private/tmp/canteen-node20-harness-review-b1c8434`

## Scope and source review

Reviewed the exact diff, full handoff, runtime/commands, complete author logs and14-file manifest. Only `packages/web/test/team-meals-pages-shopping-raw.test.mjs` and `team-meals-pages-guard-harness.mjs` change under packages. No production, C, CI, dependency/version, native browser fixture or original business assertion changes. The fixed production/source/index/config set is64/64 identical to34dd (`scope-integrity.json`). Original ACK/unload tests are unchanged; shopping bodies after `async function scope(f)` are byte-identical. The existing independent16-probe file is copied byte-for-byte with hash `766a013047859c26fa6a2bb9f8bd34a7c4d3d537a767f9bbac49388e1dd03343`; its local filename omits `.test` so the original full Web glob still means419, not435.

The shopping fixture installs its own navigator instead of assuming Node20 supplies one or mutating Node24's native navigator. Both helpers restore original property descriptors and remove properties originally absent. Resource cleanup uses finally; thrown cleanup errors propagate.

The guard event uses an instance-only writable string returnValue while retaining native Event/EventTarget. Empty returnValue alone does not veto; nonempty legacy returnValue and preventDefault each veto. No Event.prototype patch, exception suppression, skip or weakened dirty/unknown assertion was introduced. This is a Node browser-interface fixture, not an emulation claim about native browser scheduling or UI.

## Independent verification

| Check | Actual result |
|---|---|
| Node20.20.2 full original Web suite | **419/419**, zero fail/cancel/skip |
| Node20 Web typecheck | **exit0**, no diagnostics |
| Node24.18.0 selected scope | **53/53**, zero fail/cancel/skip |
| Node20.20.2 same selected scope | **53/53**, zero fail/cancel/skip |
| Preloaded descriptor restoration on selected files | Four successful checks per runtime;13 original global descriptors and native Event.returnValue descriptor unchanged |
| Independent environment probe | Both runtimes pass original/absent/custom-getter cases; normal cleanup and cleanup-exception restoration; instance string behavior; both veto mechanisms; exact native Event.prototype descriptor attributes unchanged |
| Committed author evidence integrity | **14/14** matches |

The selected53 is explicitly original independent35 (ACK12 + unload7 + reviewer16) plus shopping18. It is not the author's37 counted as35 plus two. No new business suite was authored; the additional probe checks only environment/restoration behavior.

Actual binaries are pinned in `reviewer-runtime.json`: `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node` and `/Users/terry/.nvm/versions/node/v24.18.0/bin/node`, darwin arm64. Complete raw outputs: `reviewer-node20-full.log`, `reviewer-node20-typecheck.log`, `reviewer-node20-selected53.log`, `reviewer-node24-selected53.log`, and both `reviewer-node*-environment.log`. Commands are recorded separately. No runtime was downloaded or switched globally.

The author RED is independently read and consistent with source/runtime:419 total,411 pass,3 fail,5 canceled. Actual errors are absent navigator and getter-only generic Event.returnValue; subsequent cancellations follow those uncaught EventTarget failures. The original RED is author evidence, not claimed as an independently rerun baseline.

## Preserved reviewer setup failures

The first archive preparation ran core's no-emit config, leaving dist absent. The ensuing full-suite attempt produced379/382 with three module-load failures for missing `packages/core/dist/index.js`; complete output remains `reviewer-node20-full-before-core-build.log`. Running the actual `tsconfig.build.json` produced the dependency, after which the unchanged full419 passes. No product/test assertions were altered to repair this setup.

An initial environment probe compared the entire Event descriptor map using Node24 deepStrictEqual and failed despite each descriptor attribute being identical. A pure Node24 control with no harness import reproduces that whole-map comparison behavior. The probe now compares every own key and descriptor attribute by strict identity/value. Original failure, diagnostic, first probe source and no-harness control remain preserved. This is a reviewer comparison-method correction, not a candidate defect. Both completed runtime probes include deliberate cleanup throws and verify that the exact error remains observable after descriptor restoration.

## Boundaries

This approval does not modify the immutable34dd report or any native browser evidence. No browser/server/native matrix was started. APP-MAIN-R3's prior composition verdict and its separate C repair/review remain outside this test-only decision; no C candidate was consumed here. No D1, all-application, performance-budget, L2, Q, publish or deployment approval is implied. Root workspace and pending documents were untouched.
