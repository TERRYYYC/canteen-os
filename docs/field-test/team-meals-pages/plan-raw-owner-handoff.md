---
feature_ids: [team-meals]
topics: [plan, raw-input, auxiliary-owner, browser-evidence]
doc_kind: handoff
created: 2026-09-11
---

# Plan raw-input owner preparation

What: only `pages/admin/plan.ts` changes production behavior. Its retained per-document View now owns generation metadata for invalid count strings and unapplied Add date/meal/dish choices. The existing callable renderer also exposes `readAuxiliary(id)`, a synchronous, frozen, read-only summary. No additional plan JSON copy or save path exists: the unchanged `createPlanForm` and C1 edit session remain the sole document/write owners.

Why: root requested the concrete regression “row 1 contains `2.0000000000000001`; delete row 0; the original row 1 must retain that exact raw string as row 0 and Save must remain blocked.” The original handler cleared the complete invalid map. A second real loss existed on language/route return: source initialization reset `addDate` even after the user had changed the Add choices. Both were reproduced in the initial actual-renderer tests before implementation.

Tradeoff: auxiliary dirty covers only raw values not yet consumed by C1. Range/date filters and preview state remain read-only view choices and do not change auxiliary dirty or generation. Add defaults are clean; returning a field to its consumed baseline is clean but advances generation. A successful Add consumes its selection tuple and leaves the appended JSON row under C1. Saving existing plan JSON does not consume unapplied Add choices. The auxiliary phase is `idle` because these raw operations are synchronous; C1 retains the independent saving/unknown state and must be aggregated by C. New raw input received during a C1 save remains dirty after that earlier save is acknowledged.

Open questions: formal `registerAuxiliaryEdits`, page coverage and `bindDraftStore` integration are still pending C. This delta does not call nonexistent registration, declare tracked/read-only coverage, claim PWA protection or duplicate C1 ownership. Future registration must retain the provider for every visited document, including when another document is visible; it must not register per render or drop a dirty View. Authentication continues to use the existing C1/source fences and next-render owner reset; application-wide auth/store binding is not claimed by these tests.

Next action: root may freeze this bounded checkpoint and route independent review, then connect the reviewed C auxiliary module. This is author verification, not approval. No commit or remote operation was performed.

## Accepted sources and interface

Read D0-contract in this worktree and C2b auxiliary contract from fixed commits `a175d876d829fdffacf11a7813b33523d8ba557a`, `d38366996bda33d8851fe964fba3ec2b3ab15581`, and `e487557f2f22a89c140eec4a15904c832b2e0530`; latest contract content was read with `git show e487557:docs/field-test/team-meals-web-shared/C2b-aux-contract.md`. The d891 exact safe-integer input helper and `plan-form.ts` are unchanged.

```ts
const renderer = createPlanRenderer(api);
await renderer(el, ctx, id);
renderer.readAuxiliary(id); // null when no raw View has been created for this document
// Frozen summary:
// { ownerId: `plan-buffer/${id}`, identity: {kind:'plan',id},
//   generation: number, dirty: boolean, phase: 'idle' }
```

The summary contains no token, credential hash, input text, plan body or fake source revision. Each document retains its generation on language repaint or cross-plan return; later raw events advance a renderer-monotonic sequence. Reading does not mutate it. The View stores only its existing raw map/selection fields plus the consumed Add tuple and metadata. Source initialization runs once for that View and does not reset pending choices.

## Failure-mode sweep

| Boundary | Preserved invariant |
|---|---|
| Remove before invalid row | Decrement only later raw indices; preserve exact strings |
| Remove invalid row | Consume only that explicitly removed row's raw string |
| Remove later unrelated row | Earlier raw value and auxiliary generation unchanged |
| Several invalid rows | Other strings survive removal and correction independently |
| Invalid input correction | Existing reviewed parser decides validity; accepted values flow only through C1 |
| Language/another plan/return | Same owner identity, generation and pending fields |
| Stale DOM Add/Remove/input handler | Live render/context guard prevents consuming another view's pending state |
| Incomplete/failed Add | Do not consume selection baseline or append a row |
| Successful Add | Append exactly one C1 row, then consume the pending tuple |
| Save success/unknown result | Never clear unrelated unapplied Add; earlier acknowledgement cannot erase newer invalid text |
| Read-only filter input | No raw dirty/generation change |
| C1 JSON clean with raw pending | Visible unsaved indication and precise Add/validation explanation; C1 state itself remains unchanged |

Raw-map reindexing occurs before the synchronous C1 mutation notification so repaint sees the correct association. If C1 rejects the removal, the previous map is restored. The existing exact-revision catalog/source binding, late-response fences, local candidate preview, unknown recovery, full-plan serializer and schema/count behavior were not replaced. No fallback layer was introduced; no repository fallback-layer scan script exists, so the bounded diff was inspected directly.

## Evidence

| Evidence | Result |
|---|---|
| `red-plan-raw-owner.txt` | Before production edits: 0/3; actual renderer failures for map clearing, missing metadata, Add date reset |
| `green-plan-raw-owner.txt` | Final targeted raw-owner suite: 10/10 |
| `plan-raw-owner-web.txt` | Full current working-tree Web suite: 245/245 |
| `plan-raw-owner-typecheck.txt` | Installed TypeScript `--noEmit`: exit 0, empty output |
| `plan-raw-owner-browser.json` | Actual Chrome on stable 4195: 12/12 checks |
| `plan-raw-owner-browser-language-matrix.json` | zh/en/uk × 393/1440: all Add fields retained; no horizontal overflow |
| Diff whitespace | `git diff --check`: pass |

Node tests bundle the actual page and real C1 transport, using a small DOM adapter; they are not layout evidence. The browser fixture `test/team-meals-pages-plan-raw-browser.html` imports the production renderer and C1 directly, with an intercepted fetch restricted to an explicit local fixture origin. Its repeated-letter revisions and records are visible synthetic samples, not historical/deployed evidence. The mock POST ledger verifies original quantities/service window/top-level margin, omission of unknown count, complete plan body and `If-Match` preservation. No network write reaches a backend.

Browser URL: `http://127.0.0.1:4195/test/team-meals-pages-plan-raw-browser.html`. Toolbar selectors: `#lang`, `#plan`, `#scenario`, `#reset`, `#away`, `#back`, `#release`, `#inspect`, `#run`. Product selectors exercised: `[data-focus="servings-1"]`, `[data-meal-index="0"] button`, `[data-focus="add-date"]`, `[data-focus="add-meal"]`, `[data-focus="add-dish"]`, `.tm-add-form`, `.tm-actions button`. The browser reported no error logs.

Screenshots inspected:

- `plan-raw-owner-reindexed-uk-393.png`: exact raw string remains in the remaining first row after deletion, validation and disabled Save visible. A long decimal scrolls inside the narrow input; DOM value remains exact.
- `plan-raw-owner-add-pending-en-1440.png`: Add date/meal/dish survive a cross-plan return; page explicitly marks the unapplied choice as unsaved while the JSON still belongs to C1.

Final page SHA-256: `c775fdc12e548c72c21bc4dfa403d10e100e66292f3dcf7519507b14457ebaa7`.
Last observed shared HEAD: `7529c1f763442c225382b2b0e8967e3b4cf54106`. Checks describe the current shared working-tree files, not an independently approved commit.

Owned files: `pages/admin/plan.ts`, `test/team-meals-pages-plan-raw.test.mjs`, `test/team-meals-pages-plan-raw-browser.html`, and this `plan-raw-owner*` / `red-plan-raw-owner*` / `green-plan-raw-owner*` evidence. Other pages, core, shared API/store/router, Q E2E fixtures, and original design documents were not edited.
