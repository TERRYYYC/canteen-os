import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const here=dirname(fileURLToPath(import.meta.url)),entry=join(here,'../src/pages/admin/import.ts'),source=await readFile(entry,'utf8');
const bundle=await esbuild.build({stdin:{contents:source+'\nexport { effective, mergePlan, parsePlanText, dishList, getDraftPlan, setDraftPlan, undoDraftPlan }; export {clearDraftPlan} from "../../admin/store"; export {createTeamMealsApi} from "../../api/team-meals";',loader:'ts',resolveDir:dirname(entry)},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
const dir=await mkdtemp(join(tmpdir(),'team-import-'));after(()=>rm(dir,{recursive:true,force:true}));await writeFile(join(dir,'import.mjs'),bundle.outputFiles[0].text);
const {effective,mergePlan,parsePlanText,dishList,render,getDraftPlan,setDraftPlan,undoDraftPlan,clearDraftPlan,createTeamMealsApi}=await import(pathToFileURL(join(dir,'import.mjs')));
const week='2026-09-14',catalog={commit:'a'.repeat(40),dishes:{soup:{schemaVersion:'3',name:{zh:'原汤',en:'Original soup',uk:'Початковий суп'},status:'active',components:[{ingredientRef:'salt'}]},other:{schemaVersion:'2',name:{zh:'另一道'},status:'active'}},ingredients:{},techniques:[],suppliers:[],translations:{machine:0,human:0,stale:0}};
const parsed=(count='')=>parsePlanText({text:`周一午 原汤 ${count}`,dishes:dishList(catalog),weekStart:week}).lines[0];
const row={date:week,mealType:'lunch',dishRef:'soup'};
test('real core parsed missing servings stay blank rather than receiving a page default',()=>{
 const line=parsed();assert.equal(line.status,'ok');assert.equal(Object.hasOwn(line,'plannedServings'),false);
 const result=effective(line,undefined,catalog,week);assert.equal(result.importable,true);assert.equal(result.servings,undefined);
});
test('explicit preview clear overrides parsed original, while untouched preview keeps it',()=>{
 const line=parsed('8');assert.equal(effective(line,undefined,catalog,week).servings,8);
 assert.equal(effective(line,{servings:undefined},catalog,week).servings,undefined);
});
test('preview rejects fractional, nonpositive and nonfinite values without rounding or fallback',()=>{
 for(const value of [1.5,0,-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.equal(effective(parsed('8'),{servings:value},catalog,week).importable,false,String(value));
 assert.equal(effective(parsed(),{servings:3},catalog,week).servings,3);
 assert.equal(effective(parsed(),{servings:undefined},catalog,week).importable,true);
});
test('import upgrades whole Any plan while preserving untouched rows, top-level values and known matching count',()=>{
 const first={...row,plannedServings:8,serviceWindow:'12:00-13:00'},duplicate={...row,plannedServings:11,serviceWindow:'13:00-14:00'},outside={date:'2026-09-17',mealType:'dinner',dishRef:'other',plannedServings:19};
 const base={schemaVersion:'2',name:{zh:'原计划',en:'Original'},margin:1.17,dateRange:{start:'2026-09-01',end:'2026-09-30'},meals:[first,duplicate,outside]},before=structuredClone(base);
 const result=mergePlan(base,[row,{date:'2026-09-15',mealType:'dinner',dishRef:'soup'}],'week-38',week);
 assert.equal(result.schemaVersion,'3');assert.equal(result.margin,1.17);assert.deepEqual(result.name,base.name);assert.deepEqual(result.dateRange,base.dateRange);
 assert.deepEqual(result.meals[0],first);assert.deepEqual(result.meals[1],duplicate);assert.deepEqual(result.meals.at(-1),outside);assert.equal(Object.hasOwn(result.meals[2],'plannedServings'),false);assert.deepEqual(base,before);
});
test('only an explicit clear removes matched known count; duplicate rows and service window survive',()=>{
 const first={...row,plannedServings:8,serviceWindow:'12:00-13:00'},duplicate={...row,plannedServings:11};
 const result=mergePlan({schemaVersion:'3',meals:[first,duplicate]},[row],'week-38',week,new Set([0]));
 assert.equal(Object.hasOwn(result.meals[0],'plannedServings'),false);assert.equal(result.meals[0].serviceWindow,first.serviceWindow);assert.deepEqual(result.meals[1],duplicate);
});
test('new unknown plan is v3 and known incoming count updates first matching occurrence only',()=>{
 const fresh=mergePlan(null,[row],'week-38',week);assert.equal(fresh.schemaVersion,'3');assert.equal(Object.hasOwn(fresh.meals[0],'plannedServings'),false);
 const result=mergePlan({schemaVersion:'3',meals:[{...row,plannedServings:8},{...row,plannedServings:9}]},[{...row,plannedServings:4}],'week-38',week);
 assert.deepEqual(result.meals.map(x=>x.plannedServings),[4,9]);
});

// DOM double tests execute the actual renderer and C1 transport; no browser/layout claim.
class Element {
 constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.parentNode=null;this.connected=false;this.text=text;this.listeners={};this.value='';this.disabled=false;this.validity={badInput:false};this.style={};this.classList={add:x=>this.setAttribute('class',`${this.attrs.class??''} ${x}`),remove:x=>this.setAttribute('class',(this.attrs.class??'').split(' ').filter(v=>v!==x).join(' '))};}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k==='disabled')this.disabled=true;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];if(k==='disabled')this.disabled=false;}
 appendChild(c){if(typeof c==='string')c=new Element('',c);c.parentNode=this;this.children.push(c);return c;}append(...cs){cs.forEach(c=>this.appendChild(c));}prepend(c){this.insertBefore(c,this.children[0]);}insertBefore(c,b){c.parentNode=this;const i=this.children.indexOf(b);this.children.splice(i<0?this.children.length:i,0,c);return c;}
 replaceChildren(...cs){this.children.forEach(c=>c.parentNode=null);this.children=[];this.text='';this.append(...cs);}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
 get isConnected(){return this.connected||!!this.parentNode?.isConnected;}get childElementCount(){return this.children.filter(c=>c.tagName).length;}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(v){this.replaceChildren();this.text=String(v);}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}dispatch(t){if(t==='click'&&this.disabled)return;for(const f of this.listeners[t]??[])f({target:this,preventDefault(){}});}scrollIntoView(){}
 querySelector(selector){return descendants(this).find(el=>selector.startsWith('.')?(el.attrs.class??'').split(' ').includes(selector.slice(1)):selector.startsWith('#')?el.attrs.id===selector.slice(1):el.tagName===selector.toUpperCase())??null;}
}
const descendants=n=>n.children.flatMap(c=>[c,...descendants(c)]),documentDouble={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t)};documentDouble.body.connected=true;
globalThis.document=documentDouble;globalThis.window={addEventListener(){},confirm:()=>true,setTimeout,clearTimeout};globalThis.location={hash:'#/admin/plan/week-38/import'};
const mount=()=>{const el=new Element('main');documentDouble.body.replaceChildren(el);return el;},tick=()=>new Promise(r=>setImmediate(r));
const ctx=lang=>({lang,rest:'week-38',route:'admin',planId:'week-38',t:key=>key,data:{}});
function setup(){
 const calls=[],base={schemaVersion:'3',margin:1.17,name:{zh:'完整原计划'},meals:[{...row,plannedServings:8,serviceWindow:'12:00-13:00'},{date:'2026-09-17',mealType:'dinner',dishRef:'other',plannedServings:19}]};let gate=null,principal=1;
 clearDraftPlan('week-38');const api=createTeamMealsApi('https://import-fixture.invalid',{mode:'mock',token:()=>`explicit-fixture-${principal}`,identity:()=>principal,fetch:async(url,init)=>{const u=new URL(url);calls.push({path:u.pathname,method:init.method});assert.equal(init.method,'GET','import must not write remotely');if(u.pathname==='/catalog')return new Response(JSON.stringify(catalog));if(u.pathname==='/source/plan/week-38'){if(gate)await gate;return new Response(JSON.stringify({content:base,blobSha:'fixture-plan',commit:catalog.commit}));}throw new Error('unexpected fixture path');}});
 after(()=>api.dispose());return {api,base,calls,hold:()=>{let release;gate=new Promise(r=>release=r);return release;},changeAuth:()=>principal++};
}
async function preview(f,text='周一午 原汤'){const el=mount();await render(el,ctx('zh'),'week-38',f.api);const ta=el.querySelector('#adm-import-text');ta.value=text;ta.dispatch('input');el.querySelector('.adm-import-parse').dispatch('click');return el;}
test('actual import renderer reads v3 via C1 and hands the whole preserved plan to shared store without a POST',async()=>{
 const f=setup(),el=await preview(f);assert.equal(el.querySelector('.adm-import-servings').value,'');assert.match(el.textContent,/模拟演示/);el.querySelector('.adm-import-submit').dispatch('click');await tick();await tick();
 const plan=getDraftPlan('week-38');assert.equal(plan.schemaVersion,'3');assert.equal(plan.meals[0].plannedServings,8);assert.deepEqual(plan.meals[1],f.base.meals[1]);assert.equal(plan.margin,1.17);assert.deepEqual(f.calls.map(c=>c.path),['/catalog','/source/plan/week-38']);assert.equal(undoDraftPlan('week-38'),true);assert.equal(getDraftPlan('week-38'),null);
});
test('actual preview explicit clear survives language repaint and invalid entry can be corrected',async()=>{
 const f=setup();let el=await preview(f,'周一午 原汤 8'),field=el.querySelector('.adm-import-servings');assert.equal(field.value,'8');field.value='1.5';field.dispatch('input');assert.equal(field.value,'1.5');assert.equal(field.getAttribute('aria-invalid'),'true');assert.equal(el.querySelector('.adm-import-submit').disabled,true);
 field.value='';field.dispatch('input');el=mount();await render(el,ctx('uk'),'week-38',f.api);field=el.querySelector('.adm-import-servings');assert.equal(field.value,'');assert.equal(field.getAttribute('aria-invalid'),'false');el.querySelector('.adm-import-submit').dispatch('click');await tick();await tick();assert.equal(Object.hasOwn(getDraftPlan('week-38').meals[0],'plannedServings'),false);assert.equal(getDraftPlan('week-38').meals[0].serviceWindow,'12:00-13:00');
});
test('late saved-plan read cannot import over a newer preview or an auth lifetime',async()=>{
 const f=setup(),release=f.hold(),el=await preview(f);el.querySelector('.adm-import-submit').dispatch('click');await tick();const field=el.querySelector('.adm-import-servings');field.value='6';field.dispatch('input');release();await tick();await tick();assert.equal(getDraftPlan('week-38'),null);assert.equal(field.value,'6');
 f.changeAuth();const next=mount();await render(next,ctx('en'),'week-38',f.api);assert.equal(next.querySelector('#adm-import-text').value,'');assert.equal(next.querySelector('.adm-import-servings'),null);
});
test('unconfigured import shows honest unavailable state without fallback mock reads',async()=>{
 let reads=0;const api=createTeamMealsApi('',{fetch:async()=>{reads++;throw new Error('must not read');}});after(()=>api.dispose());const el=mount();await render(el,ctx('en'),'week-38',api);assert.equal(reads,0);assert.match(el.textContent,/not connected|not configured|not set up/i);assert.equal(el.querySelector('.adm-import-submit'),null);
});
test('an initially blank preview has an explicit clear action to remove a matched saved count',async()=>{
 const f=setup(),el=await preview(f),clear=el.querySelector('.adm-import-clear-servings');assert.ok(clear,'already blank rows still need an explicit clear action');clear.dispatch('click');assert.equal(el.querySelector('.adm-import-servings').value,'');el.querySelector('.adm-import-submit').dispatch('click');await tick();await tick();assert.equal(Object.hasOwn(getDraftPlan('week-38').meals[0],'plannedServings'),false);
});

test('I-R1 canceled source read derives action validity from the current preview',async()=>{
 for(const raw of ['1.5','','6']){
  const f=setup(),release=f.hold(),el=await preview(f,'周一午 原汤 8');
  el.querySelector('.adm-import-submit').dispatch('click');await tick();
  const field=el.querySelector('.adm-import-servings');field.value=raw;field.dispatch('input');
  release();await tick();await tick();
  assert.equal(getDraftPlan('week-38'),null);
  assert.equal(el.querySelector('.adm-import-submit').disabled,raw==='1.5',raw);
  assert.equal(el.querySelector('.adm-import-submit').getAttribute('aria-busy'),null);
 }
});
test('raw preview refuses loss of numeric precision and retains the original input after repaint',async()=>{
 for(const raw of ['2.0000000000000001','9007199254740993','9007199254740992','2.0000000000000001e1']){
  const f=setup();let el=await preview(f,'周一午 原汤 8');let field=el.querySelector('.adm-import-servings');
  field.value=raw;field.dispatch('input');
  assert.equal(field.getAttribute('aria-invalid'),'true',raw);assert.equal(el.querySelector('.adm-import-submit').disabled,true,raw);
  el=mount();await render(el,ctx('uk'),'week-38',f.api);field=el.querySelector('.adm-import-servings');
  assert.equal(field.value,raw,'invalid raw survives language repaint');assert.equal(field.getAttribute('aria-invalid'),'true');
  assert.equal(getDraftPlan('week-38'),null);
 }
});
test('exact integer decimal and exponent representations remain supported in the preview',async()=>{
 for(const [raw,value] of [['2',2],['2.0',2],['2e2',200],['20e-1',2],['9007199254740991',9007199254740991]]){
  const f=setup(),el=await preview(f,'周一午 原汤 8'),field=el.querySelector('.adm-import-servings');field.value=raw;field.dispatch('input');
  assert.equal(field.getAttribute('aria-invalid'),'false',raw);el.querySelector('.adm-import-submit').dispatch('click');await tick();await tick();
  assert.equal(getDraftPlan('week-38').meals[0].plannedServings,value,raw);
 }
});

test('approved core invalid servings are shown as unparsed original text with no import fallback',async()=>{
 for(const raw of ['周一午 原汤 2.5份','周一午 原汤 2.0000000000000001份','周一午 原汤 9007199254740993份']){
  const f=setup(),el=await preview(f,raw);assert.ok(el.querySelector('.adm-import-line-unparsed'));assert.ok(el.textContent.includes(raw));assert.match(el.textContent,/份数/);assert.equal(el.querySelector('.adm-import-submit').disabled,true);assert.equal(getDraftPlan('week-38'),null);assert.equal(f.calls.length,1);
 }
});
