---
feature_ids: [team-meals-pages]
topics: [dish, reload-safety, auxiliary-operations]
doc_kind: handoff
created: 2026-09-11
---

# Dish auxiliary operations and coverage

## What

The existing per-document record in `createDishForm` now owns its C auxiliary registration. `prepare` creates/registers that record synchronously before Source loading; language redraw and overlapping loads reuse it. The identity is `dish-input/<route key>` with the same TeamMealsApi boundary. New-document retirement must successfully dispose a clean, settled registration. No parallel auth map was added.

Every actual asynchronous auxiliary operation receives its own opaque ticket before dispatch:

| Operation | Responsibility |
| --- | --- |
| Initial Source, catalog, both conflict-comparison reads | Individual read tickets on the captured document |
| Dish and inline Ingredient translation / photo decode | Read tickets through the existing task hook |
| Dish photo upload | One actual upload write ticket |
| Inline Ingredient upload, then Ingredient save | Separate write tickets through a captured wrapper |
| C1 Dish save and unknown-save reconciliation | Existing C1 ownership only; no duplicate auxiliary ticket |

The old `dish-save` and inline-save UI activity remains an interaction lock. It does not pretend to be an external write ticket covering C1. Metadata derives asynchronous phase from real tickets, so the interval after upload acknowledgement and before C1 save does not become invalid ticketless busy metadata.

A captured write wrapper validates an acknowledgement before settling completed, settles only recognized Worker rejections as failed, and retains network/malformed/unrecognized results as unknown. A late `session_changed` can hide a real Worker ACK, so it retains its original ticket. A known old upload completion can end A's ticket, but the captured wrapper still refuses a later B save. Ending a UI activity or an unrelated GET never clears unknown writes.

Both initial Source and catalog completion paths use the original `PageCtx.setReloadCoverage` callback. Old canceled initialization cannot leave a permanent untracked page record. A failed inline preflight read also rechecks the original operation and view before issuing a write.

## Why

Dish already retained raw photo/inline buffers and pending UI ownership, but the shared reload coordinator could not see those operations. Whole-page updates must remain protected across language, navigation, and authentication until each actual operation has a definite outcome. One old completion must not clear another pending operation or modify the new identity's input.

## Tradeoff

- C1 document writes, source locks, If-Match/If-None-Match, original value handling, validation and D-PENDING-R1 behavior remain in their existing code paths.
- The shared Ingredient form and submit algorithm are unchanged. Dish injects its own standalone task/API owner; it does not register the Ingredient page owner.
- Existing explicit local fixtures now provide a pure `peekSessionKey` matching their defined identity. Production never supplies a fallback peek.
- Failed or canceled reads end their tickets. Unknown writes remain unresolved; this slice adds no speculative recovery or automatic resend.
- The C1 authentication-sealing issue and app-shell callback integration remain C/root custody. This change does not add duplicate protection to mask either shared concern.

## Evidence

Original requirement: `docs/design/team-meals-pages/D0-contract.md`; approved contracts: `docs/field-test/team-meals-web-shared/C2b-aux-contract.md`, `C2b-aux-auth-contract.md`, actual `reload-safety.ts`, and the approved optional `PageCtx` callback.

- `red-dish-aux.txt`: 17 original tests pass; four new tests fail for absent Source/raw/aux ownership. Captured before production changes.
- `red-dish-aux-browser.json`: root ran all eight actual browser cases before the production edit: 0 / 8. Each independent iframe executes the actual renderer and shared registry in a fresh document.
- `green-dish-aux.txt`: 88 / 88: Dish 28, Import 29, Ingredient 31. Command: `node --test packages/web/test/team-meals-pages-dish.test.mjs packages/web/test/team-meals-pages-import.test.mjs packages/web/test/team-meals-pages-ingredient.test.mjs`.
- `green-dish-aux-browser.json`: root IAB execution 8 / 8, complete JSON reread by author. The hidden inline upload ACK case ends with a generic `previous-session-operation` unknown record and the independent clean B owner. The two-old-upload case clears only after both definite outcomes. C1-only save shows one saving record while the raw auxiliary owner remains idle.
- `packages/web/node_modules/.bin/tsc --noEmit -p packages/web/tsconfig.json`: exit 0.
- Scoped `git diff --check`: exit 0.

The expanded test set initially made an incorrect assumption that two overlapping loads of the same Source would issue two HTTP requests. The actual TeamMealsApi coalesces them. That test now verifies the real single request, shared registration and both render responsibilities; the separate-read test independently verifies two tickets ending one at a time. No production change was made to satisfy the incorrect request-count assumption.

Actual browser URL: `http://localhost:4195/test/team-meals-pages-dish-aux-browser.html`, worktree `/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages`, button **Run Dish auxiliary probes**, output `#results`. All transports and photos are explicit local fixtures. No real repository writes. No layout changes or new visual design surface.

Root also reran the three existing browser fixtures in fresh IAB documents against the frozen production file. The author reread every result and write body:

- `green-dish-aux-pending-regression.json`: **13 / 13** main/inline decode, translation, navigation/auth and decode failure checks.
- `green-dish-aux-validation-regression.json`: **11 / 11** local/server validation, language repaint, explicit retry, upload attribution, late raw edits, detached photo reuse and unknown upload checks.
- `green-dish-aux-slug-regression.json`: **6 / 6** visible generated slug, real saved target, explicit slug retention, duplicate rejection and old-auth translation checks.

Together with the eight new cases, the actual browser checks total **38 / 38**. Only the explicit test boundary's pure peek was added to the old fixture code; their behavioral assertions were preserved.

## Open Questions

No implementation dependency remains in this Dish slice. Independent review and C's shared authentication/app-shell integration remain separate, required work owned by the root. This is implementation evidence, not an author approval or a feature-close claim.

## Next Action

Root: commit the frozen Dish-only files and evidence, then request non-author review on that exact commit. Focus on per-document registration before awaits, terminal-proof handling, all old callbacks using the captured ticket/owner, original-context coverage, C1 not registered twice, and preservation of D-PENDING-R1 and field validation. No commit, merge, deployment, or external write was made by this author.

## Frozen file identities

Implementation started from `3812d701155c49767453d43cde82689e486703de`; shared worktree HEAD at freeze is `3eac7469a033f658893654802ad1cc21670d88db`. These are Git blob hashes, not commit IDs.

| File | Blob |
| --- | --- |
| `packages/web/src/pages/admin/dish-new.ts` | `0a4e9cd95823b77a4061496caa8866d0f2298f18` |
| `packages/web/test/team-meals-pages-dish.test.mjs` | `0aef0d0b2d8e47d4c58699a38c0439e24dc415c4` |
| `packages/web/test/team-meals-pages-dish-aux-browser.html` | `c0a5e00277200dca1d49f8493af58869e36967da` |
| `packages/web/test/team-meals-pages-dish-browser.html` | `c73fb8c17a70db278158affb130bea44aa9d0c02` |
| `packages/web/test/team-meals-pages-dish-pending-review-browser.html` | `0557110642257a7d0d17145f67b0e6afbd96776b` |
| `packages/web/test/team-meals-pages-dish-validation-review-browser.html` | `3bd0b411691802e4ebbb173d085e8a12fbfcb36e` |
| `packages/web/test/team-meals-pages-dish-slug-review-browser.html` | `45e0fb57f68c59adc7af9023fe3ce32770a67f99` |
