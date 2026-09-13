---
feature_ids: []
topics: [team-meals, purchase, export, verification]
doc_kind: commands
created: 2026-09-11
---
# Local commands

Working directory: `/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages`.
Node executable: `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node`. For npm and build commands its containing directory was prepended to PATH. No runtime or dependency installation occurred.

1. `node --test packages/web/test/team-meals-pages-shopping-copy.test.mjs` → `red-copy.log` (2/15), before production changes.
2. Same command after implementation → `green-copy-first.log` (11/15), containing the disclosed zero-token regexp error.
3. `node --test packages/web/test/team-meals-pages-shopping*.test.mjs packages/web/test/team-meals-pages-details.test.mjs` → `green-target.log` (55/55).
4. `npm --prefix packages/web run typecheck` → `typecheck.log` (exit 0).
5. `node scripts/build-data.mjs` → `build-data.log`; `npm --prefix packages/core run build` → `build-core.log`; `npm --prefix packages/web run prebuild` → `prebuild.log`.
6. `npm --prefix packages/web test` → `full-web.log` (509/509, exit 0).
7. `node docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" /private/tmp/canteen-q-ui-t08-5049-default` → `build-default.log` (exit 0).
8. `VITE_WORKER_URL=https://application-api.local.invalid node docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" /private/tmp/canteen-q-ui-t08-5049-http` → `build-http.log` (exit 0).
9. For each mode, `node docs/field-test/team-meals-pages/bundle-d1/totals.mjs /private/tmp/canteen-q-ui-t08-5049-MODE/bundle-attribution-final.json docs/field-test/team-meals-pages/q-ui-t08-01-copy-fix/MODE.json /private/tmp/canteen-q-ui-t08-5049-MODE` → `totals-MODE.log` (exit 0).
10. `python3 docs/field-test/team-meals-pages/q-ui-t08-01-copy-fix/check-builds.py` → `check-builds.log` (exit 0).

Source checkpoint 5049f0a; builds and full checks use its exact source. Root may concurrently append docs only. No native browser matrix was redundantly rerun by this subagent; root owns the new actual clipboard browser check.
