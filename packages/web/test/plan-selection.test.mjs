import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const web=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'selected-plan-'));after(()=>rm(dir,{recursive:true,force:true}));
const bundle=await esbuild.build({stdin:{contents:"export * from './src/plan-selection';export {parseHash} from './src/router';",resolveDir:web},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
const file=join(dir,'selection.mjs');await writeFile(file,bundle.outputFiles[0].text);const m=await import(pathToFileURL(file));
test('public date/meal identity is copyable across Menu and Prep without changing old rest',()=>{
 const owner=m.createPlanSelection();owner.select('week-2026-41');owner.selectSlot('2026-10-06','dinner');
 const prep=m.parseHash(owner.href('prep')),menu=m.parseHash(owner.href('menu'));
 assert.deepEqual(prep,{page:'prep',rest:'2026-10-06/dinner',planId:'week-2026-41',mealType:'dinner'});
 assert.deepEqual(menu,{page:'menu',rest:'2026-10-06',planId:'week-2026-41',mealType:'dinner'});
 assert.equal(m.parseHash(owner.href('prep','2026-10-06/dinner/tomato')).rest,'2026-10-06/dinner/tomato');
});
test('snapshot links stay bound to their own plan and slot after a newer choice',()=>{
 const owner=m.createPlanSelection();owner.select('old-plan');owner.selectSlot('2026-10-06','lunch');const old=owner.snapshot();
 owner.select('new-plan');owner.selectSlot('2026-10-07','dinner');assert.match(old.href('prep'),/plan=old-plan/);assert.match(old.href('prep'),/2026-10-06\/lunch/);
});
test('router rejects arbitrary plan and meal query values and preserves encoded legacy rest',()=>{
 assert.deepEqual(m.parseHash('#/prep/2026-10-06%2Flunch%2Ftomato?plan=week-2026-41&meal=lunch'),{page:'prep',rest:'2026-10-06/lunch/tomato',planId:'week-2026-41',mealType:'lunch'});
 assert.deepEqual(m.parseHash('#/menu?plan=invalid/token&meal=token'),{page:'menu',rest:''});
});
test('only current/next-week real dates choose default, including the ISO year boundary',async()=>{
 const owner=m.createPlanSelection(),plans={demo:{dateRange:{start:'2026-09-12',end:'2026-09-13'},meals:[]},'week-2026-53':{dateRange:{start:'2026-12-28',end:'2027-01-03'},meals:[]},'week-2027-1':{dateRange:{start:'2027-01-04',end:'2027-01-10'},meals:[]}};
 await owner.resolve({kind:'team-meals',manifest:{plans:Object.keys(plans)}},{loadPublishedTeamPlan:async(_p,id)=>({projection:{menuPlans:{[id]:plans[id]}}})},'2027-01-03');assert.equal(owner.id,'week-2026-53');
 await owner.resolve({kind:'team-meals',manifest:{plans:['demo','week-2027-1']}},{loadPublishedTeamPlan:async(_p,id)=>({projection:{menuPlans:{[id]:plans[id]}}})},'2027-01-03');assert.equal(owner.id,'week-2027-1');
});
