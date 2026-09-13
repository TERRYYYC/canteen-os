import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {posix,resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
const [directory,out]=process.argv.slice(2),root=resolve(directory),require=createRequire(new URL('./packages/web/package.json',import.meta.url)),vreq=createRequire(require.resolve('vite/package.json'));
const {parseAst}=await import(pathToFileURL(vreq.resolve('rollup/parseAst')).href);
const observed=JSON.parse(await readFile(root+'/bundle-attribution-final.json','utf8')),files=new Map(),preloads=[];
function walk(node,fn){if(!node||typeof node!=='object')return;fn(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(x=>walk(x,fn));else if(value&&typeof value==='object')walk(value,fn);}
for(const chunk of observed){const bytes=await readFile(root+'/'+chunk.file),code=bytes.toString(),ast=parseAst(code),deps=new Set(),dynamic=new Set(),fileFor=s=>posix.normalize(posix.join(posix.dirname(chunk.file),s));
 for(const n of ast.body)if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(n.type)&&n.source)deps.add(fileFor(n.source.value));
 const match=code.match(/m\.f=\[(.*?)\]/s),map=match?JSON.parse('['+match[1]+']'):[];
 walk(ast,n=>{if(n.type==='ImportExpression'){assert.equal(n.source.type,'Literal');dynamic.add(fileFor(n.source.value));}
 if(n.type==='CallExpression'&&n.arguments?.[1]?.type==='CallExpression'&&n.arguments[1].callee.name==='__vite__mapDeps'){
 const targets=[];walk(n.arguments[0],x=>{if(x.type==='ImportExpression')targets.push(fileFor(x.source.value));});assert.equal(targets.length,1);
 preloads.push({from:chunk.file,target:targets[0],js:n.arguments[1].arguments[0].elements.map(x=>fileFor(map[x.value])).filter(x=>x.endsWith('.js'))});}});
 assert.deepEqual([...deps].sort(),[...chunk.imports].sort());assert.deepEqual([...dynamic].sort(),[...chunk.dynamicImports].sort());
 files.set(chunk.file,{deps:[...deps],dynamic:[...dynamic],gzip:gzipSync(bytes).length,utf8:bytes.length});}
function closure(starts){const seen=new Set();function visit(f){assert(files.has(f),f);if(seen.has(f))return;seen.add(f);for(const d of files.get(f).deps)visit(d);}starts.forEach(visit);return [...seen].sort();}
for(const p of preloads){const expected=closure([p.target]);assert(p.js.every(f=>expected.includes(f)),JSON.stringify(p));}
const entry=observed.find(c=>c.isEntry).file,wb=observed.find(c=>c.file.includes('workbox-window')).file;
const find=(prefix,n)=>{const c=observed.find(c=>c.facade?.endsWith(prefix+n+'.ts'))??observed.find(c=>c.modules.some(m=>m.id.endsWith(prefix+n+'.ts')));assert(c,prefix+n);return c.file;};
function total(names){return {files:names,utf8Bytes:names.reduce((s,f)=>s+files.get(f).utf8,0),gzipBytes:names.reduce((s,f)=>s+files.get(f).gzip,0)};}
const routes={};for(const r of ['prep','menu','purchase','qr','locked-admin','home','plan','import','ingredient-new','dish-new','publish']){
 const publicPage=['prep','menu','purchase','qr'].includes(r),starts=[entry,find('/pages/',publicPage?r:'admin')];if(!publicPage&&r!=='locked-admin')starts.push(find('/pages/admin/',r));
 routes[r]={normalSW:total(closure([...starts,wb])),noSW:total(closure(starts))};routes[r].within60000=routes[r].normalSW.gzipBytes<=60000;}
const swBytes=await readFile(root+'/sw.js'),sw=swBytes.toString(),ast=parseAst(sw),precache=[];
walk(ast,n=>{if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='precacheAndRoute')for(const entry of n.arguments[0].elements){const url=entry.properties.find(p=>p.key.name==='url').value.value;precache.push(url.replace(/^\.\//,''));}});
assert(precache.length>0);const missing=[...files.keys()].filter(f=>!precache.includes(f));assert.deepEqual(missing,[]);
const runtime=sw.match(/['"]\.\/(workbox-[^'"]+)['"]/)[1]+'.js';const runtimeBytes=await readFile(root+'/'+runtime);
const report={reviewedHeadSha:'7920496e06996eedac6e08e862fa097453ed9462',node:process.version,execPath:process.execPath,routes,staticDynamicGraphs:files.size,preloadGroups:preloads,allAppJS:total([...files.keys()].sort()),precache,missingPrecache:missing,worker:{swGzip:gzipSync(swBytes).length,runtimeGzip:gzipSync(runtimeBytes).length},moduleGraphs:Object.fromEntries(files)};
await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({routes:Object.fromEntries(Object.entries(routes).map(([k,v])=>[k,{sw:v.normalSW.gzipBytes,noSW:v.noSW.gzipBytes,ok:v.within60000}])),chunks:files.size,preloadGroups:preloads.length,missing},null,2));
