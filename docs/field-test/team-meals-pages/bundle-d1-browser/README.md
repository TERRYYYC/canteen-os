---
feature_ids: [APP-BUNDLE-D1]
topics: [pages, native-modules, browser, owner-lifecycle, evidence]
doc_kind: author-browser-evidence
created: 2026-09-11
implementation_head: 80948be59b068da11855e3bf0c018f3fa13a8117
status: awaiting-independent-review
---

# D1 actual-module browser evidence

Root operated these **author** checks in Codex IAB. Production source is fixed `80948be59b068da11855e3bf0c018f3fa13a8117`, which includes the complete approved C reader history. The original non-author has not yet approved this D delta. This is not remote Worker/L2, deployment, a new complete R3/native update matrix or whole D acceptance.

## Fixed source and real boundary

Each of the three build-source variants is a Git archive of 80948. All **56 Web src files** match that exact Git source; `v{1,2,3}/source-integrity.json` records every SHA256 plus original/instrumented HTML and the exact test script. Original production main/pages/PWA and configuration remain intact. The only HTML change prepends the local test instrumentation script before main. That script uses the actual shared registry/auth/language and a simulated private HTTP API; there is no real credential or backend write. It does not import optional pages/client/image code early. The original Vite configuration and formal static producer make the application and native SW.

The external `serve-gated-dist.mjs` serves those final files unchanged. A separate transport-state file can hold or return HTTP 503 for one **actual emitted JS filename**, leaving other files available; every request records URL, destination, start/end and response status. Held/failing background precache fetches are recorded as well. No fake loader replaces the native import. Test instrumentation changes entry regrouping, so these builds are behavior evidence; uninstrumented final budgets/precache belong to the separate `../bundle-d1/` reports. `v{1,2,3}/author-module-graph.json` preserves the entire actual import graph for each browser fixture.

The two actual production entry shapes remain Dish → deferred Ingredient form, and Ingredient → static Ingredient form; both use deferred image/legacy modules. Each variant has one `client` chunk containing the original client/mock modules and one image algorithm chunk. Source/API identity is preserved, with no query retry, duplicated state module, module rewriting or application reload.

## Observed cases

Counts below are cumulative **within each origin**, not additive independent totals. Initial `0/0` snapshots occur before main initializes; later explicit controls/readbacks inspect the active owner state.

| Origin / actual module | Evidence and result |
|---|---|
| `53449`, form `ingredient-form-CEvFaQkW.js`, v1 | `80948-held-initial.json` **3/3**: initial Dish Source/catalog/form use no legacy client; click synchronously retains Chinese raw and a real loading operation before await, with Save blocked and no write. `80948-held-return.json` **6/6** adds language, offscreen and return retention while the actual JS response remains held. After releasing HTTP, `80948-held-handoff.json` **9/9** proves one automatic translation and original seed/result; the controlled Node test separately observes synchronous notifications for the no-clear interval. |
| Same origin, already loaded translation | `80948-action-retry.json` **11/11**, adding a simulated actual HTTP 503 through the real client, visible failure with original Chinese input, then a second real client POST succeeding. It does not pretend a native module failure recovered. |
| `53459`, same v1 form held | `80948-auth-initial.json` **3/3**, `80948-auth-pending.json` **4/4** unknown while the old operation remains anonymous under a new test identity. After actual module arrival, `80948-auth-late.json` **5/5**: only old operation settles, new editor stays unchanged, no old translation POST or inline form appears. |
| `53809`, v2 form `ingredient-form-DE8outB5.js` genuinely returns 503 | `80948-v2-failed-retained.json` **6/6**: known loading ticket ends, original raw/dirty remains editable across language, no unknown write/permanent busy or false retry action. `80948-v2-failed-save.json` **7/7**: existing explicit Cancel, selecting an existing ingredient and editing servings permits an ordinary no-image C1 save without executing legacy client. |
| Same failed v2 module, server restored | `80948-v2-native-retry-limitation.json` **8/8**, where the eighth check records the continuing **failure** of a diagnostic native import of the exact already-observed emitted URL. This check is outside application recovery behavior. `transport/failed-v2/{before-server-recovery,transport-requests}.json` both contain exactly two selected requests, one destination `empty` and one `script`, both original 503; no new selected request appears after restoring service or trying the same URL. This confirms the observed browser limitation, not successful module recovery. |
| `54111`, v3 image `editor-image-B408a5BL.js` held | `80948-photo-v3-initial.json` **1/1** initial Ingredient works without image execution. A fixed local PNG supplied by the formal producer is made into a real File and selected via test-script DataTransfer/change: `80948-photo-v3-selected.json` **2/2**, held-language `80948-photo-v3-held.json` **4/4**, actual module release/decode/canvas/preview `80948-photo-v3-completed.json` **5/5**, same original Chinese input and real decoded 2×2 image in the retained draft. **File selection is synthetic; native module transport, image decoding and canvas are real. No system picker or upload success is claimed.** |
| `54210`, v3 legacy `client-CjG82euQ.js` held | Root clicked the actual Ingredient Translate control. `80948-legacy-held.json` is a direct **0/0** observation with safety `saving`, original raw and zero POST while the real client JS is held. After auth switch, `80948-legacy-old-auth.json` **1/1** remains unknown; release yields `80948-legacy-late.json` **2/2**, clearing only the old operation without sending translation or altering the new Dish editor. |

The failure notice and editable retained Chinese text are visibly captured in `80948-error-visible.jpg`; `80948-error-visible-state.json` is the later manual re-open of an inline attempt after the successful ordinary save, now dirty again, with the same cumulative 8/8 history. The image preview after language change is in `80948-photo-visible.jpg`. Root viewed both screenshots individually. The earlier top-of-page screenshots are retained as captured; they show the diagnostic panel rather than the lower error/image area.

## Preserved unsuccessful setup/probe attempts

The original v1 failure-origin `53453` report is **6/7** (`80948-failed-no-image-save.json`), not all green. Its helper canceled the inline buffer but then looked for Salt while the retained Search still contained Chinese text, so it stopped before Save. Reviewing the actual endpoint also found its subsequent assertion expected `/dish/soup` instead of the real `/dish/soup/draft`. Root manually expanded the row, changed the actual search by keyboard, selected Salt, edited servings to 2 and clicked Save. `80948-failed-manual-save.json` retains the original 6/7 history while separately showing safety clear, one conditional POST to `/dish/soup/draft`, servings 2 and no executed client chunk. The corrected v2 helper clears Search and checks the actual draft endpoint; a fresh independent origin then reaches 7/7. V2 also explicitly expands the ingredient row before interacting; the v1 helper's DOM controls operated a collapsed row. No production code or business assertion was altered to achieve the v2 result.

Initial browser archive build `build-4278.log` failed because root omitted core emission before invoking the producer. The reproducible builder now runs the existing core build script; `build-4278-with-core.log` succeeds. That 4278 preview was only opened, not used as the final native evidence. Final 80948 builds and each exact test source are retained. A stale missing REPL browser variable prevented one initial click before any application action; root then acquired the existing browser handle.

On v2 photo origin `53814`, two documented file-chooser attempts timed out after 3 seconds, despite the requested 10-second option; no File was selected. Native Codex app control was unavailable, so root did not operate the system window. That origin's `80948-photo-initial.json` is only the initial 1/1. V3 uses the explicit local image fixture described above, and does not reclassify the picker attempts as success. UI automation's empty `fill` in the earlier manual Search path had no effect; fresh DOM inspection showed the old text, and real keyboard input changed it before Save.

## Commands, custody and remaining review

Builder command: `PATH=/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin:$PATH node /private/tmp/canteen-d1-browser-author/build-fixed.mjs <D-worktree> 80948be59b068da11855e3bf0c018f3fa13a8117 <new-/private/tmp/archive>`. The file records source extraction, dependencies, existing core build, formal producer and unchanged Vite config; it sets only the isolated build's simulated HTTP URL and fixture metadata. Server command: the same Node executable plus `serve-gated-dist.mjs <fixed-dist> <separate-evidence-directory>`. All traffic controls are local. No reserved port, external private API, browser security setting or installed software was changed.

All seven actual serving sessions were stopped exactly: 38404/22877/75937/82270/89213/24908/55938, each exit 130. Earlier unused 4278 servers 12996/21707/1053 were stopped before final-source testing. No unrelated service was stopped. Transport ledgers were copied only after shutdown. `manifest.json` contains **59 original files**, their original local paths, byte counts and SHA256; this narrative and the manifest itself are outside that raw-file count.

Next: original non-author reviews exact D source 80948 and its complete approved C composition, independently verifies final budgets/graphs and affected lifecycle behavior, and consumes these author results with their limits. The original 948/R3 and C reader native approvals remain separate fixed evidence; no unrelated native update or full three-language/two-size matrix was repeated here.
