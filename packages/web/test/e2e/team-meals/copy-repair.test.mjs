/** Original Q expectations, adapted only to the approved formatter's new module/signature. */
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPageFixture,fixedAt} from './page-fixture.mjs';
import {createShoppingList,estimateShoppingList} from '../../../../core/dist/index.js';
const require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'rcq-copy-repair-'));
const fixture=createPageFixture();
after(async()=>{await rm(dir,{recursive:true,force:true});await rm(fixture.root,{recursive:true,force:true});});
const bundled=await esbuild.build({stdin:{contents:'export {shoppingCopy} from "./src/pages/shopping-copy.ts";',resolveDir:new URL('../../../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
const entry=join(dir,'copy.mjs');await writeFile(entry,bundled.outputFiles[0].text);
const {shoppingCopy}=await import(pathToFileURL(entry));
test('Q original supplemental all-meal RED expectations retain unrecorded components and purchase gaps',()=>{
  const projection=fixture.built.sheets['team-week'].teamMeals;
  const list=createShoppingList('copy-red',{sourceRevision:fixture.revision,selection:projection.selection},projection);
  const actual=shoppingCopy(list,projection,'zh',estimateShoppingList(projection,projection.selection,fixedAt));
  assert.ok(projection.collection.issues.some(issue=>issue.code==='components-unrecorded'));
  assert.match(actual,/尚未录入配料|未录成分|Ingredients not recorded/,'T08 copied output must retain the actual incomplete-recipe issue shown on screen');
  assert.match(actual,/采购规格未录/,'T08 copied output must retain actual missing purchase specifications');
  assert.ok(actual.includes('[tomato]')&&actual.includes('[tomato-other]'));
});
