---
feature_ids: [team-meals]
topics: [web, review, startup]
doc_kind: review
created: 2026-09-11
---
# Independent bounded startup review

reviewedHeadSha: `838973689f67c6189d10353e4bc9e9681c5603cc`

baseSha: `618e2a2c9899202d5da991e5d2e0ade99337a05e`

Verdict: **APPROVE** for this three-file startup increment. No P1/P2 found.

## Scope and conclusion

The two-line main change completes only the loading placeholder's captured coverage before any page render is invoked. Once publication loading succeeds or fails, the normal render begins fresh page coverage and leaves acknowledgement to the page. The callback is scoped to its own auth, route and render generation. It does not settle editor or auxiliary operations or mark all auth/page scopes complete.

The exact commit was archived in this directory. Author files were not edited. A later unrelated uncommitted pwa-browser-server.mjs change in the author worktree was excluded; HEAD remained the reviewed SHA.

## Independent evidence

- Exact 618 source with only the new test file overlaid in a separate RED archive reproduced two failures and one pass: auth left generic unknown, route/language changes left untracked. Log: `/private/tmp/c2b-startup-independent-red-618e2a2.log`. RED archive: `/private/tmp/c2b-startup-red-618e2a2-whqRpu`.
- Exact 838 production and committed startup tests: 3/3 pass.
- Additional actual-main + actual-token/coverage probes: 8/8 pass. Both admin and purchase remain untracked until page acknowledgement after successful and failed publication loads; stale redraw callbacks cannot clear newer page coverage; an old-auth completion clears only its captured scope while the new same-page scope remains protected; offscreen initialized pages retain their obligation; an unrelated unresolved owner survives loading, auth change and page acknowledgement; a late initial request cannot reopen or overwrite the winning refresh. Probe: `/private/tmp/c2b-startup-independent-probe-8389736.mjs`.
- A second independent read and 5-case probe confirmed ready-page protection and independent dirty/saving owner preservation: `/private/tmp/c2b-main-startup-independent-8389736.test.mjs`.
- Node 20 core build passed. Complete Web tests: **320/320**, log `/private/tmp/c2b-startup-independent-web320-8389736.log`. Whole Web typecheck exited 0.
- Actual main Vite build passed with unchanged config and formal A-produced local fixture data. Entry gzip **53.22 KB**, generated SW with 32 precache entries including generated icons/QR assets. Artifact: `/private/tmp/c2b-startup-review-8389736-Av5bMH-build`; log `/private/tmp/c2b-startup-independent-build-8389736.log`.
- Exact 618..838 diff check passed. Only main.ts, its new lifecycle test file and the startup contract/evidence document changed.

## Limits

This is bounded approval of the startup increment and its tested integration with actual main/auth/coverage. Controlled page presentation and publication I/O in these probes are not native browser or Worker evidence. It does not approve D's pending real page owner/coverage/published wiring, the complete page journey or L2. Prior version-bound native SW evidence and the separately approved 618 bounded merge-fidelity report retain their original scope.
