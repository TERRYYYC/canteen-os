---
feature_ids: []
topics: [team-meals, pages, acknowledgement, review-repair]
doc_kind: implementation-evidence
created: 2026-09-11
---

# D Ingredient ACK type proof and packaging text — author evidence

What: Add `typeof commit === "string"` to the existing Ingredient document-save ACK check and Dish inline Ingredient-save ACK check. All existing checks on blobSha, warnings and unchanged remain unchanged. No HTTP/core/shared validator or write contract modification. The separate [unload repair](guard-unload-repair.md) removes only duplicate listeners in different hunks.

Why: A regular expression converts `[validSHA]` to a string. The previous page code therefore completed the write ticket using a malformed ACK. In current auth it could display saved/consume inline raw; if the old ACK remained observable it could remove the original anonymous operation after auth. Current HttpAdminApi `write` returns `body.commit` unchanged after normal envelope handling, so the page must prove its type.

RED → GREEN: [ack-red.log](guard-evidence/ack-red.log) is 6/10 PASS, 4 FAIL from actual rendered page actions. Both pages fail current-auth real HttpAdminApi array ACK and explicit available old-auth array ACK. Legitimate string ACK and real HttpAdminApi hidden old-auth ACK controls pass. Two narrow production predicates turn this matrix green. A later sweep adds two valid old A ACKs while B has a new pending write: A settles only its own ticket; B remains saving, then becomes unknown on its malformed ACK. Final [targeted output](guard-evidence/targeted-green-19.log) is 12 ACK + 7 unload = 19/19.

The old-visible branch explicitly replaces only legacy `saveIngredient` with an available deferred return to probe D's proof boundary; it does not claim that HttpAdminApi reveals old-session ACKs. Separate real-client tests show even a valid ACK hidden by `session_changed` stays unknown. Current-auth cases use the actual HttpAdminApi with a local fetch Response. No real write or arbitrary network call is used.

Actual browser: `ack-ingredient-current`, `ack-ingredient-late`, `ack-dish-current`, `ack-dish-late` on the [D fixture](../../../packages/web/test/team-meals-pages-guard-browser.html): Prepare → Probe ordinary unload → Release malformed ACK → Probe. All four stay unknown and unload-protected with exactly one write. Current Ingredient save remains disabled; current Dish retains the inline ingredient and disables save. Old-auth cases display read-only Home, so their old-view `saveDisabled`/`inlinePresent` values are not current-page assertions. Exact observations and source hashes are in [browser-results.json](guard-evidence/browser-results.json).

Tradeoff: This accepts the original valid string proof and preserves existing handling of available late proof, while withholding completion for arrays/other nonstrings. It does not enforce a new blobSha format or manufacture an association for lost replies. Unknown outcomes cannot be automatically retried.

Open questions: None for these two predicates. This is author evidence awaiting the original independent reviewer; it is not approval of preceding page/API implementations. Early test setup used a hardcoded inline row id and was corrected to inspect the actual rendered id before the valid RED; the additional multi-owner sweep initially expected saving while old A was still unknown, and its setup assertion was corrected to the actual precedence before counting final results.

Next action: Review the two narrow predicate hunks independently from the unload removals. Recheck current/available old array ACK, real hidden ACK, valid proof, and unrelated B operation protection.

## Packaging hint

The original zh/en/uk hint incorrectly said missing packaging excludes an ingredient from purchasing. T02/T03 and D0 require all recorded ingredient candidates, including missing packaging. Three strings now say packaging informs optional quantity reference and missing details still permit manual checking in the shopping list. No algorithm, defaults, quantities or business tests were added for this text-only change.

The actual Ingredient renderer was selected in en/zh/uk; all three full strings were observed in [browser-results.json](guard-evidence/browser-results.json). The [Ukrainian screenshot](guard-evidence/ingredient-hint-uk.png) shows the hint in its existing form. This evidence is a wording check, not a new layout approval.
