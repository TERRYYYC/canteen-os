/** Real main/pages and real Worker, loopback only. Run with the approved Node 20. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,cp,symlink,stat} from 'node:fs/promises';
import {mkdtempSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createPageFixture,currentFiles,json,fixedAt} from './page-fixture.mjs';
import {WORKER,TOKENS} from '../../../../worker/test/helpers.mjs';
import {PNG_B} from '../../../../worker/test/image-fixtures.mjs';

const repoRoot=fileURLToPath(new URL('../../../../../',import.meta.url));
const evidenceRepo="/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages";const head="6bb1ce916c9b4117b6e03db23a78a5d0b9724a10";
const packagesTree=execFileSync('git',['rev-parse',head+':packages'],{cwd:evidenceRepo,encoding:'utf8'}).trim();
const fixture=createPageFixture();
const worker=(await import(WORKER)).default;
const root=realpathSync(mkdtempSync(join(tmpdir(),'rcq-page-browser-'))),web=join(root,'web'),evidence=join(root,'evidence');
await mkdir(web);await mkdir(evidence);
await cp(join(repoRoot,'packages/web/src'),join(web,'src'),{recursive:true});
await cp(join(repoRoot,'packages/web/vite.config.ts'),join(web,'vite.config.ts'));
await cp(join(repoRoot,'packages/web/package.json'),join(web,'package.json'));
await symlink(join(repoRoot,'packages/web/node_modules'),join(web,'node_modules'),'dir');
await mkdir(join(web,'public'),{recursive:true});
await cp(fixture.publicDir,join(web,'public/data'),{recursive:true});
await cp(join(repoRoot,'packages/web/public/icons'),join(web,'public/icons'),{recursive:true});
const sourcePaths=execFileSync('git',['ls-tree','-r','--name-only',head,'packages/web/src'],{cwd:evidenceRepo,encoding:'utf8'}).trim().split('\n');
const sourceIntegrity=[];
for(const file of sourcePaths) {
  const actual=await readFile(join(web,file.slice('packages/web/'.length)));
  const expected=execFileSync('git',['show',`${head}:${file}`],{cwd:evidenceRepo});
  assert.ok(actual.equals(expected),file);
  sourceIntegrity.push({file,sha256:createHash('sha256').update(actual).digest('hex')});
}
// Infrastructure-only bootstrap: fixed date and public test credentials. No page
// renderer, business function, Response, transport, or editor state is replaced.
await writeFile(join(web,'fixture-boot.js'),`const D=Date; globalThis.Date=class extends D { constructor(...a){super(...(a.length?a:[${JSON.stringify(fixedAt)}]));} static now(){return D.now();} };\nif(!sessionStorage.getItem('canteenos.token'))sessionStorage.setItem('canteenos.token',${JSON.stringify(TOKENS.chef)});\nif(!localStorage.getItem('canteenos.lang'))localStorage.setItem('canteenos.lang','zh');\n`);
let html=await readFile(join(repoRoot,'packages/web/index.html'),'utf8');
html=html.replace(/<link[^>]*href="https:\/\/[^"]+"[^>]*>/g,'');
html=html.replace('<script type="module" src="/src/main.ts"></script>','<script type="module" src="/fixture-boot.js"></script><script type="module" src="/src/main.ts"></script>');
await writeFile(join(web,'plan-controls.js'),await readFile('/private/tmp/canteen-q-t01-browser-author/plan-controls.js'));
html=html.replace('</body>','<script type="module" src="/plan-controls.js"></script></body>');
await writeFile(join(web,'index.html'),html);
const require=createRequire(join(web,'package.json'));
const {build}=await import(require.resolve('vite/package.json').replace('package.json','dist/node/index.js'));
process.env.VITE_WORKER_URL='/worker';
await build({root:web,configFile:join(web,'vite.config.ts'),build:{outDir:join(web,'dist'),emptyOutDir:true}});
const metadata={head,packagesTree,node:process.version,nodePath:process.execPath,fixedAt,fixtureRevision:fixture.revision,fixtureRoot:fixture.root,root,sourceIntegrity,
  boundary:'D author browser: actual main, C and Worker; fixed Q FakeRepo 6276f1; explicit save response hold/drop controls; no live publish or rollback',qFixtureHead:'6276f1beacd9bb61c756d1a3974b180f6cbc74ab',
  htmlChanges:['fixed-date/public-test-token bootstrap','remove external font links for offline isolation','D visible save response hold/drop controls'],producer:{blocking:0,warnings:fixture.built.issues.length}};
await writeFile(join(evidence,'source-integrity.json'),json(metadata));
let state={dropNext:null,holdNext:null,release:false};
const requests=[],controls=[];let serial=0,chain=Promise.resolve();
const persist=()=>{const snapshot=json({metadata,requests,controls,head:fixture.repo.head,githubCalls:fixture.repo.calls,files:Object.fromEntries(Object.entries(currentFiles(fixture.repo)).map(([path,bytes])=>[path,{sha256:createHash('sha256').update(bytes).digest('hex'),json:path.endsWith('.json')?JSON.parse(bytes.toString()):undefined}]))});chain=chain.then(()=>writeFile(join(evidence,'ledger.json'),snapshot));};
const send=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(json(value));};
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/__evidence'){await chain;send(res,{metadata,requests,controls,head:fixture.repo.head});return;}
    if(url.pathname==='/__control'&&req.method==='POST') {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const command=JSON.parse(Buffer.concat(chunks));controls.push(command);
      if(command.action==='drop-next')state.dropNext=command.path;
      else if(command.action==='hold-next'){state.holdNext=command.path;state.release=false;}
      else if(command.action==='release')state.release=true;
      else if(command.action==='change-metadata') {
        const files=currentFiles(fixture.repo),ingredient=JSON.parse(files['data/ingredients/tomato.json']);
        ingredient.name={zh:'番茄 B版',en:'Tomato revision B',uk:'Томат версії B'};
        files['data/ingredients/tomato.json']=json(ingredient);files['data/ingredients/pattern.png']=PNG_B;
        fixture.repo.commit(files,'L1 external metadata/image change');
      } else {send(res,{error:'unknown control'},400);return;}
      persist();send(res,{ok:true,head:fixture.repo.head});return;
    }
    if(url.pathname.startsWith('/worker/')) {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
      const path=url.pathname.slice('/worker'.length),headers=new Headers();
      for(const name of ['authorization','content-type','if-match','if-none-match'])if(req.headers[name])headers.set(name,req.headers[name]);
      const row={id:++serial,actor:'browser',method:req.method,path,search:url.search,ifMatch:headers.get('if-match'),ifNoneMatch:headers.get('if-none-match'),body:bytes.length?JSON.parse(bytes):undefined};requests.push(row);persist();
      // Prevent accidental publisher/rollback use in this browser fixture.
      assert.ok(!path.startsWith('/publish')&&!path.startsWith('/rollback'),'No publication/rollback in the Q browser run');
      const result=await worker.fetch(new Request(`https://worker.example.invalid${path}${url.search}`,{method:req.method,headers,body:bytes.length?bytes:undefined}),fixture.env);
      const body=Buffer.from(await result.arrayBuffer());
      Object.assign(row,{status:result.status,responseHeaders:Object.fromEntries(result.headers),response:result.headers.get('content-type')?.includes('application/json')?JSON.parse(body):undefined,responseSha256:createHash('sha256').update(body).digest('hex'),head:fixture.repo.head});persist();
      if(state.holdNext===path&&req.method==='POST'){state.holdNext=null;row.held=true;persist();while(!state.release&&!res.destroyed)await pause(30);row.released=true;persist();}
      if(state.dropNext===path&&req.method==='POST'&&result.ok){state.dropNext=null;row.dropped=true;persist();res.destroy();return;}
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(body);return;
    }
    const path=resolve(web,'dist',decodeURIComponent(url.pathname).slice(1)||'index.html');
    if(req.method!=='GET'||!path.startsWith(join(web,'dist')+'/')||!(await stat(path)).isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; worker-src 'self' blob:"});res.end(await readFile(path));
  }catch(error){if(!res.headersSent)send(res,{error:String(error)},500);else res.end();}
});
const port=Number(process.env.RCQ_PAGE_PORT??4271);assert.ok(![3003,3004,6399].includes(port));
server.listen(port,'127.0.0.1',()=>{persist();console.log(json({url:`http://127.0.0.1:${server.address().port}/`,...metadata,evidence}).trim());});
