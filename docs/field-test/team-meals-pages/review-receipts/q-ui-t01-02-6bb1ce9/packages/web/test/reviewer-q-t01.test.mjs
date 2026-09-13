/** D composition regression: real Plan + Import renderers, C1 API/session/store, local HTTP envelopes. */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
const here=dirname(fileURLToPath(import.meta.url)),req=createRequire(import.meta.url),vr=createRequire(req.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'plan-import-composition-'));after(()=>rm(dir,{recursive:true,force:true}));
const built=await esbuild.build({stdin:{contents:`export {createPlanRenderer} from './src/pages/admin/plan';export {createPlanForm} from './src/pages/admin/plan-form';export {applyPlanImport} from './src/pages/admin/plan-import';export {render as renderImport} from './src/pages/admin/import';export {createTeamMealsApi} from './src/api/team-meals';export {clearToken as changeAuth} from './src/admin/token';export {inspectReloadSafety,createPageReloadCoverage} from './src/view-models/reload-safety';export {bindDraftStore} from './src/admin/store';`,resolveDir:join(here,'..')},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent',plugins:[{name:'read-actual-plan-session',setup(build){build.onLoad({filter:/\/pages\/admin\/plan\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('return Object.assign(renderPlan,{','return Object.assign(renderPlan,{readSession:()=>form.session,'),loader:'ts'}));}}]});
const file=join(dir,'pages.mjs');await writeFile(file,built.outputFiles[0].text);
let mutations=()=>{};
class Element{
 constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.text=text;this.children=[];this.attrs={};this.listeners={};this.style={};this.value='';this.disabled=false;this.validity={badInput:false};this.parentNode=null;this.classList={add:x=>this.setAttribute('class',`${this.attrs.class??''} ${x}`),remove:x=>this.setAttribute('class',(this.attrs.class??'').split(' ').filter(v=>v!==x).join(' '))};}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k==='disabled')this.disabled=true;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];if(k==='disabled')this.disabled=false;}
 get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5),v]));}
 appendChild(c){if(typeof c==='string')c=new Element('',c);c.parentNode=this;this.children.push(c);if(this.tagName==='SELECT'&&c.tagName==='OPTION'&&(this.children.length===1||c.attrs.selected!==undefined))this.value=c.attrs.value??'';mutations();return c;}append(...cs){cs.forEach(c=>this.appendChild(c));}prepend(c){this.insertBefore(c,this.children[0]);}insertBefore(c,b){c.parentNode=this;const i=this.children.indexOf(b);this.children.splice(i<0?this.children.length:i,0,c);mutations();return c;}replaceChildren(...cs){this.children.forEach(c=>c.parentNode=null);this.children=[];this.text='';this.append(...cs);mutations();}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;mutations();}
 get firstChild(){return this.children[0]??null;}get isConnected(){return this.tagName==='BODY'||!!this.parentNode?.isConnected;}get childElementCount(){return this.children.filter(c=>c.tagName).length;}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(s){this.replaceChildren();this.text=String(s);}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}dispatch(t){if(t==='click'&&this.disabled)return;for(const fn of this.listeners[t]??[])fn({target:this,preventDefault(){}});}click(){this.dispatch('click');}focus(){document.activeElement=this;}scrollIntoView(){}
 querySelector(s){return this.querySelectorAll(s)[0]??null;}querySelectorAll(s){return walk(this).slice(1).filter(el=>{const m=s.match(/^\[([^=]+)="([^"]+)"\]$/);return m?el.attrs[m[1]]===m[2]:s.startsWith('.')?(el.attrs.class??'').split(' ').includes(s.slice(1)):s.startsWith('#')?el.attrs.id===s.slice(1):el.tagName===s.toUpperCase();});}
}
const walk=n=>[n,...n.children.flatMap(walk)],focus=(el,key)=>el.querySelector(`[data-focus="${key}"]`),cls=(el,name)=>el.querySelector(`.${name}`),tick=()=>new Promise(r=>setImmediate(r));
const input=(el,key,value,event='input')=>{const node=focus(el,key);assert.ok(node,key);node.value=value;node.dispatch(event);};
const save=el=>cls(el,'tm-actions')?.querySelector('button'),count=(el,index)=>focus(el,`servings-${index}`)?.value;
const remove=(el,index)=>el.querySelector(`[data-meal-index="${index}"]`).querySelector('button').click();
const rows=el=>walk(el).filter(n=>n.attrs['data-meal-index']!==undefined),phase=el=>walk(el).find(n=>n.attrs['data-phase'])?.attrs['data-phase'];
const A='a'.repeat(40),raw='2.0000000000000001';
const base=count=>({schemaVersion:'3',name:{zh:'原计划',en:'Original plan'},margin:1.17,dateRange:{start:'2026-09-01',end:'2026-09-30'},meals:[{date:'2026-09-14',mealType:'lunch',dishRef:'soup',plannedServings:count,serviceWindow:'12:00-13:00'},{date:'2026-09-16',mealType:'dinner',dishRef:'stew',plannedServings:12},{date:'2026-09-17',mealType:'lunch',dishRef:'soup',plannedServings:5}]});
let serial=0;
async function setup(){
 const names=['HTMLElement','MutationObserver','window','location','document','localStorage','sessionStorage','navigator'],prior=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),observers=new Set(),timers=new Set();let queued=false;
 mutations=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;for(const callback of [...observers])callback();});};
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{onLine:true}});
 globalThis.HTMLElement=Element;globalThis.MutationObserver=class{constructor(fn){this.fn=fn;}observe(){observers.add(this.fn);}disconnect(){observers.delete(this.fn);}};
 globalThis.window={addEventListener(){},confirm:()=>true,setTimeout(fn,ms){const id=setTimeout(fn,ms);timers.add(id);return id;},clearTimeout};globalThis.location={hash:'#/admin/plan/week-a'};globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),activeElement:null};
 const storage=new Map();globalThis.localStorage=globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const page=await import(`${pathToFileURL(file)}?case=${++serial}`),calls=[],writes=[],gates=[],sources=new Map(['week-a','week-b'].map((id,i)=>[id,{content:base(i?18:2),commit:A,blobSha:`initial-${id}`}]));let identity=1,seq=0,post='success';
 const json=x=>Response.json(structuredClone(x)),failure=(status,code)=>Response.json({ok:false,errors:[{path:'',code,message:code}]},{status});
 const api=page.createTeamMealsApi(`https://plan-import-${serial}.invalid`,{mode:'mock',token:()=>`explicit-local-${identity}`,identity:()=>identity,fetch:async(url,init)=>{
  const u=new URL(url),call={path:u.pathname,method:init.method,revision:u.searchParams.get('revision'),identity};calls.push(call);
  const gate=gates.find(g=>!g.claimed&&g.match(call));if(gate){gate.claimed=true;await gate.promise;if(gate.fail)return failure(503,'upstream_unavailable');}
  if(init.method==='POST'){
   const body=JSON.parse(init.body),id=u.pathname.split('/').at(-1),headers=new Headers(init.headers);writes.push({id,body,match:headers.get('If-Match'),none:headers.get('If-None-Match')});
   if(post==='conflict'){post='success';return failure(409,'conflict');}
   const commit=(++seq).toString(16).padStart(40,'0'),blobSha=`saved-${seq}`;sources.set(id,{content:body,commit,blobSha});if(post==='lost'){post='success';throw new TypeError('explicit lost response');}return json({commit,blobSha,unchanged:false,warnings:[]});
  }
  if(u.pathname==='/catalog')return json({commit:call.revision??A,dishes:{soup:{schemaVersion:'3',name:{zh:'原汤',en:'Soup',uk:'Суп'},status:'active',components:[]},stew:{schemaVersion:'3',name:{zh:'炖菜',en:'Stew',uk:'Рагу'},status:'active',components:[]}},ingredients:{},techniques:[],suppliers:[],translations:{machine:0,human:0,stale:0}});
  if(u.pathname.startsWith('/source/plan/')){const value=sources.get(u.pathname.split('/').at(-1));return value?json(value):failure(404,'not_found');}throw new Error(`Unexpected request ${u.pathname}`);
 }});
 const plan=page.createPlanRenderer(api),coverage=page.createPageReloadCoverage();
 const fresh=(route,id,lang)=>{document.body.replaceChildren();const el=new Element('main');document.body.append(el);location.hash=`#/admin/plan/${id}${route==='import'?'/import':''}`;return{el,ctx:{lang,route:'admin',rest:id,planId:id,setReloadCoverage:coverage.beginRender('admin',`plan/${id}${route==='import'?'/import':''}`)}};};
 const f={page,api,plan,session:()=>plan.readSession(),calls,writes,sources,async planPage(id='week-a',lang='en'){const {el,ctx}=fresh('plan',id,lang);await plan(el,ctx,id);return el;},async importPage(text='2026-09-15 午 原汤',id='week-a',lang='zh',scopeApi=api){const {el,ctx}=fresh('import',id,lang);await page.renderImport(el,ctx,id,scopeApi);const ta=cls(el,'adm-import-ta');if(text!==null){ta.value=text;ta.dispatch('input');cls(el,'adm-import-parse').click();}return el;},submit(el){const b=cls(el,'adm-import-submit');assert.ok(b);assert.equal(b.disabled,false,el.textContent);b.click();},async flush(){for(let i=0;i<12;i++)await tick();},hold(match){let release;const promise=new Promise(r=>release=r),g={match,promise,release,claimed:false};gates.push(g);return g;},post(value){post=value;},auth(){identity++;page.changeAuth();},leave(){document.body.replaceChildren();location.hash='#/menu';},async cleanup(){for(const g of gates)g.release();for(const t of timers)clearTimeout(t);api.dispose();document.body.replaceChildren();await tick();observers.clear();mutations=()=>{};for(const [k,v] of prior){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}};
 return f;
}
async function savedEight(f){const el=await f.planPage();input(el,'servings-0','8');save(el).click();await f.flush();assert.equal(f.writes.length,1);assert.equal(phase(el),'saved-but-unpublished');return el;}
async function importedReturn(f,text='2026-09-15 午 原汤',id='week-a'){const el=await f.importPage(text,id);f.submit(el);await f.flush();return f.planPage(id);}


// Reviewer cases; author harness reused unchanged, production remains the fixed archive.
test('known new C1 document with explicit 404 source imports without a second Source read and saves create-only',async()=>{const f=await setup();try{
 f.sources.delete('week-a');let el=await f.planPage();assert.equal(rows(el).length,0);const before=f.calls.filter(c=>c.path==='/source/plan/week-a').length;
 el=await importedReturn(f);assert.equal(rows(el).length,1);assert.equal(count(el,0),'');assert.equal(f.calls.filter(c=>c.path==='/source/plan/week-a').length,before);assert.equal(f.writes.length,0);
 save(el).click();await f.flush();assert.equal(f.writes.length,1);assert.equal(f.writes[0].none,'*');assert.equal(f.writes[0].match,null);assert.equal(f.writes[0].body.meals.length,1);
 }finally{await f.cleanup();}});
test('old initial Plan catalog completion cannot overwrite an import applied after Source initialized C1',async()=>{const f=await setup();try{
 const held=f.hold(c=>c.path==='/catalog'&&c.revision===A);const oldLoad=f.planPage();await f.flush();assert.equal(held.claimed,true);let el=document.body.children[0];input(el,'servings-0','11');
 el=await f.importPage();f.submit(el);await f.flush();assert.equal(f.writes.length,0);held.release();await oldLoad;await f.flush();el=await f.planPage();assert.equal(count(el,0),'11');assert.equal(rows(el).length,4);assert.equal(count(el,1),'');assert.equal(f.writes.length,0);
 }finally{await f.cleanup();}});
for(const order of ['specified-omitted','omitted-specified'])test(`${order}: repeated incoming key keeps first-match semantics and only that duplicate loses invalid raw`,async()=>{const f=await setup();try{
 const s=f.sources.get('week-a');s.content.meals.push({...s.content.meals[0],plannedServings:6,serviceWindow:'13:00-14:00'});let el=await savedEight(f);input(el,'servings-0',raw);input(el,'servings-3','13.7');
 const incoming=order==='specified-omitted'?'2026-09-14 午 原汤 7\n2026-09-14 午 原汤':'2026-09-14 午 原汤\n2026-09-14 午 原汤 7';el=await importedReturn(f,incoming);assert.equal(count(el,0),'7');assert.equal(count(el,1),'13.7');assert.equal(rows(el).length,4);assert.equal(focus(el,'servings-0').attrs['aria-invalid'],undefined);assert.equal(focus(el,'servings-1').attrs['aria-invalid'],'true');assert.equal(save(el).disabled,true);assert.equal(f.writes.length,1);
 }finally{await f.cleanup();}});
for(const exists of [true,false])test(`unknown original-source-${exists?'present':'absent'}: recovery leaves merged draft and restores only original conditional lock`,async()=>{const f=await setup();try{
 let el,original;if(exists){el=await savedEight(f);original=structuredClone(f.sources.get('week-a'));input(el,'servings-0','11');}else{f.sources.delete('week-a');el=await f.planPage();input(el,'add-date','2026-09-14');input(el,'add-dish','soup','change');cls(el,'tm-add-form').dispatch('submit');input(el,'servings-0','11');}
 f.post('lost');save(el).click();await f.flush();assert.equal(phase(el),'outcome-unknown');if(exists)f.sources.set('week-a',original);else f.sources.delete('week-a');
 el=await importedReturn(f);const writes=f.writes.length,before=f.calls.filter(c=>c.path==='/source/plan/week-a').length;walk(el).find(n=>n.tagName==='BUTTON'&&n.textContent==='Verify save outcome').click();await f.flush();assert.equal(phase(el),'dirty');assert.equal(count(el,0),'11');assert.equal(rows(el).length,exists?4:2);assert.equal(f.writes.length,writes);assert.equal(f.calls.filter(c=>c.path==='/source/plan/week-a').length-before,exists?2:1);
 save(el).click();await f.flush();assert.equal(f.writes.length,writes+1);assert.equal(f.writes.at(-1).match,exists?'saved-1':null);assert.equal(f.writes.at(-1).none,exists?null:'*');assert.equal(f.writes.at(-1).body.meals[0].plannedServings,11);
 }finally{await f.cleanup();}});
