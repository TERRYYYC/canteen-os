---
feature_ids: []
topics: [team-meals, q-ui-t01-02, independent-review]
doc_kind: independent-review
created: 2026-09-11
reviewerIdentity: "Codex /root/plan_review — original nonauthor"
reviewSource: local_cat
reviewedHeadSha: 6bb1ce916c9b4117b6e03db23a78a5d0b9724a10
reviewSubjectRef: task:01a08db7-43f3-7952-adb5-75106389e557/Q-UI-T01-02
acceptedSourceRef: docs/field-test/team-meals-pages/Q-UI-T01-02-contract.md
acceptedRevision: 85be50155723114256d8e597160e7db7a8c2995a
reviewTargetId: q-ui-t01-02-6bb1ce9
engagement: iterative
verdict: APPROVE
---

# Independent review — Q-UI-T01-02

**APPROVE the bounded Plan/import repair at `6bb1ce916c9b4117b6e03db23a78a5d0b9724a10`. No open P1/P2 findings in this delta or its affected combinations.** Import now merges into the original current C1 draft, preserving unsaved counts and row edits, invalid input associated with its original row, and the original pending/unknown/conflict save operation. This is local independent approval for Q-UI-T01-02, not Q's acceptance decision or whole-application/L2 approval.

Reviewer is Codex `/root/plan_review`, the original nonauthor; production author is `page_inventory`. This report returns through the original local collaboration carrier to `/root`. No production, author test, shared C/API/core/Worker/configuration or Q file was edited by the reviewer. All execution was in `/private/tmp/canteen-q-t01-review-6bb1ce9`, extracted from the exact target. Existing dependencies were reused read-only. The root operator supplied actual browser recordings; I independently read, verified and recomputed them.

## Fixed source and scope

Accepted contract is `docs/field-test/team-meals-pages/Q-UI-T01-02-contract.md` at `85be50155723114256d8e597160e7db7a8c2995a`, SHA256 `6dd6585bcd5634c1d879bd5371c13ce4c5e7d8da6c73f030d9da52a7d2e4cef3`. Original T01/T07 requirements and S08 were read, including STANDARD-DATA-AND-ACCEPTANCE SHA256 `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352` and SCREEN-CONTRACTS SHA256 `e05d43554181c4ebed52269d7f20cafd8b35d4d687e56c8ae52b127684ce3652`.

Packages tree is `38957ad074a6b7d102e730023613c9a5bb153ed7`. Only four D production files change: `plan.ts`, `plan-form.ts`, `import.ts`, and new `plan-import.ts`; one new D composition test accompanies them. The earlier Purchase copy approval remains separate. Author final evidence `af115810c2097d51e021f1437ef7580eff236d20` and native evidence `fb00e8292bc5e531d1e7c3432516bdb6b7a4ecf7` have zero packages differences from 6bb. Post-execution integrity verifies all 229 tracked package files against Git; the reviewer-only six-case test is additional untracked test material.

Risk review focused on current draft truth and merge ordering, same API/auth/document ownership, synchronous subscriber reentrancy, original operation/condition retention, rejected-edit rollback and route budgets. There is no irreversible action in this local fake-API review.

## Mechanism and failure-mode assessment

The new connection stores callbacks in a WeakMap keyed by API, with captured auth and mode checks. It does not create another JSON draft, save owner or asynchronous transfer. A known Plan is resumed with its original C `open`, then the merge reads that record's actual current draft and calls the original C `edit`. C still owns the save body, conditional header, pending metadata and acknowledged baseline. Known but rejected/retired targets retain Import raw; they cannot fall through to a saved-source reload. Only absent targets take the existing guarded first-load GET/store path, with a second connection check after its await.

The temporary row mapping preserves the original first-match, duplicate and stable-sort semantics. Omitted imported counts retain a matching row's current truth and raw override. An explicit count or explicit clear replaces only the first matched row's override. Invalid values on other rows follow their original row through sorting. Remapping runs before C emits and restores its previous map when edit is refused. Add selections and range remain page-owned. No transient row identifier enters Plan JSON.

I inspected the C open/edit/late-ACK call chain and all 30 new author cases. Synchronous language, route, raw-input or owner changes cannot report stale success or navigate the wrong page. An accepted import clears its captured old store record even if a synchronous subscriber changes the visible page, then rechecks the current UI context. Pending, unknown and conflict imports are local edits: they neither repost nor replace the original operation. Late ACK recognizes the later draft generation and leaves it dirty.

## Independent execution

All Node executions used actual **v20.20.2** at `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node`; `reviewer-runtime.json` records executable, cwd and version.

| Verification | Observed result |
|---|---|
| Exact original full Web suite, before adding reviewer probes | **539/539**, 0 failed/cancelled/skipped |
| Web TypeScript and core build | exit 0 |
| Six additional reviewer real-renderer/C cases | **6/6**, 0 failed/cancelled/skipped |
| Default + HTTP original-config production builds | exit 0 |
| Eleven initial routes × two configs × normal-SW/no-SW | **44/44 ≤ 60000 gzip bytes** |
| Emitted preload and precache | 12 preload groups per config; all 24 app JS precached; 52 entries per config |
| Git/receipt custody | author 33/33; native green 26/26; native red 14/14; browser source 58/58; author source 5/5 |

The six reviewer cases cover a known new document after explicit 404 and its original If-None-Match save; an old Catalog request completing after current editing/import; both repeated matching-import orders with duplicate rows and unrelated invalid raw; and original-save unknown recovery against explicit modeled source presence/absence. They use real Plan/Import renderers and C API/session/store with the unchanged composition harness. The test-build getter exposes the existing C session; it does not replace C methods. Unknown source truth is deliberately modeled in those tests, not represented as a real backend rollback.

The full 539 run includes the original 56 Plan/import target cases and the 30 new author cases, as well as prior ACK/unload/shopping checks. No existing business assertion was weakened. Commands, raw logs, reviewer test and runtime are retained alongside this report.

## Actual browser evidence independently consumed

I read the complete native README, fixture/server/controls and capture/verification scripts, raw DOM observations and all seven request/response records. Root operated IAB90 against exact 6bb main → C client/session → HTTP → real Worker handler → fixed Q FakeRepo `6276f1beacd9bb61c756d1a3974b180f6cbc74ab`. Bootstrap supplies a fixed date/public test token, removes external fonts, and adds visible local response-hold controls. It does not replace business renderers or C state. All 58 captured Web sources match Git 6bb.

The same saved-8 → unsaved-11 → unrelated import predicate that failed in the preserved earlier native RED now passes. The returned Plan retains Day range and 11; the added lunch keeps an omitted count, and original omitted and recorded-2 counts remain. Actual input 13.7 remains invalid on the original row after index 0→1 sorting. A matching explicit 7 supersedes that raw override. During a held real save response, a later imported sixth row appears while saving; releasing the old ACK leaves the sixth row and dirty state.

All **15/15 captured predicates were recomputed identically** into a new reviewer receipt without modifying the original. They are focused observations of this journey, not fifteen independent E2E runs. Additional ledger checks establish exactly seven requests, one Source GET and two explicit Save POSTs. The first write's If-Match equals the original Source blob `d97b53d3fca48fb320a9081c9cdab07c2e7b0a96`; the second equals the first ACK blob `7d562d54526a05b8ebb53d834832fa09270a967a`. Both omit If-None-Match. The held request contains exactly its original five rows and excludes the subsequent sixth row. Four imports cause no additional Worker write or known-document Source reload.

The native run is Chinese and uses a local FakeRepo. Unknown/conflict/auth/language/fallback variants are Node composition evidence, not additional native claims. No live Worker, Q-environment mutation, publish, rollback or deployment occurred.

## Final budget and dependency evidence

These are independently rebuilt and measured route execution closures, including Vite preloads and immediate Workbox; Prep's null facade is resolved by emitted module membership. Instrumented browser output is not used for budgets.

| Initial route | Default SW / no-SW | HTTP SW / no-SW |
|---|---:|---:|
| Prep | 32199 / 29856 | 32201 / 29858 |
| Menu | 38328 / 35985 | 38331 / 35988 |
| Purchase | 54453 / 52110 | 54475 / 52132 |
| QR | 20800 / 18457 | 20801 / 18458 |
| Locked admin | 20328 / 17985 | 20327 / 17984 |
| Home | 55239 / 52896 | 55296 / 52953 |
| Plan | 59864 / 57521 | **59887 / 57544** |
| Import | 51323 / 48980 | 51345 / 49002 |
| Ingredient | 50157 / 47814 | 50176 / 47833 |
| Dish | 57975 / 55632 | 57994 / 55651 |
| Publish | 56308 / 53965 | 56363 / 54020 |

HTTP Plan has **113 bytes remaining**; no threshold or precache was relaxed. All route byte results agree with the author. App-JS gzip/raw totals are 171813/436436 (default) and 171884/436538 (HTTP). Reviewer-generated SW plus runtime totals are separately recorded as 9515 and 9517 gzip bytes; SW data revisions are build artifacts, so author/reviewer SW byte identity is not asserted.

I compared the approved 5049 fixed build's dependency graph and actual parser bytes. Plan and Import static closures add only the callback helper. Existing `parse-plan-text-DBZQVSv5.js` is unchanged in both configurations, SHA256 `3ec90be07feaf1b63802d229cdbac8ba78820fb6791ef81e72355d41c84a5c98`. It was already present because Plan consumes date/week helpers. The contract forbids newly introducing the reverse page/parser dependency; it does not require removing this approved baseline dependency. New helper `plan-import-RSLHW7vM.js` does not pull the other page renderer into either entry. All 52 emitted JS files across the two reviewer builds still match their recorded hashes.

## Evidence limitations and preservation

Author setup RED (incorrect expected clean instead of saved-but-unpublished), genuine product REDs, the initial overbroad parser assertion and corrected green logs are retained byte-for-byte. Earlier native RED remains separate from this green. Reviewer setup initially failed because system Python lacked `extractall(filter=...)`, then the premature core command could not find the unextracted archive. The preserved setup note/core log precede successful system-tar extraction and core rerun. The first reviewer dependency comparator failed to normalize the old/new index.html archive prefixes; its original output and the corrected path-only normalizer are preserved. These tooling failures neither weaken product assertions nor count as product findings.

`reviewer-custody.json` ties every consumed original to its Git blob and SHA256. `reviewer-final-check.json` records 18 successful receipt/artifact consistency checks, including current target metadata. `reviewer-artifact-manifest.json` lists the report, commands, raw logs, probes, fixed source inputs, consumed evidence and emitted measurement artifacts with bytes/hashes. Original manifests are included unchanged; the final manifest excludes itself.

This approval closes this bounded D repair against the accepted 85be contract. Q retains its independent acceptance role. Existing copy/APP-BUNDLE/native-SW approvals are not reopened, and no whole-application, offline/native matrix, security certification or L2 claim is added here.
