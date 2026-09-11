import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'c2b-c1-auth-'));after(()=>rm(dir,{recursive:true,force:true}));
const bundled=await esbuild.build({stdin:{contents:"export * from './src/view-models/edit-session';export * from './src/view-models/reload-safety';export * from './src/admin/token';export {ApiError} from './src/api/types';export {createTeamMealsApi} from './src/api/team-meals';",resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
const file=join(dir,'session.mjs');await writeFile(file,bundled.outputFiles[0].text);let sequence=0;
async function setup(){
 const values=new Map([['canteenos.token','A'.repeat(43)]]);
 globalThis.sessionStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const m=await import(`${pathToFileURL(file).href}?case=${++sequence}`);m.getAuthSessionVersion();
 return {m,change(){values.set('canteenos.token','B'.repeat(43));m.getAuthSessionVersion();}};
}
const A='a'.repeat(40),B='b'.repeat(40),source={content:{name:'saved'},commit:A,blobSha:A},ack={commit:B,blobSha:B,unchanged:false,warnings:[]};
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
function editor(m,gate){const e=m.createEditSession({mode:()=> 'mock',save:()=>gate.promise,read:async()=>source});e.open({kind:'dish',id:'private-a'},{name:'PRIVATE-A-BODY'},source);return e;}
test('a held old-auth C1 save retains only generic protection; its own acknowledgement cannot settle B',async()=>{
 const {m,change}=await setup(),oldGate=deferred(),old=editor(m,oldGate),oldSave=old.save();change();
 const snapshot=m.inspectReloadSafety();assert.equal(snapshot.reason,'unknown');
 assert.equal(JSON.stringify(snapshot).includes('private-a'),false);assert.equal(JSON.stringify(snapshot).includes('PRIVATE-A'),false);
 assert.equal(old.getState().draft,null);assert.equal(old.getState().identity,null);old.dispose();
 let reloads=0;const c=m.createReloadCoordinator({reload:()=>reloads++,activate:async()=>{},hasWaiting:()=>false});
 assert.equal((await c.requestUpdate()).status,'blocked');assert.equal((await old.reconcileUnknown()).status,'blocked');
 const newGate=deferred(),newer=editor(m,newGate),newSave=newer.save();oldGate.resolve(ack);await oldSave;
 assert.equal(m.inspectReloadSafety().reason,'saving');assert.equal(newer.getState().phase,'saving');
 newGate.resolve(ack);await newSave;assert.equal(m.inspectReloadSafety().reason,'clear');
 await c.requestUpdate();assert.equal(reloads,1);
});
test('already unknown writes stay unknown after normal logout, dispose and later identity changes',async()=>{
 const {m,change}=await setup(),gate=deferred(),old=editor(m,gate),pending=old.save();gate.reject(Error('Lost acknowledgement'));await pending;
 change();m.clearToken();old.dispose();assert.equal(m.inspectReloadSafety().reason,'unknown');
 assert.equal(old.getState().draft,null);assert.equal(old.edit({name:'B override'}),false);assert.equal((await old.save()).status,'blocked');
 const c=m.createReloadCoordinator({reload(){assert.fail('No reload');},activate:async()=>assert.fail('No activation'),hasWaiting:()=>true});
 c.timeout();assert.equal(c.onNeedReload(),false);assert.equal((await c.requestUpdate()).status,'blocked');
});
test('definite old HTTP rejection can end only its save; session_changed and ambiguous responses cannot',async()=>{
 for(const [status,code,expected] of [[409,'conflict','clear'],[401,'unauthorized','clear'],[429,'rate_limited','clear'],[0,'session_changed','unknown'],[422,'bad_response','unknown'],[503,'unavailable','unknown'],[408,'timeout','unknown']]) {
  const {m,change}=await setup(),gate=deferred(),old=editor(m,gate),pending=old.save();change();gate.reject(new m.ApiError(status,code,''));await pending;
  assert.equal(m.inspectReloadSafety().reason,expected,`${status}/${code}`);
 }
});
test('an auth change during the saving notification does not invent an external request',async()=>{
 const {m,change}=await setup();let writes=0;
 const e=m.createEditSession({mode:()=> 'mock',save:async()=>{writes++;return ack;},read:async()=>source});
 e.open({kind:'dish',id:'private'},{name:'changed'},source);e.subscribe(s=>{if(s.phase==='saving')change();});
 assert.equal((await e.save()).status,'stale');assert.equal(writes,0);assert.equal(m.inspectReloadSafety().reason,'clear');
});
test('real Team API session invalidation is not proof that the dispatched write did not happen',async()=>{
 const {m,change}=await setup(),response=deferred();let writes=0;
 const api=m.createTeamMealsApi('https://example.invalid',{fetch:async()=>{writes++;return response.promise;}});
 const e=m.createEditSession({mode:()=>api.mode,authSession:()=>api.sessionKey(),peekAuthSession:()=>api.peekSessionKey?.(),save:(_id,body,condition)=>api.saveDish('dish',body,condition),read:async()=>source});
 e.open({kind:'dish',id:'private-a'},{name:'private-body'},source);const pending=e.save();assert.equal(writes,1);change();
 response.resolve(new Response(JSON.stringify({ok:true,...ack}),{headers:{'Content-Type':'application/json'}}));await pending;
 assert.equal(m.inspectReloadSafety().reason,'unknown');assert.equal(e.getState().draft,null);assert.equal(JSON.stringify(m.inspectReloadSafety()).includes('private'),false);
});
test('the global auth lifetime still applies when an injected adapter keeps a constant identity',async()=>{
 const {m,change}=await setup(),gate=deferred();
 const e=m.createEditSession({mode:()=> 'mock',authSession:()=>7,peekAuthSession:()=>7,save:()=>gate.promise,read:async()=>source});
 e.open({kind:'dish',id:'private-constant-adapter'},{name:'PRIVATE'},source);const pending=e.save();change();
 assert.equal(e.getState().draft,null);assert.equal(m.inspectReloadSafety().reason,'unknown');assert.equal(JSON.stringify(m.inspectReloadSafety()).includes('private-constant'),false);
 gate.resolve(ack);await pending;assert.equal(m.inspectReloadSafety().reason,'clear');
});
