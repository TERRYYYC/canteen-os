import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { importIllustrations } from '../../scripts/import-candidate-illustrations.mjs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../../apps/api/app.mjs';
const work='7000000000000000003', sourceUrl=`https://www.douyin.com/video/${work}`;
const stepId='49e04de3-bdc5-4b8b-9760-423dad360b5a';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6s8AAAAASUVORK5CYII=','base64');
async function req(app,method,path,payload,headers={}) { return app.inject({method,url:`/api/v1${path}`,headers:{host:'127.0.0.1:4390',...(method==='GET'?{}:{'x-kb-client':'agent'}),...headers},...(payload===undefined?{}:{payload})}); }
async function setup(t){
 const dataDir=await mkdtemp(join(tmpdir(),'kb-illustrations-'));let app=await buildApp({dataDir});
 t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});
 await req(app,'POST','/favorites/import/apply',{folder:'吃的',claimedCount:1,rows:[{index:'1',folder:'吃的',kind:'video',content_id:work,url:sourceUrl,author:'test-source',card_alt:'一条做饭视频',display_text:'一条做饭视频'}]});
 const item=(await req(app,'GET','/favorites/items')).json().items[0];
 const captured=await req(app,'POST',`/favorites/items/${item.id}/captures`,{method:'video_analysis',status:'ready',evidence:{sourceUrl,media:{sha256:'a'.repeat(64),durationMs:10000,audioDurationMs:10000,videoDurationMs:10000,byteCount:12345,sourceMethod:'f2',coverage:{audioProcessedThroughMs:10000,frameCount:21,lastFrameMs:10000,maxFrameGapMs:500}},segments:[{id:'s1',kind:'subtitle',locator:'00:01',startMs:1000,endMs:2000,text:'陈皮排骨 排骨两斤 煸炒排骨'}]}});
 assert.equal(captured.statusCode,201,captured.body);
 const proposed=await req(app,'POST',`/favorites/items/${item.id}/candidates`,{captureId:captured.json().id,recipe:{title:{zh:'陈皮排骨'},ingredients:[{id:'497fd12d-d38e-4742-a157-86c0562c2e9b',name:{zh:'排骨'},amount:{kind:'text',raw:'两斤'}}],steps:[{id:stepId,text:{zh:'煸炒排骨'}}]},fieldEvidence:{title:{locator:'00:01',quote:'陈皮排骨',evidenceIds:['s1']},ingredients:[{locator:'00:01',quote:'排骨两斤',evidenceIds:['s1']}],steps:[{locator:'00:01',quote:'煸炒排骨',evidenceIds:['s1']}]},imageCandidates:[]});
 assert.equal(proposed.statusCode,201,proposed.body);
 const boundary='source-frame';const uploaded=await req(app,'POST','/assets/upload',Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="frame.png"\r\nContent-Type: image/png\r\n\r\n`),png,Buffer.from(`\r\n--${boundary}--\r\n`)]),{'content-type':`multipart/form-data; boundary=${boundary}`});
 assert.equal(uploaded.statusCode,201,uploaded.body);
 const body={assetId:uploaded.json().id,sourceMediaSha256:'a'.repeat(64),frameMs:1500,role:'step',stepId,caption:{zh:'煸炒排骨的状态'},sourceUrl,author:'test-source',rightsState:'unknown'};
 const db=new DatabaseSync(join(dataDir,'knowledge.sqlite'));t.after(()=>db.close());
 const snapshot=()=>JSON.stringify({capture:db.prepare('SELECT evidence_json,sha256 FROM favorite_captures WHERE id=?').get(captured.json().id),candidate:db.prepare('SELECT document,digest FROM favorite_candidates WHERE id=?').get(proposed.json().id)});
 return {get app(){return app;},restart:async()=>{await app.close();app=await buildApp({dataDir});},item,candidate:proposed.json(),body,db,snapshot};
}
test('source-frame illustrations append idempotently, remain internal after approval and never rewrite capture/candidate/recipe snapshots',async t=>{
 const f=await setup(t),before=f.snapshot(),path=`/favorites/candidates/${f.candidate.id}/illustrations`;
 const first=await req(f.app,'POST',path,f.body);assert.equal(first.statusCode,201,first.body);assert.equal(first.json().rightsState,'unknown');assert.equal(first.json().stepId,stepId);
 const retry=await req(f.app,'POST',path,f.body);assert.equal(retry.statusCode,200,retry.body);assert.equal(retry.json().id,first.json().id);
 const detail=(await req(f.app,'GET',`/favorites/candidates/${f.candidate.id}`)).json();assert.equal(detail.illustrations.length,1);assert.match(detail.illustrations[0].url,/^\/api\/v1\/assets\/.+\/content$/);assert.deepEqual(detail.imageCandidates,[]);assert.deepEqual(detail.recipe.assets,[]);
 const listed=(await req(f.app,'GET',`/favorites/items/${f.item.id}/candidates`)).json().items[0];assert.equal(listed.illustrations[0].id,first.json().id);assert.equal(f.snapshot(),before);
 assert.throws(()=>f.db.prepare('UPDATE favorite_candidate_illustrations SET document=?').run('{}'),/immutable/i);
 assert.throws(()=>f.db.exec('DELETE FROM favorite_candidate_illustrations'),/immutable/i);
 const approved=await req(f.app,'POST',`/favorites/candidates/${f.candidate.id}/review`,{decision:'approve',reviewer:'test-only-chef',note:'test-only approval'});assert.equal(approved.statusCode,200,approved.body);
 const revision=(await req(f.app,'GET',`/recipes/${approved.json().recipeId}/revisions/1`)).json();assert.deepEqual(revision.recipe.assets,[]);const oldRevision=JSON.stringify(revision);
 const appended=await req(f.app,'POST',path,{...f.body,frameMs:1700,role:'finished',caption:{zh:'原片最终画面'}});assert.equal(appended.statusCode,201,appended.body);
 assert.equal((await req(f.app,'GET',`/favorites/candidates/${f.candidate.id}`)).json().illustrations.length,2);assert.equal(JSON.stringify((await req(f.app,'GET',`/recipes/${approved.json().recipeId}/revisions/1`)).json()),oldRevision);assert.equal(f.snapshot(),before);
 await f.restart();assert.equal((await req(f.app,'GET',`/favorites/candidates/${f.candidate.id}`)).json().illustrations.length,2);
 assert.equal(JSON.stringify((await req(f.app,'GET',`/recipes/${approved.json().recipeId}/revisions/1`)).json()),oldRevision);
});
test('approved source illustrations are a minimal recipe-version view with exact step identity and text links',async t=>{
 const f=await setup(t),path=`/favorites/candidates/${f.candidate.id}/illustrations`;
 for(const [role,frameMs,caption] of [['step',1500,'煸炒参考'],['ingredient',1600,'排骨参考'],['finished',1700,'成品参考']]){
   const added=await req(f.app,'POST',path,{...f.body,role,frameMs,caption:{zh:caption}});
   assert.equal(added.statusCode,201,added.body);
 }
 const approved=await req(f.app,'POST',`/favorites/candidates/${f.candidate.id}/review`,{decision:'approve',reviewer:'test-chef',note:'核对原片'});
 assert.equal(approved.statusCode,200,approved.body);
 const recipeId=approved.json().recipeId,read=version=>req(f.app,'GET',`/recipes/${recipeId}/source-illustrations?version=${version}`);
 const v1=await read(1);assert.equal(v1.statusCode,200,v1.body);
 assert.deepEqual({...v1.json(),illustrations:[...v1.json().illustrations].sort((a,b)=>a.role.localeCompare(b.role))},{recipeId,recipeVersion:1,candidateId:f.candidate.id,approvedCandidateVersion:1,
   illustrations:[
     {assetId:f.body.assetId,role:'step',sourceStepId:stepId,caption:{zh:'煸炒参考'},rightsState:'pending'},
     {assetId:f.body.assetId,role:'ingredient',sourceStepId:null,caption:{zh:'排骨参考'},rightsState:'pending'},
     {assetId:f.body.assetId,role:'finished',sourceStepId:null,caption:{zh:'成品参考'},rightsState:'pending'},
   ].sort((a,b)=>a.role.localeCompare(b.role)),
   stepLinks:[{sourceStepId:stepId,recipeStepId:stepId}]});
 for(const forbidden of ['sourceUrl','sourceMediaSha256','frameMs','reviewNote','fieldEvidence','textContent','/api/v1/assets/'])assert.equal(v1.body.includes(forbidden),false,forbidden);
 const original=(await req(f.app,'GET',`/recipes/${recipeId}/revisions/1`)).json().recipe;
 const changedText=await req(f.app,'PUT',`/recipes/${recipeId}`,{...original,steps:[{id:stepId,text:{zh:'煸炒排骨（复核）'}}]}, {'idempotency-key':randomUUID(),'if-match':'"v1"'});
 assert.equal(changedText.statusCode,200,changedText.body);
 const v2=await read(2);assert.equal(v2.statusCode,200,v2.body);
 assert.deepEqual(v2.json().stepLinks,[{sourceStepId:stepId,recipeStepId:null}]);
 assert.equal(v2.json().approvedCandidateVersion,1);
 const changedId=await req(f.app,'PUT',`/recipes/${recipeId}`,{...original,steps:[{id:randomUUID(),text:{zh:'煸炒排骨'}}]}, {'idempotency-key':randomUUID(),'if-match':'"v2"'});
 assert.equal(changedId.statusCode,200,changedId.body);
 const v3=await read(3);assert.equal(v3.statusCode,200,v3.body);
 assert.deepEqual(v3.json().stepLinks,[{sourceStepId:stepId,recipeStepId:null}]);
 assert.deepEqual((await read(1)).json().stepLinks,[{sourceStepId:stepId,recipeStepId:stepId}]);
});

test('source illustration view validates recipe/version/query and returns empty data without an approved source or frames',async t=>{
 const f=await setup(t),created=await req(f.app,'POST','/recipes',{title:{zh:'独立菜谱'}},{'idempotency-key':randomUUID()});
 assert.equal(created.statusCode,201,created.body);
 const recipeId=created.json().id,base=`/recipes/${recipeId}/source-illustrations`;
 const empty=await req(f.app,'GET',`${base}?version=1`);
 assert.deepEqual(empty.json(),{recipeId,recipeVersion:1,candidateId:null,approvedCandidateVersion:null,illustrations:[],stepLinks:[]});
 for(const query of ['', '?version=', '?version=0', '?version=-1', '?version=01', '?version=1.5', '?version=9007199254740992', '?version=1&version=1', '?version=1&other=1']){
   const result=await req(f.app,'GET',`${base}${query}`);assert.equal(result.statusCode,400,query);
 }
 assert.equal((await req(f.app,'GET',`/recipes/not-a-uuid/source-illustrations?version=1`)).statusCode,400);
 const missing=await req(f.app,'GET',`/recipes/${randomUUID()}/source-illustrations?version=1`);assert.equal(missing.statusCode,404);assert.equal(missing.json().error.code,'RECIPE_NOT_FOUND');
 const missingRevision=await req(f.app,'GET',`${base}?version=2`);assert.equal(missingRevision.statusCode,404);assert.equal(missingRevision.json().error.code,'REVISION_NOT_FOUND');
 const approved=await req(f.app,'POST',`/favorites/candidates/${f.candidate.id}/review`,{decision:'approve',reviewer:'test-chef',note:'核对原片'});
 assert.equal(approved.statusCode,200,approved.body);
 const noFrames=await req(f.app,'GET',`/recipes/${approved.json().recipeId}/source-illustrations?version=1`);
 assert.deepEqual(noFrames.json(),{recipeId:approved.json().recipeId,recipeVersion:1,candidateId:f.candidate.id,approvedCandidateVersion:1,illustrations:[],stepLinks:[{sourceStepId:stepId,recipeStepId:stepId}]});
});
test('illustrations reject cross-source, out-of-range time, foreign steps, external assets and fabricated rights',async t=>{
 const f=await setup(t),path=`/favorites/candidates/${f.candidate.id}/illustrations`;
 for(const [change,status] of [[{sourceMediaSha256:'b'.repeat(64)},422],[{sourceUrl:'https://www.douyin.com/video/7000000000000000004'},422],[{frameMs:10001},422],[{stepId:'a1111111-1111-4111-8111-111111111111'},422],[{rightsState:'granted'},400],[{caption:'string is not I18n'},400]])assert.equal((await req(f.app,'POST',path,{...f.body,...change})).statusCode,status,JSON.stringify(change));
 const ext=(await req(f.app,'POST','/assets/external',{kind:'image',url:'https://example.test/frame.jpg'})).json();assert.equal((await req(f.app,'POST',path,{...f.body,assetId:ext.id})).statusCode,422);
 assert.equal((await f.app.inject({method:'POST',url:`/api/v1${path}`,headers:{host:'127.0.0.1:4390'},payload:f.body})).statusCode,403);
 assert.equal((await req(f.app,'GET',`/favorites/candidates/${f.candidate.id}`)).json().illustrations.length,0);
});

test('inbox list finds Chinese recipe titles and summarizes the latest candidate without exposing reference rights',async t=>{
 const f=await setup(t),path=`/favorites/candidates/${f.candidate.id}/illustrations`;
 const other='7000000000000000004';
 await req(f.app,'POST','/favorites/import/apply',{folder:'吃的',claimedCount:2,rows:[{index:'2',folder:'吃的',kind:'video',content_id:other,url:`https://www.douyin.com/video/${other}`,author:'other',card_alt:'另一条视频',display_text:'另一条视频'}]});
 const first=(await req(f.app,'GET','/favorites/items?folder=%E5%90%83%E7%9A%84&limit=1')).json();
 assert.equal(first.items.length,1);
 assert.equal(first.items[0].candidateSummary.candidateId,f.candidate.id);
 assert.deepEqual(first.items[0].candidateSummary.title,{zh:'陈皮排骨'});
 assert.deepEqual({status:first.items[0].candidateSummary.status,ingredientCount:first.items[0].candidateSummary.ingredientCount,stepCount:first.items[0].candidateSummary.stepCount,illustrationCount:first.items[0].candidateSummary.illustrationCount,thumbnailAssetId:first.items[0].candidateSummary.thumbnailAssetId,unresolvedCount:first.items[0].candidateSummary.unresolvedCount},
   {status:'needs_review',ingredientCount:1,stepCount:1,illustrationCount:0,thumbnailAssetId:null,unresolvedCount:0});
 const second=(await req(f.app,'GET',`/favorites/items?folder=%E5%90%83%E7%9A%84&limit=1&cursor=${first.nextCursor}`)).json();
 assert.equal(second.items.length,1);
 assert.equal(second.items[0].candidateSummary,undefined,'items without a candidate remain compatible');
 assert.equal(second.nextCursor,null);
 const otherItem=second.items[0];
 const otherCapture=await req(f.app,'POST',`/favorites/items/${otherItem.id}/captures`,{method:'manual_post',status:'ready',evidence:{sourceUrl:otherItem.url,text:'红烧排骨 排骨两斤 慢炖',segments:[{kind:'post_text',locator:'正文',text:'红烧排骨 排骨两斤 慢炖'}]}});
 assert.equal(otherCapture.statusCode,201,otherCapture.body);
 const otherCandidate=await req(f.app,'POST',`/favorites/items/${otherItem.id}/candidates`,{captureId:otherCapture.json().id,
   recipe:{title:{zh:'红烧排骨'},ingredients:[{id:'c27c1ff1-c0eb-43ec-8620-24892f573d9e',name:{zh:'排骨'},amount:{kind:'text',raw:'两斤'}}],steps:[{id:'b3467b77-0093-4c8e-8e33-5908a871e688',text:{zh:'慢炖'}}]},
   fieldEvidence:{title:{locator:'正文',quote:'红烧排骨'},ingredients:[{locator:'正文',quote:'排骨两斤'}],steps:[{locator:'正文',quote:'慢炖'}]},imageCandidates:[]});
 assert.equal(otherCandidate.statusCode,201,otherCandidate.body);
 const searchedFirst=(await req(f.app,'GET','/favorites/items?q=%E6%8E%92%E9%AA%A8&limit=1')).json();
 assert.deepEqual(searchedFirst.items.map(item=>item.id),[f.item.id]);
 assert.ok(searchedFirst.nextCursor);
 const searchedSecond=(await req(f.app,'GET',`/favorites/items?q=%E6%8E%92%E9%AA%A8&limit=1&cursor=${searchedFirst.nextCursor}`)).json();
 assert.deepEqual(searchedSecond.items.map(item=>item.id),[otherItem.id]);
 assert.equal(searchedSecond.nextCursor,null);
 const found=await req(f.app,'GET','/favorites/items?q=%E9%99%88%E7%9A%AE%E6%8E%92%E9%AA%A8');
 assert.equal(found.statusCode,200,found.body);
 assert.deepEqual(found.json().items.map(item=>item.id),[f.item.id],'search uses candidate title, not card text');
 assert.equal((await req(f.app,'GET','/favorites/items?q=%E4%B8%8D%E5%AD%98%E5%9C%A8')).json().items.length,0);
 assert.equal((await req(f.app,'GET',`/favorites/items?q=%E9%99%88%E7%9A%AE%E6%8E%92%E9%AA%A8&cursor=${first.nextCursor}`)).statusCode,400,'a cursor cannot be reused under a different search');
 const added=await req(f.app,'POST',path,f.body);assert.equal(added.statusCode,201,added.body);
 const withImage=(await req(f.app,'GET','/favorites/items?q=%E9%99%88%E7%9A%AE%E6%8E%92%E9%AA%A8')).json().items[0].candidateSummary;
 assert.equal(withImage.illustrationCount,1);
 assert.equal(withImage.thumbnailAssetId,f.body.assetId);
 assert.equal('rightsState' in withImage,false);
 const reviewed=await req(f.app,'POST',`/favorites/candidates/${f.candidate.id}/review`,{decision:'approve',reviewer:'test-chef',note:'已核对原片'});
 assert.equal(reviewed.statusCode,200,reviewed.body);
 const approved=(await req(f.app,'GET','/favorites/items?q=%E9%99%88%E7%9A%AE%E6%8E%92%E9%AA%A8')).json().items[0].candidateSummary;
 assert.equal(approved.status,'approved');
 assert.equal(approved.illustrationCount,1);
 const stillPending=(await req(f.app,'GET','/favorites/items?q=%E6%8E%92%E9%AA%A8&state=needs_review')).json();
 assert.deepEqual(stillPending.items.map(item=>item.id),[otherItem.id]);
 assert.equal((await req(f.app,'GET','/favorites/items?q=%E6%8E%92%E9%AA%A8&state=approved')).json().items[0].id,f.item.id);
});

test('illustration importer validates the complete local manifest before uploading, maps real step IDs and reuses existing images on repeat',async t=>{
 const f=await setup(t),dir=await mkdtemp(join(tmpdir(),'source-images-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await mkdir(join(dir,'images'));await writeFile(join(dir,'images','frame.png'),png);
 const picture={path:'images/frame.png',sha256:createHash('sha256').update(png).digest('hex'),frameMs:1500,role:'step',stepOrder:1,caption:'真实原片图',sourceUrl,author:'test-source',sourceMediaSha256:'a'.repeat(64),rightsState:'unknown'};
 const manifest={sourceMediaSha256:'a'.repeat(64),sourceUrl,author:'test-source',rightsState:'unknown',images:[picture]};
 await writeFile(join(dir,'illustrations.json'),JSON.stringify({...manifest,images:[{...picture,stepOrder:2}]}));
 const apiBase=await f.app.listen({host:'127.0.0.1',port:0});
 await assert.rejects(importIllustrations({artifactDir:dir,candidateId:f.candidate.id,apiBase,apply:true}),/stepOrder/);
 assert.equal(f.db.prepare('SELECT count(*) n FROM assets').get().n,1);
 await writeFile(join(dir,'illustrations.json'),JSON.stringify(manifest));
 const preview=await importIllustrations({artifactDir:dir,candidateId:f.candidate.id,apiBase,apply:false});assert.equal(preview.items[0].stepId,stepId);assert.equal(f.db.prepare('SELECT count(*) n FROM assets').get().n,1);
 await writeFile(join(dir,'local-import-receipt.json'),JSON.stringify({candidateId:f.candidate.id}));assert.equal((await importIllustrations({artifactDir:dir,apiBase})).candidateId,f.candidate.id);
 await writeFile(join(dir,'local-import-receipt.json'),JSON.stringify({imported:{candidateId:f.candidate.id}}));assert.equal((await importIllustrations({artifactDir:dir,apiBase})).candidateId,f.candidate.id);
 const first=await importIllustrations({artifactDir:dir,candidateId:f.candidate.id,apiBase,apply:true});assert.equal(first.items.length,1);assert.equal(first.items[0].illustration.stepId,stepId);
 const second=await importIllustrations({artifactDir:dir,candidateId:f.candidate.id,apiBase,apply:true});assert.equal(second.items[0].replayed,true);assert.equal(second.items[0].illustration.id,first.items[0].illustration.id);
 assert.equal(f.db.prepare('SELECT count(*) n FROM assets').get().n,2);assert.equal(f.db.prepare('SELECT count(*) n FROM favorite_candidate_illustrations').get().n,1);
 await writeFile(join(dir,'images','frame.png'),Buffer.from('altered'));await assert.rejects(importIllustrations({artifactDir:dir,candidateId:f.candidate.id,apiBase,apply:true}),/hash/);
});
