---
feature_ids: [team-meals]
topics: [verification, environment, browser]
doc_kind: test-evidence
created: 2026-09-11
---
# Environment and browser-probe history

This file transcribes the observed setup/probe outcomes from this task's tool output. The initial `/private/tmp/d-public-pages-red.log` was reused after each setup correction; these setup failures are not represented as preserved raw log files or behavioral RED.

1. First actual-entry test invocation failed before running page assertions:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pngjs' imported from /Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages/packages/web/test/published-fixture.mjs
Node.js v24.18.0
✖ packages/web/test/team-meals-pages-published.test.mjs
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

The exact version was already in `node_modules/.pnpm/pngjs@5.0.0/node_modules/pngjs`; created only the ignored root `node_modules/pngjs` symlink. No install, registry fetch, package or lockfile change.

2. The next invocation reached the real A producer but failed before page assertions:

```text
file:///Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages/scripts/build-data.mjs:459
    const selection=core.normalizeSelection(plan.meals.map(m=>({menuPlanRef:planId,date:m.date,mealType:m.mealType})));
                         ^
TypeError: core.normalizeSelection is not a function
    at runTeamBuild (scripts/build-data.mjs:459:26)
    at runBuild (scripts/build-data.mjs:209:39)
    at publishedFixture (packages/web/test/published-fixture.mjs:42:15)
```

The approved source had the function; old ignored core/dist did not. Rebuilt with `node packages/core/node_modules/typescript/bin/tsc -p packages/core/tsconfig.build.json`. The subsequent actual RED is preserved separately as `entry-red.log` (2 legacy pass / 7 team fail). A first legacy test assertion was also corrected to recognize Prep's existing “servings-based” label, rather than expecting the literal word “legacy”; no production change was made for that assertion mismatch.

3. Initial local browser server startup was sandbox-blocked:

```text
Error: listen EPERM: operation not permitted 127.0.0.1:4220
```

Retried the same local-only server with approved sandbox escalation. The IAB entry returned `Browser is not available: iab`; used the connected Chrome surface and reported that distinction to root.

4. First actual browser probe: 21/22 passed; the sole failed case was `images decode`. The same run passed `ingredient + technique original image bytes`. The probe checked all `loading="lazy"` images' complete/naturalWidth immediately while later images were still offscreen. Changed the fixture to scroll each image into view and await `img.decode()` before checking complete/naturalWidth. Subsequent actual browser runs passed 24/24, then 27/27 after second-dish source checks were added. Final 27/27 JSON with source hashes is preserved in `browser.json`; the first browser JSON was observed in tool output but not retained as a separate raw artifact.

5. Narrow-screen measurement first showed document overflow 199px. DOM measurement identified fixture status JSON text as its source: main client/scroll widths both 393px; fixture status scroll width 593px. Added wrapping to the fixture status paragraph. Final document and main overflow are both zero. Production scrolling filter chips remained within their own `overflow:auto` container.

6. Before final freeze, screenshot inspection showed the new dialog close control using the inherited 28px chip height. Added a page-owned 44px minimum height, ran the full Web suite (388/388), rebuilt the browser fixture from final source, reran all 27 cases, and recaptured both screenshots. Final `layout.json` confirms closeHeight=44. No post-evidence production edit remains.
