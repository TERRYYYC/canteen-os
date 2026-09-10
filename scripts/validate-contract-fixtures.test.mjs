import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { CONTRACTS_ROOT, REPO_ROOT, main, materializeFixture, validateFixtureCase, validateFormatFixtures, verifyManifest } from "./validate-contract-fixtures.mjs";

const manifest = JSON.parse(readFileSync(new URL("../test/fixtures/contracts/manifest.json", import.meta.url)));

test("CLI runs the formal new-format samples without claiming semantic validation", () => {
  const output = [];
  assert.equal(main(["--formats"], line => output.push(line)), 0);
  assert.ok(output.some(line => line.includes("19/19 format expectations matched")));
  assert.ok(output.some(line => line.includes("semantic admission not executed")));
});

const formatManifest = JSON.parse(readFileSync(path.join(CONTRACTS_ROOT, "pending-a1/manifest.json")));
const formatResults = validateFormatFixtures();
for (const fixture of formatManifest.cases) {
  test(`formal A1 format: ${fixture.file}`, () => {
    const result = formatResults.find(r => r.file === fixture.file);
    assert.equal(result.matched, true, result.diagnostics.join("\n"));
    assert.equal(result.schema, fixture.expectedSchema);
    assert.equal(result.actualFormatValid, fixture.expectedFormatValid);
    assert.equal(result.actualFormatValid, fixture.actualFormatValid);
    assert.equal(result.actualFailureLayer, fixture.actualFailureLayer);
    assert.equal(result.semanticValidation, "not-executed");
  });
}

for (const fixture of manifest.cases) {
  test(`${fixture.id}: expected layer ${fixture.expectedFailureLayer}`, () => {
    const result = validateFixtureCase(fixture.id);
    assert.equal(result.actualFailureLayer, fixture.expectedFailureLayer);
    if (fixture.diagnosticIncludes) {
      assert.ok(result.diagnostics.join("\n").includes(fixture.diagnosticIncludes), result.diagnostics.join("\n"));
    }
  });
}

test("manifest verifies every fixed input byte and provenance record", () => {
  assert.equal(verifyManifest().cases.length, manifest.cases.length);
});

function temp(t) {
  const root = mkdtempSync(path.join(tmpdir(), "fixture-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("format negatives must fail at their intended field, not malformed JSON or an unrelated date", (t) => {
  const contractsRoot = temp(t);
  cpSync(CONTRACTS_ROOT, contractsRoot, { recursive: true });
  const file = path.join(contractsRoot, "pending-a1/invalid/zero-servings.json");
  const plan = JSON.parse(readFileSync(file));
  plan.meals[0].plannedServings = 1;
  plan.meals[0].date = "not-a-date";
  writeFileSync(file, JSON.stringify(plan));
  writeFileSync(path.join(contractsRoot, "pending-a1/invalid/null-servings.json"), "{");
  const results = validateFormatFixtures({ contractsRoot });
  assert.equal(results.find(r => r.file === "invalid/zero-servings.json").matched, false);
  const badJson = results.find(r => r.file === "invalid/null-servings.json");
  assert.equal(badJson.actualFailureLayer, "json");
  assert.equal(badJson.matched, false);
});

test("format fixtures cannot accidentally exercise a legacy schema", (t) => {
  const contractsRoot = temp(t);
  cpSync(CONTRACTS_ROOT, contractsRoot, { recursive: true });
  const file = path.join(contractsRoot, "pending-a1/valid/menu-plan-v3.json");
  const plan = JSON.parse(readFileSync(file));
  plan.schemaVersion = "2";
  writeFileSync(file, JSON.stringify(plan));
  assert.throws(() => validateFormatFixtures({ contractsRoot }), /Unexpected schema dispatch/);
});

test("format metadata and missing schemas fail as infrastructure, not expected invalid entities", (t) => {
  assert.throws(() => validateFormatFixtures({ repoRoot: temp(t) }), /ENOENT/);
  const contractsRoot = temp(t);
  cpSync(CONTRACTS_ROOT, contractsRoot, { recursive: true });
  const file = path.join(contractsRoot, "pending-a1/manifest.json");
  const manifest = JSON.parse(readFileSync(file));
  manifest.cases.find(c => !c.expectedFormatValid).kind = "typo";
  writeFileSync(file, JSON.stringify(manifest));
  assert.throws(() => validateFormatFixtures({ contractsRoot }), /Invalid format fixture metadata/);
});

test("editing a frozen ingredient is rejected as drift", (t) => {
  const root = temp(t);
  cpSync(CONTRACTS_ROOT, root, { recursive: true });
  const file = path.join(root, "valid/golden/data/ingredients/tomato.json");
  writeFileSync(file, readFileSync(file, "utf8") + "\n");
  assert.throws(() => verifyManifest(root), /hash mismatch.*tomato/);
});

test("unexpected input files cannot silently join the library", (t) => {
  const root = temp(t);
  cpSync(CONTRACTS_ROOT, root, { recursive: true });
  writeFileSync(path.join(root, "valid/golden/data/ingredients/extra.json"), "{}");
  assert.throws(() => verifyManifest(root), /inventory drift/);
});

test("unknown cases and missing validator infrastructure are errors, not expected invalid data", (t) => {
  assert.throws(() => validateFixtureCase("typo"), /Unknown fixture/);
  assert.throws(() => validateFixtureCase("v2-missing-servings", { repoRoot: temp(t) }), /ENOENT/);
});

test("fixture format validation consumes the shared API without copying the Ajv CLI", (t) => {
  const repoRoot = temp(t);
  cpSync(path.join(REPO_ROOT, "schemas"), path.join(repoRoot, "schemas"), { recursive: true });
  for (const file of ["scripts/local-validate.py", "skills/video-recipe-ingest/scripts/validate_dish.py"]) {
    mkdirSync(path.dirname(path.join(repoRoot, file)), { recursive: true });
    copyFileSync(path.join(REPO_ROOT, file), path.join(repoRoot, file));
  }
  // No validate-schemas.mjs CLI or node_modules in this test root.
  assert.equal(validateFixtureCase("boundaries", { repoRoot }).actualFailureLayer, "none");
  assert.equal(validateFixtureCase("invalid-date", { repoRoot }).actualFailureLayer, "schema");
});

test("whole-file overlays preserve unknown/missing fields without repairing them", (t) => {
  const root = temp(t);
  materializeFixture("unknown-qty", root);
  const dish = JSON.parse(readFileSync(path.join(root, "data/dishes/first-dish.json")));
  assert.equal(Object.hasOwn(dish.components[0], "qty"), false);
  assert.equal(dish.components[1].qty.unit, "to-taste");
  assert.throws(() => materializeFixture("golden", root), /must be empty/);
});

test("boundary inputs retain both same-name IDs, all six references, and unrecorded components", (t) => {
  const root = temp(t);
  materializeFixture("boundaries", root);
  const read = (p) => JSON.parse(readFileSync(path.join(root, "data", p)));
  assert.deepEqual(read("ingredients/tomato.json").name, read("ingredients/tomato-other.json").name);
  const first = read("dishes/first-dish.json"), second = read("dishes/second-dish.json");
  assert.deepEqual(first.components.map(c => c.ingredientRef), ["tomato", "salt", "cooking-oil"]);
  assert.deepEqual(second.components.map(c => c.ingredientRef), ["tomato", "salt", "tomato-other"]);
  assert.equal(Object.hasOwn(second, "baseServings"), false);
  assert.equal(Object.hasOwn(read("ingredients/cooking-oil.json"), "purchase"), false);
  assert.equal(Object.hasOwn(read("dishes/name-only.json"), "components"), false);
  // This checks sample facts, not the future collector or real recipe completeness.
});

test("missing optional media, referenced bytes, and unverified sources remain distinct", () => {
  const golden = validateFixtureCase("golden");
  assert.deepEqual(golden.assetCoverage, { imageRefs: 0, localImages: 0, remoteImagesUnverified: 0 });
  assert.ok(golden.review.some(r => r.includes("source-placeholder")));
  const local = validateFixtureCase("local-image");
  assert.equal(local.actualFailureLayer, "none");
  assert.equal(local.assetCoverage.localImages, 1);
  assert.equal(validateFixtureCase("missing-image").actualFailureLayer, "asset");
});

const expected = JSON.parse(readFileSync(new URL("../test/fixtures/contracts/golden-expectations.json", import.meta.url)));
for (const scenario of expected.scenarios) {
  test(`independent arithmetic oracle: ${scenario.id}`, async () => {
    const { expand, renderPurchaseOrders } = await import("../packages/core/dist/index.js");
    const root = path.join(CONTRACTS_ROOT, "valid/golden/data");
    const load = dir => Object.fromEntries(readdirSync(path.join(root, dir)).filter(f => f.endsWith(".json")).map(f => [f.slice(0, -5), JSON.parse(readFileSync(path.join(root, dir, f)))]));
    const ingredients = load("ingredients"), dishes = load("dishes");
    const original = readFileSync(path.join(root, "menu-plans/week-41.json"), "utf8");
    const plan = JSON.parse(original);
    plan.meals[0].plannedServings = scenario.firstMealServings;
    if (scenario.onlyFirstMeal) plan.meals = plan.meals.slice(0, 1);
    const input = JSON.stringify({ ingredients, dishes, plan });
    const result = expand(plan, dishes, ingredients);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.pending, []);
    assert.deepEqual(result.lines.map(l => l.ingredientRef).sort(), Object.keys(scenario.lines).sort());
    for (const { ingredientRef, line } of result.lines) {
      const e = scenario.lines[ingredientRef];
      assert.ok(Math.abs(line.trace.netNeed.value - e.net) < 1e-6, `${ingredientRef} net`);
      // Existing trace serialization rounds to 4 decimals; package counts remain exact.
      assert.ok(Math.abs(line.trace.grossNeed.value - e.gross) < 0.000051, `${ingredientRef} gross`);
      assert.equal(line.packs, e.packs);
      assert.deepEqual(line.qty, e.qty);
      assert.deepEqual(line.amount, { amount: e.amount, currency: "CNY" });
      assert.equal(line.trace.yieldApplied, ({ tomato: 0.85, scallion: 0.8 })[ingredientRef] ?? null);
      assert.equal(line.trace.marginApplied, 1.1);
      assert.equal(line.trace.minPacksApplied, ["salt", "cooking-oil"].includes(ingredientRef));
    }
    const orders = renderPurchaseOrders(result.lines, plan, { generatedAt: expected.fixedAt, menuPlanRef: "week-41" });
    assert.equal(orders.reduce((sum, po) => sum + po.totalAmount.amount, 0), scenario.totalCNY);
    assert.ok(orders.every(po => po.generatedAt === expected.fixedAt));
    assert.equal(JSON.stringify({ ingredients, dishes, plan }), input);
    assert.equal(readFileSync(path.join(root, "menu-plans/week-41.json"), "utf8"), original);
  });
}
