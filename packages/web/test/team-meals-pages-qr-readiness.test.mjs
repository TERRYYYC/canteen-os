import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {Element} from './team-meals-pages-unload-dom.mjs';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json'));
const esbuild=await import(pathToFileURL(vr.resolve('esbuild'))),dir=await mkdtemp(join(tmpdir(),'qr-ready-'));
after(()=>rm(dir,{recursive:true,force:true}));
const result=await esbuild.build({entryPoints:[join(here,'../src/pages/qr.ts')],bundle:true,write:false,format:'esm',loader:{'.css':'empty'},define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
await writeFile(join(dir,'qr.mjs'),result.outputFiles[0].text);
const {render}=await import(pathToFileURL(join(dir,'qr.mjs')));
class QrElement extends Element {replaceWith(...nodes){const parent=this.parentNode;if(!parent)return;const at=parent.children.indexOf(this);parent.children.splice(at,1,...nodes);for(const node of nodes)node.parentNode=parent;this.parentNode=null;}}
const valid={siteUrl:'https://fixture.invalid',generatedAt:'2026-09-12T00:00:00Z',items:['prep','purchase','menu'].map(route=>({route,url:`https://fixture.invalid/#/${route}`,png:`qr/${route}.png`}))};
async function mount(response,lang='en'){let printed=0;globalThis.window={print:()=>printed++};globalThis.document={body:new QrElement('body'),createElement:t=>new QrElement(t),createTextNode:t=>new QrElement('',t)};globalThis.fetch=async()=>response();const el=new QrElement('main');document.body.append(el);await render(el,{lang,t:k=>k});return{el,printed:()=>printed,button:()=>el.querySelector('.qr-print')};}
test('missing or empty QR data keeps Print disabled and provides an actionable retry',async()=>{
 for(const response of [()=>new Response('',{status:404}),()=>Response.json({...valid,items:[]})]){const f=await mount(response);assert.equal(f.button().disabled,true);f.button().click();assert.equal(f.printed(),0);assert.match(f.el.textContent,/Print is unavailable/);assert.ok(f.el.querySelector('.qr-retry'));}
});
test('all three QR images must load before printing; an image failure disables it again',async()=>{
 const f=await mount(()=>Response.json(valid));assert.equal(f.button().disabled,true);const images=f.el.querySelectorAll('img');assert.equal(images.length,3);
 for(const img of images.slice(0,2))img.dispatchEvent({type:'load'});assert.equal(f.button().disabled,true);images[2].dispatchEvent({type:'load'});assert.equal(f.button().disabled,false);f.button().click();assert.equal(f.printed(),1);images[2].dispatchEvent({type:'error'});assert.equal(f.button().disabled,true);assert.match(f.el.textContent,/Print is unavailable/);
});


test('three real QR entry points describe team use in all languages',async()=>{
 for(const lang of ['zh','en','uk']){const f=await mount(()=>Response.json(valid),lang);assert.equal(f.el.querySelectorAll('img').length,3);const menu=f.el.querySelectorAll('.qr-item').find(n=>n.getAttribute('data-route')==='menu');assert.ok(menu);assert.doesNotMatch(menu.textContent,/顾客|档口|guests|counter|гостей|стійці/);assert.match(menu.textContent,/团队|team|команд/);assert.doesNotMatch(f.el.querySelector('.qr-toolbar').textContent,/档口|counter|стійка/);assert.equal(f.button().disabled,true);}
});
