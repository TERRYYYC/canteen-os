import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FakeRepo,WORKER,bearer,call,makeEnv,makeFetch,REPO} from './helpers.mjs';
const worker=(await import(WORKER)).default;
const path='data/shopping-lists/trip.json';
const selection=[{menuPlanRef:'team',date:'2026-10-19',mealType:'lunch'}];
function setup(){const repo=new FakeRepo();const files={'data/techniques.json':'[]','data/menu-plans/team.json':JSON.stringify({schemaVersion:'3',meals:[{date:'2026-10-19',mealType:'lunch',dishRef:'soup'}]}),'data/dishes/soup.json':JSON.stringify({schemaVersion:'3',name:{zh:'汤'},components:[{ingredientRef:'salt'}]}),'data/ingredients/salt.json':JSON.stringify({schemaVersion:'2',name:{zh:'盐'},baseUnit:'g',trackStock:false,onHand:8}),'data/purchase-orders/stored.json':'preserve original PO bytes'};const revision=repo.commit(files);const list={shoppingListVersion:'1',id:'trip',basis:{sourceRevision:revision,selection:structuredClone(selection)},items:[{ingredientRef:'salt',decision:'check'}]};return {repo,files,list,env:makeEnv(repo).env};}
const post=(env,list,headers={})=>call(worker,env,'POST','/shopping-list/trip',{headers:{...bearer('buyer'),...headers},body:list});
for(const role of ['chef','buyer','admin'])test(`B2 shopping create permission ${role} and only list bytes change`,async()=>{
 const {repo,list,env,files}=setup();const r=await post(env,list,{...bearer(role),'If-None-Match':'*'});assert.equal(r.status,200);assert.equal(r.body.unchanged,false);assert.deepEqual(JSON.parse(repo.fileText(path)),list);for(const [p,v]of Object.entries(files))assert.equal(repo.fileText(p),v);assert.equal(repo.commits.get(r.body.commit).parents.length,1);
});
for(const [headers,status,code]of [[{},428,'precondition_required'],[{'If-Match':'*'},400,'invalid_precondition'],[{'If-Match':'0'.repeat(40),'If-None-Match':'*'},400,'invalid_precondition'],[{'If-Match':'0'.repeat(40)},409,'conflict']])test(`B2 shopping lock ${code} ${JSON.stringify(headers)}`,async()=>{
 const {repo,list,env}=setup();list.basis.sourceRevision='0'.repeat(40);const r=await post(env,list,headers);assert.equal(r.status,status);assert.equal(r.body.errors[0].code,code);assert.equal(repo.writeCalls().length,0);assert.ok(!('reviewRequired' in r.body));
});
test('B2 shopping auth precedes bad body and all source reads',async()=>{
 const {repo,env}=setup();const r=await call(worker,env,'POST','/shopping-list/trip',{body:{bad:true}});assert.equal(r.status,401);assert.equal(repo.calls.length,0);
});
test('B2 shopping ID mismatch occurs after lock and points at ID',async()=>{
 const {repo,list,env}=setup();list.id='other';const r=await post(env,list,{'If-None-Match':'*'});assert.equal(r.status,400);assert.equal(r.body.errors[0].path,'/id');assert.equal(repo.writeCalls().length,0);
});
test('B2 shopping duplicate create and stale idempotent retry cannot overwrite',async()=>{
 const {repo,list,env}=setup();const first=await post(env,list,{'If-None-Match':'*'});assert.equal(first.status,200);const old=first.body.blobSha;const duplicate=await post(env,list,{'If-None-Match':'*'});assert.equal(duplicate.status,409);
 const next=structuredClone(list);next.items[0].decision='buy';const save=await post(env,next,{'If-Match':old});assert.equal(save.status,200);
 const count=repo.writeCalls().length;const stale=await post(env,next,{'If-Match':old});assert.equal(stale.status,409);assert.equal(repo.writeCalls().length,count);
 const same=await post(env,next,{'If-Match':save.body.blobSha});assert.equal(same.status,200);assert.equal(same.body.unchanged,true);assert.equal(repo.writeCalls().length,count);
});
test('B2 shopping concurrent creators produce one winner',async()=>{
 const {repo,list,env}=setup();const r=await Promise.all([post(env,list,{'If-None-Match':'*'}),post(env,list,{'If-None-Match':'*'})]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);assert.deepEqual(JSON.parse(repo.fileText(path)),list);
});
test('B2 retry repeats basis ancestry against the new captured head',async()=>{
 const {repo,list,env}=setup();const baseFetch=makeFetch(repo);let patches=0;env.__fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url);if(init.method==='PATCH'&&url.pathname.endsWith('/git/refs/heads/main')&&patches++===0){const root=new FakeRepo();root.commit({'data/techniques.json':'[]'},'unrelated');const c=root.commits.get(root.head);for(const [k,v]of root.blobs)repo.blobs.set(k,v);for(const[k,v]of root.trees)repo.trees.set(k,v);repo.commits.set(root.head,c);repo.head=root.head;return new Response('{}',{status:422});}return baseFetch(input,init);
 };const r=await post(env,list,{'If-None-Match':'*'});assert.equal(r.status,422);assert.equal(r.body.errors[0].code,'basis_unavailable');assert.equal(patches,1);assert.equal(repo.fileText(path),null);
});
test('B2 shopping upstream error is not a missing basis',async()=>{
 const {repo,list,env}=setup();env.__fetch=makeFetch(repo,{[`GET /repos/${REPO}/git/trees/${list.basis.sourceRevision}`]:()=>new Response('{}',{status:403})});const r=await post(env,list,{'If-None-Match':'*'});assert.equal(r.status,502);assert.equal(r.body.errors[0].code,'upstream_error');assert.equal(repo.writeCalls().length,0);
});
test('B2 equivalent selection ordering normalizes once without resetting decisions',async()=>{
 const {repo,list,env}=setup();list.basis.selection.push({menuPlanRef:'team',date:'2026-10-20',mealType:'dinner'});
 const created=await post(env,list,{'If-None-Match':'*'});assert.equal(created.status,200);list.items[0].decision='available';
 const chosen=await post(env,list,{'If-Match':created.body.blobSha});assert.equal(chosen.status,200);
 list.basis.selection.reverse();const count=repo.writeCalls().length;const reordered=await post(env,list,{'If-Match':chosen.body.blobSha});assert.equal(reordered.status,200);assert.equal(reordered.body.unchanged,true);assert.equal(repo.writeCalls().length,count);
});
test('B2 schema errors retain Ajv keywords and never carry reviewRequired',async()=>{
 const {repo,list,env}=setup();list.items[0]={ingredientRef:'salt',decision:'available',bought:false};const r=await post(env,list,{'If-None-Match':'*'});assert.equal(r.status,400);assert.ok(r.body.errors.some(e=>['if','not','enum','const'].includes(e.code)));assert.ok(!('reviewRequired' in r.body));assert.equal(repo.writeCalls().length,0);
});
test('B2 each shopping save fits the Free 50-subrequest limit for nine ingredients',async(t)=>{
 const {repo,list,env,files}=setup();const ids=Array.from({length:9},(_,i)=>`ingredient-${i}`);const dish=JSON.parse(files['data/dishes/soup.json']);dish.components=ids.map(ingredientRef=>({ingredientRef}));files['data/dishes/soup.json']=JSON.stringify(dish);
 for(const id of ids)files[`data/ingredients/${id}.json`]=JSON.stringify({schemaVersion:'2',name:{zh:id},baseUnit:'g',trackStock:false});
 list.basis.sourceRevision=repo.commit(files);list.items=ids.map(ingredientRef=>({ingredientRef,decision:'check'}));
 const counts=[];const realFetch=makeFetch(repo);let fetches=0;env.__fetch=(input,init)=>{if(++fetches>50)throw new Error('Free subrequest cap exceeded');return realFetch(input,init);};
 async function capped(value,headers){fetches=0;const r=await post(env,value,headers);assert.equal(r.status,200,JSON.stringify({fetches,body:r.body}));assert.ok(fetches<=50);counts.push(fetches);return r;}
 let saved=await capped(list,{'If-None-Match':'*'});list.items=list.items.map(item=>({...item,decision:'buy',bought:true}));saved=await capped(list,{'If-Match':saved.body.blobSha});
 const previous=structuredClone(list);const plan=JSON.parse(files['data/menu-plans/team.json']);plan.meals[0].plannedServings=3;files['data/menu-plans/team.json']=JSON.stringify(plan);
 const revision=repo.commit({...files,[path]:repo.fileText(path)});list.basis={...list.basis,sourceRevision:revision};list.items=ids.map(ingredientRef=>({ingredientRef,decision:'check',previous:{basis:previous.basis,decision:'buy',bought:true}}));saved=await capped(list,{'If-Match':saved.body.blobSha});
 list.items=ids.map(ingredientRef=>({ingredientRef,decision:'buy',bought:true}));repo.refUpdateFailures=1;await capped(list,{'If-Match':saved.body.blobSha});
 const pinned=JSON.parse(repo.fileText(path));assert.deepEqual(pinned,list);t.diagnostic(`fetch counts create/buy/reconcile/confirm-with-retry: ${counts.join('/')}`);
});
test('B2 immutable reads are shared on ref retry but head and ancestry are checked again',async()=>{
 const {repo,list,env,files}=setup();repo.commit({...files,'data/note.txt':'later head'});repo.refUpdateFailures=1;const realFetch=makeFetch(repo);let trees=0;let heads=0;let comparisons=0;
 env.__fetch=(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url);if(url.pathname.endsWith(`/git/trees/${list.basis.sourceRevision}`))trees++;if(url.pathname.endsWith('/git/ref/heads/main'))heads++;if(url.pathname.includes('/compare/'))comparisons++;return realFetch(input,init);};
 const result=await post(env,list,{'If-None-Match':'*'});assert.equal(result.status,200);assert.equal(trees,1);assert.equal(heads,2);assert.equal(comparisons,2);assert.deepEqual(JSON.parse(repo.fileText(path)),list);
});
