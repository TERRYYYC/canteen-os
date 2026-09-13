import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeRepo, WORKER, bearer, call, makeEnv, planFixture } from './helpers.mjs';
const worker=(await import(WORKER)).default;
const {validateEntity,VALIDATORS}=await import('../dist/validate.js');
const v3=()=>({...planFixture(),schemaVersion:'3',meals:[{date:'2026-10-19',mealType:'lunch',dishRef:'soup'}]});
const planPath='data/menu-plans/team.json';
function setup(extra={}) { const repo=new FakeRepo(); repo.commit({'data/dishes/soup.json':JSON.stringify({name:{zh:'汤'}}),'data/techniques.json':'[]',...extra});return {repo,env:makeEnv(repo).env}; }
for(const plan of [v3(),{...v3(),meals:[]}]) test(`B2 v3 plan saves and rereads with ${plan.meals.length} meals without invented servings`,async()=>{
 const {repo,env}=setup();const r=await call(worker,env,'POST','/plan/team',{headers:{...bearer('chef'),'If-None-Match':'*'},body:plan});
 assert.equal(r.status,200);const read=await call(worker,env,'GET','/source/plan/team',{headers:bearer('buyer')});assert.equal(read.status,200);assert.deepEqual(read.body.content,plan);assert.deepEqual(JSON.parse(repo.fileText(planPath)),plan);
});
test('B2 v3 dish unknown qty saves unchanged; v2 still requires qty',async()=>{
 const {env}=setup();const dish={schemaVersion:'3',name:{zh:'汤'},components:[{ingredientRef:'salt'}]};
 const r=await call(worker,env,'POST','/dish/soup',{headers:{...bearer('chef'),'If-Match':(await call(worker,env,'GET','/source/dish/soup',{headers:bearer('chef')})).body.blobSha},body:dish});assert.equal(r.status,200);
 const read=await call(worker,env,'GET','/source/dish/soup',{headers:bearer('buyer')});assert.deepEqual(read.body.content,dish);
 assert.equal(validateEntity('dish',{...dish,schemaVersion:'2'}).valid,false);
});
for(const [kind,current,next] of [['plan',v3(),planFixture()],['dish',{schemaVersion:'3',name:{zh:'汤'}},{name:{zh:'汤'}}],['dish',{schemaVersion:'3',name:{zh:'汤'}},{schemaVersion:'2',name:{zh:'汤'}}]])test(`B2 newest lock cannot downgrade ${kind} to ${next.schemaVersion}`,async()=>{
 const path=kind==='plan'?planPath:'data/dishes/soup.json';const {repo,env}=setup({[path]:JSON.stringify(current)});const sha=repo.trees.get(repo.commits.get(repo.head).tree).get(path);
 const r=await call(worker,env,'POST',kind==='plan'?'/plan/team':'/dish/soup',{headers:{...bearer('chef'),'If-Match':sha},body:next});assert.equal(r.status,409);assert.equal(r.body.errors[0].code,'format_downgrade');assert.equal(repo.writeCalls().length,0);
});
test('B2 version guard does not hide stale lock conflict',async()=>{
 const {repo,env}=setup({[planPath]:JSON.stringify(v3())});const r=await call(worker,env,'POST','/plan/team',{headers:{...bearer('chef'),'If-Match':'0'.repeat(40)},body:planFixture()});assert.equal(r.status,409);assert.equal(r.body.errors[0].code,'conflict');assert.equal(repo.writeCalls().length,0);
});
for(const dateRange of [{start:'2026-10-25',end:'2026-10-19'},{start:'2026-10-20',end:'2026-10-25'}])test(`B2 v3 range relation ${JSON.stringify(dateRange)}`,async()=>{
 const {repo,env}=setup();const r=await call(worker,env,'POST','/plan/team',{headers:{...bearer('chef'),'If-None-Match':'*'},body:{...v3(),dateRange}});assert.equal(r.status,400);assert.equal(r.body.errors[0].code,'invalid_selection');assert.equal(repo.writeCalls().length,0);
});
test('B2 explicit version selection and standalone ShoppingList validator',()=>{
 for(const version of ['4','',null])assert.equal(validateEntity('plan',{...v3(),schemaVersion:version}).valid,false);
 assert.equal(validateEntity('plan',{...v3(),schemaVersion:'2'}).valid,false);
 const list={shoppingListVersion:'1',id:'trip',basis:{sourceRevision:'a'.repeat(40),selection:[{menuPlanRef:'team',date:'2026-10-19',mealType:'lunch'}]},items:[]};
 assert.ok('shopping-list' in VALIDATORS, 'ShoppingList version-selected validator is registered');
 assert.equal(validateEntity('shopping-list',list).valid,true);
 assert.equal(validateEntity('shopping-list',{...list,basis:{...list.basis,selection:[...list.basis.selection,...list.basis.selection]}}).valid,false);
 assert.equal(validateEntity('shopping-list',{...list,items:[{ingredientRef:'salt',decision:'available',bought:false}]}).valid,false);
});
