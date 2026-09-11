---
feature_ids: [team-meals]
topics: [pages, ingredient, review, lifecycle]
doc_kind: implementation-evidence
created: 2026-09-11
---

# Ingredient ING-R1 / ING-R2 fixes

What: This working-tree checkpoint addresses the two P2 findings in the non-author exact `c4952b38043f908f68c3417b7ef2cbfcff93eda1` report at `/private/tmp/canteen-ingredient-review-c4952b3/REVIEW.md`. Only the standalone portion of `pages/admin/ingredient-new.ts` changes. No author approval or commit is asserted here.

Why: ING-R1 kept one acknowledged `new` owner forever, so returning to New ingredient targeted the first ingredient again. ING-R2 put an upload-stage recognized 409 into document conflict, whose Source comparison deliberately cannot verify an upload. The recognized Worker path was checked in `endpoints/image.ts` -> `commitSingleFile` -> `write.ts`'s bounded-ref-update `conflict` rejection.

Fixes:
- Record actual route departure. On re-entering `new`, retire only a previously departed owner with an acknowledged blob, phase saved, no dirty raw input, no pending task/check/save and no attempt. A language repaint retains the current owner. Pending or unknown new records, and edits made during save, retain their original target and returned If-Match. A new owner consumes the next existing handoff normally.
- An error must first pass the existing recognized Worker rejection predicate. Only a recognized **save-stage** 409 enters document conflict. A recognized **upload-stage** 409 enters error and preserves its selected photo for an explicit Save retry. Unknown/unrecognized 409 and malformed acknowledgements remain unknown; no text-based inference, implicit retry, or false Source comparison was added.

Tradeoff: The legacy upload/save methods, If-Match contract, shared `submitIngredientForm`, form hook behavior, C shared store, and publication are unchanged. A new owner is created only after the prior creation is safely complete and the user leaves. No unresolved record is cleared to make another creation possible. When formal C auxiliary registration lands, its clean owner retirement must accompany this existing safe retirement point; this checkpoint adds no fake registration or disposal signal.

RED evidence: `red-ingredient-review.txt` shows 20/23 renderer cases passing and 3 failures (new target, new handoff, upload 409). The original independent browser fixture was copied to D's `team-meals-pages-ingredient-review-browser.html` and run against pre-fix production code: `red-ingredient-review-browser.json` shows exactly 2/4, with both findings and the original passing 400 correction / malformed-ack protection.

GREEN evidence:
- `node --test packages/web/test/team-meals-pages-ingredient.test.mjs packages/web/test/team-meals-pages-dish.test.mjs`: **40/40** (Ingredient 23, Dish 17), including all original 17 Ingredient tests, 6 new sibling/regression cases, and all 17 Dish tests.
- `npm --prefix packages/web run typecheck`: PASS in the shared working tree. Scoped production/test `git diff --check`: PASS.
- Actual Chrome, existing local 4195 Vite with HMR disabled: the D regression fixture reports **8/8** in `green-ingredient-review-browser.json`. It strengthens repeated creation to capture two real simulated saves targeting ingredient-a and ingredient-b with no old If-Match; upload 409 retries only after an explicit action and completes one ingredient save. It also covers language repaint, new handoff, pending new/later raw input and unknown new.
- The unchanged committed `team-meals-pages-ingredient-browser.html` reports **8/8** in `green-ingredient-review-baseline-browser.json`: mixed C1 catalog, mode honesty, raw numeric string, photo decode/upload ownership, save unknown verification, upload unknown, late translation and auth replacement. Both final browser warning/error logs were empty.

All writes are explicit local fixture methods using the actual page and shared form, with a generated 2x2 image. No real Worker upload/save, production, deployment, full visual signoff or C2b integration claim. The in-app browser was unavailable at this pass; the available Chrome connector ran these checks. RED text logs retain assertions/results with only trailing whitespace removed.

Next: Parent fixes the revision and returns the exact delta to the original non-author reviewer. The previously pending C bindDraftStore / auxiliary registration and cross-auth handoff integration remain separate.

| File | SHA256 |
|---|---|
| packages/web/src/pages/admin/ingredient-new.ts | a99b4d1ecc1da15b6423a63e7754de75e788e6b0613535014cae586a885235ff |
| packages/web/test/team-meals-pages-ingredient.test.mjs | e9df2a815da0987de5151c7aa302cb5a2e63f4767eed5a8bd4fdc8861db55d98 |
| packages/web/test/team-meals-pages-ingredient-review-browser.html | bc23b409530c67d8b640fb2ac5cfff91aefcd3c34cdb00966b99c410b5fbfac4 |
