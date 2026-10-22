// #202: the plan page's Add form offers catalog, saved and inbox dishes, fixes the last two with the existing
// knowledge calls, and keeps the same button in place when a dish is chosen. Same production page as the other
// plan tests: only the transports (team API and knowledge API fetch) are fixtures.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'plan-add-knowledge-'));after(()=>rm(dir,{recursive:true,force:true}));
const entry=join(here,'../src/pages/admin/plan.ts'),bundle=await esbuild.build({stdin:{contents:(await readFile(entry,'utf8'))+`
export {createTeamMealsApi} from ${JSON.stringify(join(here,'../src/api/team-meals.ts'))};
export {createKnowledgeApi} from ${JSON.stringify(join(here,'../src/api/knowledge.ts'))};
export {inspectReloadSafety,createPageReloadCoverage} from ${JSON.stringify(join(here,'../src/view-models/reload-safety.ts'))};`,
 resolveDir:dirname(entry),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
const file=join(dir,'page.mjs');await writeFile(file,bundle.outputFiles[0].text);

class Element{
 constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.text=text;this.children=[];this.attrs={};this.listeners={};this.style={};this.value='';this.disabled=false;this.validity={badInput:false};this.parentNode=null;this.classList={add:x=>this.setAttribute('class',`${this.attrs.class??''} ${x}`)};}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k==='disabled')this.disabled=true;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5),v]));}
 appendChild(c){c.parentNode?.children&&c.parentNode!==this&&(c.parentNode.children=c.parentNode.children.filter(x=>x!==c));c.parentNode=this;this.children.push(c);if(this.tagName==='SELECT'&&c.tagName==='OPTION'&&(this.children.length===1||c.attrs.selected!==undefined))this.value=c.attrs.value??'';return c;}
 append(...cs){cs.forEach(c=>this.appendChild(c));}replaceChildren(...cs){this.children.forEach(c=>c.parentNode=null);this.children=[];this.text='';this.append(...cs);}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
 get firstChild(){return this.children[0]??null;}get isConnected(){return this.tagName==='BODY'||!!this.parentNode?.isConnected;}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(s){this.replaceChildren();this.text=String(s);}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}dispatch(t){if(t==='click'&&this.disabled)return;for(const fn of this.listeners[t]??[])fn({target:this,preventDefault(){}});}click(){this.dispatch('click');}focus(options){document.activeElement=this;document.focusOptions=options;}
 querySelector(s){return this.querySelectorAll(s)[0]??null;}querySelectorAll(s){return walk(this).slice(1).filter(el=>{const m=s.match(/^\[([^=]+)="([^"]+)"\]$/);return m?el.attrs[m[1]]===m[2]:s.startsWith('.')?(el.attrs.class??'').split(' ').includes(s.slice(1)):el.tagName===s.toUpperCase();});}
}
const walk=n=>[n,...n.children.flatMap(walk)],cls=(n,c)=>walk(n).filter(x=>(x.attrs.class??'').split(' ').includes(c)),focus=(n,key)=>walk(n).find(x=>x.attrs['data-focus']===key),tick=()=>new Promise(r=>setImmediate(r));
const save=el=>cls(el,'tm-actions')[0].querySelector('button'),rows=el=>walk(el).filter(x=>x.attrs['data-meal-index']!==undefined);
const addForm=el=>cls(el,'tm-add-form')[0],addButton=el=>addForm(el).children.find(x=>x.tagName==='BUTTON');
const input=(el,key,value,type='input')=>{const node=focus(el,key);node.value=value;node.dispatch(type);};
// A browser click on a submit button submits its form, but only while the button is still in the page.
const press=button=>{if(button.disabled||!button.isConnected)return;let form=button.parentNode;while(form&&form.tagName!=='FORM')form=form.parentNode;form?.dispatch('submit');};
const notes=el=>cls(el,'tm-plan-add-notes')[0];
const A='a'.repeat(40),C='c'.repeat(40);
const FIXED='11111111-1111-4111-8111-111111111111',SAVED='22222222-2222-4222-8222-222222222222',NEW='33333333-3333-4333-8333-333333333333',CANDIDATE='44444444-4444-4444-8444-444444444444',DONE='55555555-5555-4555-8555-555555555555';
const dishRefOf=(id,version)=>`kb-${id.replaceAll('-','')}-v${version}`;
const seed=()=>({schemaVersion:'3',meals:[{date:'2026-09-14',mealType:'lunch',dishRef:'soup',plannedServings:8},{date:'2026-09-15',mealType:'dinner',dishRef:'stew',plannedServings:12},{date:'2026-09-16',mealType:'lunch',dishRef:'soup'}]});
const REVIEWER='CanteenOS：直接存为菜谱（复核在 app 外，ADR-0011）',NOTE='app 里没有人审核来源；复核在 app 外进行。';
const QUANTITY={zh:'份数按每份记的菜，每个用量都要写明出处：盐',en:'For a dish counted per serving, every amount needs its source: salt',uk:'Для страви на порцію кожна кількість потребує джерела: сіль'};
const UNCLASSIFIED={zh:'这一版有还没分类的「视频里没说清」条目，分完类再排进菜单',en:'This version has unsorted unclear items; sort them before putting it on a menu',uk:'У цій версії є несортовані неясні пункти; відсортуйте їх перед додаванням у меню'};
let serial=0;

async function setup({knowledge=true,kbRead,review,materialize,teamRead}={}){
 globalThis.HTMLElement=Element;globalThis.MutationObserver=class{observe(){}disconnect(){}};globalThis.window={addEventListener(){}};globalThis.location={hash:'#/admin/plan/week-a'};
 globalThis.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>new Element('',t),activeElement:null};
 const storage=new Map();globalThis.localStorage=globalThis.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const page=await import(`${pathToFileURL(file)}?case=${++serial}`),writes=[],kbWrites=[];
 // The controlled repository: one dish fixed from the knowledge base, plus two Git dishes.
 const head={commit:A,dishes:{soup:{schemaVersion:'3',name:{en:'Soup',zh:'汤'},components:[]},stew:{schemaVersion:'3',name:{en:'Stew',zh:'炖菜'},components:[]},
  [dishRefOf(FIXED,1)]:{schemaVersion:'3',name:{en:'Fixed omelette',zh:'固定蛋饼'},components:[],provenance:{source:'knowledge',recipeId:FIXED,recipeVersion:1,snapshotHash:'h'}}}};
 const recipes=[{id:FIXED,title:{en:'Fixed omelette'},version:1},{id:SAVED,title:{en:'Tomato and egg',zh:'番茄炒蛋'},version:2}];
 const inbox=[{id:'item-1',candidateSummary:{candidateId:CANDIDATE,title:{en:'Tomato and egg soup',zh:'番茄蛋汤'},status:'needs_review'}},{id:'item-2',candidateSummary:null},{id:'item-3',candidateSummary:{candidateId:DONE,title:{en:'Old'},status:'approved'}}];
 const fix=(id,version)=>{const dishRef=dishRefOf(id,version);head.commit=C;head.dishes[dishRef]={schemaVersion:'3',name:{en:`Recipe ${id.slice(0,4)}`},components:[],provenance:{source:'knowledge',recipeId:id,recipeVersion:version,snapshotHash:'h'}};return {dishRef,recipeId:id,recipeVersion:version,commit:C,unchanged:false};};
 const api=page.createTeamMealsApi('https://plan-add-fixture.invalid',{mode:'mock',token:()=>'explicit-local-fixture',identity:()=>1,fetch:async(url,init)=>{const u=new URL(url);
  if(init.method==='POST'){writes.push({id:u.pathname,body:JSON.parse(init.body)});return Response.json({ok:true,commit:'b'.repeat(40),blobSha:'after',unchanged:false,warnings:[]});}
  if(teamRead){const response=await teamRead(u);if(response)return response;}
  if(u.pathname==='/catalog')return Response.json({commit:u.searchParams.get('revision')??head.commit,dishes:{...head.dishes},ingredients:{},techniques:[],suppliers:[],translations:{machine:0,human:0,stale:0}});
  return Response.json({content:seed(),commit:A,blobSha:'before'});}});
 const kb=page.createKnowledgeApi({base:'https://plan-add-fixture.invalid',token:()=>'explicit-local-fixture',session:()=>1,fetch:async(url,init={})=>{const u=new URL(url),method=init.method??'GET';
  if(method==='GET'){
   if(kbRead){const response=await kbRead(u);if(response)return response;}
   if(u.pathname==='/knowledge/recipes')return Response.json({items:recipes,nextCursor:null});
   if(u.pathname==='/knowledge/favorites/items'&&u.searchParams.get('state')==='needs_review')return Response.json({items:inbox,nextCursor:null});
   return Response.json({error:{code:'not_found',message:'no'}},{status:404});
  }
  const write={path:u.pathname,key:new Headers(init.headers).get('Idempotency-Key'),body:JSON.parse(init.body)};kbWrites.push(write);
  const reviewed=/^\/knowledge\/favorites\/candidates\/([0-9a-f-]{36})\/review$/.exec(u.pathname);
  if(reviewed){
   if(review){const response=await review(write);if(response)return response;}
   // The KB turns the candidate into a saved recipe; the inbox no longer lists it.
   inbox.splice(inbox.findIndex(item=>item.candidateSummary?.candidateId===reviewed[1]),1);recipes.push({id:NEW,title:{en:'Tomato and egg soup'},version:1});
   return Response.json({id:reviewed[1],status:'approved',recipeId:NEW,recipeVersion:1,reviewer:write.body.reviewer});
  }
  const fixed=/^\/knowledge-materializations\/recipes\/([0-9a-f-]{36})$/.exec(u.pathname);
  if(fixed){if(materialize){const response=await materialize(write,{fix});if(response)return response;}return Response.json(fix(fixed[1],write.body.recipeVersion));}
  return Response.json({error:{code:'not_found',message:'no'}},{status:404});}});
 const render=page.createPlanRenderer(api,knowledge?()=>kb:undefined),coverage=page.createPageReloadCoverage();
 const flush=async()=>{for(let i=0;i<20;i++)await tick();};
 const mount=async(id='week-a',lang='en')=>{document.body.replaceChildren();const el=new Element('main');document.body.append(el);await render(el,{lang,planId:id,route:'admin',rest:id,setReloadCoverage:coverage.beginRender('admin',`plan/${id}`)},id);await flush();return el;};
 return{page,render,writes,kbWrites,head,mount,flush,fix,cleanup(){api.dispose();document.body.replaceChildren();}};
}
const groups=el=>focus(el,'add-dish').children.filter(n=>n.tagName==='OPTGROUP').map(g=>[g.attrs.label,g.children.map(o=>o.attrs.value)]);

test('Add lists dishes ready for menus, saved recipes and inbox candidates in labelled groups; a fixed version is listed once',async()=>{
 const f=await setup();try{
  const el=await f.mount();
  assert.deepEqual(groups(el),[
   ['Ready for menus',['soup','stew',dishRefOf(FIXED,1)]],
   ['Saved recipes · not on a menu yet',[`recipe:${SAVED}:2`]],
   ['Inbox · not saved as a recipe yet',[`candidate:${CANDIDATE}`]],
  ]);
  assert.match(focus(el,'add-dish').textContent,/Tomato and egg · KB v2 · 22222222/);
  const zh=await f.mount('week-a','zh');
  assert.deepEqual(groups(zh).map(([label])=>label),['已排进菜单','已存菜谱 · 还没排进菜单','收件箱 · 还没存成菜谱']);
  assert.match(focus(zh,'add-dish').textContent,/番茄炒蛋 · KB v2/);
  assert.equal(f.kbWrites.length,0,'listing writes nothing');
 }finally{f.cleanup();}
});

test('an inbox candidate is saved, fixed and added in order, and the plan can be saved with it',async()=>{
 const f=await setup();try{
  const el=await f.mount();
  input(el,'add-dish',`candidate:${CANDIDATE}`,'change');
  assert.match(notes(el).textContent,/saves it as a recipe, puts this version on a menu, then adds it to the plan/);
  press(addButton(el));await f.flush();
  assert.deepEqual(f.kbWrites.map(w=>w.path),[`/knowledge/favorites/candidates/${CANDIDATE}/review`,`/knowledge-materializations/recipes/${NEW}`]);
  assert.deepEqual(f.kbWrites[0].body,{decision:'approve',reviewer:REVIEWER,note:NOTE},'the same fixed system label as the inbox (ADR-0011)');
  assert.deepEqual(f.kbWrites[1].body,{recipeVersion:1});
  assert.equal(rows(el).length,4);
  assert.equal(focus(el,'add-dish').value,dishRefOf(NEW,1),'the choice now points at the fixed dish');
  assert.equal(f.render.readAuxiliary('week-a').dirty,false,'nothing is left pending in the Add form');
  assert.deepEqual(groups(el).map(([label,values])=>[label,values.includes(dishRefOf(NEW,1))]),[['Ready for menus',true],['Saved recipes · not on a menu yet',false]],'the inbox is re-read: the candidate left it');
  assert.equal(save(el).disabled,false);save(el).click();await f.flush();
  assert.deepEqual(f.writes.at(-1).body.meals.at(-1),{date:'2026-09-14',mealType:'lunch',dishRef:dishRefOf(NEW,1)});
 }finally{f.cleanup();}
});

test('a saved recipe is fixed at its listed version and added, without saving it again',async()=>{
 const f=await setup();try{
  const el=await f.mount();
  input(el,'add-dish',`recipe:${SAVED}:2`,'change');
  assert.match(notes(el).textContent,/puts this version on a menu, then adds it to the plan/);
  press(addButton(el));await f.flush();
  assert.deepEqual(f.kbWrites.map(w=>[w.path,w.body]),[[`/knowledge-materializations/recipes/${SAVED}`,{recipeVersion:2}]]);
  assert.equal(rows(el).at(-1).textContent.includes('Recipe 2222'),true);
  assert.equal(save(el).disabled,false);
 }finally{f.cleanup();}
});

test('a Worker refusal shows the registered words beside Add, adds nothing and keeps the choice',async()=>{
 const f=await setup({materialize:()=>Response.json({errors:[{path:'/recipe/ingredients/0',code:'quantity_source_required',message:QUANTITY.zh,messages:QUANTITY}]},{status:422})});try{
  const el=await f.mount();
  input(el,'add-dish',`recipe:${SAVED}:2`,'change');press(addButton(el));await f.flush();
  const alert=cls(addForm(el),'tm-plan-add-result')[0];
  assert.equal(alert.attrs.role,'alert');
  assert.match(alert.textContent,/^For a dish counted per serving, every amount needs its source\. Add the source to each amount/,'the kit wording comes first');
  assert.match(alert.textContent,/every amount needs its source: salt/,'the Worker line with its detail follows');
  assert.match(alert.textContent,/The dish was not added; the plan is unchanged\./);
  assert.equal(alert.querySelectorAll('a')[0].attrs.href,`#/admin/knowledge/${SAVED}`);
  assert.equal(rows(el).length,3);assert.equal(save(el).disabled,true);assert.equal(f.writes.length,0);
  assert.equal(focus(el,'add-dish').value,`recipe:${SAVED}:2`);
  assert.equal(f.page.inspectReloadSafety().records.some(r=>r.phase==='unknown'),false,'a definite refusal leaves nothing unconfirmed');
  const zh=await f.mount('week-a','zh');press(addButton(zh));await f.flush();
  assert.match(cls(addForm(zh),'tm-plan-add-result')[0].textContent,/^份数按每份记的菜，每个用量都要写明出处。在材料里补上出处/);
 }finally{f.cleanup();}
});

test('a candidate whose fixing is refused stays saved once: the retry continues from the recipe and the Worker words are shown',async()=>{
 const f=await setup({materialize:()=>Response.json({errors:[{path:'/recipe/unknowns/0',code:'recipe_unknowns_unclassified',message:UNCLASSIFIED.zh,messages:UNCLASSIFIED}]},{status:422})});try{
  const el=await f.mount('week-a','uk');
  input(el,'add-dish',`candidate:${CANDIDATE}`,'change');press(addButton(el));await f.flush();
  assert.match(cls(addForm(el),'tm-plan-add-result')[0].textContent,new RegExp(`^${UNCLASSIFIED.uk}`),'an unregistered code shows the Worker’s own sentence in the page language');
  assert.equal(focus(el,'add-dish').value,`recipe:${NEW}:1`,'the choice moved to the saved recipe');
  assert.ok(groups(el).find(([label])=>label.startsWith('Збережені рецепти'))[1].includes(`recipe:${NEW}:1`));
  press(addButton(el));await f.flush();
  assert.deepEqual(f.kbWrites.map(w=>w.path.split('/')[2]),['favorites','recipes','recipes'],'reviewed once, fixing tried twice');
  assert.notEqual(f.kbWrites[1].key,f.kbWrites[2].key,'a definite refusal wrote nothing, so the next try is a new request');
  assert.equal(rows(el).length,3);assert.equal(f.writes.length,0);
 }finally{f.cleanup();}
});

test('repeated clicks while fixing write once; an unconfirmed result is checked with the same request before anything is added',async()=>{
 let release,calls=0;
 const f=await setup({materialize:()=>++calls===1?new Promise(resolve=>release=resolve):undefined});try{
  const el=await f.mount();
  input(el,'add-dish',`recipe:${SAVED}:2`,'change');
  const button=addButton(el);
  press(button);await f.flush();
  assert.equal(button.disabled,true);assert.equal(focus(el,'add-dish').disabled,true);
  press(button);addForm(el).dispatch('submit');await f.flush();
  assert.equal(f.kbWrites.length,1,'clicks and Enter while busy send nothing');
  assert.equal(f.page.inspectReloadSafety().reason,'saving');
  release(Response.json({error:{code:'upstream_error',message:'lost'}},{status:502}));await f.flush();
  assert.equal(rows(el).length,3);
  assert.match(notes(el).textContent,/The result is not confirmed yet\. Use Add a dish again to check it with the original request/);
  assert.equal(f.page.inspectReloadSafety().reason,'unknown','leaving the page now warns');
  assert.equal(addButton(el),button);assert.equal(button.disabled,false);
  press(button);await f.flush();
  assert.equal(f.kbWrites.length,2);
  assert.equal(f.kbWrites[1].key,f.kbWrites[0].key,'the same Idempotency-Key');
  assert.deepEqual(f.kbWrites[1].body,f.kbWrites[0].body);
  assert.equal(rows(el).length,4,'added exactly once');
  assert.notEqual(f.page.inspectReloadSafety().reason,'unknown');
 }finally{f.cleanup();}
});

test('when the knowledge base cannot be read, Add still lists and adds dishes ready for menus, and can read again',async()=>{
 let down=true;
 const f=await setup({kbRead:()=>down?Response.json({error:{code:'upstream_error',message:'down'}},{status:502}):undefined});try{
  const el=await f.mount();
  assert.deepEqual(groups(el),[['Ready for menus',['soup','stew',dishRefOf(FIXED,1)]]]);
  assert.match(notes(el).textContent,/The inbox and recipe library could not be read; only dishes ready for menus are listed\./);
  input(el,'add-dish','stew','change');press(addButton(el));
  assert.equal(rows(el).length,4);assert.equal(f.kbWrites.length,0);
  down=false;notes(el).querySelector('button').click();await f.flush();
  assert.equal(groups(el).length,3);
 }finally{f.cleanup();}
});

test('choosing a dish keeps the same Add button in place and the date and meal folded; pressing it right away adds the dish',async()=>{
 // The field trial: choose a dish, then press where the button was. Catalog only, as on that day.
 const f=await setup({knowledge:false});try{
  const el=await f.mount();
  const form=addForm(el),button=addButton(el),extra=cls(el,'tm-plan-add-extra')[0];
  // Everything laid out before the button in document order; the date and meal fields come after it.
  // Tags only: the status line's text and class may change, but no box may be added or removed above the button.
  const before=node=>{const all=walk(el);return all.slice(0,all.indexOf(node)).map(n=>n.tagName);};
  const layout=before(button);
  // The user's pointer and focus are on the list when the choice lands; the page then repaints.
  focus(el,'add-dish').focus();
  input(el,'add-dish','stew','change');
  assert.equal(addForm(el),form,'the same form');
  assert.equal(addButton(el),button,'the same button element');
  assert.equal(button.isConnected,true);
  assert.equal(Object.hasOwn(extra.attrs,'open'),false,'choosing a dish does not unfold the date and meal');
  assert.deepEqual(before(button),layout,'nothing above or before the button was added or removed');
  assert.match(notes(el).textContent,/The Add choices have not been added to the plan/,'the reminder is below the button');
  assert.equal(cls(el,'tm-plan-unsaved').length,0,'no bar sticks to the bottom over the button for a choice alone');
  assert.equal(document.activeElement,focus(el,'add-dish'),'focus stays on the list');
  assert.deepEqual(document.focusOptions,{preventScroll:true},'and restoring it does not scroll the page under the pointer');
  assert.equal(save(el).disabled,true);
  press(button);
  assert.equal(rows(el).length,4);
  assert.equal(rows(el).at(-1).textContent.includes('Stew'),true);
  assert.equal(save(el).disabled,false,'Save plan is available right away');
  assert.equal(cls(el,'tm-plan-unsaved').length,1,'the plan itself changed, so the unsaved bar shows now');
  input(el,'add-date','2026-09-16');
  assert.equal(Object.hasOwn(extra.attrs,'open'),true,'changing the date still shows the date and meal');
  assert.equal(addButton(el),button);
 }finally{f.cleanup();}
});

// #203 review: R1–R3 are the reviewer's counterexamples, each failing before the fix.
const CONFLICT={errors:[{path:'',code:'conflict',message:'此菜谱版本已写入不同内容，不能覆盖固定快照'}]};
const latestCatalog=u=>u.pathname==='/catalog'&&!u.searchParams.get('revision');

test('R1: a fix that ends after leaving the plan updates the plan page opened since; that page adds with its own click',async()=>{
 let release;const f=await setup({materialize:()=>new Promise(resolve=>release=resolve)});try{
  let el=await f.mount();
  input(el,'add-dish',`recipe:${SAVED}:2`,'change');press(addButton(el));await f.flush();
  assert.equal(f.kbWrites.length,1);
  await f.mount('week-b');el=await f.mount();
  assert.equal(addButton(el).disabled,true,'still fixing when the user is back');
  release(Response.json(f.fix(SAVED,2)));await f.flush();
  assert.equal(addButton(el).disabled,false,'the page in front hears that the fix ended');
  assert.equal(focus(el,'add-dish').disabled,false);
  assert.doesNotMatch(notes(el).textContent,/Putting it on a menu/);
  assert.match(notes(el).textContent,/This version is on a menu now but not in the plan yet/);
  assert.equal(rows(el).length,3,'the page that was left writes nothing into this one');
  press(addButton(el));await f.flush();
  assert.equal(f.kbWrites.length,1,'not fixed a second time');
  assert.equal(rows(el).length,4);assert.equal(save(el).disabled,false);
 }finally{f.cleanup();}
});

test('R2: an unconfirmed fix answered on retry by a conflict is read back from the repository instead of dropped',async()=>{
 let calls=0;
 const f=await setup({materialize:(write,{fix})=>{
  // The first try lands but its answer is lost; the snapshot then changes, so the same request is refused as a conflict.
  if(++calls===1){fix(SAVED,2);return Response.json({error:{code:'upstream_error',message:'lost'}},{status:502});}
  return Response.json(CONFLICT,{status:409});}});try{
  const el=await f.mount();
  input(el,'add-dish',`recipe:${SAVED}:2`,'change');press(addButton(el));await f.flush();
  assert.match(notes(el).textContent,/The result is not confirmed yet/);assert.equal(rows(el).length,3);
  press(addButton(el));await f.flush();
  assert.equal(f.kbWrites.length,2);assert.equal(f.kbWrites[1].key,f.kbWrites[0].key,'the same request first');
  assert.equal(rows(el).length,4,'the exact fixed version is found and added');
  assert.equal(rows(el).at(-1).textContent.includes('Recipe 2222'),true);
  assert.notEqual(f.page.inspectReloadSafety().reason,'unknown');
  press(addButton(el));await f.flush();
  assert.equal(f.kbWrites.length,2,'never a new key for a version already fixed');
 }finally{f.cleanup();}
});

test('R2: while the repository cannot be read back the fix stays unconfirmed; when it shows nothing was fixed, the refusal stands',async()=>{
 let calls=0,listDown=false;
 const f=await setup({materialize:()=>++calls===1?Response.json({error:{code:'upstream_error',message:'lost'}},{status:502}):Response.json(CONFLICT,{status:409}),
  teamRead:u=>listDown&&latestCatalog(u)?Response.json({ok:false,errors:[{path:'',code:'upstream_error',message:'down'}]},{status:502}):undefined});try{
  const el=await f.mount();
  input(el,'add-dish',`recipe:${SAVED}:2`,'change');press(addButton(el));await f.flush();
  listDown=true;press(addButton(el));await f.flush();
  assert.match(notes(el).textContent,/The result is not confirmed yet/,'a refusal that could not be checked keeps the record');
  assert.equal(f.page.inspectReloadSafety().reason,'unknown');
  listDown=false;press(addButton(el));await f.flush();
  assert.deepEqual(f.kbWrites.map(w=>w.key),[f.kbWrites[0].key,f.kbWrites[0].key,f.kbWrites[0].key],'every check reuses the original request');
  assert.match(cls(addForm(el),'tm-plan-add-result')[0].textContent,/The dish was not added; the plan is unchanged\./,'read back: not fixed, so the refusal is shown');
  assert.equal(rows(el).length,3);assert.notEqual(f.page.inspectReloadSafety().reason,'unknown');
 }finally{f.cleanup();}
});

test('R3: after a confirmed fix, a failed dish-list read is what Add retries; it never adds a dish the list has not confirmed',async()=>{
 let failNext=false,reads=0;
 const f=await setup({materialize:(write,{fix})=>{failNext=true;return Response.json(fix(SAVED,2));},
  teamRead:u=>{if(!latestCatalog(u))return;reads++;if(failNext){failNext=false;return Response.json({ok:false,errors:[{path:'',code:'upstream_error',message:'down'}]},{status:502});}}});try{
  const el=await f.mount();
  input(el,'add-dish',`recipe:${SAVED}:2`,'change');press(addButton(el));await f.flush();
  assert.equal(rows(el).length,3,'nothing is added before the dish list has the fixed dish');
  assert.match(notes(el).textContent,/This version is on a menu now but not in the plan yet/);
  assert.equal(focus(el,'add-dish').value,`recipe:${SAVED}:2`,'the choice stays at the fixed stage');
  const before=reads;
  press(addButton(el));await f.flush();
  assert.equal(f.kbWrites.length,1,'not fixed again');
  assert.equal(reads>before,true,'Add read the dish list again');
  assert.equal(rows(el).length,4);
  assert.equal(rows(el).at(-1).textContent.includes('Recipe 2222'),true,'the row shows the dish name, not a raw id');
 }finally{f.cleanup();}
});
