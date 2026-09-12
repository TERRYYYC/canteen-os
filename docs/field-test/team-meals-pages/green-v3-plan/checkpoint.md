---
feature_ids: []
topics: [team-meals, reference-v3, visual-validation]
doc_kind: verification
created: 2026-09-12
---

# Reference v3 — actual page delivery

## Current delivery — 08:44 UTC

Fixed product: **`11c8a981d59ecda373328d0af9655f91347e2ed9`**, packages tree `4a7caa73d0c659bfcf230c495764bc6b1bc0c7b1`. Worktree: `canteen-os-team-pages`, branch `codex/team-meals-pages`. This one entry contains the initial Plan checkpoint and the subsequent Menu/Purchase/necessary-detail update authorized after dispatch viewed and accepted the real Plan.

- Plan: accepted compact green layout, real date/Add linkage, optional counts, revision-bound photos, explicit save and purchase. Material preview now loads on request; its code read uses the existing auxiliary safety tickets and cannot overwrite another page or a later raw edit.
- Menu: photo rows, compact actual published dates/meals, optional material/count details; full recipe modal with introduction/materials/steps. All recorded ingredients, unknown/to-taste quantities, source links and original steps remain available. Missing introduction/steps are explicit. No category, rating, time or additional date is invented from the prototype.
- Purchase: real manual decisions, four exclusive counts (check / still to buy / available / bought), save and copy together, compact sources and incomplete-reference disclosures. Same-version material details show the actual record/image and keep translations and current-information navigation. Existing Prep behavior is preserved; this is not a full Prep visual redesign.

### Stable preview

[Plan](http://preview.localhost:4275/#/admin/plan/team-week) · [Menu](http://preview.localhost:4275/#/menu) · [saved local shopping sample](http://preview.localhost:4275/#/purchase/shop-2026-09-10).

Managed preview `origin=launchd`, pid 56735, started **08:35:29 UTC**, expires **16:35:29 UTC** on 2026-09-12. Cwd `/private/tmp/canteen-hifi-4275`, port 4275. Final normal development preview uses exact product source above; all **60** copied TS/CSS files were compared byte-for-byte with that source. See `final-preview-source.json`. The final restart preserved the one explicitly local saved shopping sample; reload independently showed clean state and counts **2 / 0 / 1 / 1**, with no alert. Those restored sample records are not new native saves. No production data, remote repository, reserved runtime or PWA configuration was changed.

### Fresh verification

- Exact final affected suite: **165/165**, no failure/cancel/skip, `final-targeted-tests.txt`; Web TypeScript exit 0. This is the targeted Plan/Import/navigation/Shopping/copy/detail/Menu/published set, not a rerun of the unchanged lower-layer matrix.
- Production bundle checks: **44/44** route/configuration/service-worker combinations fit the unchanged 60,000-byte limit. Final Plan gzip is **49,791 default / 49,806 HTTP bytes**; largest route is 58,755. All **25** application JS chunks remain precached. See `final-budget-default.json` and `final-budget-http.json`.
- Initial new-visual Plan was **62,284 bytes**, a real budget failure. Moving only the user-requested material preview out of the initial load fixed it. The old observation helper captured chunk filenames before Vite's preload rewrite and subsequently failed with ENOENT; `measure-final-output.mjs` observes the final writeBundle graph and measures emitted bytes, without changing product configuration or thresholds.
- Native final Menu at CSS 393×852: left gutter 20px, three rows 91px each, no horizontal overflow. All three photos decoded at original width 1200. S03 actually displays **用量未录 / 适量 / 200 g**, explicit missing description/steps, and the original same-version material deep link. Ukrainian desktop 1440×900 also inspected without overflow. Menu initial shrink-to-fit/old row padding and empty-step placement were found in the real preview and fixed before this final source.
- Native Shopping: create → explicit save → mark buy/available → save → successful native copy → mark bought → save. Three real local Worker POSTs returned 200; exact bodies/conditional headers in `native-shopping-requests.json`. Bought no longer counts as still to buy. Chinese and Ukrainian mobile inspected; long labels fit. Details retained the fixed revision and unknown values. The ingredient image in the test fixture is a deliberate solid-color asset for controlled-image verification, not an ingredient photograph.
- Native optional Plan material preview opens correctly. Two new module-wait/failure cases preserve edits and settle the original read on departure. Original count-clear/add/save evidence remains below.

Final original captures here: `menu-final-zh-mobile.jpg`, `menu-final-uk-desktop.jpg`, `recipe-final-zh-mobile.jpg`, `purchase-final-zh-mobile.jpg`, `purchase-final-uk-mobile.jpg`. No screenshot editing or pixel-resizing was performed. Initial Plan images remain below. Shared global chrome was also sampled on Prep; its published-data semantics remain unchanged.

Independent review: initial Plan `0c9caca` was approved by the original nonauthor reviewer (report `/private/tmp/canteen-green-v3-review-0c9caca/REVIEW.md`). The same original nonauthor, Codex `/root/plan_review`, has now returned **APPROVE** for exact final product `11c8a981d59ecda373328d0af9655f91347e2ed9`, with no open P1/P2. Review source is `local_cat`, subject `task:01a08db7-43f3-7952-adb5-75106389e557#green-v3-plan`, accepted source `docs/design/team-meals-pages/D0-contract.md` at `19fcb002ef29c7eee857ea1c1f829cc73356e151`. The unchanged small report is preserved as [final-independent-review.md](final-independent-review.md), SHA256 `8c322776aca572d1bf13e5578b7a76084f98fa1f6e0f3b494d44ae0c132421ca`; original archive `/private/tmp/canteen-green-v3-review-11c8a98`, manifest SHA256 `607a2cc65ac9a2589aefbb7061c9a51f95ea658daa567734be6fdea451f957b9`.

The reviewer independently passed **86/86** relevant tests, **4/4** additional probes and TypeScript; rebuilt both original configurations and verified **44/44** budgets plus all 25 application JS precache entries. All application JS bytes matched the final author builds; 231 tracked package files and 60 runtime source files matched Git. The five original screenshots were directly inspected. The reviewer did not run a separate native browser journey, so native actions above remain author evidence. The original Plan budget pending item is closed. No repair or additional local check remains for this slice. No merge, push, deployment, complete PWA/offline certification, Q acceptance, or full production acceptance is claimed.

## Initial Plan checkpoint (historical 08:10 UTC)

The following records the first authorized visible slice; pending items mentioned there are superseded by the current delivery status above.

## Scope and visual source

The dispatch spec's 2026-09-12 update supersedes the old D0 visual basis. Read-only `canteen-os-design@2f890d8f182d02e8ed4acb55a865e8aa086416dd`, Reference v3 S08 / `[data-screen="plan"]`, is the visual source. Dispatch inspected the first actual mobile Plan and accepted the direction; this checkpoint adds the requested 20px gutters, compact header import and selected-date add destination.

Actual Plan now uses sans typography, green range/date controls, compact photo rows, optional servings, progressive edit controls, visible save/purchase actions and persistent four-destination navigation. Existing draft/session/API/router contracts remain in use. No default servings, invented totals, automatic budget or customer controls were added. Shell localization/navigation is explicitly within the temporary D authorization. Architecture cell: RC-D pages; Map delta: none.

This is the first authorized visual slice, not completion of Menu/Purchase/details. Their visual alignment follows this accepted Plan direction. No merge, push or deployment is claimed.

## Preview and sample boundary

- Current stable address: http://preview.localhost:4275/#/admin/plan/team-week
- Managed cwd: `/private/tmp/canteen-hifi-4275`; status verified running, origin `launchd` at 08:06 UTC. Eight-hour lease from restart. Actual source copy is in `runtime/web/src`; per-file hashes in `runtime/evidence/source-integrity.json`.
- Vite development preview runs the actual main/router/pages, C HTTP client and real Worker code. Normal PWA plugin defaults leave service-worker registration disabled in development. Product PWA code/config are unchanged. This preview is not offline/update certification.
- The previous production-build preview on 127.0.0.1/localhost hit an existing cached update timeout. Those browser documents are not proof of latest source. This distinct development origin prevents ongoing preview rebuilds from depending on that old cache.
- Local FakeRepo only; all saves are confined to this sample. Transport foundation is Q `22eacba`; code baseline is D `fa6d1ab` with the current visual delta. No production data is modified. The visible banner states this boundary.
- Three sample rows use the fixed reference's dish names and exact food photos. Reference README identifies these images as ImageGen output; sample ImageRefs record `own` and that provenance. Recipe contents remain Q test recipes, not verified kitchen recipes. Plan photos are loaded through the normal authenticated revision-bound asset API.

## Verification

Risk: behavior medium (date/add linkage, asset lifecycle and navigation); data low (existing save contract); security/contract unchanged; no irreversible actions. No new state owner, auth, route or lower-layer API is introduced. Cat Cafe-specific gate commands and capability-tip files do not exist in this external repository; targeted local checks apply.

- Final exact-source Plan raw + shell tests: **34/34**, Node 20.20.2; `targeted-tests.txt`. Separate author Plan+Import targeted run earlier in this same round: 52/52. Header import test failed before implementation and passed after it. Typecheck passed using the Web package's installed TypeScript. A first typecheck invocation used the wrong dependency path and did not run; corrected invocation passed.
- Native actual-app flow: choose 09-09 → add a dish → row belongs to 09-09; return 09-10 → edit 8 to 11 → reject 13.7 → clear last count using keyboard → save whole plan. Two explicit POSTs returned 200. `native-save-requests.json` contains the exact request subset; the second body omits plannedServings for both blank rows and retains the newly added 09-09 row. No shopping-list write was performed.
- Actual purchase link opens the existing new-list route with plan ID prefilled. Shared Menu chrome was inspected; Menu content still has the old layout and is the next slice.
- After the final header/footer refinement, selecting 09-11 shows empty day and add destination 09-11. Three revision-bound photos load. Header Import href and bottom active Plan link are correct.
- Inspected zh/en/uk at CSS viewport 393×852 and uk at 1440×900. No horizontal overflow observed. Raw mobile capture bytes are 378×819 due to app screenshot scaling; no image editing/resizing was performed. Attached `plan-final-zh-mobile.jpg` and `plan-final-uk-desktop.jpg` are original captures. Additional en/uk mobile captures and nonhappy screenshot remain under the preview screenshots directory.
- `git diff --check` passed. No root media files added. The source is HTML/CSS Reference v3, not a .pen design.

Intentional differences from the prototype: seven real dates and preserved all/day/week scope, separate explicit save, optional per-dish count, real save/source status, protected import and utility drawer. Production bundle-size verification and independent review are still required before final code handoff; this first visual checkpoint does not assert either. Menu/Purchase/necessary details remain in active implementation scope.
