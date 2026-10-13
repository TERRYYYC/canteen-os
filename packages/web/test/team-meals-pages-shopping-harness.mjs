/**
 * Actual purchase renderer over a mock network that serves two fixed revisions (A, B) and one saved
 * shoppingListVersion 2 list at A. The DOM shim models <details open> and its queued toggle event.
 * Component-level evidence only; not native browser, Worker or deployment evidence.
 */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {after} from 'node:test';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'purchase-fixed-basis-'));after(()=>rm(dir,{recursive:true,force:true}));
const bundle=await esbuild.build({stdin:{contents:`export * from './src/pages/purchase';export * from './src/api/team-meals';export {renderCandidates,shoppingText} from './src/pages/purchase-list';export {createShoppingList,projectTeamMeals,estimateShoppingList} from '@canteenos/core';`,resolveDir:join(here,'..')},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
const file=join(dir,'page.mjs');await writeFile(file,bundle.outputFiles[0].text);

export class Element{
 constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.text=text;this.children=[];this.attrs={};this.listeners={};this.style={};this.value='';this.disabled=false;this.hidden=false;this.parentNode=null;this.classList={add:x=>this.setAttribute('class',`${this.attrs.class??''} ${x}`.trim())};}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k==='disabled')this.disabled=true;if(k==='checked')this.checked=true;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 // As in browsers, details.open reflects the open attribute.
 get open(){return Object.hasOwn(this.attrs,'open');}set open(v){if(v)this.attrs.open='';else delete this.attrs.open;}
 get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5),v]));}
 appendChild(c){c.parentNode=this;this.children.push(c);return c;}append(...cs){cs.forEach(c=>this.appendChild(c));}prepend(...cs){cs.forEach(c=>c.parentNode=this);this.children.unshift(...cs);}
 replaceChildren(...cs){this.children.forEach(c=>c.parentNode=null);this.children=[];this.text='';this.append(...cs);}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
 get firstChild(){return this.children[0]??null;}get isConnected(){return this.tagName==='BODY'||!!this.parentNode?.isConnected;}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(s){this.replaceChildren();this.text=String(s);}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}dispatch(t){if(t==='click'&&this.disabled)return;for(const fn of this.listeners[t]??[])fn({target:this,preventDefault(){}});}click(){this.dispatch('click');}focus(){document.activeElement=this;}select(){}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
 querySelector(s){return this.querySelectorAll(s)[0]??null;}querySelectorAll(s){return walk(this).slice(1).filter(el=>{const m=s.match(/^\[([^=]+)="([^"]+)"\]$/);return m?el.attrs[m[1]]===m[2]:s.startsWith('.')?(el.attrs.class??'').split(' ').includes(s.slice(1)):el.tagName===s.toUpperCase();});}
}
export const walk=n=>[n,...n.children.flatMap(walk)];
const tick=()=>new Promise(r=>setImmediate(r)),clone=x=>structuredClone(x);
export async function flush(){for(let i=0;i<40;i++)await tick();}
export const A='a'.repeat(40),B='b'.repeat(40);
const RIBS='00000000-0000-4000-8000-000000000131',CHILI='00000000-0000-4000-8000-000000000132';
/** Canonical list keys of the two KB-bound snapshots. */
export const ribs=`kbci-${RIBS.replaceAll('-','')}`,chili=`kbci-${CHILI.replaceAll('-','')}`;
export const selection=[{menuPlanRef:'team-week',date:'2026-09-14',mealType:'lunch'}];
/**
 * Real-recipe shape from #131: names and sources recorded, Ingredient.role absent on some records,
 * one reference without any record. Revision B is the later "current" catalog.
 */
export function inputs(revision){
 const ingredients={
  'ribs-snapshot':{schemaVersion:'3',name:{zh:'排骨',en:'Pork ribs',uk:'Свинячі реберця'},trackStock:false,canonicalIngredientId:RIBS,canonicalIngredientVersion:1},
  'chili-snapshot':{schemaVersion:'3',name:{zh:'小米辣',en:'Bird’s eye chili',uk:'Перець чилі'},role:'seasoning',trackStock:false,canonicalIngredientId:CHILI,canonicalIngredientVersion:1},
  tomato:{schemaVersion:'2',name:{zh:'番茄',en:'Tomato',uk:'Помідор'},baseUnit:'g',role:'main',trackStock:false},
  scallion:{schemaVersion:'2',name:{zh:'小葱',en:'Scallion',uk:'Зелена цибуля'},baseUnit:'g',trackStock:false},
 };
 const meals=[{date:'2026-09-14',mealType:'lunch',dishRef:'ribs-dish',plannedServings:2}];
 if(revision===B){
  // The current catalog has since classified these records; a saved A list must not borrow that.
  ingredients['ribs-snapshot'].role='main';ingredients.scallion.role='seasoning';
  meals.push({date:'2026-09-16',mealType:'dinner',dishRef:'ribs-dish',plannedServings:2});
 }
 const components=[{ingredientRef:'ribs-snapshot',qty:{value:500,unit:'g'}},{ingredientRef:'chili-snapshot',originalAmount:'三根'},{ingredientRef:'tomato',qty:{value:300,unit:'g'}},{ingredientRef:'scallion',qty:{value:20,unit:'g'}},{ingredientRef:'ghost',qty:{value:1,unit:'pcs'}}];
 return {menuPlans:{'team-week':{schemaVersion:'3',meals}},dishes:{'ribs-dish':{schemaVersion:'3',name:{zh:'红烧排骨',en:'Braised ribs',uk:'Тушковані реберця'},baseServings:2,status:'active',components,steps:[]}},ingredients,techniques:[]};
}
let serial=0;
export async function setup({lang='en'}={}){
 const priorGlobals=new Map(['HTMLElement','MutationObserver','window','location','document','localStorage','sessionStorage','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const restoreGlobals=()=>{for(const [key,descriptor] of priorGlobals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{onLine:true}});
 globalThis.HTMLElement=Element;globalThis.MutationObserver=class{observe(){}disconnect(){}};globalThis.window={addEventListener(){}};globalThis.location={hash:'#/purchase/team-shop'};
 globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),activeElement:null};
 const storage=new Map();globalThis.localStorage=globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const page=await import(`${pathToFileURL(file)}?case=${++serial}`),calls=[],writes=[],sources=new Map(),history=new Map(),gates=[];
 let identity=1,current=A,seq=0,post='success',planFails=false;
 const list=page.createShoppingList('team-shop',{sourceRevision:A,selection},inputs(A),'2');
 sources.set('team-shop',{content:list,commit:'c'.repeat(40),blobSha:'initial'});history.set(`team-shop:${'c'.repeat(40)}`,sources.get('team-shop'));
 const json=x=>Response.json(clone(x)),failure=(status,code)=>Response.json({ok:false,errors:[{path:'',code,message:code}]},{status});
 // One API object per page load: reopening after a reload gets its own boundary, as in the browser.
 const makeApi=()=>page.createTeamMealsApi('https://purchase-fixed-basis.invalid',{mode:'mock',identity:()=>identity,token:()=>`explicit-fixture-${identity}`,fetch:async(url,init)=>{
  const u=new URL(url),call={path:u.pathname,revision:u.searchParams.get('revision'),method:init.method};calls.push(call);
  const gate=gates.find(g=>!g.claimed&&g.match(call));if(gate){gate.claimed=true;await gate.promise;}
  if(init.method==='POST'){
   const id=u.pathname.split('/').at(-1),content=JSON.parse(init.body),headers=new Headers(init.headers),prior=sources.get(id);writes.push({id,content,match:headers.get('If-Match'),none:headers.get('If-None-Match')});
   if(post==='conflict'||(prior?headers.get('If-Match')!==prior.blobSha:headers.get('If-None-Match')!=='*')){post='success';return failure(409,'conflict');}
   const commit=(++seq).toString(16).padStart(40,'0'),value={content,commit,blobSha:`saved-${seq}`};sources.set(id,value);history.set(`${id}:${commit}`,value);return json({commit,blobSha:value.blobSha,unchanged:false,warnings:[]});
  }
  if(u.pathname.startsWith('/source/shopping-list/')){const id=u.pathname.split('/').at(-1),v=call.revision?history.get(`${id}:${call.revision}`):sources.get(id);return v?json(v):failure(404,'not_found');}
  const revision=call.revision??current,data=inputs(revision);
  if(u.pathname==='/catalog')return json({commit:revision,dishes:data.dishes,ingredients:data.ingredients,techniques:data.techniques,suppliers:[],translations:{machine:0,human:0,stale:0}});
  if(u.pathname.startsWith('/source/plan/')){if(planFails)return failure(503,'unavailable');const p=data.menuPlans[u.pathname.split('/').at(-1)];return p?json({content:p,commit:revision,blobSha:`plan-${revision}`}):failure(404,'not_found');}
  if(u.pathname==='/shopping-lists')return json({ok:true,commit:current,items:[],nextCursor:null,skipped:0});
  if(u.pathname==='/asset')return failure(404,'not_found');throw new Error(`Unexpected fixture request ${u.pathname}`);
 }});
 const apis=[makeApi()];let render=page.createPurchaseRenderer(apis[0]);
 const start=(rest='team-shop',language=lang)=>{document.body.replaceChildren();const el=new Element('main');document.body.append(el);return{el,promise:render(el,{rest,lang:language,planId:'team-week',route:'purchase'})};};
 return{page,calls,writes,sources,
  async mount(rest,language){const x=start(rest,language);await x.promise;await flush();return x.el;},
  /** A page reload: new API boundary and renderer, same remote storage. */
  fresh(){document.body.replaceChildren();apis.push(makeApi());render=page.createPurchaseRenderer(apis.at(-1));},
  hold(match){let release;const promise=new Promise(r=>release=r);const g={match,promise,release,claimed:false};gates.push(g);return g;},
  current(v){current=v;},post(v){post=v;},planFails(v){planFails=v;},auth(){identity++;},
  cleanup(){try{for(const g of gates)g.release();for(const api of apis)api.dispose();document.body.replaceChildren();}finally{restoreGlobals();}}};
}
export const btn=(el,label)=>{const found=walk(el).find(n=>n.tagName==='BUTTON'&&n.textContent===label);assert.ok(found,`button ${label}`);return found;};
export const boxes=el=>walk(el).filter(n=>n.tagName==='INPUT'&&n.attrs.type==='checkbox');
export const card=(el,id)=>{const found=walk(el).find(n=>n.attrs['data-ingredient']===id);assert.ok(found,`card ${id}`);return found;};
