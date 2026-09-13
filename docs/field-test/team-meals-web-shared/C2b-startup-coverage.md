---
feature_ids: [team-meals]
topics: [web, main, reload-safety, startup]
doc_kind: validation-evidence
created: 2026-09-11
---
# Shell-only startup coverage

After approved shared bae6308 and the dispatch-released D fa7 base combination, an additional main.ts ownership gap was confirmed. Before the first manifest request completes, renderPage starts an admin/purchase coverage entry but renders only a loading paragraph. No PageCtx has reached D. Navigating elsewhere or changing auth during this wait can leave the original entry untracked forever; D cannot finalize a callback it never received.

The actual main entry bundled with actual token and reload-safety reproduces both paths: auth change yields unknown, and loading-route navigation/language redraw yields untracked after the selected page has completed setup. A third case verifies that a separate unknown-write owner remains protected. Only page rendering, shell presentation and publication I/O are controlled; this is an integration test, not native browser evidence. RED was two failed observable assertions and one pass in `/private/tmp/c2b-main-startup-red.log`.

The two-line main change declares only the `!ready` shell-only placeholder read-only. The readonly manifest request cannot perform a write. Once ready, main still starts normal page coverage and leaves its completion to the real page. There is no auth-wide clearing, no changes to D, and no settlement of any editor/aux operation.

GREEN: three targeted tests, complete Web320/320, whole Web typecheck and actual main Vite build. Logs: `/private/tmp/c2b-main-startup-green.log`, `/private/tmp/c2b-startup-web320.log`, `/private/tmp/c2b-startup-typecheck.log`, `/private/tmp/c2b-startup-build.log`. The same non-author reviewer approved the fixed increment below; prior bae approval and separately versioned native SW evidence retain their historical boundaries.

Independent APPROVE: exact `838973689f67c6189d10353e4bc9e9681c5603cc`, `/private/tmp/c2b-startup-review-8389736-Av5bMH/REVIEW.md`. The original reviewer reproduced RED2/3 on618, then verified3/3 plus eight actual-main/auth/coverage probes, another five ready-page/owner preservation cases, fullWeb320/320, typecheck0 and actual build (entrygzip53.22KB). NoP1/P2; bounded to this increment. D's pending real-page wiring andL2 remain outside this approval.
