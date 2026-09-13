---
feature_ids: []
topics: [team-meals, plan, import, q-ui-t01-02]
doc_kind: author-browser-evidence
created: 2026-09-11
---
# Q-UI-T01-02 — native Plan/import repair verification

Root operated exact `6bb1ce916c9b4117b6e03db23a78a5d0b9724a10`, packages tree `38957ad074a6b7d102e730023613c9a5bb153ed7`, with Node v20.20.2. All58 production Web source files were copied from Git and verified. Actual D IAB90 used ephemeral loopback port60094; the listener has stopped. This is author browser evidence, not independent approval or Q's own acceptance replay.

## Boundary and reproduction continuity

Actual production main → C client/editor → HTTP → actual Worker handler → original Q FakeRepo. Q fixture/server input is fixed6276f1beacd9bb61c756d1a3974b180f6cbc74ab; no Q worktree, server, browser or tests changed. Bootstrap supplies fixed date/public test credentials and removes external font requests. D visible controls only hold/drop a local HTTP response. Existing dependencies are read-only links; production configuration and business code are from the exact source. No external service, true credentials, publishing, rollback or deployment was used.

The new D native RED at994a used the same deterministic original Q fixture (revisionab3f584656e1c85cad51a0ac3f6193fa2ff5f21d) and the same minimal save8/edit11/import-next-day journey. Its after8 assertion and14 raw originals remain separately archived under `q-ui-t01-02-browser-red/` at a49f79e. Q's historical source6f479b8a includes earlier unrelated activity; this fresh run starts with the original three meal records and does not claim that longer history. Its own initial saved8 modeled source is baccc6d11bc38fcc1595cb9e8e21813da367d770.

## Actual UI operations and observations

1. Save first09-14 lunch first-dish as8 through the actual Plan save button. Change range to Day, edit that count to11 without saving, follow actual Paste import, enter only `2026-09-15 午 第一道样本菜`, parse and import1 row. Returning Plan remains in Day view and shows11. All dates shows the newly imported15th lunch with omitted count, while the second original lunch count remains omitted and the original dinner2 remains.
2. In Day14, enter invalid numeric text13.7 into the original first-dish count. Import an earlier `2026-09-13 午 第一道样本菜` without a count. The original14th row changes index0→1, still displays13.7 and aria-invalid=true. Then import `2026-09-14 午 第一道样本菜 7`; the matching row displays7 and its invalid override clears. These values were entered through real DOM input/buttons, not form/session helpers.
3. Switch to All dates, arm the visible “Hold next plan save response” control and click the actual Save button. The original request runs through the actual Worker and commits before its HTTP response is held. While Plan is saving, follow Paste import and add `2026-09-16 午 第一道样本菜` with omitted count. The new row appears while phase stays saving. Release the original held response: phase becomes dirty, the new16th row remains present, and its count remains omitted.

Captures are read-only DOM observations: visible main text, original data-meal-index, actual input/select values, aria-invalid, selected range and visible phase. They never read private app state or call business/controller functions. `capture-dom-function.txt` records the observation function; CUA drove the actual user controls. The two verification scripts operate on stored observations and are not browser drivers.

## Results and request integrity

`green-native-assertion.log` passes the same11-preservation predicate that failed in the separate native RED. `browser-results.json` contains **15/15** focused checks for the above journey and source integrity, not15 independent end-to-end runs.

The final ledger contains7 Worker requests and exactly2 POSTs. Initial POST saves8 with original source lock d97b53d3fca48fb320a9081c9cdab07c2e7b0a96. The later held POST uses If-Match7d562d54526a05b8ebb53d834832fa09270a967a, exactly the first ACK blobSha, and no If-None-Match. Its original body contains the five rows visible when Save was clicked; it does not contain the subsequently imported16th row. Both POSTs return200; the held request is explicitly recorded held/released. All four imports add no Worker writes. Dirty after the ACK describes a still-unsaved local addition, not a saved import.

The known-document imports also avoid the old fallback source GET. Other necessary source/catalog reads remain in the ledger. No lock was removed, no second save owner was introduced and no extra request was issued to make the native check pass.

## Limits and separate validation

This native run is in Chinese and covers the original defect, raw-position/explicit-count interaction and actual save-response interleaving. Additional language/auth/closed-owner/fallback/unknown/conflict combinations are in the author's and original reviewer's Node real-renderer/C session tests; they are not claimed as additional native cases. The earlier Q T08 three-language clipboard approval remains independent. Full539/type, both actual build configurations, all44 budgets and precache/preload validation are reported separately by author/reviewer. This instrumented browser build does not replace those uninstrumented budget measurements.

The original contract's dependency restriction prevents this repair from newly drawing Plan renderer or parser/CSV code into another entry. The author's first checker incorrectly assumed Plan had no historical parser chunk; old5049 already shares parse-plan-text for date functions. That preserved checker failure and exact old/new byte comparison belong to author evidence; root did not broaden production to remove a pre-existing dependency.
