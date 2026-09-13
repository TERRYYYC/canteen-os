// Local test transport only: serves an already built application without changing its files.
import {createServer} from 'node:http';
import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {resolve,extname,join,basename} from 'node:path';
const dist=resolve(process.argv[2]||'');
const evidence=resolve(process.argv[3]||'');
if(!process.argv[2]||!process.argv[3])throw Error('Provide fixed dist and separate evidence directory');
await stat(join(dist,'index.html'));await mkdir(evidence,{recursive:true});
const stateFile=join(evidence,'transport-state.json'),requestsFile=join(evidence,'transport-requests.json');
try{await stat(stateFile);}catch{await writeFile(stateFile,JSON.stringify({mode:'pass',optional:[]}));}
const requests=[];let serial=0;let writeChain=Promise.resolve();
function journal(){const snapshot=JSON.stringify(requests,null,2)+'\n';writeChain=writeChain.then(()=>writeFile(requestsFile,snapshot));}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 const row={id:++serial,url:req.url,method:req.method,destination:req.headers['sec-fetch-dest']||'',startedAt:Date.now(),status:'pending'};requests.push(row);journal();
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method!=='GET'||!url.pathname.startsWith('/canteen/')){res.writeHead(404);res.end();row.status=404;return;}
  const relative=decodeURIComponent(url.pathname.slice('/canteen/'.length))||'index.html';
  const file=resolve(dist,relative);
  if(!file.startsWith(dist+'/')||!(await stat(file)).isFile()){res.writeHead(404);res.end();row.status=404;return;}
  let state=JSON.parse(await readFile(stateFile,'utf8'));
  const selected=()=>Array.isArray(state.optional)&&state.optional.includes(relative);
  if(selected()){
   row.selected=true;row.initialMode=state.mode;journal();
   while(state.mode==='hold'&&!res.destroyed){await pause(40);state=JSON.parse(await readFile(stateFile,'utf8'));}
   if(res.destroyed){row.status='aborted';return;}
   if(state.mode==='fail'){res.writeHead(503,{'Content-Type':'application/javascript','Cache-Control':'no-store'});res.end('/* Deliberate local module transport failure. */');row.status=503;return;}
  }
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);row.status=200;row.bytes=bytes.length;
 }catch(error){if(!res.headersSent)res.writeHead(404);res.end();row.status=404;row.error=String(error);}
 finally{row.endedAt=Date.now();journal();}
});
server.listen(0,'127.0.0.1',()=>process.stdout.write(JSON.stringify({url:`http://127.0.0.1:${server.address().port}/canteen/`,dist,stateFile,requestsFile})+'\n'));
