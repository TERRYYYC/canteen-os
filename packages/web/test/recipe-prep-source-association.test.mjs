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
const temp=await mkdtemp(join(tmpdir(),'recipe-prep-source-'));after(()=>rm(temp,{recursive:true,force:true}));
const bundle=await esbuild.build({stdin:{contents:"export {renderFrozenPrep} from './src/pages/prep';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
await writeFile(join(temp,'prep.mjs'),bundle.outputFiles[0].text);
const {renderFrozenPrep}=await import(pathToFileURL(join(temp,'prep.mjs')).href);
globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag),createTextNode:text=>new Element('',text)};
globalThis.MutationObserver=class{observe(){}disconnect(){}};
const revision='a'.repeat(40),recipeId='00000000-0000-4000-8000-000000000001',canonicalId='00000000-0000-4000-8000-000000000002';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function fixture() {
 const ingredients={
  'canonical-v1':{schemaVersion:'3',name:{zh:'小米辣'},baseUnit:'g',trackStock:false,canonicalIngredientId:canonicalId,canonicalIngredientVersion:1},
  'canonical-v2':{schemaVersion:'3',name:{zh:'小米辣'},baseUnit:'g',trackStock:false,canonicalIngredientId:canonicalId,canonicalIngredientVersion:2},
  'unbound-v2':{schemaVersion:'3',name:{zh:'陈皮'},trackStock:false},
  legacy:{schemaVersion:'2',name:{zh:'旧材料'},baseUnit:'g',trackStock:false},
 };
 const components=[
  {ingredientRef:'canonical-v1',qty:{value:100,unit:'g'},originalAmount:'原方第一份100克',knowledgeIngredientId:'00000000-0000-4000-8000-000000000011'},
  {ingredientRef:'canonical-v2',qty:{value:50,unit:'g'},originalAmount:'原方第二份50克',knowledgeIngredientId:'00000000-0000-4000-8000-000000000012'},
  {ingredientRef:'canonical-v1',qty:{value:25,unit:'g'},originalAmount:'原方同材料第三份25克',knowledgeIngredientId:'00000000-0000-4000-8000-000000000013'},
  {ingredientRef:'unbound-v2',originalAmount:'三块提前泡水；另三块打碎',originalPreparation:{zh:'浸泡与打碎分开留用'},knowledgeIngredientId:'00000000-0000-4000-8000-000000000014',prep:{timing:'morning',size:'厨房补充，原量不变'}},
  {ingredientRef:'legacy',qty:{value:10,unit:'g'},originalAmount:'旧方10克'},
 ];
 const inputs={menuPlans:{week:{schemaVersion:'3',meals:[
  {date:'2026-10-05',mealType:'lunch',dishRef:'recipe',plannedServings:20},
  {date:'2026-10-05',mealType:'lunch',dishRef:'recipe',plannedServings:30},
 ]}},dishes:{recipe:{schemaVersion:'3',name:{zh:'测试原方'},baseServings:10,status:'active',components,steps:[{text:{zh:'保留原步骤15分钟'}}],provenance:{source:'knowledge',recipeId,recipeVersion:2,snapshotHash:'c'.repeat(64)}}},ingredients,techniques:[]};
 const projection=projectTeamMeals(inputs,{sourceRevision:revision,selection:[{menuPlanRef:'week',date:'2026-10-05',mealType:'lunch'}]});
 assert.equal(projection.collection.items.find(item=>item.ingredientRef.startsWith('kbci-')).sources.length,6);
 assert(projection.collection.items.some(item=>item.ingredientRef.startsWith('kbri-')));
 assert(projection.collection.items.some(item=>item.ingredientRef==='legacy'&&item.sources.every(source=>source.ingredientRef===undefined)));
 return projection;
}
function render(projection,lang,mealIndex,layout) {
 const el=new Element('main');document.body.append(el);
 const stop=renderFrozenPrep(el,freeze({mode:'real',projection}),{lang,layout,selection:{menuPlanRef:'week',date:'2026-10-05',mealType:'lunch',mealIndex}});
 after(()=>{stop();el.remove();});return el;
}

test('canonical snapshots, repeated components and repeated meals retain their own original and scaled amounts',()=>{
 for(const lang of ['zh','en','uk'])for(const layout of ['cooking',undefined])for(const mealIndex of [0,1]) {
  const el=render(fixture(),lang,mealIndex,layout),cards=el.querySelectorAll('[data-component-index]');
  assert.equal(cards.length,5);
  for(const [index,original,value]of [[0,'原方第一份100克',mealIndex===0?200:300],[1,'原方第二份50克',mealIndex===0?100:150],[2,'原方同材料第三份25克',mealIndex===0?50:75],[4,'旧方10克',mealIndex===0?20:30]]) {
   const text=cards[index].querySelector('[data-original-quantity]').textContent;
   assert(text.includes(original),`${lang}/${layout}/${mealIndex}/${index}: ${text}`);
   assert(text.includes(`${value} g`),text);
  }
 }
});

test('an unbound stable Recipe row preserves textual unknown amount and preparation in every language',()=>{
 for(const lang of ['zh','en','uk']) {
  const el=render(fixture(),lang,1),card=el.querySelectorAll('[data-component-index]')[3];
  assert.equal(card.querySelector('[data-original-quantity]').textContent,'三块提前泡水；另三块打碎');
  assert(card.textContent.includes('浸泡与打碎分开留用'));assert(card.textContent.includes('厨房补充，原量不变'));
  assert(el.textContent.includes('保留原步骤15分钟'));
 }
});

test('foreign concrete snapshots and wrong source addresses never supply another component quantity',()=>{
 const projection=fixture(),group=projection.collection.items.find(item=>item.ingredientRef.startsWith('kbci-'));
 const source=structuredClone(group.sources[0]);
 for(const delta of [{ingredientRef:'foreign'},{menuPlanRef:'other'},{mealIndex:99},{componentIndex:99},{date:'2026-10-06'},{mealType:'dinner'},{dishRef:'other'}])group.sources.unshift({...source,...delta,originalAmount:'错误来源不得显示',scaledQty:{value:999,unit:'g'}});
 const el=render(projection,'zh',0),text=el.querySelectorAll('[data-component-index]')[0].querySelector('[data-original-quantity]').textContent;
 assert(text.includes('原方第一份100克'));assert(text.includes('200 g'));assert(!text.includes('错误来源不得显示'));assert(!text.includes('999'));
});
