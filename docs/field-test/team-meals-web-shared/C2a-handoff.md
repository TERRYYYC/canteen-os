---
feature_ids: [team-meals]
topics: [web, view-models, verification]
doc_kind: implementation-evidence
created: 2026-09-11
---
# C2a local implementation handoff

What: `src/view-models/team-meals.ts` implements the exports in `C2a-contract.md`. It composes accepted C1 transport/editor contracts with approved A2 formal core; Q fixtures and expected numbers remain unchanged. Only shared Web implementation, Web-owned tests and this evidence directory are authored in C2a.

Why: D can load selected plans/catalog at one SHA, render all recorded ingredient references and original metadata, and obtain core estimates/manual-list reviews without copying domain calculations. Stored list commit and ingredient basis revision remain separate.

Tradeoff: saved views are deep-frozen handles private to one authenticated VM lifetime; a cloned view cannot be used to create/confirm a list. Pages keep a handle for reads and a separate whole list body in C1's editor. The VM has no cache beyond weakly held immutable input snapshots, no subscriptions and no writes. Its `dispose()` does not dispose the caller-owned API. Calling after an observed session change permanently seals this VM, so a new principal creates a fresh one. Local preview is a separate unbranded result with no revision or persistence basis.

## Evidence on the implementation submitted for review

Initial red: `C2a-red.txt` records 15 failing tests before the new factory existed (0 passes, 15 failures). An implementation test found `createList` reading a draft/null handle before validating it; the final function resolves the private handle first and produces `invalid_view`. Early harness assumptions about fixture ID/revision and `totalCNY` were corrected against Q files, without editing those fixtures or their expectations. A metadata assertion was narrowed to the five actual selected ingredients; unused catalog ingredients are intentionally not projected by core.

Final author checks:

| Check | Result |
|---|---|
| New browser-bundled view-model tests | 20/20 |
| Complete Web tests (C1 plus C2a) | 102/102 |
| Core tests | 87/87 |
| Q contract/format/semantic tests | 64/64 |
| Web TypeScript | pass |
| Existing generated-data script | pass, week-41 2 orders / 5 lines, 0 issues |
| Existing Web build | pass |
| Diff whitespace check | initial working-tree check missed an untracked log; fixed-range review found trailing spaces, corrected in revision |

The three Q numerical scenarios verify every ingredient's packs/quantity/amount and their independently recorded totalCNY through the Web module's real core import. There is no mock collector, reconciler or estimator. Formal A1 schema validation is run on injected fixture entities. Q SHA values in tests are scenario tokens, not assertions that injected fixtures are authentic trees at those revisions.

Initial candidate `1b2de707ad38a5169d22366e16b0711479fed9e5` received independent REQUEST_CHANGES: the mock accepted a first create with a confirmed item, contrary to A0; one P3 flagged whitespace in the initial red log. See `C2a-review.md`. No other VM P1/P2 was found.

Revised browser author check: local Vite at `127.0.0.1:4181`, CUA in-app browser, `/test/team-meals-view-model-browser.html`. First tightened mock creation validation while retaining the old order and observed `FAIL: mock conditional save failed (invalid_selection)`. Then changed the flow to create all-check, await acknowledgement, and separately update manual decisions with `If-Match`. Clicked **Run candidate and review flow**, observed:

```text
PASS — mock only
Illegal confirmed creation: rejected
4 candidates; unknown servings preserved
Explicit editor saves: 2 (all-check create, locked manual update)
List storage E; material basis A
Changed tomato: check, previous bought retained
Cancelled scope: 0 active, 4 removed
No automatic saves from view-model
```

This loads the actual core/API/view-model/editor browser modules and performs two explicit mock editor saves plus one rejected create. It is not a product-page, deployed Worker, GitHub history or L2 result. Browser harness references original Q source fixtures; its next/empty inputs are explicit local scenario clones only.

Open questions/limits: B2 `32e674c` / docs `a75250c` is newly approved for local integration but is not merged or exercised by this candidate; C2a uses C1's injected network seam. Source schema validation and revision ancestry remain the Worker's responsibility. Public estimates do not claim recipe completeness or real asset decoding. New build is not consumed. Pages/CSS, production data, package metadata, main and remote refs remain untouched.

Next action: independent non-author review of the fixed implementation commit, especially auth/disposal, captured asynchronous inputs, invalid/foreign handles, previous/next revision independence and page-facing error behavior. After approval dispatch may forward the concrete implementation to D and schedule C2b against fixed B2. All push/PR operations remain paused; remote C1 is still the old `5975ba4` candidate.
