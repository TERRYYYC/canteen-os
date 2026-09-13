---
feature_ids: [team-meals]
topics: [menu, prep, public-entry, independent-review]
doc_kind: review
created: 2026-09-11
---

# Menu/Prep public entry independent review

Verdict: **APPROVE** the bounded Menu/Prep public-entry increment at `d31661123b23bc2a80a9c8c613b1f9947d7c5665`. No confirmed actionable defect in the inspected delta. This approval is based on fresh source inspection, 60 targeted Node checks, 44 actual-browser checks and independent inspection of all 12 final layout captures.

reviewedHeadSha: `d31661123b23bc2a80a9c8c613b1f9947d7c5665`
parentSha: `72bbb495f2cabf1528a3d0957072655c052255f7`
clientMessageId: `public-entry-review-d316611-import-owner-final-20260911`
reviewSubjectRef: `git:d31661123b23bc2a80a9c8c613b1f9947d7c5665:menu-prep-public-entry-delta`
acceptedSourceRef: `git:d31661123b23bc2a80a9c8c613b1f9947d7c5665:docs/field-test/team-meals-pages/menu-prep-published-handoff.md`
acceptedRevision: `90a8399e5bf1c7acc2af5717507c124e6f272a75`
reviewer: `/root/import_owner`
author: `/root/page_inventory`; authorized return route: `/root`
engagement: local_cat, independent, bounded. No review of this reviewer's Dish/Import/Ingredient code. No production modification, commit, subagent, external write, or Q edit.

## Immutable subject and accepted source

Production source is an exact Git archive at `/private/tmp/canteen-public-entry-review-d316611/source`. Only installed third-party dependencies are linked from the working tree; core is compiled from the archive. The following blobs were hashed from the archive and matched the target tree:

| File | Git blob | SHA256 |
|---|---|---|
| `packages/web/src/pages/menu.ts` | `b75c2700fa3ff5a61e7689cc19d5199725bc5de9` | `455bc8fbe99201551461b1e230f2f7514c859988f6b5957ea52c485b790b995d` |
| `packages/web/src/pages/prep.ts` | `bacf0ffa123ec9cf0b3a479d7fa5ee4712589e4c` | `ff2711aecce186c1cc46d759093a226d524d6869d22ace482b38c183d63ea846` |
| `packages/web/src/pages/published-meals.ts` | `5a9d7eff026464e7eafc82906743aee25819596a` | `d2285e3ae60cd0a64d4f0af5b4deda94e6a6adece72ffb57cae5c0fa486a39c1` |

Complete handoff read: `docs/field-test/team-meals-pages/menu-prep-published-handoff.md`, blob `90a8399e5bf1c7acc2af5717507c124e6f272a75`, SHA256 `a60cf63983dea8e671b60fc217a5011dad1b70758a82ba977317ba2f090a6d2f`.

Grounding, read before source review:

- D0 original goal, Menu/Prep contract, INV-D5, zh/en/uk and two required viewport sizes.
- Original design-worktree T01–T09 and C01–C12; `STANDARD-DATA-AND-ACCEPTANCE.md` SHA256 `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352` and `SCREEN-CONTRACTS.md` SHA256 `e05d43554181c4ebed52269d7f20cafd8b35d4d687e56c8ae52b127684ce3652` match D0.
- Original presenter review `7c617370bd29a4bcdd9a9beb303217d19bd6a690` and MP-R1 repair approval `d02e7178dc0f56e7407d67eceb54cb41d90b1307`, both read in full. MP-R1 approval is limited to the frozen helpers; it did not approve these public entries.
- Approved C release `4ebaa9410634e7850200037341b497a7b55773da`: C2b contract blob `9ecd19a789442ddfbf89f676593aa8f032cdd474` and public reader blob `6023b9ab30bbc194052fc3ab1693f5f4c463d5ea`. Actual consumer behavior is checked against the original branded handles, projection pointers, three asset outcomes, version boundary and empty/error distinction.

Seven original ignored logs were subsequently supplied by evidence-only commit `97068490aa02cd1578c8164f3c8577183f2da63a`. Only that commit's `published-evidence` directory was read into the archive; no production/test source was replaced. All 20 entries of the original author's SHA256SUMS independently match (`author-manifest-check.log`). The four RED logs preserve 18 whitespace-only lines and their custody note. The d316611 delta's own diff check passes (`diff-check.log`); no clean full-history/raw-log whitespace claim is made.

## Inspection and findings

No confirmed P1/P2 in the reviewed production delta.

The new page helper calls the public reader with the original Publication and keeps the returned original PublishedTeamPlan in the asset callback closure. Its raw presentation wrapper holds only the original projection; it is not passed in place of a branded reader handle. No Catalog, Worker, legacy sheet, alternate plan or new revision fallback is introduced for team failures. Projection error code/stage/known revision remain visible; no-plan and named empty-plan are separate states.

Material deep links select a unique matching original row or explicitly ask for a source when several rows match. A recipe's reference click carries its original row into Prep using publication-scoped choice memory. Repeated Menu occurrence clicks preserve the original mealIndex across the existing hash and language redraw. The memory stores presentation choices only, with no cloned document or new persistent row identity.

Dish/ingredient and component/step requests preserve original projection positions; techniqueRef resolves the returned projection array position rather than producer document position or ImageRef.src. Available assets become object URLs, external-unpinned remains an explicit source link without an image request, and absent ImageRefs remain unrecorded. Late original publication outcomes and image work are fenced by the original renderer/element lifetime. Same-host repaint disposes original object URLs. Existing MP-R1 selection logic and complete raw steps remain unchanged by material/timing filters.

## Fresh independent checks

- Archive core build: exit 0, `core-build.log`.
- Archive targeted suite: **51/51**, `targeted.log` (16 public-entry + 22 original presenter + 13 C public-reader regressions).
- Reviewer-authored public-entry suite: **9/9**, `independent-node.log`.
- Archive Web TypeScript: exit 0, empty `typecheck.log`.
- d316611 diff whitespace check: exit 0, empty `diff-check.log`.
- Complete Web 388/388 is retained as author evidence only; this reviewer does not claim a separate full-Web rerun.
- Actual-browser original suite rerun: **27/27**, `author-browser-rerun.json`; complete output independently read.
- Reviewer-authored actual-browser checks: **17/17**, `independent-browser.json`; every result, route/row snapshot, asset state and production fingerprint independently read.
- Final layout matrix: **12/12** JPEG captures independently viewed, paired JSON and combined `layout/measurements.json` independently checked. All match page/language, actual 393×852 or 1440×900, rich revision `85d1d143be7fe5dae39fe76fa8db8cee60920a26`, three complete original steps in DOM, and zero document horizontal overflow.

Nine independent Node scenarios, using actual public renderers, router parsing and C reader:

1. Percent-encoded date passed through actual parseHash, fresh second-dish-only ingredient in all three languages, and a separately fresh shared ingredient requiring explicit choice.
2. Second repeated Menu occurrence → its ingredient → Prep → original Menu detail retains row index and recorded count.
3. Rich formal producer fixture verifies strict original plan handle equality for every asset call, dish/ingredient/component/step pointers and two or more technique image positions. Timing filter removes component 0 while component 1 still uses original index 1 and all original steps remain.
4. Ingredient filter retains unknown qty, unscaled original quantity explanation, original step order and source semantics.
5–6. Both public entries preserve invalid JSON/MIME, wrong revision and stale branded-handle errors without empty/legacy fallback.
7–8. Both entries retain nonempty B after an old A projection rejection; B's own asset settlement is awaited before taking the comparison snapshot.
9. All previous URLs are revoked on an explicit same-host language repaint; calls use the same data root with omitted credentials.

Reviewer harness lives only in the temporary archive: `review-public-fixture.mjs`, `review-public-extra.test.mjs`, `review-public-browser.html`, `review-public-browser-server.mjs`. The rich variant edits a temporary fixture Git repository and invokes the approved A runBuild to produce a genuine isolated commit revision; no copied/fabricated branded view is supplied. Existing Q files are not edited. Images are explicit 2×2 test PNGs, not authentic recipe imagery or historical publication evidence.

Two reviewer harness failures are preserved and excluded from product RED: `independent-fixture-setup-failure.log` records a newly added component prep object missing its required techniqueRef; the temporary input was corrected to satisfy formal schema. `independent-probe-wait-failure.log` records taking a B DOM text snapshot before B's own images finished, then comparing after legitimate image completion; waiting for B asset settlement corrected the probe. Neither required a production change.

## Browser and visual provenance

The exact archive is bundled into the local fixture at `http://127.0.0.1:4251/`, without HMR. The original 27-case browser suite is retained in the review copy, with actual shared parseHash used by its page context; an independent 17-check button adds native route clicks/Back, strict handle/pointer assertions, genuine PNG decode and late A404/nonempty B checks. The 12-frame matrix covers Menu recipe dialog and Prep × zh/en/uk × 393×852 / 1440×900 using the richer producer input. This fixture exercises the actual page entries and router parser; it is not the application's index/main or a real SW/Worker journey. Root's separate main/PWA reviewer owns that integration.

This reviewer's CUA/IAB is unavailable. `/root` has been asked only to operate the supplied local fixture, save complete JSON and images, and make no review judgment. Assertions, source inspection and visual interpretation and this final verdict belong to `/root/import_owner`. Author screenshots were also independently inspected: Ukrainian narrow Prep and English wide Menu dialog have readable controls and source/quantity labels, but they do not substitute for the complete new matrix.

Seventeen additional browser checks cover three-language percent-encoded date/material deep links; explicit multi-source choice; second repeated Menu row → material → Prep with row index 1; native browser Back restoring that occurrence; dialog close releasing scroll and inert state; strict original plan identity and all original asset pointers; returned technique index mapping; all 13 available PNG images decoding in the native browser; timing-filter pointer preservation with all three steps; unchanged missing quantity/serving source bytes; both entries retaining B when old A fails with 404; and external-unpinned images staying explicit links without an HTTP image request. Both JSON files identify exactly the three production hashes above.

All 12 final images were individually viewed: Menu recipe dialog and Prep in zh/en/uk at both widths. Titles and recorded/unrecorded quantities remain readable, long English/Ukrainian text wraps, and no document-level clipping or overlap was found. At narrow width the existing preparation-time row scrolls within its container; the long recipe scrolls vertically. The fixture's 2×2 image markers are intentional synthetic inputs. The captures show the initial viewport; complete below-fold steps are established by DOM/browser assertions, not by claiming they are visible in each screenshot.

An initial layout probe read the prior language before asynchronous rendering finished, and a subsequent retry was likewise early. The first JSON/JPEG pair is preserved as `layout/intermediate-menu-en-393-stale.*` and excluded from the 12 final frames and product RED claims. Final captures were taken after the programmatically checked page/language matched, and the reviewer verified each paired JSON and actual image. No production change was made for this capture timing correction.

Temporary port 4251 was stopped after evidence collection. `EVIDENCE-SHA256SUMS` and `review-evidence.json` freeze the report, local probes, logs, original browser output, final matrix and retained intermediate artifacts. Dependencies remain external links for execution; the production source fingerprints are fixed separately above.

## Five-tuple

What: bounded independent review of the d316611 public Menu/Prep entry integration.

Why: preserve raw original data, source selection and same-version asset boundaries when replacing the legacy-only public branch.

Tradeoff: reuse approved presenters and C algorithms, with reviewer-only controlled transports and formal producer fixtures. Do not self-review Dish/Import/Ingredient, reapprove C/main/PWA or infer real publication/L2 from local data.

Open Questions: none for this bounded delta. Full application main/PWA integration, production data acceptance and upstream C behavior remain outside this approval; the 388-test full-Web result remains author evidence.

Next Action: `/root` may consume this APPROVE for the exact d316611 three-page delta and preserve the frozen evidence. A production revision would require a new scoped review. No production fix is requested.
