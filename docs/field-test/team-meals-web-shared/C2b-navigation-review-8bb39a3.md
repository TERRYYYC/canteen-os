---
feature_ids: [team-meals]
topics: [web, review, navigation]
doc_kind: review
created: 2026-09-11
---
# Independent team-navigation review

Verdict: **APPROVE** within the requested navigation increment. No P1/P2 found.

- Reviewer: `/root/c1_review`, original non-author local reviewer, constant identity. Implementation authors did not provide this verdict.
- reviewedHeadSha: `8bb39a3d11f281405d3da2c2f42be3091aa111ea`
- Compared base: `cc9248d59cae50b5aa9774bee5054e5df62480e5`
- Review-Subject-Ref: `task:01a08d94-5d2e-7162-8f34-689ed87e391e:team-navigation`
- Accepted-Source-Ref: `docs/field-test/team-meals-web-shared/C2b-team-navigation-contract.md`
- Accepted-Revision: `cc9248d59cae50b5aa9774bee5054e5df62480e5` (read directly from this Git object).
- Engagement: `local_cat`, iterative. No author files changed, no external messages, remote writes, or merge.

## Checked behavior

The winning publication supplies shell manifest, kind and main.planId together. The existing first listed plan is the sole navigation source. Failed and empty publications remove the old plan target; a failed/not-yet-loaded publication has neutral viewing semantics. The optional kind retains one-argument legacy behavior. Team and legacy wording were checked in zh/en/uk.

The plan uses the existing authenticated admin route. Main passes sanitized rest; exact matching marks only the listed plan, not sibling, prefix or unrelated admin routes. Shell refresh preserves equivalent link/theme focus and falls back to an available control when the focused plan disappears. Navigation changes do not replace the outlet, alter drafts, issue saves, settle pending operations, or declare reload coverage. Main retains its existing admin/purchase reader-refresh guard.

## Independent verification

- Exact implementation archived in this directory; branch/HEAD and clean author worktree verified before and after. Diff contains only the stated six Web files. Exact range diff check passed; D pages, CSS, package and configuration unchanged.
- RED: a separate exact-base archive with only the new test files overlaid reproduced **11 failures / 4 passes** (10 shell failures plus the new main propagation failure; old main tests and pending-save containment pass). Log `/private/tmp/c2b-navigation-independent-red-cc9248d.log`; archive `/private/tmp/c2b-navigation-red-review-cc9248d-Ih3J3Z`. An initial missing core-build setup was resolved before this recorded result.
- GREEN: complete Web **332/332**, including all 15 targeted cases. Log `/private/tmp/c2b-navigation-independent-web332-8bb39a3.log`. Node 20 core build and whole Web typecheck passed.
- Additional shell probes **3/3**: team→one-argument legacy→null with stale kind; theme focus across publication/language change; focused target replacement; exact current state after drawer rebuild versus sibling/prefix routes. `/private/tmp/c2b-navigation-independent-shell-8bb39a3.mjs`.
- Independent main boundary subreview: existing main tests **4/4**, extended probes **8/8**, including late success/failure, empty target, actual token sanitizer, language redraw, and admin/purchase pending-state protection. `/private/tmp/c2b-navigation-independent-8bb39a3.test.mjs`.
- Direct unchanged-config actual main Vite build passed: entry gzip **53.73 KB**, below 60 KB, generated SW. `/private/tmp/c2b-navigation-independent-build-8bb39a3.log`; artifact `/private/tmp/c2b-navigation-review-8bb39a3-XNA1Go-build`. Formal producer data were generated locally from the fixed fixtures.

## Independent native browser check

Started the committed application-mode local helper from the exact archive on its own random loopback port 55478. Original index/main were used, not the harness entry. Source directory and index matched the exact archive byte-for-byte. Site artifacts remain at `/private/tmp/c2b-real-sw-tmfNhX`; fixture A revision was `7ba7c0ac1b105ae3cfd9d60b7b309116f4b85dca` (data identity, not implementation SHA).

In Chrome, the English application displayed Meals / For the team / Plan meals and the real week-41 link. Clicking it closed the drawer and opened the existing unauthenticated chef-link lock screen. Ukrainian and Chinese navigation labels were verified through the visible selector. Reopening on the plan route focused that exact link; the only aria-current link was the matching plan. Changing language while the drawer was open preserved native focus on that href.

At 393×852, the Ukrainian drawer screenshot showed readable labels, visible theme controls and footer, and no horizontal overflow (document width and viewport both 393). The locally generated synthetic 43-character token passed through the original chef-link flow, disappeared from the URL, and opened the original plan page with its existing import link and unavailable-save notice. No Worker was configured and no save was attempted. Temporary viewport was reset; review tab and server were closed.

The requested embedded browser was unavailable, so the available Chrome provider supplied native evidence. This does not change application source or production state.

## Limits

Approval covers this C shell/main/i18n navigation change and its checked boundaries only. The actual frozen D menu body still reports data not ready on the formal team fixture, as disclosed by the author; this review does not approve pending D complete published-page wiring, the complete application journey, or Worker/L2. Native evidence covers the formal team app and auth route; legacy/empty/failure and pending containment are covered by actual-module tests with controlled I/O, not claimed as native Worker evidence.
