---
feature_ids: [team-meals]
topics: [publish, rollback, reload-safety]
doc_kind: handoff
created: 2026-09-11
---

What: The real Publish owner registers once at normal entry using the original TeamMealsApi boundary. Each changes/progress read carries a read ticket, and each dispatch/rollback carries one original write ticket. Private UI state still closes immediately on auth change; C's existing registry retains only the original unresolved operation metadata. No other auth registry or shared C edits were added.

Why: The previous auth handler cleared the only pending-operation state. A late old response could no longer protect updates. Each original closure now settles its own ticket before considering whether it may update the current UI. Known same-run `runCompleted === true` ends a publish; a validated exact-target rollback ACK or known rejection ends the corresponding rollback. Acceptance alone, absent run IDs, malformed responses, transport ambiguity and `session_changed` keep their original write unknown. No cross-auth progress request or latest-run claim was added.

Tradeoff: A raw provider reads only its original owner metadata, including actual read count; it never probes/changes auth, polls or disposes. Original read completion runs even after UI replacement. The captured PageCtx finishes initialization in finally. Only C can retire the old registry owner once all its original tickets have settled. The current UI metadata does not reveal the old private run or target. Existing terminal messages and read-only verification behavior remain.

Evidence: Four new registry cases RED before implementation, then 22/22 Node cases GREEN including the existing 36 status/conclusion permutations. Installed TypeScript passes. Actual IAB `publish-aux-browser` gives 11/11: initial read/old ctx, strict terminal, two old pending runs ending separately, real HttpAdminApi hidden rollback ACK staying unknown and no latest-run requests. The intermediate browser 4/5 failure was an author fixture typo (`canceled` versus existing `Build was cancelled`); only the assertion was corrected. Actual green fixture hash is recorded in the JSON. One subsequent production edit changes only the introductory comment to reflect the already-implemented strict terminal contract; rebuilding the fixture therefore gives a different source hash with identical executable code.

Open Questions: Application main injection and C1 auth-seal marker remain separately owned by C. No real publish, rollback, remote write or deployment was exercised. This is author evidence, not approval.

Next Action: Independently review this fixed Publish delta and original terminal/owner browser fixtures. Especially test genuinely available late proof versus proof hidden by HttpAdminApi, multiple old owners, malformed terminal and rollback responses, and original initialization coverage. Do not include unrelated concurrent Dish changes.
