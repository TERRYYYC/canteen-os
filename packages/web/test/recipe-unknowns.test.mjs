// #174 · ADR-0012 §11 / D3 design §4: "not said in the video" items on the prep list, the prep page's method and the dish page.
// Every dish, ingredient and step here is test data, not a kitchen recipe. Minimal DOM transport; not browser/layout evidence.
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Element} from './team-meals-pages-unload-dom.mjs';
import {publishedFixture} from './published-fixture.mjs';
import {projectTeamMeals} from '../../core/dist/index.js';

const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const require=createRequire(import.meta.url),esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const temp=await mkdtemp(join(tmpdir(),'recipe-unknowns-'));after(()=>rm(temp,{recursive:true,force:true}));
async function bundle(name,contents){
  const out=await esbuild.build({stdin:{contents,resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.BASE_URL':'"/"','import.meta.env.VITE_WORKER_URL':'""'},logLevel:'silent'});
  const file=join(temp,`${name}.mjs`);await writeFile(file,out.outputFiles[0].text);return import(pathToFileURL(file).href);
}
const pages=await bundle('pages',"export {renderPrepList} from './src/pages/prep-list';export {renderFrozenPrep} from './src/pages/prep';export {render as renderDishes} from './src/pages/dishes';export {createPublishedData} from './src/view-models/published';");
// The shared judgement is new; without it only its own tests fail, the page tests still run and say what is missing.
const shared=existsSync(join(root,'src/pages/recipe-unknowns.ts'))?await bundle('shared',"export * from './src/pages/recipe-unknowns';"):null;

const session=new Map();
globalThis.sessionStorage={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createElementNS:(_n,t)=>new Element(t),createTextNode:t=>new Element('',t)};
globalThis.MutationObserver=class{observe(){}disconnect(){}};
const all=n=>[n,...n.children.flatMap(all)];
const marked=(n,where)=>all(n).filter(x=>x.getAttribute('data-unknowns')===where).map(x=>x.textContent);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const LANGS=['zh','en','uk'];
const REVIEW_WORDS=/核对|复核|核定|仍需/;
const QUOTE='PRIVATE_VIDEO_QUOTE';

const ribsDish=()=>({schemaVersion:'3',name:{zh:'红烧排骨（测试）',en:'Braised ribs (test)',uk:'Тушковані реберця (тест)'},status:'active',
  components:[
    // 0 · only the original words: no cut, no number, no source, no standard ingredient
    {ingredientRef:'ribs',role:'main',originalAmount:'两斤',prep:{timing:'day-before'}},
    // 1 · everything the items ask about is in the data
    {ingredientRef:'chicken',role:'main',qty:{value:150,unit:'g'},qtySource:{kind:'measured',by:'chef',date:'2026-10-19'},canonicalIngredientId:'5a0e7c1d-2b3f-4c5d-8e6f-7a8b9c0d1e2f',canonicalIngredientVersion:1,
      prep:{techniqueRef:'dice',size:'2 cm',timing:'morning',leadTime:{value:30,unit:'min'}}},
    // 2 · a seasoning with only the original words
    {ingredientRef:'chili',role:'seasoning',originalAmount:'少许'},
    // 3 · a cut but no size, and no amount at all
    {ingredientRef:'scallion',role:'main',prep:{techniqueRef:'dice',timing:'morning'}},
    // 4 · to taste, no items
    {ingredientRef:'pepper',role:'seasoning',qty:{unit:'to-taste'},originalAmount:'适量'},
  ],
  steps:[{text:{zh:'腌排骨',en:'Marinate the ribs',uk:'Замаринувати реберця'}},{text:{zh:'下锅炒',en:'Stir-fry',uk:'Обсмажити'}}],
  unknowns:[
    {kind:'prep-ahead',action:'marinate',componentIndex:0},{kind:'prep-ahead',action:'marinate',componentIndex:1},
    {kind:'cut-size',componentIndex:0},{kind:'amount',componentIndex:0},{kind:'net-or-gross',componentIndex:0},{kind:'identity',componentIndex:0},
    {kind:'amount',componentIndex:1},{kind:'cut-size',componentIndex:1},{kind:'net-or-gross',componentIndex:1},{kind:'identity',componentIndex:1},
    {kind:'amount',componentIndex:2},{kind:'identity',componentIndex:2},
    {kind:'amount',componentIndex:3},{kind:'cut-size',componentIndex:3},
    {kind:'other',stepIndex:0},{kind:'cut-size',stepIndex:0},{kind:'heat',stepIndex:0},
    {kind:'heat',stepIndex:1},{kind:'duration',stepIndex:1},{kind:'doneness',stepIndex:1},
    {kind:'identity'},{kind:'amount'},
    {kind:'other',componentIndex:9},{kind:'heat',stepIndex:9}, // past the end: skipped, not an error
  ]});
const soupDish=()=>({schemaVersion:'3',name:{zh:'清汤（测试）',en:'Clear soup (test)',uk:'Прозорий суп (тест)'},status:'active',baseServings:4,
  components:[{ingredientRef:'water',qty:{value:1000,unit:'ml'},role:'main',prep:{techniqueRef:'dice',size:'1 cm',timing:'morning'}}],
  steps:[{text:{zh:'熬汤',en:'Simmer',uk:'Варити'}}],unknowns:[{kind:'prep-ahead',action:'other',stepIndex:0}]});
/** A version frozen before #174: no items, servings recorded. Nothing new may appear on it. */
const oldDish=()=>({schemaVersion:'3',name:{zh:'旧菜（测试）',en:'Old dish (test)',uk:'Стара страва (тест)'},status:'active',baseServings:2,
  components:[{ingredientRef:'water',qty:{value:500,unit:'ml'},role:'main',prep:{techniqueRef:'dice',size:'1 cm',timing:'morning'}}],steps:[{text:{zh:'煮',en:'Boil',uk:'Варити'}}]});
function projection(dishes={ribs:ribsDish(),soup:soupDish(),old:oldDish()}){
  const ingredient=(zh,en,uk,baseUnit='g')=>({schemaVersion:'2',name:{zh,en,uk},baseUnit,trackStock:false});
  const ingredients={ribs:ingredient('排骨','Pork ribs','Реберця'),chicken:ingredient('鸡腿肉','Chicken thigh','Куряче стегно'),chili:ingredient('辣椒面','Chili flakes','Пластівці чилі'),
    scallion:ingredient('葱','Scallion','Зелена цибуля'),pepper:ingredient('胡椒','Pepper','Перець'),water:ingredient('清水','Water','Вода','ml')};
  const techniques=[{id:'dice',kind:'cut',name:{zh:'丁',en:'Dice',uk:'Кубики'}}];
  const meals=Object.keys(dishes).map(dishRef=>({date:'2026-10-21',mealType:'lunch',dishRef,plannedServings:20}));
  return freeze(projectTeamMeals({menuPlans:{week:{schemaVersion:'3',meals}},dishes,ingredients,techniques},{sourceRevision:'c'.repeat(40),selection:[{menuPlanRef:'week',date:'2026-10-21',mealType:'lunch'}]}));
}
const rowsOf=p=>p.menuPlans.week.meals.map((meal,mealIndex)=>({menuPlanRef:'week',mealIndex,meal,dish:p.dishes[meal.dishRef]}));
const prepList=(lang,p=projection())=>pages.renderPrepList({lang,projection:p,rows:rowsOf(p),planId:'week',timing:'all',ingredientHref:()=>'#/prep/x',now:()=>new Date(2026,9,21)});
function cooking(lang,mealIndex=0,layout='cooking'){
  const el=new Element('main');document.body.append(el);
  const stop=pages.renderFrozenPrep(el,{mode:'real',projection:projection()},{lang,...(layout?{layout}:{}),selection:{menuPlanRef:'week',date:'2026-10-21',mealType:'lunch',mealIndex}});
  after(()=>{stop();el.remove();});return el;
}
async function dishPage(lang,dishRef='ribs',section='ingredients'){
  const p=projection(),view={planId:'week',projection:p,sourceRevision:p.sourceRevision,builtAt:'2026-10-20T00:00:00Z',issues:[]};
  const el=new Element('main');document.body.append(el);after(()=>el.remove());
  await pages.renderDishes(el,{lang,planId:'week',route:'dishes',rest:dishRef,publication:{kind:'team-meals',manifest:{plans:['week'],builtAt:'',commit:'c'}},publicationError:null,t:()=>'…',
    data:{loadPublishedTeamPlan:async()=>view,loadPublishedAsset:async()=>({kind:'not-recorded'})}});
  for(let i=0;i<8;i++)await Promise.resolve();
  all(el).filter(x=>x.getAttribute('class')==='dishes-tab')[section==='ingredients'?0:1].click();
  return el;
}

const EXPECTED={
  zh:{ahead:['红烧排骨（测试）：要提前腌，腌多久没说 · 问师傅','清汤（测试）：有一步要提前做，提前多久没说 · 问师傅'],
    servings:['份数还没录：红烧排骨（测试） · 标「原方」的量是原配方的量，这次备多少问师傅'],
    list:['没说：用量、毛重还是净重、用哪种 · 问师傅','切多大没说 · 问师傅','用哪种没说 · 问师傅'],
    card:['没说：切多大、毛重还是净重、用哪种 · 问师傅','用哪种没说 · 问师傅','切多大没说 · 问师傅'],
    step:['没说：切多大、还有别的 · 问师傅'],soupStep:['提前多久没说 · 问师傅'],
    dishRows:['没说：腌多久、切多大、用量、毛重还是净重、用哪种 · 问师傅','没说：用量、用哪种 · 问师傅','切多大没说 · 问师傅'],
    dishSteps:['没说：切多大、火候、还有别的 · 问师傅','没说：火候、做多久、做到什么样 · 问师傅'],
    whole:['这道菜还有没说清的：用量、用哪种 · 问师傅']},
  en:{ahead:['Braised ribs (test): marinate ahead; how long is not said · ask the chef','Clear soup (test): one step is done ahead; how far ahead is not said · ask the chef'],
    servings:['Servings not recorded yet: Braised ribs (test) · amounts marked “original” are the original recipe’s; ask the chef how much to prepare'],
    list:['Not said: how much, weight before or after trimming, which kind · ask the chef','Cut size is not said · ask the chef','Which kind is not said · ask the chef'],
    card:['Not said: cut size, weight before or after trimming, which kind · ask the chef','Which kind is not said · ask the chef','Cut size is not said · ask the chef'],
    step:['Not said: cut size, something else · ask the chef'],soupStep:['How far ahead is not said · ask the chef'],
    dishRows:['Not said: how long to marinate, cut size, how much, weight before or after trimming, which kind · ask the chef','Not said: how much, which kind · ask the chef','Cut size is not said · ask the chef'],
    dishSteps:['Not said: cut size, heat level, something else · ask the chef','Not said: heat level, how long to cook, when it is done · ask the chef'],
    whole:['Also not clear in this dish: how much, which kind · ask the chef']},
  uk:{ahead:['Тушковані реберця (тест): треба замаринувати заздалегідь; скільки — не сказано · спитайте шефа','Прозорий суп (тест): один крок роблять заздалегідь; наскільки — не сказано · спитайте шефа'],
    servings:['Кількість порцій ще не записано: Тушковані реберця (тест) · кількості з позначкою «за рецептом» — з оригінального рецепта; скільки готувати, спитайте шефа'],
    list:['Не сказано: скільки класти, вага до чи після чищення, який саме продукт · спитайте шефа','Розмір нарізки — не сказано · спитайте шефа','Який саме продукт — не сказано · спитайте шефа'],
    card:['Не сказано: розмір нарізки, вага до чи після чищення, який саме продукт · спитайте шефа','Який саме продукт — не сказано · спитайте шефа','Розмір нарізки — не сказано · спитайте шефа'],
    step:['Не сказано: розмір нарізки, ще дещо · спитайте шефа'],soupStep:['За скільки часу наперед — не сказано · спитайте шефа'],
    dishRows:['Не сказано: скільки маринувати, розмір нарізки, скільки класти, вага до чи після чищення, який саме продукт · спитайте шефа','Не сказано: скільки класти, який саме продукт · спитайте шефа','Розмір нарізки — не сказано · спитайте шефа'],
    dishSteps:['Не сказано: розмір нарізки, який вогонь, ще дещо · спитайте шефа','Не сказано: який вогонь, скільки готувати, до якого стану · спитайте шефа'],
    whole:['У цій страві ще не уточнено: скільки класти, який саме продукт · спитайте шефа']},
};

test('one shared judgement: the data already has the value → not shown, on every page alike (D3 §4.1 table)',()=>{
  assert(shared,'packages/web/src/pages/recipe-unknowns.ts');
  const dish=ribsDish(),row=i=>dish.unknowns.filter(u=>u.componentIndex===i);
  // Row 1 has a number, a size, a qty with its source (net, ADR-0012 §4), how far ahead and a standard ingredient.
  assert.deepEqual(row(1).filter(u=>!shared.settledByData(dish,u)),[]);
  assert.deepEqual(row(0).filter(u=>shared.settledByData(dish,u)),[]);
  // prep.timing says when, not how long: it does not settle prep-ahead. A qty without a source does not settle net-or-gross.
  const timed=structuredClone(dish);timed.components[0].prep.timing='day-before';timed.components[0].qty={value:5,unit:'g'};
  assert.equal(shared.settledByData(timed,{kind:'prep-ahead',action:'marinate',componentIndex:0}),false);
  assert.equal(shared.settledByData(timed,{kind:'net-or-gross',componentIndex:0}),false);
  assert.equal(shared.settledByData(timed,{kind:'amount',componentIndex:0}),true);
  // A step or the whole dish has no field to look at.
  for(const u of [{kind:'heat',stepIndex:1},{kind:'amount'},{kind:'prep-ahead',action:'other',stepIndex:0}])assert.equal(shared.settledByData(dish,u),false);
  // Only a hint the page says it shows stands in for an item; a missing field alone never removes the only hint.
  assert.deepEqual(shared.unknownsAt(dish,{component:0},shared.PREP_LIST_KINDS).map(u=>u.kind),['cut-size','amount','net-or-gross','identity']);
  assert.deepEqual(shared.unknownsAt(dish,{component:0},shared.PREP_LIST_KINDS,['cut','amount']).map(u=>u.kind),['net-or-gross','identity']);
  // Positions past the end are skipped; an item on a row is not repeated on a step.
  assert.deepEqual(shared.unknownsAt(dish,{component:9},shared.ALL_KINDS),[]);
  assert.deepEqual(shared.unknownsAt(dish,{step:1},shared.ALL_KINDS).map(u=>u.kind),['heat','duration','doneness']);
  assert.deepEqual(shared.unknownsAt(dish,'dish',shared.ALL_KINDS).map(u=>u.kind),['amount','identity']);
  assert.deepEqual(shared.prepAheadOf(dish),[{kind:'prep-ahead',action:'marinate',componentIndex:0}]);
  // No items, or no dish: nothing.
  assert.deepEqual(shared.unknownsAt(oldDish(),{component:0},shared.ALL_KINDS),[]);assert.deepEqual(shared.unknownsAt(undefined,'dish',shared.ALL_KINDS),[]);
});

test('prep list: a line per dish to do ahead, one servings line, and per row only cut size, amount, net or gross and which kind; seasonings only which kind',()=>{
  for(const lang of LANGS){
    const el=prepList(lang),e=EXPECTED[lang];
    assert.deepEqual(marked(el,'prep-ahead'),e.ahead,lang);
    assert.deepEqual(marked(el,'servings'),e.servings,lang);
    // by section: ribs (day before; 「还没写怎么切」 already asks about the cut) · scallion (morning; 「用量未录」 already asks
    // about the amount) · chili (seasonings: which kind only)
    assert.deepEqual(marked(el,'component'),e.list,lang);
    assert.doesNotMatch(el.textContent,REVIEW_WORDS,lang);assert(!el.textContent.includes(QUOTE));
  }
  assert.equal(prepList('zh').textContent.split('还没写怎么切').length-1,1,'the ribs row asks about the cut once, not twice');
  // Not moved to another time: the ribs stay under the timing the data has.
  assert(prepList('zh').children.some(s=>s.getAttribute('data-prep-section')==='day-before'&&s.textContent.includes('排骨')));
});

test('prep page method: steps say only how far ahead, cut size and anything else; ingredient cards as on the list; the menu recipe says nothing',()=>{
  for(const lang of LANGS){
    const el=cooking(lang),e=EXPECTED[lang];
    assert.deepEqual(marked(el,'step'),e.step,lang);
    // ribs (the card already asks how much) · chili · scallion
    assert.deepEqual(marked(el,'component'),e.card,lang);
    assert.deepEqual(marked(cooking(lang,1),'step'),e.soupStep,lang);
    assert.doesNotMatch(el.textContent,REVIEW_WORDS,lang);
    // Heat, how long and doneness stay on the dish page.
    assert(!/火候|做多久|做到什么样|heat level|how long to cook|який вогонь/.test(marked(el,'step').join('')));
    // The diners' recipe view (menu) shows none of them.
    assert.deepEqual(all(cooking(lang,0,null)).filter(x=>x.getAttribute('data-unknowns')),[],lang);
  }
});

test('dish page: every kind on rows and steps, and one line for the whole dish',async()=>{
  for(const lang of LANGS){
    const e=EXPECTED[lang],ingredients=await dishPage(lang),method=await dishPage(lang,'ribs','method');
    assert.deepEqual(marked(ingredients,'component'),e.dishRows,lang);
    assert.deepEqual(marked(ingredients,'dish'),e.whole,lang);
    assert.deepEqual(marked(method,'step'),e.dishSteps,lang);
    for(const el of [ingredients,method])assert.doesNotMatch(el.textContent,REVIEW_WORDS,lang);
  }
});

test('a version frozen before #174 (no items) shows nothing new on any page',async()=>{
  const p=projection({old:oldDish()});
  for(const lang of LANGS){
    for(const el of [prepList(lang,p),await dishPage(lang,'old'),await dishPage(lang,'old','method')])
      assert.deepEqual(all(el).filter(x=>x.getAttribute('data-unknowns')),[],lang);
  }
});

test('without a token: no quote and no back-office link next to these lines; with one, still no link in them',()=>{
  for(const withToken of [false,true]){
    session.clear();if(withToken)session.set('canteenos.token','A'.repeat(43));
    for(const el of [prepList('zh'),cooking('zh')]){
      const lines=all(el).filter(x=>x.getAttribute('data-unknowns'));
      assert(lines.length);
      for(const line of lines)assert(!all(line).some(x=>x.getAttribute('href')),`${withToken}: ${line.textContent}`);
      assert(!el.textContent.includes(QUOTE));
      if(!withToken)assert(!all(el).some(x=>/^#\/admin/.test(x.getAttribute('href')??'')),'no back-office entry without a token');
    }
  }
  session.clear();
});

test('published reader: accepts unknowns, keeps them as published, and rejects a wrong shape; old data without the field still loads',async()=>{
  const fixture=publishedFixture('normal');after(()=>fixture.cleanup());
  const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
  const dishRef=Object.keys(fixture.projection.dishes)[0];
  async function load(unknowns){
    const projection=structuredClone(fixture.projection);
    if(unknowns!==undefined)projection.dishes[dishRef].unknowns=unknowns;
    const api=pages.createPublishedData({baseUrl:'https://static.example.invalid/data/',fetch:async url=>new URL(url).pathname.endsWith('/build.json')?json(fixture.manifest):json(projection)});
    return api.loadPublishedTeamPlan(await api.loadPublication(),fixture.manifest.plans[0]);
  }
  assert.equal((await load()).projection.dishes[dishRef].unknowns,undefined);
  const good=[{kind:'prep-ahead',action:'marinate',componentIndex:0},{kind:'heat',stepIndex:0},{kind:'identity'},{kind:'other',componentIndex:99}];
  assert.deepEqual((await load(good)).projection.dishes[dishRef].unknowns,good,'past-the-end positions are the page’s to skip');
  for(const bad of ['not a list',[],[{kind:'nope'}],[{kind:'prep-ahead'}],[{kind:'amount',action:'marinate'}],[{kind:'prep-ahead',action:'fry'}],[{kind:'heat',stepIndex:-1}],[{kind:'heat',stepIndex:'0'}],[{kind:'heat',componentIndex:1.5}],['amount']])
    await assert.rejects(load(bad),{code:'invalid_data'},JSON.stringify(bad));
});
