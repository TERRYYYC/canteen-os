---
feature_ids: []
topics: [team-meals, publish, rollback, lifecycle, author-evidence]
doc_kind: handoff
created: 2026-09-11
---

# Publish/rollback page-owned lifetime handoff

What: `pages/admin/publish.ts` now retains a single session-bound operation owner for both publish and rollback. Pending and unknown outcomes block both write actions across language repaint, dialog dismissal and route leave/return. The rollback dialog closes when a write starts; its buttons no longer own the operation lifetime. Auth replacement clears private presentation immediately, and every async changes/dispatch/rollback/progress response must still belong to its captured owner before changing current state. Unconfigured and explicit simulation show connection/mode information without invoking the legacy API's default mock.

Why: root assigned the bounded pending-owner repair after finding the same UI-lifetime failure family on other editors. Seven actual old-renderer tests reproduced the publish page gaps before implementation: unconfigured fallback, rollback pending across repaint, publish acknowledgement loss, missing run ID, timeout/unmapped unlocking, rollback acknowledgement loss, and stale authentication. No fake controller replaced page behavior in these tests.

Tradeoff: writes still use the existing `AdminApi.publish()` and `rollback(sha)` contracts. C1 supplies only the authenticated session/mode boundary. The page does not invent request IDs, compare latest builds, estimate a timeout as completion or infer rollback success from a refreshed changes list. Known run IDs can be checked again through `getPublish(theSameId)` without another write. The existing publication history is still a read of `getChanges()` and is separate from the current operation result.

Open questions / required integration:

- **B true terminal evidence is pending.** Current Worker `mapProgress` returns `failure` for a failed step before checking `runCompleted`, and returns `unmapped` before that check too; timeout is emitted while the run is not complete. `PublishProgress` does not expose completion/conclusion. Therefore this current adapter clears the operation only on a same-ID `success`, while failure/timeout/unmapped keep the failure details and protected unknown state with a read-only recheck. Root/dispatch is obtaining reviewed B `runCompleted` / `runConclusion` evidence so a genuinely completed failure can also close correctly. Permanent unknown for an actual completed failure is **not** the intended final product behavior. No unapproved field was added or consumed.
- A missing run ID or lost acknowledgement still has no correlation proof in the legacy facade. Client `publish()` discards Worker `requestId`; `latest` cannot prove ownership. Those cases remain unknown with administrator verification instructions.
- Unknown rollback cannot be proved by existing `getChanges()` because it supplies no request identity or exact acknowledgement. A different target or malformed rollback acknowledgement is also protected unknown.
- Formal C auxiliary/reload registration is not connected here. The actual page exports `readPublishAuxiliary()` with `{identity: number|null, generation: number, dirty: boolean, phase: 'idle'|'busy'|'unknown'}`. These values reflect the real owner, contain no credential or credential hash, and persist during navigation. The page's own `beforeunload` protection consumes the same operation state. Root can connect the reviewed C seam when available.

Next action: root may freeze and independently review this page-owned checkpoint, then apply the reviewed B/C integrations. This handoff is author evidence, not independent approval. No commits, real publish/rollback calls, package edits or remote operations were performed.

## State and recovery proof

| Trigger | Owner result | Allowed next action |
|---|---|---|
| Publish or rollback clicked | busy, both write actions blocked | Read current operation; leave/return or change language |
| Rollback confirmation for exact target, valid returned commit/count | idle; acknowledged rollback shown as not live | Refresh changes; another explicit action |
| Known-ID publish progress success | idle; explicit confirmed success | Refresh changes; another explicit action |
| Lost/malformed acknowledgement, missing run ID | unknown; both writes remain blocked | Known-ID read only if an ID exists; otherwise external verification |
| Known-ID failure/timeout/unmapped or wrong-ID progress | protected unknown, details retained | Recheck that same ID; await reviewed B completion evidence |
| Known pre-write Worker rejection | idle; actual error remains visible | Another explicit user action |
| Language/route repaint | same identity/phase/generation | Render current owner state, no second write |
| Authentication changes | invalidate old owner and private view | New authenticated read; reject all old callbacks |

The known-rejection whitelist is grounded in Worker error/status pairs: `bad_id`, `bad_path`, `bad_json`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `too_large`, `rate_limited`, `dispatch_unavailable`, `not_configured`. Middleware rejects before endpoint execution; rollback target checks occur before writes; conflict means the ref update was not accepted; disabled/unconfigured publish rejects before dispatch. Generic transport errors, `upstream_error`, unknown codes or malformed bodies cannot use this branch.

Source anchors read in the current worktree:

- `packages/worker/src/endpoints/publish.ts`: `mapProgress` around 195–205, `handlePublish` around 271 onward, `claimRun` and `handlePublishLatest`. The status mapping exposes the distinction between UI failure and workflow completion.
- `packages/worker/src/endpoints/rollback.ts`: exact target resolution, no-op response, non-force update and conflict path.
- `packages/worker/src/http.ts`: Worker error codes/statuses; `index.ts`: authentication/rate-limit/body validation before endpoint dispatch.
- `packages/web/src/api/client.ts:223`: legacy publish acknowledgement omits `requestId`; same-ID `getPublish` and rollback methods remain unchanged.
- `docs/design/team-meals-pages/D0-contract.md`: legacy entry compatibility and separate publication state; `docs/specs/v03-admin-frontend-contract.md` §4.6 for retained page contract. Original design sources were read-only.

## Author verification

| Evidence | Result |
|---|---|
| `red-publish-owner.txt` | Actual unmodified renderer: 0/7; all seven failures are behavior assertions |
| `green-publish-owner.txt` | Final targeted owner/render tests: 15/15 |
| `publish-owner-web.txt` | Full current working-tree Web suite: 227/227 |
| `publish-owner-typecheck.txt` | Installed TypeScript `--noEmit`: exit 0, empty output |
| `publish-owner-browser.json` | Actual Chrome on stable 4195: 13/13 assertions |
| `publish-owner-browser-language-matrix.json` | Six unknown-state observations, zh/en/uk × 393/1440: both actions disabled, no horizontal overflow |
| Diff whitespace | `git diff --check`: pass |

The same-mode sweep covers both write entry points, the retained rollback confirmation handler, every async response path, same-ID polling, read-only verification, live view replacement, dialog body scroll restoration, auth generation changes, before-unload protection and mode gating. Additional tests check malformed/different-target rollback acknowledgements, wrong-run success, late changes and late progress after authentication replacement, and valid pre-write rejection versus ambiguous upstream failure. No retry/fallback layer was introduced; latest-run ownership inference was removed. The repository has no fallback-layer scan script, so this bounded diff was inspected directly.

Fixture: `packages/web/test/team-meals-pages-publish-browser.html`, generated by `team-meals-pages-publish-browser.build.mjs`. This bundles the actual page and actual C1/legacy HTTP facades, replacing only API getters and navigation helper. Fetch is intercepted and restricted to `https://publish-fixture.invalid`; no real backend request is sent. A repeated-letter revision and synthetic history are visibly labelled local samples, not historical or deployed facts. The toolbar exposes `#lang`, `#mode`, `#scenario`, `#reset`, `#release`, `#leave`, `#return`, `#auth`, `#run`; results are in `#result` / `#ledger`. Source hash is embedded in the generated module and evidence. The browser reported no error logs.

Screenshots inspected:

- `publish-owner-rollback-busy-uk-393.png`: Ukrainian, mobile, rollback pending after leave/return; both writes disabled.
- `publish-owner-unknown-en-1440.png`: English, desktop, lost publish confirmation; unknown explanation and both writes disabled, no retry action.

Final page SHA-256: `69763f25ac0bf81ea724e05e9f7221e5537534a349d8f1739ff884e3d145a03e`.
Last observed shared HEAD: `d5f05f98847bbac31d05c5c5457fb8c7fb4ee1b1`. Validation is against the shared working-tree files recorded above, not a claim that this uncommitted delta is an independently approved commit.

Owned delta: `pages/admin/publish.ts`, `test/team-meals-pages-publish*`, and these `publish-owner*`, `red-publish-owner*`, `green-publish-owner*` D evidence files. Shared API/core/router/store, other page authors' files and Q E2E fixtures were not edited.
