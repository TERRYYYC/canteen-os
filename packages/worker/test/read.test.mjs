/**
 * 三个只读端点：GET /source/:kind/:id（D-06）、GET /catalog、GET /changes
 * （后两个来自 2026-09-08 决议追加第 3 条 / 前端契约 §6.3）。
 * 共同约束：**不产生任何 commit**。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeRepo, WORKER, bearer, call, makeEnv } from "./helpers.mjs";
import { PNG_A } from './image-fixtures.mjs';

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

test("legacy frozen KB evidence remains readable but never reaches catalog or source responses", async () => {
  const repo = seeded();
  const dishId = 'kb-3f4c6638dcf84231966c1c5e2816c059-v1';
  const legacy = {
    schemaVersion: '3', name: { zh: '测试菜' }, status: 'active',
    components: [{ ingredientRef: 'tomato', originalAmount: '1 克', originalText: 'PRIVATE_RAW_LINE' }],
    image: { src: 'kb-cover.png', license: 'own', author: 'chef', sourceUrl: 'https://host.internal./PRIVATE_IMAGE_ATTRIBUTION' },
    steps: [{ text: { zh: '煮熟' }, clip: { videoUrl: 'https://example.org/PRIVATE_VIDEO', start: 1, end: 2 } }],
    provenance: {
      source: 'knowledge', recipeId: '3f4c6638-dcf8-4231-966c-1c5e2816c059', recipeVersion: 1,
      candidateId: 'e2068014-7d9e-4e74-b24d-32f12554e7c4', snapshotHash: 'a'.repeat(64),
      review: { reviewer: 'chef', note: 'PRIVATE_REVIEW_NOTE', approvedCandidateVersion: 1 },
      sourceUrl: 'https://example.org/PRIVATE_SOURCE_URL',
      evidence: {
        sourceRecords: [{ textContent: 'PRIVATE_TRANSCRIPT_SENTINEL' }],
        sourceRefs: [{ quote: 'PRIVATE_QUOTE' }],
        media: [{ kind: 'image', role: 'cover', url: 'https://example.org/PRIVATE_MEDIA_URL' }],
        unresolved: ['PRIVATE_SOURCE_GAP'],
      },
    },
  };
  repo.commit({ ['data/dishes/' + dishId + '.json']: JSON.stringify(legacy), 'data/dishes/kb-cover.png': PNG_A });
  const { env } = makeEnv(repo);
  const catalog = await call(worker, env, 'GET', '/catalog', { headers: bearer('buyer') });
  assert.equal(catalog.status, 200, JSON.stringify(catalog.body));
  assert.doesNotMatch(JSON.stringify(catalog.body), /PRIVATE_/);
  assert.equal(catalog.body.dishes[dishId].provenance.sourceGapCount, 1);
  assert.equal(catalog.body.dishes[dishId].provenance.coverState, 'rights-pending');
  assert.equal(catalog.body.dishes[dishId].image, undefined);
  for (const role of ['buyer', 'chef']) {
    const source = await call(worker, env, 'GET', '/source/dish/' + dishId, { headers: bearer(role) });
    assert.equal(source.status, 200, JSON.stringify(source.body));
    assert.doesNotMatch(JSON.stringify(source.body), /PRIVATE_/);
    assert.equal(source.body.content.components[0].originalAmount, '1 克');
    assert.equal(source.body.content.image, undefined);
  }
  const image = await call(worker, env, 'GET', `/asset?revision=${repo.head}&owner=${encodeURIComponent('data/dishes/' + dishId + '.json')}&pointer=%2Fimage`, { headers: bearer('buyer') });
  assert.equal(image.status, 422, 'legacy private-attribution image bytes must not be served');
  assert.match(repo.fileText('data/dishes/' + dishId + '.json'), /PRIVATE_TRANSCRIPT_SENTINEL/, 'read projection must not rewrite the private Git head');
});

test("GET /catalog paginates more than 200 Git files at one fixed revision", async () => {
  const repo = new FakeRepo();
  const files = Object.fromEntries(Array.from({ length: 201 }, (_, i) =>
    [`data/ingredients/item-${String(i).padStart(3, '0')}.json`, TOMATO]));
  repo.commit(files, "many ingredients");
  const { env } = makeEnv(repo);
  let cursor = null;
  const found = new Set();
  let pages = 0;
  do {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const { status, body } = await call(worker, env, "GET", `/catalog${suffix}`, { headers: bearer("buyer") });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.commit, repo.head);
    for (const id of Object.keys(body.ingredients)) found.add(id);
    cursor = body.nextCursor;
    pages++;
    assert(pages < 10, 'cursor must advance');
  } while (cursor);
  assert.equal(found.size, 201);
  assert(pages > 1);
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
