---
feature_ids: [team-meals]
topics: [plan, reload-safety, auxiliary-input]
doc_kind: handoff
created: 2026-09-11
---

What: Plan registers each existing raw View once at its normal synchronous render entry, using the approved C auxiliary API and the original TeamMealsApi boundary. Initial Source, actual catalog and comparison reads carry original read tickets. C1 remains the only plan JSON/save owner. The original PageCtx completion runs in finally even when an old render exits.

Why: Unapplied Add choices and invalid input must protect an offscreen plan. An old auth initialization must finish only its own registration and coverage while a new same-page request stays protected.

Tradeoff: Metadata reads are pure and monotonic. Read lifecycle changes legitimately advance raw generation even without input changes. Read errors end their read tickets; no write tickets duplicate C1 save/reconciliation. Page setup stays untracked until its actual initialization finishes. No shared C implementation or main was modified.

Evidence: `red-plan-auxiliary.txt` records the four new failing checks before implementation. `intermediate-plan-auxiliary.txt` preserves the initially stale generation assertion; it was updated to retain all raw-value checks and permit actual catalog read generations after a save. `green-plan-auxiliary.txt` has 23/23 targeted checks. The installed TypeScript compiler passed. `green-plan-aux-browser.json` contains 11/11 actual IAB checks of the production renderer/API/registry and injected real PageCtx callback, including A pending initialization → B pending initialization → A completion → B completion, exact raw retention, error completion and zero writes.

Open Questions: This is page integration only. The application main callback and C1 auth-seal pending marker remain C-owned and require their own approved implementation. This author evidence is not independent approval or real backend validation.

Next Action: Review this fixed Plan delta independently with the historical raw/Plan fixtures and source-read failure paths; keep unrelated concurrent page changes outside the review.
