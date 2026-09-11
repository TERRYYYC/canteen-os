import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'c2b-reload-'));after(()=>rm(dir,{recursive:true,force:true}));
const entry=existsSync(join(root,'src/view-models/reload-safety.ts'))?"export * from './src/view-models/reload-safety';":'';
const bundle=await esbuild.build({stdin:{contents:`export * from './src/view-models/edit-session';export * from './src/admin/store';export * from './src/admin/token';${entry}`,resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
await writeFile(join(dir,'edit.mjs'),bundle.outputFiles[0].text);const m=await import(pathToFileURL(join(dir,'edit.mjs')).href);
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
const A='a'.repeat(40),B='b'.repeat(40),body={name:'draft'},source={content:{name:'saved'},commit:A,blobSha:A};
const ack={commit:B,blobSha:B,unchanged:false,warnings:[]};
function editor(overrides={}){return m.createEditSession({mode:()=> 'mock',save:async()=>ack,read:async()=>source,...overrides});}
function coordinator(waiting=false){let reloads=0,activations=0;assert.equal(typeof m.createReloadCoordinator,'function');return {c:m.createReloadCoordinator({reload:()=>reloads++,activate:async()=>{activations++;},hasWaiting:()=>waiting}),counts:()=>({reloads,activations})};}
function close(e){assert.equal(e.dispose(),true);}

test('offscreen dirty documents block updates, with no disposal or hidden saves',async()=>{
 const e=editor();e.open({kind:'plan',id:'p'},body,source);e.open({kind:'dish',id:'d'},source.content,source);e.invalidate();
 const before=e.getState(),{c,counts}=coordinator();const result=await c.requestUpdate();
 assert.equal(result.status,'confirm-discard');assert.ok(result.snapshot.records.some(r=>r.id==='p'&&r.dirty));
 assert.equal('draft' in result.snapshot.records[0],false);assert.deepEqual(e.getState(),before);assert.deepEqual(counts(),{reloads:0,activations:0});close(e);
});
test('pending and unknown offscreen writes cannot be bypassed by discard, timeout or plugin reload',async()=>{
 const gate=deferred(),e=editor({save:()=>gate.promise});e.open({kind:'plan',id:'p'},body,source);const save=e.save();e.invalidate();
 const {c,counts}=coordinator(true);let r=await c.requestUpdate();assert.equal(r.status,'blocked');assert.equal(r.snapshot.reason,'saving');
 gate.reject(new Error('lost response'));await save;r=await c.requestUpdate();assert.equal(r.snapshot.reason,'unknown');
 assert.equal((await c.confirmDiscard(r.snapshot)).status,'blocked');c.timeout();assert.equal(c.onNeedReload(),false);
 assert.deepEqual(counts(),{reloads:0,activations:0});assert.equal(e.dispose(),false);
 e.open({kind:'plan',id:'p'},{});await e.reconcileUnknown();close(e);
});
test('reconciliation still unknown blocks; known miss becomes dirty and requires explicit choice',async()=>{
 let unavailable=true;const e=editor({save:async()=>{throw new Error('lost');},read:async()=>{if(unavailable)throw new Error('offline');return source;}});
 e.open({kind:'plan',id:'p'},body,source);await e.save();await e.reconcileUnknown();const {c}=coordinator();assert.equal((await c.requestUpdate()).snapshot.reason,'unknown');
 unavailable=false;await e.reconcileUnknown();assert.equal((await c.requestUpdate()).status,'confirm-discard');close(e);
});
test('discard consent expires with new input or newly started writes',async()=>{
 for(const write of [false,true]){
  const gate=deferred(),e=editor({save:()=>gate.promise});e.open({kind:'plan',id:'p'},body,source);const {c,counts}=coordinator();const first=await c.requestUpdate();
  let save;if(write)save=e.save();else e.edit({name:'new input'});
  assert.equal((await c.confirmDiscard(first.snapshot)).status,'blocked');assert.equal(counts().reloads,0);
  if(save){gate.resolve(ack);await save;}close(e);
 }
});
test('clean or exact explicit discard reload once; externally reported control changes never authorize reload',async()=>{
 const e=editor();e.open({kind:'plan',id:'p'},source.content,source);const {c,counts}=coordinator();assert.equal(c.onNeedReload(),false);
 assert.equal((await c.requestUpdate()).status,'started');assert.equal(counts().reloads,1);c.onNeedReload();assert.equal(counts().reloads,1);close(e);
 const d=editor();d.open({kind:'plan',id:'p'},body,source);const x=coordinator();const result=await x.c.requestUpdate();await x.c.confirmDiscard(result.snapshot);assert.equal(x.counts().reloads,1);close(d);
});
test('new edits after SW activation block eventual plugin reload; timeout never forces a reload',async()=>{
 const e=editor();e.open({kind:'plan',id:'p'},source.content,source);const {c,counts}=coordinator(true);await c.requestUpdate();e.edit(body);
 assert.equal(c.onNeedReload(),false);assert.deepEqual(counts(),{reloads:0,activations:1});c.timeout();close(e);
 const safe=coordinator(true);await safe.c.requestUpdate();safe.c.timeout();assert.equal(safe.c.onNeedReload(),false);assert.equal(safe.counts().reloads,0);
});
test('legacy draft store preserves v3/clone/undo and participates in global reload checks',async()=>{
 const store=m.bindDraftStore({mode:'mock',sessionKey:()=>1,peekSessionKey:()=>1});
 const p={schemaVersion:'3',meals:[]};store.setDraftPlan('p',p,'import');p.meals.push({bad:true});assert.deepEqual(store.getDraftPlan('p').meals,[]);
 const next={schemaVersion:'3',meals:[{date:'2026-09-11',mealType:'lunch',dishRef:'soup'}]};store.setDraftPlan('p',next,'edit');store.undoDraftPlan('p');assert.deepEqual(store.getDraftPlan('p').meals,[]);
 const {c}=coordinator();assert.equal((await c.requestUpdate()).status,'confirm-discard');store.clearDraftPlan('p');assert.equal(m.inspectReloadSafety().reason,'clear');
});
test('untracked editing surface fails closed and safety inspection is read-only',async()=>{
 assert.equal(typeof m.setReloadCoverage,'function');m.setReloadCoverage('untracked');const before=m.inspectReloadSafety();const {c,counts}=coordinator();assert.equal((await c.requestUpdate()).snapshot.reason,'untracked');
 assert.deepEqual(m.inspectReloadSafety(),before);assert.equal(counts().reloads,0);m.setReloadCoverage('read-only');
});
test('auxiliary raw input and pre-save work survive navigation and stay metadata-only',async()=>{
 let state={generation:0,dirty:true,phase:'idle',file:'PRIVATE-BODY',token:'PRIVATE-TOKEN'};
 const h=m.registerAuxiliaryEdits({ownerId:'dish-buffer/d',identity:{kind:'dish',id:'d'},read:()=>state});
 assert.throws(()=>m.registerAuxiliaryEdits({ownerId:'dish-buffer/d',identity:{kind:'dish',id:'d'},read:()=>state}));
 const {c,counts}=coordinator();const first=await c.requestUpdate();assert.equal(first.status,'confirm-discard');
 assert.equal(JSON.stringify(first.snapshot).includes('PRIVATE'),false);assert.equal(h.dispose(),false);
 m.setReloadCoverage('read-only','elsewhere');state={...state,generation:1,phase:'busy'};
 assert.equal((await c.confirmDiscard(first.snapshot)).status,'blocked');assert.equal((await c.requestUpdate()).snapshot.reason,'saving');assert.equal(h.dispose(),false);
 state={...state,generation:2,phase:'unknown'};assert.equal((await c.requestUpdate()).snapshot.reason,'unknown');assert.equal(h.dispose(),false);
 state={...state,generation:3,phase:'idle'};const next=await c.requestUpdate();
 state={...state,generation:4};assert.equal((await c.confirmDiscard(next.snapshot)).status,'blocked');assert.equal(counts().reloads,0);
 state={generation:5,dirty:false,phase:'idle'};assert.equal(h.dispose(),true);assert.equal(m.inspectReloadSafety().reason,'clear');
});
test('provider read failures block and cannot be silently disposed',async()=>{
 let broken=true;const h=m.registerAuxiliaryEdits({ownerId:'read-failure',identity:{kind:'dish',id:'f'},read:()=>{if(broken)throw Error('PRIVATE');return {generation:1,dirty:false,phase:'idle'};}});
 assert.equal(m.inspectReloadSafety().reason,'unknown');assert.equal(h.dispose(),false);assert.equal(JSON.stringify(m.inspectReloadSafety()).includes('PRIVATE'),false);
 broken=false;assert.equal(h.dispose(),true);
});
test('purchase requires explicit coverage; leaving a loading page and replacing its render have different lifetimes',()=>{
 const pages=m.createPageReloadCoverage();
 const purchase=pages.beginRender('purchase','');assert.equal(m.inspectReloadSafety().reason,'untracked');
 const home=pages.beginRender('admin','');home('read-only');assert.equal(m.inspectReloadSafety().reason,'untracked');
 // A completed offscreen registration can acknowledge its still-current identity.
 purchase('tracked');assert.equal(m.inspectReloadSafety().reason,'clear');
 const old=pages.beginRender('admin','dish/new');pages.beginRender('menu','');assert.equal(m.inspectReloadSafety().reason,'untracked');
 const current=pages.beginRender('admin','dish/new');old('read-only');assert.equal(m.inspectReloadSafety().reason,'untracked');
 let state={generation:0,dirty:true,phase:'idle'};
 const h=m.registerAuxiliaryEdits({ownerId:'coverage-buffer',identity:{kind:'dish',id:'new'},read:()=>state});
 current('read-only');assert.equal(m.inspectReloadSafety().reason,'dirty');
 state={generation:1,dirty:false,phase:'idle'};assert.equal(h.dispose(),true);assert.equal(m.inspectReloadSafety().reason,'clear');
});
test('synthetic login links and stale contexts never enter page identity, snapshots or stamps',()=>{
 const values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 globalThis.location={hash:''};globalThis.history={replaceState:(_a,_b,url)=>{location.hash=url;}};
 const pages=m.createPageReloadCoverage();
 try {
  for(const [candidate,existing,prefix='t/'] of [['A'.repeat(43),null],['B'.repeat(43),'A'.repeat(43)],['I'.repeat(42),null],['C'.repeat(43),null,'/t/'],['D'.repeat(43),null,'t//'],['E'.repeat(43),null,'//t//']]) {
   m.clearToken();if(existing)sessionStorage.setItem('canteenos.token',existing);
   const raw=`${prefix}${candidate}/dish/new`;location.hash=`#/admin/${encodeURIComponent(raw)}`;
   const sanitized=m.consumeTokenFromRest(raw);assert.equal(sanitized,'dish/new');assert.equal(location.hash,'#/admin/dish/new');
   // Even an old caller passing its pre-replaceState context cannot retain the credential.
   const old=pages.beginRender('admin',raw);const snapshot=JSON.stringify(m.inspectReloadSafety());
   assert.equal(snapshot.includes(candidate),false);assert.equal(existing? snapshot.includes(existing):false,false);
   const current=pages.beginRender('admin',sanitized);old('read-only');assert.equal(m.inspectReloadSafety().reason,'untracked');
   current('read-only');assert.equal(m.inspectReloadSafety().reason,'clear');
   const language=pages.beginRender('admin',m.consumeTokenFromRest(raw));language('read-only');assert.equal(m.inspectReloadSafety().reason,'clear');
  }
 } finally {m.clearToken();delete globalThis.sessionStorage;delete globalThis.location;delete globalThis.history;}
});
