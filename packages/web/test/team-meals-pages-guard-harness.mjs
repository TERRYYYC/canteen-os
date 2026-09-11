import assert from 'node:assert/strict';import {test,after} from 'node:test';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {Element} from './team-meals-pages-unload-dom.mjs';
const require=createRequire(import.meta.url),esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild'))),dir=await mkdtemp(join(tmpdir(),'d-unload-'));
after(()=>rm(dir,{recursive:true,force:true}));
const build=await esbuild.build({stdin:{contents:`export {render as ingredient} from './src/pages/admin/ingredient-new';export {render as dish,inspectDishOwner} from './src/pages/admin/dish-new';export {render as paste} from './src/pages/admin/import';export {render as publish} from './src/pages/admin/publish';export {initPwa} from './src/pwa';export {createTeamMealsApi} from './src/api/team-meals';export {HttpAdminApi} from './src/api/client';export {clearToken} from './src/admin/token';export {inspectReloadSafety,createPageReloadCoverage} from './src/view-models/reload-safety';`,resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.BASE_URL':'"/"','import.meta.env.VITE_WORKER_URL':'""'},logLevel:'silent',plugins:[{name:'local-transport-plugin',setup(b){b.onLoad({filter:/\/pages\/admin\/(dish-new|ingredient-form|editor-actions)\.ts$/},async a=>{
 let source=await readFile(a.path,'utf8');
 for(const [path,kind] of [['./ingredient-form','inline'],['./editor-image','image'],['../../api/client','legacy']])source=source.replaceAll(`await import("${path}")`,`await globalThis.fixture.optional("${kind}", () => import("${path}"))`);
 if(a.path.endsWith('dish-new.ts'))source+='\nexport const inspectDishOwner = () => formOwner;';
 return {contents:source,loader:'ts'};
});b.onResolve({filter:/^virtual:pwa-register$/},()=>({path:'sw',namespace:'local'}));b.onResolve({filter:/api\/(client|team-meals)$/},a=>a.importer.includes('/pages/')?{path:a.path.endsWith('client')?'legacy':'team',namespace:'local'}:undefined);b.onLoad({filter:/.*/,namespace:'local'},a=>({loader:'js',contents:a.path==='sw'?'export const registerSW=options=>globalThis.fixture.register(options);':a.path==='legacy'?'export const getApi=()=>globalThis.fixture.legacy;':'export const getTeamMealsApi=()=>globalThis.fixture.team;'}));}}]});
await writeFile(join(dir,'pages.mjs'),build.outputFiles[0].text);
const A='a'.repeat(40),B='b'.repeat(40),defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};let serial=0;
// BeforeUnloadEvent.returnValue is a writable DOMString, unlike Node 20's generic Event getter.
function beforeUnloadEvent(){
 const event=new Event('beforeunload',{cancelable:true});let value='';
 Object.defineProperty(event,'returnValue',{configurable:true,get:()=>value,set:next=>{value=String(next);}});
 return event;
}
export async function setup(){
 const priorGlobals=new Map(['window','document','location','localStorage','sessionStorage','navigator','HTMLElement','MutationObserver','fixture','setTimeout','clearTimeout','setInterval','clearInterval'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const restoreGlobals=()=>{for(const [key,descriptor] of priorGlobals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
 const events=new EventTarget(),docEvents=new EventTarget(),sw=new EventTarget(),storage=new Map([['canteenos.lang','en']]),timers=new Set();
 const oldTimers={setTimeout,clearTimeout,setInterval,clearInterval};
 globalThis.setTimeout=(fn,ms,...args)=>{const t=oldTimers.setTimeout(fn,ms,...args);if(ms>=2000)t.unref();timers.add(t);return t;};globalThis.setInterval=()=>0;globalThis.clearInterval=()=>{};
 const root=new Element('body'),app=new Element('div');app.id='app';root.append(app);const outlet=new Element('div');app.append(outlet);
 globalThis.document={body:root,baseURI:'https://fixture.invalid/',hidden:false,activeElement:null,createElement:tag=>new Element(tag),createTextNode:t=>new Element('',t),getElementById:id=>root.querySelector('#'+id),addEventListener:docEvents.addEventListener.bind(docEvents),removeEventListener:docEvents.removeEventListener.bind(docEvents)};
 globalThis.localStorage=globalThis.sessionStorage={getItem:k=>storage.get(k)??(k.includes('lang')?'en':null),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const counts={attempts:0,reloads:0,cancelled:0,writes:0};
 const unload=()=>{const event=beforeUnloadEvent();events.dispatchEvent(event);return event.defaultPrevented||event.returnValue!=='';};
 globalThis.location={hash:'#/admin',reload(){counts.attempts++;if(unload())counts.cancelled++;else counts.reloads++;}};
 globalThis.window=Object.assign(events,{matchMedia:()=>({matches:false}),confirm:()=>true,setInterval:()=>0,clearInterval:()=>{},setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Local composition test',platform:'',maxTouchPoints:0,languages:['en'],onLine:true,serviceWorker:sw}});window.navigator=navigator;globalThis.HTMLElement=Element;globalThis.MutationObserver=class{observe(){}disconnect(){}};
 const m=await import(`${pathToFileURL(join(dir,'pages.mjs'))}?case=${++serial}`);let identity=0,callbacks,writeGate=null;
 const ingredient={schemaVersion:'2',name:{zh:'盐',en:'Salt'},baseUnit:'g',trackStock:false},dish={schemaVersion:'3',name:{zh:'汤',en:'Soup'},status:'draft',components:[{ingredientRef:'salt'}]},plan={schemaVersion:'3',name:{en:'Week'},meals:[]};
 const source={content:ingredient,commit:A,blobSha:'ingredient-a'};
 const respond=async(url,init={})=>{const path=new URL(url).pathname;if(init.method&&init.method!=='GET'){counts.writes++;if(writeGate)return writeGate.promise;return Response.json({ok:true,commit:B,blobSha:'saved',unchanged:false,warnings:[]});}return Response.json(path==='/catalog'?{commit:A,dishes:{soup:dish},ingredients:{salt:ingredient},techniques:[],suppliers:[],translations:{}}:path==='/changes'?{onlineCommit:A,lastPublishedAt:'2026-09-10T00:00:00Z',unpublished:[{sha:B,at:'2026-09-11T00:00:00Z',role:'chef',endpoint:'POST /plan/week',subject:'Local fixture change',files:['data/menu-plans/week.json']}],publishes:[]}:path==='/builds'?{builds:[]}:path.startsWith('/source/ingredient')?source:path.startsWith('/source/dish')?{content:dish,commit:A,blobSha:'dish-a'}:{content:plan,commit:A,blobSha:'plan-a'});};
 const opts={fetch:respond,identity:()=>identity,token:()=> 'explicit-local-fixture'},team=m.createTeamMealsApi('https://fixture.invalid',opts),legacy=new m.HttpAdminApi('https://fixture.invalid',opts);legacy.translate=async()=>({});
 const modules={requests:[],gates:new Map()};
 globalThis.fixture={team,legacy,async optional(kind,load){modules.requests.push(kind);const gate=modules.gates.get(kind);if(gate)await gate.promise;return load();},register(options){callbacks=options;options.onRegisteredSW('local-sw.js',{waiting:null,update:async()=>{}});return async()=>{};}};
 m.initPwa({refresh(){}},{refreshPublication:async()=>{}});const coverage=m.createPageReloadCoverage();let el;
 const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>oldTimers.setTimeout(r,0));};
 async function mount(page,lang='en'){const rest=page==='ingredient'?'salt':page==='dish'?'soup':page==='paste'?'week':'',path=page==='paste'?'plan/week/import':`${page}/${rest}`;location.hash='#/admin/'+path;events.dispatchEvent(new Event('hashchange'));el=new Element('section');outlet.replaceChildren(el);await m[page](el,{lang,route:'admin',rest:path,planId:'week',data:{},t:k=>k,setReloadCoverage:coverage.beginRender('admin',path)},rest,team);await flush();return el;}
 function input(selector,value){const f=el.querySelector(selector);assert(f,selector);f.value=value;f.dispatchEvent({type:'input'});}
 function click(text){const button=root.querySelectorAll('button').find(b=>b.textContent===text);assert(button,`button ${text}: ${root.textContent}`);button.click();}
 return {m,root,app,counts,modules,holdModule(kind){const gate=defer();modules.gates.set(kind,gate);return gate;},mount,input,click,unload,flush,legacy,team,get el(){return el;},holdWrite(){writeGate=defer();return writeGate;},auth(){identity++;m.clearToken();},home(){location.hash='#/admin';events.dispatchEvent(new Event('hashchange'));outlet.replaceChildren();coverage.beginRender('admin','')('read-only');},async update(){callbacks.onNeedRefresh();click('New version availableReload');await flush();},async discard(){click('Discard listed local changes and update');await flush();},cleanup(){try{team.dispose();legacy.dispose();for(const t of timers)oldTimers.clearTimeout(t);}finally{restoreGlobals();}}};
}
