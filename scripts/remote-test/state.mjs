/** Durable checkpoint helpers for the opt-in local GitHub/Actions test model. */
import assert from 'node:assert/strict';
import {open,rename,readdir,readFile,lstat} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function exportRepo(repo){
 return {head:repo.head,counter:repo.counter,blobs:[...repo.blobs].map(([sha,b])=>[sha,b.toString('base64')]),
  trees:[...repo.trees].map(([sha,m])=>[sha,[...m]]),commits:[...repo.commits],
  runs:repo.runs,jobsByRun:[...repo.jobsByRun],dispatches:repo.dispatches,buildJson:repo.buildJson};
}
export function restoreRepo(repo,state){
 assert.match(state.head,/^[a-f0-9]{40}$/);assert.ok(Number.isSafeInteger(state.counter)&&state.counter>0);
 for(const [sha,encoded] of state.blobs)assert.equal(repo.addBlob(Buffer.from(encoded,'base64')),sha);
 for(const [sha,entries] of state.trees)assert.equal(repo.registerTree(new Map(entries)),sha);
 repo.commits=new Map(state.commits);
 for(const [sha,c] of repo.commits){
  assert.equal(sha,c.sha);assert.ok(repo.trees.has(c.tree));
  assert.equal(repo.git(['rev-parse',`${sha}^{tree}`]),c.tree);
  const parents=repo.git(['rev-list','--parents','-n','1',sha]).split(' ').slice(1);
  assert.deepEqual(parents,c.parents);
 }
 assert.ok(repo.commits.has(state.head));repo.head=state.head;repo.counter=state.counter;
 repo.runs=state.runs;repo.jobsByRun=new Map(state.jobsByRun);repo.dispatches=state.dispatches;repo.buildJson=state.buildJson;
 // The checkpoint is authoritative if an unacknowledged write advanced the Git ref.
 repo.syncHead();
}
export async function syncDirectories(directories){
 for(const path of directories){const handle=await open(path,'r');try{await handle.sync();}finally{await handle.close();}}
}
export async function atomicJson(file,value){
 const temporary=`${file}.${randomUUID()}.tmp`;
 const handle=await open(temporary,'wx',0o600);
 try{await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();}finally{await handle.close();}
 await rename(temporary,file);
 const directory=await open(dirname(file),'r');try{await directory.sync();}finally{await directory.close();}
}
export async function artifactFiles(root,{sync=false}={}){
 const files={};
 async function visit(dir,prefix=''){
  for(const name of (await readdir(dir)).sort()){
   const path=join(dir,name),relative=prefix+name,st=await lstat(path);
   assert.ok(!st.isSymbolicLink(),'published artifacts must not contain symlinks');
   if(st.isDirectory())await visit(path,relative+'/');
   else {assert.ok(st.isFile());files[relative]=hash(await readFile(path));if(sync){const f=await open(path,'r');try{await f.sync();}finally{await f.close();}}}
  }
  if(sync){const f=await open(dir,'r');try{await f.sync();}finally{await f.close();}}
 }
 await visit(root);return files;
}
export async function validateActive(active,buildRoot,expectedFiles){
 assert.equal(resolve(active.root),join(buildRoot,`snapshot-${Number(active.root.split('-').at(-1))}`));
 assert.equal(active.dist,join(active.root,'dist'));
 assert.deepEqual(await artifactFiles(active.dist),expectedFiles);
 const manifest=JSON.parse(await readFile(join(active.dist,'data/build.json'),'utf8'));
 assert.equal(manifest.commit,active.commit);assert.deepEqual(manifest,active.manifest);
}
