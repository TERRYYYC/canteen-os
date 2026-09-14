/** Loopback-only durable test hosting. GitHub and Actions remain modeled locally. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,rm,stat} from 'node:fs/promises';
import {resolve,join,extname,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createWorkflowPublicationFixture} from '../../packages/web/test/e2e/team-meals/workflow-publication-fixture.mjs';
import {WORKER} from '../../packages/worker/test/helpers.mjs';
import {hash} from './state.mjs';
const config=JSON.parse(await readFile(process.env.CANTEEN_TEST_CONFIG,'utf8'));
const {port,productionRevision,tokens}=config;
assert.ok(Number.isInteger(port)&&port>1024&&port<65536&&!new Set([3003,3004,4275,6398,6399]).has(port));
assert.match(productionRevision,/^[a-f0-9]{40}$/);
for(const role of ['chef','buyer','admin'])assert.match(tokens[role],/^[a-zA-Z0-9_-]{40,}$/);
assert.equal(new Set(Object.values(tokens)).size,3);
const storageRoot=resolve(config.storageRoot),origin=`http://127.0.0.1:${port}`,lock=join(dirname(storageRoot),'service.lock');
await mkdir(dirname(storageRoot),{recursive:true});
const bootId=randomUUID();
const recordOwner=()=>writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,bootId}),{mode:0o600});
try{await mkdir(lock);await recordOwner();}catch(error){
 if(error.code!=='EEXIST')throw error;
 // Serialize stale-owner recovery. A crash in this tiny section fails closed,
 // requiring an operator to inspect/remove recovery.lock; it never steals a live lock.
 const recovery=lock+'.recovery';await mkdir(recovery);
 try{
  const owner=JSON.parse(await readFile(join(lock,'owner.json'),'utf8'));assert.ok(Number.isSafeInteger(owner.pid)&&owner.pid>0);
  try{process.kill(owner.pid,0);throw new Error('A test service already owns this directory');}
  catch(e){if(e.code!=='ESRCH')throw e;}
  await rm(lock,{recursive:true});await mkdir(lock);await recordOwner();
 }finally{await rm(recovery,{recursive:true});}
}
const f=await createWorkflowPublicationFixture({productionRevision,siteUrl:origin+'/canteen/',storageRoot});
const worker=(await import(WORKER)).default;
for(const role of ['chef','buyer','admin'])f.env[`TOKEN_HASH_${role.toUpperCase()}`]=hash(tokens[role]);
f.env.__log=()=>{};f.env.__now=Date.now;f.env.__sleep=ms=>new Promise(r=>setTimeout(r,ms));f.env.ALLOWED_ORIGIN=origin;
let chain=Promise.resolve(),stopping=false;
const fatal=error=>{console.error('Test service stopped before acknowledging an uncheckpointed change:',error);process.exit(1);};
function enqueue(work){const next=chain.then(work);chain=next.catch(fatal);return next;}
const json=(res,body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const forwardHeaders=['authorization','content-type','content-length','if-match','if-none-match','x-image-license','x-image-author','x-image-source-url','x-image-name'];
async function bodyOf(req){
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>256*1024){const e=new Error('Request body exceeds limit');e.status=413;throw e;}chunks.push(chunk);}
 return Buffer.concat(chunks);
}
async function handle(req,res,bytes){
 let url;try{url=new URL(req.url,origin);}catch{json(res,{error:'invalid_url'},400);return;}
 if(req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin)){json(res,{error:'local_origin_required'},403);return;}
 if(url.pathname==='/_test/status'&&req.method==='GET'){
  json(res,{schemaVersion:1,version:'0.3.0-alpha.1',productionRevision,bootId,pid:process.pid,privateHead:f.repo.head,publicHead:f.active.commit,
   boundary:'Remote-hosted test model: actual Worker, formal producer and Vite production build; GitHub/Actions/Pages modeled, no live external writes',fixtureNotice:f.fixtureNotice});return;
 }
 if(url.pathname.startsWith('/__q/worker/')){
  const path=url.pathname.slice('/__q/worker'.length);
  if(path.startsWith('/rollback')){json(res,{error:'rollback_not_enabled_in_test_model'},403);return;}
  const headers=new Headers();for(const h of forwardHeaders)if(req.headers[h])headers.set(h,req.headers[h]);
  let response;
  try{response=await worker.fetch(new Request('https://worker.example.invalid'+path+url.search,{method:req.method,headers,body:bytes.length?bytes:undefined}),f.env);}
  catch(error){json(res,{error:'invalid_request'},400);return;}
  const output=Buffer.from(await response.arrayBuffer());
  // All responses and static reads share this queue: no unsaved active pointer is observable.
  if(!['GET','HEAD','OPTIONS'].includes(req.method))await f.saveState();
  res.writeHead(response.status,{...Object.fromEntries(response.headers),'Cache-Control':'no-store'});res.end(output);
  if(path==='/publish'&&req.method==='POST'&&response.ok){
   const {runId}=JSON.parse(output);if(runId)setImmediate(()=>enqueue(async()=>{await f.complete(runId);await f.saveState();}));
  }
  f.repo.calls.length=0;
  return;
 }
 if(url.pathname==='/'&&req.method==='GET'){res.writeHead(302,{Location:'/canteen/'});res.end();return;}
 if(req.method!=='GET'||!url.pathname.startsWith('/canteen/')){json(res,{error:'not_found'},404);return;}
 let relative;try{relative=decodeURIComponent(url.pathname.slice('/canteen/'.length))||'index.html';}catch{json(res,{error:'invalid_path'},400);return;}
 const root=f.active.dist,file=resolve(root,relative);
 if(!file.startsWith(root+'/')){json(res,{error:'not_found'},404);return;}
 let info;try{info=await stat(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!info?.isFile()){json(res,{error:'not_found'},404);return;}
 res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
}
const server=createServer(async(req,res)=>{
 if(stopping){json(res,{error:'service_stopping'},503);return;}
 let bytes;try{bytes=await bodyOf(req);}catch(error){if(!res.destroyed)json(res,{error:'body_limit_or_read_error'},error.status??400);return;}
 void enqueue(()=>handle(req,res,bytes));
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.on('error',fatal);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 if(stopping)return;stopping=true;server.close();
 void chain.then(async()=>{await rm(lock,{recursive:true});process.exit(0);}).catch(fatal);
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'ready',port,productionRevision,bootId,pid:process.pid,boundary:'persistent local test model'})));
