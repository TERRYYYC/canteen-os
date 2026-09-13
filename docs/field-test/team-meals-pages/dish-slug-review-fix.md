---
feature_ids: [team-meals]
topics: [dish, review, translation, form-consistency]
doc_kind: handoff
created: 2026-09-11
---

# D-PENDING-R1: current short name and duplicate guard

What: The current Dish view's content-change subscription now also copies the owner's short name into the visible input and recomputes that view's duplicate notice/guard. The owner already retains the generated short name after a translation completes in an earlier view.

Why: The original non-author f4e3fee report at `/private/tmp/canteen-dish-pending-review-f4e3fee/REVIEW.md` found that the retained translation invoked the previous view's `syncSlug`. It changed the shared draft ID and only the detached input/duplicate closure. Current Save used that generated ID while the field was blank, and a generated duplicate reached a conditional write attempt.

Tradeoff: Synchronizing the owner's value does not regenerate or replace an explicitly supplied ID. Existing conditional writes remain unchanged. This patch preserves valid translation delivery across language and navigation instead of discarding the result. The server still uses the original If-None-Match/If-Match contract.

Open questions: page auxiliary/auth ticket registration and publication wiring are separate; this repair does not approve those pending integrations. The preceding acd4475 store binding checkpoint has its own independent review.

Next: original non-author reviewer replays the fixed six-case browser probe and earlier pending/validation regressions against this exact revision.

Evidence: copied the original reviewer's six-case sibling fixture into D-owned `test/team-meals-pages-dish-slug-review-browser.html` and ran it before changing production code. `red-dish-slug-review-browser.json` is 3/6; `green-dish-slug-review-browser.json` is 6/6. The current short name matches the captured save target after language redraw and navigation; a duplicate is visible and produces zero writes; same-view generation, explicitly supplied short name and old-auth translation isolation remain passing. Actual IAB at local 4195 uses the production renderer with explicit mocked APIs. Node Dish behavior suite remains 17/17 and Web typecheck passes. No real upload/save, production or full Dish completion claim.
