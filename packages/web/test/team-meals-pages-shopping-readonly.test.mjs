/** Demo/offline purchase surface: the approved publication is read, never the saved API. */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
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
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}dispatch(t){if(t==='click'&&this.disabled)return;for(const fn of this.listeners[t]??[])fn({target:this,preventDefault(){}});}click(){this.dispatch('click');}focus(){document.activeElement=this;}
 querySelector(s){return this.querySelectorAll(s)[0]??null;}querySelectorAll(s){return walk(this).slice(1).filter(el=>{const m=s.match(/^\[([^=]+)="([^"]+)"\]$/);return m?el.attrs[m[1]]===m[2]:s.startsWith('.')?(el.attrs.class??'').split(' ').includes(s.slice(1)):el.tagName===s.toUpperCase();});}
}
const walk=n=>[n,...n.children.flatMap(walk)],cls=(n,c)=>walk(n).filter(x=>(x.attrs.class??'').split(' ').includes(c));
const tags=(n,tag)=>walk(n).filter(x=>x.tagName===tag),marked=(n,key)=>walk(n).find(x=>x.attrs[key]!==undefined);
const boxes=n=>walk(n).filter(x=>x.tagName==='INPUT'&&x.attrs.type==='checkbox');
let serial=0;
async function mount({lang='en',rest='',planId='week-41',projection='served'}={}){
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
  if(url.pathname.endsWith('build.json'))return Response.json(fixture.manifest);
  if(url.pathname.includes('/team-meals/'))return projection==='served'?Response.json(fixture.projection):Response.json({},{status:404});
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
  assert.match(f.el.textContent,new RegExp(fixture.revision),'the published source revision stays visible');
 }finally{f.cleanup();}
});

test('every write control on the published purchase list stays rendered and disabled',async()=>{
 const f=await mount({lang:'en'});
 try{
  const buttons=tags(f.el,'BUTTON');
  assert.ok(buttons.length>0,'write controls are shown, not silently dropped');
  assert.ok(buttons.every(n=>n.disabled===true),'save, re-read and per-item decisions are all disabled');
  assert.ok(boxes(f.el).length>0&&boxes(f.el).every(n=>n.disabled===true),'no item can be ticked');
  assert.ok(marked(f.el,'data-purchase-writes'),'one line explains why the controls are disabled');
  assert.match(f.el.textContent,/Open with the chef link/);
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
