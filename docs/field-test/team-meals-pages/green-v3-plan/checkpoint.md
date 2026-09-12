---
feature_ids: []
topics: [team-meals, reference-v3, visual-validation]
doc_kind: verification
created: 2026-09-12
---

# Reference v3 — actual Plan checkpoint

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
