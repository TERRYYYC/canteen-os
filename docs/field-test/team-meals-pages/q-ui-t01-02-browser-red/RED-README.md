---
feature_ids: []
topics: [team-meals, plan, import, q-ui-t01-02]
doc_kind: author-native-red
created: 2026-09-11
---
# New D native RED before import repair

Root rebuilt exact994a81720e95b9f123c689d4518cf4ddadcc1add (production same as approved copy5049) from Git; original57 Web source hashes are in red-source-integrity.json. Node v20.20.2. A separate D IAB89 at local ephemeral59462 ran actual main → C API/editor → HTTP → actual Worker → original Q FakeRepo/fixture at6276f1beacd9bb61c756d1a3974b180f6cbc74ab. The listener has stopped. This is a newly operated browser reproduction, separate from Q's historical captured RED.

From the actual Plan UI, set first09-14 lunch first-dish count8 and save; set view range Day; edit that count to11 without saving. Follow the actual Paste import link, enter only `2026-09-15 午 第一道样本菜`, parse, and import1 row. Return to Plan: that original count is8 again. Switch to All dates: the new09-15 lunch row exists with count omitted. red-before/input/after/all-dates.json are read-only DOM observations (visible text and actual input/select values), not private page-state reads or fabricated app state. Dates/counts were entered through real DOM controls.

verify-preserved.py asserts the initial actual11 and preservation of11 after import. red-native-assertion.log preserves the actual8 mismatch and exit1; this script checks newly captured observations, it is not a browser driver. red-ledger.json records exactly one initial POST /plan/team-week carrying8, followed only by GETs; import adds no Worker POST. The modeled saved source is baccc6d1... and differs from Q's original longer-history source6f479b8a; it is not claimed to be the same GitHub history.

The D server is a derivative of the read-only fixed Q server. Visible test controls can hold/drop the next local response; none was used in this RED. Production source, renderer, C/store/session, Worker handler and business algorithms were unmodified. No external network, real credentials, config/dependency changes, publication/rollback or Q file/browser operation occurred. Existing installed dependencies were reused read-only as recorded in the builder. The explicit bootstrap fixes date and test credentials and strips external font requests.

This RED matches the causal symptom and isolates one unrelated imported row. It does not establish a repaired state, comprehensive import acceptance, numeric matching semantics or Q T01–T09 completion. Original RED files must remain unchanged; later candidate evidence belongs in a new prefix/directory.
