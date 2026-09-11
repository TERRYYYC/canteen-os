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
const bundle=await esbuild.build({stdin:{contents:await readFile(join(here,'../src/pages/admin/dish-new.ts'),'utf8')+'\nexport { ApiError };',resolveDir:join(here,'../src/pages/admin'),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""'},logLevel:'silent'});
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
function setup(save=async()=>({commit:B,blobSha:'blob-b',unchanged:false,warnings:[]})) {
 const writes=[],reads=[];let current=source(initial);
 const api={mode:'mock',sessionKey:()=>0,getDish:async(id,opts)=>{reads.push([id,opts]);return current;},saveDish:async(...args)=>{writes.push(['active',...structuredClone(args)]);return save(...args);},saveDishDraft:async(...args)=>{writes.push(['draft',...structuredClone(args)]);return save(...args);}};
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
 const {form,writes}=setup();await form.load('new',{zh:'新汤'});form.draft.id='new-soup';await form.save('active');
 assert.equal(writes[0][1],'new-soup');assert.equal(writes[0][2].status,'active');assert.equal(Object.hasOwn(writes[0][2],'baseServings'),false);assert.deepEqual(writes[0][3],{ifNoneMatch:'*'});
});
test('conflict retains edited draft and explicit adoption is required before a new write',async()=>{
 const {form,writes}=setup(async()=>{throw new page.ApiError(409,'conflict','');});await form.load('soup');form.draft.name.zh='我的汤';form.changed();await form.save('active');
 assert.equal(form.session.getState().phase,'conflict');assert.equal(form.draft.name.zh,'我的汤');await form.save('draft');assert.equal(writes.length,1);
 const remote={content:{...initial,name:{zh:'远端汤'}},commit:B,blobSha:'blob-b'};assert.equal(form.adopt(remote,true),true);await form.save('draft');assert.equal(writes[1][2].name.zh,'我的汤');assert.deepEqual(writes[1][3],{ifMatch:'blob-b'});
});
test('late read cannot open a different dish after detaching',async()=>{
 let resolve;const api={mode:'mock',sessionKey:()=>0,getDish:()=>new Promise(r=>resolve=r)};const form=page.createDishForm(api);
 const loading=form.load('soup');form.detach();resolve(source(initial));assert.equal(await loading,null);assert.equal(form.session.getState().phase,'closed');
});
