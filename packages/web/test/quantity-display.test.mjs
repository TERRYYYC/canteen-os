import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json'));
const {build}=await import(pathToFileURL(vr.resolve('esbuild')));
const out=await build({entryPoints:[new URL('../src/pages/quantity-text.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',loader:{'.css':'empty'},logLevel:'silent'});
const mod=await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
const {displayQuantity:d}=mod;
const langs=['zh','en','uk'];
// Expected strings below are written out by hand; none involves digit grouping, so they hold on every ICU version.
const each=(qty,zh,en,uk)=>{assert.equal(d(qty,'zh'),zh);assert.equal(d(qty,'en'),en);assert.equal(d(qty,'uk'),uk);};

test('three-language unit names',()=>{
 each({value:5,unit:'g'},'5 克','5 g','5 г');
 each({value:5,unit:'ml'},'5 毫升','5 ml','5 мл');
 each({value:5,unit:'kg'},'5 千克','5 kg','5 кг');
 each({value:5,unit:'l'},'5 升','5 L','5 л');
});
test('grams switch to kilograms from 1000, with at most two decimals',()=>{
 each({value:999,unit:'g'},'999 克','999 g','999 г');
 each({value:1000,unit:'g'},'1 千克','1 kg','1 кг');
 each({value:1500,unit:'g'},'1.5 千克','1.5 kg','1,5 кг');
 each({value:93176.5,unit:'g'},'93.18 千克','93.18 kg','93,18 кг');
 each({value:18000,unit:'g'},'18 千克','18 kg','18 кг');
 each({value:7500,unit:'g'},'7.5 千克','7.5 kg','7,5 кг');
 // Pack sizes keep their real value, so "N × pack" still adds up to the bought amount.
 each({value:2250,unit:'g'},'2.25 千克','2.25 kg','2,25 кг');
 each({value:1350,unit:'g'},'1.35 千克','1.35 kg','1,35 кг');
});
test('millilitres switch to litres from 1000; uk uses a decimal comma',()=>{
 each({value:999,unit:'ml'},'999 毫升','999 ml','999 мл');
 each({value:1500,unit:'ml'},'1.5 升','1.5 L','1,5 л');
 each({value:1.75,unit:'l'},'1.75 升','1.75 L','1,75 л');
 each({value:9600,unit:'g'},'9.6 千克','9.6 kg','9,6 кг');
});
test('kilograms and litres under one are shown as grams and millilitres',()=>{
 each({value:0.004,unit:'kg'},'4 克','4 g','4 г');
 each({value:0.004,unit:'l'},'4 毫升','4 ml','4 мл');
 each({value:0.5,unit:'kg'},'500 克','500 g','500 г');
 each({value:0.25,unit:'l'},'250 毫升','250 ml','250 мл');
 each({value:0.9995,unit:'kg'},'999.5 克','999.5 g','999,5 г');
});
test('a known positive amount is never shown as zero',()=>{
 each({value:0.001,unit:'g'},'0.001 克','0.001 g','0,001 г');
 each({value:0.0012345,unit:'g'},'0.0012 克','0.0012 g','0,0012 г');
 each({value:0.006,unit:'g'},'0.006 克','0.006 g','0,006 г');
 each({value:0.004,unit:'pcs'},'0.004 个','0.004 pcs','0,004 шт');
 each({value:0.0000001,unit:'kg'},'0.0001 克','0.0001 g','0,0001 г');
 each({value:0.01,unit:'g'},'0.01 克','0.01 g','0,01 г');
 const zero=/^0(?:[.,]0*)?$/;
 for(const unit of ['g','kg','ml','l','pcs','pack','tbsp','tsp','pinch'])for(const value of [0.0000001,0.00049,0.001,0.004,0.0049,0.005,0.0099,0.04,0.4,0.9999])for(const lang of langs){
  const parts=mod.quantityParts({value,unit},lang);
  assert.ok(parts&&!zero.test(parts.value),`${value} ${unit} (${lang}) shown as ${parts?.value} ${parts?.unit}`);
 }
});
test('the switch to kilograms and litres is judged on the number shown, so "1,000 克" never appears',()=>{
 each({value:999.99,unit:'g'},'999.99 克','999.99 g','999,99 г');
 each({value:999.996,unit:'g'},'1 千克','1 kg','1 кг');
 each({value:0.999996,unit:'kg'},'1 千克','1 kg','1 кг');
 each({value:999.996,unit:'ml'},'1 升','1 L','1 л');
});
test('the same amount reads the same whichever unit it was recorded in',()=>{
 for(const lang of langs){
  assert.equal(d({value:1.25,unit:'kg'},lang),d({value:1250,unit:'g'},lang));
  assert.equal(d({value:0.5,unit:'l'},lang),d({value:500,unit:'ml'},lang));
  assert.equal(d({value:2,unit:'kg'},lang),d({value:2000,unit:'g'},lang));
 }
});
test('pcs, to-taste, missing value',()=>{
 each({value:3,unit:'pcs'},'3 个','3 pcs','3 шт');
 each({unit:'to-taste'},'适量','To taste','За смаком');
 each({unit:'g'},'用量未录','Quantity not recorded','Кількість не записано');
 assert.equal(d(undefined,'zh'),'用量未录');
});
test('quantityText follows the shared display; recorded originalAmount is not part of it',()=>{
 assert.equal(mod.quantityText({value:1500,unit:'g'},'en'),'1.5 kg');
 assert.equal(d({value:2,unit:'pcs',originalAmount:'两斤'},'zh'),'2 个');
});
test('unit names for a bare unit field follow the language; an unknown symbol stays as recorded',()=>{
 assert.equal(mod.unitName('g','zh'),'克');assert.equal(mod.unitName('g','uk'),'г');assert.equal(mod.unitName('pcs','en'),'pcs');
 assert.equal(mod.unitName('ml','zh'),'毫升');assert.equal(mod.unitName('stone','zh'),'stone');
});

// Page paths, fed by the actual core projection and estimate, with a minimal DOM transport (not layout evidence).
const dir=await mkdtemp(join(tmpdir(),'quantity-display-'));after(()=>rm(dir,{recursive:true,force:true}));
const pages=await build({stdin:{contents:"export {renderCandidates} from './src/pages/purchase-list';export {renderTeamDetails} from './src/pages/team-details';export {renderFrozenPrep,rawQuantityText} from './src/pages/prep';export {shoppingCopy} from './src/pages/shopping-copy';export {projectTeamMeals,estimateShoppingList,createShoppingList} from '../core/src/index';",resolveDir:join(here,'..'),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
await writeFile(join(dir,'pages.mjs'),pages.outputFiles[0].text);
const page=await import(pathToFileURL(join(dir,'pages.mjs')));
class NodeDouble {
 constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.parentNode=null;this.connected=false;this.text=text;this.listeners={};this.style={};this.hidden=false;this.open=false;this.classList={add(){},remove(){},toggle(){}};}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 appendChild(child){if(typeof child==='string')child=new NodeDouble('',child);child.parentNode=this;this.children.push(child);return child;}
 append(...children){children.forEach(c=>this.appendChild(c));}prepend(...children){children.reverse().forEach(c=>{if(typeof c==='string')c=new NodeDouble('',c);c.parentNode=this;this.children.unshift(c);});}
 replaceChildren(...children){this.children.forEach(c=>c.parentNode=null);this.children=[];this.text='';this.append(...children);}
 remove(){if(this.parentNode){const p=this.parentNode;p.children=p.children.filter(c=>c!==this);this.parentNode=null;}}
 get isConnected(){return this.connected||Boolean(this.parentNode?.isConnected);}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(v){this.replaceChildren();this.text=String(v);}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}removeEventListener(){}
}
globalThis.document={body:new NodeDouble('body'),createElement:tag=>new NodeDouble(tag),createTextNode:text=>new NodeDouble('',text)};
globalThis.document.body.connected=true;
globalThis.MutationObserver??=class{observe(){}disconnect(){}};
const all=node=>[node,...node.children.flatMap(all)];
const tagged=(node,name)=>all(node).filter(n=>n.tagName===name.toUpperCase());
const mount=()=>{const root=new NodeDouble('section');document.body.append(root);return root;};

const A='a'.repeat(40),selection=[{menuPlanRef:'week',date:'2026-09-14',mealType:'lunch'}];
// Recipe and plan are both 4 servings, pack = recipe amount, yield = margin = 1: the bought amount is exactly one pack.
const seed={
 menuPlans:{week:{schemaVersion:'2',name:{zh:'近零样本',en:'Near-zero sample',uk:'Зразок малих кількостей'},dateRange:{start:'2026-09-14',end:'2026-09-14'},margin:1,meals:[{date:'2026-09-14',mealType:'lunch',dishRef:'tiny',plannedServings:4}]}},
 dishes:{tiny:{schemaVersion:'2',name:{zh:'小量菜',en:'Small-amount dish',uk:'Страва з малими кількостями'},baseServings:4,status:'active',provenance:{source:'example'},components:[{ingredientRef:'spice',qty:{value:0.004,unit:'kg'}},{ingredientRef:'extract',qty:{value:0.004,unit:'l'}}]}},
 ingredients:{
  spice:{schemaVersion:'2',name:{zh:'香料',en:'Spice',uk:'Спеція'},baseUnit:'g',role:'seasoning',trackStock:false,yield:1,purchase:{supplier:'Spice stall',packSize:0.004,packUnit:'kg',lastPrice:{amount:2,currency:'UAH'}}},
  extract:{schemaVersion:'2',name:{zh:'香精',en:'Extract',uk:'Екстракт'},baseUnit:'ml',role:'seasoning',trackStock:false,yield:1,purchase:{supplier:'Spice stall',packSize:0.004,packUnit:'l',lastPrice:{amount:3,currency:'UAH'}}},
 },
 techniques:[],
};
const projection=page.projectTeamMeals(seed,{sourceRevision:A,selection}),estimate=page.estimateShoppingList(seed,selection,'2026-09-14');
const small={zh:['4 克','4 毫升'],en:['4 g','4 ml'],uk:['4 г','4 мл']};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('purchase reference: near-zero source amounts, bought amounts and pack sizes from core are not shown as zero',()=>{
 for(const lang of langs){
  const [g,ml]=small[lang];
  const el=page.renderCandidates({lang,collection:projection.collection,estimate,ingredients:projection.ingredients,dishes:projection.dishes,compact:true});
  const lines=tagged(el,'p').map(n=>n.textContent);
  assert.ok(lines.includes(`Spice stall · ${g} · 1 × ${g} · 2 UAH`),`${lang}: ${lines.join(' | ')}`);
  assert.ok(lines.includes(`Spice stall · ${ml} · 1 × ${ml} · 3 UAH`),`${lang}: ${lines.join(' | ')}`);
  const sources=tagged(el,'li').map(n=>n.textContent);
  assert.ok(sources.some(s=>s.includes(` · 4 · ${g}`)),`${lang}: ${sources.join(' | ')}`);
  assert.ok(sources.some(s=>s.includes(` · 4 · ${ml}`)),`${lang}: ${sources.join(' | ')}`);
  assert.doesNotMatch(el.textContent,/(?<![\d.,])0 (?:千克|升|kg|L|кг|л)(?![\p{L}])/u);
 }
});
test('copy of the complete record: recipe amounts, bought amounts and pack sizes use the same display',()=>{
 const original={zh:'原配方用量',en:'Original recipe quantity',uk:'Початкова кількість рецепта'};
 const list=page.createShoppingList('near-zero',{sourceRevision:A,selection},seed);
 for(const lang of langs){
  const [g,ml]=small[lang],text=page.shoppingCopy(list,projection,lang,estimate);
  assert.ok(text.includes(`Spice stall · ${g} · 1 × ${g} · 2 UAH`),`${lang}: ${text}`);
  assert.ok(text.includes(`Spice stall · ${ml} · 1 × ${ml} · 3 UAH`),`${lang}: ${text}`);
  assert.ok(text.includes(`${original[lang]}: ${g} · `),`${lang}: ${text}`);
  assert.ok(text.includes(`${original[lang]}: ${ml} · `),`${lang}: ${text}`);
  assert.doesNotMatch(text,/0\.004|(?<![\d.,])0 (?:千克|升|kg|L|кг|л)(?![\p{L}])/u);
 }
});
test('prep cooking layout: this meal and the original read 4 g / 4 ml, not zero',()=>{
 const label={zh:['本次','原方'],en:['This meal','Original'],uk:['Цей прийом','Оригінал']};
 for(const lang of langs){
  const [g,ml]=small[lang],[now,original]=label[lang],el=mount();
  const stop=page.renderFrozenPrep(el,freeze({mode:'real',projection:structuredClone(projection)}),{lang,layout:'cooking',selection:{menuPlanRef:'week',date:'2026-09-14',mealType:'lunch',mealIndex:0},href:(kind,id)=>`#/purchase/list/${kind}/${id}`});
  const shown=all(el).filter(n=>n.getAttribute('data-original-quantity')!==null).map(n=>n.textContent);
  assert.deepEqual(shown,[`${now}: ${g} · ${original}: ${g}`,`${now}: ${ml} · ${original}: ${ml}`],lang);
  assert.equal(page.rawQuantityText({value:0.004,unit:'kg'},lang),g);
  stop();el.remove();
 }
});
test('same-version material details: package, stock and base unit follow the language',()=>{
 const facts={zh:['包装规格','资料中的现有量（不是本次判断）','基准单位'],en:['Package size','Recorded on hand (separate from this list)','Base unit'],uk:['Розмір упаковки','Записаний залишок (окремо від цього списку)','Базова одиниця']};
 const detail=structuredClone(projection);
 detail.ingredients.flour={schemaVersion:'2',name:{zh:'面粉',en:'Flour',uk:'Борошно'},baseUnit:'g',role:'main',trackStock:true,onHand:1500,purchase:{supplier:'Mill',packSize:2250,packUnit:'g'}};
 const expected={spice:{zh:['4 克','克'],en:['4 g','g'],uk:['4 г','г']},flour:{zh:['2.25 千克','1.5 千克','克'],en:['2.25 kg','1.5 kg','g'],uk:['2,25 кг','1,5 кг','г']}};
 for(const lang of langs)for(const id of ['spice','flour']){
  const el=mount(),stop=page.renderTeamDetails(el,{lang,projection:detail,kind:'ingredient',id,asset:async()=>{throw Error('unused');},href:(kind,ref)=>`#/purchase/list/${kind}/${ref}`});
  const pairs=Object.fromEntries(tagged(el,'div').filter(n=>n.attrs.class==='tm-fact').map(n=>[n.children[0].textContent,n.children[1].textContent]));
  const [pack,stockOrBase,base]=expected[id][lang],[packLabel,stockLabel,baseLabel]=facts[lang];
  assert.equal(pairs[packLabel],pack,`${lang}/${id}: ${JSON.stringify(pairs)}`);
  if(id==='flour'){assert.equal(pairs[stockLabel],stockOrBase,`${lang}/${id}`);assert.equal(pairs[baseLabel],base,`${lang}/${id}`);}
  else assert.equal(pairs[baseLabel],stockOrBase,`${lang}/${id}`);
  stop();el.remove();
 }
});
