/** Shared exclusive owner lock for the service and offline application upgrade CLI. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
export async function acquireServiceLock(storageRoot){
 storageRoot=resolve(storageRoot);
 await mkdir(dirname(storageRoot),{recursive:true});
 try{storageRoot=await realpath(storageRoot);}catch(error){if(error.code!=='ENOENT')throw error;storageRoot=join(await realpath(dirname(storageRoot)),storageRoot.split('/').at(-1));}
 const lock=join(dirname(storageRoot),'service.lock'),bootId=randomUUID();
 const recordOwner=()=>writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,bootId}),{mode:0o600});
 try{await mkdir(lock);await recordOwner();}catch(error){
  if(error.code!=='EEXIST')throw error;
  const recovery=lock+'.recovery';await mkdir(recovery);
  try{
   const owner=JSON.parse(await readFile(join(lock,'owner.json'),'utf8'));assert.ok(Number.isSafeInteger(owner.pid)&&owner.pid>0);
   try{process.kill(owner.pid,0);throw new Error('Service or upgrade already owns this directory');}
   catch(e){if(e.code!=='ESRCH')throw e;}
   await rm(lock,{recursive:true});await mkdir(lock);await recordOwner();
  }finally{await rm(recovery,{recursive:true});}
 }
 return {bootId,async release(){
  const owner=JSON.parse(await readFile(join(lock,'owner.json'),'utf8'));
  assert.equal(owner.bootId,bootId,'lock ownership changed');await rm(lock,{recursive:true});
 }};
}
export async function assertNoApplicationTransaction(storageRoot){
 try{await readFile(join(storageRoot,'application-upgrade.pending.json'));}
 catch(error){if(error.code==='ENOENT')return;throw error;}
 throw new Error('Incomplete application upgrade; stop service and run upgrade-app.mjs --recover');
}
