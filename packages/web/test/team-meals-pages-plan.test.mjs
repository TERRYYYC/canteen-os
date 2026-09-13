import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, after } from 'node:test';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const vr = createRequire(require.resolve('vite/package.json'));
const esbuild = await import(pathToFileURL(vr.resolve('esbuild')));
const entry = join(here, '../src/pages/admin/plan.ts');
const sourceText = await readFile(entry, 'utf8');
// This probe tests the existing page's serialization before replacing its editor.
const bundle = await esbuild.build({stdin:{contents:sourceText+'\nexport { toSavePlan };',resolveDir:dirname(entry),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""'},logLevel:'silent'});
const dir = await mkdtemp(join(tmpdir(),'team-pages-plan-'));
after(()=>rm(dir,{recursive:true,force:true}));
await writeFile(join(dir,'plan.mjs'),bundle.outputFiles[0].text);
const {toSavePlan} = await import(pathToFileURL(join(dir,'plan.mjs')));
const first = {date:'2026-10-05',mealType:'lunch',dishRef:'tomato-egg',plannedServings:200,serviceWindow:'12:00-14:00'};
const second = {date:'2026-10-07',mealType:'dinner',dishRef:'soup'};
test('saving optional servings explicitly upgrades to v3 without invented counts',()=>{
 const result=toSavePlan({plan:{schemaVersion:'3',meals:[first,second]}});
 assert.equal(result.schemaVersion,'3');
 assert.equal(Object.hasOwn(result.meals[1],'plannedServings'),false);
 assert.deepEqual(result.meals[0],first);
});
test('day filter cannot truncate the whole saved plan or true top-level values',()=>{
 const plan={schemaVersion:'2',name:{zh:'这一周'},margin:1.17,dateRange:{start:'2026-10-05',end:'2026-10-11'},meals:[first,{...second,plannedServings:12}]};
 const result=toSavePlan({plan,view:'day',dayIndex:0});
 assert.deepEqual(result,{...plan,schemaVersion:'3'});
});
test('deleting the last meal produces a legal empty v3 document',()=>{
 assert.deepEqual(toSavePlan({plan:{schemaVersion:'3',meals:[]}}),{schemaVersion:'3',meals:[]});
});
