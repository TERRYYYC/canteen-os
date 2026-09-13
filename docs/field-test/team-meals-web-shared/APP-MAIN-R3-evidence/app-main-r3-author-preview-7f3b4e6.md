---
feature_ids: [team-meals]
topics: [pwa, browser, evidence]
doc_kind: validation
created: 2026-09-11
---
# APP-MAIN-R3 author preview, fixed 7f3b4e65c03b4329ffd5b72ad4846937830f6d9c

2026-09-11. Original actual main and all fixed D34dd source copied from a Git archive. The original non-author's application-review.ts / application-review-server.mjs were reused unchanged in the local archive `/private/tmp/app-main-r3-author-7f3b4e6`. The index includes only the same explicit diagnostic script before original main. This probe preserves original Workbox dispatch and observes initial control, native events and JS boot counts; it simulates only local API responses and synthetic credentials. Original Vite/PWA config and generated native workers were used. Source/index identity is recorded in `/private/tmp/app-main-r3-source-environment.json`.

Built variants: `/private/tmp/c2b-real-sw-UkFva4/{a,a-time,b}`. A fixture revision `2037801383367aa50667c27a69bbf25892879c81`; B `4ba8737f1fd81802b0891771fb77fdab6f7b355b`. These identify data, not implementation. All three fresh local origins first loaded A; server state was then changed to B. One startup completed builds but sandbox refused loopback listen; the same built bytes were served with approved local-listener permission. No product change was made for that setup.

## Native results (CUA embedded browser)

- `http://127.0.0.1:60500/canteen/`: first document initial controller=false, later A claim observed. Actual Plan changed servings 8→11; B waited without activation/reload. One production dirty-discard action displayed the explicit choice and confirmed it. Before checks 3/3; after checks 2/2: actual boot1→2, stable after four seconds and later checks; reason clear, no POST. Waiting event was external with controllerAtProbeStart=false. No second user intent or native confirmation was needed.
- `http://127.0.0.1:60501/canteen/`: A was installed in a clean warm-up document; a separate new document started already controlled, boot1. The same dirty Plan and B waiting sequence gave before3/3 and after2/2, boot1→2 stable, no POST. Waiting event was external with controllerAtProbeStart=true. This preserves the controlled-start path.
- `http://127.0.0.1:60502/canteen/`: first-document dirty Plan, external B activation without any update consent. Actual input node/value11 survived, reader refresh occurred, boot stayed1. Then a locally held actual C1 save became offscreen pending; production update offered only Continue, no discard. A simulated lost ACK changed it to unknown; production update again offered no override and boot stayed1. Six native checks all passed. The sole POST `/plan/sw-plan` was intercepted by the local fixture; no real backend was called.

These are bounded PWA/auth/owner integration results, not a repeated full page matrix, real Worker or L2 approval. Temporary native tabs still expose the full diagnostic JSON while this review is active.

## Unit and build evidence, including inherited limits

- `/private/tmp/app-main-r3-red.log`: Node20 actual PWA test RED 3 failures/10 passes on pre-fix source. First-document cases and unrelated-worker consent expose the intended causes.
- `/private/tmp/app-main-r3-targeted-green.log`: Node20 PWA/coordinator26/26 after fix. Both callback orders, native-without-plugin completion, duplicate events, exact worker identity, changed generation, pending, unknown, timeout/dismissal, offscreen saves and old auth protection.
- `/private/tmp/app-main-r3-typecheck.log`: Node20 whole Web typecheck exit0.
- Node20 full Web remains red on both exact baseline and candidate using the same command, runtime, shared installed dependencies and core dist: baseline419 total,411 pass,3 fail,5 cancelled (`/private/tmp/app-main-r3-baseline-web-node20.log`); candidate429 total,421 pass,3 fail,5 cancelled (`/private/tmp/app-main-r3-web.log`). Identical causes are D shopping-raw test's missing navigator and D unload harness's Node Event.returnValue getter, followed by cancellations. A separate original reviewer archive reproduces those causes (`/private/tmp/app-main-r3-baseline-d-node20.log`). No D test changes were made.
- Node24 full Web429/429 (`/private/tmp/app-main-r3-web-node24.log`) is supplemental only; it does not satisfy the Node20 CI premise or erase either red log.
- Same original Vite build command under Node20, fixed baseline versus candidate with shared dependencies: baseline entry gzip63.62 kB (`/private/tmp/app-main-r3-baseline-build.log`); candidate63.68 kB (`/private/tmp/app-main-r3-build.log`), both build exit0. Both exceed60 kB; the inherited size issue is returned to dispatch, not fixed by changing pages/configuration in this scope.
- D pages/evidence, configuration and lockfile are unchanged against34dd. Exact range diff check passed; accepted contract's content revision remains `dfb68c8` (full SHA supplied in review packet).
