/**
 * api/client.ts 的单测（#27 前置）：真实 HTTP 客户端 + VITE_WORKER_URL 开关。
 *
 * 跑法：`pnpm -C packages/web test`（node:test，不加依赖）。
 * client.ts 是 TypeScript，这里用 esbuild 现打成一份 ESM 再 import —— esbuild 是 vite 的依赖，
 * pnpm 不会把它提升到 packages/web/node_modules，所以经 vite 的 package.json 解析它的位置。
 * `import.meta.env.VITE_WORKER_URL` 在 Node 里不存在，用 esbuild define 注入（两份产物：不设 / 设了）。
 *
 * 不碰网络：globalThis.fetch 换成记录请求的假实现；令牌从假 sessionStorage 读（admin/token.ts 的 getToken）。
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";

const require = createRequire(import.meta.url);
const entry = require.resolve("../src/api/client.ts");

const tempDirs = [];
after(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

async function bundle(workerUrl) {
  const viteRequire = createRequire(require.resolve("vite/package.json"));
  const esbuild = await import(pathToFileURL(viteRequire.resolve("esbuild")).href);
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    define: { "import.meta.env.VITE_WORKER_URL": JSON.stringify(workerUrl) },
    logLevel: "silent",
  });
  const dir = await mkdtemp(join(tmpdir(), "canteenos-api-client-"));
  tempDirs.push(dir);
  const file = join(dir, `client-${workerUrl ? "http" : "mock"}.mjs`);
  await writeFile(file, result.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}

// —— 假环境 ——

const TOKEN = "A".repeat(43); // worker 契约 §2.1：32 字节 base64url = 43 字符
const BASE = "https://worker.example.invalid";

const storage = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => void storage.set(k, String(v)),
  removeItem: (k) => void storage.delete(k),
};

/** 记录每次请求；responder(req) 决定响应（返回 Response 或抛错） */
function fakeFetch(responder) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const headers = new Headers(init.headers ?? {});
    const req = { url: String(input), method: init.method ?? "GET", headers, body: init.body };
    calls.push(req);
    return responder(req, calls.length);
  };
  return calls;
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

/** worker http.ts 的 fail()：`{ ok:false, errors:[{ path:"", code, message }] }` */
function failure(status, code, message, headers) {
  return json(status, { ok: false, errors: [{ path: "", code, message }] }, headers);
}

const mod = await bundle("");
const { createHttpApi, HttpAdminApi } = mod;
storage.set("canteenos.token", TOKEN);

function api(responder) {
  const calls = fakeFetch(responder);
  return { api: createHttpApi(BASE), calls };
}

async function rejects(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail("expected rejection");
}

// —— 路径 / 方法 / 头 ——

test("getCatalog：GET /catalog + Bearer 令牌，令牌不进 URL，响应去掉 ok", async () => {
  const catalog = { commit: "c1", dishes: {}, ingredients: {}, techniques: [], suppliers: [], translations: { machine: 0, human: 0, stale: 0 } };
  const { api: a, calls } = api(() => json(200, { ok: true, ...catalog }));
  const got = await a.getCatalog();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].url, `${BASE}/catalog`);
  assert.equal(calls[0].headers.get("Authorization"), `Bearer ${TOKEN}`);
  assert.equal(calls[0].headers.get("Content-Type"), null);
  assert.equal(calls[0].body, undefined);
  assert.ok(!calls[0].url.includes(TOKEN));
  assert.deepEqual(got, catalog);
  assert.equal("ok" in got, false);
});

test("base 尾斜杠被去掉", async () => {
  const calls = fakeFetch(() => json(200, { ok: true, onlineCommit: null, lastPublishedAt: null, unpublished: [], publishes: [] }));
  await createHttpApi(`${BASE}/`).getChanges();
  assert.equal(calls[0].url, `${BASE}/changes`);
});

test("savePlan：POST /plan/:planId，JSON 体，If-Match 透传；不带 ifMatch 就没有这个头", async () => {
  const plan = { id: "week-43", meals: [] };
  const { api: a, calls } = api(() => json(200, { ok: true, commit: "c2", blobSha: "b2", unchanged: false, warnings: ["no-if-match"] }));
  const r1 = await a.savePlan("week-43", plan, { ifMatch: "b1" });
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, `${BASE}/plan/week-43`);
  assert.equal(calls[0].headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(calls[0].headers.get("If-Match"), "b1");
  assert.deepEqual(JSON.parse(calls[0].body), plan);
  assert.deepEqual(r1, { commit: "c2", blobSha: "b2", unchanged: false, warnings: ["no-if-match"] });

  await a.savePlan("week-43", plan);
  assert.equal(calls[1].headers.get("If-Match"), null);
});

test("saveIngredient / saveDishDraft / saveDish / rollback / getPublish 的路径与方法（§6.4 对照 worker 路由表）", async () => {
  const write = { ok: true, commit: "c", blobSha: "b", unchanged: false, warnings: [] };
  const { api: a, calls } = api((req) => {
    if (req.url.endsWith("/rollback/abc1234")) return json(200, { ok: true, commit: "r1", restoredFrom: "abc1234full", changedFiles: 3, unchanged: false });
    if (req.url.includes("/publish/")) return json(200, { ok: true, runId: 17, status: "queued", htmlUrl: "", steps: [], failedStep: null, failureReason: null, unmappedSteps: [] });
    return json(200, write);
  });
  await a.saveIngredient("tomato", { id: "tomato" });
  await a.saveDishDraft("borscht", { id: "borscht" });
  await a.saveDish("borscht", { id: "borscht", status: "active" });
  const rb = await a.rollback("abc1234");
  await a.getPublish(17);
  await a.getPublishLatest();
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.url.slice(BASE.length)}`),
    ["POST /ingredient/tomato", "POST /dish/borscht/draft", "POST /dish/borscht", "POST /rollback/abc1234", "GET /publish/17", "GET /publish/latest"],
  );
  assert.deepEqual(rb, { commit: "r1", restoredFrom: "abc1234full", changedFiles: 3 });
});

test("路径参数按 URL 段编码", async () => {
  const { api: a, calls } = api(() => failure(400, "bad_id", "名称只能用小写字母、数字和短横线"));
  await rejects(a.getDish("a/b c"));
  assert.equal(calls[0].url, `${BASE}/source/dish/a%2Fb%20c`);
});

// —— 错误映射 ——

test("400 字段错误 → ApiError.errors 逐条保留，code / message 取第一条，hasFieldErrors 为真", async () => {
  const errors = [
    { path: "/meals/0/plannedServings", code: "type", message: "应为整数" },
    { path: "/meals", code: "minItems", message: "至少要有 1 项" },
  ];
  const { api: a } = api(() => json(400, { ok: false, errors }));
  const err = await rejects(a.savePlan("week-43", {}));
  assert.equal(err.name, "ApiError");
  assert.equal(err.status, 400);
  assert.equal(err.code, "type");
  assert.equal(err.message, "应为整数");
  assert.deepEqual(err.errors, errors);
  assert.equal(err.hasFieldErrors, true);
  assert.equal(err.retryAfter, undefined);
});

for (const [status, code, message] of [
  [401, "unauthorized", "链接失效了，找 Terry 要新的"],
  [403, "forbidden", "你这条链接不能做这件事"],
  [409, "conflict", "有人刚改过，刷新后重试"],
  [413, "too_large", "照片太大了，从后台页面正常上传"],
  [500, "internal_error", "后台出了点问题，把这一步再试一次"],
  [502, "upstream_error", "GitHub 那边出问题了，先看看 PAT 是不是到期了"],
  [503, "dispatch_unavailable", "发布功能暂时关着"],
]) {
  test(`${status} ${code} → ApiError(status, code, message 原样)`, async () => {
    const { api: a } = api(() => failure(status, code, message));
    const err = await rejects(a.publish());
    assert.equal(err.status, status);
    assert.equal(err.code, code);
    assert.equal(err.message, message);
    assert.deepEqual(err.errors, [{ path: "", code, message }]);
    assert.equal(err.hasFieldErrors, false);
  });
}

test("429 rate_limited：retryAfter 取 Retry-After 头（秒）", async () => {
  const { api: a } = api(() => failure(429, "rate_limited", "操作太频繁，等几分钟再试", { "Retry-After": "7" }));
  const err = await rejects(a.saveDish("x", {}));
  assert.equal(err.status, 429);
  assert.equal(err.code, "rate_limited");
  assert.equal(err.retryAfter, 7);
});

test("429 没有 Retry-After 头（CORS 没 expose 时浏览器读不到）→ retryAfter undefined", async () => {
  const { api: a } = api(() => failure(429, "rate_limited", "操作太频繁，等几分钟再试"));
  const err = await rejects(a.saveDish("x", {}));
  assert.equal(err.status, 429);
  assert.equal(err.retryAfter, undefined);
});

test("404 not_found：getPlan / getIngredient / getDish → null；其它端点照抛", async () => {
  const { api: a, calls } = api(() => failure(404, "not_found", "没找到这个版本"));
  assert.equal(await a.getPlan("week-99"), null);
  assert.equal(await a.getIngredient("nope"), null);
  assert.equal(await a.getDish("nope"), null);
  assert.deepEqual(
    calls.map((c) => c.url.slice(BASE.length)),
    ["/source/plan/week-99", "/source/ingredient/nope", "/source/dish/nope"],
  );
  const err = await rejects(a.getPublish(1));
  assert.equal(err.status, 404);
  assert.equal(err.code, "not_found");
  const err2 = await rejects(a.rollback("abc1234"));
  assert.equal(err2.status, 404);
});

test("getPlan 命中：返回 { content, blobSha, commit }", async () => {
  const content = { id: "week-43", meals: [] };
  const { api: a } = api(() => json(200, { ok: true, content, blobSha: "b1", commit: "c1" }));
  assert.deepEqual(await a.getPlan("week-43"), { content, blobSha: "b1", commit: "c1" });
});

test("网络错误 / 超时（fetch 抛）→ ApiError status 0 code network", async () => {
  const { api: a } = api(() => {
    throw new TypeError("Failed to fetch");
  });
  const err = await rejects(a.getCatalog());
  assert.equal(err.name, "ApiError");
  assert.equal(err.status, 0);
  assert.equal(err.code, "network");
  assert.equal(err.message, "");
});

test("非 worker 的错误体（Cloudflare 52x 页）→ ApiError(status, bad_response, '')", async () => {
  const { api: a } = api(() => new Response("<html>522</html>", { status: 522, headers: { "Content-Type": "text/html" } }));
  const err = await rejects(a.getCatalog());
  assert.equal(err.status, 522);
  assert.equal(err.code, "bad_response");
  assert.equal(err.message, "");
});

test("无令牌：不发请求，直接 401 unauthorized", async () => {
  storage.delete("canteenos.token");
  try {
    const { api: a, calls } = api(() => json(200, { ok: true }));
    const err = await rejects(a.getCatalog());
    assert.equal(err.status, 401);
    assert.equal(err.code, "unauthorized");
    assert.equal(calls.length, 0);
  } finally {
    storage.set("canteenos.token", TOKEN);
  }
});

// —— 缓存 ——

function catalogOf(commit) {
  return { ok: true, commit, dishes: {}, ingredients: {}, techniques: [], suppliers: [], translations: { machine: 0, human: 0, stale: 0 } };
}
function changesOf(n) {
  return { ok: true, onlineCommit: "o", lastPublishedAt: null, unpublished: new Array(n).fill({ sha: "s" }), publishes: [], truncated: false, warnings: [] };
}
const writeOk = { ok: true, commit: "c", blobSha: "b", unchanged: false, warnings: [] };

test("getCatalog / getChanges 有缓存；force 重取；返回的是副本", async () => {
  let n = 0;
  const { api: a, calls } = api((req) => {
    if (req.url.endsWith("/catalog")) return json(200, catalogOf(`c${++n}`));
    return json(200, changesOf(1));
  });
  const first = await a.getCatalog();
  const second = await a.getCatalog();
  assert.equal(calls.length, 1);
  assert.equal(second.commit, "c1");
  first.dishes.mutated = true;
  assert.equal("mutated" in (await a.getCatalog()).dishes, false);
  await a.getChanges();
  await a.getChanges();
  assert.equal(calls.length, 2);
  const forced = await a.getCatalog({ force: true });
  assert.equal(forced.commit, "c2");
  assert.equal(calls.length, 3);
});

test("任何写入成功后 getCatalog / getChanges 重新请求（写入失败不失效）", async () => {
  let fail = false;
  const { api: a, calls } = api((req) => {
    if (req.url.endsWith("/catalog")) return json(200, catalogOf("c"));
    if (req.url.endsWith("/changes")) return json(200, changesOf(1));
    if (fail) return failure(409, "conflict", "有人刚改过，刷新后重试");
    if (req.url.endsWith("/publish")) return json(200, { ok: true, runId: 5, mode: "dispatch", requestId: "r" });
    if (req.url.includes("/rollback/")) return json(200, { ok: true, commit: "c", restoredFrom: "x", changedFiles: 1, unchanged: false });
    if (req.url.includes("/image/")) return json(200, { ...writeOk, image: { src: "data/dishes/x/images/cover.jpg", license: "own" }, width: 1, height: 1, bytes: 3 });
    return json(200, writeOk);
  });
  const reads = () => calls.filter((c) => c.method === "GET").length;
  const warm = async () => {
    await a.getCatalog();
    await a.getChanges();
  };
  await warm();
  assert.equal(reads(), 2);

  const writes = [
    () => a.savePlan("week-43", {}),
    () => a.saveIngredient("t", {}),
    () => a.saveDishDraft("d", {}),
    () => a.saveDish("d", {}),
    () => a.uploadImage("dishes", "x", new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), { license: "own" }),
    () => a.publish(),
    () => a.rollback("abc1234"),
  ];
  let expected = 2;
  for (const w of writes) {
    await w();
    await warm();
    expected += 2;
    assert.equal(reads(), expected);
  }

  fail = true;
  await rejects(a.savePlan("week-43", {}));
  await warm();
  assert.equal(reads(), expected, "写入失败不该清缓存");
});

test("getPublish 报 success → changes 失效、catalog 不动；非终态不失效", async () => {
  let status = "in_progress";
  const { api: a, calls } = api((req) => {
    if (req.url.endsWith("/catalog")) return json(200, catalogOf("c"));
    if (req.url.endsWith("/changes")) return json(200, changesOf(0));
    return json(200, { ok: true, runId: 5, status, htmlUrl: "", steps: [], failedStep: null, failureReason: null, unmappedSteps: [] });
  });
  await a.getCatalog();
  await a.getChanges();
  await a.getPublish(5);
  await a.getChanges();
  assert.equal(calls.filter((c) => c.url.endsWith("/changes")).length, 1);
  status = "success";
  await a.getPublishLatest();
  await a.getChanges();
  await a.getCatalog();
  assert.equal(calls.filter((c) => c.url.endsWith("/changes")).length, 2);
  assert.equal(calls.filter((c) => c.url.endsWith("/catalog")).length, 1);
});

// —— 发布 / 翻译 / 传图 ——

test("publish：POST /publish，返回 runId + mode（requestId 不透出）；push-trigger 带 commit", async () => {
  let mode = "dispatch";
  const { api: a, calls } = api(() =>
    mode === "dispatch"
      ? json(200, { ok: true, runId: 17240002, mode, requestId: "uuid" })
      : json(200, { ok: true, runId: null, mode, commit: "deadbeef" }),
  );
  assert.deepEqual(await a.publish(), { runId: 17240002, mode: "dispatch" });
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, `${BASE}/publish`);
  mode = "push-trigger";
  assert.deepEqual(await a.publish(), { runId: null, mode: "push-trigger", commit: "deadbeef" });
});

test("getPublish：响应去掉 ok，其余原样（含 slow）", async () => {
  const progress = { runId: 5, status: "in_progress", htmlUrl: "https://x", steps: [{ key: "build", label: "生成三张单", state: "in_progress", startedAt: null, completedAt: null }], failedStep: null, failureReason: null, unmappedSteps: [], slow: true };
  const { api: a } = api(() => json(200, { ok: true, ...progress }));
  assert.deepEqual(await a.getPublish(5), progress);
});

test("translate：请求 { text, targets }，返回 worker 的 translations；没配翻译服务 → {}", async () => {
  let configured = true;
  const { api: a, calls } = api(() =>
    configured
      ? json(200, { ok: true, translations: { en: "Tomato", uk: "Помідор" }, warnings: [] })
      : json(200, { ok: true, translations: {}, warnings: ["translate-unavailable"] }),
  );
  assert.deepEqual(await a.translate("番茄", ["en", "uk"]), { en: "Tomato", uk: "Помідор" });
  assert.equal(calls[0].url, `${BASE}/translate`);
  assert.deepEqual(JSON.parse(calls[0].body), { text: "番茄", targets: ["en", "uk"] });
  assert.deepEqual(await a.translate("番茄"), { en: "Tomato", uk: "Помідор" });
  assert.deepEqual(JSON.parse(calls[1].body), { text: "番茄" });
  configured = false;
  assert.deepEqual(await a.translate("番茄"), {});
});

test("uploadImage：POST /image/:kind/:id，请求体是原始 Blob，元数据走 X-Image-* 头，返回 image", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const blob = new Blob([bytes], { type: "image/jpeg" });
  const { api: a, calls } = api(() =>
    json(200, {
      ...writeOk,
      image: { src: "data/ingredients/tomato/images/cover.jpg", license: "CC0", author: "Ann", sourceUrl: "https://commons.example/x" },
      width: 640,
      height: 480,
      bytes: 4,
    }),
  );
  const ref = await a.uploadImage("ingredients", "tomato", blob, { license: "CC0", author: "Ann", sourceUrl: "https://commons.example/x" });
  const req = calls[0];
  assert.equal(req.method, "POST");
  assert.equal(req.url, `${BASE}/image/ingredients/tomato`);
  assert.equal(req.body, blob);
  assert.deepEqual(new Uint8Array(await req.body.arrayBuffer()), bytes);
  assert.equal(req.headers.get("Content-Type"), "image/jpeg");
  assert.equal(req.headers.get("X-Image-License"), "CC0");
  assert.equal(req.headers.get("X-Image-Author"), "Ann");
  assert.equal(req.headers.get("X-Image-Source-Url"), "https://commons.example/x");
  assert.equal(req.headers.get("X-Image-Name"), null);
  assert.deepEqual(ref, { src: "data/ingredients/tomato/images/cover.jpg", license: "CC0", author: "Ann", sourceUrl: "https://commons.example/x" });
});

test("uploadImage：没有 author / sourceUrl 就不发那两个头；无 type 的 Blob → application/octet-stream", async () => {
  const { api: a, calls } = api(() => json(200, { ...writeOk, image: { src: "s", license: "own" }, width: 1, height: 1, bytes: 1 }));
  const ref = await a.uploadImage("dishes", "borscht", new Blob([new Uint8Array([1])]), { license: "own" });
  assert.equal(calls[0].headers.get("X-Image-Author"), null);
  assert.equal(calls[0].headers.get("X-Image-Source-Url"), null);
  assert.equal(calls[0].headers.get("Content-Type"), "application/octet-stream");
  assert.deepEqual(ref, { src: "s", license: "own" });
});

test("uploadImage：非 Latin-1 的作者名（fetch 头不接受）按百分号编码送出，不抛", async () => {
  const { api: a, calls } = api(() => json(200, { ...writeOk, image: { src: "s", license: "own" }, width: 1, height: 1, bytes: 1 }));
  await a.uploadImage("dishes", "borscht", new Blob([new Uint8Array([1])]), { license: "own", author: "Терри 张" });
  assert.equal(calls[0].headers.get("X-Image-Author"), encodeURIComponent("Терри 张"));
});

test("uploadImage 413 too_large → ApiError 413", async () => {
  const { api: a } = api(() => failure(413, "too_large", "照片太大了，从后台页面正常上传"));
  const err = await rejects(a.uploadImage("dishes", "x", new Blob([new Uint8Array(3)]), { license: "own" }));
  assert.equal(err.status, 413);
  assert.equal(err.code, "too_large");
});

// —— 开关 ——

test("getApi()：VITE_WORKER_URL 为空 → mock（不发任何请求）", async () => {
  const calls = fakeFetch(() => {
    throw new Error("mock 不该发请求");
  });
  storage.set("canteenos.mock", JSON.stringify({ latencyMs: 0 }));
  const a = mod.getApi();
  assert.equal(mod.getApi(), a, "单例");
  assert.equal(a instanceof mod.HttpAdminApi, false);
  const catalog = await a.getCatalog();
  assert.equal(calls.length, 0);
  assert.ok(Object.keys(catalog.ingredients).length > 0, "mock 自带种子数据");
});

test("getApi()：VITE_WORKER_URL 设了 → 走 HTTP（带尾斜杠也行）", async () => {
  const httpMod = await bundle(`${BASE}/`);
  const calls = fakeFetch(() => json(200, catalogOf("c")));
  const a = httpMod.getApi();
  assert.equal(httpMod.getApi(), a);
  await a.getCatalog();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE}/catalog`);
  assert.equal(calls[0].headers.get("Authorization"), `Bearer ${TOKEN}`);
});

test("HttpAdminApi 可注入 fetch / token（不依赖全局）", async () => {
  const seen = [];
  const http = new HttpAdminApi(BASE, {
    fetch: async (url, init) => {
      seen.push({ url, auth: new Headers(init.headers).get("Authorization") });
      return json(200, catalogOf("c9"));
    },
    token: () => "B".repeat(43),
  });
  const catalog = await http.getCatalog();
  assert.equal(catalog.commit, "c9");
  assert.equal(seen[0].auth, `Bearer ${"B".repeat(43)}`);
});
