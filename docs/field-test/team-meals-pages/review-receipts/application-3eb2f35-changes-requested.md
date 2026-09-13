---
feature_ids: [team-meals]
topics: [independent-review, application, main, pwa, owner-composition]
doc_kind: review
created: 2026-09-11
reviewedHeadSha: 3eb2f351755b73122b26f2a2cee5a523dee49aaa
verdict: REQUEST_CHANGES
reviewer: /root/plan_review
---

# Independent actual-application / PWA composition review

**REQUEST_CHANGES — exact `3eb2f351755b73122b26f2a2cee5a523dee49aaa`.** Two P2 findings below. No P1 found. The completed owner/coverage and update-blocking checks pass, but confirmed native reload recovery has **not** passed. These results do not approve D1, T01–T09 overall, a Worker deployment, or L2.

## Accepted subject and source

This is the root-requested bounded composition review of the actual application entry after consuming C `4ebaa9410634e7850200037341b497a7b55773da`: actual Home, Plan, Import, Dish, Ingredient, Purchase and Publish production singletons, main/router/auth, shared owner coverage and the actual generated service worker. It is not a re-review of each previously approved implementation in isolation.

Accepted original source: `docs/design/team-meals-pages/D0-contract.md@ad5651787be4a54ef28060f6345f61187e78cd9d`, the original task requirements, and the consumed fixed C2b contracts. The original `STANDARD-DATA-AND-ACCEPTANCE.md` still has the exact D0-recorded SHA256 `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352`; T08 explicitly requires no customer-facing entry. Current C2b auth contracts distinguish permitted retirement of old pure-local buffers from unresolved old writes, which remain anonymous and protected.

New public Menu/Prep wiring was not frozen in the reviewed commit and is excluded. The existing application shell is included: its navigation is visible even while editing an admin page. Future public-page wiring needs a separate fixed continuity check.

The reviewer is a non-author. Browser actions were executed by root on the reviewer's exact URLs/buttons because this subagent's CUA returned `Browser is not available: iab`. The reviewer authored the probe, independently inspected production code, all returned JSON and the visible navigation screenshot, and formed the findings. Root's role in these browser checks was UI execution and saving the raw results, not altering tests or interpreting them as approval.

## Findings

### APP-MAIN-R1 — P2: team mode still advertises a customer-facing Menu entry

- Exact source: `packages/web/src/i18n.ts:48`; the unconditional navigation entry is `packages/web/src/shell.ts:29–32`, rendered as a real link at `shell.ts:92–98`.
- Reproduction: load the actual application with the formal team-meals publication, open the sections drawer. Menu is a clickable `#/menu` link captioned **“for guests · 顾客”** in English. Chinese and Ukrainian strings express the same audience. The active publication target does not change that caption.
- Evidence: [actual visible drawer](application-guest-entry.png) and `application-matrix-v2.json` / `application-sw-after-reload.json` contain the actual shell text. The screenshot was independently inspected by the reviewer.
- Why this is a finding: T08 says “无顾客入口”. This is an active navigation entry in the team application, not an unused historical comment or help file. No customer ordering feature is alleged; the observable defect is that the navigation still presents Menu as a guest destination instead of consuming the new team-facing product boundary. Keeping the Menu function for team use is compatible with the requirement.
- Ownership: shared shell/i18n owner C. This is a final application contract gap; it does not invalidate earlier bounded state-owner approvals. D should not make an unauthorized shared edit.

### APP-MAIN-R2 — P2: retired Ingredient raw data still cancels clean application unload

- Exact source: `packages/web/src/pages/admin/ingredient-new.ts:1153–1155`. It scans **every** record in `ingredientOwners` and cancels unload for any dirty/busy/unknown record. The auth handler at `1158–1166` retires eligible registry records but deliberately keeps quarantined old records in that Map.
- Minimal actual-main reproduction, with no Import or Dish loaded: open Home and wait until shared safety is clear; observe a cancellable `beforeunload` event (not a real navigation), which is not cancelled. Open Ingredient `salt`, edit its Chinese name, switch the actual auth lifetime, return to Home and wait for its reads. Shared safety is correctly clear and the old pure-local raw owner has retired. Dispatch the same observer event: **`defaultPrevented === true`**.
- Exact browser evidence: [application-ingredient-unload-minimal.json](application-ingredient-unload-minimal.json), **3/4**. Clean Home control: false; retired Ingredient control: true; final shared reason: clear; native SW/controller: activated. The failed expectation is retained unchanged in the review fixture.
- Application symptom: the full actual-main matrix reaches a known saved/clear state after its two forced Source reads, but the requested native update does not reload. The page stays at boot 1 and presents the update timeout. `application-sw-after-reload.json` must not be called a reload pass. The subsequent actual update-bar retry also did not recover (`application-sw-retry-observed.json` and PNG).
- Required correction: make page-local unload protection agree with the application's shared lifecycle and its explicit update consent. Do not clear unresolved operations or restore old-auth bodies to obtain a false clear state. Include the same-auth confirmed dirty-discard sibling paths: Import (`import.ts:271–275`) and the mounted Dish guard (`dish-new.ts:866–868`) also independently call `preventDefault` and do not consume the main coordinator's permission. Their individual native-discard failure is not claimed as separately reproduced in this baseline report.
- Ownership: D's page-local guards. `pwa.ts`'s local approved flag and the coordinator's reload-intent lifetime are C-owned. A cancelled native reload may interact with that lifetime, but this report does **not** invent a separate C finding without its own isolated evidence.

## Exact validation and integrity

- Source archived from the full reviewed SHA into `/private/tmp/canteen-application-review-3eb2f35`; no root worktree production edit, remote operation, Q run, live publish, rollback, or deployment.
- `production-integrity.json`: **63/63** source/config/entry files byte-match `git show` at the reviewed SHA, including all Web/Core source, actual `index.html`, and Vite config.
- Core build and Web typecheck pass. Complete Web tests: **372/372**, `node-test-rerun.log`.
- The first dependency copy was from the earlier Dish archive and lacked the now-declared `pngjs@5.0.0`. That run had 359 passing cases plus a module-load failure; `node-test.log` is retained. The exact declared installed package was copied read-only from the root dependency tree, then the complete suite passed. No package manifest or assertion changed.
- Real A producer → Vite → generated Workbox service worker builds pass using the committed `C2B_ENTRY=application` server mode. The review-only server adaptation inserts one instrumentation module before the unchanged actual `src/main.ts` entry and copies that test module into the temporary build. No page renderer is manually recreated and no dummy coverage owner is registered.
- The instrumentation supplies explicit in-memory API responses through the real Team API / HttpAdminApi transport classes and actual session/store/owner code. It drives actual DOM controls/hash routes/language events and observes `inspectReloadSafety`; it does not stub main, the coordinator, the native worker, or `location.reload`.
- Build environment adaptation: `TMPDIR=/private/tmp` avoids this host's `/var` realpath alias error in Vite. The original failed build log is retained. Local server binding needed the ordinary authorized localhost escalation; no external network API was used.

## Browser evidence

The main fixture is `packages/web/test/application-review.ts`. Its earlier versions are retained as `application-review-first.ts` and `application-review-v2.ts`. Server additions exist only in the review archive's test server.

| Evidence | Observed result and boundary |
|---|---|
| `application-matrix-first.json` | 6/7. Six actual lifetime paths passed; the fixture waited for `.tm-error` while the initial source-failure branch correctly renders a `p[role=alert]`. Failure preserved. |
| `application-matrix-v2.json` | **31/31** actual-main checks. Home three reads and language reuse; old Home/Plan reads settle separately after auth; late initialization preserves new Home; read failure and unknown admin route finish coverage; five actual offscreen raw owners coexist and return across language; held C1 save, later input, unknown/no-repost and two-read recovery; Ingredient translation; Publish exact same-run terminal; Purchase all-check-before-save barrier, held ACK and two clipboard tickets; Dish offscreen translation and old-auth late completion. |
| `application-sw-reader-failure.json` | **34/34 cumulative**, boot 1. Real B worker waits; dirty update asks for explicit choice; an externally activated real worker triggers main's fresh publication read, deliberately failed, while the exact Plan input DOM and value remain. |
| `application-sw-save-unknown.json` | **38/38 cumulative**, boot 1. A second real worker (same A commit, different producer build time) waits; successful reader refresh still preserves the exact editing input. Offscreen real C1 saving and outcome-unknown both block updates without a discard action. |
| `application-sw-after-reload.json` | **39/39 intermediate assertions**, but **native recovery FAIL / not passed**: two Source reads prove the save and shared safety becomes clear; page remains boot 1, timeout observed. The count deliberately contains no successful-reload assertion. |
| `application-sw-retry-observed.json` and PNG | User retries the real update bar; no observed native reload. This is a retained observation, not an assumed cause or a pass. |
| `application-ingredient-unload-minimal.json` | **3/4** isolated actual-main RED for APP-MAIN-R2. No Import/Dish confounder and no actual navigation. |
| `application-old-auth-save.json` | **41/41 cumulative intermediate assertions**, boot 1. Two further actual-main checks confirm that a real transport hides old-auth ACK proof, preserving anonymous `previous-session-save`; the actual update dialog has no old private ID and offers no discard. This does not change the failed native-reload result. |
| `application-startup-failure.json` | **3/3** in a fresh tab with an explicitly failed initial publication read: actual Home and Plan initialize, and Purchase works with an explicit plan ID; completed coverage is clear. |

The matrix revision snapshots are logged in `application-server-v2.log`: A `7a96af367939a5ed8d7ae317b2fc2ab543632e1e`, B `d64429656b96aeca409895ddab26e8c6a22d4136`; A-time uses A's exact commit with a changed producer build time. These are isolated local fixture Git commits, not the production repository's content history. Synthetic API revision tokens A/B are separately labelled fixture responses and do not claim to be those publication revisions.

The original selector failure was corrected only in the test: semantic `[role=alert]` for initial read failure, actual Dish Chinese pointer `/name`, Import record kind `import`, and the real legacy translation envelope `translations`. All production bytes remained exact. The corrected matrix has no suppressed failing business assertion. The newly found unload failure remains red.

## Boundaries and next action

State-owner coverage, offscreen data retention, old-read settlement, reader DOM preservation and update blocking have substantial actual-main evidence. Confirmed native reload recovery remains open because of APP-MAIN-R2. T08's navigation boundary remains open because of APP-MAIN-R1. Repair each in its owner's scope, freeze the resulting commit(s), and rerun the original independent failed probes plus the related dirty-discard/unknown siblings.

No claims are made about new public Menu/Prep wiring, all-page design acceptance, full T01–T09, unconfigured/live Worker service health, live publication or rollback, production credentials, deployment, kitchen acceptance, L2, or persistent recovery after a forced browser close. Previously approved C producer/asset/cache tests retain their own scope; this report does not substitute them for actual public-page continuity.

Review completion: the reviewer-owned 4187 and 4188 HTTP servers were stopped after all requested evidence was saved. Root-owned browser tabs were left untouched. The exact fixtures, logs and output files remain available for the authorized repair author to reproduce.
