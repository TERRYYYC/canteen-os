---
feature_ids: []
topics: [team-meals, fixtures, v2, acceptance]
doc_kind: fixture-guide
created: 2026-09-11
---

# Fixed contract inputs

These are local test fixtures, never production seed data or real kitchen evidence.
`manifest.json` records every case's source commit, fixed clock, entity format,
first expected failure layer, and SHA256 inventory. The manifest is test metadata,
not a business entity. Files retain the official schema shape: Ingredient/Dish
IDs come from filenames, and `Quantity`/`Money` retain their formal structures.

- `valid/golden/data/`: byte-exact copies of all 15 JSON files from
  `1fdaf7bf78264199ce87c80d20a4d37976cf05f2:data/` (14 entities plus translation lock).
  Original PO timestamps remain `2026-10-03T00:00:00.000Z`; test calculations use
  `2026-09-10T00:00:00.000Z`. Snapshot comparison explicitly ignores generatedAt.
- `valid/boundaries/data/`: authored synthetic v2 data against those schemas.
  Two dishes share tomato/salt; a second tomato ID has the same three names;
  salt is genuinely to-taste; oil lacks purchase; the second dish lacks
  baseServings; a third dish has only its name/status/provenance.
  Sample servings of 2 are explicit test inputs, not defaults for unknown values.
  Synthetic dishes use `provenance.source=example` and are excluded by production
  build logic. A future collector must consume raw components, not filtered build data.
- Other case roots contain whole-file overlays over the manifest's `base`.
  Use `materializeFixture(id, emptyTemporaryDirectory)` to assemble a full data
  root. Never point it at an existing repository/data directory.
- `golden-expectations.json`: independently hand-calculated numerical oracle;
  documented in `docs/field-test/team-meals/fixture-evidence.md`. This is test
  metadata, not a PO or a future ShoppingList.

```sh
npm --prefix packages/core run build
node scripts/validate-contract-fixtures.mjs
node --test scripts/validate-contract-fixtures.test.mjs
node scripts/build-data.mjs --root test/fixtures/contracts/valid/golden --check --compare-snapshots --at 2026-09-10T00:00:00.000Z
```

The fixture CLI exits 0 only when each case fails at its recorded first layer
(or is valid as expected). Expected failures are not accepted production data.
`--case ID` selects a single known case; the entire inventory is still verified.
Tests also protect the inventory, whole-file overlays, missing infrastructure,
sample boundary facts and the three arithmetic oracles. Node >=20, installed
workspace dependencies and Python 3 are required. Core build is required for the
arithmetic tests, not for the fixture CLI.

Format validation runs the unchanged `scripts/validate-schemas.mjs` in a temporary
root with current official schemas/dependencies. References call
`local-validate.py:check_references`; video/clip checks call
`validate_dish.py:contract_checks`. The Python subset schema/fallback is never
used. RC-A owns the upcoming reusable Ajv API; this temporary CLI adapter stays
entirely in the new file and will consume that API after its fixed commit arrives.

Asset checks cover referenced local file existence/nonzero size/200 KiB limit,
fixture path containment, license allowlist and required CC BY attribution.
Ajv covers ImageRef structure. Remote bytes, actual rights, decoding/dimensions,
video playback and truth of confidence declarations are not verified here.
Golden contains no ImageRef or image bytes: missing optional images are distinct
from a referenced file that is absent. Its example video URLs remain REVIEW,
not certified sources. Existing low-confidence/prep-image review notes survive.

`valid/local-image/.../pattern.png` is a synthetic 1×1 RGB red test pattern,
created for this suite and dedicated to CC0 by its fixture authors. It is not a
food photograph. Invalid image/clip URLs are deliberate placeholders and are
never fetched. No research POC media is copied into the numerical golden.

No MenuPlan/Dish v3, ShoppingList, future DOM, production test rewiring or CI
changes are included in this v2 checkpoint. A0/A1-dependent work is separate.
