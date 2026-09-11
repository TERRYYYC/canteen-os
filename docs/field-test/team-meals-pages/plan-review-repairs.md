---
feature_ids: []
topics: [team-meals, plan, review]
doc_kind: verification
created: 2026-09-11
---
# Plan checkpoint review repair

Independent iterative review of 11910cde by /root/plan_review identified R1–R5 (all P2). Evidence and mechanisms in the review were verified against the current page. They agree with preserving edits, accurate source versions and actionable failures. No product scope changes.

| Finding | Mechanism and repair | Evidence |
|---|---|---|
| R1 failed B retry reads A | Retry uses requested identity before choosing catalog-only read | Browser B reads 2, rows 1; adapter identity probe |
| R2 late import overwrites typing | Apply import immediately after Source open, before catalog await | Red adapter 200 vs2; green import2 then typing9 retained; browser9 |
| R3 adopted B uses catalog A | Cache/request by source revision and invalidate visible catalog on every source change | Red returned A; green returned B; browser New dish B and catalog GET B |
| R4 same-byte correction leaves error | Repaint after validation state clears even without editor emit | Independent red browser; repair browser Save enabled/error absent at13 |
| R5 language during pending catalog | Known document joins original exact revision request; result cache survives view fence | Red null; green one request and returned A; browser enabled picker/add |

Failure-mode sweep: R1/R3/R5 all violate separation between document identity, source revision and view lifetime. Scanned load, retry, conflict adoption/keep, save acknowledgement, unknown reconciliation and language return. A single source-key binding now controls catalog visibility and a promise cache joins in-flight exact-revision reads. Import is consumed before the next async boundary. No added fallback data paths. The shared fallback script is absent in this repository; source review shows no new automatic fallback chain.

`red-plan-review.txt` retains author red adapter failures. R1 and R4 root automated adapter test cannot model their DOM-only defect, so independent browser red is the evidence. `plan-review-green-browser.json` records all five actual repaired-page probes, using the independent fixture with only its language await adjusted to release the deliberately held request concurrently. Source API, transport and editor are production code; network responses are explicit mocks.

The original main-flow assertion counted every GET. Revision rebinding correctly adds a catalog GET after recovery, so it initially reported `FAIL — two recovery reads`. `plan-review-main-flow-ledger.json` proves exactly two plan Source reads, one catalog GET at the recovered revision, and no duplicate POST. Updated assertion counts plan Source reads specifically; no production behavior was changed for this assertion.

Conflict presentation now lists date/meal/dish/count with action consequences; full JSON is collapsed. Source labels show short revision with full value expandable. Prior mislabeled screenshot is preserved under accurate `plan-initial-zh-mobile-harness.png`; separate verified UK flow/unknown evidence replaces that claim.

No remote writes, deployment, production state change or D1/T01–T09 completion claim. Reviewer recheck required for exact repaired commit.
