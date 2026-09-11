---
feature_ids: []
topics: [team-meals, import, plan, review-repair, numeric-input]
doc_kind: handoff
created: 2026-09-11
---

# Import completion and exact field counts

What: Import removes only busy decoration on completion and recomputes its current action state. A still-running Source read blocks another import in that render. Both Plan and Import use a page-owned exact decimal field validator; Import keeps the typed raw string separately so an invalid value survives a language repaint.

Why: independent b45d40393886f2d8f4cf6d1bc94aa4091c1c7e21 review I-R1 showed valid 8 → held Source → invalid 1.5 → canceled completion re-enabling the old action. Dispatch then identified the sibling numeric paths: Number("2.0000000000000001") loses the fraction before integer checks; Plan also accepted unsafe integers. The actual renderer/controller red tests failed on precisely these three mechanisms. Original requirements remain D0 ad5651787be4a54ef28060f6345f61187e78cd9d, optional but truthful integer counts.

Tradeoff: the new helper validates only numeric fields, not pasted menu text. It recognizes decimal and exponent representations and verifies their exact positive integer value is safely representable. Blank still explicitly clears; 2, 2.0, 2e2, 20e-1 and 9007199254740991 remain valid. Invalid source strings are never replaced by a rounded number or an invented count. The core text parser remains solely upstream A's implementation.

Open: I-R2 cross-auth shared draft/undo/handoff remains REQUEST_CHANGES and is assigned to C's single store owner by dispatch. This change creates no D authentication map and changes no shared store signatures. Approval of this slice must not imply b45 or the whole plan/import path is complete before I-R2 and final integration.

Next action: original non-author /root/plan_review should review this fixed delta after the queued Dish and MP-R1 checks, then consume C's later fixed I-R2 contract/implementation separately.

## Evidence

- red-import-plan-raw-review.txt: 21/24 pre-fix; fails I-R1 current button state, Import precise fraction/raw preservation, Plan precise fraction acceptance. These run the real renderer with a DOM double and real C1 plus the plan controller, not layout evidence.
- import-plan-raw-review-browser-red.json: actual local browser 9/23 before the field/button repair. Includes lossy raw → rounded value across language, Plan unsafe acceptance, and current invalid action falsely enabled.
- green-import-plan-raw-review.txt: 25/25 after the fixes plus approved-core consumer coverage. Clear/later-valid completion, exact integer formats, prior whole-document and unknown-count behavior pass.
- import-plan-raw-review-browser-green.json: the same actual browser checks 23/23. Source parser failures show status/reason/original raw, no import action, no source fallback. All fixture requests are GET.
- Web typecheck and bounded production/test diff whitespace check pass.

Stable browser URL: http://127.0.0.1:4195/test/team-meals-pages-import-plan-raw-review-browser.html. Click “Run raw and completion checks”; this uses real Import and Plan rendering, real C1 transport parsing, real core and real shared draft storage with an explicit synthetic local mock. No publication, repository write or deployment is performed. Fixture sha aaaa… is synthetic provenance only.

## Approved upstream consumption

Dispatch released A original 24d7359b8d478ee816e8e187599478e1420aa693 after independent exact approval; it was cherry-picked with its author preserved as bcc3a1d (full hash in git). Only its three-file text-parser delta was consumed; unrelated A work was not merged. Actual Import directly renders its unparsed / reason / raw contract for 2.5, precision-loss decimal and unsafe integer examples. No page-side reparse was added.

The earlier b45 Home no-finding receipt, historical plan247 approval, and original Dish/MP checkpoints remain bounded historical evidence. These author tests are not self-review or final D1/T/L2 acceptance.
