---
feature_ids: [team-meals]
topics: [web, bundle, handoff, verification]
doc_kind: handoff
created: 2026-09-11
---
# APP-BUNDLE-C1 fixed delivery

What: implementation `e79fe3b49b2a5d3c06c5d7298d9207adc5cc3c71`, C branch `codex/team-meals-web-shared`. Full D `94802608447a3a6dbc60a8ca21cb9b6b0ad83a11` merged at `4f65c1cef864ad348fdadf2ad06d0f40c8869b58`; no D production byte changed. Accepted source [contract](APP-BUNDLE-C1-contract.md), content revision `94ce6c74c79ca94523e32f1b8311c72aab83924b`. Review subject `task:01a08d94-5d2e-7162-8f34-689ed87e391e:APP-BUNDLE-C1`.

Why: main's static imports pulled all top-level pages into every first view. Main now imports the selected renderer, reuses native module identity/state, and checks current render/outlet/lang/auth/publication before entering it. No coverage is invented for a renderer that has not started; previous unresolved owners remain. Active editors keep their DOM during publication refresh, while pending loaders receive the winning publication.

Tradeoff: original all-chunk precache and dependency configuration remain. Execution closures shrink but background compressed JS grows. [Diagnosis and exact matrices](APP-BUNDLE-C1-diagnosis.md) separately report default and configured HTTP builds. Default Dish84,090 and HTTP Ingredient60,414/Dish85,682 remain over60,000. **No overall budget, offline-contract, combination, feature or L2 approval is claimed.**

Validation: Node20.20.2 Web437/437; main/publication/PWA target25/25; typecheck and original-config build exit0. Original source RED shows eager5pages and8 failing new loading tests, with meaningful import-boundary assertions. New tests cover route ABA, language, auth, publication, loader failure, started unresolved coverage and existing dirty/pending/unknown owners. Existing main fixture now models real disconnected outlets/removable nodes and waits for actual async renderer startup before editor-preservation assertions. No production behavior was changed to accommodate a test fixture.

Author browser evidence: actual generated-SW application matrix31/31; first uncontrolled document A→B, explicit dirty consent, before33/33 then new boot2 stable2/2. Exact uninstrumented Prep executes only entry/Prep/workbox; all20JS cached. Controlled new document opens previously unopened Menu code/data offline with origin content unavailable. First-ever-document offline Menu data failure also reproduces in baseline7f; QR index lacks existing precache coverage. [Native observations](APP-BUNDLE-C1-evidence/native-observations.md) distinguishes these limits from successful deferred JS loading; the original non-author independently confirmed first claim and external B activation failures with exact requests and same-revision CacheStorage bodies; see the [original inherited P2 report](APP-BUNDLE-C1-review-evidence/OFFLINE-FINDING.md).

Quality scope: behavior=async startup/retained state, security=stale auth context, contract=60KB execution and unchanged offline cache, data=no new write semantics, irreversible=none. Architecture cell=C application bootstrap; map delta=existing main boundary only, no new router/store/owner. No UI layout change or new copy; existing loading/not-ready text is reused. No root media artifacts. Source/PWA/D/core/Worker/config comparisons and actual preview evidence support the narrow claim. Clowder-specific full-gate scripts are not present in this external project; Web checks above match affected surface.

Open questions: configured HTTP budgets and inherited reader/QR offline limits remain assigned to dispatch. [Diagnosis](APP-BUNDLE-C1-diagnosis.md) identifies exact Dish chunks, static Ingredient/client backedges, initial editing necessities and conditional actions for the smallest D consumer assignment. It is analysis only, with no promised size reduction from hypothetical extraction.

Original non-author verdict: **APPROVE** for implementation e79fe3b only, no new P1/P2 in this loading delta. The [unchanged formal review](APP-BUNDLE-C1-review-evidence/REVIEW.md) independently records Web437/437, typecheck, 13/13 additional lifecycle probes, actual application31/31 and R3 boot2 stable2/2. [Custody map](APP-BUNDLE-C1-review-evidence/CUSTODY.json) preserves all17 original manifest-bound reports/raw evidence plus the manifest, probe and graph scripts, and two original build logs.

Next action: dispatch consumes this fixed loading approval and separately assigns D budget work. Dispatch has accepted the inherited reader P2 and authorized a new bounded C reader repair after this seal; its future source and review must remain distinct from e79. QR is read-only scope clarification. Q waits. No main merge, push, deployment, actual publish or external data writes occurred.

Evidence custody: [manifest](APP-BUNDLE-C1-evidence/SHA256SUMS.json) binds raw test/build logs, original final chunk graphs, exact matrices/scripts, native fixtures and selected live-DOM observations. Raw terminal logs preserve original trailing whitespace/blank EOF bytes; do not normalize them. Later evidence-only commits leave implementation packages identical to e79fe3b.
