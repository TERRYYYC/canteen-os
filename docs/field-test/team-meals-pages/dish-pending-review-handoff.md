---
feature_ids: [team-meals]
topics: [dish, auxiliary-owner, photo, translation, browser-evidence]
doc_kind: handoff
created: 2026-09-11
---

# Dish photo and translation task ownership

What: The existing Dish record owns local photo decoding and translation reads from their start to their completion. Pending operations survive language redraw and route return. Their results can update only their original record and unchanged translation fields. The page shows processing rather than claiming a document save. Main save, photo pickers, translation actions, inline controls and error-card retry buttons respect the same live operation barrier.

Why: The actual browser red fixture reported 1/10. Main and inline decoding started before a pending image existed, so save/reload protection missed the task and language redraw lost its result. Translation could also overwrite later English input or start again on language redraw. The shared ingredient form's existing optional task hook now connects to Dish's actual owner; its implementation and submit contract are unchanged in this delta.

Tradeoff: C1 remains the only Dish JSON save owner. This extends the existing in-memory auxiliary Map and pure metadata reader, without adding a second document or a fake registry entry. Local image decoding errors are known local failures and retain the earlier photo; they do not claim an unknown server write. Old-auth callbacks cannot mutate a replacement record. Formal C auxiliary authentication retirement and registration are separate pending integration work.

Open questions: this author checkpoint does not approve reload registry, shared store migration, published reader, real Worker writes or full page completion. New raw data and unresolved remote writes retain the previous protection behavior. C's shared d8bb568 implementation was released during verification and has not yet been consumed at this checkpoint.

Next action: independent fixed-revision review, including original Dish validation cases and sibling pending-task boundaries; then connect the approved C shared modules in a separate reviewed change.

## Evidence

- `dish-pending-review-browser-red.json`: initial 1/10 in actual browser against pre-fix production code.
- `dish-pending-review-browser-green.json`: final 13/13, including main/inline decode, language redraw, later raw translation, detached record, auth replacement and broken image retention.
- `dish-pending-review-validation-regression.json`: final 11/11 of the prior validation/upload/error retry paths, using actual production page and shared form.
- `green-dish-pending-review.txt`: 40/40 existing Dish and Ingredient Node behavior tests, after the separate Ingredient repair checkpoint.
- Installed Web TypeScript check: passed. Production/fixture diff whitespace: passed.

Browser runs use explicit local fixtures at port 4195 with HMR disabled, synthetic source revisions, locally generated 2×2 PNGs, intercepted image onload timing and mock save/translate/upload methods. All checks operate through page controls. There are no backend writes or deployed-data claims. The onload wrapper delays an actual browser image decode rather than pretending an image was decoded.

Intermediate outputs are preserved. `dish-pending-review-browser-intermediate.json` contains one assertion mismatch: the broken-image check expected the substring “read” while the product correctly said “Can't open this image”; retention and barrier checks passed. Validation intermediate files contain test actions attempted while a newly tracked automatic translation was busy. Investigation also identified and fixed a visibly enabled generic retry button while that task was pending. The final fixture waits for the actual save control to become enabled, checks retry is disabled during processing, then performs the explicit save/retry. Waiting after photo completion is necessary because rebuilding its inline form can begin the existing automatic translation. Historical d5f validation evidence was not overwritten.
