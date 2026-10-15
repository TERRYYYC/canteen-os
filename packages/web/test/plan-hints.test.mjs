import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
// Same bundling and DOM stand-in as team-meals-pages-plan-raw.test.mjs; the real renderer and TeamMealsApi stay in place.
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'plan-hints-'));after(()=>rm(dir,{recursive:true,force:true}));
const entry=join(here,'../src/pages/admin/plan.ts'),bundle=await esbuild.build({stdin:{contents:(await readFile(entry,'utf8'))+`\nexport {createTeamMealsApi} from ${JSON.stringify(join(here,'../src/api/team-meals.ts'))};`,resolveDir:dirname(entry),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
const file=join(dir,'page.mjs');await writeFile(file,bundle.outputFiles[0].text);
class Element{
 constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.text=text;this.children=[];this.attrs={};this.listeners={};this.style={};this.value='';this.disabled=false;this.validity={badInput:false};this.parentNode=null;this.classList={add:x=>this.setAttribute('class',`${this.attrs.class??''} ${x}`)};}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k==='disabled')this.disabled=true;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5),v]));}
 appendChild(c){c.parentNode=this;this.children.push(c);if(this.tagName==='SELECT'&&c.tagName==='OPTION'&&(this.children.length===1||c.attrs.selected!==undefined))this.value=c.attrs.value??'';return c;}append(...cs){cs.forEach(c=>this.appendChild(c));}replaceChildren(...cs){this.children.forEach(c=>c.parentNode=null);this.children=[];this.text='';this.append(...cs);}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
 get firstChild(){return this.children[0]??null;}get isConnected(){return this.tagName==='BODY'||!!this.parentNode?.isConnected;}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(s){this.replaceChildren();this.text=String(s);}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}dispatch(t){if(t==='click'&&this.disabled)return;for(const fn of this.listeners[t]??[])fn({target:this,preventDefault(){}});}click(){this.dispatch('click');}focus(){document.activeElement=this;}
 querySelector(s){return this.querySelectorAll(s)[0]??null;}querySelectorAll(s){return walk(this).slice(1).filter(el=>{const m=s.match(/^\[([^=]+)="([^"]+)"\]$/);return m?el.attrs[m[1]]===m[2]:s.startsWith('.')?(el.attrs.class??'').split(' ').includes(s.slice(1)):el.tagName===s.toUpperCase();});}
}
const walk=n=>[n,...n.children.flatMap(walk)],cls=(n,c)=>walk(n).filter(x=>(x.attrs.class??'').split(' ').includes(c)),focus=(n,key)=>walk(n).find(x=>x.attrs['data-focus']===key),tick=()=>new Promise(r=>setImmediate(r));
const save=el=>cls(el,'tm-actions')[0].querySelector('button'),rowOf=(el,index)=>walk(el).find(x=>x.attrs['data-meal-index']===String(index));
const input=(el,key,value,type='input')=>{const node=focus(el,key);node.value=value;node.dispatch(type);};
const A='a'.repeat(40),B='b'.repeat(40);
// Monday 2026-10-05. soup: 3 times (two on the same day), rice: 2 times, stew: once.
const seed=()=>({schemaVersion:'3',meals:[
 {date:'2026-10-06',mealType:'dinner',dishRef:'soup',plannedServings:8},
 {date:'2026-10-05',mealType:'lunch',dishRef:'soup',plannedServings:6},
 {date:'2026-10-05',mealType:'breakfast',dishRef:'soup',plannedServings:4},
 {date:'2026-10-07',mealType:'lunch',dishRef:'stew',plannedServings:5},
 {date:'2026-10-07',mealType:'dinner',dishRef:'rice'},
 {date:'2026-10-08',mealType:'lunch',dishRef:'rice',plannedServings:6},
]});
const dishes={
 soup:{schemaVersion:'3',name:{zh:'番茄汤',en:'Tomato soup',uk:'Томатний суп'},components:[]},
 stew:{schemaVersion:'3',name:{zh:'炖菜',en:'Stew'},components:[]},
 rice:{schemaVersion:'3',name:{zh:'米饭',en:'Rice',uk:'Рис'},components:[]},
};
let serial=0;
async function setup(content=seed()){
 globalThis.HTMLElement=Element;globalThis.MutationObserver=class{observe(){}disconnect(){}};globalThis.window={addEventListener(){}};globalThis.location={hash:'#/admin/plan/week-a'};globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),activeElement:null};
 const storage=new Map();globalThis.localStorage=globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const page=await import(`${pathToFileURL(file)}?case=${++serial}`),writes=[];
 const api=page.createTeamMealsApi('https://plan-hints-fixture.invalid',{mode:'mock',token:()=>'explicit-local-fixture',identity:()=>1,fetch:async(url,init)=>{const u=new URL(url);
  if(init.method==='POST'){writes.push({id:u.pathname,body:JSON.parse(init.body)});return Response.json({ok:true,commit:B,blobSha:'after',unchanged:false,warnings:[]});}
  if(u.pathname==='/catalog')return Response.json({commit:A,dishes,ingredients:{},techniques:[],suppliers:[],translations:{machine:0,human:0,stale:0}});
  return Response.json({content,commit:A,blobSha:'before'});}});
 const render=page.createPlanRenderer(api);
 return{writes,async mount(lang='en'){document.body.replaceChildren();const el=new Element('main');document.body.append(el);await render(el,{lang,planId:'week-a',route:'admin',rest:'week-a',setReloadCoverage(){}},'week-a');return el;},
  async flush(){for(let i=0;i<5;i++)await tick();},cleanup(){api.dispose();document.body.replaceChildren();}};
}
const turn=(el,index)=>cls(rowOf(el,index),'tm-plan-turn')[0]?.textContent;

test('repeat turns: same day by meal order, across days, and a third time; the date is the previous turn',async()=>{
 const f=await setup();try{
  const el=await f.mount('en');
  // soup in time order: 10-05 breakfast (row 2), 10-05 lunch (row 1), 10-06 dinner (row 0)
  assert.equal(turn(el,2),'1st time in this plan');
  assert.equal(turn(el,1),'2nd time in this plan · Last: Mon, Oct 5');
  assert.equal(turn(el,0),'3rd time in this plan · Last: Mon, Oct 5');
  assert.equal(turn(el,4),'1st time in this plan');
  assert.equal(turn(el,5),'2nd time in this plan · Last: Wed, Oct 7');
 }finally{f.cleanup();}
});
test('overview wording holds for a single dish: English singular, Ukrainian label and number',async()=>{
 const f=await setup({schemaVersion:'3',meals:[{date:'2026-10-05',mealType:'lunch',dishRef:'stew'}]});try{
  assert.equal(cls(await f.mount('en'),'tm-plan-overview')[0].textContent,'1 dish · 1 different · 0 repeated');
  assert.equal(cls(await f.mount('uk'),'tm-plan-overview')[0].textContent,'Страв: 1 · різних: 1 · повторів: 0');
  assert.equal(cls(await f.mount('zh'),'tm-plan-overview')[0].textContent,'1 道菜 · 1 种 · 重复 0 种');
 }finally{f.cleanup();}
});
test('a dish that appears once gets no repeat line',async()=>{
 const f=await setup();try{const el=await f.mount('en');assert.equal(turn(el,3),undefined);}finally{f.cleanup();}
});
test('overview counts rows, different dishes and repeated dishes, in three languages',async()=>{
 const f=await setup();try{
  assert.equal(cls(await f.mount('zh'),'tm-plan-overview')[0].textContent,'6 道菜 · 3 种 · 重复 2 种');
  assert.equal(cls(await f.mount('en'),'tm-plan-overview')[0].textContent,'6 dishes · 3 different · 2 repeated');
  assert.equal(cls(await f.mount('uk'),'tm-plan-overview')[0].textContent,'Страв: 6 · різних: 3 · повторів: 2');
 }finally{f.cleanup();}
});
test('day filter changes the rows shown but not the overview or the turn numbers',async()=>{
 const f=await setup();try{
  const el=await f.mount('en');const before=cls(el,'tm-plan-overview')[0].textContent;
  const turnsBefore=[0,1,2,3,4,5].map(i=>turn(el,i));
  input(el,'range','day','change');
  const shown=walk(el).filter(x=>x.attrs['data-meal-index']!==undefined).map(x=>Number(x.attrs['data-meal-index']));
  assert.ok(shown.length>0&&shown.length<6,'filter hides rows');
  assert.equal(cls(el,'tm-plan-overview')[0].textContent,before);
  assert.equal(before,'6 dishes · 3 different · 2 repeated');
  // A filtered view still counts turns over the whole plan.
  for(const i of shown)assert.equal(turn(el,i),turnsBefore[i],`row ${i}`);
  assert.ok(shown.some(i=>turnsBefore[i]?.startsWith('2nd')||turnsBefore[i]?.startsWith('3rd')),'the view shows a repeat whose earlier turn is filtered out');
 }finally{f.cleanup();}
});
test('repeat wording in zh and uk',async()=>{
 const f=await setup();try{
  assert.match(turn(await f.mount('zh'),1),/^本计划第 2 次 · 上次 10月5日周一$/);
  const uk=turn(await f.mount('uk'),0);assert.match(uk,/^3-й раз у цьому плані · Минулого разу: /);assert.doesNotMatch(uk,/Oct|10月/);
 }finally{f.cleanup();}
});
// D0 四条线第一批第 2 条：重复次数按整个计划数，计划跨周也一样，所以写「本计划」而不是「本周」（#150 审查）。
test('a plan across two weeks counts repeats over the whole plan, like the overview',async()=>{
 const f=await setup({schemaVersion:'3',dateRange:{start:'2026-10-19',end:'2026-10-31'},meals:[
  {date:'2026-10-26',mealType:'lunch',dishRef:'soup',plannedServings:6},{date:'2026-10-19',mealType:'lunch',dishRef:'soup',plannedServings:6},{date:'2026-10-20',mealType:'lunch',dishRef:'stew',plannedServings:5}]});try{
  let el=await f.mount('en');
  assert.equal(turn(el,1),'1st time in this plan');assert.equal(turn(el,0),'2nd time in this plan · Last: Mon, Oct 19');
  assert.equal(cls(el,'tm-plan-overview')[0].textContent,'3 dishes · 2 different · 1 repeated');
  el=await f.mount('zh');assert.equal(turn(el,0),'本计划第 2 次 · 上次 10月19日周一');assert.doesNotMatch(el.textContent,/本周第/);
  el=await f.mount('uk');assert.match(turn(el,0),/^2-й раз у цьому плані · Минулого разу: /);assert.doesNotMatch(el.textContent,/цього тижня/);
 }finally{f.cleanup();}
});
test('other-language line: zh reader sees uk only; uk and en readers see zh only; none when absent or equal',async()=>{
 const f=await setup();try{
  const other=(el,i)=>cls(rowOf(el,i),'tm-plan-other')[0]?.textContent;
  let el=await f.mount('zh');assert.equal(other(el,0),'Томатний суп');assert.equal(other(el,3),undefined,'stew has no uk text; no fallback to en');
  el=await f.mount('uk');assert.equal(other(el,0),'番茄汤');assert.equal(other(el,3),undefined,'uk reader already sees 炖菜 as the main text; same text is not repeated');
  el=await f.mount('en');assert.equal(other(el,3),'炖菜');assert.equal(other(el,0),'番茄汤');assert.equal(other(el,4),'米饭');
 }finally{f.cleanup();}
});
test('missing servings says so beside the box, stays empty and is saved without a number',async()=>{
 const f=await setup();try{
  const miss=el=>cls(rowOf(el,4),'tm-plan-missing')[0]?.textContent;
  assert.equal(miss(await f.mount('zh')),'份数没填');assert.equal(miss(await f.mount('uk')),'порції не вказано');
  const el=await f.mount('en');assert.equal(miss(el),'servings missing');assert.equal(focus(el,'servings-4').value,'');
  assert.equal(cls(rowOf(el,0),'tm-plan-missing').length,0);
  input(el,'servings-0','9');save(el).click();await f.flush();
  assert.equal(Object.hasOwn(f.writes[0].body.meals[4],'plannedServings'),false);
  input(el,'servings-1','');assert.equal(cls(rowOf(el,1),'tm-plan-missing')[0].textContent,'servings missing');
 }finally{f.cleanup();}
});
test('unsaved reminder appears after an edit and disappears once saved; it adds no button',async()=>{
 const f=await setup();try{
  const el=await f.mount('en');assert.equal(cls(el,'tm-plan-unsaved').length,0);
  const buttons=walk(el).filter(x=>x.tagName==='BUTTON').length;
  input(el,'servings-0','9');
  const bar=cls(el,'tm-plan-unsaved')[0];assert.ok(bar);assert.match(bar.textContent,/^Changes not saved · after saving, publish too/);
  assert.equal(bar.querySelectorAll('button').length,0);assert.equal(walk(el).filter(x=>x.tagName==='BUTTON').length,buttons);
  save(el).click();await f.flush();
  assert.equal(cls(el,'tm-plan-unsaved').length,0);assert.equal(f.writes.length,1);
 }finally{f.cleanup();}
});
test('unsaved reminder also shows for page inputs not yet applied, like an invalid servings number',async()=>{
 const f=await setup();try{
  const el=await f.mount('en');assert.equal(cls(el,'tm-plan-unsaved').length,0);
  input(el,'servings-0','0');
  assert.ok(walk(el).some(x=>x.attrs['data-plan-raw-pending']==='true'),'the status line reports the unapplied input');
  assert.ok(cls(el,'tm-plan-unsaved')[0],'so does the bottom reminder');
  assert.equal(save(el).disabled,true,'saving stays blocked until the number is fixed');
 }finally{f.cleanup();}
});
test('unsaved reminder wording in zh and uk',async()=>{
 const f=await setup();try{
  let el=await f.mount('zh');input(el,'servings-0','9');assert.equal(cls(el,'tm-plan-unsaved')[0].textContent,'有改动没保存 · 保存后还要发布，帮厨和采购才看得到');
  el=await f.mount('uk');input(el,'servings-0','9');assert.equal(cls(el,'tm-plan-unsaved')[0].textContent,'Є незбережені зміни · після збереження план ще треба опублікувати, щоб його побачили помічники кухаря й закупівельник');
  el=await f.mount('en');input(el,'servings-0','9');assert.equal(cls(el,'tm-plan-unsaved')[0].textContent,'Changes not saved · after saving, publish too so the prep cooks and the buyer can see them');
 }finally{f.cleanup();}
});
test('hints carry no developer information',async()=>{
 const f=await setup();try{const el=await f.mount('en');const text=[...cls(el,'tm-plan-turn'),...cls(el,'tm-plan-overview'),...cls(el,'tm-plan-other')].map(n=>n.textContent).join(' ');assert.doesNotMatch(text,/week-a|soup|stew|rice|dishRef|[0-9a-f]{40}/);}finally{f.cleanup();}
});
