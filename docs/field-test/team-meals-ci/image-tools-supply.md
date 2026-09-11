---
feature_ids: [team-meals]
topics: [dependencies, build-tools, image-decoding, licensing]
doc_kind: verification-evidence
created: 2026-09-11
---

# RC-CI image tool supply

This change supplies prepared tools to RC-A's image adapter. It does **not** complete the original-image container validator, team-meals build target, Worker asset validation, or deployment. Base is the previously reviewed `15d117df517b476e2655adeaf2411557ba714af8`; this is a separate follow-up change.

## Use and integration contract

After the normal frozen workspace install, prepare once from the checkout root:

```sh
pnpm install --frozen-lockfile
node scripts/prepare-team-image-tools.mjs
node scripts/prepare-team-image-tools.mjs --check
```

Root aliases are `pnpm prepare:team-image-tools` and `pnpm check:team-image-tools`. The default preparation downloads only the fixed official libwebp source archive and verifies its SHA-256 before extraction or execution. It never installs globally. To prepare without network, provide the same archive explicitly:

```sh
node scripts/prepare-team-image-tools.mjs --archive /absolute/path/libwebp-1.6.0.tar.gz --jobs 4
```

`--archive` cannot override the expected version or checksum. `--cache-dir <directory>` selects a parent cache directory for an isolated probe; the version/host/recipe subdirectory is always added. `--jobs` accepts 1–16 (default 2). `--help` and `--check` do not prepare tools. A missing or invalid cache causes check/consumer failure with the explicit preparation command; it does not initiate a download.

The synchronous consumer API is:

```js
import { requireTeamImageTools } from './prepare-team-image-tools.mjs';
const { dwebp, webpmux, version } = requireTeamImageTools();
// dwebp and webpmux are absolute paths; version is "1.6.0".
```

Importing the module only locates its own checkout. Calling this API reads the prepared manifest, verifies regular tool/notice files and their hashes, and executes both tools with `-version`. It does not download or compile. Paths come from the supply code, not from a manifest-controlled executable path. RC-A owns PNG/JPEG/WebP original-container rules and every-frame pixel decoding; it should use explicit subprocess argument arrays and its own temporary input/output lifecycle.

The default cache is `.cache/team-image-tools/libwebp-1.6.0-<platform>-<arch>-recipe1/`. It contains only `bin/dwebp`, `bin/webpmux`, upstream `COPYING`, `PATENTS`, `AUTHORS`, and `manifest.json`. Existing `.cache/` ignore rules already exclude it. Source/build staging is deleted after preparation. `last-preparation.log` remains in the cache parent for failure diagnosis.

Both CI `build-web` and `build-deploy` explicitly prepare tools in the existing `Install workspace dependencies` step after frozen install. An explicit `set -e` stops the step if installation fails, before tool preparation can run. Every existing step name is preserved, including the Worker publish-progress contract. No new business target or guessed A/Q parameters were added. These workflow changes have not executed externally.

## Fixed source, recipe, and licenses

| Component | Exact version / source | License and impact |
| --- | --- | --- |
| pngjs | Root dev dependency `5.0.0`, reusing the existing qrcode resolution | MIT; no runtime dependencies. RC-A must use the tested asynchronous `PNG.parse` API; the v5 sync API accepted truncated PNGs in the probe |
| jpeg-js | Root dev dependency `0.4.4` | BSD-3-Clause package; Apache-2.0 decoder; no runtime dependencies. Use strict decoder options plus A's original-container checks |
| libwebp source | `https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.6.0.tar.gz` | BSD-3-Clause source; [COPYING](https://github.com/webmproject/libwebp/blob/v1.6.0/COPYING), [PATENTS](https://github.com/webmproject/libwebp/blob/v1.6.0/PATENTS), AUTHORS preserved in cache |

Pinned source SHA-256: `e4ab7009bf0629fd11982d4c2aa83964cf244cffba7347ecd39019a9e38c4564`. This pins the reviewed official HTTPS artifact; no detached-signature verification is claimed. The archive is capped at 16 MiB. The same digest is mandatory for online and offline preparation.

The recipe uses upstream configure without editing decoder/binding sources:

```text
--disable-shared --enable-static --disable-png --disable-jpeg
--disable-tiff --disable-gif --disable-gl --disable-sdl
--disable-threading --disable-wic
```

It builds upstream `sharpyuv`, `src`, and `imageio` libraries, then only the `examples` targets `dwebp webpmux`. These are the upstream dependencies of those targets; no other example executable or install target is requested. Compiler flags are fixed to `-O2`, inherited CPPFLAGS/LDFLAGS/LIBS/make flags are cleared, and CONFIG_SITE is disabled. `CC` may name the host C compiler executable; it is preflighted with `--version`. Source and recipe are pinned; byte-identical outputs across different compilers/OS SDKs are not claimed.

No downloaded precompiled libwebp bundle, sharp, libvips, or additional PNG/JPEG/TIFF/GIF native codec library is introduced. On the tested macOS build, both cached executables link only Apple's system `libSystem`. The host compiler/standard C runtime is an existing build prerequisite, distinct from a newly bundled project codec. The Linux build's exact system linkage remains to be verified on Linux; do not describe an entire precompiled archive as BSD.

Historical correction: sharp 0.35.4 was temporarily installed for a local probe before the license scope was clarified, then removed and package/lock/Node declarations restored to 15d117d. It was never committed or published. The final chosen dependencies here are pngjs/jpeg-js plus a minimal official-source libwebp build; no LGPL exception is assumed. Shared download caches were not purged.

## Cache lifecycle and recovery

Only the explicit preparation entry point owns cache mutation. It acquires a per-cache lock, writes its PID, verifies the source, builds in a unique staging directory, and validates the completed bundle before publication. Failed download/checksum/build attempts preserve any previous cache, remove owned staging/lock state, and never publish partial readiness. A damaged existing cache is replaced only after a new complete bundle passes checks.

A concurrent preparation fails rather than taking over another process's lock. After a hard interruption, inspect `<cache-directory>.lock/owner.json` and verify that process has stopped before deleting that exact lock directory and rerunning explicit preparation. There is no automatic stale-lock deletion or hidden repair during ordinary validation. Any incomplete cache after interruption remains a check failure until preparation succeeds.

## Author validation

All runtime validation used actual Node **20.20.2** on macOS arm64. The project engine remains **`>=20`**, and pnpm remains **9.15.0**. Lock changes add 11 lines: two root importer entries and one new jpeg-js package/snapshot; pngjs reuses its existing resolution. No existing version changes.

| Check | Result |
| --- | --- |
| Supply tests before implementation | 7/7 failed on missing required behavior, rather than an import/syntax error |
| CLI symlink regression before fix | 7 passed / 1 failed: symlink invocation silently exited 0 without checking missing tools; canonical entry detection fixes it |
| Workflow installation-failure regression before fix | 8 passed / 2 failed: both actual run blocks continued to preparation under plain bash after fake pnpm exited 23; explicit `set -e` fixes both |
| Supply tests within the full script suite | 10/10 after fixes: offline missing/readiness, reuse, tamper, version, notices/source recipe, checksum failure/recovery, busy lock, symlink CLI, and both workflow installation-failure paths |
| `pnpm install --frozen-lockfile` | Exit 0; lock already current; no extra resolution/update |
| Real `--archive` preparation | Exit 0; verified pinned tar, compiled real tools into the checkout cache |
| Real default network preparation with isolated `--cache-dir /private/tmp/canteen-ci-online-tools` | Exit 0; downloaded fixed source, verified hash and built real tools |
| Offline `--check` | Exit 0; both binaries report 1.6.0 and hashes/notices match |
| Repeated prepare with nonexistent archive path and valid cache | Exit 0; valid cache reused without archive access/download |
| Cached-binary linkage inspection | dwebp and webpmux each link only `/usr/lib/libSystem.B.dylib` on this macOS host |
| PNG/JPEG/WebP through the installed root dependencies and prepared dwebp | 15/15 expected outcomes: 3 positives produce complete RGBA; 12 header/truncation/corrupt-PNG/WebP negatives rejected |
| Full existing script regression under canonical temporary directory | 42/42 |
| Actual Node 20 Worker build and `node --test packages/worker/test/publish.test.mjs` | Build exit 0, publish 16/16, including all workflow names recognized |
| `git diff --check` | Exit 0 |

The initial full-script run on macOS's aliased `/var/folders` TMPDIR was 38/39: an existing copied schema-check CLI compared a symlink path to its canonical module path and silently skipped execution. Running the final suite with `TMPDIR=/private/tmp` exercised the intended missing-TypeScript failure and passed all 42 tests, including three added symlink/workflow regressions. That existing A-owned checker was not edited. The new supply entry independently received its own symlink regression test and fix. The workflow tests execute each actual install run block with a fake pnpm that exits 23 and assert exit 23 with no preparation output; they do not rely on GitHub Actions' implicit shell flags.

The 15 tool-level cases are not a whole-image acceptance claim. jpeg-js accepted a malformed SOS-length example in exploration, and `webpmux` extraction discards original animation canvas/frame metadata: out-of-canvas sources can yield decodable extracted frames. Those counterexamples remain required RC-A container tests. Normal two-frame extraction/decode and damaged second-frame/whole-animation truncation were separately exercised with the same official tool version; none supersedes original-source validation. Tool supply passing does not mark A's build gate complete.

## Reproducible Linux preparation and remaining boundary

Use a Linux x64/arm64 host with Node 20, a standard C compiler, GNU make, and tar already installed; then run the explicit commands above. Only the source preparation step needs network; `--archive` permits fully offline preparation from the pinned tar. Artifacts stay inside the checkout/cache directory and are not shipped to the browser or Worker runtime. `--check` and ordinary validation require prepared tools and never install dependencies. The [official Unix build instructions](https://developers.google.com/speed/webp/docs/compiling) document configure/make; this recipe disables optional native image libraries because only PAM output is required.

No Linux runtime/container was available locally. Linux compile, binary linkage, and decoder execution therefore remain pending actual Linux evidence. The workflow contains the explicit reproducible preparation command, but external CI still awaits publication authorization. No push, PR creation, deployment, or production validation was performed.

Independent review must examine this exact new supply commit, including cache failure/concurrency behavior, fixed source/recipe, dependency scope, and preserved workflow names. The old approval of 15d117d is not approval of this follow-up.
