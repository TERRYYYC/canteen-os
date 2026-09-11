/** Local-only reproducible producer → Vite/PWA → HTTP harness. No production config mutations. */
import {mkdtemp,cp,readFile,writeFile,mkdir,symlink,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname,join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {publishedFixture} from './published-fixture.mjs';
const web=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const entry=process.env.C2B_ENTRY??'harness';
if(!['harness','application'].includes(entry))throw new Error('Unknown test entry');
const directory=await mkdtemp(join(tmpdir(),'c2b-real-sw-'));
const html=(await readFile(join(web,entry==='application'?'index.html':'test/pwa-browser.html'),'utf8')).replaceAll('../src/','./src/');
const snapshots={};
for(const version of ['a','b']) {
 const root=join(directory,version);await mkdir(root);
 await cp(join(web,'src'),join(root,'src'),{recursive:true});
 await cp(join(web,'public'),join(root,'public'),{recursive:true});
 await symlink(join(web,'node_modules'),join(root,'node_modules'),'dir');
 await writeFile(join(root,'index.html'),html);
 const fixture=publishedFixture(`image-${version}`);
 fixture.publish(join(root,'public/data'));
 await build({configFile:join(web,'vite.config.ts'),root,logLevel:'warn',build:{outDir:join(root,'dist'),emptyOutDir:true}});
 snapshots[version]={root:join(root,'dist'),revision:fixture.revision};
 if(version==='a') {
  // Same commit, new build identity: the approved producer receives a different build time.
  const variantRoot=join(directory,'a-time');await cp(root,variantRoot,{recursive:true});
  fixture.publish(join(variantRoot,'public/data'),'September 12, 2026 00:00:00 GMT');
  await build({configFile:join(web,'vite.config.ts'),root:variantRoot,logLevel:'warn',build:{outDir:join(variantRoot,'dist'),emptyOutDir:true}});
  snapshots['a-time']={root:join(variantRoot,'dist'),revision:fixture.revision};
 }
 fixture.cleanup();
}
const stateFile=join(directory,'state.json');await writeFile(stateFile,JSON.stringify({version:'a',available:true}));
await writeFile(join(directory,'snapshots.json'),JSON.stringify(snapshots,null,2));
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
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
});
const port=Number(process.env.C2B_PORT??0);
if([3003,3004].includes(port))throw new Error('Reserved runtime port');
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}/canteen/`,entry,stateFile,snapshots})));
