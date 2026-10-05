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

// Actual companion validation is explicit and remains outside production databases.
const companion=process.env.KB_SOURCE_ROOT;
test('all accepted kitchen timing choices save and reload through actual SQLite validation', {skip:!companion},async()=>{
 const {buildApp}=await import(pathToFileURL(join(companion,'apps/api/app.mjs')));const dataDir=await mkdtemp(join(tmpdir(),'knowledge-timing-')),app=await buildApp({dataDir});
 try{
  for(const timing of ['day-before','morning','before-service','']){
   const input={title:{zh:'Timing fixture'},recipeFormatVersion:'2',ingredients:[{id:crypto.randomUUID(),name:{zh:'盐'},amount:{kind:'unknown',raw:'未知'},preparation:{zh:'原方切圈，煮10分钟。'}}],steps:[{id:crypto.randomUUID(),text:{zh:'原方煮10分钟。'}}]};
   const initial=await app.inject({method:'POST',url:'/api/v1/recipes',headers:{host:'127.0.0.1:4390','x-kb-client':'agent','idempotency-key':crypto.randomUUID()},payload:input});assert.equal(initial.statusCode,201,initial.body);const saved=initial.json();let response;
   const h=await setup(async(url,init)=>{const prefix='/worker/knowledge';assert(url.startsWith(prefix));const headers=Object.fromEntries(new Headers(init.headers));headers.host='127.0.0.1:4390';headers['x-kb-client']='agent';const result=await app.inject({method:init.method??'GET',url:'/api/v1'+url.slice(prefix.length),headers,...(init.body?{payload:JSON.parse(init.body)}:{})});if(init.method==='PUT')response=result;return new Response(result.body,{status:result.statusCode,headers:result.headers});});await h.mount(saved.id);
   const field=()=>h.all('label').find(l=>l.children[0]?.textContent==='厨房准备时机').querySelector('select');assert.deepEqual(field().children.map(option=>option.value),['','day-before','morning','before-service']);field().value=timing;field().dispatchEvent({type:'change'});if(!timing)h.set(h.field('菜名（至少一种语言）','中文'),'Unknown timing remains absent');h.click('保存菜谱');await h.flush();assert.equal(response.statusCode,200,response.body);const kitchen=response.json();assert.equal(kitchen.recipe.ingredients[0].kitchenPrep?.timing,timing||undefined);assert.deepEqual(kitchen.recipe.ingredients[0].amount,input.ingredients[0].amount);assert.deepEqual(kitchen.recipe.ingredients[0].preparation,input.ingredients[0].preparation);assert.deepEqual(kitchen.recipe.steps,input.steps);h.click('放弃输入并重新读取');await h.flush();assert.equal(field().value,timing);const original=await app.inject({method:'GET',url:'/api/v1/recipes/'+saved.id+'/revisions/1',headers:{host:'127.0.0.1:4390'}});assert.deepEqual(original.json().recipe,saved.recipe);assert.match(h.all('.kb-comparison-column')[0].textContent,/原方切圈，煮10分钟/);h.leave();
  }
 }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
});
