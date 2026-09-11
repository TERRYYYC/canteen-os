---
feature_ids: []
topics: [team-meals, q-ui-t08-01, independent-review]
doc_kind: review
created: 2026-09-11
---

# Q-UI-T08-01 independent review — APPROVE

| Field | Fixed value |
|---|---|
| reviewerIdentity | Codex `/root/plan_review`, original nonauthor reviewer |
| authorIdentity | `page_inventory`; root owns intake and author browser operation |
| reviewSource / engagement | `local_cat` / `iterative` |
| reviewSubjectRef | `task:01a08db7-43f3-7952-adb5-75106389e557/Q-UI-T08-01` |
| reviewTargetId | `q-ui-t08-01-5049f0a` |
| reviewedHeadSha | `5049f0a47c76c4149a91a288a6a9b6edf279b1ea` |
| baseProductionSha | `842b778bd352c0dba8921584ce142d94665e5ca2` |
| packagesTree | `b0407a1b761561f03aa07d66a5c6b003687458c8` |
| acceptedSourceRef | `docs/field-test/team-meals-pages/Q-UI-T08-01-contract.md` |
| acceptedRevision | `71fd5663ffddc2161ad2c48f1987e9ea2957147a` |
| authorEvidenceCommit | `e6aef33e8f9e910c6f5d17b5a4e0b85030194a44` |
| browserEvidenceCommit | `eb42e575b8cce463ff34653d9382e7b58eea60d5` |
| verdict / localReviewVerdict | **APPROVE / approved** |
| Open findings in this scope | **None: no open P1/P2** |

The fixed Purchase export repair satisfies this bounded contract. This approves the synchronous formatter and its Purchase consumer at the exact reviewed SHA, including the affected build graph. It does not close Q T01–T09, the separately raised Import defect, live-service/L2 acceptance, or any broader application acceptance. It neither reopens nor rewrites the earlier APP-BUNDLE-D1 approval.

## Source, ownership and risk

I read the accepted repair contract and the original STANDARD-DATA-AND-ACCEPTANCE T02/T03/T08/T09 and SCREEN-CONTRACTS S09. Their intake hashes are `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352` and `e05d43554181c4ebed52269d7f20cafd8b35d4d687e56c8ae52b127684ce3652`. I also inspected Q's fixed original finding/clipboard and the producer, core collection/estimate types, existing ownership callbacks and final tests. The accepted contract is byte-identical to its fixed revision in this archive.

The package delta is exactly three production files (`purchase-list.ts`, `purchase.ts`, new `shopping-copy.ts`) and three D test files. The former shared copy function is removed; only Purchase imports the new synchronous helper and passes `form.basis.projection` plus that same basis's estimate. Save, tickets, session, auth, async/lifecycle callbacks, core calculation, Worker, C/shared API, main/PWA and configuration are unchanged. The architecture remains RC-D; this is a presentation split with no new owner or state mechanism.

Risk assessment: behavior and data concern complete, correctly bound user-visible export; security concerns inherited auth/clipboard ownership, with no new transport or async boundary; contract concerns same-revision data and the strict 60,000-byte entry limit; irreversible risk is low because verification is local with explicit fake API/repository inputs. I matched the review to those surfaces rather than adding unrelated acceptance gates.

## Findings and failure-mode sweep

No actionable P1/P2 found. The original Q-UI-T08-01 defect is closed within D's repair scope:

- Current items are grouped as check/buy/available/bought. IDs distinguish same localized names and remain usable when unresolved. The current list title warns readers to check save status. Removed entries and prior bought decisions are not promoted into this export.
- Every supplied source occurrence is retained, including zero-based row/component indexes represented as human indexes, duplicate occurrences, seasoning, original quantities and known/missing planned or recipe servings. Unknown quantity and to-taste remain separate. There is no new quantity or total calculation.
- Collection issues are emitted independently of candidates, including empty results, missing references and recipes without recorded components. All supplied path fields survive. Estimate reasons remain associated with their ingredient and with their supplied source; global reasons are not assigned an invented source.
- Names and quantities come from the selected list's bound projection/estimate. Newer un-applied source reads do not replace the copied A data. Supplied complete reference lines, including zero price or no-purchase-needed empty lines, do not alter manual decisions or imply a complete budget.
- The existing clipboard success/fallback capture and route/language invalidation are unchanged. The new rich text is identical across successful and failed clipboard paths in each language. No new write is introduced.

I compared the test delta: original shopping owner/save assertions remain; existing details/copy calls merely adopt the new import/signature. The author's initial 2/15 RED and 11/15 intermediate result remain recorded. The latter four failures came from `/0 g/` matching `300 g`; the final numeric-token boundary removes that false match without changing product quantities or lowering a business threshold.

## Independent execution

All execution used a Git archive of 5049f0a under `/private/tmp/canteen-q-t08-review-5049f0a`. Afterward, **227/227 tracked package files** still matched the exact Git source. Actual runtime was **Node v20.20.2**, not an inferred CI version.

| Check | Result |
|---|---|
| Entire original Web test set | **509/509**, no failures, skips or cancellations |
| Web type check; core compilation | **exit 0** |
| Independent real-core/formatter probes | **6/6** |
| Default + HTTP, 11 entries each, SW/no-SW | **44/44 ≤ 60,000 gzip bytes** |
| Actual Vite preload dependency maps | **12 per configuration**, graph checks pass |
| Application JS precache | **24/24 per configuration**, 52 precache entries each |
| Production/package whitespace check | **exit 0** |

The six independent probes use deep-frozen real core outputs: three languages with two plans whose row/component indexes collide, four identical raw-quantity occurrences that must remain distinct, a rebase with removed/prior-bought entries and new B names, an unresolved prototype-named ID, and a complete supplied reference whose known price is zero. The first attempted probe had a reviewer syntax error before execution; its original source/log and the corrected 6/6 are both retained. The integrity utility's initial manifest-shape assumption and successful correction are likewise retained; neither was a product finding.

Budgets were rebuilt from the unmodified original Vite configuration. The independent reader checks emitted static and dynamic imports, Vite preload maps, the null-facade Prep module, immediate Workbox loading, and actual SW precache entries. The formatter's emitted module is in Purchase and absent from Plan's static closure.

| Entry | Default SW / no-SW gzip bytes | HTTP SW / no-SW gzip bytes |
|---|---:|---:|
| Prep | 32,197 / 29,854 | 32,198 / 29,855 |
| Menu | 38,327 / 35,984 | 38,328 / 35,985 |
| Purchase | 54,444 / 52,101 | 54,467 / 52,124 |
| QR | 20,797 / 18,454 | 20,796 / 18,453 |
| Locked admin | 20,327 / 17,984 | 20,330 / 17,987 |
| Home | 55,234 / 52,891 | 55,294 / 52,951 |
| Plan | 59,540 / 57,197 | **59,568 / 57,225** |
| Import | 50,843 / 48,500 | 50,866 / 48,523 |
| Ingredient | 50,142 / 47,799 | 50,170 / 47,827 |
| Dish | 57,965 / 55,622 | 57,987 / 55,644 |
| Publish | 56,303 / 53,960 | 56,362 / 54,019 |

Tightest margin is HTTP Plan, **432 bytes**. Full application JS remains 171,122 / 171,191 gzip bytes for default / HTTP respectively; those complete precache totals are not presented as initial-entry totals. SW/runtime are separately reported. The graph tool requires the full reviewed SHA as an explicit argument; both report headers, runtime, source integrity and emitted hash record identify 5049f0a. No prior hardcoded target metadata is reused.

## Actual browser evidence consumed independently

Root operated the new fixed-source IAB journey; I did not operate a second browser. I read the complete README, controls, server, raw native/fallback text, visible state, request/response ledger, source integrity and setup failures. I verified **33/33 original browser artifacts** against their manifest, their original files and Git eb42e57, and **24/24 author artifacts** against their manifest and Git e6aef33. Both evidence commits have zero package diff from 5049f0a. All **57 browser Web source files** match Git 5049f0a and the actual browser build's copied source.

The raw evidence traverses actual main → C client → local HTTP → actual Worker → fixed Q FakeRepo. Successful clipboard writes/readbacks are native zh/en/uk; rejected and held clipboard promises are explicit boundary controls. Recomputing the stored observation checks yielded the exact original **32/32** receipt. It proves six supplied source occurrences, four current groups and distinct IDs, concrete missing information, unknown/to-taste separation, and byte-identical fallback per language. The actual A clipboard stays byte-identical after B is read but not applied. Late old-language and detached-route rejections leave the new interface untouched.

The ledger contains exactly two Worker POSTs: initial all-check creation with `If-None-Match: *`, then explicit manual judgments with `If-Match` equal to the first ACK's actual `blobSha` (`799461a5199eaade0fcddeeb2e182e031cea9304`). Copies, language changes, latest reads and late clipboard settlements add no Worker write. The native run selects all original fixture meals; its `name-only`/no-components issue belongs to dinner. Q's original native failure selected lunch only, so these are kept as distinct observed scopes. Missing-API and synchronous-throw paths were exercised in the original Node renderer suite, not misrepresented as native clipboard cases.

No browser screenshots were necessary for this text-export delta: exact text, visible DOM and native clipboard readback address the changed behavior. No live Worker, publication/rollback, new native SW/offline matrix or complete Q acceptance was performed or inferred.

## Durable evidence and return route

`COMMANDS.md` maps checks to raw output. `reviewer-integrity.json` records source, accepted contract and original custody hashes. `reviewer-budget-{default,http}.json`, `reviewer-emitted-sha256.json` and both actual build graphs preserve attribution. `reviewer-browser-recheck.json` preserves the independently recomputed receipt. The original failed logs remain in this package.

`reviewer-artifact-manifest.json` enumerates the delivery artifacts and their SHA256 hashes; the manifest excludes itself to avoid recursive hashing. The original report and manifest hashes are returned through the same root collaboration carrier. This is an independent local approval for **5049f0a47c76c4149a91a288a6a9b6edf279b1ea**, not a claim of remote approval, deployment or broader task completion.

Signed: **Codex `/root/plan_review` — original nonauthor reviewer**, 2026-09-11.
