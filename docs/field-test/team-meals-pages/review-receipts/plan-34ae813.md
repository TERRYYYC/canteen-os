---
feature_ids: [team-meals]
topics: [plan, auxiliary-operations, independent-review]
doc_kind: review
created: 2026-09-11
---

# Plan auxiliary registration — APPROVE

- reviewedHeadSha: `34ae813b7bf4e473fa6b5665ecd5a7220da1cbb2`
- baseSha: `fa7bc8dc6bcd576065bc23b622e6118f1a17fe41`
- Reviewer: `/root/plan_review`, non-author. Author: root. Mode: bounded local_cat, iterative.
- Accepted source: original task dispatch and `docs/design/team-meals-pages/D0-contract.md@ad5651787be4a54ef28060f6345f61187e78cd9d`.
- Scope: only this commit's Plan registration/read-ticket/coverage integration, `plan.ts`, `plan-form.ts`, and dedicated tests/evidence. C auxiliary contracts and implementation are consumed dependencies, not independently reapproved here.

No actionable P1/P2 findings in this delta. APPROVE is limited to this exact checkpoint.

## Grounding and mechanism

Read the full Plan handoff, fixed diff, original D0 requirements, C2b-aux-contract and C2b-aux-auth-contract, and actual shared registration/coverage implementation. Each raw View registers synchronously once against its API boundary. Initial Source, actual catalog requests and comparison requests acquire read tickets before calling transport; finish closures hold the original View/handle/ticket. Auth replacement disposes only eligible old owners and creates a new form. Late callbacks do not resolve handles through the current view map. Initial render finally invokes the original PageCtx callback, including stale completion and read failure. C1 remains the sole JSON/save/reconciliation owner.

The registration reports actual raw input and read count. Invalid optional counts and unapplied Add values remain raw-owner state; this delta does not transform whole-plan serialization, counts or v3 empty-meals semantics. Offscreen raw is retained and protects updates without manufacturing a C1 JSON edit.

## Independently executed evidence

Verification used the permitted combined **exact 3812d701155c49767453d43cde82689e486703de archive** at `/private/tmp/canteen-pages-aux-review-3812d70`. Confirmed no Plan production delta between 34ae and 3812. No production file was edited in the archive or root worktree. Only reviewer fixtures/reports were added locally. Dependencies were reused locally; no remote writes.

- `node --test ...plan.test.mjs ...plan-raw.test.mjs ...peek.test.mjs`: **23/23**, `../reviewer-plan-23.txt`.
- Core build and web typecheck: exit 0.
- Exact combined archive web suite: **307/307**, `../reviewer-full-web.txt`.
- Production/test scoped whitespace check for fa7 → 34ae: exit 0. No claim that historical red-log whitespace is clean.
- Actual Chrome through CUA, reviewer localhost 4185, production renderer + TeamMealsApi + registry + captured real coverage: committed Plan auxiliary fixture **11/11**.
- Unchanged original Plan raw fixture: **12/12**, including raw-remap, Add return, full C1 save and unknown save.
- Reviewer-only `../packages/web/test/reviewer-plan-aux-independent.html`: **3/3** substantial additional scenarios, all zero writes:
  1. Two old Plan Source initializations pending on separate documents; auth B opens the same page while pending; first old read fails, second old read completes. Unknown remains until both old tickets end, then B stays saving/untracked until its own completion.
  2. Catalog failure → held retry → language repaint. Exact invalid text `2.0000000000000001` survives, pending read protects the page, actual read completion leaves dirty raw; correcting it clears protection.
  3. Catalog rejection on another document does not lose or clear an offscreen unapplied Add choice. Explicit reversion clears the final raw owner.

Reviewer-fixture correction is transparent: the first independent run reported 1/3 because all documents used the same revision and correctly reused the cached catalog, so the intended retry button did not exist. The next case remained dirty from that interrupted test. Preserved the original fixture at `../reviewer-plan-aux-first-fixture.html`; changed only synthetic Source revisions to independently exercise failure/retry. Production code and assertions were unchanged. The corrected actual-browser run was 3/3.

## Boundaries

This approves the Plan page integration, not C main/app-shell installation, C1 auth-seal pending marker, shared implementation as a whole, other pages, full update/PWA behavior, D1 or T01–T09 acceptance. All browser network data was synthetic; no real Worker, deployment, real repository write or L2 validation occurred. These explicitly open integration items remain open.
