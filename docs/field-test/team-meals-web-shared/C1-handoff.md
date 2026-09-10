---
feature_ids: []
topics: [team-meals, web, transport, editing, integration]
doc_kind: implementation-handoff
created: 2026-09-11
---

# C1 Web shared interfaces

What: conditional transport, revision-bound private reads and a reusable memory-only editor. Why: future plan, shopping and detail pages need the same conflict, source-version and session boundaries. Tradeoff: existing numeric screens retain strict v2 types; new screens opt into `TeamMealsApi`. Open questions: B2 and real isolated Worker roundtrip remain pending. Next action: independently review this C1 checkpoint, then consume reviewed A2/B2 for C2 and assign page integration to RC-D.

## Provenance and ownership

Base A1 `c9131559b8c703a3a8f3b823bc93c2acb3dd879c`; branch `codex/team-meals-web-shared`, sibling worktree `canteen-os-team-web-shared`. Reviewed CI commits `11e761fe062e30ecc1a5b0049d9e09ae7e936101` and `15d117df517b476e2655adeaf2411557ba714af8` were cherry-picked as `2c34fe8` and `1baa09a`, retaining original authorship. No A2, B2, production data, page, CSS, schema or dependency edits were authored in C1. No GitHub issue was assigned; dispatch task owns tracking.

Accepted contract: `docs/specs/team-meals-contract.md` at A1; latest explicit dispatch scope overrides old brief freezes. The four design drafts remain only in `canteen-os-design`; their SHA256 values match the dispatch plan. PR #91 is an unapproved draft visual proposal. No customer/order/feedback/report UI is included.

Architecture cell: RC-C shared Web. Map delta: none. Authors: root for API/token/error messages/tests; `/root/edit_session` for the generic editor and its unit tests. Neither is the independent reviewer.

## API boundary

- `api/team-meals.ts`: `getTeamMealsApi()` / `createTeamMealsApi(base, options)` return `TeamMealsApi`, with `mode: real | mock | unconfigured`. Empty Worker URL blocks new reads/writes; the older `getApi()` keeps its existing demo behavior. Explicit mock requires an injected mock fetch and reports mock capability. A configured URL describes transport mode, not deployment health or proof of a real save.
- `getPlan`, `getDish`, `getIngredient`, `getShoppingList` return `Source<T> | null`; only HTTP 404 **and** `not_found` yield null. Plan/Dish use core `AnyMenuPlan`/`AnyDish`, not casts to strict numeric types. `getCatalog` returns `TeamCatalog`.
- Read options `{ revision?: full40Sha, force?: boolean }`: omitted revision means current; explicit revision is validated and response commit must match. Errors never trigger current fallback. Current and fixed reads occupy separate cache keys. `force:true` bypasses memory cache for unknown-save recovery.
- `getAsset({revision,owner,pointer,force?})` returns `{bytes:Blob,sourceRevision}` after authenticated fetch and exact `X-Source-Revision` verification. Pages create/revoke their own object URLs; do not use the original ImageRef URL as a same-version fallback. External-unpinned is an explicit error. Fetch uses no-store; the existing image service-worker rule does not intercept programmatic fetch's empty destination. No private persistent/offline cache is added.
- Save methods `savePlan`, `saveDish`, `saveDishDraft`, `saveShoppingList` require `WriteCondition`: `{ifNoneMatch:'*'}` for creation or `{ifMatch:blobSha}` for update. Invalid/missing conditions fail; no automatic retry or removal of headers. Bodies are sent whole. For `saveDishDraft`, supply a body already carrying `status:'draft'` so editor acknowledgement corresponds to the submitted JSON.
- `ApiError` retains status, code, field errors, retryAfter and an optional valid top-level `reviewRequired` ID array. No IDs are extracted from prose. 409 conflict, format_downgrade and review_required stay distinct; 428 does not trigger a retry. Shared `apiMessage` localizes new contract errors in zh/en/uk.
- Private memory caches are keyed by opaque auth-session generation plus full request identity/revision/owner/pointer. clearToken triggers immediate invalidation; credential or injected identity changes invalidate on next access. Every response and body read rechecks the original session. Late results reject with session_changed. Token stays in Authorization and the existing sessionStorage token facility, never cache keys, URLs, logs or drafts. `dispose()` clears private caches and subscriptions.
- Legacy AdminApi automatically uses a creation lock for new plan/dish requests and preserves update locks. Ingredient write behavior is unchanged. Its strict readers fail with unsupported_format on v3, including a v3 Dish in Catalog, rather than passing missing qty/servings to numeric consumers.

## Editor and page integration contract

`view-models/edit-session.ts` exports `createEditSession<T>`. Inject `mode()`, `save(identity,body,condition,{operationId})` and `read(identity,{revision?,force:true})`; adapters must submit the supplied complete body without modification. `open({kind,id},draft,source|null)` returns `contextId`; `edit` and `save` accept that captured ID. `getState`/`subscribe` supply defensive copies. State includes phase, dirty, generation, source, draft, operationId, lastSave, mode and structured error.

Saving snapshots the full document and original condition. Later edits remain dirty; prior acknowledgements update the saved source but never overwrite the newer draft. Saved-but-unpublished is separate from publication. Conflicts preserve draft and require explicit comparison/resolution against a fresh Source before reopening. Network/5xx/bad-response outcomes block further writes until `reconcileUnknown()` force-reads current, then rereads that exact commit and compares the submitted body. Matching bytes confirm saved; intact old bytes/lock (or explicit absence for creation) permit a later explicit conditional save; divergent bytes yield conflict; read errors stay unknown. Reconciliation never writes.

A shopping rebase must first use the reviewed core reconciliation result as a whole document (basis+items), save it, and show affected/removed decisions. A later user action confirms individual decisions in a separate write. The editor does not compute or auto-confirm decisions. New/local unsaved menu projection stays local-preview; no placeholder revision may be sent to create a persistent ShoppingList. Core algorithm wiring belongs to C2.

| Page owner | Required integration, currently **not implemented in pages** |
|---|---|
| `pages/admin/plan.ts` | Replace module-owned load/save/retry state with TeamMealsApi + editor. Load through getPlan and only create on null. Keep v3 optional servings and actual old values. Replace the discard-before-reread path near original 574, save success mutation near 782, network direct retry near 813. Draft must survive failed reload and conflict. |
| `pages/admin/dish-new.ts` | Opt into AnyDish/unknown qty explicitly. Connect existing load and save around original 1860–1862 to editor; draft/active body must match action before submission. Ignore stale return/navigation; do not clear another context's dirty flag. |
| future shopping page | Existing `#/purchase` entry; use independent ShoppingList, never PO v2 or Ingredient.onHand. C2 supplies core collection/reconciliation/estimation. Keep removed purchase references and separate rebase from confirmation. |
| future ingredient/source detail | Read the list basis revision, then same revision source and asset. Current information is a separately labelled action. Object URLs are page-owned and revoked on disposal. |
| all editor pages | Before asynchronous loads, capture page/entity/language/auth lifetime. Only the still-current load may call open. Preserve draft on language rerender; invalidate departed callbacks and resolve fresh source before opening a replacement context. Keep the original session for unknown-save recovery or complete its force-read reconciliation before reopening/retrying. `onAuthSessionChange` must invalidate page editor state. A language switch is not a demand change. Render `lastSave.mode` and phase explicitly; mock never says synchronized. |

No new router entries or empty pages are shipped. Existing `#/admin/plan/<id>` and `#/purchase` remain the contract entry points. No new dependency is required.

## Quality gate and evidence

Original vision: choose meals without mandatory counts, collect all recorded ingredient references, manually decide this list's needs and inspect matching-version information. C1 only supplies transport/state prerequisites; it does not claim T01–T09 page completion.

Risk: behavior=stateful concurrency; data=conditional JSON write requests; security=auth/private cache isolation; contract=dual-format/revision/error semantics; irreversible=none locally. Runtime ports: 4181 only; no Redis. Relevant repository checks are used (this repository has no pnpm gate script). No matching .pen files and no product UI/layout changes; three-language/two-size page acceptance is deferred to RC-D/Q.

Observed RED: API suite 11/11 failing before implementation (missing creation headers, missing v3/404 guards, missing new factory). Error-label test then failed `1 !== 3` before localized distinctions. Editor target failed `dirty !== saving` before implementation. See red-api.txt summary; no environment failure is counted as behavioral RED.

Validation after implementation:

- `npm --prefix packages/web test`: 70 tests, 70 pass, 0 fail (33 old API, 15 new API, 22 editor).
- `npm --prefix packages/web run typecheck`: exit 0.
- `npm --prefix packages/core run build` then `node scripts/build-data.mjs`: exit 0 using unchanged source; generated public data only.
- `npm --prefix packages/web run build`: exit 0; entry JS gzip 21.99 KB; PWA generated. An initial build without generated data warned about its JSON glob; rerunning with generated data removed the warning.
- `git diff --check`: exit 0; changed files stay within RC-C ownership plus the explicitly consumed CI commits. Root .DS_Store/.poc-venv remain untouched.

Dogfood: in-app browser at `http://127.0.0.1:4181/test/team-meals-browser.html`, served from this worktree; clicked **Run shared flow** and observed **PASS — mock only**. The actual browser loaded TypeScript shared modules, checked conditional create, missing servings preserved, edit-during-save, revision source/asset bytes, departed page callback rejection and unconfigured write blocking. Harness lives under test, is not a production screen and does not contact a Worker. Actual product screen integration, zh/en/uk × two viewports, real authenticated asset bytes, isolated-repository persistence, publication and B2 HTTP semantics remain unverified.

Independent review is required against a fixed implementation commit before this checkpoint is approved. Results return only to dispatch task `01a08d6d-be28-7142-ad8e-3f964658d3f4`.
