---
feature_ids: []
topics: [team-meals, pages, menu, prep, fixed-source]
doc_kind: implementation-handoff
created: 2026-09-11
status: helpers-ready-integration-pending
---

# Menu / prep raw presentation checkpoint

What: page-owned render helpers for complete raw recipes from an explicit frozen projection. Why: the legacy numeric sheets omit incomplete recipes or seasoning details. Tradeoff: retain the current public entries with a truthful limitation notice until a verified published loader exists. Open questions: published team projection and versioned static asset integration, full browser acceptance. Next action: root binds the helpers to the approved loader, then runs the production-entry journey and independent review.

## Ownership and fixed inputs

Worktree: `canteen-os-team-pages`, branch `codex/team-meals-pages`. Initial inspection used HEAD `1770524a2bac346a87ac3e669dcd92dffc101686`; root's concurrent plan repairs advanced HEAD to `247d6815865684236ce126cc82a1223a5132865f` before final checks. This subtask changed only `packages/web/src/pages/menu.ts`, `prep.ts`, `test/team-meals-pages-menu-prep.test.mjs`, and this handoff. No commit or remote operation was made by this subtask.

Accepted layout/scope: `docs/design/team-meals-pages/D0-contract.md` and `screens.html`, using the established screens-v2/backoffice-v1 tokens. T06 requires genuine raw metadata at one version; T07 requires stale replies not to alter a later view. Original design-worktree inputs remained read-only. No new design approval is claimed.

Current C2a `createTeamMealsViewModel().loadSaved()` returns a deeply frozen original `SavedTeamMealsView` and `getAsset()` requires that original handle. It is a private fixed-source reader, not evidence of publication. `src/data.ts` still exports only loadBuild/loadPrep/loadMenu/loadPurchase; the current build script has no team target. No source fallback, invented revision, current Catalog read, or replacement published loader was added to a page.

## Exports for integration

`prep.ts` exports `FrozenMealSource`, `FrozenMealSelection`, `FrozenMealRenderOptions`, `FrozenMealRow`, `selectFrozenMealRows`, `rawQuantityText`, and `renderFrozenPrep`. `menu.ts` exports `renderFrozenMenu`.

```ts
const dispose = renderFrozenMenu(element, originalSavedView, {
  lang,
  selection: { menuPlanRef, date, mealType },
  asset: ({ owner, pointer }) => viewModel.getAsset(originalSavedView, { owner, pointer }),
  href: (kind, id) => makePageDetailHref(kind, id),
});
```

The same arguments apply to `renderFrozenPrep`. `selection.mealIndex` addresses a position inside this exact fixed plan; it is not written as a permanent row ID. Omitted selection shows only slots actually included in `projection.selection`, even though the raw projection contains complete plan documents. Multiple dishes in one meal and repeated dish/component occurrences stay separate. The source's original omitted counts, quantities, array order and records are not modified. No numeric estimates or totals are computed.

`source` structurally accepts the original C2a handle without cloning or reconstructing it. It needs `mode: real | mock` and a deeply frozen projection with a valid full source revision. The helpers label only the source version and explicit mock mode; they do not claim saved, synchronized or published state. A future published loader can provide a verified frozen projection through this same presentation boundary without treating it as a C2a handle.

The injected asset reader receives `{revision,owner,pointer}`. Results must match the projection revision. Dish, component prep and step images use their original owner/JSON pointers; no original/current URL is used as a fallback. Original image licence/author/source, raw steps, clip ranges/links, recipe provenance, role, packaging, supplier and technique information remain visible. Links reject executable protocols. Unknown fields show as unrecorded, independently from actual to-taste quantities.

Each renderer returns an idempotent disposer. It also disposes a prior render on the same element and observes element removal. Object URLs are revoked; wrong-version, failed and late image responses cannot populate another view. Caller-owned APIs/VMs are not disposed. Menu recipe expansion lazily renders the exact selected meal using the prep helper.

## Validation and limits

- Initial behavioral RED: 7/7 presenter tests failed because the required raw-source render exports were absent. After implementation, 7/7 passed.
- Additional boundary RED: unresolved plan data was represented as empty; one new test failed on the missing original plan reference. The fix renders formal projection issue locations and treats unresolved coverage as missing information, not an empty plan.
- `node --test packages/web/test/team-meals-pages-menu-prep.test.mjs`: 8 passed, 0 failed. Covers original unknown quantities/units, scope and duplicate occurrences, invalid/mutable source refusal, all raw fields, safe links, image pointers and object URL cleanup, late/wrong-version results, menu expansion and unresolved plans.
- `npm --prefix packages/web run typecheck`: exit 0.
- `npm --prefix packages/web test`: observed 151 passed, 0 failed in the shared working tree after root's plan repair commits.
- `git diff --check` for the two page files: exit 0. No matching `.pen` files or repository hotfix/fallback scanners were present. Existing root `.DS_Store` and `.poc-venv` were untouched.

The presenter tests execute real bundled page code with a minimal DOM test double and explicit external asset doubles. They are not browser/layout evidence or a real Worker roundtrip. This checkpoint is the bounded helper delivery explicitly authorized while the published source is missing. Root still owns binding the public entries, zh/en/uk × 393×852 and 1440×900 browser journeys, real deployment verification and independent review. T01–T09 and the overall feature are not closed by these tests.

Risk axes: behavior = page rendering and teardown; data = read-only raw projection; security = safe source links and revision-restricted image results; contract = fixed-source presentation, no publication claim; irreversible = none. Architecture cell: RC-D pages. Map delta: none; no new store, router, API or domain algorithm. Author verification is separate from independent approval.
