/**
 * 契约 §6.4 发布与构建触发（T-25 … T-32、T-34 … T-36 的 L1 部分）。
 * T-33 是 L2（真测试仓库），本轮没有。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FakeRepo, WORKER, bearer, call, makeEnv, planFixture } from "./helpers.mjs";

const worker = (await import(WORKER)).default;
const { STAGE_STEPS } = await import(new URL("../dist/endpoints/publish.js", import.meta.url).href);

const AUTO_STEPS = ["Set up job", "Run actions/checkout@v4", "Complete job"];

function seeded() {
  const repo = new FakeRepo();
  repo.commit({ "data/techniques.json": "[]\n" }, "seed");
  return repo;
}

function step(name, conclusion = "success", extra = {}) {
  return {
    name,
    status: conclusion === null ? "in_progress" : "completed",
    conclusion,
    started_at: "2026-10-19T09:00:10Z",
    completed_at: conclusion === null ? null : "2026-10-19T09:00:20Z",
    ...extra,
  };
}

function pushRun(repo, { id = 555, steps, status = "completed", conclusion = "success" }) {
  repo.runs.push({
    id,
    name: "publish · req-fixed-0001",
    status,
    conclusion,
    html_url: `https://github.com/TERRYYYC/canteen-os/actions/runs/${id}`,
    head_sha: repo.head,
    created_at: "2026-10-19T09:00:00Z",
    run_started_at: "2026-10-19T09:00:05Z",
  });
  repo.jobsByRun.set(id, [
    {
      id: 1,
      name: "validate → translate → build-data → vite build",
      status,
      conclusion,
      started_at: "2026-10-19T09:00:05Z",
      completed_at: "2026-10-19T09:05:00Z",
      steps,
    },
  ]);
  return id;
}

test("T-25 PUBLISH_MODE=off → 503 dispatch_unavailable，无 commit", async () => {
  const repo = seeded();
  const head = repo.head;
  const { env } = makeEnv(repo, { PUBLISH_MODE: "off" });
  const { status, body } = await call(worker, env, "POST", "/publish", { headers: bearer("chef") });
  assert.equal(status, 503);
  assert.equal(body.errors[0].code, "dispatch_unavailable");
  assert.equal(repo.head, head);
  assert.equal(repo.writeCalls().length, 0);
});

test("T-26 PUBLISH_MODE=push-trigger → 200 mode push-trigger，空 commit 不带 [skip ci]", async () => {
  const repo = seeded();
  const head = repo.head;
  const { env } = makeEnv(repo, { PUBLISH_MODE: "push-trigger", PUBLISH_CLAIM_TIMEOUT_MS: "0" });
  const { status, body } = await call(worker, env, "POST", "/publish", { headers: bearer("chef") });

  assert.equal(status, 200);
  assert.equal(body.mode, "push-trigger");
  assert.notEqual(repo.head, head);
  const commit = repo.commits.get(repo.head);
  assert.ok(!commit.message.includes("[skip ci]"), "发布触发 commit 不能带 [skip ci]");
  assert.match(commit.message, /^chore\(publish\): 触发构建\n\nX-CanteenOS-Role: chef\n/);
  // 空 commit：tree 与父提交一致，data/ 一个字节没动。
  assert.equal(commit.tree, repo.commits.get(head).tree);
});

test("T-27 dispatch API 打桩 500 → 502 upstream_error（不是 200）", async () => {
  const repo = seeded();
  repo.dispatchStatus = 500;
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/publish", { headers: bearer("chef") });
  assert.equal(status, 502);
  assert.equal(body.errors[0].code, "upstream_error");
});

test("T-28 dispatch 204 但 runs 列表 90 秒内始终为空 → 200 runId:null（前端进 queued 态）", async () => {
  const repo = seeded();
  const { env, clock } = makeEnv(repo);
  const before = clock.t;
  const { status, body } = await call(worker, env, "POST", "/publish", { headers: bearer("chef") });
  assert.equal(status, 200);
  assert.equal(body.runId, null);
  assert.equal(body.mode, "dispatch");
  assert.equal(repo.dispatches.length, 1);
  assert.deepEqual(repo.dispatches[0], { ref: "main", inputs: { request_id: "req-fixed-0001" } });
  assert.ok(clock.t - before >= 90000, "应该轮满 90 秒才放弃");
});

test("POST /publish 按 run-name 精准匹配认领 runId（决议追加第 5 条：不按时间戳取最新）", async () => {
  const repo = seeded();
  // 一条时间戳更新、但名字不是我们的 run：按时间戳取最新会认错人。
  repo.runs.push({
    id: 999,
    name: "publish · someone-else",
    status: "queued",
    conclusion: null,
    html_url: "https://github.com/TERRYYYC/canteen-os/actions/runs/999",
    head_sha: repo.head,
    created_at: "2026-10-19T09:30:00Z",
    run_started_at: null,
  });
  repo.runs.push({
    id: 777,
    name: "publish · req-fixed-0001",
    status: "queued",
    conclusion: null,
    html_url: "https://github.com/TERRYYYC/canteen-os/actions/runs/777",
    head_sha: repo.head,
    created_at: "2026-10-19T09:00:00Z",
    run_started_at: null,
  });
  const { env } = makeEnv(repo);
  const { body } = await call(worker, env, "POST", "/publish", { headers: bearer("chef") });
  assert.equal(body.runId, 777);
});

test("T-29 四步映射正确，自动生成的步骤被忽略，unmappedSteps 为空", async () => {
  const repo = seeded();
  const names = [
    ...STAGE_STEPS.validate,
    ...STAGE_STEPS.translate,
    ...STAGE_STEPS.build,
    "Run actions/upload-pages-artifact@v3",
  ];
  const id = pushRun(repo, { steps: [...AUTO_STEPS, ...names].map((n) => step(n)) });
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "GET", `/publish/${id}`, { headers: bearer("chef") });

  assert.equal(status, 200);
  assert.deepEqual(body.unmappedSteps, []);
  assert.deepEqual(
    body.steps.map((s) => [s.key, s.state]),
    [
      ["validate", "success"],
      ["translate", "success"],
      ["build", "success"],
      ["deploy", "success"],
    ],
  );
  assert.deepEqual(
    body.steps.map((s) => s.label),
    ["检查数据", "补翻译", "生成三张单", "上线"],
  );
  assert.equal(body.status, "success");
  assert.equal(body.failedStep, null);
});

test("T-30 多一个显式 name 的步骤 → status unmapped，unmappedSteps 列出它", async () => {
  const repo = seeded();
  const names = [...STAGE_STEPS.validate, ...STAGE_STEPS.translate, ...STAGE_STEPS.build];
  const id = pushRun(repo, { steps: [...AUTO_STEPS, ...names, "Lint something"].map((n) => step(n)) });
  const { env } = makeEnv(repo);
  const { body } = await call(worker, env, "GET", `/publish/${id}`, { headers: bearer("chef") });
  assert.equal(body.status, "unmapped");
  assert.deepEqual(body.unmappedSteps, ["Lint something"]);
});

test("T-31 Gate 步骤 failure → status failure，failedStep 是 validate", async () => {
  const repo = seeded();
  const steps = [
    step(STAGE_STEPS.validate[0]),
    step(STAGE_STEPS.translate[0]),
    step(STAGE_STEPS.translate[1]),
    step(STAGE_STEPS.build[0]),
    step(STAGE_STEPS.validate[1], "failure"),
  ];
  const id = pushRun(repo, { steps, conclusion: "failure" });
  const { env } = makeEnv(repo);
  const { body } = await call(worker, env, "GET", `/publish/${id}`, { headers: bearer("chef") });
  assert.equal(body.status, "failure");
  assert.equal(body.failedStep, "validate");
  assert.equal(body.failureReason, STAGE_STEPS.validate[1]);
});

test("T-32 run 已经进行了 25 分钟 → status timeout，带 htmlUrl", async () => {
  const repo = seeded();
  const id = pushRun(repo, {
    steps: [step(STAGE_STEPS.validate[0]), step(STAGE_STEPS.translate[0], null)],
    status: "in_progress",
    conclusion: null,
  });
  const { env, clock } = makeEnv(repo);
  clock.t = Date.parse("2026-10-19T09:00:05Z") + 25 * 60 * 1000;
  const { body } = await call(worker, env, "GET", `/publish/${id}`, { headers: bearer("chef") });
  assert.equal(body.status, "timeout");
  assert.equal(body.htmlUrl, `https://github.com/TERRYYYC/canteen-os/actions/runs/${id}`);
});

test("run 进行中 12 分钟 → 仍是 in_progress，但带 slow: true（D-14）", async () => {
  const repo = seeded();
  const id = pushRun(repo, {
    steps: [step(STAGE_STEPS.validate[0]), step(STAGE_STEPS.translate[0], null)],
    status: "in_progress",
    conclusion: null,
  });
  const { env, clock } = makeEnv(repo);
  clock.t = Date.parse("2026-10-19T09:00:05Z") + 12 * 60 * 1000;
  const { body } = await call(worker, env, "GET", `/publish/${id}`, { headers: bearer("chef") });
  assert.equal(body.status, "in_progress");
  assert.equal(body.slow, true);
});

test("GET /publish/:runId 目标不存在 → 404 not_found；runId 不是正整数 → 400", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const missing = await call(worker, env, "GET", "/publish/424242", { headers: bearer("chef") });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.errors[0].code, "not_found");

  const bad = await call(worker, env, "GET", "/publish/abc", { headers: bearer("chef") });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.errors[0].code, "bad_id");
});

test("D-13 的真实兆底：build-deploy.yml 里每个带显式 name 的步骤都必须被认识", async () => {
  const yml = readFileSync(new URL("../../../.github/workflows/build-deploy.yml", import.meta.url), "utf8");
  const names = [...yml.matchAll(/^\s*- name: (.+)$/gm)].map((m) => m[1]);
  assert.ok(names.length >= 8, "没读到 build-deploy.yml 的步骤名");

  const repo = seeded();
  const id = pushRun(repo, { steps: [...AUTO_STEPS, ...names].map((n) => step(n)) });
  const { env } = makeEnv(repo);
  const { body } = await call(worker, env, "GET", `/publish/${id}`, { headers: bearer("chef") });
  assert.deepEqual(
    body.unmappedSteps,
    [],
    "build-deploy.yml 改了步骤名（或加了新步骤），四步映射表（契约 §4.2）要同步改",
  );
});

test("T-34 写入桶 60 次/小时：第 61 次 429", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  for (let i = 0; i < 60; i++) {
    const { status } = await call(worker, env, "POST", "/plan/week-43", {
      headers: bearer("chef"),
      body: planFixture(),
    });
    assert.equal(status, 200, `第 ${i + 1} 次写入应该成功`);
  }
  const { status, body, res } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: planFixture(),
  });
  assert.equal(status, 429);
  assert.equal(body.errors[0].code, "rate_limited");
  assert.ok(Number(res.headers.get("Retry-After")) > 0);
});

test("T-35 发布桶 10 次/小时：第 11 次 429", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo, { PUBLISH_CLAIM_TIMEOUT_MS: "0" });
  for (let i = 0; i < 10; i++) {
    const { status } = await call(worker, env, "POST", "/publish", { headers: bearer("chef") });
    assert.equal(status, 200);
  }
  const { status, body } = await call(worker, env, "POST", "/publish", { headers: bearer("chef") });
  assert.equal(status, 429);
  assert.equal(body.errors[0].code, "rate_limited");
});

test("T-36 回退单独一个桶 5 次/小时（D-11）：第 6 次 429", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const sha = repo.head;
  for (let i = 0; i < 5; i++) {
    const { status } = await call(worker, env, "POST", `/rollback/${sha}`, { headers: bearer("admin") });
    assert.equal(status, 200, `第 ${i + 1} 次回退应该成功`);
  }
  const { status, body } = await call(worker, env, "POST", `/rollback/${sha}`, {
    headers: bearer("admin"),
  });
  assert.equal(status, 429);
  assert.equal(body.errors[0].code, "rate_limited");
});

test("读端点走独立的读桶，不吃写入配额（D-16）", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  for (let i = 0; i < 70; i++) {
    const { status } = await call(worker, env, "GET", "/catalog", { headers: bearer("buyer") });
    assert.equal(status, 200);
  }
  const { status } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: planFixture(),
  });
  assert.equal(status, 200);
});
