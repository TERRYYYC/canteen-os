---
feature_ids: [team-meals]
topics: [publish, rollback, auxiliary-edits, independent-review]
doc_kind: review
created: 2026-09-11
---
# Independent local review — Publish auxiliary operation delta

Verdict: **CHANGES_REQUESTED — one P2 finding (PUB-AUX-R1).**

Reviewer: `/root/page_inventory`; author of this delta: `/root`. This reviews only the root-authored Publish auxiliary delta. It does not review or approve this reviewer's Purchase work, earlier Publish implementation authored by this reviewer, shared C code, or application-wide completion.

## Exact target and scope

- Reviewed commit: `3eac7469a033f658893654802ad1cc21670d88db`.
- Parent: `213e2ce835cb53a69e768f04cebfeb6fa2b0e251`.
- Immutable review archive: `/private/tmp/canteen-publish-aux-review-3eac746`, created with `git archive` of the exact target.
- Final `packages/web/src/pages/admin/publish.ts` SHA-256: `9b6730a8b99e119061126e89dcee432a4e96d72686a981851ccb456b4ac40090`.
- Accepted handoff: target commit's `docs/field-test/team-meals-pages/publish-aux-handoff.md`, SHA-256 `296f96bac1287af666b986275239396be2e2c42dfc87c1c34be66f09ee7c9039`.
- Scope: this single commit's `publish.ts` auxiliary owner/read/write registration and settlement changes; its four added Node cases, generated browser fixture/build export, auxiliary fixture and evidence. Legacy APIs and C registry were read as contract dependencies, not approved as new changes.
- Target existence/parent/source digest were independently verified from local Git objects (T0 object evidence). Author test/browser claims were treated as narrative until rerun. No remote operations occurred.

## PUB-AUX-R1 — [P2] Require a string commit before using a rollback ACK to settle its write ticket

Anchor: `packages/web/src/pages/admin/publish.ts:583–584` in the fixed archive, `onRollback` response validation and new `settleWrite` call.

The commit check applies a regular expression directly to `result.commit`. JavaScript coerces an array containing one valid SHA to the same SHA text, so this valid JSON response passes the check:

```json
{"ok":true,"commit":["cccccccccccccccccccccccccccccccccccccccc"],"restoredFrom":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","changedFiles":2}
```

The real `HttpAdminApi.rollback` forwards the field without a runtime string check. The new settlement path consequently consumes the original write ticket using a malformed response. In a current session the browser shows “Rolled back to”, both write actions are enabled and `inspectReloadSafety().reason` is `clear`. When an original provider actually delivers this malformed ACK after an auth change, the same new settlement retires that old protected operation; the new UI is kept private correctly, but the aggregate incorrectly becomes `clear`.

The coercing regex predates this delta. The finding's reviewed impact is the **new use of that validation as conclusive proof for auxiliary ticket settlement**, including settlement before the current-owner check. This is not a separate approval or review of the older implementation.

Expected: malformed ACK fields cannot establish a definite completed rollback. Keep the original operation unknown, keep protection active, and do not show current-session rollback success. Require `typeof result.commit === 'string'` before the full SHA regex (alongside existing exact `restoredFrom` and safe nonnegative integer checks).

Independent repros, without modifying production source:

- `packages/web/test/independent-publish-aux-review.test.mjs`: case “a malformed array commit cannot serve as exact old rollback ACK proof” fails `clear !== unknown`.
- Same file: “real HTTP array commit keeps the rollback outcome unresolved, not successful” fails `clear !== unknown`.
- `independent-node.log`: 6/8 pass; these two failures describe this one issue.
- Browser current-auth: `independent-browser-current.json` and `.png`: actual `clear`, `publishEnabled:true`, `rollbackSuccessVisible:true`.
- Browser available late ACK: `independent-browser-late.json` and `.png`: actual `clear`, original old record removed, current success UI correctly absent.
- Browser repro source: `packages/web/test/independent-publish-aux-browser.html`; plain entry exercises real HttpAdminApi, `?case=late` exercises an explicitly available original provider response. The latter deliberately does not claim that HttpAdminApi exposes hidden late responses.

## Verification results

All executable sources came from the fixed archive. Third-party dependencies were linked from the installed runtime; the archive's own workspace packages resolve inside the archive. No production/root file was edited.

- Author Node suite independently rerun: **22/22 PASS**, including its 36 status/conclusion permutations (`author-node-final.log`).
- Archive web TypeScript check: PASS.
- Browser bundle rebuilt in the archive from the final `9b6730…` source; no reliance on the prior `83cd…` author bundle.
- Actual Chrome on fixed local port 4217: new auxiliary fixture **11/11 PASS** (`author-aux-browser-final.json`).
- Same fixed final browser bundle: original owner workflow **13/13 PASS** (`author-owner-browser-final.txt`) and terminal workflow **18/18 PASS** (`author-terminal-browser-final.txt`).
- Independently added Node suite: **6/8 PASS**, the two failures above.
- Independent browser reproductions: both exhibit PUB-AUX-R1. Error console was empty.

The independent passing cases include available exact old rollback ACK, old definite rejection while a new publish remains pending, five malformed/wrong/legacy run proof variants after auth, two old owners ending in reverse order, immediate initialization registration plus old/new coverage settlement, and readonly failure ending its ticket without a success claim. Author cases additionally confirm real HttpAdminApi hidden late ACK remains unknown and no latest-run ownership guess occurs.

Local preview note: binding the archive's localhost server required the approved sandbox escalation. Vite's optional dependency scan warned about the unused application `virtual:pwa-register` entry; these fixtures import the independently rebuilt fixed module directly and loaded successfully. No application-shell completion is inferred.

## Return and next action

`localReviewVerdict: changes_requested`
`reviewedHeadSha: 3eac7469a033f658893654802ad1cc21670d88db`
`reviewSubjectRef: commit:3eac7469a033f658893654802ad1cc21670d88db`
`acceptedSourceRef: docs/field-test/team-meals-pages/publish-aux-handoff.md@3eac7469a033f658893654802ad1cc21670d88db`
`acceptedRevision: 296f96bac1287af666b986275239396be2e2c42dfc87c1c34be66f09ee7c9039`

Return to `/root`, the author and direct review carrier. Fix PUB-AUX-R1 with an actual red→green check for both malformed current and available-late ACKs, then provide a new fixed commit for focused re-review. There are no other findings in this bounded review; the current target is not approved. Shared main/C1 seal and the overall release remain separate review scopes.
