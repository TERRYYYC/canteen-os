---
feature_ids: [team-meals]
topics: [publish, rollback, independent-review, review-repair]
doc_kind: review
created: 2026-09-11
---
# Focused re-review — PUB-AUX-R1

Verdict: **APPROVED for the bounded Publish auxiliary slice; PUB-AUX-R1 is closed. No remaining findings in this scope.**

Reviewer: `/root/page_inventory`; repair author: `/root`. This is the original non-author reviewer rechecking the reported malformed rollback ACK proof. It is not an approval of intervening Dish, Home, Plan, Import, Purchase or shared-C changes, and does not certify application-wide completion.

## Exact target and reviewed change

- Fixed repair commit: `76b498a21f28db522f88effec184140445ac96f0`.
- Reviewed archive: `/private/tmp/canteen-publish-aux-review-76b498a`, exported with `git archive` of that exact commit.
- Original reviewed Publish target: `3eac7469a033f658893654802ad1cc21670d88db`.
- Original report: `/private/tmp/canteen-publish-aux-review-3eac746/REVIEW.md`.
- Source SHA-256: `a6e847b9b356ab62eea3a0ad1b32efc175b3f2119142a7d4a1a760f6bca93697`.
- Accepted repair handoff: `docs/field-test/team-meals-pages/publish-aux-ack-repair.md` at the repaired commit, SHA-256 `2dafc8744e55abd2718763a4f17751d7cfe912762e0976e49de87175bf7ec6ad`.

The reviewed production diff from both this repair's direct parent and the original `3eac7469` Publish file is the same single line at `packages/web/src/pages/admin/publish.ts:583`: require `typeof result.commit === "string"` before the existing SHA, exact-target and changed-files checks. The line remains before `settleWrite`, so invalid proof follows the existing unknown path and cannot settle the original ticket. No unrelated production delta was reviewed or approved.

## Finding disposition

**PUB-AUX-R1 — fixed.** An array containing a valid SHA now fails runtime field validation.

- Current auth through the real `HttpAdminApi`: result remains `unknown`, original dirty operation remains registered, Publish stays disabled, and no rollback-success message appears.
- Actually available original ACK arriving after auth change: the original anonymous operation remains `unknown`; the new owner is independent and its UI shows no old rollback success. The new identity can perform its own actions, while the shared whole-page-update aggregate remains blocked by the original unknown ticket.
- A valid exact old ACK still retires only that original operation. This prevents fixing the malformed case by permanently blocking valid completion.

## Independent verification

The original independent test and browser fixtures were copied byte-for-byte from the original review archive; `cmp` confirmed both unchanged. Only the production source/build dependencies came from the new fixed archive. The generated browser module was rebuilt locally from the final source digest above, not trusted from author screenshots or prebuilt evidence.

- Original independent Node cases: **8/8 PASS**, previously 6/8; both PUB-AUX-R1 reproductions now pass.
- Fixed author Publish suite: **24/24 PASS**; combined targeted run **32/32 PASS**, including its 36 status/conclusion permutations (`focused-node.log`).
- Archive web TypeScript check: PASS.
- Actual Chrome / local fixed archive port 4218: both original independent browser reproductions **PASS** (`independent-browser-current.json`, `independent-browser-late.json`). Both JSON results report source hash `a6e847…` and actual aggregate `unknown`.
- Screenshots: `independent-browser-current.png`, `independent-browser-late.png`.
- Browser error console: empty.

The unchanged independent cases also rechecked exact available old ACK, old definite rejection versus current pending publish, malformed/mismatched/legacy run evidence, multiple old owners completing in reverse order, immediate read registration and original coverage finally, and readonly failure settlement. No real publish, rollback, production read, deployment or remote write was performed.

The author reports a whole-worktree 345/345 run. This focused re-review did not use that as approval evidence for other page slices and did not rerun unrelated tests.

## Return route

`localReviewVerdict: approved`
`reviewedHeadSha: 76b498a21f28db522f88effec184140445ac96f0`
`reviewSubjectRef: publish-aux-slice:3eac7469a033f658893654802ad1cc21670d88db+PUB-AUX-R1@76b498a21f28db522f88effec184140445ac96f0`
`acceptedSourceRef: docs/field-test/team-meals-pages/publish-aux-ack-repair.md@76b498a21f28db522f88effec184140445ac96f0`
`acceptedRevision: 2dafc8744e55abd2718763a4f17751d7cfe912762e0976e49de87175bf7ec6ad`

Return to `/root`, the author and direct review carrier. The original single finding is closed for this exact repaired Publish source. This verdict does not approve an entire ancestor range or permit unrelated pages to inherit this review. No root files were modified.
