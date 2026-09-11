/** L1 客户端-接口组合验证. Folder reserved for future E2E; no browser or L2 claim. */
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createShoppingList, applyShoppingDecision, reconcileShoppingList } from '../../../../core/dist/index.js';
import { PNG_B } from '../../../../worker/test/image-fixtures.mjs';
import { loadClient, setup, inputsAt, saveOK, selection, json, clone, filesAt, changedFiles } from './helpers.mjs';

let client;
let nativeFetch;
let nativeAttempts = 0;
before(async t => {
  nativeFetch = globalThis.fetch;
  globalThis.fetch = async () => { nativeAttempts++; throw new Error('Native network forbidden in L1'); };
  client = await loadClient(t);
});
after(() => {
  globalThis.fetch = nativeFetch;
  assert.equal(nativeAttempts, 0, 'all requests must use the local bridge and GitHub FakeRepo');
});
const item = (list, id = 'tomato') => list.items.find(row => row.ingredientRef === id);
const posts = h => h.requests.filter(request => request.method === 'POST');
const errorIs = (status, code) => error => {
  assert.ok(error instanceof client.ApiError);
  assert.equal(error.status, status);
  assert.equal(error.code, code);
  return true;
};

test('L1 plan: absent servings survive editor save, strong-lock update, and fixed readback', async t => {
  const h = await setup(t, client);
  const api = h.api('chef');
  const draft = (await api.getPlan('team-week', { revision: h.revision })).content;
  const editor = h.editor(api, { kind: 'plan', id: 'team-local' }, draft);
  const created = await saveOK(editor);
  assert.equal(editor.getState().phase, 'saved-but-unpublished');
  assert.equal(editor.getState().lastSave.mode, 'mock');
  assert.equal(posts(h)[0].ifNoneMatch, '*');
  assert.equal(posts(h)[0].ifMatch, null);
  assert.deepEqual(posts(h)[0].body, draft);
  const readback = await api.getPlan('team-local', { revision: created.commit });
  assert.deepEqual(readback, created);
  for (const meal of readback.content.meals.slice(0, 2)) assert.equal(Object.hasOwn(meal, 'plannedServings'), false);
  assert.equal(readback.content.meals[2].plannedServings, 2);
  const renamed = clone(draft);
  renamed.name.zh = '组合验证菜单';
  editor.edit(renamed);
  const updated = await saveOK(editor);
  assert.equal(posts(h)[1].ifMatch, created.blobSha);
  assert.notEqual(updated.blobSha, created.blobSha);
  assert.deepEqual((await api.getPlan('team-local', { revision: updated.commit })).content, renamed);
  assert.deepEqual(changedFiles(h.repo, h.revision), ['data/menu-plans/team-local.json']);
});

test('L1 shopping: create → judgment → changed demand → rejected combined save → rebase and separate confirmation', async t => {
  const h = await setup(t, client);
  const buyer = h.api(), chef = h.api('chef');
  const oldInputs = await inputsAt(buyer, h.revision);
  const list = createShoppingList('team-shop', { sourceRevision: h.revision, selection }, oldInputs);
  assert.deepEqual(list.items, ['cooking-oil', 'salt', 'tomato', 'tomato-other'].map(ingredientRef => ({ ingredientRef, decision: 'check' })));
  const editor = h.editor(buyer, { kind: 'shopping-list', id: list.id }, list);
  await saveOK(editor);
  const judged = applyShoppingDecision(list, 'tomato', 'buy', true);
  editor.edit(judged);
  const judgedSource = await saveOK(editor);
  assert.deepEqual((await buyer.getShoppingList(list.id, { revision: judgedSource.commit })).content, judged);

  const dish = await chef.getDish('first-dish', { revision: judgedSource.commit });
  const changedDish = clone(dish.content);
  changedDish.components.find(row => row.ingredientRef === 'tomato').qty.value = 301;
  const demandWrite = await chef.saveDish('first-dish', changedDish, { ifMatch: dish.blobSha });
  const nextInputs = await inputsAt(buyer, demandWrite.commit);
  const rebased = reconcileShoppingList(judged, oldInputs, { sourceRevision: demandWrite.commit, selection }, nextInputs);
  assert.deepEqual(rebased.reviewRequired, ['tomato']);
  assert.deepEqual(item(rebased.list), { ingredientRef: 'tomato', decision: 'check', previous: { basis: list.basis, decision: 'buy', bought: true } });

  const combined = applyShoppingDecision(rebased.list, 'tomato', 'available');
  editor.edit(combined);
  const beforeRejection = h.repo.head;
  const writesBeforeRejection = h.repo.writeCalls().length;
  assert.equal((await editor.save()).status, 'conflict');
  const failure = editor.getState();
  assert.equal(failure.error.status, 409);
  assert.equal(failure.error.code, 'review_required');
  assert.deepEqual(failure.error.reviewRequired, ['tomato']);
  assert.deepEqual(posts(h).at(-1).response.reviewRequired, failure.error.reviewRequired);
  assert.deepEqual(failure.draft, combined);
  assert.deepEqual(failure.source, judgedSource);
  assert.equal(h.repo.head, beforeRejection);
  assert.equal(h.repo.writeCalls().length, writesBeforeRejection);

  const current = await buyer.getShoppingList(list.id, { force: true });
  editor.replace(rebased.list, current);
  const rebaseSource = await saveOK(editor);
  assert.equal(posts(h).at(-1).ifMatch, current.blobSha);
  const rebaseRead = await buyer.getShoppingList(list.id, { revision: rebaseSource.commit });
  assert.deepEqual(rebaseRead.content, rebased.list);
  assert.ok(item(rebaseRead.content).previous);
  const confirmed = applyShoppingDecision(rebaseRead.content, 'tomato', 'available');
  editor.edit(confirmed);
  const confirmationSource = await saveOK(editor);
  assert.equal(posts(h).at(-1).ifMatch, rebaseSource.blobSha);
  assert.notEqual(confirmationSource.commit, rebaseSource.commit);
  assert.deepEqual((await buyer.getShoppingList(list.id, { revision: confirmationSource.commit })).content, confirmed);
  assert.equal(Object.hasOwn(item(confirmed), 'previous'), false);
  assert.equal(item(confirmed).decision, 'available');
  assert.deepEqual(changedFiles(h.repo, h.revision), ['data/dishes/first-dish.json', 'data/shopping-lists/team-shop.json']);
});

test('L1 two clients: create collision and stale-lock update keep the losing editor draft', async t => {
  const h = await setup(t, client);
  const apis = [h.api(), h.api()];
  const inputs = await inputsAt(apis[0], h.revision);
  const list = createShoppingList('contended-shop', { sourceRevision: h.revision, selection }, inputs);
  const identity = { kind: 'shopping-list', id: list.id };
  const editors = apis.map(api => h.editor(api, identity, list));
  const results = await Promise.all(editors.map(editor => editor.save()));
  assert.deepEqual(results.map(result => result.status).sort(), ['conflict', 'saved']);
  assert.deepEqual(posts(h).map(request => request.ifNoneMatch), ['*', '*']);
  const losing = editors[results.findIndex(result => result.status === 'conflict')];
  assert.deepEqual(losing.getState().draft, list);
  assert.equal(losing.getState().source, null);
  assert.equal(losing.getState().error.code, 'conflict');
  const beforeRetry = posts(h).length;
  assert.equal((await losing.save()).status, 'blocked');
  assert.equal(posts(h).length, beforeRetry);

  const sources = await Promise.all(apis.map(api => api.getShoppingList(list.id, { force: true })));
  assert.equal(sources[0].blobSha, sources[1].blobSha);
  const drafts = [applyShoppingDecision(list, 'tomato', 'buy'), applyShoppingDecision(list, 'tomato', 'available')];
  editors.forEach((editor, index) => editor.replace(drafts[index], sources[index]));
  const winner = await saveOK(editors[0]);
  const writeCount = h.repo.writeCalls().length;
  assert.equal((await editors[1].save()).status, 'conflict');
  assert.equal(posts(h).at(-1).ifMatch, sources[1].blobSha);
  assert.equal(editors[1].getState().error.code, 'conflict');
  assert.deepEqual(editors[1].getState().draft, drafts[1]);
  assert.deepEqual(editors[1].getState().source, sources[1]);
  assert.equal(h.repo.writeCalls().length, writeCount);
  assert.equal(h.repo.head, winner.commit);
  assert.deepEqual((await apis[1].getShoppingList(list.id, { force: true })).content, drafts[0]);
  assert.deepEqual(changedFiles(h.repo, h.revision), ['data/shopping-lists/contended-shop.json']);
});

test('L1 fixed source/catalog/assets: exact version bytes and structured failures, without current fallback', async t => {
  const h = await setup(t, client);
  const api = h.api();
  const owner = 'data/ingredients/tomato.json';
  const path = 'data/ingredients/pattern.png';
  const original = filesAt(h.repo);
  const ingredient = JSON.parse(original[owner]);
  const changed = clone(ingredient);
  changed.name.zh = '后续版本番茄';
  const revisionB = h.repo.commit({ ...original, [owner]: json(changed), [path]: PNG_B }, 'L1 modeled later source and image');
  for (const [revision, expected, bytes] of [[h.revision, ingredient, original[path]], [revisionB, changed, PNG_B]]) {
    const source = await api.getIngredient('tomato', { revision });
    const catalog = await api.getCatalog({ revision });
    const asset = await api.getAsset({ revision, owner, pointer: '/image' });
    assert.equal(source.commit, revision);
    assert.equal(catalog.commit, revision);
    assert.deepEqual(source.content, expected);
    assert.deepEqual(catalog.ingredients.tomato, expected);
    assert.equal(asset.sourceRevision, revision);
    assert.equal(asset.bytes.type, 'image/png');
    assert.deepEqual(Buffer.from(await asset.bytes.arrayBuffer()), bytes);
    assert.equal(h.requests.at(-1).sourceRevision, revision);
  }
  for (const read of [
    () => api.getIngredient('tomato', { revision: '0'.repeat(40) }),
    () => api.getCatalog({ revision: '0'.repeat(40) }),
    () => api.getAsset({ revision: '0'.repeat(40), owner, pointer: '/image' }),
  ]) await assert.rejects(read, errorIs(422, 'revision_unavailable'));
  assert.equal(await api.getIngredient('missing-ingredient', { revision: h.revision }), null);
  await assert.rejects(() => api.getAsset({ revision: h.revision, owner, pointer: '/name' }), errorIs(422, 'asset_unavailable'));

  const missingBytes = filesAt(h.repo);
  delete missingBytes[path];
  const missingRevision = h.repo.commit(missingBytes, 'L1 modeled missing asset');
  h.repo.commit({ ...missingBytes, [path]: PNG_B }, 'L1 modeled current asset restored');
  await assert.rejects(() => api.getAsset({ revision: missingRevision, owner, pointer: '/image' }), errorIs(422, 'asset_unavailable'));
  const external = clone(changed);
  external.image.src = 'https://example.invalid/integration.png';
  const externalRevision = h.repo.commit({ ...filesAt(h.repo), [owner]: json(external) }, 'L1 modeled unpinned external asset');
  await assert.rejects(() => api.getAsset({ revision: externalRevision, owner, pointer: '/image' }), errorIs(422, 'external_asset_unpinned'));
  const invalidRevision = h.repo.commit({ ...filesAt(h.repo), [owner]: '{invalid json' }, 'L1 modeled corrupt source');
  await assert.rejects(() => api.getIngredient('tomato', { revision: invalidRevision }), errorIs(422, 'invalid_source'));
  await assert.rejects(() => api.getCatalog({ revision: invalidRevision }), errorIs(422, 'invalid_source'));
  assert.equal(posts(h).length, 0);
  assert.equal(h.repo.writeCalls().length, 0);
  assert.equal(nativeAttempts, 0);
});

test('L1 unknown outcome: actual commit then lost response; forced current + pinned reads reconcile without duplicate writes', async t => {
  const h = await setup(t, client);
  const api = h.api('chef');
  const identity = { kind: 'plan', id: 'lost-plan' };
  const submitted = (await api.getPlan('team-week', { revision: h.revision })).content;
  // Cache absence first: reconciliation must force a real current read after response loss.
  assert.equal(await api.getPlan(identity.id), null);
  const editor = h.editor(api, identity, submitted);
  h.dropNextResponse(`/plan/${identity.id}`);
  assert.equal((await editor.save()).status, 'outcome-unknown');
  assert.equal(posts(h).length, 1);
  assert.equal(posts(h)[0].status, 200);
  assert.equal(posts(h)[0].dropped, true);
  const commit = h.repo.head;
  assert.notEqual(commit, h.revision);
  assert.deepEqual(JSON.parse(h.repo.fileText(`data/menu-plans/${identity.id}.json`)), submitted);
  const unresolved = editor.getState();
  assert.equal(unresolved.phase, 'outcome-unknown');
  assert.deepEqual(unresolved.draft, submitted);
  assert.equal(unresolved.source, null);
  assert.equal((await editor.save()).status, 'blocked');
  const later = clone(submitted);
  later.name.zh = '响应丢失后的后续编辑';
  editor.edit(later);
  const writes = h.repo.writeCalls().length;
  const requestOffset = h.requests.length;
  assert.equal((await editor.reconcileUnknown()).status, 'saved');
  assert.deepEqual(h.reads, [{ identity, options: { force: true } }, { identity, options: { revision: commit, force: true } }]);
  assert.deepEqual(h.requests.slice(requestOffset).map(({ method, path, search }) => ({ method, path, search })), [
    { method: 'GET', path: '/source/plan/lost-plan', search: '' },
    { method: 'GET', path: '/source/plan/lost-plan', search: `?revision=${commit}` },
  ]);
  assert.ok(h.requests.every(request => request.cache === 'no-store' && request.redirect === 'error'));
  assert.equal(posts(h).length, 1);
  assert.equal(h.repo.writeCalls().length, writes);
  assert.equal(h.repo.head, commit);
  const state = editor.getState();
  assert.equal(state.phase, 'dirty');
  assert.equal(state.dirty, true);
  assert.deepEqual(state.draft, later);
  assert.deepEqual(state.source.content, submitted);
  assert.equal(state.source.commit, commit);
  assert.equal(state.lastSave.reconciled, true);
  assert.equal(state.lastSave.operationId, unresolved.operationId);
  assert.equal(Object.hasOwn(state.lastSave, 'unchanged'), false);
  assert.equal(Object.hasOwn(state.lastSave, 'warnings'), false);
  assert.deepEqual(changedFiles(h.repo, h.revision), ['data/menu-plans/lost-plan.json']);
});
