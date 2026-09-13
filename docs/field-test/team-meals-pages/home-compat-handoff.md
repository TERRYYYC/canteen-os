---
feature_ids: []
topics: [team-meals, home, compatibility, authentication]
doc_kind: implementation-evidence
created: 2026-09-11
---

# Homepage compatibility — bounded implementation handoff

What: `packages/web/src/pages/admin/home.ts` now consumes C1 `getTeamMealsApi()` and `TeamCatalog` for catalog and plan reads. It retains the existing seven entry tiles, three-language labels, count derivation and unknown-number display. Real publication status remains a separate legacy `getChanges()` read. With no configured Worker it displays the connection notice, keeps figures unknown and never calls the legacy API getter. Explicit mock mode labels the simulation and does not claim publication. No source data is changed.

Why: original D0 compatibility row and source acceptance T01/T08 require v2/v3 coexistence without invented quantities or simulated connectivity. The original home called strict legacy `getCatalog/getPlan` and implicitly selected the legacy mock when unconfigured.

Tradeoff: the shared Team API has no publication reader; home uses the existing legacy publication reader only for real mode. A read-only page snapshot is scoped to the Team API instance and opaque session key. Auth changes immediately remove cached figures and pending requests cannot populate a different account. Same-session language redraws preserve the snapshot and in-flight reads; navigation back triggers fresh page reads subject to C1 caching. The original entry routes and styling remain intact.

Validation: actual home renderer, DOM helpers, C1 `createTeamMealsApi` and `HttpAdminApi` are bundled with esbuild; only dependency getters, navigation links and shell network state are injected. Fetch is explicitly local fixture transport. This executes DOM behavior, not source-regex assertions. The fixture combines v2 and v3 dishes and plans, including missing servings; reads preserve the input bytes. Eight tests cover unconfigured zh/en/uk, mixed format reads, explicit mock truth, forbidden versus confirmed missing plan, late replies, immediate auth invalidation, completed cache replacement and offline repaint. DOM double is not browser/layout evidence.

Observed RED: `red-home-compat.txt` records 5 failed / 1 passed cases against the original home. Failure reasons include calls to the legacy getter and strict v3 rejection, absent simulation notice and missing auth protection. The failure run preceded implementation; the two additional cache/offline tests were added after it.

Observed GREEN: `green-home-compat.txt` records 8/8 tests from `node --test packages/web/test/team-meals-pages-home.test.mjs`. `npm --prefix packages/web test` passed 170/170 during the current shared worktree run. `npm --prefix packages/web run typecheck` and `git diff --check` passed. No matching `.pen` or repository-specific cat-cafe checker scripts were found; this repository uses the existing HTML design/D0 contract. Home changes do not alter its CSS or layout.

Workspace: `/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages`, branch `codex/team-meals-pages`. Task began at `6ca272d1f34e525f6680177cffa24a51353fa828`; shared parent advanced HEAD to `631298aec7d89bba4ee884f4a5ef4258ddaad38d` during implementation. Home changes are uncommitted. Other agents' work was not edited. Architecture cell remains RC-D pages; shared APIs/store/router and Q E2E are unchanged by this slice.

Open questions / next action: parent can run the normal browser and independent-review checks. These author checks do not provide independent approval, real Worker connectivity, publication roundtrip evidence, visual signoff or complete T01/T08 acceptance. No remote writes, commits, pushes, PRs, comments or deployments were performed.
