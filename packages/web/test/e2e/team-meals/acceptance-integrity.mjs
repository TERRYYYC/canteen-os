/** Hash evidence, not a deployment attestation. Never reads private KB data/media. */
import assert from 'node:assert/strict';
import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(root,args)=>execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024});
const list=(root,revision,paths)=>git(root,['ls-tree','-rz',revision,'--',...paths]).toString().split('\0').filter(Boolean).map(row=>{
 const tab=row.indexOf('\t'),[mode,type,blobSha]=row.slice(0,tab).split(' ');assert.ok(type==='blob'&&['100644','100755'].includes(mode),'regular fixed source required');return {file:row.slice(tab+1),blobSha};
});
const blobHash=bytes=>createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
const corePaths=['packages/core/src','packages/core/package.json','packages/core/tsconfig.json','packages/core/tsconfig.build.json'];
const producerPaths=['scripts'];
const webPaths=['packages/web/src','packages/web/scripts','packages/web/public/icons','packages/web/index.html','packages/web/vite.config.ts','packages/web/package.json','packages/web/tsconfig.json'];
const workerPaths=['packages/worker/src','packages/worker/scripts','packages/worker/package.json','packages/worker/tsconfig.json','packages/worker/tsconfig.build.json'];

async function treeHashes(root,relative,group,entries,{required=true}={}){
 const absolute=join(root,relative);
 let info;try{info=await lstat(absolute);}catch(e){if(e.code==='ENOENT'&&!required)return;throw new Error(`Missing runtime inventory: ${relative}`);}
 assert.ok(!info.isSymbolicLink(),`runtime symlink: ${relative}`);
 if(info.isDirectory()){
  const names=(await readdir(absolute)).sort();assert.ok(!required||names.length,`Empty runtime inventory: ${relative}`);
  for(const name of names)await treeHashes(root,`${relative}/${name}`,group,entries);
 }else{
  assert.ok(info.isFile(),`non-file runtime: ${relative}`);
  const bytes=await readFile(absolute);entries.push({group,file:relative,bytes:bytes.length,sha256:sha256(bytes)});
 }
}

export async function collectAcceptanceIntegrity({sourceRoot,productionRevision,dist,knowledgeSource}){
 sourceRoot=await realpath(sourceRoot);assert.match(productionRevision,/^[a-f0-9]{40}$/);
 assert.equal(git(sourceRoot,['rev-parse','--show-toplevel']).toString().trim(),sourceRoot,'source repository root required');
 assert.equal(git(sourceRoot,['rev-parse','HEAD']).toString().trim(),productionRevision,'fixed application HEAD required');
 const entries=[];
 for(const [group,paths] of [['core-source',corePaths],['schemas',['schemas']],['producer-source',producerPaths],['web-source',webPaths],['worker-source',workerPaths],['dependency-lock',['package.json','pnpm-lock.yaml']]]){
  const files=list(sourceRoot,productionRevision,paths);assert.ok(files.length,`source inventory required: ${group}`);
  for(const {file,blobSha} of files){
   const info=await lstat(join(sourceRoot,file));assert.ok(info.isFile()&&!info.isSymbolicLink(),`fixed source regular file required: ${file}`);
   const bytes=await readFile(join(sourceRoot,file));
   assert.ok(blobHash(bytes)===blobSha,`fixed source mismatch: ${file}`);
   entries.push({group,file,bytes:bytes.length,sha256:sha256(bytes)});
  }
  assert.equal(git(sourceRoot,['status','--porcelain','--untracked-files=all','--',...paths]).toString().trim(),'','fixed source inventory contains tracked/untracked changes');
 }
 const harnessPath='packages/web/test/e2e/team-meals';
 for(const name of (await readdir(join(sourceRoot,harnessPath))).filter(name=>/^(?:acceptance-|(?:local|workflow)-publication-fixture\.mjs$)/.test(name)).sort()){
  const file=`${harnessPath}/${name}`,bytes=await readFile(join(sourceRoot,file));entries.push({group:'harness-source',file,bytes:bytes.length,sha256:sha256(bytes)});
 }
 // A source-only preflight can run before dependencies/builds exist.
 if(dist){
  for(const [relative,group] of [['node_modules/.pnpm/lock.yaml','installed-dependency-lock'],['packages/core/dist','core-runtime'],['packages/worker/dist','worker-runtime'],['packages/worker/generated','worker-validators']])await treeHashes(sourceRoot,relative,group,entries);
  await treeHashes(resolve(dist),'.','web-runtime',entries);
 }
 let knowledgeBase={state:'not-configured',claim:'No KB acceptance in this foundation run'};
 if(knowledgeSource){
  const root=await realpath(knowledgeSource.root),revision=knowledgeSource.revision;assert.match(revision,/^[a-f0-9]{40}$/,'KB revision must be a full SHA');
  assert.equal(git(root,['rev-parse','--show-toplevel']).toString().trim(),root,'KB repository root required');
  assert.equal(git(root,['rev-parse','HEAD']).toString().trim(),revision,'KB revision mismatch');
  assert.equal(git(root,['status','--porcelain','--untracked-files=no']).toString().trim(),'','KB tracked source must be clean');
  assert.equal(git(root,['status','--porcelain','--untracked-files=all','--','apps','contracts','db','infra','scripts','package.json','package-lock.json']).toString().trim(),'','KB source inventory contains untracked changes');
  const kb=[];
  const files=list(root,revision,['apps','contracts','db','infra','scripts','package.json','package-lock.json']);
  assert.ok(files.length,'KB source inventory required');
  for(const {file,blobSha} of files){
   assert.ok(!/(^|\/)(data|uploads|backups|\.env)(\/|$)|\.(?:db|sqlite|mp4|mov|csv)$/i.test(file),`private file excluded from integrity: ${file}`);
   const info=await lstat(join(root,file));assert.ok(info.isFile()&&!info.isSymbolicLink(),`fixed KB regular file required: ${file}`);
   const bytes=await readFile(join(root,file));assert.ok(blobHash(bytes)===blobSha,`fixed KB source mismatch: ${file}`);
   kb.push({group:'kb-source',file,bytes:bytes.length,sha256:sha256(bytes)});
  }
  if(dist){await treeHashes(root,'node_modules/.package-lock.json','kb-installed-dependency-lock',kb);await treeHashes(root,'apps/web/dist','kb-runtime',kb);}
  knowledgeBase={state:'pinned-source',revision,entries:kb,claim:'Pinned KB source/runtime inventory; does not attest to database state or upstream process identity'};
 }
 return {schemaVersion:1,kind:'LOCAL acceptance integrity ledger',sourceRoot,productionRevision,...(dist?{webRuntimeRoot:resolve(dist)}:{}),node:process.version,generatedAt:new Date().toISOString(),harnessDiffSha256:sha256(git(sourceRoot,['diff','HEAD','--',harnessPath])),entries,knowledgeBase};
}
