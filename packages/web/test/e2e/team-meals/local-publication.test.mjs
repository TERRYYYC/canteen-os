/** Bounded adapter checks. Real Worker/build/reader; no native UI or remote publication claim. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createLocalPublicationFixture} from './local-publication-fixture.mjs';
import {filesUnder} from './page-fixture.mjs';
import {WORKER,call,bearer} from '../../../../worker/test/helpers.mjs';
import {createShoppingList,applyShoppingDecision} from '../../../../core/dist/index.js';
const worker=(await import(WORKER)).default;
const source='/source/plan/team-week';
const require=createRequire(import.meta.url);
const viteRequire=createRequire(require.resolve('vite/package.json'));
const {build}=await import(viteRequire.resolve('esbuild'));
const bundle=await build({entryPoints:[new URL('../../../src/view-models/published.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
const {createPublishedData}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const outputHashes=f=>Object.fromEntries(Object.entries(filesUnder(f.publicDir,'')).map(([p,b])=>[p,hash(b)]));
function setup(t) {
  const f=createLocalPublicationFixture();
  t.after(()=>rmSync(f.root,{recursive:true,force:true}));
  const request=(method,path,options={})=>call(worker,f.env,method,path,{...options,headers:{...bearer('chef'),...options.headers}});
  const reader=createPublishedData({baseUrl:'https://local.invalid/data/',fetch:async input=>{
    const url=new URL(input);
    assert.equal(url.origin,'https://local.invalid');
    try{return new Response(readFileSync(join(f.publicDir,url.pathname.slice('/data/'.length))),{headers:{'Content-Type':'application/json'}});}
    catch{return new Response('',{status:404});}
  }});
  const readPublic=async()=>reader.loadPublishedTeamPlan(await reader.loadPublication({fresh:true}),'team-week');
  return {f,request,readPublic};
}

test('saved real Git revision remains private until explicit local build, then the production reader sees it',async t=>{
  const {f,request,readPublic}=setup(t);
  const original=await readPublic(),read=await request('GET',source);
  assert.equal(read.status,200);
  const plan=structuredClone(read.body.content);
  plan.meals.push({date:'2026-09-13',mealType:'lunch',dishRef:'tomato-egg-stir-fry'});
  const saved=await request('POST','/plan/team-week',{body:plan,headers:{'If-Match':read.body.blobSha}});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:f.root,encoding:'utf8'}).trim(),saved.body.commit);
  assert.deepEqual(JSON.parse(execFileSync('git',['show',`${saved.body.commit}:data/menu-plans/team-week.json`],{cwd:f.root})),plan);
  assert.equal((await readPublic()).sourceRevision,original.sourceRevision,'Save alone must not advance public data');
  assert.equal(f.publication.update(original.sourceRevision).status,409,'stale operator checkpoint must not publish a later save silently');
  const updated=f.publication.update(saved.body.commit);
  assert.equal(updated.status,200,JSON.stringify(updated));
  const published=await readPublic();
  assert.equal(published.sourceRevision,saved.body.commit);
  assert.deepEqual(published.projection.menuPlans['team-week'],plan);
  assert.ok(plan.meals.every(m=>!Object.hasOwn(m,'plannedServings')));
  assert.deepEqual((await request('GET',`${source}?revision=${original.sourceRevision}`)).body.content,original.projection.menuPlans['team-week']);
  const recipe=published.projection.dishes['tomato-egg-stir-fry'];
  assert.match(recipe.name.zh,/演示/);assert.match(recipe.description.zh,/未核验/);
  assert.equal(recipe.provenance.videoUrl,'https://www.bilibili.com/video/BV1example888');
  assert.equal(recipe.provenance.source,'video');
  assert.equal(published.projection.collection.coverage.recipeCompleteness,'unverified');
  assert.ok(published.issues.some(i=>i.dishRef==='needs-details'));
  const catalog=await request('GET',`/catalog?revision=${published.sourceRevision}`);
  assert.equal(catalog.status,200);
  const inputs={menuPlans:{'team-week':plan},...catalog.body};
  const list=createShoppingList('local-demo-shopping',{sourceRevision:published.sourceRevision,selection:published.projection.selection},inputs);
  const created=await request('POST',`/shopping-list/${list.id}`,{body:list,headers:{...bearer('buyer'),'If-None-Match':'*'}});
  assert.equal(created.status,200,JSON.stringify(created.body));
  const judged=applyShoppingDecision(list,'tomato','buy');
  const confirmed=await request('POST',`/shopping-list/${list.id}`,{body:judged,headers:{...bearer('buyer'),'If-Match':created.body.blobSha}});
  assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));
  const reopened=await request('GET',`/source/shopping-list/${list.id}`,{headers:bearer('buyer')});
  assert.deepEqual(reopened.body.content,judged);
  assert.equal(reopened.body.content.basis.sourceRevision,published.sourceRevision);
  assert.equal((await readPublic()).sourceRevision,published.sourceRevision,'saving judgments must not publish implicitly');
  assert.equal(f.repo.dispatches.length,0);
  t.diagnostic(JSON.stringify({initial:original.sourceRevision,saved:saved.body.commit,public:published.sourceRevision,blankServings:true}));
});

test('missing reference blocks the formal build without changing public bytes; a real saved correction recovers',async t=>{
  const {f,request,readPublic}=setup(t),before=outputHashes(f);
  const read=await request('GET',source),broken=structuredClone(read.body.content);
  broken.meals[0].dishRef='missing-recipe';
  const saved=await request('POST','/plan/team-week',{body:broken,headers:{'If-Match':read.body.blobSha}});
  assert.equal(saved.status,200);
  const blocked=f.publication.update(saved.body.commit);
  assert.equal(blocked.status,422);
  assert.ok(blocked.issues.some(i=>i.code==='missing-dish'&&i.kind==='error'));
  assert.deepEqual(outputHashes(f),before);
  assert.equal((await readPublic()).sourceRevision,f.revision);
  const rejected=await request('POST','/plan/team-week',{body:read.body.content,headers:{'If-Match':read.body.blobSha}});
  assert.equal(rejected.status,409);
  assert.equal(f.repo.head,saved.body.commit);
  const latest=await request('GET',source);
  const fixed=await request('POST','/plan/team-week',{body:read.body.content,headers:{'If-Match':latest.body.blobSha}});
  assert.equal(fixed.status,200);
  assert.equal(f.publication.update(fixed.body.commit).status,200);
  assert.deepEqual((await readPublic()).projection.menuPlans['team-week'],read.body.content);
  assert.equal(f.repo.dispatches.length,0);
  t.diagnostic(JSON.stringify({blocked:saved.body.commit,recovered:fixed.body.commit,oldPublicPreserved:true}));
});

test('local history preserves binary blobs and refuses remote dispatch; original fixture and server guards stay present',async t=>{
  const {f}=setup(t);
  const binary=Buffer.from([0,255,254,10,13,128]);
  const files=Object.fromEntries([...f.repo.trees.get(f.repo.commits.get(f.repo.head).tree)].map(([p,s])=>[p,f.repo.blobs.get(s)]));
  files['data/byte-sentinel.bin']=binary;
  const revision=f.repo.commit(files,'Q binary custody probe');
  assert.ok(execFileSync('git',['show',`${revision}:data/byte-sentinel.bin`],{cwd:f.root}).equals(binary));
  assert.ok(f.repo.blobs.get(f.repo.trees.get(f.repo.commits.get(revision).tree).get('data/byte-sentinel.bin')).equals(binary));
  await assert.rejects(f.env.__fetch('https://api.github.com/repos/TERRYYYC/canteen-os/actions/workflows/build-deploy.yml/dispatches',{method:'POST',body:'{}'}),/dispatch/);
  const oldFixture=readFileSync(new URL('./page-fixture.mjs',import.meta.url));
  assert.ok(oldFixture.equals(execFileSync('git',['show','22eacbab0f182bec2ea510e5e018e6b6cee0af90:packages/web/test/e2e/team-meals/page-fixture.mjs'])));
  const server=readFileSync(new URL('./page-server.mjs',import.meta.url),'utf8');
  assert.ok(server.includes("assert.ok(!path.startsWith('/publish')&&!path.startsWith('/rollback'),'No publication/rollback in the Q browser run');"));
});
