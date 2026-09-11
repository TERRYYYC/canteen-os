---
feature_ids: []
topics: [team-meals, pages, initial-loading, lifecycle]
doc_kind: implementation-contract
created: 2026-09-11
status: frozen-for-implementation
---

# APP-BUNDLE-D1 — Dish / Ingredient consumer loading contract

**Goal:** Keep the existing editor behavior while reducing every initial route's executed JavaScript closure to at most 60,000 gzip bytes in both default and configured-HTTP builds.
**Acceptance:** Preserve D0's T01–T09 and C01–C12 behavior; this slice specifically proves the loading/ownership invariants and budget below. It does not reapprove the entire feature or real Worker L2.
**Architecture cell:** RC-D pages. **Map delta:** none; existing ownership remains unchanged. **Tech stack:** existing TypeScript/native DOM/Vite. **Frontend verification:** Yes, actual main with the production module graph and additional controlled delay/failure probes.

## Fixed inputs and scope

- D custody HEAD `a16a7731204b0c7963f304c96cb45b789d4f8202`; its packages are identical to independently approved composition `94802608447a3a6dbc60a8ca21cb9b6b0ad83a11`.
- Dispatch task `01a08d6d-be28-7142-ad8e-3f964658d3f4` explicitly released C implementation `e79fe3b49b2a5d3c06c5d7298d9207adc5cc3c71` through full history `fee400c827bdd1dcf2b447fb18cef9db4107b296`. Preserve all ancestors/authors; do not consume a floating C HEAD.
- Root read the original fixed `APP-BUNDLE-C1-review-evidence/{REVIEW.md,NATIVE-OBSERVATIONS.md,OFFLINE-FINDING.md}`. C's approval is bounded to top-level loading. The native observation document is a direct-observation transcription, not a raw JSON export. C's separate reader offline P2 is still open and outside D's repair.
- Original requirements remain `D0-contract.md@ad5651787be4a54ef28060f6345f61187e78cd9d` and the design workspace's `STANDARD-DATA-AND-ACCEPTANCE.md` SHA256 `6aaff3f33b65aad6f6952297abae9dd2dafef379bcc0fa64066c07f5300f0352`: optional counts, all recorded ingredients/seasonings/unknown quantities, manual purchase decisions, same-version raw details.
- Allowed production files: `packages/web/src/pages/admin/{dish-new,ingredient-new}.ts`, their minimum extracted pure draft/helper, image and reusable inline-form modules under the same D page directory. Tests remain `packages/web/test/team-meals-pages*`; evidence/design remain D-owned directories.
- Shared kit/client, main/router/reader/PWA, config/dependencies, core/Worker and Q tests are read-only. No new persistence, permanent row IDs, cache policy, server writes or remote publication. All application JS remains precached. Q stays idle. Existing root `.DS_Store`/`.poc-venv` remain untouched.

## Final structure and state census

Keep synchronous draft construction/slugification in a pure leaf module with type-only external imports; neither page may regain a static edge to the full other page through a helper. Ingredient's initial form/validation remains available immediately. Dish loads the reusable Ingredient form only for a user-created or retained inline buffer. Image processing and legacy API acquisition become optional action consumers using the original API singleton, without changing its factory or shared contracts. Initial Source/catalog/auth reads and C1 saves retain their existing owners and API.

| Stateful object / sole owner | State × event transition | Forbidden bypass / observable rule |
|---|---|---|
| Module code availability / native import cache and D loader | unloaded → requested → ready; rejected request → explicit retry | Cache code only. Never cache owner/auth/raw/DOM or persist a second derived busy flag; a rejected optional load is not a sent write or permanent unknown. |
| Inline raw buffer and row / original Dish record | click synchronously retains intent + draft → loading → form-ready; language/return redraws same buffer; row removal or buffer replacement invalidates old target | Do not await before recording intent and a real loading operation. Duplicate click cannot duplicate tasks. Old paint never installs into the current DOM. |
| Optional loading/translation/image attempt / existing original auxiliary owner and ticket | admit before first await → load → revalidate → action; known load failure → visible retry; late completion → settle only that attempt | Check original owner/API/auth, row membership, exact buffer and current paint as appropriate. Cross-auth/row/route late work must not launch writes or mutate a different draft. |
| Loading-to-auto-translation handoff / original Dish auxiliary owner | record module ready → finish loading → synchronous owner notification constructs current form → initial translation obtains its own ticket | `finish(true)` synchronously repaints. Never repaint again after finish. The loading ticket must not block auto-translation; the retained raw prevents any observable clear/unprotected interval. A stale paint cannot start duplicate translation. |
| Save / existing C1 or Ingredient save attempt | raw snapshot + busy before deferred API acquisition → read/validation → only then existing write tickets → original result/unknown rules | No-image Dish C1 save must not fetch legacy API. Load rejection emits no write. Later input is retained; original upload/write replies settle only original operation. |
| Image blob/object URL / existing original draft owner | original processing ticket → module load → decode/compress → target check → attach; abandonment/replacement → existing URL cleanup | Never attach a late image to another owner/buffer; preserve original pending photo/raw and existing upload metadata/ACK checks. |

## Invariants and RED / validation design

| ID | Invariant | Meaningful failing baseline or adversarial proof |
|---|---|---|
| INV-B1 | Every initial route is ≤60,000 gzip bytes in both builds, with no route regression | Rebuild C fixed baseline and candidate; enumerate distinct final entry/static imports/Vite preloads/selected page/immediate Workbox setup. Baseline default Dish 84,090; HTTP Ingredient 60,414 and Dish 85,682 must fail. Do not derive candidate savings by subtracting old chunks. |
| INV-B2 | Initial Source/catalog/auth, raw display, synchronous IDs and validation are immediate | Hold optional legacy/image/inline imports; initial reads and validation still work. No-image Dish C1 save does not request legacy code. Pure helper graph cannot import a page. |
| INV-B3 | Inline intent is protected before first await and survives view changes | Hold first inline load; assert dirty/busy and update/save protection synchronously, then repeat click, switch language, leave and return. Same buffer remains, no duplicate operation. |
| INV-B4 | Loading hands off to initial auto-translation exactly once | Start inline with Chinese seed and hold translation; observe synchronous notifications and current DOM. No clear/saveable gap, no busy self-rejection, one translation, no second stale-paint construction. |
| INV-B5 | Late results affect only original operation/target | Resolve/reject delayed inline/API/image/translation after auth A→B, row removal, buffer replacement and route/paint change. No B mutation/write, no resurrected row, no B ticket settlement. Re-entry can restore retained valid buffer. |
| INV-B6 | Module/action failure is visible and recoverable with raw retained | Reject optional load before any write; assert input remains, no unknown write, explicit retry succeeds. Preserve known upload errors, unknown save rules, primitive-string ACK validation and C1 read-before-write checks. |
| INV-B7 | All application modules remain installed for offline execution | From both real final builds, compare graph assets with generated SW precache and report missing=[]; report executed closure separately from all-JS cache and SW/runtime totals. Existing reader offline P2 is recorded separately, never hidden by a D fallback. |

Test seams must hold the real boundary while retaining real page owners, registry and save logic; do not substitute expected behavior or clear global protection to make the test pass. Preserve the existing ACK/unload/Shopping raw assertions and restore fixture globals on Node 20.

## Implementation and verification order

1. Commit this contract; verify fixed C custody and merge complete `fee400` history locally. Record the resulting composition SHA. Production implementation begins only on that fixed composition.
2. Add the minimal D graph/behavior probes and capture genuine RED on the composed baseline. Preserve raw failed output and exact source/runtime. Extract only the leaf modules required by the contract, then implement the consumer boundary until those same checks turn GREEN.
3. Run actual Node 20.20.2 targeted D tests and full Web tests/typecheck after building core. Commands are grounded in package scripts: `npm --prefix packages/core run build`, `npm --prefix packages/web test`, `npm --prefix packages/web run typecheck`; target `node --test packages/web/test/team-meals-pages*.test.mjs`. Select the installed `/private/tmp/canteen-team-ci-tools/node-v20.20.2-darwin-arm64/bin` in PATH; no dependency/config changes.
4. Produce isolated default and `VITE_WORKER_URL=https://application-api.local.invalid` builds with the unchanged formal data producer and Vite configuration (`node scripts/build-data.mjs`, `npm --prefix packages/web run build`). Recalculate all 11 routes, both normal-SW and no-SW closures; inspect actual final imports/preloads, including null-facade Prep membership. Report UTF8 and gzip, all cache assets and separate SW/runtime bytes; no cold-install transfer reduction claim.
5. Author actual-main browser preview covers initial Dish/Ingredient, one delayed inline/language/return/auto-translation chain, one failed-load retry and late-auth/row case, plus held image/API boundaries. Retain before-first-await and after-completion evidence. Use own local ports, no 3003/3004 and no remote API writes. Native module/cache coverage and prior R3 approval are identified separately from controlled-import behavior probes.
6. Freeze implementation/evidence SHA; check scoped diff and `git diff --check` (no repository formatter configured). Request the original non-author reviewer for this exact local delta and affected integration, with independent budget and lifecycle verification. Fix findings through RED→GREEN and return to the same active reviewer. Only the approved fixed result returns to dispatch; later approved C offline repair requires its own affected composition check.

Technical uncertainties are actual regrouped build size and synchronous handoff/re-entry behavior; resolve through the tests above. If ≤60,000 cannot be reached inside this boundary, report measured attribution and the smallest required shared contract to dispatch before widening scope. Do not weaken validation, remove precache entries, change threshold or claim approval from author tests. Historical 948 bounded APPROVE and its original 4/5 cancellation probe/unknown delay cause remain immutable.
