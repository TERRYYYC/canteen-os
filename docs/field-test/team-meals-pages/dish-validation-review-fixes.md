---
feature_ids: []
topics: [team-meals, dish, inline-ingredient, validation, review-repair]
doc_kind: handoff
created: 2026-09-11
---

# D-R4 inline validation repair

What: inline ingredient feedback now follows the actual IngredientDraft object in a WeakMap, outside saved JSON. A local error is revalidated when painted in another language. API field errors and generic errors remain attached to the same buffer. Finishing an operation only updates ownership/control state when the current form is still connected; if its old form was replaced, the current view rebuilds and applies the retained feedback.

Why: non-author /root/plan_review found D-R4 against 04afd9421de571a7295deabdfa4b4e049d281a26: unconditional finish(true) triggered synchronous paintComponents after displaying validation errors. Both a zero-write required ID error and a server 400 /name/zh error vanished. The independent comparison at b45 demonstrated these were introduced by the repair; original D-R1 through D-R3 remained closed.

Tradeoff: this is presentation feedback tied to a real buffer, not a copy of a saved document or a second store. Readiness and C1 save state are unchanged. Error feedback is cleared at the next explicit save attempt. A recoverable generic failure offers an explicit retry; uncertain auxiliary outcomes still block writes and do not expose a retry action that could repeat a write.

Open: formal C2b auxiliary registration and C store authentication migration are separate pending interfaces. The standalone ingredient author's concurrent optional task hook is not consumed by this change. This delta does not claim the entire Dish lifecycle or D1 is approved.

Next action: original non-author reviewer should independently rerun the fixed D-R4 slice and its siblings, using the exact commit. Original source remains D0 ad5651787be4a54ef28060f6345f61187e78cd9d.

## Actual evidence

- dish-validation-review-browser-red.json: copied original reviewer probe runs before this change, 3/5; precisely local-ID and server-name errors fail.
- dish-validation-review-browser-green.json: 11/11 after repair, with original five plus server error across language, delayed error into the current language form, local error revalidation, generic retry across repaint and exactly one explicit retry, and an upload /license field error with retained photo.
- green-dish-validation-review.txt: existing Dish controller suite 17/17, covering original ownership, late edits, unknown protection and conditional save invariants.
- Web typecheck passes; bounded production/test whitespace check passes.

The intermediate expanded upload fixture used an invented invalid_license code. The established API only treats its enumerated schema codes as field errors, so it correctly showed a generic upload error. This mismatch is preserved in dish-validation-review-browser-fixture-mismatch.json. After inspecting Worker image.ts /license required and ApiError.FIELD_ERROR_CODES, the fixture uses the actual required code. No product change was made to satisfy that incorrect expectation.

The first concurrent Dish test invocation hit the ingredient author's new module-level window listener in Node. The raw failure is saved as dish-validation-review-concurrent-import-red.txt; that author moved browser listener installation into actual render, and the unchanged 17 Dish tests then passed. The concurrent ingredient implementation is not part of this commit.

Fixture: http://127.0.0.1:4195/test/team-meals-pages-dish-validation-review-browser.html. Actual in-app browser click invokes production Dish/C1 and the actual shared form with explicit local fake API methods and a generated 2×2 PNG. All writes are local mock calls. No real upload, publication, deployment, historical provenance or full visual acceptance is claimed.

These are author verification results, not self-review or approval. The broader cross-auth Import I-R2 remains assigned to C.
