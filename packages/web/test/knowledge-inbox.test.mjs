import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { Element } from './team-meals-pages-unload-dom.mjs';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const viteRequire=createRequire(require.resolve('vite/package.json'));
const esbuild=await import(pathToFileURL(viteRequire.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'inbox127-'));after(()=>rm(dir,{recursive:true,force:true}));
const output=join(dir,'inbox.mjs');
const bundle=await esbuild.build({stdin:{contents:`export {renderInbox} from './pages/admin/knowledge/inbox'; export {inspectReloadSafety} from './view-models/reload-safety';`,loader:'ts',resolveDir:join(here,'../src')},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'"/worker"'},logLevel:'silent',plugins:[{name:'auth',setup(build){
 build.onResolve({filter:/(?:\/admin\/token|^\.\/token)$/},()=>({path:'token',namespace:'test'}));
 build.onResolve({filter:/\/router$/},()=>({path:'router',namespace:'test'}));
 build.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='token'?`export const getToken=()=>globalThis.fixture.token;export const peekToken=getToken;export const getAuthSessionVersion=()=>globalThis.fixture.auth;export const peekAuthSessionVersion=getAuthSessionVersion;export const onAuthSessionChange=fn=>{globalThis.fixture.authHooks.push(fn);return()=>{};};export const clearToken=()=>{};export const renderLockScreen=()=>{};export const stripTokenFromRest=x=>x;`:`export const onRoute=fn=>{globalThis.fixture.routeHooks.push(fn);return()=>{};}; export const hrefOf=(page,rest='')=>'#/'+page+(rest?'/'+encodeURIComponent(rest):'');`,loader:'js'}));
}}]});
await writeFile(output,bundle.outputFiles[0].text);
const itemId='c829d4a8-837c-47d0-b62c-7f10d829bb51',candidateId='e2068014-7d9e-4e74-b24d-32f12554e7c4',captureId='2a132a7d-1835-484e-a270-2617fb124379',recipeId='10000000-0000-4000-8000-000000000001';
const item={id:itemId,contentId:'7688940752160196770',kind:'video',url:'https://www.douyin.com/video/7688940752160196770',index:1,author:'Source author',cardAlt:'card lead',displayText:'card text',state:'needs_review'};
const capture={id:captureId,status:'ready',method:'video_analysis',sha256:'a'.repeat(64),capturedAt:'2026-10-03',evidence:{sourceUrl:item.url,text:'Original evidence 00:04 do not lose this text',media:{sha256:'b'.repeat(64),durationMs:210000,byteCount:80000,sourceMethod:'original'},segments:[{kind:'audio',locator:'00:04',text:'400g',startMs:4000,endMs:5000}]}};
const candidate={id:candidateId,captureId,status:'needs_review',recipe:{title:{zh:'陈皮排骨',en:'Tangerine peel ribs',uk:'Реберця з цедрою'},ingredients:[{id:'row-1',name:{zh:'排骨',en:'Ribs',uk:'Реберця'},amount:{kind:'exact',value:'400',unit:'g',raw:'400克'}},{id:'row-2',name:{zh:'盐',en:'Salt',uk:'Сіль'},amount:{kind:'unknown'}}],steps:[{id:'step-1',text:{zh:'蒸40分钟；盐量未说明。',en:'Steam for 40 minutes; salt amount not stated.',uk:'Готуйте на парі 40 хвилин; кількість солі не вказано.'}}]},fieldEvidence:{title:{locator:'00:04',quote:'陈皮排骨'}},imageCandidates:[],unresolved:Array.from({length:13},(_,n)=>`source question ${n+1}`)};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};};let serial=0;
async function setup(options={}){
 globalThis.fixture={token:'test-token',auth:1,authHooks:[],routeHooks:[],calls:[],...options};
 Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
 const windowHooks=new Map();globalThis.window={addEventListener(type,fn){const list=windowHooks.get(type)||[];list.push(fn);windowHooks.set(type,list);},confirm:()=>true};
 globalThis.location={hash:'#/admin/knowledge/inbox'};globalThis.document={createElement:tag=>new Element(tag),createTextNode:text=>new Element('',String(text)),activeElement:null};
 const body=new Element('body');let root=new Element('div');body.append(root);
 let currentCandidate=structuredClone(options.candidate||candidate);
 globalThis.fetch=async(url,init={})=>{
  fixture.calls.push({url:String(url),init});
  const override=await options.handler?.(String(url),init);if(override)return override;
  if(String(url).endsWith('/favorites/imports'))return json({items:[]});
  if(String(url).includes('/favorites/items?'))return json({items:[{...item,...options.item}],nextCursor:null});
  if(String(url).endsWith(`/favorites/items/${itemId}`))return json({...item,...options.item});
  if(String(url).endsWith(`/favorites/items/${itemId}/captures`))return json({items:options.captures||[capture]});
  if(String(url).endsWith(`/favorites/items/${itemId}/candidates`))return json({items:[currentCandidate]});
  if(String(url).endsWith(`/favorites/candidates/${candidateId}/review`)){currentCandidate={...currentCandidate,status:'approved',recipeId,recipeVersion:1,...JSON.parse(init.body)};return json(currentCandidate);}
  throw new Error(`unexpected ${url}`);
 };
 const m=await import(pathToFileURL(output).href+`?run=${++serial}`);
 const flush=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};
 const mount=async(lang='zh')=>{root.replaceChildren();await m.renderInbox(root,{lang,planId:'week-41',setReloadCoverage(){}},()=>root.isConnected&&fixture.auth===1);await flush();};
 const open=async()=>{const d=root.querySelector('.kb-inbox-item');d.open=true;d.dispatchEvent({type:'toggle'});await flush();return d;};
 const controls=()=>root.querySelectorAll('input,textarea,select');
 const field=label=>{const container=root.querySelectorAll('label').find(x=>x.children[0]?.textContent===label);assert(container,`field ${label}`);return container.querySelector('input,textarea,select');};
 const set=(control,value)=>{control.value=value;control.dispatchEvent({type:'input'});};
 const click=text=>{const b=root.querySelectorAll('button').find(x=>x.textContent===text);assert(b,`button ${text}`);b.click();};
 return {m,get root(){return root;},body,flush,mount,open,controls,field,set,click,windowHooks,changeAuth(){fixture.auth++;fixture.token='changed-token';fixture.authHooks.forEach(fn=>fn());},navigate(){root.remove();fixture.routeHooks.forEach(fn=>fn());root=new Element('div');body.append(root);}};
}
test('complete recipe comes first; collector tools and raw timed evidence start folded',async()=>{
 const h=await setup();await h.mount();await h.open();
 const admin=h.root.querySelector('.kb-inbox-management');assert(admin,'collector details exist');assert.equal(admin.getAttribute('open'),null);
 assert.equal(h.root.querySelector('.kb-full-recipe').querySelectorAll('.kb-recipe-ingredient').length,2);
 assert.match(h.root.textContent,/400 g/);assert.match(h.root.textContent,/蒸40分钟/);assert.match(h.root.textContent,/用量未说明/);
 assert.equal(h.root.querySelector('.kb-recipe-unresolved').querySelectorAll('li').length,13,'all questions remain available');
 assert(h.root.querySelectorAll('a').some(x=>x.textContent.includes('观看完整原视频')&&x.getAttribute('href')===item.url));
 assert.equal(h.root.querySelector('.kb-recipe-technical').getAttribute('open'),null);
 assert(admin.contains?admin.contains(h.field('作品正文或字幕')):admin.querySelectorAll('textarea').includes(h.field('作品正文或字幕')));
 assert(!h.root.querySelectorAll('button').some(x=>/固定|检查菜谱新版本/.test(x.textContent)));
});
test('source confirmation creates an ordinary Recipe next step and never freezes or grants kitchen approval',async()=>{
 const h=await setup();await h.mount();await h.open();h.set(h.field('来源核对人'),'test-only reviewer');h.set(h.field('来源核对备注'),'source checked; amounts remain unknown');
 h.click('确认来源并保存菜谱');await h.flush();
 assert(h.root.querySelectorAll('a').some(x=>x.getAttribute('href')===`#/admin/knowledge/${recipeId}`));
 assert.match(h.root.textContent,/厨房核定/);assert.equal(fixture.calls.filter(x=>/materialization|\/approve$/.test(x.url)).length,0);
 const write=fixture.calls.find(x=>x.url.endsWith('/review'));assert.deepEqual(JSON.parse(write.init.body),{decision:'approve',reviewer:'test-only reviewer',note:'source checked; amounts remain unknown'});
});
test('capture failure and missing original have an explicit entry that opens the initially folded management area',async()=>{
 const h=await setup({captures:[],item:{state:'blocked_auth',lastError:'HTTP 403 at source'}});await h.mount();await h.open();
 const admin=h.root.querySelector('.kb-inbox-management');assert(admin);assert.equal(admin.getAttribute('open'),null);
 h.click('补充来源或记录采集失败');assert.equal(admin.open,true);assert.match(admin.textContent,/记录采集失败/);
 assert.match(h.root.textContent,/尚无/);assert.match(h.root.textContent,/HTTP 403/);
});
test('management and source fields survive language changes, route reopen and successful sibling operations',async()=>{
 const h=await setup({handler:(url,init)=>init.method==='POST'&&url.endsWith('/captures')?json({id:'new-capture'}):null});await h.mount();await h.open();
 h.set(h.field('作品正文或字幕'),'keep original paste');h.set(h.field('来源核对备注'),'keep source note');
 assert.equal(h.m.inspectReloadSafety().reason,'dirty');
 h.navigate();await h.mount('en');await h.open();
 assert.equal(h.field('Post text or transcript').value,'keep original paste');assert.equal(h.field('Source review note').value,'keep source note');
 h.click('Save card as unverified lead');await h.flush();assert.equal(h.field('Post text or transcript').value,'keep original paste');assert.equal(h.m.inspectReloadSafety().reason,'dirty');
});
test('lost source review response holds exact attempt and local values, then retries the same request deliberately',async()=>{
 let fail=true;const h=await setup({handler:(url,init)=>init.method==='POST'&&url.endsWith('/review')&&fail?(fail=false,json({error:{code:'upstream_error',message:'raw service error'}},503)):null});await h.mount();await h.open();
 h.set(h.field('来源核对人'),'reviewer');h.set(h.field('来源核对备注'),'original note');h.click('确认来源并保存菜谱');await h.flush();
 assert.equal(h.m.inspectReloadSafety().reason,'unknown');assert.equal(h.field('来源核对备注').value,'original note');
 h.set(h.field('来源核对备注'),'later local note');h.click('核对或重试原请求');await h.flush();
 const writes=fixture.calls.filter(x=>x.url.endsWith('/review'));assert.equal(writes.length,2);assert.equal(writes[0].init.body,writes[1].init.body);
 assert.equal(new Headers(writes[0].init.headers).get('Idempotency-Key'),new Headers(writes[1].init.headers).get('Idempotency-Key'));
 assert.notEqual(h.m.inspectReloadSafety().reason,'unknown');assert(h.root.querySelectorAll('a').some(x=>x.getAttribute('href')===`#/admin/knowledge/${recipeId}`));
});
test('known source errors are human-first in all languages with original support details folded and input retained',async()=>{
 for(const [lang,person,note,action]of [['zh','来源核对人','来源核对备注','确认来源并保存菜谱'],['en','Source reviewer','Source review note','Confirm source and save recipe'],['uk','Хто перевірив джерело','Примітка про джерело','Підтвердити джерело й зберегти рецепт']]){
  const h=await setup({handler:(url,init)=>init.method==='POST'&&url.endsWith('/review')?json({error:{code:'SOURCE_REVIEW_REQUIRED',message:'原片审核未完成',details:{retry:'same'}}},409):null});await h.mount(lang);await h.open();h.set(h.field(person),'test reviewer');h.set(h.field(note),'keep note');h.click(action);await h.flush();
  assert.equal(h.field(note).value,'keep note');const support=h.root.querySelector('.kb-inbox-error-support');assert(support);assert.equal(support.getAttribute('open'),null);assert.match(support.textContent,/SOURCE_REVIEW_REQUIRED/);assert.match(support.textContent,/原片审核未完成/);
  const alert=h.root.querySelectorAll('[role="alert"]').find(x=>x.textContent&&!x.textContent.includes('SOURCE_REVIEW_REQUIRED'));assert(alert);if(lang!=='zh')assert.doesNotMatch(alert.textContent,/原片审核未完成/);
 }
});
test('auth change clears private fields and late review completion does not repaint a replaced page',async()=>{
 const held=deferred();const h=await setup({handler:(url,init)=>init.method==='POST'&&url.endsWith('/review')?held.promise:null});await h.mount();await h.open();h.set(h.field('来源核对人'),'old reviewer');h.set(h.field('来源核对备注'),'secret old note');h.click('确认来源并保存菜谱');await h.flush();
 h.changeAuth();assert.doesNotMatch(h.root.textContent,/secret old note/);assert.equal(h.root.querySelectorAll('input,textarea').length,0,'mounted private inbox clears on session change');
 held.resolve(json({...candidate,status:'approved',recipeId,recipeVersion:1}));await h.flush();assert(!h.root.querySelectorAll('a').some(x=>x.getAttribute('href')===`#/admin/knowledge/${recipeId}`));
});
test('a source write started before language change refreshes the current view when it finishes',async()=>{
 const held=deferred();let approved=false;
 const h=await setup({handler:async(url,init)=>{
  if(url.endsWith('/review')){await held.promise;approved=true;return json({...candidate,status:'approved',recipeId,recipeVersion:1});}
  if(url.endsWith(`/favorites/items/${itemId}/candidates`))return json({items:[approved?{...candidate,status:'approved',recipeId,recipeVersion:1}:candidate]});
 }});await h.mount();await h.open();h.set(h.field('来源核对人'),'source reviewer');h.click('确认来源并保存菜谱');await h.flush();
 await h.mount('en');await h.open();assert.equal(h.m.inspectReloadSafety().reason,'saving');
 held.resolve();await h.flush();assert.equal(h.m.inspectReloadSafety().reason,'clear');
 assert(h.root.querySelectorAll('a').some(x=>x.getAttribute('href')===`#/admin/knowledge/${recipeId}`),'new language sees the completed Recipe next step');
});
test('unknown source attempt remains recoverable after route reopen, with unsaved later text preserved',async()=>{
 let failed=false;const h=await setup({handler:(url,init)=>init.method==='POST'&&url.endsWith('/review')&&!failed?(failed=true,json({error:{code:'upstream_error',message:'lost ack'}},503)):null});
 await h.mount();await h.open();h.set(h.field('来源核对人'),'reviewer');h.set(h.field('来源核对备注'),'sent note');h.click('确认来源并保存菜谱');await h.flush();
 h.set(h.field('来源核对备注'),'newer unsaved local note');h.navigate();await h.mount('en');await h.open();
 assert.equal(h.field('Source review note').value,'newer unsaved local note');h.click('Check or retry original request');await h.flush();
 const writes=fixture.calls.filter(x=>x.url.endsWith('/review'));assert.equal(writes[0].init.body,writes[1].init.body);assert.equal(h.m.inspectReloadSafety().reason,'dirty','later unsaved text does not become acknowledged by an earlier request');
});
const csv=(id='7688940752160196770')=>`index,folder,kind,content_id,url,author,card_alt,display_text\n1,吃的,video,${id},https://www.douyin.com/video/${id},author,card,display`;
test('blank collection count is unknown; a late older CSV read cannot replace the selected file',async()=>{
 const older=deferred();const h=await setup({handler:(url,init)=>url.endsWith('/favorites/import/prepare')?json({id:'batch',validCount:1,rejectedCount:0,coverageGap:0}):null});await h.mount();
 const file=h.field('CSV 文件');file.files=[{name:'older.csv',text:()=>older.promise}];file.dispatchEvent({type:'change'});
 file.files=[{name:'newer.csv',text:async()=>csv('7688940752160196771')}];file.dispatchEvent({type:'change'});await h.flush();older.resolve(csv());await h.flush();
 h.click('检查 CSV');await h.flush();assert.equal(fixture.calls.filter(x=>x.url.endsWith('/favorites/import/prepare')).length,0,'blank count must not become a fabricated zero');
 h.set(h.field('收藏夹页面计数'),'1');h.click('检查 CSV');await h.flush();const call=fixture.calls.find(x=>x.url.endsWith('/favorites/import/prepare'));assert.equal(JSON.parse(call.init.body).rows[0].content_id,'7688940752160196771');
});
test('changing count while inspection is pending invalidates that inspection; uncertain import locks its original selection across rerender',async()=>{
 const held=deferred();let hold=true;const h=await setup({handler:async(url,init)=>{
  if(url.endsWith('/favorites/import/prepare')){if(hold){hold=false;await held.promise;}return json({id:'batch',validCount:1,rejectedCount:0,coverageGap:0});}
  if(url.endsWith('/favorites/import/apply'))return json({error:{code:'upstream_error',message:'lost ack'}},503);
 }});await h.mount();const file=h.field('CSV 文件');file.files=[{name:'data.csv',text:async()=>csv()}];file.dispatchEvent({type:'change'});await h.flush();
 h.set(h.field('收藏夹页面计数'),'1');h.click('检查 CSV');await h.flush();h.set(h.field('收藏夹页面计数'),'2');held.resolve();await h.flush();h.click('确认入箱');await h.flush();assert.equal(fixture.calls.filter(x=>x.url.endsWith('/favorites/import/apply')).length,0,'old inspection cannot authorize changed count');
 h.click('检查 CSV');await h.flush();h.click('确认入箱');await h.flush();assert.equal(h.m.inspectReloadSafety().reason,'unknown');assert.equal(file.disabled,true);assert.equal(h.field('收藏夹页面计数').disabled,true);
 await h.mount('en');assert.equal(h.field('CSV file').disabled,true);assert.equal(h.field('Collection count').disabled,true);assert(h.root.querySelectorAll('button').some(x=>x.textContent==='Check or retry original request'));
});
test('route departure guards a reused connected page root from late writes and later inbox auth cleanup',async()=>{
 const held=deferred();const h=await setup({handler:(url,init)=>init.method==='POST'&&url.endsWith('/review')?held.promise:null});await h.mount();await h.open();h.set(h.field('来源核对人'),'reviewer');h.click('确认来源并保存菜谱');await h.flush();
 fixture.routeHooks.forEach(fn=>fn());h.root.replaceChildren(new Element('p','Other current page'));
 held.resolve(json({...candidate,status:'approved',recipeId,recipeVersion:1}));await h.flush();assert.equal(h.root.textContent,'Other current page');
 h.changeAuth();assert.equal(h.root.textContent,'Other current page','departed inbox must not clear another connected page on auth change');
});
