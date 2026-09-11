---
feature_ids: [team-meals]
topics: [web, native-sw, offline, evidence]
doc_kind: evidence
created: 2026-09-11
---
# Author native observations (selected facts from live DOM)

These are selected observations read through CUA from diagnostic DOM, not an exported complete browser transcript. IAB content export was unsupported. Reproducible probe/server and source identity accompany this record; the original non-author independently repeats native checks.

## Actual application and R3

Exact archive e79fe3b49b2a5d3c06c5d7298d9207adc5cc3c71, instrumented native fixture /private/tmp/c2b-real-sw-qBlvES, ports60600/60601/60602 (only60600 used). 52 tracked Web source files match Git bytes in archive and generated fixture. API is only local intercepted https://application-api.local.invalid with synthetic credentials. Instrumentation copied unchanged from original R3 author probe; no production PWA override. This fixture is distinct from budget measurements.

At60600, first document controller=false. Actual application matrix31/31; final route#/admin/plan/sw-plan with value11 dirty and boot1. Updating server A→B then clicking real SW check adds waiting-worker check32/32. Clicking production dirty-discard test presents and consumes one explicit consent, before33/33. New document boot2; both new-lifetime and stable-exactly-once checks pass2/2. Before consent's original Workbox controlling event records isUpdate=false; native controller path completes the reload. No new R3 source changes.

## Exact uninstrumented output and unopened routes

At60603/inspect.html, diagnostic page outside /canteen/ SW scope embeds original unmodified /private/tmp/app-bundle-c1-build output. Its inline inspection reads iframe Resource Timing and CacheStorage; production index, main, all chunks and generated SW stay unchanged. Initial Prep observed loaded JS exactly index-CqcMpFug.js, prep-BlcfSxaz.js, workbox-window.prod.es5-BqEJf4Xk.js; total32,099 gzip bytes. All20 expected appJS were in browser CacheStorage, missing[]. No unselected top page requested in this first-view list.

The inspector's state file gates **all content requests** under /canteen/ by destroying server responses; the inspector page itself remains usable. This simulates unavailable origin content, without changing OS/browser network settings. No claim is made about service-worker background requests contributing to page Resource Timing.

After initial installation/claim, cutting the content server and first opening Menu fetched the cached Menu code but displayed 数据未就绪. Baseline7f exact prior build at separate fresh60604 origin, all12JS cached and entry/workbox loaded, reproduced the same first-claim offline Menu data failure. It is not a new route-loader regression. Inherited cause supported by source: main's claim refresh calls loadPublication({fresh:true}); published.ts clearCache retains a __publication tag and subsequent legacy JSON inherits it, while generated precache has the untagged JSON URL. Formal independent actual-request/cache comparison is pending original reviewer; do not label this full offline acceptance.

After bringing60603 content online and opening a new document already controlled by installed SW, Prep was allowed to finish before cutting content again. First navigation to previously unopened Menu loaded menu-DsXJe1ME.js from cache, retained its Prep dependency, and rendered full legacy Menu content including “Tomato and egg stir-fry”. Menu data was not opened/read in that document before origin content was disabled. All20 appJS remained cached. A first snapshot immediately after reload had only index before startup finished; the later completed Prep snapshot is the one used for measurement.

An additional offline QR navigation loaded qr-CAGZr4uS.js and toolbar but data was unavailable. QR fetches qr/index.json; the unchanged configuration precaches data/**/*.json only (QR index is outside it). This additional inherited cache-policy limitation is recorded rather than hidden; cached code alone does not prove every route's data is offline. Menu controlled-document success demonstrates this loading boundary preserves usable deferred page code without claiming the broader offline contract is complete.

No external API/data writes, actual publish, deployment or user account operations occurred. The actual matrix uses explicit local intercepted saves/publish simulation only. The setup initially hit loopback EPERM; permitted local serve-only listeners reused already built outputs. No application source was changed to resolve environment setup.
