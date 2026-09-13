import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FakeRepo,WORKER,bearer,call,makeEnv} from './helpers.mjs';
const worker=(await import(WORKER)).default;
const selection=[{menuPlanRef:'team',date:'2026-10-19',mealType:'lunch'}];
function setup(){const repo=new FakeRepo();const base=repo.commit({'data/techniques.json':'[]','data/menu-plans/team.json':JSON.stringify({schemaVersion:'3',meals:[]})});const list={shoppingListVersion:'1',id:'trip',basis:{sourceRevision:base,selection},items:[]};repo.commit({'data/shopping-lists/trip.json':JSON.stringify(list)});return {repo,list,env:makeEnv(repo).env};}
test('B2 source supports strict ShoppingList with pinned commit',async()=>{const {repo,list,env}=setup();const read=await call(worker,env,'GET','/source/shopping-list/trip',{headers:bearer('buyer')});assert.equal(read.status,200);assert.deepEqual(read.body.content,list);assert.equal(read.body.commit,repo.head);assert.equal(repo.writeCalls().length,0);});
for(const field of ['basis','previous'])test(`B2 source checks stored ${field} ancestry`,async()=>{
 const {repo,list,env}=setup();if(field==='basis')list.basis.sourceRevision='0'.repeat(40);else list.items=[{ingredientRef:'salt',decision:'check',previous:{basis:{sourceRevision:'0'.repeat(40),selection},decision:'buy',bought:true}}];
 repo.commit({'data/shopping-lists/trip.json':JSON.stringify(list)});const read=await call(worker,env,'GET','/source/shopping-list/trip',{headers:bearer('buyer')});assert.equal(read.status,422);assert.equal(read.body.errors[0].code,'basis_unavailable');
});
test('B2 stored ShoppingList ID must match its source path',async()=>{const {repo,list,env}=setup();list.id='other';repo.commit({'data/shopping-lists/trip.json':JSON.stringify(list)});const read=await call(worker,env,'GET','/source/shopping-list/trip',{headers:bearer('buyer')});assert.equal(read.status,422);assert.equal(read.body.errors[0].code,'invalid_source');});
for(const bad of ['missing','json','format'])test(`B2 source rejects ${bad} selected basis plan`,async()=>{
 const {repo,list,env}=setup();const files={'data/techniques.json':'[]'};if(bad!=='missing')files['data/menu-plans/team.json']=bad==='json'?'{':JSON.stringify({schemaVersion:'2',meals:[]});
 const base=repo.commit(files);list.basis.sourceRevision=base;repo.commit({'data/shopping-lists/trip.json':JSON.stringify(list)});
 const read=await call(worker,env,'GET','/source/shopping-list/trip',{headers:bearer('buyer')});assert.equal(read.status,422);assert.equal(read.body.errors[0].code,bad==='missing'?'basis_unavailable':'invalid_source');
});
test('B2 source rejects duplicate stored ingredient IDs',async()=>{
 const {repo,list,env}=setup();list.items=[{ingredientRef:'salt',decision:'check'},{ingredientRef:'salt',decision:'check'}];repo.commit({'data/shopping-lists/trip.json':JSON.stringify(list)});
 const read=await call(worker,env,'GET','/source/shopping-list/trip',{headers:bearer('buyer')});assert.equal(read.status,422);assert.equal(read.body.errors[0].code,'invalid_source');
});
