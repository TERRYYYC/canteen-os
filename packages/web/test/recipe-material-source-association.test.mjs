import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Element} from './team-meals-pages-unload-dom.mjs';
import {projectTeamMeals} from '../../core/dist/index.js';

const require=createRequire(import.meta.url),esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const temp=await mkdtemp(join(tmpdir(),'recipe-material-source-'));after(()=>rm(temp,{recursive:true,force:true}));
const bundle=await esbuild.build({stdin:{contents:"export {renderTeamDetails} from './src/pages/team-details';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
await writeFile(join(temp,'details.mjs'),bundle.outputFiles[0].text);
const {renderTeamDetails}=await import(pathToFileURL(join(temp,'details.mjs')).href);
globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag),createTextNode:text=>new Element('',text)};
globalThis.MutationObserver=class{observe(){}disconnect(){}};
const revision='a'.repeat(40),recipeId='00000000-0000-4000-8000-000000000001',canonicalId='00000000-0000-4000-8000-000000000002';
function fixture() {
 const name={zh:'同名材料',en:'Same name',uk:'Однакова назва'};
 const ingredients={
  'snapshot-one':{schemaVersion:'3',name,trackStock:false,canonicalIngredientId:canonicalId,canonicalIngredientVersion:1},
  'snapshot-two':{schemaVersion:'3',name,trackStock:false,canonicalIngredientId:canonicalId,canonicalIngredientVersion:2},
  'unbound-snapshot':{schemaVersion:'3',name,trackStock:false},
  legacy:{schemaVersion:'2',name,baseUnit:'g',trackStock:false},
 };
 const components=['snapshot-one','snapshot-two','snapshot-one','unbound-snapshot','legacy'].map((ingredientRef,index)=>({ingredientRef,knowledgeIngredientId:`00000000-0000-4000-8000-00000000001${index}`}));
 return projectTeamMeals({menuPlans:{week:{schemaVersion:'3',meals:[
  {date:'2026-10-05',mealType:'lunch',dishRef:'recipe',plannedServings:20},
  {date:'2026-10-05',mealType:'dinner',dishRef:'recipe',plannedServings:30},
 ]}},dishes:{recipe:{schemaVersion:'3',name:{zh:'使用此材料的菜',en:'Recipe using it',uk:'Страва з ним'},status:'active',components,steps:[],provenance:{source:'knowledge',recipeId,recipeVersion:2,snapshotHash:'c'.repeat(64)}}},ingredients,techniques:[]},
 {sourceRevision:revision,selection:[{menuPlanRef:'week',date:'2026-10-05',mealType:'lunch'},{menuPlanRef:'week',date:'2026-10-05',mealType:'dinner'}]});
}
function render(projection,id,lang) {
 const el=new Element('main');document.body.append(el);
 const stop=renderTeamDetails(el,{lang,projection,kind:'ingredient',id,asset:async()=>{throw Error('No images in source fixture');},href:(kind,id)=>`#/purchase/list/${kind}/${id}`});
 after(()=>{stop();el.remove();});return el;
}

test('a concrete canonical snapshot shows only its own sources while retaining repeated meals and components',()=>{
 for(const lang of ['zh','en','uk'])for(const [id,indices]of [['snapshot-one',[0,2]],['snapshot-two',[1]]]) {
  const projection=fixture(),before=JSON.stringify(projection),el=render(projection,id,lang),sources=el.querySelectorAll('.tm-detail-source-recipe');
  assert.equal(sources.length,indices.length*2,`${lang}/${id}`);
  for(const mealIndex of [0,1])for(const componentIndex of indices)assert(sources.some(source=>source.textContent.includes(`week / ${mealIndex} / ${componentIndex}`)));
  assert(sources.every(source=>source.querySelector('a').getAttribute('href')==='#/purchase/list/dish/recipe'));
  assert.equal(JSON.stringify(projection),before);
 }
});

test('stable unbound row and legacy sources without explicit snapshot refs remain available in all languages',()=>{
 for(const lang of ['zh','en','uk'])for(const id of ['unbound-snapshot','legacy']) {
  const projection=fixture(),el=render(projection,id,lang);
  assert.equal(el.querySelectorAll('.tm-detail-source-recipe').length,2,`${lang}/${id}`);
 }
});

test('an explicit foreign snapshot never falls back to its legacy group ID or a same-name record',()=>{
 const projection=fixture(),item=projection.collection.items.find(item=>item.ingredientRef==='legacy');
 item.sources.unshift({...item.sources[0],ingredientRef:'snapshot-two',dishRef:'foreign-recipe'});
 for(const lang of ['zh','en','uk']) {
  const el=render(projection,'legacy',lang),sources=el.querySelectorAll('.tm-detail-source-recipe');
  assert.equal(sources.length,2);assert(!sources.some(source=>source.querySelector('a').getAttribute('href').includes('foreign-recipe')));
 }
});
