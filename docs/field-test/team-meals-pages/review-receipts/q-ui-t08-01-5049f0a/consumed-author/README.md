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

## Frozen source and complete checks

Production/test checkpoint: `5049f0a47c76c4149a91a288a6a9b6edf279b1ea`. `source-hashes.json` covers all six source/test files, and the build validator rechecks their hashes. `full-web.log` is the final local Node 20.20.2 run: **509/509**, compared with the original 491 plus 18 new assertions. Target remains **55/55**, typecheck passed. No functional edits followed these checks.

Both real configurations were rebuilt with the original Vite configuration. `measure.mjs` adds an observation-only graph asset; it does not replace configuration or drop precache. `default.json` / `http.json` contain all 11 complete static entry closures, each with SW and no-SW: **44/44 ≤ 60,000 gzip bytes**. Actual emitted preload maps additionally yield **24/24** checked dependency closures. The new helper is contained in the Purchase chunk, absent from Plan's static closure; this is verified from emitted module membership, not an estimated chunk subtraction.

| Actual configuration | Plan SW gzip | Purchase SW gzip | All app JS (gzip / raw) | JS precached | SW + runtime gzip |
|---|---:|---:|---:|---:|---:|
| default | 59,540 | 54,444 | 171,122 / 434,879 | 24/24 | 9,513 |
| HTTP | 59,568 | 54,467 | 171,191 / 434,981 | 24/24 | 9,515 |

Each build keeps 52 precache entries. `preload-validation.json` records exact JS/CSS/HTML artifact hashes and preload checks; the final source hashes still match. `check-builds.py` is a read-only, reproducible validator, with output retained in `check-builds.log`.

Raw Node failure output contains trailing whitespace, and typecheck output ends with a blank line; these original bytes are preserved. The initial broad staged `diff --check` stopped on those evidence bytes. The scoped `git diff --cached --check -- packages/web` passed before the source commit. No test was skipped, exception suppressed or business threshold changed.

## Contract alignment and remaining handoff

- Scope/full version/current judgment groups: old assertions plus three-language real-core cases.
- Every candidate/source, duplicate source rows, same-name IDs, seasoning, unknown versus to-taste, explicit planned/base counts: deep-frozen real-core cases.
- Collection issues with zero candidates and every source-bound estimate reason: three-language real-core cases; no source names are fetched from current catalog.
- Complete supplied references and stock-sufficient empty lines: existing core values remain references, do not change manual judgments, no total invented.
- Exact clipboard/fallback contents and A versus un-applied B: actual renderer plus real C1 API DOM double. Original save/raw/clipboard ownership suite remains intact.
- Actual main / Worker / browser clipboard evidence is being executed by root against the frozen source. It must be reviewed separately, as must the original nonauthor review. This checkpoint does not approve itself and does not declare Q acceptance complete.

Architecture boundary: one synchronous D presentation helper; no new state, transport, async owner or shared C changes. Risk is user-visible export completeness and static route size, addressed by the concrete cases, full Web/type and actual build closure verification above.
