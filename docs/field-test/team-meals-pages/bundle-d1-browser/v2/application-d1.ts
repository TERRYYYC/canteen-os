import {Workbox} from 'workbox-window';
// Reviewer-only instrumentation. Actual main.ts and actual page singleton renderers remain unchanged.
import {inspectReloadSafety} from '../src/view-models/reload-safety';
import {setLang} from '../src/i18n';
import {clearToken} from '../src/admin/token';
const A='a'.repeat(40),B='b'.repeat(40),origin='https://application-api.local.invalid';
const clone=x=>structuredClone(x),checks=[],ledger=[],gates=[];
const controllerAtProbeStart=!!navigator.serviceWorker.controller;
const originalDispatch=Workbox.prototype.dispatchEvent;
Workbox.prototype.dispatchEvent=function(event){ledger.push({kind:'workbox-event',path:'',type:event.type,isUpdate:event.isUpdate,isExternal:event.isExternal,controllerAtProbeStart,controllerNow:!!navigator.serviceWorker.controller});return originalDispatch.call(this,event);};
window.addEventListener('beforeunload',event=>{ledger.push({kind:'native-unload',path:'',trusted:event.isTrusted,prevented:event.defaultPrevented});if(event.isTrusted)sessionStorage.setItem('review-unload',JSON.stringify(ledger.at(-1)));});

const boot=Number(sessionStorage.getItem('review-boots')||0)+1;sessionStorage.setItem('review-boots',String(boot));
const prior=sessionStorage.getItem('review-evidence');
const salt={schemaVersion:'2',name:{zh:'盐',en:'Salt',uk:'Сіль'},baseUnit:'g',trackStock:false};
const soup={schemaVersion:'3',name:{zh:'原汤',en:'Soup',uk:'Суп'},status:'draft',components:[{ingredientRef:'salt'}],steps:[]};
const seed={schemaVersion:'3',name:{zh:'原计划',en:'Original plan'},meals:[{date:'2026-09-14',mealType:'lunch',dishRef:'soup',plannedServings:8}]};
const savedMock=JSON.parse(sessionStorage.getItem('review-mock-backend')||'null');const sources=new Map(savedMock?.sources||[]),history=new Map(savedMock?.history||[]);let serial=savedMock?.serial||0,holdReads=false,holdWrite=false,loseWrite=false,holdTranslation=false,holdProgress=false,holdClipboard=false,failPlan=false,failManifest=new URLSearchParams(location.search).has('failmanifest');
let runId=10,runCompleted=true,translationGate,failTranslation=0;
const nativeFetch=globalThis.fetch.bind(globalThis);
const json=(x,status=200)=>Response.json(x,{status});
const failure=(status,code)=>json({ok:false,errors:[{path:'',code,message:code}]},status);
function defer(kind,path){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});const gate={kind,path,resolve,reject,promise,ended:false};gates.push(gate);return gate;}
function source(kind,id,revision){const key=`${kind}/${id}`;if(revision&&history.has(`${key}/${revision}`))return clone(history.get(`${key}/${revision}`));if(sources.has(key))return clone(sources.get(key));if(kind==='shopping-list'||id==='new')return null;return{content:clone(kind==='plan'?seed:kind==='dish'?soup:salt),commit:revision||A,blobSha:`${kind}-${id}-original`};}
function store(kind,id,body){const s={content:clone(body),commit:(++serial).toString(16).padStart(40,'0'),blobSha:`saved-${serial}`};sources.set(`${kind}/${id}`,s);history.set(`${kind}/${id}/${s.commit}`,s);sessionStorage.setItem('review-mock-backend',JSON.stringify({serial,sources:[...sources],history:[...history]}));return s;}
const changes=()=>({onlineCommit:A,lastPublishedAt:'2026-09-10T00:00:00Z',unpublished:[{sha:B,at:'2026-09-11T00:00:00Z',role:'chef',endpoint:'POST /plan/week-41',subject:'Local fixture',files:['data/menu-plans/week-41.json']}],publishes:[{sha:A,at:'2026-09-10T00:00:00Z',runId:10,isOnline:true}]});
globalThis.fetch=async(url,init={})=>{const u=new URL(String(url),location.href),method=init.method||'GET';
 if(u.origin!==origin){if(u.pathname.endsWith('/data/build.json')){ledger.push({method,path:u.pathname,probe:u.searchParams.has('__publication')});if(failManifest){failManifest=false;return failure(503,'unavailable');}}return nativeFetch(url,init);}
 ledger.push({method,path:u.pathname,revision:u.searchParams.get('revision'),ifMatch:new Headers(init.headers).get('If-Match'),ifNoneMatch:new Headers(init.headers).get('If-None-Match')});
 if(method==='GET'&&holdReads)await defer('read',u.pathname).promise;
 if(method==='GET'){
  if(u.pathname==='/catalog')return json({ok:true,commit:u.searchParams.get('revision')||A,dishes:{soup},ingredients:{salt},techniques:[],suppliers:[],translations:{machine:0,human:0,stale:0}});
  if(u.pathname==='/changes')return json({ok:true,...changes()});
  if(u.pathname.startsWith('/publish/')){if(holdProgress)await defer('progress',u.pathname).promise;return json({ok:true,runId:Number(u.pathname.split('/').at(-1)),status:runCompleted?'success':'in_progress',steps:[],failedStep:null,failureReason:null,unmappedSteps:[],runCompleted,runConclusion:runCompleted?'success':null});}
  const m=u.pathname.match(/^\/source\/([^/]+)\/([^/]+)$/);if(m){if(failPlan&&m[1]==='plan')return failure(503,'unavailable');const s=source(m[1],m[2],u.searchParams.get('revision'));return s?json({ok:true,...s}):failure(404,'not_found');}
 }
 if(method==='POST'){
  if(u.pathname==='/translate'){if(failTranslation>0){failTranslation--;return failure(503,'unavailable');}if(holdTranslation){translationGate=defer('translation',u.pathname);await translationGate.promise;}return json({ok:true,translations:{en:'Translated salt',uk:'Переклад'}});}
  if(u.pathname==='/publish')return json({ok:true,runId:++runId,mode:'dispatch'});
  if(u.pathname.startsWith('/rollback/')){if(holdWrite)await defer('write',u.pathname).promise;return json({ok:true,commit:B,restoredFrom:u.pathname.split('/').at(-1),changedFiles:1});}
  const m=u.pathname.match(/^\/(plan|dish|ingredient|shopping-list)\/([^/]+)(?:\/draft)?$/);if(m){const s=store(m[1],m[2],JSON.parse(init.body));if(holdWrite)await defer('write',u.pathname).promise;if(loseWrite){loseWrite=false;throw new TypeError('Simulated lost ACK');}return json({ok:true,commit:s.commit,blobSha:s.blobSha,unchanged:false,warnings:[]});}
 }
 throw new Error(`Unexpected simulated request ${method} ${u.pathname}`);
};
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{if(holdClipboard)await defer('clipboard','local-clipboard').promise;}}});
if(!sessionStorage.getItem('canteenos.token'))sessionStorage.setItem('canteenos.token','A'.repeat(43));
setLang('en');if(!location.hash)location.hash='#/admin/dish/soup';
const panel=document.createElement('aside');panel.id='review-panel';panel.innerHTML='<strong>D AUTHOR LOCAL TEST · actual application/main/PWA · simulated API only</strong><div id="review-controls"></div><pre id="review-output"></pre>';
panel.style.cssText='background:#fff1c9;padding:12px;border:2px solid #876b27';document.body.prepend(panel);
const out=panel.querySelector('pre'),controls=panel.querySelector('div');out.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto';
const pause=(ms=35)=>new Promise(r=>setTimeout(r,ms));
const $=s=>document.querySelector('#app')?.querySelector(s);
const assert=(v,m)=>{if(!v)throw Error(m);};
async function wait(fn,label,ms=7000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await pause();}throw Error('Timed out: '+label);}
function state(){return inspectReloadSafety();}
const extraState={};function paint(extra={}){Object.assign(extraState,extra);out.textContent=JSON.stringify({head:import.meta.env.VITE_REVIEW_HEAD_SHA||'D-UNPINNED-AUTHOR-FIXTURE',boot,summary:`${checks.filter(x=>x.pass).length}/${checks.length}`,checks,route:location.hash,safety:state(),controller:!!navigator.serviceWorker.controller,pending:gates.filter(g=>!g.ended).map(g=>({kind:g.kind,path:g.path})),ledger,viewText:document.querySelector('#app')?.textContent,resources:performance.getEntriesByType('resource').map(x=>({name:x.name,initiatorType:x.initiatorType})),inputs:[...document.querySelectorAll('#app input, #app textarea')].map(e=>({id:e.id,focus:e.dataset.focus,value:e.value})),...extraState},null,2);sessionStorage.setItem('review-evidence',out.textContent);}
function check(name,pass,detail){checks.push({name,pass:!!pass,detail});paint();assert(pass,name);}
function edit(selector,value,type='input'){const el=$(selector);assert(el,'Missing input '+selector);el.value=value;el.dispatchEvent(new Event(type,{bubbles:true}));}
function click(selector){const el=$(selector);assert(el,'Missing '+selector);assert(!el.disabled,'Disabled '+selector);el.click();}
function textButton(text){const el=[...document.querySelectorAll('#app button')].find(e=>e.textContent.trim()===text);assert(el,'Missing button '+text);assert(!el.disabled,'Disabled '+text);el.click();}
async function route(path,selector){location.hash='#/'+path;await pause();if(selector)await wait(()=>$(selector),'route '+path);}
async function language(lang,selector){setLang(lang);await pause();if(selector)await wait(()=>$(selector),'language '+lang);}
async function login(path='admin',selector='.adm-home'){clearToken();sessionStorage.setItem('canteenos.token','B'.repeat(43));await route('admin/not-a-screen','.adm-notfound');await route(path,selector);}
function release(gate,fail=false){gate.ended=true;fail?gate.reject(new Error('Explicit local read failure')):gate.resolve();}
function add(label,work){const b=document.createElement('button');b.textContent=label;b.style.cssText='min-height:44px;margin:4px';b.onclick=async()=>{b.disabled=true;try{await work();paint();}catch(error){checks.push({name:label,pass:false,error:String(error.stack||error)});paint();}finally{b.disabled=false;}};controls.append(b);}
let d1BeforePosts=0,d1BeforeTranslations=0;
const currentInput=()=>$('.adm-dish-inline-loading input')||$('.adm-dish-inline input[lang="zh"]');
add('D1 Prepare real inline load',async()=>{
 await wait(()=>$('.adm-dish-form'),'initial Dish');await wait(()=>state().reason==='clear','initial reads');
 check('initial Dish Source/catalog/form ready without legacy client execution',!performance.getEntriesByType('resource').some(r=>/\/client-[^/]+\.js/.test(r.name)));
 d1BeforePosts=ledger.filter(x=>x.method==='POST').length;d1BeforeTranslations=ledger.filter(x=>x.path==='/translate').length;
 holdTranslation=true;if($('.adm-dish-card-toggle').getAttribute('aria-expanded')!=='true')click('.adm-dish-card-toggle');textButton('Change');
 edit('.adm-dish-search input','蘑菇');click('.adm-dish-result-new');
 check('inline intent and real loading operation exist synchronously after click',state().reason==='saving'&&!!$('.adm-dish-inline-loading')&&$('.adm-dish-inline-loading input').value==='蘑菇');
 check('held optional code disables Dish save without any external write',$('.adm-dish-save-draft').disabled&&ledger.filter(x=>x.method==='POST').length===d1BeforePosts);
});
add('D1 Retain loading buffer across language and route',async()=>{
 await language('uk','.adm-dish-inline-loading');check('language retains exact loading raw',$('.adm-dish-inline-loading input')?.value==='蘑菇'&&state().reason==='saving');
 await route('admin/plan/d1-away','[data-focus="servings-0"]');check('inline module operation remains protected offscreen',state().reason==='saving');
 await route('admin/dish/soup','.adm-dish-inline-loading');check('return restores inline raw and original operation',$('.adm-dish-inline-loading input')?.value==='蘑菇'&&state().reason==='saving');
});
add('D1 Verify actual automatic translation handoff',async()=>{
 await wait(()=>translationGate,'one automatic translation',15000);
 check('loading handoff starts one automatic translation',ledger.filter(x=>x.path==='/translate').length-d1BeforeTranslations===1&&state().reason==='saving');
 check('form installed for retained current-language buffer',!$('.adm-dish-inline-loading')&&!!$('.adm-ing-body'));
 holdTranslation=false;release(translationGate);await wait(()=>state().reason==='dirty','translation settles into original raw');
 const inputs=[...document.querySelectorAll('#app .adm-ing-body input')].map(x=>x.value);
 check('automatic translation retained its original seed and result',inputs.includes('蘑菇')&&inputs.includes('Translated salt')&&state().reason==='dirty');
});
add('D1 Verify real emitted module unavailable',async()=>{
 await wait(()=>$('.adm-dish-inline-loading')?.dataset.state==='failed','real module error',15000);
 const box=$('.adm-dish-inline-loading');
 check('native module failure settles read ticket but preserves dirty input',state().reason==='dirty'&&box.querySelector('input').value==='蘑菇');
 check('failed optional module gives no false retry or write unknown',!state().records.some(r=>r.phase==='unknown')&&ledger.filter(x=>x.method==='POST').length===d1BeforePosts&&!/retry|重试|повторити/i.test(box.textContent));
 edit('.adm-dish-inline-loading input','蘑菇保留');await language('en','.adm-dish-inline-loading');
 check('failed buffer remains editable across language',$('.adm-dish-inline-loading input').value==='蘑菇保留'&&state().reason==='dirty');
});
add('D1 Continue ordinary editing and no-image save',async()=>{
 await language('en','.adm-dish-inline-loading');const box=$('.adm-dish-inline-loading');box.querySelector('button').click();
 await wait(()=>$('.adm-dish-result'),'existing explicit cancel returns ingredient chooser');
 edit('.adm-dish-search input','');const saltOption=[...document.querySelectorAll('#app [role="option"]')].find(x=>x.textContent.includes('Salt'));assert(saltOption,'existing Salt choice');saltOption.click();
 edit('#adm-dish-baseServings','2');const before=ledger.filter(x=>x.method==='POST'&&x.path==='/dish/soup/draft').length;
 click('.adm-dish-save-draft');await wait(()=>ledger.filter(x=>x.method==='POST'&&x.path==='/dish/soup/draft').length===before+1,'real no-image C1 write');await wait(()=>state().reason==='clear','no-image C1 save settles');
 check('explicit inline cancel permits ordinary no-image C1 save',state().reason==='clear'&&!performance.getEntriesByType('resource').some(r=>/\/client-[^/]+\.js/.test(r.name)));
});
add('D1 Already loaded action fails then truly retries',async()=>{
 holdTranslation=false;await route('admin/ingredient/salt','#adm-ing-name-zh');await language('en','#adm-ing-name-zh');
 const before=ledger.filter(x=>x.path==='/translate').length;failTranslation=1;click('.adm-ing-translate');
 await wait(()=>ledger.filter(x=>x.path==='/translate').length===before+1,'known action refusal');await wait(()=>!$('.adm-ing-translate').disabled,'known read failure ends');
 check('loaded translation API failure is visible and retains input',$('#adm-ing-name-zh').value==='盐'&&$('.adm-ing-body').textContent.includes("Machine translation isn't available"));
 click('.adm-ing-translate');await wait(()=>ledger.filter(x=>x.path==='/translate').length===before+2,'actual second translation request');await wait(()=>$('#adm-ing-name-en').value==='Translated salt','retry translated result');
 check('already-loaded action retry sends another real simulated HTTP request and succeeds',$('#adm-ing-name-zh').value==='盐'&&$('#adm-ing-name-en').value==='Translated salt');
});
add('D1 Late loading after auth does not affect new editor',async()=>{
 const before=ledger.filter(x=>x.method==='POST').length;await login('admin/dish/new-owner','.adm-dish-form');
 check('new identity retains anonymous old outstanding operation',state().reason==='unknown');
 paint({d1LateBeforePosts:before});
});
add('D1 Verify late module settled only original owner',async()=>{
 await wait(()=>state().reason==='clear','old module read completes',15000);
 check('late module completion neither creates inline form nor sends old translation',!$('.adm-ing-body')&&$('#adm-dish-name-zh').value==='原汤'&&ledger.filter(x=>x.method==='POST').length===extraState.d1LateBeforePosts);
});
add('D1 Diagnose native same-URL after server recovery',async()=>{
 const module=performance.getEntriesByType('resource').find(x=>/\/ingredient-form-[^/]+\.js/.test(x.name));assert(module,'actual emitted form URL already requested');
 let error;try{await import(/* @vite-ignore */ module.name);}catch(e){error=String(e);}
 check('actual emitted same-URL retry remains rejected in this browser',!!error,{url:module.name,error});
});
add('D1 Open Ingredient for actual file selection',async()=>{
 await route('admin/ingredient/salt','#adm-ing-name-zh');await wait(()=>state().reason==='clear','initial Ingredient ready');
 check('Ingredient initial form and reads work before optional image code',!performance.getEntriesByType('resource').some(x=>/\/editor-image-[^/]+\.js/.test(x.name)));
});
add('D1 Verify actual photo module is held',async()=>{
 check('real file selection protects its original image operation before module arrives',state().reason==='saving'&&$('#adm-ing-name-zh').value==='盐');
 await language('uk','#adm-ing-name-zh');check('held original photo survives language redraw',state().reason==='saving'&&$('#adm-ing-name-zh').value==='盐');
});
add('D1 Verify actual photo completion',async()=>{
 await wait(()=>state().reason==='dirty'&&$('.adm-ing-preview img'),'real photo decoded',15000);
 const img=$('.adm-ing-preview img');await wait(()=>img.complete&&img.naturalWidth>0,'actual image preview decoding');
 check('late loaded image code attaches real decoded photo to retained original draft',state().reason==='dirty'&&$('#adm-ing-name-zh').value==='盐'&&img.naturalWidth===2);
});
add('Inspect live state',()=>paint());
paint({fixture:'D1 author, production main/pages, simulated private API, externally gated emitted chunks'});
