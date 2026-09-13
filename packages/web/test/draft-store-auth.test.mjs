import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'c2b-store-'));after(()=>rm(dir,{recursive:true,force:true}));
const bundle=await esbuild.build({stdin:{contents:"export * from './src/admin/store';export {clearToken,onAuthSessionChange} from './src/admin/token';export {inspectReloadSafety} from './src/view-models/reload-safety';export {createTeamMealsApi} from './src/api/team-meals';export {createEditSession} from './src/view-models/edit-session';",resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
await writeFile(join(dir,'store.mjs'),bundle.outputFiles[0].text);const m=await import(pathToFileURL(join(dir,'store.mjs')).href);
function boundary(){let key=1;return {api:{mode:'mock',sessionKey:()=>key,peekSessionKey:()=>key},rotate:()=>key++};}
function bind(api){assert.equal(typeof m.bindDraftStore,'function');return m.bindDraftStore(api);}
const plan=(name='private-A')=>({schemaVersion:'3',name:{en:name},margin:1.17,meals:[{date:'2026-09-11',mealType:'lunch',dishRef:'soup'}]});
const stale=fn=>assert.throws(fn,{code:'session_changed'});

test('same API lifetime preserves clones, whole v2/v3 documents and one-level undo across page handles',()=>{
 const {api}=boundary(),a=bind(api),first=plan();a.setDraftPlan('p',first,'import');first.name.en='outside mutation';
 const b=bind(api);assert.equal(b.getDraftPlan('p').name.en,'private-A');b.getDraftPlan('p').meals.push({bad:true});assert.equal(a.getDraftPlan('p').meals.length,1);
 const v2={schemaVersion:'2',meals:[{date:'2026-09-11',mealType:'lunch',dishRef:'soup',plannedServings:8}]};
 b.setDraftPlan('p',v2,'edit');assert.equal(a.getDraftSource('p'),'edit');assert.equal(a.undoDraftPlan('p'),true);assert.deepEqual(b.getDraftPlan('p'),plan());
 b.setHandoff({newDishName:'Draft name',returnTo:'#/admin/plan/p'});assert.deepEqual(a.takeHandoff(),{newDishName:'Draft name',returnTo:'#/admin/plan/p'});assert.deepEqual(b.takeHandoff(),{});a.clearDraftPlan('p');
});
test('auth changes hide drafts, undo and handoff; stale operations cannot rebind or clear the new identity',()=>{
 const scope=boundary(),a=bind(scope.api);a.setDraftPlan('p',plan(),'import');a.setDraftPlan('p',plan('second-A'),'edit');a.setHandoff({newDishName:'private-A'});
 scope.rotate();assert.equal(JSON.stringify(m.inspectReloadSafety()).includes('"id":"p"'),false);
 const b=bind(scope.api);assert.equal(b.getDraftPlan('p'),null);assert.equal(b.getDraftSource('p'),null);assert.equal(b.undoDraftPlan('p'),false);assert.deepEqual(b.takeHandoff(),{});
 b.setDraftPlan('p',plan('B'),'import');b.setHandoff({newDishName:'B'});
 for(const action of [()=>a.getDraftPlan('p'),()=>a.getDraftSource('p'),()=>a.setDraftPlan('p',plan(),'edit'),()=>a.clearDraftPlan('p'),()=>a.undoDraftPlan('p'),()=>a.setHandoff({newDishName:'A late'}),()=>a.takeHandoff()])stale(action);
 assert.equal(b.getDraftPlan('p').name.en,'B');assert.equal(b.takeHandoff().newDishName,'B');b.clearDraftPlan('p');
});
test('different API instances with identical numeric session keys and changed modes do not share data',()=>{
 const one=boundary(),two=boundary(),a=bind(one.api);a.setDraftPlan('p',plan(),'import');const b=bind(two.api);assert.equal(b.getDraftPlan('p'),null);stale(()=>a.clearDraftPlan('p'));
 b.setDraftPlan('p',plan('B'),'import');two.api.mode='real';const c=bind(two.api);assert.equal(c.getDraftPlan('p'),null);stale(()=>b.setHandoff({newDishName:'late'}));
});
test('logout invalidates existing handles immediately, while explicit rebind can start empty',()=>{
 const {api}=boundary(),a=bind(api);a.setDraftPlan('p',plan(),'import');m.clearToken();assert.equal(m.inspectReloadSafety().reason,'clear');stale(()=>a.getDraftPlan('p'));assert.equal(bind(api).getDraftPlan('p'),null);
});
test('unscoped exports cannot read, overwrite or delete scoped state',()=>{
 const {api}=boundary(),store=bind(api);store.setDraftPlan('p',plan('B'),'import');store.setHandoff({newDishName:'B'});
 for(const action of [()=>m.getDraftPlan('p'),()=>m.getDraftSource('p'),()=>m.setDraftPlan('p',plan(),'edit'),()=>m.clearDraftPlan('p'),()=>m.undoDraftPlan('p'),()=>m.setHandoff({newDishName:'late'}),()=>m.takeHandoff()])assert.throws(action,{code:'store_scope_required'});
 assert.equal(store.getDraftPlan('p').name.en,'B');assert.equal(store.takeHandoff().newDishName,'B');store.clearDraftPlan('p');
});
test('a handoff alone is protected without exposing its text or return address',()=>{
 const {api}=boundary(),store=bind(api);store.setHandoff({newDishName:'PRIVATE',returnTo:'PRIVATE-ROUTE'});
 assert.equal(m.inspectReloadSafety().reason,'dirty');assert.equal(JSON.stringify(m.inspectReloadSafety()).includes('PRIVATE'),false);
 store.takeHandoff();assert.equal(m.inspectReloadSafety().reason,'clear');
});
test('inspection after a credential change does not observe auth, erase unknown C1, or clear drafts and handoff',async()=>{
 const values=new Map([['canteenos.token','A'.repeat(43)]]);
 globalThis.sessionStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const api=m.createTeamMealsApi('https://example.invalid',{fetch:async()=>{throw Error('No network in this fixture');}});
 const saved={content:{name:'saved'},commit:'a'.repeat(40),blobSha:'a'.repeat(40)};
 const e=m.createEditSession({mode:()=>api.mode,authSession:()=>api.sessionKey(),peekAuthSession:()=>api.peekSessionKey?.(),save:async()=>{throw Error('Synthetic lost acknowledgement');},read:async()=>saved});
 const store=bind(api);store.setDraftPlan('private-doc',plan(),'import');store.setHandoff({newDishName:'private-A'});
 e.open({kind:'dish',id:'private-dish'},{name:'unsaved'},saved);await e.save();
 assert.ok(m.inspectReloadSafety().records.some(r=>r.id==='private-dish'&&r.phase==='outcome-unknown'));
 let latest;e.subscribe(s=>{latest=s;});const before=structuredClone(latest);let authEvents=0;const off=m.onAuthSessionChange(()=>authEvents++);
 try {
  values.set('canteenos.token','B'.repeat(43));
  const state=m.inspectReloadSafety();assert.equal(state.reason,'unknown');assert.equal(authEvents,0);assert.deepEqual(latest,before);
  assert.equal(JSON.stringify(state).includes('private-'),false);
  assert.equal(m.inspectReloadSafety().reason,'unknown');assert.equal(authEvents,0);
  values.set('canteenos.token','A'.repeat(43));
  assert.deepEqual(e.getState(),before);assert.equal(store.getDraftPlan('private-doc').name.en,'private-A');assert.equal(store.takeHandoff().newDishName,'private-A');
  await e.reconcileUnknown();assert.equal(e.dispose(),true);
 } finally {off();m.clearToken();api.dispose();delete globalThis.sessionStorage;}
});
test('real API pure observation detects injected credential and identity changes without advancing its key',()=>{
 let token='A'.repeat(43),identity=1;
 const api=m.createTeamMealsApi('https://example.invalid',{token:()=>token,identity:()=>identity});
 try {
  const key=api.sessionKey();assert.equal(api.peekSessionKey(),key);
  token='B'.repeat(43);assert.equal(api.peekSessionKey(),null);assert.equal(api.peekSessionKey(),null);
  token='A'.repeat(43);assert.equal(api.peekSessionKey(),key);
  identity=2;assert.equal(api.peekSessionKey(),null);identity=1;assert.equal(api.peekSessionKey(),key);
  token='B'.repeat(43);assert.notEqual(api.sessionKey(),key);assert.equal(typeof api.peekSessionKey(),'number');
 } finally {api.dispose();}
});
