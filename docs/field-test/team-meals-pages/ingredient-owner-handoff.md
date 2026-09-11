---
feature_ids: [team-meals]
topics: [ingredient, c1, raw-buffer, auxiliary-writes, auth, review]
doc_kind: implementation-evidence
created: 2026-09-11
---
# Standalone ingredient read compatibility and owner lifetime

Author: `/root/page_inventory/home_compat`. Root directly assigned this bounded work after the prior Dish fix was frozen. This is author verification, including the browser run performed by root on the author's fixture; it is not independent approval.

## What

Production changes are limited to `packages/web/src/pages/admin/ingredient-new.ts`. Standalone reads use the supplied/default `TeamMealsApi` for both ingredient source and the dual-format catalog. A catalog containing v3 dishes now supplies the existing narrow ingredient form with its ingredients/suppliers. Unconfigured mode exits before legacy `getApi`; simulation is explicitly labelled and cannot translate/upload/save.

Standalone raw drafts, requests, clicked snapshots, known file baselines and unknown outcomes now belong to records partitioned by API instance, captured session and document. A language redraw or hash navigation changes the mounted view without deleting the record. Numeric strings such as `12,`, photo blobs/attribution and later text edits are retained. Before-unload protection covers offscreen dirty/busy/unknown records. Old-session callbacks cannot update the current view or start a subsequent ingredient write under the new session.

The existing legacy `uploadImage` and `saveIngredient` methods still perform the writes. The shared `submitIngredientForm` implementation is unchanged; standalone supplies a snapshot form and guarded methods. Only the clicked body is acknowledged, while edits made during the request stay dirty and use the acknowledged blob SHA for the next explicit save. Unexpected or malformed responses remain unknown. A save can be confirmed only by a force source read matching the submitted body. An unknown upload has no sufficient read-only witness in the available API and remains protected without an automatic retry.

Root explicitly authorized the only shared-form extension: optional `IngredientFormOpts.onTaskStart(kind: 'photo' | 'translation') -> { valid(): boolean; finish(): void } | null`. No hook preserves the old shared behavior, null declines a task, validity is checked before async result mutation, and finish runs in finally. Standalone installs the hook. Root owns any later Dish inline wiring; this author did not edit Dish for this task.

## Why

Original source `04afd9421de571a7295deabdfa4b4e049d281a26` invoked the legacy mock before checking configuration, discarded drafts on hash navigation, and reset paint-local saving during language changes. The strict legacy catalog reader rejected v3 dishes before supplying suppliers/duplicate checks. The first actual-renderer run reproduced seven failures out of nine assertions; language/session controls already passed and were retained as regression coverage.

## Tradeoff and boundaries

- No new backend/write API or conditional semantics were introduced. Existing ingredient saves still use optional legacy `If-Match`; there is no invented C1 ingredient writer or `If-None-Match`. New-record duplicate checks now require a readable C1 catalog, but this is not an atomic create guarantee.
- Raw buffers and auxiliary outcomes are in-memory page records, not durable storage. Unknown operations are not disposed or silently changed to clean. Prior-auth records are quarantined from current rendering and writes.
- C2b `registerAuxiliaryEdits` and reload coverage wiring remain pending the approved implementation. Each real record already exposes generation/dirty/idle-busy-unknown metadata through `readAuxiliary`; no fake registry or coverage claim exists.
- The approved docs-only `bindDraftStore(teamApi)` contract `98dbafc1c8003d3992f0df0e58e6f0c19c19e3a0` was read. Its implementation is not imported speculatively. Root will replace the existing standalone `takeHandoff` call with the formal captured bound handle; current handoff authentication is not claimed closed.
- Browser verification uses the production renderer/shared form, actual browser image decode and real C1 reader over an explicitly local simulated transport. It does not validate real Worker writes, full responsive layouts or rollout authorization.

## Evidence

- `red-ingredient-owner.txt`: original renderer, 7 fail / 2 pass, recorded before owner replacement.
- `red-ingredient-hook-original.txt`: five real shared-form/renderer assertions replayed against the frozen original source. This is an original-source negative control, not a claim that every hook assertion preceded the first hook edit.
- `red-ingredient-malformed.txt`: 2 additional failures before malformed/unknown-response repair.
- `red-ingredient-validation.txt`: field validation focus regression before repair.
- `green-ingredient-targeted.txt`: 17/17 targeted tests; production renderer, actual shared form, both HTTP readers and a DOM presentation double.
- `green-ingredient-owner.txt`: full Web 228/228 and TypeScript passed at the final check; `git diff --check` passed.
- Root observed and reported a pure Dish-controller import regression caused by eager window listeners. The listeners now install only on standalone render; Dish 17 tests and Ingredient 17 targeted tests pass. Shared `submitIngredientForm` extracted body is byte-for-byte unchanged from the original source.
- `ingredient-owner-browser.json`: root clicked `#run` on `http://127.0.0.1:4195/test/team-meals-pages-ingredient-browser.html`, all 8 actual browser probes passed. Includes mixed catalog, unconfigured/simulation, raw buffer, immediate photo busy, one upload across language/navigation, snapshot preservation and next If-Match, unknown save verification, unknown upload retention, late translation, auth isolation.
- The author's two CUA initialization calls timed out before any fixture was executed. These are tool connection failures, not product test failures. Root then completed the browser verification on the no-HMR preview.

## Open questions / Next action

Root can commit the frozen bounded files and evidence, then hand the resulting exact head to a non-author reviewer. After C's approved implementation arrives, wire the real per-record auxiliary metadata, explicit tracked coverage, and captured bound draft store. Do not report legacy ingredient writing as migrated to C1 or claim every auxiliary owner integration is complete.

Frozen SHA-256:

| File | SHA-256 |
| --- | --- |
| `packages/web/src/pages/admin/ingredient-new.ts` | `6741b6e77754b039b5d6ea60284ef7203d1037ddf193f1d853530e0048b044bb` |
| `packages/web/test/team-meals-pages-ingredient.test.mjs` | `14c5d93569d866bbfcf855ddfbf396abd6140e6bd1284eebf6708cd1c2c704ef` |
| `packages/web/test/team-meals-pages-ingredient-browser.html` | `dd3b096337833505b5699915af274e6d097a26e12fc2f3cae7e236e21832486a` |

Current branch is `codex/team-meals-pages`; observed HEAD while finalizing evidence was `d5f05f98847bbac31d05c5c5457fb8c7fb4ee1b1` (other owners committed parallel work). This author made no commit or remote mutation.
