import {createServer} from 'node:http';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=process.argv[2]||'/private/tmp/app-bundle-c1-build',port=Number(process.argv[3]||60603),state=process.argv[4]||'/private/tmp/app-bundle-c1-inspect-state.json';
await writeFile(state,JSON.stringify({available:true}));
const graph=JSON.parse(await readFile(root+'/bundle-attribution-final.json','utf8'));
const expected=graph.map(x=>'/canteen/'+x.file);
const html=`<!doctype html><meta charset="utf-8"><title>Exact build route and offline inspection</title><h1>Local exact-build inspection</h1><p>Unmodified production output in iframe; diagnostic outside SW scope.</p><button id="inspect">Snapshot execution and cache</button><button id="menu">Open previously unopened Menu</button><button id="qr">Open previously unopened QR</button><pre id="result"></pre><iframe id="appframe" src="/canteen/#/prep" style="width:100%;height:650px"></iframe><script>
const frame=document.querySelector('#appframe'),out=document.querySelector('#result'),expected=${JSON.stringify(expected)};
const history=[];
async function snapshot(){const win=frame.contentWindow,keys=[];for(const name of await caches.keys()){const cache=await caches.open(name);for(const req of await cache.keys())keys.push(new URL(req.url).pathname);}
const r={route:win.location.hash,title:win.document.title,controller:!!win.navigator.serviceWorker.controller,executedJs:[...new Set(win.performance.getEntriesByType('resource').filter(x=>new URL(x.name).pathname.endsWith('.js')).map(x=>new URL(x.name).pathname))].sort(),expectedJs:expected,cachedJs:keys.filter(x=>expected.includes(x)),missingJs:expected.filter(x=>!keys.includes(x)),appText:win.document.querySelector('#app').textContent};history.push(r);out.textContent=JSON.stringify({history},null,2);}
document.querySelector('#inspect').onclick=snapshot;document.querySelector('#menu').onclick=()=>{frame.contentWindow.location.hash='#/menu';setTimeout(snapshot,1000);};document.querySelector('#qr').onclick=()=>{frame.contentWindow.location.hash='#/qr';setTimeout(snapshot,1000);};
</script>`;
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/inspect.html'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(!JSON.parse(await readFile(state)).available){res.destroy();return;}
if(req.method!=='GET'||!u.pathname.startsWith('/canteen/')){res.writeHead(404);res.end();return;}const file=resolve(root,u.pathname.slice(9)||'index.html');if(!file.startsWith(root+'/')||!(await stat(file)).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+'/inspect.html'));
