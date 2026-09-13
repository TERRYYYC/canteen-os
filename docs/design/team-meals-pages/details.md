---
feature_ids: []
topics: [team-meals, same-version, details]
doc_kind: screen-contract
created: 2026-09-11
status: proposed-for-review
---
# Material and recipe detail design

Use D0 tokens and the existing back/header skeleton. A full-width card shows name in the chosen language, then zh/en/uk each explicitly including missing translations, ID and source revision. Source metadata is read from the saved projection, not current data. A separately labelled current-data action is supplied by the owning page. Images use a page-owned object URL from the authenticated same-revision loader; absent/failed images remain a visible missing state with original ImageRef license, author and source link. No replacement image.

Ingredient view: real role (unrecorded is distinct), baseUnit, purchase supplier/packSize/packUnit/minPacks/lastPrice, externalId, trackStock/onHand and their recorded units. Show missing fields; this is read-only reference data, no inventory edits. Beneath it, all collection sources appear with date/meal/dish and source indices; navigation goes to the exact source dish in the same projection.

Dish view: original baseServings or unrecorded, description, provenance, full components in original order (including repeated ingredient IDs), recorded qty or unknown, prep technique name/note/size/timing and images/confidence; full steps with translations/technique/image and clip start/end/source. Original quantity is labelled as recipe reference, never scaled here. Any optional scaled estimate is a separate core-produced section on the containing page. No customer actions.

Mobile stacks these sections; desktop keeps the same reading order with facts in two columns. Missing values have text as well as color. Source links accept HTTP(S) only. All JSON text uses DOM textContent. D owns asset DOM lifetime and revokes ObjectURLs on detach. C2 supplies fixed projection/asset loader and retains its branded handle; D does not clone or reconstruct the handle.
