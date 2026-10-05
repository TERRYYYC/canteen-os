import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { Element } from './team-meals-pages-unload-dom.mjs';
const here = dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite/package.json'));
const esbuild = await import(pathToFileURL(viteRequire.resolve('esbuild')));
const dir = await mkdtemp(join(tmpdir(), 'knowledge-web-'));
after(() => rm(dir, { recursive: true, force: true }));
const output = join(dir, 'knowledge.mjs');
const bundle = await esbuild.build({ stdin: { contents: `export {render} from './pages/admin/knowledge'; export * from './api/knowledge'; export * from './pages/admin/knowledge/model'; export {inspectReloadSafety} from './view-models/reload-safety';`, loader: 'ts', resolveDir: join(here, '../src') }, bundle: true, write: false, format: 'esm', platform: 'browser', loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_WORKER_URL': '"/worker"' }, logLevel: 'silent', plugins: [{ name: 'auth-boundary', setup(build) {
  build.onResolve({ filter: /(?:\/admin\/token|\.\/token)$/ }, () => ({ path: 'token', namespace: 'test' }));
  build.onResolve({ filter: /\/router$/ }, () => ({ path: 'router', namespace: 'test' }));
  build.onResolve({ filter: /\/api\/team-meals$/ }, () => ({ path: 'team-meals', namespace: 'test' }));
  build.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'token' ? `export const getToken=()=>globalThis.fixture.token; export const peekToken=getToken; export const getAuthSessionVersion=()=>globalThis.fixture.auth; export const peekAuthSessionVersion=getAuthSessionVersion; export const stripTokenFromRest=x=>x; export const clearToken=()=>{}; export const renderLockScreen=()=>{}; export const onAuthSessionChange=fn=>{globalThis.fixture.authHooks.push(fn);return()=>{};};` : args.path === 'team-meals' ? `export const getTeamMealsApi=()=>globalThis.fixture.teamApi;` : `export const onRoute=fn=>{globalThis.fixture.routeHooks.push(fn);return()=>{};};`, loader: 'js' }));
} }] });
await writeFile(output, bundle.outputFiles[0].text);
const id = '10000000-0000-4000-8000-000000000001';
const id2 = '10000000-0000-4000-8000-000000000002';
const assetId = '20000000-0000-4000-8000-000000000001';
const detail = (overrides = {}) => ({ id, version: 1, createdAt: '2026-09-19T00:00:00.000Z', recipe: { title: { zh: '红烧肉', en: 'Braised pork', uk: 'Тушкована свинина' }, ingredients: [{ id: id2, ingredientId: id2, name: { zh: '盐', en: 'Salt' }, amount: { kind: 'unknown', raw: '未写明' }, role: 'seasoning', preparation: { uk: 'Підготувати' } }], steps: [], sources: [], assets: [] }, media: [], sourceRecords: [], ...overrides });
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', etag: '"v1"', ...headers } });
const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
let serial = 0;
async function setup(handler = () => json(detail()), plans = {}) {
  globalThis.fixture = { token: 'test-only-token', auth: 1, authHooks: [], routeHooks: [], calls: [], handler, teamApi: { sessionKey: () => 1, getPlan: async id => plans[id] ? { content: plans[id] } : null } };
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  globalThis.window = { addEventListener() {}, confirm: () => true };
  globalThis.location = { hash: '#/admin/knowledge' };
  globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => new Element('', String(text)), activeElement: null };
  const body = new Element('body'), el = new Element('main'); body.append(el);
  globalThis.fetch = async (url, init = {}) => { fixture.calls.push({ url: String(url), init }); return fixture.handler(String(url), init); };
  const m = await import(pathToFileURL(output).href + `?run=${++serial}`);
  const flush = async () => { for (let i=0;i<15;i++) await new Promise(resolve => setImmediate(resolve)); };
  const mount = async (rest = id, lang = 'zh', planId = 'week-2026-40') => { await m.render(el, { lang, planId, setReloadCoverage() {} }, rest); await flush(); };
  const all = selector => el.querySelectorAll(selector);
  const click = text => { const control = all('button').find(b => b.textContent === text); assert(control, `button ${text}`); control.click(); };
  const field = (legend, language) => {
    const container = all('fieldset').find(f => f.children[0]?.tagName === 'LEGEND' && f.children[0].textContent === legend);
    assert(container, `fieldset ${legend}`);
    const label = container.querySelectorAll('label').find(f => f.children[0]?.textContent === language);
    return label.querySelector('input,textarea');
  };
  const set = (control, value) => { control.value=value; control.dispatchEvent({ type: 'input' }); };
  return { m, el, body, flush, mount, all, click, field, set, leave() { el.replaceChildren(); location.hash='#/admin/plan'; fixture.routeHooks.forEach(fn=>fn()); } };
}

test('generic materialization transport and kitchen fields are preserved',async()=>{
 const h=await setup();
 const api=h.m.createKnowledgeApi({base:'/worker',token:()=> 'private',session:()=>1,fetch:async(url)=>{assert.equal(url,`/worker/knowledge-materializations/recipes/${id}`);return json({dishRef:'kbrecipe'});}});
 await api.send(h.m.createAttempt(`/materializations/recipes/${id}`,'POST',{recipeVersion:1}));
 const recipe={...detail().recipe,recipeFormatVersion:'2',ingredients:[{...detail().recipe.ingredients[0],kitchenPrep:{timing:'before-service',size:'2cm'}}],steps:[{id:id2,text:{zh:'原方10分钟'},techniqueId:id2}]};
 assert.deepEqual(h.m.editable(recipe),recipe);
});

test('full original comparison, durable approval unknown retry and selected-plan next step',async()=>{
 const recipe={recipeFormatVersion:'2',title:{zh:'厨房修订',en:'Kitchen revision',uk:'Кухонна редакція'},ingredients:[{id:id2,name:{zh:'小米辣'},rawText:'小米辣若干',preparation:{zh:'原方切圈'},amount:{kind:'unknown'}}],steps:[{id:id2,text:{zh:'原方煮10分钟，未给调料量'}}],sources:[],assets:[]};
 let approved=false,attempts=[];
 const approval={approvalVersion:'1',status:'approved',recipeId:id,recipeVersion:2,origin:{kind:'manual',originalRecipeVersion:1},dependencies:{ingredients:[],techniques:[]},reviewer:'engineering-test-only',note:'副本核定保留未知',createdAt:'2026-10-05',approvalHash:'a'.repeat(64)};
 const h=await setup((url,init)=>{
  if(url.includes('/source-illustrations'))return json({recipeId:id,recipeVersion:2,illustrations:[],stepLinks:[]});
  if(url.includes('/ingredients?')||url.includes('/techniques?'))return json({items:[],nextCursor:null});
  if(url.endsWith('/adoption'))return json({recipeId:id,recipeVersion:2,current:{version:2,archived:false},origin:approval.origin,source:{status:approved?'approved':'needs_review'},kitchenApproval:approved?approval:null,issues:['unknown-amount','unmapped-ingredient']});
  if(url.endsWith('/approve')){attempts.push({body:init.body,key:new Headers(init.headers).get('Idempotency-Key')});if(attempts.length===1)throw Error('response lost');approved=true;return json(approval,201);}
  if(url.includes('/knowledge-materializations/recipes/'))return json({dishRef:'kb-test-v2',recipeId:id,recipeVersion:2,commit:'a'.repeat(40),unchanged:false});
  if(url.endsWith('/revisions/1'))return json(detail({recipe:{...recipe,title:{zh:'原方'}}}));
  return json(detail({version:2,recipe}),200,{etag:'"v2"'});
 });
 await h.mount();assert.match(h.el.textContent,/原方 v1/);assert.match(h.el.textContent,/原方煮10分钟/);assert.match(h.el.textContent,/原方切圈/);
 const named=text=>h.all('label').find(label=>label.children[0]?.textContent===text)?.querySelector('input,textarea');
 h.set(named('核定师傅'),'engineering-test-only');h.set(named('核定说明（未知项与厨房调整）'),'副本核定保留未知');
 const confirm=h.all('input').find(input=>input.getAttribute('data-testid')==='source-confirmed');confirm.checked=true;confirm.dispatchEvent({type:'change'});
 h.click('核定已保存版本');await h.flush();assert.match(h.el.textContent,/结果尚未确认/);
 assert.equal(h.m.inspectReloadSafety().reason,'unknown');
 await h.mount(id,'en');assert.match(h.el.textContent,/result is unconfirmed/);
 h.click('Verify operation result (same request)');await h.flush();assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert.match(h.el.textContent,/approved by the kitchen/);
 h.click('Use this version in a menu');await h.flush();assert.match(h.el.textContent,/Recipe version fixed/);
 h.click('Choose menu dates and servings');assert.equal(location.hash,'#/admin/plan/week-2026-40/select/kb-test-v2');
 assert.equal(recipe.ingredients[0].amount.kind,'unknown');assert.equal(recipe.steps[0].text.zh,'原方煮10分钟，未给调料量');
});

test('explicit shared identity, kitchen preparation and step technique save without rewriting original unknowns',async()=>{
 const canonical=assetId,tech=id2;let stored=detail({recipe:{...detail().recipe,ingredients:[{id:id2,name:{zh:'小米辣'},amount:{kind:'unknown',raw:'若干'},preparation:{zh:'原方切圈'}}],steps:[{id:id2,text:{zh:'煮10分钟'}}]}}),saved;
 const h=await setup((url,init)=>{
  if(url.includes('/source-illustrations'))return json({recipeId:id,recipeVersion:stored.version,illustrations:[],stepLinks:[]});
  if(url.endsWith('/adoption'))return json({recipeId:id,recipeVersion:stored.version,current:{version:stored.version,archived:false},origin:{kind:'manual',originalRecipeVersion:1},source:{status:'needs_review'},kitchenApproval:null,issues:['unknown-amount']});
  if(url.includes('/ingredients?'))return json({items:[{id:canonical,version:1,name:{zh:'明确共享小米辣'}}],nextCursor:null});
  if(url.includes('/techniques?'))return json({items:[{id:tech,version:1,kind:'cut',name:{zh:'切圈'}}],nextCursor:null});
  if(init.method==='PUT'){saved=JSON.parse(init.body);stored={...stored,version:2,recipe:saved};return json(stored,200,{etag:'"v2"'});}
  return json(stored,200,{etag:`"v${stored.version}"`});
 });await h.mount();
 const control=text=>h.all('label').find(row=>row.children[0]?.textContent===text)?.querySelector('input,textarea,select');
 const change=(text,value)=>{const el=control(text);assert(el,text);el.value=value;el.dispatchEvent({type:el.tagName==='SELECT'?'change':'input'});};
 change('共享标准材料（明确绑定 ID）',canonical);change('标准技法（明确选择）',tech);change('厨房准备时机','before-service');change('厨房切配尺寸（未知留空）','2mm');
 h.click('保存菜谱');await h.flush();assert.equal(saved.recipeFormatVersion,'2');assert.equal(saved.ingredients[0].ingredientId,canonical);assert.deepEqual(saved.ingredients[0].kitchenPrep,{techniqueId:tech,timing:'before-service',size:'2mm'});assert.deepEqual(saved.ingredients[0].amount,{kind:'unknown',raw:'若干'});assert.deepEqual(saved.ingredients[0].preparation,{zh:'原方切圈'});assert.equal(saved.steps[0].text.zh,'煮10分钟');
 assert.equal(fixture.calls.filter(call=>call.url.endsWith('/approve')).length,0);
});
test('canonical creation keeps unknown fields absent and lost response uses the same key',async()=>{
 let ingredient,attempts=[];
 const stored=detail({recipe:{...detail().recipe,ingredients:[]}});
 const h=await setup((url,init)=>{
  if(url.includes('/source-illustrations'))return json({recipeId:id,recipeVersion:1,illustrations:[],stepLinks:[]});
  if(url.endsWith('/adoption'))return json({recipeId:id,recipeVersion:1,current:{version:1,archived:false},origin:{kind:'manual',originalRecipeVersion:1},source:{status:'needs_review'},kitchenApproval:null,issues:[]});
  if(url.includes('/ingredients?'))return json({items:ingredient?[{id:assetId,version:1,...ingredient}]:[],nextCursor:null});
  if(url.includes('/techniques?'))return json({items:[],nextCursor:null});
  if(url.endsWith('/ingredients')&&init.method==='POST'){attempts.push({body:init.body,key:new Headers(init.headers).get('Idempotency-Key')});ingredient=JSON.parse(init.body);if(attempts.length===1)throw Error('lost');return json({id:assetId,version:1,ingredient,createdAt:'2026-10-05'},201);}
  return json(stored);
 });await h.mount();h.click('＋ 标准材料');h.set(h.field('标准名称','中文'),'工程小米辣');h.click('保存标准资料新版本');await h.flush();assert.equal(h.m.inspectReloadSafety().reason,'unknown');assert.deepEqual(ingredient,{name:{zh:'工程小米辣'}});
 h.click('核对操作结果（使用同一请求）');await h.flush();assert.deepEqual(attempts[0],attempts[1]);assert.equal(h.all('[data-testid="standard-editor"]').length,0);assert.match(h.el.textContent,/工程小米辣/);
});

test('native field controls have an exact localized accessible label',async()=>{const h=await setup();await h.mount();const control=h.all('label').find(label=>label.children[0]?.textContent==='用量类型').querySelector('select');assert.equal(control.getAttribute('aria-label'),'用量类型');});

test('incomplete price-only purchase input is retained instead of silently omitted',async()=>{
 let writes=0;const stored=detail({recipe:{...detail().recipe,ingredients:[]}});
 const h=await setup((url,init)=>{if(url.includes('/ingredients?')||url.includes('/techniques?'))return json({items:[],nextCursor:null});if(url.endsWith('/ingredients')&&init.method==='POST'){writes++;return json({id:assetId,version:1,ingredient:JSON.parse(init.body)},201);}return json(stored);});await h.mount();h.click('＋ 标准材料');h.set(h.field('标准名称','中文'),'测试材料');const named=text=>h.all('label').find(row=>row.children[0]?.textContent===text).querySelector('input,select');h.set(named('参考价格（未知留空）'),'10');const currency=named('币种');currency.value='USD';currency.dispatchEvent({type:'change'});h.click('保存标准资料新版本');await h.flush();assert.equal(writes,0);assert.equal(named('参考价格（未知留空）').value,'10');assert.equal(currency.value,'USD');assert.equal(h.all('[data-testid="standard-editor"]').length,1);
});

test('workflow paints reuse in-flight source frames and departure aborts their private reads',async()=>{
 const image=defer(),recipe={...detail().recipe,ingredients:[],steps:[]};
 const h=await setup((url,init)=>{
  if(url.includes('/source-illustrations'))return json({recipeId:id,recipeVersion:1,candidateId:id2,illustrations:[{assetId,role:'finished',sourceStepId:null,caption:{zh:'工程参考'},rightsState:'pending'}],stepLinks:[]});
  if(url.includes('/assets/'))return image.promise;
  if(url.includes('/ingredients?')||url.includes('/techniques?'))return json({items:[],nextCursor:null});
  if(url.endsWith('/adoption'))return json({recipeId:id,recipeVersion:1,current:{version:1,archived:false},origin:{kind:'manual',originalRecipeVersion:1},source:{status:'needs_review'},kitchenApproval:null,issues:[]});
  return json(detail({recipe}));
 });
 await h.mount();h.click('重新核对原方与标准资料');await h.flush();
 const reads=fixture.calls.filter(call=>call.url.includes('/assets/'));assert.equal(reads.length,1,'same revision frame is fetched once across metadata/catalog paints');assert.equal(reads[0].init.signal.aborted,false,'metadata paints preserve the original in-flight request');
 h.leave();assert.equal(reads[0].init.signal.aborted,true,'route departure aborts the original private request');image.resolve(new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}}));await h.flush();assert.equal(h.all('img').length,0,'departed view cannot show a late source frame');
});
