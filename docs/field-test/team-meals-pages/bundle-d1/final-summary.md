---
feature_ids: [APP-BUNDLE-D1]
topics: [editor-loading, verification, budget]
doc_kind: evidence
created: 2026-09-11
---

# Final D1 author validation

Production implementation `1d0cd35a2037e486492410fa21d2165c61883ac7`; complete approved reader composition `4278f1a80966c23be70ffc05001aa31920b5b4d1`. All behavior tests/build measurements below ran on that composition. Final production `80948be59b068da11855e3bf0c018f3fa13a8117` only removes one extra EOF blank line in three extracted files. Both configurations were rebuilt after that format change: **all 26 emitted JS files, including sw.js and Workbox runtime, are byte-identical** (`trim-emitted-equivalence.json`). No functional rerun is claimed for the whitespace-only delta.

Node20.20.2: full Web **467/467**, typecheck **exit 0**. The checkpoint target is **95/95**, including 17 new D1 checks and unchanged ACK/unload assertions. Exact environment/commands, both source-hash sets, raw RED and failed iterations are retained in `final-runtime.json`, `commands.md`, `README.md` and original logs. Source/test `git diff --check` is clear after EOF cleanup; raw failed logs preserve their original emitted whitespace.

Both actual original-config builds pass **11/11** at the 60,000-byte threshold. Table entries are gzip bytes summed once per distinct executed JS file; CSS/data/media are excluded. Optional action modules do not count until that action executes. No savings-by-chunk-subtraction estimate is used.

| Route | Default, SW | Default, no SW | HTTP, SW | HTTP, no SW |
|---|---:|---:|---:|---:|
| prep | 32,204 | 29,861 | 32,199 | 29,856 |
| menu | 38,333 | 35,990 | 38,330 | 35,987 |
| purchase | 53,278 | 50,935 | 53,291 | 50,948 |
| qr | 20,805 | 18,462 | 20,799 | 18,456 |
| locked-admin | 20,341 | 17,998 | 20,330 | 17,987 |
| home | 55,253 | 52,910 | 55,298 | 52,955 |
| plan | 59,686 | 57,343 | 59,693 | 57,350 |
| import | 50,865 | 48,522 | 50,871 | 48,528 |
| ingredient-new | 50,148 | 47,805 | 50,146 | 47,803 |
| dish-new | 57,991 | 55,648 | 57,992 | 55,649 |
| publish | 56,322 | 53,979 | 56,366 | 54,023 |

The configured build uses `VITE_WORKER_URL=https://application-api.local.invalid`; no remote API was contacted. The tightest route is HTTP Plan **59,693** (307 bytes below threshold); future changes need a rebuilt closure check.

Default application cache: **24 JS / 169,971 gzip / 432,232 UTF8 bytes**. HTTP: **24 JS / 169,994 gzip / 432,334 UTF8 bytes**. Both generated SWs include every application chunk (`missingPrecachedJs=[]`). SW plus Workbox runtime is separately **9,517/9,510 gzip bytes**, excluded from route execution totals. Full precache policy was retained; this change does not claim reduced cold installation transfer. Each route's raw byte sum is in `final-{default,http}.json`.

`final-*-graph.json` contains the complete final emitted module/static/dynamic graph; `final-*-editor-modules.json` extracts D adjacency. `final-preload-validation.json` checks every generated Vite dependency-index list against the corresponding actual static closure: all `outsideStaticClosure=[]`. Prep discovery supports source-module membership when its facade is null.

The original build groups `editor-actions.ts` into the generated `ingredient-draft` chunk. Source `ingredient-draft.ts` itself remains a pure leaf with type-only external imports. Ingredient statically has its original form. Dish dynamically reaches `ingredient-form`; action helpers dynamically reach the sole original client module and image algorithm. Client is never cloned or replaced, and `getApi()` is still the original singleton. Native optional entry and its static dependencies are all precached. The source split does not add shared/kit/config/dependency/Worker changes.

Lifecycle evidence: raw intent and original auxiliary read ticket precede every added await. Inline module readiness is stored before `finish(true)` synchronously rebuilds the current form; that form obtains a separate automatic-translation ticket exactly once. Read-only failures settle their own ticket, preserve raw/dirty and show honest unavailable-capability text; they never become write unknown or offer fictional same-URL retry. Already-loaded ordinary translation failures retain real retry. No-image Dish remains on sole C1 saving without legacy acquisition. Late auth/row/buffer responses cannot start a different owner's action or apply to B.

Actual-main browser evidence is being collected by root from the final frozen source and real emitted modules with local explicit HTTP fixtures. It must distinguish native module/network behavior from these controlled boundary tests. This document reports author build/Node evidence and is **not independent approval**, a native SW product acceptance claim, or live Worker/L2 validation. Final handoff attaches root's exact browser artifacts and then goes to the original non-author reviewer.
