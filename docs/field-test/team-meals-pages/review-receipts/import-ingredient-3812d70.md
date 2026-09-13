---
feature_ids: [team-meals]
topics: [import, ingredient, auxiliary-operations, independent-review]
doc_kind: review
created: 2026-09-11
---

# Import / Ingredient auxiliary registration — APPROVE

- reviewedHeadSha: `3812d701155c49767453d43cde82689e486703de`
- baseSha: `34ae813b7bf4e473fa6b5665ecd5a7220da1cbb2`
- Reviewer: `/root/plan_review`, non-author. Implementation author: import_owner. Mode: bounded local_cat, iterative.
- Accepted source: original task dispatch and `docs/design/team-meals-pages/D0-contract.md@ad5651787be4a54ef28060f6345f61187e78cd9d`.
- Scope: only this commit's Import/standalone Ingredient auxiliary registration, original read/write tickets, captured coverage and its tests/evidence. Plan is approved in a separate report. Shared Ingredient form algorithms, C shared files and C1 store/save ownership are unchanged.

No actionable P1/P2 findings in this delta. APPROVE is limited to this exact checkpoint.

## Grounding and mechanism

Read the complete handoff, fixed production diff and owner call chains, original D0 requirements, both C auxiliary contracts, and actual shared ticket/coverage implementation. Import registers one original per-plan input owner before async work; file reads, import Source reads and catalog loads carry individual tickets. Clear/replacement changes acceptance of a file, not whether the original read has finished. Finally settles only the captured handle/ticket and original context.

Ingredient registers before its Source/catalog reads or mounted form operations. Translation/photo hooks preserve the original record; upload and document save are distinct writes. Valid ACKs and recognized status/code rejection pairs settle only their write; malformed ACKs, unrecognized errors and hidden `HttpAdminApi` ACKs remain unknown. Exact matching Source verification settles the particular unknown save, while later raw edits remain dirty. A successful new-record retirement must dispose a clean/idle registration; pending and unknown records remain owned. Auth callbacks retire eligible local records, while old pending tickets survive anonymously without reading old raw metadata or modifying B.

Reviewed ticket transitions against shared `tickets` invariants: metadata uses the actual operation set; successful upload completion followed by save does not claim an unregistered busy state and does not duplicate C1 ownership. No shared-form double registration was introduced for Dish.

## Independently executed evidence

Used **exact 3812d701155c49767453d43cde82689e486703de archive** at `/private/tmp/canteen-pages-aux-review-3812d70`. Production files remained unmodified. Only reviewer fixtures/reports were added in the archive; no root worktree edits or remote operations.

- Import 29 + Ingredient 31 + Dish 17 targets: **77/77**, `../reviewer-import-ingredient-77.txt`.
- Core build and web typecheck: exit 0.
- Exact archive full web suite: **307/307**, `../reviewer-full-web.txt`.
- Production/test scoped whitespace check for 34ae → 3812: exit 0. No claim about historical red-log whitespace.
- Actual Chrome/CUA with local mocked transport, actual production renderers/API/shared registry and PageCtx coverage: committed auxiliary fixture **9/9**, including real HttpAdminApi hiding an old upload ACK after auth. Its anonymous unknown marker correctly remains protected.
- Historical unchanged Import raw fixture **13/13** and Ingredient review repair fixture **8/8** in the actual browser; new-record retirement, upload 409 recovery, field errors, malformed upload, pending new target/If-Match, and unknown-new retention remain intact.
- Independent fixture `../packages/web/test/reviewer-aux-independent.html`: **7/7** actual-browser scenarios:
  1. Two file reads on the same Import owner, separated by language replacement; auth B then old completions one by one. First completion cannot release the second; B paste survives, zero writes/private filenames.
  2. Old import Source read fails while B catalog is pending. Old completion cannot end B's protection; B's actual catalog completion clears it.
  3. Translation and photo decoding concurrently on one Ingredient owner. Auth change then translation failure still leaves old photo protected; decoder failure ends only that read and preserves B raw.
  4. Malformed document ACK remains unknown through mismatching and failed Source reads. Exact original body finally settles the write, preserves later raw and produces no repost.
  5. Confirmed photo upload followed by held document save and malformed ACK. Exactly one upload and save; unknown persists until matching Source, then clears without a repeat upload or save.
  6. An old upload ACK that is actually visible to the wrapper settles that original write; the auth guard starts no B document write and leaves B raw intact. This is correctly distinct from a real HttpAdminApi-hidden ACK.
  7. Two old Ingredient writes, one unrecognized 409 outcome and one validated ACK. Sibling ACK and unrelated B reads cannot release the unknown write; only the anonymous original owner remains, with no automatic repost or old private data.

Independent sweep ended intentionally unknown in case 7. That is a passed safety assertion, not a hung test or a claim that the old write was resolved.

## Boundaries

This approves only the fixed Import/Ingredient D integration. It does not approve C main/app-shell installation, C1 auth-seal marker, future shared changes, Dish or Purchase auxiliary wiring, app-wide update/PWA behavior, full page lifecycle/D1 or T01–T09. Previously closed I-R2/ING-R1/ING-R2 were not reopened by observed regressions, but this is not a fresh blanket approval of their entire history. No real Worker, remote write, deployment or L2 evidence was used.
