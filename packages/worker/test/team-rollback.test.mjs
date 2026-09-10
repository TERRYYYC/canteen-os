/** Team-meals rollback contract. L1 FakeRepo evidence only; no real repository writes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REPO, FakeRepo, WORKER, bearer, call, makeEnv } from "./helpers.mjs";

const worker = (await import(WORKER)).default;
const json = (value) => `${JSON.stringify(value)}\n`;
const plan = (version = "2", label = "old") => json({ schemaVersion: version, name: { zh: label }, meals: version === "3" ? [] : [{ date: "2026-10-19", mealType: "lunch", dishRef: "soup", plannedServings: 2 }] });
const dish = (version = "2", label = "old") => json({ ...(version === undefined ? {} : { schemaVersion: version }), name: { zh: label } });
const support = { "data/dishes/soup.json": dish(), "data/techniques.json": "[]\n" };
const rollback = (env, sha) => call(worker, env, "POST", `/rollback/${sha}`, { headers: bearer("admin") });

test("team rollback restores only allowed knowledge paths, keeping current lists and unknown paths byte-for-byte", async () => {
  const repo = new FakeRepo();
  const old = {
    "README.md": "old readme\n",
    "data/ingredients/tomato.json": json({ schemaVersion: "2", name: { zh: "old" }, baseUnit: "g", trackStock: false }),
    "data/ingredients/old.jpg": "old image bytes",
    "data/dishes/soup.json": dish(),
    "data/menu-plans/week.json": plan(),
    "data/techniques.json": "[]\n",
    "data/translations.lock.json": "{}\n",
    "data/shopping-lists/current.json": "old shopping bytes\n",
    "data/purchase-orders/current.json": "old purchase bytes\n",
    "data/snapshots/current.json": "old snapshot bytes\n",
    "data/notes.txt": "old notes\n",
    "data/ingredients-archive/note.json": "old archive\n",
    "data/shopping-lists/target-only.json": "must not restore\n",
  };
  const target = repo.commit(old, "old knowledge");
  const current = {
    ...old,
    "README.md": "current readme\n",
    "data/ingredients/tomato.json": json({ schemaVersion: "2", name: { zh: "current" }, baseUnit: "g", trackStock: false }),
    "data/dishes/soup.json": dish("2", "current"),
    "data/dishes/new.jpg": "new image bytes",
    "data/menu-plans/week.json": plan("2", "current"),
    "data/techniques.json": "[{}]\n",
    "data/translations.lock.json": '{"current":true}\n',
    "data/shopping-lists/current.json": "current shopping bytes\n",
    "data/shopping-lists/new.json": "new shopping bytes\n",
    "data/purchase-orders/current.json": "current purchase bytes\n",
    "data/snapshots/current.json": "current snapshot bytes\n",
    "data/notes.txt": "current notes\n",
    "data/ingredients-archive/note.json": "current archive\n",
  };
  delete current["data/ingredients/old.jpg"];
  delete current["data/shopping-lists/target-only.json"];
  const before = repo.commit(current, "current knowledge and decisions");
  const { env } = makeEnv(repo);
  const result = await rollback(env, target);
  assert.equal(result.status, 200);
  assert.equal(result.body.changedFiles, 7);
  assert.deepEqual(repo.commits.get(repo.head).parents, [before]);
  for (const path of ["data/ingredients/tomato.json", "data/ingredients/old.jpg", "data/dishes/soup.json", "data/menu-plans/week.json", "data/techniques.json", "data/translations.lock.json"]) {
    assert.equal(repo.fileText(path), old[path], path);
  }
  assert.equal(repo.fileText("data/dishes/new.jpg"), null);
  for (const path of ["README.md", "data/shopping-lists/current.json", "data/shopping-lists/new.json", "data/purchase-orders/current.json", "data/snapshots/current.json", "data/notes.txt", "data/ingredients-archive/note.json"]) {
    assert.equal(repo.fileText(path), current[path], path);
  }
  assert.equal(repo.fileText("data/shopping-lists/target-only.json"), null);
  assert.match(repo.commits.get(repo.head).message, /\[skip ci\]/);
  assert.equal(repo.dispatches.length, 0);
});

test("team rollback ignores protected-only differences without making a commit", async () => {
  const repo = new FakeRepo();
  const files = { "data/techniques.json": "[]\n", "data/shopping-lists/current.json": "old\n" };
  const target = repo.commit(files);
  const before = repo.commit({ ...files, "data/shopping-lists/current.json": "new\n" });
  const { env } = makeEnv(repo);
  const result = await rollback(env, target);
  assert.equal(result.status, 200);
  assert.equal(result.body.unchanged, true);
  assert.equal(result.body.changedFiles, 0);
  assert.equal(repo.head, before);
  assert.equal(repo.writeCalls().length, 0);
});

for (const [kind, encode] of [["menu-plans", plan], ["dishes", dish]]) {
  for (const older of ["2", "missing", ...(kind === "dishes" ? ["implicit-v2"] : [])]) {
    test(`team rollback rejects current v3 ${kind} to ${older}, with zero Git writes`, async () => {
      const repo = new FakeRepo();
      const path = `data/${kind}/current.json`;
      const old = { "data/techniques.json": "[]\n" };
      if (older !== "missing") old[path] = older === "implicit-v2" ? json({ name: { zh: "old" } }) : encode("2");
      const target = repo.commit(old);
      const before = repo.commit({ ...old, [path]: encode("3"), "data/shopping-lists/current.json": "purchased bytes\n" });
      const { env } = makeEnv(repo);
      const result = await rollback(env, target);
      assert.equal(result.status, 409);
      assert.equal(result.body.errors[0].code, "format_downgrade");
      assert.equal(repo.head, before);
      assert.equal(repo.fileText("data/shopping-lists/current.json"), "purchased bytes\n");
      assert.equal(repo.writeCalls().length, 0);
    });
  }
}

test("team rollback permits current v3 to historical v3 without changing list bytes", async () => {
  const repo = new FakeRepo();
  const path = "data/menu-plans/current.json";
  const target = repo.commit({ ...support, [path]: plan("3", "old") });
  repo.commit({ ...support, [path]: plan("3", "current"), "data/shopping-lists/current.json": "keep\n" });
  const { env } = makeEnv(repo);
  const result = await rollback(env, target);
  assert.equal(result.status, 200);
  assert.equal(repo.fileText(path), plan("3", "old"));
  assert.equal(repo.fileText("data/shopping-lists/current.json"), "keep\n");
});

test("team rollback re-reads current head after ref conflict and preserves the latest shopping bytes", async () => {
  const repo = new FakeRepo();
  const path = "data/menu-plans/current.json";
  const target = repo.commit({ ...support, [path]: plan("2", "old") });
  const current = { ...support, [path]: plan("2", "current"), "data/shopping-lists/current.json": "before purchase\n" };
  repo.commit(current);
  let attempts = 0;
  let concurrent;
  const { env } = makeEnv(repo, {
    __extraRoutes: {
      [`PATCH /repos/${REPO}/git/refs/heads/main`]: (_url, body) => {
        assert.equal(body.force, false);
        attempts += 1;
        if (attempts === 1) {
          concurrent = repo.commit({ ...current, "data/shopping-lists/current.json": "bought during rollback\n" });
          return new Response('{}', { status: 422 });
        }
        assert.deepEqual(repo.commits.get(body.sha).parents, [concurrent]);
        repo.head = body.sha;
        return new Response(JSON.stringify({ object: { sha: body.sha } }), { status: 200 });
      },
    },
  });
  const result = await rollback(env, target);
  assert.equal(result.status, 200);
  assert.equal(attempts, 2);
  assert.equal(repo.fileText(path), plan("2", "old"));
  assert.equal(repo.fileText("data/shopping-lists/current.json"), "bought during rollback\n");
});

test("team rollback rechecks v3 protection after a competing upgrade", async () => {
  const repo = new FakeRepo();
  const path = "data/menu-plans/current.json";
  const target = repo.commit({ ...support, [path]: plan("2", "old") });
  repo.commit({ ...support, [path]: plan("2", "current") });
  let concurrent;
  const { env } = makeEnv(repo, {
    __extraRoutes: {
      [`PATCH /repos/${REPO}/git/refs/heads/main`]: () => {
        concurrent = repo.commit({ ...support, [path]: plan("3", "upgraded"), "data/shopping-lists/current.json": "latest list\n" });
        return new Response('{}', { status: 422 });
      },
    },
  });
  const result = await rollback(env, target);
  assert.equal(result.status, 409);
  assert.equal(result.body.errors[0].code, "format_downgrade");
  assert.equal(repo.head, concurrent);
  assert.equal(repo.fileText(path), plan("3", "upgraded"));
  assert.equal(repo.fileText("data/shopping-lists/current.json"), "latest list\n");
  assert.equal(repo.calls.filter((entry) => entry.method === "POST" && entry.path === `/repos/${REPO}/git/trees`).length, 1);
});

test("team rollback fails closed when current protected JSON cannot reveal its version", async () => {
  const repo = new FakeRepo();
  const path = "data/menu-plans/current.json";
  const target = repo.commit({ [path]: plan() });
  const before = repo.commit({ [path]: "{bad JSON" });
  const { env } = makeEnv(repo);
  const result = await rollback(env, target);
  assert.equal(result.status, 422);
  assert.equal(result.body.errors[0].code, "invalid_source");
  assert.equal(repo.head, before);
  assert.equal(repo.writeCalls().length, 0);
});

test("team rollback cannot reuse a cached version to replace v3 JSON with a symlink", async () => {
  const repo = new FakeRepo();
  const path = "data/menu-plans/current.json";
  const target = repo.commit({ [path]: plan("3") });
  const targetTree = repo.commits.get(target).tree;
  const blob = repo.trees.get(targetTree).get(path);
  const before = repo.commit({ [path]: plan("3"), "data/shopping-lists/current.json": "keep\n" });
  const { env } = makeEnv(repo, {
    __extraRoutes: {
      [`GET /repos/${REPO}/git/trees/${targetTree}`]: () => new Response(JSON.stringify({
        tree: [{ path, sha: blob, mode: "120000", type: "blob" }], truncated: false,
      }), { status: 200 }),
    },
  });
  const result = await rollback(env, target);
  assert.equal(result.status, 422);
  assert.equal(result.body.errors[0].code, "invalid_source");
  assert.equal(repo.head, before);
  assert.equal(repo.writeCalls().length, 0);
});
