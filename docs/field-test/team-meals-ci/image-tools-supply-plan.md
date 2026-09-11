---
feature_ids: [team-meals]
topics: [dependencies, build-tools, implementation-plan]
doc_kind: plan
created: 2026-09-11
---

# Team image tools supply implementation plan

**Goal:** Explicitly prepare pinned libwebp 1.6.0 dwebp/webpmux in a checkout-local cache and expose an offline, fail-closed consumer API, alongside explicit pngjs 5.0.0/jpeg-js 0.4.4 dependencies.
**Acceptance Criteria:** Fixed official source/SHA and recipe; no precompiled bundle or extra image codecs; no implicit downloads/global installation; actual binary version and cache integrity checks; notices retained; failed workspace installation stops before preparation; targeted supply tests and real macOS build/decode evidence; Linux reproducible instructions without claiming execution; independent review of a new commit after 15d117d.
**Architecture cell:** RC-CI owns dependency supply; RC-A owns original-container rules and decode integration.
**Map delta:** none — no repository ownership map introduced.
**Architecture:** `prepare-team-image-tools.mjs` owns the cache; `requireTeamImageTools()` only validates prepared files and returns absolute paths. CLI preparation downloads or reads an explicitly supplied archive, verifies it before extraction, builds only required upstream library/tool targets, then publishes a complete cache directory.
**Tech Stack:** Node >=20 built-ins; pnpm 9.15.0; upstream configure/make; system compiler/runtime.
**前端验证:** No frontend changes.

The existing isolated CI worktree is retained under dispatch authorization. Main is not edited. The delivered evidence and source anchors are in `image-tools-supply.md`; earlier exploratory reports remain local and are not prerequisites for this change. No memory-search tool is exposed in this session.

## Cache lifecycle

| State/event | Action |
| --- | --- |
| Missing + read/check | Fail with explicit preparation command; create nothing |
| Valid + read or prepare | Verify recipe/files/versions and reuse; no network/build |
| Missing/invalid + explicit prepare | Acquire exclusive preparation directory; build in unique staging directory |
| Busy lock + prepare | Fail with owner information; never overwrite concurrent work |
| Download/checksum/build failure | Preserve prior cache; remove owned staging/lock; retain diagnostic log |
| Validated staging + publish | Replace invalid prior cache only after complete new bundle validation |
| Interrupted process | No partial directory is considered ready; a stale lock is reported for deliberate recovery after checking its recorded PID |

INV-1: reads cannot download/install (missing-cache and cached-hit tests). INV-2: wrong source or damaged artifacts cannot execute as approved tools (checksum/manifest/tamper tests). INV-3: failed preparation cannot publish partial readiness (failure/lock cleanup tests). INV-4: concurrent preparations cannot overwrite each other (busy-lock test). INV-5: source recipe/platform/tool versions and license files are part of readiness (fixture variation tests).

## Implementation steps

1. Add supply behavior tests and observe meaningful failures against an empty implementation interface. Tests cover missing/valid/tampered caches, wrong version/recipe, missing notices, checksum failure, busy preparation, and recovery after failed preparation.
2. Implement the final explicit preparation/read API and CLI. Test the same suite under actual Node 20.20.2.
3. Add exact root dev dependencies and `prepare:team-image-tools` / `check:team-image-tools` scripts. Generate the pnpm lock with pnpm 9.15.0 and run frozen installation. Existing `.cache/` ignore already covers outputs.
4. Run the real pinned-source preparation using the retained official archive, confirm tool linkage/version, and rerun static positives/negatives and the all-frame tool probe. A's container-gate failures remain A's scope and are not represented as build completion.
5. Document reproducible Linux preparation, source and component licenses, tests and limitations. Run `git diff --check` (the repository has no dedicated formatter command), commit only this change and its evidence, and request independent review of the exact commit. No external publication.
