// ADR-0012 / canteen-os#182: original and canteen quantities kept apart, value sources, located unknowns.
// All data here is fabricated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../../apps/api/app.mjs';
import { buildVideoImport } from '../../apps/api/video-candidate.mjs';
import { runImport } from '../../scripts/import-video-candidate.mjs';

const host = '127.0.0.1:4390';
const legacy = JSON.parse(readFileSync(new URL('../fixtures/legacy-revisions.json', import.meta.url), 'utf8'));

async function fixture(t, { legacyRows = false } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'kb-quantities-'));
  let app = await buildApp({ dataDir });
  if (legacyRows) {
    // Rows written by the pre-change code, loaded into a database migrated by this code.
    await app.close();
    const db = new DatabaseSync(join(dataDir, 'knowledge.sqlite'));
    db.exec('PRAGMA foreign_keys=ON');
    for (const [table, rows] of Object.entries(legacy.rows)) {
      for (const row of rows) {
        const columns = Object.keys(row);
        db.prepare(`INSERT INTO "${table}"(${columns.map(c => `"${c}"`).join(',')}) VALUES(${columns.map(() => '?').join(',')})`).run(...columns.map(c => row[c]));
      }
    }
    db.close();
    app = await buildApp({ dataDir });
  }
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { get app() { return app; }, dataDir, dbPath: join(dataDir, 'knowledge.sqlite') };
}

function call(app, method, url, payload, headers = {}) {
  return app.inject({ method, url: `/api/v1${url}`, headers: { host, ...(method === 'GET' ? {} : { 'x-kb-client': 'agent', 'idempotency-key': randomUUID() }), ...headers },
    ...(payload === undefined ? {} : { payload }) });
}
async function ok(app, method, url, payload, headers, status = method === 'POST' ? 201 : 200) {
  const response = await call(app, method, url, payload, headers);
  assert.equal(response.statusCode, status, `${method} ${url}: ${response.body}`);
  return response;
}

const chefDate = '2026-10-19';
function formatThree(stepIds, rowIds) {
  return { recipeFormatVersion: '3', title: { zh: '造的食堂羊肉' }, baseServings: 1,
    ingredients: [
      { id: rowIds[0], name: { zh: '羊肉' }, role: 'main', originalAmount: '5斤', originalQty: { value: '2500', unit: 'g' },
        qty: { value: '150', unit: 'g' }, qtySource: { kind: 'measured', by: '造的师傅甲', date: chefDate },
        kitchenPrep: { timing: 'day-before', leadTime: { value: '12', unit: 'h' } } },
      { id: rowIds[1], name: { zh: '盐' }, role: 'seasoning', originalAmount: '一点点', qty: { value: '1.5', unit: 'g' }, qtySource: { kind: 'rule', ruleId: 'salt-per-serving' } },
      { id: rowIds[2], name: { zh: '油' }, role: 'seasoning' },
    ],
    steps: [{ id: stepIds[0], text: { zh: '羊肉腌好。' } }, { id: stepIds[1], text: { zh: '下锅炸。' } }],
    unknowns: [
      { kind: 'prep-ahead', action: 'marinate', stepId: stepIds[0], text: '造的原话：腌多久没说' },
      { kind: 'heat', stepId: stepIds[1], text: '造的原话：油温没说' },
      { kind: 'identity', ingredientRowId: rowIds[0], text: '造的原话：部位没说' },
      { text: '造的原话：煲多久没说' },
    ] };
}

test('AC1/AC4: legacy revisions read byte-for-byte as before; a format 3 revision returns original, canteen quantity with source, and unknowns', async t => {
  const f = await fixture(t, { legacyRows: true });
  // Old migrations are untouched: no migration was added or changed by this format.
  const migrations = new DatabaseSync(f.dbPath, { readOnly: true });
  t.after(() => migrations.isOpen && migrations.close());
  assert.deepEqual(migrations.prepare('SELECT version,name,sha256 FROM schema_migrations ORDER BY version').all().map(r => ({ ...r })), legacy.capturedWith.migrations);
  migrations.close();

  const goldenRead = async (upgraded = null) => {
    for (const [id, { detail, revisions }] of Object.entries(legacy.golden.recipes)) {
      if (id !== upgraded) assert.equal((await ok(f.app, 'GET', `/recipes/${id}`)).body, detail.body, `detail ${id}`);
      for (const [version, golden] of Object.entries(revisions)) {
        const response = await ok(f.app, 'GET', `/recipes/${id}/revisions/${version}`);
        assert.equal(response.body, golden.body, `revision ${id} v${version}`);
        assert.equal(response.headers.etag, golden.etag);
      }
    }
    for (const [key, body] of Object.entries(legacy.golden.ingredients)) {
      assert.equal((await ok(f.app, 'GET', `/ingredients/${key.includes('/') ? key.replace('/', '/revisions/') : key}`)).body, body, `ingredient ${key}`);
    }
  };
  await goldenRead();

  // Upgrade the reviewed legacy recipe to format 3: a new revision number, the old one untouched (ADR-0009, K6).
  const id = legacy.ids.reviewedRecipe;
  const old = JSON.parse(legacy.golden.recipes[id].revisions[1].body).recipe;
  const rowIds = [old.ingredients[0].id, old.ingredients[1].id, randomUUID()];
  const stepIds = [old.steps[0].id, randomUUID()];
  const body = { ...formatThree(stepIds, rowIds), sources: old.sources };
  const saved = (await ok(f.app, 'PUT', `/recipes/${id}`, body, { 'if-match': '"v1"' })).json();
  assert.equal(saved.version, 2);
  const v2 = (await ok(f.app, 'GET', `/recipes/${id}/revisions/2`)).json();
  assert.equal(v2.recipe.recipeFormatVersion, '3');
  const [meat, salt, oil] = v2.recipe.ingredients;
  assert.deepEqual({ originalAmount: meat.originalAmount, originalQty: meat.originalQty }, { originalAmount: '5斤', originalQty: { value: '2500', unit: 'g' } });
  assert.deepEqual({ qty: meat.qty, qtySource: meat.qtySource }, { qty: { value: '150', unit: 'g' }, qtySource: { kind: 'measured', by: '造的师傅甲', date: chefDate } });
  assert.deepEqual(meat.kitchenPrep.leadTime, { value: '12', unit: 'h' });
  assert.deepEqual(salt.qtySource, { kind: 'rule', ruleId: 'salt-per-serving' });
  assert.equal(salt.originalQty, undefined);
  for (const key of ['amount', 'qty', 'qtySource', 'originalAmount']) assert.equal(key in oil, false);
  assert.deepEqual(v2.recipe.unknowns, body.unknowns);
  assert.equal(v2.version, 2);
  await goldenRead(id);

  // An empty list is never stored or returned (K5), and a removed entry stays only in older versions (K7).
  const third = (await ok(f.app, 'PUT', `/recipes/${id}`, { ...body, unknowns: [] }, { 'if-match': '"v2"' })).json();
  assert.equal('unknowns' in third.recipe, false);
  assert.equal('unknowns' in (await ok(f.app, 'GET', `/recipes/${id}/revisions/3`)).json().recipe, false);
  assert.deepEqual((await ok(f.app, 'GET', `/recipes/${id}/revisions/2`)).json().recipe.unknowns, body.unknowns);

  // An old client cannot save the upgraded recipe back into the single-amount format.
  const downgrade = await call(f.app, 'PUT', `/recipes/${id}`, old, { 'if-match': '"v3"' });
  assert.equal(downgrade.statusCode, 409, downgrade.body);
  assert.equal(downgrade.json().error.code, 'FORMAT_DOWNGRADE');
  await goldenRead(id);
});

test('leaving unknowns out never deletes them: 409 until the client clears them with an explicit []', async t => {
  const f = await fixture(t);
  const rows = [randomUUID(), randomUUID(), randomUUID()], steps = [randomUUID(), randomUUID()];
  const body = formatThree(steps, rows);
  const created = (await ok(f.app, 'POST', '/recipes', body)).json();
  const { unknowns, ...withoutField } = body;
  const first = (await ok(f.app, 'GET', `/recipes/${created.id}/revisions/1`)).body;

  // A client that does not know the field (keeps only some top-level fields) is refused, nothing is saved.
  const dropped = await call(f.app, 'PUT', `/recipes/${created.id}`, { ...withoutField, description: { zh: '只改了备注' } }, { 'if-match': '"v1"' });
  assert.equal(dropped.statusCode, 409, dropped.body);
  assert.equal(dropped.json().error.code, 'UNKNOWNS_REQUIRED');
  assert.match(dropped.json().error.message, /没说清.*请用新版编辑器保存.*明确清空/);
  assert.deepEqual(dropped.json().error.details, { unknownCount: unknowns.length });
  assert.equal((await ok(f.app, 'GET', `/recipes/${created.id}/revisions`)).json().items.length, 1);
  assert.equal((await ok(f.app, 'GET', `/recipes/${created.id}/revisions/1`)).body, first);

  // Sending them back keeps them; an explicit [] clears them all (K7).
  assert.deepEqual((await ok(f.app, 'PUT', `/recipes/${created.id}`, { ...body, description: { zh: '只改了备注' } }, { 'if-match': '"v1"' })).json().recipe.unknowns, unknowns);
  const key = randomUUID();
  const cleared = await ok(f.app, 'PUT', `/recipes/${created.id}`, { ...withoutField, unknowns: [] }, { 'if-match': '"v2"', 'idempotency-key': key });
  assert.equal('unknowns' in cleared.json().recipe, false);
  const replay = await ok(f.app, 'PUT', `/recipes/${created.id}`, { ...withoutField, unknowns: [] }, { 'if-match': '"v2"', 'idempotency-key': key });
  assert.equal(replay.headers['idempotency-replayed'], 'true');
  // Leaving the field out is a different request from clearing it, so the same key cannot stand for both.
  const reused = await call(f.app, 'PUT', `/recipes/${created.id}`, withoutField, { 'if-match': '"v2"', 'idempotency-key': key });
  assert.equal(reused.statusCode, 409, reused.body);
  assert.equal(reused.json().error.code, 'IDEMPOTENCY_KEY_REUSED');

  // Once the last version has none, leaving the field out is fine again.
  assert.equal((await ok(f.app, 'PUT', `/recipes/${created.id}`, withoutField, { 'if-match': '"v3"' })).json().version, 4);
  assert.deepEqual((await ok(f.app, 'GET', `/recipes/${created.id}/revisions/2`)).json().recipe.unknowns, unknowns);
});

test('format 3 rejects mixed shapes, quantities without a source and unknowns pointing outside the recipe', async t => {
  const f = await fixture(t);
  const rows = [randomUUID(), randomUUID(), randomUUID()], steps = [randomUUID(), randomUUID()];
  const valid = formatThree(steps, rows);
  const expect = async (mutate, status, code) => {
    const body = structuredClone(valid);
    mutate(body);
    const response = await call(f.app, 'POST', '/recipes', body);
    assert.equal(response.statusCode, status, response.body);
    assert.equal(response.json().error.code, code);
  };
  await expect(body => { body.ingredients[2].amount = { kind: 'unknown' }; }, 400, 'INVALID_RECIPE');
  await expect(body => { delete body.ingredients[0].qtySource; }, 400, 'INVALID_RECIPE');
  await expect(body => { delete body.ingredients[1].qty; }, 400, 'INVALID_RECIPE');
  await expect(body => { body.ingredients[0].qtySource = { kind: 'rule', ruleId: 'x', by: '造的师傅甲' }; }, 400, 'INVALID_RECIPE');
  await expect(body => { delete body.ingredients[0].qtySource.date; }, 400, 'INVALID_RECIPE');
  await expect(body => { body.ingredients[0].qtySource.ruleId = 'x'; }, 400, 'INVALID_RECIPE');
  await expect(body => { body.ingredients[0].qty.unit = '斤'; }, 400, 'INVALID_RECIPE');
  await expect(body => { delete body.ingredients[0].originalAmount; }, 400, 'INVALID_RECIPE');
  await expect(body => { body.ingredients[0].kitchenPrep.leadTime.unit = 'week'; }, 400, 'INVALID_RECIPE');
  await expect(body => { delete body.unknowns[0].action; }, 400, 'INVALID_RECIPE');
  await expect(body => { body.unknowns[1].action = 'soak'; }, 400, 'INVALID_RECIPE');
  await expect(body => { body.unknowns[3].kind = 'servings'; }, 400, 'INVALID_RECIPE');
  await expect(body => { body.unknowns[1].stepId = randomUUID(); }, 422, 'INVALID_UNKNOWN_REFERENCE');
  await expect(body => { body.unknowns[2].ingredientRowId = randomUUID(); }, 422, 'INVALID_UNKNOWN_REFERENCE');
  await expect(body => { body.unknowns.push({ ...body.unknowns[3] }); }, 422, 'DUPLICATE_UNKNOWN');
  await expect(body => { body.recipeFormatVersion = '2'; }, 400, 'RECIPE_FORMAT_REQUIRED');
  await expect(body => { delete body.recipeFormatVersion; delete body.unknowns; body.ingredients = [{ id: rows[0], name: { zh: '羊肉' }, amount: { kind: 'unknown' }, originalAmount: '5斤' }]; }, 400, 'RECIPE_FORMAT_REQUIRED');
  const created = (await ok(f.app, 'POST', '/recipes', valid)).json();
  assert.deepEqual(created.recipe.unknowns, valid.unknowns);
  // The current relational row keeps the canteen quantity, never the original number.
  const db = new DatabaseSync(f.dbPath, { readOnly: true });
  try {
    assert.deepEqual(db.prepare('SELECT amount_kind,amount_value,amount_unit,amount_raw FROM recipe_ingredients WHERE recipe_id=? ORDER BY position').all(created.id).map(r => ({ ...r })), [
      { amount_kind: 'exact', amount_value: '150', amount_unit: 'g', amount_raw: '5斤' },
      { amount_kind: 'exact', amount_value: '1.5', amount_unit: 'g', amount_raw: '一点点' },
      { amount_kind: 'unknown', amount_value: null, amount_unit: null, amount_raw: '' },
    ]);
  } finally { db.close(); }
  // Adoption issues still work on a format 3 revision: a row without a canteen quantity is an unknown amount.
  const adoption = (await ok(f.app, 'GET', `/recipes/${created.id}/revisions/1/adoption`)).json();
  assert.deepEqual(adoption.issues, ['unmapped-ingredient', 'unmapped-ingredient', 'unmapped-ingredient', 'unknown-amount']);
});

const media = randomBytes(4096);
const sha256 = createHash('sha256').update(media).digest('hex');
const contentId = '7600000000000001820';
const itemUrl = `https://www.douyin.com/video/${contentId}`;
const source = { workId: contentId, sourceUrl: itemUrl, accessMethod: 'user_file', sha256, byteCount: media.length, durationMs: 60000, audioDurationMs: 60000,
  videoDurationMs: 60000, streams: { video: true, audio: true }, analysisCoverage: { audioProcessedThroughMs: 60000, frameCount: 120, lastFrameMs: 59500, maxFrameGapMs: 500 } };
const evidence = ['title', 'meat', 'salt', 'egg', 'ginger', 'soy', 'water', 'marinate', 'fry'].map((id, n) => ({ id, kind: 'subtitle', startMs: n * 2000, endMs: n * 2000 + 1000, text: `造的字幕 ${id}` }));
const candidate = { status: 'needs_human_review', classification: 'recipe', sourceSha256: sha256, title: '造的腌炸羊肉', titleEvidenceIds: ['title'], approvedForMenu: false, approvedForProcurement: false,
  yield: { raw: '两三个人吃', normalized: 3, state: 'stated' },
  ingredients: [
    { name: '羊肉', rawQuantity: '5斤', quantityState: 'stated', evidenceIds: ['meat'], uncertainty: { text: '部位没说', kind: 'identity' } },
    { name: '盐', rawQuantity: '600克', quantityState: 'stated', evidenceIds: ['salt'], uncertainty: [{ text: '是不是一次放完没说', kind: 'amount' }, '盐的种类没说'] },
    { name: '鸡蛋', rawQuantity: '2个', quantityState: 'stated', evidenceIds: ['egg'] },
    { name: '姜', rawQuantity: '3片', quantityState: 'stated', evidenceIds: ['ginger'] },
    { name: '生抽', rawQuantity: '约5克', quantityState: 'stated_imprecise', evidenceIds: ['soy'] },
    { name: '水', rawQuantity: null, quantityState: 'not_stated', evidenceIds: ['water'], uncertainty: '用量没说' },
  ],
  steps: [
    { order: 1, action: '羊肉加盐腌', evidenceIds: ['marinate'], unknowns: [{ text: '腌多久没说', kind: 'prep-ahead', action: 'marinate' }, '盖不盖保鲜膜没说'] },
    { order: 2, action: '下锅炸', evidenceIds: ['fry'], unknowns: [{ text: '油温没说', kind: 'heat' }, { text: '炸到什么样没说', kind: 'doneness' }] },
  ],
  unresolved: ['煲多久没说', { text: '做几份没说', kind: 'other' }] };

// What the candidate said, by location, so the stored entries can be compared one by one.
function expectedByLocation() {
  const plain = value => typeof value === 'string' ? { text: value } : value;
  const list = value => value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(plain);
  return {
    dish: list(candidate.unresolved),
    ingredients: Object.fromEntries(candidate.ingredients.filter(row => row.uncertainty).map(row => [row.name, list(row.uncertainty)])),
    steps: Object.fromEntries(candidate.steps.map(row => [row.order, list(row.unknowns)])),
  };
}
function byLocation(recipe) {
  const strip = ({ stepId: _s, ingredientRowId: _i, ...entry }) => entry;
  const result = { dish: [], ingredients: {}, steps: {} };
  for (const entry of recipe.unknowns) {
    if (entry.stepId) (result.steps[recipe.steps.findIndex(step => step.id === entry.stepId) + 1] ??= []).push(strip(entry));
    else if (entry.ingredientRowId) (result.ingredients[recipe.ingredients.find(row => row.id === entry.ingredientRowId).name.zh] ??= []).push(strip(entry));
    else result.dish.push(strip(entry));
  }
  return result;
}

test('AC2/K1/K2/K4: the importer keeps each unclear point on its step or ingredient with the candidate kind, and saving as a recipe carries them', async t => {
  const f = await fixture(t);
  await f.app.listen({ host: '127.0.0.1', port: 0 });
  const apiBase = `http://127.0.0.1:${f.app.server.address().port}`;
  f.app.kbConfig.allowedOrigins.add(apiBase);
  await ok(f.app, 'POST', '/favorites/import/apply', { folder: '造的', claimedCount: 1, rows: [{ index: '1', folder: '造的', kind: 'video', content_id: contentId, url: itemUrl,
    author: '造的作者', card_alt: '造的卡片', display_text: '造的卡片' }] });
  const item = (await ok(f.app, 'GET', '/favorites/items')).json().items[0];
  const work = await mkdtemp(join(tmpdir(), 'kb-import-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  for (const [name, value] of Object.entries({ 'source.json': source, 'evidence.json': evidence, 'candidate.json': candidate })) await writeFile(join(work, name), JSON.stringify(value));
  await writeFile(join(work, 'media.mp4'), media);
  const options = { apiBase, itemId: item.id, source: join(work, 'source.json'), evidence: join(work, 'evidence.json'), candidate: join(work, 'candidate.json'),
    media: join(work, 'media.mp4'), sourceMethod: 'user_file' };
  const imported = await runImport(options);
  assert.equal(imported.unknownCount, 10);
  assert.equal(imported.unresolvedCount, 10);
  assert.equal((await runImport(options)).candidateReplayed, true);

  const stored = (await ok(f.app, 'GET', `/favorites/candidates/${imported.candidateId}`)).json();
  assert.equal(stored.recipe.recipeFormatVersion, '3');
  assert.deepEqual(byLocation(stored.recipe), expectedByLocation());
  // Unclassified words stay unclassified (K2): no guessed kind.
  assert.deepEqual(stored.recipe.unknowns.filter(entry => !entry.kind).map(entry => entry.text), ['煲多久没说', '盐的种类没说', '用量没说', '盖不盖保鲜膜没说']);
  assert.equal((await ok(f.app, 'GET', '/favorites/items')).json().items[0].candidateSummary.unresolvedCount, 10);

  const reviewed = (await ok(f.app, 'POST', `/favorites/candidates/${imported.candidateId}/review`, { decision: 'approve', reviewer: '造的师傅乙', note: '造的' }, {}, 200)).json();
  const first = (await ok(f.app, 'GET', `/recipes/${reviewed.recipeId}/revisions/1`)).json();
  assert.deepEqual(first.recipe.unknowns, stored.recipe.unknowns);
  assert.deepEqual(byLocation(first.recipe), expectedByLocation());
  assert.equal(first.recipe.baseServings, undefined);
});

test('AC3: numbers the importer reads from the original words appear only as the original', async t => {
  const imported = buildVideoImport({ item: { kind: 'video', url: itemUrl }, source, evidence, candidate, sourceMethod: 'user_file' });
  const rows = imported.proposal.recipe.ingredients;
  assert.deepEqual(rows.map(row => [row.originalAmount, row.originalQty]), [
    ['5斤', { value: '2500', unit: 'g' }], ['600克', { value: '600', unit: 'g' }], ['2个', { value: '2', unit: 'pcs' }],
    ['3片', undefined], ['约5克', undefined], [undefined, undefined]]);
  for (const row of rows) for (const key of ['amount', 'qty', 'qtySource']) assert.equal(key in row, false, `${row.name.zh} ${key}`);

  // Through the API too: the candidate and the recipe saved from it carry no canteen quantity at all.
  const f = await fixture(t);
  await ok(f.app, 'POST', '/favorites/import/apply', { folder: '造的', claimedCount: 1, rows: [{ index: '1', folder: '造的', kind: 'video', content_id: contentId, url: itemUrl,
    author: '造的作者', card_alt: '造的卡片', display_text: '造的卡片' }] });
  const item = (await ok(f.app, 'GET', '/favorites/items')).json().items[0];
  const capture = (await ok(f.app, 'POST', `/favorites/items/${item.id}/captures`, imported.capture)).json();
  const smuggled = structuredClone(imported.proposal);
  smuggled.recipe.ingredients[0] = { ...smuggled.recipe.ingredients[0], qty: { value: '2500', unit: 'g' }, qtySource: { kind: 'specified', by: '造的', date: chefDate } };
  const rejected = await call(f.app, 'POST', `/favorites/items/${item.id}/candidates`, { captureId: capture.id, ...smuggled });
  assert.equal(rejected.statusCode, 400, rejected.body);
  assert.equal(rejected.json().error.code, 'INVALID_CANDIDATE');
  const proposed = (await ok(f.app, 'POST', `/favorites/items/${item.id}/candidates`, { captureId: capture.id, ...imported.proposal })).json();
  const reviewed = (await ok(f.app, 'POST', `/favorites/candidates/${proposed.id}/review`, { decision: 'approve', reviewer: '造的师傅乙', note: '造的' }, {}, 200)).json();
  const recipe = (await ok(f.app, 'GET', `/recipes/${reviewed.recipeId}/revisions/1`)).json().recipe;
  assert.deepEqual(recipe.ingredients, rows);
  assert.equal(JSON.stringify(recipe).includes('"qty"'), false);
});

test('standard ingredient yield and grams-per-piece sources are stored and read back; old ingredient revisions keep their bytes', async t => {
  const f = await fixture(t, { legacyRows: true });
  const spec = { name: { zh: '造的鸡蛋' }, baseUnit: 'g', yield: 0.88, yieldSource: { kind: 'rule', ruleId: 'egg-yield' },
    pcsToGram: 55, pcsToGramSource: { kind: 'measured', by: '造的师傅甲', date: chefDate } };
  const created = (await ok(f.app, 'POST', '/ingredients', spec)).json();
  assert.deepEqual(created.ingredient.yieldSource, spec.yieldSource);
  assert.deepEqual((await ok(f.app, 'GET', `/ingredients/${created.id}`)).json().ingredient.pcsToGramSource, spec.pcsToGramSource);
  const updated = (await ok(f.app, 'PUT', `/ingredients/${created.id}`, { ...spec, yieldSource: { kind: 'specified', by: '造的师傅乙', date: chefDate } }, { 'if-match': '"v1"' })).json();
  assert.equal(updated.version, 2);
  assert.deepEqual((await ok(f.app, 'GET', `/ingredients/${created.id}/revisions/1`)).json().ingredient.yieldSource, spec.yieldSource);
  assert.deepEqual((await ok(f.app, 'GET', `/ingredients/${created.id}/revisions/2`)).json().ingredient.yieldSource, { kind: 'specified', by: '造的师傅乙', date: chefDate });
  for (const bad of [
    { name: { zh: 'x' }, yieldSource: { kind: 'rule', ruleId: 'y' } },
    { name: { zh: 'x' }, pcsToGramSource: { kind: 'measured', by: '甲', date: chefDate } },
    { ...spec, yieldSource: { kind: 'rule' } },
    { ...spec, yieldSource: { kind: 'rule', ruleId: 'y', date: chefDate } },
    { ...spec, pcsToGramSource: { kind: 'specified', by: '甲' } },
    { ...spec, pcsToGramSource: { kind: 'guessed', by: '甲', date: chefDate } },
  ]) {
    const response = await call(f.app, 'POST', '/ingredients', bad);
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'INVALID_INGREDIENT');
  }
  for (const [key, body] of Object.entries(legacy.golden.ingredients)) {
    assert.equal((await ok(f.app, 'GET', `/ingredients/${key.includes('/') ? key.replace('/', '/revisions/') : key}`)).body, body);
  }
});

test('an old single-amount candidate still reviews into a single-amount recipe with its flat unresolved list', async t => {
  const f = await fixture(t, { legacyRows: true });
  const pending = JSON.parse(legacy.golden.candidates[legacy.ids.pendingCandidate]);
  assert.equal((await ok(f.app, 'GET', `/favorites/candidates/${pending.id}`)).body, legacy.golden.candidates[legacy.ids.pendingCandidate]);
  const reviewed = (await ok(f.app, 'POST', `/favorites/candidates/${pending.id}/review`, { decision: 'approve', reviewer: '造的师傅乙', note: '造的' }, {}, 200)).json();
  const recipe = (await ok(f.app, 'GET', `/recipes/${reviewed.recipeId}/revisions/1`)).json().recipe;
  assert.equal(recipe.recipeFormatVersion, undefined);
  assert.equal('unknowns' in recipe, false);
  assert.deepEqual(recipe.ingredients, pending.recipe.ingredients);
  assert.deepEqual(recipe.sources[0].evidence.unresolved, pending.unresolved);
});
