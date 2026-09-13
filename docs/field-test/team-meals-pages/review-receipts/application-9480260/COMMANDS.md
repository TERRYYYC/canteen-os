---
feature_ids: [team-meals]
topics: [review, node20, pwa]
doc_kind: review-evidence
created: 2026-09-11
---
# Final 948026 reproduction commands

Run inside the fixed archive. The executable is `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node`; runtime identity is in `runtime-node20.json`. Dependencies are existing installed workspace dependencies, reused locally; no dependency changes.

```sh
# packages/core: build the local source consumed by the producer and Web tests
/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node node_modules/typescript/bin/tsc -p tsconfig.build.json
# packages/web: full default Web test scope
/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node --test test/*.test.mjs
# packages/web: typecheck
/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node node_modules/typescript/bin/tsc --noEmit
# packages/web: affected shared targets
/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node --test test/pwa-integration.test.mjs test/reload-safety.test.mjs
```

Observed exit 0 for each. Raw outputs: `reviewer-core-build-node20.log` (empty successful build), `reviewer-node20-full.log` (429/429), `reviewer-node20-typecheck.log` (empty successful typecheck), `reviewer-node20-shared26.log` (26/26).

Browser server command at archive root (substitute ports for each group):

```sh
TMPDIR=/private/tmp VITE_WORKER_URL=https://application-api.local.invalid VITE_REVIEW_HEAD_SHA=94802608447a3a6dbc60a8ca21cb9b6b0ad83a11 C2B_ENTRY=application C2B_PORTS=4270,4271,4272,4273 C2B_VARIANTS=a,b /private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node packages/web/test/application-review-server.mjs
```

Group 4270–4273 uses `application-review-initial.ts` as its copied injection. Group 4280 uses `application-review-consent-initial.ts`. Group 4281 uses current `application-review.ts`. All three byte identities and every built production source are recorded in `server-integrity.json`. State files switch the served real producer output from A to B; no fake native callback or service worker is used.

`reviewer-cancellation-server-node20.log` retains the first 4281 listener failure (sandbox EPERM after a successful build). The explicitly authorized local listener restart is in `reviewer-cancellation-server-retry-node20.log`. This is an environment failure, not an application test failure.
