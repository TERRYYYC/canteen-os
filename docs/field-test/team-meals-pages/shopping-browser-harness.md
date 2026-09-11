---
feature_ids: []
topics: [team-meals, pages, shopping, browser, fixed-source]
doc_kind: verification-handoff
created: 2026-09-11
status: harness-ready-browser-verification-pending
---

# Shopping page browser verification fixture

What: `packages/web/test/team-meals-pages-shopping-browser.html` calls the actual `createPurchaseRenderer` with the actual C1 `createTeamMealsApi`; the page's own C2 view model and C1 edit session remain in use. Why: verify the rendered journey, source binding and conditional writes rather than a separate fixture controller. Tradeoff: all network responses and repository storage live in explicit local fixture memory. Open questions: actual browser results and any production-page defects found there. Next action: root runs the entry, fixes its production files as needed, records exact browser evidence and obtains independent review.

The bounded subtask writes only this HTML entry and this D evidence document. It does not change production code, shared stores, C1/C2, original source design documents, Q E2E tests or fixture records. No commit or remote operation was performed. Initial worktree check: `canteen-os-team-pages`, branch `codex/team-meals-pages`, HEAD `247d6815865684236ce126cc82a1223a5132865f`. Other agents have concurrent production edits; this checkpoint is not a frozen acceptance claim.

## Scope and honesty

The input data comes from Q `afc3289`'s `test/fixtures/contracts/semantic-expectations.json` and `valid/boundaries/data`. Its existing revision tokens are format tokens for injected local objects. They do not establish authentic historical trees, Git reachability, Worker admission, publication or real save evidence. The toolbar and ledger state this explicitly.

Scenario A clones the boundary files. Scenario B is a separate explicit local derivative: both recipe records omit salt, the first recipe's tomato quantity becomes 301 g, tomato receives a marked scenario-B name, and the plan gains an uncounted 2026-09-16 dinner. These changes make stale-detail and review mistakes observable. B is never used as a metadata label for the unchanged A input; pinned reads select their corresponding full object. Source documents are not edited on disk. Missing counts stay omitted. Asset reads fail truthfully because the boundary fixture does not provide real image bytes; no remote or current-version image is substituted.

The mock implements only transport envelopes, immutable local snapshots, creation/update condition checks and injected response outcomes. It rejects unexpected request origins, paths and methods. It does not reproduce collection, reconciliation, estimation, edit-session or page state algorithms. Writes stay in the page's memory, all request logs omit credentials, and resetting the entry clears local saved lists. The clipboard is deliberately replaced with a rejecting test boundary so no real clipboard write occurs.

## Browser entry and selectors

Expected local entry: `http://localhost:4183/test/team-meals-pages-shopping-browser.html`; the HTML is a Vite development entry. The subtask could not connect to port 4183 at its final shell check; root must confirm or restart the intended local server before opening it. Query `?lang=en` or `?lang=uk` selects the initial language. Review at 393×852 and 1440×900; the toolbar wraps on narrow screens.

- `#lang`: zh/en/uk, rerenders the actual page with the same controller.
- `#scenario`: next save is success, hold, lost after write, or conflict with a local remote mutation. It returns to success after consumption.
- `#release`: completes the held response; `#away`: routes to menu and then returns to the previous purchase route.
- `#scope`: chooses latest plan A or B. The user must still read and apply scope through the production controls.
- `#reload`: creates a fresh actual page renderer and opens the stored list; `#reset`: clears only fixture memory.
- `#run`: resets and performs the actual DOM journey. `#result` reports PASS or the first failure. `#ledger` records requests, conditions, submitted bodies and passed assertions. A failed assertion does not count as browser acceptance.
- Production selectors used: `.tm-material[data-ingredient]`, `.tm-decisions`, `[data-phase]`, `[data-focus="new-list-id"]`, `.tm-slot input`, `.tm-removed`, `.tm-compare`, `article [data-component-index]`, and the visible fallback `textarea:not([hidden])`. Buttons are found using the production localized copy.

## Actual-page journey encoded by Run

1. Read saved plan A, select lunch, create four all-check candidates, and verify manual controls remain blocked until the separate `If-None-Match: *` creation is acknowledged. Make tomato and salt buy/bought decisions and save with the acknowledged `If-Match`.
2. Switch to Ukrainian and load the stored list with a fresh real page renderer. Set latest to B, follow ingredient and original recipe links, and verify the detail still uses A and 300 g. Verify clipboard failure reveals readable source version and decision text.
3. Read latest B, select its additional dinner and apply scope. Require every current candidate to be check, salt outside the current list in the old bought-record notice, and confirmation controls blocked. Save the full B reset with the existing lock; the ACK still leaves check. Confirm a material only in a later write.
4. Hold a save, switch to English, leave the route, release and return. Lose another response after the mock write, leave and return, then verify current + exact-commit recovery reads without another POST. Cause conflict, read/compare remote, adopt the compared remote source, and inspect the resulting material decision.

The sequence operates actual rendered controls. It never calls `createPurchaseForm`, `session.edit`, view-model mutation helpers, or direct controller methods from the fixture script. Its last step retains a reviewable real page state and complete request ledger.

## Evidence at handoff

- Extracted module passed `node --check`.
- A direct local HTTP check could not connect to port 4183 (curl exit 7). No successful serving or browser execution is inferred from the script syntax check.
- No browser journey has been claimed by this subtask. Root owns browser execution, screenshot capture, production fixes and exact-HEAD validation evidence.

Author fixture checks are not independent review. Real Worker/save/publication, authentic historical versions, network admission, asset bytes and the full feature remain unverified by this mock entry.
