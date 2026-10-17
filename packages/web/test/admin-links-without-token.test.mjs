/** Team pages (prep, details, record notices, purchase) show #/admin links only while a chef token is in the session,
 * and a page that stays mounted drops them in place when the session ends. */
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Element} from './team-meals-pages-unload-dom.mjs';
import {projectTeamMeals} from '../../core/dist/index.js';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'c2b-admin-links-'));
after(async()=>{await rm(dir,{recursive:true,force:true});});
const bundle=await esbuild.build({stdin:{contents:"export {renderFrozenPrep} from './src/pages/prep';export {renderTeamDetails} from './src/pages/team-details';export {renderRecordNotice} from './src/pages/record-notices';export * from './src/pages/purchase';export * from './src/api/team-meals';export {clearToken} from './src/admin/token';",resolveDir:join(here,'..')},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
const file=join(dir,'pages.mjs');await writeFile(file,bundle.outputFiles[0].text);
const token='A'.repeat(43),recipeId='00000000-0000-4000-8000-000000000001',LANGS=['zh','en','uk'];
let serial=0;
async function load(withToken){
 const session=new Map(withToken?[['canteenos.token',token]]:[]),storage=new Map([['canteenos.lang','en']]);
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{onLine:true,languages:['en']}});
 globalThis.HTMLElement=Element;globalThis.MutationObserver=class{observe(){}disconnect(){}};globalThis.window={addEventListener(){}};globalThis.location={hash:'#/purchase'};
 globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),activeElement:null};
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.sessionStorage={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
 return import(`${pathToFileURL(file).href}?case=${++serial}`);
}
const projection=()=>projectTeamMeals({menuPlans:{week:{schemaVersion:'3',meals:[{date:'2026-10-20',mealType:'lunch',dishRef:'soup',plannedServings:8}]}},
 dishes:{soup:{schemaVersion:'3',name:{zh:'清汤',en:'Clear soup',uk:'Прозорий суп'},status:'active',baseServings:4,steps:[{text:{zh:'加热后装盘。',en:'Heat and plate.',uk:'Розігрійте та подайте.'}}],components:[],provenance:{source:'knowledge',recipeId,recipeVersion:2,snapshotHash:'c'.repeat(64)}}},
 ingredients:{},techniques:[]},{sourceRevision:'c'.repeat(40),selection:[{menuPlanRef:'week',date:'2026-10-20',mealType:'lunch'}]});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const adminLinks=el=>el.querySelectorAll('a').filter(a=>(a.getAttribute('href')??'').startsWith('#/admin'));
const attach=el=>{document.body.append(el);return el;};
const libraryLine={zh:'来自菜谱库 · 第 2 版',en:'From the recipe library · version 2',uk:'З бібліотеки рецептів · версія 2'};
const repairLabel=/查看／补齐资料|View \/ complete information|Переглянути \/ доповнити дані/;
const frozenLabel=/打开固定菜谱版本|Open frozen recipe version|Відкрити версію рецепта/;

for(const withToken of [false,true]){
 const state=withToken?'with a token':'without a token';
 test(`record notices ${state}: repair link follows the token, reason text stays`,async()=>{
  const m=await load(withToken);
  for(const lang of LANGS)for(const [issue,href] of [[{code:'missing-dish',dishRef:'soup'},'#/admin/dish/soup'],[{code:'missing-ingredient',ingredientRef:'salt'},'#/admin/ingredient/salt'],[{code:'missing-plan',menuPlanRef:'week'},'#/admin/plan/week']]){
   const notice=m.renderRecordNotice(issue,lang),links=adminLinks(notice),paragraphs=notice.querySelectorAll('p');
   assert.equal(paragraphs.length>=2&&paragraphs[1].textContent.length>0,true,`${lang}/${issue.code}: the reason text is kept`);
   if(withToken){assert.deepEqual(links.map(a=>a.getAttribute('href')),[href]);assert.match(links[0].textContent,repairLabel);}
   else{assert.equal(links.length,0);assert.equal(notice.querySelectorAll('a').length,0);assert.doesNotMatch(notice.textContent,repairLabel);}
  }
 });
 test(`prep ${state}: attention and frozen-recipe links follow the token`,async()=>{
  const m=await load(withToken);
  for(const lang of LANGS){
   const el=attach(new Element('main')),stop=m.renderFrozenPrep(el,freeze({mode:'real',projection:projection()}),{lang,layout:'cooking',selection:{menuPlanRef:'week',date:'2026-10-20',mealType:'lunch',mealIndex:0}});
   const note=el.querySelectorAll('.prep-task-note').find(n=>n.textContent.length>0);
   assert.ok(note,`${lang}: the missing-method note stays`);
   if(withToken){
    assert.deepEqual([...new Set(adminLinks(el).map(a=>a.getAttribute('href')))].sort(),['#/admin/dish/soup',`#/admin/knowledge/${recipeId}/revisions/2`]);
    assert.match(note.textContent,repairLabel);assert.match(el.textContent,frozenLabel);
   }else{
    assert.equal(adminLinks(el).length,0);assert.doesNotMatch(el.textContent,repairLabel);assert.doesNotMatch(el.textContent,frozenLabel);
    assert.equal(note.children.filter(c=>c.tagName!=='').length,0,`${lang}: no empty link container`);assert.equal(note.textContent,note.textContent.trimEnd(),`${lang}: no trailing separator space`);
    assert.doesNotMatch(el.textContent,/KB /,`${lang}: no raw KB line`);assert.ok(!el.textContent.includes(recipeId),`${lang}: no recipe id`);
   }
   if(withToken){assert.ok(el.textContent.includes(libraryLine[lang]),`${lang}: the plain library line`);assert.doesNotMatch(el.textContent,/KB /);}
   stop();el.remove();
  }
 });
 test(`team details ${state}: frozen-recipe link follows the token`,async()=>{
  const m=await load(withToken),el=attach(new Element('main'));
  const stop=m.renderTeamDetails(el,{lang:'en',projection:projection(),kind:'dish',id:'soup',asset:async()=>{throw new Error('none');},href:(kind,id)=>`#/purchase/x/${kind}/${id}`});
  assert.doesNotMatch(el.textContent,/KB /,'no raw KB line');
  if(withToken){assert.deepEqual(adminLinks(el).map(a=>a.getAttribute('href')),[`#/admin/knowledge/${recipeId}/revisions/2`]);assert.match(el.textContent,frozenLabel);assert.ok(el.textContent.includes('From the recipe library · version 2'));}
  else{assert.equal(adminLinks(el).length,0);assert.doesNotMatch(el.textContent,frozenLabel);assert.ok(!el.textContent.includes('From the recipe library'));}
  stop();el.remove();
 });
 test(`purchase ${state}: the plan link in the header follows the token`,async()=>{
  const m=await load(withToken);
  const api=m.createTeamMealsApi('https://admin-links.invalid',{mode:'mock',identity:()=>1,token:()=>'explicit-fixture',fetch:async()=>Response.json({ok:false,errors:[{path:'',code:'not_found',message:'not_found'}]},{status:404})});
  const el=attach(new Element('main'));
  await m.createPurchaseRenderer(api)(el,{rest:'',lang:'en',planId:'week-41',route:'purchase'});
  const head=el.querySelector('.tm-head');assert.ok(head,'the header stays');
  assert.ok(head.querySelectorAll('a').some(a=>a.getAttribute('href')==='#/purchase'),'the back link stays');
  if(withToken)assert.deepEqual(adminLinks(head).map(a=>a.getAttribute('href')),['#/admin/plan/week-41']);
  else{assert.equal(adminLinks(el).length,0);assert.equal(head.querySelectorAll('a').length,1);}
  api.dispose();el.remove();
 });
}

const currentLabel=/另看当前资料|View current information separately|Окремо переглянути поточні дані/;
test('team details: the live-record action follows the token like the links',async()=>{
 for(const withToken of [false,true]){
  const m=await load(withToken),el=attach(new Element('main'));
  const stop=m.renderTeamDetails(el,{lang:'en',projection:projection(),kind:'dish',id:'soup',asset:async()=>{throw new Error('none');},href:(kind,id)=>`#/purchase/x/${kind}/${id}`,current:()=>{}});
  if(withToken)assert.match(el.textContent,currentLabel);else assert.doesNotMatch(el.textContent,currentLabel);
  stop();el.remove();
 }
});
test('a mounted page drops its back-office entries when the session ends, without being redrawn',async()=>{
 const m=await load(true),selection={menuPlanRef:'week',date:'2026-10-20',mealType:'lunch',mealIndex:0};
 for(const lang of LANGS){
  sessionStorage.setItem('canteenos.token',token);
  const prep=attach(new Element('main')),stopPrep=m.renderFrozenPrep(prep,freeze({mode:'real',projection:projection()}),{lang,layout:'cooking',selection});
  const notice=attach(m.renderRecordNotice({code:'missing-dish',dishRef:'soup'},lang));
  const details=attach(new Element('main')),stopDetails=m.renderTeamDetails(details,{lang,projection:projection(),kind:'dish',id:'soup',asset:async()=>{throw new Error('none');},href:(kind,id)=>`#/purchase/x/${kind}/${id}`,current:()=>{}});
  const note=prep.querySelectorAll('.prep-task-note').find(n=>n.textContent.length>0),prepChildren=prep.children.slice(),detailChildren=details.children.length;
  assert.ok(adminLinks(prep).length>=2,`${lang}: prep starts with its back-office links`);
  assert.equal(adminLinks(notice).length,1,`${lang}: the notice starts with its repair link`);
  assert.equal(adminLinks(details).length,1,`${lang}: details start with the frozen-recipe link`);assert.match(details.textContent,currentLabel);
  m.clearToken();
  assert.equal(adminLinks(prep).length,0,`${lang}: prep links leave with the session`);
  assert.doesNotMatch(prep.textContent,repairLabel);assert.doesNotMatch(prep.textContent,frozenLabel);
  assert.deepEqual(prep.children,prepChildren,`${lang}: prep is not redrawn`);
  assert.ok(note.isConnected&&note.textContent.trim().length>0,`${lang}: the note text stays`);
  assert.equal(adminLinks(notice).length,0,`${lang}: the repair link leaves with the session`);
  assert.ok(notice.querySelectorAll('p')[1].textContent.length>0,`${lang}: the reason stays`);
  assert.equal(adminLinks(details).length,0,`${lang}: the details link leaves with the session`);assert.doesNotMatch(details.textContent,currentLabel);
  assert.equal(details.children.length,detailChildren-5,`${lang}: only the chef entries (version, technical details, library line, two links) left the details`);
  assert.ok(!details.textContent.includes(libraryLine[lang]),`${lang}: the library line leaves with the session`);
  stopPrep();stopDetails();prep.remove();notice.remove();details.remove();
 }
});
test('purchase: the header plan link leaves with the session and the page is kept as it is',async()=>{
 const m=await load(true);
 const api=m.createTeamMealsApi('https://admin-links.invalid',{mode:'mock',identity:()=>1,token:()=>'explicit-fixture',fetch:async()=>Response.json({ok:false,errors:[{path:'',code:'not_found',message:'not_found'}]},{status:404})});
 const el=attach(new Element('main'));
 await m.createPurchaseRenderer(api)(el,{rest:'',lang:'en',planId:'week-41',route:'purchase'});
 const head=el.querySelector('.tm-head'),back=head.querySelectorAll('a').find(a=>a.getAttribute('href')==='#/purchase'),body=el.children[0];
 assert.deepEqual(adminLinks(head).map(a=>a.getAttribute('href')),['#/admin/plan/week-41']);
 m.clearToken();
 assert.equal(adminLinks(el).length,0,'the plan link leaves with the session');
 assert.equal(el.querySelector('.tm-head'),head,'the header is not redrawn');assert.ok(back.isConnected,'the back link stays');
 assert.equal(el.children[0],body,'the page body is the same node');
 api.dispose();el.remove();
});
