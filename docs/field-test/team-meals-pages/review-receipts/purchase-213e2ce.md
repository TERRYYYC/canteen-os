---
feature_ids: [team-meals]
topics: [purchase, raw-input, auxiliary-operations, independent-review]
doc_kind: review
created: 2026-09-11
---

# Purchase raw owner and auxiliary registration — APPROVE

- reviewedHeadSha: `213e2ce835cb53a69e768f04cebfeb6fa2b0e251`
- baseSha: `3812d701155c49767453d43cde82689e486703de`
- Reviewer: `/root/plan_review`, non-author. Implementation author: page_inventory; root fixed the commit.
- Engagement: bounded local_cat, iterative.
- Accepted source: original dispatch and `docs/design/team-meals-pages/D0-contract.md@ad5651787be4a54ef28060f6345f61187e78cd9d`, with the previously accepted C2a frozen-handle and C2b auxiliary/coverage contracts as dependencies.
- Scope: only this commit's `packages/web/src/pages/purchase.ts` and dedicated tests/fixtures/evidence. No C shared files, purchase controller, detail renderer or concurrent Publish/Dish files were changed or reviewed as new scope.

No actionable P1/P2 findings in the fixed delta. APPROVE is limited to this checkpoint.

## Grounding and code review

Read the full handoff, exact diff, page call chains, existing purchase controller and detail/asset callbacks. The retained View now holds the actual ID/plan/selection inputs, applied baseline, monotonic generation and independent operation handle. Async completion consumes the captured baseline; later text remains dirty. Scope-read acceptance requires the original live render and unchanged generation; explicit empty/unchecked selection is preserved. Creation navigates using the captured ID. Different-basis remote/keep-local adoption uses the original C2 handle and C1 replacement; raw adoption is fenced separately from C1's synchronous notification.

Page reads acquire original tickets before their external/derived work. Overlapping initialization and clipboard work retain separate tickets. The stable per-View active counter protects a replacement language view. Original PageCtx finally closes only its captured coverage. C1 save/reconcile remain the sole document operation owner and acquire no auxiliary ticket. Clipboard resolve/reject settles the original local write; rejection provides a readable fallback. Image/technique requests preserve original basis references, with the technique callback checking captured basis before its dependent asset request.

## Exact-archive evidence

Archive: `/private/tmp/canteen-purchase-raw-review-213e2ce`, created with Git archive of the full reviewed SHA. No production file was edited. Only reviewer fixtures/reports were added to the archive. Root worktree remained untouched; no remote operations.

- Core build and web typecheck: exit 0.
- Raw 18 + original controller 15 + copy 2 targeted tests: **35/35**, `reviewer-targeted-35.txt`.
- Full exact archive web suite: **325/325**, `reviewer-full-web.txt`. The author's concurrent-worktree 325/329 Publish failures are not part of this archive result.
- Production/test scoped whitespace check for 3812 → 213: exit 0. Historical red/intermediate evidence whitespace is not claimed clean.
- Independently verified production SHA-256 matches the frozen handoff: `176b0a7af1ae0276b6a395415a1e5fbb09593d01affd4714f812513e07ac3acd`.
- Inspected both committed raw-state screenshots (en 1440 and uk 393), and the six viewport/language observation records. The pending notice is translated and visible; the narrow layout retains the raw value without horizontal clipping. These are author screenshots, distinguished from the reviewer browser runs below.

## Actual browser verification

Reviewer Chrome controlled through CUA, localhost 4185, actual production page + C1/C2/TeamMealsApi and shared registry/coverage with explicit mocked transport:

1. Committed raw/auxiliary browser fixture: **15/15**.
2. Committed prior-workflow regression fixture: **PASS**. This covered all-check creation and If-None-Match ACK, manual decisions/If-Match, same-version detail text, changed-scope full re-review, removed bought notice, later confirmation, held save/return, lost ACK read-only recovery, conflict compare/adopt and copy fallback.
3. Reviewer-only `packages/web/test/reviewer-purchase-independent.html`: **5/5**:
   - Uncheck every slot, reread, preserve explicit empty selection, reject create without a write; explicit re-selection creates normally.
   - Different-basis keep-local review preserves pending later plan-ID text, saves the complete original local basis with reset check decisions, and does not clear raw on ACK.
   - Two clipboard promises on one owner, then auth B with a pending Source initialization. First clipboard completion leaves old unknown; second definite rejection ends old protection while B remains saving. Only B's actual completion clears it.
   - Prior-render input callback and late clipboard rejection cannot consume the current page's raw input or trigger a repository write.
   - Synchronous clipboard rejection ends its own ticket and exposes readable text identifying the original basis. Only the three expected explicit list POST attempts occurred across the sweep.
4. Reviewer-only `packages/web/test/reviewer-purchase-assets.html`: **PASS**, added a real image reference to the synthetic original-revision fixture. Actual held `/asset` request stayed protected through language repaint and auth change. Its terminal 404 ended only original read tickets, preserving B raw. All image requests kept the original revision, `data/ingredients/tomato.json` owner and `/image` pointer; no image-induced document writes.

The first independent five-case run was a harness failure: it clicked a saved array of checkbox elements, but the first click repainted the form and detached the remaining elements. The empty-selection assertion failed and dependent cases lacked a created list (0/5). Preserved this fixture at `reviewer-purchase-first-fixture.html`; changed only the interaction to query each currently visible checkbox before clicking. Assertions and production stayed unchanged. The actual corrected run was 5/5. No product finding was inferred from detached test controls.

## Boundaries

This is an approval of the fixed Purchase input/auxiliary integration, not whole D1/T01–T09, application-shell/service-worker installation, C1 auth-seal behavior, other pages' auxiliary integration, or a reapproval of unchanged C1/C2 internals. No real Worker, real history/image bytes, repository write, deployment, publish or rollback was verified. Evidence is local mocked transport through the production browser path, not L2. Parent-owned C main and auth-seal integration remain separately open.
