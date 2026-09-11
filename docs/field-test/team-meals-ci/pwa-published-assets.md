---
feature_ids: [team-meals]
topics: [pwa, published-assets, offline, verification]
doc_kind: verification-evidence
created: 2026-09-11
---

# Cache fetched, versioned published assets

The generated service worker now has a dedicated runtime route for published assets read through `fetch`. Previously, data images were excluded from precaching and the generic image route required `request.destination === "image"`; C's fetch-to-Blob reader has an empty destination and missed both routes.

## Inputs and scope

Dispatch assigned CI ownership of this configuration change after approving baseline `41afcd09001d87f2882848849db97fe5aa8c0db2`. The change is limited to `packages/web/vite.config.ts`, a generated-service-worker regression suite and this evidence. C retains ownership of the reader, PWA lifecycle and browser acceptance. Packages, lockfile, workflows, shared fixtures and application source are unchanged.

The published path contract comes from `docs/specs/team-meals-contract.md`, content revision `06f52b409696311465a85c2229deed09bb47127a`, and `docs/modules/team-meals-build.md`, content revision `8cff8538f36557203b28d1021419370b563ff1e8`. Dispatch's narrower requirement is GET, same origin, the current registration/deployment scope, 40 lowercase hexadecimal revision characters and a nonempty original encoded path. The matcher must not decode or rewrite the path or substitute another version.

## Rule and cache lifecycle

The new rule precedes the generic image rule. Its self-contained callback derives `data/assets/` from `self.registration.scope`, checks method and origin, then matches `<40 lowercase hex SHA>/<nonempty path>` against the browser's existing encoded pathname. Workbox serializes callbacks into the generated worker, so the callback closes over no configuration helpers. The cache key remains the original request URL, including its revision and encoded path; no key transform or fallback is configured.

The rule uses CacheFirst with a separate `published-assets` cache. The actual generated response plugin admits only status 200. The expiration plugin is configured with the existing image policy of 300 entries and 30 days. JSON precaching, data-image exclusions, the generic image and font routes, and the prompt/manual-update lifecycle configuration are retained. Workbox's [routing documentation](https://developer.chrome.com/docs/workbox/modules/workbox-routing) and [response-filter documentation](https://developer.chrome.com/docs/workbox/modules/workbox-cacheable-response) describe the APIs; validation below exercises the installed, generated implementation.

| Event | Intended result |
| --- | --- |
| Same-version asset is already cached and usable | CacheFirst can serve that request from its cache |
| Cache miss and a successful status-200 response | Serve the response and allow it into this runtime cache |
| Status 0 or any non-200 response | Do not admit it through the response plugin |
| Asset was never read, was evicted, or is otherwise unavailable offline | Preserve the reader's unavailable outcome; do not select another version |
| Different revision or different encoded path | Different request URL; no rewrite, latest-version lookup or cross-version fallback |
| Another origin, deployment scope, namespace or malformed revision | This dedicated route does not match |

This is runtime caching of successfully read assets, not full image precaching or a promise that every published asset is available offline. CacheStorage writes, persistence, eviction timing and the final reader outcome need browser validation.

## Root cause and regression evidence

`scripts/team-meals-pwa-assets.test.mjs` builds the actual application and Vite PWA configuration twice into private temporary directories, with explicit root (`/`) and subpath (`/canteen-os/`) base overrides. The repository's relative `base: "./"` setting is unchanged. Each build includes temporary JSON, icon and versioned-image public fixtures, copied from the unchanged Q image fixture where applicable. Temporary outputs are cleaned up after the suite.

The tests evaluate the emitted `sw.js` and its real Workbox module in a VM. They capture registration and lifecycle calls without installing a browser worker. CacheFirst and plugin constructors remain real, and tests call the real emitted response plugin. This catches callback-serialization and route-order errors while keeping the test separate from browser CacheStorage/IndexedDB behavior.

Before the configuration edit, both builds reproduced the missing route: **2 existing-behavior checks passed and 10 new checks failed**. After the edit, **12/12 passed**, with zero skips. Coverage includes empty fetch destination; GET versus write/HEAD methods; origin and scope boundaries; malformed, upper-case, percent-encoded and missing revisions; empty asset paths; Unicode, spaces, reserved characters and encoded slashes preserved without rewriting; two distinct revisions; actual status-200 admission versus status 0 and representative non-200 responses; configured expiration; route ordering; retained JSON/icon precache and generic image/font behavior; and exclusion of data assets from full precaching. The status-0 fixture is `Response.error()`, not an actual browser opaque response.

All author checks used actual Node **20.20.2** on macOS arm64 and `TMPDIR=/private/tmp`. Installed versions are unchanged: Vite **5.4.21**, vite-plugin-pwa **1.3.0**, Workbox **7.4.1**. No dependency installation or version change was needed for this delta.

| Check | Result |
| --- | --- |
| Generated worker regression suite | 12/12, zero skips |
| Full `npm run test:scripts` | 201/201, zero skips |
| Existing Web tests | 82/82, zero skips |
| Web typecheck, including Vite config | Exit 0 |
| `git diff --check` | Exit 0 |
| Package/lock/workflow/application-source boundary | No changes |

Local author logs are `/private/tmp/canteen-ci-pwa-assets-{red,green,scripts,web,typecheck}.log`. The test emits no permanent production data or distribution output. No server, browser, translation commit, push, upload or deployment was run.

## Acceptance handoff

Independent review must approve the new exact commit before dispatch releases it to C. C's next acceptance step is the real generated service worker in a browser: versions A and B, successful online reads, same-version offline reuse, unread/evicted assets, and visible unavailable outcomes. This configuration evidence does not claim that browser acceptance or the broader L2 journey is complete. External publication remains paused.
