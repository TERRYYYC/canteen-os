import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {publishedFixture} from './published-fixture.mjs';

const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const require=createRequire(import.meta.url),esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const temp=await mkdtemp(join(tmpdir(),'published-offline-'));
const bundle=await esbuild.build({stdin:{contents:"export * from './src/view-models/published';",resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
await writeFile(join(temp,'reader.mjs'),bundle.outputFiles[0].text);
const {createPublishedData}=await import(pathToFileURL(join(temp,'reader.mjs')).href);
const A=publishedFixture('image-a'),B=publishedFixture('image-b');
after(async()=>{A.cleanup();B.cleanup();await rm(temp,{recursive:true,force:true});});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const down=()=>{throw new TypeError('local app transport unavailable');};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(options={}) {
 const state={online:true,remote:A,installed:A,override:null},calls=[];
 const api=createPublishedData({baseUrl:'https://static.example.invalid/canteen/data/',...options,fetch:async(address,init)=>{
  const u=new URL(address);calls.push({url:u,init});
  const custom=await state.override?.(u,init);if(custom)return custom;
  const tagged=u.searchParams.has('__publication'),fixture=tagged?state.remote:state.installed;
  if(tagged&&!state.online)down();
  if(!fixture)return json({},404);
  if(u.pathname.endsWith('/build.json'))return json(fixture.manifest);
  if(u.pathname.endsWith('/team-meals/week-41.json'))return json(fixture.projection);
  down(); // Images have deliberately never been read into a runtime cache.
 }});
 return {api,state,calls};
}
const project=(api,p)=>api.loadPublishedTeamPlan(p,'week-41');
const projections=calls=>calls.filter(c=>c.url.pathname.includes('/team-meals/'));

test('first SW claim: verified fresh A recovers an unopened projection from installed A offline',async()=>{
 const {api,state,calls}=setup();const initial=await api.loadPublication();
 const fresh=await api.loadPublication({fresh:true});state.online=false;
 const view=await project(api,fresh);assert.equal(view.sourceRevision,A.revision);
 assert.deepEqual(view.projection.menuPlans,A.projection.menuPlans);
 assert.deepEqual(projections(calls).map(c=>!!c.url.search),[true,false]);
 await assert.rejects(project(api,initial),{code:'publication_changed'});
 assert.equal(calls.filter(c=>c.url.pathname.endsWith('/build.json')).length,2);
});
test('external B takeover: old A handles expire and unopened projection is installed B only',async()=>{
 const {api,state,calls}=setup();const old=await api.loadPublication(),oldView=await project(api,old);
 state.remote=B;state.installed=B;const fresh=await api.loadPublication({fresh:true});state.online=false;
 const view=await project(api,fresh);assert.equal(view.sourceRevision,B.revision);
 assert.deepEqual(view.projection.ingredients,B.projection.ingredients);
 await assert.rejects(project(api,old),{code:'publication_changed'});
 await assert.rejects(api.loadPublishedAsset(oldView,'/ingredients/tomato/image'),{code:'publication_changed'});
 assert.deepEqual(projections(calls).slice(-2).map(c=>!!c.url.search),[true,false]);
});
test('already controlled offline new document still reads ordinary installed manifest and projection',async()=>{
 const {api,state,calls}=setup();state.online=false;state.installed=B;
 const p=await api.loadPublication(),view=await project(api,p);
 assert.equal(view.sourceRevision,B.revision);assert.equal(calls.length,2);assert.ok(calls.every(c=>!c.url.search));
});
test('missing and wrong-revision copies fail instead of returning current or an empty plan',async()=>{
 for(const installed of [A,null]) {
  const {api,state}=setup();state.remote=B;const fresh=await api.loadPublication({fresh:true});state.online=false;state.installed=installed;
  await assert.rejects(project(api,fresh),{code:installed?'revision_mismatch':'unavailable',stage:'projection',sourceRevision:B.revision});
  state.installed=B;assert.equal((await project(api,fresh)).sourceRevision,B.revision,'failure must not poison the current-generation cache');
 }
});
test('ordinary same-revision response still passes all version, shape and asset-binding validation',async()=>{
 for(const [change,code] of [[p=>p.projectionVersion='2','unsupported_version'],[p=>p.menuPlans={},'invalid_data'],[p=>p.assets=[],'asset_binding_invalid']]) {
  const {api,state}=setup();const fresh=await api.loadPublication({fresh:true});state.online=false;
  const bad=structuredClone(A.projection);change(bad);
  state.override=u=>u.pathname.includes('/team-meals/')&&!u.search?json(bad):undefined;
  await assert.rejects(project(api,fresh),e=>{assert.equal(e.code,code);assert.equal(e.stage,'projection');assert.equal(e.sourceRevision,A.revision);assert.equal(new URL(e.url).search,'');return true;});
 }
});
test('tagged HTTP refusals, wrong revision and invalid JSON never retry through ordinary data',async()=>{
 const answers=[...[[404,'unavailable'],[410,'unavailable'],[500,'unavailable']].map(([s,code])=>[()=>json({},s),code]),
  [()=>json(B.projection),'revision_mismatch'],[()=>json({...A.projection,projectionVersion:'2'}),'unsupported_version'],
  [()=>new Response('{',{headers:{'Content-Type':'application/json'}}),'invalid_data']];
 for(const [reply,code] of answers) {
  const {api,state,calls}=setup();const fresh=await api.loadPublication({fresh:true});
  state.override=u=>u.pathname.includes('/team-meals/')?reply():undefined;
  await assert.rejects(project(api,fresh),{code});assert.equal(projections(calls).length,1);assert.ok(projections(calls)[0].url.search);
 }
});
test('failed fresh manifest and offline probes cannot adopt the installed older publication',async()=>{
 const {api,state,calls}=setup();const old=await api.loadPublication();state.online=false;
 await assert.rejects(api.probePublication(),{code:'unavailable',stage:'manifest'});assert.equal(await api.loadPublication(),old);
 await assert.rejects(api.loadPublication({fresh:true}),{code:'unavailable',stage:'manifest'});
 await assert.rejects(project(api,old),{code:'publication_changed'});
 assert.equal(calls.length,3);assert.ok(calls[1].url.search);assert.ok(calls[2].url.search);
});
test('probe, clone and foreign-reader handles never authorize ordinary-path recovery',async()=>{
 const {api,state,calls}=setup(),other=setup();const current=await api.loadPublication({fresh:true});
 const probe=await api.probePublication(),foreign=await other.api.loadPublication();state.online=false;
 for(const p of [probe,structuredClone(current),foreign])await assert.rejects(project(api,p),{code:'publication_changed'});
 assert.equal(projections(calls).length,0);assert.equal((await project(api,current)).sourceRevision,A.revision);
});
test('clear during tagged failure prevents any obsolete ordinary-path request',async()=>{
 const {api,state,calls}=setup();const p=await api.loadPublication({fresh:true}),gate=deferred(),entered=deferred();
 state.override=u=>{if(u.pathname.includes('/team-meals/')){entered.resolve();return gate.promise;}};
 const old=project(api,p);await entered.promise;api.clearCache();gate.reject(new TypeError('late A network failure'));
 await assert.rejects(old,{code:'publication_changed'});assert.equal(projections(calls).length,1);
});
test('late ordinary A success or failure cannot change B or remove its request cache',async()=>{
 for(const fails of [false,true]) {
  const {api,state,calls}=setup();const p=await api.loadPublication({fresh:true}),gate=deferred(),entered=deferred();state.online=false;
  state.override=u=>{if(u.pathname.includes('/team-meals/')&&!u.search){entered.resolve();return gate.promise;}};
  const old=project(api,p);const arrival=await Promise.race([entered.promise.then(()=>true),old.then(()=>false,()=>false)]);
  assert.equal(arrival,true,'the original failure must reach the ordinary candidate path');
  state.override=null;state.online=true;state.remote=B;state.installed=B;
  const next=await api.loadPublication({fresh:true}),view=await project(api,next);
  if(fails)gate.reject(new TypeError('late offline body'));else gate.resolve(json(A.projection));
  await assert.rejects(old,{code:'publication_changed'});const count=calls.length;
  assert.equal(await project(api,next),view);assert.equal(calls.length,count);
 }
});
test('concurrent readers share the recovered validated plan and still reject unseen image bytes',async()=>{
 const {api,state,calls}=setup();const p=await api.loadPublication({fresh:true});state.online=false;
 const [a,b]=await Promise.all([project(api,p),project(api,p)]);assert.equal(a,b);assert.equal(projections(calls).length,2);
 await assert.rejects(api.loadPublishedAsset(a,'/ingredients/egg/image'),{code:'asset_unavailable',sourceRevision:A.revision});
 const imageCall=calls.at(-1).url;assert.ok(imageCall.pathname.includes('/assets/'+A.revision+'/'));assert.equal(imageCall.search,'');
});
test('tagged projection body timeout can recover while generation remains current',async()=>{
 const {api,state}=setup({timeoutMs:15});const p=await api.loadPublication({fresh:true});let close;
 state.override=u=>u.pathname.includes('/team-meals/')&&u.search?new Response(new ReadableStream({start(c){close=()=>c.close();}}),{headers:{'Content-Type':'application/json'}}):undefined;
 try {assert.equal((await project(api,p)).sourceRevision,A.revision);} finally {close?.();}
});
test('legacy sheets lack a revision identity and do not gain an unverified recovery path',async()=>{
 const {api,state,calls}=setup();state.override=u=>u.pathname.endsWith('/build.json')?json({builtAt:'2026-09-11',commit:'local',plans:['week-41']}):undefined;
 await api.loadPublication({fresh:true});state.online=false;
 await assert.rejects(api.loadMenu('week-41'),{code:'unavailable'});
 assert.equal(calls.length,2);assert.ok(calls.at(-1).url.search);
});
