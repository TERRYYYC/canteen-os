---
feature_ids: [team-meals]
topics: [dish, auxiliary-operations, independent-review]
doc_kind: review
created: 2026-09-11
---

# Dish auxiliary integration — APPROVE

- reviewedHeadSha: `8a026a79608edbbcb521e44f42ea628c044936c2`
- baseSha: `3eac7469a033f658893654802ad1cc21670d88db`
- Reviewer: `/root/plan_review`, non-author. Implementation author: import_owner; root fixed the commit.
- Engagement: bounded local_cat, iterative.
- Accepted source: original task dispatch and `docs/design/team-meals-pages/D0-contract.md@ad5651787be4a54ef28060f6345f61187e78cd9d`, consuming the approved C2b-aux-contract / C2b-aux-auth-contract / PageCtx coverage seams.
- Scope: only the fixed Dish production delta in `packages/web/src/pages/admin/dish-new.ts`, its dedicated tests/browser boundary changes and evidence. Publish in the parent commit is ancestry, not reviewed new scope. No Home/Publish floating changes were used.

No actionable P1/P2 findings in this delta. APPROVE is limited to this checkpoint.

## Grounding and mechanism

Read the complete handoff and fixed diff, per-document form lifecycle, upload/inline save wrappers, Source/catalog/compare and translation/photo call chains, and the accepted shared registration/coverage contracts. The existing record registers synchronously in prepare before Source awaits. A record is reused for overlapping loads. The original read/write wrapper captures its record and ticket; lifecycle completion does not look up the current record. Clean new-record retirement requires successful registration disposal.

UI activities remain interaction locks, separate from external tickets. Main Dish C1 save and reconciliation receive no duplicate auxiliary write ticket. Main upload receives one actual write ticket; inline Ingredient upload and save receive separate tickets with acknowledgement checks and recognized rejection classification. Unknown write tickets cannot be cleared by the UI activity's finally, a sibling ACK, catalog reads, navigation or auth. Hidden HttpAdminApi ACKs remain unknown; visibly validated old ACKs may settle the original ticket but cannot start a new-session chained write.

Original PageCtx callbacks run for Source and catalog completion, including stale/failure paths. Inline preflight catch is followed by original operation/view checks before any write. The shared Ingredient form and submit algorithm were not changed. Existing D-R4 field feedback and D-PENDING-R1 visible generated target behavior were preserved by the observed regressions.

## Independent exact-archive checks

Archive: `/private/tmp/canteen-dish-aux-review-8a026a7`, created from the full reviewed SHA. No production file was edited. Reviewer-only fixtures/reports were added in the archive. Root worktree was untouched; no remote operations or new subagents.

- Dish 28 + Import 29 + Ingredient 31: **88/88**, `reviewer-targeted-88.txt`.
- Exact archive full web suite: **340/340**, `reviewer-full-web.txt`.
- Core build and web typecheck: exit 0.
- Production/test scoped whitespace check: exit 0. No blanket claim about historical red-log whitespace.
- Compared the four historical Dish browser fixtures to the parent: only explicit synthetic pure-peek additions; behavioral assertions unchanged.

## Actual browser evidence

Reviewer Chrome controlled through CUA, local port 4185; actual production renderers, TeamMealsApi/C1 and shared registry with explicit mocked transport:

- Committed new auxiliary fixture: **8/8**. Includes original Source coverage, overlapping catalog reads, decode/translation lifetime, C1-only save, inline upload/save separation, two old uploads and real HttpAdminApi-hidden inline upload ACK. Hidden old ACK correctly ends with an anonymous unknown marker.
- Original pending fixture: **13/13**.
- Original validation fixture: **11/11**.
- Original slug fixture: **6/6**, including generated duplicate blocked locally with zero POSTs.
- Thus all **38/38** committed author browser scenarios were independently executed and observed passing.

Reviewer-only `packages/web/test/reviewer-dish-aux-independent.html` runs each additional scenario in a fresh document/iframe: **6/6**, no production changes or fixture repairs needed:

1. Main upload validated, then Dish document request held and transport response lost. Auxiliary owner becomes idle after upload; C1 alone remains pending/unknown. Language return makes neither a duplicate upload nor a duplicate POST.
2. Inline upload validated, document ACK malformed (`unchanged` has wrong type). Original inline raw and unknown write remain through other-document navigation/return; attempted repeat does not upload/save again.
3. Two overlapping Source initializations on one old owner coalesce to one actual HTTP request while retaining both original page responsibilities. After auth B starts another Source read, old rejection cannot clear B; only B completion clears the final protection.
4. Two old document uploads after auth: one malformed ACK and one validated ACK. Only the malformed original write remains anonymously unknown; B raw survives and neither old upload chains into a B document save.
5. Inline catalog preflight held, auth changes, B raw edited, old preflight rejects. Catch-and-continue does not dispatch upload or Ingredient save; B text is preserved and original reads settle.
6. Explicit recognized main-upload `400 bad_image` rejection ends its ticket, preserves photo for explicit retry across language, then performs exactly one successful C1 save after that retry.

Unknown endings in cases 1/2/4 are successful protection assertions, not evidence of resolved writes. Cases 3/6 finish clear; case 5 finishes dirty solely from B's later C1 edit.

## Boundaries

This approves the fixed Dish auxiliary page integration only. It is not a fresh blanket approval of all Dish history/lifecycles, unchanged C internals, parent Publish code, C main/app-shell installation, C1 auth-seal pending marker, full PWA/update behavior, D1 or T01–T09 completion. No real Worker, real repository write, deployment, publication, rollback or L2 evidence was used. C/root-owned auth-seal and shell integration remain separately open.
