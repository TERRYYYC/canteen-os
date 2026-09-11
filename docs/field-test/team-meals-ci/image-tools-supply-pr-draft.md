---
feature_ids: [team-meals]
topics: [dependencies, pr-draft]
doc_kind: pr-draft
created: 2026-09-11
---

# Prepare pinned image validation tools explicitly

Image validation needs full pixel decoders whose dependencies can be prepared consistently before the build. Add exact pngjs 5.0.0/jpeg-js 0.4.4 root dev dependencies and an explicit libwebp 1.6.0 source preparation entry point that verifies the fixed archive hash, disables extra image libraries, and publishes only dwebp/webpmux plus upstream notices to an ignored local cache. Ordinary checks only verify prepared artifacts and never download or install tools.

Both workflows prepare tools within their existing dependency-install step, preserving Worker publish-progress names and stopping before preparation if installation fails. Node remains >=20. RC-A's original-container checks and final build integration are separate changes; this PR does not treat extracted-frame decoding as validation of the original animation structure.

Validation: actual Node 20.20.2 on macOS arm64; supply 10/10, full script suite 42/42, Worker publish tests 16/16 and build pass, frozen pnpm install, real online/offline-source preparation, cache reuse, and 15 pixel-decode positive/negative probes. Both prepared native tools link only the host system library. Linux preparation is reproducibly specified but has not executed locally or in external CI. See `image-tools-supply.md` for licenses, source pins, test-environment details, and remaining integration limits.

This is a local review draft. No external publication is authorized by this document.
