---
feature_ids: [team-meals]
topics: [web, review, verification]
doc_kind: review-evidence
created: 2026-09-11
---
# C2a independent review

Non-author reviewer: `/root/c1_review`; author: root. Fixed initial SHA `1b2de707ad38a5169d22366e16b0711479fed9e5`, base contract `2b8d98e5d6f29439f189632ea93152590a26a79b`.

Initial verdict: **REQUEST_CHANGES**, one P2 and one P3. No other P1/P2 in the public VM. Reviewer independently ran Web102/core87/Q64/typecheck/Webbuild and six extra core-boundary probes, and used Chrome CUA to inspect the actual mock browser harness.

1. P2: The harness called `decide(...buy,true)` before `If-None-Match:*` creation. Its mock accepted an order the formal server must reject, so its initial PASS was not valid evidence for the create/update sequence.
2. P3: `git diff --check 2b8d98e..1b2de70` returned 2 for whitespace-only lines in `C2a-red.txt`. The author's working-tree check had run while that log was untracked and did not cover it.

Revision: no public VM, core, C1 transport/editor or domain test algorithm changes. The mock now rejects confirmed first creation and invalid/missing update locks. The browser includes a negative create probe, then all-check C1 creation, then a separate manual decision update using the acknowledged lock. Review/cancellation remain derived only. The contract now makes this order explicit for D. Initial log trailing spaces are stripped without changing its substantive red results.

Red/green browser evidence: with only the mock strengthened, the original order produced `FAIL: Error: mock conditional save failed (invalid_selection)`. With the order repaired, the same CUA page showed `PASS — mock only`, `Illegal confirmed creation: rejected`, and `Explicit editor saves: 2 (all-check create, locked manual update)`. Fixed-range whitespace verification, final SHA and independent revised verdict are recorded after the revision is committed/reviewed.

All evidence is local/mock. B2 has separate local approval but is not exercised here. No production, main, remote push or PR action was performed in C2a.
