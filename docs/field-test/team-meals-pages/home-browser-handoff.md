---
feature_ids: []
topics: [team-meals, home, browser, compatibility]
doc_kind: browser-evidence
created: 2026-09-11
status: author-verified-awaiting-independent-review
---

# Home author browser verification

What: a D-only browser entry for the actual home renderer with real C1 API and explicit local fetch fixtures. Why: complement the earlier DOM-double tests with visible browser behavior. Tradeoff: the unchanged home module has no injectable API argument, so a reproducible esbuild test bundle injects its dependency getters; production code remains untouched. Open questions: independent review and real deployed connectivity/publication. Next action: root can freeze the import/home slice for the separate reviewer.

## Source and fixture boundary

Home SHA256 before and after this browser slice: `eb93fd85dfe20ed5cec00e9c3b230a607609836b88ed9ac9ebe1122618b621eb`. Import remains `1b901d0077d472869388d0d6e96feb353125cae85131847693fc1c5923ecde21`. Worktree `canteen-os-team-pages`, branch `codex/team-meals-pages`, base for this slice `631298aec7d89bba4ee884f4a5ef4258ddaad38d`.

Rebuild the dedicated module with `node packages/web/test/team-meals-pages-home-browser.build.mjs`; it reads home.ts without modifying it and embeds that source hash in `team-meals-pages-home-browser.generated.mjs`. It retains the actual renderer, DOM helpers, core calendar functions, C1 transport, cache/session behavior, i18n and auth listener. The four injected dependencies are Team API getter (explicit fixture instance), legacy getter (throws), network/format presentation functions, and navigation URL helper. No page/controller algorithm is copied. The entry loads the actual tokens.css, styles.css, admin.css and home.css.

Entry: `http://127.0.0.1:4183/test/team-meals-pages-home-browser.html`. `#mode` selects unconfigured or explicit mock; `#format` selects local v2/v3 plan; `#lang` selects zh/en/uk; `#run`, `#result` and `#ledger` expose the actual DOM journey and outcomes. There is no real mode option. Fetch refuses every non-GET, every unknown origin/path and any publication read. A mixed v2/v3 dish dictionary and a plan with either original integer counts or an omitted count are explicit injected objects. Synthetic revision tokens are not historical or deployed-source claims.

## Observed real browser evidence

CUA Chrome clicked the actual Run control at 393×852 and 1440×900. Both runs passed. Each run records 54 assertions across unconfigured × three languages and mock v2/v3 plan × three languages. It verifies seven rendered entry tiles, explicit unconfigured notice with unknown numbers and zero reads, exact recorded meal/draft counts from Any data, the first draft's actual ID link, and language snapshot reuse (one catalog and one plan read). The publication area never reports actual publication or last-published data in these modes.

`home-browser-result.json` contains the real browser DOM observations, assertion/request ledger and empty error log. Its twelve additional width/language/mode observations show no horizontal overflow. Temporary viewport override was reset afterward. Screenshots were captured with all original production styles and visually inspected:

- `home-unconfigured-uk-393.png`: Ukrainian mobile unconfigured state; unknown counts remain legible and all seven entry tiles remain present.
- `home-mixed-en-1440.png`: English desktop explicit mock state; mixed-format counts, source-ID draft link, separate simulation notice.

No home/import production changes were made during this slice. The generated module passed JS syntax checking and the scoped diff check passed. This is author browser evidence from controlled local inputs, not independent approval, authentic history, real Worker connectivity, a saved/deployed roundtrip, or full feature acceptance. No remote operation or commit occurred.
