---
feature_ids: [team-meals]
topics: [review, evidence, custody]
doc_kind: evidence-receipt
created: 2026-09-11
---

The Menu/Prep production and tests were frozen in `d31661123b23bc2a80a9c8c613b1f9947d7c5665`. Its seven raw `.log` files were initially excluded by the repository's generic log ignore rule. This following evidence-only commit explicitly includes the original bytes; it changes no production, tests, handoff, screenshot, or existing checksum manifest.

Root verified all 20 entries in `SHA256SUMS` against the original frozen files before adding the logs. Four RED logs preserve 18 whitespace-only lines from the test runner (duplicate-row 2, entry 8, image-state 2, ingredient-deeplink 6). Their raw evidence whitespace check therefore does not pass. The d316611 production/test commit passed its scoped diff check. No raw log was cleaned or regenerated to change these results.
