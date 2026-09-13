---
feature_ids: []
topics: [team-meals, q-ui-t08-01, clipboard, browser]
doc_kind: author-browser-evidence
created: 2026-09-11
---
# Q-UI-T08-01 — actual clipboard and fallback evidence

Fixed production/test source: `5049f0a47c76c4149a91a288a6a9b6edf279b1ea`, packages tree `b0407a1b761561f03aa07d66a5c6b003687458c8`, Node `v20.20.2`. Root operated a new D IAB tab 88 at a separate ephemeral local port 58497. The listener is stopped. Source integrity verifies all 57 original production Web files against that exact Git commit. This is author browser evidence, not independent review or completed Q T01–T09 acceptance.

## Real path and test boundary

Actual production main → actual C client → local HTTP → actual Worker handler → Q-authored existing FakeRepo. The fixture and original server were read from Q `ad54d4ff31f977624e1605e883d3c2286a50358b`; source copies and original evidence are preserved in the adjacent `q-ui-t08-01` intake directory. No Q worktree, active server, browser or tests were changed. Only D temporary build files and visible verification controls differ from the original input harness. Worker/core source and dependencies match the fixed source; existing Q Worker dependencies were reused through a read-only link because D has no installed Worker dependencies. No install, config, package or lock change occurred.

Normal clipboard mode uses the browser's unmodified `navigator.clipboard.writeText`; a separate visible button invokes native `readText` into the DOM. Native reads completed for zh/en/uk. Failure and hold modes are explicit clipboard-boundary test controls, not claimed as native write success. They do not replace page renderer, editor/view-model state, API or Worker logic. Source and full request/response/conditional-write ledger are retained. The bootstrap supplies fixed date and public test credentials and strips external font links. No live credentials, external service, publication or rollback was used.

## Executed UI journey

1. From the actual new-Purchase page, enter `d-copy-all`, read saved plan `team-week`, keep both selected scopes (09-14 lunch and 09-15 dinner), generate all-check candidates and save. Then set oil buy, salt available, tomato buy+bought, tomato-other check and save through the original acknowledged conditional write.
2. In zh, en and uk, click the actual localized copy button, then read the native clipboard. Save the raw text and matching main DOM. Select the explicit rejected-clipboard boundary, click the actual copy button again, inspect its visible textarea and save its value. All three textarea values are byte-for-byte equal to their native clipboard text.
3. Through the visible fixture control, change latest FakeRepo ingredient metadata/image to B, then use the real Ukrainian “read latest saved plans” button. The page simultaneously displays original bound A `ab3f5846` and unapplied scope B `1928d305`. Actual native copy is unchanged byte-for-byte from A, with no B name or revision mixed in.
4. Hold a Ukrainian clipboard promise, switch the actual language selector to English, and reject the old promise. The new textarea stays hidden and receives no old-language or English failure message. Hold a second English promise, follow the actual “Plan meals” link, then reject. Plan remains visible with no textarea or copy-failure message.

This new native run intentionally selected all original fixture meals, so its no-components issue belongs to `name-only` at dinner. The original Q native failure selected lunch only and did not include that issue. These are separate observed scopes; the Q function-level all-meals RED is also preserved separately. Root did not relabel its expanded case as an exact replay of Q's original lunch history.

## Results and limits

`browser-results.json` records **32/32** checks over captured native/fallback text, original scope/source, four current groups, distinct ingredient IDs, six exact source occurrences, known/unknown/to-taste separation, concrete missing information, bound A/unapplied B, late language/route results, the two actual Worker writes and source integrity. These are focused checks of this journey, not 32 independent end-to-end runs.

There are exactly two Worker writes: initial all-check list creation with `If-None-Match: *` and the later manual judgment update with the acknowledged `If-Match`. Copying, language switching, latest-source reads and held clipboard settlements add no Worker writes. The B metadata change is explicitly modeled via the visible local fixture control, not a production API write.

`verify-capture.py` checks stored observations; it does not operate the page. Native behavior was operated through CUA real DOM controls, not synthesized by the verifier. The separate original author's Node DOM-double tests cover no-API/synchronous-throw additional boundaries and must not be described as native browser cases. Root initially tried an unavailable CUA locator `inputValue()` read method; it failed before returning a value, then used permitted read-only DOM evaluation of the textarea value. This tooling mismatch was not a product failure. Earlier build/listen preparation failures are preserved in SETUP.md and the original setup logs.

Uninstrumented budget builds and independent review are separate. This browser artifact does not imply unchanged cold-install totals, complete offline acceptance, live service validation or L2 approval.
