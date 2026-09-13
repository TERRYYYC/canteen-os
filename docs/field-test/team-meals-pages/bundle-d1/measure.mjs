import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const [root,output]=process.argv.slice(2);
const require=createRequire(root+'/package.json');
const {build}=await import(require.resolve('vite/package.json').replace('package.json','dist/node/index.js'));
await build({root,configFile:root+'/vite.config.ts',plugins:[{name:'observe-only-route-graph',generateBundle(_options,bundle){
 const chunks=Object.values(bundle).filter(x=>x.type==='chunk').map(x=>({file:x.fileName,isEntry:x.isEntry,facade:x.facadeModuleId,imports:x.imports,dynamicImports:x.dynamicImports,modules:Object.entries(x.modules).map(([id,m])=>({id,renderedLength:m.renderedLength})).sort((a,b)=>b.renderedLength-a.renderedLength)}));
 this.emitFile({type:'asset',fileName:'bundle-attribution.json',source:JSON.stringify(chunks,null,2)});
}}],build:{outDir:output,emptyOutDir:true}});
const chunks=JSON.parse(await readFile(output+'/bundle-attribution.json','utf8'));
for(const chunk of chunks){const raw=await readFile(output+'/'+chunk.file);chunk.finalUtf8Bytes=raw.length;chunk.finalGzipBytes=gzipSync(raw).length;}
await writeFile(output+'/bundle-attribution-final.json',JSON.stringify(chunks,null,2));
