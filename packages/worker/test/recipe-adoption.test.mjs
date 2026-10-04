import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeRepo, makeEnv, bearer, call, WORKER } from './helpers.mjs';
const { detail, approval } = JSON.parse(readFileSync(new URL('./fixtures/adoption-contract.json',import.meta.url)));
const materialization = await import('../dist/knowledge-materialization.js');
const { validateEntity } = await import('../dist/validate.js');
const worker = (await import(WORKER)).default;

test('persisted recipe approval freezes canonical identity, unknown specs and explicit preparation',async()=>{
  assert.equal(typeof materialization.recipeMaterializationFiles,'function');
  const fixed=await materialization.recipeMaterializationFiles(approval,detail);
  const dish=JSON.parse(fixed.files.find(f=>f.path===`data/dishes/${fixed.dishRef}.json`).text);
  const mapped=JSON.parse(fixed.files.find(f=>f.path.startsWith('data/ingredients/kbi-52d195')).text);
  assert.equal(mapped.schemaVersion,'3');assert.equal(mapped.baseUnit,undefined);
  assert.equal(mapped.canonicalIngredientId,approval.dependencies.ingredients[0].id);
  assert.equal(dish.components[0].canonicalIngredientId,mapped.canonicalIngredientId);
  assert.match(dish.components[0].prep.techniqueRef,/^kbt-/);
  assert.equal(dish.components[0].prep.timing,'before-service');
  assert.equal(dish.components[1].qty,undefined);assert.equal(dish.components[1].prep,undefined);
  assert.equal(dish.provenance.candidateId,undefined);assert.equal(dish.provenance.originKind,'manual');
  assert.equal(dish.provenance.approvalHash,approval.approvalHash);
  assert.equal(validateEntity('dish',dish).valid,true);
  assert.equal(validateEntity('ingredient',mapped).valid,true);
  assert(!fixed.files.map(f=>f.text).join('').includes('PRIVATE_TEST_NOTE'));
  await assert.rejects(()=>materialization.recipeMaterializationFiles({...approval,recipeVersion:2},detail));
  await assert.rejects(()=>materialization.recipeMaterializationFiles({...approval,reviewer:'changed'},detail));
});

test('recipe materialization requires stored kitchen approval and chef authority; source review alone never suffices',async()=>{
  const repo=new FakeRepo();repo.commit({'data/techniques.json':'[]'});
  let accepted=null;
  const seen=[];
  const {env}=makeEnv(repo,{KNOWLEDGE_BASE_URL:'http://127.0.0.1:4390',__knowledgeFetch:async url=>{
    const path=new URL(String(url)).pathname;seen.push(path);
    const result=path.endsWith('/adoption')?{recipeId:detail.id,recipeVersion:1,origin:approval.origin,source:{status:'approved'},kitchenApproval:accepted}:detail;
    return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
  }});
  const route=`/knowledge-materializations/recipes/${detail.id}`;
  assert.equal((await call(worker,env,'POST',route,{headers:bearer('buyer'),body:{recipeVersion:1}})).status,403);
  assert.equal(seen.length,0);
  const before=repo.head;
  assert.equal((await call(worker,env,'POST',route,{headers:bearer('chef'),body:{recipeVersion:1}})).status,409);
  assert.equal(repo.head,before);
  accepted=approval;
  const fixed=await call(worker,env,'POST',route,{headers:bearer('chef'),body:{recipeVersion:1}});
  assert.equal(fixed.status,200,JSON.stringify(fixed.body));
  assert.equal(fixed.body.recipeId,detail.id);
  assert.equal(JSON.parse(repo.fileText('data/techniques.json')).length,1);
  assert.equal((await call(worker,env,'POST',route,{headers:bearer('chef'),body:{recipeVersion:1}})).body.unchanged,true);
});
