/** Demo/offline purchase surface: the approved publication is read, never the saved API. */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
import {publishedFixture} from './published-fixture.mjs';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'purchase-readonly-'));
const fixture=publishedFixture('normal');
after(()=>{fixture.cleanup();return rm(dir,{recursive:true,force:true});});
const bundle=await esbuild.build({stdin:{contents:`export * from './src/pages/purchase';export * from './src/api/team-meals';export {createPublishedData} from './src/view-models/published';`,resolveDir:join(here,'..')},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
const file=join(dir,'page.mjs');await writeFile(file,bundle.outputFiles[0].text);
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
const walk=n=>[n,...n.children.flatMap(walk)],cls=(n,c)=>walk(n).filter(x=>(x.attrs.class??'').split(' ').includes(c));
const tags=(n,tag)=>walk(n).filter(x=>x.tagName===tag),marked=(n,key)=>walk(n).find(x=>x.attrs[key]!==undefined);
const boxes=n=>walk(n).filter(x=>x.tagName==='INPUT'&&x.attrs.type==='checkbox');
const tick=()=>new Promise(r=>setImmediate(r)),flush=async()=>{for(let i=0;i<20;i++)await tick();};
let serial=0;
async function mount({lang='en',rest='',planId='week-41',projection='served',source=fixture}={}){
 const priorGlobals=new Map(['HTMLElement','MutationObserver','window','location','document','localStorage','sessionStorage','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const restoreGlobals=()=>{for(const [key,descriptor] of priorGlobals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{onLine:true}});
 globalThis.HTMLElement=Element;globalThis.MutationObserver=class{observe(){}disconnect(){}};globalThis.window={addEventListener(){}};globalThis.location={hash:'#/purchase'};
 globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),activeElement:null};
 const storage=new Map();globalThis.localStorage=globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const page=await import(`${pathToFileURL(file)}?case=${++serial}`),calls=[],reads=[];
 // An unset Worker must stay unset: any saved-API request here is a defect, not a fallback.
 const api=page.createTeamMealsApi('https://purchase-readonly-fixture.invalid',{mode:'unconfigured',identity:()=>1,token:()=>'never-used',fetch:async url=>{calls.push(String(url));throw new Error('unconfigured purchase must not reach the saved API');}});
 const data=page.createPublishedData({baseUrl:'https://fixture.invalid/data/',fetch:async address=>{
  const url=new URL(address);reads.push(url.pathname);
  if(url.pathname.endsWith('build.json'))return Response.json(source.manifest);
  if(url.pathname.includes('/team-meals/'))return projection==='served'?Response.json(source.projection):Response.json({},{status:404});
  return Response.json({},{status:404});
 }});
 let publication=null,publicationError=null;
 try{publication=await data.loadPublication();}catch(e){publicationError=e;}
 const el=new Element('main');document.body.append(el);
 const render=page.createPurchaseRenderer(api);
 let coverage=null;
 await render(el,{lang,rest,planId,route:'purchase',data,publication,publicationError,t:key=>key,setReloadCoverage:value=>{coverage=value;}});
 return{el,calls,reads,coverage,api,cleanup(){try{api.dispose();document.body.replaceChildren();}finally{restoreGlobals();}}};
}
const noticeCopy={zh:/只读清单/,en:/read only/,uk:/лише для читання/};
const wallCopy=/不能保存|saving is unavailable|збереження недоступне/;

test('unconfigured purchase shows the published shopping list instead of one status line',async()=>{
 for(const lang of ['zh','en','uk']){
  const f=await mount({lang});
  try{
   const cards=cls(f.el,'tm-material');
   assert.ok(cards.length>0,`published candidates must render in ${lang}`);
   for(const ref of ['tomato','egg','salt','scallion','cooking-oil'])assert.ok(walk(f.el).some(n=>n.attrs['data-ingredient']===ref),`${ref} in ${lang}`);
   const notice=walk(f.el).find(n=>n.attrs['data-purchase-readonly']==='published');
   assert.ok(notice,'the surface says plainly that it is the published read-only version');
   assert.match(notice.textContent,noticeCopy[lang]);
   assert.doesNotMatch(f.el.textContent,wallCopy,'the old single-line wall is gone');
   assert.equal(f.calls.length,0,'no saved-API request');
   assert.ok(f.reads.some(path=>path.includes('/team-meals/')),'the static published projection is the only source');
   assert.equal(f.coverage,'read-only');
  }finally{f.cleanup();}
 }
});

test('published purchase renders the already verified estimates that no screen used to read',async()=>{
 const f=await mount({lang:'zh'});
 try{
  const oil=walk(f.el).find(n=>n.attrs['data-ingredient']==='cooking-oil');
  assert.ok(oil);
  assert.match(oil.textContent,/宏达粮油调味批发/,'the published supplier line is visible');
  assert.match(oil.textContent,/2/,'pack count from the published estimate');
  assert.doesNotMatch(f.el.textContent,new RegExp(fixture.revision),'no chef token: the source revision is back-office information');
 }finally{f.cleanup();}
});

test('the read-only line says what the buyer can do and never sends them for the chef link',async()=>{
 const copy={zh:/这是只读清单：只能查看/,en:/This is a read-only list: you can look/,uk:/Це список лише для читання: переглядати можна/};
 const chefLink=/师傅链接|chef link|посиланням шефа/;
 for(const lang of ['zh','en','uk']){
  const f=await mount({lang});
  try{
   const line=walk(f.el).find(n=>n.attrs&&n.attrs['data-purchase-writes']!==undefined);
   assert.ok(line,`${lang}: the explanation line is shown`);
   assert.match(line.textContent,copy[lang],`${lang}: says the list can only be looked at`);
   assert.doesNotMatch(f.el.textContent,chefLink,`${lang}: no chef link is suggested`);
  }finally{f.cleanup();}
 }
});

test('every write control on the published purchase list stays rendered and disabled',async()=>{
 const f=await mount({lang:'en'});
 try{
  // Copying text for suppliers is the one enabled action: it reads this preview and writes nothing.
  const copy=walk(f.el).find(n=>n.attrs['data-copy']==='suppliers');
  assert.ok(copy&&copy.children.find(n=>n.tagName==='BUTTON').disabled===false,'the supplier copy stays available');
  const buttons=tags(f.el,'BUTTON').filter(n=>!walk(copy).includes(n));
  assert.ok(buttons.length>0,'write controls are shown, not silently dropped');
  assert.ok(buttons.every(n=>n.disabled===true),'save, re-read and per-item decisions are all disabled');
  assert.ok(boxes(f.el).length>0&&boxes(f.el).every(n=>n.disabled===true),'no item can be ticked');
  assert.ok(marked(f.el,'data-purchase-writes'),'one line explains why the controls are disabled');
  assert.match(f.el.textContent,/This is a read-only list/);
  const before=f.el.textContent;
  for(const button of buttons)button.click();
  for(const box of boxes(f.el))box.dispatch('change');
  assert.equal(f.el.textContent,before,'clicking a disabled control changes nothing');
  assert.equal(f.calls.length,0);
  assert.equal(tags(f.el,'A').length,0,'a read-only surface offers no link into unreachable write routes');
 }finally{f.cleanup();}
});

test('an unreadable published version stays one plain line instead of claiming an empty list',async()=>{
 const f=await mount({lang:'zh',projection:'missing'});
 try{
  assert.equal(marked(f.el,'data-purchase-readonly-state')?.attrs['data-purchase-readonly-state'],'unavailable');
  assert.equal(cls(f.el,'tm-material').length,0);
  assert.doesNotMatch(f.el.textContent,/错误/);
  assert.equal(f.calls.length,0);
 }finally{f.cleanup();}
});

test('a malformed purchase route keeps its own notice ahead of the published fallback',async()=>{
 const f=await mount({lang:'en',rest:'bad!'});
 try{
  assert.equal(cls(f.el,'tm-material').length,0);
  assert.equal(walk(f.el).some(n=>n.attrs['data-purchase-readonly']==='published'),false);
  assert.equal(f.calls.length,0);
 }finally{f.cleanup();}
});

const shownDate=(iso,lang)=>new Intl.DateTimeFormat({zh:'zh-Hans',en:'en',uk:'uk'}[lang],{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${iso}T12:00:00Z`));
test('published day and week deep links limit both sources and estimates to that range',async()=>{
 for(const lang of ['zh','en','uk']){
  for(const [range,date,included,excluded,tomatoKg] of [
   ['day','2026-10-05',['2026-10-05'],['2026-10-07','2026-10-09'],40],
   ['day','2026-10-07',['2026-10-07'],['2026-10-05','2026-10-09'],35],
   ['week','2026-10-07',['2026-10-07','2026-10-09'],['2026-10-05'],55],
  ]){
   const f=await mount({lang,rest:`new/week-41/${range}/${date}`});
   try{
    const sources=cls(f.el,'tm-material-reference').map(n=>n.textContent).join(' ');
    // Dates read per language (display-date.ts); the ISO form is not shown to the kitchen.
    for(const day of included)assert.ok(sources.includes(shownDate(day,lang)),`${lang}/${range}/${date} includes ${day}`);
    for(const day of excluded)assert.ok(!sources.includes(shownDate(day,lang)),`${lang}/${range}/${date} excludes ${day}`);
    assert.ok(![...included,...excluded].some(day=>sources.includes(day)),`${lang}/${range}/${date}: no ISO dates`);
    // Tomato: 7500g/50 servings; ceil(net/0.85*1.1/5000g), min 2 packs.
    const tomato=walk(f.el).find(n=>n.attrs['data-ingredient']==='tomato');
    assert.ok(tomato.textContent.includes(`${tomatoKg} ${{zh:'千克',en:'kg',uk:'кг'}[lang]}`),'estimate follows the narrowed serving demand');
    assert.ok(marked(f.el,'data-purchase-readonly-scope'),'scope is plainly shown');
    assert.equal(f.calls.length,0);
   }finally{f.cleanup();}
  }
 }
});

test('empty published range stays empty; it never falls back to the whole plan',async()=>{
 const f=await mount({rest:'new/week-41/day/2026-10-06'});
 try{
  assert.equal(cls(f.el,'tm-material').length,0);
  assert.match(f.el.textContent,/No recorded ingredients/);
  assert.equal(f.calls.length,0);
 }finally{f.cleanup();}
});

test('saved-list links say that the publication preview has none of the saved decisions',async()=>{
 const f=await mount({rest:'previous-shopping-list'});
 try{
  assert.ok(marked(f.el,'data-purchase-saved-unavailable'));
  assert.match(f.el.textContent,/without that list’s purchase decisions/);
  assert.equal(f.calls.length,0);
 }finally{f.cleanup();}
});

test('missing plan selection does not silently open the first published plan',async()=>{
 const f=await mount({planId:null});
 try{
  assert.equal(cls(f.el,'tm-material').length,0);
  assert.equal(marked(f.el,'data-purchase-readonly-state')?.attrs['data-purchase-readonly-state'],'no-selection');
  assert.equal(f.reads.some(p=>p.includes('/team-meals/')),false);
  assert.equal(f.calls.length,0);
 }finally{f.cleanup();}
});

// ------------------------------------------------ read-only "copy for suppliers" (no token in the kitchen week)
const RANGE='2026-10-05 – 2026-10-09',SEP='────────────────';
const weekly=name=>readFileSync(join(here,'../../../docs/field-test/week-41',`purchase-order-${name}.txt`),'utf8').trimEnd().replace('2026-10-03',RANGE);
const copyParts=el=>{const card=walk(el).find(n=>n.attrs['data-copy']==='suppliers');assert.ok(card,'supplier copy offered');return{card,button:card.children.find(n=>n.tagName==='BUTTON'),area:walk(card).find(n=>n.tagName==='TEXTAREA'),status:walk(card).find(n=>n.attrs.role==='status')};};
const internal=(text,revision)=>{for(const marker of [revision,'week-41','kbci-','[',']'])assert.ok(!text.includes(marker),`no internal marker ${marker}`);};

test('read-only copy lists every published candidate by supplier in the tested week-41 format',async()=>{
 const f=await mount({lang:'zh'});
 try{
  const {card,button,area}=copyParts(f.el);
  assert.equal(button.textContent,'复制给菜贩');assert.equal(button.disabled,false);
  // No decisions exist here, so all five candidates of the plan are listed; numbers are the published estimate.
  assert.equal(area.value,[weekly('hongda'),weekly('lvyuan')].join('\n\n'));
  assert.match(card.textContent,/这里列出所选餐次要用的全部材料，没有「已有」「已买」标记。发给菜贩前，请先删掉已经有的。/);
  internal(area.value,fixture.revision);
  assert.equal(f.calls.length,0);
 }finally{f.cleanup();}
});

test('read-only copy follows the shown all, day and week scope with its own dates and estimates',async()=>{
 const texts=new Set();
 for(const [rest,date,tomato] of [['',RANGE,'19 包 × 5 kg（共 95 kg）'],['new/week-41/day/2026-10-05','2026-10-05','8 包 × 5 kg（共 40 kg）'],['new/week-41/day/2026-10-07','2026-10-07','7 包 × 5 kg（共 35 kg）'],['new/week-41/week/2026-10-07','2026-10-07 – 2026-10-09','11 包 × 5 kg（共 55 kg）']]){
  const f=await mount({lang:'zh',rest});
  try{
   const {area}=copyParts(f.el),heads=area.value.split('\n').filter(line=>line.startsWith('【'));
   assert.equal(heads.length,2,`${rest||'all'}: one message per supplier`);
   assert.ok(heads.every(line=>line.startsWith(`【采购单】${date} · `)),`${rest||'all'}: date line is the shown scope`);
   assert.ok(area.value.includes(`番茄  ${tomato}`),`${rest||'all'}: tomato follows the scope estimate`);
   internal(area.value,fixture.revision);texts.add(area.value);
   assert.equal(f.calls.length,0);
  }finally{f.cleanup();}
 }
 assert.equal(texts.size,4,'each scope copies its own text');
 const f=await mount({lang:'zh',rest:'new/week-41/day/2026-10-06'});
 try{const {button,area}=copyParts(f.el);assert.equal(button.disabled,true,'an empty range has nothing to copy');assert.equal(area.value,'');}finally{f.cleanup();}
});

test('read-only copy names candidates without an estimate as 数量待定 and keeps them out of any total',async()=>{
 const unknown=publishedFixture('quantity-warning');
 try{
  const f=await mount({lang:'zh',source:unknown});
  try{
   const {area}=copyParts(f.el);
   assert.equal(area.value,[
    `【采购单】${RANGE} · 宏达粮油调味批发`,SEP,'食用油  数量待定','食盐  数量待定',SEP,'共 2 样 · 2 样数量待定','',
    `【采购单】${RANGE} · 绿源农产品配送`,SEP,'鸡蛋  数量待定','小葱  数量待定','番茄  数量待定',SEP,'共 3 样 · 3 样数量待定'].join('\n'));
   assert.doesNotMatch(area.value,/¥|包 ×|\d+ (?:g|kg|l|个)/);internal(area.value,unknown.revision);
  }finally{f.cleanup();}
 }finally{unknown.cleanup();}
});

test('read-only copy never adds amounts in different currencies, in the published or a recomputed scope',async()=>{
 const mixed=publishedFixture('mixed-currency');// tomato's last price in UAH, egg and scallion stay CNY
 try{
  const footers={zh:['共 3 样 · 预估 ¥798.00、₴541.50（按上次价；币种不同不合计）','共 2 样 · 预估 ¥186.00（按上次价）'],
   en:['3 items · estimated ¥798.00, ₴541.50 (at last price; currencies differ, not added)','2 items · estimated ¥186.00 (at last price)'],
   uk:['Позицій: 3 · орієнтовно ¥798.00, ₴541.50 (за останньою ціною; різні валюти, не додано)','Позицій: 2 · орієнтовно ¥186.00 (за останньою ціною)']};
  for(const [lang,expected] of Object.entries(footers)){
   const f=await mount({lang,source:mixed});
   try{
    const {area}=copyParts(f.el),lines=area.value.split('\n');
    for(const footer of expected)assert.ok(lines.includes(footer),`${lang}: ${footer}\n${area.value}`);
    assert.doesNotMatch(area.value,/1339\.50/);internal(area.value,mixed.revision);assert.equal(f.calls.length,0);
   }finally{f.cleanup();}
  }
  // 10-05 only (200 servings): egg 2 × ¥150 + scallion 2 × ¥12 = ¥324.00; tomato 8 × ₴28.50 = ₴228.00.
  const f=await mount({lang:'zh',rest:'new/week-41/day/2026-10-05',source:mixed});
  try{assert.ok(copyParts(f.el).area.value.split('\n').includes('共 3 样 · 预估 ¥324.00、₴228.00（按上次价；币种不同不合计）'),'the recomputed day estimate keeps currencies apart too');}finally{f.cleanup();}
 }finally{mixed.cleanup();}
});

test('read-only copy follows the interface language and shares the clipboard and fallback, writing nothing',async()=>{
 const cases={zh:['复制给菜贩',/请先删掉已经有的/,'番茄  19 包 × 5 kg（共 95 kg）','已复制'],en:['Copy for suppliers',/Remove what you already have before sending/,'Tomato  19 packs × 5 kg (total 95 kg)','Copied'],uk:['Копіювати для постачальників',/приберіть те, що вже є/,'Помідор  19 уп. × 5 кг (разом 95 кг)','Скопійовано']};
 for(const [lang,[label,note,tomato,copied]] of Object.entries(cases))for(const behavior of ['copied','rejected','missing']){
  const f=await mount({lang});
  try{
   const {card,button,area,status}=copyParts(f.el);let captured=null;
   assert.equal(button.textContent,label);assert.match(card.textContent,note);assert.ok(area.value.split('\n').includes(tomato),`${lang}: ${tomato}`);
   if(behavior==='copied')navigator.clipboard={writeText:async value=>{captured=value;}};
   if(behavior==='rejected')navigator.clipboard={writeText:async()=>{throw new Error('explicit denied clipboard');}};
   button.click();await flush();
   if(behavior==='copied'){assert.equal(captured,area.value);assert.equal(status.textContent,copied);assert.equal(area.hidden,true);}
   else assert.equal(area.hidden,false,`${lang}/${behavior}: the same text is shown for manual copying`);
   assert.ok(tags(f.el,'BUTTON').filter(n=>n!==button).every(n=>n.disabled===true),'save, re-read and decisions stay disabled');
   assert.equal(f.calls.length,0,'no saved-API request: copying creates no list, decision or basis');
  }finally{f.cleanup();}
 }
});
