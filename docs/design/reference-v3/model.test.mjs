import test from "node:test";
import assert from "node:assert/strict";
import {
  procurement,
  initialPlan,
  ingredients,
  dishes,
  readDraft,
} from "./model.mjs";
test("day plan hand calculation: 16kg / .9 × 1.1 = 19.5556kg => 10 × 2kg", () => {
  const r = procurement(initialPlan().filter((p) => p.date === "2026-09-10"));
  const c = r.lines.find((l) => l.id === "chicken");
  assert.equal(c.net, 16000);
  assert.equal(c.packs, 10);
  assert.equal(c.quantity, 20000);
  assert.equal(c.amount, 3400);
  assert.equal(r.lines.find((l) => l.id === "butter").packs, 5); // (2.6kg × 1.1 − .5kg) /.5kg = 4.72 => 5
  assert.equal(r.lines.find((l) => l.id === "oil").packs, 0); // .6L ×1.1 < 2L stock
  // 3400 chicken + 725 butter + 130 crumbs + 1200 broccoli + 300 carrots + 900 tomatoes.
  assert.equal(r.total, 6655);
});
test("10 more chicken portions: one extra meat pack + one butter pack => 7140 UAH", () => {
  const plan = initialPlan().filter((p) => p.date === "2026-09-10");
  plan[0].servings += 10;
  const r = procurement(plan);
  assert.equal(r.lines.find((l) => l.id === "chicken").packs, 11);
  assert.equal(r.lines.find((l) => l.id === "butter").packs, 6);
  assert.equal(r.total, 7140);
});
test("zero portions does not trigger minimum pack purchase", () => {
  const r = procurement(initialPlan().map((p) => ({ ...p, servings: 0 })));
  assert.equal(r.total, 0);
  assert.ok(r.lines.every((l) => l.packs === 0));
});
test("missing purchase specs stay pending and cannot create guessed totals", () => {
  const stock = {
    ...ingredients,
    chicken: { ...ingredients.chicken, purchase: undefined },
  };
  const r = procurement(initialPlan().slice(0, 1), dishes, stock);
  assert.equal(r.pending.length, 1);
  assert.ok(!r.lines.some((l) => l.id === "chicken"));
});
test("draft dishes are not procurement-ready", () => {
  const r = procurement(
    [{ dishRef: "kyiv", servings: 80, date: "2026-09-10", meal: "lunch" }],
    [{ ...dishes[0], draft: true }],
  );
  assert.equal(r.lines.length, 0);
  assert.equal(r.pending.length, 1);
});
test("minimal valid v2 import stays draft and preserves missing translations", () => {
  const d = readDraft(
    JSON.stringify({ schemaVersion: "2", name: { zh: "新菜" } }),
  );
  assert.equal(d.name.zh, "新菜");
  assert.equal(d.name.en, "");
  assert.equal(d.draft, true);
});
test("v2 recipe import preserves translated cooking steps", () => {
  const steps = [
    {
      n: 1,
      text: { zh: "洗净番茄", en: "Wash tomatoes", uk: "Помийте помідори" },
    },
  ];
  const d = readDraft(
    JSON.stringify({ schemaVersion: "2", name: { zh: "新菜" }, steps }),
  );
  assert.deepEqual(d.steps, [steps[0].text]);
});
test("v2 to-taste without a value and pack units are supported", () => {
  const source = {
    schemaVersion: "2",
    name: { en: "Demo" },
    components: [
      { ingredientRef: "salt", qty: { unit: "to-taste" } },
      { ingredientRef: "butter", qty: { value: 1, unit: "pack" } },
    ],
    provenance: { source: "example" },
  };
  const d = readDraft(JSON.stringify(source));
  assert.equal(d.components.length, 2);
  assert.deepEqual(d.sourceDocument, source);
});
test("reject malformed or markup quantities before rendering imported data", () => {
  for (const components of [
    [null],
    [
      {
        ingredientRef: "chicken",
        qty: { value: "<img src=x onerror=alert(1)>", unit: "g" },
      },
    ],
    [{ ingredientRef: "chicken", qty: { value: -1, unit: "g" } }],
  ]) {
    assert.throws(() =>
      readDraft(
        JSON.stringify({ schemaVersion: "2", name: { zh: "菜" }, components }),
      ),
    );
  }
  assert.throws(() =>
    readDraft(
      JSON.stringify({ schemaVersion: "2", name: { zh: 123, en: "Dish" } }),
    ),
  );
  assert.throws(() =>
    readDraft(
      JSON.stringify({
        schemaVersion: "2",
        name: { zh: "菜" },
        baseServings: -2,
      }),
    ),
  );
});
