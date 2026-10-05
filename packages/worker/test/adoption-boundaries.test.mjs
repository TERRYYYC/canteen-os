import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { FakeRepo, makeEnv, bearer, call, WORKER } from './helpers.mjs';
import { fixtureApproval } from './adoption-fixture.mjs';
import { recipeMaterializationFiles } from '../dist/knowledge-materialization.js';
const worker=(await import(WORKER)).default;
const {maxRecipeIngredients}=JSON.parse(readFileSync(new URL('./fixtures/adoption-bounds.json',import.meta.url)));
function fixture(count=1){
  const detail={id:randomUUID(),version:1,recipe:{title:{zh:'Disposable fixture'},ingredients:Array.from({length:count},()=>({id:randomUUID(),name:{zh:'Salt'},amount:{kind:'unknown'},kitchenPrep:{timing:'before-service'}})),steps:[{id:randomUUID(),text:{zh:'Original time unknown.'}}]}};
  const candidateId=randomUUID(),approval=fixtureApproval(detail,candidateId),repo=new FakeRepo();repo.commit({'data/techniques.json':'[]'});
  const state={archived:false,reads:0,archiveAt:Infinity};
  const {env}=makeEnv(repo,{KNOWLEDGE_BASE_URL:'http://127.0.0.1:4390',__knowledgeFetch:async url=>{
    let result=detail;const path=new URL(String(url)).pathname;
    if(path.endsWith('/adoption')){state.reads++;if(state.reads>=state.archiveAt)state.archived=true;result={recipeId:detail.id,recipeVersion:1,current:{version:state.archived?2:1,archived:state.archived},kitchenApproval:approval};}
    else if(path.includes('/favorites/candidates/'))result={id:candidateId,status:'approved',recipeId:detail.id,recipeVersion:1};
    return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
  }});
  const freeze=(compat=false)=>call(worker,env,'POST',compat?`/knowledge-materializations/${candidateId}`:`/knowledge-materializations/recipes/${detail.id}`,{headers:bearer('chef'),body:{recipeVersion:1}});
  return {detail,approval,repo,state,env,freeze};
}
test('archive forbids first freeze and partial dependency repair on both routes, preserves complete historic replay',async()=>{
  for(const compat of [false,true]){
    const f=fixture();f.state.archived=true;const head=f.repo.head;
    assert.equal((await f.freeze(compat)).status,409);assert.equal(f.repo.head,head);assert.equal(f.repo.writeCalls().length,0);
    f.state.archived=false;const fixed=await f.freeze(compat);assert.equal(fixed.status,200,JSON.stringify(fixed.body));
    f.state.archived=true;const frozenHead=f.repo.head;
    assert.equal((await f.freeze(compat)).body.unchanged,true);assert.equal(f.repo.head,frozenHead);
    const tree=f.repo.trees.get(f.repo.commits.get(frozenHead).tree),partial=new Map(tree);
    partial.delete([...partial.keys()].find(p=>p.startsWith('data/ingredients/')));f.repo.commitTree(f.repo.registerTree(partial),'model missing frozen dependency');
    const partialHead=f.repo.head;assert.equal((await f.freeze(compat)).status,409);assert.equal(f.repo.head,partialHead);
  }
});
test('CAS retry rechecks archive eligibility before further writes',async()=>{
  const f=fixture();f.repo.refUpdateFailures=1;f.state.archiveAt=3;const head=f.repo.head;
  const response=await f.freeze();assert.equal(response.status,409,JSON.stringify(response.body));assert.equal(f.repo.head,head);
  assert.equal(f.repo.calls.filter(c=>c.method==='PATCH').length,1);
});
test('timing-only prep allows same-head rollback and permitted restoration; supplied missing technique still rejects',async()=>{
  const f=fixture();const frozen=await f.freeze();assert.equal(frozen.status,200);const old=f.repo.head;
  assert.equal((await call(worker,f.env,'POST',`/rollback/${old}`,{headers:bearer('admin'),body:{}})).status,200);
  const dishPath=`data/dishes/${frozen.body.dishRef}.json`,dish=JSON.parse(f.repo.fileText(dishPath));
  const files=Object.fromEntries([...f.repo.trees.get(f.repo.commits.get(f.repo.head).tree).keys()].map(p=>[p,f.repo.fileText(p)]));
  const changed=structuredClone(dish);changed.name={zh:'Fixture changed'};f.repo.commit({...files,[dishPath]:JSON.stringify(changed)});
  assert.equal((await call(worker,f.env,'POST',`/rollback/${old}`,{headers:bearer('admin'),body:{}})).status,200);
  const invalid=structuredClone(dish);invalid.components[0].prep.techniqueRef='missing';const invalidHead=f.repo.commit({...files,[dishPath]:JSON.stringify(invalid)});
  assert.equal((await call(worker,f.env,'POST',`/rollback/${invalidHead}`,{headers:bearer('admin'),body:{}})).status,422);
});
test('approved conversion and both routes preserve exact 200-row bound and reject 201 without truncation',async()=>{
  const f=fixture(maxRecipeIngredients),fixed=await recipeMaterializationFiles(f.approval,f.detail);
  assert.equal(JSON.parse(fixed.files.find(file=>file.path.startsWith('data/dishes/')).text).components.length,maxRecipeIngredients);
  assert.equal((await f.freeze()).status,200);assert.equal((await f.freeze(true)).body.unchanged,true);
  const tooMany=fixture(maxRecipeIngredients+1);await assert.rejects(()=>recipeMaterializationFiles(tooMany.approval,tooMany.detail));
  const head=tooMany.repo.head;assert.equal((await tooMany.freeze()).status,422);assert.equal((await tooMany.freeze(true)).status,422);assert.equal(tooMany.repo.head,head);
});
