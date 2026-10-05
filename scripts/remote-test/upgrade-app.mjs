#!/usr/bin/env node
/** Offline, explicit app-only upgrade. No remote calls; never print config/state. */
import {readFile,mkdir,open,rename,unlink,realpath,lstat} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {atomicJson,hash,validateActive,syncDirectories} from './state.mjs';
import {acquireServiceLock,assertNoApplicationTransaction} from './service-lock.mjs';
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
const sourcePaths=['packages','scripts','schemas','package.json','pnpm-lock.yaml','pnpm-workspace.yaml'];
class UpgradeRefusal extends Error {}
const check=(ok,message)=>{if(!ok)throw new UpgradeRefusal(message);};
const bytesOf=value=>Buffer.from(JSON.stringify(value)+'\n');
const pendingPath=root=>join(root,'application-upgrade.pending.json');
const parse=bytes=>JSON.parse(bytes.toString('utf8'));
const revision=value=>check(typeof value==='string'&&/^[a-f0-9]{40}$/.test(value),'A full fixed Git revision is required');
const git=args=>execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});

/** Verify actual tracked bytes (including assume-unchanged files), HEAD and extras. */
export async function verifySource(toRevision){
 revision(toRevision);check(git(['rev-parse','HEAD']).trim()===toRevision,'Source HEAD does not match target revision');
 check(git(['cat-file','-t',toRevision]).trim()==='commit','Target must be a Git commit');
 const entries=git(['ls-tree','-rz',toRevision,'--',...sourcePaths]).split('\0').filter(Boolean),integrity=[];
 for(const entry of entries){
  const [metadata,file]=entry.split('\t'),[mode,type,sha]=metadata.split(' ');
  check(type==='blob'&&['100644','100755'].includes(mode),'Only regular source files are supported');
  const path=join(sourceRoot,file);check((await lstat(path)).isFile(),'Source file type mismatch');
  const bytes=await readFile(path),blob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  check(blob===sha,'Source bytes do not match target revision');integrity.push([file,hash(bytes)]);
 }
 check(!git(['ls-files','--others','--exclude-standard','--',...sourcePaths]).trim(),'Untracked source files are not allowed');
 // Ignored files must not silently enter the recursively copied app source tree.
 check(!git(['ls-files','--others','--','packages/web/src','packages/worker/src','packages/core/src']).trim(),'Unexpected files in source directories');
 return hash(JSON.stringify(integrity));
}
async function atomicBytes(file,bytes){
 const temp=file+'.'+randomUUID()+'.tmp',handle=await open(temp,'wx',0o600);
 try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 await rename(temp,file);await syncDirectories([dirname(file)]);
}
async function exclusiveBytes(file,bytes){
 const handle=await open(file,'wx',0o600);
 try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
}
async function validateCheckpoint(bytes,storageRoot){
 const state=parse(bytes);check(state.schemaVersion===1,'Unsupported checkpoint schema');revision(state.productionRevision);
 revision(state.repo.head);revision(state.active.commit);
 check(state.repo.buildJson.commit===state.active.commit,'Public checkpoint revision mismatch');
 await validateActive(state.active,join(storageRoot,'builds'),state.activeFiles);return state;
}
async function readTransaction(storageRoot,id){
 check(typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id),'Invalid upgrade receipt ID');
 const dir=join(storageRoot,'application-upgrades',id),meta=parse(await readFile(join(dir,'transaction.json'))),payload={};
 check(meta.id===id&&meta.schemaVersion===1,'Invalid transaction');
 for(const name of ['checkpoint.before','checkpoint.after','config.before','config.after']){
  payload[name]=await readFile(join(dir,name+'.json'));check(hash(payload[name])===meta.hashes[name],'Transaction backup hash mismatch');
 }
 return {dir,meta,payload};
}
async function compareCurrent(configPath,storageRoot,payload,side){
 for(const [name,file] of [['config',configPath],['checkpoint',join(storageRoot,'checkpoint.json')]]){
  const actual=hash(await readFile(file));
  const allowed=side?[hash(payload[name+'.'+side])]:['before','after'].map(s=>hash(payload[name+'.'+s]));
  check(allowed.includes(actual),'State or config changed; refuse to overwrite it');
 }
}
async function clearPending(storageRoot){await unlink(pendingPath(storageRoot));await syncDirectories([storageRoot]);}
async function restoreBefore(configPath,storageRoot,tx){
 check(tx.meta.configPath===configPath,'Recovery config path mismatch');
 await compareCurrent(configPath,storageRoot,tx.payload);
 await validateCheckpoint(tx.payload['checkpoint.before'],storageRoot);
 await atomicBytes(join(storageRoot,'checkpoint.json'),tx.payload['checkpoint.before']);
 await atomicBytes(configPath,tx.payload['config.before']);
 await compareCurrent(configPath,storageRoot,tx.payload,'before');
 await atomicJson(join(tx.dir,'receipt.json'),{...tx.meta.receipt,status:'recovered'});
 await clearPending(storageRoot);
 return {...tx.meta.receipt,status:'recovered'};
}
async function commitPair(configPath,storageRoot,payload,receipt){
 const id=randomUUID(),parent=join(storageRoot,'application-upgrades'),dir=join(parent,id);
 await mkdir(dir,{recursive:true,mode:0o700});
 for(const [name,bytes] of Object.entries(payload))await exclusiveBytes(join(dir,name+'.json'),bytes);
 const meta={schemaVersion:1,id,configPath,hashes:Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,hash(v)])),receipt:{schemaVersion:1,id,...receipt}};
 await atomicJson(join(dir,'transaction.json'),meta);
 await syncDirectories([dir,parent,storageRoot]);
 await compareCurrent(configPath,storageRoot,payload,'before');
 await atomicJson(pendingPath(storageRoot),{schemaVersion:1,id});
 const tx={dir,meta,payload};
 try{
  await atomicBytes(join(storageRoot,'checkpoint.json'),payload['checkpoint.after']);
  await atomicBytes(configPath,payload['config.after']);
  await compareCurrent(configPath,storageRoot,payload,'after');
  const result={...meta.receipt,status:'committed'};
  await atomicJson(join(dir,'receipt.json'),result);await clearPending(storageRoot);return result;
 }catch(error){
  // Recovery is idempotent. If storage is still failing, the journal remains and
  // startup fails closed until an operator runs --recover with storage repaired.
  await restoreBefore(configPath,storageRoot,tx);throw error;
 }
}

export async function upgradeApplication({configPath,fromRevision,toRevision,rollbackId,recover=false}){
 configPath=await realpath(resolve(configPath));
 const beforeConfig=await readFile(configPath),config=parse(beforeConfig);
 const storageRoot=await realpath(resolve(config.storageRoot));
 check(Number.isInteger(config.port)&&config.port>1024&&config.port<65536,'Invalid runtime port');
 const owner=await acquireServiceLock(storageRoot);
 try{
  if(recover){
   const pending=parse(await readFile(pendingPath(storageRoot)));
   check(pending.schemaVersion===1,'Invalid recovery journal');
   return await restoreBefore(configPath,storageRoot,await readTransaction(storageRoot,pending.id));
  }
  await assertNoApplicationTransaction(storageRoot);
  revision(fromRevision);check(config.productionRevision===fromRevision,'Runtime revision does not match --from');
  const beforeCheckpoint=await readFile(join(storageRoot,'checkpoint.json'));
  const previous=await validateCheckpoint(beforeCheckpoint,storageRoot);
  check(previous.productionRevision===fromRevision,'Checkpoint revision does not match --from');
  const siteUrl=`http://127.0.0.1:${config.port}/canteen/`;
  check(previous.siteUrl===siteUrl,'Runtime site URL does not match checkpoint');
  let afterCheckpoint,afterConfig,sourceDigest;
  if(rollbackId){
   const saved=await readTransaction(storageRoot,rollbackId);
   check(saved.meta.configPath===configPath,'Rollback config path mismatch');
   check(parse(await readFile(join(saved.dir,'receipt.json'))).status==='committed','Only a committed upgrade can be rolled back');
   await compareCurrent(configPath,storageRoot,saved.payload,'after');
   // Never erase a save/publication made after the upgrade; such a rollback needs
   // a fresh app build against the currently public data, not an old checkpoint.
   afterCheckpoint=saved.payload['checkpoint.before'];afterConfig=saved.payload['config.before'];
   const target=await validateCheckpoint(afterCheckpoint,storageRoot);
   check(target.repo.head===previous.repo.head&&target.active.commit===previous.active.commit,'Rollback must preserve both data heads');
   toRevision=target.productionRevision;
  }else{
   revision(toRevision);check(fromRevision!==toRevision,'Application revision is already current');
   sourceDigest=await verifySource(toRevision);
   const {createWorkflowPublicationFixture}=await import('../../packages/web/test/e2e/team-meals/workflow-publication-fixture.mjs');
   const prepared=await createWorkflowPublicationFixture({productionRevision:toRevision,applicationUpgradeFromRevision:fromRevision,siteUrl,storageRoot});
   check(sourceDigest===await verifySource(toRevision),'Source changed during build');
   afterCheckpoint=bytesOf(prepared.preparedCheckpoint);
   afterConfig=bytesOf({...config,productionRevision:toRevision});
  }
  const next=await validateCheckpoint(afterCheckpoint,storageRoot);
  check(JSON.stringify(next.repo)===JSON.stringify(previous.repo),'Application upgrade changed repository state');
  check(next.active.commit===previous.active.commit,'Application upgrade changed public head');
  check(parse(afterConfig).productionRevision===next.productionRevision,'Config/checkpoint revision mismatch');
  return await commitPair(configPath,storageRoot,{'checkpoint.before':beforeCheckpoint,'checkpoint.after':afterCheckpoint,'config.before':beforeConfig,'config.after':afterConfig},
   {operation:rollbackId?'rollback':'upgrade',fromRevision,toRevision,privateHead:previous.repo.head,publicHead:previous.active.commit,
    sourceDigest,artifactDigest:hash(JSON.stringify(next.activeFiles)),rolledBackReceipt:rollbackId});
 }finally{await owner.release();}
}
function argumentsOf(argv){
 const options={};
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];
  if(flag==='--recover'){check(!options.recover,'Duplicate flag');options.recover=true;continue;}
  const key={'--config':'configPath','--from':'fromRevision','--to':'toRevision','--rollback':'rollbackId'}[flag];
  check(key&&!options[key]&&argv[i+1]&&!argv[i+1].startsWith('--'),'Invalid upgrade arguments');options[key]=argv[++i];
 }
 check(options.configPath,'--config is required');
 check(options.recover?(!options.fromRevision&&!options.toRevision&&!options.rollbackId):Boolean(options.fromRevision&&Boolean(options.toRevision)!==Boolean(options.rollbackId)),'Choose --from/--to, --from/--rollback, or --recover');
 return options;
}
if(process.argv[1]&&pathToFileURL(await realpath(process.argv[1])).href===import.meta.url){
 try{
  // Vite/producer diagnostics are intentionally suppressed: stdout is a receipt
  // only, and failures never serialize arbitrary checkpoint/config assertion data.
  console.log=console.info=console.warn=console.error=()=>{};
  const receipt=await upgradeApplication(argumentsOf(process.argv.slice(2)));process.stdout.write(JSON.stringify(receipt)+'\n');
 }catch(error){
  if(error instanceof UpgradeRefusal)process.stderr.write(error.message+'\n');
  process.stderr.write('Application upgrade refused or failed; state was not acknowledged. If a pending transaction remains, stop the service and run --recover. Check fixed revisions, source, build prerequisites and private backups.\n');process.exitCode=1;
 }
}
