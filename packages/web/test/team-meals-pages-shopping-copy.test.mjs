import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
const here=dirname(fileURLToPath(import.meta.url)),req=createRequire(import.meta.url),vr=createRequire(req.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'shopping-copy-'));after(()=>rm(dir,{recursive:true,force:true}));
let module={};try{const built=await esbuild.build({entryPoints:[join(here,'../src/pages/purchase-list.ts')],bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},logLevel:'silent'});await writeFile(join(dir,'page.mjs'),built.outputFiles[0].text);module=await import(pathToFileURL(join(dir,'page.mjs')));}catch{}
const A='a'.repeat(40),list={id:'shop',basis:{sourceRevision:A,selection:[{menuPlanRef:'week',date:'2026-09-14',mealType:'lunch'}]},items:[{ingredientRef:'rice',decision:'buy',bought:true},{ingredientRef:'salt',decision:'check',previous:{decision:'buy',bought:true}},{ingredientRef:'oil',decision:'available'}]};
const projection={ingredients:{rice:{name:{zh:'米',en:'Rice',uk:'Рис'}},salt:{name:{zh:'盐',en:'Salt',uk:'Сіль'}},oil:{name:{zh:'油',en:'Oil',uk:'Олія'}}}};
test('copy explicitly includes all current decisions without promoting old bought references',()=>{assert.equal(typeof module.shoppingCopy,'function');const text=module.shoppingCopy(list,projection,'en');assert.match(text,/Rice.*Bought/);assert.match(text,/Salt.*Check/);assert.doesNotMatch(text,/Salt.*Bought/);assert.match(text,/Oil.*Available/);assert.match(text,/Current page/);assert.match(text,new RegExp(A));});
test('copy preserves raw unresolved reference and meal scope in each language',()=>{assert.equal(typeof module.shoppingCopy,'function');const input={...list,items:[{ingredientRef:'unknown',decision:'check'}]};for(const lang of ['zh','en','uk']){const text=module.shoppingCopy(input,projection,lang);assert.match(text,/unknown/);assert.match(text,/2026-09-14/);assert.doesNotMatch(text,/0 g|0 kg/);}});
