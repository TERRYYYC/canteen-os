/** Actual shell + i18n + published reader with a small DOM boundary; native focus is checked separately. */
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {publishedFixture} from './published-fixture.mjs';
const web=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'c2b-shell-navigation-')),normal=publishedFixture(),empty=publishedFixture('no-plans');
after(async()=>{normal.cleanup();empty.cleanup();await rm(dir,{recursive:true,force:true});});
const bundle=await esbuild.build({stdin:{contents:"export * from './src/shell';export * from './src/i18n';export {createPublishedData} from './src/view-models/published';export {createEditSession} from './src/view-models/edit-session';export {inspectReloadSafety} from './src/view-models/reload-safety';",resolveDir:web},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
const file=join(dir,'shell.mjs');await writeFile(file,bundle.outputFiles[0].text);
class Element {
 constructor(tag,value=''){this.tag=tag;this.value=value;this.children=[];this.attrs={};this.events={};this.hidden=false;this.classList={add:x=>this.attrs.class=((this.attrs.class??'')+' '+x).trim(),remove:x=>this.attrs.class=(this.attrs.class??'').split(' ').filter(c=>c!==x).join(' ')};}
 setAttribute(k,v){this.attrs[k]=String(v);}
 getAttribute(k){return this.attrs[k]??null;}
 hasAttribute(k){return k in this.attrs;}
 removeAttribute(k){delete this.attrs[k];}
 get dataset(){return {themeValue:this.attrs['data-theme-value']};}
 get textContent(){return this.value+this.children.map(c=>c.textContent).join('');}
 set textContent(v){this.value=String(v);this.replaceChildren();}
 appendChild(c){this.children.push(c);c.parent=this;return c;}
 append(...cs){cs.forEach(c=>this.appendChild(c));}
 replaceChildren(...cs){for(const c of this.children)c.parent=null;this.children=[];this.append(...cs);}
 contains(el){return el===this||this.children.some(c=>c.contains(el));}
 matches(selector){return selector.split(',').some(s=>{
  s=s.trim();let match=true;
  s=s.replace(/:not\(([^)]+)\)/g,(_all,inner)=>{if(this.matches(inner))match=false;return '';});
  const tag=/^[a-z]+/.exec(s)?.[0];if(tag&&tag!==this.tag)return false;
  const cls=/\.([\w-]+)/.exec(s)?.[1];if(cls&&!(this.attrs.class??'').split(' ').includes(cls))return false;
  for(const [,key,,value] of s.matchAll(/\[([^\]=]+)(=(?:"([^"]*)"))?\]/g))if(!(key in this.attrs)||(value!==undefined&&this.attrs[key]!==value))return false;
  return match;
 });}
 querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}
 querySelector(s){return this.querySelectorAll(s)[0]??null;}
 closest(s){return this.matches(s)?this:this.parent?.closest(s)??null;}
 focus(){document.activeElement=this;}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
 fire(type,extra={}){const e={target:this,preventDefault(){this.prevented=true;},...extra};for(const fn of this.events[type]??[])fn(e);return e;}
}
let sequence=0;
async function setup(lang='en'){
 const root=new Element('root'),storage=new Map([['canteenos.lang',lang]]);
 globalThis.document={documentElement:new Element('html'),activeElement:null,createElement:tag=>new Element(tag),createTextNode:t=>new Element('#text',t)};
 globalThis.window={addEventListener(){},matchMedia:()=>({matches:false})};
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.sessionStorage={getItem:()=>null};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,languages:[lang]}});
 const m=await import(`${pathToFileURL(file).href}?case=${++sequence}`),shell=m.mountShell(root);
 const publication=async manifest=>m.createPublishedData({baseUrl:'https://example.invalid/data/',fetch:async()=>new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}})}).loadPublication();
 const drawer=root.querySelector('[role="dialog"]');
 return {m,shell,root,drawer,publication,links:()=>drawer.querySelectorAll('a.di'),byHref:href=>drawer.querySelectorAll('a.di').find(a=>a.getAttribute('href')===href)};
}
const copy={zh:{menu:'用餐安排',role:'团队查看',plan:'排每天的菜',guest:'顾客'},en:{menu:'Meals',role:'For the team',plan:'Plan meals',guest:'for guests'},uk:{menu:'Харчування',role:'Для команди',plan:'Планування меню',guest:'для гостей'}};
for(const lang of ['zh','en','uk']){
 test(`formal team publication has team navigation and its real protected plan link (${lang})`,async()=>{
  const e=await setup(lang),p=await e.publication(normal.manifest);e.shell.setBuild(p.manifest,p.kind);e.shell.openDrawer();
  assert.equal(e.drawer.textContent.includes(copy[lang].guest),false);
  assert.ok(e.byHref('#/menu').textContent.includes(copy[lang].menu));assert.ok(e.byHref('#/menu').textContent.includes(copy[lang].role));
  const plan=e.byHref('#/admin/plan/week-41');assert.ok(plan,'Published plan must be reachable through the existing admin route');
  assert.ok(plan.textContent.includes(copy[lang].plan));assert.equal(plan.hasAttribute('aria-disabled'),false);assert.equal(e.drawer.textContent.includes('2-й етап'),false);
  assert.deepEqual(e.links().map(a=>a.getAttribute('href')),['#/prep','#/purchase','#/menu','#/admin/plan/week-41']);
 });
 test(`empty and failed publication do not invent or retain an editable target (${lang})`,async()=>{
  const e=await setup(lang),p=await e.publication(normal.manifest);e.shell.setBuild(p.manifest,p.kind);
  const noPlans=await e.publication(empty.manifest);e.shell.setBuild(noPlans.manifest,noPlans.kind);
  assert.equal(e.links().some(a=>a.getAttribute('href').startsWith('#/admin')),false);
  assert.ok(e.byHref('#/menu').textContent.includes(copy[lang].role));assert.equal(e.drawer.textContent.includes('2-й етап'),false);
  e.shell.setBuild(null);assert.equal(e.links().some(a=>a.getAttribute('href').startsWith('#/admin')),false);
  assert.equal(e.drawer.textContent.includes(copy[lang].guest),false);assert.equal(e.drawer.textContent.includes(copy[lang].role),false);
 });
 test(`legacy keeps reader meaning and opens only the listed plan (${lang})`,async()=>{
  const e=await setup(lang),legacy=await e.publication({builtAt:normal.manifest.builtAt,commit:'local',plans:['old-week']});
  e.shell.setBuild(legacy.manifest,legacy.kind);assert.ok(e.byHref('#/menu').textContent.includes(copy[lang].guest));
  assert.ok(e.byHref('#/admin/plan/old-week'));assert.equal(e.byHref('#/admin/plan/week-41'),undefined);
  e.shell.setBuild({...legacy.manifest,plans:[]},legacy.kind);assert.equal(e.links().some(a=>a.getAttribute('href').startsWith('#/admin')),false);
 });
}
test('open drawer keeps equivalent focus across language and publication changes, and closes on the plan link',async()=>{
 const e=await setup(),p=await e.publication(normal.manifest);e.shell.setBuild(p.manifest,p.kind);e.shell.setActive('admin','plan/week-41');e.shell.openDrawer();
 assert.equal(document.activeElement,e.byHref('#/admin/plan/week-41'));assert.equal(document.activeElement.getAttribute('aria-current'),'page');
 e.m.setLang('uk');e.shell.refresh();assert.equal(document.activeElement,e.byHref('#/admin/plan/week-41'));
 e.shell.setBuild(p.manifest,p.kind);assert.equal(document.activeElement,e.byHref('#/admin/plan/week-41'));
 e.shell.setActive('admin','publish');assert.equal(e.byHref('#/admin/plan/week-41').hasAttribute('aria-current'),false);
 e.byHref('#/admin/plan/week-41').focus();e.drawer.fire('click',{target:document.activeElement});
 assert.equal(e.shell.isDrawerOpen(),false);assert.equal(document.activeElement.getAttribute('aria-controls'),'drawer');
 e.shell.openDrawer();e.byHref('#/admin/plan/week-41').focus();e.shell.setBuild(null);
 assert.equal(e.drawer.contains(document.activeElement),true);assert.ok(document.activeElement.getAttribute('href'));
});
test('navigation publication refresh leaves the existing editor outlet and pending save untouched',async()=>{
 const e=await setup(),p=await e.publication(normal.manifest),outlet=e.shell.newOutlet();let resolve,writes=0;
 const editor=e.m.createEditSession({mode:()=> 'mock',save:()=>{writes++;return new Promise(r=>resolve=r);},read:async()=>null});
 editor.open({kind:'plan',id:'old-plan'},{name:'Unsaved'});const saving=editor.save(),before=editor.getState();
 e.shell.setBuild(p.manifest,p.kind);e.shell.refresh();e.shell.setBuild(null);
 assert.equal(e.root.contains(outlet),true);assert.deepEqual(editor.getState(),before);assert.equal(e.m.inspectReloadSafety().reason,'saving');assert.equal(writes,1);
 resolve({commit:'b'.repeat(40),blobSha:'lock',unchanged:false,warnings:[]});await saving;editor.dispose();
});
