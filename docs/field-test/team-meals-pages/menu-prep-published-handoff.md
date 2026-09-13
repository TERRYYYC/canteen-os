---
feature_ids: [team-meals]
topics: [pages, published, menu, prep, assets, lifecycle]
doc_kind: implementation-handoff
created: 2026-09-11
---
# D public Menu / Prep wiring — author handoff

## What

The actual `menu.render` and `prep.render` now explicitly branch on C's verified Publication. Team publication uses `ctx.data.loadPublishedTeamPlan` and its original frozen projection, with `ctx.data.loadPublishedAsset` receiving the original branded plan handle on every call. Legacy still uses its existing renderer and quantities disclaimer. No shared C/API/core/Worker/router/package source changed.

Started after approved C `413022734f07921397d223f7b8c6280dcc9fe0ae` was merged as `3e0faf9e6f205cf0aebc8948eb3eb1ec017f727f`. Subsequent approved main-only C handoff did not change the consumed reader ABI. Working HEAD at handoff: `72bbb495f2cabf1528a3d0957072655c052255f7`; D files remain uncommitted. Exact executed page hashes appear in `published-evidence/browser.json`, and the complete file manifest is `published-evidence/SHA256SUMS`.

Production ownership: `pages/menu.ts`, `pages/prep.ts`, new `pages/published-meals.ts`. The new helper exports `renderPublishedMeals(...)`, returning false only for an explicit legacy publication. Existing frozen helpers remain usable for saved/mock sources; `FrozenImageResult` admits the real `PublishedAsset` union and the previous `RevisionAsset`. Options add original-row recipe links, reference click handling, ingredient selection and raw timing selection.

## Why

T06/T07 previously stopped at frozen helper presentation: public entrypoints always called legacy sheets and could not show the real published raw projection. This change preserves complete original recipe components (including seasonings), original quantities/optional counts, steps, notes, source/video links and recipe timing. It never recalculates or displays estimates/totals. Published identity and builtAt come from the reader handle, distinct from saved/draft state.

Dates and meal controls use the original projection selection. Menu retains its date/dish hash, meal memory, recipe dialog, back/close handling and keyboard focus. Repeated same-dish rows retain their original mealIndex through a clicked recipe link and language repaint. Prep retains date/meal/ingredient hash syntax, adds explicit dish selection within a meal, and retains selection across language and date return. A fresh ingredient link uniquely matching the second dish selects that exact row; multiple matching dishes require source selection. Menu recipe ingredient clicks retain their exact original row into Prep. No hash segment is reinterpreted as dish ID.

## Tradeoff and bounded behavior

- Navigation memory stores choices only, in a WeakMap keyed by the original publication. It neither clones a projection nor stores a second document. A new publication starts a new choice scope.
- Normal empty manifest, named empty plan, projection file errors, wrong target/version and changed publication are distinct. Failed team reads never fall back to Catalog, Worker, legacy sheets, another plan or a new revision.
- Publication warnings preserve original kind/code and raw fields in a disclosure. Existing collection issues and local-empty MP-R1 logic remain unchanged.
- Asset requests map dish and ingredient owner/pointers into original projection pointers. Technique requests find techniqueRef in the original returned techniques array; they never reuse the original techniques JSON document index or match by image URL.
- `available` displays Blob object URLs; `external-unpinned` explicitly shows an unpinned source link with zero image requests; absent ImageRef says image not recorded; failed reads say that version's image is unavailable. Original ImageRef metadata stays unchanged. Ingredient images are now displayed from the same handle.
- Outlet/render lifetimes dispose child views and object URLs. A→B late projection success/failure and late original-image bytes cannot repaint B. The page never calls fresh or clears shared reader state on language/route changes.

## Evidence

All evidence here is **author verification**, not independent approval or deployed field evidence.

- Initial environment failures were excluded from RED: root `node_modules/pngjs` lacked its existing pnpm-store link, and core/dist was stale. Restored only the ignored local link and rebuilt core/dist; package/lock/source unchanged. Setup/probe chronology and raw-artifact limits are recorded in `published-evidence/environment-history.md`.
- Actual entry RED: 9 checks, 2 legacy pass / 7 team fail (`entry-red.log`). The real `createPublishedData` issues every branded handle from an approved A `runBuild` output.
- Further observed RED: absent-image copy conflated with unavailable (9/10); repeated menu row selected row 0 instead of 1 (11/12); three second-dish/shared-ingredient entry failures (12/15). Logs retained beside the first RED.
- Final targeted Node: **51/51** = D public entry tests (16), original frozen helper regression (22), C published-reader regression (13). `targeted-green.log`.
- Final complete current Web suite: **388/388**; typecheck and `git diff --check` pass. `full-web-green.log` / `typecheck.log`. No repeat run to hide failures.
- Final actual Chrome browser: **27/27**, including menu dialog/back, original PNG decode, empty/missing/error states, A→B held reads, second-dish and ambiguous ingredient navigation, images and zh/en/uk. `browser.json` includes exact executed source hashes and genuine isolated fixture revisions.
- Earlier browser image-decode probe was 21/22 because it queried offscreen lazy images before loading. The fixture now scrolls each image into view and awaits actual browser decoding. This was a fixture wait issue, not asserted as a production image regression.
- Actual layout: 393×852 Ukrainian Prep and 1440×900 English Menu dialog, document horizontal overflow 0 at both widths. Dialog scroll area 796px with 4631px content, 3 original steps; close control 44px. `layout.json`, `prep-uk-393.png`, `menu-en-1440.png`.
- IAB was unavailable to this agent; browser evidence was captured with the connected Chrome surface. Root owns separate actual-main/IAB/PWA checks. This slice does not claim full application/PWA or remote publication approval.

Reproduce Node:

```sh
node packages/core/node_modules/typescript/bin/tsc -p packages/core/tsconfig.build.json
node --test packages/web/test/team-meals-pages-published.test.mjs packages/web/test/team-meals-pages-menu-prep.test.mjs packages/web/test/published-data.test.mjs
node packages/web/node_modules/typescript/bin/tsc --noEmit -p packages/web/tsconfig.json
```

Browser: `node packages/web/test/team-meals-pages-published-browser-server.mjs`, then `http://127.0.0.1:4220/`, button `#run`. Use `D_PUBLIC_PORT` for a different free port. Server binds localhost only, uses temporary generated output, and has no HMR. This is a foreground session, not a durable hosted deliverable. The toolbar exposes source/page/language/fault controls, hold/release and refresh. `#results` contains test outcomes. Primary page selectors: `[data-publication-state]`, `[data-source-revision]`, `[data-recipe-link]`, `[data-recipe-index]`, `[data-dish-index]`, `[data-recipe-meal-index]`, `[data-ingredient-source-choice]`, `[data-component-index]`, `[data-step-index]`, `[data-asset-state]`.

Browser inputs use the existing C fixture factory plus D-only `multi-row` / `multi-dish` variants: edits are explicitly made to an isolated fixture Git repository, committed locally to obtain a genuine revision, and passed to the real A producer. They are not historical/production recipes or fake branded views. 2×2 colored images are explicit test byte fixtures.

## Open questions / next action

No known blocking implementation gap remains in this slice. Root should freeze these exact hashes, give the fixed commit and this handoff to a non-author reviewer (import_owner), and then consume its verdict. Review should especially recheck ambiguous/second-dish deep links, original technique index mapping, empty versus missing and late replies. No author approval, commit, remote write, deployment or full application acceptance is claimed.
