import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const [input,out,dist]=process.argv.slice(2),chunks=JSON.parse(await readFile(input,'utf8')),map=new Map(chunks.map(x=>[x.file,x])),entry=chunks.find(x=>x.isEntry).file,workbox=chunks.find(x=>x.file.includes('workbox-window')).file;
const page=n=>chunks.find(x=>x.facade?.endsWith('/pages/'+n+'.ts'))?.file??chunks.find(x=>x.modules.some(m=>m.id.endsWith('/pages/'+n+'.ts')))?.file;
const screen=n=>chunks.find(x=>x.facade?.endsWith('/pages/admin/'+n+'.ts'))?.file??chunks.find(x=>x.modules.some(m=>m.id.endsWith('/pages/admin/'+n+'.ts')))?.file;
function closure(starts){const seen=new Set();function visit(n){if(!n||seen.has(n))return;seen.add(n);for(const imp of map.get(n).imports)visit(imp);}starts.forEach(visit);return [...seen].sort();}
const paths={};
for(const route of ['prep','menu','purchase','qr','locked-admin','home','plan','import','ingredient-new','dish-new','publish']){
 const top=['prep','menu','purchase','qr'].includes(route)?route:'admin';
 const files=closure([entry,page(top),screen(route),workbox]);
 const gzipBytes=files.reduce((s,n)=>s+map.get(n).finalGzipBytes,0);
 paths[route]={files,utf8Bytes:files.reduce((sum,name)=>sum+map.get(name).finalUtf8Bytes,0),gzipBytes,noSwGzipBytes:gzipBytes-map.get(workbox).finalGzipBytes,within60000:gzipBytes<=60000};
}
const total={node:process.version,paths,allAppJs:{count:chunks.length,gzipBytes:chunks.reduce((s,x)=>s+x.finalGzipBytes,0),utf8Bytes:chunks.reduce((s,x)=>s+x.finalUtf8Bytes,0)}};
if(dist){const sw=await readFile(dist+'/sw.js','utf8');total.precachedJs=chunks.filter(x=>sw.includes(x.file)).map(x=>x.file);total.missingPrecachedJs=chunks.filter(x=>!sw.includes(x.file)).map(x=>x.file);const workbox=sw.match(/"(\.\/workbox-[^"]+)"/);total.swAndRuntimeGzip=gzipSync(sw).length+(workbox?gzipSync(await readFile(dist+'/'+workbox[1]+'.js')).length:0);}
await writeFile(out,JSON.stringify(total,null,2));
console.log(JSON.stringify(total,null,2));
