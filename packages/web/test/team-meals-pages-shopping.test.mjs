import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const web=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),root=join(web,'../..');
const fixtures=join(root,'test/fixtures/contracts'),read=p=>JSON.parse(readFileSync(p,'utf8'));
const semantic=read(join(fixtures,'semantic-expectations.json')),{a:A,b:B,c:C}=semantic.revisionTokens,AT=semantic.fixedAt;
const scope=[{menuPlanRef:'team-week',date:'2026-09-14',mealType:'lunch'}],request=(revision=A,selection=scope)=>({revision,selection,at:AT});
function fixture(){const p=join(fixtures,'valid/boundaries/data');const map=sub=>Object.fromEntries(readdirSync(join(p,sub)).filter(f=>f.endsWith('.json')).map(f=>[f.slice(0,-5),read(join(p,sub,f))]));return{menuPlans:map('menu-plans'),dishes:map('dishes'),ingredients:map('ingredients'),techniques:read(join(p,'techniques.json'))};}
const require=createRequire(import.meta.url),esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'team-pages-shopping-'));after(()=>rm(dir,{recursive:true,force:true}));
const exists=existsSync(join(web,'src/pages/purchase-form.ts'));
const bundle=await esbuild.build({stdin:{contents:`export * from './src/api/team-meals';${exists?"export * from './src/pages/purchase-form';":''}`,resolveDir:web},bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env.VITE_WORKER_URL':'""'},logLevel:'silent'});
await writeFile(join(dir,'form.mjs'),bundle.outputFiles[0].text);const mod=await import(pathToFileURL(join(dir,'form.mjs')));
const clone=x=>structuredClone(x),json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}}),error=(status,code)=>json({ok:false,errors:[{path:'',code,message:code}]},status);
function setup(){
 const old=fixture(),next=clone(old),empty=clone(old);next.dishes['first-dish'].components[0].qty.value=301;empty.menuPlans['team-week']={schemaVersion:'3',meals:[]};
 const revisions={[A]:old,[B]:next,[C]:empty},sources=new Map(),history=new Map(),calls=[],writes=[];let principal='one',behavior='normal',resolveHold=null,seq=0,readGate=null;
 const api=mod.createTeamMealsApi('https://worker.example.invalid',{mode:'mock',token:()=>`test-${principal}`,fetch:async(url,init)=>{
  const u=new URL(url),revision=u.searchParams.get('revision');calls.push({method:init.method,path:u.pathname,revision});
  if(init.method==='POST'){
   assert.ok(u.pathname.startsWith('/shopping-list/'),'controller writes only ShoppingList');const id=decodeURIComponent(u.pathname.split('/').at(-1)),body=JSON.parse(init.body),headers=new Headers(init.headers),prior=sources.get(id);writes.push({id,body:clone(body),ifMatch:headers.get('If-Match'),ifNoneMatch:headers.get('If-None-Match')});
   if(prior ? headers.get('If-Match')!==prior.blobSha : headers.get('If-None-Match')!=='*')return error(409,'conflict');
   if(!prior&&body.items.some(i=>i.decision!=='check'||Object.hasOwn(i,'bought')||Object.hasOwn(i,'previous')))return error(400,'invalid_selection');
   const effect=behavior;behavior='normal';if(effect==='conflict')return error(409,'conflict');
   const commit=(++seq).toString(16).padStart(40,'0'),source={content:clone(body),commit,blobSha:`blob-${seq}`};sources.set(id,source);history.set(id+':'+commit,clone(source));
   if(effect==='unknown')throw new TypeError('lost response');if(effect==='hold')await new Promise(r=>resolveHold=r);
   return json({...source,unchanged:false,warnings:[]});
  }
  if(u.pathname.startsWith('/source/shopping-list/')){const id=decodeURIComponent(u.pathname.split('/').at(-1)),source=revision?history.get(id+':'+revision):sources.get(id);return source?json(source):error(404,'not_found');}
  if(readGate&&revision===readGate.revision)await readGate.promise;
  const input=revisions[revision];if(!input)return error(422,'revision_unavailable');
  if(u.pathname==='/catalog')return json({commit:revision,...input,suppliers:[],translations:{machine:0,human:0,stale:0}});
  if(u.pathname.startsWith('/source/plan/')){const id=decodeURIComponent(u.pathname.split('/').at(-1)),content=input.menuPlans[id];return content?json({content,commit:revision,blobSha:'source-'+revision}):error(404,'not_found');}
  if(u.pathname==='/asset')return new Response('mock-image',{headers:{'Content-Type':'image/png','X-Source-Revision':revision}});
  throw new Error('Unexpected mock request');
 }});
 assert.equal(typeof mod.createPurchaseForm,'function','purchase page must expose its real C2+C1 controller');const form=mod.createPurchaseForm(api,{at:AT});
 after(()=>{form.dispose();api.dispose();});
 return{api,form,calls,writes,sources,history,revisions,mode:v=>behavior=v,release:()=>resolveHold?.(),changeAuth:()=>principal='two',holdRead:revision=>{let resolve;const promise=new Promise(r=>resolve=r);readGate={revision,promise};return()=>{readGate=null;resolve();};}};
}
const item=(list,id)=>list.items.find(x=>x.ingredientRef===id);
async function created(f){await f.create('team-shop',request());await f.save();}
test('creation must acknowledge exact all-check body before a separate conditional manual save',async()=>{
 const {form,writes}=setup();const basis=await form.create('team-shop',request());assert.equal(basis,form.basis);assert.equal(form.canDecide,false);
 assert.equal(form.decide('tomato','buy',true),false);assert.equal(writes.length,0);await form.save();
 assert.equal(writes.length,1);assert.equal(writes[0].ifNoneMatch,'*');assert.ok(writes[0].body.items.every(i=>i.decision==='check'&&!Object.hasOwn(i,'bought')));assert.equal(form.canDecide,true);
 assert.equal(form.decide('tomato','buy',true),true);assert.equal(writes.length,1);await form.save();assert.equal(writes[1].ifMatch,'blob-1');assert.equal(item(writes[1].body,'tomato').bought,true);assert.deepEqual(writes[1].body.basis,writes[0].body.basis);
});
test('creation in flight and unknown recovery keep decision barrier; source commit differs from basis',async()=>{
 const {form,writes,mode,calls}=setup();await form.create('team-shop',request());mode('unknown');await form.save();assert.equal(form.canDecide,false);assert.equal(form.decide('salt','available'),false);
 form.detach();await form.load('team-shop');assert.equal(form.session.getState().phase,'outcome-unknown');const n=calls.length;await form.reconcileUnknown();
 const reads=calls.slice(n).filter(c=>c.path==='/source/shopping-list/team-shop');assert.equal(reads.length,2);assert.equal(reads[0].revision,null);assert.equal(reads[1].revision,form.session.getState().source.commit);assert.equal(writes.length,1);assert.equal(form.canDecide,true);assert.notEqual(form.session.getState().source.commit,form.basis.sourceRevision);
});
test('rebase rejects dirty old document, then saves formal whole reset before manual reconfirmation',async()=>{
 const {form,writes}=setup();await created(form);form.decide('tomato','buy',true);assert.equal(await form.rebase(request(B)),null);assert.equal(form.basis.sourceRevision,A);
 await form.save();const reviewed=await form.rebase(request(B));assert.ok(reviewed);assert.equal(form.basis.sourceRevision,B);assert.equal(form.canDecide,false);assert.equal(form.decide('tomato','available'),false);
 const draft=form.session.getState().draft;assert.equal(item(draft,'tomato').decision,'check');assert.equal(item(draft,'tomato').previous.bought,true);assert.deepEqual(form.review.reviewRequired,['tomato']);
 await form.save();assert.equal(writes[2].ifMatch,'blob-2');assert.deepEqual(writes[2].body,draft);assert.equal(form.canDecide,true);form.decide('tomato','available');await form.save();assert.equal(writes[3].ifMatch,'blob-3');assert.equal(Object.hasOwn(item(writes[3].body,'tomato'),'previous'),false);
});
test('removed bought materials stay in review notice outside current empty list and survive return',async()=>{
 const {form}=setup();await created(form);form.decide('tomato','buy',true);await form.save();await form.rebase(request(C));
 assert.deepEqual(form.session.getState().draft.items,[]);assert.equal(item({items:form.review.removed},'tomato').bought,true);await form.save();form.detach();await form.load('team-shop');assert.deepEqual(form.session.getState().draft.items,[]);assert.equal(item({items:form.review.removed},'tomato').bought,true);
});
test('save in flight survives language refresh while later same-basis decisions remain dirty',async()=>{
 const {form,mode,release,writes}=setup();await created(form);form.decide('tomato','buy');mode('hold');const pending=form.save();
 // Manual controls stay blocked for an unresolved write; after its ACK they may be edited.
 form.refresh();assert.equal(form.canDecide,false);assert.equal(form.decide('salt','available'),false);release();await pending;assert.equal(form.canDecide,true);form.decide('salt','available');assert.equal(form.session.getState().dirty,true);assert.equal(item(writes.at(-1).body,'salt').decision,'check');
});
test('unknown rebase does not permit confirmations until pinned reconciliation confirms reset body',async()=>{
 const {form,mode,writes}=setup();await created(form);await form.rebase(request(B));mode('unknown');await form.save();assert.equal(form.canDecide,false);form.detach();await form.load('team-shop');assert.equal(form.basis.sourceRevision,B);assert.equal(form.decide('tomato','buy'),false);await form.reconcileUnknown();assert.equal(form.canDecide,true);assert.equal(writes.length,2);
});
test('same-basis conflict preserves local draft and adopts only the compared remote source lock',async()=>{
 const {form,mode,sources,history,writes}=setup();await created(form);form.decide('tomato','buy',true);const server=clone(sources.get('team-shop'));server.commit='d'.repeat(40);server.blobSha='remote-lock';item(server.content,'salt').decision='available';sources.set('team-shop',server);history.set('team-shop:'+server.commit,server);mode('conflict');await form.save();
 const local=form.session.getState().draft;assert.equal(form.session.getState().phase,'conflict');const remote=await form.compareRemote();await form.adoptRemote(remote,'keep-local');assert.deepEqual(form.session.getState().draft,local);await form.save();assert.equal(writes.at(-1).ifMatch,'remote-lock');
});
test('fixed basis assets do not use list storage commit; auth changes invalidate handle and late loads',async()=>{
 const {form,calls,changeAuth}=setup();await created(form);const asset=await form.getAsset('data/dishes/first-dish.json','/image');assert.equal(asset.sourceRevision,A);assert.equal(calls.at(-1).revision,A);changeAuth();assert.throws(()=>form.basis,{code:'session_changed'});await assert.rejects(form.load('team-shop'),{code:'session_changed'});
});
test('different-basis conflict keeps desired scope but re-reviews remote decisions before any new confirmation',async()=>{
 const {form,sources,history,writes}=setup();await created(form);form.decide('tomato','buy',true);await form.save();await form.rebase(request(B));
 const remote={content:{shoppingListVersion:'1',id:'team-shop',basis:{sourceRevision:C,selection:scope},items:[]},commit:'e'.repeat(40),blobSha:'remote-empty'};sources.set('team-shop',remote);history.set('team-shop:'+remote.commit,remote);await form.save();
 const conflict=await form.compareRemote();assert.equal(await form.adoptRemote(conflict,'keep-local'),true);assert.equal(form.basis.sourceRevision,B);assert.equal(form.canDecide,false);assert.ok(form.session.getState().draft.items.every(i=>i.decision==='check'&&!Object.hasOwn(i,'bought')));
 await form.save();assert.equal(writes.at(-1).ifMatch,'remote-empty');assert.equal(form.canDecide,true);
});
test('unknown rebase with original source intact unlocks only retrying its reset, not manual decisions',async()=>{
 const {form,sources,mode,writes}=setup();await created(form);const original=clone(sources.get('team-shop'));await form.rebase(request(B));mode('unknown');await form.save();sources.set('team-shop',original);
 const result=await form.reconcileUnknown();assert.equal(result.status,'not-saved');assert.equal(form.canDecide,false);assert.equal(form.session.getState().dirty,true);assert.equal(form.decide('salt','buy'),false);await form.save();assert.equal(writes.at(-1).ifMatch,original.blobSha);assert.equal(form.canDecide,true);
});
test('comparison payload cannot substitute another source lock or cloned basis, and adopting remote clears local decisions',async()=>{
 const {form,sources,history,writes}=setup();await created(form);form.decide('tomato','buy',true);const source=clone(sources.get('team-shop'));source.commit='f'.repeat(40);source.blobSha='verified-lock';sources.set('team-shop',source);history.set('team-shop:'+source.commit,source);await form.save();
 const remote=await form.compareRemote();assert.equal(await form.adoptRemote(clone(remote),'remote'),false);remote.source.blobSha='forged-lock';assert.equal(await form.adoptRemote(remote,'remote'),true);assert.equal(form.session.getState().source.blobSha,'verified-lock');assert.equal(item(form.session.getState().draft,'tomato').decision,'check');assert.equal(writes.length,2);
});
test('unresolved offscreen write prevents disposal and retains its recovery handle',async()=>{
 const {form,mode}=setup();await form.create('team-shop',request());mode('unknown');await form.save();form.detach();assert.equal(form.dispose(),false);await form.load('team-shop');assert.equal(form.basis.sourceRevision,A);await form.reconcileUnknown();assert.equal(form.dispose(),true);
});
test('a fresh controller loads acknowledged list storage and original basis separately',async()=>{
 const {form,api}=setup();await created(form);form.decide('salt','available');await form.save();const other=mod.createPurchaseForm(api,{at:AT});after(()=>other.dispose());await other.load('team-shop');assert.equal(other.canDecide,true);assert.equal(other.basis.sourceRevision,A);assert.equal(item(other.session.getState().draft,'salt').decision,'available');assert.equal(other.review,null);
});

test('later decisions invalidate a pending rebase and retain the original matching basis',async()=>{
 const {form,holdRead}=setup();await created(form);const release=holdRead(B),pending=form.rebase(request(B));
 assert.equal(form.decide('salt','available'),true);release();assert.equal(await pending,null);assert.equal(form.basis.sourceRevision,A);assert.equal(item(form.session.getState().draft,'salt').decision,'available');
});
test('a detached pending load cannot reopen a list after the user leaves',async()=>{
 const {form,api,holdRead}=setup();await created(form);const other=mod.createPurchaseForm(api,{at:AT});after(()=>other.dispose());const release=holdRead(A),pending=other.load('team-shop');other.detach();release();assert.equal(await pending,null);assert.equal(other.session.getState().phase,'closed');
});
