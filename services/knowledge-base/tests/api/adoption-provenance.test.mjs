import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../apps/api/app.mjs';
import { openDatabase } from '../../apps/api/database.mjs';
import { readLegacyBundle, importLegacyBundle } from '../../apps/api/legacy-import.mjs';
import { createBackup, restoreBackup } from '../../scripts/sqlite-ops.mjs';
import test from 'node:test';
test('favorite/legacy source authority and populated immutable approvals/receipts survive backup and restore',async()=>{
  const root=await mkdtemp(join(await realpath(tmpdir()),'w2w3-source-restore-review-')),dataDir=join(root,'kb');
  let app=await buildApp({dataDir});

  const kb=(method,path,payload,version,key)=>app.inject({method,url:'/api/v1'+path,headers:{host:'127.0.0.1:4390',...(method==='GET'?{}:{'x-kb-client':'agent','idempotency-key':key??randomUUID()}),...(version?{'if-match':`"v${version}"`}:{})},...(payload===undefined?{}:{payload})});
  const expect=async (method,path,payload,version,status,key)=>{const response=await kb(method,path,payload,version,key);assert.equal(response.statusCode,status,response.body);return response.json();};
  const body={reviewer:'independent-engineering-fixture',note:'Disposable fixture only; no user recipe or chef decision.',ingredientVersions:{}};
  const recipe={title:{zh:'Synthetic source recipe'},recipeFormatVersion:'2',ingredients:[{id:randomUUID(),name:{zh:'Synthetic salt'},amount:{kind:'unknown'}}],steps:[{id:randomUUID(),text:{zh:'Synthetic original step, time unknown.'}}]};
  try{
    const sourceUrl='https://www.douyin.com/note/7000000000000000001';
    await expect('POST','/favorites/import/apply',{folder:'Synthetic review only',claimedCount:1,rows:[{index:'1',folder:'Synthetic review only',kind:'note',content_id:'7000000000000000001',url:sourceUrl,author:'Synthetic',card_alt:'Synthetic',display_text:'Synthetic'}]},undefined,201);
    const item=(await expect('GET','/favorites/items',undefined,undefined,200)).items[0];
    const captured=await expect('POST',`/favorites/items/${item.id}/captures`,{method:'manual_post',status:'ready',evidence:{sourceUrl,text:'Synthetic original recipe. Salt amount unknown. Mix, time unknown.'}},undefined,201);
    const candidate=await expect('POST',`/favorites/items/${item.id}/candidates`,{captureId:captured.id,recipe,fieldEvidence:{title:{locator:'text',quote:'Synthetic original recipe'},ingredients:[{locator:'text',quote:'Salt amount unknown'}],steps:[{locator:'text',quote:'Mix, time unknown'}]},imageCandidates:[],unresolved:['Amount and time unknown']},undefined,201);
    const sourceApproved=await expect('POST',`/favorites/candidates/${candidate.id}/review`,{decision:'approve',reviewer:'independent-engineering-fixture',note:'Source check on synthetic fixture only'},undefined,200);
    const favoriteId=sourceApproved.recipeId;
    const sourceOnly=await expect('GET',`/recipes/${favoriteId}/revisions/1/adoption`,undefined,undefined,200);assert.equal(sourceOnly.kitchenApproval,null);
    const approved=await expect('POST',`/recipes/${favoriteId}/revisions/1/approve`,body,1,201);
    assert.equal(approved.origin.kind,'favorite');assert.equal(approved.origin.originalRecipeVersion,1);
    assert.deepEqual((await expect('GET',`/recipes/${favoriteId}/revisions/1/adoption`,undefined,undefined,200)).kitchenApproval,approved);
    const original=await expect('GET',`/recipes/${favoriteId}/revisions/1`,undefined,undefined,200);
    await expect('PUT',`/recipes/${favoriteId}`,{...original.recipe,sources:[],title:{zh:'Detached kitchen revision'}},1,200);
    const detached=await kb('POST',`/recipes/${favoriteId}/revisions/2/approve`,body,2);assert.equal(detached.statusCode,409);assert.equal(detached.json().error.code,'SOURCE_REVIEW_REQUIRED');
    await expect('PUT',`/recipes/${favoriteId}`,{...original.recipe,title:{zh:'Linked kitchen revision'}},2,200);
    const linked=await expect('POST',`/recipes/${favoriteId}/revisions/3/approve`,body,3,201);assert.equal(linked.origin.originalRecipeVersion,1);

    const sourceDir=join(root,'legacy','data');await mkdir(join(sourceDir,'ingredients'),{recursive:true});await mkdir(join(sourceDir,'dishes'));
    await writeFile(join(sourceDir,'ingredients','salt.json'),JSON.stringify({schemaVersion:'2',name:{zh:'Legacy synthetic salt'},baseUnit:'g',trackStock:false}));
    await writeFile(join(sourceDir,'techniques.json'),'[]');
    await writeFile(join(sourceDir,'dishes','legacy.json'),JSON.stringify({schemaVersion:'3',name:{zh:'Legacy synthetic recipe'},status:'active',components:[{ingredientRef:'salt'}],steps:[{text:{zh:'Legacy step time unknown.'}}]}));
    const opened=openDatabase(join(dataDir,'knowledge.sqlite'));let imported;
    try{imported=importLegacyBundle({db:opened.db,uploadsDir:join(dataDir,'uploads'),bundle:readLegacyBundle({sourceDir,namespace:'independent-disposable-review',revision:'f'.repeat(40)})});}finally{opened.db.close();}
    const legacyId=imported.recipes[0].id,legacy=await expect('GET',`/recipes/${legacyId}`,undefined,undefined,200);
    const versions=Object.fromEntries(legacy.recipe.ingredients.map(row=>[row.ingredientId,1]));
    const legacyBody={...body,ingredientVersions:versions};
    const unconfirmed=await kb('POST',`/recipes/${legacyId}/revisions/1/approve`,legacyBody,1);assert.equal(unconfirmed.statusCode,409);
    const legacyApproved=await expect('POST',`/recipes/${legacyId}/revisions/1/approve`,{...legacyBody,sourceConfirmed:true},1,201);assert.equal(legacyApproved.origin.kind,'legacy');assert.equal(legacyApproved.origin.originalRecipeVersion,1);assert.equal(legacyApproved.dependencies.ingredients[0].ingredient.baseUnit,undefined);
    assert.deepEqual((await expect('GET',`/recipes/${legacyId}/revisions/1/adoption`,undefined,undefined,200)).kitchenApproval,legacyApproved);

    const standard=await expect('POST','/ingredients',{name:{zh:'Restore synthetic standard'}},undefined,201);
    const manual=await expect('POST','/recipes',{...recipe,ingredients:[{...recipe.ingredients[0],id:randomUUID(),ingredientId:standard.id}],steps:[{...recipe.steps[0],id:randomUUID()}]},undefined,201);
    const approvedBody={...body,sourceConfirmed:true,ingredientVersions:{[standard.id]:1}},requestKey=randomUUID();
    const manualApproval=await expect('POST',`/recipes/${manual.id}/revisions/1/approve`,approvedBody,1,201,requestKey);
    await app.close();app=null;
    const backup=join(root,'backup'),restored=join(root,'restored');
    const backupResult=await createBackup({dataDir,targetDir:backup});
    assert.equal(backupResult.database.counts.recipe_approvals,4);
    assert(backupResult.database.counts.ingredient_revisions>0);
    assert(backupResult.database.counts.write_receipts>0);
    await restoreBackup({bundleDir:backup,targetDir:restored});
    app=await buildApp({dataDir:restored});
    const loaded=await expect('GET',`/recipes/${manual.id}/revisions/1/adoption`,undefined,undefined,200);assert.deepEqual(loaded.kitchenApproval,manualApproval);
    assert.deepEqual((await expect('GET',`/ingredients/${standard.id}/revisions/1`,undefined,undefined,200)),standard);
    const replay=await kb('POST',`/recipes/${manual.id}/revisions/1/approve`,approvedBody,1,requestKey);assert.deepEqual(replay.json(),manualApproval);assert.equal(replay.headers['idempotency-replayed'],'true');
    const restoredDb=openDatabase(join(restored,'knowledge.sqlite'));
    try{for(const table of ['recipe_approvals','ingredient_revisions'])assert.throws(()=>restoredDb.db.exec(`DELETE FROM ${table}`),/immutable/);}finally{restoredDb.db.close();}
  }finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
});
