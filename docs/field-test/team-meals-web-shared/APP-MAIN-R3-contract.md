---
feature_ids: [team-meals]
topics: [pwa, reload, first-document, regression]
doc_kind: bug-contract
created: 2026-09-11
---
# APP-MAIN-R3: finish an approved first-document update

Dispatch explicitly resumed C for APP-MAIN-R3/P2 on fixed D candidate `34dd3364ad9397cac3ded4b8ee5460dac09fc879`. The complete candidate history was fast-forwarded into the existing isolated C branch for actual-main verification; this is a validation base, not full-application approval. All D pages/evidence remain unchanged.

## Diagnostic capsule

- Symptom: on a fresh origin, the first document begins uncontrolled, initial worker A claims it, and a later waiting B activates after one stable dirty-discard consent. No application reload occurs; boot remains 1 and the existing timeout reports failure.
- Evidence: original non-author report `/private/tmp/canteen-app-r2-review-34dd336/APP-MAIN-R3.md`; passive native evidence `native-first-document-diagnostic.json` (3/4, boot1, identical safety stamps, controlling isUpdate=false/isExternal=true), with same-version controlled-start comparison `native-controlled-update.json` (2/2, boot1→2 stable).
- Root cause: installed Workbox 7.4.1 captures initial control at registration. Installed vite-plugin-pwa 1.3.0 calls its prompt-mode onNeedReload only for controlling events with isUpdate=true. Actual pwa.ts exclusively used that callback; native controllerchange only refreshed readers.
- Strategy: reproduce the missing callback with actual PWA/coordinator tests, bind consent completion to the exact waiting ServiceWorker object selected for activation, and let both plugin and native signals reach the same synchronous coordinator check. Compare object identity, never just the script URL.
- Timeout: retain two-second consent expiry and explicit manual retry. Do not extend, replay, auto-retry or force expired consent.
- Protection: generation/safety changes, pending/unknown/untracked work, user cancellation, unrelated controllers, and activations without consent must never reload. Do not clear owners/drafts, bypass the coordinator, change D listeners, or change dependency/configuration.
- User interaction: retain the existing explicit update/dirty-discard flow. A valid unchanged consent completes one actual reload; duplicate callbacks cannot reload twice.
- Acceptance: actual first-document A→B waiting→one explicit stable consent→boot1→2 stable, controlled-start comparison, callback ordering/duplication, precise worker binding, invalidated-consent checks, and original non-author shared review of a fixed implementation.

## Bounded implementation and verification

Changes belong only to C shared PWA, its tests and evidence. The existing coordinator remains the sole reload authority. Native controllerchange must attempt consent completion before starting its reader refresh; otherwise a refresh could change evidence after the real takeover but before the final decision. Reader refresh itself remains available for unsolicited/external activation.

Observed author RED on the fixed base: 3 failures / 10 passes in `pwa-integration.test.mjs`. Both first-document callback-order variants fail to reload; a same-URL different worker incorrectly spends consent through the old plugin callback. Existing controlled-start and safety boundaries pass. Log `/private/tmp/app-main-r3-red.log`.

No main branch, remote push/PR, real publication/deployment, B/Q changes, or direct D coordination is authorized. Final fixed history, original independent report, native results and scope limits return only through dispatch.
