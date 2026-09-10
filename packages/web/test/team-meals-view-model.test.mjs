import assert from 'node:assert/strict';
import {test, after} from 'node:test';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createSchemaValidators} from '../../../scripts/validate-schemas.mjs';

const root=dirname(fileURLToPath(new URL('../../../package.json',import.meta.url)));
const web=join(root,'packages/web'), fixtures=join(root,'test/fixtures/contracts');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const semantic=read(join(fixtures,'semantic-expectations.json'));
const oracle=read(join(fixtures,'golden-expectations.json'));
const validators=createSchemaValidators({schemaDir:join(root,'schemas')});
function valid(kind,value){const r=validators.validateEntity(kind,value);assert.equal(r.valid,true,JSON.stringify(r.errors));}
function fixture(name='boundaries') {
 const base=join(fixtures,'valid',name,'data');
 const map=sub=>Object.fromEntries(readdirSync(join(base,sub)).filter(f=>f.endsWith('.json')).map(f=>[f.slice(0,-5),read(join(base,sub,f))]));
 return {menuPlans:map('menu-plans'),dishes:map('dishes'),ingredients:map('ingredients'),techniques:read(join(base,'techniques.json'))};
}
function formats(inputs) {
 for(const [kind,records] of [['plan',inputs.menuPlans],['dish',inputs.dishes],['ingredient',inputs.ingredients]]) for(const value of Object.values(records)) valid(kind,value);
 valid('techniques',inputs.techniques);
}
const require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'team-view-'));
after(()=>rm(dir,{recursive:true,force:true}));
const entry=existsSync(join(web,'src/view-models/team-meals.ts'))?"export * from './src/view-models/team-meals';":'';
const bundled=await esbuild.build({stdin:{contents:`export * from './src/api/team-meals';${entry}`,resolveDir:web},bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env.VITE_WORKER_URL':'""'},logLevel:'silent'});
await writeFile(join(dir,'view.mjs'),bundled.outputFiles[0].text);
const mod=await import(pathToFileURL(join(dir,'view.mjs')).href);
// Q's tokens identify injected mock scenarios only; they do not assert historical Git trees.
const {a:A,b:B,c:C}=semantic.revisionTokens, AT=semantic.fixedAt;
const selection=[{menuPlanRef:'team-week',date:'2026-09-14',mealType:'lunch'}];
const request=(revision=A,scope=selection)=>({revision,selection:scope,at:AT});
const copy=x=>structuredClone(x), ids=x=>x.items.map(i=>i.ingredientRef);
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
const error=(status,code)=>json({ok:false,errors:[{path:'',code,message:code}]},status);
function setup(revisions={[A]:fixture()}, options={}) {
 for(const inputs of Object.values(revisions)) formats(inputs);
 let principal='one';const calls=[];
 const api=mod.createTeamMealsApi('https://worker.example.invalid',{mode:'mock',token:()=>`token-${principal}`,
  fetch:async(url,init)=>{
   const u=new URL(url);calls.push({url:u,method:init.method});
   const custom=await options.respond?.(u,init,calls.length);
   if(custom) return custom;
   assert.equal(init.method,'GET','view-model must not write');
   const revision=u.searchParams.get('revision')??options.head??B;
   if(u.pathname.startsWith('/source/shopping-list/')) return options.list?json({content:options.list,commit:revision,blobSha:C}):error(404,'not_found');
   const inputs=revisions[revision];if(!inputs) return error(422,'revision_unavailable');
   if(u.pathname==='/catalog') return json({commit:revision,...inputs,suppliers:[],translations:{machine:0,human:0,stale:0}});
   if(u.pathname.startsWith('/source/plan/')) {
    const content=inputs.menuPlans[decodeURIComponent(u.pathname.split('/').at(-1))];
    return content?json({content,commit:revision,blobSha:A}):error(404,'not_found');
   }
   if(u.pathname==='/asset') return new Response(`image-${revision}`,{headers:{'Content-Type':'image/png','X-Source-Revision':revision}});
   throw new Error(`Unexpected request ${u}`);
  }});
 assert.equal(typeof mod.createTeamMealsViewModel,'function','C2a factory must exist');
 const vm=mod.createTeamMealsViewModel(api);
 after(()=>{vm.dispose();api.dispose();});
 return {api,vm,calls,changeAuth:()=>{principal='two';}};
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}

test('fixed Q boundary input uses one catalog and one unique plan, preserves every source and original JSON',async()=>{
 const input=fixture(), before=copy(input), {vm,calls}=setup({[A]:input});
 const view=await vm.loadSaved(request(A,[...selection,...selection]));
 assert.equal(view.kind,'saved');assert.equal(view.mode,'mock');assert.equal(view.sourceRevision,A);
 assert.deepEqual(ids(view.projection.collection),semantic.baseCandidateIds);
 for(const item of view.projection.collection.items) assert.deepEqual(item.sources.map(s=>[s.dishRef,s.mealIndex,s.componentIndex]),semantic.sourceAddresses[item.ingredientRef]);
 assert.deepEqual(view.projection.menuPlans,input.menuPlans);
 assert.deepEqual(view.projection.dishes['first-dish'],input.dishes['first-dish']);
 assert.equal(view.projection.collection.coverage.recipeCompleteness,'unverified');
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url.searchParams.get('revision')===A));
 assert.deepEqual(input,before);
});

test('v3 unknown values stay omitted, seasoning/missing package/base are still candidates and never partial estimates',async()=>{
 const input=fixture();input.menuPlans['team-week']=read(join(fixtures,'pending-a1/valid/menu-plan-v3.json'));
 input.dishes['first-dish'].schemaVersion='3';delete input.dishes['first-dish'].components[0].qty;
 const {vm}=setup({[A]:input});const view=await vm.loadSaved(request());
 assert.deepEqual(ids(view.projection.collection),semantic.baseCandidateIds);
 assert.equal(view.projection.collection.items.find(i=>i.ingredientRef==='tomato').sources[0].qty,undefined);
 assert.ok(view.projection.collection.items.every(i=>i.sources.every(s=>s.plannedServings===undefined)));
 assert.ok(view.estimate.items.every(i=>i.status==='unavailable'&&!Object.hasOwn(i,'lines')));
 const draft=mod.previewTeamMealsDraft({inputs:input,selection,at:AT});
 assert.equal(draft.kind,'draft');assert.equal('sourceRevision' in draft,false);assert.equal('basis' in draft,false);
 assert.deepEqual(draft.collection,view.projection.collection);
 assert.throws(()=>vm.createList('list',draft),{code:'invalid_view'});
});

test('saved handles reject nested edits, copies, forged values and another reader',async()=>{
 const {vm,api}=setup(), view=await vm.loadSaved(request());
 assert.throws(()=>{view.projection.menuPlans['team-week'].meals[0].plannedServings=1;},TypeError);
 for(const fake of [copy(view),{...view},null]) assert.throws(()=>vm.createList('list',fake),{code:'invalid_view'});
 const other=mod.createTeamMealsViewModel(api);after(()=>other.dispose());
 assert.throws(()=>other.createList('list',view),{code:'invalid_view'});
 const list=vm.createList('list',view);valid('shopping-list',list);
 list.items.pop();assert.deepEqual(ids(vm.createList('list',view)),semantic.baseCandidateIds);
});

test('missing material and opaque recipes remain visible; unresolved material cannot be confirmed',async()=>{
 const input=fixture();delete input.ingredients.salt;delete input.dishes['second-dish'];
 const {vm}=setup({[A]:input});const view=await vm.loadSaved(request());
 assert.ok(ids(view.projection.collection).includes('salt'));
 assert.deepEqual(view.projection.collection.coverage,{enumeration:'incomplete',references:'unresolved',recipeCompleteness:'unverified'});
 assert.ok(view.estimate.items.every(i=>i.status==='unavailable'));
 const list=vm.createList('list',view);
 for(const decision of ['buy','available']) assert.throws(()=>vm.decide(list,view,'salt',decision),{code:'unresolved_ingredient'});
 assert.equal(vm.decide(list,view,'salt','check').items.find(i=>i.ingredientRef==='salt').decision,'check');
});

test('empty saved plan is visible without a persistent basis; cancelled nonempty scope can yield an empty list',async()=>{
 const input=fixture();input.menuPlans['team-week']=read(join(fixtures,'pending-a1/valid/empty-menu-plan-v3.json'));
 const {vm}=setup({[A]:input});
 const view=await vm.loadSaved({...request(A,[]),emptyMenuPlanRefs:['team-week']});
 assert.deepEqual(view.projection.menuPlans['team-week'].meals,[]);
 assert.deepEqual(view.estimate,{items:[],budgetStatus:'not-applicable'});
 assert.throws(()=>vm.createList('list',view),{code:'invalid_selection'});
 const cancelled=await vm.loadSaved(request());assert.deepEqual(vm.createList('list',cancelled).items,[]);
 await assert.rejects(vm.loadSaved(request(A,[])),{code:'invalid_selection'});
 const {vm:nonempty}=setup();await assert.rejects(nonempty.loadSaved({...request(A,[]),emptyMenuPlanRefs:['team-week']}),{code:'invalid_selection'});
});

test('invalid and unreadable revisions, missing plan and denied catalog never fall back',async()=>{
 const {vm,calls}=setup();await assert.rejects(vm.loadSaved(request('main')),{code:'invalid_revision'});assert.equal(calls.length,0);
 await assert.rejects(vm.loadSaved(request(B)),{code:'revision_unavailable'});
 await assert.rejects(vm.loadSaved(request(A,[{...selection[0],menuPlanRef:'absent'}])),{code:'basis_unavailable'});
 assert.ok(calls.every(c=>c.url.searchParams.has('revision')));
 const {vm:denied}=setup(undefined,{respond:u=>u.pathname==='/catalog'?error(403,'forbidden'):undefined});
 await assert.rejects(denied.loadSaved(request()),{code:'forbidden'});
 const {vm:wrong}=setup(undefined,{respond:u=>u.pathname==='/catalog'?json({...fixture(),commit:B}):undefined});
 await assert.rejects(wrong.loadSaved(request()),{code:'revision_mismatch'});
});

test('list source commit and basis revision remain distinct; missing lists alone return null',async()=>{
 const list=read(join(fixtures,'pending-a1/valid/shopping-list-v1.json'));
 const {vm,calls}=setup(undefined,{list,head:B});const loaded=await vm.loadList('team-shop',{at:AT});
 assert.equal(loaded.source.commit,B);assert.equal(loaded.source.blobSha,C);assert.equal(loaded.basis.sourceRevision,A);
 assert.deepEqual(loaded.source.content,list);
 assert.ok(calls.filter(c=>!c.url.pathname.startsWith('/source/shopping-list/')).every(c=>c.url.searchParams.get('revision')===A));
 const {vm:empty}=setup();assert.equal(await empty.loadList('list',{at:AT}),null);
 const {vm:unavailable}=setup({}, {list});await assert.rejects(unavailable.loadList('team-shop',{at:AT}),{code:'revision_unavailable'});
});

test('manual decisions match their exact basis/candidates and never modify the saved inputs or original body',async()=>{
 const {vm}=setup({[A]:fixture(),[B]:fixture()});const view=await vm.loadSaved(request()),other=await vm.loadSaved(request(B));
 const list=vm.createList('list',view),before=copy(list);
 let result=vm.decide(list,view,'salt','buy',true);valid('shopping-list',result);
 assert.equal(result.items.find(i=>i.ingredientRef==='salt').bought,true);
 result=vm.decide(result,view,'salt','available');assert.equal('bought' in result.items.find(i=>i.ingredientRef==='salt'),false);
 assert.deepEqual(list,before);
 assert.throws(()=>vm.decide(list,other,'salt','buy'),{code:'basis_mismatch'});
 assert.throws(()=>vm.decide({...list,basis:{...list.basis,selection:[]}},view,'salt','buy'),{code:'basis_mismatch'});
 assert.throws(()=>vm.decide({...list,items:list.items.slice(1)},view,'salt','buy'),{code:'invalid_selection'});
 assert.throws(()=>vm.decide(list,view,'salt','available',false),{code:'invalid_decision'});
});

test('review reads old and next independently, uses Q expected decisions and preserves removed purchases',async()=>{
 const old=fixture(),next=copy(old);next.dishes['first-dish'].components[0].qty.value=301;
 const {vm,calls}=setup({[A]:old,[B]:next,[C]:{...old,menuPlans:{'team-week':read(join(fixtures,'pending-a1/valid/empty-menu-plan-v3.json'))}}});
 const a=await vm.loadSaved(request()),b=await vm.loadSaved(request(B));let list=vm.createList('team-shop',a);
 list=vm.decide(list,a,'tomato','buy',true);list=vm.decide(list,a,'salt','available');list=vm.decide(list,a,'cooking-oil','buy',true);
 const before=copy(list);const reviewed=await vm.reviewList(list,b,{at:AT,force:true});
 assert.deepEqual(reviewed.result.reviewRequired,['tomato']);
 assert.deepEqual(reviewed.result.list.items,read(join(fixtures,'pending-a1/valid/shopping-decisions-v1.json')).items);
 assert.deepEqual(list,before);valid('shopping-list',reviewed.result.list);
 const c=await vm.loadSaved(request(C)),removed=await vm.reviewList(list,c,{at:AT});
 assert.deepEqual(removed.result.list.items,[]);assert.deepEqual(removed.result.removed,list.items);
 assert.equal(removed.previous.sourceRevision,A);assert.equal(removed.next.sourceRevision,C);
 assert.ok(calls.every(c=>c.method==='GET'&&c.url.searchParams.has('revision')));
});

test('review presentation-only edits retain decisions and scope changes reset them',async()=>{
 const a=fixture(), b=copy(a);b.menuPlans['team-week'].meals.reverse();b.dishes['first-dish'].name.uk='Назва';b.dishes['first-dish'].components.reverse();b.ingredients.tomato.onHand=999;
 const {vm}=setup({[A]:a,[B]:b});const av=await vm.loadSaved(request());let list=vm.decide(vm.createList('list',av),av,'tomato','buy',true);
 const bv=await vm.loadSaved(request(B));const same=await vm.reviewList(list,bv,{at:AT});
 assert.deepEqual(same.result.list.items,list.items);assert.deepEqual(same.result.reviewRequired,[]);
 const wide=await vm.loadSaved(request(B,[...selection,{...selection[0],date:'2026-09-15'}]));
 const changed=await vm.reviewList(list,wide,{at:AT});assert.deepEqual(changed.result.reviewRequired,semantic.baseCandidateIds);
 assert.equal(changed.result.list.items.find(i=>i.ingredientRef==='tomato').previous.bought,true);
});

test('whole previous body and requests are captured before asynchronous reads',async()=>{
 const gate=deferred();let hold=false;const {vm}=setup({[A]:fixture(),[B]:fixture()},{respond:async()=>{if(hold)await gate.promise;}});
 const next=await vm.loadSaved(request(B)),first=await vm.loadSaved(request());let list=vm.createList('list',first);
 list=vm.decide(list,first,'tomato','buy',true);hold=true;
 const pending=vm.reviewList(list,next,{at:AT,force:true});list.items.find(i=>i.ingredientRef==='tomato').bought=false;
 gate.resolve();assert.equal((await pending).result.list.items.find(i=>i.ingredientRef==='tomato').bought,true);
 const gate2=deferred();const second=setup(undefined,{respond:async()=>{await gate2.promise;}});
 const req=request();const p=second.vm.loadSaved(req);req.revision=B;req.selection=[];gate2.resolve();
 const result=await p;assert.equal(result.sourceRevision,A);assert.deepEqual(result.projection.selection,selection);
});

test('formal core estimates satisfy every independent Q numerical oracle',async()=>{
 for(const scenario of oracle.scenarios) {
  const inputs=fixture('golden'),plan=inputs.menuPlans['week-41'];plan.meals[0].plannedServings=scenario.firstMealServings;
  if(scenario.onlyFirstMeal)plan.meals=plan.meals.slice(0,1);
  const scope=plan.meals.map(m=>({menuPlanRef:'week-41',date:m.date,mealType:m.mealType}));
  const {vm}=setup({[A]:inputs});const view=await vm.loadSaved(request(A,scope));assert.equal(view.estimate.budgetStatus,'complete');
  const lines=view.estimate.items.flatMap(i=>{assert.equal(i.status,'complete');return i.lines;});
  assert.deepEqual(lines.map(l=>l.ingredientRef).sort(),Object.keys(scenario.lines).sort());
  for(const {ingredientRef,line} of lines) {const expected=scenario.lines[ingredientRef];assert.equal(line.packs,expected.packs);assert.deepEqual(line.qty,expected.qty);assert.equal(line.amount.amount,expected.amount);}
  assert.equal(Number(lines.reduce((sum,l)=>sum+l.line.amount.amount,0).toFixed(2)),scenario.totalCNY);
 }
});

test('assets stay at the handle revision and authentication changes invalidate all handles',async()=>{
 const {vm,calls,changeAuth}=setup();const view=await vm.loadSaved(request());
 const asset=await vm.getAsset(view,{owner:'data/dishes/first-dish.json',pointer:'/image'});
 assert.equal(asset.sourceRevision,A);assert.equal(await asset.bytes.text(),`image-${A}`);
 assert.equal(calls.at(-1).url.searchParams.get('revision'),A);
 changeAuth();assert.throws(()=>vm.createList('list',view),{code:'session_changed'});
 await assert.rejects(vm.getAsset(view,{owner:'data/dishes/first-dish.json',pointer:'/image'}),{code:'session_changed'});
 await assert.rejects(vm.loadSaved(request()),{code:'session_changed'});
});

test('late reads after auth change or disposal are rejected, and disposal does not dispose the C1 API',async()=>{
 for(const event of ['auth','dispose']) {
  const gate=deferred(),{vm,api,changeAuth}=setup(undefined,{respond:async()=>{await gate.promise;}});
  const pending=vm.loadSaved(request());if(event==='auth')changeAuth();else vm.dispose();gate.resolve();
  await assert.rejects(pending,{code:'session_changed'});await assert.rejects(vm.loadSaved(request()),{code:'session_changed'});
  if(event==='dispose')assert.equal((await api.getPlan('team-week',{revision:A})).commit,A);
 }
});

test('unconfigured API cannot create saved handles, but explicit draft previews need no network',async()=>{
 const api=mod.createTeamMealsApi(''),vm=mod.createTeamMealsViewModel(api);after(()=>{vm.dispose();api.dispose();});
 await assert.rejects(vm.loadSaved(request()),{code:'worker_unconfigured'});
 const input=fixture(),before=copy(input);const draft=mod.previewTeamMealsDraft({inputs:input,selection,at:AT});
 assert.equal(draft.kind,'draft');assert.deepEqual(ids(draft.collection),semantic.baseCandidateIds);assert.deepEqual(input,before);
});

test('stored list duplicate, omitted and extra candidates fail before a page can use them',async()=>{
 const original=read(join(fixtures,'pending-a1/valid/shopping-list-v1.json'));
 const duplicate=copy(original);duplicate.items.push(copy(duplicate.items[0]));
 const omitted=copy(original);omitted.items.pop();
 const extra=copy(original);extra.items.push({ingredientRef:'unlisted',decision:'check'});
 for(const list of [duplicate,omitted,extra]) {
  valid('shopping-list',list);
  const {vm}=setup(undefined,{list});await assert.rejects(vm.loadList('team-shop',{at:AT}),{code:'invalid_selection'});
 }
 const {vm}=setup(undefined,{list:original});await assert.rejects(vm.loadList('wrong-id',{at:AT}),{code:'bad_response'});
});

test('multi-plan selection reads each plan once and retains repeated source counts without fake totals',async()=>{
 const input=fixture();input.menuPlans.second=copy(input.menuPlans['team-week']);
 const {vm,calls}=setup({[A]:input});const view=await vm.loadSaved(request(A,[...selection,{...selection[0],menuPlanRef:'second'}]));
 assert.equal(calls.length,3);
 for(const item of view.projection.collection.items) assert.equal(item.sources.length,semantic.sourceAddresses[item.ingredientRef].length*2);
 assert.ok(view.estimate.items.every(i=>i.status==='unavailable'&&i.reasons.some(r=>r.code==='multiple-plans')));
 assert.deepEqual(ids(vm.createList('list',view)),semantic.baseCandidateIds);
});

test('one unknown occurrence suppresses its whole ingredient estimate while preserving known source quantities',async()=>{
 const input=fixture('golden'),plan=input.menuPlans['week-41'];
 input.dishes.unknown={schemaVersion:'3',name:{en:'Unknown amount'},status:'active',baseServings:1,components:[{ingredientRef:'tomato'}]};
 plan.meals.push({...plan.meals[0],dishRef:'unknown'});
 const scope=plan.meals.map(m=>({menuPlanRef:'week-41',date:m.date,mealType:m.mealType}));
 const {vm}=setup({[A]:input});const view=await vm.loadSaved(request(A,scope));
 const estimate=view.estimate.items.find(i=>i.ingredientRef==='tomato');assert.equal(estimate.status,'unavailable');assert.equal('lines' in estimate,false);
 const sources=view.projection.collection.items.find(i=>i.ingredientRef==='tomato').sources;
 assert.ok(sources.some(s=>s.qty===undefined));assert.ok(sources.some(s=>s.qty?.value>0));
 assert.equal(view.estimate.budgetStatus,'incomplete');
});

test('old revision failures do not get replaced by the next revision during review',async()=>{
 const {vm,calls}=setup({[B]:fixture()});const next=await vm.loadSaved(request(B));
 const old=read(join(fixtures,'pending-a1/valid/shopping-list-v1.json'));
 await assert.rejects(vm.reviewList(old,next,{at:AT}),{code:'revision_unavailable'});
 assert.equal(calls.filter(c=>c.url.searchParams.get('revision')===B).length,2);
 assert.ok(calls.every(c=>c.url.searchParams.has('revision')));
});

test('golden dish and material metadata are preserved at the requested version without current detail reads',async()=>{
 const input=fixture('golden'),plan=input.menuPlans['week-41'];
 const scope=plan.meals.map(m=>({menuPlanRef:'week-41',date:m.date,mealType:m.mealType}));
 const {vm,calls}=setup({[A]:input});const view=await vm.loadSaved(request(A,scope));
 assert.deepEqual(view.projection.dishes,input.dishes);
 assert.deepEqual(Object.keys(view.projection.ingredients).sort(),['cooking-oil','egg','salt','scallion','tomato']);
 for(const [id,value] of Object.entries(view.projection.ingredients)) assert.deepEqual(value,input.ingredients[id]);
 assert.equal(calls.length,2);
});
