---
feature_ids: []
topics: [team-meals, worker, independent-review]
doc_kind: review-record
created: 2026-09-11
status: repaired-awaiting-independent-review
---

# B2 independent review record

Review-Subject-Ref: task:01a08d80-6619-70e1-b8b1-87c1804b8d17:B2

Accepted-Source-Ref: docs/specs/team-meals-contract.md

Accepted-Revision: ad1f427ae8d7ffc6841bfd2e51c279d2c90381d2

Engagement: local_cat / iterative. Author route is the current task; no external review or publication action is implied.

## First review

Reviewer: /root/b1_review (independent non-author); its bounded rollback audit was also read-only. Root authored shopping/formats, /root/b1_risk_audit authored rollback, and /root/b2_test_plan authored transition tests. None of those authors supplied the independent verdict.

Reviewed-Head: 7188e0dc8f084741e2e1dfb1d6f03af0c1bbdbef

Verdict: REQUEST_CHANGES. Four P2, no P1. Independent baseline checks passed Worker 237/237, typecheck, standalone-validator checks and committed diff whitespace; additional FakeRepo probes exposed the issues below. Green baseline tests did not override those findings.

| Finding | Reproduction / required correction |
|---|---|
| P2-1 duplicated reads exhaust the runtime budget | A normal nine-ingredient create/choose/reconcile/confirm flow performs 52 fetches on confirmation. A 50-fetch cap fails at call 51 with 502 and unchanged HEAD. Reuse successful immutable revision/tree/blob reads within the request; retain per-attempt H, ancestry, conditions and semantic checks. |
| P2-2 duplicate technique IDs accepted by rollback | Different entries sharing mix are collapsed by Set and written. Reject the duplicate ID with invalid_source, exact field pointer and zero writes. |
| P2-3 malformed candidate hides downgrade | A null dish candidate throws 422 before another current-v3 plan's target-v2 downgrade is checked. Defer candidate format errors until all explicit v3 protections are evaluated; a known downgrade is 409 first. Do not swallow network or permission failures. |
| P2-4 incomplete error locations | Invalid schema/ref errors report only the owner file. Return owner#JSON-pointer for the actual field, consistent with image errors, including required/additional properties. |

The reviewer explicitly excluded adding a pcs/yield rejection: the existing API contract is warning-only. Image inspection remains structural validation, not pixel decoding. No L2, production or external writes occurred.

## Repair evidence

P2-1 now caches only successfully obtained immutable tree/blob values per request; ancestor-validation sets are scoped to each H attempt. In the regression flow, fetch calls for create/buy/reconcile/confirmation-with-one-ref-retry are 21/23/25/38, counting the complete env.__fetch boundary per invocation. The capped tests include writes and retry calls, not merely FakeRepo helper counts. Separate assertions require two H reads and two ancestry comparisons on retry while reading an unchanged fixed tree once. Failed tree/blob reads are not cached.

The cap is based on the [current official Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/#subrequests), checked on 2026-09-11: Free permits 50 external subrequests per invocation. Redirect hops can add subrequests; the injected L1 boundary has no real redirects or runtime-hidden calls and is not deployment-capacity proof. This correction removes redundant reads; it does not promise arbitrary-size knowledge repositories fit that plan.

P2-2 through P2-4 have regression evidence in b2-review-rollback-red/green.txt: the targeted rollback suite is 75/75 green. Duplicate IDs point at the repeated /id; malformed candidate formats are delayed until every clear v3 deletion/downgrade is checked; upstream failures still propagate. Rollback opts into precise schema/ref/range/translation pointers, including required/additionalProperties and JSON Pointer escaping; ordinary read/API error paths remain unchanged.

The corrected exact revision requires the same independent review source before approval is recorded.
