/** LOCAL foundation only. Actual Worker/producer; GitHub and hosting are modeled. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,mkdtemp,rm,stat,writeFile,symlink,mkdir,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {createLocalPublicationFixture} from './local-publication-fixture.mjs';
import {currentFiles,json} from './page-fixture.mjs';
const sourceRoot=new URL('../../../../../',import.meta.url).pathname;
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();

test('empty seed has no business entities and formal initial manifest has no fallback plans',async t=>{
 const f=createLocalPublicationFixture({seedMode:'empty'});
 t.after(()=>rm(f.root,{recursive:true,force:true}));
 assert.deepEqual(Object.keys(currentFiles(f.repo)).sort(),['data/techniques.json','data/translations.lock.json']);
 assert.deepEqual(f.built.counts,{ingredients:0,dishes:0,techniques:0,plans:0});
 assert.deepEqual(f.built.build.plans,[]);
 assert.deepEqual(JSON.parse(await readFile(join(f.publicDir,'build.json'),'utf8')).plans,[]);
 assert.deepEqual(JSON.parse(f.repo.fileText('data/techniques.json')),[]);
 assert.deepEqual(JSON.parse(f.repo.fileText('data/translations.lock.json')),{});
});

test('actual Worker rollback restores valid historical knowledge and blocks invalid target without writes',async t=>{
 const {createAcceptanceHarness,initializeAcceptance,cleanupAcceptance}=await import('./acceptance-harness.mjs');
 const parent=await mkdtemp(join(tmpdir(),'w5-parent-'));
 const {config,configPath}=await initializeAcceptance({scratchParent:parent,productionRevision:revision,port:4398,seedMode:'empty',testOnlyLocal:true,allowRollback:true});
 const f=await createAcceptanceHarness(config);
 t.after(async()=>{await cleanupAcceptance(config);await rm(parent,{recursive:true,force:true});});
 assert.deepEqual(f.active.manifest.plans,[]);
 const sw=await readFile(join(f.active.dist,'sw.js'),'utf8');
 assert.ok(sw.includes('data/build.json'));assert.ok(!sw.includes('data/team-meals/team-week.json'));
 const support={'data/techniques.json':'[]\n','data/translations.lock.json':'{}\n'};
 const path='data/menu-plans/rollback-check.json';
 const valid=json({schemaVersion:'3',name:{zh:'工程验收测试代理／副本'},meals:[]});
 const target=f.repo.commit({...support,[path]:valid},'LOCAL synthetic rollback target');
 const invalid=f.repo.commit({...support,[path]:'{broken'},'LOCAL invalid rollback target');
 const keep={'data/shopping-lists/keep.json':'basis and bought bytes; intentionally opaque\n','data/future/keep.json':'future bytes\n'};
 const before=f.repo.commit({...support,[path]:json({schemaVersion:'3',name:{zh:'changed'},meals:[]}),...keep},'LOCAL current');
 assert.equal(execFileSync('git',['remote'],{cwd:f.root,encoding:'utf8'}).trim(),'');
 const headers={authorization:`Bearer ${config.tokens.admin}`};
 const bad=await f.request('POST',`/rollback/${invalid}`,{headers});
 assert.equal(bad.status,422);assert.equal(bad.body.errors[0].code,'invalid_source');
 assert.equal(f.receipts.at(-1).modelWrites,0,'invalid rollback must not even create Git objects');
 assert.equal(f.repo.head,before);
 const good=await f.request('POST',`/rollback/${target}`,{headers});
 assert.equal(good.status,200);assert.equal(good.body.restoredFrom,target);
 assert.deepEqual(f.repo.commits.get(f.repo.head).parents,[before]);
 assert.equal(f.repo.fileText(path),valid);
 for(const [file,bytes] of Object.entries(keep))assert.equal(f.repo.fileText(file),bytes);
 assert.equal(f.active.commit,f.revision,'rollback saves; it does not silently publish');
 const published=await f.request('POST','/publish',{headers});assert.equal(published.status,200);
 assert.equal((await f.complete(published.body.runId)).state,'success');
 assert.equal(f.active.commit,good.body.commit);
 assert.deepEqual(f.active.manifest.plans,['rollback-check']);
 assert.deepEqual(JSON.parse(await readFile(join(f.active.dist,'data/team-meals/rollback-check.json'),'utf8')).menuPlans['rollback-check'],JSON.parse(valid));
 assert.equal((await stat(configPath)).mode&0o777,0o600);
 const receipts=JSON.stringify(f.receipts);
 for(const token of Object.values(config.tokens))assert.ok(!receipts.includes(token));
 assert.ok(!receipts.includes('basis and bought bytes'));assert.ok(!receipts.includes('Bearer'));
 assert.equal((await f.request('POST',`/rollback/${target}`,{headers:{authorization:`Bearer ${config.tokens.buyer}`}})).status,403);
 await f.saveEvidence();
 const ledger=JSON.parse(await readFile(join(config.scratchRoot,'integrity.json'),'utf8'));
 for(const group of ['core-source','schemas','producer-source','dependency-lock','core-runtime','worker-runtime','worker-validators','web-runtime','harness-source'])assert.ok(ledger.entries.some(e=>e.group===group),group);
 assert.equal(ledger.knowledgeBase.state,'not-configured');
 await assert.rejects(f.env.__fetch('https://outside.invalid/unexpected'),/only modeled/);
 const resumed=await createAcceptanceHarness(config);
 assert.equal(resumed.repo.head,f.repo.head);assert.equal(resumed.active.commit,f.active.commit);
 assert.deepEqual(resumed.active.manifest.plans,['rollback-check'],'restart must inspect checkpoint and never reseed');
 if(process.env.W5_HARNESS_EVIDENCE_DIR){
  await mkdir(process.env.W5_HARNESS_EVIDENCE_DIR,{recursive:true});
  for(const file of ['receipts.json','integrity.json'])await cp(join(config.scratchRoot,file),join(process.env.W5_HARNESS_EVIDENCE_DIR,file));
 }
 t.diagnostic(JSON.stringify({boundary:'LOCAL actual Worker/producer; synthetic data; no KB or chef approval',source:revision,empty:f.revision,rollbackTarget:target,invalidTarget:invalid,restored:good.body.commit,published:f.active.commit,blockedStatus:bad.status,receiptStatuses:f.receipts.map(r=>r.status),integrityFiles:ledger.entries.length,restartPreserved:true}));
});

test('owned scratch cleanup refuses forged roots, symlinks and KB paths; config refuses unsafe origins',async t=>{
 const {initializeAcceptance,cleanupAcceptance,validateAcceptanceConfig}=await import('./acceptance-harness.mjs');
 const parent=await mkdtemp(join(tmpdir(),'w5-bounds-'));
 t.after(()=>rm(parent,{recursive:true,force:true}));
 const {config}=await initializeAcceptance({scratchParent:parent,productionRevision:revision,port:4398,seedMode:'empty',testOnlyLocal:true});
 const sentinel=join(parent,'private-db');await writeFile(sentinel,'private data');
 await assert.rejects(cleanupAcceptance({...config,scratchRoot:parent}),/owned scratch/);
 await assert.rejects(cleanupAcceptance({...config,scratchRoot:sentinel}),/owned scratch/);
 const alias=join(parent,'canteen-w5-alias');await symlink(config.scratchRoot,alias);
 await assert.rejects(cleanupAcceptance({...config,scratchRoot:alias}),/owned scratch/);
 for(const port of [3003,3004,4388,4391,6398,6399])assert.throws(()=>validateAcceptanceConfig({...config,port}),/port/);
 assert.throws(()=>validateAcceptanceConfig({...config,testOnlyLocal:false}),/test-only/);
 assert.throws(()=>validateAcceptanceConfig({...config,knowledgeBaseUrl:'https://outside.invalid'}),/4392/);
 await cleanupAcceptance(config);
 assert.equal(await readFile(sentinel,'utf8'),'private data');
});

test('integrity fails closed on dirty fixed core/schema/producer source and forged KB revision',async t=>{
 const {collectAcceptanceIntegrity}=await import('./acceptance-integrity.mjs');
 const parent=await mkdtemp(join(tmpdir(),'w5-integrity-'));
 t.after(()=>rm(parent,{recursive:true,force:true}));
 execFileSync('git',['init','--quiet'],{cwd:parent});
 const file=join(parent,'package.json');await writeFile(file,'{}\n');
 execFileSync('git',['add','.'],{cwd:parent});
 execFileSync('git',['-c','user.name=LOCAL test','-c','user.email=test@example.invalid','commit','--quiet','-m','test'],{cwd:parent});
 await assert.rejects(collectAcceptanceIntegrity({sourceRoot,productionRevision:revision,knowledgeSource:{root:parent,revision:'a'.repeat(40)}}),/KB revision/);
 // Use a separate source tree: the live author's core source remains untouched.
 const shadow=join(parent,'shadow');execFileSync('git',['clone','--quiet','--shared',sourceRoot,shadow]);
 for(const file of ['packages/core/src/index.ts','schemas/menu-plan.schema.json','scripts/build-data.mjs']){
  const original=await readFile(join(shadow,file));await writeFile(join(shadow,file),Buffer.concat([original,Buffer.from('\n changed\n')]));
  await assert.rejects(collectAcceptanceIntegrity({sourceRoot:shadow,productionRevision:revision}),error=>error.message.includes(`fixed source mismatch: ${file}`));
  await writeFile(join(shadow,file),original);
 }
});

test('legacy demo remains separate; loopback server denies non-opt-in rollback and never serves source fallback',async t=>{
 const legacy=createLocalPublicationFixture();t.after(()=>rm(legacy.root,{recursive:true,force:true}));
 assert.deepEqual(legacy.built.build.plans,['team-week']);assert.match(legacy.fixtureNotice.en,/Demo \/ unverified/);
 const {initializeAcceptance,startAcceptanceServer,cleanupAcceptance}=await import('./acceptance-harness.mjs');
 const parent=await mkdtemp(join(tmpdir(),'w5-no-rollback-'));
 const {config}=await initializeAcceptance({scratchParent:parent,productionRevision:revision,port:4398,seedMode:'empty',testOnlyLocal:true});
 const service=await startAcceptanceServer(config),{f}=service;
 t.after(async()=>{await service.stop();await cleanupAcceptance(config);await rm(parent,{recursive:true,force:true});});
 await assert.rejects(cleanupAcceptance(config),/service is active/);
 const status=await fetch(f.origin+'/_test/status');assert.equal(status.status,200);
 const body=await status.text();for(const token of Object.values(config.tokens))assert.ok(!body.includes(token));
 assert.equal((await fetch(f.origin+'/__q/worker/rollback/'+f.revision,{method:'POST',headers:{authorization:`Bearer ${config.tokens.admin}`}})).status,403);
 assert.equal((await fetch(f.origin+'/__q/worker/source/plan/team-week',{headers:{authorization:`Bearer ${config.tokens.chef}`}})).status,404);
 assert.equal((await fetch(f.origin+'/canteen/nonexistent-source.js')).status,404);
 const foreignHost=await new Promise((yes,no)=>{const req=httpRequest(f.origin+'/_test/status',{headers:{Host:'outside.invalid'}},res=>{res.resume();res.on('end',()=>yes(res.statusCode));});req.on('error',no);req.end();});
 assert.equal(foreignHost,403);
 assert.equal((await fetch(f.origin+'/_test/status',{headers:{origin:'https://outside.invalid'}})).status,403);
 const staticBody=await(await fetch(f.origin+'/canteen/data/build.json')).json();assert.deepEqual(staticBody.plans,[]);
});
