---
feature_ids: []
topics: [team-meals, pages, bundle, fixed-inputs, evidence]
doc_kind: integration-checkpoint
created: 2026-09-11
status: implementation-in-progress
---

# APP-BUNDLE-D1 fixed input custody

The D budget/lifecycle contract is frozen at `757d0914e95ef4b9302c0ffa8765baa7b0b607c6:docs/design/team-meals-pages/APP-BUNDLE-D1-contract.md`. Dispatch explicitly released C implementation `e79fe3b49b2a5d3c06c5d7298d9207adc5cc3c71` through full history `fee400c827bdd1dcf2b447fb18cef9db4107b296` before D implementation began.

Local merge `84f8f3eb19b8ba6c7ef330c7b55890ca690ab185` has parents `757d0914e95ef4b9302c0ffa8765baa7b0b607c6` and `fee400c827bdd1dcf2b447fb18cef9db4107b296`, without conflicts. Its packages are byte-identical to fee400/e79 (tree `34d940d33719095ac187e920b936243145b10a1d`). Complete C ancestors and authors remain present. C e79 changes only main and two main tests relative to prior D composition 948026 under packages; D pages, core, Worker, PWA, configuration and dependencies remain unchanged at this merge.

Root read the fixed original [C independent report](../team-meals-web-shared/APP-BUNDLE-C1-review-evidence/REVIEW.md), [native observations](../team-meals-web-shared/APP-BUNDLE-C1-review-evidence/NATIVE-OBSERVATIONS.md) and [offline finding](../team-meals-web-shared/APP-BUNDLE-C1-review-evidence/OFFLINE-FINDING.md). The read-only custody check by `/root/import_owner` verified every Git blob against its manifest and original local path:

| Fixed artifact | Count / SHA256 |
|---|---|
| fee400 `APP-BUNDLE-C1-review-evidence/CUSTODY.json` | 22/22 originals match; `67f49af559ffb1205df41872e67dbe34ddae186c0546395935532ad17ecf047a` |
| Original `/private/tmp/app-bundle-c1-review-e79fe3b-etbw3e/REVIEW.md` | `3e9bc0d1eb8f80736557d82b28cae1273eb11574dbf403ec95d3a3df3801f5bb` |
| f266fdae255e3c79223daa78b988bd125d472707 `APP-BUNDLE-C1-evidence/SHA256SUMS.json` | 24/24 match; manifest `e4a39b3021c84988f836ca180aa2546407ea2d3f4e78d70e081e52d2484bd311` |

C's non-author approved only the bounded top-level loading delta, with independent Node20.20.2 Web 437/437, typecheck, extra lifecycle 13/13, actual final import/preload graphs, and actual-main 31/31 plus first-document one-consent boot 1→2 stable 2/2. Native observations are a transcription of reviewer-operated Chrome observations, not exported raw JSON and not root's execution. This custody check reran no test or browser matrix.

The separately reported JSON refresh-tag offline P2 remains assigned to C. D does not consume a later floating C revision or repair the reader. Default Dish 84,090 gzip bytes, configured-HTTP Ingredient 60,414 and Dish 85,682 remain above the 60,000 threshold on this fixed input. All other route totals, no-SW totals, precache totals and measurement semantics are in the original C reports; neither this merge nor the contract claims new performance results.

Next action: the D production author follows the frozen contract's actual RED→GREEN checks, rebuilds complete final closures in both environments, preserves all precached JS and original editor protections, and obtains independent review at the resulting fixed SHA. Root maintains custody and can operate the author's/reviewer's explicitly identified local browser fixture. The original non-author remains separate from production authorship.

Prior 948026 bounded approval and its 56 original artifacts remain immutable, including the original 4/5 cancellation probe and undetermined delay cause. No new whole-feature, offline, Q, real Worker L2, remote-write or deployment approval is implied. Q remains idle.

## Subsequently released reader and final composition input

Dispatch released C implementation `3dd9db9d07ec8fdc67990ecbb77a0578f2dc2338` through full history `587d24bfee5cb92715db42a3a2d1014f61a543d2`. Root read the original fixed reader REVIEW and contract in full and inspected its 25-line production delta. The same read-only custody agent verified **25/25** review originals (940,936 bytes) and **28/28** author evidence originals (1,068,623 bytes), against both Git manifests and original local files, with no duplicate/missing/mismatched entry.

| Reader artifact | SHA256 |
|---|---|
| Review CUSTODY.json, 6,291 bytes | `4fb69229519d9ba06b2c28f06e0922d0fe954e143d28f292601b411b6fec020f` |
| Original `/private/tmp/reader-offline-c1-review-3dd9db9-rmoz_4r6/REVIEW.md` | `9595f26bef2f16b75b1849b0c2497432ab565ebdd0476af67c0bbb151cddb792` |
| Author 62908cf2593fab775e9426a4f92c8992e063d58e CUSTODY.json, 5,527 bytes | `8832761a5ee796e6d9c75de52798ededaa2879c7c8c73eddd2f194e96eea42d8` |

The reader's 587d24b, 3dd9 and 62908cf packages trees are identical (`94e6ac1b7770ee868f7ebbb40b72b21a39b4eb5b`). Its original non-author approved bounded same-revision team-projection recovery: independent Node20 Web 450/450, typecheck and additional 19/19, actual first claim and external B takeover staying in the same document while offline, plus a new offline B document. The initial missing-core setup errors are retained. Main/PWA/owner, D pages, core/Worker/config and dependencies did not change; no new native image/R3/full D/L2 approval is inferred. This closes the two original team-projection offline counterexamples, not analogous legacy or QR limitations.

D author checkpoint `1d0cd35a2037e486492410fa21d2165c61883ac7` fixes the six D page/helper files and associated target tests/evidence, with author Node20 **95/95** and typecheck. This remains an author result; intermediate 11/11 budgets are not final. Complete local composition `4278f1a80966c23be70ffc05001aa31920b5b4d1` has parents **1d0cd35 + 587d24b**, with no conflict and only `published.ts`/`published-offline.test.mjs` changing under packages relative to D's checkpoint. Full approved C history and original authors are preserved.

Next action is final Node20 Web/type and default/HTTP all-route budget/cache verification on 4278, plus actual emitted-module browser failure/retention and already-loaded action retry. Root's preview work is author evidence; the original non-author will review the resulting precise implementation/evidence subject. The native module recovery clarification was accepted by dispatch and frozen at `5414cf1d16e29ac55a2efbaa8a5f23f313c46267`; this document does not promise successful same-URL native retry.
