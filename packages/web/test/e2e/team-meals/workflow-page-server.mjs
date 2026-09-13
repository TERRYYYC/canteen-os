/** New, explicit Q origin. Old page-server publish/rollback guards are untouched. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWorkflowPublicationFixture} from './workflow-publication-fixture.mjs';
import {WORKER,TOKENS} from '../../../../worker/test/helpers.mjs';
const port=Number(process.env.RCQ_WORKFLOW_PORT??4279);
assert.ok(Number.isInteger(port)&&port>1024&&!new Set([3003,3004,6398,6399,4275,4277,4278]).has(port));
const origin=`http://127.0.0.1:${port}`,siteUrl=origin+'/canteen/';
const f=await createWorkflowPublicationFixture({productionRevision:process.env.RCQ_FIXED_PRODUCTION,siteUrl,cacheDiagnostics:process.env.RCQ_CACHE_DIAGNOSTICS==='1'});
const worker=(await import(WORKER)).default,rows=[],controls=[],reads=[];
const repoRoot=fileURLToPath(new URL('../../../../../',import.meta.url));
const qHead=execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim();
const ledgerPath=join(f.buildRoot,'ledger.json');let chain=Promise.resolve(),available=true,hold=null,drop=null,release=true;
const json=v=>JSON.stringify(v,null,2)+'\n';
const persist=()=>{const bytes=json({qHead,fixture:f.record(),rows,controls,reads,head:f.repo.head,githubCalls:f.repo.calls});chain=chain.then(()=>writeFile(ledgerPath,bytes));return chain;};
const send=(res,body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(json(body));};
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const diagnostics=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Q local production diagnostics</title><h1>Q local production diagnostics — outside the app SW scope</h1><p>Actual unmodified app and generated SW. Workflow/hosting and availability are local test controls. No remote publication.</p><button id="open">Open production app</button><button id="inspect">Inspect actual SW state</button><button id="update">Request actual registration.update()</button><button id="cache">Read actual cache bodies</button><pre id="state"></pre><details><summary>Cache bodies</summary><pre id="bodies"></pre></details><script>
let appWindow,lastDocument,documents=0;
const text=(id,v)=>document.getElementById(id).textContent=JSON.stringify(v,null,2);
async function inspect(){const r=await navigator.serviceWorker.getRegistration('/canteen/');let app;try{if(appWindow&&!appWindow.closed){if(lastDocument!==appWindow.document){lastDocument=appWindow.document;documents++;}const c=appWindow.navigator.serviceWorker.controller;app={url:appWindow.location.href,controller:c?{scriptURL:c.scriptURL,state:c.state}:null,documents};}}catch(e){app={error:String(e)}}text('state',{scope:r?.scope,active:r?.active?{url:r.active.scriptURL,state:r.active.state}:null,waiting:r?.waiting?{url:r.waiting.scriptURL,state:r.waiting.state}:null,installing:r?.installing?.state,app,caches:await caches.keys()});}
document.getElementById('open').onclick=()=>{appWindow=window.open('/canteen/#/admin/t/${TOKENS.chef}/publish','rcq-production-app');inspect();};
document.getElementById('inspect').onclick=inspect;
document.getElementById('update').onclick=async()=>{const r=await navigator.serviceWorker.getRegistration('/canteen/');if(r)await r.update();await inspect();};
document.getElementById('cache').onclick=async()=>{const records=[];for(const name of await caches.keys()){const c=await caches.open(name);for(const req of await c.keys()){if(!/\\/data\\//.test(req.url))continue;const response=await c.match(req),bytes=await response.arrayBuffer();const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');records.push({cache:name,url:req.url,status:response.status,sha256:sha,...(response.headers.get('content-type')?.includes('json')?{body:JSON.parse(new TextDecoder().decode(bytes))}:{bytes:bytes.byteLength})});}}text('bodies',records);await inspect();};
setInterval(inspect,1000);inspect();</script></html>`;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(url.pathname==='/__q/diagnostics'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(diagnostics);return;}
 if(url.pathname==='/__q/evidence'&&req.method==='GET'){await persist();send(res,{ledgerPath,...JSON.parse(await readFile(ledgerPath,'utf8'))});return;}
 if(url.pathname==='/__q/control'&&req.method==='POST'){
  if(req.headers['x-rcq-control']!=='1'||req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin)){send(res,{error:'local_control_required'},403);return;}
  const chunks=[];for await(const b of req)chunks.push(b);const action=JSON.parse(Buffer.concat(chunks));controls.push(action);
  if(action.action==='availability')available=action.available===true;
  else if(action.action==='hold-next'){hold=action.path;release=false;}
  else if(action.action==='drop-next')drop=action.path;
  else if(action.action==='release')release=true;
  else if(action.action==='stage-cache-update')await f.stageCacheUpdate();
  else {send(res,{error:'unknown_control'},400);return;}
  await persist();send(res,{ok:true,active:f.active.commit,available});return;
 }
 if(!available){reads.push({path:url.pathname,search:url.search,available:false});void persist();res.destroy();return;}
 if(url.pathname.startsWith('/__q/worker/')){
  const path=url.pathname.slice('/__q/worker'.length);
  if(path.startsWith('/rollback')){send(res,{error:'rollback_not_enabled_in_this_fixture'},403);return;}
  const chunks=[];for await(const b of req)chunks.push(b);const bytes=Buffer.concat(chunks),headers=new Headers();
  for(const h of ['authorization','content-type','if-match','if-none-match'])if(req.headers[h])headers.set(h,req.headers[h]);
  const row={id:rows.length+1,method:req.method,path,search:url.search,ifMatch:headers.get('if-match'),ifNoneMatch:headers.get('if-none-match'),body:bytes.length?JSON.parse(bytes):undefined};rows.push(row);await persist();
  const result=await worker.fetch(new Request('https://worker.example.invalid'+path+url.search,{method:req.method,headers,body:bytes.length?bytes:undefined}),f.env);
  const output=Buffer.from(await result.arrayBuffer());Object.assign(row,{status:result.status,response:JSON.parse(output),head:f.repo.head});await persist();
  if(hold===path&&req.method==='POST'){hold=null;row.held=true;await persist();while(!release&&!res.destroyed)await new Promise(r=>setTimeout(r,30));row.released=true;}
  if(drop===path&&req.method==='POST'&&result.ok){drop=null;row.dropped=true;await persist();res.destroy();return;}
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(output);
  if(path==='/publish'&&req.method==='POST'&&result.ok&&row.response.runId)void f.complete(row.response.runId).then(persist);
  return;
 }
 if(req.method!=='GET'||!url.pathname.startsWith('/canteen/')){send(res,{error:'not_found'},404);return;}
 const relative=decodeURIComponent(url.pathname.slice('/canteen/'.length))||'index.html',root=f.active.dist,file=resolve(root,relative);
 if(!file.startsWith(root+'/')||!(await stat(file)).isFile()){send(res,{error:'not_found'},404);return;}
 const bytes=await readFile(file);reads.push({path:url.pathname,search:url.search,commit:f.active.commit,sha256:createHash('sha256').update(bytes).digest('hex')});void persist();
 res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch(error){if(!res.headersSent)send(res,{error:String(error)},500);else res.end();}});
server.listen(port,'127.0.0.1',async()=>{await persist();console.log(json({url:siteUrl,diagnostics:origin+'/__q/diagnostics',qHead,ledgerPath,productionRevision:process.env.RCQ_FIXED_PRODUCTION,fixtureRoot:f.root,buildRoot:f.buildRoot,boundary:'Actual production app/SW and Worker; GitHub workflow/hosting/availability modeled locally; no remote writes'}));});
