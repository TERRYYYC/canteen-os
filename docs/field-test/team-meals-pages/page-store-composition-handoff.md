---
feature_ids: [team-meals]
topics: [pages, draft-store, auth, reload-safety, integration]
doc_kind: handoff
created: 2026-09-11
---

# Bound page drafts and pure C1 inspection

What: Import, Plan, Dish and Ingredient synchronously bind the approved shared draft store at render entry, then capture that exact handle for reads, writes, undo and handoff. All three custom C1 adapters provide the optional pure peek seam. The page migration does not alter C's store, token, API, registry or editor algorithms.

Why: the original b45 Import browser reproduction still fails 3 of 8 assertions: I-R1 enables an invalid late preview, and I-R2 exposes A's imported draft notice/body to B while skipping B's Source read. The same original behaviors plus actual Import→Plan→Import→Plan and Ingredient handoff now pass 15/15 using the real pages and shared store. B fetches B's Source, and old A handles/continuations cannot clear, undo or write B's data. Different API instances with equal session numbers remain separate. Existing I-R1 and raw ownership fixes are retained.

Tradeoff: no second auth draft map, persistence, implicit rebind or unscoped fallback. Default application handoff uses the same getTeamMealsApi instance; test fixtures now explicitly share their injected instance. Empty or missing pure peek stays generic unknown. Pure inspection does not invoke sessionKey, emit auth events, retire the editor, or expose a changed identity's document ID.

Open questions: this checkpoint does not connect page auxiliary registration/coverage or the newly approved operation tickets. The root has consumed C d8bb568 via 88125b6, 65f6641's exact three-file delta via 46ffec4, then full reviewed C history through 5885f8f via 0623638. All shared implementations retain their authors and exact reviewed files. Reader/main/PWA remain outside that history. Dish f4e3fee's newly reported D-PENDING-R1 current-view slug/duplicate feedback is also separate and remains open here; it is not concealed by this migration.

Next: original non-author reviewer verifies the fixed composition, including original I-R2 and pure reload inspection. Then page-owned ticket/coverage integration proceeds as a separate checkpoint using the approved C module.

Evidence:

- `red-import-auth-original-browser.json`: actual original b45 on local 4207, 5/8 with original three failures.
- `green-import-auth-browser.json`: actual current page/Plan/Ingredient composition on local 4195, 15/15; mock GETs only.
- `red-dish-bound-store-browser.json`: all eight grouped Dish cases fail at the intentional unscoped store boundary before migration.
- `green-dish-bound-store-browser.json`: all 13 original pending-task checks pass after migration.
- `red-plan-bound-store.txt`: existing 10 Plan raw cases fail because the pre-migration page cannot obtain a scoped draft.
- `green-plan-bound-store-browser.json`: six original Plan browser probes pass, including later count input during imported catalog load, failed Source retry, conflict Source B, initial language redraw and early save followed by B catalog.
- `red-page-store-peek.txt`: three verified-identity assertions fail without adapter peeks; all three missing-peek safety negatives already pass.
- `green-page-store-composition.txt`: 98/98 actual-page/controller tests (Dish, Plan raw, Import, Ingredient, Shopping and all three pure-peek adapters).
- Installed Web typecheck and scoped diff whitespace pass. Full application completion and real backend writes are not claimed.

The companion `import-ingredient-bound-store-handoff.md` records the author's narrower changes and test ownership. All browser fixture writes remain local intercepted methods/HTTP; no production records or externally delivered messages are used.
