import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir, copyFile, appendFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../../apps/api/app.mjs';
import { openDatabase, assertSQLiteVersion } from '../../apps/api/database.mjs';

const prefix = '/api/v1';
const host = '127.0.0.1:4390';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6s8AAAAASUVORK5CYII=', 'base64');

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'kb-api-'));
  let app = await buildApp({ dataDir });
  const dbPath = join(dataDir, 'knowledge.sqlite');
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { get app() { return app; }, dataDir, dbPath, async reopen() { await app.close(); app = await buildApp({ dataDir }); return app; } };
}

async function call(app, method, path, payload, headers = {}) {
  const requestHeaders = { host, ...(method === 'GET' ? {} : { 'x-kb-client': 'web', 'idempotency-key': randomUUID() }), ...headers };
  for (const name of Object.keys(requestHeaders)) if (requestHeaders[name] === undefined) delete requestHeaders[name];
  return app.inject({ method, url: `${prefix}${path}`, headers: requestHeaders, ...(payload === undefined ? {} : { payload }) });
}

async function create(app, body = { title: { zh: '红烧肉' } }, headers) {
  const response = await call(app, 'POST', '/recipes', body, headers);
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

function inspect(dbPath, fn) {
  const db = new DatabaseSync(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function multipartBody(files) {
  const boundary = 'kb-test-boundary';
  const chunks = files.flatMap(file => [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? 'file'}"; filename="${file.name ?? 'photo.png'}"\r\nContent-Type: ${file.type ?? 'image/png'}\r\n\r\n`), file.bytes, Buffer.from('\r\n')]);
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { host, 'x-kb-client': 'web', 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function upload(app, files = [{ bytes: png }]) {
  return app.inject({ method: 'POST', url: `${prefix}/assets/upload`, ...multipartBody(files) });
}

test('real disk SQLite, same-name recipes, optional unknown fields and exact decimal strings survive restart', async t => {
  const f = await fixture(t);
  const health = await call(f.app, 'GET', '/health');
  assert.deepEqual(Object.keys(health.json()).sort(), ['ok', 'releaseId', 'schemaVersion', 'sqliteVersion']);
  assertSQLiteVersion(health.json().sqliteVersion);
  const first = await create(f.app);
  const amount = '0.12345678901234567890123456789012345670';
  const second = await create(f.app, { title: { zh: '红烧肉' }, ingredients: [
    { id: randomUUID(), name: { zh: '五花肉' }, amount: { kind: 'unknown' } },
    { id: randomUUID(), name: { zh: '酱油' }, role: 'seasoning', rawText: '原文：少许', amount: { kind: 'exact', value: amount, unit: '克', raw: '来源数值' } },
  ] });
  assert.notEqual(first.id, second.id);
  assert.equal('baseServings' in first.recipe, false);
  assert.deepEqual(second.recipe.ingredients[0].amount, { kind: 'unknown' });
  inspect(f.dbPath, db => {
    assert.equal(db.prepare('SELECT count(*) n FROM recipes').get().n, 2);
    const stored = db.prepare("SELECT amount_value,typeof(amount_value) AS type FROM recipe_ingredients WHERE amount_kind='exact'").get();
    assert.equal(stored.amount_value, amount);
    assert.equal(stored.type, 'text');
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  });
  await f.reopen();
  const get = await call(f.app, 'GET', `/recipes/${second.id}`);
  assert.equal(get.headers.etag, '"v1"');
  assert.deepEqual(get.json(), second);
  assert.equal((await call(f.app, 'GET', '/recipes')).json().items.length, 2);
});

test('idempotency replays original response after edits; mismatched body, route and version reject reuse', async t => {
  const f = await fixture(t);
  const key = randomUUID();
  const first = await create(f.app, { title: { zh: '红烧肉' } }, { 'idempotency-key': key });
  const update = await call(f.app, 'PUT', `/recipes/${first.id}`, { title: { zh: '新名称' } }, { 'if-match': '"v1"' });
  assert.equal(update.statusCode, 200, update.body);
  const replay = await call(f.app, 'POST', '/recipes', { title: { zh: '红烧肉' }, tags: [], assets: [], steps: [], ingredients: [], sources: [] }, { 'idempotency-key': key });
  assert.equal(replay.statusCode, 201);
  assert.equal(replay.headers['idempotency-replayed'], 'true');
  assert.deepEqual(replay.json(), first);
  assert.equal((await call(f.app, 'POST', '/recipes', { title: { zh: '不同内容' } }, { 'idempotency-key': key })).statusCode, 409);
  assert.equal((await call(f.app, 'PUT', `/recipes/${first.id}`, { title: { zh: '红烧肉' } }, { 'idempotency-key': key, 'if-match': '"v2"' })).statusCode, 409);
  await f.reopen();
  assert.deepEqual((await call(f.app, 'POST', '/recipes', { title: { zh: '红烧肉' } }, { 'idempotency-key': key })).json(), first);
  assert.equal((await call(f.app, 'GET', `/recipes/${first.id}`)).json().version, 2);
});

test('version conditions, update replay and archive preserve revisions and hide archived list entries', async t => {
  const f = await fixture(t);
  const first = await create(f.app);
  const path = `/recipes/${first.id}`;
  const body = { title: { zh: '第二版' } };
  assert.equal((await call(f.app, 'PUT', path, body)).statusCode, 428);
  const key = randomUUID();
  const saved = await call(f.app, 'PUT', path, body, { 'if-match': '"v1"', 'idempotency-key': key });
  assert.equal(saved.statusCode, 200);
  assert.equal((await call(f.app, 'PUT', path, body, { 'if-match': '"v1"' })).statusCode, 409);
  assert.deepEqual((await call(f.app, 'PUT', path, body, { 'if-match': '"v1"', 'idempotency-key': key })).json(), saved.json());
  assert.equal((await call(f.app, 'PUT', path, body, { 'if-match': '"v2"', 'idempotency-key': key })).statusCode, 409);
  const archiveKey = randomUUID();
  const archive = await call(f.app, 'POST', `${path}/archive`, {}, { 'if-match': '"v2"', 'idempotency-key': archiveKey });
  assert.equal(archive.statusCode, 200, archive.body);
  assert.equal(archive.json().version, 3);
  assert.ok(archive.json().archivedAt);
  assert.equal((await call(f.app, 'GET', '/recipes')).json().items.length, 0);
  assert.deepEqual((await call(f.app, 'POST', `${path}/archive`, {}, { 'if-match': '"v2"', 'idempotency-key': archiveKey })).json(), archive.json());
  assert.equal((await call(f.app, 'PUT', path, body, { 'if-match': '"v3"' })).statusCode, 409);
  assert.deepEqual((await call(f.app, 'GET', `${path}/revisions`)).json().items.map(r => r.version), [3, 2, 1]);
  assert.deepEqual((await call(f.app, 'GET', `${path}/revisions/1`)).json().recipe, first.recipe);
});

test('source and media snapshots remain complete; reordering keeps IDs and full PUT clears optional children', async t => {
  const f = await fixture(t);
  const sourceResponse = await call(f.app, 'POST', '/sources', { kind: 'text', title: '手抄菜谱', textContent: '糖：未写用量。' });
  assert.equal(sourceResponse.statusCode, 201);
  const source = sourceResponse.json();
  const video = (await call(f.app, 'POST', '/assets/external', { kind: 'video', url: 'https://example.com/original.mp4' })).json();
  const steps = [1, 2].map(n => ({ id: randomUUID(), text: { zh: `步骤${n}` } }));
  const ingredients = [1, 2].map(n => ({ id: randomUUID(), name: { zh: `食材${n}` }, amount: { kind: 'unknown' } }));
  const first = await create(f.app, { title: { zh: '红烧肉' }, description: { zh: '来源完整' }, baseServings: 2, ingredients, steps, sources: [{ sourceId: source.id, evidence: { page: 1 } }], assets: [{ assetId: video.id, role: 'step', stepId: steps[0].id, clip: { start: 2, end: 10 } }] });
  const path = `/recipes/${first.id}`;
  const reordered = { ...first.recipe, ingredients: [...ingredients].reverse(), steps: [...steps].reverse() };
  const updated = await call(f.app, 'PUT', path, reordered, { 'if-match': '"v1"' });
  assert.equal(updated.statusCode, 200, updated.body);
  inspect(f.dbPath, db => {
    assert.deepEqual(db.prepare('SELECT id FROM recipe_steps WHERE recipe_id=? ORDER BY position').all(first.id).map(r => r.id), steps.map(s => s.id).reverse());
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    // Direct operator changes demonstrate that old API revisions never join
    // mutable current asset metadata when serving a historical document.
    db.prepare('UPDATE assets SET external_url=? WHERE id=?').run('https://example.com/changed.mp4', video.id);
  });
  const history = (await call(f.app, 'GET', `${path}/revisions/1`)).json();
  assert.equal(history.media[0].url, 'https://example.com/original.mp4');
  assert.equal(history.sourceRecords[0].textContent, '糖：未写用量。');
  assert.deepEqual(history.recipe.steps, steps);
  const clear = await call(f.app, 'PUT', path, { title: { zh: '只留标题' } }, { 'if-match': '"v2"' });
  assert.equal(clear.statusCode, 200, clear.body);
  assert.deepEqual(clear.json().recipe, { title: { zh: '只留标题' }, tags: [], ingredients: [], steps: [], sources: [], assets: [] });
  inspect(f.dbPath, db => {
    for (const table of ['recipe_steps', 'recipe_ingredients', 'recipe_assets', 'recipe_sources']) assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
  });
});

test('fault at snapshot or receipt insertion rolls back current rows, children, history and receipt', async t => {
  const f = await fixture(t);
  const first = await create(f.app, { title: { zh: '原版' }, steps: [{ id: randomUUID(), text: { zh: '原步骤' } }] });
  for (const table of ['recipe_revisions', 'write_receipts']) {
    const key = randomUUID();
    inspect(f.dbPath, db => db.exec(`CREATE TRIGGER injected_failure BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'fault with private SQL/path'); END;`));
    const failed = await call(f.app, 'PUT', `/recipes/${first.id}`, { title: { zh: '不应写入' } }, { 'if-match': '"v1"', 'idempotency-key': key });
    assert.equal(failed.statusCode, 500);
    assert.equal(failed.body.includes('private SQL/path'), false);
    assert.deepEqual((await call(f.app, 'GET', `/recipes/${first.id}`)).json(), first);
    inspect(f.dbPath, db => {
      assert.equal(db.prepare('SELECT count(*) n FROM recipe_revisions').get().n, 1);
      assert.equal(db.prepare('SELECT count(*) n FROM recipe_steps').get().n, 1);
      assert.equal(db.prepare('SELECT count(*) n FROM write_receipts WHERE request_key=?').get(key).n, 0);
      assert.equal(db.prepare('SELECT version FROM recipes WHERE id=?').get(first.id).version, 1);
      db.exec('DROP TRIGGER injected_failure');
    });
  }
  const ok = await call(f.app, 'PUT', `/recipes/${first.id}`, { title: { zh: '可保存' } }, { 'if-match': '"v1"' });
  assert.equal(ok.statusCode, 200);
});

test('reference checks reject duplicate IDs, foreign rows, missing records, invalid steps and clips', async t => {
  const f = await fixture(t);
  const step = { id: randomUUID(), text: { zh: '步骤' } };
  const ingredient = { id: randomUUID(), name: { zh: '肉' }, amount: { kind: 'unknown' } };
  const original = await create(f.app, { title: { zh: '甲' }, steps: [step], ingredients: [ingredient] });
  const image = (await call(f.app, 'POST', '/assets/external', { kind: 'image', url: 'https://example.com/x.png' })).json();
  const video = (await call(f.app, 'POST', '/assets/external', { kind: 'video', url: 'https://example.com/x.mp4' })).json();
  const invalid = [
    { steps: [step, step] }, { ingredients: [ingredient, ingredient] }, { steps: [step] }, { ingredients: [ingredient] },
    { ingredients: [{ ...ingredient, id: randomUUID(), ingredientId: randomUUID() }] },
    { sources: [{ sourceId: randomUUID() }] }, { assets: [{ assetId: randomUUID(), role: 'cover' }] },
    { assets: [{ assetId: image.id, role: 'step', stepId: step.id }] },
    { assets: [{ assetId: image.id, role: 'reference', clip: { start: 0, end: 1 } }] },
    { assets: [{ assetId: video.id, role: 'reference', clip: { start: 2, end: 1 } }] },
    { assets: [{ assetId: image.id, role: 'cover' }, { assetId: image.id, role: 'cover' }] },
  ];
  for (const fields of invalid) {
    const response = await call(f.app, 'POST', '/recipes', { title: { zh: '不能保存' }, ...fields });
    assert.equal(response.statusCode, 422, response.body);
  }
  assert.deepEqual((await call(f.app, 'GET', `/recipes/${original.id}`)).json(), original);
});

test('UUID casing and shape, numeric quantities, unsafe servings and nonfinite clips reject before SQL', async t => {
  const f = await fixture(t);
  const upper = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  for (const id of [upper, `urn:uuid:${randomUUID()}`]) {
    assert.equal((await call(f.app, 'POST', '/recipes', { title: { zh: '甲' }, steps: [{ id, text: { zh: '步骤' } }] })).statusCode, 400);
    assert.equal((await call(f.app, 'GET', `/recipes/${id}`)).statusCode, 400);
    assert.equal((await call(f.app, 'POST', '/sources', { kind: 'file', assetId: id })).statusCode, 400);
  }
  for (const fields of [
    { title: { zh: '   ' } }, { baseServings: Number.MAX_SAFE_INTEGER + 1 },
    { ingredients: [{ id: randomUUID(), name: { zh: '肉' }, amount: { kind: 'exact', value: 0.1, unit: '克' } }] },
    { assets: [{ assetId: randomUUID(), role: 'reference', stepId: randomUUID() }] },
  ]) assert.equal((await call(f.app, 'POST', '/recipes', { title: { zh: '甲' }, ...fields })).statusCode, 400);
  const infinite = '{"title":{"zh":"甲"},"assets":[{"assetId":"' + randomUUID() + '","role":"reference","clip":{"start":0,"end":1e400}}]}';
  assert.equal((await call(f.app, 'POST', '/recipes', infinite, { 'content-type': 'application/json' })).statusCode, 400);
});

test('search uses title and ingredient names, tags are exact, pagination has no duplicate IDs', async t => {
  const f = await fixture(t);
  await create(f.app, { title: { zh: '红烧肉' }, tags: ['家常'] });
  await create(f.app, { title: { zh: '红烧肉' }, tags: ['宴席'] });
  await create(f.app, { title: { zh: '汤' }, tags: ['家常'], ingredients: [{ id: randomUUID(), name: { zh: '五花肉' }, amount: { kind: 'unknown' } }] });
  assert.equal((await call(f.app, 'GET', '/recipes?q=%E8%82%89')).json().items.length, 3);
  assert.equal((await call(f.app, 'GET', '/recipes?q=%E4%BA%94%E8%8A%B1%E8%82%89')).json().items.length, 1);
  assert.equal((await call(f.app, 'GET', '/recipes?tag=%E5%AE%B6%E5%B8%B8')).json().items.length, 2);
  assert.equal((await call(f.app, 'GET', '/recipes?q=%25')).json().items.length, 0);
  const seen = []; let cursor = '';
  do {
    const page = (await call(f.app, 'GET', `/recipes?limit=1${cursor ? `&cursor=${cursor}` : ''}`)).json();
    seen.push(...page.items.map(row => row.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(seen.length, 3);
  assert.equal(new Set(seen).size, 3);
  assert.equal((await call(f.app, 'GET', '/recipes?limit=101')).statusCode, 400);
  assert.equal((await call(f.app, 'GET', '/recipes?cursor=broken')).statusCode, 400);
});

test('upload bytes persist, MIME comes from magic, source attachment snapshots and image content survive reopen', async t => {
  const f = await fixture(t);
  const uploaded = await upload(f.app, [{ bytes: png, name: '../../photo.svg', type: 'image/svg+xml' }]);
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const asset = uploaded.json();
  assert.equal(asset.status, 'ready');
  const source = (await call(f.app, 'POST', '/sources', { kind: 'file', title: '原件', assetId: asset.id })).json();
  const recipe = await create(f.app, { title: { zh: '图文菜谱' }, assets: [{ assetId: asset.id, role: 'cover' }], sources: [{ sourceId: source.id }] });
  assert.equal(recipe.sourceRecords[0].asset.id, asset.id);
  const listed = (await call(f.app, 'GET', '/recipes?q=%E5%9B%BE%E6%96%87')).json().items[0];
  assert.equal(listed.cover?.assetId, asset.id);
  assert.equal(listed.cover?.kind, 'image');
  assert.equal(listed.cover?.url, `/api/v1/assets/${asset.id}/content`);
  await f.reopen();
  const content = await call(f.app, 'GET', `/assets/${asset.id}/content`);
  assert.equal(content.statusCode, 200);
  assert.equal(content.headers['content-type'], 'image/png');
  assert.equal(content.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(content.rawPayload, png);
  assert.equal((await call(f.app, 'GET', `/recipes/${recipe.id}/revisions/1`)).json().media[0].url, asset.url);
  assert.deepEqual(await readdir(join(f.dataDir, 'uploads')), [`${asset.id}.png`]);
});

test('a local image receives an explicit immutable rights assertion before a recipe revision snapshots it',async t=>{
  const f=await fixture(t);
  const uploaded=await upload(f.app);
  assert.equal(uploaded.statusCode,201,uploaded.body);
  const asset=uploaded.json();
  const path=`/assets/${asset.id}/rights`;
  const rights={license:'own',author:'test-chef'};
  const saved=await call(f.app,'POST',path,rights);
  assert.equal(saved.statusCode,200,saved.body);
  assert.deepEqual(saved.json().rights,rights);
  assert.deepEqual((await call(f.app,'POST',path,rights)).json().rights,rights);
  assert.equal((await call(f.app,'POST',path,{license:'CC BY 4.0',author:'another',sourceUrl:'https://example.org/photo'})).statusCode,409);
  assert.equal((await call(f.app,'POST',`/assets/${randomUUID()}/rights`,rights)).statusCode,404);
  assert.equal((await call(f.app,'POST',path,{license:'unknown'})).statusCode,400);
  const forbidden=await upload(f.app);
  assert.equal((await call(f.app,'POST',`/assets/${forbidden.json().id}/rights`,{license:'All rights reserved',author:'owner',sourceUrl:'https://example.org/photo'})).statusCode,400);
  const recipe=await create(f.app,{title:{zh:'测试图菜'},assets:[{assetId:asset.id,role:'cover'}]});
  const detail=(await call(f.app,'GET',`/recipes/${recipe.id}/revisions/1`)).json();
  assert.deepEqual(detail.media[0].rights,rights);
  assert.match(detail.media[0].sha256,/^[0-9a-f]{64}$/);
});

test('legacy image rights may only gain missing attribution; historical recipe metadata stays fixed',async t=>{
  const f=await fixture(t);
  const uploaded=await upload(f.app);
  const assetId=uploaded.json().id;
  inspect(f.dbPath,db=>db.prepare('UPDATE assets SET metadata=? WHERE id=?').run(JSON.stringify({rights:{license:'own',sourceUrl:'images/old-photo.png'}}),assetId));
  const first=await create(f.app,{title:{zh:'旧图片菜'},assets:[{assetId,role:'cover'}]});
  const rights={license:'own',author:'photo owner',sourceUrl:'images/old-photo.png'};
  const path=`/assets/${assetId}/rights`;
  assert.equal((await call(f.app,'POST',path,rights)).statusCode,200);
  assert.deepEqual((await call(f.app,'POST',path,rights)).json().rights,rights);
  assert.equal((await call(f.app,'POST',path,{...rights,license:'CC0',sourceUrl:'https://example.org/old-photo'})).statusCode,409);
  assert.equal((await call(f.app,'POST',path,{...rights,author:'different'})).statusCode,409);
  const historical=(await call(f.app,'GET',`/recipes/${first.id}/revisions/1`)).json();
  assert.deepEqual(historical.media[0].rights,{license:'own',sourceUrl:'images/old-photo.png'});
  const external=await upload(f.app);
  const externalId=external.json().id;
  inspect(f.dbPath,db=>db.prepare('UPDATE assets SET metadata=? WHERE id=?').run(JSON.stringify({rights:{license:'CC0',sourceUrl:'https://example.org'}}),externalId));
  const prior=await create(f.app,{title:{zh:'旧外部许可图片菜'},assets:[{assetId:externalId,role:'cover'}]});
  const completed={license:'CC0',author:'original photographer',sourceUrl:'https://example.org'};
  const externalResult=await call(f.app,'POST',`/assets/${externalId}/rights`,completed);
  assert.equal(externalResult.statusCode,200);
  assert.deepEqual(externalResult.json().rights,completed);
  assert.deepEqual((await call(f.app,'GET',`/recipes/${prior.id}/revisions/1`)).json().media[0].rights,{license:'CC0',sourceUrl:'https://example.org'});
  const credited=await upload(f.app);
  const creditedId=credited.json().id;
  inspect(f.dbPath,db=>db.prepare('UPDATE assets SET metadata=? WHERE id=?').run(JSON.stringify({rights:{license:'CC BY 4.0',author:' Artist '}}),creditedId));
  const creditedPrior=await create(f.app,{title:{zh:'旧作者图片菜'},assets:[{assetId:creditedId,role:'cover'}]});
  const creditedResult=await call(f.app,'POST',`/assets/${creditedId}/rights`,{license:'CC BY 4.0',author:' Artist ',sourceUrl:'https://example.org/photo'});
  assert.equal(creditedResult.statusCode,200);
  assert.deepEqual(creditedResult.json().rights,{license:'CC BY 4.0',author:' Artist ',sourceUrl:'https://example.org/photo'});
  assert.deepEqual((await call(f.app,'GET',`/recipes/${creditedPrior.id}/revisions/1`)).json().media[0].rights,{license:'CC BY 4.0',author:' Artist '});
});

test('unsupported, excessive, duplicate and malformed uploads create no ready asset or persistent file', async t => {
  const f = await fixture(t);
  assert.equal((await upload(f.app, [{ bytes: Buffer.from('<svg/>') }])).statusCode, 415);
  assert.equal((await upload(f.app, [{ bytes: Buffer.concat([png, Buffer.alloc(8 * 1024 * 1024)]) }])).statusCode, 413);
  assert.ok((await upload(f.app, [{ bytes: png }, { bytes: png }])).statusCode >= 400);
  assert.equal((await upload(f.app, [{ bytes: png, field: 'wrong' }])).statusCode, 400);
  const broken = multipartBody([{ bytes: png }]);
  const malformed = await f.app.inject({ method: 'POST', url: `${prefix}/assets/upload`, headers: broken.headers, payload: broken.payload.subarray(0, broken.payload.length - 15) });
  assert.equal(malformed.statusCode, 400, malformed.body);
  assert.equal(malformed.json().error.code, 'INVALID_MULTIPART');
  const missingBoundary = await f.app.inject({ method: 'POST', url: `${prefix}/assets/upload`, headers: { host, 'x-kb-client': 'web', 'content-type': 'multipart/form-data' }, payload: png });
  assert.equal(missingBoundary.statusCode, 400, missingBoundary.body);
  assert.deepEqual(await readdir(join(f.dataDir, 'uploads')), []);
  inspect(f.dbPath, db => assert.equal(db.prepare('SELECT count(*) n FROM assets').get().n, 0));
  inspect(f.dbPath, db => db.exec("CREATE TRIGGER reject_asset BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT,'injected'); END;"));
  assert.equal((await upload(f.app)).statusCode, 500);
  assert.deepEqual(await readdir(join(f.dataDir, 'uploads')), []);
});

test('loopback, Host, Origin and client marker guards cover JSON and uploads; URL registration never accepts executable schemes', async t => {
  const f = await fixture(t);
  await assert.rejects(buildApp({ host: '0.0.0.0', dataDir: f.dataDir }), /loopback/);
  assert.equal((await call(f.app, 'GET', '/health', undefined, { host: 'evil.example:4390' })).statusCode, 403);
  assert.equal((await call(f.app, 'GET', '/health', undefined, { host: 'localhost.evil.example' })).statusCode, 403);
  assert.equal((await call(f.app, 'POST', '/recipes', { title: { zh: '甲' } }, { origin: 'https://evil.example' })).statusCode, 403);
  assert.equal((await call(f.app, 'POST', '/recipes', { title: { zh: '甲' } }, { 'x-kb-client': undefined })).statusCode, 403);
  assert.equal((await call(f.app, 'POST', '/recipes', { title: { zh: '甲' } }, { 'idempotency-key': undefined })).statusCode, 400);
  const allowed = await call(f.app, 'POST', '/recipes', { title: { zh: '甲' } }, { origin: 'http://localhost:5177' });
  assert.equal(allowed.statusCode, 201);
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5177');
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:password@example.com/x']) assert.equal((await call(f.app, 'POST', '/assets/external', { kind: 'video', url })).statusCode, 400);
  assert.equal((await call(f.app, 'POST', '/sources', { kind: 'text' })).statusCode, 400);
  assert.equal((await call(f.app, 'POST', '/assets/external', { kind: 'video', url: 'https://example.invalid/never-fetched.mp4' })).statusCode, 201);
});

test('two connections serialize version-conditioned edits; DB lock returns retriable 503 without receipt', async t => {
  const f = await fixture(t);
  const secondApp = await buildApp({ dataDir: f.dataDir });
  t.after(() => secondApp.close());
  const first = await create(f.app);
  const results = await Promise.all([f.app, secondApp].map((app, index) => call(app, 'PUT', `/recipes/${first.id}`, { title: { zh: `编辑${index}` } }, { 'if-match': '"v1"' })));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
  const locking = new DatabaseSync(f.dbPath);
  locking.exec('BEGIN IMMEDIATE');
  const key = randomUUID();
  let response;
  try { response = await call(f.app, 'POST', '/recipes', { title: { zh: '锁测试' } }, { 'idempotency-key': key }); }
  finally { locking.exec('ROLLBACK'); locking.close(); }
  assert.equal(response.statusCode, 503, response.body);
  assert.equal(response.headers['retry-after'], '1');
  assert.equal((await call(f.app, 'POST', '/recipes', { title: { zh: '锁测试' } }, { 'idempotency-key': key })).statusCode, 201);
});

test('versioned migrations re-open safely, reject changed checksums and roll back failed initialization', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'kb-migrations-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const migrationsDir = join(dir, 'migrations');
  await mkdir(migrationsDir);
  const migration = join(migrationsDir, '001_core.sql');
  await copyFile(new URL('../../db/001_core.sql', import.meta.url), migration);
  const dbPath = join(dir, 'ok.sqlite');
  openDatabase(dbPath, migrationsDir).db.close();
  openDatabase(dbPath, migrationsDir).db.close();
  inspect(dbPath, db => assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n, 1));
  await appendFile(migration, '\n-- changed after apply\n');
  assert.throws(() => openDatabase(dbPath, migrationsDir), /differs/);
  const bad = join(dir, 'bad.sqlite');
  await writeFile(migration, 'BEGIN IMMEDIATE;\nCREATE TABLE should_rollback(id TEXT);\nINVALID SQL;\nCOMMIT;\n');
  assert.throws(() => openDatabase(bad, migrationsDir));
  inspect(bad, db => assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n, 0));
  assert.throws(() => assertSQLiteVersion('3.51.2'), /3.51.3/);
  assert.doesNotThrow(() => assertSQLiteVersion('3.51.3'));
  assert.doesNotThrow(() => assertSQLiteVersion('3.53.1'));
});

test('built web distribution and SPA route are served while missing API stays JSON 404', async t => {
  const f = await fixture(t);
  const webDist = join(f.dataDir, 'web');
  await mkdir(webDist);
  await writeFile(join(webDist, 'index.html'), '<!doctype html><title>真实知识库</title>');
  const app = await buildApp({ dataDir: f.dataDir, webDist });
  t.after(() => app.close());
  assert.equal((await app.inject({ url: '/', headers: { host } })).statusCode, 200);
  assert.equal((await app.inject({ url: '/recipes/demo', headers: { host } })).statusCode, 200);
  const missing = await app.inject({ url: '/api/v1/missing', headers: { host } });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, 'NOT_FOUND');
});
