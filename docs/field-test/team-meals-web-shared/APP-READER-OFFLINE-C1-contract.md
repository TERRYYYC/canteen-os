---
feature_ids: [team-meals]
topics: [web, published-data, offline, lifecycle]
doc_kind: implementation-contract
created: 2026-09-11
---
# APP-READER-OFFLINE-C1 bounded repair

What: repair the independently confirmed inherited P2 in [the original finding](APP-BUNDLE-C1-review-evidence/OFFLINE-FINDING.md), after the separate e79fe3b loading approval was sealed at fee400c827bdd1dcf2b447fb18cef9db4107b296. Dispatch task 01a08d6d-be28-7142-ad8e-3f964658d3f4 explicitly authorized the shared published reader and necessary C tests, followed by original non-author review of a fixed SHA and real original-config SW reproductions. Review subject: task:01a08d94-5d2e-7162-8f34-689ed87e391e:APP-READER-OFFLINE-C1.

Why: after first controller claim or external B takeover, a successfully verified fresh manifest leaves refresh-tagged projection requests unable to reach an installed same-revision ordinary URL while offline. Both cached JSON identities and exact failed requests were independently captured. A controlled offline new document succeeds without the tag.

Tradeoff: retain the fresh tagged request first. Only a transport failure (unavailable with no HTTP status) for a team projection in a tagged generation permits one ordinary-path attempt. Both attempts remain subject to the original complete projection validation against the already-issued TeamPublication: exact sourceRevision, supported version, selected plan, structure, issues and asset bindings. Do not retry an explicit HTTP refusal or a returned invalid/wrong-version payload through another path. The ordinary response is not assumed to be cached or trustworthy; it must pass the same validation before becoming a branded plan. The reader does not search CacheStorage, ignore query parameters globally, or create another stored current publication.

This is a narrow exception to the persistent tagged JSON behavior documented in C2b-contract.md. Fresh manifest and probe always retain freshness bypass and never fall back. Probe results never adopt a generation. Legacy sheets carry no independently verifiable sourceRevision, so they receive no ordinary-path recovery. This repair does not claim to solve their analogous offline limitation.

| Boundary | Required behavior |
|---|---|
| First document → first claim | After successful fresh manifest verification, first unopened Menu/Prep can use a fully validated same-revision installed projection offline |
| Controlled A → external B controller | Existing document is not reloaded by this repair; fresh B invalidates A handles; unopened route uses B only |
| Already-controlled offline new document | Existing untagged initial manifest/projection path continues to work |
| Clear/fresh during either request | Old success and failure return publication_changed; check before the extra request and after completion; old cleanup cannot remove G2 cache |
| Missing/wrong copy | Missing remains unavailable; A when B expected is revision_mismatch; unsupported/invalid/bad bindings fail; never return an empty or current substitute |
| Online explicit failure | HTTP 404/410/500, malformed data or mismatched revision is reported without ordinary-path recovery |
| Owners, auth, R3 | No main/PWA/coordinator/coverage/editor semantics change; no new reload, auth or write action |
| Assets | Existing immutable revision URL only; unseen or evicted bytes remain asset_unavailable, external-unpinned remains honest |

Validation: RED tests against sealed source, then targeted reader/main/PWA tests, full Node20 Web, typecheck and original-config production build. Real native SW evidence must repeat the first-claim and external-B counterexamples with exact requests and CacheStorage bodies, plus an offline controlled reload. Negative tests cover missing/wrong revision, late A/B requests, brands/probes, body timeout, errors, and unseen assets. The original non-author independently reviews the exact implementation SHA and executes native counterexamples; author checks are not approval.

Open questions: budget work stays with dispatch/D. QR is read-only follow-up: execution-brief.md:72 requires shell/current-week sheet JSON caching; :74/:96 require QR generation/printing without an explicit QR offline criterion. qr.ts fetches qr/index.json; gen-qr.mjs emits public/qr/index.json; vite.config.ts precaches PNGs but only data/**/*.json. Thus QR images can be installed while its index is absent. The observed limitation requires a separate product/config decision; no QR or cache/config change is part of this repair.

Next action: RED → bounded reader fix → evidence → original iterative review → dispatch. No D, core, Worker, kit/client API, dependency, cache policy or configuration edits. Q stays idle; no main merge, push, deployment or real publication.
