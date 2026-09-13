import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { CONTRACTS_ROOT, REPO_ROOT, main, materializeFixture, validateFixtureCase, validateFormatFixtures, verifyManifest } from "./validate-contract-fixtures.mjs";
import { createSchemaValidators } from "./validate-schemas.mjs";

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

// Q acceptance consumes official core with frozen inputs; it implements no domain algorithm.
const semantic = JSON.parse(readFileSync(path.join(CONTRACTS_ROOT, "semantic-expectations.json")));
const prepared = file => JSON.parse(readFileSync(path.join(CONTRACTS_ROOT, "pending-a1", file)));
const originalBasis = prepared("valid/shopping-list-v1.json").basis;
const schemaAPI = createSchemaValidators();
function assertFormat(kind, value) {
  const result = schemaAPI.validateEntity(kind, value);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
}
function assertInputFormats(inputs) {
  for (const [group, kind] of [["menuPlans", "plan"], ["dishes", "dish"], ["ingredients", "ingredient"]]) {
    for (const value of Object.values(inputs[group])) assertFormat(kind, value);
  }
  assertFormat("techniques", inputs.techniques);
}
function semanticInputs(t, id = "boundaries", a1 = false) {
  const root = temp(t);
  materializeFixture(id, root);
  const data = path.join(root, "data");
  const load = dir => Object.fromEntries(readdirSync(path.join(data, dir)).filter(f => f.endsWith(".json"))
    .map(f => [f.slice(0, -5), JSON.parse(readFileSync(path.join(data, dir, f)))]));
  const inputs = { menuPlans: load("menu-plans"), dishes: load("dishes"), ingredients: load("ingredients"),
    techniques: JSON.parse(readFileSync(path.join(data, "techniques.json"))) };
  if (a1) {
    inputs.menuPlans["team-week"] = prepared("valid/menu-plan-v3.json");
    inputs.dishes["second-dish"] = prepared("valid/dish-v3.json");
  }
  assertInputFormats(inputs);
  return inputs;
}
const coreAPI = () => import("../packages/core/dist/index.js");
const semanticTitle = id => `${id}: ${semantic.cases.find(c => c.id === id).purpose}`;
const ids = collection => collection.items.map(i => i.ingredientRef);
const item = (list, id) => list.items.find(i => i.ingredientRef === id);
const coverage = (enumeration, references) => ({ enumeration, references, recipeCompleteness: "unverified" });
const basisAt = (token, selection = originalBasis.selection) => ({ sourceRevision: semantic.revisionTokens[token], selection: structuredClone(selection) });
function decided(core, inputs) {
  let list = core.createShoppingList("team-shop", originalBasis, inputs);
  assert.deepEqual(list, prepared("valid/shopping-list-v1.json"));
  for (const [id, decision, bought] of [["cooking-oil", "buy", true], ["salt", "available"], ["tomato", "buy", true]]) {
    list = core.applyShoppingDecision(list, id, decision, bought);
    assertFormat("shopping-list", list);
  }
  return list;
}

test(semanticTitle("A2-S01"), async t => {
  const core = await coreAPI(), inputs = semanticInputs(t, "boundaries", true);
  const before = JSON.stringify(inputs);
  const result = core.collectIngredientReferences(inputs, originalBasis.selection);
  assert.deepEqual(ids(result), semantic.baseCandidateIds);
  assert.deepEqual(result.coverage, coverage("complete", "resolved"));
  for (const candidate of result.items) {
    assert.deepEqual(candidate.sources.map(s => [s.dishRef, s.mealIndex, s.componentIndex]), semantic.sourceAddresses[candidate.ingredientRef]);
    for (const source of candidate.sources) {
      assert.equal(source.menuPlanRef, "team-week");
      assert.equal(source.date, "2026-09-14");
      assert.equal(source.mealType, "lunch");
      assert.equal(Object.hasOwn(source, "plannedServings"), false);
    }
  }
  assert.equal(Object.hasOwn(item(result, "tomato").sources[1], "qty"), false);
  assert.equal(Object.hasOwn(item(result, "tomato").sources[1], "baseServings"), false);
  assert.ok(item(result, "salt").sources.every(s => s.qty.unit === "to-taste"));
  assert.deepEqual(inputs.ingredients.tomato.name, inputs.ingredients["tomato-other"].name);
  assert.deepEqual(core.collectIngredientReferences(inputs, [...originalBasis.selection, ...originalBasis.selection]), result);
  assert.equal(JSON.stringify(inputs), before);
  const repeated = structuredClone(inputs);
  repeated.dishes["first-dish"].components.push(structuredClone(repeated.dishes["first-dish"].components[1]));
  repeated.menuPlans["team-week"].meals.push(structuredClone(repeated.menuPlans["team-week"].meals[0]));
  assertInputFormats(repeated);
  const duplicates = core.collectIngredientReferences(repeated, originalBasis.selection);
  assert.deepEqual(Object.fromEntries(duplicates.items.map(i => [i.ingredientRef, i.sources.length])), semantic.repeatedSourceCounts);
  assert.deepEqual(item(duplicates, "salt").sources.map(s => [s.mealIndex, s.componentIndex]), [[0, 1], [0, 3], [1, 1], [3, 1], [3, 3]]);
});

test(semanticTitle("A2-S02"), async t => {
  const core = await coreAPI();
  for (const [fixture, enumeration, candidates, issue] of [
    ["missing-dish", "incomplete", ["salt", "tomato", "tomato-other"], { code: "missing-dish", dishRef: "missing-dish", mealIndex: 0 }],
    ["missing-ingredient", "complete", ["cooking-oil", "missing-ingredient", "salt", "tomato", "tomato-other"], { code: "missing-ingredient", ingredientRef: "missing-ingredient", mealIndex: 0, componentIndex: 0 }],
    ["missing-technique", "complete", semantic.baseCandidateIds, { code: "missing-technique", techniqueRef: "missing-technique", mealIndex: 0, componentIndex: 0 }],
  ]) {
    const inputs = semanticInputs(t, fixture), before = JSON.stringify(inputs);
    const result = core.collectIngredientReferences(inputs, originalBasis.selection);
    assert.deepEqual(ids(result), candidates);
    assert.deepEqual(result.coverage, coverage(enumeration, "unresolved"));
    assert.ok(result.issues.some(actual => Object.entries(issue).every(([key, value]) => actual[key] === value)));
    const list = core.createShoppingList("team-shop", originalBasis, inputs);
    assert.deepEqual(ids(list), candidates);
    assert.ok(list.items.every(i => i.decision === "check"));
    assertFormat("shopping-list", list);
    assert.equal(JSON.stringify(inputs), before);
  }
  const inputs = semanticInputs(t, "boundaries", true);
  const dinner = { menuPlanRef: "team-week", date: "2026-09-15", mealType: "dinner" };
  const opaque = core.collectIngredientReferences(inputs, [...originalBasis.selection, dinner]);
  assert.deepEqual(ids(opaque), semantic.baseCandidateIds);
  assert.deepEqual(opaque.coverage, coverage("incomplete", "resolved"));
  assert.ok(opaque.issues.some(i => i.code === "components-unrecorded" && i.dishRef === "name-only" && i.mealIndex === 2));
  const unknown = [{ ...dinner, menuPlanRef: "absent-plan" }];
  assert.deepEqual(core.collectIngredientReferences(inputs, unknown).coverage, coverage("incomplete", "unresolved"));
  assert.throws(() => core.createShoppingList("team-shop", basisAt("a", unknown), inputs), { code: "basis_unavailable" });
  const empty = core.collectIngredientReferences(inputs, [{ ...dinner, mealType: "lunch" }]);
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.coverage, coverage("complete", "resolved"));
});

test(semanticTitle("A2-S03"), async t => {
  const core = await coreAPI(), inputs = semanticInputs(t, "boundaries", true);
  const omitted = prepared("valid/shopping-list-v1.json");
  omitted.items.pop();
  const extra = prepared("valid/shopping-list-v1.json");
  extra.items.push({ ingredientRef: "not-a-candidate", decision: "check" });
  for (const list of [prepared("semantic/duplicate-ingredient.json"), omitted, extra]) {
    assertFormat("shopping-list", list);
    const before = JSON.stringify(list);
    assert.throws(() => core.reconcileShoppingList(list, inputs, originalBasis, inputs), { code: "invalid_selection" });
    assert.equal(JSON.stringify(list), before);
  }
});

test(semanticTitle("A2-S04"), async t => {
  const core = await coreAPI(), inputs = semanticInputs(t, "boundaries", true);
  const originalInputs = JSON.stringify(inputs), list = decided(core, inputs), originalList = JSON.stringify(list);
  const changed = structuredClone(inputs);
  changed.dishes["first-dish"].components[0].qty.value = 301; // Explicit demand change: 300 g -> 301 g.
  assertInputFormats(changed);
  const next = core.reconcileShoppingList(list, inputs, basisAt("b"), changed);
  assert.deepEqual(next.reviewRequired, ["tomato"]);
  assert.deepEqual(next.retained, ["cooking-oil", "salt", "tomato-other"]);
  assert.deepEqual(next.added, []);
  assert.deepEqual(next.removed, []);
  assert.deepEqual(next.list.items, prepared("valid/shopping-decisions-v1.json").items);
  assert.deepEqual(next.list.basis, basisAt("b"));
  assertFormat("shopping-list", next.list);
  const same = core.reconcileShoppingList(next.list, changed, basisAt("b"), changed);
  assert.deepEqual(same.list, next.list);
  assert.deepEqual(same.reviewRequired, []);
  const display = structuredClone(changed);
  display.menuPlans["team-week"].meals.reverse();
  for (const dish of Object.values(display.dishes)) { dish.name.uk = "Оновлена назва"; dish.components?.reverse(); }
  display.ingredients.tomato.purchase.lastPrice.amount = 99;
  display.ingredients.tomato.onHand = 999;
  assertInputFormats(display);
  const retained = core.reconcileShoppingList(next.list, changed, basisAt("c"), display);
  assert.deepEqual(retained.list.items, next.list.items);
  assert.deepEqual(retained.reviewRequired, []);
  const checked = core.applyShoppingDecision(retained.list, "tomato", "check");
  assert.equal(Object.hasOwn(item(checked, "tomato"), "previous"), false);
  assert.equal(item(retained.list, "tomato").previous.bought, true);
  assert.throws(() => core.applyShoppingDecision(checked, "salt", "available", false), { code: "invalid_decision" });
  assertFormat("shopping-list", checked);
  assert.equal(JSON.stringify(inputs), originalInputs);
  assert.equal(JSON.stringify(list), originalList);
});

test(semanticTitle("A2-S05"), async t => {
  const core = await coreAPI(), inputs = semanticInputs(t, "boundaries", true), list = decided(core, inputs);
  const scope = [...originalBasis.selection, { menuPlanRef: "team-week", date: "2026-09-15", mealType: "lunch" }];
  const first = core.reconcileShoppingList(list, inputs, basisAt("b", scope), inputs);
  assert.deepEqual(first.reviewRequired, semantic.baseCandidateIds);
  assert.ok(first.list.items.every(i => i.decision === "check" && !Object.hasOwn(i, "bought")));
  assert.deepEqual(item(first.list, "cooking-oil").previous, { basis: originalBasis, decision: "buy", bought: true });
  const widened = [...scope, { menuPlanRef: "team-week", date: "2026-09-14", mealType: "dinner" }];
  const again = core.reconcileShoppingList(first.list, inputs, basisAt("c", widened), inputs);
  assert.deepEqual(again.list.items, first.list.items);
  assertFormat("shopping-list", again.list);
  const empty = structuredClone(inputs);
  empty.menuPlans["team-week"] = prepared("valid/empty-menu-plan-v3.json");
  assertInputFormats(empty);
  assert.deepEqual(core.createShoppingList("team-shop", originalBasis, empty), prepared("valid/empty-shopping-list-v1.json"));
  const cancelled = core.reconcileShoppingList(list, inputs, basisAt("b"), empty);
  assert.deepEqual(cancelled.list.items, []);
  assert.deepEqual(cancelled.removed, list.items);
  assert.equal(item({ items: cancelled.removed }, "cooking-oil").bought, true);
  assertFormat("shopping-list", cancelled.list);
  const restored = core.reconcileShoppingList(cancelled.list, empty, basisAt("c"), inputs);
  assert.deepEqual(restored.added, semantic.baseCandidateIds);
  assert.deepEqual(restored.list.items, prepared("valid/shopping-list-v1.json").items);
  assertFormat("shopping-list", restored.list);
  const estimate = core.estimateShoppingList(empty, originalBasis.selection, semantic.fixedAt);
  assert.deepEqual(estimate, { items: [], budgetStatus: "not-applicable" });
});

test(semanticTitle("A2-S06"), async t => {
  const core = await coreAPI();
  for (const scenario of expected.scenarios) {
    const inputs = semanticInputs(t, "golden"), plan = inputs.menuPlans["week-41"];
    plan.meals[0].plannedServings = scenario.firstMealServings;
    if (scenario.onlyFirstMeal) plan.meals = plan.meals.slice(0, 1);
    assertInputFormats(inputs);
    const selection = plan.meals.map(m => ({ menuPlanRef: "week-41", date: m.date, mealType: m.mealType }));
    const before = JSON.stringify(inputs), estimates = core.estimateShoppingList(inputs, selection, semantic.fixedAt);
    assert.equal(estimates.budgetStatus, "complete");
    assert.deepEqual(ids(estimates), ["cooking-oil", "egg", "salt", "scallion", "tomato"]);
    assert.ok(estimates.items.every(i => i.status === "complete"));
    const lines = estimates.items.flatMap(i => i.lines);
    assert.deepEqual(lines.map(l => l.ingredientRef).sort(), Object.keys(scenario.lines).sort());
    for (const { ingredientRef, line } of lines) {
      const oracle = scenario.lines[ingredientRef];
      assert.equal(line.packs, oracle.packs);
      assert.deepEqual(line.qty, oracle.qty);
      assert.deepEqual(line.amount, { amount: oracle.amount, currency: "CNY" });
      assert.ok(Math.abs(line.trace.netNeed.value - oracle.net) < 1e-6);
      assert.ok(Math.abs(line.trace.grossNeed.value - oracle.gross) < 0.000051);
    }
    assert.equal(lines.reduce((sum, l) => sum + l.line.amount.amount, 0), scenario.totalCNY);
    if (scenario.onlyFirstMeal) assert.deepEqual(item(estimates, "salt").lines, []);
    const list = core.createShoppingList("golden-local", basisAt("a", selection), inputs);
    assert.equal(item(list, "salt").decision, "check");
    assertFormat("shopping-list", list);
    assert.equal(JSON.stringify(inputs), before);
  }
});

test(semanticTitle("A2-S07"), async t => {
  const core = await coreAPI(), inputs = semanticInputs(t);
  inputs.dishes["second-dish"] = prepared("valid/dish-v3.json");
  assertInputFormats(inputs);
  const before = JSON.stringify(inputs), result = core.estimateShoppingList(inputs, originalBasis.selection, semantic.fixedAt);
  assert.deepEqual(ids(result), semantic.baseCandidateIds);
  assert.equal(result.budgetStatus, "incomplete");
  assert.ok(result.items.every(i => i.status === "unavailable" && !Object.hasOwn(i, "lines")));
  assert.ok(item(result, "tomato").reasons.some(r => r.code === "missing-qty" && r.source.mealIndex === 1 && r.source.componentIndex === 0));
  assert.ok(item(result, "salt").reasons.some(r => r.code === "to-taste"));
  assert.ok(item(result, "cooking-oil").reasons.some(r => r.code === "missing-purchase"));
  const scopes = [...originalBasis.selection, { menuPlanRef: "team-week", date: "2026-09-15", mealType: "dinner" }];
  const opaque = core.estimateShoppingList(inputs, scopes, semantic.fixedAt);
  assert.ok(opaque.items.every(i => i.status === "unavailable" && !Object.hasOwn(i, "lines") && i.reasons.some(r => r.code === "components-unrecorded")));
  const missing = semanticInputs(t, "missing-dish");
  assert.ok(core.estimateShoppingList(missing, originalBasis.selection, semantic.fixedAt).items.every(i => i.status === "unavailable" && i.reasons.some(r => r.code === "missing-dish")));
  const withoutServings = semanticInputs(t, "boundaries", true);
  assert.ok(core.estimateShoppingList(withoutServings, originalBasis.selection, semantic.fixedAt).items.every(i => i.status === "unavailable" && i.reasons.some(r => r.code === "missing-planned-servings")));
  assert.equal(JSON.stringify(inputs), before);
});

test(semanticTitle("A2-S08"), async t => {
  const core = await coreAPI(), inputs = semanticInputs(t, "golden");
  const plan = inputs.menuPlans["week-41"], selection = plan.meals.map(m => ({ menuPlanRef: "week-41", date: m.date, mealType: m.mealType }));
  const before = JSON.stringify(inputs), projection = core.projectTeamMeals(inputs, basisAt("a", selection));
  assert.equal(projection.sourceRevision, semantic.revisionTokens.a);
  assert.deepEqual(projection.menuPlans["week-41"], plan);
  assert.deepEqual(projection.dishes["tomato-egg-stir-fry"], inputs.dishes["tomato-egg-stir-fry"]);
  assert.deepEqual(projection.techniques.map(t => t.id).sort(), ["minced", "roll-cut-chunks", "stir-fry"]);
  for (const technique of projection.techniques) assert.deepEqual(technique, inputs.techniques.find(t => t.id === technique.id));
  for (const id of ["tomato", "egg", "salt", "scallion", "cooking-oil"]) assert.deepEqual(projection.ingredients[id], inputs.ingredients[id]);
  assert.ok(projection.dishes["tomato-egg-stir-fry"].steps.every(s => s.clip));
  projection.dishes["tomato-egg-stir-fry"].steps[0].clip.start = 999;
  assert.equal(JSON.stringify(inputs), before);
  const imageInputs = semanticInputs(t, "local-image"), imageBefore = JSON.stringify(imageInputs);
  const imageProjection = core.projectTeamMeals(imageInputs, originalBasis);
  assert.deepEqual(imageProjection.ingredients.tomato.image, imageInputs.ingredients.tomato.image);
  imageProjection.ingredients.tomato.image.src = "edited.jpg";
  assert.equal(JSON.stringify(imageInputs), imageBefore);
});
