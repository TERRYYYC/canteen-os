---
feature_ids: [team-meals]
topics: [web, offline, handoff, verification]
doc_kind: handoff
created: 2026-09-11
---
# APP-READER-OFFLINE-C1 fixed implementation

What: implementation 3dd9db9d07ec8fdc67990ecbb77a0578f2dc2338, branch codex/team-meals-web-shared. Accepted source [contract](APP-READER-OFFLINE-C1-contract.md), exact content revision 33464131aab2d56da95469f0712dbf07b4593c40, explicitly accepted by dispatch. Review subject task:01a08d94-5d2e-7162-8f34-689ed87e391e:APP-READER-OFFLINE-C1. Separate prior e79 loading approval and inherited finding remain sealed at fee400c.

Why: after a successful fresh manifest, tagged team projection requests can fail offline despite the same revision being installed. The reader now makes one ordinary-path attempt only for tagged projection transport-unavailable errors with no HTTP response status. It then applies the original complete validation and only issues a branded plan for the current generation. Both request forms retain the generation-owned Promise cache. Diagnostics record the actual JSON URL used, including ordinary-path validation errors.

Tradeoff: fresh manifest/probe never recover through an older path. HTTP refusals, parse/schema/version/revision/asset-binding errors do not trigger another request. A body deadline is a transport timeout; invalid received JSON remains invalid_data. Neither legacy sheets nor QR gain unverified offline behavior. Image URLs and original cache policy remain unchanged; unavailable same-version assets remain visible. One bounded same-path recovery edge is added, with no secondary publication owner or durable store.

Validation: source RED has8 fail/5 pass; all13 new cases then pass. Reader/main/PWA target51/51, full Web450/450, Node20.20.2 typecheck and both original-config default/configured-HTTP builds exit0. [Raw logs and graphs](APP-READER-OFFLINE-C1-evidence/CUSTODY.json) bind these outputs. Tests cover both first-claim and external-B states, ordinary offline startup, exact revision and full validation, no manifest/probe/legacy fallback, forged handles, concurrent readers, missing copies, timeout, late success/failure and unseen assets.

Author dogfood: real original-config SW and uninstrumented production app reproduce both formerly failing browser paths with full A/B Menu success, retained document lifetime, and a still-offline new-document positive control. Actual recipe view preserves B while unread images explicitly remain unavailable. [Native observations](APP-READER-OFFLINE-C1-evidence/native-observations.md) map the raw cache/request/DOM snapshots and distinguish intermediate states. This author evidence is not independent approval.

Quality scope: behavior=offline recovery and async generation; data=exact revision/shape/asset identity; security=existing branded handles; contract=freshness and same-version installed data; irreversible=none. Architecture cell=C published reader; map delta=none. Production diff changes only published.ts; main/data/PWA, D pages, kit/client, core, Worker, dependency and config files are byte-identical to accepted source. No UI/layout/copy change or matching .pen file; no root media added. External-project tree lacks Clowder check-fallback/check-hotfix/ownership/tips scripts; mechanical availability was checked, and the affected Web checks plus source comparison provide the risk-matched evidence. No parallel fallback stack was added.

Budget continuity at this reader-only cut, before D's separate consumer change: default Ingredient58,913/Dish84,179, configured HTTP Ingredient60,487/Dish85,754; full11 route and no-SW totals are separately archived. Previously failing entries remain open; reader compressed cost is included rather than borrowing e79 totals. Default all JS20 files/164,329 gzip; configured20/165,902. Both precache all20 JS under unchanged configuration. Native fixture bytes are not combined with these separate budget builds.

Open questions: original non-author fixed review is in progress. Dispatch owns later D combination and budget verification. Existing legacy and QR index limitations remain explicit; current contract authorizes no configuration expansion and no all-route-offline claim. Q stays idle.

Next action: consume the original non-author exact-SHA verdict and archive its original evidence, then return to dispatch. No main merge, push, deployment, real Worker write or actual publish occurred. Subsequent evidence-only commits must leave packages identical to3dd9db9.
