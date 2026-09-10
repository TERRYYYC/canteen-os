import assert from 'node:assert/strict';
import {test, after} from 'node:test';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const esbuild = await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const root = dirname(fileURLToPath(import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'team-api-'));
after(() => rm(dir, {recursive:true,force:true}));
const teamFile = join(root, '../src/api/team-meals.ts');
const bundle = await esbuild.build({stdin:{contents:`export * from './src/api/client';export * from './src/admin/token';export * from './src/admin/kit';export { ApiError } from './src/api/types';${existsSync(teamFile) ? "export * from './src/api/team-meals';" : ''}`,resolveDir:join(root,'..')},bundle:true,write:false,loader:{'.css':'empty'},format:'esm',platform:'browser',define:{'import.meta.env.VITE_WORKER_URL':'""'},logLevel:'silent'});
await writeFile(join(dir,'api.mjs'), bundle.outputFiles[0].text);
const mod = await import(pathToFileURL(join(dir,'api.mjs')));
const A='a'.repeat(40), B='b'.repeat(40), TOKEN='t'.repeat(43);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const error=(status,code,extra={})=>json({ok:false,errors:[{path:'',code,message:'message must not supply IDs'}],...extra},status);
const write={ok:true,commit:B,blobSha:B,unchanged:false,warnings:[]};
const source=(content,commit=A)=>({ok:true,content,commit,blobSha:commit});
const catalog=(commit=A)=>({ok:true,commit,dishes:{soup:{schemaVersion:'3',name:{en:'Soup'},components:[{ingredientRef:'salt'}]}},ingredients:{},techniques:[],suppliers:[],translations:{machine:0,human:0,stale:0}});
function setup(responder,options={}) {
  const calls=[];
  assert.equal(typeof mod.createTeamMealsApi,'function','new transport factory must be present');
  const api=mod.createTeamMealsApi('https://worker.example.invalid',{token:()=>TOKEN,fetch:async (url,init)=>{calls.push({url:String(url),init,headers:new Headers(init?.headers)});return responder(String(url),init,calls.length);},...options});
  after(()=>api.dispose());
  return {api,calls};
}
function deferred(){let resolve; const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('legacy creates use If-None-Match and Ingredient retains its original semantics',async()=>{
 const calls=[];const api=mod.createHttpApi('https://worker.example.invalid',{token:()=>TOKEN,fetch:async (_,init)=>{calls.push(new Headers(init.headers));return json(write);}});
 await api.savePlan('p',{});await api.saveDish('d',{});await api.saveDishDraft('d',{});await api.saveIngredient('i',{});
 assert.deepEqual(calls.map(x=>x.get('If-None-Match')),['*','*','*',null]);
});
test('legacy typed readers reject v3 instead of casting optional fields to v2',async()=>{
 const api=new mod.HttpAdminApi('https://worker.example.invalid',{token:()=>TOKEN,fetch:async()=>json(source({schemaVersion:'3',meals:[]}))});
 await assert.rejects(api.getPlan('p'),{code:'unsupported_format'});
 const c=new mod.HttpAdminApi('https://worker.example.invalid',{token:()=>TOKEN,fetch:async()=>json(catalog())});
 await assert.rejects(c.getCatalog(),{code:'unsupported_format'});
});
test('only explicit 404 not_found is absent, including the legacy reader',async()=>{
 const api=new mod.HttpAdminApi('https://worker.example.invalid',{token:()=>TOKEN,fetch:async()=>error(404,'revision_unavailable')});
 await assert.rejects(api.getPlan('p'),{code:'revision_unavailable'});
});
test('new writes preserve unknown values, require strong conditions and never retry 409/428',async()=>{
 const {api,calls}=setup(()=>json(write));
 const plan={schemaVersion:'3',meals:[{date:'2026-09-11',mealType:'lunch',dishRef:'soup'}]};
 await api.savePlan('p',plan,{ifNoneMatch:'*'});
 await api.saveDish('soup',{schemaVersion:'3',name:{en:'Soup'},components:[{ingredientRef:'salt'}]},{ifMatch:A});
 await api.saveShoppingList('list',{shoppingListVersion:'1',id:'list',basis:{sourceRevision:A,selection:[]},items:[]},{ifNoneMatch:'*'});
 assert.equal(calls[0].headers.get('If-None-Match'),'*');assert.equal(calls[1].headers.get('If-Match'),A);
 assert.deepEqual(JSON.parse(calls[0].init.body),plan);
 for(const condition of [undefined,{}, {ifMatch:''},{ifMatch:'W/"abc"'},{ifMatch:'*'},{ifMatch:'a,b'},{ifMatch:A,ifNoneMatch:'*'}]) await assert.rejects(api.savePlan('p',plan,condition));
 assert.equal(calls.length,3);
 for(const [status,code] of [[409,'conflict'],[409,'format_downgrade'],[409,'review_required'],[428,'precondition_required']]) {
 const {api:a,calls:c}=setup(()=>error(status,code,{reviewRequired:['salt']}));
 await assert.rejects(a.savePlan('p',plan,{ifMatch:A}),e=>e.status===status && e.code===code && e.reviewRequired?.[0]==='salt');assert.equal(c.length,1);
 }
});
test('revision source/catalog cache is separate from current and deep cloned; mismatches never fallback',async()=>{
 const {api,calls}=setup(url=>url.includes('/catalog')?json(catalog(new URL(url).searchParams.get('revision')??B)):json(source({schemaVersion:'3',meals:[]},new URL(url).searchParams.get('revision')??B)));
 let r=await api.getPlan('p',{revision:A});r.content.meals.push({bad:true});
 assert.deepEqual((await api.getPlan('p',{revision:A})).content.meals,[]);
 assert.equal((await api.getPlan('p')).commit,B);await api.getCatalog({revision:A});await api.getCatalog({revision:B});
 assert.equal(calls.length,4);assert.ok(calls.every(c=>!c.url.includes(TOKEN)));
 const {api:bad,calls:badCalls}=setup(()=>json(source({},B)));
 await assert.rejects(bad.getPlan('p',{revision:A}),{code:'revision_mismatch'});assert.equal(badCalls.length,1);
 await assert.rejects(bad.getPlan('p',{revision:'main'}),{code:'invalid_revision'});assert.equal(badCalls.length,1);
});
test('revision errors are kept and shopping-list source uses own kind',async()=>{
 for(const [status,code] of [[422,'revision_unavailable'],[422,'basis_unavailable'],[422,'invalid_source'],[502,'upstream_error'],[404,'revision_unavailable']]) {
 const {api,calls}=setup(()=>error(status,code));await assert.rejects(api.getShoppingList('list',{revision:A}),{code});assert.equal(calls.length,1);assert.match(calls[0].url,/source\/shopping-list\/list/);
 }
 const {api}=setup(()=>error(404,'not_found'));assert.equal(await api.getShoppingList('list',{revision:A}),null);
});
test('asset fetch authenticates bytes and checks exact revision; full owner/pointer cache keys',async()=>{
 const {api,calls}=setup(()=>new Response('image-A',{headers:{'Content-Type':'image/png','X-Source-Revision':A}}));
 const query={revision:A,owner:'data/dishes/soup.json',pointer:'/image'};
 const first=await api.getAsset(query);assert.equal(await first.bytes.text(),'image-A');assert.equal(first.sourceRevision,A);
 await api.getAsset(query);await api.getAsset({...query,pointer:'/steps/0/image'});await api.getAsset({...query,owner:'data/ingredients/salt.json'});assert.equal(calls.length,3);
 assert.equal(calls[0].headers.get('Authorization'),`Bearer ${TOKEN}`);
 const {api:bad}=setup(()=>new Response('B',{headers:{'Content-Type':'image/png','X-Source-Revision':B}}));await assert.rejects(bad.getAsset(query),{code:'revision_mismatch'});
 const {api:external}=setup(()=>error(422,'external_asset_unpinned'));await assert.rejects(external.getAsset(query),{code:'external_asset_unpinned'});
});
test('token and identity change discard cache and reject late replies',async()=>{
 let token=TOKEN, identity='chef';const pending=deferred();
 const {api,calls}=setup((_,__,n)=>n===1?pending.promise:json(catalog(A)),{token:()=>token,identity:()=>identity});
 const old=api.getCatalog({revision:A});token='u'.repeat(43);await api.getCatalog({revision:A});pending.resolve(json(catalog(A)));await assert.rejects(old,{code:'session_changed'});
 await api.getCatalog({revision:A});assert.equal(calls.length,2);identity='buyer';await api.getCatalog({revision:A});assert.equal(calls.length,3);
});
test('logout/relogin with same token invalidates pending and cached reads',async()=>{
 const storage=new Map([['canteenos.token',TOKEN]]);globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const pending=deferred();const {api,calls}=setup((_,__,n)=>n===1?pending.promise:json(catalog(A)),{token:undefined});
 const old=api.getCatalog({revision:A});mod.clearToken();storage.set('canteenos.token',TOKEN);
 await api.getCatalog({revision:A});pending.resolve(json(catalog(A)));await assert.rejects(old,{code:'session_changed'});assert.equal(calls.length,2);
});
test('response body network failure is an unknown network error',async()=>{
 const {api}=setup(()=>new Response(new ReadableStream({start(c){c.error(new Error('secret transport details'));}})));
 await assert.rejects(api.savePlan('p',{}, {ifNoneMatch:'*'}),e=>e.code==='network'&&!e.message.includes('secret'));
});
test('new unconfigured flow cannot save and explicit mock HTTP has a mock capability',async()=>{
 assert.equal(typeof mod.createTeamMealsApi,'function');const api=mod.createTeamMealsApi('');after(()=>api.dispose());
 assert.equal(api.mode,'unconfigured');await assert.rejects(api.saveShoppingList('l',{}, {ifNoneMatch:'*'}),{code:'worker_unconfigured'});
 const {api:mock}=setup(()=>json(write),{mode:'mock'});assert.equal(mock.mode,'mock');
 assert.equal(mod.getApi() instanceof mod.HttpAdminApi,false); // original demonstration factory remains available
});

test('new contract error labels are distinct and available in all three languages',()=>{
 for(const lang of ['zh','en','uk']) {
  const conflict=mod.apiMessage(new mod.ApiError(409,'conflict','raw server'),lang);
  const downgrade=mod.apiMessage(new mod.ApiError(409,'format_downgrade','raw server'),lang);
  const review=mod.apiMessage(new mod.ApiError(409,'review_required','raw server'),lang);
  assert.equal(new Set([conflict,downgrade,review]).size,3);
  for(const code of ['unsupported_format','revision_unavailable','basis_unavailable','revision_mismatch','invalid_source','external_asset_unpinned','precondition_required','worker_unconfigured','session_changed']) assert.notEqual(mod.apiMessage(new mod.ApiError(422,code,''),lang),mod.apiMessage(new Error(),lang));
 }
});
test('reviewRequired is accepted only from a valid top-level array',async()=>{
 for(const value of [undefined,'salt',['bad id'],[1]]) {
  const {api}=setup(()=>error(409,'review_required',{reviewRequired:value}));
  await assert.rejects(api.savePlan('p',{}, {ifNoneMatch:'*'}),e=>e.code==='review_required'&&e.reviewRequired===undefined);
 }
});
test('legacy catalog cache cannot survive changing identity or logout',async()=>{
 let token=TOKEN,count=0;
 const api=mod.createHttpApi('https://worker.example.invalid',{token:()=>token,fetch:async()=>{count++;return json({...catalog(A),dishes:{}});}});
 await api.getCatalog();token='v'.repeat(43);await api.getCatalog();assert.equal(count,2);
 token=null;await assert.rejects(api.getCatalog(),{code:'unauthorized'});assert.equal(count,2);
});
test('writes invalidate current cached data while an older request cannot evict a newer forced read',async()=>{
 const pending=deferred();const {api,calls}=setup((url,init,n)=>init.method==='POST'?json(write):n===1?pending.promise:json(catalog(B)));
 const old=api.getCatalog();await api.savePlan('p',{}, {ifNoneMatch:'*'});await api.getCatalog({force:true});pending.resolve(json(catalog(A)));await old;
 assert.equal((await api.getCatalog()).commit,B);assert.equal(calls.length,3);
});
