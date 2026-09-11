---
feature_ids: []
topics: [team-meals, purchase, export, q-ui-t08-01]
doc_kind: author-evidence
created: 2026-09-11
---
# Q-UI-T08-01 author repair evidence

Contract: `../Q-UI-T08-01-contract.md` at 71fd566. This is author evidence, not independent approval or Q T01–T09 completion. Q originals and provisional reproduction are separately preserved by root; no Q file was changed.

The old producer consumed names only. The new synchronous Purchase-only `shopping-copy.ts` consumes the existing `form.basis.projection` and `form.basis.estimate`, preserves every original source occurrence and source-bound reason, and emits collection issues independently of candidates. Current judgments are grouped; names include ingredient IDs. Original quantities, planned/base servings and one-based row/item addresses remain distinct. Unknown and to-taste remain distinct. Supplied complete reference lines are labeled and no new totals are calculated. The existing clipboard ticket/language/route/auth logic and save logic are unchanged. The shared purchase-list module does not re-export the new helper.

## Observed sequence

- `red-copy.log`: original producer, 15 tests, 2 old assertions pass and 13 new cases fail. Actual core projects/estimates approved A boundary input with explicit local variations, including duplicate source occurrences, unknown quantities/counts, unresolved ingredient/dish/technique, empty selection and a recipe with no recorded components. No fake branded view.
- `green-copy-first.log`: 11/15. The four remaining failures were an overbroad test regexp matching the end of a genuine `300 g` as `0 g`. The regexp now requires a complete zero token. The log is preserved; this was an assertion correction, not a product quantity change. Source checks were additionally strengthened to verify per-ingredient occurrence counts and addresses.
- `green-target.log`: 55/55. Includes the 16 copy tests, original shopping/details tests, and actual renderer + C1 API DOM-double assertions for exact success/reject/synchronous-throw/no-API fallback content in zh/en/uk and bound A while B/raw scope is not applied. Original ownership/save assertions remain.
- `typecheck.log`: passed on local Node 20.20.2. Runtime and source hashes are recorded separately.

Full Web, rebuilt route budgets and browser evidence follow this source checkpoint. Browser operation is owned by root and will be reported separately from the DOM double. The historical APP-BUNDLE-D1 evidence is unchanged.
