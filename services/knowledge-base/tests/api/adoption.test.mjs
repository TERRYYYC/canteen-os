import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from '../../apps/api/app.mjs';
import { readFileSync } from 'node:fs';
import { hash } from '../../apps/api/validation.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'kb-adoption-'));
  let app = await buildApp({ dataDir });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { get app() { return app; }, async reopen() { await app.close(); app = await buildApp({ dataDir }); } };
}
const call = (app, method, path, payload, headers = {}) => app.inject({ method, url: `/api/v1${path}`,
  headers: { host: '127.0.0.1:4390', ...(method === 'GET' ? {} : {'x-kb-client':'web','idempotency-key':randomUUID()}), ...headers },
  ...(payload === undefined ? {} : {payload}) });
async function created(app, path, body) {
  const response = await call(app, 'POST', path, body);
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}
const recipe = ingredientId => ({ title:{zh:'工程手工菜'}, recipeFormatVersion:'2', ingredients:[
  {id:randomUUID(),name:{zh:'小米辣'},...(ingredientId?{ingredientId}:{}),amount:{kind:'unknown'},kitchenPrep:{timing:'before-service',size:'细圈'}}],
  steps:[{id:randomUUID(),text:{zh:'切好加入。原方时间未说明。'}}] });

test('standard identity has immutable versions, unknown units and conditional idempotent edits', async t => {
  const f = await fixture(t);
  const first = await created(f.app, '/ingredients', {name:{zh:'小米辣'}});
  assert.equal(first.version, 1);
  assert.equal(first.ingredient.baseUnit, undefined);
  const sameName = await created(f.app, '/ingredients', {name:{zh:'小米辣'}});
  assert.notEqual(first.id, sameName.id);
  const body = {name:{zh:'小米辣'},baseUnit:'g',purchase:{supplier:'工程夹具',packSize:500,packUnit:'g'},yield:0.9};
  assert.equal((await call(f.app,'PUT',`/ingredients/${first.id}`,body)).statusCode,428);
  const headers = {'if-match':'"v1"','idempotency-key':randomUUID()};
  const saved = await call(f.app,'PUT',`/ingredients/${first.id}`,body,headers);
  assert.equal(saved.statusCode,200,saved.body);
  assert.equal(saved.json().version,2);
  const replay = await call(f.app,'PUT',`/ingredients/${first.id}`,body,headers);
  assert.deepEqual(replay.json(),saved.json());
  assert.equal(replay.headers['idempotency-replayed'],'true');
  assert.equal((await call(f.app,'PUT',`/ingredients/${first.id}`,body,{'if-match':'"v1"'})).statusCode,409);
  assert.equal((await call(f.app,'PUT',`/ingredients/${first.id}`,{...body,yield:0.8},headers)).statusCode,409);
  assert.deepEqual((await call(f.app,'GET',`/ingredients/${first.id}/revisions/1`)).json(),first);
  assert.equal((await call(f.app,'PUT',`/ingredients/${first.id}`,{name:{zh:'小米辣'},baseUnit:'pcs',yield:0.9},{'if-match':'"v2"'})).statusCode,400);
  await f.reopen();
  assert.equal((await call(f.app,'GET',`/ingredients/${first.id}`)).json().version,2);
});

test('manual recipes require persistent chef approval; revision and dependency snapshots survive edits/restart', async t => {
  const f = await fixture(t);
  const ingredient = await created(f.app,'/ingredients',{name:{zh:'小米辣'}});
  const first = await created(f.app,'/recipes',recipe(ingredient.id));
  const path = `/recipes/${first.id}/revisions/1/approve`;
  const body = {reviewer:'engineering-test-only',note:'原方未知保留；测试副本批准',ingredientVersions:{[ingredient.id]:1}};
  const pending = await call(f.app,'GET',`/recipes/${first.id}/revisions/1/adoption`);
  assert.equal(pending.statusCode,200,pending.body);
  assert.equal(pending.json().kitchenApproval,null);
  assert.equal((await call(f.app,'POST',path,body,{'if-match':'"v1"'})).statusCode,409);
  const accepted = {...body,sourceConfirmed:true};
  const headers = {'if-match':'"v1"','idempotency-key':randomUUID()};
  const approved = await call(f.app,'POST',path,accepted,headers);
  assert.equal(approved.statusCode,201,approved.body);
  const approval = approved.json();
  assert.equal(approval.recipeVersion,1);
  assert.equal(approval.origin.kind,'manual');
  assert.equal(approval.origin.originalRecipeVersion,1);
  assert.equal(approval.dependencies.ingredients[0].version,1);
  assert.equal(approval.dependencies.ingredients[0].ingredient.baseUnit,undefined);
  const changedIngredient = await call(f.app,'PUT',`/ingredients/${ingredient.id}`,{name:{zh:'小米辣'},baseUnit:'g',purchase:{supplier:'fixture',packSize:1,packUnit:'kg'}},{'if-match':'"v1"'});
  assert.equal(changedIngredient.statusCode,200,changedIngredient.body);
  const second = await call(f.app,'PUT',`/recipes/${first.id}`,{...first.recipe,title:{zh:'工程厨房修订'}},{'if-match':'"v1"'});
  assert.equal(second.statusCode,200,second.body);
  const replay = await call(f.app,'POST',path,accepted,headers);
  assert.deepEqual(replay.json(),approval);
  assert.equal(replay.headers['idempotency-replayed'],'true');
  assert.equal((await call(f.app,'POST',path,{...accepted,note:'different'},headers)).statusCode,409);
  assert.equal((await call(f.app,'GET',`/recipes/${first.id}/revisions/2/adoption`)).json().kitchenApproval,null);
  await f.reopen();
  assert.deepEqual((await call(f.app,'GET',`/recipes/${first.id}/revisions/1/adoption`)).json().kitchenApproval,approval);
  assert.equal((await call(f.app,'GET',`/recipes/${first.id}/revisions/1`)).json().recipe.ingredients[0].amount.kind,'unknown');
  const v2 = await call(f.app,'POST',`/recipes/${first.id}/revisions/2/approve`,{...accepted,ingredientVersions:{[ingredient.id]:2}},{'if-match':'"v2"'});
  assert.equal(v2.statusCode,201,v2.body);
  assert.equal(v2.json().origin.originalRecipeVersion,1);
  assert.equal(v2.json().dependencies.ingredients[0].version,2);
});

test('approval rejects stale dependencies, ghost identities and old-client recipe downgrade', async t => {
  const f = await fixture(t);
  const ingredient = await created(f.app,'/ingredients',{name:{zh:'盐'}});
  const first = await created(f.app,'/recipes',recipe(ingredient.id));
  const path = `/recipes/${first.id}/revisions/1/approve`;
  const body = {reviewer:'engineering-test-only',note:'test',sourceConfirmed:true,ingredientVersions:{[ingredient.id]:2}};
  assert.equal((await call(f.app,'POST',path,body,{'if-match':'"v1"'})).statusCode,409);
  assert.equal((await call(f.app,'POST',path,{...body,ingredientVersions:{[randomUUID()]:1}},{'if-match':'"v1"'})).statusCode,422);
  const {recipeFormatVersion:_format,...oldClient} = first.recipe;
  oldClient.ingredients = oldClient.ingredients.map(({kitchenPrep:_prep,...row})=>row);
  const downgraded = await call(f.app,'PUT',`/recipes/${first.id}`,oldClient,{'if-match':'"v1"'});
  assert.equal(downgraded.statusCode,409,downgraded.body);
  assert.equal(downgraded.json().error.code,'FORMAT_DOWNGRADE');
  const blank = await created(f.app,'/recipes',{title:{zh:'仅名字'}});
  assert.equal((await call(f.app,'POST',`/recipes/${blank.id}/revisions/1/approve`,{reviewer:'engineering-test-only',note:'test',sourceConfirmed:true,ingredientVersions:{}},{'if-match':'"v1"'})).statusCode,422);
});


test('first manual approval of a kitchen revision retains actual original v1 hash; archive state is separate', async t => {
  const f = await fixture(t), first = await created(f.app,'/recipes',recipe());
  const original = (await call(f.app,'GET',`/recipes/${first.id}/revisions/1`)).json();
  const edited = await call(f.app,'PUT',`/recipes/${first.id}`,{...first.recipe,title:{zh:'Revised before first approval'}},{'if-match':'"v1"'});
  assert.equal(edited.statusCode,200,edited.body);
  const body={reviewer:'engineering-test-only',note:'Disposable test approval',sourceConfirmed:true,ingredientVersions:{}};
  const approved=await call(f.app,'POST',`/recipes/${first.id}/revisions/2/approve`,body,{'if-match':'"v2"'});
  assert.equal(approved.statusCode,201,approved.body);
  assert.equal(approved.json().origin.originalRecipeVersion,1);
  assert.equal(approved.json().originalSnapshotHash,hash(original));
  assert.notEqual(approved.json().originalSnapshotHash,approved.json().recipeSnapshotHash);
  assert.deepEqual((await call(f.app,'GET',`/recipes/${first.id}/revisions/2/adoption`)).json().current,{version:2,archived:false});
  assert.equal((await call(f.app,'POST',`/recipes/${first.id}/archive`,{}, {'if-match':'"v2"'})).statusCode,200);
  const archived=(await call(f.app,'GET',`/recipes/${first.id}/revisions/2/adoption`)).json();
  assert.deepEqual(archived.current,{version:3,archived:true});
  assert.deepEqual(archived.kitchenApproval,approved.json());
  await f.reopen();
  assert.deepEqual((await call(f.app,'GET',`/recipes/${first.id}/revisions/2/adoption`)).json(),archived);
});


test('approved recipe row bound matches the cross-repo contract: 200 preserved, 201 rejected',async t=>{
  const {maxRecipeIngredients}=JSON.parse(readFileSync(new URL('../fixtures/adoption-bounds.json',import.meta.url)));
  const schema=JSON.parse(readFileSync(new URL('../../contracts/import-batch.schema.json',import.meta.url)));
  assert.equal(schema.$defs.recipe.properties.ingredients.maxItems,maxRecipeIngredients);
  const f=await fixture(t),body=recipe();body.ingredients=Array.from({length:maxRecipeIngredients},()=>({...body.ingredients[0],id:randomUUID()}));
  const first=await created(f.app,'/recipes',body);assert.equal(first.recipe.ingredients.length,maxRecipeIngredients);
  const approval=await call(f.app,'POST',`/recipes/${first.id}/revisions/1/approve`,{reviewer:'engineering-test-only',note:'Disposable full-bound fixture',sourceConfirmed:true,ingredientVersions:{}},{'if-match':'"v1"'});
  assert.equal(approval.statusCode,201,approval.body);
  assert.equal((await call(f.app,'GET',`/recipes/${first.id}/revisions/1`)).json().recipe.ingredients.length,maxRecipeIngredients);
  assert.equal((await call(f.app,'POST','/recipes',{...body,ingredients:[...body.ingredients,{...body.ingredients[0],id:randomUUID()}]})).statusCode,400);
});
