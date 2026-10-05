---
feature_ids: [128]
topics: [local-acceptance, empty-business, rollback, integrity]
doc_kind: test-harness-guide
created: 2026-10-05
tips_exempt: Internal opt-in test infrastructure; no new chef-facing capability.
---

# Local acceptance foundation

This origin runs the actual compiled Worker, formal `build-data.mjs` producer,
Vite app and generated SW. GitHub HTTP, Actions and Pages hosting use the existing
local adapter backed by real append-only Git objects with no configured remote.
It cannot prove remote deployment or chef approval. The tests use synthetic data;
the two-video plus manual-recipe browser journey remains a separate acceptance run.

Run from a dedicated Canteen worktree at a fixed full HEAD. Dependencies and compiled
core/Worker outputs must belong to that tree. The reserved ports 3003/3004, Redis
6398/6399 and original app/KB ports 4388/4391 are rejected. The server binds only
127.0.0.1, checks Host/Origin, and fails if its chosen port is occupied.

```sh
env -u NODE_ENV pnpm install --frozen-lockfile --store-dir .pnpm-store
pnpm --filter @canteenos/worker build
pnpm --filter @canteenos/web icons
node --test packages/web/test/e2e/team-meals/acceptance-harness.test.mjs
node packages/web/test/e2e/team-meals/acceptance-harness-cli.mjs init \
  --test-only-local --allow-rollback --seed empty \
  --revision FULL_CANTEEN_HEAD --port 4398 --scratch-parent NEW_PRIVATE_SCRATCH_PARENT
node packages/web/test/e2e/team-meals/acceptance-harness-cli.mjs serve \
  --config PRINTED_PRIVATE_CONFIG_PATH
```

`init` prints the private config path and boundary only. The three random 43-character
roles stay in an owner-0600 file in the harness-created scratch root. Use the app's
existing private-link/session login and wait for its URL token scrub before taking
page evidence. Do not print the config, put secrets in command arguments, or include
login URLs in screenshots/logs. Request evidence retains method/path/status/requestId,
If-Match, commit receipts and byte hashes; request/response bodies and auth headers
are excluded. The ledger and private Git checkpoint stay outside the served app.

`--seed empty` commits only `data/techniques.json=[]` and
`data/translations.lock.json={}`. It inserts no plans, dishes or ingredients.
`--seed legacy-demo` is a separate unverified `team-week` variant. The existing
fixtures still default to that demo and their existing server rollback guards
are unchanged. Rollback in this new origin reaches the actual Worker only when
`--allow-rollback` was given; the Worker's admin, version, JSON and reference checks
continue to decide whether the request succeeds. Rollback saves a commit; publication
requires the actual `/publish` path and completed formal build.

For the private KB run, add `--kb-source FIXED_KB_ROOT --kb-revision FULL_KB_HEAD`
to `init`. Only `http://127.0.0.1:4392` is accepted. Its tracked source must be clean
and match the exact HEAD; installed lock and `apps/web/dist` are required when serving.
The ledger records KB apps/contracts/migrations/scripts and runtime hashes, without
reading its database, uploads, backup or media. The separate acceptance operator
must verify that 4392 actually runs that pinned source on the NEW restored database
copy. A source inventory alone does not establish the upstream process/database identity.

```sh
node packages/web/test/e2e/team-meals/acceptance-harness-cli.mjs inspect \
  --config PRINTED_PRIVATE_CONFIG_PATH
```

Interrupted runs resume their checkpoint without reseeding. Inspect receipts and
private/public heads first. After stopping the owned service, `cleanup --config ...`
can remove only the scratch root created by `init`, with its matching ownership
marker; it refuses forged roots, symlinks and active owners. It never deletes the
separate KB source, data copy, backup or media. Keep failed-run evidence until examined.

`integrity.json` records fixed core/schema/producer/web/Worker sources, both dependency
locks, Git-blob-checked harness/fixture/Worker-selector helpers and legacy fixture inputs,
generated core/Worker/validators and complete current web
runtime hashes. These are byte inventories, not proof of test completeness or remote
deployment. Optional `W5_HARNESS_EVIDENCE_DIR` in the test command copies only redacted
receipts and the integrity ledger before test-owned scratch is cleaned up.
The bounded first-party execution inventory follows literal imports transitively and
refuses an imported file absent from the fixed inventory. Relevant dirty/untracked
source files are rejected, including the harness itself. Commit an authorized harness
change before running acceptance against its new full HEAD; dirty harness evidence is
not accepted as a fixed release. Generated WORKER/core imports are selected by pinned
helper/producer bytes and recorded under their separate runtime inventories.
