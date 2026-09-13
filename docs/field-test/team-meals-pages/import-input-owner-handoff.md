---
feature_ids: [team-meals]
topics: [pages, import, raw-input, lifecycle, validation]
doc_kind: implementation-evidence
created: 2026-09-11
---

# Import raw input ownership checkpoint

What: `pages/admin/import.ts` now retains each plan's paste text, CSV table and mapping, invalid servings text, and row edits within its original TeamMealsApi/session input owner. This checkpoint changes no shared JSON store, API, core parser, precise servings helper, or remote write path. No commit or independent approval is asserted here.

Why: At parent baseline `7529c1f`, switching plan replaced the only `state`; a selected CSV completion checked the old render's `live()` and was dropped on language change; `importing` and file error text belonged to the old paint. Actual renderer tests observed four failing cases (16/20). Actual in-app browser observed 7 failures (6/13), including two Source GETs after a language repaint. Root causes, initial failure assertions, and request paths are recorded in `red-import-owner.txt` and `red-import-owner-browser.json`.

Behavior:
- Navigation changes the visible owner while preserving each plan's raw state. API object, session key, and the global logout generation fence callbacks. This is page-owned raw data only, not a second draft/handoff authentication map.
- CSV read tasks remain owned across language or navigation. File success/error goes to the original raw owner. A newer file, paste, row edit, or clear invalidates acceptance of the previous file result. Errors and truncation notices render in the current language. Actual pending file reads remain busy even after their result has been discarded.
- Source-read busy state is per owner. Repainting cannot start a duplicate import action. Navigation/language replacement cancels the old import intent; it does not discard input or report the read as idle before completion. The existing I-R1 behavior continues: after the read ends, action validity derives from the current raw preview.
- Full import transfers responsibility to the shared JSON draft. Partial import leaves skipped raw input dirty. A language repaint alone does not manufacture a new edit after a full handoff.
- `ImportInputOwner.readAuxiliary()` is metadata-only: generation, dirty, idle/busy. It does not read API/store/token or mutate state. It includes CSV/Source/catalog tasks; pending CSV selections and unparsed input count as dirty. Creation occurs in `getImportInputOwner` at render entry. Clear increments generation and cancels stale file acceptance; it cannot clear a still-running task.

Verification: `node --test packages/web/test/team-meals-pages-import.test.mjs` passes 22/22; preserved tests include I-R1, exact numeric raw validation, core unparsed reason/raw, whole-plan metadata and duplicate row preservation, unknown servings, explicit clear, unconfigured mode, no POST and auth fences. `npm --prefix packages/web run typecheck` passes in the shared working tree. Scoped source/test diff-check passes. Logs were trimmed only at line endings, retaining the original results and assertions.

Actual browser: `http://127.0.0.1:4195/test/team-meals-pages-import-owner-browser.html` (existing local Vite, HMR disabled), actual Import renderer + core + TeamMealsApi, explicit GET-only mock transport. The same 13 checks now pass in `green-import-owner-browser.json`; browser error/warning log was empty. This is behavior evidence, not visual acceptance or real Worker/published deployment evidence. The fixture uses native File/DataTransfer with controllable local `arrayBuffer()` completion, then dispatches actual input/change/click events into the real renderer.

Tradeoff/open: `bindDraftStore` and `registerAuxiliaryEdits` are not imported because their implementation is not yet approved in this worktree. Parent must wire this real owner to the approved C registry and bind the shared store once per render using the same API. Raw metadata currently assumes its creating lifetime; final C integration must use the approved pure identity-check contract to keep unknown identity fail-closed without calling observing `sessionKey()` during a reload summary. Existing naked draft/handoff calls remain the previously documented I-R2 shared-owner blocker. No new auth store, fake provider, fake clean signal, file upload, publication, or remote write was introduced.

Next: parent consumes these working-tree changes, fixes a revision, and sends the non-author the exact target. After C's approved store/aux contracts arrive, migrate Import store callbacks and the existing Import/Plan fixtures to the captured bound handle and register this owner. The reviewer should retain the actual I-R2 browser probe in that final composition.

Hashes at this checkpoint:

| File | SHA256 |
|---|---|
| packages/web/src/pages/admin/import.ts | 0de7e12f24080ee5431255dbcf241b93c809032eab7be61cf4a1d0b2dd89e6ca |
| packages/web/test/team-meals-pages-import.test.mjs | 1419b34688f0b7ae53989dcf9077f61684573925a99262f72c8827f353f3c3a0 |
| packages/web/test/team-meals-pages-import-owner-probe.ts | 1fe3bb620723de9d2da734bb140913639e8aaef95591e97f48a36995a650fb80 |
| packages/web/test/team-meals-pages-import-owner-browser.html | 49298f25ee49ef6da778d7b54a80ce98efcfaa09d5c4d32c382806e11c8d6089 |
