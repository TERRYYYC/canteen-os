import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'c2b-aux-auth-'));after(()=>rm(dir,{recursive:true,force:true}));
// Optional exact source revision supports reproducing the pre-fix privacy regression.
const plugins=process.env.C2B_REVIEW_BASE?[{name:'fixed-base',setup(build){build.onLoad({filter:/view-models\/reload-safety\.ts$/},()=>({contents:execFileSync('git',['show',`${process.env.C2B_REVIEW_BASE}:packages/web/src/view-models/reload-safety.ts`],{cwd:root,encoding:'utf8'}),loader:'ts'}));}}]:[];
const bundle=await esbuild.build({stdin:{contents:"export * from './src/view-models/reload-safety';export * from './src/admin/token';",resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent',plugins});
const file=join(dir,'aux.mjs');await writeFile(file,bundle.outputFiles[0].text);let sequence=0;
async function setup(){
 const values=new Map([['canteenos.token','A'.repeat(43)]]);
 globalThis.sessionStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const m=await import(`${pathToFileURL(file).href}?case=${++sequence}`);m.getAuthSessionVersion();
 return {m,change(){values.set('canteenos.token','B'.repeat(43));m.getAuthSessionVersion();}};
}
const idle=()=>({generation:0,dirty:false,phase:'idle'});
test('auth cleanup cannot erase two old pending tickets or reveal private owner identity',async()=>{
 const {m,change}=await setup();let state=idle(),reads=0;
 const options={ownerId:'private-owner-a',identity:{kind:'dish',id:'private-document-a'},operationTracking:'tickets',read:()=>{reads++;return state;}};
 const old=m.registerAuxiliaryEdits(options),first=old.beginOperation('write'),second=old.beginOperation('write');
 state={generation:1,dirty:false,phase:'busy'};assert.equal(m.inspectReloadSafety().reason,'saving');
 assert.throws(()=>m.registerAuxiliaryEdits(options));
 m.onAuthSessionChange(()=>{state={generation:2,dirty:false,phase:'idle'};});change();
 reads=0;const snapshot=m.inspectReloadSafety();assert.equal(snapshot.reason,'unknown');assert.equal(JSON.stringify(snapshot).includes('private-'),false);assert.equal(reads,0);
 assert.equal(old.dispose(),false);assert.equal(old.cancelRead(first),false);
 const newState={generation:0,dirty:true,phase:'idle'};
 const newer=m.registerAuxiliaryEdits({...options,identity:{kind:'dish',id:'new-document'},read:()=>newState});
 const newTicket=newer.beginOperation('write');
 assert.equal(newer.settleOperation(first,'completed'),false);assert.equal(old.settleOperation(newTicket,'completed'),false);
 assert.equal(old.settleOperation(first,'completed'),true);assert.equal(m.inspectReloadSafety().reason,'unknown');
 old.markUnknown(second);assert.equal(old.settleOperation(second,'failed'),true);assert.equal(m.inspectReloadSafety().reason,'saving');
 assert.equal(old.settleOperation(second,'completed'),false);assert.equal(old.dispose(),true);
 newer.settleOperation(newTicket,'completed');assert.equal(m.inspectReloadSafety().reason,'dirty');assert.deepEqual(newState,{generation:0,dirty:true,phase:'idle'});
});
test('read cancellation ends only that local task; unknown writes require definite settlement',async()=>{
 const {m,change}=await setup();const h=m.registerAuxiliaryEdits({ownerId:'operations',identity:{kind:'operation',id:'read-write'},operationTracking:'tickets',read:idle});
 const read=h.beginOperation('read'),write=h.beginOperation('write');h.markUnknown(write);change();
 assert.equal(h.cancelRead(write),false);assert.equal(h.cancelRead(read),true);assert.equal(m.inspectReloadSafety().reason,'unknown');
 assert.equal(h.settleOperation({},'completed'),false);assert.equal(h.settleOperation(write,'cancelled'),false);
 assert.equal(h.settleOperation(write,'completed'),true);assert.equal(m.inspectReloadSafety().reason,'clear');
});
test('pure scope inspection never invokes an observing boundary or old read callback',async()=>{
 const {m}=await setup();let key=1,observations=0,reads=0;
 const boundary={mode:'mock',sessionKey:()=>{observations++;return key;},peekSessionKey:()=>key};
 const h=m.registerAuxiliaryEdits({ownerId:'scope-private',identity:{kind:'dish',id:'private-id'},boundary,operationTracking:'tickets',read:()=>{reads++;return idle();}});
 const ticket=h.beginOperation('write');key=2;observations=0;
 assert.equal(m.inspectReloadSafety().reason,'unknown');assert.equal(m.inspectReloadSafety().reason,'unknown');assert.equal(observations,0);assert.equal(reads,0);
 h.settleOperation(ticket,'failed');assert.equal(m.inspectReloadSafety().reason,'clear');
});
test('declared local buffers can leave a previous auth; legacy or incomplete tracking stays unknown',async()=>{
 const {m,change}=await setup();
 const local=m.registerAuxiliaryEdits({ownerId:'local-private',identity:{kind:'dish',id:'private-local'},operationTracking:'local-only',read:()=>({generation:1,dirty:true,phase:'idle'})});
 change();assert.equal(m.inspectReloadSafety().reason,'clear');assert.equal(JSON.stringify(m.inspectReloadSafety()).includes('private'),false);assert.equal(local.dispose(),true);
 const legacy=m.registerAuxiliaryEdits({ownerId:'legacy-private',identity:{kind:'dish',id:'private-legacy'},read:idle});m.clearToken();
 assert.equal(m.inspectReloadSafety().reason,'unknown');assert.equal(legacy.dispose(),false);
});
test('missing pure seam and a declared ticket owner with an unregistered operation fail closed',async()=>{
 const {m}=await setup();let observer=0;
 const noPeek=m.registerAuxiliaryEdits({ownerId:'missing-peek',identity:{kind:'dish',id:'private-id'},boundary:{mode:'mock',sessionKey:()=>++observer},read:idle});
 observer=0;assert.equal(m.inspectReloadSafety().reason,'unknown');assert.equal(observer,0);assert.equal(JSON.stringify(m.inspectReloadSafety()).includes('private-id'),false);assert.equal(noPeek.dispose(),false);
 const incomplete=m.registerAuxiliaryEdits({ownerId:'incomplete',identity:{kind:'dish',id:'d'},operationTracking:'tickets',read:()=>({generation:1,dirty:false,phase:'unknown'})});
 assert.equal(m.inspectReloadSafety().reason,'unknown');m.clearToken();assert.equal(incomplete.dispose(),false);
});
test('auth change conceals old coverage IDs including stamps without clearing the old registration',async()=>{
 const {m,change}=await setup();const pages=m.createPageReloadCoverage();
 const old=pages.beginRender('admin','plan/private-plan-a');change();
 const before=m.inspectReloadSafety();assert.equal(before.reason,'unknown');assert.equal(JSON.stringify(before).includes('private-plan-a'),false);
 const newer=pages.beginRender('admin','plan/new-plan-b');old('tracked');
 assert.equal(m.inspectReloadSafety().reason,'untracked');assert.equal(JSON.stringify(m.inspectReloadSafety()).includes('private-plan-a'),false);
 newer('tracked');assert.equal(m.inspectReloadSafety().reason,'clear');
 const latest=pages.beginRender('admin','plan/new-plan-b');newer('read-only');assert.equal(m.inspectReloadSafety().reason,'untracked');latest('tracked');
});
