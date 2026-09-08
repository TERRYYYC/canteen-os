/**
 * 三个只读端点：GET /source/:kind/:id（D-06）、GET /catalog、GET /changes
 * （后两个来自 2026-09-08 决议追加第 3 条 / 前端契约 §6.3）。
 * 共同约束：**不产生任何 commit**。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeRepo, WORKER, bearer, call, makeEnv } from "./helpers.mjs";

const worker = (await import(WORKER)).default;

const TOMATO = '{\n  "baseUnit": "g",\n  "name": {\n    "zh": "番茄"\n  },\n  "purchase": {\n    "packSize": 5,\n    "packUnit": "kg",\n    "supplier": "绿源农产品配送"\n  },\n  "schemaVersion": "2",\n  "trackStock": false\n}\n';
const DISH = '{\n  "name": {\n    "zh": "番茄炒蛋"\n  }\n}\n';
const TECHNIQUES = '[{"id":"dice","kind":"cut","name":{"zh":"切丁"}}]\n';
const LOCK = '{"data/ingredients/tomato.json#/name":{"source_hash":"x","status":"human"},"data/dishes/a.json#/name":{"source_hash":"y","status":"machine"}}\n';

function seeded() {
  const repo = new FakeRepo();
  repo.commit(
    {
      "README.md": "# canteen-os\n",
      "data/ingredients/tomato.json": TOMATO,
      "data/dishes/tomato-egg-stir-fry.json": DISH,
      "data/techniques.json": TECHNIQUES,
      "data/translations.lock.json": LOCK,
    },
    "seed",
  );
  return repo;
}

test("GET /source/:kind/:id 返回 content + blobSha + commit，且不产生 commit", async () => {
  const repo = seeded();
  const head = repo.head;
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "GET", "/source/ingredient/tomato", {
    headers: bearer("buyer"),
  });
  assert.equal(status, 200);
  assert.deepEqual(body.content.name, { zh: "番茄" });
  assert.equal(body.commit, head);
  assert.equal(body.blobSha.length, 40);
  assert.equal(repo.head, head);
  assert.equal(repo.writeCalls().length, 0);
});

test("GET /source 目标不存在 → 404 not_found；kind 不认识 → 400", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const missing = await call(worker, env, "GET", "/source/dish/no-such", { headers: bearer("chef") });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.errors[0].code, "not_found");

  const badKind = await call(worker, env, "GET", "/source/recipe/x", { headers: bearer("chef") });
  assert.equal(badKind.status, 400);
  assert.equal(badKind.body.errors[0].code, "bad_id");
});

test("GET /catalog：全库索引 + 供应商去重 + 翻译计数", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "GET", "/catalog", { headers: bearer("buyer") });
  assert.equal(status, 200);
  assert.equal(body.commit, repo.head);
  assert.deepEqual(Object.keys(body.ingredients), ["tomato"]);
  assert.deepEqual(Object.keys(body.dishes), ["tomato-egg-stir-fry"]);
  assert.equal(body.techniques.length, 1);
  assert.deepEqual(body.suppliers, ["绿源农产品配送"]);
  assert.deepEqual(body.translations, { machine: 1, human: 1, stale: 0 });
  assert.equal(repo.writeCalls().length, 0);
});

test("GET /changes：未发布 = 动过 data/ 的 commit，排除机翻回写与不动 data/ 的 commit（D-12）", async () => {
  const repo = seeded();
  const online = repo.head;

  // ① 师傅的一次写入（动 data/，带 trailer）
  const t1 = repo.registerTree(
    new Map([
      ...repo.trees.get(repo.commits.get(repo.head).tree),
      ["data/menu-plans/week-43.json", repo.addBlob(Buffer.from('{\n  "meals": []\n}\n', "utf8"))],
    ]),
  );
  repo.commitTree(
    t1,
    "data(plan): 排 2026-10-19 那周（1 道菜） [skip ci]\n\nX-CanteenOS-Role: chef\nX-CanteenOS-Endpoint: POST /plan/week-43",
  );

  // ② CI 的机翻回写：是上一次发布的产物，不算师傅的未发布改动
  const t2 = repo.registerTree(
    new Map([
      ...repo.trees.get(repo.commits.get(repo.head).tree),
      ["data/translations.lock.json", repo.addBlob(Buffer.from(`${LOCK} `, "utf8"))],
    ]),
  );
  repo.commitTree(t2, "chore(i18n): machine translations [skip ci]");

  // ③ 不动 data/ 的 commit（push-trigger 的空 commit 也走这条规则）
  repo.commitTree(repo.commits.get(repo.head).tree, "chore(publish): 触发构建");

  repo.buildJson = { commit: online, builtAt: "2026-10-19T08:00:00.000Z" };
  repo.runs.push({
    id: 42,
    name: "publish · x",
    status: "completed",
    conclusion: "success",
    html_url: "https://github.com/TERRYYYC/canteen-os/actions/runs/42",
    head_sha: online,
    created_at: "2026-10-19T08:00:00Z",
    run_started_at: "2026-10-19T08:00:01Z",
  });

  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "GET", "/changes", { headers: bearer("chef") });

  assert.equal(status, 200);
  assert.equal(body.onlineCommit, online);
  assert.equal(body.unpublished.length, 1);
  assert.equal(body.unpublished[0].role, "chef");
  assert.equal(body.unpublished[0].endpoint, "POST /plan/week-43");
  assert.equal(body.unpublished[0].subject, "data(plan): 排 2026-10-19 那周（1 道菜）");
  assert.deepEqual(body.unpublished[0].files, ["data/menu-plans/week-43.json"]);
  assert.equal(body.unpublished[0].shortSha.length, 7);
  assert.deepEqual(body.publishes, [
    { sha: online, at: "2026-10-19T08:00:00Z", runId: 42, isOnline: true },
  ]);
  assert.equal(repo.writeCalls().length, 0);
});

test("GET /changes：线上 build.json 读不到时不炸，带 online-unknown", async () => {
  const repo = seeded();
  repo.buildJson = null;
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "GET", "/changes", { headers: bearer("chef") });
  assert.equal(status, 200);
  assert.equal(body.onlineCommit, null);
  assert.ok(body.warnings.includes("online-unknown"));
});

test("三个角色都能读 catalog / changes / source（决议追加第 3 条）", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  for (const role of ["chef", "buyer", "admin"]) {
    for (const path of ["/catalog", "/changes", "/source/ingredient/tomato"]) {
      const { status } = await call(worker, env, "GET", path, { headers: bearer(role) });
      assert.equal(status, 200, `${role} 读 ${path} 应该 200`);
    }
  }
});
