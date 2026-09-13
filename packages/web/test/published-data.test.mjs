import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {publishedFixture} from './published-fixture.mjs';
const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const require=createRequire(import.meta.url),esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const temp=await mkdtemp(join(tmpdir(),'c2b-data-'));after(()=>rm(temp,{recursive:true,force:true}));
const path=join(root,'src/view-models/published.ts');
const bundle=await esbuild.build({stdin:{contents:existsSync(path)?"export * from './src/view-models/published';":'export {};',resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
await writeFile(join(temp,'data.mjs'),bundle.outputFiles[0].text);const mod=await import(pathToFileURL(join(temp,'data.mjs')).href);
const cases=Object.fromEntries(['normal','empty-plan','quantity-warning','external-image','no-plans'].map(name=>[name,publishedFixture(name)]));
after(()=>Object.values(cases).forEach(x=>x.cleanup()));
const copy=x=>structuredClone(x),json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
const B='b'.repeat(40),base='https://static.example.invalid/canteen-os/data/';
function setup(name='normal',respond,options={}) {
 const fixture=cases[name],calls=[];assert.equal(typeof mod.createPublishedData,'function','published reader factory required');
 const api=mod.createPublishedData({baseUrl:base,...options,fetch:async(url,init)=>{
  const u=new URL(url);calls.push({url:u,init});const custom=await respond?.(u,init,calls.length);if(custom)return custom;
  if(u.pathname.endsWith('/build.json'))return json(fixture.manifest);
  if(u.pathname.endsWith('/team-meals/week-41.json'))return json(fixture.projection);
  if(u.pathname.includes('/assets/'))return new Response(Uint8Array.from([137,80,78,71,13,10,26,10]),{headers:{'Content-Type':'image/png'}});
  return json({},404);
 }});return {api,calls};
}
const load=async api=>api.loadPublishedTeamPlan(await api.loadPublication(),'week-41');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('four approved producer cases preserve projection, original time and diagnostics',async()=>{
 for(const name of ['normal','empty-plan','quantity-warning','external-image']) {
  const {api,calls}=setup(name),pub=await api.loadPublication(),view=await api.loadPublishedTeamPlan(pub,'week-41');
  assert.equal(pub.kind,'team-meals');assert.equal(view.kind,'published');assert.equal(view.sourceRevision,cases[name].revision);
  assert.equal(view.builtAt,'September 11, 2026 00:00:00 GMT');assert.deepEqual(view.projection.menuPlans,cases[name].projection.menuPlans);
  assert.deepEqual(view.estimates,cases[name].projection.estimates);assert.deepEqual(view.issues,cases[name].projection.issues);
  assert.ok(calls.every(c=>c.init.method==='GET'));assert.equal(calls.length,2);
  assert.throws(()=>{view.projection.menuPlans['week-41'].meals.push({});},TypeError);
 }
});
test('no-plan manifest is valid and unknown plan fails before fetching any projection',async()=>{
 const {api,calls}=setup('no-plans');const pub=await api.loadPublication();assert.deepEqual(pub.manifest.plans,[]);
 await assert.rejects(api.loadPublishedTeamPlan(pub,'week-41'),{code:'plan_not_published'});assert.equal(calls.length,1);
});
test('unknown targets/versions, bad JSON and unsupported legacy calls never silently switch target',async()=>{
 for(const [delta,code] of [[{target:'next'},'unsupported_target'],[{projectionVersion:1},'unsupported_version'],[{commit:'local'},'invalid_data'],[{builtAt:'nonsense'},'invalid_data']]) {
  const {api}=setup('normal',u=>u.pathname.endsWith('build.json')?json({...cases.normal.manifest,...delta}):undefined);
  await assert.rejects(api.loadPublication(),{code});
 }
 const {api}=setup();await assert.rejects(api.loadMenu('week-41'),{code:'unsupported_target'});
 const legacy={builtAt:'2026-09-11',commit:'local',plans:['week-41']};
 const {api:old}=setup('normal',u=>u.pathname.endsWith('build.json')?json(legacy):json({menu:'legacy'}));
 assert.deepEqual(await old.loadBuild(),legacy);assert.deepEqual(await old.loadMenu('week-41'),{menu:'legacy'});
 await assert.rejects(old.loadPublishedTeamPlan(await old.loadPublication(),'week-41'),{code:'unsupported_target'});
 const {api:html}=setup('normal',()=>new Response('<html>fallback</html>',{headers:{'Content-Type':'text/html'}}));await assert.rejects(html.loadPublication(),{code:'invalid_data'});
});
test('A manifest with B projection, wrong plan and nonpublishable diagnostics fail closed',async()=>{
 for(const [delta,code] of [[{sourceRevision:B},'revision_mismatch'],[{projectionVersion:'2'},'unsupported_version'],[{menuPlans:{other:{schemaVersion:'3',meals:[]}}},'invalid_data'],[{issues:[{kind:'error',code:'invalid-source'}]},'invalid_data']]) {
  const {api,calls}=setup('normal',u=>u.pathname.includes('/team-meals/')?json({...cases.normal.projection,...delta}):undefined);
  await assert.rejects(load(api),{code});assert.equal(calls.length,2);
 }
 const {api}=setup('normal',u=>u.pathname.includes('/team-meals/')?json({},404):undefined);await assert.rejects(load(api),{code:'unavailable',stage:'projection',sourceRevision:cases.normal.revision});
});
test('external and absent ImageRefs do not request any bytes; forged published views are rejected',async()=>{
 const {api,calls}=setup('external-image'),view=await load(api);
 assert.deepEqual(await api.loadPublishedAsset(view,'/ingredients/tomato/image'),{kind:'external-unpinned',sourceRevision:view.sourceRevision,source:cases['external-image'].projection.ingredients.tomato.image});
 assert.deepEqual(await api.loadPublishedAsset(view,'/ingredients/salt/image'),{kind:'not-recorded'});assert.equal(calls.length,2);
 await assert.rejects(api.loadPublishedAsset(copy(view),'/ingredients/tomato/image'),{code:'publication_changed'});
 await assert.rejects(api.loadPublishedAsset(view,'/ingredients/missing/image'),{code:'asset_binding_invalid'});
});
test('public asset sources cannot mutate the private validated binding or later readers',async()=>{
 for(const name of ['external-image','image-a']) {
  const fixture=name==='image-a'?publishedFixture(name):cases[name];
  try {
   const {api}=setup('normal',u=>u.pathname.endsWith('build.json')?json(fixture.manifest):u.pathname.includes('/team-meals/')?json(fixture.projection):undefined);
   const view=await load(api),first=await api.loadPublishedAsset(view,'/ingredients/tomato/image');
   const original=copy(first.source);
   assert.throws(()=>{first.source.src='https://changed.invalid/other.png';},TypeError);
   assert.throws(()=>{first.source.license='Changed';},TypeError);
   const second=await api.loadPublishedAsset(view,'/ingredients/tomato/image');
   assert.deepEqual(second.source,original);assert.deepEqual(view.projection.ingredients.tomato.image,original);
  } finally {if(name==='image-a')fixture.cleanup();}
 }
});
function withImages() {
 const p=copy(cases.normal.projection);const img={src:'../images/A %2F?# 雪.png',license:'CC0'};
 p.ingredients.tomato.image=img;p.techniques=[{id:'chosen-a',name:{en:'A'},image:img},{id:'chosen-b',name:{en:'B'},image:copy(img)}];
 p.assets=[{ownerPath:'data/ingredients/tomato.json',jsonPointer:'/image',source:img,status:'available',path:`assets/${p.sourceRevision}/data/images/A %2F?# 雪.png`},
  ...p.techniques.map((t,i)=>({ownerPath:'data/techniques.json',jsonPointer:`/${i+7}/image`,techniqueRef:t.id,source:t.image,status:'available',path:`assets/${p.sourceRevision}/images/A %2F?# 雪.png`}))];
 // Techniques resolve relative to data/, so keep their src explicitly inside data.
 for(let i=0;i<2;i++){p.techniques[i].image={...img,src:'data/images/A %2F?# 雪.png'};p.assets[i+1].source=p.techniques[i].image;p.assets[i+1].path=p.assets[0].path;}
 return p;
}
test('asset mapping preserves literal percent/query/hash/Unicode and joins techniques by ID, not filtered index',async()=>{
 const p=withImages(),{api,calls}=setup('normal',u=>u.pathname.includes('/team-meals/')?json(p):undefined),view=await load(api);
 const asset=await api.loadPublishedAsset(view,'/techniques/1/image');assert.equal(asset.kind,'available');assert.equal(asset.sourceRevision,p.sourceRevision);
 const u=calls.at(-1).url;assert.equal(u.hash,'');assert.equal(u.search,'');assert.ok(u.pathname.endsWith('/A%20%252F%3F%23%20%E9%9B%AA.png'));
 assert.equal((await api.loadPublishedAsset(view,'/techniques/0/image')).kind,'available');
 assert.deepEqual(view.projection.techniques,p.techniques);
});
test('asset source mismatch, duplicate/missing/foreign bindings and wrong revision path reject before bytes',async()=>{
 for(const mutate of [p=>p.assets[0].source={src:'wrong.png',license:'CC0'},p=>p.assets.push(copy(p.assets[0])),p=>p.assets.pop(),p=>p.assets[1].techniqueRef='missing',p=>p.assets[0].path=`assets/${B}/data/images/A.png`,p=>p.assets[0].status='missing',p=>p.assets[0].path='https://other.invalid/p.png']) {
  const p=withImages();mutate(p);const {api,calls}=setup('normal',u=>u.pathname.includes('/team-meals/')?json(p):undefined);
  await assert.rejects(load(api),{code:'asset_binding_invalid'});assert.equal(calls.length,2);
 }
});
test('removed old assets and non-image responses do not read current image URLs',async()=>{
 for(const response of [()=>json({},404),()=>new Response('<html/>',{headers:{'Content-Type':'text/html'}}),()=>new Response('<html/>',{headers:{'Content-Type':'image/png'}}),()=>new Response(new ReadableStream({start(c){c.error(new Error('body unavailable'));}}),{headers:{'Content-Type':'image/png'}})]) {
  const p=withImages(),{api,calls}=setup('normal',u=>u.pathname.includes('/team-meals/')?json(p):u.pathname.includes('/assets/')?response():undefined);
  await assert.rejects(api.loadPublishedAsset(await load(api),'/ingredients/tomato/image'),{code:'asset_unavailable'});
  assert.equal(calls.length,3);assert.ok(calls.at(-1).url.pathname.includes(p.sourceRevision));
 }
});
test('timeout covers response body consumption, not only HTTP headers',async()=>{
 let finish;
 const stalled=new ReadableStream({start(c){finish=()=>c.close();}});
 const {api}=setup('normal',()=>new Response(stalled,{headers:{'Content-Type':'application/json'}}),{timeoutMs:10});
 const outcome=await Promise.race([api.loadPublication().then(()=> 'unexpected',e=>e.code),new Promise(r=>setTimeout(()=>r('hung-after-headers'),50))]);
 finish();assert.equal(outcome,'unavailable');
});
test('late G1 success and failure cannot affect G2 after clear/fresh',async()=>{
 for(const bad of [false,true]) {
  const gate=deferred();const {api,calls}=setup('normal',async(u,_init,n)=>n===1?gate.promise:undefined);
  const old=api.loadPublication();api.clearCache();const current=await api.loadPublication();
  gate.resolve(bad?json({},500):json(cases.normal.manifest));await assert.rejects(old,{code:'publication_changed'});
  assert.equal(await api.loadPublication(),current);assert.equal(calls.length,2);
  assert.notEqual(calls[0].url.search,calls[1].url.search);
 }
});
test('refresh invalidates handles and snapshot probes never adopt or overwrite active generation',async()=>{
 let changed=false;const {api}=setup('normal',u=>u.pathname.endsWith('build.json')?json({...cases.normal.manifest,...(changed?{commit:B,builtAt:'2026-09-12'}:{})}):undefined);
 const old=await api.loadPublication();changed=true;const probe=await api.probePublication();assert.equal(probe.manifest.commit,B);
 assert.equal(await api.loadPublication(),old);
 const fresh=await api.loadPublication({fresh:true});assert.equal(fresh.manifest.commit,B);
 await assert.rejects(api.loadPublishedTeamPlan(old,'week-41'),{code:'publication_changed'});
});
test('approved producer emits real original PNG bytes and stable technique bindings despite filtered indices',async()=>{
 const fixture=publishedFixture('image-a');
 try {
  const out=join(fixture.root,'out');const built=fixture.publish(out);
  assert.equal(built.issues.some(i=>i.kind==='error'),false);
  const calls=[];const api=mod.createPublishedData({baseUrl:base,fetch:async address=>{
   const path=decodeURIComponent(new URL(address).pathname.slice(new URL(base).pathname.length));calls.push(path);
   const bytes=await readFile(join(out,path));return new Response(bytes,{headers:{'Content-Type':path.endsWith('.json')?'application/json':'image/png'}});
  }});
  const view=await load(api);const assets=fixture.projection.assets.filter(a=>a.ownerPath==='data/techniques.json');
  assert.ok(assets.length>=2);assert.equal(assets[0].jsonPointer,'/1/image');
  for(const binding of assets){
   const index=view.projection.techniques.findIndex(t=>t.id===binding.techniqueRef);assert.ok(index>=0);
   const result=await api.loadPublishedAsset(view,`/techniques/${index}/image`);
   assert.deepEqual(Buffer.from(await result.bytes.arrayBuffer()),await readFile(join(fixture.root,binding.source.src)));
  }
  assert.equal(calls.filter(p=>p.startsWith('assets/')).length,1);
 } finally {fixture.cleanup();}
});
