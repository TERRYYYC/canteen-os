/** Explicit LOCAL TEST ONLY origin. No real GitHub/Actions/Pages writes. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,realpath,rm,stat} from 'node:fs/promises';
import {join,resolve,dirname,basename,extname} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createWorkflowPublicationFixture} from './workflow-publication-fixture.mjs';
import {collectAcceptanceIntegrity,sha256} from './acceptance-integrity.mjs';
import {WORKER} from '../../../../worker/test/helpers.mjs';
import {bodyOf,workerRequest} from '../../../../../scripts/remote-test/http-adapter.mjs';
import {atomicJson} from '../../../../../scripts/remote-test/state.mjs';
import {acquireServiceLock,assertNoApplicationTransaction} from '../../../../../scripts/remote-test/service-lock.mjs';
const sourceRoot=fileURLToPath(new URL('../../../../../',import.meta.url));
const ownerFile='.canteen-w5-owner.json';
const actor='Engineering acceptance test actor / isolated copy; no real chef approval';
const boundary='LOCAL: actual Worker, formal producer, Vite and SW; GitHub/Actions/Pages modeled; no remote publication';
const forbiddenPorts=new Set([3003,3004,4275,4388,4391,6398,6399]);

export function validateAcceptanceConfig(config){
 assert.ok(config.testOnlyLocal===true,'explicit test-only local opt-in required');
 assert.ok(config.schemaVersion===1,'acceptance config version required');
 assert.ok(Number.isInteger(config.port)&&config.port>1024&&config.port<65536&&!forbiddenPorts.has(config.port),'unsafe acceptance port');
 assert.ok(/^[a-f0-9]{40}$/.test(config.productionRevision),'fixed full application revision required');
 assert.ok(['empty','legacy-demo'].includes(config.seedMode),'explicit seed mode required');
 assert.ok(typeof config.allowRollback==='boolean','explicit rollback boolean required');
 assert.ok(config.knowledgeBaseUrl===undefined||config.knowledgeBaseUrl==='http://127.0.0.1:4392','acceptance KB must use isolated loopback 4392');
 assert.ok(Boolean(config.knowledgeBaseUrl)===Boolean(config.knowledgeSource),'KB URL and pinned source must be configured together');
 for(const role of ['chef','buyer','admin'])assert.ok(/^[a-zA-Z0-9_-]{43}$/.test(config.tokens?.[role]),'random private role config required');
 assert.equal(new Set(Object.values(config.tokens)).size,3,'roles must be distinct');
 assert.ok(typeof config.scratchRoot==='string'&&typeof config.scratchParent==='string'&&typeof config.ownerId==='string','owned scratch config required');
 return config;
}

export async function initializeAcceptance({scratchParent,productionRevision,port=4398,seedMode,testOnlyLocal,allowRollback=false,knowledgeSource,knowledgeBaseUrl}){
 assert.ok(testOnlyLocal===true,'explicit test-only local opt-in required');
 await mkdir(scratchParent,{recursive:true});scratchParent=await realpath(scratchParent);
 const scratchRoot=await mkdtemp(join(scratchParent,'canteen-w5-'));
 const config={schemaVersion:1,testOnlyLocal:true,allowRollback,productionRevision,port,seedMode,scratchParent,scratchRoot,ownerId:randomUUID(),tokens:Object.fromEntries(['chef','buyer','admin'].map(role=>[role,randomBytes(32).toString('base64url')])),...(knowledgeSource?{knowledgeSource,knowledgeBaseUrl}:{}),actor};
 try{
  validateAcceptanceConfig(config);
  await writeFile(join(scratchRoot,ownerFile),JSON.stringify({schemaVersion:1,ownerId:config.ownerId,scratchRoot,scratchParent}),{mode:0o600,flag:'wx'});
  const configPath=join(scratchRoot,'private-config.json');await writeFile(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {config,configPath};
 }catch(error){await rm(scratchRoot,{recursive:true});throw error;}
}

export async function assertOwnedScratch(config){
 validateAcceptanceConfig(config);
 const root=resolve(config.scratchRoot),parent=await realpath(config.scratchParent);
 assert.ok(dirname(root)===parent&&basename(root).startsWith('canteen-w5-'),'owned scratch root required');
 const info=await lstat(root);assert.ok(info.isDirectory()&&!info.isSymbolicLink(),'owned scratch must be a real directory');
 assert.equal(await realpath(root),root,'owned scratch path cannot be aliased');
 const marker=join(root,ownerFile),markerInfo=await lstat(marker);assert.ok(markerInfo.isFile()&&!markerInfo.isSymbolicLink(),'owned scratch marker required');
 const owner=JSON.parse(await readFile(marker,'utf8'));
 assert.ok(owner.schemaVersion===1&&owner.ownerId===config.ownerId&&owner.scratchRoot===root&&owner.scratchParent===parent,'owned scratch identity mismatch');
 return root;
}

export async function readAcceptanceConfig(configPath){
 const info=await lstat(configPath);assert.ok(info.isFile()&&!info.isSymbolicLink()&&(info.mode&0o777)===0o600,'private config must be owner 0600 regular file');
 const config=JSON.parse(await readFile(configPath,'utf8'));await assertOwnedScratch(config);
 assert.equal(resolve(configPath),join(config.scratchRoot,'private-config.json'),'config must belong to owned scratch');return config;
}

export async function cleanupAcceptance(config){
 const root=await assertOwnedScratch(config);
 try{
  const owner=JSON.parse(await readFile(join(root,'service.lock/owner.json'),'utf8'));
  try{process.kill(owner.pid,0);throw new Error('Owned service is active; stop it before scratch cleanup');}
  catch(e){if(e.code!=='ESRCH')throw e;}
 }catch(e){if(e.code!=='ENOENT')throw e;}
 // Only this mkdtemp root is removed. KB source, copied DB, backups and media are never cleanup targets.
 await rm(root,{recursive:true});return {removed:root};
}

export async function createAcceptanceHarness(config){
 await assertOwnedScratch(config);
 await collectAcceptanceIntegrity({sourceRoot,productionRevision:config.productionRevision,knowledgeSource:config.knowledgeSource});
 const origin=`http://127.0.0.1:${config.port}`,storageRoot=join(config.scratchRoot,'state');
 await assertNoApplicationTransaction(storageRoot);
 const f=await createWorkflowPublicationFixture({productionRevision:config.productionRevision,siteUrl:origin+'/canteen/',storageRoot,seedMode:config.seedMode});
 const worker=(await import(WORKER)).default,receipts=[];
 const inheritedFetch=f.env.__fetch;
 if(config.knowledgeBaseUrl)f.env.KNOWLEDGE_BASE_URL=config.knowledgeBaseUrl;
 f.env.__fetch=(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url);
  if(config.knowledgeBaseUrl&&url.origin===config.knowledgeBaseUrl)return fetch(input,init);
  return inheritedFetch(input,init);
 };
 for(const role of ['chef','buyer','admin'])f.env[`TOKEN_HASH_${role.toUpperCase()}`]=sha256(config.tokens[role]);
 f.env.__log=()=>{};f.env.__now=Date.now;f.env.ALLOWED_ORIGIN=origin;
 async function saveEvidence(){
  await f.saveState();
  const integrity=await collectAcceptanceIntegrity({sourceRoot,productionRevision:config.productionRevision,dist:f.active.dist,knowledgeSource:config.knowledgeSource});
  await atomicJson(join(config.scratchRoot,'integrity.json'),integrity);
  await atomicJson(join(config.scratchRoot,'receipts.json'),{schemaVersion:1,boundary,actor,productionRevision:config.productionRevision,seedMode:config.seedMode,privateHead:f.repo.head,publicHead:f.active.commit,receipts});
  return integrity;
 }
 async function request(method,path,{headers={},body,raw}={}){
  assert.ok(path.startsWith('/')&&!path.startsWith('//')&&!path.includes('#'),'literal Worker path required');
  const requestUrl=new URL(path,'https://worker.example.invalid');assert.equal(requestUrl.origin,'https://worker.example.invalid');
  const startedAt=new Date().toISOString(),before=f.repo.head,writesBefore=f.repo.writeCalls().length;
  if(path.startsWith('/rollback')&&!config.allowRollback)return {status:403,body:{error:'rollback_requires_explicit_local_opt_in'}};
  const h=new Headers(headers),bytes=raw??(body===undefined?undefined:JSON.stringify(body));
  if(body!==undefined&&!h.has('content-type'))h.set('content-type','application/json');
  const response=await worker.fetch(new Request('https://worker.example.invalid'+path,{method,headers:h,body:bytes}),f.env);
  const output=Buffer.from(await response.arrayBuffer());let parsed;
  if(response.headers.get('content-type')?.includes('application/json'))try{parsed=JSON.parse(output);}catch{}
  const receipt={method,path:requestUrl.pathname,status:response.status,startedAt,requestId:response.headers.get('x-request-id')??parsed?.requestId??null,ifMatch:h.get('if-match'),before,after:f.repo.head,modelWrites:f.repo.writeCalls().length-writesBefore,responseSha256:sha256(output),...(parsed?.commit?{commit:parsed.commit}:{}),...(parsed?.runId?{runId:parsed.runId}:{}),...(parsed?.errors?.[0]?.code?{errorCode:parsed.errors[0].code}:{})};
  receipts.push(receipt);
  // Never retain request/response bodies, role tokens, auth headers or upstream logs.
  await saveEvidence();f.repo.calls.length=0;
  return {status:response.status,body:parsed,output,headers:response.headers};
 }
 await saveEvidence();
 return {...f,config,origin,receipts,request,saveEvidence,get active(){return f.active;},async complete(id){const result=await f.complete(id);await saveEvidence();return result;}};
}

export async function startAcceptanceServer(config){
 const root=await assertOwnedScratch(config),owner=await acquireServiceLock(join(root,'state'));
 let f;try{f=await createAcceptanceHarness(config);}catch(e){await owner.release();throw e;}
 const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
 const send=(res,body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 let chain=Promise.resolve(),stopping=false;
 const enqueue=work=>{const result=chain.then(work);chain=result.catch(()=>{});return result;};
 const server=createServer(async(req,res)=>{
  try{
   if(stopping){send(res,{error:'service_stopping'},503);return;}
   if(req.headers.host!==new URL(f.origin).host||(req.headers.origin&&req.headers.origin!==f.origin)){send(res,{error:'local_origin_required'},403);return;}
   const bytes=await bodyOf(req,f.origin);
   await enqueue(async()=>{
    const url=new URL(req.url,f.origin);
    if(url.pathname==='/_test/status'&&req.method==='GET'){send(res,{boundary,actor,productionRevision:config.productionRevision,seedMode:config.seedMode,privateHead:f.repo.head,publicHead:f.active.commit,knowledgeBase:config.knowledgeSource?'pinned-source; verify upstream process separately':'not-configured'});return;}
    if(url.pathname.startsWith('/__q/worker/')){
     const adapted=workerRequest(req,f.origin,bytes);
     const result=await f.request(req.method,url.pathname.slice('/__q/worker'.length)+url.search,{headers:adapted.headers,raw:bytes.length?bytes:undefined});
     if(!result.output){send(res,result.body,result.status);return;}
     res.writeHead(result.status,{...Object.fromEntries(result.headers),'Cache-Control':'no-store'});res.end(result.output);
     if(req.method==='POST'&&url.pathname==='/__q/worker/publish'&&result.status===200&&result.body?.runId)void enqueue(()=>f.complete(result.body.runId));
     return;
    }
    if(req.method!=='GET'||!url.pathname.startsWith('/canteen/')){send(res,{error:'not_found'},404);return;}
    const relative=decodeURIComponent(url.pathname.slice('/canteen/'.length))||'index.html',dist=f.active.dist,file=resolve(dist,relative);
    if(relative.includes('\0')||!file.startsWith(dist+'/')){send(res,{error:'not_found'},404);return;}
    let info;try{info=await stat(file);}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}
    if(!info?.isFile()){send(res,{error:'not_found'},404);return;}
    res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
   });
  }catch(e){if(!res.headersSent)send(res,{error:e.status===413?'body_too_large':'local_harness_error'},e.status??500);else res.end();}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 try{await new Promise((yes,no)=>{server.once('error',no);server.listen(config.port,'127.0.0.1',yes);});}catch(e){await owner.release();throw e;}
 return {server,f,summary:{url:f.origin+'/canteen/',configPath:join(root,'private-config.json'),boundary,actor,productionRevision:config.productionRevision},async stop(){stopping=true;await new Promise(resolve=>server.close(resolve));await chain;await f.saveEvidence();await owner.release();}};
}
