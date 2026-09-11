---
feature_ids: []
topics: [team-meals, import, optional-servings]
doc_kind: design-contract
created: 2026-09-11
status: implementation-proposal
---

# Import compatibility within the existing paste screen

Keep the accepted backoffice-v1 paste/upload/results/sticky-action layout. Each recognised row keeps an optional servings input. A missing count displays an empty input and “Servings unspecified” in zh/en/uk. Each recognised row also has a small “Clear servings” action, including rows already blank. The user may explicitly clear a parsed or previously entered count; the empty override remains distinct from untouched input. Invalid input stays visible, is marked invalid, and removes only that row from the importable count until corrected. Do not round, clamp or substitute a count.

For a new row, absent count remains absent in a v3 plan. When pasted text has no count and matches an existing date/meal/dish, retain that existing row's known count. Explicit clearing in the preview removes the first matching row's count. A positive integer replaces it. Preserve other existing row fields, all other meals, duplicate occurrences, names, margin and original date range bounds. Imported repeated keys continue the existing first-match merge rule; this proposal does not invent row identity or change core parsing.

Import remains an in-memory draft handoff with undo. It does not save or publish. Both plan and dish-name dictionary reads use C1 Any-format methods. Unconfigured mode shows the shared unconnected message and does not read implicit mock data; explicit mock mode displays the shared simulation marker. Language/route changes preserve the current session's input, while old async work and changed auth sessions cannot import over a newer input.

Original parser semantics remain in core. Its observed decimal rounding in pasted source is a reported upstream gap, separate from strict preview-input validation. Browser visual approval is still pending; this document records the bounded compatibility design before implementation, not completed acceptance.
