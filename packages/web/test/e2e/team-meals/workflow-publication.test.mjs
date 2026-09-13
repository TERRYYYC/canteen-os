/** Targeted Q infrastructure checks; remote workflow and hosting remain modeled. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createWorkflowPublicationFixture} from './workflow-publication-fixture.mjs';
import {WORKER,call,bearer} from '../../../../worker/test/helpers.mjs';
const worker=(await import(WORKER)).default;
const fixed='4b1e5e13a82bd5a2437f95df20aaf49f77f8996f';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');

test('actual Worker dispatch owns a queued run; only a completed formal web build changes served publication',async t=>{
 const f=await createWorkflowPublicationFixture({productionRevision:fixed,siteUrl:'http://127.0.0.1:4279/canteen/'});
 t.after(()=>{rmSync(f.root,{recursive:true,force:true});rmSync(f.buildRoot,{recursive:true,force:true});});
 const request=(method,path,options={})=>call(worker,f.env,method,path,{...options,headers:{...bearer('chef'),...options.headers}});
 const before=f.active;assert.equal(before.commit,f.revision);
 for(const route of ['prep','purchase','menu']){
  const b=readFileSync(`${before.dist}/qr/${route}.png`);assert.equal(b.readUInt32BE(16),512);assert.equal(b.readUInt32BE(20),512);
 }
 assert.deepEqual(before.qr.items.map(i=>i.url),['prep','purchase','menu'].map(route=>`http://127.0.0.1:4279/canteen/#/${route}`));
 const sw=readFileSync(before.dist+'/sw.js','utf8');assert.match(sw,/qr\/prep\.png/);assert.match(sw,/data\/team-meals\/team-week\.json/);
 const plan=(await request('GET','/source/plan/team-week')).body;
 plan.content.meals.push({date:'2026-09-13',mealType:'lunch',dishRef:'tomato-egg-stir-fry'});
 const saved=await request('POST','/plan/team-week',{body:plan.content,headers:{'If-Match':plan.blobSha}});assert.equal(saved.status,200);
 assert.equal(f.active,before,'save does not publish');
 const dispatched=await request('POST','/publish');assert.equal(dispatched.status,200);assert.equal(dispatched.body.mode,'dispatch');assert.ok(dispatched.body.runId);
 const id=dispatched.body.runId,queued=(await request('GET',`/publish/${id}`)).body;assert.equal(queued.runCompleted,false);assert.equal(queued.status,'queued');
 assert.equal(f.active,before);assert.equal(f.repo.dispatches.length,1);
 const finished=await f.complete(id);assert.equal(finished.state,'success',finished.error);
 const progress=(await request('GET',`/publish/${id}`)).body;assert.equal(progress.runCompleted,true);assert.equal(progress.runConclusion,'success');assert.equal(progress.status,'success');
 assert.equal(f.active.commit,saved.body.commit);assert.notEqual(f.active.dist,before.dist);
 assert.notEqual(hash(f.active.dist+'/sw.js'),hash(before.dist+'/sw.js'));
 assert.equal(JSON.parse(readFileSync(f.active.dist+'/data/build.json')).commit,saved.body.commit);
 const projection=JSON.parse(readFileSync(f.active.dist+'/data/team-meals/team-week.json'));assert.deepEqual(projection.menuPlans['team-week'],plan.content);
 const online=f.active;
 const latest=(await request('GET','/source/plan/team-week')).body;latest.content.meals[0].dishRef='missing-recipe';
 const broken=await request('POST','/plan/team-week',{body:latest.content,headers:{'If-Match':latest.blobSha}});assert.equal(broken.status,200);
 const retry=await request('POST','/publish');assert.notEqual(retry.body.runId,id);
 assert.equal((await f.complete(retry.body.runId)).state,'failure');assert.equal(f.active,online,'failed build keeps all old served bytes');
 const failed=(await request('GET',`/publish/${retry.body.runId}`)).body;assert.equal(failed.runCompleted,true);assert.equal(failed.runConclusion,'failure');
 assert.equal(f.repo.buildJson.commit,online.commit);assert.equal(execFileSync('git',['remote'],{cwd:f.root,encoding:'utf8'}).trim(),'');
 await assert.rejects(f.env.__fetch('https://outside.invalid/anything'),/only modeled/);
 const old=readFileSync(new URL('./page-server.mjs',import.meta.url),'utf8');assert.ok(old.includes("assert.ok(!path.startsWith('/publish')&&!path.startsWith('/rollback'),'No publication/rollback in the Q browser run');"));
 t.diagnostic(JSON.stringify({kind:'Local modeled workflow with actual Worker and producer/Vite/SW',source:fixed,initial:before.commit,published:online.commit,runIds:[id,retry.body.runId],qr:before.qr.items.map(i=>i.url),oldGuardUnchanged:true}));
});

test('explicit cache setup makes production A/B with changed visible data and image bytes without a fake native write',async t=>{
 const f=await createWorkflowPublicationFixture({productionRevision:fixed,siteUrl:'http://127.0.0.1:4279/canteen/',cacheDiagnostics:true});
 t.after(()=>{rmSync(f.root,{recursive:true,force:true});rmSync(f.buildRoot,{recursive:true,force:true});});
 const a=f.active,b=await f.stageCacheUpdate();
 assert.notEqual(a.commit,b.commit);assert.notEqual(a.swSha256,b.swSha256);
 const pa=JSON.parse(readFileSync(a.dist+'/data/team-meals/team-week.json')),pb=JSON.parse(readFileSync(b.dist+'/data/team-meals/team-week.json'));
 assert.notEqual(pa.dishes['tomato-egg-stir-fry'].name.zh,pb.dishes['tomato-egg-stir-fry'].name.zh);
 assert.equal(pa.dishes['cache-unseen'].image.src,'cache-unread.png');
 const aPaths=execFileSync('git',['ls-tree','-r','--name-only',a.commit],{cwd:f.root,encoding:'utf8'}).trim().split('\n');
 assert.ok(aPaths.includes('data/dishes/cache-read.png')&&aPaths.includes('data/dishes/cache-unread.png'));
 const bytes=(commit,path)=>execFileSync('git',['show',`${commit}:${path}`],{cwd:f.root});
 assert.notDeepEqual(bytes(a.commit,'data/dishes/cache-read.png'),bytes(b.commit,'data/dishes/cache-read.png'));
 assert.deepEqual(bytes(a.commit,'data/dishes/cache-unread.png'),bytes(b.commit,'data/dishes/cache-unread.png'));
 assert.equal(f.jobs.length,0);assert.equal(f.repo.dispatches.length,0);assert.equal(f.record().controls[0].action,'stage-cache-update');
 t.diagnostic(JSON.stringify({kind:'Controlled A/B preparation, not native SW coverage',a:a.commit,b:b.commit,changedImage:true,unreadImagePresent:true}));
});
