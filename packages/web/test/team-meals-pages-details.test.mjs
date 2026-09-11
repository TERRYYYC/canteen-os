import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';import { createRequire } from 'node:module';import { tmpdir } from 'node:os';import { dirname, join } from 'node:path';import { fileURLToPath, pathToFileURL } from 'node:url';import { test, after } from 'node:test';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'team-details-'));after(()=>rm(dir,{recursive:true,force:true}));
let mod={};try{const source=await readFile(join(here,'../src/pages/team-details.ts'),'utf8');const b=await esbuild.build({stdin:{contents:source,resolveDir:join(here,'../src/pages'),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},logLevel:'silent'});await writeFile(join(dir,'details.mjs'),b.outputFiles[0].text);mod=await import(pathToFileURL(join(dir,'details.mjs')));}catch(e){if(e.code!=='ENOENT')throw e;}
test('details distinguish unknown quantity from recorded to-taste and preserve original units',()=>{
 assert.equal(typeof mod.quantityText,'function','same-version detail presenter exists');assert.equal(mod.quantityText(undefined,'zh'),'用量未录');assert.equal(mod.quantityText({unit:'to-taste'},'zh'),'适量');assert.equal(mod.quantityText({value:1500,unit:'g'},'en'),'1500 g');
});
test('reference links reject executable and protocol-relative URLs',()=>{
 assert.equal(typeof mod.safeLink,'function');for(const x of ['javascript:alert(1)','data:text/html,x','//other.invalid/a'])assert.equal(mod.safeLink(x),null);assert.equal(mod.safeLink('https://example.org/source'),'https://example.org/source');
});
