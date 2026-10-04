import test from 'node:test';
import assert from 'node:assert/strict';
import { collectIngredientReferences, createShoppingList, applyShoppingDecision, reconcileShoppingList, estimateShoppingList, projectTeamMeals } from '../dist/index.js';
const id='52d1955b-e1a9-44e8-a674-a3b3055a1130',key=`kbci-${id.replaceAll('-','')}`;
const selection=[{menuPlanRef:'week',date:'2026-10-05',mealType:'lunch'}];
const basis={sourceRevision:'a'.repeat(40),selection};
function fixture(){
  const ingredient={schemaVersion:'3',name:{zh:'小米辣'},baseUnit:'g',trackStock:false,canonicalIngredientId:id,canonicalIngredientVersion:1,purchase:{supplier:'fixture',packSize:100,packUnit:'g'}};
  return {menuPlans:{week:{schemaVersion:'3',meals:[{...selection[0],dishRef:'a',plannedServings:2},{...selection[0],dishRef:'b',plannedServings:2}]}},
    dishes:{a:{schemaVersion:'3',name:{zh:'A'},status:'active',baseServings:2,components:[{ingredientRef:'first',qty:{value:20,unit:'g'}}]},b:{schemaVersion:'3',name:{zh:'B'},status:'active',baseServings:2,components:[{ingredientRef:'second',qty:{value:30,unit:'g'}}]}},
    ingredients:{first:structuredClone(ingredient),second:structuredClone(ingredient)},techniques:[]};
}
test('explicit shared identity groups sources, projection retains every snapshot, old list1 remains separate',()=>{
  const inputs=fixture(),collection=collectIngredientReferences(inputs,selection);
  assert.equal(collection.items.length,1);assert.equal(collection.items[0].ingredientRef,key);
  assert.deepEqual(collection.items[0].snapshotRefs,['first','second']);
  assert.deepEqual(collection.items[0].sources.map(s=>s.ingredientRef),['first','second']);
  assert.equal(createShoppingList('list',basis,inputs,'1').items.length,2);
  const list=createShoppingList('list',basis,inputs,'2');assert.equal(list.shoppingListVersion,'2');
  assert.deepEqual(list.items[0].snapshotRefs,['first','second']);
  const projection=projectTeamMeals(inputs,basis);
  assert(projection.ingredients.first&&projection.ingredients.second&&projection.ingredients[key]);
  const estimate=estimateShoppingList(inputs,selection,'2026-10-05');
  assert.equal(estimate.items.length,1);assert.equal(estimate.items[0].status,'complete');
  assert.equal(estimate.items[0].lines[0].line.trace.grossNeed.value,55);
  inputs.ingredients.second.canonicalIngredientId='bddbe836-9d94-4364-8a88-b690b63bf0f4';
  assert.equal(collectIngredientReferences(inputs,selection).items.length,2,'same names never establish identity');
});
test('one unknown source or conflicting specification blocks group arithmetic without dropping seasonings',()=>{
  const inputs=fixture();delete inputs.dishes.b.components[0].qty;
  let item=estimateShoppingList(inputs,selection,'2026-10-05').items[0];
  assert.equal(item.status,'unavailable');assert(item.reasons.some(r=>r.code==='missing-qty'));
  inputs.dishes.b.components[0].qty={value:30,unit:'g'};inputs.ingredients.second.purchase.supplier='other';
  item=estimateShoppingList(inputs,selection,'2026-10-05').items[0];
  assert.equal(item.status,'unavailable');assert(item.reasons.some(r=>r.code==='ingredient-spec-conflict'));
  delete inputs.ingredients.first.baseUnit;delete inputs.ingredients.second.baseUnit;inputs.ingredients.second.purchase.supplier='fixture';
  item=estimateShoppingList(inputs,selection,'2026-10-05').items[0];
  assert.equal(item.status,'unavailable');assert(item.reasons.some(r=>r.code==='missing-base-unit'));
});
test('list2 decisions survive label edits but supplier/package changes require renewed review',()=>{
  const before=fixture();const list=applyShoppingDecision(createShoppingList('list',basis,before,'2'),key,'buy',true);
  const labels=structuredClone(before);labels.ingredients.first.name={zh:'标签修正'};labels.ingredients.second.name={zh:'标签修正'};
  let result=reconcileShoppingList(list,before,{...basis,sourceRevision:'b'.repeat(40)},labels);
  assert.equal(result.list.items[0].bought,true);assert.equal(result.reviewRequired.length,0);
  const changed=structuredClone(labels);changed.ingredients.first.purchase.packSize=200;changed.ingredients.second.purchase.packSize=200;
  result=reconcileShoppingList(list,before,{...basis,sourceRevision:'c'.repeat(40)},changed);
  assert.equal(result.list.shoppingListVersion,'2');assert.equal(result.list.items[0].decision,'check');
  assert.equal(result.list.items[0].previous.bought,true);assert.deepEqual(result.reviewRequired,[key]);
});
