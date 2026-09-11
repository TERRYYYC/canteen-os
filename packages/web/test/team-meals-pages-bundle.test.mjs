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

// Original independent two-case reproduction; assertions preserved.
for (const page of ['ingredient','dish']) test(`D1-R1 reproduction: ${page} deferred legacy load must not dispatch a new write after leaving`,async()=>{
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
const routePhoto=()=>({blob:new Blob(['local'],{type:'image/png'}),width:1,height:1,previewUrl:'blob:route-fixture',license:'own',author:'',sourceUrl:''});
async function routeSaveSetup(h,kind){
 const page=kind==='dish-photo'?'dish':'ingredient',key=kind.startsWith('new')?'new':page==='dish'?'soup':'salt';await h.mount(page,'en',key);
 const owner=page==='dish'?h.m.inspectDishOwner():h.m.inspectIngredientOwner(),input=page==='dish'?'#adm-dish-name-zh':'#adm-ing-name-zh';h.input(input,'Original retained raw');
 if(key==='new')h.input('#adm-ing-id','new-local-ingredient');
 if(kind.endsWith('photo'))owner.draft.pending=routePhoto();
 const sent=[];const original=h.legacy.saveIngredient.bind(h.legacy);
 h.legacy.saveIngredient=async(...args)=>{sent.push(['save',args[0]]);return original(...args);};
 h.legacy.uploadImage=async(...args)=>{sent.push(['upload',args[1]]);return {src:'data/local-fixture.png',license:'own'};};
 const save=()=>page==='dish'?h.el.querySelector('.adm-dish-save-draft').click():h.el.querySelector('form').dispatchEvent({type:'submit',preventDefault(){}});
 return{page,key,owner,input,sent,save};
}
for(const kind of ['ingredient','new','new-photo','dish-photo'])for(const leave of ['home','other-record'])test(`D1-R1: ${kind} ${leave} before legacy ready sends nothing; explicit return save retains raw`,async()=>{
 const h=await setup(),gate=h.holdModule('legacy');try{const a=await routeSaveSetup(h,kind);const draft=a.owner.draft;a.save();await h.flush();assert.equal(h.m.inspectReloadSafety().reason,'saving');assert.deepEqual(a.sent,[]);
 if(leave==='home')h.home();else{await h.mount(a.page,'uk','other-record');h.input(a.input,'Other record raw');}
 gate.resolve();await h.flush();assert.deepEqual(a.sent,[]);assert.equal(a.owner.readAuxiliary(a.key).phase,'idle');assert.equal(draft.dirty,true);
 if(leave==='other-record')assert.equal(h.el.querySelector(a.input).value,'Other record raw');
 await h.mount(a.page,'en',a.key);assert.equal(a.owner.draft,draft);assert.equal(h.el.querySelector(a.input).value,'Original retained raw');
 assert.equal(a.page==='dish'?h.el.querySelector('.adm-dish-save-draft').disabled:h.el.querySelector('.adm-ing-save').disabled,false,'known-unsent attempt releases saving');
 a.save();await h.flush();assert.equal(a.sent.filter(x=>x[0]==='upload').length,kind.endsWith('photo')?1:0);assert.equal(a.sent.filter(x=>x[0]==='save').length,a.page==='ingredient'?1:0);assert.equal(h.counts.writes,1);
 }finally{gate.resolve();await h.flush();h.cleanup();}
});
for(const kind of ['ingredient','new','new-photo','dish-photo'])for(const change of ['language','return-before-ready'])test(`D1-R1: ${kind} ${change} keeps original allowed operation`,async()=>{
 const h=await setup(),gate=h.holdModule('legacy');try{const a=await routeSaveSetup(h,kind);a.save();await h.flush();if(change==='return-before-ready')h.home();await h.mount(a.page,'uk',a.key);gate.resolve();await h.flush();assert.equal(a.sent.filter(x=>x[0]==='upload').length,kind.endsWith('photo')?1:0);assert.equal(h.counts.writes,1);assert.equal(h.el.querySelector(a.input).value,'Original retained raw');
 }finally{gate.resolve();await h.flush();h.cleanup();}
});
test('D1-R1: inline Ingredient save waits on legacy through language without losing its original buffer',async()=>{
 const h=await setup();try{await h.mount('dish');createInline(h,'');await h.flush();const inline=h.el.querySelector('.adm-dish-inline');const field=suffix=>inline.querySelectorAll('input').find(n=>n.id.endsWith(suffix)).id;h.input('#'+field('-name-zh'),'Inline original');h.input('#'+field('-id'),'inline-route');const gate=h.holdModule('legacy');h.click('Save this ingredient');await h.flush();await h.mount('dish','uk');gate.resolve();await h.flush();assert.equal(h.counts.writes,1);assert.equal(h.m.inspectDishOwner().draft.components.at(-1).ingredientRef,'inline-route');}finally{await h.flush();h.cleanup();}
});
for(const kind of ['ingredient','new-photo','dish-photo'])test(`D1-R1: already dispatched ${kind} settles its original owner after departure`,async()=>{
 const h=await setup(),gate=kind==='ingredient'?h.holdWrite():defer();const result=()=>kind==='ingredient'?Response.json({ok:true,commit:'b'.repeat(40),blobSha:'route-saved',unchanged:false,warnings:[]}):{src:'data/dispatched-fixture.png',license:'own'};try{const a=await routeSaveSetup(h,kind);const draft=a.owner.draft;
 if(kind.endsWith('photo'))h.legacy.uploadImage=async(...args)=>{a.sent.push(['upload',args[1]]);return gate.promise;};

 a.save();await h.flush();assert.equal(h.m.inspectReloadSafety().reason,'saving');h.input(a.input,'Later original raw');h.home();
 gate.resolve(result());await h.flush();assert.equal(a.owner.readAuxiliary(a.key).phase,'idle');assert.equal(draft.dirty,true);assert.equal(draft.pending,null);
 assert.equal(h.counts.writes,kind==='dish-photo'?0:1);await h.mount(a.page,'en',a.key);assert.equal(h.el.querySelector(a.input).value,'Later original raw');assert.equal(a.owner.draft,draft);
 const uploads=a.sent.filter(x=>x[0]==='upload').length;if(kind==='ingredient')h.holdWrite().resolve(result());a.save();await h.flush();assert.equal(a.sent.filter(x=>x[0]==='upload').length,uploads);assert.equal(h.counts.writes,kind==='dish-photo'?1:2);
 }finally{gate.resolve(result());await h.flush();h.cleanup();}
});
for(const departure of ['home','other-record'])test(`D1-R1: inline legacy ready after ${departure} cannot send its new write`,async()=>{
 const h=await setup();let gate;try{await h.mount('dish');createInline(h,'');await h.flush();const owner=h.m.inspectDishOwner(),row=owner.draft.components.at(-1),buffer=row.newIngredient;const inline=h.el.querySelector('.adm-dish-inline');const field=suffix=>inline.querySelectorAll('input').find(n=>n.id.endsWith(suffix)).id;h.input('#'+field('-name-zh'),'Inline retained');h.input('#'+field('-id'),'inline-later');gate=h.holdModule('legacy');h.click('Save this ingredient');await h.flush();
 if(departure==='home')h.home();else await h.mount('dish','uk','other-record');gate.resolve();await h.flush();assert.equal(h.counts.writes,0);assert.equal(owner.readAuxiliary('soup').phase,'idle');assert.equal(row.newIngredient,buffer);
 await h.mount('dish');await h.flush();h.click('Save this ingredient');await h.flush();assert.equal(h.counts.writes,1);assert.equal(row.ingredientRef,'inline-later');
 }finally{gate?.resolve();await h.flush();h.cleanup();}
});
