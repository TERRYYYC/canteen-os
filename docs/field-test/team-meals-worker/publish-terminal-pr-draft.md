---
feature_ids: []
topics: [worker, publish, pull-request]
doc_kind: local-pr-draft
created: 2026-09-11
status: local-only-awaiting-publication-authorization
---

# Expose overall publish run completion independently of progress

A mapped step failure or a wall-clock timeout can occur before the overall publish run ends. PublishProgress now includes runCompleted from the same run's status and runConclusion from its raw nullable conclusion, so consumers can distinguish real completion from the legacy progress display. Unknown or missing conclusions never imply success. Existing status, step mapping, slow behavior, POST responses and run claiming are unchanged.

The concrete run ID reader and existing latest alias return the additive fields. Consumers must match an already-known run ID; missing fields from an older Worker do not prove completion, and latest does not identify an unacknowledged POST. This change does not alter Web code, dependencies, workflow configuration or publication actions.

Validation on actual Node 20.20.2: new tests 20 red → green; new and existing publish tests 36/36; complete Worker suite 279/279; typecheck, standalone validators and whitespace checks pass. New cases cover ongoing failed steps, completed success/failure/cancelled/timed_out/null/unknown conclusions, missing upstream values, unmapped and timeout independence, and concrete run identity despite a newer unrelated run. Evidence is local FakeRepo only; no real publish or production write occurred.

Base delivery: a75250c36dfd2b280af2bb2d949c1e632af967e4. Fixed contract: 5100ffa0d5acdd15c80d0606ac696f7272bb3434. Independently approved implementation: 225a931ad8fb55a54959a9da1cf340de8efff88a; no open P1/P2. The non-author reran the 36 publish tests and type/validator checks on Node 20.20.2; see publish-terminal-evidence.md. Original B2 approval and PR draft remain unchanged. No external PR, push, deployment or merge is authorized by this local draft.
