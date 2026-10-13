/**
 * "Copy for suppliers": buy-not-bought decisions of one saved list, grouped by the fixed basis' purchase
 * supplier in the week-41 order format. Numbers come from the core estimate; no internal ids reach the text.
 */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'supplier-copy-'));after(()=>rm(dir,{recursive:true,force:true}));
const built=await esbuild.build({stdin:{contents:`export * from './src/pages/purchase';export * from './src/api/team-meals';export {supplierCopy} from './src/pages/supplier-copy';export {shoppingCopy} from './src/pages/shopping-copy';export {projectTeamMeals,estimateShoppingList,createShoppingList,applyShoppingDecision,UNSPECIFIED_SUPPLIER} from '@canteenos/core';`,resolveDir:join(here,'..')},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
const file=join(dir,'page.mjs');await writeFile(file,built.outputFiles[0].text);const module=await import(pathToFileURL(file));

// Week-41 golden data: the engine numbers the buyer tested (番茄 19 包 × 5 kg …).
const golden=join(here,'../../../test/fixtures/contracts/valid/golden/data'),root=join(here,'../../..');
async function records(folder){return Object.fromEntries(await Promise.all((await readdir(join(golden,folder))).filter(f=>f.endsWith('.json')).map(async f=>[f.slice(0,-5),JSON.parse(await readFile(join(golden,folder,f),'utf8'))])));}
const seed={menuPlans:{'week-41':JSON.parse(await readFile(join(golden,'menu-plans/week-41.json'),'utf8'))},dishes:await records('dishes'),ingredients:await records('ingredients'),techniques:JSON.parse(await readFile(join(golden,'techniques.json'),'utf8'))};
const fieldTest=name=>readFile(join(root,'docs/field-test/week-41',`purchase-order-${name}.txt`),'utf8');
const A='a'.repeat(40),B='b'.repeat(40),LIST='week41-shop',RANGE='2026-10-05 – 2026-10-09';
const selection=seed.menuPlans['week-41'].meals.map(m=>({menuPlanRef:'week-41',date:m.date,mealType:m.mealType}));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
/** Projection, estimate and a saved-shape list from the actual core, with explicit decisions. */
function view(decisions,{inputs=seed,slots=selection,version='2'}={}){
 const projection=module.projectTeamMeals(inputs,{sourceRevision:A,selection:slots},{identity:version==='2'?'canonical':'snapshot'});
 const estimate=module.estimateShoppingList(inputs,slots,'2026-10-03',version==='2'?'canonical':'snapshot');
 let list=module.createShoppingList(LIST,{sourceRevision:A,selection:slots},inputs,version);
 for(const [id,decision,bought] of decisions)list=module.applyShoppingDecision(list,id,decision,bought);
 return freeze({projection,estimate,list});
}
const copy=(v,lang='zh')=>{const before=JSON.stringify(v),out=module.supplierCopy(v.list,v.projection,lang,v.estimate);assert.equal(JSON.stringify(v),before,'inputs are not mutated');return out;};
const ALL=['cooking-oil','egg','salt','scallion','tomato'];
const internal=(text,v)=>{
 for(const marker of [A,LIST,'week-41','kbci-','[',']','计划行','配料项','Plan row','Recipe item','Рядок плану','Складник рецепту'])assert.ok(!text.includes(marker),`no internal marker ${marker}`);
 assert.ok(!text.includes(v.projection.sourceRevision));
};

test('all items decided buy reproduce the week-41 messages the buyer tested, with the list date range',async()=>{
 const v=view(ALL.map(id=>[id,'buy'])),out=copy(v);
 const expected=[await fieldTest('hongda'),await fieldTest('lvyuan')].map(text=>text.trimEnd().replace('2026-10-03',RANGE)).join('\n\n');
 assert.equal(out.text,expected);assert.equal(out.items,5);assert.equal(out.unquantified,0);
 assert.match(out.text,/^番茄 {2}19 包 × 5 kg（共 95 kg）$/m);assert.match(out.text,/^共 3 样 · 预估 ¥1339\.50（按上次价）$/m);
 // Copied numbers are the estimate's own line values, not recomputed.
 const tomato=v.estimate.items.find(i=>i.ingredientRef==='tomato').lines[0].line;
 assert.equal(`${tomato.packs} × ${tomato.trace.packSize} ${tomato.trace.packUnit} · ${tomato.qty.value} ${tomato.qty.unit} · ${tomato.amount.amount}`,'19 × 5 kg · 95 kg · 541.5');
 internal(out.text,v);
});
test('only buy decisions that are not yet bought are listed, grouped under their recorded supplier',()=>{
 const v=view([['tomato','buy'],['egg','buy',true],['scallion','available'],['salt','buy']]),out=copy(v);// cooking-oil stays check
 assert.equal(out.items,2);
 assert.equal(out.text,[
  `【采购单】${RANGE} · 宏达粮油调味批发`,'────────────────','食盐  20 包 × 500 g（共 10 kg）','────────────────','共 1 样 · 预估 ¥50.00（按上次价）','',
  `【采购单】${RANGE} · 绿源农产品配送`,'────────────────','番茄  19 包 × 5 kg（共 95 kg）','────────────────','共 1 样 · 预估 ¥541.50（按上次价）'].join('\n'));
 for(const name of ['鸡蛋','小葱','食用油'])assert.ok(!out.text.includes(name),name);
 internal(out.text,v);
});
test('nothing to buy gives no text; bought, available and check decisions never appear',()=>{
 const out=copy(view([['tomato','buy',true],['egg','available'],['salt','check']]));
 assert.deepEqual(out,{text:'',items:0,unquantified:0});
});
test('a missing estimate is named with quantity to confirm under its recorded supplier and left out of the total',()=>{
 const inputs=structuredClone(seed);delete inputs.dishes['tomato-egg-stir-fry'].components.find(c=>c.ingredientRef==='scallion').qty;
 const v=view([['tomato','buy'],['scallion','buy']],{inputs}),out=copy(v);
 assert.equal(v.estimate.items.find(i=>i.ingredientRef==='scallion').status,'unavailable');
 assert.equal(out.unquantified,1);
 assert.equal(out.text,[`【采购单】${RANGE} · 绿源农产品配送`,'────────────────','番茄  19 包 × 5 kg（共 95 kg）','小葱  数量待定','────────────────','共 2 样 · 预估 ¥541.50（按上次价） · 1 样数量待定，未计入预估'].join('\n'));
 assert.doesNotMatch(out.text,/小葱 {2}\d/);
});
test('without any estimate no quantity, price or supplier is invented',()=>{
 const inputs=structuredClone(seed);delete inputs.menuPlans['week-41'].meals[2].plannedServings;
 inputs.dishes['tomato-egg-stir-fry'].components.push({ingredientRef:'ketchup',qty:{value:100,unit:'g'}});
 const v=view([['tomato','buy'],['salt','buy'],['ketchup','buy']],{inputs}),out=copy(v);
 assert.ok(v.estimate.items.every(i=>i.status==='unavailable'));
 assert.equal(out.text,[
  `【采购单】${RANGE} · 宏达粮油调味批发`,'────────────────','食盐  数量待定','────────────────','共 1 样 · 1 样数量待定','',
  `【采购单】${RANGE} · 绿源农产品配送`,'────────────────','番茄  数量待定','────────────────','共 1 样 · 1 样数量待定','',
  `【采购单】${RANGE} · ⚠️ 未指定供应商（请先指派再下单）`,'────────────────','番茄酱  数量待定','────────────────','共 1 样 · 1 样数量待定','⚠️ 未指定供应商：请指派供应商后再下单'].join('\n'));
 assert.doesNotMatch(out.text,/¥|包 ×|\d+ (?:g|kg)/);
});
test('snapshots that disagree on the supplier are not guessed into one supplier',()=>{
 const id='00000000-0000-4000-8000-000000000201',key=`kbci-${id.replaceAll('-','')}`;
 const snap=(supplier,version)=>({schemaVersion:'3',name:{zh:'排骨',en:'Pork ribs',uk:'Свинячі реберця'},baseUnit:'g',yield:1,trackStock:false,canonicalIngredientId:id,canonicalIngredientVersion:version,purchase:{supplier,packSize:1,packUnit:'kg'}});
 const inputs={menuPlans:{week:{schemaVersion:'3',meals:[{date:'2026-10-20',mealType:'lunch',dishRef:'one',plannedServings:2},{date:'2026-10-20',mealType:'lunch',dishRef:'two',plannedServings:2}]}},
  dishes:Object.fromEntries([['one','ribs-a'],['two','ribs-b']].map(([dish,ref])=>[dish,{schemaVersion:'3',name:{zh:dish},baseServings:2,status:'active',components:[{ingredientRef:ref,qty:{value:500,unit:'g'}}],steps:[]}])),
  ingredients:{'ribs-a':snap('王记肉铺',1),'ribs-b':snap('李记肉铺',2)},techniques:[]};
 const slots=[{menuPlanRef:'week',date:'2026-10-20',mealType:'lunch'}],v=view([[key,'buy']],{inputs,slots});
 assert.equal(v.estimate.items[0].status,'unavailable');
 const out=copy(v);assert.match(out.text,/^【采购单】2026-10-20 · ⚠️ 未指定供应商/);assert.match(out.text,/^排骨 {2}数量待定$/m);
 assert.ok(!out.text.includes('王记')&&!out.text.includes('李记'));internal(out.text,v);
 inputs.ingredients['ribs-b'].purchase.supplier='王记肉铺';
 const same=copy(view([[key,'buy']],{inputs,slots}));assert.match(same.text,/^【采购单】2026-10-20 · 王记肉铺$/m);
});
const WORDS={en:['【Purchase order】','Tomato  19 packs × 5 kg (total 95 kg)','Scallion  quantity to confirm','2 items · estimated ¥541.50 (at last price) · 1 with quantity to confirm, not in the estimate','Salt  20 packs × 500 g (total 10 kg)'],
 uk:['【Замовлення】','Помідор  19 уп. × 5 кг (разом 95 кг)','Зелена цибуля  кількість уточнити','Позицій: 2 · орієнтовно ¥541.50 (за останньою ціною) · кількість уточнити: 1, не враховано в оцінці','Сіль  20 уп. × 500 г (разом 10 кг)']};
for(const lang of ['en','uk'])test(`${lang}: names and fixed words follow the interface language; supplier names stay as recorded`,()=>{
 const inputs=structuredClone(seed);delete inputs.dishes['tomato-egg-stir-fry'].components.find(c=>c.ingredientRef==='scallion').qty;
 const v=view([['tomato','buy'],['scallion','buy'],['salt','buy'],['egg','buy',true]],{inputs}),out=copy(v,lang);
 for(const expected of WORDS[lang])assert.ok(out.text.includes(expected),`${lang}: ${expected}\n${out.text}`);
 assert.ok(out.text.includes(`${RANGE} · 绿源农产品配送`)&&out.text.includes(`${RANGE} · 宏达粮油调味批发`));
 for(const zh of ['采购单','共 ','样','预估','按上次价','数量待定','番茄','小葱','食盐','包 ×'])assert.ok(!out.text.includes(zh),`${lang} has no zh word ${zh}`);
 internal(out.text,v);
});
test('v1 lists keyed by snapshot ids give the same supplier messages',()=>{
 const two=copy(view(ALL.map(id=>[id,'buy']))),one=copy(view(ALL.map(id=>[id,'buy']),{version:'1'}));
 assert.equal(one.text,two.text);
});

// ---------------------------------------------------------------- actual page
class Element{
 constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.text=text;this.children=[];this.attrs={};this.listeners={};this.style={};this.value='';this.disabled=false;this.hidden=false;this.parentNode=null;this.classList={add:x=>this.setAttribute('class',`${this.attrs.class??''} ${x}`.trim())};}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k==='disabled')this.disabled=true;if(k==='checked')this.checked=true;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5),v]));}
 appendChild(c){c.parentNode=this;this.children.push(c);return c;}append(...cs){cs.forEach(c=>this.appendChild(c));}prepend(...cs){cs.forEach(c=>c.parentNode=this);this.children.unshift(...cs);}
 replaceChildren(...cs){this.children.forEach(c=>c.parentNode=null);this.children=[];this.text='';this.append(...cs);}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
 get firstChild(){return this.children[0]??null;}get isConnected(){return this.tagName==='BODY'||!!this.parentNode?.isConnected;}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(s){this.replaceChildren();this.text=String(s);}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}dispatch(t){if(t==='click'&&this.disabled)return;for(const fn of this.listeners[t]??[])fn({target:this,preventDefault(){}});}click(){this.dispatch('click');}focus(){document.activeElement=this;}select(){}
 querySelector(s){return this.querySelectorAll(s)[0]??null;}querySelectorAll(s){return walk(this).slice(1).filter(el=>{const m=s.match(/^\[([^=]+)="([^"]+)"\]$/);return m?el.attrs[m[1]]===m[2]:s.startsWith('.')?(el.attrs.class??'').split(' ').includes(s.slice(1)):el.tagName===s.toUpperCase();});}
}
const walk=n=>[n,...n.children.flatMap(walk)],tick=()=>new Promise(r=>setImmediate(r)),flush=async()=>{for(let i=0;i<40;i++)await tick();};
let serial=0;
async function page(decisions){
 const priorGlobals=new Map(['HTMLElement','MutationObserver','window','location','document','localStorage','sessionStorage','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const restoreGlobals=()=>{for(const [key,descriptor] of priorGlobals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{onLine:true}});
 globalThis.HTMLElement=Element;globalThis.MutationObserver=class{observe(){}disconnect(){}};globalThis.window={addEventListener(){}};globalThis.location={hash:`#/purchase/${LIST}`};
 globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),activeElement:null};
 const storage=new Map();globalThis.localStorage=globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const m=await import(`${pathToFileURL(file)}?page=${++serial}`),saved=view(decisions).list,writes=[];let current=A;
 const json=x=>Response.json(structuredClone(x)),failure=(status,code)=>Response.json({ok:false,errors:[{path:'',code,message:code}]},{status});
 const api=m.createTeamMealsApi('https://supplier-copy.invalid',{mode:'mock',identity:()=>1,token:()=>'explicit-fixture',fetch:async(url,init)=>{
  const u=new URL(url),revision=u.searchParams.get('revision');
  if(init.method==='POST'){writes.push(u.pathname);return failure(409,'conflict');}
  if(u.pathname===`/source/shopping-list/${LIST}`)return json({content:saved,commit:'c'.repeat(40),blobSha:'saved'});
  const r=revision??current,data=r===A?seed:{...structuredClone(seed),ingredients:{...structuredClone(seed.ingredients),tomato:{...structuredClone(seed.ingredients.tomato),name:{zh:'当前改名番茄',en:'Renamed tomato',uk:'Перейменований помідор'}}}};
  if(u.pathname==='/catalog')return json({commit:r,dishes:data.dishes,ingredients:data.ingredients,techniques:data.techniques,suppliers:[],translations:{machine:0,human:0,stale:0}});
  if(u.pathname==='/source/plan/week-41')return json({content:data.menuPlans['week-41'],commit:r,blobSha:`plan-${r}`});
  return failure(404,'not_found');
 }});
 const render=m.createPurchaseRenderer(api);
 return{writes,current(v){current=v;},async mount(lang='zh'){document.body.replaceChildren();const el=new Element('main');document.body.append(el);await render(el,{rest:LIST,lang,planId:'week-41',route:'purchase'});await flush();return el;},
  cleanup(){try{api.dispose();document.body.replaceChildren();}finally{restoreGlobals();}}};
}
const LABELS={zh:['复制给菜贩','复制完整记录'],en:['Copy for suppliers','Copy full record'],uk:['Копіювати для постачальників','Копіювати повний запис']};
const panel=(el,kind)=>{const found=walk(el).find(n=>n.attrs['data-copy']===kind);assert.ok(found,`copy panel ${kind}`);return found;};
const parts=card=>({button:card.children.find(n=>n.tagName==='BUTTON'),area:walk(card).find(n=>n.tagName==='TEXTAREA'),status:walk(card).find(n=>n.attrs.role==='status')});
const DECISIONS=[['tomato','buy'],['egg','buy',true],['scallion','available'],['salt','buy']];
for(const lang of ['zh','en','uk'])test(`${lang}: the page offers supplier text first and the unchanged full record second, with the same clipboard and fallback`,async()=>{
 const f=await page(DECISIONS),prior=Object.getOwnPropertyDescriptor(navigator,'clipboard');try{
  let el=await f.mount(lang),captured=[];
  const [suppliersLabel,recordLabel]=LABELS[lang],actions=walk(el).find(n=>(n.attrs.class??'').split(' ').includes('tm-purchase-actions'));
  assert.deepEqual(actions.children.map(n=>n.attrs['data-copy']??n.textContent),[actions.children[0].textContent,'suppliers','record'],'save, then supplier copy, then full record');
  const suppliers=parts(panel(el,'suppliers')),record=parts(panel(el,'record'));
  assert.equal(suppliers.button.textContent,suppliersLabel);assert.equal(record.button.textContent,recordLabel);assert.equal(suppliers.button.disabled,false);
  const v=view(DECISIONS);
  assert.equal(suppliers.area.value,module.supplierCopy(v.list,v.projection,lang,v.estimate).text,'supplier text from the saved basis');
  assert.equal(record.area.value,module.shoppingCopy(v.list,v.projection,lang,v.estimate),'full record output unchanged');
  assert.ok(record.area.value.includes(A)&&!suppliers.area.value.includes(A));
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{captured.push(value);}}});
  suppliers.button.click();await flush();record.button.click();await flush();
  assert.deepEqual(captured,[suppliers.area.value,record.area.value]);assert.equal(parts(panel(el,'suppliers')).status.textContent,{zh:'已复制',en:'Copied',uk:'Скопійовано'}[lang]);
  for(const behavior of ['reject','throw','absent'])for(const kind of ['suppliers','record']){
   el=await f.mount(lang);const target=parts(panel(el,kind));
   if(behavior==='absent')delete navigator.clipboard;else Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:value=>{assert.equal(value,target.area.value);if(behavior==='throw')throw new Error('explicit synchronous clipboard failure');return Promise.reject(new Error('explicit denied clipboard'));}}});
   assert.equal(target.area.hidden,true);target.button.click();await flush();
   assert.equal(target.area.hidden,false,`${kind}/${behavior} reveals its own text`);assert.equal(parts(panel(el,kind==='suppliers'?'record':'suppliers')).area.hidden,true,'the other text stays hidden');
  }
  assert.equal(f.writes.length,0,'copying never writes the repository');
 }finally{if(prior)Object.defineProperty(navigator,'clipboard',prior);else delete navigator.clipboard;f.cleanup();}
});
test('the supplier action names what it leaves out and is unavailable when nothing is left to buy',async()=>{
 let f=await page(DECISIONS);try{
  const el=await f.mount('zh'),card=panel(el,'suppliers');
  assert.match(card.textContent,/只列「待买」且还没买的材料，按供应商分段。另有 1 项待核对，未列入。/);
 }finally{f.cleanup();}
 f=await page([['tomato','buy',true],['egg','available']]);try{
  const el=await f.mount('en'),card=panel(el,'suppliers');
  assert.equal(parts(card).button.disabled,true);assert.match(card.textContent,/Everything marked Buy is already bought\. 3 still to check, not included\./);
  assert.equal(parts(panel(el,'record')).button.disabled,false,'the full record stays available');
 }finally{f.cleanup();}
 f=await page([['egg','available']]);try{
  const el=await f.mount('uk'),card=panel(el,'suppliers');
  assert.equal(parts(card).button.disabled,true);assert.match(card.textContent,/Ще немає позицій «Купити»\. Ще до перевірки: 4, не включено\./);
 }finally{f.cleanup();}
});
test('supplier text stays bound to the saved basis while a newer plan is read but not applied',async()=>{
 const f=await page(DECISIONS);try{
  const el=await f.mount('zh'),before=parts(panel(el,'suppliers')).area.value;
  f.current(B);walk(el).find(n=>n.tagName==='BUTTON'&&n.textContent==='读取最新已保存计划').click();await flush();
  const after=parts(panel(el,'suppliers')).area.value;
  assert.equal(after,before);assert.ok(after.includes('番茄  19 包 × 5 kg（共 95 kg）')&&!after.includes('当前改名'));assert.equal(f.writes.length,0);
 }finally{f.cleanup();}
});
