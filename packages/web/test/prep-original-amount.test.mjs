import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Element} from './team-meals-pages-unload-dom.mjs';
import {projectTeamMeals} from '../../core/dist/index.js';

// #130: recorded original text, a missing quantity and missing servings are different states on Prep.
const require=createRequire(import.meta.url),esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const temp=await mkdtemp(join(tmpdir(),'prep-original-amount-'));after(()=>rm(temp,{recursive:true,force:true}));
const bundle=await esbuild.build({stdin:{contents:"export {renderFrozenPrep,rawQuantityText,recordedAmountText} from './src/pages/prep';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
await writeFile(join(temp,'prep.mjs'),bundle.outputFiles[0].text);
const {renderFrozenPrep,rawQuantityText,recordedAmountText}=await import(pathToFileURL(join(temp,'prep.mjs')).href);
globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag),createTextNode:text=>new Element('',text)};
globalThis.MutationObserver=class{observe(){}disconnect(){}};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const LANGS=['zh','en','uk'];
const COPY={
 zh:{text:/原方用量已记录，暂不能自动换算或按份数计算/,unrecorded:/用量未录，无法确定这项备料量/,recipe:/配方基准份数未录/,planned:/计划份数未录/,thisMeal:'本次',plannedFact:'计划份数: ',baseFact:'原配方基准份数: ',notRecorded:'未录'},
 en:{text:/The original amount is recorded as text and cannot yet be converted or scaled to servings/,unrecorded:/Quantity is not recorded; the preparation amount is unknown/,recipe:/Recipe servings are not recorded/,planned:/Planned servings are not recorded/,thisMeal:'This meal',plannedFact:'Planned servings: ',baseFact:'Original recipe servings: ',notRecorded:'Not recorded'},
 uk:{text:/Вихідну кількість записано текстом; її поки не можна автоматично перерахувати/,unrecorded:/Кількість не записано; потрібний обсяг підготовки невідомий/,recipe:/Базові порції рецепта не записано/,planned:/Порції в плані не записано/,thisMeal:'Цей прийом',plannedFact:'Заплановані порції: ',baseFact:'Базові порції рецепта: ',notRecorded:'Не записано'},
};
const UNRECORDED_LABEL=/用量未录|Quantity is not recorded|Quantity not recorded|Кількість не записано/;

function projection(){
 const ingredient=(zh,en,uk,baseUnit='g')=>({schemaVersion:'2',name:{zh,en,uk},baseUnit,trackStock:false});
 const ingredients={ribs:ingredient('排骨','Pork ribs','Свинячі реберця'),ginger:ingredient('姜','Ginger','Імбир'),salt:ingredient('盐','Salt','Сіль'),
  sugar:ingredient('冰糖','Rock sugar','Кам’яний цукор'),garlic:ingredient('蒜','Garlic','Часник'),water:ingredient('清水','Water','Вода','ml')};
 const steps=[{text:{zh:'排骨焯水后红烧。',en:'Blanch the ribs, then braise them.',uk:'Бланшуйте реберця, потім тушкуйте.'}}];
 const dishes={
  // Real KB shape from the issue: text amount kept, no reliable structured qty, recipe servings unknown.
  ribs:{schemaVersion:'3',name:{zh:'红烧排骨',en:'Braised pork ribs',uk:'Тушковані свинячі реберця'},status:'active',steps,components:[
   {ingredientRef:'ribs',originalAmount:'两斤'},
   {ingredientRef:'ginger'},
   {ingredientRef:'salt',qty:{unit:'to-taste'},originalAmount:'少许'},
   {ingredientRef:'sugar',qty:{value:30,unit:'g'},originalAmount:'30克'},
   {ingredientRef:'garlic',originalAmount:'未录用量'},
   {ingredientRef:'water',qty:{unit:'ml'},originalAmount:'一大碗'},
  ]},
  soup:{schemaVersion:'3',name:{zh:'清汤',en:'Clear soup',uk:'Прозорий суп'},status:'active',baseServings:4,steps,
   components:[{ingredientRef:'water',qty:{value:1000,unit:'ml'},originalAmount:'1升'}]},
 };
 const menuPlans={week:{schemaVersion:'3',meals:[
  {date:'2026-10-20',mealType:'lunch',dishRef:'ribs',plannedServings:30},
  {date:'2026-10-20',mealType:'lunch',dishRef:'soup'},
  {date:'2026-10-20',mealType:'dinner',dishRef:'ribs'},
  {date:'2026-10-20',mealType:'dinner',dishRef:'soup',plannedServings:8},
 ]}};
 return projectTeamMeals({menuPlans,dishes,ingredients,techniques:[]},{sourceRevision:'c'.repeat(40),selection:[
  {menuPlanRef:'week',date:'2026-10-20',mealType:'lunch'},{menuPlanRef:'week',date:'2026-10-20',mealType:'dinner'}]});
}
const MEALS=[{mealIndex:0,mealType:'lunch'},{mealIndex:1,mealType:'lunch'},{mealIndex:2,mealType:'dinner'},{mealIndex:3,mealType:'dinner'}];
function render(lang,mealIndex,cooking=true){
 const el=new Element('main');document.body.append(el);
 const stop=renderFrozenPrep(el,freeze({mode:'real',projection:projection()}),{lang,...(cooking?{layout:'cooking'}:{}),selection:{menuPlanRef:'week',date:'2026-10-20',...MEALS[mealIndex]}});
 after(()=>{stop();el.remove();});return el;
}
// Ordinary reading: a closed native disclosure only shows its summary.
const visible=node=>node.hidden?'':node.tagName==='DETAILS'&&!node.open?(node.children.find(c=>c.tagName==='SUMMARY')?.textContent??''):node.text+node.children.map(visible).join(' ');
const cards=el=>el.querySelectorAll('[data-component-index]');
const quantity=card=>card.querySelector('[data-original-quantity]').textContent;
const notes=node=>node.querySelectorAll('.prep-task-note').map(n=>n.textContent);

test('recorded original text is kept verbatim; blank text and the KB unknown placeholder are not recorded text',()=>{
 assert.equal(recordedAmountText(' 两斤 '),'两斤');
 for(const blank of [undefined,'','   ','未录用量'])assert.equal(recordedAmountText(blank),undefined);
});

// The repair link is a chef back-office entry, so it is asserted with a chef token in the session: this holds
// whether or not shared pages without a token hide those entries (#145 covers the case without a token).
const session=new Map();
globalThis.sessionStorage={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
test('state 1: an original amount without a structured quantity keeps its text and says it cannot be converted yet',()=>{
 session.set('canteenos.token','A'.repeat(43));
 try{
 for(const lang of LANGS)for(const mealIndex of [0,2]){
  const all=cards(render(lang,mealIndex));
  for(const [index,text] of [[0,'两斤'],[5,'一大碗']]){
   const card=all[index],where=`${lang}/meal ${mealIndex}/component ${index}`;
   assert.equal(quantity(card),text,`${where}: the original text is shown as recorded, never converted`);
   assert.match(visible(card),COPY[lang].text,`${where}: explains the recorded amount is not yet computable`);
   assert.doesNotMatch(visible(card),UNRECORDED_LABEL,`${where}: recorded text is never reported as not recorded`);
   assert.doesNotMatch(card.textContent,COPY[lang].unrecorded,where);
   assert.equal(notes(card).length,1,`${where}: one quantity note`);
   assert(card.querySelectorAll('a').some(a=>a.getAttribute('href')==='#/admin/dish/ribs'),`${where}: repair link to the frozen recipe`);
  }
 }
 }finally{session.delete('canteenos.token');}
});

test('state 2: only an ingredient with neither original text nor a structured quantity is reported as not recorded',()=>{
 for(const lang of LANGS){
  const all=cards(render(lang,0));
  for(const index of [1,4]){
   const card=all[index],where=`${lang}/component ${index}`;
   assert.equal(quantity(card),rawQuantityText(undefined,lang),`${where}: localized not-recorded label`);
   assert(!quantity(card).includes('未录用量'),`${where}: the KB placeholder is not shown as original text`);
   assert.match(visible(card),COPY[lang].unrecorded,where);
   assert.doesNotMatch(visible(card),COPY[lang].text,where);
  }
  for(const index of [2,3])assert.deepEqual(notes(all[index]),[],`${lang}/component ${index}: to-taste and structured quantities need no quantity note`);
  assert(quantity(all[2]).includes('少许'));assert.equal(quantity(all[3]),'30克');
 }
});

test('state 3: unknown recipe servings and unknown planned servings are explained separately, never as a missing quantity',()=>{
 const expected=[{mealIndex:0,recipe:true,planned:false},{mealIndex:1,recipe:false,planned:true},{mealIndex:2,recipe:true,planned:true},{mealIndex:3,recipe:false,planned:false}];
 for(const lang of LANGS)for(const {mealIndex,recipe,planned} of expected){
  const el=render(lang,mealIndex),where=`${lang}/meal ${mealIndex}`;
  const record=el.querySelectorAll('details').find(n=>n.getAttribute('class')==='prep-recipe-record');
  assert(record,`${where}: recipe record`);
  const servings=notes(record),recipeNotes=servings.filter(text=>COPY[lang].recipe.test(text)),plannedNotes=servings.filter(text=>COPY[lang].planned.test(text));
  assert.equal(recipeNotes.length,recipe?1:0,`${where}: recipe servings note`);
  assert.equal(plannedNotes.length,planned?1:0,`${where}: planned servings note`);
  assert.equal(servings.length,recipeNotes.length+plannedNotes.length,`${where}: no combined servings note`);
  assert(servings.every(text=>!UNRECORDED_LABEL.test(text)&&!COPY[lang].text.test(text)),`${where}: servings notes are not quantity notes`);
  for(const card of cards(el))assert(notes(card).every(text=>!COPY[lang].recipe.test(text)&&!COPY[lang].planned.test(text)),`${where}: ingredient notes do not stand in for servings`);
  if(recipe&&planned)assert.notEqual(recipeNotes[0],plannedNotes[0]);
 }
});

test('servings are never invented: only a meal with both recorded servings shows a scaled amount',()=>{
 for(const lang of LANGS){
  const scaled=quantity(cards(render(lang,3))[0]);
  assert(scaled.includes(COPY[lang].thisMeal)&&scaled.includes('2000 ml')&&scaled.includes('1升'),`${lang}: 1000 ml × 8 / 4 with original kept: ${scaled}`);
  assert.equal(quantity(cards(render(lang,1))[0]),'1升',`${lang}: planned servings unknown → original only`);
  assert.equal(quantity(cards(render(lang,0))[3]),'30克',`${lang}: recipe servings unknown → original only`);
  const facts=mealIndex=>render(lang,mealIndex).querySelectorAll('details').find(n=>n.getAttribute('class')==='prep-recipe-record').querySelectorAll('p').map(p=>p.textContent);
  const {plannedFact,baseFact,notRecorded}=COPY[lang];
  assert(facts(0).includes(`${plannedFact}30`)&&facts(0).includes(`${baseFact}${notRecorded}`),`${lang}: recipe servings stay not recorded`);
  assert(facts(1).includes(`${plannedFact}${notRecorded}`)&&facts(1).includes(`${baseFact}4`),`${lang}: planned servings stay not recorded`);
 }
});

test('the recipe view outside the cooking layout keeps recorded text without a not-recorded label',()=>{
 for(const lang of LANGS){
  const card=cards(render(lang,0,false))[0];
  assert.equal(quantity(card),'两斤');assert.doesNotMatch(card.textContent,UNRECORDED_LABEL);
 }
});
