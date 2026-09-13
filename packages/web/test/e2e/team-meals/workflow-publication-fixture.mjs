/** Q-only local workflow model. No GitHub/Pages request ever leaves FakeRepo. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,symlink,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {main as generateQr} from '../../../scripts/gen-qr.mjs';
import {runBuild} from '../../../../../scripts/build-data.mjs';
import {createLocalPublicationFixture} from './local-publication-fixture.mjs';
import {REPO} from '../../../../worker/test/helpers.mjs';
import {PNG_A,PNG_B} from '../../../../worker/test/image-fixtures.mjs';
import {currentFiles} from './page-fixture.mjs';
const sourceRoot=fileURLToPath(new URL('../../../../../',import.meta.url));
const sourceWeb=join(sourceRoot,'packages/web');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';

export async function createWorkflowPublicationFixture({productionRevision,siteUrl,cacheDiagnostics=false}) {
 assert.match(productionRevision,/^[a-f0-9]{40}$/);
 const site=new URL(siteUrl);assert.equal(site.hostname,'127.0.0.1');assert.equal(site.protocol,'http:');assert.equal(site.pathname,'/canteen/');
 const f=createLocalPublicationFixture();
 if(cacheDiagnostics){
  const files=currentFiles(f.repo),recipe=JSON.parse(files['data/dishes/tomato-egg-stir-fry.json']);
  recipe.image={src:'cache-read.png',license:'CC0'};
  recipe.description.zh+=' 缓存诊断图为纯色测试像素，并非食物照片。';
  files['data/dishes/tomato-egg-stir-fry.json']=json(recipe);files['data/dishes/cache-read.png']=PNG_A;
  const unseen=structuredClone(recipe);unseen.name.zh='未打开菜（缓存诊断／未核验）';unseen.image.src='cache-unread.png';
  files['data/dishes/cache-unseen.json']=json(unseen);files['data/dishes/cache-unread.png']=PNG_A;
  const plan=JSON.parse(files['data/menu-plans/team-week.json']);plan.meals.push({date:'2026-09-13',mealType:'lunch',dishRef:'cache-unseen'});
  files['data/menu-plans/team-week.json']=json(plan);f.repo.commit(files,'Q isolated cache A markers; not food photographs');
 }
 const buildRoot=await realpath(await mkdtemp(join(tmpdir(),'rcq-production-workflow-')));
 const files=execFileSync('git',['ls-tree','-r','--name-only',productionRevision,'packages/web/src','packages/worker/src'],{cwd:sourceRoot,encoding:'utf8'}).trim().split('\n');
 files.push('packages/web/index.html','packages/web/vite.config.ts','packages/web/package.json','packages/web/scripts/gen-qr.mjs');
 const integrity=[];
 for(const file of files){const bytes=await readFile(join(sourceRoot,file));assert.ok(bytes.equals(execFileSync('git',['show',`${productionRevision}:${file}`],{cwd:sourceRoot})),`fixed source: ${file}`);integrity.push({file,sha256:hash(bytes)});}
 let sequence=0,requestSequence=0,active;
 const jobs=[],snapshots=[],controls=[];
 async function snapshot(commit) {
  const root=join(buildRoot,`snapshot-${++sequence}`);await mkdir(root);
  await cp(join(sourceWeb,'src'),join(root,'src'),{recursive:true});
  await cp(join(sourceWeb,'index.html'),join(root,'index.html'));
  await cp(join(sourceWeb,'package.json'),join(root,'package.json'));
  await cp(join(sourceWeb,'vite.config.ts'),join(root,'vite.config.ts'));
  await symlink(join(sourceWeb,'node_modules'),join(root,'node_modules'),'dir');
  await mkdir(join(root,'public'),{recursive:true});
  await cp(join(sourceWeb,'public/icons'),join(root,'public/icons'),{recursive:true});
  const generated=runBuild({root:f.root,outDir:join(root,'public/data'),commit,target:'team-meals',at:new Date().toISOString(),write:true});
  assert.equal(generated.issues.filter(i=>i.kind==='error').length,0,JSON.stringify(generated.issues));
  const qr=await generateQr({env:{SITE_URL:siteUrl},outDir:join(root,'public/qr'),log:()=>{}});
  const previous=process.env.VITE_WORKER_URL;
  process.env.VITE_WORKER_URL='/__q/worker';
  try{await build({root,configFile:join(root,'vite.config.ts'),logLevel:'warn',build:{outDir:join(root,'dist'),emptyOutDir:true}});}
  finally{if(previous===undefined)delete process.env.VITE_WORKER_URL;else process.env.VITE_WORKER_URL=previous;}
  const dist=join(root,'dist');
  assert.ok((await readFile(join(dist,'sw.js'),'utf8')).includes('data/team-meals/team-week.json'));
  return {root,dist,commit,manifest:generated.build,qr,swSha256:hash(await readFile(join(dist,'sw.js'))),issues:generated.issues};
 }
 active=await snapshot(f.repo.head);snapshots.push(active);f.repo.buildJson=active.manifest;
 const inheritedFetch=f.env.__fetch;
 f.env.__requestId=()=>`rcq-local-workflow-${++requestSequence}`;
 f.env.__fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url),method=init.method??'GET';
  if(url.origin==='https://api.github.com'&&method==='POST'&&url.pathname===`/repos/${REPO}/actions/workflows/build-deploy.yml/dispatches`){
   const body=JSON.parse(init.body);assert.equal(body.ref,'main');assert.match(body.inputs.request_id,/^rcq-local-workflow-\d+$/);
   const id=8100+jobs.length,now=new Date(f.env.__now()).toISOString();
   const run={id,name:`publish · ${body.inputs.request_id}`,status:'queued',conclusion:null,html_url:`${site.origin}/__q/run/${id}`,head_sha:f.repo.head,created_at:now,run_started_at:null};
   f.repo.calls.push({method,path:url.pathname,search:url.search,mode:'local-model'});f.repo.dispatches.push(body);f.repo.runs.unshift(run);
   jobs.push({id,commit:f.repo.head,state:'queued',run,requestId:body.inputs.request_id});
   return new Response(null,{status:204});
  }
  return inheritedFetch(input,init);
 };
 async function complete(id){
  const job=jobs.find(j=>j.id===id);assert.ok(job,'known local run required');
  if(job.promise)return job.promise;if(job.state!=='queued')return job;
  job.state='running';job.run.status='in_progress';job.run.run_started_at=new Date(f.env.__now()).toISOString();
  job.promise=(async()=>{
   let success=false;
   try{const next=await snapshot(job.commit);active=next;snapshots.push(next);f.repo.buildJson=next.manifest;job.output=next;success=true;}
   catch(error){job.error=String(error);}
   job.state=success?'success':'failure';job.run.status='completed';job.run.conclusion=job.state;
   const time=new Date(f.env.__now()).toISOString();
   const step=(name,conclusion)=>({name,status:'completed',conclusion,started_at:time,completed_at:time});
   f.repo.jobsByRun.set(id,[{id:id*10,name:'Q local validation and production build',status:'completed',conclusion:job.state,started_at:time,completed_at:time,steps:[
    step('Validate data/**/*.json against schemas/*.schema.json',success?'success':'failure'),
    step('Machine-translate missing en/uk (only when DEEPL_API_KEY is set)','skipped'),
    step('Build data (three sheets + build.json → packages/web/public/data/)',success?'success':'skipped'),
    step('Build web (vite → packages/web/dist/)',success?'success':'skipped'),
    step('Run actions/upload-pages-artifact@v3',success?'success':'skipped'),
   ]},{id:id*10+1,name:'deploy-pages local artifact switch (modeled hosting)',status:'completed',conclusion:success?'success':'skipped',started_at:time,completed_at:time,steps:[]}]);
   return job;
  })();
  return job.promise;
 }
 async function stageCacheUpdate(){
  assert.ok(cacheDiagnostics,'cache setup must be explicit');
  const files=currentFiles(f.repo),recipe=JSON.parse(files['data/dishes/tomato-egg-stir-fry.json']);
  recipe.name.zh+=' · 缓存B';files['data/dishes/tomato-egg-stir-fry.json']=json(recipe);files['data/dishes/cache-read.png']=PNG_B;
  const commit=f.repo.commit(files,'Q explicit cache B setup; not a native save or remote publication');
  const next=await snapshot(commit);active=next;snapshots.push(next);f.repo.buildJson=next.manifest;
  controls.push({action:'stage-cache-update',commit,swSha256:next.swSha256});return next;
 }
 const record=()=>({kind:'Q local workflow model; actual Worker, formal producer, QR generator, Vite and generated SW; no remote execution',productionRevision,integrity,buildRoot,fixtureRoot:f.root,active,snapshots,controls,jobs:jobs.map(({promise,...job})=>job)});
 await writeFile(join(buildRoot,'source-integrity.json'),json({productionRevision,integrity}));
 return {...f,buildRoot,integrity,get active(){return active;},jobs,complete,stageCacheUpdate,record};
}
