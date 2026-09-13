---
feature_ids: []
topics: [team-meals, import, verification]
doc_kind: commands
created: 2026-09-11
---
# Commands and provenance

Working directory: `/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages`.
Node: `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin/node`; its containing directory was prepended to PATH for npm/build commands. No downloads, installs, dependency/configuration changes or remote operations.

- `node --test packages/web/test/team-meals-pages-plan-import.test.mjs`: original setup log `red-composition-first.log`; corrected original9-case product RED `red-composition.log`; expanded13-case `red-composition-expanded.log`; calibrated16-case `red-calibrated.log`; first16-case green `green-composition-first.log`; expanded28-case green `green-composition-expanded.log`.
- `node --test packages/web/test/team-meals-pages-plan*.test.mjs packages/web/test/team-meals-pages-import*.test.mjs`: `green-target.log`,86/86 including final30 new cases, exit0.
- `npm --prefix packages/web run typecheck`: `type-first.log` and exact frozen-source `type-final.log`, exit0.
- `npm --prefix packages/web test`: `full-web.log`,539/539, exit0.
- Early real HTTP budget: `VITE_WORKER_URL=https://application-api.local.invalid node docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" /private/tmp/canteen-q-t01-http-first`: `build-http-first.log`, exit0; matching totals are in `http-first-totals.log` / `http-first.json`.
- Final default: `node docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" /private/tmp/canteen-q-t01-6bb1-default`: `build-default.log`, exit0.
- Final HTTP: `VITE_WORKER_URL=https://application-api.local.invalid node docs/field-test/team-meals-pages/bundle-d1/measure.mjs "$PWD/packages/web" /private/tmp/canteen-q-t01-6bb1-http`: `build-http.log`, exit0.
- Each final mode: `node docs/field-test/team-meals-pages/bundle-d1/totals.mjs /private/tmp/canteen-q-t01-6bb1-MODE/bundle-attribution-final.json docs/field-test/team-meals-pages/q-ui-t01-02-import-fix/MODE.json /private/tmp/canteen-q-t01-6bb1-MODE`: `totals-MODE.log`, exit0.
- `python3 docs/field-test/team-meals-pages/q-ui-t01-02-import-fix/check-builds.py`: preserved first overbroad parser assertion failure `check-builds-first.log`; corrected precise baseline comparison in `check-builds.log`, exit0.

Builds use the original Vite configuration, existing unchanged core/public prerequisites generated in the prior copy validation, and the existing observation-only D measure helper. It only adds a graph asset. Final source is6bb1ce9; root concurrently adds docs and runs browser evidence against an isolated Git archive. No production content changed during the final checks.
