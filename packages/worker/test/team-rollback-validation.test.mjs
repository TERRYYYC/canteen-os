/** B2 rollback JSON/reference validation. L1 FakeRepo; no real GitHub writes. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REPO, FakeRepo, WORKER, bearer, call, makeEnv } from "./helpers.mjs";
import { PNG_A, PNG_B } from "./image-fixtures.mjs";

const worker = (await import(WORKER)).default;
const json = (value) => `${JSON.stringify(value)}\n`;
const paths = {
  plan: "data/menu-plans/team.json",
  dish: "data/dishes/soup.json",
  ingredient: "data/ingredients/salt.json",
  techniques: "data/techniques.json",
  translations: "data/translations.lock.json",
};
const plan = () => ({ schemaVersion: "2", meals: [{ date: "2026-10-19", mealType: "lunch", dishRef: "soup", plannedServings: 2 }] });
const dish = () => ({ schemaVersion: "2", name: { zh: "汤" }, components: [{ ingredientRef: "salt", qty: { value: 1, unit: "g" }, prep: { techniqueRef: "mix" } }], steps: [{ text: { zh: "拌" }, techniqueRef: "mix" }] });
const knowledge = () => ({
  [paths.plan]: json(plan()),
  [paths.dish]: json(dish()),
  [paths.ingredient]: json({ schemaVersion: "2", name: { zh: "盐" }, baseUnit: "g", trackStock: false }),
  [paths.techniques]: json([{ id: "mix", kind: "pretreat", name: { zh: "拌" } }]),
  [paths.translations]: json({ entry: { status: "human", stale: false } }),
});
const rollback = (env, revision) => call(worker, env, "POST", `/rollback/${revision}`, { headers: bearer("admin") });
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });

async function rejectsCandidate(files, errorPath, { unchanged = false } = {}) {
  const repo = new FakeRepo();
  const target = repo.commit(files, "historical candidate");
  const current = unchanged ? files : knowledge();
  const before = repo.commit({ ...current, "data/shopping-lists/keep.json": "not JSON; preserve bytes\n" }, "current");
  const { env } = makeEnv(repo);
  const result = await rollback(env, target);
  assert.equal(result.status, 422);
  assert.equal(result.body.errors[0].code, "invalid_source");
  assert.equal(result.body.errors[0].path, errorPath);
  assert.equal(repo.head, before);
  assert.equal(repo.fileText("data/shopping-lists/keep.json"), "not JSON; preserve bytes\n");
  assert.equal(repo.writeCalls().length, 0);
}

for (const kind of ["plan", "dish", "ingredient", "techniques", "translations"]) {
  test(`B2 rollback rejects bad JSON in candidate ${kind}`, async () => {
    await rejectsCandidate({ ...knowledge(), [paths[kind]]: "{ broken" }, paths[kind]);
  });
}

for (const [label, path, value, pointer] of [
  ["v2 empty plan", paths.plan, { schemaVersion: "2", meals: [] }, "/meals"],
  ["v3 impossible date", paths.plan, { schemaVersion: "3", meals: [{ date: "2026-02-30", mealType: "lunch", dishRef: "soup" }] }, "/meals/0/date"],
  ["v3 range relation", paths.plan, { schemaVersion: "3", dateRange: { start: "2026-10-20", end: "2026-10-21" }, meals: [{ date: "2026-10-19", mealType: "lunch", dishRef: "soup" }] }, "/meals/0/date"],
  ["unknown dish version", paths.dish, { ...dish(), schemaVersion: "4" }, "/schemaVersion"],
  ["v2 dish missing qty", paths.dish, { ...dish(), components: [{ ingredientRef: "salt" }] }, "/components/0/qty"],
  ["ingredient required fields", paths.ingredient, { schemaVersion: "2", name: { zh: "盐" } }, "/baseUnit"],
  ["technique item", paths.techniques, [{ id: "mix", name: { zh: "拌" } }], "/0/kind"],
  ["translation status", paths.translations, { entry: { status: "guessed" } }, "/entry/status"],
  ["translation stale", paths.translations, { "a/b~c": { status: "human", stale: 1 } }, "/a~1b~0c/stale"],
  ["additional property", paths.dish, { ...dish(), "a/b~c": true }, "/a~1b~0c"],
]) {
  test(`B2 rollback rejects candidate schema failure: ${label}`, async () => {
    await rejectsCandidate({ ...knowledge(), [path]: json(value) }, `${path}#${pointer}`);
  });
}

test("B2 rollback validates unchanged invalid candidate files, including a no-op rollback", async () => {
  await rejectsCandidate({ ...knowledge(), [paths.ingredient]: "null\n" }, `${paths.ingredient}#`, { unchanged: true });
});

test("B2 rollback requires the techniques file even when no dish references it", async () => {
  const files = knowledge();
  files[paths.dish] = json({ name: { zh: "汤" } });
  delete files[paths.techniques];
  await rejectsCandidate(files, paths.techniques);
});

for (const [label, missing, referringPath, pointer] of [
  ["plan dish", paths.dish, paths.plan, "/meals/0/dishRef"],
  ["component ingredient", paths.ingredient, paths.dish, "/components/0/ingredientRef"],
]) {
  test(`B2 rollback rejects dangling ${label} using the candidate, not current HEAD`, async () => {
    const files = knowledge();
    delete files[missing];
    await rejectsCandidate(files, `${referringPath}#${pointer}`);
  });
}

for (const field of ["prep", "steps"]) {
  test(`B2 rollback rejects dangling ${field} technique references`, async () => {
    const value = dish();
    if (field === "prep") value.components[0].prep.techniqueRef = "missing";
    else value.steps[0].techniqueRef = "missing";
    await rejectsCandidate({ ...knowledge(), [paths.dish]: json(value) }, `${paths.dish}#${field === "prep" ? "/components/0/prep/techniqueRef" : "/steps/0/techniqueRef"}`);
  });
}

test("B2 rollback keeps v3 downgrade rejection ahead of candidate schema and reference errors", async () => {
  const repo = new FakeRepo();
  const target = repo.commit({ [paths.plan]: json({ schemaVersion: "2", meals: [] }) });
  const before = repo.commit({ ...knowledge(), [paths.plan]: json({ schemaVersion: "3", meals: [] }) });
  const { env } = makeEnv(repo);
  const result = await rollback(env, target);
  assert.equal(result.status, 409);
  assert.equal(result.body.errors[0].code, "format_downgrade");
  assert.equal(result.body.errors[0].path, paths.plan);
  assert.equal(repo.head, before);
  assert.equal(repo.writeCalls().length, 0);
});

for (const [path, type, mode] of [
  ["data/dishes/submodule", "commit", "160000"],
  ["data/ingredients", "commit", "160000"],
  ["data/menu-plans/folder.json", "tree", "040000"],
  ["data/ingredients/salt.jpg", "blob", "120000"],
]) {
  test(`B2 rollback rejects non-regular knowledge entry ${type} at ${path}`, async () => {
    const repo = new FakeRepo();
    const target = repo.commit(knowledge());
    const targetTree = repo.commits.get(target).tree;
    const entries = [...repo.trees.get(targetTree)].map(([path, sha]) => ({ path, sha, type: "blob", mode: "100644" }));
    const before = repo.commit({ ...knowledge(), "data/shopping-lists/keep.json": "keep" });
    const { env } = makeEnv(repo, {
      __extraRoutes: {
        [`GET /repos/${REPO}/git/trees/${targetTree}`]: () => response({ tree: [...entries, { path, type, mode, sha: "a".repeat(40) }], truncated: false }),
      },
    });
    const result = await rollback(env, target);
    assert.equal(result.status, 422);
    assert.equal(result.body.errors[0].code, "invalid_source");
    assert.equal(result.body.errors[0].path, path);
    assert.equal(repo.head, before);
    assert.equal(repo.writeCalls().length, 0);
  });
}

test("B2 rollback accepts empty v3 plan and unknown v3 qty while preserving non-knowledge bytes", async () => {
  const repo = new FakeRepo();
  const files = { ...knowledge(), [paths.plan]: json({ schemaVersion: "3", meals: [] }), [paths.dish]: json({ schemaVersion: "3", name: { zh: "汤" }, components: [{ ingredientRef: "salt" }] }) };
  const target = repo.commit(files);
  const keep = { "data/shopping-lists/keep.json": "{not json", "data/purchase-orders/keep.json": "null", "data/future/keep.json": "unknown bytes" };
  repo.commit({ ...files, [paths.plan]: json({ schemaVersion: "3", name: { zh: "changed" }, meals: [] }), ...keep });
  const { env } = makeEnv(repo);
  const result = await rollback(env, target);
  assert.equal(result.status, 200);
  assert.equal(result.body.changedFiles, 1);
  assert.equal(repo.fileText(paths.plan), files[paths.plan]);
  assert.equal(repo.fileText(paths.dish), files[paths.dish]);
  for (const [path, bytes] of Object.entries(keep)) assert.equal(repo.fileText(path), bytes);
});

test("B2 rollback revalidates all candidate sources after a competing list write", async () => {
  const repo = new FakeRepo();
  const files = knowledge();
  const target = repo.commit(files);
  const targetTree = repo.commits.get(target).tree;
  const techniqueBlob = repo.trees.get(targetTree).get(paths.techniques);
  const current = { ...files, [paths.ingredient]: json({ schemaVersion: "2", name: { zh: "changed" }, baseUnit: "g", trackStock: false }) };
  repo.commit(current);
  let attempts = 0;
  const { env } = makeEnv(repo, {
    __extraRoutes: {
      [`PATCH /repos/${REPO}/git/refs/heads/main`]: (_url, body) => {
        attempts += 1;
        if (attempts === 1) {
          repo.commit({ ...current, "data/shopping-lists/keep.json": "latest bought bytes" });
          return response({}, 422);
        }
        assert.deepEqual(repo.commits.get(body.sha).parents, [repo.head]);
        repo.head = body.sha;
        return response({ object: { sha: body.sha } });
      },
    },
  });
  const result = await rollback(env, target);
  assert.equal(result.status, 200);
  assert.equal(attempts, 2);
  assert.equal(repo.calls.filter((entry) => entry.method === "GET" && entry.path === `/repos/${REPO}/git/blobs/${techniqueBlob}`).length, 2);
  assert.equal(repo.fileText("data/shopping-lists/keep.json"), "latest bought bytes");
});

function withImage(files, owner, pointer, src) {
  const value = JSON.parse(files[owner]);
  const segments = pointer.slice(1).split("/");
  let parent = value;
  for (const segment of segments.slice(0, -1)) parent = parent[segment];
  parent[segments.at(-1)] = { src, license: "CC0" };
  return { ...files, [owner]: json(value) };
}

for (const [owner, pointer] of [[paths.dish, "/image"], [paths.ingredient, "/image"], [paths.dish, "/components/0/prep/image"], [paths.dish, "/steps/0/image"], [paths.techniques, "/0/image"]]) {
  test(`B2 rollback rejects missing historical image at ${owner}#${pointer}`, async () => {
    await rejectsCandidate(withImage(knowledge(), owner, pointer, "data/ingredients/salt.png"), `${owner}#${pointer}`);
  });
}

for (const src of ["/data/ingredients/salt.png", "../../../secret.png", "data:text/plain,test", "salt%2epng", "data/menu-plans/secret.png"]) {
  test(`B2 rollback rejects illegal historical image src ${src}`, async () => {
    await rejectsCandidate(withImage(knowledge(), paths.dish, "/image", src), `${paths.dish}#/image`);
  });
}

for (const [imagePath, bytes] of [["data/ingredients/salt.png", PNG_A.subarray(0, -12)], ["data/ingredients/salt.jpg", PNG_A]]) {
  test(`B2 rollback rejects invalid image bytes or extension at ${imagePath}`, async () => {
    await rejectsCandidate({ ...withImage(knowledge(), paths.ingredient, "/image", imagePath), [imagePath]: bytes }, `${paths.ingredient}#/image`);
  });
}

test("B2 rollback restores valid historical local image bytes instead of current bytes", async () => {
  const repo = new FakeRepo();
  const imagePath = "data/ingredients/salt.png";
  const files = withImage(knowledge(), paths.ingredient, "/image", "salt.png");
  const target = repo.commit({ ...files, [imagePath]: PNG_A });
  repo.commit({ ...files, [imagePath]: PNG_B, "data/shopping-lists/keep.json": "keep bytes" });
  const { env } = makeEnv(repo);
  const result = await rollback(env, target);
  assert.equal(result.status, 200);
  const blob = repo.trees.get(repo.commits.get(repo.head).tree).get(imagePath);
  assert.deepEqual(repo.blobs.get(blob), PNG_A);
  assert.equal(repo.fileText("data/shopping-lists/keep.json"), "keep bytes");
});

test("B2 rollback preserves remote ImageRef without fetching or claiming pinned bytes", async () => {
  const repo = new FakeRepo();
  const files = withImage(knowledge(), paths.dish, "/image", "https://example.test/soup.png");
  const target = repo.commit(files);
  repo.commit(knowledge());
  const { env } = makeEnv(repo);
  const result = await rollback(env, target);
  assert.equal(result.status, 200);
  assert.equal(repo.fileText(paths.dish), files[paths.dish]);
  assert.ok(repo.calls.every((entry) => entry.path.startsWith(`/repos/${REPO}/`)));
});

for (const second of [{ id: "mix", kind: "heat", name: { zh: "另一技法" } }, { id: "mix", kind: "pretreat", name: { zh: "拌" } }]) {
  test(`B2 review rejects duplicate technique ID even when ${second.kind === "heat" ? "different" : "identical"}`, async () => {
    const files = knowledge();
    files[paths.techniques] = json([...JSON.parse(files[paths.techniques]), second]);
    await rejectsCandidate(files, `${paths.techniques}#/1/id`);
  });
}

function guardedSources(badDish) {
  const repo = new FakeRepo();
  const base = knowledge();
  // Put soup before the plan so candidate invalid_source is encountered first.
  const target = repo.commit({ [paths.dish]: badDish, ...base, [paths.plan]: json(plan()), [paths.dish]: badDish });
  const before = repo.commit({ [paths.dish]: json({ schemaVersion: "3", name: { zh: "汤" } }), ...base,
    [paths.plan]: json({ schemaVersion: "3", meals: [] }), [paths.dish]: json({ schemaVersion: "3", name: { zh: "汤" } }) });
  return { repo, target, before };
}

for (const badDish of ["null", "{ broken", "[]", json({ schemaVersion: "4", name: { zh: "汤" } }), json({ schemaVersion: "3", name: null })]) {
  test(`B2 review a later explicit v3 downgrade wins over candidate dish ${badDish}`, async () => {
    const { repo, target, before } = guardedSources(badDish);
    const { env } = makeEnv(repo);
    const result = await rollback(env, target);
    assert.equal(result.status, 409);
    assert.equal(result.body.errors[0].code, "format_downgrade");
    assert.equal(result.body.errors[0].path, paths.plan);
    assert.equal(repo.head, before);
    assert.equal(repo.writeCalls().length, 0);
  });
}

for (const failure of [401, 403, "network"]) {
  test(`B2 review does not swallow ${failure} while collecting candidate version errors`, async () => {
    const { repo, target, before } = guardedSources("null");
    const blob = repo.trees.get(repo.commits.get(target).tree).get(paths.dish);
    const { env } = makeEnv(repo, { __extraRoutes: {
      [`GET /repos/${REPO}/git/blobs/${blob}`]: () => {
        if (failure === "network") throw new TypeError("network down");
        return response({ message: "permission denied" }, failure);
      },
    } });
    const result = await rollback(env, target);
    assert.equal(result.status, 502);
    assert.equal(result.body.errors[0].code, "upstream_error");
    assert.equal(repo.head, before);
    assert.equal(repo.writeCalls().length, 0);
  });
}

test("B2 review detailed source errors are opt-in for rollback", async () => {
  const { parseSource, parseTranslationLock } = await import("../dist/source.js");
  assert.throws(() => parseSource(json({ ...dish(), components: [{ ingredientRef: "salt" }] }), "dish", paths.dish), (error) => error.errors[0].path === paths.dish);
  assert.throws(() => parseTranslationLock(json({ entry: { status: "bad" } })), (error) => error.errors[0].path === paths.translations);
});

test("B2 review preserves the existing pcs with yield warning-only contract", async () => {
  const repo = new FakeRepo();
  const files = { ...knowledge(), [paths.ingredient]: json({ schemaVersion: "2", name: { zh: "一块盐" }, baseUnit: "pcs", trackStock: false, yield: 0.9 }) };
  const target = repo.commit(files);
  repo.commit(knowledge());
  const { env } = makeEnv(repo);
  const result = await rollback(env, target);
  assert.equal(result.status, 200);
  assert.equal(repo.fileText(paths.ingredient), files[paths.ingredient]);
});

for (const kind of ["meal", "ingredient", "prep", "step"]) {
  test(`B2 review retains the actual row index for a second ${kind} reference error`, async () => {
    const files = knowledge();
    const value = kind === "meal" ? plan() : dish();
    let pointer;
    const owner = kind === "meal" ? paths.plan : paths.dish;
    if (kind === "meal") {
      value.meals.push({ ...value.meals[0], dishRef: "missing" });
      pointer = "/meals/1/dishRef";
    } else if (kind === "step") {
      value.steps.push({ text: { zh: "下一步" }, techniqueRef: "missing" });
      pointer = "/steps/1/techniqueRef";
    } else {
      const next = structuredClone(value.components[0]);
      if (kind === "ingredient") next.ingredientRef = "missing";
      else next.prep.techniqueRef = "missing";
      value.components.push(next);
      pointer = kind === "ingredient" ? "/components/1/ingredientRef" : "/components/1/prep/techniqueRef";
    }
    await rejectsCandidate({ ...files, [owner]: json(value) }, `${owner}#${pointer}`);
  });
}
