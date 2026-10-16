import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, after, beforeEach } from 'node:test';

const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const vr=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'prep-list-'));
after(()=>rm(dir,{recursive:true,force:true}));
async function loadPage(name){
  const entry=join(here,`../src/pages/${name}.ts`),source=await readFile(entry,'utf8');
  const bundle=await esbuild.build({stdin:{contents:source,resolveDir:dirname(entry),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
  const file=join(dir,`${name}.mjs`);await writeFile(file,bundle.outputFiles[0].text);return import(pathToFileURL(file));
}
// Minimal DOM transport; this is not browser/layout evidence.
class NodeDouble {
  constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.parentNode=null;this.text=text;this.listeners={};this.checked=false;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
  appendChild(c){if(typeof c==='string')c=new NodeDouble('',c);c.parentNode=this;this.children.push(c);return c;}
  append(...cs){cs.forEach(c=>this.appendChild(c));}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(v){this.children=[];this.text=String(v);}
  addEventListener(t,f){(this.listeners[t]??=[]).push(f);}
  click(){this.checked=!this.checked;for(const f of this.listeners.change??[])f({target:this});}
}
globalThis.document={body:new NodeDouble('body'),createElement:t=>new NodeDouble(t),createElementNS:(n,t)=>new NodeDouble(t),createTextNode:t=>new NodeDouble('',t)};
const all=n=>[n,...n.children.flatMap(all)];
const byAttr=(n,k,v)=>all(n).filter(x=>x.getAttribute(k)!==null&&(v===undefined||x.getAttribute(k)===v));
const byClass=(n,c)=>all(n).filter(x=>(x.getAttribute('class')??'').split(' ').includes(c));
const store=new Map();let broken=false,writeBroken=false;
// Storage is an own data property so a test can swap it for a throwing getter (SecurityError) and the next test can put it back.
const workingStorage=()=>Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:{getItem:k=>{if(broken)throw new Error('blocked');return store.get(k)??null},setItem:(k,v)=>{if(broken||writeBroken)throw new Error('QuotaExceededError');store.set(k,v)},removeItem:k=>{if(broken)throw new Error('blocked');store.delete(k)}}});
// After a test that broke storage the page may still hold its own marks; a tick and untick with working storage lets it catch up,
// then the store is emptied and read once more so the page starts from nothing.
beforeEach(()=>{broken=false;writeBroken=false;workingStorage();const box=byAttr(run(),'data-prep-done')[0];box.click();box.click();store.clear();run();});

const { renderPrepList, PREP_DONE_KEY, cutShape } = await loadPage('prep-list');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const meal=dishRef=>({date:'2026-10-19',mealType:'lunch',dishRef});
const KB_CUT='kbt-0f1e2d3c4b5a69788796a5b4c3d2e1f0-a1b2c3d4e5f6',KB_HEAT='kbt-11112222333344445555666677778888-0123456789ab';
// Dish a: old Git word-list shape. Dish kb: what a recipe-library adoption publishes (kbt- techniques, row roles,
// originalAmount on every row, shared ingredient records without a role).
function build(){
  const dishA={name:{zh:'炒蛋',uk:'Яєчня',en:'Eggs'},components:[
    {ingredientRef:'carrot',qty:{value:200,unit:'g'},prep:{techniqueRef:'roll-cut-chunks',size:'2 cm',timing:'day-before',note:{zh:'去皮',uk:'Очистити',en:'Peel'}}},
    {ingredientRef:'salt',qty:{value:5,unit:'g'},prep:{techniqueRef:'minced',timing:'morning'}},
    {ingredientRef:'onion',qty:{value:1,unit:'kg'}},
    {ingredientRef:'pepper',qty:{unit:'to-taste'},prep:{techniqueRef:'braise',timing:'before-service'}},
    {ingredientRef:'nameless'},
    {ingredientRef:'ghost-tech',qty:{value:3,unit:'g'},prep:{techniqueRef:'nope',size:'1 cm'}},
    {ingredientRef:'cabbage',originalAmount:'两把',prep:{techniqueRef:'fine-shreds',timing:'morning'}},
  ]};
  const dishKb={schemaVersion:'3',name:{zh:'凉拌黄瓜',uk:'Огірки'},components:[
    {ingredientRef:'kbi-cucumber-v1',qty:{value:500,unit:'g'},originalAmount:'一斤',role:'main',prep:{techniqueRef:KB_CUT,size:'1 cm',timing:'morning'}},
    {ingredientRef:'kbi-salt-v1',qty:{value:10,unit:'g'},originalAmount:'10克',role:'seasoning'},
    {ingredientRef:'kbi-chili-v1',originalAmount:'少许',role:'main',prep:{size:'2 cm 见方'},originalPreparation:{zh:'切丝'}},
    {ingredientRef:'kbi-garlic-v1',qty:{unit:'to-taste'},originalAmount:'适量',role:'seasoning',prep:{techniqueRef:KB_HEAT}},
  ]};
  const rows=[
    {menuPlanRef:'wk',mealIndex:0,meal:meal('a'),dish:dishA},
    {menuPlanRef:'wk',mealIndex:1,meal:meal('a'),dish:dishA},
    {menuPlanRef:'wk',mealIndex:2,meal:meal('kb-cuke-v1'),dish:dishKb},
  ];
  const scaled=[{menuPlanRef:'wk',mealIndex:0,componentIndex:0,date:'2026-10-19',mealType:'lunch',dishRef:'a',scaledQty:{value:1500,unit:'g'}}];
  return {rows,projection:freeze({ingredients:{
    carrot:{name:{zh:'胡萝卜',uk:'Морква',en:'Carrot'},role:'main'},
    salt:{name:{zh:'盐',uk:'Сіль'},role:'seasoning'},
    onion:{name:{zh:'洋葱',en:'Onion'},role:'main'},
    pepper:{name:{zh:'胡椒',uk:'Перець',en:'Pepper'},role:'main'},
    nameless:{name:{zh:'无名',en:'Nameless'},role:'main'},
    'ghost-tech':{name:{zh:'鬼',uk:'Привид'},role:'main'},
    cabbage:{name:{zh:'白菜',uk:'Капуста'},role:'main'},
    'kbi-cucumber-v1':{name:{zh:'黄瓜',uk:'Огірок',en:'Cucumber'}},
    'kbi-salt-v1':{name:{zh:'盐',uk:'Сіль'}},
    'kbi-chili-v1':{name:{zh:'小米辣',uk:'Перець чилі'}},
    'kbi-garlic-v1':{name:{zh:'蒜',uk:'Часник'}},
  },techniques:[
    {id:'roll-cut-chunks',kind:'cut',name:{zh:'滚刀块',uk:'Крупні шматки',en:'Roll-cut'}},
    {id:'minced',kind:'cut',name:{zh:'末',uk:'Фарш',en:'Minced'}},
    {id:'braise',kind:'heat',name:{zh:'焖',uk:'Тушкувати',en:'Braise'}},
    {id:'fine-shreds',kind:'cut',name:{en:'Fine shreds'}},
    {id:KB_CUT,kind:'cut',name:{zh:'丁',uk:'Дрібні кубики',en:'Small cubes'}},
    {id:KB_HEAT,kind:'heat',name:{zh:'末',uk:'Щось інше'}},
  ],collection:{items:[{ingredientRef:'carrot',sources:scaled}],issues:[]}})};
}
const TODAY=new Date(2026,9,19,9,0);
const run=(over={})=>{const b=build();return renderPrepList({lang:'zh',projection:b.projection,rows:b.rows,planId:'wk',timing:'all',ingredientHref:r=>`#/prep/2026-10-19/lunch/${r}`,now:()=>TODAY,...over});};
const sections=el=>byAttr(el,'data-prep-section').map(s=>s.getAttribute('data-prep-section'));
const itemsIn=(el,s)=>all(byAttr(el,'data-prep-section',s)[0]).filter(x=>x.getAttribute('data-prep-item')!==null);
const itemOf=(el,text)=>byAttr(el,'data-prep-item').find(i=>byClass(i,'prep-list-name')[0].textContent===text);
const subs=item=>byClass(item,'prep-list-sub').map(n=>n.textContent);
const ITEMS=18;

test('sections run day-before, morning, before-service, unset, seasoning last; a row role counts as well as the ingredient role',()=>{
  const el=run();assert.deepEqual(sections(el),['day-before','morning','before-service','unset','seasoning']);
  assert.equal(itemsIn(el,'seasoning').length,4,'salt of dish a twice, and the recipe-library salt and garlic by their row role');
  assert(itemsIn(el,'seasoning').some(i=>i.textContent.includes('蒜')),'a shared ingredient record without a role still goes last by its row role');
  assert(itemsIn(el,'unset').some(i=>i.textContent.includes('洋葱')),'no timing is not "morning"');
  assert(!itemsIn(el,'unset').some(i=>i.textContent.includes('白菜')));
});
test('a dish planned twice is listed twice; nothing merges by name across dishes',()=>{
  const el=run();assert.equal(byAttr(el,'data-prep-item').length,ITEMS);
  assert.equal(new Set(byAttr(el,'data-prep-item').map(x=>x.getAttribute('data-prep-item'))).size,ITEMS);
  assert.equal(byAttr(el,'data-prep-item').filter(i=>byClass(i,'prep-list-name')[0].textContent==='盐').length,3,'two salts of dish a and the recipe-library salt stay separate');
});
test('partner language sits on its own line under the ingredient, the cut and the dish: zh->uk, uk/en->zh, no fallback',()=>{
  const zh=itemOf(run(),'胡萝卜');
  assert.deepEqual(subs(zh),['Морква','Крупні шматки, 2 cm','Яєчня']);
  assert(byClass(zh,'prep-list-sub').every(n=>n.getAttribute('lang')==='uk'));
  const uk=itemOf(run({lang:'uk'}),'Морква');
  assert.deepEqual(subs(uk),['胡萝卜','滚刀块，2 cm','炒蛋']);assert(byClass(uk,'prep-list-sub').every(n=>n.getAttribute('lang')==='zh-Hans'));
  assert.deepEqual(subs(itemOf(run({lang:'en'}),'Carrot')),['胡萝卜','滚刀块，2 cm','炒蛋']);
  assert(!run().textContent.includes('Onion'),'zh reader: onion has no uk, nothing else fills in');
  assert.deepEqual(subs(itemOf(run({lang:'uk'}),'Капуста')),['白菜','炒蛋'],'the technique has no zh: no cut line in Chinese');
  const b=build(),same=renderPrepList({lang:'zh',projection:freeze({...b.projection,ingredients:{...b.projection.ingredients,carrot:{name:{zh:'胡萝卜',uk:'胡萝卜'},role:'main'}}}),rows:b.rows,planId:'wk',timing:'all',ingredientHref:()=>'#',now:()=>TODAY});
  assert.equal(subs(itemOf(same,'胡萝卜'))[0],'Крупні шматки, 2 cm','identical partner text is not repeated');
});
test('the dish line reads naturally in each language',()=>{
  assert.equal(byClass(itemOf(run(),'胡萝卜'),'prep-list-for')[0].textContent,'用于 炒蛋');
  assert.equal(byClass(itemOf(run({lang:'en'}),'Carrot'),'prep-list-for')[0].textContent,'For Eggs');
  assert.equal(byClass(itemOf(run({lang:'uk'}),'Морква'),'prep-list-for')[0].textContent,'Страва: Яєчня');
});
test('missing cut and unknown technique use plain words; a recorded size and original preparation stay visible',()=>{
  assert(run().textContent.includes('还没写怎么切 · 问师傅'));
  assert(run({lang:'en'}).textContent.includes('No cut written yet · ask the chef'));
  assert(run({lang:'uk'}).textContent.includes('Як нарізати — ще не записано · спитайте шефа'));
  const ghost=itemOf(run(),'鬼');assert(ghost.textContent.includes('技法资料未找到')&&ghost.textContent.includes('大小: 1 cm'));
  const chili=itemOf(run(),'小米辣');assert(chili.textContent.includes('还没写怎么切 · 问师傅')&&chili.textContent.includes('大小: 2 cm 见方')&&chili.textContent.includes('原方: 切丝'));
  assert(itemOf(run({lang:'uk'}),'Перець чилі').textContent.includes('Розмір: 2 cm 见方'));
  const kbSalt=byAttr(run(),'data-prep-item').find(i=>i.getAttribute('data-prep-item').includes('kbi-salt-v1'));
  assert(kbSalt.textContent.includes('10 克')&&!kbSalt.textContent.includes('问师傅'),'a seasoning with no cut recorded only gets its amount');
  assert(itemOf(run(),'胡萝卜')&&!byClass(itemOf(run(),'盐'),'prep-list-cut').some(n=>n.textContent.includes('问师傅')),'nor does the word-list seasoning');
});
test('quantity: this meal scaled; otherwise the original amount marked as such, in the reader’s units with the recorded words kept',()=>{
  const el=run(),day=itemsIn(el,'day-before');
  const first=day.find(i=>i.getAttribute('data-prep-item').includes('|a|0|0|')),second=day.find(i=>i.getAttribute('data-prep-item').includes('|a|1|0|'));
  assert.equal(byClass(first,'num')[0].textContent,'1.5 千克');assert(!first.textContent.includes('原方'));
  assert.equal(byClass(second,'num')[0].textContent,'200 克');assert(second.textContent.includes('原方'));
  assert(itemOf(el,'白菜').textContent.includes('两把')&&itemOf(el,'白菜').textContent.includes('原方'),'recorded words only: shown as written, marked original');
  const cuke=itemOf(el,'黄瓜');assert.equal(byClass(cuke,'num')[0].textContent,'500 克');assert(cuke.textContent.includes('原方'));assert.equal(byClass(cuke,'prep-list-wording')[0]?.textContent,'一斤');
  const ukCuke=itemOf(run({lang:'uk'}),'Огірок');assert.equal(byClass(ukCuke,'num')[0].textContent,'500 г');assert(ukCuke.textContent.includes('за рецептом'));
  const kbSalt=byAttr(el,'data-prep-item').find(i=>i.getAttribute('data-prep-item').includes('kbi-salt-v1'));
  assert.equal(byClass(kbSalt,'prep-list-wording').length,0,'10克 and 10 克 are the same words');
  const ukKbSalt=byAttr(run({lang:'uk'}),'data-prep-item').find(i=>i.getAttribute('data-prep-item').includes('kbi-salt-v1'));
  assert.equal(byClass(ukKbSalt,'prep-list-wording').length,0,'10克 is the same amount as 10 г, only in Chinese words');
  assert.equal(byClass(itemOf(run({lang:'en'}),'Cucumber'),'prep-list-wording')[0]?.textContent,'一斤','a different wording is kept in every language');
  assert(itemOf(el,'无名').textContent.includes('用量未录')&&!itemOf(el,'无名').textContent.includes('原方'));
  assert.equal(byClass(itemOf(run({lang:'uk'}),'Перець'),'num')[0].textContent,'За смаком');
  assert(!itemOf(run({lang:'uk'}),'Часник').textContent.includes('适量'),'the default to-taste words are not repeated in Chinese');
  assert(run({lang:'en'}).textContent.includes('original'));
});
test('this meal’s scaled amount keeps a different recorded wording as the original recipe’s words; the same amount in other words is not repeated; to-taste keeps its own words',()=>{
  // Real core: every row with a qty gets a scaledQty once servings are known, and to-taste rows always get {unit:'to-taste'}.
  const b=build(),kb=b.rows[2].dish;
  const dish={...kb,components:[...kb.components,{ingredientRef:'kbi-chili-v1',qty:{unit:'to-taste'},originalAmount:'少许',role:'main',prep:{timing:'morning'}}]};
  const src=(componentIndex,scaledQty)=>({menuPlanRef:'wk',mealIndex:2,componentIndex,date:'2026-10-19',mealType:'lunch',dishRef:'kb-cuke-v1',scaledQty});
  const items=[{ingredientRef:'kbi-cucumber-v1',sources:[src(0,{value:1000,unit:'g'})]},{ingredientRef:'kbi-salt-v1',sources:[src(1,{value:30,unit:'g'})]},
    {ingredientRef:'kbi-garlic-v1',sources:[src(3,{unit:'to-taste'})]},{ingredientRef:'kbi-chili-v1',sources:[src(4,{unit:'to-taste'})]}];
  const render=lang=>renderPrepList({lang,projection:freeze({...b.projection,collection:{items,issues:[]}}),rows:[{...b.rows[2],dish}],planId:'wk',timing:'all',ingredientHref:()=>'#',now:()=>TODAY});
  const byKey=(el,part)=>byAttr(el,'data-prep-item').find(i=>i.getAttribute('data-prep-item').includes(part));
  const zh=render('zh'),cuke=itemOf(zh,'黄瓜');
  assert.equal(byClass(cuke,'num')[0].textContent,'1 千克','this meal’s amount is the scaled one');
  assert.equal(byClass(cuke,'prep-list-wording')[0]?.textContent,'原方: 一斤','the recipe’s own words stay and are marked as the original, not passed off as this meal’s amount');
  assert.equal(byClass(itemOf(render('en'),'Cucumber'),'prep-list-wording')[0]?.textContent,'original: 一斤');
  assert.equal(byClass(itemOf(render('uk'),'Огірок'),'prep-list-wording')[0]?.textContent,'за рецептом: 一斤');
  const salt=byKey(zh,'|1|kbi-salt-v1');
  assert.equal(byClass(salt,'num')[0].textContent,'30 克');assert.equal(byClass(salt,'prep-list-wording')[0]?.textContent,'原方: 10克','this meal needs 30 g: the recipe’s 10克 is another amount, so it stays, marked as the original');
  const garlic=byKey(zh,'|3|kbi-garlic-v1');
  assert.equal(byClass(garlic,'num')[0].textContent,'适量');assert.equal(byClass(garlic,'prep-list-wording').length,0,'适量 is the default to-taste wording');
  const chili=byKey(zh,'|4|kbi-chili-v1');
  assert.equal(byClass(chili,'num')[0].textContent,'适量');assert.equal(byClass(chili,'prep-list-wording')[0]?.textContent,'少许','the recipe’s own to-taste words are kept');
  assert.equal(byClass(byKey(render('uk'),'|4|kbi-chili-v1'),'prep-list-wording')[0]?.textContent,'少许');
});
test('beside a scaled amount the recorded words are left out only when they say that same amount; the original 500 g stays beside this meal’s 1 kg',()=>{
  // #151 re-review: recipe 500 g recorded as "500 g" (in any language's words), planned for twice the servings → 1000 g.
  const b=build(),kb=b.rows[2].dish,shown={zh:['黄瓜','1 千克','原方'],en:['Cucumber','1 kg','original'],uk:['Огірок','1 кг','за рецептом']};
  const render=(lang,recorded,scaledQty)=>{
   const dish={...kb,components:kb.components.map((c,i)=>i===0?{...c,qty:{value:500,unit:'g'},originalAmount:recorded}:c)};
   const items=[{ingredientRef:'kbi-cucumber-v1',sources:[{menuPlanRef:'wk',mealIndex:2,componentIndex:0,date:'2026-10-19',mealType:'lunch',dishRef:'kb-cuke-v1',scaledQty}]}];
   return renderPrepList({lang,projection:freeze({...b.projection,collection:{items,issues:[]}}),rows:[{...b.rows[2],dish}],planId:'wk',timing:'all',ingredientHref:()=>'#',now:()=>TODAY});
  };
  for(const recorded of ['500 g','500 克','500 г'])for(const [lang,[name,amount,label]] of Object.entries(shown)){
   const doubled=itemOf(render(lang,recorded,{value:1000,unit:'g'}),name);
   assert.equal(byClass(doubled,'num')[0].textContent,amount,`${lang}/${recorded}: this meal’s amount`);
   assert.equal(byClass(doubled,'prep-list-wording')[0]?.textContent,`${label}: ${recorded}`,`${lang}/${recorded}: the original amount is not swallowed`);
   const same=itemOf(render(lang,recorded,{value:500,unit:'g'}),name);
   assert.equal(byClass(same,'prep-list-wording').length,0,`${lang}/${recorded}: the same 500 g is not written twice`);
  }
});
test('cut drawings for the six common cuts, by word-list id or by a recipe-library cut technique’s Chinese name',async()=>{
  assert.equal(cutShape({id:'roll-cut-chunks',kind:'cut',name:{zh:'滚刀块'}}),'roll-cut');
  assert.equal(cutShape({id:KB_CUT,kind:'cut',name:{zh:'丁'}}),'cubes');
  assert.equal(cutShape({id:KB_HEAT,kind:'heat',name:{zh:'末'}}),undefined,'only cut techniques');
  assert.equal(cutShape({id:'braise',kind:'heat',name:{zh:'焖'}}),undefined);
  const el=run(),drawn=byAttr(el,'data-cut-shape');
  assert.deepEqual(drawn.map(n=>n.getAttribute('data-cut-shape')).sort(),['cubes','minced','minced','roll-cut','roll-cut','shreds','shreds']);
  assert(drawn.every(n=>n.getAttribute('aria-hidden')==='true'));
  assert(all(el).filter(x=>x.tagName==='PATH').every(p=>p.getAttribute('stroke')===null),'the colour comes from prep.css');
  const css=await readFile(join(here,'../src/pages/prep.css'),'utf8');
  assert.match(css,/\.prep-list-shape svg path\{stroke:var\(--qinghua,var\(--accent\)\)\}/);
  assert.equal(byAttr(itemOf(el,'胡椒'),'data-cut-shape').length,0,'braise has no drawing');
});
test('ready ticks: ids only, saved on this phone, kept on repaint, labelled per item',()=>{
  const el=run(),box=byAttr(itemOf(el,'洋葱'),'data-prep-done')[0];
  assert.equal(box.getAttribute('aria-label'),'已备: 洋葱 · 用于 炒蛋');
  box.click();
  const saved=JSON.parse(store.get(PREP_DONE_KEY)),[key]=Object.keys(saved);
  assert.equal(key,'wk|2026-10-19|lunch|a|0|2|onion|1 kg','plan, date, meal, dish version, occurrence, row, ingredient and the amount to prepare');assert.equal(saved[key],'2026-10-19');
  assert(!/炒蛋|洋葱|Onion/.test(store.get(PREP_DONE_KEY)),'no names or recipe content are stored');
  assert(byAttr(run(),'data-prep-count')[0].textContent.includes(`已备 1 / ${ITEMS}`));
  assert(run({lang:'en'}).textContent.includes(`1 of ${ITEMS} ready`));assert(run({lang:'uk'}).textContent.includes(`Готово 1 з ${ITEMS}`));
  assert.equal(byClass(run(),'done').length,1);
  byAttr(itemOf(run(),'洋葱'),'data-prep-done').find(x=>x.checked).click();
  assert.deepEqual(JSON.parse(store.get(PREP_DONE_KEY)),{});
});
test('a mark follows its dish when the plan is republished: another dish in its place does not inherit it, a dish added before it does not move it',()=>{
  byAttr(itemOf(run(),'洋葱'),'data-prep-done')[0].click();
  const b=build(),render=rows=>renderPrepList({lang:'zh',projection:b.projection,rows,planId:'wk',timing:'all',ingredientHref:()=>'#',now:()=>TODAY});
  const replaced=render([{...b.rows[0],meal:meal('b')},{...b.rows[2],mealIndex:1}]);
  assert.equal(byClass(replaced,'done').length,0,'dish b now sits where dish a was: no mark');
  const inserted=render([{...b.rows[2],mealIndex:0},{...b.rows[0],mealIndex:1},{...b.rows[1],mealIndex:2}]);
  const done=byClass(inserted,'done');
  assert.equal(done.length,1);assert.equal(done[0].textContent,'洋葱','the first 炒蛋 keeps its onion mark after a dish is added before it');
});
test('a mark is tied to the amount to prepare: the same recipe version republished with other servings asks again; another language does not',()=>{
  const b=build();
  const at=scaledQty=>({menuPlanRef:'wk',mealIndex:0,componentIndex:0,date:'2026-10-19',mealType:'lunch',dishRef:'a',scaledQty});
  const render=(sources,lang='zh')=>renderPrepList({lang,projection:freeze({...b.projection,collection:{items:[{ingredientRef:'carrot',sources}],issues:[]}}),rows:b.rows,planId:'wk',timing:'all',ingredientHref:()=>'#',now:()=>TODAY});
  const el=render([at({value:500,unit:'g'})]);
  byAttr(itemOf(el,'胡萝卜'),'data-prep-done')[0].click();
  assert.equal(byClass(render([at({value:500,unit:'g'})]),'done').length,1,'same demand: still ready');
  assert.equal(byClass(render([at({value:500,unit:'g'})],'uk'),'done').length,1,'the same amount read in another language: still ready');
  assert.equal(byClass(render([at({value:1000,unit:'g'})]),'done').length,0,'servings 4 → 8 with the same dish version: 500 g ready does not mean 1 kg ready');
  assert.equal(byClass(render([]),'done').length,0,'servings removed: the original amount is another demand');
  assert(!/胡萝卜|Carrot|Морква|炒蛋/.test(store.get(PREP_DONE_KEY)),'still no names or recipe content stored');
});
test('a storage getter that throws (SecurityError) does not stop the list; the mark lives in memory for this visit',()=>{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('SecurityError');}});
  const el=run();assert.equal(byAttr(el,'data-prep-item').length,ITEMS,'the list still renders');
  byAttr(itemOf(el,'洋葱'),'data-prep-done')[0].click();
  assert(byAttr(el,'data-prep-count')[0].textContent.includes(`已备 1 / ${ITEMS}`));
  assert.deepEqual(byClass(run(),'done').map(n=>n.textContent),['洋葱'],'a repaint keeps the mark');
});
test('readable storage whose writes fail (quota): a repaint keeps this page’s marks instead of the older stored state',()=>{
  store.set(PREP_DONE_KEY,JSON.stringify({'wk|2026-10-19|lunch|a|0|0|carrot|1500 g':'2026-10-19'}));
  writeBroken=true;
  const el=run();byAttr(itemOf(el,'洋葱'),'data-prep-done')[0].click();
  const again=run();
  assert(byClass(again,'done').some(n=>n.textContent==='洋葱'),'the unsaved tick survives a repaint');
  assert.deepEqual(byClass(again,'done').map(n=>n.textContent).sort(),['洋葱','胡萝卜'],'the mark read from storage before the failure stays too');
  byAttr(itemOf(again,'胡萝卜'),'data-prep-done')[0].click();
  assert.deepEqual(byClass(run(),'done').map(n=>n.textContent),['洋葱'],'an unsaved untick does not come back from storage');
  assert.equal(byClass(run({lang:'uk'}),'done').length,1,'nor on a language change');
  writeBroken=false;
  byAttr(itemOf(run(),'鬼'),'data-prep-done')[0].click();
  assert.deepEqual(Object.keys(JSON.parse(store.get(PREP_DONE_KEY))).sort(),['wk|2026-10-19|lunch|a|0|2|onion|1 kg','wk|2026-10-19|lunch|a|0|5|ghost-tech|3 g'],'once a write succeeds, storage carries this page’s state');
});
test('after a failed write the page still reads storage: a mark another tab saves meanwhile is shown, and the next successful write keeps it beside this page’s own changes',()=>{
  writeBroken=true;
  const el=run();byAttr(itemOf(el,'洋葱'),'data-prep-done')[0].click();
  // Another tab (or the same phone in another window) ticks the carrot while this page's write is still failing.
  store.set(PREP_DONE_KEY,JSON.stringify({'wk|2026-10-19|lunch|a|0|0|carrot|1500 g':'2026-10-19'}));
  assert.deepEqual(byClass(run(),'done').map(n=>n.textContent).sort(),['洋葱','胡萝卜'],'the other tab’s mark shows next to this page’s unsaved tick');
  // The other tab unticks the carrot again: this page did not touch it, so it goes.
  store.set(PREP_DONE_KEY,JSON.stringify({}));
  assert.deepEqual(byClass(run(),'done').map(n=>n.textContent),['洋葱'],'a mark this page never changed follows storage');
  store.set(PREP_DONE_KEY,JSON.stringify({'wk|2026-10-19|lunch|a|0|0|carrot|1500 g':'2026-10-19'}));
  writeBroken=false;
  byAttr(itemOf(run(),'鬼'),'data-prep-done')[0].click();
  assert.deepEqual(Object.keys(JSON.parse(store.get(PREP_DONE_KEY))).sort(),['wk|2026-10-19|lunch|a|0|0|carrot|1500 g','wk|2026-10-19|lunch|a|0|2|onion|1 kg','wk|2026-10-19|lunch|a|0|5|ghost-tech|3 g'],'the first successful write merges this page’s changes into what is stored instead of replacing it');
  assert.deepEqual(byClass(run(),'done').map(n=>n.textContent).sort(),['洋葱','胡萝卜','鬼'].sort());
});
test('the key format changed, so the store name moved on: marks saved under the old name are neither read nor carried, and the old entry is removed',()=>{
  const LEGACY='canteenos.prep.done.v1';
  assert.notEqual(PREP_DONE_KEY,LEGACY,'a key without the amount segment must not share a store with the new format');
  store.set(LEGACY,JSON.stringify({'wk|2026-10-19|lunch|a|0|2|onion':'2026-10-19'}));
  const el=run();assert.equal(byClass(el,'done').length,0,'an old-format mark is not shown');
  byAttr(itemOf(el,'鬼'),'data-prep-done')[0].click();
  assert.deepEqual(Object.keys(JSON.parse(store.get(PREP_DONE_KEY))),['wk|2026-10-19|lunch|a|0|5|ghost-tech|3 g'],'only new-format entries are written');
  assert.equal(store.has(LEGACY),false,'the old store is cleared instead of lingering until its dates expire');
});
test('marks older than seven days are neither shown nor kept; the clock is read when ticking',()=>{
  store.set(PREP_DONE_KEY,JSON.stringify({'wk|2026-10-19|lunch|a|0|2|onion|1 kg':'2026-10-01','wk|2026-10-19|lunch|a|0|0|carrot|1500 g':'2026-10-15'}));
  const el=run();assert.equal(byClass(el,'done').length,1,'the 18-day-old mark is not shown');
  let now=new Date(2026,9,20,0,5);
  const late=renderPrepList({lang:'zh',...(()=>{const b=build();return{projection:b.projection,rows:b.rows};})(),planId:'wk',timing:'all',ingredientHref:()=>'#',now:()=>now});
  byAttr(itemOf(late,'鬼'),'data-prep-done')[0].click();
  const saved=JSON.parse(store.get(PREP_DONE_KEY));
  assert.equal(saved['wk|2026-10-19|lunch|a|0|5|ghost-tech|3 g'],'2026-10-20','ticked after midnight: today’s date');
  assert.equal('wk|2026-10-19|lunch|a|0|2|onion|1 kg' in saved,false);assert.equal(saved['wk|2026-10-19|lunch|a|0|0|carrot|1500 g'],'2026-10-15');
});
test('unavailable storage does not crash the page and the mark stays for this visit',()=>{
  broken=true;const el=run();byAttr(el,'data-prep-done')[0].click();
  assert(byAttr(el,'data-prep-count')[0].textContent.includes(`已备 1 / ${ITEMS}`));
  assert.equal(byClass(run(),'done').length,1);
});
test('timing filter shows only that section, seasonings stay, hidden untimed items are mentioned',()=>{
  const el=run({timing:'morning'});assert.deepEqual(sections(el),['morning','seasoning']);
  assert(byAttr(el,'data-prep-count')[0].textContent.includes('/ 7'));
  assert(byClass(el,'prep-list-hidden')[0].textContent.includes('另有 7 项没写准备时机'));
  assert.equal(byClass(run(),'prep-list-hidden').length,0);
  assert(byClass(run({lang:'uk',timing:'morning'}),'prep-list-hidden')[0].textContent.includes('Усі терміни підготовки'));
});
test('dishes without a recipe or without ingredients are named, not silently dropped, and not counted',()=>{
  const b=build(),rows=[...b.rows,{menuPlanRef:'wk',mealIndex:3,meal:meal('gone'),dish:undefined},{menuPlanRef:'wk',mealIndex:4,meal:meal('empty'),dish:{name:{zh:'空菜',uk:'Порожня'}}}];
  const el=renderPrepList({lang:'zh',projection:b.projection,rows,planId:'wk',timing:'all',ingredientHref:()=>'#',now:()=>TODAY});
  const notes=byClass(el,'prep-list-notice').map(n=>n.textContent);
  assert.deepEqual(notes,['有一道菜的菜谱未找到 · 问师傅','空菜：尚未录入配料 · 问师傅']);
  assert(byAttr(el,'data-prep-count')[0].textContent.includes(`/ ${ITEMS}`));assert(!el.textContent.includes('gone'));
  const none=renderPrepList({lang:'uk',projection:b.projection,rows:[],planId:'wk',timing:'all',ingredientHref:()=>'#',now:()=>TODAY});
  assert(none.textContent.includes('Для цього прийому їжі ще не записано'));assert.equal(byAttr(none,'data-prep-count')[0].textContent,'');
});
test('three languages; no video links, ids, hashes or back-office links in the visible text',()=>{
  for(const lang of ['zh','en','uk']){
    const el=run({lang}),t=el.textContent;
    assert(!/https?:|video|视频|kbt-|kbi-|kb-cuke|[0-9a-f]{12}|schemaVersion|revision|#\/admin/i.test(t),t);
    assert(all(el).every(x=>!x.getAttribute('href')||/^#\/prep\//.test(x.getAttribute('href'))));
  }
  assert(run().textContent.includes('要准备的')&&run().textContent.includes('怎么切、切多少'));
  assert(run({lang:'en'}).textContent.includes('What to prepare'));assert(run({lang:'uk'}).textContent.includes('Що підготувати'));
});
test('ingredient names link to the existing detail',()=>{
  assert.equal(byAttr(run(),'data-ingredient-link','carrot')[0].getAttribute('href'),'#/prep/2026-10-19/lunch/carrot');
});
