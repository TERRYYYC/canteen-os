/**
 * L1 契约测试的公共装置。
 *
 * 两个刻意的简化，都写在 PR 里：
 *  1. **不用 miniflare / wrangler dev --local**（契约 §6.0 的建议）。测试直接 import
 *     dist/index.js 的 fetch handler，用一个普通对象当 env 传进去 —— 仓库的测试约定是
 *     `node --test` 跑 `.mjs`（packages/core 同款），不引入第二套测试工具，L1 因此在任何
 *     装了 node 的地方都能跑。
 *  2. GitHub API 由下面这个内存假仓库打桩（契约 §6.0 的 L1 行：「GitHub API 用 fetch stub」）。
 *     它按真实 API 的形状回话，blob sha 也是真的 git blob sha（sha1("blob <len>\0" + bytes)），
 *     否则内容幂等（D-05）根本测不出来。
 */
import { createHash, randomUUID } from "node:crypto";

export const WORKER = new URL("../dist/index.js", import.meta.url).href;

export const TOKENS = {
  chef: `chef${"A".repeat(39)}`,
  buyer: `buyer${"B".repeat(38)}`,
  admin: `admin${"C".repeat(38)}`,
};

export const REPO = "TERRYYYC/canteen-os";
export const API = "https://api.github.com";

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sha1Hex(bytes) {
  return createHash("sha1").update(bytes).digest("hex");
}

export function gitBlobSha(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return sha1Hex(Buffer.concat([header, Buffer.from(bytes)]));
}

/** 内存假仓库：flat tree（path -> blobSha）+ commit 链。 */
export class FakeRepo {
  constructor() {
    this.blobs = new Map(); // blobSha -> Buffer
    this.trees = new Map(); // treeSha -> Map(path -> blobSha)
    this.commits = new Map(); // commitSha -> { sha, tree, parents, message, date }
    this.head = null;
    this.calls = []; // { method, path }
    this.runs = [];
    this.jobsByRun = new Map();
    this.dispatches = [];
    this.dispatchStatus = 204;
    this.refUpdateFailures = 0; // 前 N 次 PATCH ref 返回 422（模拟 ref 级冲突）
    this.counter = 0;
    this.buildJson = null;
  }

  addBlob(bytes) {
    const buf = Buffer.from(bytes);
    const sha = gitBlobSha(buf);
    this.blobs.set(sha, buf);
    return sha;
  }

  registerTree(map) {
    const entries = [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    const sha = sha1Hex(Buffer.from(`tree:${entries.map(([p, s]) => `${p}:${s}`).join("\n")}`, "utf8"));
    this.trees.set(sha, new Map(entries));
    return sha;
  }

  /** 取 tree 里某个子目录，注册成独立 tree（rollback 要按 data/ 这个条目替换）。 */
  subtree(treeSha, dir) {
    const flat = this.trees.get(treeSha);
    if (!flat) return null;
    const prefix = `${dir}/`;
    const sub = new Map();
    for (const [path, sha] of flat) if (path.startsWith(prefix)) sub.set(path.slice(prefix.length), sha);
    if (sub.size === 0) return null;
    return this.registerTree(sub);
  }

  commit(files, message = "seed") {
    const map = new Map();
    for (const [path, content] of Object.entries(files)) map.set(path, this.addBlob(Buffer.from(content, "utf8")));
    const tree = this.registerTree(map);
    return this.commitTree(tree, message);
  }

  commitTree(tree, message) {
    this.counter += 1;
    const sha = sha1Hex(Buffer.from(`commit:${this.counter}:${tree}:${message}`, "utf8"));
    const commit = {
      sha,
      tree,
      parents: this.head ? [this.head] : [],
      message,
      date: new Date(1789000000000 + this.counter * 1000).toISOString(),
    };
    this.commits.set(sha, commit);
    this.head = sha;
    return sha;
  }

  fileText(path, ref = this.head) {
    const commit = this.commits.get(ref);
    const flat = commit ? this.trees.get(commit.tree) : this.trees.get(ref);
    const blobSha = flat?.get(path);
    return blobSha ? this.blobs.get(blobSha).toString("utf8") : null;
  }

  /** 只统计写操作（幂等命中时必须为 0，T-21）。 */
  writeCalls() {
    return this.calls.filter((c) => c.method !== "GET");
  }
}

const NOT_FOUND = () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });

/** 把假仓库包成一个 fetch，注入 env.__fetch。 */
export function makeFetch(repo, extra = {}) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    const path = url.pathname;
    repo.calls.push({ method, path, search: url.search });
    const body = init.body ? JSON.parse(init.body) : null;

    for (const [pattern, handler] of Object.entries(extra)) {
      const [m, p] = pattern.split(" ");
      if (m === method && path === p) return handler(url, body);
    }

    const base = `/repos/${REPO}`;
    if (!path.startsWith(base)) {
      if (url.href.endsWith("/data/build.json")) {
        return repo.buildJson
          ? new Response(JSON.stringify(repo.buildJson), { status: 200 })
          : new Response("nope", { status: 404 });
      }
      return NOT_FOUND();
    }
    const rest = path.slice(base.length);

    if (method === "GET" && rest === "/git/ref/heads/main") {
      if (!repo.head) return NOT_FOUND();
      return json({ object: { sha: repo.head } });
    }

    let m;
    if (method === "GET" && (m = /^\/git\/commits\/([0-9a-f]+)$/.exec(rest))) {
      const commit = repo.commits.get(m[1]);
      if (!commit) return NOT_FOUND();
      return json({
        sha: commit.sha,
        tree: { sha: commit.tree },
        message: commit.message,
        author: { date: commit.date },
      });
    }

    if (method === "GET" && (m = /^\/contents\/(.+)$/.exec(rest))) {
      const filePath = decodeURI(m[1]);
      const ref = url.searchParams.get("ref") ?? repo.head;
      const commit = repo.commits.get(ref);
      const flat = commit ? repo.trees.get(commit.tree) : repo.trees.get(ref);
      const blobSha = flat?.get(filePath);
      if (!blobSha) return NOT_FOUND();
      return json({
        sha: blobSha,
        encoding: "base64",
        content: repo.blobs.get(blobSha).toString("base64"),
      });
    }

    if (method === "GET" && (m = /^\/git\/trees\/([0-9a-zA-Z_-]+)$/.exec(rest))) {
      let treeSha = m[1];
      if (treeSha === "main") treeSha = repo.commits.get(repo.head)?.tree;
      else if (repo.commits.has(treeSha)) treeSha = repo.commits.get(treeSha).tree;
      const flat = repo.trees.get(treeSha);
      if (!flat) return NOT_FOUND();
      if (url.searchParams.get("recursive")) {
        return json({
          sha: treeSha,
          tree: [...flat.entries()].map(([p, sha]) => ({ path: p, mode: "100644", type: "blob", sha })),
        });
      }
      const top = new Map();
      for (const [p, sha] of flat) {
        const slash = p.indexOf("/");
        if (slash === -1) top.set(p, { path: p, mode: "100644", type: "blob", sha });
        else {
          const dir = p.slice(0, slash);
          if (!top.has(dir)) {
            top.set(dir, { path: dir, mode: "040000", type: "tree", sha: repo.subtree(treeSha, dir) });
          }
        }
      }
      return json({ sha: treeSha, tree: [...top.values()] });
    }

    if (method === "GET" && (m = /^\/git\/blobs\/([0-9a-f]+)$/.exec(rest))) {
      const blob = repo.blobs.get(m[1]);
      if (!blob) return NOT_FOUND();
      return json({ sha: m[1], encoding: "base64", content: blob.toString("base64") });
    }

    if (method === "GET" && (m = /^\/commits\/([0-9a-zA-Z_-]+)$/.exec(rest))) {
      const wanted = m[1];
      const commit =
        repo.commits.get(wanted) ?? [...repo.commits.values()].find((c) => c.sha.startsWith(wanted));
      if (!commit) return NOT_FOUND();
      const parent = commit.parents[0] ? repo.commits.get(commit.parents[0]) : null;
      const before = parent ? repo.trees.get(parent.tree) : new Map();
      const after = repo.trees.get(commit.tree);
      const files = [];
      for (const [p, sha] of after) if (before.get(p) !== sha) files.push({ filename: p });
      for (const p of before.keys()) if (!after.has(p)) files.push({ filename: p });
      return json({
        sha: commit.sha,
        commit: { message: commit.message, author: { date: commit.date } },
        files,
      });
    }

    if (method === "GET" && (m = /^\/compare\/(.+)\.\.\.(.+)$/.exec(rest))) {
      const base0 = decodeURIComponent(m[1]);
      const headRef = decodeURIComponent(m[2]);
      const headSha = headRef === "main" ? repo.head : headRef;
      const chain = [];
      let cursor = headSha;
      while (cursor && cursor !== base0) {
        const commit = repo.commits.get(cursor);
        if (!commit) break;
        chain.unshift({
          sha: commit.sha,
          commit: { message: commit.message, author: { date: commit.date } },
        });
        cursor = commit.parents[0];
      }
      return json({ commits: chain });
    }

    if (method === "POST" && rest === "/git/blobs") {
      const bytes = body.encoding === "base64" ? Buffer.from(body.content, "base64") : Buffer.from(body.content, "utf8");
      return json({ sha: repo.addBlob(bytes) }, 201);
    }

    if (method === "POST" && rest === "/git/trees") {
      const flat = new Map(body.base_tree ? repo.trees.get(body.base_tree) : []);
      for (const entry of body.tree) {
        if (entry.type === "tree") {
          const prefix = `${entry.path}/`;
          for (const p of [...flat.keys()]) if (p.startsWith(prefix)) flat.delete(p);
          const sub = repo.trees.get(entry.sha);
          if (sub) for (const [p, sha] of sub) flat.set(prefix + p, sha);
        } else if (entry.sha === null) {
          flat.delete(entry.path);
        } else {
          flat.set(entry.path, entry.sha);
        }
      }
      return json({ sha: repo.registerTree(flat) }, 201);
    }

    if (method === "POST" && rest === "/git/commits") {
      repo.counter += 1;
      const sha = sha1Hex(Buffer.from(`commit:${repo.counter}:${body.tree}:${body.message}`, "utf8"));
      repo.commits.set(sha, {
        sha,
        tree: body.tree,
        parents: body.parents,
        message: body.message,
        date: new Date(1789000000000 + repo.counter * 1000).toISOString(),
        author: body.author,
      });
      return json({ sha }, 201);
    }

    if (method === "PATCH" && rest === "/git/refs/heads/main") {
      if (repo.refUpdateFailures > 0) {
        repo.refUpdateFailures -= 1;
        return json({ message: "Update is not a fast forward" }, 422);
      }
      const commit = repo.commits.get(body.sha);
      if (!commit) return NOT_FOUND();
      repo.head = body.sha;
      return json({ object: { sha: body.sha } });
    }

    if (method === "POST" && /^\/actions\/workflows\/[^/]+\/dispatches$/.test(rest)) {
      repo.dispatches.push(body);
      return new Response(null, { status: repo.dispatchStatus });
    }

    if (method === "GET" && /^\/actions\/workflows\/[^/]+\/runs$/.test(rest)) {
      return json({ workflow_runs: repo.runs });
    }

    if (method === "GET" && (m = /^\/actions\/runs\/(\d+)$/.exec(rest))) {
      const run = repo.runs.find((r) => String(r.id) === m[1]);
      return run ? json(run) : NOT_FOUND();
    }

    if (method === "GET" && (m = /^\/actions\/runs\/(\d+)\/jobs$/.exec(rest))) {
      return json({ jobs: repo.jobsByRun.get(Number(m[1])) ?? [] });
    }

    return NOT_FOUND();
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** 造一份 env：三个令牌哈希已设，GitHub 打桩，时钟可控，限流桶每次都是新的。 */
export function makeEnv(repo, overrides = {}) {
  const logs = [];
  const clock = { t: Date.parse("2026-10-19T09:14:00.000Z") };
  const env = {
    TOKEN_HASH_CHEF: sha256Hex(TOKENS.chef),
    TOKEN_HASH_BUYER: sha256Hex(TOKENS.buyer),
    TOKEN_HASH_ADMIN: sha256Hex(TOKENS.admin),
    GITHUB_PAT: "pat-not-a-real-token",
    GITHUB_REPO: REPO,
    GITHUB_BRANCH: "main",
    GITHUB_API_BASE: API,
    PAGES_BASE_URL: "https://terryyyc.github.io/canteen-os/",
    PUBLISH_MODE: "dispatch",
    PUBLISH_WORKFLOW: "build-deploy.yml",
    PUBLISH_CLAIM_TIMEOUT_MS: "90000",
    __fetch: repo ? makeFetch(repo, overrides.__extraRoutes ?? {}) : async () => NOT_FOUND(),
    __log: (entry) => logs.push(entry),
    __now: () => clock.t,
    __sleep: async (ms) => {
      clock.t += ms;
    },
    __requestId: () => "req-fixed-0001",
    __rateStore: new Map(),
    ...overrides,
  };
  return { env, logs, clock };
}

export function bearer(role) {
  return { Authorization: `Bearer ${TOKENS[role]}` };
}

export async function call(worker, env, method, path, { headers = {}, body, raw } = {}) {
  const init = { method, headers: { ...headers } };
  if (raw !== undefined) init.body = raw;
  else if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers["Content-Type"] = "application/json";
  }
  const res = await worker.fetch(new Request(`https://worker.example${path}`, init), env);
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { res, status: res.status, body: parsed, text };
}

export function planFixture(overrides = {}) {
  return {
    schemaVersion: "2",
    name: { zh: "第 43 周菜单" },
    dateRange: { start: "2026-10-19", end: "2026-10-25" },
    meals: [
      { date: "2026-10-19", mealType: "lunch", dishRef: "tomato-egg-stir-fry", plannedServings: 160 },
    ],
    ...overrides,
  };
}

export function ingredientFixture(overrides = {}) {
  return {
    schemaVersion: "2",
    name: { zh: "番茄" },
    baseUnit: "g",
    trackStock: false,
    ...overrides,
  };
}

export { randomUUID };
