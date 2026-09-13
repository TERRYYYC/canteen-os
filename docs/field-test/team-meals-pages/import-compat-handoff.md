---
feature_ids: []
topics: [team-meals, import, optional-servings, browser]
doc_kind: implementation-evidence
created: 2026-09-11
status: author-verified-awaiting-independent-review
---

# Import compatibility handoff

What: the existing paste/import page reads AnyMenuPlan and TeamCatalog through C1, retains optional servings, and hands the whole upgraded v3 document to the existing shared store. Why: the old page defaulted unknown counts to 50, rounded invalid preview input, and forced schemaVersion 2. Tradeoff: retain the established first-match merge and core text parser, while making explicit count deletion a separate preview action. Open questions: upstream core source-decimal handling and independent review. Next action: root consumes this page slice, the separate home slice and fixed C contracts, then performs the final integration/independent review.

## Exact scope

Only `packages/web/src/pages/admin/import.ts`, `test/team-meals-pages-import.test.mjs`, `test/team-meals-pages-import-browser.html`, the import design note and D evidence were authored by this slice. `home.ts` and its test/evidence were independently implemented alongside it by the delegated home author; their own handoff is `home-compat-handoff.md`. No store/API/router/package/lockfile/Q E2E/original source documents were modified. No commit or remote operation was performed.

Worktree: `canteen-os-team-pages`, branch `codex/team-meals-pages`. Initial inspection used `6ca272d1f34e525f6680177cffa24a51353fa828`; root applied approved C type-only AnyMenuPlan store widening as `631298aec7d89bba4ee884f4a5ef4258ddaad38d` during this work. The page now typechecks against that store without casts or parallel draft storage. Browser checks used this shared working tree plus concurrent unrelated page edits, not a claim of a frozen reviewed commit.

## Behavior and merge rule

- Untouched parsed missing count displays blank. It produces no count for a new row and preserves a matching saved row's known count.
- An own `servings: undefined` preview edit is an explicit clear; the visible “Clear servings” button makes that action available even when the field started blank. On import it removes only the first matching row's plannedServings.
- Positive safe integers remain exact. Fractions, zero, negative, nonfinite and unsafe values are not rounded/clamped/replaced. The input and error message remain visible and that row is excluded from the importable count until corrected.
- First-match `(date, mealType, dishRef)` updating remains the old rule. Existing duplicate occurrences, serviceWindow, other dates/meals, names, margin and existing date-range bounds are retained. This does not introduce persistent row identity or change parser interpretation.
- All imported plans use schemaVersion 3. Whole-plan draft handoff and one-level undo use the existing shared store; import issues no POST and does not claim saved or published state.
- C1 reads replace the strict old v2 catalog/plan boundary. Unconfigured mode returns an honest connection notice without implicit mock reads. An explicitly injected mock has the shared simulation marker.
- Preview input stays through language and detach/return. C1 auth/renderer generation checks reject stale results; an input generation check prevents a pending saved-plan read from importing over a later preview edit.

`render(el, ctx, rest)` remains the normal page entry. An optional fourth `TeamMealsApi` argument is the browser/contract test seam; omitted calls use `getTeamMealsApi()`. Pure `effective` and `mergePlan` remain private production helpers; the Node test exports them only in its bundled probe. The core `parsePlanText` implementation is always the real existing parser. Its observed source-text decimal rounding was reported to A through root, and no second parser was added here.

## Observed tests

`red-import.txt` records 6/6 failing tests against the old actual helpers, before replacement: 50 versus undefined, clear reverting to 8, fractional validity, forced v2 and retained count after explicit clear. `red-import-explicit-clear.txt` records the additional missing visible clear action on an initially blank row. The final import suite is 11/11 green.

The tests bundle the actual page, actual DOM helper, actual core parser, real C1 `createTeamMealsApi` and actual shared store. Only DOM and fetch are test boundaries. They verify full-plan import/undo, optional values, preserved metadata/duplicates, invalid preview correction, language-retained clear, stale saved-plan read, auth rebind and unconfigured truth. These tests are not browser-layout evidence.

Combined import + home targeted execution: 19 passed, 0 failed. Web typecheck and scoped diff check passed. Home's separately recorded earlier full web run was 170/170; no later full-suite result is inferred from it.

## Browser evidence

Actual CUA Chrome opened `http://127.0.0.1:4183/test/team-meals-pages-import-browser.html` and clicked the entry's Run control. Embedded browser was unavailable. A shell HTTP check could not connect through its execution boundary, but the browser loaded the real local entry and exercised its DOM. This proves the observed browser session only; no server lifetime claim is made.

Run passed at 393×852 and 1440×900 after the final production layout adjustment. It covers preserved unknown text over known saved count, real shared undo, explicit clear after a Ukrainian repaint, whole-plan metadata/other meals, fractional preview rejection, corrected integer, held saved-plan read with later input, and only GET traffic. The harness deliberately retains the import page after its actual navigation request so the shared unpersisted draft is inspectable. It is not an end-to-end saved/deployed plan journey.

Six zh/en/uk × mobile/desktop observations in `import-browser-matrix.json` show empty count, valid optional input, enabled import and exact viewport scroll width (no horizontal overflow). Screenshots are `import-{zh,en,uk}-{393,1440}.png`. The author visually inspected Ukrainian mobile and English desktop screenshots. An initial mobile long-status layout squeezed the dish name; moving the status/clear action into the existing main column fixed it without changing CSS.

`import-invalid-en-1440.png` and `import-browser-result.json` record a real 1.5 input preserved verbatim, aria-invalid true and import disabled. The same invalid input survived actual DOM detach/return. The browser error log was empty. Temporary viewport overrides were reset.

These are explicit local fixtures with a synthetic source revision; they do not establish authentic historical data, real Worker connectivity, successful repository writes, publication, visual owner approval, or independent review. The original source-decimal parser gap remains an upstream handoff item until root consumes A's approved repair.
