---
feature_ids: [team-meals]
topics: [home, admin-navigation, reload-safety, independent-review]
doc_kind: review
created: 2026-09-11
---

# Independent Home/admin coverage review

Target: `c2158e49e1f5591a44a594fd54a74ecb7858c500`.
Parent: `8a026a79608edbbcb521e44f42ea628c044936c2`.
Reviewer: `/root/import_owner`; author and delivery route: `/root`.
Intent: `local_cat`, independent non-author review of this commit's Home/admin delta. The parent commit contains this reviewer's Dish work and is explicitly excluded from approval. No source modification, commit, external write, or subagent was made by this review.

**Verdict: APPROVE — `c2158e49e1f5591a44a594fd54a74ecb7858c500`.** No P1/P2 findings. Both complete actual-browser outputs were independently read before issuing this verdict.

## Accepted sources and immutable custody

The full handoff was read before review. The original D0 page requirements and the approved C auxiliary/coverage contracts were checked against the actual archived implementation. Source is `git archive c2158e49e1f5591a44a594fd54a74ecb7858c500`, extracted at `/private/tmp/canteen-home-admin-review-c2158e4/source`. Only installed third-party dependencies are linked from the shared worktree; production source and local core resolve inside the exact archive.

| Exact archived file | Git blob |
|---|---|
| `packages/web/src/pages/admin/home.ts` | `af3136b6b6e91d8e675973710dc7aa1d04e4e68e` |
| `packages/web/src/pages/admin.ts` | `8d0d7482b31db1e6c0cfe212b51ae3fdfb4c2f98` |
| `docs/field-test/team-meals-pages/home-admin-coverage-handoff.md` | `dec5b33bed10deaf83b4a66c53d770edb8b2a698` |
| `docs/design/team-meals-pages/D0-contract.md` | `43eacd202b6f89cfcbd07b5b3fb3a140034d1b82` |
| `docs/field-test/team-meals-web-shared/C2b-aux-auth-contract.md` | `dd9c773d17d940a84f16cfe72f437a1e393f0eab` |
| `docs/field-test/team-meals-web-shared/C2b-aux-contract.md` | `1b000a4b87155eb206d6e04f4f91c16035572ead` |

Both production blobs were independently hashed from the archive and matched the commit tree. The reviewer-generated actual-renderer browser bundle records Home SHA256 `22c5c01a7192c5bac0c143291f0bdc04a4c433061540607740107fd34ab54fc5` and admin SHA256 `23ec854967e90441116dd90c79844044dfbc6b151f3f8df51d60f52bd334da74`.

## Inspection and findings

No P1/P2 behavior finding in the reviewed delta. Home registers the existing snapshot lifecycle synchronously, retains the same owner on language redraw, obtains a distinct opaque read ticket before invoking each actual reader, and closes only that captured ticket in `finally`. A failed read can leave its displayed number unknown while the finished read releases protection. Auth clears the private snapshot but pending old tickets remain in the registry; neither the old UI guard nor the old initialization callback can affect new-auth ownership. No additional draft body or auth map is introduced.

Dispatcher coverage is acknowledged only where no child started: locked, unrecognized, failed chunk, and detached chunk completion. Normal child rendering remains responsible for its own declaration. The independent tests deliberately leave a newer child untracked to prove the dispatcher and an old same-route completion cannot acknowledge it. Read-only declarations do not dispose offscreen dirty or pending owners.

The complete commit's whitespace check reports six whitespace-only lines in the captured RED test output (`red-home-coverage.txt`, lines 27, 30, 46, 49, 65, 68). This is a nonblocking evidence-format note, with the exact diagnostic preserved in `full-diff-check.txt`; the two production files pass `--check`. The report does not describe the full-commit whitespace check as passing.

## Fresh validation

- Author Home Node suite rerun against exact source: **11/11**. Evidence: `home-author-tests.txt`. Historical checks include real mixed v2/v3 original values, unknown counts, confirmed 404-only zero, unconfigured zero requests, explicit simulation status, zh/en/uk redraw, offline behavior, and auth-private snapshot behavior.
- Independently authored Home/admin suite: **8/8 cases, 25 assertions**. Evidence: `review-node.txt`; source: `source/packages/web/test/review-home-admin-suite.mjs` and `review-home-admin.test.mjs`.
- Exact-archive TypeScript: exit 0; `typecheck.txt` is empty.
- Production-only diff whitespace check: exit 0; `production-diff-check.txt` is empty.
- Actual browser independent suite: **8/8 cases, 25/25 assertions**, complete result inspected in `independent-browser.json`; recorded source hashes exactly match the archived production files.
- Historical actual Home browser: **54/54 assertions**, complete status and ledger inspected in `historical-home-browser.json`; unconfigured and explicit mock v2/v3 × zh/en/uk pass. Exactly four synthetic GETs appear across the two mock schema cases; unconfigured emits none.
- Both browser fixtures ran against the exact archive server at `127.0.0.1:4251`: `/test/review-home-admin-browser.html` and `/test/team-meals-pages-home-browser.html`.

Independent cases:

1. Publication read fails while catalog and plan remain pending; the actual Retry handler starts a new publication request and reuses real in-flight cache reads. Catalog failure ends only its ticket; confirmed missing plan yields zero only on its own completion; the original inputs remain unchanged and every request is GET.
2. A's failed publication read is retried and held; B opens and has its own pending read. A's late 401 through the actual HTTP adapter ends only A, does not lock B, and does not release B. B completion leaves no old coverage residue.
3. Synchronous publication reader throw is terminal for its read; independent plan counts stay known and publication remains visibly failed/retryable.
4. Home is removed while three reads are pending and dispatcher opens not-found. Two failed old reads leave the last protected; the final original completion clears old initialization without repainting the destination.
5. A chunk rejection uses the actual Retry handler. The retried chunk completes after its element is removed; no child is invoked and no permanent untracked marker remains.
6. Two same-route dispatches overlap. A newer child deliberately makes no coverage declaration; old detached completion cannot acknowledge that child.
7. A pending chunk is abandoned across auth; B's child registers an actual auxiliary read. A's completion settles only its context; B remains protected until its exact ticket ends, after which no old untracked marker remains.
8. A lock page's read-only declaration preserves an offscreen dirty owner and then its outstanding write ticket. Definite failed completion retains the dirty draft. The summary contains no synthetic login string.

Harness boundaries: Home's API getters and online display are injected; its renderer, DOM helpers, C registry, TeamMealsApi and HttpAdminApi execute as archived. The dispatcher's private loader table is exported only in the reviewer-generated module so chunk completion/rejection order can be controlled; its dispatch/retry/coverage code is unchanged. Child stubs are used only to test ownership of the dispatch boundary. Node uses a minimal DOM and is not claimed as browser/layout evidence. Browser uses actual DOM. All requests are synthetic local fixture reads and no real service, upload, save, publication, or PWA activation occurs.

Browser provenance: this reviewer's CUA initialization times out and its IAB is unavailable. `/root` acted only as IAB operator at reviewer-supplied archive URLs, clicked the fixed Run controls, and saved complete displayed JSON. This reviewer read all cases, all 25 independent assertions, and all 54 historical assertions directly from those files. Assertions and the review decision belong to `/root/import_owner`; author operation of the browser is disclosed and is not counted as a second independent review.

## Five-tuple return

What: independent exact-commit review of Home read ownership and admin dispatcher coverage.

Why: verify pending reads survive language/navigation/auth boundaries while truly finished or abandoned read-only setup can end; preserve Home's original counts and no-request unconfigured behavior.

Tradeoff: keep existing snapshot/read semantics and shared C algorithms. Test seams inject API getters and controlled chunk resolution rather than modifying production. This approval covers only the c2158e4 delta, not the reviewer's Dish parent, C/main/PWA integration, or overall feature delivery.

Open Questions: no open technical or value issues in this scoped delta. The six raw RED log whitespace lines are disclosed above as a nonblocking format note. C/main/PWA integration and wider feature completion remain separate review subjects.

Next Action: deliver this frozen exact-target approval and evidence to `/root`; author may consume it for this Home/admin delta only. No source edits or re-review of the Dish parent are required by this report.

## Local verdict delivery identity

```json
{
  "clientMessageId": "home-admin-review-c2158e4-import-owner-20260911",
  "localReviewVerdict": "approved",
  "reviewedHeadSha": "c2158e49e1f5591a44a594fd54a74ecb7858c500",
  "reviewSubjectRef": "git:codex/team-meals-pages:c2158e49e1f5591a44a594fd54a74ecb7858c500",
  "acceptedSourceRef": "git:c2158e49e1f5591a44a594fd54a74ecb7858c500:docs/field-test/team-meals-pages/home-admin-coverage-handoff.md",
  "acceptedRevision": "dec5b33bed10deaf83b4a66c53d770edb8b2a698",
  "reviewer": "/root/import_owner",
  "authorRoute": "/root",
  "noOpenItems": true
}
```
