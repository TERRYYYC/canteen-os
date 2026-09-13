---
feature_ids: []
topics: [team-meals, menu, prep, review-repair, browser-evidence]
doc_kind: handoff
created: 2026-09-11
---

# MP-R1 author repair handoff

What: the Menu and Prep frozen presenters now derive their issue panel and empty-view copy from the same selected issues. `prep.ts` exports `selectFrozenIssues` and `hasFrozenSourceGap`; both presenters consume those helpers. The existing `renderFrozenIssues` signature remains compatible. No core collection, count, source loading, publication or asset behavior changed.

Why: original independent report `/private/tmp/canteen-menu-prep-review-7c61737/REVIEW.md` identified MP-R1, one P2 mechanism at two siblings. Target reviewed was `7c617370bd29a4bcdd9a9beb303217d19bd6a690`, iterative reviewer `/root/plan_review`. An empty September 16 lunch was incorrectly labelled unavailable because a different September 15 dinner had a missing recipe. Author work was performed over local HEAD `04afd9421de571a7295deabdfa4b4e049d281a26`.

Tradeoff: this is presentation filtering only. The whole-projection coverage object remains unchanged. The empty-view source-gap predicate retains the existing missing-plan, missing-dish and components-unrecorded classifications; it is not an estimate or a second collection algorithm. Issues with no value for a selection dimension remain relevant, so a missing plan without a meal index cannot disappear when a caller selects a row.

Open questions: none for MP-R1. Formal published-source wiring, historical data, deployed Worker behavior and independent approval remain outside this author repair. The browser source is explicitly synthetic, loaded through the actual C2 view model; its repeated-letter fixture revisions are not historical provenance.

Next action: root may freeze this bounded delta and send it to the original iterative review carrier. These are author verification results, not self-review or an approval. No commit or remote operation was performed.

## Verified gates and same-mode sweep

- Spec: D0-contract goal and INV-D5 require recorded data and missing references to remain truthful within the selected same-version view. The requested correction conforms to those requirements.
- Mechanism: copied the original independent browser probes without editing the archive. Before production changes, the actual 4195 browser run reproduced **10/12**, with precisely the two empty-state failures. Node regression was **12 pass / 8 fail**; the eight failures cover two pages × menuPlanRef/date/mealType/mealIndex exclusion boundaries.
- Sweep invariant: a local selection cannot inherit a missing-source message from an issue excluded by that same selection. Searched both frozen siblings for `collection.coverage`, `collection.issues` and empty status branches. Both global enumeration branches were replaced. Existing raw row-level missing dish, missing ingredient, missing technique and unrecorded components notices retain their original references. Legacy generated-sheet empty branches do not use the frozen projection and were unchanged.
- Relevant-source protection: additional tests cover selected missing plans with broad and narrow selection in all three languages, plus missing recipes and unrecorded components on their original rows. No source bytes change.
- Fallback analysis: zero fallback layers were added. The repository has no `scripts/check-fallback-layers.mjs`; the bounded diff was inspected directly.

## Validation

| Evidence | Result |
|---|---|
| `red-menu-prep-review.txt` | Actual pre-fix Node 12/20; all 8 added exclusion cases fail |
| `green-menu-prep-review.txt` | Final targeted 22/22 |
| `menu-prep-review-browser-red.json` | Actual original copied browser probes 10/12 |
| `menu-prep-review-browser-original-green.json` | Same original 12 probes after fix: 12/12 |
| `menu-prep-review-browser-green.json` | Original probes + relevant missing-dish siblings: 14/14 |
| `menu-prep-review-browser-scope-matrix.json` | 24 observations: 393/1440 × Menu/Prep × zh/en/uk × empty/missing; correct local issue and language text, zero horizontal overflow |
| `green-menu-prep-review-tracked-web.txt` | All 13 tracked Web test files: 191/191 |
| `menu-prep-review-web-with-ingredient-wip.txt` | Full working-tree glob: 193/200; all 7 failures are root's concurrent, untracked ingredient tests, not declared green |
| `green-menu-prep-review-typecheck.txt` | Installed TypeScript `--noEmit`: exit 0 (empty output) |
| Diff whitespace | `git diff --check`: exit 0 |

The initial package-manager wrapper could not verify its pnpm version because its registry fetch failed. No bypass, package change or remote fetch was attempted. Tests ran with the already-installed Node test runner and TypeScript CLI. The original independent archive's historical import/store typecheck failure is not retroactively described as passing.

Browser route: `http://127.0.0.1:4195/test/team-meals-pages-menu-prep-review-browser.html`, root's stable preview with HMR disabled. Actual Chrome operations used `#run`, `#page`, `#lang`, `#scope`, `#show`; output is under `#result`, content under `#main`. The original 12 assertions are retained in the copied `team-meals-pages-menu-prep-review-probe.ts`, with two additional relevant-missing checks and manual view selectors. No browser error logs were reported.

Screenshots inspected by author:

- `menu-prep-review-empty-uk-393.png`: Ukrainian Prep, selected empty lunch; empty status and one local issue, no missing-record message.
- `menu-prep-review-missing-en-1440.png`: English Menu, selected missing dinner; original `missing-dish` reference, unknown planned count, explicit missing recipe notice.

Production SHA-256 for root's freeze check:

```text
menu.ts 8ee62b8a900654a28c069e0c95737d50f490b3dee7a27aa7a493afdf266a69ff
prep.ts b42bbe114ee47ee540ef235bae1335e453a81fb3d9670073da70ae7a2f457b16
```

This delta owns only `pages/menu.ts`, `pages/prep.ts`, the Menu/Prep test/fixture files and the `menu-prep-review*` / `red-menu-prep-review*` / `green-menu-prep-review*` evidence. Home, Import, Dish, Ingredient, shared files, Q fixtures and original source designs were not edited.
