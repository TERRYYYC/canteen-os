---
feature_ids: [team-meals]
topics: [independent-review, evidence-custody]
doc_kind: review-index
created: 2026-09-11
---

These are exact byte copies of the original non-author reports consumed by RC-D root. `manifest.json` records each original temporary report location and SHA256. Root read every complete report before copying; copying does not create a new review or broaden a verdict.

Each report names its exact target and exclusions. Publish's original requested change is retained alongside the original reviewer's later approval. Home browser execution provenance is retained: root operated the reviewer's fixed archive controls, and the reviewer independently read every returned assertion and made the judgment.

These local slice approvals predate the complete application check. The later actual-main review identified separate navigation and page-unload integration gaps; no whole-feature or L2 approval is inferred from the archived receipts. The original review and subsequent repair review remain separate receipts.

The original actual-main `3eb2f35` report's linked browser evidence is preserved alongside the report. `application-evidence-manifest.json` records all 11 original file paths and byte hashes, including the failed unload, failed native reload and intermediate observations. This makes the report's relative links usable without rewriting its original text.

The original reviewer's [34dd336 repair report](application-34dd336/REVIEW.md) closes R1/R2 and approves the D ACK/type/text delta, while retaining REQUEST_CHANGES for new C-owned APP-MAIN-R3. All 83 entries from the original `/private/tmp/canteen-app-r2-review-34dd336/EVIDENCE-MANIFEST.json`, plus that manifest, are copied byte-for-byte and verified. This includes original raw failures, reviewer-only probes and inert source/config/document copies kept solely for evidence custody; these copies are not active project instructions or implementation. The [fixed handoff](../application-handoff-34dd336.md) records scope and next ownership. The original 3eb2f35 report is unchanged.

Public Menu/Prep increment `d31661123b23bc2a80a9c8c613b1f9947d7c5665` received a separate non-author [APPROVE](public-d316611/REVIEW.md). Root read the full original report, then preserved its exact 60 manifest entries plus the manifest itself in `public-d316611/`; every hash was checked after copying. The original archive is `/private/tmp/canteen-public-entry-review-d316611`. Independent evidence consists of 60 targeted Node checks, 27 original browser checks, 17 added browser checks, typecheck, and individual inspection of all 12 final images. The report distinguishes root's browser operation from the reviewer's assertions, interpretation and verdict. Retained raw RED logs contain historical whitespace; they were not rewritten to manufacture a clean raw-log diff. Main/PWA, real publication and L2 remain outside this bounded approval.
