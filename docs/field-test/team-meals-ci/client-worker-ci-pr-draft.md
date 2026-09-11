---
feature_ids: [team-meals]
topics: [ci, pr-draft]
doc_kind: pr-draft
created: 2026-09-11
---

# Run client–Worker contract tests in existing workflow steps

The Web test glob does not discover the five nested team-meals client–Worker contract cases. Run them explicitly after the existing CI Web tests, reusing the preceding Worker/core build. In the deploy gate, build Worker/core before running the same cases and the existing data check. Keep every existing step name and stop each block on failure.

Validation on actual Node 20.20.2: new orchestration tests 9/9 after a 4-pass/5-fail baseline, Worker 259/259, Web 82/82 plus nested 5/5, core 87/87, scripts 119/119, Web typecheck and generated-validator check. The actual deploy gate block also passed locally, with five unchanged snapshot rows. Frozen install succeeded in the existing worktree.

A's approved final production team/golden target and output commands remain a separate integration input; this change preserves their existing commands. No browser/L2/Linux CI claim is made. See `client-worker-ci-wiring.md` for provenance and execution limits. This is a local PR draft; no external publication is authorized by it.
