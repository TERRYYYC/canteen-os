/** #131: a recorded ingredient without Ingredient.role is unclassified, never "information unavailable". */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {A,B,btn,card,chili,flush,inputs,ribs,selection,setup,walk} from './team-meals-pages-shopping-harness.mjs';
const W={zh:{unclassified:'用途未分类',missing:'资料未找到',main:'主料',seasoning:'调料'},en:{unclassified:'Role not classified',missing:'Information unavailable',main:'Main ingredient',seasoning:'Seasoning'},uk:{unclassified:'Роль не визначено',missing:'Дані недоступні',main:'Основний інгредієнт',seasoning:'Приправа'}};
const NAMES={zh:['排骨','小米辣','番茄','小葱'],en:['Pork ribs','Bird’s eye chili','Tomato','Scallion'],uk:['Свинячі реберця','Перець чилі','Помідор','Зелена цибуля']};
// The role line sits under the ingredient name in the compact card heading.
const roleOf=(el,id)=>{const heading=walk(card(el,id)).find(n=>(n.attrs.class??'').split(' ').includes('tm-material-heading'));assert.ok(heading,`heading ${id}`);return heading.children[1];};

for(const lang of ['zh','en','uk'])for(const identity of ['canonical','snapshot'])test(`${lang}/${identity}: role tag separates recorded, unclassified and missing records of the fixed projection`,async()=>{
 const f=await setup({lang});try{
  const {renderCandidates,projectTeamMeals,estimateShoppingList,shoppingText}=f.page,data=inputs(A);
  const projection=projectTeamMeals(data,{sourceRevision:A,selection},{identity}),estimate=estimateShoppingList(data,selection,'2026-09-14',identity);
  const el=renderCandidates({lang,...projection,estimate,compact:true});
  const id={ribs:identity==='canonical'?ribs:'ribs-snapshot',chili:identity==='canonical'?chili:'chili-snapshot'};
  for(const [ref,expected,state] of [[id.ribs,W[lang].unclassified,'unclassified'],[id.chili,W[lang].seasoning,'seasoning'],['tomato',W[lang].main,'main'],['scallion',W[lang].unclassified,'unclassified'],['ghost',W[lang].missing,'missing']]){
   const role=roleOf(el,ref);assert.equal(role.textContent,expected,`${lang}/${identity}/${ref}`);assert.equal(role.attrs['data-ingredient-role'],state);
  }
  // Recorded names stay visible; only the record that really is absent keeps the missing notice.
  for(const name of NAMES[lang])assert.ok(el.textContent.includes(name),name);
  assert.equal(walk(el).filter(n=>n.attrs['data-ingredient-role']==='missing').length,1,'one missing record');
  assert.equal(shoppingText(lang,'unclassified'),W[lang].unclassified);
 }finally{f.cleanup();}
});
for(const lang of ['zh','en','uk'])test(`${lang}: saved list reads roles from its own basis, not the current catalog, and keeps decisions across save and reopen`,async()=>{
 const f=await setup({lang});try{
  f.current(B);let el=await f.mount('team-shop');
  assert.ok(f.calls.some(c=>c.path==='/catalog'&&c.revision===A),'basis catalog read at A');assert.ok(!f.calls.some(c=>c.path==='/catalog'&&c.revision!==A),'no current catalog read');
  assert.equal(roleOf(el,ribs).textContent,W[lang].unclassified);assert.equal(roleOf(el,'scallion').textContent,W[lang].unclassified);assert.equal(roleOf(el,'ghost').textContent,W[lang].missing);
  const t=key=>f.page.shoppingText(lang,key);
  // Unclassified records remain fully decidable; the absent record keeps only the manual check path.
  assert.equal(btn(card(el,ribs),t('buy')).disabled,false);assert.equal(btn(card(el,'ghost'),t('buy')).disabled,true);assert.equal(btn(card(el,'ghost'),t('check')).disabled,false);
  btn(card(el,ribs),t('buy')).click();await flush();btn(el,t('save')).click();await flush();
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].match,'initial');assert.equal(f.writes[0].content.basis.sourceRevision,A);
  assert.deepEqual(f.writes[0].content.items.find(i=>i.ingredientRef===ribs),{ingredientRef:ribs,decision:'buy',snapshotRefs:['ribs-snapshot']});
  assert.ok(f.writes[0].content.items.every(i=>!Object.hasOwn(i,'role')),'the list body stores decisions only');
  f.fresh();el=await f.mount('team-shop');
  assert.equal(card(el,ribs).querySelector('[aria-pressed="true"]').textContent,t('buy'));
  assert.equal(roleOf(el,ribs).textContent,W[lang].unclassified);assert.equal(roleOf(el,chili).textContent,W[lang].seasoning);assert.equal(roleOf(el,'tomato').textContent,W[lang].main);
 }finally{f.cleanup();}
});
