/**
 * 契约 §6.2 校验失败（T-10 … T-20），全部 L1。
 * 重点：错误必须能被前端**逐字段**标黄 —— path 是真的 JSON Pointer，code 逐字用 ajv 的 keyword。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FakeRepo,
  WORKER,
  bearer,
  call,
  ingredientFixture,
  makeEnv,
  planFixture,
} from "./helpers.mjs";

const worker = (await import(WORKER)).default;

function seeded() {
  const repo = new FakeRepo();
  repo.commit(
    {
      "data/dishes/tomato-egg-stir-fry.json": '{\n  "name": {\n    "zh": "番茄炒蛋"\n  }\n}\n',
      "data/ingredients/tomato.json": '{\n  "name": {\n    "zh": "番茄"\n  }\n}\n',
      "data/techniques.json": '[{"id":"dice","kind":"cut","name":{"zh":"切丁"}}]\n',
    },
    "seed",
  );
  return repo;
}

test("T-10 plannedServings 是字符串 → 400 type，路径是 /meals/0/plannedServings，无 commit", async () => {
  const repo = seeded();
  const head = repo.head;
  const { env } = makeEnv(repo);
  const plan = planFixture();
  plan.meals[0].plannedServings = "200";
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: plan,
  });
  assert.equal(status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.errors[0].path, "/meals/0/plannedServings");
  assert.equal(body.errors[0].code, "type");
  assert.equal(repo.head, head);
  assert.equal(repo.writeCalls().length, 0);
});

test("T-11 缺 schemaVersion → 400 required，path 是根（\"\"）", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const plan = planFixture();
  delete plan.schemaVersion;
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: plan,
  });
  assert.equal(status, 400);
  assert.equal(body.errors[0].code, "required");
  assert.ok(body.errors[0].path === "" || body.errors[0].path === "/");
});

test("T-12 mealType = brunch → 400 enum", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const plan = planFixture();
  plan.meals[0].mealType = "brunch";
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: plan,
  });
  assert.equal(status, 400);
  assert.equal(body.errors[0].code, "enum");
  assert.equal(body.errors[0].path, "/meals/0/mealType");
});

test("T-13 多一个 meals[0].notes 键 → 400 additionalProperties", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const plan = planFixture();
  plan.meals[0].notes = "多写的";
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: plan,
  });
  assert.equal(status, 400);
  assert.equal(body.errors[0].code, "additionalProperties");
});

test("T-14 POST /plan/WEEK-43（大写）→ 400 bad_id", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/plan/WEEK-43", {
    headers: bearer("chef"),
    body: planFixture(),
  });
  assert.equal(status, 400);
  assert.equal(body.errors[0].code, "bad_id");
  assert.equal(repo.writeCalls().length, 0);
});

test("T-15 POST /ingredient/:id 请求体 name 三语全空 → 400 anyOf，path /name", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/ingredient/tomato", {
    headers: bearer("chef"),
    body: ingredientFixture({ name: {} }),
  });
  assert.equal(status, 400);
  const hit = body.errors.find((e) => e.path === "/name" && e.code === "anyOf");
  assert.ok(hit, `errors 里应该有 {path:"/name", code:"anyOf"}，实际是 ${JSON.stringify(body.errors)}`);
});

test("T-16 POST /dish/:id/draft 带 status active → 200，落盘是 draft，warnings 含 status-forced", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/dish/hong-shao-rou/draft", {
    headers: bearer("chef"),
    body: { name: { zh: "红烧肉" }, status: "active" },
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(body.warnings.includes("status-forced"));
  const stored = JSON.parse(repo.fileText("data/dishes/hong-shao-rou.json"));
  assert.equal(stored.status, "draft");
});

test("POST /dish/:id（决议追加第 2 条）status 由请求体决定，可直接 active", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/dish/hong-shao-rou", {
    headers: bearer("chef"),
    body: { name: { zh: "红烧肉" }, status: "active" },
  });
  assert.equal(status, 200);
  assert.ok(!body.warnings.includes("status-forced"));
  const stored = JSON.parse(repo.fileText("data/dishes/hong-shao-rou.json"));
  assert.equal(stored.status, "active");
});

test("T-17 dishRef 指向不存在的菜 → 200（不拒绝），warnings 含 dangling-ref", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const plan = planFixture();
  plan.meals[0].dishRef = "no-such-dish";
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: plan,
  });
  assert.equal(status, 200);
  assert.ok(body.warnings.includes("dangling-ref"));
  assert.ok(repo.fileText("data/menu-plans/week-43.json"));
});

test("T-18 路径穿越 → 400 bad_path，且日志里不含请求体", async () => {
  const repo = seeded();
  const head = repo.head;
  const { env, logs } = makeEnv(repo);
  const evil = "..%2F..%2Fpackages%2Fweb%2Findex.html";
  const { status, body } = await call(worker, env, "POST", `/plan/${evil}`, {
    headers: bearer("chef"),
    body: planFixture({ name: { zh: "秘密数据不该进日志" } }),
  });
  assert.equal(status, 400);
  assert.equal(body.errors[0].code, "bad_path");
  assert.equal(repo.head, head);
  assert.equal(repo.writeCalls().length, 0);

  const dumped = JSON.stringify(logs);
  assert.ok(!dumped.includes("秘密数据不该进日志"), "日志里出现了请求体");
  assert.ok(!dumped.includes("packages/web"), "日志里出现了原始路径");
  assert.deepEqual(Object.keys(logs[0]).sort(), ["endpoint", "role", "status", "time"]);
});

test("T-19 300 KB JSON → 413 too_large", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const plan = planFixture({ name: { zh: "x".repeat(300 * 1024) } });
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: plan,
  });
  assert.equal(status, 413);
  assert.equal(body.errors[0].code, "too_large");
  assert.equal(repo.writeCalls().length, 0);
});

test("T-20 截断的 JSON → 400 bad_json（不是 502）", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: { ...bearer("chef"), "Content-Type": "application/json" },
    raw: '{"a":',
  });
  assert.equal(status, 400);
  assert.equal(body.errors[0].code, "bad_json");
});
