import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeRepo, makeEnv, bearer, call, WORKER } from './helpers.mjs';
// The fixture's former approval record is only used here as the KB's ingredient and technique revisions.
const { detail, approval } = JSON.parse(readFileSync(new URL('./fixtures/adoption-contract.json',import.meta.url)));
const dependencies = approval.dependencies;
const materialization = await import('../dist/knowledge-materialization.js');
const { validateEntity } = await import('../dist/validate.js');
const worker = (await import(WORKER)).default;

test('a saved revision freezes with the canonical ingredient and technique revisions it uses, without any approval',async()=>{
  const fixed=await materialization.recipeMaterializationFiles(detail,dependencies);
  const dish=JSON.parse(fixed.files.find(f=>f.path===`data/dishes/${fixed.dishRef}.json`).text);
  const mapped=JSON.parse(fixed.files.find(f=>f.path.startsWith('data/ingredients/kbi-52d195')).text);
  assert.equal(mapped.schemaVersion,'3');assert.equal(mapped.baseUnit,undefined);
  assert.equal(mapped.canonicalIngredientId,dependencies.ingredients[0].id);
  assert.equal(dish.components[0].canonicalIngredientId,mapped.canonicalIngredientId);
  assert.match(dish.components[0].prep.techniqueRef,/^kbt-/);
  assert.equal(dish.components[0].prep.timing,'before-service');
  assert.equal(dish.components[1].qty,undefined);assert.equal(dish.components[1].prep,undefined);
  // ADR-0011: nothing about review or approval is published with the dish.
  for(const key of ['candidateId','approvalHash','originKind','originalRecipeVersion','review','sourceGapCount'])assert.equal(dish.provenance[key],undefined,key);
  assert.equal(validateEntity('dish',dish).valid,true);
  assert.equal(validateEntity('ingredient',mapped).valid,true);
  assert(!fixed.files.map(f=>f.text).join('').includes('PRIVATE_TEST_NOTE'));
  assert.deepEqual(await materialization.recipeMaterializationFiles(detail,dependencies),fixed,'same inputs, same files');
  // The dependencies must be exactly the ones the revision uses, unchanged.
  await assert.rejects(()=>materialization.recipeMaterializationFiles(detail,{...dependencies,ingredients:[]}));
  await assert.rejects(()=>materialization.recipeMaterializationFiles(detail,{...dependencies,techniques:dependencies.techniques.map(t=>({...t,technique:{...t.technique,name:{zh:'changed'}}}))}));
});

function knowledgeBase(seen){
  const versions=new Map([...dependencies.ingredients.map(d=>[d.id,d.version]),...dependencies.techniques.map(d=>[d.id,1])]);
  const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const fetch=async url=>{
    const path=new URL(String(url)).pathname;seen.push(path);
    if(path.endsWith('/adoption'))return json({recipeId:detail.id,recipeVersion:1,current:{version:1,archived:false},kitchenApproval:null});
    const dep=/\/api\/v1\/(ingredients|techniques)\/([0-9a-f-]{36})(?:\/revisions\/(\d+))?$/.exec(path);
    if(dep){
      const [,kind,id]=dep,version=versions.get(id);
      if(kind==='ingredients'){const d=dependencies.ingredients.find(x=>x.id===id);return json({id,version,ingredient:version===d.version?d.ingredient:{...d.ingredient,name:{zh:'小米辣（新）'}},createdAt:d.createdAt});}
      return json({id,version,technique:dependencies.techniques.find(x=>x.id===id).technique,createdAt:'2026-10-05T00:00:00.000Z'});
    }
    return json(detail);
  };
  return {fetch,versions};
}

test('a chef freezes a saved revision with no stored approval; a buyer cannot; the frozen files are never rewritten',async()=>{
  const repo=new FakeRepo();repo.commit({'data/techniques.json':'[]'});
  const seen=[],kb=knowledgeBase(seen);
  const {env}=makeEnv(repo,{KNOWLEDGE_BASE_URL:'http://127.0.0.1:4390',__knowledgeFetch:kb.fetch});
  const route=`/knowledge-materializations/recipes/${detail.id}`;
  assert.equal((await call(worker,env,'POST',route,{headers:bearer('buyer'),body:{recipeVersion:1}})).status,403);
  assert.equal(seen.length,0);
  const fixed=await call(worker,env,'POST',route,{headers:bearer('chef'),body:{recipeVersion:1}});
  assert.equal(fixed.status,200,JSON.stringify(fixed.body));
  assert.equal(fixed.body.recipeId,detail.id);
  const ingredient=dependencies.ingredients[0],technique=dependencies.techniques[0];
  for(const path of [`/api/v1/ingredients/${ingredient.id}`,`/api/v1/ingredients/${ingredient.id}/revisions/${ingredient.version}`,`/api/v1/techniques/${technique.id}`,`/api/v1/techniques/${technique.id}/revisions/1`])
    assert(seen.includes(path),`read ${path}`);
  assert.equal(JSON.parse(repo.fileText('data/techniques.json')).length,1);
  const dish=JSON.parse(repo.fileText(`data/dishes/${fixed.body.dishRef}.json`));
  assert.equal(dish.components[0].canonicalIngredientVersion,ingredient.version);
  assert.equal((await call(worker,env,'POST',route,{headers:bearer('chef'),body:{recipeVersion:1}})).body.unchanged,true);
  // The KB's ingredient moves on to a new revision: the already frozen recipe version is not rewritten with it.
  kb.versions.set(ingredient.id,ingredient.version+1);
  const head=repo.head,again=await call(worker,env,'POST',route,{headers:bearer('chef'),body:{recipeVersion:1}});
  assert.notEqual(again.status,200,JSON.stringify(again.body));
  assert.equal(repo.head,head);
  assert.equal(JSON.parse(repo.fileText(`data/dishes/${fixed.body.dishRef}.json`)).components[0].canonicalIngredientVersion,ingredient.version);
});
