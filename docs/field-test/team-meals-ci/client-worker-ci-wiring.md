---
feature_ids: [team-meals]
topics: [ci, client-worker, integration-tests, verification]
doc_kind: verification-evidence
created: 2026-09-11
---

# Explicit client–Worker contract test wiring

This checkpoint wires Q's approved five L1 client–Worker cases into the existing CI and Build & Deploy jobs. A's final production team-meals check/output and fixed-golden legacy command split are still awaiting A's approved implementation. Their existing commands are unchanged here. This is not completion of the overall team-meals build gate, browser validation, L2, or deployment.

## Accepted inputs and ownership

- Frozen supply: `67b05fb7cf155f8adff3e20563c14a4ae7896f5d`; its package/lock/preparation implementation is unchanged.
- Approved Q: `e721132b94ec63f58aae216f7817e26a7916ff64`, independently reviewed by `v2_review`, receipt `rcq-client-worker-review-e721132-20260911`, no findings. The original receipt was read at `/tmp/rcq-api-integration-review.json`.
- Q acceptance checkout was verified at that exact HEAD with a clean tree. The diff from `8e87f915b6e5a2186cca8a8fdb51798cff6c6332` contains only Q's three reported files and passes whitespace checks.
- Local merge `96e1b740437f2e61a0b990848a5c4da707e609f8` preserves the full approved A/B/C/Q ancestry and 67b05fb. The merge was conflict-free; no three-file-only cherry-pick was used. Main and the Q checkout were not edited.
- Requirement anchor: `docs/specs/team-meals-contract.md`, current content revision `ad1f427ae8d7ffc6841bfd2e51c279d2c90381d2`. Dispatch explicitly released Q consumption and the local wiring/failure checks while reserving A's final commands and all external publication.
- CI owns the two workflow edits and the new orchestration tests. Q owns the nested cases/helpers and fixtures; no business implementation or fixture changes are included in this wiring delta.

The received approval was checked against the independently read receipt, Git objects, source diff and checkout state before local integration. The receipt is a reviewer-authored local record; it is not represented as a GitHub review or real CI run.

## Execution order

| Existing step | Behavior |
| --- | --- |
| CI `packages/worker tests` | Unchanged `pnpm -C packages/worker test` runs the existing Worker build chain, which builds core first, then validators and Worker, then Worker tests |
| CI `packages/web tests` | Explicit `set -e`; existing Web tests, then root `node --test packages/web/test/e2e/team-meals/api-contract.test.mjs` |
| Build & Deploy `Gate — build-data --check --compare-snapshots` | Explicit `set -e`; `npm --prefix packages/worker run build`, the same Q test entry, then the unchanged build-data check |

The Web glob is non-recursive, so the nested entry must be explicit. CI reuses the prior Worker test build; it does not add another Worker build. The deploy job has no prior Worker build, so it needs the documented command. That command includes core, accepting a small repeated core build while retaining the existing named core-build step and package contract.

Every existing job/step name is retained. In particular, the deploy gate remains mapped to the existing Worker publish-progress stage. No new dependencies, package scripts, services, secrets, endpoints or permissions are added. The frozen image preparation remains in the existing install steps.

## Author evidence

Runtime: actual Node **20.20.2**, macOS arm64. Existing pnpm **9.15.0** frozen installation completed with the lock already current and no resolution changes. This was an install in the existing worktree, not a clean-machine installation claim. The first installer invocation did not start because the restricted PATH omitted pnpm; after locating it, frozen installation succeeded. A later pnpm test launcher produced no output and was stopped; real runtime tests used npm to execute the same checked-in package scripts. Signature checks were not disabled.

| Check | Observed result |
| --- | --- |
| New orchestration tests before workflow edits | 4 passed / 5 failed: the missing nested CI call and missing deploy prerequisites were exposed; existing failure behavior passed |
| New orchestration tests after workflow edits | 9/9 |
| `npm --prefix packages/worker test` | Builds core/validators/Worker, then 259/259; includes the publish step-name mapping regression |
| `npm --prefix packages/web test` | 82/82 |
| `node --test packages/web/test/e2e/team-meals/api-contract.test.mjs` after Worker build | 5/5 |
| `node --test packages/core/test/*.test.mjs` after build | 87/87 |
| `npm run test:scripts` | 119/119, including new wiring tests, existing supply tests and Q fixture tests |
| `npm --prefix packages/web run typecheck` | Exit 0 |
| `npm --prefix packages/worker run check:validators` | Exit 0; schema digest `61cbb92f8d23` |
| `node scripts/prepare-team-image-tools.mjs --check` | Exit 0, existing verified 1.6.0 cache |
| Execute the actual deploy gate `run` block locally | Worker/core build exit 0, Q 5/5, existing check 5 snapshot rows / zero differences / no output writes |
| `git diff --check` | Exit 0 |

All test totals above have zero skips. `TMPDIR=/private/tmp` was used for script/runtime checks because the pre-existing schema-check CLI has the macOS path-alias caveat already recorded in `image-tools-supply.md`. The frozen supply scripts, package and lock content remain identical to 67b05fb.

The nine new tests read the actual workflow run blocks. Their temporary command shims execute the checkout's real package script strings, substituting only compiler/test processes; a readiness marker appears only after the Worker build script succeeds. The nested test refuses to run before that marker. Failures are injected at Worker build, Worker tests, Web tests, nested contract tests and data check; each must propagate exit 31 and stop dependent work. Successful paths assert exactly one nested invocation and preserve order. These are orchestration tests, not substitutes for the real component/contract execution above.

Only the deploy **gate block** was executed locally. Translation, translation commits/pushes, artifact upload and deployment steps were not executed. No production data was written. The existing legacy check passing is not evidence for A's future team target or fixed-golden split.

## Scope and remaining integration

This is the local Q wiring explicitly released by dispatch, extending the existing plan without implementing guessed A commands. After A's final implementation and exact commands are approved, CI owner must update both workflow check and data-output commands together, keeping the original names, and obtain review of that new delta. The production team check and fixed-golden legacy comparison must use their distinct inputs. Ordinary image validation remains offline.

Linux preparation/linkage and actual external CI still have no local execution evidence. These L1 tests use real client/editor/Worker/core code with the existing GitHub FakeRepo; they do not establish real GitHub history, Cloudflare runtime, browser UI, production credentials or L2 behavior.

Risk assessment: no business/data/auth change; the relevant risk is test omission/order and failure propagation. Architecture ownership/map are unchanged. UI dogfood is not applicable to this internal workflow/test change; real local component and combined-contract execution supplies the relevant evidence. Independent review must bind the new wiring commit, not reuse the Q or 67b05fb approvals. External publication remains paused.
