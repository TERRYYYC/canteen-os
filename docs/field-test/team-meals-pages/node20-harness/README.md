---
feature_ids: []
topics: [team-meals, testing, node20, browser-fixture]
doc_kind: implementation-evidence
created: 2026-09-11
---

# D browser-interface test fixture portability — author evidence

What: Test-only repair in `team-meals-pages-shopping-raw.test.mjs` and `team-meals-pages-guard-harness.mjs`, based on `73693f81b77db2668adf01441456683d9d5a4c87` (packages identical to fixed `34dd336`). The former installs a private navigator; the latter uses a per-event writable DOMString returnValue for simulated beforeunload. Both capture and restore all global descriptors they replace, deleting fixture-only globals when originally absent. No production page, PWA, C code, CI, dependency, runtime version or native browser fixture changes.

Why: CI selects Node 20; the local reproduction uses Node 20.20.2. A fresh full Web run reproduces the reported 419 total / 411 pass / 3 fail / 5 canceled. The clipboard case accesses absent `navigator`; real PWA writes `Event.returnValue`, which Node 20's generic Event exposes only as a getter. These are Node-side browser-interface simulation errors. The later canceled tests are downstream of the uncaught EventTarget errors, not additional product findings.

Tradeoff: Adapt the test's browser interfaces to both installed runtimes while preserving the real renderer, registry, PWA, original business assertions and failure propagation. The event remains a native Node Event dispatched through native EventTarget, with an instance-only returnValue descriptor; canceling by preventDefault or nonempty legacy returnValue still vetoes unload. Native Event.prototype is untouched. No catch suppresses test exceptions, no tests are skipped, and no browser or product approval is expanded.

Open Questions: None for this test-environment repair.

Next Action: Root sends the fixed commit to the original non-author `plan_review` for independent verification, then reports to dispatch. C R3 is still under separate review and is not consumed here. Existing real-browser approval remains unchanged; the native matrix was not rerun.

## Grounded environment and original RED

[Full runtime metadata](runtime.json) includes actual executable paths, process.versions, platform/architecture, and property descriptors:

| Runtime | Executable | navigator own descriptor | Event.prototype.returnValue |
|---|---|---|---|
| Node 20.20.2, darwin arm64 | `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node` | absent | getter only, no setter |
| Node 24.18.0, darwin arm64 | `/Users/terry/.nvm/versions/node/v24.18.0/bin/node` | configurable getter | getter and setter |

Both binaries were already installed. No download, version switch, environment configuration change or dependency install was performed. The author reran the original failure on the specified baseline before modifying the two files; [node20-full-red.log](node20-full-red.log) is the complete raw output, not the dispatch log or a summary copied from it. Node 24's original author target passed before modification ([baseline](node24-target-baseline.log)).

## Verification and exact scope

[commands.json](commands.json) records each exact command, working directory, exit code and phase. Full outputs are preserved byte-for-byte:

| Run | Actual result |
|---|---|
| Node 20 full Web, RED | 419 total, 411 pass, 3 fail, 5 canceled |
| Node 20 author target, GREEN | [37/37](node20-target-green.log), zero canceled/skipped |
| Node 20 full Web, GREEN | [419/419](node20-full-green.log), zero failed/canceled/skipped |
| Node 20 TypeScript | [exit 0, no diagnostics](node20-typecheck.log) |
| Node 24 author target + restoration checks | [37/37](node24-target-green.log), zero canceled/skipped |
| Node 20 author target + restoration checks | [37/37](node20-target-restoration.log), zero canceled/skipped |

The author target is **shopping raw 18 + original ACK 12 + original unload 7 = 37**. It is a different set from the previous independent **ACK 12 + unload 7 + reviewer probes 16 = 35**. These counts must not be treated as the same suite or as one merely adding two cases to the other. The original reviewer can combine its 35 with shopping 18 for a 53-case selected scope. This author did not claim to run the reviewer-owned 16 probes.

[unchanged-assertions.json](unchanged-assertions.json) records byte-identical original ACK/unload files and the unchanged shopping test bodies; it also records a read-only hash of the existing reviewer probe. All dirty/unknown/native-veto and ACK assertions remain intact. The existing clipboard test still holds two writes, finishes one, proves the other stays pending, rejects the final operation and verifies readable fallback.

[restore-check.mjs](restore-check.mjs) is an environment-only preload, not another business test suite. After each of the three target files it compares all 13 relevant global property descriptors with their original descriptors and checks native Event.prototype is unchanged. Logs record three successful restoration checks on each runtime. Node 20's absent navigator is deleted after the fixture, and Node 24's native getter is restored, rather than left as a fixture object. Cleanup uses finally to restore descriptors even if resource cleanup throws; test errors remain visible.

Scope verification: only the two named test files change under packages. The successful full suite is bounded author test evidence, not independent product approval or a claim about the unapproved C R3 candidate. No new product behavior, quantity calculation, API response or native update result was invented.
