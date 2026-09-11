import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './team-meals-pages-guard-harness.mjs';
for (const page of ['ingredient','dish']) test(`reviewer: ${page} deferred legacy load must not dispatch a new write after leaving`,async()=>{
 const h=await setup(),gate=h.holdModule('legacy');const sent=[];
 try{
  await h.mount(page);h.legacy.uploadImage=async(...args)=>{sent.push(['upload',args[1]]);return {src:'data/local.png',license:'own'};};
  if(page==='ingredient'){
   const prior=h.legacy.saveIngredient.bind(h.legacy);h.legacy.saveIngredient=async(...args)=>{sent.push(['ingredient',args[0]]);return prior(...args);};
   h.input('#adm-ing-name-zh','A raw');h.el.querySelector('form').dispatchEvent({type:'submit',preventDefault(){}});
  }else{
   const owner=h.m.inspectDishOwner();owner.draft.pending={blob:new Blob(['local'],{type:'image/png'}),width:1,height:1,previewUrl:'blob:review',license:'own',author:'',sourceUrl:''};owner.changed();h.el.querySelector('.adm-dish-save-draft').click();
  }
  await h.flush();assert.equal(h.m.inspectReloadSafety().reason,'saving');assert.deepEqual(sent,[]);
  h.home();gate.resolve();await h.flush();
  assert.deepEqual(sent,[],'A deferred module must not begin transport after its page leaves (INV-B5)');
 }finally{gate.resolve();await h.flush();h.cleanup();}
});
function inline(h,seed='First') {h.click('Add an ingredient');h.input('.adm-dish-search input',seed);h.el.querySelector('.adm-dish-result-new').click();}
test('reviewer: inline cancellation before code arrival settles original read and does not translate',async()=>{
 const h=await setup(),gate=h.holdModule('inline');let calls=0;h.legacy.translate=async()=>{calls++;return {en:'Unexpected'};};
 try{await h.mount('dish');inline(h);const o=h.m.inspectDishOwner(),row=o.draft.components.at(-1);h.el.querySelector('.adm-dish-inline-loading').querySelector('button').click();assert.equal(row.newIngredient,null);gate.resolve();await h.flush();assert.equal(calls,0);assert.equal(o.busy,false);assert.equal(o.auxiliaryUnknown,false);assert.equal(h.counts.writes,0);}finally{gate.resolve();await h.flush();h.cleanup();}
});
test('reviewer: loading buffer can be removed and restored before arrival with one current translation',async()=>{
 const h=await setup(),gate=h.holdModule('inline');const translated=[];h.legacy.translate=async zh=>{translated.push(zh);return {en:'Restored'};};
 try{await h.mount('dish');inline(h,'Seed');const o=h.m.inspectDishOwner(),row=o.draft.components.pop();o.changed();o.draft.components.push(row);o.changed();row.newIngredient.zh='Latest';gate.resolve();await h.flush();assert.deepEqual(translated,['Latest']);assert.equal(row.newIngredient.en,'Restored');assert.equal(o.busy,false);}finally{gate.resolve();await h.flush();h.cleanup();}
});
test('reviewer: Ingredient concurrent image and legacy tasks retain independent old-auth tickets',async()=>{
 const h=await setup(),image=h.holdModule('image'),legacy=h.holdModule('legacy');let calls=0;h.legacy.translate=async()=>{calls++;return {};};
 try{await h.mount('ingredient');h.input('#adm-ing-name-zh','Old');const picker=h.el.querySelectorAll('input').find(x=>x.type==='file');picker.files=[new Blob(['x'])];picker.dispatchEvent({type:'change'});h.el.querySelector('.adm-ing-translate').click();await h.flush();h.auth();h.home();await h.mount('dish');h.input('#adm-dish-name-zh','New');assert.equal(h.m.inspectReloadSafety().reason,'unknown');legacy.resolve();await h.flush();assert.equal(h.m.inspectReloadSafety().reason,'unknown');image.resolve();await h.flush();assert.equal(h.m.inspectReloadSafety().reason,'dirty');assert.equal(calls,0);assert.equal(h.el.querySelector('#adm-dish-name-zh').value,'New');}finally{image.resolve();legacy.resolve();await h.flush();h.cleanup();}
});
test('reviewer: Ingredient late input stays separate from the pre-load save snapshot',async()=>{
 const h=await setup(),gate=h.holdModule('legacy');const bodies=[];const prior=h.legacy.saveIngredient.bind(h.legacy);h.legacy.saveIngredient=async(...a)=>{bodies.push(structuredClone(a[1]));return prior(...a);};
 try{await h.mount('ingredient');h.input('#adm-ing-name-zh','Save snapshot');h.el.querySelector('form').dispatchEvent({type:'submit',preventDefault(){}});await h.flush();h.input('#adm-ing-name-zh','Later raw');gate.resolve();await h.flush();assert.equal(bodies.length,1);assert.equal(bodies[0].name.zh,'Save snapshot');assert.equal(h.el.querySelector('#adm-ing-name-zh').value,'Later raw');assert.equal(h.m.inspectReloadSafety().reason,'dirty');}finally{gate.resolve();await h.flush();h.cleanup();}
});
test('reviewer: Dish pending image source and metadata snapshots survive later edits during code loading',async()=>{
 const h=await setup(),gate=h.holdModule('legacy'),sent=[];h.legacy.uploadImage=async(...a)=>{sent.push(a);return {src:'data/photo.png',license:'own'};};
 try{await h.mount('dish');const o=h.m.inspectDishOwner(),p={blob:new Blob(['x']),width:1,height:1,previewUrl:'blob:test',license:'own',author:'old',sourceUrl:''};o.draft.pending=p;o.changed();h.el.querySelector('.adm-dish-save-draft').click();await h.flush();p.author='later';o.changed();gate.resolve();await h.flush();assert.equal(sent.length,1);assert.equal(sent[0][3].author,'old');assert.equal(o.draft.pending,p);assert.equal(o.draft.pending.author,'later');assert.equal(h.m.inspectReloadSafety().reason,'dirty');}finally{gate.resolve();await h.flush();h.cleanup();}
});
test('reviewer: inline save awaiting legacy code survives a same-owner language repaint',async()=>{
 const h=await setup();let gate;
 try{await h.mount('dish');inline(h,'');await h.flush();const form=h.el.querySelector('.adm-dish-inline');const f=s=>form.querySelectorAll('input').find(n=>n.id.endsWith(s));h.input('#'+f('-name-zh').id,'Same buffer');h.input('#'+f('-id').id,'reviewer-local');gate=h.holdModule('legacy');h.click('Save this ingredient');await h.flush();const owner=h.m.inspectDishOwner(),row=owner.draft.components.at(-1),buffer=row.newIngredient;assert.equal(owner.busy,true);assert.equal(h.counts.writes,0);await h.mount('dish','uk');assert.equal(row.newIngredient,buffer);gate.resolve();await h.flush();assert.equal(h.counts.writes,1,'same owner and exact buffer should continue its accepted save across language-only repaint');assert.equal(row.ingredientRef,'reviewer-local');assert.equal(owner.busy,false);}finally{gate?.resolve();await h.flush();h.cleanup();}
});
