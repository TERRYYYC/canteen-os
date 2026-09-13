---
feature_ids: []
topics: [team-meals, design, screen-register]
doc_kind: design-evidence
created: 2026-09-11
status: proposed-for-review
---
# D0 screen register

Design revision: D0/screens.html (its Git content commit identifies revision). Authored by page_inventory under RC-D ownership; not visual approval. Fixture revision: hand-authored illustrative storyboard, not Q/core fixture and not production data. Root opened the actual browser at http://127.0.0.1:4182/docs/design/team-meals-pages/screens.html and inspected plan/purchase at1440×900 zh. The plan implementation follows the explicit D0 Plan screen layout and existing app shell; the storyboard also explores a desktop sidebar and contextual preview, neither is a newly approved navigation contract.

| screenId | sourceSelector | target page | state | approvedBy / approvedAt |
|---|---|---|---|---|
| plan | #screen-plan | #/admin/plan/<id> | optional count, day/week, unsaved/saving/unknown/conflict/unconfigured | pending / pending |
| purchase | #screen-purchase | #/purchase[/<id>] | check/buy/available, bought, change scope, recheck then confirm | pending / pending |
| ingredient | #screen-ingredient | purchase inner detail | same-version fields and missing values | pending / pending |
| dish | #screen-dish | purchase inner detail | original recipe and provenance | pending / pending |
| menu | #screen-menu | #/menu | date/meal/dish | pending / pending |
| prep | #screen-prep | #/prep | raw full method and ingredients | pending / pending |
| edit | #screen-edit | #/admin/dish/<id> | optional baseline and unknown quantity | pending / pending |

Browser observations: clicking the prototype scope-change action reveals the prior purchase warning and disables confirmations until the separate rebase-save action. Initial prototype erroneously still displayed removed salt and old decisions in current rows; this was corrected before registration. Rechecked current rows now show check and salt only remains in the old-purchase warning. This validates storyboard semantics only, not formal core reconciliation, persistence or T04. D0 screenshots: ../../field-test/team-meals-pages/D0-plan-desktop.png and D0-review-desktop.png.

The final implementation must be tested with approved Q fixtures and actual C1/C2 modules, in zh/en/uk ×393×852 and1440×900. Its evidence is separate from D0; no customer/order/feedback/report screens are included.
