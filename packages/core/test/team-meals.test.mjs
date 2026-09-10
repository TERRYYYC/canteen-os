import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as core from '../dist/index.js';
const AT='2026-09-10T00:00:00.000Z';
const revision='a'.repeat(40);
const selection=[{menuPlanRef:'team-week',date:'2026-09-14',mealType:'lunch'}];
const basis={sourceRevision:revision,selection};
const fixtureRoot=fileURLToPath(new URL('../../../test/fixtures/contracts/valid/',import.meta.url));
function fixture(name) {
  const root=path.join(fixtureRoot,name,'data');
  const load=sub=>Object.fromEntries(readdirSync(path.join(root,sub)).filter(f=>f.endsWith('.json')).map(f=>[f.slice(0,-5),JSON.parse(readFileSync(path.join(root,sub,f),'utf8'))]));
  return {menuPlans:load('menu-plans'),dishes:load('dishes'),ingredients:load('ingredients'),techniques:JSON.parse(readFileSync(path.join(root,'techniques.json'),'utf8'))};
}
function sample(){ const x=fixture('boundaries'); x.menuPlans['team-week'].schemaVersion='3'; for(const m of x.menuPlans['team-week'].meals) delete m.plannedServings; return x; }
const copy=x=>structuredClone(x);

test('collect all recorded references without serving, qty, status or packaging filters',()=>{
 const x=sample(),before=JSON.stringify(x);
 x.dishes['second-dish'].schemaVersion='3';delete x.dishes['second-dish'].baseServings;delete x.dishes['second-dish'].components[0].qty;
 const r=core.collectIngredientReferences(x,selection);
 assert.deepEqual(r.items.map(i=>i.ingredientRef),['cooking-oil','salt','tomato','tomato-other']);
 assert.equal(r.items.find(i=>i.ingredientRef==='salt').sources.length,2);
 assert.deepEqual(r.coverage,{enumeration:'complete',references:'resolved',recipeCompleteness:'unverified'});
 assert.ok(r.items.find(i=>i.ingredientRef==='salt').sources.every(s=>s.componentIndex>=0));
 assert.deepEqual(core.collectIngredientReferences(x,[...selection,...selection]),r,'duplicate scope must not double demand');
 assert.notEqual(JSON.stringify(x),before); // only the explicit fixture edits above changed input
 const after=JSON.stringify(x);core.collectIngredientReferences(x,selection);assert.equal(JSON.stringify(x),after);
});

test('missing source or unrecorded recipe never becomes complete because other candidates exist',()=>{
 const x=sample();x.menuPlans['team-week'].meals.push({date:selection[0].date,mealType:'lunch',dishRef:'missing'});
 let r=core.collectIngredientReferences(x,selection);
 assert.ok(r.items.length>0);assert.equal(r.coverage.enumeration,'incomplete');assert.equal(r.coverage.references,'unresolved');
 assert.ok(r.issues.some(i=>i.code==='missing-dish'&&i.dishRef==='missing'));
 x.dishes.missing={name:{en:'Known name'},status:'active'};
 r=core.collectIngredientReferences(x,selection);assert.equal(r.coverage.enumeration,'incomplete');assert.ok(r.issues.some(i=>i.code==='components-unrecorded'));
 delete x.ingredients.salt;r=core.collectIngredientReferences(x,selection);
 assert.ok(r.items.some(i=>i.ingredientRef==='salt'));assert.equal(r.coverage.references,'unresolved');
});

test('create, decision and reconcile keep decisions scoped, preserve old bought, and remove cancelled demand',()=>{
 const x=sample();let list=core.createShoppingList('shop-one',basis,x);
 assert.ok(list.items.every(i=>i.decision==='check'));
 const before=JSON.stringify(x);
 list=core.applyShoppingDecision(list,'salt','buy',true);
 list=core.applyShoppingDecision(list,'tomato','available');
 assert.equal(JSON.stringify(x),before);
 const next=copy(x);next.menuPlans['team-week'].meals.reverse();for(const d of Object.values(next.dishes)){d.name.uk='Переклад';d.components?.reverse();}
 next.ingredients.tomato.image={src:'new.jpg',license:'own'};
 const newer={...basis,sourceRevision:'b'.repeat(40)};
 let r=core.reconcileShoppingList(list,x,newer,next);
 assert.equal(r.list.items.find(i=>i.ingredientRef==='salt').bought,true);assert.deepEqual(r.reviewRequired,[]);
 const changed=copy(x);changed.dishes['first-dish'].components[1].qty={unit:'g',value:2};
 r=core.reconcileShoppingList(list,x,newer,changed);
 const salt=r.list.items.find(i=>i.ingredientRef==='salt');assert.equal(salt.decision,'check');assert.equal(salt.bought,undefined);assert.equal(salt.previous.bought,true);
 const empty=copy(x);empty.menuPlans['team-week'].meals=[];
 r=core.reconcileShoppingList(list,x,newer,empty);assert.deepEqual(r.list.items,[]);assert.equal(r.removed.find(i=>i.ingredientRef==='salt').bought,true);
 assert.equal(core.collectIngredientReferences(empty,selection).coverage.enumeration,'complete');
});

test('scope changes and repeated demand require review; presentation and equivalent metric units do not',()=>{
 const x=sample();let list=core.applyShoppingDecision(core.createShoppingList('shop-one',basis,x),'tomato','available');
 const y=copy(x);y.dishes['first-dish'].components[0].qty={value:.3,unit:'kg'};
 assert.equal(core.reconcileShoppingList(list,x,basis,y).reviewRequired.includes('tomato'),false);
 y.menuPlans['team-week'].meals.push(copy(y.menuPlans['team-week'].meals[0]));
 assert.ok(core.reconcileShoppingList(list,x,basis,y).reviewRequired.includes('tomato'));
 const scope={...basis,selection:[...selection,{...selection[0],date:'2026-09-16'}]};
 assert.ok(core.reconcileShoppingList(list,x,scope,x).reviewRequired.includes('tomato'));
 assert.throws(()=>core.applyShoppingDecision(list,'tomato','available',true));
 assert.throws(()=>core.applyShoppingDecision(list,'not-a-candidate','buy'));
});

test('estimate guards every source then delegates complete golden quantities to original core',()=>{
 const x=fixture('golden');const p=x.menuPlans['week-41'];const scope=p.meals.map(m=>({menuPlanRef:'week-41',date:m.date,mealType:m.mealType}));
 let r=core.estimateShoppingList(x,scope,AT);
 assert.equal(r.budgetStatus,'complete');const tomato=r.items.find(i=>i.ingredientRef==='tomato');
 assert.equal(tomato.status,'complete');assert.equal(tomato.lines[0].line.packs,19);assert.equal(tomato.lines[0].line.amount.amount,541.5);
 p.schemaVersion='3';delete p.meals[1].plannedServings;
 r=core.estimateShoppingList(x,scope,AT);assert.equal(r.budgetStatus,'incomplete');
 assert.ok(r.items.every(i=>i.status==='unavailable'&&!('lines'in i)));
 assert.ok(r.items.every(i=>i.reasons.some(reason=>reason.code==='missing-planned-servings')));
});

test('unknown qty, to-taste, missing packaging and unresolved recipes cannot yield false totals',()=>{
 const x=fixture('golden');const p=x.menuPlans['week-41'];const scope=p.meals.map(m=>({menuPlanRef:'week-41',date:m.date,mealType:m.mealType}));
 x.dishes['tomato-egg-stir-fry'].schemaVersion='3';delete x.dishes['tomato-egg-stir-fry'].components[0].qty;
 let r=core.estimateShoppingList(x,scope,AT);assert.equal(r.items.find(i=>i.ingredientRef==='tomato').status,'unavailable');
 delete x.ingredients.egg.purchase;r=core.estimateShoppingList(x,scope,AT);assert.equal(r.items.find(i=>i.ingredientRef==='egg').status,'unavailable');
 p.meals.push({date:p.meals[0].date,mealType:'lunch',dishRef:'unknown',plannedServings:1});
 r=core.estimateShoppingList(x,scope,AT);assert.ok(r.items.every(i=>i.status==='unavailable'));
});

test('projection retains original metadata and all source references at supplied revision without mutation',()=>{
 const x=sample();const before=JSON.stringify(x);const p=core.projectTeamMeals(x,basis);
 assert.equal(p.sourceRevision,revision);assert.equal(p.projectionVersion,'1');assert.ok(p.ingredients.salt);assert.ok(p.dishes['first-dish']);
 assert.deepEqual(p.dishes['first-dish'],x.dishes['first-dish']);
 p.dishes['first-dish'].name.zh='changed';assert.equal(JSON.stringify(x),before);
});

test('empty projection preserves only explicitly named, genuinely empty plans without inventing dates',()=>{
 const x=sample();x.menuPlans['team-week'].meals=[];delete x.menuPlans['team-week'].dateRange;
 const p=core.projectTeamMeals(x,{sourceRevision:revision,selection:[]},{emptyMenuPlanRefs:['team-week']});
 assert.deepEqual(p.menuPlans['team-week'],x.menuPlans['team-week']);assert.deepEqual(p.selection,[]);assert.deepEqual(p.collection.items,[]);
 assert.throws(()=>core.projectTeamMeals(x,basis,{emptyMenuPlanRefs:['team-week']}));
 const nonempty=sample();assert.throws(()=>core.projectTeamMeals(nonempty,{sourceRevision:revision,selection:[]},{emptyMenuPlanRefs:['team-week']}));
 assert.throws(()=>core.projectTeamMeals(x,{sourceRevision:revision,selection:[]},{emptyMenuPlanRefs:['missing']}));
});

test('successive rebases keep the last human decision and never resurrect removed rows',()=>{
 const x=sample();let list=core.applyShoppingDecision(core.createShoppingList('shop-one',basis,x),'salt','buy',true);
 const first={...basis,sourceRevision:'b'.repeat(40),selection:[...selection,{...selection[0],date:'2026-09-16'}]};
 let r=core.reconcileShoppingList(list,x,first,x);list=r.list;
 const second={...first,sourceRevision:'c'.repeat(40),selection:[...first.selection,{...selection[0],date:'2026-09-17'}]};
 r=core.reconcileShoppingList(list,x,second,x);
 assert.deepEqual(r.list.items.find(i=>i.ingredientRef==='salt').previous,{basis,decision:'buy',bought:true});
 list=core.applyShoppingDecision(r.list,'salt','available');assert.equal(list.items.find(i=>i.ingredientRef==='salt').previous,undefined);
 const empty=copy(x);empty.menuPlans['team-week'].meals=[];
 r=core.reconcileShoppingList(list,x,second,empty);
 r=core.reconcileShoppingList(r.list,empty,basis,x);
 assert.equal(r.list.items.find(i=>i.ingredientRef==='salt').decision,'check');assert.equal(r.list.items.find(i=>i.ingredientRef==='salt').previous,undefined);
});

test('numeric demand changes require review while names, packaging, prices and stock references do not',()=>{
 const x=fixture('golden');const p=x.menuPlans['week-41'];const b={sourceRevision:revision,selection:p.meals.map(m=>({menuPlanRef:'week-41',date:m.date,mealType:m.mealType}))};
 const list=core.applyShoppingDecision(core.createShoppingList('shop-one',b,x),'tomato','available');
 for(const change of [y=>y.menuPlans['week-41'].meals[0].plannedServings++,y=>y.menuPlans['week-41'].margin=1.2,
   y=>y.dishes['tomato-egg-stir-fry'].baseServings=51,y=>y.ingredients.tomato.yield=.8]) {
   const y=copy(x);change(y);assert.ok(core.reconcileShoppingList(list,x,b,y).reviewRequired.includes('tomato'));
 }
 const y=copy(x);y.ingredients.tomato.purchase.packSize=10;y.ingredients.tomato.purchase.lastPrice.amount=3;y.ingredients.tomato.onHand=100;y.ingredients.tomato.name.zh='西红柿';
 assert.deepEqual(core.reconcileShoppingList(list,x,b,y).reviewRequired,[]);
});

test('golden estimate preserves 1525.50 and never calls missing prices or mixed currencies a complete budget',()=>{
 const x=fixture('golden');const scope=x.menuPlans['week-41'].meals.map(m=>({menuPlanRef:'week-41',date:m.date,mealType:m.mealType}));
 const r=core.estimateShoppingList(x,scope,AT);assert.equal(r.items.flatMap(i=>i.lines).reduce((sum,l)=>sum+l.line.amount.amount,0),1525.5);
 delete x.ingredients.tomato.purchase.lastPrice;let q=core.estimateShoppingList(x,scope,AT);assert.equal(q.items.find(i=>i.ingredientRef==='tomato').status,'complete');assert.equal(q.budgetStatus,'incomplete');
 x.ingredients.tomato.purchase.lastPrice={amount:28.5,currency:'USD'};assert.equal(core.estimateShoppingList(x,scope,AT).budgetStatus,'incomplete');
 x.ingredients.tomato.trackStock=true;x.ingredients.tomato.onHand=999999;
 q=core.estimateShoppingList(x,scope,AT);assert.deepEqual(q.items.find(i=>i.ingredientRef==='tomato').lines,[]);
});


test('prototype property names remain unresolved IDs rather than phantom records',()=>{
 const x=sample();x.menuPlans['team-week'].meals[0].dishRef='constructor';
 const r=core.collectIngredientReferences(x,selection);
 assert.ok(r.issues.some(i=>i.code==='missing-dish'&&i.dishRef==='constructor'));
});
