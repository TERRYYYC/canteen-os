---
feature_ids: []
topics: [worker, publish, run-status, terminal-evidence]
doc_kind: implementation-contract
created: 2026-09-11
status: fixed-for-bounded-implementation
---

# PublishProgress: overall run completion evidence

This additive contract extends the existing read-only progress response. It does not change publication, run claiming, the step-name mapper or the existing status/steps/slow fields. Scope is Worker code/tests and this task's evidence; Web types belong to C and the page belongs to D. Base implementation: a75250c36dfd2b280af2bb2d949c1e632af967e4.

| New field | Required response type | Exact meaning |
|---|---|---|
| runCompleted | boolean | True only when the same returned WorkflowRun has status exactly completed. All other statuses, including null/unknown, are false. Step failure, elapsed time and unmapped steps do not establish overall completion. |
| runConclusion | string or null | The same WorkflowRun's raw conclusion. Absent/null becomes null through the existing GitHub adapter; known or unfamiliar strings are preserved without an enum coercion or success fallback. It is not inferred from step conclusions or the legacy progress status. |

GET /publish/:runId returns both fields for the run retrieved by the existing concrete-ID endpoint. GET /publish/latest uses the same mapper, so both fields also describe its returned run, but that does not establish that the run belongs to an unknown or unacknowledged POST. POST /publish's response and claiming behavior are unchanged.

Consumers must first match the returned runId to their already-known runId. A missing field from an older Worker, or runCompleted other than the boolean true, cannot prove completion. runCompleted true proves the run ended; only an explicitly recognized conclusion supplies its outcome. In particular, null or an unknown conclusion is not success. An in-progress run can still expose a raw conclusion string if upstream supplies one; that string alone does not prove completion.

Compatibility examples: in_progress plus a failed step may retain legacy status failure while runCompleted is false; a wall-clock timeout retains false; unmapped can coexist with either completion value; completed with failure/cancelled/timed_out/success/null/an unfamiliar conclusion reports true and preserves the actual nullable conclusion. Existing mapper status precedence is unchanged even where it is coarser than the new evidence.

Verification is local L1 FakeRepo/read-only calls only. No real publish, rollback, upload, production write, Web edit, workflow change or package/lock edit is authorized by this contract. Missing run IDs and lost-ack association remain outside this bounded change.
