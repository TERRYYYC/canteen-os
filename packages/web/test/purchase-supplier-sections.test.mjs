/**
 * Purchase page, line 3 of D0-contract "四条线第一批": candidates in supplier sections that group exactly like
 * "copy for suppliers", with sums per currency, "copy this section", the other reader language and the
 * estimate next to the manual judgment. Core numbers are the actual estimate of the week-41 golden data.
 */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
import {Element,walk,flush,setup,card,btn} from './team-meals-pages-shopping-harness.mjs';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'supplier-sections-'));after(()=>rm(dir,{recursive:true,force:true}));
const built=await esbuild.build({stdin:{contents:`export {renderCandidates,counterpartName} from './src/pages/purchase-list';export {supplierCopy,previewSupplierCopy,supplierSections,supplierSectionText,sumByCurrency,moneyText} from './src/pages/supplier-copy';export {projectTeamMeals,estimateShoppingList,createShoppingList,applyShoppingDecision,UNSPECIFIED_SUPPLIER} from '@canteenos/core';`,resolveDir:join(here,'..')},bundle:true,write:false,format:'esm',platform:'node',target:'node20',logLevel:'silent'});
const file=join(dir,'page.mjs');await writeFile(file,built.outputFiles[0].text);
globalThis.HTMLElement=Element;globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),activeElement:null};
const m=await import(pathToFileURL(file));

const golden=join(here,'../../../test/fixtures/contracts/valid/golden/data');
async function records(folder){return Object.fromEntries(await Promise.all((await readdir(join(golden,folder))).filter(f=>f.endsWith('.json')).map(async f=>[f.slice(0,-5),JSON.parse(await readFile(join(golden,folder,f),'utf8'))])));}
const seed={menuPlans:{'week-41':JSON.parse(await readFile(join(golden,'menu-plans/week-41.json'),'utf8'))},dishes:await records('dishes'),ingredients:await records('ingredients'),techniques:JSON.parse(await readFile(join(golden,'techniques.json'),'utf8'))};
const A='a'.repeat(40),LIST='week41-shop',ALL=['cooking-oil','egg','salt','scallion','tomato'];
const selection=seed.menuPlans['week-41'].meals.map(x=>({menuPlanRef:'week-41',date:x.date,mealType:x.mealType}));
function view(decisions,inputs=seed){
 const projection=m.projectTeamMeals(inputs,{sourceRevision:A,selection},{identity:'canonical'});
 const estimate=m.estimateShoppingList(inputs,selection,'2026-10-03','canonical');
 let list=m.createShoppingList(LIST,{sourceRevision:A,selection},inputs,'2');
 for(const [id,decision,bought] of decisions)list=m.applyShoppingDecision(list,id,decision,bought);
 return {projection,estimate,list};
}
const buyAll=ALL.map(id=>[id,'buy']);
const sectionsOf=(v,lang='zh')=>m.supplierSections(v.projection.collection.items,v.projection,lang,v.estimate).sections;
const render=(v,lang='zh',extra={})=>m.renderCandidates({lang,...v.projection,estimate:v.estimate,compact:true,sections:sectionsOf(v,lang),...extra});
const cls=(n,c)=>walk(n).filter(x=>(x.attrs.class??'').split(' ').includes(c));
const headOf=(el,i)=>cls(el,'tm-supplier-head')[i];
const text=n=>n.textContent;

test('sections group and order exactly like the copied supplier text',()=>{
 for(const lang of ['zh','en','uk']){
  const v=view(buyAll),copy=m.supplierCopy(v.list,v.projection,lang,v.estimate),sections=sectionsOf(v,lang);
  assert.deepEqual(sections.map(s=>s.supplier),['宏达粮油调味批发','绿源农产品配送'].sort((a,b)=>copy.text.indexOf(a)-copy.text.indexOf(b)));
  assert.equal(sections.map(s=>m.supplierSectionText(s,lang,selection.map(x=>x.date))).join('\n\n'),copy.text,`${lang}: whole copy is the sections' texts in order`);
  assert.equal(sections.reduce((n,s)=>n+s.entries.length,0),5);
  // The page lists the same suppliers in the same order.
  const el=render(v,lang),titles=cls(el,'tm-supplier-head').map(head=>walk(head).find(n=>n.tagName==='H3').textContent);
  assert.deepEqual(titles,sections.map(s=>s.supplier));
 }
});

test('an item with no recorded supplier lands in the last section named 未指定供应商, as in the copied text',()=>{
 const inputs=structuredClone(seed);delete inputs.ingredients.salt.purchase.supplier;
 const v=view(buyAll,inputs),sections=sectionsOf(v),last=sections.at(-1);
 assert.equal(last.supplier,m.UNSPECIFIED_SUPPLIER);assert.equal(m.UNSPECIFIED_SUPPLIER,'未指定供应商');
 assert.ok(last.entries.some(e=>e.ingredientRef==='salt'));
 const copy=m.supplierCopy(v.list,v.projection,'zh',v.estimate).text;
 assert.ok(copy.split('\n\n').at(-1).includes('⚠️ 未指定供应商'));
 const el=render(v);assert.equal(walk(headOf(el,sections.length-1)).find(n=>n.tagName==='H3').textContent,'未指定供应商');
 assert.equal(cls(el,'tm-supplier-section').at(-1).attrs['data-supplier-section'],'unspecified');
 assert.equal(walk(headOf(render(v,'en'),sections.length-1)).find(n=>n.tagName==='H3').textContent,'No supplier assigned');
 assert.equal(walk(headOf(render(v,'uk'),sections.length-1)).find(n=>n.tagName==='H3').textContent,'Постачальника не вказано');
});

test('section sums are per currency, mention items without a price, and equal the numbers in the copied text',()=>{
 const inputs=structuredClone(seed);inputs.ingredients.tomato.purchase.lastPrice.currency='UAH';
 const v=view(buyAll,inputs),sections=sectionsOf(v),green=sections.findIndex(s=>s.supplier==='绿源农产品配送');
 const head=text(headOf(render(v),green));
 assert.match(head,/3 种/);assert.ok(head.includes('¥798.00、₴541.50'),head);
 const copy=m.supplierSectionText(sections[green],'zh',selection.map(x=>x.date));
 assert.ok(copy.includes('¥798.00、₴541.50'),copy);
 assert.ok(!head.includes('其中'),'all priced: no unpriced note');
 // Same page for the other supplier: one currency.
 assert.ok(text(headOf(render(v),1-green)).includes('¥186.00'));
 // One item without a last price: counted, never added to the sum.
 const bare=structuredClone(seed);delete bare.ingredients.tomato.purchase.lastPrice;
 const w=view(buyAll,bare),ws=sectionsOf(w),gi=ws.findIndex(s=>s.supplier==='绿源农产品配送'),wh=text(headOf(render(w),gi));
 assert.ok(wh.includes('其中 1 种暂无价格'),wh);
 assert.match(m.supplierSectionText(ws[gi],'zh',selection.map(x=>x.date)),/1 样缺上次价/);
 assert.ok(text(headOf(render(w,'en'),gi)).includes('1 of them without a price yet'));
 assert.ok(text(headOf(render(w,'uk'),gi)).includes('серед них без ціни: 1'));
 // No estimated quantity (no purchase spec): not "no price" but "quantity to confirm", outside the subtotal, as in the copied text.
 const none=structuredClone(seed);delete none.ingredients.tomato.purchase;
 const x=view(buyAll,none),xs=sectionsOf(x),last=xs.at(-1),n=last.unquantified;
 assert.equal(last.supplier,m.UNSPECIFIED_SUPPLIER);assert.ok(n>=1);
 const xh=text(headOf(render(x),xs.length-1));
 assert.ok(xh.includes(`其中 ${n} 种数量待定，未计入小计`),xh);assert.ok(!xh.includes('暂无价格'),`not called unpriced: ${xh}`);
 assert.match(m.supplierSectionText(last,'zh',selection.map(x=>x.date)),new RegExp(`${n} 样数量待定`));
 assert.ok(text(headOf(render(x,'en'),xs.length-1)).includes(`${n} with quantity to confirm, not in the subtotal`));
 assert.ok(text(headOf(render(x,'uk'),xs.length-1)).includes(`кількість уточнити: ${n} — не враховано в сумі`));
 // Top summary adds per currency over all sections and repeats the existing budget note.
 const page=render(v),top=cls(page,'tm-supplier-summary')[0];
 assert.equal(page.children[0],top,'the estimated total comes first, before the coverage note and the issues');
 assert.ok(text(top).includes('预计合计')&&text(top).includes('5 种')&&text(top).includes('金额只按可计算项参考，不代表完整预算。'));
 assert.ok(text(top).includes('¥984.00、₴541.50'),text(top));
});

test('sums use whole cents: no floating-point tails on the page or in the text',()=>{
 const line=amount=>({amount:{amount,currency:'CNY'}});
 assert.deepEqual(m.sumByCurrency([line(0.1),line(0.2)]),[{currency:'CNY',amount:0.3}]);
 assert.deepEqual(m.sumByCurrency([line(1563.49),line(0.01),line(0.01)]),[{currency:'CNY',amount:1563.51}]);
 assert.equal(m.moneyText(0.1+0.2,'CNY'),'¥0.30');
 assert.deepEqual(m.sumByCurrency([line(1),{amount:{amount:2,currency:'UAH'}}]),[{currency:'CNY',amount:1},{currency:'UAH',amount:2}]);
});

test('"copy this section" copies exactly what the whole copy gives when only this section\'s items are passed',()=>{
 const v=view(buyAll),sections=sectionsOf(v);
 for(const section of sections){
  const only=view(section.entries.map(e=>[e.ingredientRef,'buy'])),expected=m.supplierCopy(only.list,only.projection,'zh',only.estimate).text;
  assert.equal(m.supplierSectionText(section,'zh',selection.map(x=>x.date)),expected,section.supplier);
 }
 // The page asks the caller for each section's button and puts it in that section's head.
 const asked=[],el=render(v,'zh',{sectionCopy:section=>{asked.push(section.supplier);const b=new Element('button','复制这一段');b.setAttribute('data-copy','section');return b;}});
 assert.deepEqual(asked,sections.map(s=>s.supplier));
 assert.equal(cls(el,'tm-supplier-head').filter(head=>walk(head).some(n=>n.attrs['data-copy']==='section')).length,sections.length);
});

test('each estimated line reads packs, pack size and total in the three languages, with amount or no-price words',()=>{
 const v=view(buyAll),bare=structuredClone(seed);delete bare.ingredients.tomato.purchase.lastPrice;
 const tomatoLine=(vv,lang)=>text(cls(card(render(vv,lang),'tomato'),'tm-material-estimate')[0]);
 assert.equal(tomatoLine(v,'zh'),'19 包 · 每包 5 千克 · 共 95 千克 · ¥541.50');
 assert.equal(tomatoLine(v,'en'),'19 packs · 5 kg each · 95 kg in all · ¥541.50');
 assert.equal(tomatoLine(v,'uk'),'19 уп. · по 5 кг · разом 95 кг · ¥541.50');
 const w=view(buyAll,bare);
 assert.ok(tomatoLine(w,'zh').endsWith('暂无价格'));assert.ok(tomatoLine(w,'en').endsWith('No price yet'));assert.ok(tomatoLine(w,'uk').endsWith('Ціни поки немає'));
});

test('an item without a complete estimate shows the reason instead of numbers',()=>{
 const inputs=structuredClone(seed);delete inputs.dishes['tomato-egg-stir-fry'].components.find(c=>c.ingredientRef==='scallion').qty;
 const v=view(buyAll,inputs),notes=lang=>text(cls(card(render(v,lang),'scallion'),'tm-material-estimate')[0]);
 assert.equal(v.estimate.items.find(i=>i.ingredientRef==='scallion').status,'unavailable');
 assert.equal(notes('zh'),'原用量未录');assert.equal(notes('en'),'Recipe quantity missing');assert.equal(notes('uk'),'Кількість рецепта не вказано');
 assert.ok(!/包|packs|уп\./.test(notes('zh')+notes('en')+notes('uk')));
});

test('each row names the other language: zh reads uk, uk and en read zh; missing or equal text is left out',()=>{
 const name={zh:'番茄',en:'Tomato',uk:'Помідор'};
 assert.equal(m.counterpartName(name,'zh'),'Помідор');assert.equal(m.counterpartName(name,'en'),'番茄');assert.equal(m.counterpartName(name,'uk'),'番茄');
 assert.equal(m.counterpartName({zh:'番茄',en:'Tomato'},'zh'),'','no uk recorded: nothing stands in');
 assert.equal(m.counterpartName({zh:'番茄',uk:'番茄'},'zh'),'','same text is not repeated');
 assert.equal(m.counterpartName({uk:'Помідор'},'uk'),'');assert.equal(m.counterpartName(undefined,'zh'),'');
 const v=view(buyAll),other=(lang)=>text(cls(card(render(v,lang),'tomato'),'tm-counterpart')[0]);
 assert.equal(other('zh'),seed.ingredients.tomato.name.uk);assert.equal(other('en'),seed.ingredients.tomato.name.zh);assert.equal(other('uk'),seed.ingredients.tomato.name.zh);
});

test('no developer information appears in the sections',()=>{
 const v=view(buyAll);
 for(const lang of ['zh','en','uk']){
  const all=text(render(v,lang));
  for(const marker of [A,LIST,'week-41','kbci-'])assert.ok(!all.includes(marker),`${lang}: ${marker}`);
 }
});

for(const lang of ['zh','en','uk'])test(`${lang}: saved list keeps the judgment buttons ahead of the estimate and a new decision changes nothing else`,async()=>{
 const f=await setup({lang});
 try{
  const el=await f.mount('team-shop'),words={zh:['待买','复制这一段','这一段没有还没买的「待买」材料。'],en:['Buy','Copy this section','Nothing here is marked Buy and still to buy.'],uk:['Купити','Копіювати цей розділ','Тут немає позицій «Купити», які ще не куплено.']}[lang];
  assert.ok(cls(el,'tm-supplier-section').length>=1,'sections on the saved page');
  const tomato=card(el,'tomato'),kids=tomato.children.map(n=>(n.attrs.class??'').split(' ')[0]);
  assert.ok(kids.indexOf('tm-decisions')>=0&&kids.indexOf('tm-material-estimate')>kids.indexOf('tm-decisions'),`judgment first: ${kids}`);
  const section=walk(el).find(n=>n.attrs['data-supplier-section']),copy=walk(section).find(n=>n.attrs['data-copy']==='section');
  assert.ok(copy,'section copy button');const button=copy.children.find(n=>n.tagName==='BUTTON');assert.equal(button.textContent,words[1]);
  assert.equal(button.disabled,true,'nothing is marked Buy yet, so nothing to copy');
  assert.equal(walk(copy).find(n=>n.attrs['data-copy-section-none']!==undefined)?.textContent,words[2],'a greyed button says why');
  const before=cls(el,'tm-supplier-head').length,writesBefore=f.writes.length;
  btn(tomato,words[0]).click();await flush();
  const after=walk(el).find(n=>n.attrs['data-copy']==='section');
  assert.equal(cls(el,'tm-supplier-head').length,before,'sections stay');
  assert.equal(f.writes.length,writesBefore,'choosing a judgment alone writes nothing');
  const area=walk(after).find(n=>n.tagName==='TEXTAREA'),wholeArea=walk(walk(el).find(n=>n.attrs['data-copy']==='suppliers')).find(n=>n.tagName==='TEXTAREA');
  assert.equal(after.children.find(n=>n.tagName==='BUTTON').disabled,false,'a Buy item can now be copied');
  assert.equal(walk(after).some(n=>n.attrs['data-copy-section-none']!==undefined),false);
  assert.equal(area.value,wholeArea.value,'one supplier here, so the section text is the whole text');
  assert.ok(area.value.length>0);
 }finally{f.cleanup();}
});
