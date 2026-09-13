---
feature_ids: []
topics: [team-meals, green-v3, independent-review]
doc_kind: independent-review
created: 2026-09-12
reviewerIdentity: "Codex /root/plan_review — original nonauthor"
reviewSource: local_cat
reviewedHeadSha: 11c8a981d59ecda373328d0af9655f91347e2ed9
reviewSubjectRef: task:01a08db7-43f3-7952-adb5-75106389e557#green-v3-plan
acceptedSourceRef: docs/design/team-meals-pages/D0-contract.md
acceptedRevision: 19fcb002ef29c7eee857ea1c1f829cc73356e151
engagement: iterative
verdict: APPROVE
---

# Green v3 — Menu, Purchase/details and optional Plan preview

**APPROVE exact `11c8a981d59ecda373328d0af9655f91347e2ed9` for this additional slice. No open P1/P2 findings.** Compared with the previously approved `0c9caca2d4fa44ddf3776f6c4ebfa59cecb35ebf`. This includes independent final production-budget verification; it does not certify PWA/offline/native update behavior, complete Prep visual redesign, Q acceptance, live Worker operations or deployment.

Reviewer is original nonauthor Codex `/root/plan_review`, returning through local_cat to `/root`. Accepted D0 source/revision remains the exact field above, with dispatch-authorized continuation to Menu/Purchase/necessary details. I read the fixed green Reference v3 `canteen-os-design@2f890d8f182d02e8ed4acb55a865e8aa086416dd` Menu/detail/purchase structures. Team behavior deliberately retains original recipe quantities, optional counts and human purchase decisions; prototype headcounts, automatic stock/budget and customer functions were not introduced.

## Scope and assessment

Ten production files change: optional Plan preview module and its consumer; Menu and its CSS/new recipe wrapper; published-page presentation; Purchase/candidate/details presentation and CSS. Four associated test/fixture files change. API, auth, editor session, router, core, Worker, configuration and dependencies are unchanged. Risk is medium for asynchronous code reading, DOM movement and summary counts; low for data; other contract/security behavior unchanged; no irreversible actions. RC-D, no ownership/map change.

- **Menu information remains intact.** The wrapper calls the original frozen recipe presenter and moves its nodes into introduction, ingredient and step panels plus disclosures. It retains original component/step indices, quantities, three-language records, technique and media provenance, safe source links, missing states and the original disposer. The wrapper does depend on the presenter's existing child order, but the fixed source and independent comparative probes agree; this is not an open defect.
- **Assets remain version-bound.** Public thumbnails use the original validated published handle. Missing, external-unpinned and failed pinned assets remain distinct. Completion cannot attach to a disposed/replaced view. Recipe images continue using the original producer callbacks and disposal after their DOM nodes move. No current-version image fallback was added.
- **Purchase totals are mutually exclusive manual states.** Check and Available count their own decisions; Buy excludes bought items; Bought includes only buy+true. The existing test exercises 4/0/0/0 → 3/1/0/0 → 3/0/0/1 → 2/0/1/1 without issuing a write for local decisions. Existing save/rebase/unknown/clipboard behavior stays in the original controller. All source and calculation reasons remain available in disclosures; quantities are not recalculated by the new presentation.
- **Plan preview adds only a code-read operation.** It uses a captured auxiliary handle/ticket, not another save owner. Its successful result is a pure module reference; rendering reads the current draft/catalog/selection. Late old-page/auth completion settles its own ticket without painting the current page or clearing its separate pending operation. Failure releases loading, retains raw values and permits ordinary Save. Module failure in these tests is an explicit injected import boundary, not a claim that a failed native import can recover at the same URL.
- **Visual review:** viewed five original screenshots, copied unchanged under `consumed-visual/`: Chinese mobile Menu, Ukrainian desktop Menu, Chinese mobile recipe, Ukrainian mobile Purchase and Chinese mobile ingredient detail. Compact photo rows, green navigation/actions, recipe hero/tabs and the four decision cards follow the accepted direction. The recipe image shows separate unrecorded/to-taste/200 g entries, and Purchase shows 2/0/1/1. The ingredient's red square is visibly the controlled fixture asset, not a production food-photo claim. Source/translation disclosure and current-editor links remain available.

## Independent verification

Executed in exact archive `/private/tmp/canteen-green-v3-review-11c8a98` using actual Node **v20.20.2**. No production or author test changed. Existing dependencies were reused read-only; the already-built core from the prior archive was reused only after Git proved core unchanged.

| Check | Result |
|---|---|
| Five relevant original test files: Plan raw, published pages, shopping raw, details, shopping copy | **86/86**, 0 fail/cancel/skip |
| Four additional reviewer probes | **4/4**, 0 fail/cancel/skip |
| Web TypeScript | exit 0 |
| Independent default/HTTP original-config builds | exit 0 |
| 11 initial paths × two configs × SW/no-SW | **44/44 ≤ 60000 gzip bytes** |
| Preload/precache | 13 emitted preload groups per config; 25/25 app JS precached; 53 entries per config |

The four reviewer probes compare every nonempty original recipe text leaf, every link, original quantity and component/step identities through Menu hierarchy in zh/en/uk; check missing dish and empty recipe states plus original moved-image disposal; exercise old-auth A/B concurrent module reads; and retain invalid raw through module wait and a language remount. They use unchanged real-renderer/API harnesses and explicit DOM/module transport boundaries, not native layout/decoding claims. The original 86 includes changed cases and relevant earlier protections; the author's separate 165-case report is not presented as an independently rerun 165.

## Budget closure

The first reported Plan budget regression was caused by statically loading the optional material preview. The fixed code defers that existing calculation/presenter until the user requests it. I independently rebuilt both configurations using the supplied observation-only `writeBundle` helper, then parsed emitted JS imports, Vite preloads and the final service worker with a separate graph reader. Prep's null facade and immediate Workbox are included. No production configuration, threshold or precache changed.

| Route | Default SW / no-SW | HTTP SW / no-SW |
|---|---:|---:|
| Prep | 33211 / 30868 | 33209 / 30866 |
| Menu | 41166 / 38823 | 41164 / 38821 |
| Purchase | 55697 / 53354 | 55712 / 53369 |
| QR | 21593 / 19250 | 21591 / 19248 |
| Locked admin | 21101 / 18758 | 21095 / 18752 |
| Home | 56010 / 53667 | 56062 / 53719 |
| Plan | **49791 / 47448** | **49806 / 47463** |
| Import | 52094 / 49751 | 52110 / 49767 |
| Ingredient | 50922 / 48579 | 50938 / 48595 |
| Dish | 58740 / 56397 | **58755 / 56412** |
| Publish | 57079 / 54736 | 57128 / 54785 |

The tightest final initial entry is HTTP Dish, with **1245 bytes remaining**. Plan now has 10194 bytes remaining in HTTP. Each independently built app JS file exactly matches the corresponding root final build bytes (25/25 per configuration). SW byte identity is not asserted because formal local-data metadata can differ between builds. The older generateBundle observer's filename failure was a reported measurement-tool issue; this review used final writeBundle names and had no build/measurement failure.

## Provenance and limits

`reviewer-integrity.json` verifies all **231 tracked package files** against Git, unchanged accepted source, all **60** current preview source hashes against Git, five raw screenshot hashes and 50 matching emitted app JS hashes. The preview is root-operated actual main/C/Worker with local FakeRepo in Vite development mode, not a new reviewer-driven native session. The provided saved/manual-decision/copy journey is author evidence; the current runtime ledger is not treated as a preserved replay of that earlier journey. No native all-language/full-layout matrix is inferred from these five images.

`COMMANDS.md`, raw test/build/measurement logs, two new reviewer probe sources, final graph/size reports and copied original screenshots are listed in the small `manifest.json`. A read-only Git diff command initially targeted the nongit archive; it returned usage output and changed nothing. The exact diff was already captured from the repository and all subsequent verification used the fixed archive. No product/test assertion or failure evidence was rewritten.

No additional repair is requested. This closes the new local visual/behavior/budget slice against the accepted source; broader release and acceptance decisions remain with their assigned owners.
