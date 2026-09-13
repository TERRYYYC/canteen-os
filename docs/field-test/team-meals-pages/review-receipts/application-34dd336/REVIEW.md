---
feature_ids: [team-meals]
topics: [independent-review, application, pwa, repair]
doc_kind: review
created: 2026-09-11
---

# Independent fixed application repair review

**Verdict: REQUEST_CHANGES for the actual-main/PWA composition.** One new P2 remains: APP-MAIN-R3, the first-installed document's waiting-worker activation does not complete the approved reload. **APP-MAIN-R1 and APP-MAIN-R2 are closed at this SHA; the D ACK/type/text delta is approved.** These local approvals do not imply D1, T01–T09, L2 or deployment acceptance.

- reviewedHeadSha: `34dd3364ad9397cac3ded4b8ee5460dac09fc879`
- parentSha: `5acd82cb6c9dda2acb18c656cb56b9e14eb214df`
- review engagement: iterative local_cat; reviewer `/root/plan_review`, non-author
- exact archive and evidence: `/private/tmp/canteen-app-r2-review-34dd336`
- production edits by reviewer: none; root workspace edits: none; remote operations: none

Root performed browser clicks and raw-output capture following reviewer-written fixture/button instructions. This reviewer designed the probes, inspected the exact source and complete resulting JSON, independently viewed the navigation screenshot, and owns this verdict. Author evidence was not treated as independent approval.

## Scope and accepted inputs

Original dispatch and `docs/design/team-meals-pages/D0-contract.md@ad5651787be4a54ef28060f6345f61187e78cd9d`; original acceptance-file SHA256 `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352` including T08 no guest entry. Approved navigation contract `cc9248d59cae50b5aa9774bee5054e5df62480e5`, implementation `8bb39a3d11f281405d3da2c2f42be3091aa111ea`, complete history `f6ac5761a31c1a2caa2d163d646dabc8b602321a`. Approved public Menu/Prep input `d31661123b23bc2a80a9c8c613b1f9947d7c5665`.

The candidate's four production files remove duplicate private beforeunload listeners, retain route cleanup/raw/maps/auth/tickets, add primitive-string commit proof in Ingredient and Dish-inline Ingredient ACK checks, and correct three packaging hints. No C/shared/public source is modified by this repair commit. Actual composition includes the approved C navigation and public entries. It excludes subsequent moving commits and unreviewed production changes.

## Findings and closure

| Item | Exact-candidate decision | Evidence and practical limit |
|---|---|---|
| APP-MAIN-R1, P2, shared guest navigation | **Closed / APPROVE** | Actual zh/en/uk team labels, verified live first-plan route, real auth lock/no private GET, failed reader removes stale target, successful reader restores it, formal empty publication has no invented target. Legacy role is separately tested under actual legacy producer. |
| APP-MAIN-R2, P2, D duplicate unload veto | **Closed / APPROVE** | Original minimal3/4 becomes4/4; retired Ingredient local raw no longer cancels clear unload. Three original raw cases complete actual boot1→2 on fresh explicit consent after activation, each stable exactly once. Controlled-start waiting-worker discard also boots once. Raw/tickets/auth protections remain and unknown still blocks. Initial waiting-worker failures are retained under distinct R3. |
| Ingredient / Dish-inline ACK predicates and hint text | **APPROVE** | Exact target19 plus reviewer sibling16 =35/35, full419/419, four actual browser malformed-ACK cases. Primitive string proof only; available valid old A settles A while B remains saving; reverse-order valid B does not release malformed A. Real transport hidden ACK remains unknown. Three hints now accurately describe optional quantity reference/manual checking. |
| APP-MAIN-R3, P2, C waiting-worker completion | **Open / REQUEST_CHANGES** | Fresh initial document begins without a controller; later actual controlling event remains isUpdate=false. Plugin omits final callback, unchanged valid consent never reaches unload and times out. Controlled-start counterpart succeeds. This belongs to C shared PWA integration. |

### [P2] APP-MAIN-R3: complete an authorized update in a document that began before initial SW control

Location: `packages/web/src/pwa.ts:222–225` (exclusive final plugin callback), `:239–245` (native controller observer refreshes only reader/shell). Full repro, evidence and dependency call chain: [APP-MAIN-R3.md](APP-MAIN-R3.md).

On a fresh origin, remain in the initial document after first installation claims it. Publish another generated worker, wait, and confirm the production update/discard action with stable dirty input. The new worker activates, but no native beforeunload occurs and the page stays boot1 with the production timeout. Ingredient7/8, Import3/4 and Dish3/4 preserve this actual failure; each has identical before/after safety stamps. Reconfirming after activation succeeds via the no-waiting path. No data loss or automatic reload was observed, but the requested first update does not complete.

The passive native Plan diagnostic independently records waiting→controlling `{isUpdate:false,isExternal:true}`, initial controller=false, no native unload and stable consent (`native-first-document-diagnostic.json`,3/4). Workbox7.4.1 captures `_isUpdate` only at registration (`Workbox.js:294`) and forwards it later (`:223–227`). Vite-PWA1.3.0 only forwards `onNeedReload` inside `if(event.isUpdate)` (`dist/client/build/register.js:57–60`). The controlled-start counterpart has initial controller=true and an external waiting update, yet boots once successfully (`native-controlled-update.json`,2/2). External classification alone is therefore not the cause.

Repair must preserve final coordinator validation: external activation without consent, changed generations, pending and unknown must stay blocked. Do not bypass the coordinator, clear raw/owners, or replay expired consent. No implementation was written by this reviewer.

## Independent execution evidence

- Core build and Web typecheck: exit0. Exact archived Web suite **419/419** (`reviewer-web-tests.log`). Original unload7/ACK12 plus reviewer16 **35/35** (`reviewer-targets.log`). The 16 additions cover arrays, boxed/coercible objects, null/short/empty values, valid strings and B-first settlement for both pages.
- Source/index/config integrity **64/64** against the reviewed Git SHA (`production-integrity.json`). Every copied source across11 actual-server build variants matches the archive (`actual-server-source-integrity.json`). Approved main/shell/i18n, public presenters/helper and original PWA/registry continuity is separately pinned (`approved-input-continuity.json`). Committed author-evidence manifest **24/24** matches; raw RED logs remain unchanged (`author-evidence-integrity.log`).
- `minimal-retired-green.json`: **4/4**. Home clear control stays uncancelled; Ingredient raw is dirty; auth retires pure-local raw; old raw no longer vetoes clean unload.
- `application-matrix.json`: **31/31**, actual main singleton pages. Read failure/auth/language/lifetime; five simultaneous raw editors; whole-document C1 save, lost ACK, two Source reads, later input; offscreen Publish terminal; shopping save barrier and two separate clipboard operations; old Dish translation isolation.
- `application-refresh-failure.json` **34/34** and `application-refresh-success.json` **36/36**: actual native controller changes force fresh reader fetches while preserving the same editing input node/value11 and boot1. Successful reader restores real Plan navigation (`navigation-restored-dom.json`; independently viewed `navigation-restored.png`).
- `application-held-save.json` **37/37**; clean recovery retains original **39/39** in beforeEvidence, including unknown/no-discard and exactly two Source confirmation reads. `application-clean-recovery.json` proves actual **boot2 once**, stable **2/2**, on the explicitly labelled already-activated-worker path. It is not the failed first waiting-worker attempt.
- `application-old-auth-unknown.json`: **6/6**, boot2 remains2; actual transport hides old save ACK, anonymous previous-session-save remains unknown, no private old ID or discard action. `startup-publication-failure.json`: **3/3**, actual Home/Plan/explicit-plan Purchase remain usable and coverage clears despite initial public read failure.
- `ingredient-native-reload.json`, `import-native-reload.json`, `dish-native-reload.json`: preserved first-activation R3 failures. Corresponding `*-native-retry.json`: each **2/2**, real boot1→2 after a new explicit production consent, stable after four seconds, with original dirty snapshot retained.
- Four `ack-ack-{ingredient,dish}-{current,late}.json` cases: one write each, malformed ACK stays unknown, ordinary unload stays prevented. Current Ingredient save is disabled; current inline raw remains visible and blocked. Old-auth assertions concern anonymous owner protection, not detached UI. Every captured source hash matches. This auxiliary fixture controls registration/transport; it is not counted as native-SW evidence.
- `public-journey.json`: **8/8** actual main Menu→full recipe→Prep→three languages→Plan. All five original components and three steps remain, original7500g is not scaled, exact revision and actual2×2 image bytes are retained without private API fallback, and offscreen invalid Plan raw returns unchanged.
- `continuity-corrected.json`: **11/11** from a fresh corrected fixture, including public8 plus Plan absent servings→C2 local preview→actual encoded shopping link→all-check Purchase→Plan return3. Manual decisions remain blocked and empty Plan servings survive the round trip.
- `public-controlled-before.json` **8/8** pins A `62a139ba49114bcbfe512fb8daa0062b09731dc2`. `public-controlled-native-update.json` proves a real waiting-worker update followed by exactly one boot, **2/2**. The same new document's `public-after-successful-update.json` **10/10** (boot stability2 + public8) pins B `0ff5732219f125ba5faea9d1c20ca26c42c591c2`, preserving full original recipe/quantity and decoding B's asset. This closes the requested public-entry/new-version continuity evidence.
- `navigation-team.json`: public8 plus actual team navigation/auth8 = **16/16**. Reader failure removes target (`navigation-failure.json`,19/19), successful fresh reader restores it (`navigation-refresh-success.json`,21/21). Formal empty transition's final waiting/reader/empty checks all pass; `navigation-empty-final.json` remains **24/27** because three premature earlier probes are deliberately retained, not represented as a wholly green27-test run.

- `navigation-legacy-final.json`: final real waiting/reader/legacy-role assertions all pass; cumulative **27/30** retains the same three prior empty-fixture failures. Guest wording occurs only under the actual legacy-numeric producer; team entry is role-correct.

## Harness controls and setup history

Actual index loads a reviewer observer/network module before unchanged main. No renderer is recreated to mimic navigation. Static formal producer outputs, branded public handles, generated Vite/PWA workers, controller changes and location.reload are real. Only explicit fake API transport/back-end documents persist in review-prefixed sessionStorage across native reload, so the mock server state survives a new JS lifetime; no product persistent store was added. A separate intent marker checks one new JS boot and stability after four seconds; clear/started alone cannot pass.

Three isolated server groups preserve their built bytes and state files. Passive Workbox diagnostics wrap dispatch only to record and then forward the original call; no callback or event is manufactured. Controlled-start baseline uses a separate naturally controlled new document and is not counted as successful product update. The observer does not cancel beforeunload or grant update consent.

All failed setup observations remain raw. The first multi-port launch completed builds but port4195 was occupied; identical built bytes were then served on4190–4194. One reviewer shell command used the evidence directory as cwd and failed path resolution before testing; root-archive rerun passes. Early post-reload public probes had a reviewer-specified nonexistent Administration drawer prerequisite and then a mixed dirty-state prerequisite; the preview probe initially hardcoded an unencoded href despite the correct production `new%2Fid`. Corrected fresh fixture routes through actual router and selects the visible link. A clean-baseline attempt on an offline-ready hidden bar was a no-op; a new naturally controlled document replaced that precondition. Empty-navigation follow-ups were first clicked before a waiting-worker result and while off the expected Plan; after actual Plan navigation and explicit waiting confirmation, the same assertions pass. None of these corrections relabels the separate real R3 failures. The supplied restored-navigation image has JPEG bytes despite its .png filename.

## Limits and next action

C owns the new R3 repair; return a fixed SHA for the original reviewer to recheck first-install and controlled-start variants, old-auth/pending/unknown, consent invalidation and exactly-once recovery. D R1/R2/ACK closure is separately usable at this SHA, subject to the open composition finding.

No live Worker, real credentials, real publish/rollback, L2, deployment or production-stock proof. Synthetic2×2 images do not verify asset licences or real recipe completeness. No new native offline/no-service-worker environment run is claimed; prior C evidence and exact source continuity are distinct from this execution. The full Node suite exercises its existing shared tests, but that is not an all-environment native-browser claim. Historical3eb failure outputs are immutable and never relabelled as successful reloads. Whole feature, broader three-language/two-size product acceptance and kitchen-data truth remain outside this bounded review.
