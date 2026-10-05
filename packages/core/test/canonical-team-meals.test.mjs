import test from 'node:test';
import assert from 'node:assert/strict';
import { collectIngredientReferences, createShoppingList, applyShoppingDecision, reconcileShoppingList, estimateShoppingList, projectTeamMeals } from '../dist/index.js';
const id='52d1955b-e1a9-44e8-a674-a3b3055a1130',key=`kbci-${id.replaceAll('-','')}`;
const selection=[{menuPlanRef:'week',date:'2026-10-05',mealType:'lunch'}];
const basis={sourceRevision:'a'.repeat(40),selection};
function fixture(){
  const ingredient={schemaVersion:'3',name:{zh:'小米辣'},baseUnit:'g',yield:1,trackStock:false,canonicalIngredientId:id,canonicalIngredientVersion:1,purchase:{supplier:'fixture',packSize:100,packUnit:'g'}};
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


test('v3 g/ml yield stays unknown; legacy v2 and pcs numeric behavior remain intact',()=>{
  for(const unit of ['g','ml']) {
    const inputs=fixture();for(const dish of Object.values(inputs.dishes))dish.components[0].qty.unit=unit;
    for(const ingredient of Object.values(inputs.ingredients)){ingredient.baseUnit=unit;ingredient.purchase.packUnit=unit;delete ingredient.yield;}
    const unavailable=estimateShoppingList(inputs,selection,'2026-10-05').items[0];
    assert.equal(unavailable.status,'unavailable');assert(unavailable.reasons.some(r=>r.code==='missing-yield'));
    const list=applyShoppingDecision(createShoppingList('test',basis,inputs,'2'),key,'buy',true);
    const known=structuredClone(inputs);for(const ingredient of Object.values(known.ingredients))ingredient.yield=1;
    assert.equal(reconcileShoppingList(list,inputs,{...basis,sourceRevision:'b'.repeat(40)},known).list.items[0].previous.bought,true);
    assert.equal(estimateShoppingList(known,selection,'2026-10-05').items[0].status,'complete');
    for(const ingredient of Object.values(inputs.ingredients)){ingredient.schemaVersion='2';delete ingredient.canonicalIngredientId;delete ingredient.canonicalIngredientVersion;}
    assert(estimateShoppingList(inputs,selection,'2026-10-05').items.every(i=>i.status==='complete'));
  }
  const pcs=fixture();for(const ingredient of Object.values(pcs.ingredients)){ingredient.baseUnit='pcs';ingredient.purchase.packUnit='pcs';delete ingredient.yield;}
  for(const dish of Object.values(pcs.dishes))dish.components[0].qty.unit='pcs';
  assert.equal(estimateShoppingList(pcs,selection,'2026-10-05').items[0].status,'complete');
});

test('unmapped recipe rows use stable namespaced list2 identity through revisions/reorder/deletion, list1 stays concrete',()=>{
  const inputs=fixture(),recipeId='25a91d05-0bda-45b5-999d-b56e4d543a30',rowId='29f5b84b-b6ce-4421-989b-df741c9f9897';
  inputs.menuPlans.week.meals=inputs.menuPlans.week.meals.slice(0,1);
  const dish=inputs.dishes.a;dish.provenance={source:'knowledge',recipeId,recipeVersion:1};
  dish.components[0].knowledgeIngredientId=rowId;delete inputs.ingredients.first.canonicalIngredientId;delete inputs.ingredients.first.canonicalIngredientVersion;
  const stable=`kbri-${recipeId.replaceAll('-','')}-${rowId.replaceAll('-','')}`;
  const list=createShoppingList('test',basis,inputs,'2');assert.equal(list.items[0].ingredientRef,stable);
  const bought=applyShoppingDecision(list,stable,'buy',true);
  assert.equal(createShoppingList('test',basis,inputs,'1').items[0].ingredientRef,'first');
  const edited=structuredClone(inputs);edited.dishes.a.provenance.recipeVersion=2;
  edited.dishes.a.components[0].ingredientRef='revision2';edited.ingredients.revision2=structuredClone(edited.ingredients.first);delete edited.ingredients.first;
  let changed=reconcileShoppingList(bought,inputs,{...basis,sourceRevision:'b'.repeat(40)},edited);
  assert.deepEqual(changed.added,[]);assert.deepEqual(changed.removed,[]);assert.deepEqual(changed.reviewRequired,[stable]);
  assert.equal(changed.list.items[0].previous.bought,true);assert.deepEqual(changed.list.items[0].snapshotRefs,['revision2']);
  const reordered=structuredClone(inputs);reordered.dishes.a.components.unshift({ingredientRef:'second',knowledgeIngredientId:'a635a671-049f-4011-a04d-e4221aaab075'});delete reordered.ingredients.second.canonicalIngredientId;delete reordered.ingredients.second.canonicalIngredientVersion;
  changed=reconcileShoppingList(bought,inputs,{...basis,sourceRevision:'c'.repeat(40)},reordered);
  assert.equal(changed.removed.length,0);assert.equal(changed.added.length,1);assert(changed.list.items.find(i=>i.ingredientRef===stable));
  const removed=structuredClone(inputs);removed.dishes.a.components=[];
  changed=reconcileShoppingList(bought,inputs,{...basis,sourceRevision:'d'.repeat(40)},removed);
  assert.equal(changed.removed[0].bought,true);
  const otherRecipe=structuredClone(inputs);otherRecipe.dishes.a.provenance.recipeId='13a91d05-0bda-45b5-999d-b56e4d543a30';
  assert.notEqual(collectIngredientReferences(otherRecipe,selection).items[0].ingredientRef,stable);
});
