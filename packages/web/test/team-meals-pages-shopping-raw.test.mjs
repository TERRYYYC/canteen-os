import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'purchase-raw-owner-'));after(()=>rm(dir,{recursive:true,force:true}));
const bundle=await esbuild.build({stdin:{contents:`export * from './src/pages/purchase';export * from './src/api/team-meals';export * from './src/view-models/reload-safety';export {clearToken as changeAuth} from './src/admin/token';`,resolveDir:join(here,'..')},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent',plugins:process.env.PURCHASE_PAGE_BASELINE?[{name:'explicit-original-page',setup(build){build.onLoad({filter:/\/pages\/purchase\.ts$/},()=>({contents:readFileSync(process.env.PURCHASE_PAGE_BASELINE,'utf8'),loader:'ts'}));}}]:[]});
const file=join(dir,'page.mjs');await writeFile(file,bundle.outputFiles[0].text);
class Element{
 constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.text=text;this.children=[];this.attrs={};this.listeners={};this.style={};this.value='';this.disabled=false;this.validity={badInput:false};this.parentNode=null;this.classList={add:x=>this.setAttribute('class',`${this.attrs.class??''} ${x}`)};}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k==='disabled')this.disabled=true;if(k==='checked')this.checked=true;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5),v]));}
 appendChild(c){c.parentNode=this;this.children.push(c);if(this.tagName==='SELECT'&&c.tagName==='OPTION'&&(this.children.length===1||c.attrs.selected!==undefined))this.value=c.attrs.value??'';return c;}append(...cs){cs.forEach(c=>this.appendChild(c));}prepend(...cs){cs.forEach(c=>c.parentNode=this);this.children.unshift(...cs);}replaceChildren(...cs){this.children.forEach(c=>c.parentNode=null);this.children=[];this.text='';this.append(...cs);}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
 get firstChild(){return this.children[0]??null;}get isConnected(){return this.tagName==='BODY'||!!this.parentNode?.isConnected;}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(s){this.replaceChildren();this.text=String(s);}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}dispatch(t){if(t==='click'&&this.disabled)return;for(const fn of this.listeners[t]??[])fn({target:this,preventDefault(){}});}click(){this.dispatch('click');}focus(){document.activeElement=this;}select(){}
 querySelector(s){return this.querySelectorAll(s)[0]??null;}querySelectorAll(s){return walk(this).slice(1).filter(el=>{const m=s.match(/^\[([^=]+)="([^"]+)"\]$/);return m?el.attrs[m[1]]===m[2]:s.startsWith('.')?(el.attrs.class??'').split(' ').includes(s.slice(1)):el.tagName===s.toUpperCase();});}
}
const walk=n=>[n,...n.children.flatMap(walk)],cls=(n,c)=>walk(n).filter(x=>(x.attrs.class??'').split(' ').includes(c)),focus=(n,key)=>walk(n).find(x=>x.attrs['data-focus']===key),tick=()=>new Promise(r=>setImmediate(r));
const A='a'.repeat(40),B='b'.repeat(40),clone=x=>structuredClone(x);
const fixtureRoot=join(here,'../../../test/fixtures/contracts/valid/boundaries/data');
const read=p=>JSON.parse(readFileSync(p,'utf8')),map=sub=>Object.fromEntries(readdirSync(join(fixtureRoot,sub)).filter(f=>f.endsWith('.json')).map(f=>[f.slice(0,-5),read(join(fixtureRoot,sub,f))]));
const seed=()=>({menuPlans:map('menu-plans'),dishes:map('dishes'),ingredients:map('ingredients'),techniques:read(join(fixtureRoot,'techniques.json'))});
const btn=(el,label)=>{const found=walk(el).find(n=>n.tagName==='BUTTON'&&n.textContent===label);assert.ok(found,`button ${label} in ${el.textContent}`);return found;};
const input=(el,key,value)=>{const n=focus(el,key);assert.ok(n,`input ${key}`);n.value=value;n.dispatch('input');};
const boxes=el=>walk(el).filter(n=>n.tagName==='INPUT'&&n.attrs.type==='checkbox');
const selection=[{menuPlanRef:'team-week',date:'2026-09-14',mealType:'lunch'}];
const list=()=>({shoppingListVersion:'1',id:'team-shop',basis:{sourceRevision:A,selection},items:[{ingredientRef:'tomato',decision:'check'},{ingredientRef:'salt',decision:'check'},{ingredientRef:'cooking-oil',decision:'check'},{ingredientRef:'tomato-other',decision:'check'}]});
let serial=0;
async function setup({existing=false,mode='mock'}={}){
 const priorGlobals=new Map(['HTMLElement','MutationObserver','window','location','document','localStorage','sessionStorage','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const restoreGlobals=()=>{for(const [key,descriptor] of priorGlobals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
 // Node 20 has no navigator; use a private browser surface instead of changing Node 24's native object.
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{onLine:true}});
 globalThis.HTMLElement=Element;globalThis.MutationObserver=class{observe(){}disconnect(){}};globalThis.window={addEventListener(){}};globalThis.location={hash:'#/purchase/new/team-week'};globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),activeElement:null};
 const storage=new Map();globalThis.localStorage=globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const page=await import(`${pathToFileURL(file)}?case=${++serial}`),calls=[],writes=[],snap=seed(),sources=new Map(),history=new Map(),gates=[];let identity=1,revision=A,seq=0,post='success',indexFails=false;
 if(existing)sources.set('team-shop',{content:list(),commit:'c'.repeat(40),blobSha:'initial'});
 const json=x=>Response.json(clone(x)),failure=(status,code)=>Response.json({ok:false,errors:[{path:'',code,message:code}]},{status});
 const api=page.createTeamMealsApi('https://purchase-raw-fixture.invalid',{mode,identity:()=>identity,token:()=>`explicit-fixture-${identity}`,fetch:async(url,init)=>{
  const u=new URL(url),call={path:u.pathname,revision:u.searchParams.get('revision'),method:init.method,identity};calls.push(call);
  const gate=gates.find(g=>!g.claimed&&g.match(call));if(gate){gate.claimed=true;await gate.promise;}
  if(init.method==='POST'){const id=u.pathname.split('/').at(-1),content=JSON.parse(init.body),headers=new Headers(init.headers);writes.push({id,content,match:headers.get('If-Match'),none:headers.get('If-None-Match')});
   if(post==='conflict'){post='success';return failure(409,'conflict');}
   const commit=(++seq).toString(16).padStart(40,'0'),value={content,commit,blobSha:`saved-${seq}`};sources.set(id,value);history.set(`${id}:${commit}`,value);if(post==='lost'){post='success';throw new TypeError('explicit lost response');}return json({commit,blobSha:value.blobSha,unchanged:false,warnings:[]});}
  if(u.pathname.startsWith('/source/shopping-list/')){const id=u.pathname.split('/').at(-1),v=call.revision?history.get(`${id}:${call.revision}`):sources.get(id);return v?json(v):failure(404,'not_found');}
  const r=call.revision??revision;
  if(u.pathname==='/catalog')return json({commit:r,...snap,suppliers:[],translations:{machine:0,human:0,stale:0}});
  if(u.pathname.startsWith('/source/plan/')){const id=u.pathname.split('/').at(-1),p=snap.menuPlans[id];return p?json({content:p,commit:r,blobSha:`plan-${r}`}):failure(404,'not_found');}
  if(u.pathname==='/shopping-lists'){const all=[...sources.values()],offset=Number(u.searchParams.get('cursor')?.split('.').at(-1)??0);return indexFails?failure(503,'unavailable'):json({ok:true,commit:revision,items:all.slice(offset,offset+20).map(({content})=>({id:content.id,selection:content.basis.selection,itemCount:content.items.length,decisionCounts:{check:content.items.filter(x=>x.decision==='check').length,buy:content.items.filter(x=>x.decision==='buy'&&!x.bought).length,available:content.items.filter(x=>x.decision==='available').length,bought:content.items.filter(x=>x.decision==='buy'&&x.bought===true).length}})),nextCursor:offset+20<all.length?`v1.${revision}.${offset+20}`:null,skipped:0});}
  if(u.pathname==='/asset')return failure(404,'not_found');throw new Error('Unexpected fixture request');
 }});
 const render=page.createPurchaseRenderer(api),coverage=page.createPageReloadCoverage();
 const start=(rest='new/team-week',lang='en')=>{document.body.replaceChildren();const el=new Element('main');document.body.append(el);const promise=render(el,{rest,lang,planId:'team-week',route:'purchase',setReloadCoverage:coverage.beginRender('purchase',rest)});return{el,promise};};
 return{page,api,render,calls,writes,sources,start,failIndex(){indexFails=true;},async mount(rest,lang){const x=start(rest,lang);await x.promise;return x.el;},async flush(){for(let i=0;i<12;i++)await tick();},snapshot:()=>page.inspectReloadSafety(),hold(match){let release;const promise=new Promise(r=>release=r);const g={match,promise,release,claimed:false};gates.push(g);return g;},auth(){identity++;page.changeAuth();},revision(v){revision=v;},renameIngredient(id,name){snap.ingredients[id].name=name;},post(v){post=v;},cleanup(){try{for(const g of gates)g.release();api.dispose();document.body.replaceChildren();}finally{restoreGlobals();}}};
}
async function scope(f){const el=await f.mount();btn(el,'Read latest saved plans').click();await f.flush();assert.ok(boxes(el).length>1);return el;}

test('purchase entry discovers server-saved lists with dates and opens their original identity',async()=>{
 const f=await setup({existing:true});try{const el=await f.mount('');await f.flush();const card=walk(el).find(n=>n.attrs['data-shopping-index']==='true');assert.ok(card);assert.match(card.textContent,/Saved lists/);assert.match(card.textContent,/2026-09-14/);assert.match(card.textContent,/4/);assert.ok(walk(card).some(n=>n.tagName==='A'&&n.attrs.href==='#/purchase/team-shop'));assert.ok(f.calls.some(c=>c.path==='/shopping-lists'));}finally{f.cleanup();}
});
test('same-scope saved cards show stable complete list references across refreshed order',async()=>{
 const f=await setup({existing:true});try{for(const id of ['shop-2026-09-14-aabbccdd','shop-2026-09-14-aabbccee'])f.sources.set(id,{content:{...list(),id},commit:A,blobSha:id});let el=await f.mount('');await f.flush();const labels=()=>Object.fromEntries(cls(el,'tm-saved-list').map(card=>{const a=card.children.find(n=>n.tagName==='A');return[a.attrs.href,cls(card,'tm-list-reference')[0]?.textContent??''];}));const first=labels();for(const id of f.sources.keys())assert.ok(first['#/purchase/'+id].includes(id),'ordinary secondary card reference must preserve its full stable identity');const old=f.sources.get('team-shop');f.sources.delete('team-shop');f.sources.set('team-shop',old);btn(el,'Refresh lists').click();await f.flush();assert.deepEqual(labels(),first);}finally{f.cleanup();}
});
test('saved cards distinguish acknowledged decisions without counting bought twice',async()=>{
 const f=await setup({existing:true});try{const old=f.sources.get('team-shop').content;old.items[1].decision='available';old.items[2]={ingredientRef:'cooking-oil',decision:'buy',bought:true};const el=await f.mount('');await f.flush();const card=cls(el,'tm-saved-list')[0],summary=walk(card).find(n=>n.attrs['aria-label']==='Saved decisions');assert.ok(summary,'saved decisions belong in the ordinary card');for(const [k,v] of Object.entries({check:2,buy:0,available:1,bought:1}))assert.equal(walk(summary).find(n=>n.attrs['data-decision-count']===k)?.textContent,String(v));}finally{f.cleanup();}
});
test('same range offers the saved owner and an explicit separate creation action',async()=>{
 const f=await setup({existing:true});try{const original=clone(f.sources.get('team-shop'));const el=await f.mount('new/team-week/day/2026-09-14');await f.flush();const links=walk(el).filter(n=>n.tagName==='A'&&n.attrs.href==='#/purchase/team-shop');assert.ok(links.some(n=>n.textContent.includes('Continue list')),'same-range choice must let the user continue their existing list');assert.equal(f.writes.length,0);btn(el,'Create another list').click();await f.flush();assert.ok(location.hash.startsWith('#/purchase/shop-'));assert.deepEqual(f.sources.get('team-shop'),original,'creating a separate owner must preserve saved decisions');assert.equal(f.writes.length,0);}finally{f.cleanup();}
});
test('automatic range creation waits for saved-list discovery to settle',async()=>{
 const f=await setup();try{const held=f.hold(c=>c.path==='/shopping-lists'),run=f.start('new/team-week/day/2026-09-14');await f.flush();assert.equal(btn(run.el,'Create list to check').disabled,true);held.release();await run.promise;await f.flush();assert.equal(btn(run.el,'Create list to check').disabled,false);}finally{f.cleanup();}
});

test('same-scope choice searches later pages without pretending the first page is complete',async()=>{
 const f=await setup();try{for(let i=0;i<20;i++){const id=`other-${i}`;f.sources.set(id,{content:{...list(),id,basis:{sourceRevision:A,selection:[{...selection[0],date:'2026-09-15'}]}},commit:A,blobSha:id});}f.sources.set('team-shop',{content:list(),commit:A,blobSha:'old'});const el=await f.mount('new/team-week/day/2026-09-14');assert.equal(el.textContent.includes('No saved list has this exact scope.'),false);assert.equal(btn(el,'Create despite incomplete search').disabled,false);assert.equal(walk(el).some(n=>n.tagName==='A'&&n.attrs.href==='#/purchase/team-shop'),false);btn(el,'Load more').click();await f.flush();const panel=walk(el).find(n=>n.attrs['data-same-scope']==='true');assert.ok(panel.textContent.includes('team-shop'));assert.equal(cls(panel,'tm-saved-list').length,1);assert.ok(btn(el,'Create another list'));assert.equal(f.writes.length,0);}finally{f.cleanup();}
});
test('failed saved-list refresh retains acknowledged summary and requires explicit incomplete-search creation',async()=>{
 const f=await setup({existing:true});try{const el=await f.mount('new/team-week/day/2026-09-14');f.failIndex();btn(el,'Refresh lists').click();await f.flush();assert.match(el.textContent,/previously loaded lists and saved decisions/);assert.match(el.textContent,/does not mean none exist/);assert.equal(el.textContent.includes('No saved list has this exact scope.'),false);assert.ok(walk(el).some(n=>n.tagName==='A'&&n.attrs.href==='#/purchase/team-shop'));assert.equal(btn(el,'Create despite incomplete search').disabled,false);}finally{f.cleanup();}
});
test('scope matching uses every plan/date/meal tuple and stale create choices cannot confirm changed scope',async()=>{
 const f=await setup({existing:true});try{const el=await f.mount('new/team-week/day/2026-09-14'),oldChoice=btn(el,'Create another list');const second=boxes(el).find(n=>!n.checked);second.checked=true;second.dispatch('change');assert.equal(walk(el).some(n=>n.tagName==='A'&&n.attrs.href==='#/purchase/team-shop'),false);oldChoice.click();await f.flush();assert.equal(location.hash,'#/purchase/new/team-week');assert.ok(btn(el,'Create list to check'));assert.equal(f.writes.length,0);}finally{f.cleanup();}
});
test('continuing a matching saved list preserves its current unsaved owner and saved cards show only acknowledged decisions',async()=>{
 const f=await setup({existing:true});try{let el=await f.mount('team-shop');btn(el,'Buy').click();assert.equal(btn(el,'Save list').disabled,false);el=await f.mount('new/team-week/day/2026-09-14');const card=cls(el,'tm-saved-list')[0];assert.equal(walk(card).find(n=>n.attrs['data-decision-count']==='buy')?.textContent,'0');assert.ok(walk(card).some(n=>n.tagName==='A'&&n.attrs.href==='#/purchase/team-shop'));el=await f.mount('team-shop');assert.equal(btn(el,'Save list').disabled,false);assert.equal(walk(el).find(n=>n.attrs['data-decision-count']==='buy')?.textContent,'1');assert.equal(f.writes.length,0);}finally{f.cleanup();}
});

test('plan day range arrives preselected and generated list identifiers do not collide across plan entries',async()=>{
 const f=await setup();try{let el=await f.mount('new/team-week/day/2026-09-14');await f.flush();assert.ok(boxes(el).length>1);assert.equal(boxes(el).filter(n=>n.checked).length,1);assert.match(walk(el).find(n=>n.tagName==='LABEL'&&walk(n).some(c=>c.checked))?.textContent??'',/2026-09-14/);const id=focus(el,'new-list-id').value;assert.match(id,/^shop-[a-z0-9-]+$/);el=await f.mount('new/next-week');assert.notEqual(focus(el,'new-list-id').value,id);}finally{f.cleanup();}
});
test('both detail return links go to the current shopping list',async()=>{
 const f=await setup({existing:true});try{const el=await f.mount('team-shop/ingredient/tomato');const back=cls(el,'tm-head')[0].children.find(n=>n.tagName==='A');assert.equal(back.attrs.href,'#/purchase/team-shop');}finally{f.cleanup();}
});
test('language change during automatic range reads retains the live preselected scope',async()=>{
 for(const oldFirst of [true,false]){const f=await setup();try{const a=f.hold(c=>c.path==='/source/plan/team-week'),first=f.start('new/team-week/day/2026-09-14');await f.flush();const b=f.hold(c=>c.path==='/source/plan/team-week'),second=f.start('new/team-week/day/2026-09-14','uk');await f.flush();(oldFirst?a:b).release();await f.flush();(oldFirst?b:a).release();await Promise.all([first.promise,second.promise]);await f.flush();assert.ok(boxes(second.el).length>1,`old response first: ${oldFirst}`);assert.equal(boxes(second.el).filter(n=>n.checked).length,1);assert.equal(f.render.readAuxiliary('new/team-week/day/2026-09-14').dirty,false);}finally{f.cleanup();}}
});

test('raw list ID, plan IDs and selections have stable dirty generations across language and route return',async()=>{
 const f=await setup();try{let el=await f.mount();assert.equal(typeof f.render.readAuxiliary,'function');const first=f.render.readAuxiliary('new/team-week');assert.equal(first.dirty,false);input(el,'new-list-id','my-shop');input(el,'plan-ids','team-week, later-week');const changed=f.render.readAuxiliary('new/team-week');assert.equal(changed.dirty,true);assert.ok(changed.generation>first.generation);await f.mount('new/other-week');el=await f.mount('new/team-week','uk');assert.equal(focus(el,'new-list-id').value,'my-shop');assert.equal(focus(el,'plan-ids').value,'team-week, later-week');assert.deepEqual(f.render.readAuxiliary('new/team-week'),changed);assert.equal(f.snapshot().reason,'dirty');}finally{f.cleanup();}
});
test('scope selection itself dirties owner; rereading preserves user selection instead of restoring all options',async()=>{
 const f=await setup();try{let el=await scope(f);const all=boxes(el);all[0].checked=false;all[0].dispatch('change');btn(el,'Read latest saved plans').click();await f.flush();assert.equal(boxes(el)[0].checked??false,false);assert.equal(f.render.readAuxiliary('new/team-week').dirty,true);el=await f.mount('new/team-week','zh');assert.equal(boxes(el)[0].checked??false,false);}finally{f.cleanup();}
});
test('later plan-ID raw invalidates a held scope result without overwriting it or clearing dirty',async()=>{
 const f=await setup();try{const el=await f.mount(),held=f.hold(c=>c.path==='/source/plan/team-week');btn(el,'Read latest saved plans').click();input(el,'plan-ids','later-week');held.release();await f.flush();assert.equal(focus(el,'plan-ids').value,'later-week');assert.equal(boxes(el).length,0);assert.equal(f.render.readAuxiliary('new/team-week').dirty,true);}finally{f.cleanup();}
});
test('initialization is registered before async and original auth settlement cannot clear the next auth read',async()=>{
 const f=await setup({existing:true});try{const a=f.hold(c=>c.path==='/source/shopping-list/team-shop'),startA=f.start('team-shop');assert.equal(f.snapshot().reason,'saving');assert.ok(f.snapshot().records.some(r=>r.ownerId.startsWith('auxiliary-')&&r.phase==='busy'));f.auth();const b=f.hold(c=>c.path==='/source/shopping-list/team-shop'),startB=f.start('team-shop');assert.equal(f.snapshot().reason,'unknown');a.release();await startA.promise;assert.equal(f.snapshot().reason,'saving');assert.ok(!JSON.stringify(f.snapshot()).includes('fixture-'));b.release();await startB.promise;assert.equal(f.snapshot().reason,'clear');}finally{f.cleanup();}
});
test('held initialization stays guarded through language even when the real API coalesces identical GETs',async()=>{
 const f=await setup({existing:true});try{const a=f.hold(c=>c.path==='/source/shopping-list/team-shop'),one=f.start('team-shop');const two=f.start('team-shop','uk');assert.equal(f.snapshot().reason,'saving');a.release();await Promise.all([one.promise,two.promise]);assert.equal(f.snapshot().reason,'clear');}finally{f.cleanup();}
});
test('create consumes only its captured inputs and routes to captured ID while later raw survives',async()=>{
 const f=await setup();try{let el=await scope(f);input(el,'new-list-id','created-shop');const held=f.hold(c=>c.path==='/catalog');btn(el,'Create list to check').click();input(el,'new-list-id','later-shop');held.release();await f.flush();assert.equal(location.hash,'#/purchase/created-shop');assert.equal(f.render.readAuxiliary('new/team-week').dirty,true);el=await f.mount();assert.equal(focus(el,'new-list-id').value,'later-shop');assert.equal(f.writes.length,0);}finally{f.cleanup();}
});
test('successful create consumes matching raw and leaves JSON dirty only in C1; failed create consumes nothing',async()=>{
 const f=await setup();try{let el=await scope(f);input(el,'new-list-id','');btn(el,'Create list to check').click();await f.flush();assert.equal(f.render.readAuxiliary('new/team-week').dirty,true);input(el,'new-list-id','created-shop');btn(el,'Create list to check').click();await f.flush();assert.equal(f.render.readAuxiliary('new/team-week').dirty,false);assert.equal(f.snapshot().reason,'dirty');assert.equal(f.writes.length,0);}finally{f.cleanup();}
});
test('C1 unknown save and its recovery do not acquire a duplicate auxiliary operation',async()=>{
 const f=await setup();try{let el=await scope(f);input(el,'new-list-id','created-shop');btn(el,'Create list to check').click();await f.flush();el=await f.mount('created-shop');const before=f.snapshot().records.filter(r=>r.ownerId.startsWith('auxiliary-')).map(r=>r.operation);f.post('lost');btn(el,'Save list').click();await f.flush();assert.equal(f.snapshot().reason,'unknown');assert.deepEqual(f.snapshot().records.filter(r=>r.ownerId.startsWith('auxiliary-')).map(r=>r.operation),before);btn(el,'Verify save outcome').click();await f.flush();assert.equal(f.writes.length,1);assert.equal(f.snapshot().reason,'clear');}finally{f.cleanup();}
});
test('unconfigured and malformed routes finish read-only coverage without fake transport',async()=>{
 const f=await setup({mode:'unconfigured'});try{await f.mount();assert.equal(f.snapshot().reason,'clear');await f.mount('bad!');assert.equal(f.snapshot().reason,'clear');assert.equal(f.calls.length,0);}finally{f.cleanup();}
});

test('existing scope read and rebase consume only their captured source; later plan IDs survive rebase and save ACK',async()=>{
 const f=await setup({existing:true});try{let el=await f.mount('team-shop');assert.equal(f.render.readAuxiliary('team-shop').dirty,false);f.revision(B);btn(el,'Read latest saved plans').click();await f.flush();assert.equal(f.render.readAuxiliary('team-shop').dirty,true);const held=f.hold(c=>c.path==='/catalog'&&c.revision===B);btn(el,'Apply scope and review again').click();input(el,'plan-ids','team-week, next-week');held.release();await f.flush();assert.equal(focus(el,'plan-ids').value,'team-week, next-week');assert.equal(f.render.readAuxiliary('team-shop').dirty,true);btn(el,'Save list').click();await f.flush();assert.equal(f.writes[0].match,'initial');assert.equal(f.writes[0].content.basis.sourceRevision,B);assert.ok(f.writes[0].content.items.every(i=>i.decision==='check'&&!i.bought));assert.equal(f.render.readAuxiliary('team-shop').dirty,true);el=await f.mount('team-shop','uk');assert.equal(focus(el,'plan-ids').value,'team-week, next-week');}finally{f.cleanup();}
});
test('successful rebase clears matching raw baseline; latest-plan input cannot apply an older loaded scope',async()=>{
 const f=await setup({existing:true});try{const el=await f.mount('team-shop');f.revision(B);btn(el,'Read latest saved plans').click();await f.flush();input(el,'plan-ids','next-week');assert.equal(btn(el,'Apply scope and review again').disabled,true);input(el,'plan-ids','team-week');assert.equal(btn(el,'Apply scope and review again').disabled,false);btn(el,'Apply scope and review again').click();await f.flush();assert.equal(f.render.readAuxiliary('team-shop').dirty,false);assert.equal(f.snapshot().reason,'dirty');btn(el,'Save list').click();await f.flush();assert.equal(f.snapshot().reason,'clear');}finally{f.cleanup();}
});
test('scope selection remains dirty and unchanged after readonly create is invalidated by leaving',async()=>{
 const f=await setup();try{let el=await scope(f);input(el,'new-list-id','never-created');const held=f.hold(c=>c.path==='/catalog');btn(el,'Create list to check').click();await f.mount('new/elsewhere');held.release();await f.flush();el=await f.mount();assert.equal(focus(el,'new-list-id').value,'never-created');assert.equal(f.render.readAuxiliary('new/team-week').dirty,true);assert.equal(f.writes.length,0);assert.notEqual(location.hash,'#/purchase/never-created');}finally{f.cleanup();}
});
test('two distinct simultaneous initialization reads remain protected until both original tickets finish',async()=>{
 const f=await setup({existing:true});try{f.sources.set('second-shop',{content:{...list(),id:'second-shop'},commit:'d'.repeat(40),blobSha:'second'});const a=f.hold(c=>c.path==='/source/shopping-list/team-shop'),first=f.start('team-shop');const b=f.hold(c=>c.path==='/source/shopping-list/second-shop'),second=f.start('second-shop');a.release();await first.promise;assert.equal(f.snapshot().reason,'saving');b.release();await second.promise;assert.equal(f.snapshot().reason,'clear');}finally{f.cleanup();}
});
test('late input events from the prior language/auth cannot change the active raw owner',async()=>{
 const f=await setup();try{let el=await f.mount();const old=focus(el,'new-list-id');input(el,'new-list-id','retained-shop');await f.mount('new/team-week','uk');const saved=f.render.readAuxiliary('new/team-week');old.value='stale-shop';old.dispatch('input');assert.deepEqual(f.render.readAuxiliary('new/team-week'),saved);f.auth();assert.equal(f.render.readAuxiliary('new/team-week'),null);el=await f.mount();old.value='private-old';old.dispatch('input');assert.notEqual(focus(el,'new-list-id').value,'private-old');assert.equal(f.render.readAuxiliary('new/team-week').dirty,false);assert.equal(f.snapshot().reason,'clear');}finally{f.cleanup();}
});
test('an old discard proposal is invalidated by another raw edit through the real reload coordinator',async()=>{
 const f=await setup();try{const el=await f.mount();input(el,'new-list-id','first-shop');let reloaded=0;const coordinator=f.page.createReloadCoordinator({reload:()=>reloaded++,activate:async()=>{},hasWaiting:()=>false});const proposal=await coordinator.requestUpdate();assert.equal(proposal.status,'confirm-discard');input(el,'new-list-id','later-shop');assert.equal((await coordinator.confirmDiscard(proposal.snapshot)).status,'blocked');assert.equal(reloaded,0);}finally{f.cleanup();}
});

test('concurrent clipboard operations each keep an original ticket and the final rejection shows readable fallback',async()=>{
 const f=await setup({existing:true});const prior=Object.getOwnPropertyDescriptor(navigator,'clipboard');try{const calls=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise((resolve,reject)=>calls.push({resolve,reject}))}});let el=await f.mount('team-shop');btn(el,'Copy list').click();btn(el,'Copy list').click();assert.equal(f.snapshot().reason,'saving');calls[0].resolve();await f.flush();assert.equal(f.snapshot().reason,'saving');el=await f.mount('team-shop','uk');assert.equal(f.snapshot().reason,'saving');calls[1].reject(new Error('explicit local failure'));await f.flush();assert.equal(f.snapshot().reason,'clear');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('explicit local failure');}}});el=await f.mount('team-shop');btn(el,'Copy list').click();await f.flush();const area=walk(el).find(n=>n.tagName==='TEXTAREA');assert.equal(area.hidden,false);assert.ok(area.value.includes(A));assert.equal(f.snapshot().reason,'clear');}finally{if(prior)Object.defineProperty(navigator,'clipboard',prior);else delete navigator.clipboard;f.cleanup();}
});

async function conflict(f,el){
 const tomato=walk(el).find(n=>n.attrs['data-ingredient']==='tomato');btn(tomato,'Buy').click();
 const remote={content:{...list(),basis:{sourceRevision:B,selection}},commit:'e'.repeat(40),blobSha:'remote'};f.sources.set('team-shop',remote);f.post('conflict');btn(el,'Save list').click();await f.flush();btn(el,'Read remote and compare').click();await f.flush();
}
const scopeRevision=el=>{const card=cls(el,'tm-card').find(n=>n.children.some(c=>c.tagName==='H3'&&c.textContent==='Apply scope and review again'));return walk(card).find(n=>n.tagName==='CODE').textContent;};
test('adopting a different remote basis refreshes untouched scope inputs and their real baseline',async()=>{
 const f=await setup({existing:true});try{const el=await f.mount('team-shop');await conflict(f,el);btn(el,'Use remote content').click();await f.flush();assert.equal(scopeRevision(el),B);assert.equal(f.render.readAuxiliary('team-shop').dirty,false);assert.equal(f.snapshot().reason,'clear');}finally{f.cleanup();}
});
test('remote adoption does not consume a later raw edit after its C1 replacement notification',async()=>{
 const f=await setup({existing:true});try{const el=await f.mount('team-shop');await conflict(f,el);btn(el,'Use remote content').click();input(el,'plan-ids','next-week');await f.flush();assert.equal(focus(el,'plan-ids').value,'next-week');assert.equal(f.render.readAuxiliary('team-shop').dirty,true);}finally{f.cleanup();}
});

for(const [lang,copyLabel] of [['zh','复制清单'],['en','Copy list'],['uk','Копіювати список']])test(`${lang}: actual bound renderer sends identical rich text to success, rejected, thrown and missing clipboard paths`,async()=>{
 const f=await setup({existing:true});try{
  let el=await f.mount('team-shop',lang),captured;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{captured=value;}}});btn(el,copyLabel).click();await f.flush();assert.equal(f.snapshot().reason,'clear');const expected=walk(el).find(n=>n.tagName==='TEXTAREA').value;assert.equal(captured,expected);for(const ref of ['tomato','tomato-other','first-dish','second-dish','salt',A])assert.ok(expected.includes(ref),ref);
  for(const behavior of ['reject','throw','absent']){el=await f.mount('team-shop',lang);if(behavior==='absent')delete navigator.clipboard;else Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:value=>{assert.equal(value,expected);if(behavior==='throw')throw new Error('explicit synchronous clipboard failure');return Promise.reject(new Error('explicit denied clipboard'));}}});btn(el,copyLabel).click();await f.flush();const area=walk(el).find(n=>n.tagName==='TEXTAREA');assert.equal(area.hidden,false);assert.equal(area.value,expected);assert.equal(f.snapshot().reason,'clear');}
 }finally{f.cleanup();}
});
test('copy remains bound to saved A while newer B scope and raw plan choices have not been applied',async()=>{
 const f=await setup({existing:true});try{let el=await f.mount('team-shop');const before=walk(el).find(n=>n.tagName==='TEXTAREA').value;f.revision(B);f.renameIngredient('tomato',{zh:'当前资料改名',en:'Current renamed tomato',uk:'Поточна нова назва'});btn(el,'Read latest saved plans').click();await f.flush();input(el,'plan-ids','team-week, later-week');const after=walk(el).find(n=>n.tagName==='TEXTAREA').value;assert.equal(after,before);assert.ok(after.includes(A));assert.ok(!after.includes(B));assert.ok(!after.includes('Current renamed'));assert.ok(!after.includes('later-week'));assert.equal(f.writes.length,0);}finally{f.cleanup();}
});


test('shopping summary reflects current manual decisions without counting bought items twice',async()=>{
 const f=await setup({existing:true});try{const el=await f.mount('team-shop');
 const count=kind=>el.querySelector(`[data-decision-count="${kind}"]`)?.textContent;
 assert.equal(count('check'),'4');assert.equal(count('buy'),'0');assert.equal(count('available'),'0');
 btn(cls(el,'tm-material')[0],'Buy').click();await f.flush();
 assert.equal(count('check'),'3');assert.equal(count('buy'),'1');
 const bought=boxes(cls(el,'tm-material')[0])[0];bought.checked=true;bought.dispatch('change');await f.flush();
 assert.equal(count('buy'),'0');assert.equal(count('bought'),'1');assert.equal(f.writes.length,0);
 btn(cls(el,'tm-material')[1],'Available').click();await f.flush();
 assert.equal(count('check'),'2');assert.equal(count('available'),'1');assert.equal(f.writes.length,0);
 }finally{f.cleanup();}
});


test('a failed refresh does not continue to claim an empty saved-list index',async()=>{
 const f=await setup();try{const el=await f.mount('');assert.match(el.textContent,/No saved shopping lists yet/);f.failIndex();btn(el,'Refresh lists').click();await f.flush();assert.doesNotMatch(el.textContent,/No saved shopping lists yet/);assert.match(el.textContent,/could not be loaded/);}finally{f.cleanup();}
});

// Regression reproduced independently by the original nonauthor reviewer.
test('reviewer: creating again from the same plan range generates a new identity after the first list is saved',async()=>{
 const f=await setup();try{const route='new/team-week/day/2026-09-14';let el=await f.mount(route);const first=focus(el,'new-list-id').value;btn(el,'Create list to check').click();await f.flush();assert.equal(location.hash,'#/purchase/'+first);el=await f.mount(first);btn(el,'Save list').click();await f.flush();assert.equal(f.writes.length,1);assert.equal(f.snapshot().reason,'clear');el=await f.mount(route);const next=focus(el,'new-list-id').value;assert.notEqual(next,first,'a fresh New list action must not reuse the acknowledged hidden ID');btn(el,'Create another list').click();await f.flush();assert.equal(location.hash,'#/purchase/'+next);assert.doesNotMatch(el.textContent,/conflict/); }finally{f.cleanup();}
});
test('unfinished, unknown and subsequently edited lists keep their original new-entry resume link',async()=>{
 for(const state of ['unsaved','unknown','edited']){const f=await setup();try{const route='new/team-week/day/2026-09-14';let el=await f.mount(route);const id=focus(el,'new-list-id').value;btn(el,'Create list to check').click();await f.flush();el=await f.mount(id);
  if(state!=='unsaved'){if(state==='unknown')f.post('lost');btn(el,'Save list').click();await f.flush();if(state==='edited'){const tomato=walk(el).find(n=>n.attrs['data-ingredient']==='tomato');btn(tomato,'Buy').click();}}
  el=await f.mount(route);assert.ok(walk(el).some(n=>n.tagName==='A'&&n.textContent==='Open list'&&n.attrs.href==='#/purchase/'+id),state);assert.equal(walk(el).some(n=>n.tagName==='BUTTON'&&n.textContent==='Create list to check'),false);assert.equal(f.snapshot().reason,state==='unknown'?'unknown':'dirty');
 }finally{f.cleanup();}}
});


test('shopping content leads while source versions and per-item references remain expandable',async()=>{
 const f=await setup({existing:true,mode:'real'});try{const el=await f.mount('team-shop'),nodes=walk(el),row=cls(el,'tm-material')[0];assert.ok(row);const versions=cls(el,'tm-purchase-record')[0];assert.ok(versions,'one secondary list/source record');assert(nodes.indexOf(versions)>nodes.indexOf(row),'material decisions lead source metadata');assert.match(versions.textContent,/team-shop/);assert.match(versions.textContent,new RegExp(A));const refs=row.children.filter(n=>n.tagName==='DETAILS');assert.equal(refs.length,1,'one expandable source and quantity reference per material');assert.match(refs[0].textContent,/Used in/);assert.match(refs[0].textContent,/Complete estimate unavailable|Calculated reference/);assert.equal(btn(el,'Save list').disabled,true);assert.equal(f.writes.length,0);}finally{f.cleanup();}
});
