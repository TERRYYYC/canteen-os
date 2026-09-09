/**
 * 剩下的横切项：
 *  - T-45 日志只有 {time, role, endpoint, status}
 *  - D-18 三条路径白名单正则（契约 §7.1）
 *  - 常数时间比较不短路
 *  - POST /translate 的两种形态
 *  - ajv standalone 产物的 --check 漂移检测（本轮 #19 的构建步骤，契约 §8 第 6 行）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FakeRepo, WORKER, bearer, call, makeEnv, planFixture } from "./helpers.mjs";

const worker = (await import(WORKER)).default;
const paths = await import(new URL("../dist/paths.js", import.meta.url).href);
const auth = await import(new URL("../dist/auth.js", import.meta.url).href);

function seeded() {
  const repo = new FakeRepo();
  repo.commit({ "data/techniques.json": "[]\n" }, "seed");
  return repo;
}

test("T-45 日志只有 {time, role, endpoint, status}：grep 不到令牌、请求体、原始路径", async () => {
  const repo = seeded();
  repo.dispatchStatus = 500;
  const { env, logs } = makeEnv(repo);

  await call(worker, env, "POST", "/plan/week-43", { body: planFixture() }); // 401
  await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: planFixture({ name: { zh: "这段文字绝不能进日志" } , meals: [] }),
  }); // 400（meals 少于 1 项）
  await call(worker, env, "POST", "/publish", { headers: bearer("chef") }); // 502

  assert.deepEqual(
    logs.map((l) => l.status),
    [401, 400, 502],
  );
  for (const entry of logs) {
    assert.deepEqual(Object.keys(entry).sort(), ["endpoint", "role", "status", "time"]);
  }
  const dumped = JSON.stringify(logs);
  assert.ok(!dumped.includes("这段文字绝不能进日志"));
  assert.ok(!dumped.includes("chefAAA"));
  assert.ok(!dumped.includes("Bearer"));
  assert.equal(logs[0].role, null, "401 时没有角色可记");
  assert.equal(logs[1].role, "chef");
  assert.equal(logs[1].endpoint, "POST /plan/:planId", "记的是路由模板，不是原始路径");
});

test("D-18 路径白名单：实体 / 图片 / 单文件三条，越界的一律不放行", async () => {
  const ok = [
    "data/ingredients/tomato.json",
    "data/dishes/tomato-egg-stir-fry.json",
    "data/menu-plans/week-43.json",
    "data/techniques.json",
    "data/dishes/tomato-egg-stir-fry/images/cover.jpg",
    "data/ingredients/tomato/images/raw.webp",
    "data/ingredients/tomato/raw.png",
  ];
  const no = [
    "schemas/dish.schema.json",
    "packages/web/index.html",
    "scripts/build-data.mjs",
    ".github/workflows/build-deploy.yml",
    "package.json",
    "/etc/passwd",
    "data/../package.json",
    "data/purchase-orders/week-41-hongda.json",
    "data/translations.lock.json",
    "data/ingredients/1tomato.json", // Id 必须字母开头（ADR 的示意正则这里是松的）
    "data/dishes/x/images/y.jpg.json", // ADR 示意正则唯一能匹配的图片形状，实际不该放行
  ];
  for (const p of ok) assert.equal(paths.isWritablePath(p), true, `应放行: ${p}`);
  for (const p of no) assert.equal(paths.isWritablePath(p), false, `应挡下: ${p}`);
});

test("常数时间比较：长度不同也走完，结果正确", () => {
  assert.equal(auth.constantTimeEquals("abc", "abc"), true);
  assert.equal(auth.constantTimeEquals("abc", "abd"), false);
  assert.equal(auth.constantTimeEquals("abc", "ab"), false);
  assert.equal(auth.constantTimeEquals("", ""), true);
});

test("sha256Hex 与 openssl 口径一致（ops-checklist §2 的算法）", async () => {
  // 下面这串是 SHA-256("abc") 的公开测试向量（NIST FIPS 180-4），不是任何密钥。
  assert.equal(
    await auth.sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("POST /translate：没配 DEEPL_API_KEY 时不报错，返回空译文 + warning", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/translate", {
    headers: bearer("chef"),
    body: { text: "红烧肉" },
  });
  assert.equal(status, 200);
  assert.deepEqual(body.translations, {});
  assert.ok(body.warnings.includes("translate-unavailable"));
});

test("POST /translate：配了 key 就调 DeepL，回三语里请求的那两种", async () => {
  const repo = seeded();
  const seen = [];
  const { env } = makeEnv(repo, { DEEPL_API_KEY: "fake:fx" });
  const inner = env.__fetch;
  env.__fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("deepl.com")) {
      const body = JSON.parse(init.body);
      seen.push(body.target_lang);
      assert.equal(init.headers.Authorization, "DeepL-Auth-Key fake:fx");
      return new Response(JSON.stringify({ translations: [{ text: `X-${body.target_lang}` }] }), {
        status: 200,
      });
    }
    return inner(input, init);
  };
  const { status, body } = await call(worker, env, "POST", "/translate", {
    headers: bearer("chef"),
    body: { text: "红烧肉", targets: ["en", "uk"] },
  });
  assert.equal(status, 200);
  assert.deepEqual(seen, ["EN-US", "UK"]);
  assert.deepEqual(body.translations, { en: "X-EN-US", uk: "X-UK" });
});

test("POST /translate：buyer 不能调；缺 text → 400 required", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const forbidden = await call(worker, env, "POST", "/translate", {
    headers: bearer("buyer"),
    body: { text: "x" },
  });
  assert.equal(forbidden.status, 403);

  const missing = await call(worker, env, "POST", "/translate", {
    headers: bearer("chef"),
    body: {},
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.errors[0].code, "required");
  assert.equal(missing.body.errors[0].path, "/text");
});

test("没配 GITHUB_PAT 时不假装成功：503 not_configured", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo, { GITHUB_PAT: undefined });
  const { status, body } = await call(worker, env, "POST", "/plan/week-43", {
    headers: bearer("chef"),
    body: planFixture(),
  });
  assert.equal(status, 503);
  assert.equal(body.errors[0].code, "not_configured");
});

test("没有这个接口 → 404，不泄露路由表", async () => {
  const { env } = makeEnv(seeded());
  const { status, body } = await call(worker, env, "GET", "/admin/secrets", {
    headers: bearer("admin"),
  });
  assert.equal(status, 404);
  assert.equal(body.errors[0].code, "not_found");
});

test("ajv standalone 产物：--check 在一致时绿，在漂移时红", () => {
  const script = fileURLToPath(new URL("../scripts/gen-validators.mjs", import.meta.url));
  const generated = fileURLToPath(new URL("../generated/validators.js", import.meta.url));
  const cwd = fileURLToPath(new URL("..", import.meta.url));

  execFileSync(process.execPath, [script, "--check"], { cwd, stdio: "pipe" });

  const original = readFileSync(generated, "utf8");
  try {
    // 追加一行注释：模块仍然可用（并行跑的其他测试文件不受影响），但字节已经不一致。
    writeFileSync(generated, `${original}\n// drift\n`);
    assert.throws(
      () => execFileSync(process.execPath, [script, "--check"], { cwd, stdio: "pipe" }),
      /Command failed/,
    );
  } finally {
    writeFileSync(generated, original);
  }

  execFileSync(process.execPath, [script, "--check"], { cwd, stdio: "pipe" });
});

test("ajv standalone 产物里没有 eval / new Function / require（Workers 三条禁令）", () => {
  const code = readFileSync(new URL("../generated/validators.js", import.meta.url), "utf8");
  assert.ok(!/\beval\s*\(/.test(code));
  assert.ok(!/new\s+Function\s*\(/.test(code));
  assert.ok(!/\brequire\s*\(/.test(code));
});
