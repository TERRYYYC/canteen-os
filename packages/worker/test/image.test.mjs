/**
 * POST /image（契约 §9.1 A 栏：压缩放浏览器，worker 只校验）。
 * T-47（210 KB → 413）与 T-48（伪造扩展名 → 400）在这一层；
 * T-49（浏览器压到 ≤ 200 KB / 最长边 ≤ 1280）是 L3 真机，不在这里。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeRepo, WORKER, bearer, call, makeEnv } from "./helpers.mjs";

const worker = (await import(WORKER)).default;

function png(width, height) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function jpeg(width, height) {
  const soi = Buffer.from([0xff, 0xd8]);
  const app0 = Buffer.alloc(18);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2);
  app0.write("JFIF\0", 4, "latin1");
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([soi, app0, sof]);
}

function webp(width, height) {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(22, 4);
  b.write("WEBP", 8, "latin1");
  b.write("VP8X", 12, "latin1");
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

function seeded() {
  const repo = new FakeRepo();
  repo.commit({ "data/techniques.json": "[]\n" }, "seed");
  return repo;
}

const LICENSE = { "X-Image-License": "own" };

test("上传 png → 200，落到 data/dishes/<id>/images/<name>.png，返回 ImageRef", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/image/dishes/tomato-egg-stir-fry", {
    headers: { ...bearer("chef"), ...LICENSE, "X-Image-Author": "Terry" },
    raw: png(1280, 720),
  });
  assert.equal(status, 200);
  assert.deepEqual(body.image, {
    src: "data/dishes/tomato-egg-stir-fry/images/cover.png",
    license: "own",
    author: "Terry",
  });
  assert.equal(body.width, 1280);
  assert.equal(body.height, 720);
  assert.ok(repo.trees.get(repo.commits.get(repo.head).tree).has(body.image.src));
});

test("jpg 与 webp 的尺寸头也能解析", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const j = await call(worker, env, "POST", "/image/ingredients/tomato", {
    headers: { ...bearer("chef"), ...LICENSE, "X-Image-Name": "raw" },
    raw: jpeg(800, 600),
  });
  assert.equal(j.status, 200);
  assert.equal(j.body.image.src, "data/ingredients/tomato/images/raw.jpg");
  assert.deepEqual([j.body.width, j.body.height], [800, 600]);

  const w = await call(worker, env, "POST", "/image/ingredients/tomato", {
    headers: { ...bearer("chef"), ...LICENSE, "X-Image-Name": "shot" },
    raw: webp(640, 480),
  });
  assert.equal(w.status, 200);
  assert.deepEqual([w.body.width, w.body.height], [640, 480]);
});

test("T-47 上传 210 KB → 413 too_large（不压缩，直接挡）", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const big = Buffer.concat([png(100, 100), Buffer.alloc(210 * 1024)]);
  const { status, body } = await call(worker, env, "POST", "/image/dishes/x", {
    headers: { ...bearer("chef"), ...LICENSE },
    raw: big,
  });
  assert.equal(status, 413);
  assert.equal(body.errors[0].code, "too_large");
  assert.equal(repo.writeCalls().length, 0);
});

test("T-48 magic bytes 不是图片 → 400，不落盘", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/image/dishes/x", {
    headers: { ...bearer("chef"), ...LICENSE },
    raw: Buffer.from("GIF89a 其实是别的东西", "utf8"),
  });
  assert.equal(status, 400);
  assert.equal(body.errors[0].code, "bad_image");
  assert.equal(repo.writeCalls().length, 0);
});

test("缺 X-Image-License → 400 required（ImageRef.license 是 schema 必填）", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status, body } = await call(worker, env, "POST", "/image/dishes/x", {
    headers: bearer("chef"),
    raw: png(10, 10),
  });
  assert.equal(status, 400);
  assert.deepEqual(body.errors[0].path, "/license");
  assert.equal(body.errors[0].code, "required");
});

test("buyer 不能传图（与其他写入端点同一条权限）", async () => {
  const repo = seeded();
  const { env } = makeEnv(repo);
  const { status } = await call(worker, env, "POST", "/image/dishes/x", {
    headers: { ...bearer("buyer"), ...LICENSE },
    raw: png(10, 10),
  });
  assert.equal(status, 403);
});
