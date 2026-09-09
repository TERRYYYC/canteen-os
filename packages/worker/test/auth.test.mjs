/**
 * 契约 §6.1 鉴权（T-01 … T-09），全部 L1。
 * 口径：401 是「令牌无效」，403 是「角色越权」—— 两者的区分是 ops-checklist §3.3
 * 让人自助排障的依据，所以必须分得清清楚楚。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { FakeRepo, TOKENS, WORKER, bearer, call, makeEnv, planFixture } from "./helpers.mjs";

const worker = (await import(WORKER)).default;

function seeded() {
  const repo = new FakeRepo();
  repo.commit(
    {
      "data/dishes/tomato-egg-stir-fry.json": '{\n  "name": {\n    "zh": "番茄炒蛋"\n  }\n}\n',
      "data/techniques.json": "[]\n",
    },
    "seed",
  );
  return repo;
}

test("T-01 不带 Authorization → 401 unauthorized，且无 commit", async () => {
  const repo = seeded();
  const head = repo.head;
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", { body: planFixture() });
  assert.equal(status, 401);
  assert.deepEqual(body, {
    ok: false,
    errors: [{ path: "", code: "unauthorized", message: "链接失效了，找 Terry 要新的" }],
  });
  assert.equal(repo.head, head);
  assert.equal(repo.writeCalls().length, 0);
});

test("T-02 长度不是 43 的令牌 → 401（先判长度，不算哈希）", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const short = "x".repeat(42);
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: { Authorization: `Bearer ${short}` },
    body: planFixture(),
  });
  assert.equal(status, 401);
  assert.equal(body.errors[0].code, "unauthorized");
});

test("T-03 合法长度但哈希不匹配 → 401，响应体与 T-01 逐字节相同", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const anonymous = await call(worker, env, "POST", "/plan/week-43", { body: planFixture() });
  const wrong = await call(worker, env, "POST", "/plan/week-43", {
    headers: { Authorization: `Bearer ${"z".repeat(43)}` },
    body: planFixture(),
  });
  assert.equal(wrong.status, anonymous.status);
  assert.equal(wrong.text, anonymous.text);
});

test("T-04 buyer 调 POST /plan → 403 forbidden（不是 401），无 commit", async () => {
  const repo = seeded();
  const head = repo.head;
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("buyer"),
    body: planFixture(),
  });
  assert.equal(status, 403);
  assert.equal(body.errors[0].code, "forbidden");
  assert.equal(repo.head, head);
  assert.equal(repo.writeCalls().length, 0);
});

test("T-05 chef 调 POST /rollback/<sha> → 403（回退只有 admin）", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", `/rollback/${repo.head}`, {
    headers: bearer("chef"),
  });
  assert.equal(status, 403);
  assert.equal(body.errors[0].code, "forbidden");
});

test("T-06 buyer 调 GET /publish/:runId → 200（buyer 有读进度权限）", async () => {
  const repo = seeded();
  repo.runs.push({
    id: 123,
    name: "publish · abc",
    status: "completed",
    conclusion: "success",
    html_url: "https://github.com/TERRYYYC/canteen-os/actions/runs/123",
    head_sha: repo.head,
    created_at: "2026-10-19T09:00:00Z",
    run_started_at: "2026-10-19T09:00:05Z",
  });
  repo.jobsByRun.set(123, []);
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "GET", "/publish/123", { headers: bearer("buyer") });
  assert.equal(status, 200);
  assert.equal(body.runId, 123);
});

test("T-07 轮换 TOKEN_HASH_CHEF 之后，旧 chef 令牌立刻 401", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const before = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: planFixture(),
  });
  assert.equal(before.status, 200);

  env.TOKEN_HASH_CHEF = createHash("sha256").update(`${TOKENS.chef}-rotated`, "utf8").digest("hex");
  const after = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: planFixture(),
  });
  assert.equal(after.status, 401);
  assert.equal(after.body.errors[0].code, "unauthorized");
});

test("T-08 任一请求都带逐字的 CORS 头，且不含 Allow-Credentials", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  for (const call0 of [
    call(worker, env, "POST", "/plan/week-43", { headers: bearer("chef"), body: planFixture() }),
    call(worker, env, "POST", "/plan/week-43", { body: planFixture() }),
    call(worker, env, "GET", "/nope"),
  ]) {
    const { res } = await call0;
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://terryyyc.github.io");
    assert.equal(res.headers.get("Vary"), "Origin");
    assert.equal(res.headers.get("Access-Control-Allow-Credentials"), null);
  }
});

test("T-09 OPTIONS 预检 → 200，Max-Age 600，允许 Authorization 头", async () => {
  const { env } = makeEnv(new FakeRepo());
  const { res, status } = await call(worker, env, "OPTIONS", "/plan/week-43");
  assert.equal(status, 200);
  assert.equal(res.headers.get("Access-Control-Max-Age"), "600");
  assert.match(res.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://terryyyc.github.io");
  assert.equal(res.headers.get("Access-Control-Allow-Credentials"), null);
});
