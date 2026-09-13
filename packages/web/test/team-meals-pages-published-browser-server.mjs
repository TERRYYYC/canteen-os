/** D-only ephemeral browser fixture. Uses the approved A producer and C reader, never production. */
import {mkdtemp,readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';import {tmpdir} from 'node:os';import {join,resolve,extname} from 'node:path';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {pagesPublishedFixture as publishedFixture} from './team-meals-pages-published-fixture.mjs';
const require=createRequire(import.meta.url),esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')));
const root=await mkdtemp(join(tmpdir(),'d-published-browser-')),meta={};
for(const name of ['multi-dish','multi-row','normal','image-a','image-b','quantity-warning','external-image','empty-plan','no-plans']){const fixture=publishedFixture(name);await mkdir(join(root,'fixtures',name),{recursive:true});fixture.publish(join(root,'fixtures',name,'data'));meta[name]={revision:fixture.revision,builtAt:fixture.manifest.builtAt,source:'publishedFixture → approved runBuild; isolated local Git fixture'};fixture.cleanup();}
const html=await readFile(new URL('./team-meals-pages-published-browser.html',import.meta.url),'utf8'),script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
await esbuild.build({stdin:{contents:script,resolveDir:new URL('.',import.meta.url).pathname},bundle:true,outfile:join(root,'browser.js'),format:'esm',platform:'browser',define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
await writeFile(join(root,'index.html'),html.replace(/<script type="module">[\s\S]*?<\/script>/,'<link rel="stylesheet" href="/browser.css"><script type="module" src="/browser.js"></script>'));
await writeFile(join(root,'fixture-meta.json'),JSON.stringify(meta));
const sourceHashes={};for(const file of ['../src/pages/menu.ts','../src/pages/prep.ts','../src/pages/published-meals.ts','./team-meals-pages-published-browser.html','./team-meals-pages-published-fixture.mjs'])sourceHashes[file]=createHash('sha256').update(await readFile(new URL(file,import.meta.url))).digest('hex');await writeFile(join(root,'source-hashes.json'),JSON.stringify(sourceHashes));
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=resolve(root,decodeURIComponent(url.pathname).slice(1)||'index.html');if(req.method!=='GET'||!file.startsWith(root+'/')||!(await stat(file)).isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
const port=Number(process.env.D_PUBLIC_PORT??4220);if([3003,3004,6399].includes(port))throw new Error('Reserved port');
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}/`,root,meta})));
