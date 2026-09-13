---
feature_ids: []
topics: [team-meals, worker, independent-review, asset]
doc_kind: review-record
created: 2026-09-11
status: B1-approved
---

# B1 independent review

Reviewer: local subagent `/root/b1_review`, not an implementation author. Review subject: `task:01a08d80-6619-70e1-b8b1-87c1804b8d17:B1`. Accepted source: team-meals-contract at `8448d49525da02c2e3fceb65167c8cedb3d6df11`.

Initial reviewed HEAD: `e6b108ed2fe77df1b3bf75408c5b567d42213e61`. Verdict: changes_requested, one P2. The reviewer reran all 129 tests/typecheck/check:validators/diff checks and independently reproduced empty, HTML, text and truncated PNG blobs returning 200 from Asset; PNG under a jpg filename received the wrong MIME. No other B1 P1/P2 reported; B2/L2 excluded explicitly.

Root cause: the read endpoint trusted the path extension; the existing upload sniffer verifies header/dimensions but alone also accepts a PNG truncated after IHDR dimensions. Fix: use that sniffer plus complete container boundaries (PNG chunk bounds, CRC and IDAT/IEND; JPEG segment bounds, scan data and EOI; WebP RIFF length and image chunk bounds), and require extension/type agreement before responding. The response keeps the original historical bytes. This is structural validation, not a new pixel decoder. The upload endpoint behavior is unchanged.

Author reproduced five failing cases before the fix (`b1-review-red.txt`), then ran the actual handler with valid red/blue PNG and complete JPEG/WebP fixtures plus invalid cases: 135/135 (`b1-review-green.txt`), typecheck and diff-check pass. No runtime fallback added. Read fixtures are actual images, replacing text sentinels. Callback indentation cleanup is behavior-neutral.

B1 API capability evidence: GitHub's [compare endpoint](https://docs.github.com/en/rest/commits/commits#compare-two-commits) exposes status and merge_base_commit; ancestry checks use both rather than enumerating commits. [Recursive trees](https://docs.github.com/en/rest/git/trees#get-a-tree) report truncation, which is rejected. [Blob reads](https://docs.github.com/en/rest/git/blobs#get-a-blob) provide base64 content for exact byte decoding. These official API descriptions were checked; no live repository write or L2 result is implied.

The repair commit containing this record is returned to the same reviewer for delta review. Approval has not been assumed from the green tests.


Final B1 verdict: `/root/b1_review` independently approved `865be4c30a094e8874c43067f2b6db034a4c7057`, no open B1 P1/P2. It reran 135 tests/typecheck/check:validators/diff and rejected all 839 strict prefixes of the four complete image fixtures, plus CRC corruption. Dispatch separately reproduced 135 tests from a fixed archive. This approval does not cover subsequent B2 work.

Evidence hygiene correction: the original working-tree diff check passed, but dispatch's committed-range check `git diff --check 8448d495..865be4c` found trailing whitespace in red logs. All evidence text logs have now had trailing whitespace stripped; substantive captured output is unchanged. Subsequent checks explicitly cover the committed range too.
