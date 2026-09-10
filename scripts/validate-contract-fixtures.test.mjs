import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { CONTRACTS_ROOT, materializeFixture, validateFixtureCase, verifyManifest } from "./validate-contract-fixtures.mjs";

const manifest = JSON.parse(readFileSync(new URL("../test/fixtures/contracts/manifest.json", import.meta.url)));

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
