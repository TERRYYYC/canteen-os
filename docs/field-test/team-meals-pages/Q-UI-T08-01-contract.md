---
feature_ids: []
topics: [team-meals, purchase, export, q-ui-t08-01]
doc_kind: repair-contract
created: 2026-09-11
---
# Q-UI-T08-01 — Copy the selected shopping list with sources and missing information

Accepted input: dispatch task `01a08d6d-be28-7142-ad8e-3f964658d3f4` formally assigned this bounded original-requirement defect to RC-D. Starting HEAD is `842b778bd352c0dba8921584ce142d94665e5ca2`. APP-BUNDLE-D1 and its signed historical approvals remain unchanged; this contract concerns the subsequent Q acceptance defect only.

## Original requirements and observed failure

The original files were read from `../canteen-os-design/docs/design/reference-v3/` and hashed at intake:

- `STANDARD-DATA-AND-ACCEPTANCE.md`, SHA256 `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352`, T08 line 61: “待确认和缺项进入导出”. T02 requires every recorded ingredient, every source and distinct same-name IDs. T03 preserves unresolved references and incomplete recipes. T09 forbids invented unknown quantities and presenting partial references as total demand.
- `SCREEN-CONTRACTS.md`, SHA256 `e05d43554181c4ebed52269d7f20cafd8b35d4d687e56c8ae52b127684ce3652`, S09 line 78: “内容包含范围、来源版本、待买/待确认分组与缺项提示”; “不丢适量调料、来源或不完整标识”. Lines 71–77 require same-version information, distinct same-name IDs, complete source occurrence display and truthful estimation limits.

The captured Q clipboard lists names/decisions, version and scope plus a generic completeness sentence. Its matching visible DOM contains concrete unavailable estimates, to-taste seasoning, missing quantity, incomplete recipe and the two original tomato source occurrences (300 g and unknown). The exported two tomato entries cannot be distinguished by ID. `q-input-manifest.json` records byte-preserving copies; the Q script is explicitly provisional, not a reviewed final Q test. Q's browser journey used actual main → C → Worker → existing local FakeRepo; it is not live production evidence.

Root cause at starting HEAD: `shoppingCopy` accepts only projection ingredients and omits the existing collection, source occurrences and estimate. `copyPanel` already owns the selected list's bound `SavedTeamMealsView`; on-screen candidates consume that same basis's collection and estimate.

## Required behavior

1. Export only the selected current list, labeled as current page state, with list ID, exact bound source revision, dates, meals and plan references. Group current check/buy/available/bought decisions without promoting previous bought records or removed candidates.
2. Keep every current ingredient reference identifiable, including unresolved references, seasonings and same-name different IDs. Include every supplied source occurrence, its plan/date/meal/dish reference, original quantity and recorded or missing serving information. Unknown stays unknown; to-taste stays to-taste.
3. Include concrete collection issues even when they produce no candidate row. Preserve their available reference path. Include the supplied estimate's concrete reasons tied to ingredient and source when available. Source names must come from this bound projection, never a current catalog fallback.
4. Consume existing core-derived collection and estimate. No new business calculation, aggregate demand, price total, invented quantity or confirmed value. If existing complete reference lines are included, label them as references and retain incomplete-budget limits.
5. zh/en/uk must have the same semantics. Clipboard success and failed/unavailable clipboard textarea use exactly the same generated content. Preserve original owner/ticket/route/language invalidation and save semantics. No persistence or protocol changes.

## Ownership and implementation boundary

Original author: `page_inventory`. Original nonauthor reviewer: `plan_review`. RC-D root owns intake custody, actual browser evidence and dispatch handoff. Q continues its own local T01–T09 and does not repair product code.

Allowed production: `packages/web/src/pages/purchase-list.ts`, `purchase.ts` and the minimum D-owned presentation helper needed for this change. Allowed tests are D-prefixed `team-meals-pages*`; evidence is under D docs. Q E2E/fixtures, C/shared API/core/Worker/config/dependencies and production data are read-only. No remote push/PR/issue/comment, publish, deploy or L2. Dispatch is the sole authorized external message destination.

The shared purchase-list module feeds other pages. HTTP Plan currently measures 59,690 gzip bytes with service worker, only 310 below the 60,000 limit. A minimum D presentation split is allowed; avoid creating unnecessary asynchronous action boundaries. Cross-owner expansion requires evidence back to dispatch. No temporary module-identity rewriting, dropped precache, changed budgets or build configuration relaxation.

## Evidence and completion

- Original author adds a meaningful failing D regression against the old producer before changing production. Preserve original RED logs and later failures separately.
- Prove current decision grouping, exact bound version, all source occurrences, same-name ID distinction, to-taste versus unknown, concrete collection issues and source-bound estimate reasons in all three languages using real core output. Existing old ownership/save tests continue to pass.
- Run appropriate Node 20 target/full Web and type checks. Rebuild both actual configurations and record all 11 entry closures with SW and no-SW (44 combinations), preload/dependency reachability and complete precache; every measured closure remains at most 60,000 gzip bytes.
- RC-D actual browser evidence covers clipboard and failed textarea in zh/en/uk, with honest transport boundaries and exact code provenance. Any fixture-only clipboard interception is explicitly distinguished from native clipboard readback. Preserve route/language invalidation checks.
- Obtain original nonauthor review of the precise fixed SHA, read the full original report, verify all evidence against its Git archive, then hand the fix back to Q through dispatch. A D fix pass is not a claim that Q T01–T09 or L2 is complete.
