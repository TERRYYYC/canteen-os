---
feature_ids: []
topics: [worker, publish, terminal-evidence, verification]
doc_kind: implementation-evidence
created: 2026-09-11
status: approved-local-implementation
---

# Publish run completion: bounded Worker follow-up

Base: approved B2 delivery a75250c36dfd2b280af2bb2d949c1e632af967e4. The B2 approval remains unchanged. This separate follow-up adds overall run evidence so a matching known run can be recognized as ended even when the legacy mapped progress shows failure, timeout or unmapped.

Accepted source: publish-terminal-contract.md at 5100ffa0d5acdd15c80d0606ac696f7272bb3434, fixed and sent to dispatch before implementation. The only runtime edit is six additive lines in endpoints/publish.ts: two PublishProgress type fields with comments and two return properties. runCompleted reuses the existing comparison with the same run.status; runConclusion reads the same run.conclusion, already normalized to null for missing values by the existing GitHub adapter. No step mapping, status precedence, slow behavior, POST response, claim algorithm or route changes.

## Verification

Runtime: actual Node v20.20.2 from /private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin. Commands place that bin first for npm's child processes. No dependency installation or package/lock modification.

- Before implementation, the old build passed; the 20 new tests failed because the response fields were absent. The red was an observable response failure, not a module or syntax failure.
- New terminal tests plus existing publish tests: 36/36 passed.
- Whole Worker suite: 279/279 passed.
- Worker typecheck, standalone-validator check and whitespace checks passed.

Recorded outputs: publish-terminal-red.txt, publish-terminal-green.txt, publish-terminal-worker-green.txt, publish-terminal-typecheck.txt and publish-terminal-validators.txt. Tests call the actual Worker fetch handler with FakeRepo; the new tests make only GET requests and assert zero repository writes/dispatches and unchanged HEAD. The full pre-existing suite includes mocked writes, never real GitHub or Worker actions.

The matrix includes an in-progress run with a failed step; completed success/failure/cancelled/timed_out/null/unknown/missing conclusion; null/missing/unknown/queued nonterminal statuses; raw conclusions without completion; unmapped/slow/wall-clock timeout independent from run completion; all three read roles; a concrete known run ID despite a newer unrelated run; and the existing latest alias's additive response. Existing mapper/POST behavior is retained and covered by the original publish tests.

## Quality and delivery boundary

Risk: behavior medium and contract medium (two additive read fields), data/security/irreversible low (no write/auth change). Architecture cell: existing Worker publish reader; Map delta none. No Web/UI, packages, lockfiles, workflows or new publication platform. Non-author review is requested from the existing b1_review identity for this separate subject. Original B2 implementation, evidence and PR draft are not rewritten.

Dogfood is L1 only: the actual GET /publish/555 handler retrieves the concrete run and jobs, returns honest overall completion evidence alongside legacy progress, and preserves a known-run identity when a newer unrelated run exists. No real publish, rollback, upload, deployment, production write, push, PR creation or merge occurred. Consumers must match their known runId; missing fields do not prove completion and latest does not recover ownership after a lost acknowledgment. Web consumer changes remain with C/D.


## Independent approval

Reviewer /root/b1_review approved exact implementation 225a931ad8fb55a54959a9da1cf340de8efff88a, with no open findings/P1/P2. Review subject is task:01a08d80-6619-70e1-b8b1-87c1804b8d17:publish-terminal; accepted source is docs/field-test/team-meals-worker/publish-terminal-contract.md at 5100ffa0d5acdd15c80d0606ac696f7272bb3434, independently confirmed unchanged. The durable return recorded clientMessageId publish-terminal-review-225a931-approved and localReviewVerdict approved for that exact head.

The non-author independently rebuilt with actual Node 20.20.2 and reran new plus existing publish tests (36/36), typecheck, standalone-validator and baseline-to-HEAD whitespace checks. The reviewer confirmed the six additive runtime lines, shared-run provenance of both fields, adapter normalization of absent fields, concrete run identity, and unchanged status/steps/slow/claim behavior. The author's full Worker 279/279 result is recorded above; it is not presented as an additional independent full-suite run.

The pre-existing latest alias comment was noted as non-blocking documentation cleanup; no association behavior or extra scope was added. This approval is separate from and does not revoke B2's approval. It does not authorize external publication, deployment or merge. Any subsequent archival commit changes only this task's documentation and preserves the exact reviewed runtime/test tree.
