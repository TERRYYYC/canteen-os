/**
 * 契约 §6.3 幂等与并发（T-21 / T-22 是 L1），外加 commit 形状（ADR-0007 §2）的断言。
 *
 * T-23 / T-24 在契约里标的是 L2（真测试仓库）。**本轮没有 L2**（#69 未做），
 * 下面两条是它们的 L1 版：同样的分支逻辑，跑在内存假仓库上。真仓库那一遍仍然欠着。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeRepo, WORKER, bearer, call, makeEnv, planFixture } from "./helpers.mjs";

const worker = (await import(WORKER)).default;

/** worker 写盘用的稳定序列化：键排序 + 2 空格 + 末尾换行（契约 §3.1）。 */
function stable(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = sort(v[k]);
      return out;
    }
    return v;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

function seeded(extra = {}) {
  const repo = new FakeRepo();
  repo.commit(
    {
      "data/dishes/tomato-egg-stir-fry.json": '{\n  "name": {\n    "zh": "番茄炒蛋"\n  }\n}\n',
      "data/techniques.json": "[]\n",
      ...extra,
    },
    "seed",
  );
  return repo;
}

test("T-21 内容逐字相同再写一次 → unchanged: true，commit 是当前 HEAD，写 API 一次都没调", async () => {
  const plan = planFixture();
  const repo = seeded({ "data/menu-plans/week-43.json": stable(plan) });
  const head = repo.head;
  const { env } = makeEnv(repo);

  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: plan,
  });

  assert.equal(status, 200);
  assert.equal(body.unchanged, true);
  assert.equal(body.commit, head);
  assert.equal(repo.head, head);
  assert.equal(
    repo.writeCalls().length,
    0,
    `幂等命中却调了写 API：${JSON.stringify(repo.writeCalls())}`,
  );
});

test("T-22 键顺序打乱、缩进不同 → 稳定序列化后仍然 unchanged: true", async () => {
  const plan = planFixture();
  const repo = seeded({ "data/menu-plans/week-43.json": stable(plan) });
  const head = repo.head;
  const { env } = makeEnv(repo);

  // 同一份内容，键顺序整个反过来
  const shuffled = {
    meals: [
      {
        plannedServings: plan.meals[0].plannedServings,
        dishRef: plan.meals[0].dishRef,
        mealType: plan.meals[0].mealType,
        date: plan.meals[0].date,
      },
    ],
    dateRange: { end: plan.dateRange.end, start: plan.dateRange.start },
    name: plan.name,
    schemaVersion: plan.schemaVersion,
  };

  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: shuffled,
  });
  assert.equal(status, 200);
  assert.equal(body.unchanged, true);
  assert.equal(repo.head, head);
  assert.equal(repo.writeCalls().length, 0);
});

test("T-23（L1 版）If-Match 与当前 blob sha 不符 → 409 conflict，且不重试", async () => {
  const plan = planFixture();
  const repo = seeded({ "data/menu-plans/week-43.json": stable(plan) });
  const { env } = makeEnv(repo);

  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: { ...bearer("chef"), "If-Match": "0000000000000000000000000000000000000000" },
    body: planFixture({ margin: 1.2 }),
  });
  assert.equal(status, 409);
  assert.equal(body.errors[0].code, "conflict");
  assert.equal(repo.writeCalls().length, 0);
});

test("If-Match 与当前 blob sha 相符 → 正常写入，响应回新的 blobSha", async () => {
  const plan = planFixture();
  const repo = seeded({ "data/menu-plans/week-43.json": stable(plan) });
  const { env } = makeEnv(repo);
  const source = await call(worker, env, "GET", "/source/plan/week-43", { headers: bearer("chef") });
  assert.equal(source.status, 200);

  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: { ...bearer("chef"), "If-Match": source.body.blobSha },
    body: planFixture({ margin: 1.2 }),
  });
  assert.equal(status, 200);
  assert.equal(body.unchanged, false);
  assert.notEqual(body.blobSha, source.body.blobSha);
  assert.ok(!body.warnings.includes("no-if-match"));
});

test("T-24（L1 版）ref 级冲突 → 重读一次并重试一次，第二次成功", async () => {
  const repo = seeded();
  repo.refUpdateFailures = 1; // 第一次 PATCH ref 返回 422（别人抢先推了 main）
  const { env } = makeEnv(repo);

  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: planFixture(),
  });
  assert.equal(status, 200);
  assert.equal(body.unchanged, false);
  assert.equal(repo.calls.filter((c) => c.method === "PATCH").length, 2);
});

test("ref 级冲突连续两次 → 409 conflict（不无限重试）", async () => {
  const repo = seeded();
  repo.refUpdateFailures = 5;
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: planFixture(),
  });
  assert.equal(status, 409);
  assert.equal(body.errors[0].code, "conflict");
  assert.equal(repo.calls.filter((c) => c.method === "PATCH").length, 2);
});

test("commit 形状：ADR-0007 §2 的首行 + [skip ci] + 两条 trailer，作者 canteenos-bot", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  await call(worker, env, "POST", "/plan/week-43", { headers: bearer("chef"), body: planFixture() });

  const commit = repo.commits.get(repo.head);
  assert.equal(
    commit.message,
    "data(plan): 排 2026-10-19 那周（1 道菜） [skip ci]\n\nX-CanteenOS-Role: chef\nX-CanteenOS-Endpoint: POST /plan/week-43",
  );
  assert.equal(commit.author.name, "canteenos-bot");
});

test("不带 If-Match → warnings 含 no-if-match（契约 §3.2）", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: planFixture(),
  });
  assert.ok(body.warnings.includes("no-if-match"));
});

test("D-08：planId 不是 week-NN 形状只警告不拒绝", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/plan/spring-festival", {
    headers: bearer("chef"),
    body: planFixture(),
  });
  assert.equal(status, 200);
  assert.ok(body.warnings.includes("plan-id-shape"));
});

test("D-10：pcs 食材设了 yield → 只警告不拒绝", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/ingredient/egg", {
    headers: bearer("chef"),
    body: { schemaVersion: "2", name: { zh: "鸡蛋" }, baseUnit: "pcs", trackStock: false, yield: 0.9 },
  });
  assert.equal(status, 200);
  assert.ok(body.warnings.includes("yield-on-pcs"));
});

test("写入落盘的是稳定序列化后的字节（键排序 + 2 空格 + 末尾换行）", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const plan = planFixture();
  await call(worker, env, "POST", "/plan/week-43", { headers: bearer("chef"), body: plan });
  assert.equal(repo.fileText("data/menu-plans/week-43.json"), stable(plan));
});
