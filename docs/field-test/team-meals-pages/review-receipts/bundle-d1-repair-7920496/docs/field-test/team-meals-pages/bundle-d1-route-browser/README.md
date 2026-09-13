---
feature_ids: [APP-BUNDLE-D1]
topics: [review-repair, browser, native-modules, evidence]
doc_kind: author-browser-evidence
created: 2026-09-11
production_head: 734e295edbfa03b360e0052a782f8b5c6f0c980c
status: awaiting-independent-re-review
---

# Native route and language repair validation

Root operated these author checks on exact fixed 734e295. The original reviewer has not yet approved that repair. The original df992 [REQUEST_CHANGES report](../review-receipts/bundle-d1-df992aa/REVIEW.md) and all 67 manifest entries are preserved separately, including both original native 2/4 failures and the independent 5/8 owner sweep.

The build is a Git archive of 734, with all 56 Web source files byte-identical to Git. It uses the original core build, formal publishedFixture producer and Vite/main/PWA. Only the test entry/HTML supplies explicit local API fixtures and controls; there are no real credentials or external private writes. The original reviewer R1 button bodies are reused unchanged; their labels still say Reviewer to identify the original reproduction. Root added the two Author inline-language buttons and changed the test banner to AUTHOR ROUTE FIX TEST. These are author-operated results, not a new reviewer verdict. The instrumented graph is behavior evidence, not the budget build.

The externally gated, real emitted legacy module is `assets/client-MzYSCKZV.js`. Each of three fresh origins had its own hold/pass state and complete request journal. All selected code bytes were served unchanged after the gate released; no fake import callback or new module identity was used.

| Case / origin | Held and final evidence |
|---|---|
| Ingredient, 55867 | `ingredient-before.json` 1/1 has saving and zero POST; `ingredient-away.json` 2/2 has the new Plan/current raw 13. After actual client delivery, `ingredient-late.json` **4/4**: no POST, original read settled, dirty protection retained, current Plan raw still 13. This is the unchanged R1 reproduction that was 2/4 on df992. |
| Dish photo, 55872 | `dish-before.json` 1/1 and `dish-away.json` 2/2 hold the real client after a fixture File underwent actual decode/Canvas. After delivery, `dish-late.json` **4/4**: no upload POST or write, original read settled and current Plan raw 13 retained. File selection is synthetic DataTransfer, not a verified system picker. |
| Inline save and language, 55884 | Root synchronously clears the actual editable loading seed after Create so the real form arrives with no name to auto-translate. It then enters Chinese/English text, clicks inline Save while client is held, and switches to Ukrainian. `inline-language-held.json` **3/3** verifies no early legacy execution/translation, zero POST and the same protected input. Actual module release yields `inline-language-completed.json` **5/5**: exactly one simulated create request to `/ingredient/language-owner`, and the current Dish row uses the acknowledged ingredient with no old inline form resurrected. |

Counts are cumulative per origin and must not be added as independent totals. R1 controls and assertions match the original reviewer reproduction; R2 is an additional root-authored browser probe complementing the original independent Node R2. No setup or assertion failures occurred in this new author run. Existing original failed probes and module-unavailability observations remain untouched; this small repair does not repeat or newly approve their whole matrices.

The Node20.20.2 command is `node build-fixed.mjs <D-worktree> 734e295edbfa03b360e0052a782f8b5c6f0c980c <new-archive>` with the actual path/environment recorded in the builder and build log. The server is the preserved serve-gated-dist script with exact dist and per-case evidence directories. Root stopped sessions 99665/77688/7510 individually, each exit 130, then copied the journals. The manifest preserves 20 raw original files with paths, bytes and SHA256; root verified each copy and all 56 source hashes against Git734. The narrative and manifest itself are outside that count.

The separate [Node/build repair record](../bundle-d1-route-fix/README.md) contains target119/full491/type and both final uninstrumented 11-route/preload/precache measurements. Original reviewer continuation must bind the repair source and the unchanged accepted contract revision b5ccc0a; Q/L2, remote publication and whole-feature acceptance remain unclaimed.
