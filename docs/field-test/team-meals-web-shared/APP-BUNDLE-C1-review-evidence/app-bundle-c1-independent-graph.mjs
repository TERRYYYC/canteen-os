import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {posix} from 'node:path';
import {gzipSync} from 'node:zlib';
const root='/private/tmp/app-bundle-c1-independent-build-e79fe3b',web='/private/tmp/app-bundle-c1-review-e79fe3b-etbw3e/packages/web';
const req=createRequire(web+'/package.json'),vreq=createRequire(req.resolve('vite/package.json'));
const {parseAst}=await import(pathToFileURL(vreq.resolve('rollup/parseAst')).href);
const observed=JSON.parse(await readFile(root+'/bundle-attribution-final.json','utf8')),files=new Map(),preloads=[];
function walk(node,fn){if(!node||typeof node!=='object')return;fn(node);for(const x of Object.values(node))if(Array.isArray(x))x.forEach(y=>walk(y,fn));else if(x&&typeof x==='object')walk(x,fn);}
for(const chunk of observed){
 const bytes=await readFile(root+'/'+chunk.file),code=bytes.toString(),ast=parseAst(code),deps=new Set(),dynamic=new Set();
 const fileFor=s=>posix.normalize(posix.join(posix.dirname(chunk.file),s));
 for(const n of ast.body)if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(n.type)&&n.source)deps.add(fileFor(n.source.value));
 const mapMatch=code.match(/m\.f=\[(.*?)\]/s),map=mapMatch?JSON.parse('['+mapMatch[1]+']'):[];
 walk(ast,n=>{if(n.type==='ImportExpression')dynamic.add(fileFor(n.source.value));if(n.type==='CallExpression'&&n.arguments?.[1]?.type==='CallExpression'&&n.arguments[1].callee.name==='__vite__mapDeps'){
  const targets=[];walk(n.arguments[0],x=>{if(x.type==='ImportExpression')targets.push(fileFor(x.source.value));});
  assert.equal(targets.length,1);const indices=n.arguments[1].arguments[0].elements.map(x=>x.value);preloads.push({from:chunk.file,target:targets[0],js:indices.map(i=>fileFor(map[i])).filter(x=>x.endsWith('.js'))});
 }});
 assert.deepEqual([...deps].sort(),[...chunk.imports].sort());assert.deepEqual([...dynamic].sort(),[...chunk.dynamicImports].sort());
 assert.equal(gzipSync(bytes).length,chunk.finalGzipBytes);files.set(chunk.file,{deps:[...deps],gzip:gzipSync(bytes).length,bytes:bytes.length});
}
function closure(starts){const s=new Set(),visit=f=>{if(s.has(f))return;s.add(f);for(const d of files.get(f).deps)visit(d)};starts.forEach(visit);return [...s].sort();}
for(const p of preloads){const expected=closure([p.target]);assert(p.js.every(f=>expected.includes(f)),JSON.stringify(p));}
const entry=observed.find(c=>c.isEntry).file,workbox=observed.find(c=>c.file.includes('workbox-window')).file;
const top=name=>(observed.find(c=>c.facade?.endsWith('/pages/'+name+'.ts'))??observed.find(c=>c.modules.some(m=>m.id.endsWith('/pages/'+name+'.ts')))).file;
const screen=name=>observed.find(c=>c.facade?.endsWith('/pages/admin/'+name+'.ts'))?.file;
const routes={};
for(const r of ['prep','menu','purchase','qr','locked-admin','home','plan','import','ingredient-new','dish-new','publish']){
 const starts=[entry,top(['prep','menu','purchase','qr'].includes(r)?r:'admin'),workbox];if(screen(r))starts.push(screen(r));
 const js=closure(starts),gzip=js.reduce((s,f)=>s+files.get(f).gzip,0);routes[r]={gzip,noSW:gzip-files.get(workbox).gzip,files:js};
}
const sw=await readFile(root+'/sw.js','utf8');assert([...files.keys()].every(f=>sw.includes(f)));
const report={head:'e79fe3b49b2a5d3c06c5d7298d9207adc5cc3c71',node:process.version,staticAndDynamicEdgesVerified:files.size,preloadGroupsVerified:preloads.length,routes,allJS:{files:files.size,gzip:[...files.values()].reduce((s,x)=>s+x.gzip,0),bytes:[...files.values()].reduce((s,x)=>s+x.bytes,0)},allAppJSDeclaredInPrecache:true};
await writeFile('/private/tmp/app-bundle-c1-independent-graph-e79fe3b.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,routes:Object.fromEntries(Object.entries(routes).map(([k,v])=>[k,{gzip:v.gzip,noSW:v.noSW}]))},null,2));
