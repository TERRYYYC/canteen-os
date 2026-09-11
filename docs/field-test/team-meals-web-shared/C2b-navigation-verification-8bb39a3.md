---
feature_ids: [team-meals]
topics: [web, shell, navigation, i18n, validation]
doc_kind: quality-gate
created: 2026-09-11
---
# Team navigation verification

Implementation: `8bb39a3d11f281405d3da2c2f42be3091aa111ea` on `codex/team-meals-web-shared`.
Accepted source: `C2b-team-navigation-contract.md` at `cc9248d59cae50b5aa9774bee5054e5df62480e5`, explicitly accepted by dispatch before implementation. This is the bounded C global-navigation correction requested after the previous C2b shared-work standby; it does not close pending D full-page wiring or L2.

The original SCREEN-CONTRACTS S01/S02/T08 requires team meal viewing without a customer entry; S08 already names the authenticated plan route. D0 assigns global navigation to C. The previous shell received only a manifest, unconditionally showed the legacy guest role, and disabled every plan behind a second-phase label. The correction uses the winning validated publication kind and its first listed plan, preserving the existing route and authentication.

| Accepted behavior | Evidence |
| --- | --- |
| Team menu and title use team semantics in zh/en/uk | Formal producer regression tests; actual application at both viewport sizes |
| A listed team or legacy plan opens its real protected route | Reader/shell tests; actual main lock screen and authenticated local route |
| Empty and failed publication cannot invent or retain a plan target | Three-language shell tests; actual-main publication failure and recovery test |
| Legacy retains reader semantics and the optional API argument | Legacy shell tests; source compatibility through whole Web typecheck |
| Refresh preserves equivalent link focus and safely handles a disappearing plan | Controlled shell tests; native keyboard and language switch |
| Navigation updates do not replace an active editor or retire pending saves | Actual-main lifecycle test; actual edit-session pending-save shell test; existing full Web suite |
| Existing plan alone is current; admin home/publish are not marked as that plan | Shell test and native authenticated plan drawer |

## Verification

- Before implementation: shell navigation **10 failures / 1 pass**, `/private/tmp/c2b-navigation-red.log`; new main publication propagation test **failed** with the previous three tests passing, `/private/tmp/c2b-navigation-main-red.log`.
- After implementation: targeted **15/15**, `/private/tmp/c2b-navigation-green.log`; whole Web **332/332**, `/private/tmp/c2b-navigation-web332.log`; whole Web typecheck exit 0, `/private/tmp/c2b-navigation-typecheck.log`.
- Original Vite build exit 0: `/private/tmp/c2b-navigation-build-8bb39a3.log`. Entry gzip **53.73 kB**, below the 60 kB limit; generated SW precaches 34 entries. Build output is `/private/tmp/c2b-navigation-original-build-8bb39a3`. No build/package/config changes.
- Exact diff check passed. Six implementation/test files changed; no D page/CSS, business data, schema, Worker or production configuration changes. Worktree was clean at the reviewed code SHA.
- No `.pen` file matched in this worktree. Existing shell styling was retained, with the approved text/availability contract and native screenshot used for comparison. No repository-root media or design artifacts were introduced. Cat-cafe-only architecture/tips/hotfix/fallback scripts are absent in this external repository and were not introduced.

Architecture cell: existing C shared shell/main; map delta: none. Behavior and interface risk are medium (kind/availability/focus), while data, security and irreversible risk are low (validated read-only context, unchanged auth route, local reversible changes). No new router, store, writer or publication fetch exists.

## Native dogfood

Author opened the real `index.html` / `main.ts` application produced by the unchanged local PWA browser server with `C2B_ENTRY=application`, using formal producer data and the frozen D fa7 pages. URL during validation: `http://127.0.0.1:54243/canteen/`; root `/private/tmp/c2b-real-sw-QI1VUr/a`. Recursive source comparison and index comparison to the fixed implementation both exited 0. Fixture A revision was `dd82321c2e09bb7d0d480ba7f9e28caa3c4a3ac8` (data identity, not implementation SHA).

- At **393×852** and **1440×900**, UI selection of each zh/en/uk language yielded 用餐安排 / Meals / Харчування, team roles, and 排每天的菜 / Plan meals / Планування меню linked to `#/admin/plan/week-41`. All six combinations had no guest role or second-phase wording and no horizontal overflow.
- Keyboard Tab reached the actual plan link. Changing Ukrainian to English preserved focus on the same href and updated its label.
- Clicking the plan without authentication closed the drawer and reached the existing chef-link lock screen at the correct URL. That screen intentionally took focus after shell closure.
- An explicitly synthetic local chef token through the existing token route was consumed and removed from the URL. The original plan page displayed its existing import link and honest unconfigured-saving status; no write was performed. Reopening the drawer marked exactly that plan current.
- A native screenshot at Ukrainian 393×852 confirmed visible labels, correct current plan, intact theme controls/footer, and no clipped controls. The browser viewport override was reset and the author-owned server was stopped after evidence collection.

The frozen D menu body currently shows “Data not ready” on this formal fixture. That observed limit is preserved in the evidence; approval of this navigation correction cannot be read as approval of D's pending full-page publication integration. Detailed author observations are also retained at `/private/tmp/c2b-navigation-native-8bb39a3.md`.

## Delivery boundary

Independent review is carried by the original non-author `c1_review` and must bind the fixed implementation plus the unchanged accepted source revision. Deliver implementation history and the original report only through dispatch. No main-branch write, remote push, PR creation, deployment, real publication, or direct D/Q contact belongs to this correction.

## Independent review and continuity

The original non-author `/root/c1_review` returned **APPROVE** for exact `8bb39a3d11f281405d3da2c2f42be3091aa111ea`, with no P1/P2. The original complete report is archived unchanged after YAML frontmatter in [C2b-navigation-review-8bb39a3.md](C2b-navigation-review-8bb39a3.md). It independently reproduced the old 11 failures / 4 passes, passed all 332 Web tests, added shell and main boundary probes, and performed a native browser verification against the exact application archive.

The final evidence archival commit changes only this verification document and that review transcript; all implementation files remain identical to the approved code SHA. The accepted contract last-content commit was rechecked as `cc9248d59cae50b5aa9774bee5054e5df62480e5` before archival. No renewed implementation approval is inferred from the documentation-only commit.
