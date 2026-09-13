import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const esbuild = await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir = await mkdtemp(join(tmpdir(), 'shopping-index-api-'));
after(() => rm(dir, {recursive:true, force:true}));
const build = await esbuild.build({entryPoints:[join(dirname(fileURLToPath(import.meta.url)), '../src/api/team-meals.ts')], bundle:true, write:false, format:'esm', platform:'browser', define:{'import.meta.env.VITE_WORKER_URL':'""'}, logLevel:'silent'});
await writeFile(join(dir, 'api.mjs'), build.outputFiles[0].text);
const {createTeamMealsApi} = await import(pathToFileURL(join(dir, 'api.mjs')));
const A = 'a'.repeat(40), B = 'b'.repeat(40), TOKEN = 't'.repeat(43);
const selection = [{menuPlanRef:'team', date:'2026-09-12', mealType:'lunch'}];
const item = {id:'trip', selection, itemCount:2, decisionCounts:{check:1,buy:0,available:0,bought:1}};
const page = overrides => ({ok:true, commit:A, items:[item], nextCursor:null, skipped:0, ...overrides});
const json = (body, status=200) => new Response(JSON.stringify(body), {status});
function setup(respond = () => json(page()), options = {}) {
  const calls = [];
  const api = createTeamMealsApi('https://shopping-index.invalid', {token:() => TOKEN, fetch:async (url, init) => {
    calls.push({url:String(url), init}); return respond(url, init, calls.length);
  }, ...options});
  after(() => api.dispose());
  return {api, calls};
}

test('shopping index client: authenticated GET, cloned cache, force and cursor partition', async () => {
  const {api, calls} = setup();
  assert.equal(typeof api.listShoppingLists, 'function', 'actual TeamMealsApi must expose discovery');
  const first = await api.listShoppingLists(); first.items[0].selection[0].menuPlanRef = 'mutated'; first.items[0].decisionCounts.check = 99;
  assert.equal((await api.listShoppingLists()).items[0].selection[0].menuPlanRef, 'team');
  assert.deepEqual((await api.listShoppingLists()).items[0].decisionCounts, {check:1,buy:0,available:0,bought:1});
  assert.equal(calls.length, 1);
  await api.listShoppingLists({force:true}); await api.listShoppingLists({cursor:`v1.${A}.20`});
  assert.equal(calls.length, 3); assert.ok(calls.every(c => c.init.method === 'GET'));
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'), `Bearer ${TOKEN}`);
  assert.equal(calls[2].url, `https://shopping-index.invalid/shopping-lists?cursor=v1.${A}.20`);
  assert.deepEqual(Object.keys(await api.listShoppingLists()).sort(), ['commit','items','nextCursor','skipped']);
});

test('shopping index client: missing or invalid decision counts never become usable summaries', async () => {
  const {decisionCounts: _counts, ...oldItem} = item;
  const responses = [oldItem, ...[
    null, [], {}, {check:2,buy:0,available:0}, {check:2,buy:0,available:0,bought:0,extra:0},
    {check:-1,buy:2,available:1,bought:0}, {check:0.5,buy:0.5,available:1,bought:0},
    {check:'1',buy:0,available:0,bought:1}, {check:true,buy:0,available:0,bought:1},
    {check:Number.MAX_SAFE_INTEGER+1,buy:0,available:0,bought:0},
    {check:Number.MAX_SAFE_INTEGER,buy:Number.MAX_SAFE_INTEGER,available:0,bought:0},
    {check:1,buy:0,available:0,bought:0}, {check:1,buy:1,available:0,bought:1},
  ].map(decisionCounts => ({...item, decisionCounts}))];
  for (const summary of responses) {
    const {api} = setup(() => json(page({items:[summary]})));
    await assert.rejects(api.listShoppingLists(), {code:'bad_response'}, JSON.stringify(summary));
  }
});

test('shopping index client: zero decision counts and paged counts preserve their exact values', async () => {
  const counts = {check:0,buy:0,available:0,bought:0};
  const {api:empty} = setup(() => json(page({items:[{...item,itemCount:0,decisionCounts:counts}]})));
  assert.deepEqual((await empty.listShoppingLists()).items[0].decisionCounts, counts);
  const {api,calls} = setup(url => new URL(url).searchParams.has('cursor')
    ? json(page({items:[{...item,decisionCounts:{check:0,buy:2,available:0,bought:0}}]}))
    : json(page({skipped:19,nextCursor:`v1.${A}.20`})));
  const first = await api.listShoppingLists();
  const second = await api.listShoppingLists({cursor:first.nextCursor});
  assert.deepEqual(first.items[0].decisionCounts, {check:1,buy:0,available:0,bought:1});
  assert.deepEqual(second.items[0].decisionCounts, {check:0,buy:2,available:0,bought:0});
  assert.equal(second.commit, first.commit); assert.equal(calls.length, 2);
});

test('shopping index client: rejects unknown/malformed summaries, revisions, cursors and page counts', async () => {
  const bad = [null, {}, page({ok:1}), page({commit:[A]}), page({skipped:-1}), page({skipped:0.5}),
    page({items:Array(21).fill(item)}), page({skipped:20}), page({items:[item,item]}), page({nextCursor:`v1.${B}.20`}),
    page({nextCursor:'anything'}), page({nextCursor:`v1.${A}.0`}), page({items:[{...item,itemCount:'2'}]}),
    page({items:[{...item,itemCount:-1}]}), page({items:[{...item,id:'Bad'}]}), page({items:[{...item,selection:[]}]}),
    page({items:[{...item,selection:[{...selection[0],date:'2026-02-30'}]}]}),
    page({items:[{...item,selection:[{...selection[0],mealType:'snack'}]}]}),
    page({items:[{...item,selection:[selection[0],selection[0]]}]}),
    page({items:[{...item,selection:[{...selection[0],name:'invented'}]}]}), page({items:[{...item,name:'invented'}]})];
  for (const response of bad) {
    const {api} = setup(() => json(response));
    await assert.rejects(api.listShoppingLists(), {code:'bad_response'}, JSON.stringify(response));
  }
  const {api, calls} = setup(() => json(page({commit:B})));
  await assert.rejects(api.listShoppingLists({cursor:`v1.${A}.20`}), {code:'revision_mismatch'});
  for (const cursor of ['', [], 'main', `v1.${A}.21`]) await assert.rejects(api.listShoppingLists({cursor}), {code:'invalid_selection'});
  assert.equal(calls.length, 1);
});

test('shopping index client: empty/skipped pages are valid and cursor advances by candidates', async () => {
  const {api:empty} = setup(() => json(page({items:[]})));
  assert.deepEqual(await empty.listShoppingLists(), {commit:A, items:[], skipped:0, nextCursor:null});
  const {api} = setup(() => json(page({items:[], skipped:20, nextCursor:`v1.${A}.20`})));
  assert.deepEqual((await api.listShoppingLists()).items, []);
  const {api:bad} = setup(() => json(page({items:[], skipped:20, nextCursor:`v1.${A}.20`})));
  await assert.rejects(bad.listShoppingLists({cursor:`v1.${A}.20`}), {code:'bad_response'});
});

test('shopping index client: errors never become empty success; unconfigured and mock boundaries remain', async () => {
  for (const [status, code] of [[401,'unauthorized'], [429,'rate_limited'], [502,'upstream_error'], [422,'revision_unavailable']]) {
    const {api, calls} = setup(() => json({ok:false, errors:[{path:'',code,message:''}]}, status));
    await assert.rejects(api.listShoppingLists(), {code}); assert.equal(calls.length, 1);
  }
  const api = createTeamMealsApi(''); after(() => api.dispose());
  await assert.rejects(api.listShoppingLists(), {code:'worker_unconfigured'});
  assert.throws(() => createTeamMealsApi('https://shopping-index.invalid', {mode:'mock'}), {code:'mock_transport_required'});
});

test('shopping index client: late old-auth read is rejected without evicting new-auth cache', async () => {
  let token = TOKEN, identity = 'buyer', release;
  const waiting = new Promise(resolve => { release = resolve; });
  const {api, calls} = setup((url, init, n) => n === 1 ? waiting : json(page({commit:B})), {token:() => token, identity:() => identity});
  const old = api.listShoppingLists(); token = 'u'.repeat(43);
  assert.equal((await api.listShoppingLists()).commit, B);
  release(json(page())); await assert.rejects(old, {code:'session_changed'});
  assert.equal((await api.listShoppingLists()).commit, B); assert.equal(calls.length, 2);
  identity = 'chef'; await api.listShoppingLists(); assert.equal(calls.length, 3);
});

test('shopping index client: a real save invalidates discovery while an older read cannot evict a forced result', async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const {api, calls} = setup((url, init, n) => init.method === 'POST'
    ? json({ok:true, commit:B, blobSha:B, unchanged:false, warnings:[]})
    : n === 1 ? waiting : json(page({commit:B})));
  const old = api.listShoppingLists(); await api.saveShoppingList('trip', {}, {ifNoneMatch:'*'});
  await api.listShoppingLists({force:true}); release(json(page())); await old;
  assert.equal((await api.listShoppingLists()).commit, B); assert.equal(calls.length, 3);
});
