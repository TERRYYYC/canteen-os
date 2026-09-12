import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FakeRepo, WORKER, makeEnv, makeFetch, bearer, call} from './helpers.mjs';

const worker = (await import(WORKER)).default;
const selection = [{menuPlanRef:'team', date:'2026-09-12', mealType:'lunch'}];
const list = id => ({shoppingListVersion:'1', id, basis:{sourceRevision:'a'.repeat(40), selection}, items:[{ingredientRef:'salt', decision:'check'}]});
const files = count => Object.fromEntries(Array.from({length:count}, (_, i) => {
  const id = `trip-${String(i).padStart(3, '0')}`;
  return [`data/shopping-lists/${id}.json`, JSON.stringify(list(id))];
}));
const json = body => new Response(JSON.stringify(body));
function setup(source = {}, alterTree = () => {}) {
  const repo = new FakeRepo(); repo.commit(source);
  const fetch = makeFetch(repo);
  const env = makeEnv(repo, {__fetch:async (url, init) => {
    const response = await fetch(url, init);
    if (!String(url).includes('/git/trees/') || !response.ok) return response;
    const body = await response.json();
    // The shared FakeRepo omits GitHub's blob-size metadata. Supply real byte lengths here.
    for (const entry of body.tree) if (entry.type === 'blob') entry.size = repo.blobs.get(entry.sha).length;
    alterTree(body);
    return json(body);
  }}).env;
  const read = (query = '', role = 'buyer') => call(worker, env, 'GET', `/shopping-lists${query}`, {headers:role ? bearer(role) : {}});
  return {repo, env, read};
}

test('shopping index: empty index is explicit, authenticated and read-only for all three roles', async () => {
  const {repo, env, read} = setup({'data/menu-plans/team.json':'{}'});
  const head = repo.head;
  for (const role of ['chef','buyer','admin']) {
    const response = await read('', role);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {ok:true, commit:head, items:[], nextCursor:null, skipped:0});
    assert.equal(response.res.headers.get('Cache-Control'), 'no-store');
    assert.equal(env.__rateStore.get(`${role}:read`).length, 1);
    assert.equal(env.__rateStore.has(`${role}:write`), false);
  }
  assert.equal(repo.head, head); assert.deepEqual(repo.writeCalls(), []);
});

test('shopping index: pages inspect 20 candidates, sorted by ID and pinned across HEAD changes', async () => {
  const original = files(23);
  original['data/shopping-lists/trip-022.json'] = JSON.stringify({...list('trip-022'), items:[{ingredientRef:'salt', decision:'buy', bought:true}]});
  const {repo, read} = setup(original), head = repo.head;
  const first = await read();
  assert.equal(first.status, 200); assert.equal(first.body.items.length, 20);
  assert.deepEqual(first.body.items[0], {id:'trip-000', selection, itemCount:1, decisionCounts:{check:1,buy:0,available:0,bought:0}});
  assert.equal(first.body.nextCursor, `v1.${head}.20`);
  assert.equal(repo.calls.filter(c => c.path.includes('/git/blobs/')).length, 20);
  assert.equal(repo.calls.length, 22); // One HEAD, one tree, twenty bounded blobs; no basis reads.
  repo.commit({...original, 'data/shopping-lists/trip-022.json':JSON.stringify(list('trip-022')), 'data/shopping-lists/aaa.json':JSON.stringify(list('aaa'))});
  const next = await read(`?cursor=${first.body.nextCursor}`);
  assert.equal(next.status, 200); assert.equal(next.body.commit, head);
  assert.deepEqual(next.body.items.map(item => item.id), ['trip-020','trip-021','trip-022']);
  assert.deepEqual(next.body.items.at(-1).decisionCounts, {check:0,buy:0,available:0,bought:1});
  assert.equal(next.body.nextCursor, null);
  const fresh = await read(); assert.equal(fresh.body.commit, repo.head); assert.equal(fresh.body.items[0].id, 'aaa');
  const freshNext = await read(`?cursor=${fresh.body.nextCursor}`);
  assert.deepEqual(freshNext.body.items.at(-1).decisionCounts, {check:1,buy:0,available:0,bought:0});
  assert.deepEqual(repo.writeCalls(), []);
});

test('shopping index: decisions occupy four exclusive buckets and previous judgments stay historical', async () => {
  const saved = list('trip');
  saved.items = [
    {ingredientRef:'unknown', decision:'check'},
    {ingredientRef:'previous', decision:'check', previous:{basis:saved.basis, decision:'buy', bought:true}},
    {ingredientRef:'salt', decision:'buy'},
    {ingredientRef:'oil', decision:'buy', bought:false},
    {ingredientRef:'tomato', decision:'buy', bought:true},
    {ingredientRef:'pepper', decision:'available'},
  ];
  const {repo, read} = setup({'data/shopping-lists/trip.json':JSON.stringify(saved)}), head = repo.head;
  const response = await read(); assert.equal(response.status, 200);
  assert.deepEqual(response.body.items, [{id:'trip', selection, itemCount:6, decisionCounts:{check:2,buy:2,available:1,bought:1}}]);
  assert.equal(repo.head, head); assert.deepEqual(repo.writeCalls(), []);
  assert.equal(repo.calls.length, 3, 'no additional basis or catalog reads for counts');
  assert.deepEqual(JSON.parse(repo.fileText('data/shopping-lists/trip.json')), saved, 'stored decisions unchanged');
});

test('shopping index: an empty saved list reports explicit zero decisions', async () => {
  const {read} = setup({'data/shopping-lists/empty.json':JSON.stringify({...list('empty'), items:[]})});
  const response = await read(); assert.equal(response.status, 200);
  assert.deepEqual(response.body.items, [{id:'empty', selection, itemCount:0, decisionCounts:{check:0,buy:0,available:0,bought:0}}]);
});

test('shopping index: invalid cursors and unknown query options reject before upstream reads', async () => {
  const {repo, read} = setup(files(21));
  for (const query of ['?cursor=', '?cursor=main', `?cursor=v1.${repo.head}.0`, `?cursor=v1.${repo.head}.01`,
    `?cursor=v1.${repo.head}.21`, `?cursor=v1.${repo.head}.9007199254741000`, '?limit=100', '?cursor=x&cursor=y']) {
    const response = await read(query); assert.equal(response.status, 400, query);
    assert.equal(response.body.errors[0].code, 'invalid_selection');
  }
  assert.equal(repo.calls.length, 0);
  const beyond = await read(`?cursor=v1.${repo.head}.40`); assert.equal(beyond.status, 400);
});

test('shopping index: unreachable cursor revision cannot become the current revision', async () => {
  const {read} = setup(files(21));
  const response = await read(`?cursor=v1.${'0'.repeat(40)}.20`);
  assert.equal(response.status, 422); assert.equal(response.body.errors[0].code, 'revision_unavailable');
});

test('shopping index: unauthenticated and exhausted read bucket do not access GitHub', async () => {
  const {repo, env, read} = setup(files(1));
  assert.equal((await read('', null)).status, 401);
  env.__rateStore.set('buyer:read', Array(600).fill(env.__now()));
  const limited = await read(); assert.equal(limited.status, 429); assert.ok(limited.res.headers.get('Retry-After'));
  assert.equal(repo.calls.length, 0); assert.deepEqual(repo.writeCalls(), []);
});

test('shopping index: malformed, mismatched, duplicate, oversized and unsafe records explicitly skip', async () => {
  const source = files(8);
  source['data/shopping-lists/trip-000.json'] = '{';
  source['data/shopping-lists/trip-001.json'] = JSON.stringify({...list('wrong')});
  const duplicate = list('trip-002'); duplicate.items.push(duplicate.items[0]);
  source['data/shopping-lists/trip-002.json'] = JSON.stringify(duplicate);
  source['data/shopping-lists/trip-003.json'] = ' '.repeat(256 * 1024 + 1);
  source['data/shopping-lists/Bad.json'] = JSON.stringify(list('bad'));
  const {repo, read} = setup(source, body => {
    body.tree.find(e => e.path.endsWith('trip-004.json')).mode = '120000';
    delete body.tree.find(e => e.path.endsWith('trip-005.json')).size;
    body.tree.find(e => e.path.endsWith('trip-006.json')).size = -1;
  });
  const response = await read(); assert.equal(response.status, 200);
  assert.equal(response.body.skipped, 8);
  assert.deepEqual(response.body.items.map(item => item.id), ['trip-007']);
  assert.equal(response.body.nextCursor, null);
  assert.equal(repo.calls.filter(c => c.path.includes('/git/blobs/')).length, 4);
  assert.deepEqual(repo.writeCalls(), []);
});

test('shopping index: all-skipped first page still exposes the next page, never scans ahead to fill', async () => {
  const source = files(21);
  for (const path of Object.keys(source).slice(0,20)) source[path] = '{';
  const {repo, read} = setup(source), response = await read();
  assert.equal(response.status, 200); assert.deepEqual(response.body.items, []); assert.equal(response.body.skipped, 20);
  assert.equal(repo.calls.length, 22); assert.ok(response.body.nextCursor);
  const next = await read(`?cursor=${response.body.nextCursor}`);
  assert.deepEqual(next.body.items.map(item => item.id), ['trip-020']);
});

test('shopping index: tree truncation and blob transport failures fail the page, not skip as bad records', async () => {
  const truncated = setup(files(1), body => { body.truncated = true; });
  const failedTree = await truncated.read(); assert.equal(failedTree.status, 502); assert.equal(failedTree.body.errors[0].code, 'upstream_error');
  const {env, read, repo} = setup(files(1)), original = env.__fetch;
  env.__fetch = (url, init) => String(url).includes('/git/blobs/') ? Promise.resolve(new Response('down', {status:503})) : original(url, init);
  const failedBlob = await read(); assert.equal(failedBlob.status, 502); assert.equal(failedBlob.body.errors[0].code, 'upstream_error');
  assert.deepEqual(repo.writeCalls(), []);
});

test('shopping index: malformed trees fail; non-blob JSON entries explicitly skip', async () => {
  const malformed = setup(files(1), body => { body.tree.push(null); });
  const failed = await malformed.read(); assert.equal(failed.status, 502); assert.equal(failed.body.errors[0].code, 'upstream_error');
  const nonBlob = setup(files(1), body => { body.tree[0].type = 'commit'; });
  const response = await nonBlob.read(); assert.equal(response.status, 200); assert.equal(response.body.skipped, 1); assert.deepEqual(response.body.items, []);
  assert.equal(nonBlob.repo.calls.filter(c => c.path.includes('/git/blobs/')).length, 0);
});

test('shopping index: a full final page terminates and the candidate ceiling fails explicitly', async () => {
  const exact = setup(files(20));
  const final = await exact.read(); assert.equal(final.status, 200); assert.equal(final.body.items.length, 20); assert.equal(final.body.nextCursor, null);
  const oversized = setup(files(1), body => {
    const source = body.tree[0];
    body.tree = Array.from({length:10_001}, (_, i) => ({...source, path:`data/shopping-lists/list-${i}.json`}));
  });
  const failed = await oversized.read(); assert.equal(failed.status, 502); assert.equal(failed.body.errors[0].code, 'upstream_error');
  assert.equal(oversized.repo.calls.filter(c => c.path.includes('/git/blobs/')).length, 0);
});

test('shopping index: mismatched byte lengths and malformed blob identity do not become summaries', async () => {
  const {repo, read} = setup(files(2), body => {
    body.tree[0].size = 1;
    body.tree[1].sha = [body.tree[1].sha];
  });
  const response = await read(); assert.equal(response.status, 200); assert.equal(response.body.skipped, 2); assert.deepEqual(response.body.items, []);
  assert.equal(repo.calls.filter(c => c.path.includes('/git/blobs/')).length, 1);
});

test('shopping index: HEAD captured once even when branch advances during the first read', async () => {
  const {repo, env, read} = setup(files(1));
  const original = env.__fetch, head = repo.head;
  env.__fetch = async (url, init) => {
    const response = await original(url, init);
    if (String(url).includes('/git/ref/')) repo.commit(files(2));
    return response;
  };
  const response = await read(); assert.equal(response.status, 200); assert.equal(response.body.commit, head); assert.equal(response.body.items.length, 1);
  assert.equal(repo.calls.filter(c => c.path.includes('/git/ref/')).length, 1);
  assert.deepEqual(repo.writeCalls(), []);
});

test('shopping index: malformed upstream HEAD cannot be coerced into a valid version proof', async () => {
  const {repo, env, read} = setup(files(1)), original = env.__fetch;
  env.__fetch = (url, init) => String(url).includes('/git/ref/') ? Promise.resolve(json({object:{sha:[repo.head]}})) : original(url, init);
  const response = await read(); assert.equal(response.status, 502); assert.equal(response.body.errors[0].code, 'upstream_error');
  assert.equal(repo.calls.length, 0);
});
