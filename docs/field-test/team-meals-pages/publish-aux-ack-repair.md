---
feature_ids: [team-meals]
topics: [publish, rollback, review-repair]
doc_kind: review-response
created: 2026-09-11
---

What: PUB-AUX-R1 adds an explicit string check before validating a rollback commit's 40-character SHA. An array containing a SHA cannot be used as definite evidence to settle the original auxiliary write.

Why: The non-author review of 3eac746 reproduced JavaScript regex coercion through both actual HttpAdminApi/current auth and an actually available late original ACK. The latter should keep the original anonymous operation unknown. Root read the complete `/private/tmp/canteen-publish-aux-review-3eac746/REVIEW.md` before accepting the finding.

Tradeoff: Only the proof field's runtime type is tightened. Exact-target matching, recognized rejection, strict known-run completion and current/old UI boundaries are unchanged. No resend or cross-auth recovery is added.

Evidence: Two new current/old ACK regressions fail before the fix (`red-publish-aux-ack-type.txt`: 22 pass / 2 fail), then 24/24 pass. The current case also uses the actual HttpAdminApi response decoder. The preserved original independent browser fixture was copied into the D test directory with provenance, rebuilt against the fixed source and executed through IAB in both modes; both report unknown with no rollback-success claim. JSON files `green-publish-aux-ack-current.json` and `green-publish-aux-ack-late.json` record source hash a6e847b9b356ab62eea3a0ad1b32efc175b3f2119142a7d4a1a760f6bca93697. Installed TypeScript passes. The complete current web composition passes 345/345; this includes concurrent frozen page slices but does not independently approve them or certify real backend/PWA integration.

Open Questions: The original reviewer must decide whether this exact fix closes PUB-AUX-R1. C main/C1 auth-seal and full application acceptance remain separate.

Next Action: Focused original-reviewer recheck of the repaired proof paths and original eight independent cases. No other production file belongs to this repair.
