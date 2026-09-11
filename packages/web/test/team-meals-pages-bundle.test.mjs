import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './team-meals-pages-guard-harness.mjs';
for(const page of ['ingredient','dish'])test(`D1: ${page} initial Source/catalog/form does not instantiate optional legacy API`,async()=>{
 const h=await setup();try{
  const original=globalThis.fixture.legacy;let requests=0;
  Object.defineProperty(globalThis.fixture,'legacy',{configurable:true,get(){requests++;return original;}});
  await h.mount(page);
  assert(h.el.querySelector(page==='ingredient'?'#adm-ing-name-zh':'#adm-dish-name-zh'),'initial form present');
  assert.equal(requests,0,'initial form and real C1 reads must not request optional legacy API');
 }finally{h.cleanup();}
});
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function createInline(h,seed='葱'){
 h.click('Add an ingredient');
 const search=h.el.querySelector('.adm-dish-search').querySelector('input');search.value=seed;search.dispatchEvent({type:'input'});
 const create=h.el.querySelector('.adm-dish-result-new');create.click();return create;
}
test('D1: no-image Dish save uses sole C1 without loading legacy or optional form/image',async()=>{
 const h=await setup();try{await h.mount('dish');h.input('#adm-dish-name-zh','Changed dish');h.el.querySelector('.adm-dish-save-draft').click();await h.flush();assert.equal(h.counts.writes,1);assert.deepEqual(h.modules.requests,[]);}finally{h.cleanup();}
});
test('D1: inline intent owns dirty/busy before await; current repaint hands directly to one automatic translation',async()=>{
 const h=await setup(),inline=h.holdModule('inline'),legacy=h.holdModule('legacy'),translated=defer();let calls=0;
 h.legacy.translate=()=>{calls++;return translated.promise;};
 try{
  await h.mount('dish');const owner=h.m.inspectDishOwner(),observed=[];owner.subscribe(()=>observed.push({raw:owner.readAuxiliary(),reason:h.m.inspectReloadSafety().reason}));
  const button=createInline(h);const buffer=owner.draft.components.at(-1).newIngredient;
  assert.equal(buffer.zh,'葱');assert.equal(owner.readAuxiliary().dirty,true);assert.equal(owner.readAuxiliary().phase,'busy');assert.equal(h.m.inspectReloadSafety().reason,'saving');
  button.click();assert.equal(h.modules.requests.filter(x=>x==='inline').length,1);assert.equal(owner.draft.components.at(-1).newIngredient,buffer);
  await h.mount('dish','uk');h.home();await h.mount('dish','en');assert.equal(owner.draft.components.at(-1).newIngredient,buffer);
  inline.resolve();await h.flush();assert(h.el.querySelector('.adm-dish-inline'));assert.equal(owner.busy,true);assert.equal(h.modules.requests.filter(x=>x==='legacy').length,1);assert.equal(calls,0);
  legacy.resolve();await h.flush();assert.equal(calls,1);assert.equal(owner.busy,true);
  translated.resolve({en:'Spring onion',uk:'Цибуля'});await h.flush();assert.equal(buffer.en,'Spring onion');assert.equal(owner.busy,false);assert.equal(owner.readAuxiliary().dirty,true);assert.equal(h.counts.writes,0);
  assert(observed.every(x=>x.reason==='saving'||x.reason==='dirty'),'no observable clean/reloadable interval');assert.equal(calls,1);
 }finally{inline.resolve();legacy.resolve();translated.resolve({});await h.flush();h.cleanup();}
});
test('D1: actual inline import boundary rejection retains raw, ends only read, exposes cancel without a fake retry',async()=>{
 const h=await setup(),gate=h.holdModule('inline');try{await h.mount('dish');createInline(h);const owner=h.m.inspectDishOwner(),buffer=owner.draft.components.at(-1).newIngredient;
 gate.reject(new TypeError('explicit controlled module rejection'));await h.flush();
 assert.equal(owner.busy,false);assert.equal(owner.auxiliaryUnknown,false);assert.equal(owner.readAuxiliary().phase,'idle');assert.equal(owner.readAuxiliary().dirty,true);assert.equal(h.m.inspectReloadSafety().reason,'dirty');assert.equal(h.counts.writes,0);assert.equal(owner.draft.components.at(-1).newIngredient,buffer);
 assert.match(h.el.textContent,/module could not load/);assert.equal(h.el.querySelector('.adm-dish-inline-loading').querySelectorAll('button').length,1);
 await h.mount('dish','uk');assert.equal(owner.draft.components.at(-1).newIngredient,buffer);assert.equal(h.modules.requests.length,1);assert(h.el.querySelector('.adm-dish-inline-loading'));
 h.el.querySelector('.adm-dish-inline-loading').querySelector('button').click();assert.equal(owner.draft.components.at(-1).newIngredient,null);
 }finally{h.cleanup();}
});
for(const mutation of ['auth','remove','replace'])test(`D1: inline late module completion cannot install into ${mutation}`,async()=>{
 const h=await setup(),gate=h.holdModule('inline'),translations=[];h.legacy.translate=async zh=>{translations.push(zh);return {};};try{await h.mount('dish');createInline(h);const old=h.m.inspectDishOwner(),row=old.draft.components.at(-1),buffer=row.newIngredient;
 if(mutation==='auth'){h.auth();h.home();await h.mount('dish');h.input('#adm-dish-name-zh','B later raw');}
 else if(mutation==='remove'){old.draft.components.pop();old.changed();}
 else{row.newIngredient={...buffer,zh:'Replacement',en:'',uk:''};old.changed();}
 gate.resolve();await h.flush();assert.deepEqual(translations,mutation==='replace'?['Replacement']:[]);assert.equal(h.counts.writes,0);assert.equal(old.auxiliaryUnknown,false);
 if(mutation==='auth'){assert.equal(h.el.querySelector('#adm-dish-name-zh').value,'B later raw');assert.equal(h.m.inspectReloadSafety().reason,'dirty');}
 else if(mutation==='replace')assert.equal(row.newIngredient.zh,'Replacement');
 }finally{gate.resolve();await h.flush();h.cleanup();}
});
for(const page of ['ingredient','dish'])test(`D1: ${page} legacy module held/rejected is read-only, preserves raw and sends no write`,async()=>{
 const h=await setup(),gate=h.holdModule('legacy');try{await h.mount(page);
 if(page==='ingredient'){h.input('#adm-ing-name-zh','Raw survives');h.el.querySelector('form').dispatchEvent({type:'submit',preventDefault(){}});}
 else{h.input('#adm-dish-name-zh','Raw survives');h.el.querySelector('.adm-dish-translate').click();}
 assert.equal(h.m.inspectReloadSafety().reason,'saving');await h.flush();assert.equal(h.counts.writes,0);await h.mount(page,'uk');
 gate.reject(new TypeError('explicit controlled module rejection'));await h.flush();assert.equal(h.m.inspectReloadSafety().reason,'dirty');assert.equal(h.counts.writes,0);
 assert.equal(h.el.querySelector(page==='ingredient'?'#adm-ing-name-zh':'#adm-dish-name-zh').value,'Raw survives');assert.doesNotMatch(h.el.textContent,/outcome unknown/);
 }finally{h.cleanup();}
});
for(const page of ['ingredient','dish'])test(`D1: ${page} old auth cannot use a late legacy module`,async()=>{
 const h=await setup(),gate=h.holdModule('legacy');let calls=0;h.legacy.translate=async()=>{calls++;return{en:'Late'};};try{await h.mount(page);
 const input=page==='ingredient'?'#adm-ing-name-zh':'#adm-dish-name-zh';h.input(input,'A raw');h.el.querySelector(page==='ingredient'?'.adm-ing-translate':'.adm-dish-translate').click();
 h.auth();h.home();await h.mount(page);h.input(input,'B raw');gate.resolve();await h.flush();assert.equal(calls,0);assert.equal(h.counts.writes,0);assert.equal(h.el.querySelector(input).value,'B raw');assert.equal(h.m.inspectReloadSafety().reason,'dirty');
 }finally{gate.resolve();await h.flush();h.cleanup();}
});
for(const page of ['ingredient','dish'])test(`D1: ${page} image module admission is protected and late auth prevents decoding`,async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Image'),images=[];Object.defineProperty(globalThis,'Image',{configurable:true,value:class{set src(v){images.push(v);}}});
 const h=await setup(),gate=h.holdModule('image');try{await h.mount(page);const input=page==='ingredient'?'#adm-ing-name-zh':'#adm-dish-name-zh';h.input(input,'A raw');
 const picker=h.el.querySelectorAll('input').find(e=>e.type==='file');picker.files=[new Blob(['image'],{type:'image/png'})];picker.dispatchEvent({type:'change'});
 assert.equal(h.m.inspectReloadSafety().reason,'saving');assert.equal(images.length,0);h.auth();h.home();await h.mount(page);h.input(input,'B raw');
 gate.resolve();await h.flush();assert.equal(images.length,0);assert.equal(h.counts.writes,0);assert.equal(h.el.querySelector(input).value,'B raw');assert.equal(h.m.inspectReloadSafety().reason,'dirty');
 }finally{gate.resolve();await h.flush();h.cleanup();if(previous)Object.defineProperty(globalThis,'Image',previous);else delete globalThis.Image;}
});
test('D1: loaded translation transport rejection can really retry without repeating inline automatic translation',async()=>{
 const h=await setup();let calls=0;h.legacy.translate=async()=>{calls++;if(calls===1)throw new TypeError('real action fixture failure');return{en:'Retry succeeds',uk:'Повтор'};};
 try{await h.mount('dish');h.input('#adm-dish-name-zh','可重试');h.el.querySelector('.adm-dish-translate').click();await h.flush();assert.equal(calls,1);assert.equal(h.m.inspectReloadSafety().reason,'dirty');
 h.el.querySelector('.adm-dish-translate').click();await h.flush();assert.equal(calls,2);assert.equal(h.el.querySelector('#adm-dish-name-en').value,'Retry succeeds');assert.equal(h.counts.writes,0);
 }finally{h.cleanup();}
});
for(const page of ['ingredient','dish'])test(`D1: ${page} image module unavailable survives language; no-image save remains usable`,async()=>{
 const h=await setup(),gate=h.holdModule('image');try{await h.mount(page);const selector=page==='ingredient'?'#adm-ing-name-zh':'#adm-dish-name-zh';h.input(selector,'Raw retained');const picker=h.el.querySelectorAll('input').find(e=>e.type==='file');picker.files=[new Blob(['image'],{type:'image/png'})];picker.dispatchEvent({type:'change'});
 gate.reject(new TypeError('controlled image module rejection'));await h.flush();await h.mount(page,'uk');assert.equal(h.el.querySelector(selector).value,'Raw retained');assert.equal(h.m.inspectReloadSafety().reason,'dirty');assert.equal(h.counts.writes,0);assert.match(h.el.textContent,/Модуль цієї функції не завантажився/);
 if(page==='dish'){h.el.querySelector('.adm-dish-save-draft').click();await h.flush();assert.equal(h.counts.writes,1);assert.equal(h.modules.requests.includes('legacy'),false);}
 }finally{h.cleanup();}
});
