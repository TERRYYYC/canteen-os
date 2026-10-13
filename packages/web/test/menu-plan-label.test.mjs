import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {Element} from './team-meals-pages-unload-dom.mjs';
import {materializeFixture} from '../../../scripts/validate-contract-fixtures.mjs';
import {runBuild} from '../../../scripts/build-data.mjs';

// #133: an optional plan name may be empty; the Menu must not fall back to the raw planId in its main flow.
const require=createRequire(import.meta.url),esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const temp=await mkdtemp(join(tmpdir(),'menu-plan-label-'));after(()=>rm(temp,{recursive:true,force:true}));
const bundle=await esbuild.build({stdin:{contents:"export {render as menu} from './src/pages/menu';export {createPublishedData} from './src/view-models/published';export {createPlanSelection,planChoiceLabel} from './src/plan-selection';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
await writeFile(join(temp,'pages.mjs'),bundle.outputFiles[0].text);
const mod=await import(pathToFileURL(join(temp,'pages.mjs')).href);

// Real producer output from an isolated Git copy of the golden data plus two unnamed plans.
const root=mkdtempSync(join(tmpdir(),'menu-plan-label-src-'));after(()=>rmSync(root,{recursive:true,force:true}));
materializeFixture('golden',root);
const named=JSON.parse(readFileSync(join(root,'data/menu-plans/week-41.json'),'utf8')),meal=named.meals[0];
writeFileSync(join(root,'data/menu-plans/week-2026-43.json'),JSON.stringify({schemaVersion:'3',dateRange:{start:'2026-10-19',end:'2026-10-25'},meals:[{...meal,date:'2026-10-20'}]}));
writeFileSync(join(root,'data/menu-plans/week-2026-44.json'),JSON.stringify({schemaVersion:'3',meals:[{...meal,date:'2026-10-28',mealType:'dinner'},{...meal,date:'2026-10-27'}]}));
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git(['init','--quiet']);git(['add','data']);git(['-c','user.name=Menu label fixture','-c','user.email=menu-label@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Unnamed plan fixture']);
const output=runBuild({root,commit:git(['rev-parse','HEAD']),target:'team-meals',at:'October 13, 2026 00:00:00 GMT',write:false});
assert.deepEqual(output.issues.filter(issue=>issue.kind==='error'),[]);
assert.deepEqual(output.build.plans,['week-2026-43','week-2026-44','week-41']);

globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag),createTextNode:text=>new Element('',text)};
globalThis.MutationObserver=class{observe(){}disconnect(){}};
globalThis.window={addEventListener(){},removeEventListener(){},scrollTo(){}};
globalThis.location={hash:'#/menu',replace(value){this.hash=value;}};globalThis.history={back(){}};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const data=mod.createPublishedData({baseUrl:'https://fixture.invalid/data/',fetch:async address=>{
 const url=new URL(address),plan=/\/team-meals\/([a-z0-9-]+)\.json$/.exec(url.pathname)?.[1];
 if(url.pathname.endsWith('/build.json'))return json(output.build);
 return plan&&output.sheets[plan]?json(output.sheets[plan].teamMeals):json({},404);
}});
const publication=await data.loadPublication();
const mount=()=>{const el=new Element('main');document.body.append(el);after(()=>el.remove());return el;};
const render=async(el,planId,lang,rest='')=>{await mod.menu(el,{data,publication,publicationError:null,planId,route:'menu',rest,lang,t:key=>key});return el;};
// Ordinary reading: a closed native disclosure only shows its summary.
const visible=node=>node.hidden?'':node.tagName==='DETAILS'&&!node.open?(node.children.find(c=>c.tagName==='SUMMARY')?.textContent??''):node.text+node.children.map(visible).join(' ');
const context=el=>el.querySelector('.menu-plan-context').textContent;
const planBar=async()=>{const owner=mod.createPlanSelection();await owner.resolve(publication,data,'2026-10-14');return owner.choices;};
const EXPECTED={
 'week-2026-43':{zh:'菜单计划 · 2026-10-19 — 2026-10-25',en:'Meal plan · 2026-10-19 — 2026-10-25',uk:'План меню · 2026-10-19 — 2026-10-25',date:'2026-10-20'},
 'week-2026-44':{zh:'菜单计划 · 2026-10-27 — 2026-10-28',en:'Meal plan · 2026-10-27 — 2026-10-28',uk:'План меню · 2026-10-27 — 2026-10-28',date:'2026-10-27'},
};

test('an unnamed published plan reads like the plan bar in zh/en/uk; its raw ID stays in the collapsed support record',async()=>{
 const choices=await planBar();
 for(const [planId,expected] of Object.entries(EXPECTED))for(const lang of ['zh','en','uk']){
  const el=await render(mount(),planId,lang,expected.date),where=`${planId}/${lang}`;
  assert.equal(output.sheets[planId].teamMeals.menuPlans[planId].name,undefined,`${where}: fixture plan is unnamed`);
  assert.equal(context(el),expected[lang],`${where}: readable week/date-range label`);
  assert.equal(context(el),mod.planChoiceLabel(choices.find(choice=>choice.id===planId),lang),`${where}: same wording as the plan bar`);
  assert(!visible(el).includes(planId),`${where}: the raw plan ID is not part of the ordinary Menu reading`);
  const support=el.querySelector('.menu-publication-info');
  assert.equal(support.tagName,'DETAILS');assert(!support.open,`${where}: support record starts collapsed`);
  assert(support.querySelector('[data-published-plan-id]').textContent.endsWith(`: ${planId}`),`${where}: raw ID kept for support`);
  assert.equal(el.querySelector('[data-published-plan]').getAttribute('data-published-plan'),planId,`${where}: plan identity unchanged`);
  assert.equal(el.querySelector('[aria-current="date"]').getAttribute('data-date'),expected.date,`${where}: date selection unchanged`);
  const rows=el.querySelectorAll('[data-meal-index]');assert(rows.length>0);assert(rows.every(row=>row.getAttribute('data-menu-plan')===planId));
 }
});

test('a named plan keeps its own name; switching plans in one outlet keeps each plan, label and publication separate',async()=>{
 const el=mount();
 for(const lang of ['zh','en','uk'])for(const planId of ['week-2026-43','week-41','week-2026-44','week-41']){
  await render(el,planId,lang);
  assert.equal(el.querySelector('[data-published-plan]').getAttribute('data-published-plan'),planId);
  assert.equal(context(el),planId==='week-41'?named.name[lang]:EXPECTED[planId][lang],`${planId}/${lang}`);
  assert(el.textContent.includes(output.build.commit),'publication revision stays visible in its support record');
  assert(el.querySelectorAll('[data-menu-plan]').every(row=>row.getAttribute('data-menu-plan')===planId),'no rows from another plan');
 }
 for(const planId of output.build.plans)assert.equal(Object.keys(output.sheets[planId].teamMeals.menuPlans).join(),planId);
});
