---
feature_ids: [team-meals]
topics: [ci, fixed-revision, team-build, verification]
doc_kind: verification-evidence
created: 2026-09-11
---

# Team production and fixed-golden build wiring

Both workflows now check production using A's explicit team-meals target, compare old numeric behavior only against Q's fixed golden root, and generate team output from the same commit that passed the production check. Existing workflow step/job names and Q's explicit client–Worker tests are retained.

## Approved inputs and change boundary

- Supply `67b05fb7cf155f8adff3e20563c14a4ae7896f5d` and Q wiring `db45710f9568d4689a7596e21139cc99e14eb955` remain in history.
- Dispatch released A's independently approved final `8cff8538f36557203b28d1021419370b563ff1e8`, code `06f52b409696311465a85c2229deed09bb47127a`. The source checkout was verified clean at 8cff. The 06→8cff delta contains only the documented module clarification, 17 additions and 2 removals; no executable changes.
- Conflict-free local merge `4b7621c6e156b39aaceee708fa0f6b4c235557f1` preserves A's complete history alongside the approved Q/B/C ancestry. A's implementation and fixtures were not edited by CI.
- Exact command source: `docs/modules/team-meals-build.md`, content revision `8cff8538f36557203b28d1021419370b563ff1e8`; the current feature contract content revision is `06f52b409696311465a85c2229deed09bb47127a`. These final revisions were read before wiring.
- The CI delta changes only the two workflows, extends its existing orchestration tests and adds delivery evidence/PR draft. Packages, lock, supply implementation, business code, shared fixtures and `packages/web/vite.config.ts` are unchanged.

## Execution contract

Each existing `Gate — build-data --check --compare-snapshots` step uses `set -e` and captures `git rev-parse HEAD` once into `TEAM_MEALS_SOURCE_REVISION`. Build & Deploy captures after its existing translation commit step and Q prerequisite tests, so it uses the actual current checkout commit instead of the potentially earlier event SHA.

The gate runs:

```sh
node scripts/build-data.mjs --target team-meals --check --revision "$TEAM_MEALS_SOURCE_REVISION"
node scripts/build-data.mjs --target legacy-numeric --check --compare-snapshots --root test/fixtures/contracts/valid/golden --at 2026-10-03T00:00:00.000Z
```

Only after both checks succeed does it append the captured revision to GitHub Actions' job environment file. The existing data-output step requires that value and runs:

```sh
node scripts/build-data.mjs --target team-meals --revision "${TEAM_MEALS_SOURCE_REVISION:?Missing checked source revision}" --out packages/web/public/data
```

The output step never resolves HEAD again and cannot silently use legacy's default target. Production calls use the real repository's committed input; the legacy call explicitly uses only the fixed fixture root and timestamp. No production `--at` override is required for revision identity; default build timestamps can differ between checking and output. A's builder validates the full commit and reads its Git object bytes.

## Job revision lifecycle

The gate alone owns the captured revision; GitHub Actions owns transfer of the job environment into later steps. No extra persistent cache, registry or source marker file is introduced.

| Event | Result |
| --- | --- |
| Gate starts, including job retry | Capture actual full checkout HEAD once; do not reuse an inherited event revision |
| Revision lookup or either check fails | Nonzero step; no successful handoff and no dependent output step |
| Both checks succeed | Append that exact revision to the runner-provided job environment; append failure also fails the step |
| Output starts | Require the transferred revision; absent/empty value fails before invoking the builder |
| HEAD changes after checking | Output keeps the checked revision; A additionally requires it remain a reachable commit |
| Job finishes | Runner discards job environment; later jobs capture their own revision |

Invariants: one capture per job; identical team check/output revisions; legacy root/time isolated from production; every failed prerequisite/check/output remains nonzero; original names remain mapped. Tests cover a stale event SHA, a changed later HEAD, absent handoff, each command failure and the actual command argument sequence across steps. They simulate the runner's environment transfer without executing translation/push/deploy commands.

## Author validation

All runtime checks used actual Node **20.20.2** on macOS arm64 with canonical `TMPDIR=/private/tmp` (the existing schema-check path-alias caveat is documented in the supply evidence). No dependency versions changed: the previous successful frozen install at the Q checkpoint remains applicable to the identical package/lock content; no new clean-machine installation claim is made.

| Check | Result |
| --- | --- |
| Extended orchestration suite before workflow edits | 9 existing cases passed; 12 new same-revision/target/failure cases failed for the missing behavior |
| Extended orchestration suite after workflow edits | 21/21 |
| Full `npm run test:scripts` | 189/189, including A's build/image regressions and the 21 CI cases |
| `npm --prefix packages/worker test` | Core/validator/Worker build succeeded; 259/259, including publish step-name mapping |
| Core tests after build | 87/87 |
| Existing Web tests plus explicit Q nested entry | 82/82 + 5/5 |
| Web typecheck / Worker generated-validator check | Exit 0 / exit 0 |
| Both actual workflow gate blocks, executed locally | Exit 0; team has zero blocking errors, golden five rows match with zero differences; deploy gate also rebuilds Worker and runs Q 5/5 |
| Both actual output blocks, changing only `--out` to private temporary directories | Exit 0; each writes manifest plus one team plan, both with the captured full revision and string projectionVersion `"1"` |
| `git diff --check` | Exit 0 |

All reported test totals have zero skips. The direct workflow proof used actual checkout/source `4b7621c6e156b39aaceee708fa0f6b4c235557f1` while the CI delta was under test. Proof is retained locally at `/private/tmp/canteen-ci-final-gates-hQjbZQ/validation.json`, beside the two separate temporary outputs. The runner extracted only the existing gate and output blocks; the output destination was the sole command substitution. It asserted gate→job-environment→manifest→projection revision equality, target/team version, and absence of legacy prep/purchase/menu directories. This source contains no image assets; its two-file output is not a separate real-image end-to-end claim. The full script suite supplies the image/container regression results.

## Delivery limits

Only safe checks, tests and temporary outputs were executed. Real data and `packages/web/public/data` were not changed by workflow execution. Translation commits/pushes, uploads and deployments were not run. Linux tool compilation/linkage and actual external CI remain unverified; no browser, generated service-worker, Cloudflare or L2 completion is claimed. C2b retains its own implementation/testing; Vite configuration requires dispatch's separate owner/scope assignment if needed.

This completes the released local CI command wiring, not the entire product journey or release. Independent review must approve the new exact CI commit with this source revision. Architecture ownership remains CI for workflow orchestration, A for builder/decoder and Q for fixtures/tests; no map change. UI dogfood is not applicable to this internal CI delta; actual check/output execution and component regressions are its validation evidence. External publication remains paused.
