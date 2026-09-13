import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, after } from 'node:test';
const here=dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const vr=createRequire(require.resolve('vite/package.json'));
const esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const bundle=await esbuild.build({stdin:{contents:await readFile(join(here,'../src/pages/admin/dish-new.ts'),'utf8')+'\nexport { ApiError, createIngredientDraft };\nexport {createTeamMealsApi} from "../../api/team-meals";\nexport {clearToken as changeAuth} from "../../admin/token";\nexport {inspectReloadSafety} from "../../view-models/reload-safety";',resolveDir:join(here,'../src/pages/admin'),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""'},logLevel:'silent'});
const dir=await mkdtemp(join(tmpdir(),'team-pages-dish-'));
after(()=>rm(dir,{recursive:true,force:true}));
await writeFile(join(dir,'dish.mjs'),bundle.outputFiles[0].text);
const {createDishDraft,draftFromDish,draftToDish}=await import(pathToFileURL(join(dir,'dish.mjs')));
const image={src:'data/dishes/soup/images/a.jpg',license:'CC BY 4.0',author:'Author',sourceUrl:'https://example.org/a'};
test('new dish omits unknown servings instead of defaulting to 50',()=>{
 const dish=draftToDish(createDishDraft({zh:'汤'}));
 assert.equal(dish.schemaVersion,'3');
 assert.equal(Object.hasOwn(dish,'baseServings'),false);
});
test('v3 unknown qty remains omitted and all source metadata survives an edit',()=>{
 const dish={schemaVersion:'3',name:{zh:'汤',en:'Soup',uk:'Суп'},image,components:[{ingredientRef:'salt',prep:{techniqueRef:'mix',image},confidence:{value:0.8,source:'video'}}],steps:[{text:{zh:'煮'},image,clip:{videoUrl:'https://example.org/watch',start:2,end:4}}],provenance:{source:'video',videoUrl:'https://example.org/watch'},status:'draft'};
 const d=draftFromDish(dish,'soup','b'.repeat(40)); d.name.zh='新汤';
 assert.deepEqual(draftToDish(d),{...dish,name:{...dish.name,zh:'新汤'}});
});
test('v2 true quantities, to-taste and servings survive explicit v3 edit',()=>{
 const dish={schemaVersion:'2',name:{zh:'汤'},baseServings:7,components:[{ingredientRef:'water',qty:{value:850,unit:'ml'}},{ingredientRef:'salt',qty:{unit:'to-taste'}}],status:'active'};
 const out=draftToDish(draftFromDish(dish,'soup','b'.repeat(40)));
 assert.deepEqual(out,{...dish,schemaVersion:'3'});
});
const page=await import(pathToFileURL(join(dir,'dish.mjs')));
const A='a'.repeat(40), B='b'.repeat(40);
const source=content=>({content,commit:A,blobSha:'blob-a'});
const initial={schemaVersion:'3',name:{zh:'汤'},components:[{ingredientRef:'salt'}],status:'active'};
function setup(save=async()=>({commit:B,blobSha:'blob-b',unchanged:false,warnings:[]}),mode='mock') {
 const writes=[],reads=[];let current=source(initial);
 const api={mode,sessionKey:()=>0,peekSessionKey:()=>0,getDish:async(id,opts)=>{reads.push([id,opts]);return current;},saveDish:async(...args)=>{writes.push(['active',...structuredClone(args)]);return save(...args);},saveDishDraft:async(...args)=>{writes.push(['draft',...structuredClone(args)]);return save(...args);}};
 assert.equal(typeof page.createDishForm,'function','dish page must expose the C1 form adapter actually used by render');
 return {form:page.createDishForm(api),writes,reads,setCurrent:v=>current=v};
}
test('draft action submits exact draft body under source lock through C1',async()=>{
 const {form,writes}=setup();await form.load('soup');await form.save('draft');
 assert.equal(writes[0][0],'draft');assert.deepEqual(writes[0][2],{...initial,status:'draft'});assert.deepEqual(writes[0][3],{ifMatch:'blob-a'});
});
test('late save and language refresh preserve later form edits',async()=>{
 let resolve;const {form,writes}=setup(()=>new Promise(r=>resolve=r));await form.load('soup');
 const saving=form.save('draft');form.refresh();form.draft.name.zh='新汤';form.changed();
 resolve({commit:B,blobSha:'blob-b',unchanged:false,warnings:[]});await saving;
 assert.equal(form.session.getState().phase,'dirty');assert.equal(form.session.getState().draft.name.zh,'新汤');assert.equal(writes[0][2].name.zh,'汤');
});
test('unknown result survives detach/return and recovery force-reads pinned source twice',async()=>{
 const {form,writes,reads,setCurrent}=setup(async()=>{throw new TypeError('network');});await form.load('soup');await form.save('draft');form.detach();await form.load('soup');
 assert.equal(form.session.getState().phase,'outcome-unknown');await form.save('draft');assert.equal(writes.length,1);
 setCurrent({content:writes[0][2],commit:B,blobSha:'blob-b'});const n=reads.length;await form.session.reconcileUnknown();
 assert.equal(reads.length-n,2);assert.deepEqual(reads.at(-1)[1],{revision:B,force:true});assert.equal(writes.length,1);
});

test('legal to-taste source value survives an unrelated edit',()=>{
 const dish={schemaVersion:'3',name:{zh:'盐'},components:[{ingredientRef:'salt',qty:{value:2,unit:'to-taste'}}]};
 assert.deepEqual(draftToDish(draftFromDish(dish,'salt','blob-a')),dish);
});
test('new dish creates with if-none-match and optional fields remain absent',async()=>{
 const {form,writes}=setup();await form.load('new',{zh:'新汤'});
 assert.equal(form.draft.dirty,true,'a handed-off name is real user input');assert.equal(form.session.getState().dirty,true);
 form.detach();await form.load('new');assert.equal(form.draft.name.zh,'新汤');assert.equal(form.draft.dirty,true);
 form.draft.id='new-soup';await form.save('active');
 assert.equal(writes[0][1],'new-soup');assert.equal(writes[0][2].status,'active');assert.equal(Object.hasOwn(writes[0][2],'baseServings'),false);assert.deepEqual(writes[0][3],{ifNoneMatch:'*'});
});
test('conflict retains edited draft and explicit adoption is required before a new write',async()=>{
 const {form,writes}=setup(async()=>{throw new page.ApiError(409,'conflict','');});await form.load('soup');form.draft.name.zh='我的汤';form.changed();await form.save('active');
 assert.equal(form.session.getState().phase,'conflict');assert.equal(form.draft.name.zh,'我的汤');await form.save('draft');assert.equal(writes.length,1);
 const remote={content:{...initial,name:{zh:'远端汤'}},commit:B,blobSha:'blob-b'};assert.equal(form.adopt(remote,true),true);await form.save('draft');assert.equal(writes[1][2].name.zh,'我的汤');assert.deepEqual(writes[1][3],{ifMatch:'blob-b'});
});
test('late read cannot open a different dish after detaching',async()=>{
 let resolve;const api={mode:'mock',sessionKey:()=>0,peekSessionKey:()=>0,getDish:()=>new Promise(r=>resolve=r)};const form=page.createDishForm(api);
 const loading=form.load('soup');form.detach();resolve(source(initial));assert.equal(await loading,null);assert.equal(form.session.getState().phase,'closed');
});

test('review: add-another on an existing dish must not orphan an unresolved new dish',async()=>{
 let call=0;const {form}=setup(async()=>{if(++call===1)throw new TypeError('lost');return {commit:B,blobSha:'blob-b',unchanged:false,warnings:[]};});
 await form.load('new');form.draft.id='new-soup';form.draft.name.zh='尚未核实的新汤';await form.save('draft');
 assert.equal(form.session.getState().phase,'outcome-unknown');
 await form.load('soup');await form.save('draft');assert.equal(form.session.getState().phase,'saved-but-unpublished');
 const allowed=form.newDocument();await form.load('new');
 assert.equal(form.session.getState().phase,'outcome-unknown',JSON.stringify({allowed,phase:form.session.getState().phase,id:form.draft.id}));
});

test('review: pending image still requires dirty warning after language refresh',async()=>{
 const {form}=setup();await form.load('soup');form.draft.pending={blob:new Blob(['test'],{type:'image/png'}),width:1,height:1,previewUrl:'blob:review',license:'own',author:'',sourceUrl:''};form.changed();
 assert.equal(form.draft.dirty,true);form.refresh();assert.equal(form.draft.dirty,true,'pending photo must keep raw form dirty across presentation refresh');
});


const pendingPhoto = () => ({blob:new Blob(['local photo'],{type:'image/png'}),width:1,height:1,previewUrl:'blob:local-fixture',license:'own',author:'Original author',sourceUrl:''});
const uploadedPhoto = {src:'data/dishes/soup/images/local-fixture.png',license:'own',author:'Original author'};
test('review: upload ownership survives refresh and submits its original snapshot without erasing later edits',async()=>{
 const {form,writes}=setup(undefined,'real');await form.load('soup');form.draft.pending=pendingPhoto();form.changed();
 let release;const uploads=[];const aux={uploadImage:async(...args)=>{uploads.push(args);await new Promise(r=>release=r);return uploadedPhoto;}};
 const generation=form.readAuxiliary().generation;const saving=form.save('draft',aux);
 assert.equal(form.busy,true);assert.equal(form.readAuxiliary().phase,'busy');assert(form.readAuxiliary().generation>generation);
 form.refresh();form.draft.name.zh='在上传时新改的汤';form.changed();await form.save('draft',aux);assert.equal(uploads.length,1);
 release();await saving;
 assert.equal(form.busy,false);assert.equal(writes.length,1);assert.equal(writes[0][2].name.zh,'汤');assert.deepEqual(writes[0][2].image,uploadedPhoto);
 assert.equal(form.draft.name.zh,'在上传时新改的汤');assert.equal(form.draft.pending,null);assert.equal(form.draft.dirty,true);assert.equal(form.session.getState().phase,'dirty');
});

test('review: photo metadata changed during upload remains a pending edit instead of adopting stale attribution',async()=>{
 const {form,writes}=setup(undefined,'real');await form.load('soup');const pending=pendingPhoto();form.draft.pending=pending;form.changed();
 let release;const uploads=[];const aux={uploadImage:async(...args)=>{uploads.push(args);await new Promise(r=>release=r);return uploadedPhoto;}};
 const saving=form.save('draft',aux);pending.author='Later author';form.changed();form.refresh();release();await saving;
 assert.equal(uploads[0][3].author,'Original author');assert.equal(writes[0][2].image.author,'Original author');
 assert.equal(form.draft.pending,pending);assert.equal(form.draft.pending.author,'Later author');assert.equal(form.draft.dirty,true);assert.equal(form.readAuxiliary().dirty,true);
});

test('review: detached photo completion stays with its original dish and does not upload again on return',async()=>{
 const {form,writes}=setup(undefined,'real');await form.load('soup');form.draft.pending=pendingPhoto();form.changed();
 let release;let uploads=0;const aux={uploadImage:async()=>{uploads++;await new Promise(r=>release=r);return uploadedPhoto;}};
 const saving=form.save('draft',aux);form.detach();await form.load('another-soup');release();await saving;
 assert.equal(form.draft.image,null);assert.equal(writes.length,0,'auxiliary completion cannot save C1’s different active document');
 await form.load('soup');assert.deepEqual(form.draft.image,uploadedPhoto);assert.equal(form.draft.pending,null);assert.equal(form.draft.dirty,true);
 await form.save('draft',aux);assert.equal(uploads,1);assert.equal(writes.length,1);assert.equal(writes[0][1],'soup');assert.deepEqual(writes[0][2].image,uploadedPhoto);
});

test('review: raw inline ingredient and auxiliary ownership survive refresh and navigation',async()=>{
 const {form}=setup();await form.load('soup');const raw=page.createIngredientDraft({zh:'原始食材草稿'});form.draft.components[0].newIngredient=raw;form.changed();
 form.refresh();assert.equal(form.draft.dirty,true);assert.equal(form.readAuxiliary().dirty,true);
 const operation=form.beginAuxiliary('ingredient-1');assert(operation);form.refresh();assert.equal(form.beginAuxiliary('ingredient-1'),null);
 form.detach();await form.load('other');assert.equal(form.busy,false);await form.load('soup');assert.equal(form.busy,true);assert.equal(form.draft.components[0].newIngredient,raw);
 const generation=form.readAuxiliary().generation;operation.finish();assert.equal(form.readAuxiliary().phase,'idle');assert(form.readAuxiliary().generation>generation);assert.equal(form.draft.dirty,true);
});

test('review: unknown auxiliary outcomes remain protected across route changes and reject duplicate writes',async()=>{
 const {form,writes}=setup(undefined,'real');await form.load('new',{zh:'图片草稿'});form.draft.id='photo-soup';form.draft.pending=pendingPhoto();form.changed();
 let uploads=0;const aux={uploadImage:async()=>{uploads++;throw new TypeError('lost upload reply');}};
 await assert.rejects(form.save('draft',aux));assert.equal(form.readAuxiliary().phase,'unknown');
 form.refresh();await form.save('draft',aux);assert.equal(uploads,1);assert.equal(writes.length,0);assert.equal(form.newDocument(),false);
 await form.load('soup');await form.save('draft');assert.equal(form.newDocument(),true);await form.load('new');
 assert.equal(form.draft.id,'photo-soup');assert.equal(form.readAuxiliary().phase,'unknown');assert.equal(form.readAuxiliary().dirty,true);
});


let auxiliarySerial=0;
async function auxiliarySetup({getDish,save}={}) {
 const p=await import(`${pathToFileURL(join(dir,'dish.mjs'))}?auxiliary=${++auxiliarySerial}`);let identity=0;const writes=[];
 const api=p.createTeamMealsApi('https://dish-auxiliary.local.invalid',{token:()=> 'explicit-local-fixture',identity:()=>identity,fetch:async(url,init)=>{
  const path=new URL(url).pathname;if(init.method==='GET')return Response.json(await(getDish?.()??source(initial)));
  writes.push(JSON.parse(init.body));return Response.json(await(save?.()??{commit:B,blobSha:'blob-b',unchanged:false,warnings:[]}));
 }});
 return{p,api,form:p.createDishForm(api),writes,auth(){identity++;p.changeAuth();},cleanup(){api.dispose();}};
}
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('Dish source loading is registered before its first await and canceled read ends only its own ticket',async()=>{
 const hold=gate(),s=await auxiliarySetup({getDish:()=>hold.promise});try{const loading=s.form.load('soup');assert.equal(s.p.inspectReloadSafety().reason,'saving');s.form.detach();hold.resolve(source(initial));await loading;assert.equal(s.p.inspectReloadSafety().reason,'clear');}finally{hold.resolve(source(initial));s.cleanup();}
});
test('Dish raw and processing owners remain registered across detach and return',async()=>{
 const s=await auxiliarySetup();try{await s.form.load('soup');s.form.draft.pending=pendingPhoto();s.form.changed();assert.ok(s.p.inspectReloadSafety().records.some(r=>r.ownerId.startsWith('auxiliary-')&&r.dirty));const operation=s.form.beginAuxiliary('photo','processing');assert.equal(s.p.inspectReloadSafety().reason,'saving');s.form.detach();await s.form.load('other');assert.equal(s.p.inspectReloadSafety().reason,'saving');operation.finish();assert.equal(s.p.inspectReloadSafety().reason,'dirty');await s.form.load('soup');assert.ok(s.form.draft.pending);}finally{s.cleanup();}
});
test('Dish C1 save is protected once and does not create an auxiliary write ticket',async()=>{
 const hold=gate(),s=await auxiliarySetup({save:()=>hold.promise});try{await s.form.load('soup');const saving=s.form.save('draft');await new Promise(r=>setImmediate(r));const snapshot=s.p.inspectReloadSafety();assert.equal(snapshot.reason,'saving');assert.ok(snapshot.records.some(r=>r.ownerId.startsWith('auxiliary-')&&r.phase==='idle'),'raw owner registered without duplicate C1 saving phase');assert.equal(snapshot.records.filter(r=>r.pending||r.phase==='saving'||r.phase==='busy').length,1);hold.resolve({commit:B,blobSha:'blob-b',unchanged:false,warnings:[]});await saving;assert.equal(s.p.inspectReloadSafety().reason,'clear');}finally{hold.resolve({commit:B,blobSha:'blob-b',unchanged:false,warnings:[]});s.cleanup();}
});
test('Dish unknown upload remains an original anonymous operation after auth and cannot save B',async()=>{
 const hold=gate(),s=await auxiliarySetup();try{await s.form.load('soup');s.form.draft.pending=pendingPhoto();s.form.changed();const saving=s.form.save('draft',{uploadImage:()=>hold.promise});assert.equal(s.p.inspectReloadSafety().reason,'saving');s.auth();const b=s.p.createDishForm(s.api);await b.load('soup');assert.equal(s.p.inspectReloadSafety().reason,'unknown');hold.reject(new s.p.ApiError(0,'session_changed','hidden ACK'));await assert.rejects(saving);assert.equal(s.p.inspectReloadSafety().reason,'unknown');assert.ok(s.p.inspectReloadSafety().records.some(r=>r.id==='previous-session-operation'&&r.phase==='unknown'));assert.equal(s.writes.length,0);assert.equal(b.draft.pending,null);}finally{hold.resolve(uploadedPhoto);s.cleanup();}
});


test('Dish parallel old read tasks remain anonymous until both actual results finish',async()=>{
 const one=gate(),two=gate(),s=await auxiliarySetup();try{await s.form.load('soup');const first=s.form.read(()=>one.promise),second=s.form.read(()=>two.promise);assert.equal(s.p.inspectReloadSafety().reason,'saving');s.auth();const b=s.p.createDishForm(s.api);await b.load('soup');b.draft.pending=pendingPhoto();b.changed();assert.equal(s.p.inspectReloadSafety().reason,'unknown');one.resolve(1);await first;assert.equal(s.p.inspectReloadSafety().reason,'unknown');two.resolve(2);await second;assert.equal(s.p.inspectReloadSafety().reason,'dirty');assert.ok(b.draft.pending);}finally{one.resolve(1);two.resolve(2);s.cleanup();}
});
test('Dish overlapping cached Source tasks share one registered owner and finish both render responsibilities',async()=>{
 const held=gate();let count=0;const s=await auxiliarySetup({getDish:()=>{count++;return held.promise;}});try{const a=s.form.load('soup');s.form.detach();const b=s.form.load('soup');assert.equal(s.p.inspectReloadSafety().records.filter(r=>r.ownerId.startsWith('auxiliary-')).length,1);assert.equal(s.p.inspectReloadSafety().reason,'saving');held.resolve(source(initial));assert.equal(await a,null);await b;assert.equal(count,1,'real TeamMealsApi coalesces the same source request');assert.equal(s.p.inspectReloadSafety().reason,'clear');assert.equal(s.form.draft.name.zh,'汤');}finally{held.resolve(source(initial));s.cleanup();}
});
test('Dish upload recognized rejection ends its ticket but malformed or unrecognized responses remain unknown',async()=>{
 for(const outcome of ['known','unrecognized','malformed']){const s=await auxiliarySetup();try{await s.form.load('soup');s.form.draft.pending=pendingPhoto();s.form.changed();await assert.rejects(s.form.save('draft',{uploadImage:async()=>{if(outcome==='known')throw new s.p.ApiError(409,'conflict','rejected');if(outcome==='unrecognized')throw new s.p.ApiError(409,'unknown_error','conflict-looking');return{};}}));assert.equal(s.p.inspectReloadSafety().reason,outcome==='known'?'dirty':'unknown');assert.equal(s.form.auxiliaryUnknown,outcome!=='known');assert.equal(s.writes.length,0);}finally{s.cleanup();}}
});
test('inline Ingredient upload and save wrappers use separate tickets and exact result evidence',async()=>{
 const s=await auxiliarySetup(),held=gate();try{await s.form.load('soup');const api=s.form.auxiliaryApi({uploadImage:async()=>uploadedPhoto,saveIngredient:()=>held.promise});await api.uploadImage('ingredients','local',new Blob(['photo']),{license:'own'});assert.equal(s.p.inspectReloadSafety().reason,'clear');const saving=api.saveIngredient('local',{schemaVersion:'2',name:{zh:'本地'},baseUnit:'g',trackStock:false});assert.equal(s.p.inspectReloadSafety().reason,'saving');held.resolve({commit:B,blobSha:'inline-b',unchanged:false,warnings:[]});await saving;assert.equal(s.p.inspectReloadSafety().reason,'clear');}finally{held.resolve({commit:B,blobSha:'inline-b',unchanged:false,warnings:[]});s.cleanup();}
});
test('inline unknown write cannot be cleared by ending its UI task or by an unrelated read',async()=>{
 const s=await auxiliarySetup();try{await s.form.load('soup');const operation=s.form.beginAuxiliary('inline','saving','none'),api=s.form.auxiliaryApi({uploadImage:async()=>uploadedPhoto,saveIngredient:async()=>{throw new TypeError('lost ACK');}});await assert.rejects(api.saveIngredient('local',{}));operation.finish();assert.equal(s.p.inspectReloadSafety().reason,'unknown');await s.form.read(async()=>source(initial));assert.equal(s.p.inspectReloadSafety().reason,'unknown');assert.equal(s.form.auxiliaryUnknown,true);}finally{s.cleanup();}
});
test('captured inline API cannot dispatch a save after an old visible upload ACK under B',async()=>{
 const s=await auxiliarySetup(),held=gate();let saves=0;try{await s.form.load('soup');const api=s.form.auxiliaryApi({uploadImage:()=>held.promise,saveIngredient:async()=>{saves++;return{commit:B,blobSha:'b',unchanged:false,warnings:[]};}});const upload=api.uploadImage('ingredients','local',new Blob(['photo']),{license:'own'});s.auth();const b=s.p.createDishForm(s.api);await b.load('soup');assert.equal(s.p.inspectReloadSafety().reason,'unknown');held.resolve(uploadedPhoto);await upload;assert.equal(s.p.inspectReloadSafety().reason,'clear');await assert.rejects(api.saveIngredient('local',{}),e=>e.code==='session_changed');assert.equal(saves,0);assert.equal(s.p.inspectReloadSafety().reason,'clear');}finally{held.resolve(uploadedPhoto);s.cleanup();}
});
test('old and new raw registration snapshots never observe credentials or return private old IDs',async()=>{
 const s=await auxiliarySetup();try{await s.form.load('private-old-dish');s.form.draft.pending=pendingPhoto();s.form.changed();let calls=0;const original=s.api.sessionKey.bind(s.api);s.api.sessionKey=()=>{calls++;return original();};const before=s.p.inspectReloadSafety();for(let n=0;n<4;n++)assert.deepEqual(s.p.inspectReloadSafety(),before);assert.equal(calls,0);s.auth();const b=s.p.createDishForm(s.api);await b.load('public-new-dish');calls=0;const changed=s.p.inspectReloadSafety();assert.equal(calls,0);assert.equal(JSON.stringify(changed).includes('private-old-dish'),false);assert.equal(changed.reason,'clear');}finally{s.cleanup();}
});
