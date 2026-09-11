// Actual pwa.ts + editor + reload coordinator, with a deterministic plugin/DOM clock boundary.
// The real generated Service Worker and native dialogs are exercised separately in pwa-browser.html.
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'c2b-pwa-integration-'));after(()=>rm(dir,{recursive:true,force:true}));
const bundle=await esbuild.build({stdin:{contents:"export * from './src/pwa';export * from './src/view-models/edit-session';export * from './src/view-models/reload-safety';export {clearToken} from './src/admin/token';export {dataApi} from './src/data';",resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env.BASE_URL':JSON.stringify('/canteen/')},logLevel:'silent',plugins:[{name:'controlled-plugin-boundary',setup(build){
 build.onResolve({filter:/^virtual:pwa-register$/},()=>({path:'register',namespace:'test-plugin'}));
 build.onLoad({filter:/.*/,namespace:'test-plugin'},()=>({contents:'export function registerSW(options){return globalThis.testRegisterSW(options)}',loader:'js'}));
}}]});
await writeFile(join(dir,'pwa.mjs'),bundle.outputFiles[0].text);
class Element extends EventTarget {
 constructor(tag,text=''){super();this.tag=tag;this.children=[];this.attrs={};this.value=text;this.classList={remove(){}};}
 setAttribute(key,value){this.attrs[key]=value;}
 get textContent(){return this.value+this.children.map(c=>c.textContent).join('');}
 set textContent(value){this.value=value;this.children=[];}
 appendChild(child){this.children.push(child);child.parent=this;return child;}
 append(...children){children.forEach(c=>this.appendChild(c));}
 prepend(child){this.children.unshift(child);child.parent=this;}
 querySelector(){return null;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
 showModal(){this.modal=true;}
}
const originalTimers={setTimeout,clearTimeout};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
let m;
async function setup({controlled=true}={}){
 const root=new Element('main'),events=new EventTarget(),sw=new EventTarget(),timers=new Map();
 const counts={reloads:0,activations:0,refreshes:0};let timerId=0,callbacks;
 sw.controller=controlled?{}:null;const registration={waiting:{scriptURL:'https://example.invalid/canteen/sw.js'},update:async()=>{}};
 Object.assign(globalThis,{
  document:Object.assign(new EventTarget(),{baseURI:'https://example.invalid/canteen/',body:root,getElementById:()=>root,createElement:tag=>new Element(tag),createTextNode:text=>new Element('#text',text)}),
  location:{reload(){counts.reloads++;}},
  localStorage:{getItem:()=> 'en'},sessionStorage:{getItem:()=>null},
  window:Object.assign(events,{matchMedia:()=>({matches:false})}),
  testRegisterSW(options){callbacks=options;options.onRegisteredSW('sw.js',registration);return async()=>{counts.activations++;};},
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
 });
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Node test',platform:'',maxTouchPoints:0,languages:['en'],onLine:true,serviceWorker:sw}});
 window.navigator=navigator;
 m??=await import(pathToFileURL(join(dir,'pwa.mjs')).href);
 const walk=node=>[node,...node.children.flatMap(walk)];
 const button=text=>{const found=walk(root).find(n=>n.tag==='button'&&n.textContent===text);assert.ok(found,`Button missing: ${text}`);return found;};
 m.initPwa({refresh(){}},{async refreshPublication(){counts.refreshes++;}});
 return {root,sw,callbacks,counts,registration,button,
  async control(worker,{plugin=controlled,pluginFirst=false}={}){sw.controller=worker;if(plugin&&pluginFirst)callbacks.onNeedReload();sw.dispatchEvent(new Event('controllerchange'));if(plugin&&!pluginFirst)callbacks.onNeedReload();await flush();},
  async click(text){button(text).dispatchEvent(new Event('click'));await flush();},
  async advance(ms){for(const [id,t] of [...timers])if(t.ms<=ms){timers.delete(id);t.fn();}await flush();},
  close(){Object.assign(globalThis,originalTimers);},
 };
}
const body={name:'Saved'},source={content:body,commit:'a'.repeat(40),blobSha:'a'.repeat(40)};
test('actual PWA timeout cancels consent; a late plugin reload is blocked until a new clean request',async()=>{
 const env=await setup();try {
  env.callbacks.onNeedRefresh();assert.deepEqual(env.counts,{reloads:0,activations:0,refreshes:0});
  await env.click('New version availableReload');assert.equal(env.counts.activations,1);
  await env.advance(2000);assert.equal(env.counts.reloads,0);assert.match(env.root.textContent,/not completed/i);
  env.callbacks.onNeedReload();assert.equal(env.counts.reloads,0);
  await env.click('Continue editing, update later');env.registration.waiting=null;
  await env.click('New version availableReload');assert.equal(env.counts.reloads,1);
  env.callbacks.onNeedReload();assert.equal(env.counts.reloads,1);
 } finally {env.close();}
});
test('actual PWA prompt and external controller events preserve an offscreen pending and unknown save',async()=>{
 const env=await setup();let reject,readable=false,writes=0;
 const editor=m.createEditSession({mode:()=> 'mock',save:()=>{writes++;return new Promise((_resolve,r)=>{reject=r;});},read:async()=>{if(!readable)throw Error('Unknown fixture');return source;}});
 try {
  editor.open({kind:'dish',id:'dish'},body,source);editor.edit({name:'Unsaved'});const pending=editor.save();editor.invalidate();
  const before=editor.getState();env.callbacks.onNeedRefresh();await env.click('New version availableReload');
  assert.match(env.root.textContent,/save or upload is in progress/i);assert.equal(env.root.textContent.includes('Discard listed'),false);
  env.sw.controller={};env.sw.dispatchEvent(new Event('controllerchange'));env.callbacks.onNeedReload();await flush();
  assert.deepEqual(editor.getState(),before);assert.deepEqual(env.counts,{reloads:0,activations:0,refreshes:1});assert.equal(writes,1);
  env.sw.dispatchEvent(new Event('controllerchange'));await flush();assert.equal(env.counts.refreshes,1);
  reject(Error('Lost response'));await pending;await env.click('Continue editing, update later');await env.click('New version availableReload');
  assert.match(env.root.textContent,/outcome is still unknown/i);assert.equal(env.root.textContent.includes('Discard listed'),false);
  env.callbacks.onNeedReload();await env.advance(3000);assert.equal(env.counts.reloads,0);assert.equal(writes,1);
 } finally {readable=true;editor.open({kind:'dish',id:'dish'},body,source);await editor.reconcileUnknown();editor.dispose();env.close();}
});
test('actual PWA keeps old-auth write protection without offering an inaccessible private editor',async()=>{
 const env=await setup();let resolve;
 const e=m.createEditSession({mode:()=> 'mock',save:()=>new Promise(r=>{resolve=r;}),read:async()=>source});
 try {
  e.open({kind:'dish',id:'private-previous-dish'},{name:'Private previous body'},source);const save=e.save();m.clearToken();
  env.callbacks.onNeedRefresh();await env.click('New version availableReload');
  assert.match(env.root.textContent,/previous session/i);assert.equal(env.root.textContent.includes('private-previous-dish'),false);
  assert.equal(env.root.textContent.includes('Discard listed'),false);assert.deepEqual(env.counts,{reloads:0,activations:0,refreshes:0});
  resolve({commit:'b'.repeat(40),blobSha:'b'.repeat(40),unchanged:false,warnings:[]});await save;
  assert.equal(e.getState().draft,null);assert.equal(m.inspectReloadSafety().reason,'clear');
 } finally {e.dispose();env.close();}
});

for(const controlled of [false,true])for(const pluginFirst of [false,true])test(`actual PWA completes one approved worker takeover (initial control=${controlled}, plugin first=${pluginFirst})`,async()=>{
 const env=await setup({controlled});let state={ownerId:'stable-draft',kind:'plan',id:'plan',generation:1,dirty:true,phase:'dirty'};
 const off=m.registerReloadRecords('stable-draft',()=>[state]);
 try {
  // A first document is initially uncontrolled, then claimed by A without a reload intent.
  if(!controlled){await env.control({});assert.equal(env.counts.reloads,0);}
  env.callbacks.onNeedRefresh();await env.click('New version availableReload');
  await env.click('Discard listed local changes and update');const target=env.registration.waiting;
  assert.equal(env.counts.activations,1);assert.equal(env.counts.reloads,0);const before=m.inspectReloadSafety();
  env.registration.waiting=null;await env.control(target,{pluginFirst});
  assert.equal(env.counts.reloads,1,'Actual approved worker takeover must finish reload, even without the plugin callback');
  assert.deepEqual(m.inspectReloadSafety(),before,'Reload must not clear any owner or draft');
  // The other callback, duplicate native events and the old timeout cannot reload again.
  env.callbacks.onNeedReload();await env.control(target,{plugin:true});await env.advance(3000);
  assert.equal(env.counts.reloads,1);assert.equal(env.root.textContent.includes('has not completed'),false);
 } finally {off();env.close();}
});
test('actual PWA binds consent to the worker object, not a matching script URL or any plugin callback',async()=>{
 const env=await setup();try {
  env.callbacks.onNeedRefresh();await env.click('New version availableReload');const target=env.registration.waiting;
  await env.control({scriptURL:target.scriptURL});assert.equal(env.counts.reloads,0,'An unrelated worker cannot spend the target consent');
  env.registration.waiting=null;await env.control(target);assert.equal(env.counts.reloads,1);
 } finally {env.close();}
});
for(const boundary of ['generation','pending','unknown','timeout','cancel'])test(`actual PWA rejects target activation after ${boundary} invalidates consent`,async()=>{
 const env=await setup({controlled:false});let state={ownerId:'changed-draft',kind:'plan',id:'plan',generation:1,dirty:true,phase:'dirty'};
 const off=m.registerReloadRecords('changed-draft',()=>[state]);
 try {
  env.callbacks.onNeedRefresh();await env.click('New version availableReload');await env.click('Discard listed local changes and update');
  const target=env.registration.waiting;
  if(boundary==='generation')state={...state,generation:2};
  if(boundary==='pending')state={...state,generation:2,pending:true,phase:'saving'};
  if(boundary==='unknown')state={...state,generation:2,pending:true,phase:'unknown'};
  if(boundary==='timeout')await env.advance(2000);
  if(boundary==='cancel'){await env.advance(2000);await env.click('Continue editing, update later');}
  const before=m.inspectReloadSafety();env.registration.waiting=null;
  await env.control(target,{plugin:true});assert.equal(env.counts.reloads,0);assert.deepEqual(m.inspectReloadSafety(),before);
  env.callbacks.onNeedReload();await env.advance(4000);assert.equal(env.counts.reloads,0);
 } finally {off();env.close();}
});
