---
feature_ids: []
topics: [team-meals, original-recipes, menu, prep, browser]
doc_kind: implementation-evidence
created: 2026-09-11
---

# Original recipe presenter checkpoint

What: menu/prep have additive frozen-source presenters. Why: legacy sheets omit some unquantified recipes or seasonings. Tradeoff: original raw records are shown without rescaling, while existing legacy entry points remain explicitly labelled. Open: approved C2b publication reader and final application integration. Next: independently review these presenters, then connect the approved loader separately.

Scope: pages/menu.ts, pages/prep.ts, pages/prep.css, D tests/browser fixture and evidence. Shared data, types, router, APIs, PWA and core are unchanged. Source authority remains D0 contract and the dispatch requirements; this checkpoint does not create an alternative publication format.

The helper requires a deeply frozen TeamMealsProjection with a full source revision. C2a may supply its original SavedView. Menu includes every recorded component name, including seasonings, unknown quantities and repeated references; each meal occurrence opens its own complete raw recipe. Prep shows original quantities, all steps, names, preparation, image provenance and source links. Optional count fields remain absent. Collection and estimates are never recomputed by these presenters.

Images use only injected fixed-version Blob readers. The technique reader accepts an explicit technique ID so the owner can resolve its original catalog position or branded publication pointer. Filtered technique indices and image source string matching are not used. Wrong-version, failed or detached requests do not fill the page; created object URLs are revoked. No ImageRef.src is fetched directly.

Root found and reproduced two missing presenter behaviors before repair: technique image callbacks were absent; single-row details displayed unrelated row issues. `red-menu-prep.txt` records the 8-pass/2-fail run. The repaired presenter suite passes 10/10 and Web typecheck passed with the current C store widening. Known reference issues now have three-language explanations and preserve their original location; unknown future codes remain visible. Full source revision is expandable from its eight-character summary.

Actual browser: IAB `http://127.0.0.1:4183/test/team-meals-pages-menu-prep-browser.html`. The fixture uses Q boundary input through the real C2a view model, explicitly in mock mode, with all planned counts removed. Root opened the first full recipe and observed 300 g, Salt to taste, Oil 20 ml and the raw base count, then collected menu/prep × zh/en/uk × 393×852 and 1440×900 screenshots under `menu-raw-*` and `prep-raw-*`. The shared `.outlet` gives the same content width/padding as the app. Root visually inspected Ukrainian mobile and English desktop for both pages; text and controls fit. These captures use the system dark theme and show the mock label.

The fixture has no technique images or steps, so the screenshot matrix does not prove those paths. Targeted presenter tests cover complete steps, safe links, exact component/step image pointers, technique IDs, wrong/late image results and disposal. These tests use a minimal DOM transport, not pixel decoding. Published loader, actual shell navigation, static deployment/cache, light-theme integration, visual owner signoff, authentic historical data and real Worker L2 remain separate work.
