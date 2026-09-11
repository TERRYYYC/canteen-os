---
feature_ids: []
topics: [team-meals, pages, reload-safety, review-repair]
doc_kind: implementation-evidence
created: 2026-09-11
---

# D private unload guard repair — author evidence

What: Remove the private `beforeunload` listener in Ingredient, Dish, Import and Publish. Keep route/view cleanup and every raw buffer, owner, operation ticket, auth boundary and source proof unchanged. Production scope is those four D pages; no C, public Menu/Prep or parser change. Architecture cell RC-D pages; map delta none. This is a bounded repair, not approval or whole-feature completion.

Why: Independent APP-MAIN-R2/P2 [fixed-3eb report](review-receipts/application-3eb2f35-changes-requested.md) and [actual-main minimal JSON](review-receipts/application-ingredient-unload-minimal.json) establish 3/4: initial Home unload is clear; Ingredient dirty → auth change → Home has shared `clear`, but the old Ingredient listener cancels unload. The old listener traversed quarantined raw owners even after their registry registration retired. The sibling listeners also vetoed an update after C's explicit dirty-discard consent. `initPwa` sets its own `approvedReload` only at the final reload boundary; another listener cannot see that valid consent.

Tradeoff: Actual `initPwa` owns browser unload. D already synchronously registers raw and pending work with C, including anonymous previous-session operations. Removing duplicate listeners makes that registry authoritative without clearing dirty values, suppressing unknown state, adding an approval flag or exposing a second auth map. Standalone Ingredient/Publish tests now assert the real registry; the new composition tests exercise the actual PWA listener as well.

Open questions: None for the four-page removal. Native service-worker registration is controlled in the author browser fixture, so the integrated actual-main/native-SW independent check remains assigned to `plan_review` on the frozen candidate. That boundary is not claimed by these author tests. The observed old canceled-reload retry is not assigned to C by this report.

Next action: Root routes the frozen commit to the original independent reviewer. Check APP-MAIN-R2, same-auth explicit discard for Ingredient/Dish/Import, and unresolved operations across auth. Do not approve other page implementations merely from the full-suite result.

## Reproduction and verification

Worktree: `/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages`, branch `codex/team-meals-pages`. Last production baseline before freeze: `c6c8e984126a646279a67379a2814b5aac63993e` (approved C navigation merge). The four original D source files in that parent are the same ones used for the author RED before edits.

| Evidence | Actual result | Scope |
|---|---|---|
| [unload-red.log](guard-evidence/unload-red.log) | 3/7 PASS; 4 FAIL | Three explicit-discard paths attempt reload, then a private listener cancels it; retired Ingredient also cancels shared-clear unload |
| [unload-green.log](guard-evidence/unload-green.log) | 7/7 PASS | Same assertions after four listener removals |
| [original page regressions](guard-evidence/unload-regression-112.log) | 112/112 PASS | Ingredient, Dish, Import, Publish and auxiliary page behavior |
| [final targeted](guard-evidence/targeted-green-19.log) | 19/19 PASS | 7 unload + 12 ACK proof scenarios |
| [final full Web](guard-evidence/full-web-419.log) | 419/419 PASS | Current merged Web tests, run once after final production/test changes |
| [typecheck](guard-evidence/typecheck.log) | exit 0, no diagnostics | Actual Web TypeScript |

Commands: `node --test packages/web/test/team-meals-pages-{unload,ack}.test.mjs`; from `packages/web`, `node --test test/*.test.mjs`; `node packages/web/node_modules/typescript/bin/tsc --noEmit -p packages/web/tsconfig.json`; `git diff --check`.

The Node harness bundles the actual four renderers, real HttpAdminApi/TeamMealsApi and actual C `initPwa`/registry. Only local fetch and virtual SW registration are controlled. It uses a DOM double plus native EventTarget; it does not represent a browser screenshot. The test reload boundary dispatches a cancelable unload event. No test-only approval flag is introduced.

## Actual browser dogfood

Start `node packages/web/test/team-meals-pages-guard-browser-server.mjs`, then open `http://127.0.0.1:4222/?case=ingredient-dirty&run=<unique>`. The server compiles into a temporary directory, with no hot reload. `source-hashes.json` pins each exercised D page, actual PWA and registry. The HTML explicitly labels local API/SW-registration boundaries; all API values, including A/B revisions, are fixtures.

- `ingredient-dirty`, `dish-dirty`, `paste-dirty`: Prepare → Probe ordinary unload → Show update → actual update bar → explicit Discard. Ordinary probe is prevented; actual native unload has `isTrusted: true`, is not prevented, triggers pagehide, and boots document 2. Raw was still `dirty` during native unload; no owner was cleared to force a pass.
- `ingredient-retired`: Prepare performs raw edit → actual auth notification → read-only Home. Shared clear, ordinary probe not prevented; update boots document 2 without a dirty dialog.
- `ingredient-pending`, `dish-pending`, `publish-pending`: Actual page save → held local write → probe/update protected with no discard choice → lose response → unknown → auth/Home → still unknown, blocked and anonymous. Each stays boot 1 with exactly one write.

[Raw browser JSON](guard-evidence/browser-results.json) includes all 11 scenarios plus three language observations; [summary](guard-evidence/browser-summary.json) checks 4 native reloads and 7 protected pending/unknown scenarios. No real publication, rollback, GitHub or Worker write occurred. Actual native-SW activation is deliberately not faked or claimed.

## Harness history and limits

Early harness setup failures were corrected before the valid RED: replacing the wrong root removed the update bar; the DOM double lacked `showModal`; the initial changes fixture used a number instead of the required unpublished array. These were test setup failures, not product findings. The valid RED was saved before production modification.

The first author browser attempt successfully reloaded Ingredient but the Dish fixture assigned `12,` to a native `type=number` field, which the browser sanitized to empty. That run was not counted as a Dish pass. The browser fixture now uses `12` for dirty Dish input and enables probe/update only after preparation. Initial CSS import typo and local-server sandbox bind denial were fixed before testing; local-only bind was then approved. A strict accessible-name lookup for the update button was replaced by its observed `.update-bar button` locator. Final browser evidence uses HTML hash `a9f4283904800ec5565a9f45dd240a24b6800f8998ec0c8abf57d20058f56a75`; every counted scenario was rerun on it.

The fixture compiles actual PWA/registry and D pages, not main/shell. The later approved C navigation merge changes main/shell/i18n; exercised D/PWA/registry hashes are unchanged. The full Web and typecheck evidence is on the merged parent. No layout redesign was made; no .pen design applies. User-visible text is separately checked in [ACK/text repair](guard-ack-repair.md). No Clowder capability tip or architecture layer is added.

Full staged `git diff --check` reports 16 whitespace-only lines emitted by Node in the untouched RED logs (8 ACK, 8 unload). These original bytes are deliberately retained; the scoped production/test/Markdown diff check passes. The SHA256 manifest includes the raw logs, including empty successful typecheck output. No raw failure evidence was reformatted.
