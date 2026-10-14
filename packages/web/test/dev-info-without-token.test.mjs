/** Developer information (source revision, record ids, hashes, raw JSON) shows only while a chef token is in the session;
 * a page that stays mounted drops it in place when the session ends. Kitchen-facing notices and source text stay. */
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
const dir=await mkdtemp(join(tmpdir(),'c2b-dev-info-'));
after(async()=>{await rm(dir,{recursive:true,force:true});});
const bundle=await esbuild.build({stdin:{contents:"export {renderFrozenPrep} from './src/pages/prep';export {renderFrozenMenu} from './src/pages/menu';export {renderTeamDetails} from './src/pages/team-details';export {renderRecordNotice} from './src/pages/record-notices';export {supportDetails} from './src/pages/record-display';export {clearToken} from './src/admin/token';",resolveDir:join(here,'..')},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
const file=join(dir,'pages.mjs');await writeFile(file,bundle.outputFiles[0].text);
const token='A'.repeat(43),recipeId='00000000-0000-4000-8000-000000000001',revision='d'.repeat(40),hash='c'.repeat(64),LANGS=['zh','en','uk'];
const library={zh:'来自菜谱库 · 第 2 版',en:'From the recipe library · version 2',uk:'З бібліотеки рецептів · версія 2'};
const technical=/支持用技术详情|Technical support details|Технічні дані для підтримки/;
const sourceVersion=/资料版本|支持用资料版本|Source version for support|Версія даних для підтримки/;
let serial=0;
async function load(withToken){
 const session=new Map(withToken?[['canteenos.token',token]]:[]),storage=new Map([['canteenos.lang','en']]);
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{onLine:true,languages:['en']}});
 globalThis.HTMLElement=Element;globalThis.MutationObserver=class{observe(){}disconnect(){}};globalThis.window={addEventListener(){}};globalThis.location={hash:'#/menu'};
 globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),activeElement:null};
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.sessionStorage={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
 return import(`${pathToFileURL(file).href}?case=${++serial}`);
}
const projection=()=>projectTeamMeals({menuPlans:{week:{schemaVersion:'3',meals:[{date:'2026-10-20',mealType:'lunch',dishRef:'soup',plannedServings:8}]}},
 dishes:{soup:{schemaVersion:'3',name:{zh:'清汤',en:'Clear soup',uk:'Прозорий суп'},status:'active',baseServings:4,steps:[{text:{zh:'加热后装盘。',en:'Heat and plate.',uk:'Розігрійте та подайте.'}}],components:[],provenance:{source:'knowledge',recipeId,recipeVersion:2,snapshotHash:hash}}},
 ingredients:{},techniques:[]},{sourceRevision:revision,selection:[{menuPlanRef:'week',date:'2026-10-20',mealType:'lunch'}]});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const attach=el=>{document.body.append(el);return el;};
const selection={menuPlanRef:'week',date:'2026-10-20',mealType:'lunch',mealIndex:0};
const detailOptions=lang=>({lang,projection:projection(),kind:'dish',id:'soup',asset:async()=>{throw new Error('none');},href:(kind,id)=>`#/purchase/x/${kind}/${id}`});

for(const withToken of [false,true]){
 const state=withToken?'with a token':'without a token';
 test(`prep ${state}: development information follows the token`,async()=>{
  const m=await load(withToken);
  for(const lang of LANGS)for(const layout of ['plain','cooking']){
   const el=attach(new Element('main')),stop=m.renderFrozenPrep(el,freeze({mode:'real',projection:projection()}),{lang,layout,selection});
   const found=text=>typeof text==='string'?el.textContent.includes(text):text.test(el.textContent);
   if(withToken){assert.ok(found(revision),`${lang}/${layout}: revision`);assert.ok(found(sourceVersion),`${lang}/${layout}: source version label`);assert.ok(found(library[lang]),`${lang}/${layout}: library line`);}
   else{assert.ok(!found(revision),`${lang}/${layout}: no revision`);assert.ok(!found(sourceVersion),`${lang}/${layout}: no source version label`);assert.ok(!found(technical),`${lang}/${layout}: no technical details`);}
   assert.ok(!found(hash.slice(0,12)),`${lang}/${layout}: no hash`);
   assert.ok(!found('KB '),`${lang}/${layout}: no raw KB line`);
   assert.ok(!found(recipeId),`${lang}/${layout}: no recipe id`);
   stop();el.remove();
  }
 });
 test(`menu ${state}: source version follows the token`,async()=>{
  const m=await load(withToken);
  for(const lang of LANGS){
   const el=attach(new Element('main')),stop=m.renderFrozenMenu(el,freeze({mode:'real',projection:projection()}),{lang,selection});
   assert.equal(el.textContent.includes(revision),withToken,`${lang}: revision`);
   assert.ok(el.textContent.includes('清汤')||el.textContent.includes('Clear soup')||el.textContent.includes('Прозорий суп'),`${lang}: the menu itself stays`);
   stop();el.remove();
  }
 });
 test(`team details ${state}: development information follows the token`,async()=>{
  const m=await load(withToken);
  for(const lang of LANGS){
   const el=attach(new Element('main')),stop=m.renderTeamDetails(el,detailOptions(lang));
   assert.equal(el.textContent.includes(revision),withToken,`${lang}: revision`);
   assert.equal(el.textContent.includes(library[lang]),withToken,`${lang}: library line`);
   assert.equal(technical.test(el.textContent),withToken,`${lang}: technical details`);
   assert.ok(!el.textContent.includes('KB '),`${lang}: no raw KB line`);assert.ok(!el.textContent.includes(recipeId),`${lang}: no recipe id`);
   assert.ok(!el.textContent.includes(hash.slice(0,12)),`${lang}: no hash`);
   stop();el.remove();
  }
 });
 test(`record notice ${state}: the reason stays and the raw JSON follows the token`,async()=>{
  const m=await load(withToken);
  for(const lang of LANGS){
   const notice=m.renderRecordNotice({code:'missing-dish',dishRef:'soup'},lang);
   assert.ok(notice.querySelectorAll('p')[1].textContent.length>0,`${lang}: the reason stays`);
   assert.equal(technical.test(notice.textContent),withToken,`${lang}: technical details`);
   assert.equal(notice.textContent.includes('missing-dish'),withToken,`${lang}: raw code`);
  }
 });
 test(`supportDetails ${state}: ${withToken?'a disclosure':'nothing visible'}`,async()=>{
  const m=await load(withToken);
  for(const lang of LANGS){const el=m.supportDetails(lang,'raw');if(withToken)assert.ok(el.textContent.includes('raw')&&technical.test(el.textContent));else assert.equal(el.textContent,'','an empty text node, so existing append(...) call sites stay as they are');}
 });
}

test('a mounted page drops development information in place when the session ends',async()=>{
 const m=await load(true);
 for(const lang of LANGS){
  sessionStorage.setItem('canteenos.token',token);
  const prep=attach(new Element('main')),stopPrep=m.renderFrozenPrep(prep,freeze({mode:'real',projection:projection()}),{lang,layout:'plain',selection});
  const menu=attach(new Element('main')),stopMenu=m.renderFrozenMenu(menu,freeze({mode:'real',projection:projection()}),{lang,selection});
  const details=attach(new Element('main')),stopDetails=m.renderTeamDetails(details,detailOptions(lang));
  const notice=attach(m.renderRecordNotice({code:'missing-dish',dishRef:'soup'},lang));
  const prepChildren=prep.children.slice(),menuChildren=menu.children.slice(),detailChildren=details.children.slice(),noticeChildren=notice.children.length;
  for(const el of [prep,menu,details])assert.ok(el.textContent.includes(revision),`${lang}: revision shown while the session lasts`);
  assert.ok(details.textContent.includes(library[lang])&&technical.test(notice.textContent),`${lang}: library line and technical details shown`);
  m.clearToken();
  for(const el of [prep,menu,details])assert.ok(!el.textContent.includes(revision),`${lang}: revision leaves with the session`);
  assert.ok(!prep.textContent.includes(library[lang])&&!details.textContent.includes(library[lang]),`${lang}: library line leaves`);
  assert.ok(!technical.test(notice.textContent)&&!technical.test(details.textContent),`${lang}: technical details leave`);
  assert.ok(!details.textContent.includes(recipeId)&&!notice.textContent.includes('missing-dish'),`${lang}: ids leave`);
  assert.ok(notice.querySelectorAll('p')[1].textContent.length>0,`${lang}: the reason stays`);
  assert.ok(details.textContent.includes('清汤')||details.textContent.includes('Clear soup')||details.textContent.includes('Прозорий суп'),`${lang}: the record stays`);
  assert.deepEqual(prep.children.filter(c=>prepChildren.includes(c)),prep.children,`${lang}: prep is not redrawn`);
  assert.deepEqual(menu.children.filter(c=>menuChildren.includes(c)),menu.children,`${lang}: menu is not redrawn`);
  assert.deepEqual(details.children.filter(c=>detailChildren.includes(c)),details.children,`${lang}: details are not redrawn`);
  assert.ok(notice.children.length<noticeChildren,`${lang}: the notice lost only its technical block`);
  stopPrep();stopMenu();stopDetails();prep.remove();menu.remove();details.remove();notice.remove();
 }
});
