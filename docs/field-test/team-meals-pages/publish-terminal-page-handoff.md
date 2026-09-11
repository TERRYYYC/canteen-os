---
feature_ids: [team-meals]
topics: [publish, terminal-evidence, review, compatibility]
doc_kind: handoff
created: 2026-09-11
---

# Publish overall completion and result

What: A known matching run now ends the page's operation only when `runCompleted === true`. Result presentation independently recognizes success, failure, cancelled and timed_out; missing/null/unfamiliar conclusions show “Build ended · publication outcome unknown.” Legacy status, failed steps, elapsed time, malformed fields and latest cannot establish completion or success. Existing read-only verification continues to request the already-known run ID.

Why: B's approved `5100ffa0` contract and `225a931` implementation separate whole-run completion from step/progress status. C's approved `65f6641` three-file compatibility delta preserves valid optional fields and removes malformed evidence. The old page still released a run on legacy success and could not release a completed failure or unknown conclusion. The new actual-renderer regression reproduced both errors before the page change.

Tradeoff: no POST/API/claiming changes. Legacy Workers remain readable; absent completion evidence retains protected unknown status instead of assuming success. A completed unknown conclusion releases only the unresolved operation barrier; it does not announce deployment success. Confirmed completion survives language/navigation without starting another poll or POST. Whole-run elapsed time uses the completion field, independently of step states. Existing success messaging is used only for recognized successful completion.

Open questions: formal auxiliary tickets, auth retirement and page coverage remain a separate pending integration. The previous Publish owner's auth handler still has the already documented metadata-retirement limitation; this bounded change does not approve or close it. Real Worker/L2, actual publication, C reader/main/PWA and D1/T01–T09 completion are not claimed.

Next: independent exact-commit review of terminal behavior and previous Publish/rollback protections, then connect the approved C operation tickets without treating settled/completed as a success signal.

Evidence:

- `red-publish-terminal-page.txt`: new renderer regressions fail before implementation (legacy success release and completed-results matrix).
- `green-publish-terminal-page.txt`: 18/18 tests, including the 36 legacy-status × conclusion combinations and malformed/missing/false completion, wrong run, failed step and read-only verification.
- `intermediate-publish-terminal-page.txt`: 16/18 after the production fix. Two historical success fixtures still omitted the new completion proof; they were updated to explicitly return matching completed-success fields. Missing-proof negatives remain separately covered and protected.
- Actual IAB at local 4195: `green-publish-terminal-browser.json` has 18/18 assertions; `green-publish-terminal-baseline-browser.json` has all original 13/13 owner/rollback/auth/mode checks. Browser source SHA256 is `9a9f307f74978e8200f2768e2695946d596772cfe29dfaa709c4ef5c122798f4`.
- Installed Web typecheck and scoped diff whitespace: pass.

The D browser fixture rebuilds the actual page using its existing `team-meals-pages-publish-browser.build.mjs`. C1 transport and legacy AdminApi use explicitly intercepted local requests, generated run IDs and sample revisions. Nothing is published or rolled back outside the fixture. Generated code is an ignored intermediate; rebuild is required in a fixed review archive.
