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
const built=await esbuild.build({stdin:{contents:`export {renderCandidates,counterpartName} from './src/pages/purchase-list';export {supplierCopy,previewSupplierCopy,supplierSections,supplierSectionText,sumByCurrency,moneyText} from './src/pages/supplier-copy';export {projectTeamMeals,estimateShoppingList,createShoppingList,applyShoppingDecision,UNSPECIFIED_SUPPLIER} from '@canteenos/core';export {pick} from './src/i18n';`,resolveDir:join(here,'..')},bundle:true,write:false,format:'esm',platform:'node',target:'node20',logLevel:'silent'});
const file=join(dir,'page.mjs');await writeFile(file,built.outputFiles[0].text);
globalThis.HTMLElement=Element;globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),activeElement:null};
const m=await import(pathToFileURL(file)),{pick}=m;

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

test('a complete estimate with no order line (stock covers the need) reads "no order needed", not "unavailable" or "quantity to confirm"',()=>{
 // Golden salt is trackStock:true with onHand 500 g; 1000 g covers 480 servings × 1.5 g × margin 1.1 = 792 g, so core keeps complete with no line.
 const inputs=structuredClone(seed);inputs.ingredients.salt.onHand=1000;
 const v=view(buyAll,inputs),salt=v.estimate.items.find(i=>i.ingredientRef==='salt');
 assert.deepEqual(salt,{ingredientRef:'salt',status:'complete',reasons:[],lines:[]},'core: complete, nothing to order');
 const words={zh:['本次参考无需订货','0 包','无法完整计算','数量待定'],en:['No order needed this time','0 packs','Complete estimate unavailable','quantity to confirm'],uk:['Цього разу замовляти не потрібно','0 уп.','Повний розрахунок недоступний','кількість уточнити']};
 for(const lang of ['zh','en','uk']){
  const sections=sectionsOf(v,lang),hongda=sections.find(s=>s.supplier==='宏达粮油调味批发'),i=sections.indexOf(hongda);
  assert.ok(hongda.entries.some(e=>e.ingredientRef==='salt'),`${lang}: salt stays under its recorded supplier with its sources`);
  assert.equal(hongda.unquantified,0,`${lang}: a known zero-order reference is not "quantity to confirm"`);
  const el=render(v,lang),row=cls(card(el,'salt'),'tm-material-estimate')[0],head=text(headOf(el,i));
  assert.equal(row.attrs['data-estimate'],'covered',lang);
  assert.ok(text(row).includes(words[lang][0])&&text(row).includes(words[lang][1]),`${lang}: ${text(row)}`);
  assert.ok(!text(row).includes(words[lang][2]),`${lang}: not reported unavailable: ${text(row)}`);
  assert.ok(!head.includes(words[lang][3]),`${lang}: section head counts no quantity to confirm: ${head}`);
  assert.ok(!walk(headOf(el,i)).some(n=>n.attrs['data-section-unquantified']!==undefined),lang);
  // The other section and a truly unavailable item are unchanged: the reason still shows there.
  assert.ok(text(headOf(el,1-i)).includes('¥'),`${lang}: the other section still sums`);
 }
 // A truly unavailable item in the same view still reads its reason and still counts as quantity to confirm.
 const both=structuredClone(inputs);delete both.ingredients.tomato.purchase;
 const w=view(buyAll,both),ws=sectionsOf(w),last=ws.at(-1);
 assert.equal(last.supplier,m.UNSPECIFIED_SUPPLIER);assert.equal(last.unquantified,1);
 assert.equal(cls(card(render(w),'tomato'),'tm-material-estimate')[0].attrs['data-estimate'],'reason');
 assert.equal(ws.find(s=>s.supplier==='宏达粮油调味批发').unquantified,0);
 // Copied text. Without a human decision (the read-only preview, and the sections the page shows) a known zero-order
 // item is not a "quantity to confirm" row and is left out. Here every item is a saved Buy, and a saved Buy is never
 // dropped by the stock reference: salt is sent as "quantity to confirm" (#153 re-review manual-buy-omitted-by-stock-reference).
 const dates=selection.map(x=>x.date),toConfirm={zh:'数量待定',en:'quantity to confirm',uk:'кількість уточнити'};
 for(const lang of ['zh','en','uk']){
  const saltName=pick(seed.ingredients.salt.name,lang),copy=m.supplierCopy(v.list,v.projection,lang,v.estimate);
  assert.equal(copy.unquantified,1,`${lang}: the saved Buy salt is listed without a quantity`);assert.equal(copy.keptCovered,1,lang);
  assert.ok(copy.text.split('\n').includes(`${saltName}  ${toConfirm[lang]}`),`${lang}: ${copy.text}`);
  assert.ok(!/  0 /.test(copy.text),`${lang}: never a made-up "name  0 packs" row: ${copy.text}`);
  const preview=m.previewSupplierCopy(v.projection,lang,v.estimate,selection);
  assert.equal(preview.unquantified,0,lang);assert.ok(!preview.text.includes(saltName),`${lang}: the preview has no decision and leaves it out: ${preview.text}`);
  const hongda=sectionsOf(v,lang).find(s=>s.supplier==='宏达粮油调味批发'),sectionText=m.supplierSectionText(hongda,lang,dates);
  assert.ok(!sectionText.includes(toConfirm[lang])&&!sectionText.includes(saltName),`${lang}: the page section agrees with its head: ${sectionText}`);
  assert.ok(!/  0 /.test(sectionText),`${lang}: no "name  0 packs" row either: ${sectionText}`);
  // A truly unavailable item is written and counted as before, beside the kept salt.
  const wc=m.supplierCopy(w.list,w.projection,lang,w.estimate);
  assert.equal(wc.unquantified,2,lang);assert.equal(wc.keptCovered,1,lang);
  assert.ok(wc.text.includes(`${pick(seed.ingredients.tomato.name,lang)}  ${toConfirm[lang]}`),`${lang}: ${wc.text}`);
  assert.ok(wc.text.includes(`${saltName}  ${toConfirm[lang]}`),lang);
 }
 assert.match(m.supplierCopy(w.list,w.projection,'zh',w.estimate).text,/1 样数量待定/);
 assert.ok(m.supplierCopy(v.list,v.projection,'zh',v.estimate).text.includes('食盐  数量待定'));
});

test('a saved "buy" item that the stock reference covers stays in the supplier copy as quantity to confirm; only the read-only preview leaves it out',()=>{
 // #153 re-review manual-buy-omitted-by-stock-reference: the buyer may know the stock record is stale; a saved Buy is never dropped by onHand.
 const inputs=structuredClone(seed);inputs.ingredients.salt.onHand=1000;
 const toConfirm={zh:'数量待定',en:'quantity to confirm',uk:'кількість уточнити'};
 for(const lang of ['zh','en','uk']){
  const salt=pick(seed.ingredients.salt.name,lang);
  const only=view([['salt','buy']],inputs);
  assert.deepEqual(only.estimate.items.find(i=>i.ingredientRef==='salt').lines,[],'core: complete, nothing to order');
  const copy=m.supplierCopy(only.list,only.projection,lang,only.estimate);
  assert.equal(copy.items,1,`${lang}: the Buy item is listed`);assert.equal(copy.unquantified,1,lang);assert.equal(copy.keptCovered,1,lang);
  assert.ok(copy.text.includes('宏达粮油调味批发')&&copy.text.split('\n').includes(`${salt}  ${toConfirm[lang]}`),`${lang}: ${copy.text}`);
  const both=view([['salt','buy'],['tomato','buy']],inputs),two=m.supplierCopy(both.list,both.projection,lang,both.estimate);
  assert.equal(two.items,2,lang);assert.equal(two.keptCovered,1,lang);assert.equal(two.text.split('\n\n').length,2,`${lang}: one message per supplier: ${two.text}`);
  // The read-only preview has no human decision: there a complete zero-order reference is still left out.
  const preview=m.previewSupplierCopy(only.projection,lang,only.estimate,selection);
  assert.equal(preview.items,4,`${lang}: preview lists every candidate except the covered one`);assert.equal(preview.keptCovered,0,lang);
  assert.ok(!preview.text.includes(salt),`${lang}: ${preview.text}`);
  // The page row is unchanged: salt shows the "no order needed" reference under its supplier.
  const hongda=sectionsOf(only,lang).find(s=>s.supplier==='宏达粮油调味批发');
  assert.ok(hongda?.entries.some(e=>e.ingredientRef==='salt'&&e.covered),lang);
 }
});

for(const lang of ['zh','en','uk'])test(`${lang}: a "buy" item covered by stock still copies from its section and the whole copy, with a note that the quantity is the buyer's to confirm`,async()=>{
 // Tomato gets a purchase record and enough stock: one meal, 2 planned servings of a 2-serving recipe: 300 g × margin 1.1 = 330 g < 1000 g on hand, so core finds nothing to order.
 const patch=data=>{Object.assign(data.ingredients.tomato,{purchase:{supplier:'绿源农产品配送',packSize:5,packUnit:'kg',lastPrice:{amount:28.5,currency:'CNY'}},trackStock:true,onHand:1000});};
 const f=await setup({lang,patch});
 try{
  const el=await f.mount('team-shop'),words={
   zh:['待买','番茄  数量待定','其中 1 种库存参考已够，按你标的「待买」列出，数量待定，请自己确认。'],
   en:['Buy','Tomato  quantity to confirm','1 of them is covered by the stock reference but listed because you marked it Buy; quantity to confirm.'],
   uk:['Купити','Помідор  кількість уточнити','З них 1: за довідкою про запас вистачає, але в списку, бо ви позначили «Купити»; кількість уточнити.']}[lang];
  const tomato=card(el,'tomato');
  assert.equal(cls(tomato,'tm-material-estimate')[0].attrs['data-estimate'],'covered','the row itself shows the zero-order reference');
  btn(tomato,words[0]).click();await flush();
  const section=walk(el).find(n=>n.attrs['data-supplier-section']&&walk(n).some(x=>x.attrs['data-ingredient']==='tomato')),copy=walk(section).find(n=>n.attrs['data-copy']==='section');
  assert.ok(copy,'section copy card');
  const button=copy.children.find(n=>n.tagName==='BUTTON'),area=walk(copy).find(n=>n.tagName==='TEXTAREA');
  assert.equal(button.disabled,false,'the Buy decision can be sent');
  assert.ok(area.value.split('\n').includes(words[1]),`listed as quantity to confirm: ${area.value}`);
  assert.equal(walk(copy).find(n=>n.attrs['data-copy-kept']!==undefined)?.textContent,words[2],'the card says why it is listed without a quantity');
  const whole=walk(el).find(n=>n.attrs['data-copy']==='suppliers');
  assert.equal(whole.children.find(n=>n.tagName==='BUTTON').disabled,false);
  assert.ok(walk(whole).find(n=>n.tagName==='TEXTAREA').value.split('\n').includes(words[1]));
  assert.ok(walk(whole).some(n=>n.attrs['data-copy-kept']!==undefined&&n.textContent===words[2]),`the whole copy says so too: ${whole.textContent}`);
  let captured=null;navigator.clipboard={writeText:async value=>{captured=value;}};
  button.click();await flush();
  assert.equal(captured,area.value,'the section text reaches the clipboard');
  assert.equal(cls(tomato,'tm-material-estimate')[0].attrs['data-estimate'],'covered','copying changes no reference');
  assert.equal(f.writes.length,0,'choosing a judgment and copying write nothing');
 }finally{f.cleanup();}
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
