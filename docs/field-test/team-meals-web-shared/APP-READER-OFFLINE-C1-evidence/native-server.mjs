import {createRequire} from 'node:module';
import {readFile,writeFile,cp,mkdir,symlink,stat} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repo='/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-web-shared';
const web=repo+'/packages/web',head='3dd9db9d07ec8fdc67990ecbb77a0578f2dc2338';
const directory='/private/tmp/reader-offline-c1-native',port=60610;
const require=createRequire(web+'/package.json');
const {build}=await import(require.resolve('vite/package.json').replace('package.json','dist/node/index.js'));
const {publishedFixture}=await import(web+'/test/published-fixture.mjs');
await mkdir(directory,{recursive:true});
const snapshots={};
for(const version of ['a','b']) {
 const root=join(directory,version);await mkdir(root,{recursive:true});
 await cp(web+'/src',root+'/src',{recursive:true});await cp(web+'/public',root+'/public',{recursive:true});
 await cp(web+'/index.html',root+'/index.html');await symlink(web+'/node_modules',root+'/node_modules','dir');
 const fixture=publishedFixture('image-'+version);fixture.publish(root+'/public/data');
 await build({configFile:web+'/vite.config.ts',root,logLevel:'warn',build:{outDir:root+'/dist',emptyOutDir:true}});
 snapshots[version]={root:root+'/dist',revision:fixture.revision};fixture.cleanup();
}
const paths=execFileSync('git',['ls-tree','-r','--name-only',head,'packages/web/src'],{cwd:repo,encoding:'utf8'}).trim().split('\n');
const integrity=[];for(const p of [...paths,'packages/web/index.html']) {
 const fixed=execFileSync('git',['show',head+':'+p],{cwd:repo});const sha=createHash('sha256').update(fixed).digest('hex');
 for(const v of ['a','b']) {const local=await readFile(directory+'/'+v+'/'+p.slice('packages/web/'.length));if(!local.equals(fixed))throw new Error('Source drift '+v+':'+p);}
 integrity.push({path:p,sha256:sha});
}
await writeFile(directory+'/source-integrity.json',JSON.stringify({head,files:integrity},null,2));
await writeFile(directory+'/snapshots.json',JSON.stringify(snapshots,null,2));
const state={version:'a',available:true},requests=[];let seq=0;
const html=`<!doctype html><meta charset="utf-8"><title>Same-revision offline reader verification</title><h1>Exact production reader / native SW</h1><p>Unmodified application in frame. Network and external worker controls are outside SW scope.</p>
<button id="inspect">Capture current evidence</button><button id="offline">Disable app network</button><button id="onlineA">Serve A online</button><button id="onlineB">Serve B online</button><button id="check">Check real SW update</button><button id="activate">Activate waiting worker externally</button><button id="admin">Reload locked Admin</button><button id="menu">Open unopened Menu</button><button id="prep">Open Prep</button><button id="reload">Reload current document</button>
<pre id="result"></pre><iframe id="appframe" src="/canteen/#/admin" style="width:100%;height:650px"></iframe><script>
const f=document.querySelector('#appframe'),out=document.querySelector('#result');
async function snapshot(label){const w=f.contentWindow,reg=await w.navigator.serviceWorker.getRegistration(),cache=[];for(const name of await caches.keys()){const c=await caches.open(name);for(const req of await c.keys()){let body;const path=new URL(req.url).pathname;if(path.endsWith('/build.json')||path.includes('/team-meals/')){try{body=await (await c.match(req)).json();}catch{}}cache.push({cache:name,url:req.url,body});}}
const r={label,head:${JSON.stringify(head)},time:new Date().toISOString(),route:w.location.hash,boot:w.performance.timeOrigin,controller:!!w.navigator.serviceWorker.controller,worker:{active:reg?.active?.state,waiting:reg?.waiting?.state,installing:reg?.installing?.state},appText:w.document.querySelector('#app')?.textContent,executedJs:w.performance.getEntriesByType('resource').filter(x=>new URL(x.name).pathname.endsWith('.js')).map(x=>x.name),cache};const saved=await (await fetch('/__evidence',{method:'POST',body:JSON.stringify(r)})).json();out.textContent=JSON.stringify({...r,saved},null,2);}
async function control(p,label){await fetch('/__control',{method:'POST',body:JSON.stringify(p)});await snapshot(label);}
const bind=(id,fn)=>document.querySelector('#'+id).onclick=()=>Promise.resolve(fn()).catch(e=>out.textContent=String(e));
bind('inspect',()=>snapshot('inspect'));bind('offline',()=>control({available:false},'offline'));bind('onlineA',()=>control({available:true,version:'a'},'online-a'));bind('onlineB',()=>control({available:true,version:'b'},'online-b'));
bind('menu',()=>{f.contentWindow.location.hash='#/menu';});bind('prep',()=>{f.contentWindow.location.hash='#/prep';});bind('admin',()=>{f.src='/canteen/#/admin';});bind('reload',()=>f.contentWindow.location.reload());
bind('check',async()=>{const reg=await f.contentWindow.navigator.serviceWorker.getRegistration();await reg.update();await snapshot('update-requested');});
bind('activate',async()=>{const reg=await f.contentWindow.navigator.serviceWorker.getRegistration();if(!reg.waiting)throw Error('No waiting worker');reg.waiting.postMessage({type:'SKIP_WAITING'});});
</script>`;
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
createServer(async(req,res)=>{try {
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/inspect.html'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(u.pathname==='/__control'||u.pathname==='/__evidence') {let body='';for await(const part of req)body+=part;const input=JSON.parse(body);
  if(u.pathname==='/__control'){Object.assign(state,input);res.end('{}');return;}
  const file=String(++seq).padStart(2,'0')+'-'+input.label+'.json';await writeFile(directory+'/'+file,JSON.stringify({...input,state:{...state},requests:[...requests],snapshots},null,2));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({file}));return;
 }
 const entry={url:u.pathname+u.search,at:Date.now(),...state};requests.push(entry);await writeFile(directory+'/requests.json',JSON.stringify(requests,null,2));
 if(!state.available){entry.outcome='network-disabled';res.destroy();return;}
 if(req.method!=='GET'||!u.pathname.startsWith('/canteen/')){entry.status=404;res.writeHead(404);res.end();return;}
 const root=snapshots[state.version].root,file=resolve(root,decodeURIComponent(u.pathname.slice(9))||'index.html');
 if(!file.startsWith(root+'/')||!(await stat(file)).isFile()){entry.status=404;res.writeHead(404);res.end();return;}
 const bytes=await readFile(file);entry.status=200;res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(bytes);
 }catch(e){res.writeHead(404);res.end();}}).listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+port+'/inspect.html',head,snapshots})));
