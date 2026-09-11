import {build} from 'vite';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const root='/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-web-shared/packages/web';
await build({root,configFile:root+'/vite.config.ts',logLevel:'warn',plugins:[{name:'read-only-bundle-attribution',generateBundle(_options,bundle){
 const chunks=Object.values(bundle).filter(x=>x.type==='chunk').map(x=>({file:x.fileName,isEntry:x.isEntry,facade:x.facadeModuleId,bytes:Buffer.byteLength(x.code),gzipBytes:gzipSync(x.code).length,imports:x.imports,dynamicImports:x.dynamicImports,modules:Object.entries(x.modules).map(([id,m])=>({id,renderedLength:m.renderedLength,originalLength:m.originalLength,renderedExports:m.renderedExports,removedExports:m.removedExports,imports:this.getModuleInfo(id)?.importedIds,dynamicImports:this.getModuleInfo(id)?.dynamicallyImportedIds})).sort((a,b)=>b.renderedLength-a.renderedLength)}));
 this.emitFile({type:'asset',fileName:'bundle-attribution.json',source:JSON.stringify(chunks,null,2)});
}}],build:{outDir:'/private/tmp/app-main-r3-bundle-diagnostic',emptyOutDir:true}});

// Final output may receive Vite preload dependency expansion after generateBundle.
// Use the same Node20 zlib as the original build reporter for final gzip totals.
const output='/private/tmp/app-main-r3-bundle-diagnostic';
const chunks=JSON.parse(await readFile(output+'/bundle-attribution.json','utf8'));
for(const chunk of chunks){const raw=await readFile(output+'/'+chunk.file);chunk.finalUtf8Bytes=raw.length;chunk.finalGzipBytes=gzipSync(raw).length;}
await writeFile(output+'/bundle-attribution-final.json',JSON.stringify(chunks,null,2));
