---
feature_ids: [team-meals]
topics: [review, evidence]
doc_kind: evidence-provenance
created: 2026-09-11
---

These five files preserve actual command-output text returned by the tools during the completed 4813 review. They were serialized into files after the verdict; they were not collected through shell redirection at execution time. See commands.json for commands, working directory, exit codes and original tool chunk identifiers. The targeted-test transcript joins the original initial and completion chunks. The tool returned combined output, so original stdout/stderr stream separation cannot be recovered. No test, Worker replay or browser was rerun to create this receipt.

The two exit-code-1 repros are the known product REDs. The copy repro invokes the actual production function with a broader all-meal fixture than the native lunch-only capture; the import repro asserts on already captured native DOM. Neither is a newly executed browser interaction.
