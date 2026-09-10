/**
 * 契约 §6.5 回退。T-41 / T-42 是 L1；T-37 / T-38 / T-40 契约里标的是 L2（真测试仓库），
 * 下面是它们的 L1 版 —— 同样的分支逻辑跑在内存假仓库上，真仓库那一遍仍然欠着（#69）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeRepo, WORKER, bearer, call, makeEnv } from "./helpers.mjs";

const worker = (await import(WORKER)).default;

const GOOD = `${JSON.stringify({ schemaVersion: "2", meals: [{ date: "2026-10-19", mealType: "lunch", dishRef: "soup", plannedServings: 2 }] })}\n`;
const BROKEN = '{\n  "meals": "坏了",\n  "schemaVersion": "2"\n}\n';
const DISH = `${JSON.stringify({ name: { zh: "汤" } })}\n`;

/** commit A（data/ 正确）→ commit B（改坏 data/，同时也改了 data/ 之外的 README.md）。 */
function twoCommits(validHead = false) {
  const repo = new FakeRepo();
  const a = repo.commit(
    {
      "README.md": "# A\n",
      "data/menu-plans/week-43.json": GOOD,
      "data/dishes/soup.json": DISH,
      "data/techniques.json": "[]\n",
    },
    "A",
  );
  const treeB = repo.registerTree(
    new Map([
      ["README.md", repo.addBlob(Buffer.from("# B\n", "utf8"))],
      ["data/menu-plans/week-43.json", repo.addBlob(Buffer.from(validHead ? GOOD : BROKEN, "utf8"))],
      ["data/dishes/soup.json", repo.addBlob(Buffer.from(DISH, "utf8"))],
      ["data/techniques.json", repo.addBlob(Buffer.from("[]\n", "utf8"))],
    ]),
  );
  const b = repo.commitTree(treeB, "B");
  return { repo, a, b };
}

test("T-41 POST /rollback/zzzz → 400 invalid_revision", async () => {
  const { repo } = twoCommits();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/rollback/zzzz", {
    headers: bearer("admin"),
  });
  assert.equal(status, 400);
  assert.equal(body.errors[0].code, "invalid_revision");
  assert.equal(repo.writeCalls().length, 0);
});

test("T-42 POST /rollback/<合法但不存在的 sha> → 422 revision_unavailable", async () => {
  const { repo } = twoCommits();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", `/rollback/${"0".repeat(40)}`, {
    headers: bearer("admin"),
  });
  assert.equal(status, 422);
  assert.equal(body.errors[0].code, "revision_unavailable");
  assert.equal(repo.writeCalls().length, 0);
});

test("T-37/38/40（L1 版）回退是新 commit：data/ 回到 A、data/ 之外原样、历史都还在、带 [skip ci] 与 role trailer", async () => {
  const { repo, a, b } = twoCommits();
  const { env } = makeEnv(repo);

  const { status, body } = await call(worker, env, "POST", `/rollback/${a}`, {
    headers: bearer("admin"),
  });

  assert.equal(status, 200);
  assert.equal(body.restoredFrom, a);
  assert.equal(body.changedFiles, 1);

  // 新 commit，非 force：A 与 B 都还在，且新 commit 的父就是 B。
  assert.notEqual(repo.head, b);
  assert.ok(repo.commits.has(a));
  assert.ok(repo.commits.has(b));
  assert.deepEqual(repo.commits.get(repo.head).parents, [b]);

  // data/ 回到 A；data/ 之外逐字未变（README 还是 B 的）。
  assert.equal(repo.fileText("data/menu-plans/week-43.json"), GOOD);
  assert.equal(repo.fileText("README.md"), "# B\n");

  const message = repo.commits.get(repo.head).message;
  assert.equal(
    message,
    `revert(data): 恢复到 ${a.slice(0, 7)} [skip ci]\n\nX-CanteenOS-Role: admin\nX-CanteenOS-Endpoint: POST /rollback/${a}`,
  );
});

test("回退到当前就是的那个版本 → 不造空 commit", async () => {
  const { repo, b } = twoCommits(true);
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", `/rollback/${b}`, {
    headers: bearer("admin"),
  });
  assert.equal(status, 200);
  assert.equal(body.changedFiles, 0);
  assert.equal(repo.head, b);
});

test("回退只有 admin：buyer 也是 403", async () => {
  const { repo, a } = twoCommits();
  const { env } = makeEnv(repo);
  const { status } = await call(worker, env, "POST", `/rollback/${a}`, { headers: bearer("buyer") });
  assert.equal(status, 403);
});
