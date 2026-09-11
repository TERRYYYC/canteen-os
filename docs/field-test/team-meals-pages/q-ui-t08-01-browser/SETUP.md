---
feature_ids: []
topics: [team-meals, q-ui-t08-01, browser, setup]
doc_kind: evidence-boundary
created: 2026-09-11
---
# D browser verification setup custody

This directory belongs to RC-D root. It contains a new fixed-source browser builder and visible test controls, based on the read-only Q server and fixture at ad54d4ff31f977624e1605e883d3c2286a50358b. Q files and its active browser/server were not edited or operated.

The setup source 1bf8564d456c4d7226402b17157ef0d9b38f4d0f has the unchanged old packages tree dce6d72208652c80d2aa5b40865bef4a56732226. The setup was opened only to confirm serving and the real main/C/Worker page; it is not repaired-code verification. Its listener was stopped afterward.

Preserved setup attempts:

- setup-01.log: root transcribed an incorrect full commit hash. git archive rejected it; no source build or product assertion ran.
- setup-02.log: fixed verified commit archived correctly; D has no installed worker node_modules, so Worker build could not find tsc. This was an environment failure. prepare-setup-01.mjs preserves that builder.
- setup-03.log: builder now links the existing Q Worker dependencies read-only while keeping D archived Worker/core source. Build passed using Node v20.20.2. No dependency files or lockfiles changed.
- setup-04-server.log: formal producer and browser build succeeded, but sandbox blocked loopback listen with EPERM. No product failure inferred.
- setup-05-server.log: approved loopback execution built and served successfully at ephemeral local port 58165. Source integrity records every original Web source against the fixed D commit; fixture revision was ab3f584656e1c85cad51a0ac3f6193fa2ff5f21d. Actual purchase/new page and controls displayed in D IAB tab 87. Server stopped with exit130.

The server runs actual production main → C client → HTTP → actual Worker handler → Q-authored FakeRepo, with explicit public test credentials, fixed date and original formal schema/producer. It refuses publish/rollback and external requests other than the existing in-memory GitHub model. Native clipboard is unchanged in normal mode. Visible controls separately select rejected or held clipboard boundaries and read the native clipboard into a DOM evidence field; those injected modes cannot be counted as native clipboard success. The optional metadata control changes only the local FakeRepo for a bound-version test.

Production code will be built again from its final fixed commit before any repaired browser result is claimed. Author instrumentation HTML/control changes are separately recorded and do not stand in for the uninstrumented actual dual-configuration budget builds.
