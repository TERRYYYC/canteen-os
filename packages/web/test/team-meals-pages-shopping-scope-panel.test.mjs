/** #132: repaints keep the user's open scope panels; reading still never applies or saves a basis. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {A,B,boxes,btn,flush,setup,walk} from './team-meals-pages-shopping-harness.mjs';
// Panels are found by their visible summary, as a user finds them.
const SUMMARY={scope:['应用新范围并重新核对','Apply scope and review again','Застосувати діапазон і перевірити знову'],'plan-ids':['调整计划编号','Change plan IDs','Змінити номери планів'],'open-by-id':['按清单编号打开','Open by list ID','Відкрити за номером списку']};
const panel=(el,key,lang='en')=>{const found=walk(el).filter(n=>n.tagName==='DETAILS'&&n.children[0]?.tagName==='SUMMARY'&&n.children[0].textContent===SUMMARY[key][['zh','en','uk'].indexOf(lang)]);assert.equal(found.length,1,`one ${key} panel`);return found[0];};
// A user click on <summary> flips open immediately; the browser queues the toggle event.
function userToggle(details,open){details.open=open;setImmediate(()=>details.dispatch('toggle'));}
const errors=el=>walk(el).filter(n=>(n.attrs.class??'').split(' ').includes('tm-error'));

for(const lang of ['zh','en','uk'])test(`${lang}: scope panel stays open through an async latest-plan read until the explicit apply, save and reopen`,async()=>{
 const f=await setup({lang});try{
  const t=key=>f.page.shoppingText(lang,key),scope=()=>panel(el,'scope',lang);let el=await f.mount('team-shop');
  assert.equal(scope().open,false,'collapsed by default');
  userToggle(scope(),true);await flush();
  f.current(B);const held=f.hold(c=>c.path==='/source/plan/team-week'&&c.revision===null);
  btn(scope(),t('read')).click();await flush();
  assert.equal(scope().open,true,'open while the read is pending');assert.equal(btn(scope(),t('read')).disabled,true);
  held.release();await flush();
  assert.equal(scope().open,true,'open after the read settles');
  // The date may be written as ISO or in the reader's language; either way the latest saved meal is listed.
  const listed=['2026-09-16',new Intl.DateTimeFormat({zh:'zh-Hans',en:'en',uk:'uk'}[lang],{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date('2026-09-16T12:00:00Z'))];
  assert.ok(listed.some(date=>scope().textContent.includes(date)),'latest saved meals are listed');assert.ok(scope().textContent.includes(B),'latest source version shown');
  // Reading applied nothing: no write, and the saved list keeps basis A.
  assert.equal(f.writes.length,0);assert.equal(f.sources.get('team-shop').content.basis.sourceRevision,A);
  const slot=boxes(scope()).find(n=>listed.some(date=>n.parentNode.textContent.includes(date)));assert.ok(slot&&!slot.checked);slot.checked=true;slot.dispatch('change');
  assert.equal(scope().open,true,'selection repaint keeps it open');
  const apply=btn(scope(),t('apply'));assert.equal(apply.disabled,false,'next action visible and enabled');apply.click();await flush();
  assert.equal(scope().open,true,'open after the explicit apply');assert.equal(f.writes.length,0,'apply never saves');
  assert.ok(walk(el).filter(n=>n.attrs['aria-pressed']==='true').every(n=>n.textContent===t('check')),'review leaves every decision at check');
  btn(el,t('save')).click();await flush();
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].match,'initial');assert.equal(f.writes[0].content.basis.sourceRevision,B);assert.ok(f.writes[0].content.basis.selection.some(s=>s.date==='2026-09-16'));
  f.fresh();el=await f.mount('team-shop');
  assert.equal(scope().open,false,'a reloaded page starts collapsed');
  assert.ok(walk(el).find(n=>n.tagName==='DETAILS'&&(n.attrs.class??'').includes('tm-purchase-record')).textContent.includes(B),'saved basis B reopened');
 }finally{f.cleanup();}
});
test('a failed latest-plan read keeps the panel open and shows the failure next to the action',async()=>{
 const f=await setup();try{
  const el=await f.mount('team-shop');userToggle(panel(el,'scope'),true);await flush();
  f.planFails(true);btn(panel(el,'scope'),'Read latest saved plans').click();await flush();
  assert.equal(panel(el,'scope').open,true);assert.equal(errors(panel(el,'scope')).length,1,'failure beside the action');
  assert.ok(walk(el).some(n=>n.attrs.role==='alert'),'page-level alert retained');
  assert.equal(btn(panel(el,'scope'),'Read latest saved plans').disabled,false,'retry stays available');assert.equal(f.writes.length,0);
  f.planFails(false);btn(panel(el,'scope'),'Read latest saved plans').click();await flush();
  assert.equal(errors(panel(el,'scope')).length,0,'cleared by the next attempt');assert.equal(panel(el,'scope').open,true);
 }finally{f.cleanup();}
});
test('a save conflict after apply keeps the panel open with the conflict state and the scope guards intact',async()=>{
 const f=await setup();try{
  const el=await f.mount('team-shop');userToggle(panel(el,'scope'),true);await flush();
  f.current(B);btn(panel(el,'scope'),'Read latest saved plans').click();await flush();
  btn(panel(el,'scope'),'Apply scope and review again').click();await flush();
  f.post('conflict');btn(el,'Save list').click();await flush();
  const scope=panel(el,'scope');assert.equal(scope.open,true);
  assert.ok(scope.textContent.includes('Version conflict; local changes retained'),'conflict state shown in the panel');
  assert.equal(btn(scope,'Read latest saved plans').disabled,true,'canRebase guard still blocks reading');assert.equal(btn(scope,'Apply scope and review again').disabled,true,'canRebase guard still blocks applying');
  assert.equal(f.sources.get('team-shop').content.basis.sourceRevision,A,'nothing was written');
 }finally{f.cleanup();}
});
test('a repaint before the queued toggle event still keeps the user’s open choice',async()=>{
 const f=await setup();try{
  const el=await f.mount('team-shop'),before=panel(el,'scope');
  before.open=true;// summary clicked; toggle event not dispatched yet
  btn(before,'Read latest saved plans').click();await flush();
  assert.equal(panel(el,'scope').open,true);
  before.dispatch('toggle');assert.equal(panel(el,'scope').open,true,'stale detached toggle ignored');
 }finally{f.cleanup();}
});
test('panel state belongs to one list view: another list, auth change and a reload start collapsed',async()=>{
 const f=await setup();try{
  f.sources.set('other-shop',{content:{...structuredClone(f.sources.get('team-shop').content),id:'other-shop'},commit:'d'.repeat(40),blobSha:'other'});
  let el=await f.mount('team-shop');userToggle(panel(el,'scope'),true);await flush();
  el=await f.mount('team-shop','uk');assert.equal(panel(el,'scope','uk').open,true,'same list across a language render');
  el=await f.mount('other-shop');assert.equal(panel(el,'scope').open,false,'another list does not inherit it');
  el=await f.mount('team-shop');assert.equal(panel(el,'scope').open,true,'returning to the list restores its own state');
  f.auth();el=await f.mount('team-shop');assert.equal(panel(el,'scope').open,false,'auth change starts a new view');
 }finally{f.cleanup();}
});
test('typing in the plan-ID field keeps its panel open, the focus and the caret',async()=>{
 const f=await setup();try{
  const el=await f.mount('team-shop');userToggle(panel(el,'scope'),true);userToggle(panel(el,'plan-ids'),true);await flush();
  const input=walk(el).find(n=>n.attrs['data-focus']==='plan-ids');input.focus();input.value='team-week, x';input.selectionStart=input.selectionEnd=12;input.dispatch('input');
  const next=walk(el).find(n=>n.attrs['data-focus']==='plan-ids');
  assert.notEqual(next,input,'repaint replaced the input');assert.equal(panel(el,'plan-ids').open,true);assert.equal(panel(el,'scope').open,true);
  assert.equal(document.activeElement,next);assert.equal(next.value,'team-week, x');assert.deepEqual([next.selectionStart,next.selectionEnd],[12,12]);
 }finally{f.cleanup();}
});
test('the open-by-ID panel on the purchase entry stays open while typing',async()=>{
 const f=await setup();try{
  const el=await f.mount('');userToggle(panel(el,'open-by-id'),true);await flush();
  const input=walk(el).find(n=>n.attrs['data-focus']==='list-id');input.focus();input.value='team';input.selectionStart=input.selectionEnd=4;input.dispatch('input');
  assert.equal(panel(el,'open-by-id').open,true);assert.equal(document.activeElement.attrs['data-focus'],'list-id');assert.equal(document.activeElement.selectionStart,4);
 }finally{f.cleanup();}
});
