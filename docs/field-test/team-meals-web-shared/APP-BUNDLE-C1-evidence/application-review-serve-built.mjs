/** Local-only reproducible producer → Vite/PWA → HTTP harness. No production config mutations. */
import {mkdtemp,cp,readFile,writeFile,mkdir,symlink,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname,join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {publishedFixture} from './published-fixture.mjs';
import {runBuild} from '../../../scripts/build-data.mjs';
const entry='application';
const directory='/private/tmp/c2b-real-sw-qBlvES';
const stateFile=join(directory,'state.json');
const snapshots=JSON.parse(await readFile(join(directory,'snapshots.json'),'utf8'));
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const requestHandler=async(req,res)=>{
 try {
  const state=JSON.parse(await readFile(stateFile,'utf8'));
  const url=new URL(req.url,'http://localhost');
  if(!state.available){res.destroy();return;}
  if(req.method!=='GET'||!url.pathname.startsWith('/canteen/')){res.writeHead(404);res.end();return;}
  const name=decodeURIComponent(url.pathname.slice('/canteen/'.length))||'index.html';
  const root=snapshots[state.version]?.root;
  const file=resolve(root,name);
  if(!file.startsWith(`${root}/`)||!(await stat(file)).isFile()){res.writeHead(404);res.end();return;}
  const bytes=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 } catch {res.writeHead(404);res.end();}
};
const ports=(process.env.C2B_PORTS??process.env.C2B_PORT??'0').split(',').map(Number);
for(const port of ports){if([3003,3004].includes(port))throw new Error('Reserved runtime port');const server=createServer(requestHandler);server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}/canteen/`,entry,stateFile,snapshots})));}
