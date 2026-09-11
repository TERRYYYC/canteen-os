import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, after } from 'node:test';
const here=dirname(fileURLToPath(import.meta.url)), require=createRequire(import.meta.url);
const vr=createRequire(require.resolve('vite/package.json')), esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const bundle=await esbuild.build({entryPoints:[join(here,'../src/pages/admin/plan.ts')],bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""'},logLevel:'silent'});
const dir=await mkdtemp(join(tmpdir(),'team-pages-session-'));after(()=>rm(dir,{recursive:true,force:true}));
await writeFile(join(dir,'page.mjs'),bundle.outputFiles[0].text);
const module=await import(pathToFileURL(join(dir,'page.mjs')));
const A='a'.repeat(40),B='b'.repeat(40);
const plan={schemaVersion:'2',meals:[{date:'2026-10-05',mealType:'lunch',dishRef:'soup',plannedServings:200},{date:'2026-10-06',mealType:'dinner',dishRef:'soup',plannedServings:12}]};
const src=(content=plan,commit=A,blobSha='blob-a')=>({content,commit,blobSha});
const done=()=>({commit:B,blobSha:'blob-b',unchanged:false,warnings:[]});
function setup(save=async()=>done()){
 const writes=[],reads=[];let current=src();
 const api={mode:'mock',sessionKey:()=>0,getPlan:async(id,opts)=>{reads.push([id,opts]);return current;},getCatalog:async()=>({commit:A,dishes:{},ingredients:{},techniques:[],suppliers:[],translations:{}}),savePlan:async(...args)=>{writes.push(structuredClone(args));return save(...args);}};
 assert.equal(typeof module.createPlanForm,'function','the actual plan page must expose its C1 form adapter');
 return {form:module.createPlanForm(api),writes,reads,setCurrent:v=>{current=v;}};
}
test('page adapter saves complete plan, preserving true values and omitting cleared counts',async()=>{
 const {form,writes}=setup();await form.load('week-41');form.servings(0,'');await form.session.save();
 assert.equal(writes[0][1].schemaVersion,'3');assert.equal(Object.hasOwn(writes[0][1].meals[0],'plannedServings'),false);
 assert.equal(writes[0][1].meals[1].plannedServings,12);assert.deepEqual(writes[0][2],{ifMatch:'blob-a'});
});
test('page adapter retains edits through saving, language refresh and late acknowledgement',async()=>{
 let resolve;const {form,writes}=setup(()=>new Promise(r=>resolve=r));await form.load('week-41');form.servings(0,'220');
 const pending=form.session.save();form.session.refreshView();form.servings(0,'230');resolve(done());await pending;
 assert.equal(form.session.getState().phase,'dirty');assert.equal(form.session.getState().draft.meals[0].plannedServings,230);assert.equal(writes[0][1].meals[0].plannedServings,220);
});
test('unknown result survives leaving/returning; recovery reads twice and does not duplicate write',async()=>{
 const {form,writes,reads,setCurrent}=setup(async()=>{throw new TypeError('network');});await form.load('week-41');form.servings(0,'220');await form.session.save();
 form.detach();await form.load('week-41');assert.equal(form.session.getState().phase,'outcome-unknown');await form.session.save();assert.equal(writes.length,1);
 setCurrent(src(writes[0][1],B,'blob-b'));const n=reads.length;await form.session.reconcileUnknown();assert.equal(reads.length-n,2);assert.deepEqual(reads.at(-1)[1],{revision:B,force:true});assert.equal(writes.length,1);
});
test('empty new plan only follows not_found and uses creation lock',async()=>{
 const {form,writes,setCurrent}=setup();setCurrent(null);await form.load('week-new');form.add('2026-10-05','lunch','soup');form.remove(0);await form.session.save();
 assert.deepEqual(writes[0][1],{schemaVersion:'3',meals:[]});assert.deepEqual(writes[0][2],{ifNoneMatch:'*'});
});
test('invalid optional count is not silently converted to unknown or zero',async()=>{
 const {form,writes}=setup();await form.load('week-41');assert.throws(()=>form.servings(0,'0'));assert.throws(()=>form.servings(0,'2.5'));assert.equal(form.session.getState().draft.meals[0].plannedServings,200);assert.equal(writes.length,0);
});
