import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, after } from 'node:test';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json'));
const esbuild=await import(pathToFileURL(vr.resolve('esbuild'))),dir=await mkdtemp(join(tmpdir(),'publish-owner-'));after(()=>rm(dir,{recursive:true,force:true}));
const entry=join(here,'../src/pages/admin/publish.ts');
const injected={
 '../../api/client':'export const getApi=()=>globalThis.__publishFixture.getLegacy();',
 '../../api/team-meals':'export const getTeamMealsApi=()=>globalThis.__publishFixture.team;',
 '../admin':'export const adminHref=()=>"#/admin";',
};
const bundle=await esbuild.build({stdin:{contents:await readFile(entry,'utf8')+`\nexport {createTeamMealsApi} from ${JSON.stringify(join(here,'../src/api/team-meals.ts'))};\nexport {HttpAdminApi} from ${JSON.stringify(join(here,'../src/api/client.ts'))};\nexport {clearToken as changeAuth} from ${JSON.stringify(join(here,'../src/admin/token.ts'))};`,resolveDir:dirname(entry),loader:'ts'},plugins:[{name:'publish-test-dependencies',setup(b){b.onResolve({filter:/^\.\.\//},a=>injected[a.path]&&(a.importer===''||a.importer==='<stdin>'||a.importer.endsWith('/publish.ts'))?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:injected[a.path],loader:'js'}));}}],bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
const output=join(dir,'publish.mjs');await writeFile(output,bundle.outputFiles[0].text);
class Element {
 constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.text=text;this.attrs={};this.children=[];this.listeners={};this.parentNode=null;this.disabled=false;this.style={};this.classList={add:x=>this.setAttribute('class',`${this.attrs.class??''} ${x}`),remove:x=>this.setAttribute('class',(this.attrs.class??'').split(' ').filter(c=>c!==x).join(' '))};}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='disabled')this.disabled=true;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];if(k==='disabled')this.disabled=false;}
 appendChild(c){c.parentNode=this;this.children.push(c);return c;}append(...cs){cs.forEach(c=>this.appendChild(c));}replaceChildren(...cs){this.children.forEach(c=>c.parentNode=null);this.children=[];this.text='';this.append(...cs);}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}get isConnected(){return this.tagName==='BODY'||!!this.parentNode?.isConnected;}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(s){this.replaceChildren();this.text=String(s);}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}click(){if(!this.disabled)for(const f of this.listeners.click??[])f({target:this});}focus(){document.activeElement=this;}scrollIntoView(){}
 querySelector(s){return this.querySelectorAll(s)[0]??null;}querySelectorAll(s){return walk(this).slice(1).filter(el=>s.startsWith('.')?(el.attrs.class??'').split(' ').includes(s.slice(1)):s.startsWith('#')?el.attrs.id===s.slice(1):el.tagName===s.toUpperCase());}
}
const walk=n=>[n,...n.children.flatMap(walk)],byClass=(n,c)=>walk(n).filter(x=>(x.attrs.class??'').split(' ').includes(c)),tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
const changes=()=>({onlineCommit:A,lastPublishedAt:'2026-09-10T00:00:00Z',unpublished:[{sha:B,at:'2026-09-11T00:00:00Z',role:'chef',endpoint:'POST /plan/week-38',subject:'Changed meal',files:['data/menu-plans/week-38.json']}],publishes:[{sha:A,at:'2026-09-10T00:00:00Z',runId:10,isOnline:true}]});
const progress=(status='in_progress',runId=11)=>({runId,status,htmlUrl:'https://example.org/actions/11',steps:[],failedStep:null,failureReason:null,unmappedSteps:[]});
let serial=0;
async function setup({mode='real',respond}={}){
 const events={},timers=new Map();let timer=0;
 globalThis.window={addEventListener:(t,f)=>(events[t]??=[]).push(f),removeEventListener:(t,f)=>{events[t]=(events[t]??[]).filter(x=>x!==f);},setTimeout:f=>{timers.set(++timer,f);return timer;},clearTimeout:id=>timers.delete(id),setInterval:()=>++timer,clearInterval:()=>{}};
 globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),addEventListener:(t,f)=>(events[t]??=[]).push(f),hidden:false,activeElement:null};
 globalThis.HTMLElement=Element;globalThis.MutationObserver=class{observe(){}disconnect(){}};globalThis.location={hash:'#/admin/publish'};
 const storage=new Map();globalThis.sessionStorage=globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const page=await import(`${pathToFileURL(output)}?case=${++serial}`),calls=[];let identity=1,legacyCalls=0;
 const fetch=async(url,init)=>{const path=new URL(url).pathname;calls.push({path,method:init.method});if(respond){const response=await respond(path,init);if(response)return response;}const body=path==='/changes'?changes():path==='/publish'?{runId:11,mode:'dispatch'}:path.startsWith('/publish/')?progress():path.startsWith('/rollback/')?{commit:C,restoredFrom:A,changedFiles:2}:{};return new Response(JSON.stringify({ok:true,...body}));};
 const opts={fetch,token:()=>'explicit-local-fixture',identity:()=>identity},team=page.createTeamMealsApi(mode==='unconfigured'?'':'https://publish-fixture.invalid',{...opts,...(mode==='mock'?{mode:'mock'}:{})}),legacy=new page.HttpAdminApi('https://publish-fixture.invalid',opts);
 globalThis.__publishFixture={team,getLegacy:()=>{legacyCalls++;return legacy;}};
 const mount=(lang='en')=>{document.body.replaceChildren();const el=new Element('main');document.body.append(el);page.render(el,{lang,planId:'week-38',rest:'publish'},'');return el;};
 const flush=async()=>{for(let i=0;i<6;i++)await tick();};
 return{page,calls,events,team,legacy,mount,flush,legacyCalls:()=>legacyCalls,leave(){location.hash='#/admin';document.body.replaceChildren();for(const f of events.hashchange??[])f();},auth(){identity++;page.changeAuth();},async timer(){const fs=[...timers.values()];timers.clear();for(const f of fs)f();await flush();},cleanup(){team.dispose();legacy.dispose();document.body.replaceChildren();}};
}
const publish=el=>byClass(el,'adm-pub-publish')[0],rollback=el=>byClass(el,'adm-pub-rollback')[0],confirm=el=>byClass(el,'adm-pub-rollback-go')[0];
const postCount=(f,path)=>f.calls.filter(c=>c.method==='POST'&&c.path===path).length;

test('unconfigured and explicit simulation never enter the default legacy mock publish flow',async()=>{
 for(const mode of ['unconfigured','mock']){const f=await setup({mode});try{for(const lang of ['zh','en','uk']){const el=f.mount(lang);await f.flush();assert.equal(f.legacyCalls(),0);assert.equal(f.calls.length,0);assert.equal(publish(el),undefined);assert.doesNotMatch(el.textContent,/Everything is published|都发布了/);}}finally{f.cleanup();}}
});
test('rollback remains one pending operation across language, close and route return, blocking publish too',async()=>{
 const held=deferred(),f=await setup({respond:(p)=>p.startsWith('/rollback/')?held.promise:undefined});
 try{let el=f.mount();await f.flush();rollback(el).click();confirm(el).click();await f.flush();assert.equal(postCount(f,`/rollback/${A}`),1);f.leave();el=f.mount('uk');await f.flush();assert.equal(publish(el).disabled,true);assert.equal(rollback(el).disabled,true);rollback(el).click();confirm(el)?.click();assert.equal(postCount(f,`/rollback/${A}`),1);held.resolve(new Response(JSON.stringify({ok:true,commit:C,restoredFrom:A,changedFiles:2})));await f.flush();assert.match(el.textContent,/Повернуто до/);assert.equal(publish(el).disabled,false);}finally{f.cleanup();}
});
test('lost publish acknowledgement stays unknown across navigation and cannot be retried as a write',async()=>{
 const f=await setup({respond:p=>p==='/publish'?Promise.reject(new Error('lost response')):undefined});
 try{let el=f.mount();await f.flush();publish(el).click();await f.flush();f.leave();el=f.mount();await f.flush();assert.match(el.textContent,/outcome unknown/i);assert.equal(publish(el).disabled,true);publish(el).click();assert.equal(postCount(f,'/publish'),1);assert.equal(f.calls.some(c=>c.path==='/publish/latest'),false);}finally{f.cleanup();}
});
test('accepted publish without run ID cannot claim an unrelated latest run or permit another write',async()=>{
 const f=await setup({respond:p=>p==='/publish'?new Response(JSON.stringify({ok:true,runId:null,mode:'dispatch'})):undefined});
 try{const el=f.mount();await f.flush();publish(el).click();await f.flush();assert.equal(f.calls.some(c=>c.path==='/publish/latest'),false);assert.match(el.textContent,/outcome unknown/i);assert.equal(publish(el).disabled,true);}finally{f.cleanup();}
});
test('known-run timeout/unmapped remain protected and terminal reads are tied to the returned run ID',async()=>{
 for(const status of ['timeout','unmapped']){const f=await setup({respond:p=>p==='/publish/11'?new Response(JSON.stringify({ok:true,...progress(status)})):undefined});try{const el=f.mount();await f.flush();publish(el).click();await f.flush();assert.equal(publish(el).disabled,true,status);assert.equal(rollback(el).disabled,true,status);assert.match(el.textContent,/outcome unknown/i);}finally{f.cleanup();}}
});
test('unknown rollback never becomes success merely after changes refresh or repaint',async()=>{
 const f=await setup({respond:p=>p.startsWith('/rollback/')?Promise.reject(new Error('lost')):undefined});try{let el=f.mount();await f.flush();rollback(el).click();confirm(el).click();await f.flush();f.leave();el=f.mount();await f.flush();assert.match(el.textContent,/outcome unknown/i);assert.equal(publish(el).disabled,true);assert.equal(rollback(el).disabled,true);assert.equal(postCount(f,`/rollback/${A}`),1);}finally{f.cleanup();}
});
test('auth replacement immediately removes private state and late publish response cannot bind new session',async()=>{
 const held=deferred(),f=await setup({respond:p=>p==='/publish'?held.promise:undefined});try{const old=f.mount();await f.flush();publish(old).click();await f.flush();f.auth();assert.doesNotMatch(old.textContent,/Changed meal/);const fresh=f.mount();await f.flush();held.resolve(new Response(JSON.stringify({ok:true,runId:11,mode:'dispatch'})));await f.flush();assert.equal(f.calls.some(c=>c.path==='/publish/11'),false);assert.doesNotMatch(fresh.textContent,/looking for this build/i);}finally{f.cleanup();}
});

test('same run ID can be verified read-only after timeout and only confirmed success releases both actions',async()=>{
 let outcome='timeout';const f=await setup({respond:p=>p==='/publish/11'?new Response(JSON.stringify({ok:true,...progress(outcome)})):undefined});
 try{let el=f.mount();await f.flush();publish(el).click();await f.flush();const unknown=f.page.readPublishAuxiliary();assert.equal(unknown.phase,'unknown');assert.equal(unknown.dirty,true);f.leave();el=f.mount();await f.flush();outcome='success';walk(el).find(n=>n.tagName==='BUTTON'&&n.textContent==="Check this build's outcome").click();await f.flush();assert.equal(postCount(f,'/publish'),1);assert.equal(f.calls.filter(c=>c.path==='/publish/11').length,2);assert.equal(f.page.readPublishAuxiliary().phase,'idle');assert.equal(publish(el).disabled,false);assert.equal(rollback(el).disabled,false);assert.match(el.textContent,/Live · everyone/);}finally{f.cleanup();}
});
test('a failed step is not proof that the Worker workflow has stopped, while wrong-run success is refused',async()=>{
 for(const body of [progress('failure'),progress('success',12)]){const f=await setup({respond:p=>p==='/publish/11'?new Response(JSON.stringify({ok:true,...body})):undefined});try{const el=f.mount();await f.flush();publish(el).click();await f.flush();assert.equal(f.page.readPublishAuxiliary().phase,'unknown');assert.equal(publish(el).disabled,true);assert.doesNotMatch(el.textContent,/Live · everyone/);}finally{f.cleanup();}}
});
test('known pre-write rejection releases protection; upstream ambiguity keeps it',async()=>{
 for(const [status,code,blocked] of [[403,'forbidden',false],[409,'conflict',false],[503,'not_configured',false],[502,'upstream_error',true],[503,'upstream_error',true]]){const f=await setup({respond:p=>p==='/publish'?new Response(JSON.stringify({ok:false,errors:[{code,path:'',message:'Fixture rejection'}]}),{status}):undefined});try{const el=f.mount();await f.flush();publish(el).click();await f.flush();assert.equal(publish(el).disabled,blocked,`${status}/${code}`);assert.equal(f.page.readPublishAuxiliary().dirty,blocked);assert.equal(f.calls.some(c=>c.path.startsWith('/publish/')),false);}finally{f.cleanup();}}
});
test('publish pending blocks rollback immediately, survives language and protects unload until confirmed completion',async()=>{
 const held=deferred(),f=await setup({respond:p=>p==='/publish'?held.promise:p==='/publish/11'?new Response(JSON.stringify({ok:true,...progress('success')})):undefined});
 try{let el=f.mount();await f.flush();publish(el).click();await f.flush();const started=f.page.readPublishAuxiliary();assert.equal(started.phase,'busy');assert.equal(rollback(el).disabled,true);el=f.mount('zh');await f.flush();assert.equal(publish(el).disabled,true);let prevented=false;for(const fn of f.events.beforeunload??[])fn({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(f.page.readPublishAuxiliary().identity,started.identity);held.resolve(new Response(JSON.stringify({ok:true,runId:11,mode:'dispatch'})));await f.flush();assert.equal(postCount(f,'/publish'),1);assert.equal(f.page.readPublishAuxiliary().dirty,false);assert.equal(f.page.readPublishAuxiliary().generation>started.generation,true);}finally{f.cleanup();}
});
test('unknown or malformed rollback acknowledgement is protected and cannot display a success for a different target',async()=>{
 for(const body of [{ok:true,commit:C,restoredFrom:B,changedFiles:2},{ok:true,restoredFrom:A,changedFiles:0}]){const f=await setup({respond:p=>p.startsWith('/rollback/')?new Response(JSON.stringify(body)):undefined});try{const el=f.mount();await f.flush();rollback(el).click();confirm(el).click();await f.flush();assert.equal(f.page.readPublishAuxiliary().phase,'unknown');assert.equal(publish(el).disabled,true);assert.doesNotMatch(el.textContent,/Rolled back to|nothing changed/);}finally{f.cleanup();}}
});
test('late prior-session rollback response cannot fill new session, and dialog rebind restores body',async()=>{
 const held=deferred(),f=await setup({respond:p=>p.startsWith('/rollback/')?held.promise:undefined});try{let el=f.mount();await f.flush();rollback(el).click();assert.equal(document.body.style.overflow,'hidden');el=f.mount('zh');await f.flush();assert.notEqual(document.body.style.overflow,'hidden');rollback(el).click();confirm(el).click();await f.flush();f.auth();el=f.mount();await f.flush();held.resolve(new Response(JSON.stringify({ok:true,commit:C,restoredFrom:A,changedFiles:2})));await f.flush();assert.doesNotMatch(el.textContent,/Rolled back to/);assert.equal(f.page.readPublishAuxiliary().phase,'idle');}finally{f.cleanup();}
});

test('late prior-session changes cannot replace the new-session list',async()=>{
 const held=deferred();let reads=0;const f=await setup({respond:p=>p==='/changes'&&++reads===1?held.promise:undefined});try{const old=f.mount();await f.flush();f.auth();const el=f.mount();await f.flush();const secret=changes();secret.unpublished[0].subject='Prior session only';held.resolve(new Response(JSON.stringify({ok:true,...secret})));await f.flush();assert.doesNotMatch(el.textContent,/Prior session only/);assert.match(el.textContent,/Changed meal/);assert.doesNotMatch(old.textContent,/Prior session only/);}finally{f.cleanup();}
});
test('late known-run progress from a prior session cannot claim success or clear new-operation protection',async()=>{
 const held=deferred();const f=await setup({respond:p=>p==='/publish/11'?held.promise:undefined});try{let el=f.mount();await f.flush();publish(el).click();await f.flush();f.auth();el=f.mount();await f.flush();held.resolve(new Response(JSON.stringify({ok:true,...progress('success')})));await f.flush();assert.doesNotMatch(el.textContent,/Live · everyone/);assert.equal(f.page.readPublishAuxiliary().phase,'idle');assert.equal(publish(el).disabled,false);}finally{f.cleanup();}
});
