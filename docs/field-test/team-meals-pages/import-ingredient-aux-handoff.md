---
feature_ids: [team-meals-pages]
topics: [reload-safety, import, ingredient, auxiliary-operations]
doc_kind: handoff
created: 2026-09-11
---

# Import / Ingredient operation ownership and coverage

## What

This bounded D change wires the existing Import input owners and standalone Ingredient document owners to C's approved `registerAuxiliaryEdits` contract. Each real owner registers synchronously once, with its TeamMealsApi object as the boundary and a stable page/document ID. Every callback retains that handle.

Import protects original paste/CSV/mapping/line edits per plan. CSV decoding, catalog loading, and the Source-read import action each retain an individual read ticket until their own completion. Clear changes acceptance of a selected file but does not end the still-running read.

Standalone Ingredient registers Source/catalog/translation/photo decode reads and individual legacy upload/save writes. The shared `buildIngredientForm` / `submitIngredientForm` behavior remains unchanged; only the standalone owner injects task hooks and a wrapped API. Dish's shared-form use is not registered twice. A confirmed Worker rejection settles its write as failed; validated ACK settles it as completed; an unverifiable outcome retains the original unknown ticket. An exact Source match through the existing verification action settles that particular unknown save ticket.

Both page entry points acknowledge the actual registered coverage using the original `PageCtx` callback. Initial read completion/cancellation also finishes the original callback, including after authentication or render changes. No new global route/credential registry was introduced.

## Why

Previously the reload coordinator could not see the page's real raw input, local file work, translation, or standalone legacy writes. Language or navigation must not turn pending work into apparent idle, and authentication must not make an unresolved old write appear clean. A late A completion must finish only A's ticket and leave B's raw input and operations intact.

`HttpAdminApi` asserts the original session after fetching and reading response bodies. A real Worker ACK may therefore be hidden behind `session_changed`. The upload/save wrappers preserve that case as unknown because they cannot inspect the hidden acknowledgement. Pre-dispatch invalid-owner checks do not create a write ticket.

## Tradeoff

- C1/shared admin store continues to own JSON drafts, undo and handoff. Bound-store behavior is unchanged.
- Existing exact servings parsing, Import whole-plan merging, Ingredient submit order and If-Match rules are unchanged.
- The registry snapshot reads only raw-owner metadata. It does not read tokens, observe session keys, rebind, normalize input, or reconcile a write.
- Ingredient metadata counts actual registered operations. This avoids falsely declaring a ticketless busy state between a completed upload and its subsequent document save. Unknown tickets remain in the operation set.
- Source/catalog/decode/translation are reads: terminal failure or discarded results can end them. Unknown upload/save outcomes cannot be canceled merely by navigation, auth, clean metadata, or an unrelated read.
- A clean acknowledged new Ingredient owner must successfully dispose its registration before a genuine later creation gets a fresh owner. Pending, dirty and unknown creations remain owned.

## Evidence and requirement alignment

Original requirement: `docs/design/team-meals-pages/D0-contract.md`. Approved shared seams: `docs/field-test/team-meals-web-shared/C2b-aux-contract.md`, `C2b-aux-auth-contract.md`, and actual `reload-safety.ts`; optional PageCtx declaration entered D in `5d5ff7f`.

| Requirement | Evidence |
| --- | --- |
| Raw Import and Ingredient input participates in reload protection | First five new tests RED on the unconnected pages, GREEN after wiring |
| Pending reads survive language/navigation and explicit local clear | CSV, translation, photo decode, Source and catalog renderer cases |
| Old A callbacks cannot clear B or reveal old private identity | Two concurrent Import reads; canceled initialization; changed-scope snapshot spy never calls A raw metadata |
| Two old writes finish independently | Salt edit and new Ingredient pending together, A→B, first ACK still protected, second explicit rejection leaves B dirty |
| Hidden real HTTP ACK remains unknown | Actual `HttpAdminApi.uploadImage` with held fetch; auth occurs before response; original unknown write remains, no B document save |
| Unknown save ends only through existing exact-body verification | Lost ACK followed by matching Source; later raw remains dirty and unchanged |
| New-record and upload-conflict review fixes remain intact | Existing ING-R1/ING-R2 tests and all existing Import regressions retained |
| Shared Dish form not registered twice | Existing 17 Dish cases pass against the unchanged shared form contract |
| Old initialization coverage does not remain untracked | Both pages invoke captured `createPageReloadCoverage` callbacks in actual renderer tests through A→B→old completion |

`red-import-ingredient-aux.txt`: 55 tests, 50 pass / 5 new expected failures before production wiring. The subsequent extra coverage/parallel-operation tests strengthen the green regression set; they are not represented as original RED cases.

`green-import-ingredient-aux.txt`: 77 / 77 (Import 29, Ingredient 31, Dish 17). Command: `node --test packages/web/test/team-meals-pages-import.test.mjs packages/web/test/team-meals-pages-ingredient.test.mjs packages/web/test/team-meals-pages-dish.test.mjs`.

`packages/web/node_modules/.bin/tsc --noEmit -p packages/web/tsconfig.json`: exit 0. The initial pnpm launcher could not fetch/verify its pinned release; no launcher, package or lock setting was changed. Direct installed TypeScript performed the same package type check successfully.

Browser fixture: `packages/web/test/team-meals-pages-import-ingredient-aux-browser.html`, served from this worktree at `http://localhost:4195/test/team-meals-pages-import-ingredient-aux-browser.html`. Click **Run auxiliary browser probes**, inspect `#results`. Nine bounded cases use the actual two renderers, shared reload snapshot/coverage, local mocked transport, and a real HttpAdminApi transport for the hidden-ACK case. Root executed the fixture in IAB and saved `green-import-ingredient-aux-browser.json`: **9 / 9 passed**. The author reread the complete JSON. Its final snapshot intentionally remains `unknown` for the hidden old upload ACK, with only the generic `previous-session-operation` record plus the clean B owner. No new visual layout was introduced; no matching `.pen` file exists in the design tree.

## Open Questions

No implementation dependency remains within these two pages. The actual app-shell `PageCtx` callback installation remains C/root custody; this slice verifies the approved callback contract directly and does not claim the app-wide update flow is complete. This is author verification, not an independent review verdict.

## Next Action

Parent: read the browser JSON, include this bounded change in the combined D commit, then request non-author review of that exact commit. Review focus: per-owner ticket closure across auth, exact unknown-save verification, no duplicate shared-form registration, retained ING-R1/ING-R2 behavior, and original-context coverage. The author made no commit or external write.


## Frozen file identities

Base HEAD at freeze: `fa7bc8dc6bcd576065bc23b622e6118f1a17fe41`. These are Git blob hashes of the uncommitted, verified files; they are not commit IDs.

| File | Blob |
| --- | --- |
| `packages/web/src/pages/admin/import.ts` | `70e222c2c657973cd4a3044a51dea081a927ba70` |
| `packages/web/src/pages/admin/ingredient-new.ts` | `94fa6b0bc22059097f889ba9eb4eb833332d0cab` |
| `packages/web/test/team-meals-pages-import.test.mjs` | `1db6ae9be066c6c0061b736cb99939ad9599e609` |
| `packages/web/test/team-meals-pages-ingredient.test.mjs` | `dd0603017ad291623637ed8cf517c87b26603f3f` |
| `packages/web/test/team-meals-pages-import-ingredient-aux-browser.html` | `697f01dddc2dbe19187368cb4c2950dd97671092` |
