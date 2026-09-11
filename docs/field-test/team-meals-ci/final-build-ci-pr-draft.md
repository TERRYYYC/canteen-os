---
feature_ids: [team-meals]
topics: [ci, pr-draft]
doc_kind: pr-draft
created: 2026-09-11
---

# Pin team checks and output to one source commit

Check production with the explicit team-meals target and compare numeric snapshots only against Q's fixed golden root. Capture the actual checkout commit once in the existing gate, after translation commits in the deploy workflow, then pass that revision to the existing team-output step. Missing revision or any failed prerequisite/check/output stops the workflow. Preserve all job/step names and existing Q contract tests.

Actual Node 20 validation: orchestration 21/21 after a 9-pass/12-fail baseline, scripts 189/189, Worker 259/259, core 87/87, Web 82/82 plus Q 5/5, typecheck and validator checks. Both actual gate blocks passed; both output blocks, redirected only to temporary destinations, produced matching manifest/plan revisions and team format. Golden comparison was five rows with zero differences.

See `final-build-ci-wiring.md` for source revisions and evidence limits. Linux/external CI, browser/PWA and L2 validation remain separate. No translation, push, upload or deployment was executed. This is a local PR draft, not publication authorization.
