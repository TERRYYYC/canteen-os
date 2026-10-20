import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '../..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6D4sAAAAASUVORK5CYII=', 'base64');

async function unusedPort() {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function launch(directory) {
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['apps/api/server.mjs'], {
    cwd: appRoot,
    env: {
      ...process.env,
      KB_DATA_DIR: directory,
      KB_DB_PATH: join(directory, 'knowledge.sqlite'),
      KB_HOST: '127.0.0.1',
      KB_PORT: String(port),
      KB_RELEASE_ID: 'integration-recipe-lifecycle',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log = (log + chunk).slice(-12000); });
  let exited = false;
  const exit = new Promise(resolve => child.once('exit', (code, signal) => { exited = true; resolve({ code, signal }); }));
  const stop = async () => {
    if (exited) return;
    child.kill('SIGTERM');
    const finished = await Promise.race([exit, delay(5000, undefined, { ref: false }).then(() => null)]);
    if (!finished) { child.kill('SIGKILL'); await exit; assert.fail('API failed to stop within five seconds'); }
  };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (exited) assert.fail(`API exited during startup:\n${log}`);
      try {
        const result = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(500) });
        if (result.status === 200) return { base, stop, health: await result.json() };
      } catch {}
      await delay(100);
    }
    assert.fail(`API failed readiness on the configured isolated port:\n${log}`);
  } catch (error) { await stop(); throw error; }
}

function writeOptions(body, key, version) {
  return {
    headers: {
      'content-type': 'application/json',
      'x-kb-client': 'agent',
      ...(key ? { 'idempotency-key': key } : {}),
      ...(version ? { 'if-match': `"v${version}"` } : {}),
    },
    body: JSON.stringify(body),
  };
}

async function json(base, path, { method = 'GET', body, key, version, expected = 200 } = {}) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    ...(body !== undefined ? writeOptions(body, key, version) : {}),
    signal: AbortSignal.timeout(5000),
  });
  const document = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(document)}`);
  return { document, etag: response.headers.get('etag') };
}

// The response body is deliberately lost after its headers arrive. The caller
// learns the recipe identity only by replaying the exact request with its key.
async function discardResponse(base, path, method, body, key, version) {
  const options = writeOptions(body, key, version);
  return new Promise((resolve, reject) => {
    const req = request(`${base}/api/v1${path}`, { method, headers: options.headers, agent: false }, response => {
      response.destroy();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('discarded-response request timed out')));
    req.end(options.body);
  });
}

test('independent same-name recipes retain complete revisions through response loss, restart and archive', { timeout: 45000 }, async t => {
  const directory = await mkdtemp(join(here, '.runtime-'));
  let server;
  t.after(async () => { await server?.stop(); await rm(directory, { recursive: true, force: true }); });
  server = await launch(directory);
  assert.equal(server.health.ok, true);
  const source1 = { kind: 'text', title: '测试原文甲', author: '验收夹具', textContent: '测试原文甲：调料用量未给出。此内容不是实际菜谱。' };
  const source2 = { kind: 'web', title: '测试原文乙', url: 'https://example.test/recipe/b', textContent: '测试原文乙：独立修订资料。' };
  const registered1 = (await json(server.base, '/sources', { method: 'POST', body: source1, expected: 201 })).document;
  const registered2 = (await json(server.base, '/sources', { method: 'POST', body: source2, expected: 201 })).document;
  const video = (await json(server.base, '/assets/external', { method: 'POST', body: { kind: 'video', url: 'https://example.test/video/a' }, expected: 201 })).document;
  const laterCover = (await json(server.base, '/assets/external', { method: 'POST', body: { kind: 'image', url: 'https://example.test/image/later.png' }, expected: 201 })).document;
  const upload = new FormData();
  upload.append('file', new Blob([png], { type: 'image/png' }), 'integration-cover.png');
  const uploadResponse = await fetch(`${server.base}/api/v1/assets/upload`, { method: 'POST', headers: { 'x-kb-client': 'agent' }, body: upload });
  const image = await uploadResponse.json();
  assert.equal(uploadResponse.status, 201, JSON.stringify(image));
  const s1 = randomUUID(), s2 = randomUUID();
  const precise = '0.123456789012345678901234567890123456';
  const recipe = {
    title: { zh: '红烧肉' }, tags: ['集成验收'],
    ingredients: [
      { id: randomUUID(), name: { zh: '五花肉' }, role: 'main', rawText: `测试原文 ${precise} kg`, amount: { kind: 'exact', value: precise, unit: 'kg' } },
      { id: randomUUID(), name: { zh: '酱油' }, role: 'seasoning', rawText: '原文未记录数量', amount: { kind: 'unknown', raw: '原文未记录数量' } },
    ],
    steps: [{ id: s1, text: { zh: '步骤甲：测试步骤。' } }, { id: s2, text: { zh: '步骤乙：测试步骤。' } }],
    sources: [{ sourceId: registered1.id, evidence: { note: '测试来源甲' } }],
    assets: [{ assetId: image.id, role: 'cover' }, { assetId: video.id, role: 'step', stepId: s1, clip: { start: 12.5, end: 18.25 } }],
  };
  const createKey = randomUUID();
  assert.equal(await discardResponse(server.base, '/recipes', 'POST', recipe, createKey), 201);
  const created = await json(server.base, '/recipes', { method: 'POST', body: recipe, key: createKey, expected: 201 });
  const a = created.document;
  assert.equal(created.etag, '"v1"');
  const b = (await json(server.base, '/recipes', { method: 'POST', body: { title: { zh: '红烧肉' } }, key: randomUUID(), expected: 201 })).document;
  assert.notEqual(a.id, b.id);
  assert.equal(b.recipe.baseServings, undefined);
  let listed = (await json(server.base, '/recipes?q=%E7%BA%A2%E7%83%A7%E8%82%89')).document;
  assert.deepEqual(new Set(listed.items.map(row => row.id)), new Set([a.id, b.id]));
  assert.equal(a.recipe.ingredients[0].amount.value, precise);
  assert.equal(a.recipe.ingredients[1].amount.kind, 'unknown');
  assert.equal(a.recipe.ingredients[1].amount.value, undefined);

  const updatedBody = structuredClone(recipe);
  updatedBody.steps.reverse();
  updatedBody.sources = [{ sourceId: registered2.id }];
  updatedBody.assets[0] = { assetId: laterCover.id, role: 'cover' };
  updatedBody.description = { zh: '新的独立修订' };
  const updateKey = randomUUID();
  assert.equal(await discardResponse(server.base, `/recipes/${a.id}`, 'PUT', updatedBody, updateKey, 1), 200);
  const updated = (await json(server.base, `/recipes/${a.id}`, { method: 'PUT', body: updatedBody, key: updateKey, version: 1 })).document;
  assert.equal(updated.version, 2, 'replaying an already committed write must not create version 3');
  assert.deepEqual(updated.recipe.steps.map(step => step.id), [s2, s1]);
  assert.equal(updated.media.find(row => row.assetId === video.id).stepId, s1);
  assert.deepEqual(updated.media.find(row => row.assetId === video.id).clip, { start: 12.5, end: 18.25 });
  await json(server.base, `/recipes/${a.id}`, { method: 'PUT', body: recipe, key: randomUUID(), version: 1, expected: 409 });
  await json(server.base, `/recipes/${a.id}`, { method: 'PUT', body: recipe, key: updateKey, version: 1, expected: 409 });

  const old = (await json(server.base, `/recipes/${a.id}/revisions/1`)).document;
  assert.deepEqual(old.recipe.steps.map(step => step.id), [s1, s2]);
  assert.equal(old.recipe.ingredients[0].amount.value, precise);
  assert.equal(old.media.find(row => row.role === 'cover').assetId, image.id);
  assert.ok(JSON.stringify(old).includes(source1.textContent), 'revision must include original source content, not only an ID');
  assert.ok(!JSON.stringify(old).includes(source2.textContent));
  const current = (await json(server.base, `/recipes/${a.id}`)).document;
  assert.equal(current.media.find(row => row.role === 'cover').assetId, laterCover.id);
  const currentSummary = (await json(server.base, '/recipes?q=%E7%BA%A2%E7%83%A7%E8%82%89')).document.items.find(row => row.id === a.id);
  assert.equal(currentSummary.cover?.assetId, laterCover.id, 'list cover follows the current version');
  assert.equal(currentSummary.cover?.url, laterCover.url);
  const secondRevision = (await json(server.base, `/recipes/${a.id}/revisions/2`)).document;
  assert.ok(JSON.stringify(secondRevision).includes(source2.textContent));
  assert.ok(!JSON.stringify(secondRevision).includes(source1.textContent));

  await server.stop();
  assert.equal((await readFile(join(directory, 'knowledge.sqlite'))).subarray(0, 16).toString(), 'SQLite format 3\0');
  server = await launch(directory);
  const restored = (await json(server.base, `/recipes/${a.id}`)).document;
  assert.equal(restored.version, 2);
  assert.equal(restored.recipe.ingredients[0].amount.value, precise);
  assert.deepEqual(restored.recipe.steps.map(step => step.id), [s2, s1]);
  const restoredImage = await fetch(`${server.base}/api/v1/assets/${image.id}/content`);
  assert.equal(restoredImage.status, 200);
  assert.match(restoredImage.headers.get('content-type'), /^image\/png\b/);
  assert.equal(restoredImage.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await restoredImage.arrayBuffer()), png);

  const archived = (await json(server.base, `/recipes/${a.id}/archive`, { method: 'POST', body: {}, key: randomUUID(), version: 2 })).document;
  assert.ok(archived.archivedAt);
  assert.equal(archived.version, 3);
  listed = (await json(server.base, '/recipes?q=%E7%BA%A2%E7%83%A7%E8%82%89')).document;
  assert.deepEqual(listed.items.map(row => row.id), [b.id]);
  assert.equal((await json(server.base, `/recipes/${b.id}`)).document.version, 1);
  assert.equal((await json(server.base, `/recipes/${a.id}/revisions`)).document.items.length, 3);
  await server.stop();
  server = await launch(directory);
  assert.ok((await json(server.base, `/recipes/${a.id}`)).document.archivedAt);
  assert.deepEqual((await json(server.base, `/recipes?q=%E7%BA%A2%E7%83%A7%E8%82%89`)).document.items.map(row => row.id), [b.id]);
});
