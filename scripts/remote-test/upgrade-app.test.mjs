import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm,mkdir,readFile,writeFile,cp,symlink,realpath,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {artifactFiles,hash,atomicJson} from './state.mjs';
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
const trackedFiles=['packages/web/test/e2e/team-meals/workflow-publication-fixture.mjs','scripts/remote-test'];
const run=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const commit=dir=>{run(dir,['add','packages','scripts']);run(dir,['-c','user.name=Upgrade test','-c','user.email=upgrade@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Disposable upgrade test']);return run(dir,['rev-parse','HEAD']);};
const node=(cwd,script,args=[])=>execFileSync(process.execPath,[script,...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});
const evaluate=(cwd,code)=>node(cwd,'--input-type=module',['-e',code]);
const parse=async path=>JSON.parse(await readFile(path,'utf8'));

test('offline app upgrade preserves data/heads/tokens; fixed sources, recovery, restart and rollback',async t=>{
 const temp=await realpath(await mkdtemp(join(tmpdir(),'canteen-upgrade-test-')));t.after(()=>rm(temp,{recursive:true,force:true}));
 const source=join(temp,'new-release'),storageRoot=join(temp,'state'),configPath=join(temp,'runtime.json');
 execFileSync('git',['clone','--quiet','--no-hardlinks',sourceRoot,source],{stdio:'pipe'});
 await writeFile(join(source,'.git/info/exclude'),'node_modules\n');
 // Allow testing an unapplied patch too, only in this isolated clone.
 for(const file of trackedFiles)await cp(join(sourceRoot,file),join(source,file),{recursive:true});
 for(const relative of ['node_modules','packages/web/node_modules','packages/core/node_modules','packages/worker/node_modules'])
  await symlink(await realpath(join(sourceRoot,relative)),join(source,relative),'dir');
 for(const relative of ['packages/core/dist','packages/worker/dist','packages/worker/generated','packages/web/public/icons'])
  await cp(join(sourceRoot,relative),join(source,relative),{recursive:true});
 const entry=join(source,'packages/web/src/main.ts'),original=await readFile(entry,'utf8');
 await writeFile(entry,original+'\nconsole.info("UPGRADE_OLD_MARKER");\n');const oldRevision=commit(source);
 const tokens=Object.fromEntries(['chef','buyer','admin'].map(role=>[role,randomBytes(32).toString('base64url')]));
 await writeFile(configPath,JSON.stringify({port:4288,productionRevision:oldRevision,storageRoot,tokens}),{mode:0o600});
 const fixture=pathToFileURL(join(source,'packages/web/test/e2e/team-meals/workflow-publication-fixture.mjs')).href;
 const options={productionRevision:oldRevision,storageRoot,siteUrl:'http://127.0.0.1:4288/canteen/'};
 evaluate(source,`import {createWorkflowPublicationFixture} from ${JSON.stringify(fixture)};
  const f=await createWorkflowPublicationFixture(${JSON.stringify(options)});
  const tree=f.repo.trees.get(f.repo.commits.get(f.repo.head).tree);
  const files=Object.fromEntries([...tree].map(([p,sha])=>[p,f.repo.blobs.get(sha)]));
  const path='data/menu-plans/team-week.json',plan=JSON.parse(files[path]);plan.name.zh+=' private save';files[path]=JSON.stringify(plan)+'\\n';
  f.repo.commit(files,'Preserved unpublished private save');await f.saveState();`);
 const checkpoint=join(storageRoot,'checkpoint.json'),before=await readFile(checkpoint),beforeConfig=await readFile(configPath),previous=JSON.parse(before);
 assert.notEqual(previous.repo.head,previous.active.commit);
 const publicData=await artifactFiles(join(previous.active.dist,'data'));
 await writeFile(entry,original+'\nconsole.info("UPGRADE_NEW_MARKER");\n');const newRevision=commit(source);
 const cli=join(source,'scripts/remote-test/upgrade-app.mjs');
 const invoke=(...args)=>JSON.parse(node(source,cli,['--config',configPath,...args]).trim());
 const expectUnchanged=async()=>{assert.deepEqual(await readFile(checkpoint),before);assert.deepEqual(await readFile(configPath),beforeConfig);};
 const reject=(...args)=>assert.throws(()=>invoke(...args),error=>{assert.ok(!String(error.stderr).includes(tokens.chef));return true;});
 reject('--from','0'.repeat(40),'--to',newRevision);await expectUnchanged();
 reject('--from',oldRevision,'--to',oldRevision);await expectUnchanged();
 await writeFile(entry,original+'\nconsole.info("DIRTY_SOURCE");\n');
 reject('--from',oldRevision,'--to',newRevision);await expectUnchanged();
 await writeFile(entry,original+'\nconsole.info("UPGRADE_NEW_MARKER");\n');
 // A legitimate fixed revision that fails in Vite must not switch anything.
 await writeFile(entry,'this is not valid TypeScript!');const broken=commit(source);
 reject('--from',oldRevision,'--to',broken);await expectUnchanged();
 run(source,['checkout','--quiet','--detach',newRevision]);
 const lock=join(temp,'service.lock');await mkdir(lock);await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,bootId:'test-live-owner'}));
 reject('--from',oldRevision,'--to',newRevision);await expectUnchanged();await rm(lock,{recursive:true});
 const receipt=invoke('--from',oldRevision,'--to',newRevision);assert.equal(receipt.status,'committed');assert.equal(receipt.publicHead,previous.active.commit);
 const after=await parse(checkpoint),updatedConfig=await parse(configPath);
 assert.equal(after.productionRevision,newRevision);assert.equal(updatedConfig.productionRevision,newRevision);assert.deepEqual(updatedConfig.tokens,tokens);
 assert.deepEqual(after.repo,previous.repo);assert.deepEqual(after.jobs,previous.jobs);assert.equal(after.active.commit,previous.active.commit);assert.notEqual(after.active.root,previous.active.root);
 assert.deepEqual(await artifactFiles(join(after.active.dist,'data')),publicData);
 assert.deepEqual(await artifactFiles(previous.active.dist),previous.activeFiles,'old build retained');
 const assets=await readdir(join(after.active.dist,'assets'));const bundle=(await Promise.all(assets.filter(p=>p.endsWith('.js')).map(p=>readFile(join(after.active.dist,'assets',p),'utf8')))).join('\n');
 assert.ok(bundle.includes('UPGRADE_NEW_MARKER'));assert.ok(!bundle.includes('UPGRADE_OLD_MARKER'));
 assert.ok(!JSON.stringify(receipt).includes(tokens.chef));
 const count=(await readdir(join(storageRoot,'builds'))).length;
 evaluate(source,`import {createWorkflowPublicationFixture} from ${JSON.stringify(fixture)};
  const f=await createWorkflowPublicationFixture(${JSON.stringify({...options,productionRevision:newRevision})});
  if(f.active.dist!==${JSON.stringify(after.active.dist)})throw new Error('Restart changed active artifact');`);
 assert.equal((await readdir(join(storageRoot,'builds'))).length,count,'restart must not rebuild');
 // Rollback refuses to discard any state changed after upgrade.
 const stableCheckpoint=await readFile(checkpoint);const drift=JSON.parse(stableCheckpoint);drift.requestSequence++;
 await writeFile(checkpoint,JSON.stringify(drift)+'\n');reject('--from',newRevision,'--rollback',receipt.id);await writeFile(checkpoint,stableCheckpoint);
 // Model process death after checkpoint rename but before config rename.
 await writeFile(configPath,beforeConfig);await atomicJson(join(storageRoot,'application-upgrade.pending.json'),{schemaVersion:1,id:receipt.id});
 assert.throws(()=>evaluate(source,`import {assertNoApplicationTransaction} from ${JSON.stringify(pathToFileURL(join(source,'scripts/remote-test/service-lock.mjs')).href)};await assertNoApplicationTransaction(${JSON.stringify(storageRoot)});`));
 const recovered=invoke('--recover');assert.equal(recovered.status,'recovered');await expectUnchanged();
 const receipt2=invoke('--from',oldRevision,'--to',newRevision);
 const rolled=invoke('--from',newRevision,'--rollback',receipt2.id);assert.equal(rolled.toRevision,oldRevision);await expectUnchanged();
 // Rollback uses retained old artifacts, then launch the retained old source release.
 run(source,['checkout','--quiet','--detach',oldRevision]);
 evaluate(source,`import {createWorkflowPublicationFixture} from ${JSON.stringify(fixture)};const f=await createWorkflowPublicationFixture(${JSON.stringify(options)});if(f.active.commit!==${JSON.stringify(previous.active.commit)})throw new Error('Rollback head changed');`);
 assert.deepEqual(await artifactFiles(join(previous.active.dist,'data')),publicData);
 t.diagnostic('Verified synthetic state only: private/public divergence preserved, fixed source marker in new bundle, failed build/source/live-owner refusal, journal recovery, restart, rollback; no tokens emitted.');
});
