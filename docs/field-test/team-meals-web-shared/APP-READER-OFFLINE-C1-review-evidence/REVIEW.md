---
feature_ids: [team-meals]
topics: [web, published-data, offline, independent-review]
doc_kind: review
created: 2026-09-11
---
# APP-READER-OFFLINE-C1 independent review

**APPROVE — bounded same-revision team projection recovery.** No P1/P2 found in the fixed delta. Both original native counterexamples now pass for the accepted team-publication scope. This does not approve analogous legacy recovery, QR offline support, overall bundle budget, real Worker L2 or deployment.

Reviewer: original non-author `/root/c1_review`, identity unchanged; local_cat, iterative. Direct review carrier: `/root`. ReviewedHeadSha: `3dd9db9d07ec8fdc67990ecbb77a0578f2dc2338`. Review-Subject-Ref: `task:01a08d94-5d2e-7162-8f34-689ed87e391e:APP-READER-OFFLINE-C1`. Accepted-Source-Ref: `docs/field-test/team-meals-web-shared/APP-READER-OFFLINE-C1-contract.md`. Accepted-Revision: `33464131aab2d56da95469f0712dbf07b4593c40`.

Source: `/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-web-shared`, branch `codex/team-meals-web-shared`. Exact 3dd9 and clean verified at intake. Execution used this separate Git archive. Final author HEAD is doc-only `62908cf2593fab775e9426a4f92c8992e063d58e`, clean; packages are byte-identical to 3dd9. Contract's last content revision remains accepted 33464131. No author source changes or remote actions were made.

## Implementation and failure boundaries

Only `packages/web/src/view-models/published.ts` and its new `published-offline.test.mjs` change from the accepted base. `loadPublishedTeamPlan` captures the generation and tag, tries the tagged URL first, and permits one ordinary-path attempt only for `PublishedDataError` with `code=unavailable` and `status=null` in a tagged generation. It checks generation before starting that attempt. Complete projection validation still runs against the issued publication before branding/retaining the view; the existing cache wrapper rejects stale success or failure and prevents old cleanup from deleting a newer request.

Checked HTTP refusal (including non-404 errors), invalid MIME/JSON, unsupported version, wrong revision, missing/bad asset bindings, foreign/cloned/probed handles, concurrent cache reuse, second-attempt failure, abort/deadline races and late completion. An ordinary reply is untrusted data and must validate; it cannot trigger a third request. Fresh manifest and probe do not recover, probes do not adopt generations, and legacy sheets/assets gain no recovery edge. Error URLs follow the actual JSON attempt. Main/PWA/R3, coverage, editors, auth, D pages, Worker/core/client, dependencies and cache configuration are unchanged.

Independent bounded subreview by `/root/c1_review/c2_core_boundary`: no P1/P2, original reader/offline 26/26 and extended 19/19. Its probe runs against its separate exact-3dd9 archive: `/private/tmp/reader-offline-independent-3dd9db9.test.mjs`. I reran that probe: `/private/tmp/reader-offline-c1-independent-extra.log`, **19/19**. The six additional cases cover fetch abort, errored body with known HTTP status, ordinary transport failure, ordinary invalid/refusal response, clear triggered by timeout abort, and late tagged body after successful recovery.

## Independent checks

- Node **20.20.2** full Web **450/450**, zero failed/cancelled/skipped: `/private/tmp/reader-offline-c1-independent-web.log`.
- Whole Web typecheck exit 0: `/private/tmp/reader-offline-c1-independent-typecheck.log`.
- Exact archived core emitted successfully for the formal producer: `/private/tmp/reader-offline-c1-independent-core-build.log`. An initial test attempt occurred before emitting core; its four module-import setup failures are preserved in `/private/tmp/reader-offline-c1-independent-initial-missing-core.log` and were resolved by the existing core build command. No source repair or test suppression was involved.
- Both A and B original-config application builds completed with `VITE_WORKER_URL=https://application-api.local.invalid`, existing dependencies and Node20. Artifacts: `/private/tmp/reader-offline-c1-independent-native/{a,b}/dist`. No fetch/mock injection into the application.
- Exact source integrity: `/private/tmp/reader-offline-c1-independent-native/source-integrity.json` checks all **52 tracked Web src files plus original index.html**, each against Git 3dd9, in both A/B build sources. The diagnostic script is outside the application and SW scope.
- Fixed accepted-base-to-target `git diff --check` passes.

## Native first-claim and external-B evidence

Own Chrome origin `http://127.0.0.1:59880/inspect.html`, unmodified application frame under `/canteen/`, real generated service worker, formal producer fixtures. Diagnostic controls only change the local static server, external waiting-worker activation and navigation. This run reuses the author's outside-scope diagnostic scaffold, adapted to my exact archive, random port, read-only controller/resource observations and an explicit document reload for Admin. No author origin was used. Script: `/private/tmp/reader-offline-c1-independent-native.mjs`.

Raw snapshots contain document DOM, performance URLs, boot identity, native worker state, full CacheStorage JSON bodies/keys, local request ledger and network availability. Compact derived summary: `/private/tmp/reader-offline-c1-independent-native/independent-summary.json`.

1. **First document / first claim — PASS.** `01-inspect.json` records controller false then true at document boot `1789103897728.1`. Only entry/Admin/Workbox-window execute initially, and 20 JS are cached. Fresh manifest request carries `__publication=1789103898081-1-1`. With app network disabled, first Menu requests `/canteen/data/team-meals/week-41.json?__publication=1789103898081-1-1`, then the ordinary `/canteen/data/team-meals/week-41.json`. `03-inspect.json` shows full Menu at unchanged boot, exact A revision **bb8e9e94a3471b8ec9b8d45e072f08f05762082b**, and cached projection key `?__WB_REVISION__=a357a23d0c986d2774fd18dfd6707c55` with that same body revision. The tagged attempt reaches the disabled server; the successful ordinary read does not need a server response.

2. **New controlled A document / external B activation — PASS.** `05-inspect.json` records a genuinely new boot `1789103932751.6` at locked Admin, controlled from the start, executing only entry/Admin/Workbox-window. `08-inspect.json` shows B waiting while A remains active. External `SKIP_WAITING` is issued without app reload consent. `09-inspect.json` shows activated B, no waiting worker, same document boot, successful fresh manifest tag `__publication=1789103955987-1-1`, and only B JSON cache entries. With network disabled, first Menu tries that tagged projection then the ordinary path. `11-inspect.json` shows full Menu at the same boot and exact B revision **ef9a6f65fc5a27d8ec38cf67e51b1b0e9e42f986**. Cached projection key is `?__WB_REVISION__=14d8d5ba00b2e4e99d1da225c4a9ef26`, body revision B. A was not substituted and this repair did not reload the document.

3. **Controlled offline new-document control — PASS.** Without restoring network, manually reload Menu. `12-inspect.json` records new boot `1789104017518.7`, untagged initial manifest and projection requests, and full same B Menu. This preserves the prior working offline path.

All numbered snapshots above are under `/private/tmp/reader-offline-c1-independent-native/`. The earlier independent RED native counterexamples at e79 remain preserved in `/private/tmp/app-bundle-c1-review-e79fe3b-etbw3e/OFFLINE-FINDING.md`; these are my original observed failures, not author-only evidence.

## Residual limits

Recovery is intentionally limited to already verified team publications after tagged projection transport failure. Fresh manifest/probe failure remains failure; legacy sheets have no verified revision recovery; unseen/evicted image bytes still fail and external-unpinned images remain explicit. Image-negative boundaries passed unit probes; I did not add another native image matrix to this reader-only review. QR's absent precached index, existing route budget failures and real backend/L2 remain outside this approval. R3 and owner safety production code did not change; no full D matrix or new R3 native approval is claimed. The two reproduced team-projection offline failures are resolved without weakening revision validation.
