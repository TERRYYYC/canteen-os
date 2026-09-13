---
feature_ids: [team-meals]
topics: [web, review, published-reader, pwa, auth]
doc_kind: review
created: 2026-09-11
---
# Final C2b shared candidate independent review

Verdict: APPROVE. All previously reported P1/P2 findings in this shared scope are closed; no new P1/P2 found.

reviewedHeadSha: bae6308799d937f675fa7a919879ed8c121b2d93

This completes the shared reader/data/types/main/PWA/i18n review begun at c7785a990c49e7dd28aaad690516893276b2620c, together with its C1 lifecycle fixes. It does not approve the excluded D page migration or real Worker/L2. Each exact archive is retained; no reviewer-authored production source changes, commit, push, PR or deployment.

Compared with the preceding full candidate28eb30f, production source changes are only the two result-classification lines in edit-session.ts. A 409 is a conflict only when it is a definite rejection; malformed409 remains unknown. ACK commit must match the complete lowercase40SHA shape before it can settle an operation. blobSha remains the previously accepted nonempty opaque lock, with no expansion of C1 recovery semantics.

The earlier private asset.source exposure is closed by deep-frozen bindings. Branded frozen publication handles, full source revision and asset owner/pointer/source binding, literal per-segment path encoding, no-current-revision fallback, probe-without-adoption, late generation rejection, and strict error/asset boundaries were reviewed in full. Reader13/13, independent source-mutation2/2 and generation races4/4 were verified on28eb30f; reader source is unchanged at this reviewed SHA.

Main source is unchanged from c7785a9. Its actual-code controlled-boundary probe8/8 verifies admin/purchase DOM preservation through reader success/error refresh, atomic publication/error/planId for the next render, G1 success/failure not overwriting G2, read-only refresh, empty plans and recovery. This does not establish actual D-page behavior.

Exact final-revision validation:

- Node20 core build succeeded; full Web154/154. Log: /private/tmp/c2b-review-web154-bae6308.log.
- Independent original repros all pass: four actual Team API auth scenarios, three malformed409 responses and three invalid revision ACKs remain unknown/blocked with zero reloads. Valid ACK and definite409 settle only their original operation; two old operations and a new B operation cannot settle each other. Actual Team API valid409 still becomes conflict. Probes: /private/tmp/c2b-c1-auth-pending-probe-bae6308.mjs, /private/tmp/c2b-c1-ack-and-409-probe-bae6308.mjs, /private/tmp/c2b-c1-valid-settlement-probe-bae6308.mjs.
- Complete fixed subject range5885f8f..bae6308 diff-check passed.
- Actual main application build succeeded using the final archived source and formal A-produced fixture data. Source-directory comparison was identical. Entry gzip28.26KB; generated real SW and26 precache entries for this fixture. Build: /private/tmp/c2b-main-build-bae6308-76FPBR/dist. Log: /private/tmp/c2b-main-build-bae6308.log.
- Whole Web typecheck still reports exactly the five known D AnyMenuPlan sites at import.ts:925 and plan.ts:418,419,664,665. No whole-tree typecheck pass claim.

Native-browser evidence is deliberately versioned. The c7785a9 independent site /private/tmp/c2b-real-sw-Yqxu4h verified offline JSON and cached same-byte images after a whole-page memory reset, never-opened/evicted old-image unavailability, same-commit changed-builtAt detection without adoption, offscreen dirty/pending/unknown blocking, new input during real controller activation invalidating consent, fresh consent reloading once, and explicit fresh B reads with different B image bytes. The28eb30f independent site /private/tmp/c2b-real-sw-gBGK6o verified actual old-session unknown protection and the new PWA explanation with no old document/body, no discard action and no reload; only its original valid ACK retired the marker. Reviewer-local harness additions used synthetic authentication and explicit mock saves. Production PWA/reader/main source is unchanged between28eb30f and this final SHA; the two changed classification branches are independently reverified with real Team API/custom-adapter probes, not represented as a newly performed native-browser run.

Full preceding native observations and exact fixture revisions/digests are preserved in /private/tmp/c2b-reader-pwa-review-28eb30f-qG2fZ9/REVIEW.md. That earlier report's remaining findings are superseded only by this final result; its code-version labels remain intact.

Residual limits: image MIME/size/magic validation is not full raster decoding, which remains the approved producer's responsibility. Truly lost old-auth outcomes may remain conservatively unknown until the page lifetime ends; no persistence or cross-auth recovery is claimed. Actual D ownership wiring, three-language/viewport full-page combinations and real Worker/L2 remain later integration work. Author-owned browser sites were not operated.
