/** Pure reference collection and per-list manual decisions. See team-meals-contract.md. */
import type {
  AnyDish, AnyMenuPlan, Dish, Id, Ingredient, MealType, MenuPlan, Quantity,
  ShoppingBasis, ShoppingDecision, ShoppingItem, ShoppingList, ShoppingSelection, Technique,
} from './types.js';
import { DEFAULT_MARGIN, convertQuantity, expand } from './procurement/engine.js';
import type { ProcurementLine } from './procurement/engine.js';

export interface TeamMealInputs {
  menuPlans: Record<Id, AnyMenuPlan>;
  dishes: Record<Id, AnyDish>;
  ingredients: Record<Id, Ingredient>;
  techniques: Technique[];
}
export interface IngredientSource {
  menuPlanRef: Id; date: string; mealType: MealType; dishRef: Id;
  mealIndex: number; componentIndex: number;
  plannedServings?: number; baseServings?: number; qty?: Quantity;
}
export type ReferenceIssueCode = 'missing-plan' | 'empty-selection' | 'missing-dish' |
  'missing-ingredient' | 'components-unrecorded' | 'dish-not-active' | 'missing-technique';
export interface ReferenceIssue {
  code: ReferenceIssueCode;
  menuPlanRef?: Id; date?: string; mealType?: MealType; dishRef?: Id;
  ingredientRef?: Id; mealIndex?: number; componentIndex?: number; techniqueRef?: Id;
}
export interface IngredientReferences { ingredientRef: Id; sources: IngredientSource[] }
export interface IngredientCollection {
  items: IngredientReferences[]; issues: ReferenceIssue[];
  coverage: { enumeration: 'complete' | 'incomplete'; references: 'resolved' | 'unresolved'; recipeCompleteness: 'unverified' };
}
const lookup = <T>(map: Record<string,T>, key: string): T | undefined => Object.hasOwn(map,key) ? map[key] : undefined;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const finiteNumbers = (value: unknown): boolean => typeof value === 'number' ? Number.isFinite(value)
  : value !== null && typeof value === 'object' ? Object.values(value).every(finiteNumbers) : true;
const selectionKey = (s: ShoppingSelection) => JSON.stringify([s.menuPlanRef,s.date,s.mealType]);
const ordered = <T>(values: T[]): T[] => values.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
const opaqueIssues = new Set<ReferenceIssueCode>(['missing-plan','missing-dish','components-unrecorded']);

/** Set semantics for selection; duplicate meals/components inside a plan retain multiplicity. */
export function normalizeSelection(selection: ShoppingSelection[]): ShoppingSelection[] {
  return [...new Map(selection.map(s=>[selectionKey(s),{
    menuPlanRef:s.menuPlanRef,date:s.date,mealType:s.mealType,
  }])).values()].sort((a,b)=>selectionKey(a).localeCompare(selectionKey(b),'en'));
}

export function collectIngredientReferences(inputs: TeamMealInputs, selection: ShoppingSelection[]): IngredientCollection {
  const candidates = new Map<Id, IngredientReferences>();
  const issues: ReferenceIssue[] = [];
  const techniques = new Set(inputs.techniques.map(t=>t.id));
  for (const slot of normalizeSelection(selection)) {
    const plan = lookup(inputs.menuPlans,slot.menuPlanRef);
    if (!plan) { issues.push({...slot,code:'missing-plan'}); continue; }
    let found = false;
    plan.meals.forEach((meal,mealIndex)=>{
      if (meal.date !== slot.date || meal.mealType !== slot.mealType) return;
      found = true;
      const address = {...slot,dishRef:meal.dishRef,mealIndex};
      const dish = lookup(inputs.dishes,meal.dishRef);
      if (!dish) { issues.push({...address,code:'missing-dish'}); return; }
      if (dish.status !== 'active') issues.push({...address,code:'dish-not-active'});
      if (!dish.components?.length) issues.push({...address,code:'components-unrecorded'});
      for (const [componentIndex,component] of (dish.components ?? []).entries()) {
        const ingredientRef = component.ingredientRef;
        const source: IngredientSource = {...address,componentIndex};
        if (meal.plannedServings !== undefined) source.plannedServings = meal.plannedServings;
        if (dish.baseServings !== undefined) source.baseServings = dish.baseServings;
        if (component.qty !== undefined) source.qty = clone(component.qty);
        let item = candidates.get(ingredientRef);
        if (!item) { item = {ingredientRef,sources:[]}; candidates.set(ingredientRef,item); }
        item.sources.push(source);
        if (!lookup(inputs.ingredients,ingredientRef)) issues.push({...address,componentIndex,ingredientRef,code:'missing-ingredient'});
        const techniqueRef = component.prep?.techniqueRef;
        if (techniqueRef && !techniques.has(techniqueRef)) issues.push({...address,componentIndex,ingredientRef,techniqueRef,code:'missing-technique'});
      }
      for (const step of dish.steps ?? []) {
        if (step.techniqueRef && !techniques.has(step.techniqueRef)) issues.push({...address,techniqueRef:step.techniqueRef,code:'missing-technique'});
      }
    });
    if (!found) issues.push({...slot,code:'empty-selection'});
  }
  return {
    items:[...candidates.values()].sort((a,b)=>a.ingredientRef.localeCompare(b.ingredientRef,'en')),issues,
    coverage:{
      enumeration:issues.some(i=>opaqueIssues.has(i.code)) ? 'incomplete' : 'complete',
      references:issues.some(i=>['missing-plan','missing-dish','missing-ingredient','missing-technique'].includes(i.code)) ? 'unresolved' : 'resolved',
      recipeCompleteness:'unverified',
    },
  };
}

// Scale base-ten input representations exactly; do not introduce binary float
// tails or round away genuinely different small demands while comparing units.
function decimalKey(value: number, shift: number): string {
  const [mantissa, exponent='0'] = value.toString().toLowerCase().split('e');
  const [whole, fraction=''] = mantissa!.split('.');
  let digits=(whole!+fraction).replace(/^0+/, '') || '0';
  let power=Number(exponent)-fraction.length+shift;
  while (digits.length>1 && digits.endsWith('0')) { digits=digits.slice(0,-1); power++; }
  return `${digits}e${power}`;
}
function normalizedQty(qty?: Quantity): unknown {
  if (!qty) return ['unknown'];
  if (qty.unit === 'to-taste') return ['to-taste'];
  return [qty.unit==='kg'?'g':qty.unit==='l'?'ml':qty.unit,
    qty.value===undefined ? null : decimalKey(qty.value,qty.unit==='kg'||qty.unit==='l'?3:0)];
}
export interface NormalizedDemand { selection: ShoppingSelection[]; ingredients: Record<Id,string> }
export function normalizeDemand(inputs: TeamMealInputs, selection: ShoppingSelection[]): NormalizedDemand {
  const scope = normalizeSelection(selection);
  const collection = collectIngredientReferences(inputs,scope);
  const context = ordered(collection.issues.filter(i=>opaqueIssues.has(i.code)).map(i=>{
    const plan=i.menuPlanRef ? lookup(inputs.menuPlans,i.menuPlanRef) : undefined;
    const meal=i.mealIndex===undefined ? undefined : plan?.meals[i.mealIndex];
    const dish=i.dishRef ? lookup(inputs.dishes,i.dishRef) : undefined;
    return [i.code,i.menuPlanRef,i.date,i.mealType,i.dishRef,
      meal?.plannedServings ?? null,plan?.margin ?? DEFAULT_MARGIN,
      dish?.baseServings ?? null,dish?.status ?? 'draft'];
  }));
  const ingredients: Record<Id,string> = {};
  for (const item of collection.items) {
    const ingredient = lookup(inputs.ingredients,item.ingredientRef);
    const sources = ordered(item.sources.map(s=>[
      s.menuPlanRef,s.date,s.mealType,s.dishRef,s.plannedServings ?? null,s.baseServings ?? null,
      normalizedQty(s.qty),lookup(inputs.menuPlans,s.menuPlanRef)?.margin ?? DEFAULT_MARGIN,
      lookup(inputs.dishes,s.dishRef)?.status ?? 'draft',
    ]));
    ingredients[item.ingredientRef] = JSON.stringify({context,sources,ingredient:ingredient
      ? [ingredient.baseUnit,ingredient.pcsToGram ?? null,ingredient.yield ?? 1] : ['unresolved']});
  }
  return {selection:scope,ingredients};
}

export class TeamMealsError extends Error {
  constructor(public code: string, message: string) { super(message); this.name='TeamMealsError'; }
}
function validateBasis(basis: ShoppingBasis, inputs: TeamMealInputs): void {
  if (!/^[0-9a-f]{40}$/.test(basis.sourceRevision)) throw new TeamMealsError('invalid_revision','A saved full revision is required');
  if (!basis.selection.length) throw new TeamMealsError('invalid_selection','A list must select at least one plan/date/meal');
  if (basis.selection.some(s=>!lookup(inputs.menuPlans,s.menuPlanRef))) throw new TeamMealsError('basis_unavailable','A selected plan is missing');
}
export function createShoppingList(id: Id, basis: ShoppingBasis, inputs: TeamMealInputs): ShoppingList {
  validateBasis(basis,inputs);
  return {shoppingListVersion:'1',id,basis:clone({...basis,selection:normalizeSelection(basis.selection)}),
    items:collectIngredientReferences(inputs,basis.selection).items.map(i=>({ingredientRef:i.ingredientRef,decision:'check'}))};
}
export function applyShoppingDecision(list: ShoppingList, ingredientRef: Id, decision: ShoppingDecision, bought?: boolean): ShoppingList {
  if (!['check','buy','available'].includes(decision) || (bought !== undefined && decision !== 'buy')) {
    throw new TeamMealsError('invalid_decision','Only buy supports purchase progress');
  }
  const result = clone(list);
  const item = result.items.find(i=>i.ingredientRef===ingredientRef);
  if (!item) throw new TeamMealsError('invalid_selection','Ingredient is not in this list');
  item.decision=decision;
  delete item.bought;
  if (bought !== undefined) item.bought=bought;
  delete item.previous;
  return result;
}
export interface ReconciledShoppingList {
  list: ShoppingList; added: Id[]; removed: ShoppingItem[]; reviewRequired: Id[]; retained: Id[];
}
export function reconcileShoppingList(previous: ShoppingList, previousInputs: TeamMealInputs, nextBasis: ShoppingBasis, nextInputs: TeamMealInputs): ReconciledShoppingList {
  validateBasis(previous.basis,previousInputs); validateBasis(nextBasis,nextInputs);
  const oldDemand=normalizeDemand(previousInputs,previous.basis.selection);
  const newDemand=normalizeDemand(nextInputs,nextBasis.selection);
  const sameScope=JSON.stringify(oldDemand.selection)===JSON.stringify(newDemand.selection);
  const oldItems=new Map(previous.items.map(i=>[i.ingredientRef,i]));
  if (oldItems.size !== previous.items.length || Object.keys(oldDemand.ingredients).some(id=>!oldItems.has(id)) || [...oldItems.keys()].some(id=>!Object.hasOwn(oldDemand.ingredients,id))) {
    throw new TeamMealsError('invalid_selection','Stored items must exactly match their basis');
  }
  const result: ReconciledShoppingList = {
    list:createShoppingList(previous.id,nextBasis,nextInputs),added:[],removed:[],reviewRequired:[],retained:[],
  };
  result.list.items=result.list.items.map(item=>{
    const old=oldItems.get(item.ingredientRef);
    if (!old) { result.added.push(item.ingredientRef); return item; }
    oldItems.delete(item.ingredientRef);
    if (sameScope && oldDemand.ingredients[item.ingredientRef]===newDemand.ingredients[item.ingredientRef]) {
      result.retained.push(item.ingredientRef);return clone(old);
    }
    result.reviewRequired.push(item.ingredientRef);
    if (old.decision !== 'check') {
      item.previous={basis:clone(previous.basis),decision:old.decision};
      if (old.bought !== undefined) item.previous.bought=old.bought;
    } else if (old.previous) item.previous=clone(old.previous);
    return item;
  });
  result.removed=clone([...oldItems.values()]);
  return result;
}

export type EstimateReasonCode = 'multiple-plans' | 'missing-planned-servings' | 'missing-base-servings' |
  'missing-qty' | 'to-taste' | 'dish-not-active' | 'missing-dish' | 'missing-ingredient' |
  'components-unrecorded' | 'missing-purchase' | 'unit-conversion-missing' | 'engine-issue';
export interface EstimateReason { code: EstimateReasonCode; source?: IngredientSource }
export type IngredientEstimate = {ingredientRef: Id; status:'complete'; reasons:EstimateReason[]; lines:ProcurementLine[]}
  | {ingredientRef: Id; status:'unavailable'; reasons:EstimateReason[]};
export interface ShoppingEstimate { items:IngredientEstimate[]; budgetStatus:'complete'|'incomplete'|'not-applicable' }
export function estimateShoppingList(inputs: TeamMealInputs, selection: ShoppingSelection[], at: string): ShoppingEstimate {
  // at is deliberately caller-owned; expansion has no clock and no price recomputation.
  void at;
  const scope=normalizeSelection(selection), collection=collectIngredientReferences(inputs,scope);
  const planIds=new Set(scope.map(s=>s.menuPlanRef));
  const items: IngredientEstimate[] = collection.items.map(item=>{
    const ingredient=lookup(inputs.ingredients,item.ingredientRef);
    const reasons: EstimateReason[]=[];
    if (planIds.size>1) reasons.push({code:'multiple-plans'});
    for (const issue of collection.issues.filter(i=>opaqueIssues.has(i.code))) {
      reasons.push({code:issue.code==='components-unrecorded'?'components-unrecorded':'missing-dish'});
    }
    if (!ingredient) reasons.push({code:'missing-ingredient'});
    else if (!ingredient.purchase) reasons.push({code:'missing-purchase'});
    for (const source of item.sources) {
      const add=(code:EstimateReasonCode)=>reasons.push({code,source:clone(source)});
      if (!source.plannedServings || !Number.isFinite(source.plannedServings)) add('missing-planned-servings');
      if (!source.baseServings || !Number.isFinite(source.baseServings)) add('missing-base-servings');
      if (lookup(inputs.dishes,source.dishRef)?.status !== 'active') add('dish-not-active');
      if (!source.qty) add('missing-qty');
      else if (source.qty.unit==='to-taste') add('to-taste');
      else if (!source.qty.value || !Number.isFinite(source.qty.value)) add('missing-qty');
      else if (ingredient && convertQuantity(source.qty.value,source.qty.unit,ingredient.baseUnit,ingredient)===null) add('unit-conversion-missing');
    }
    if (reasons.length) return {ingredientRef:item.ingredientRef,status:'unavailable',reasons};
    // Every occurrence of this ingredient is proven complete. Keep all those meals;
    // exclude other ingredients before delegating aggregation/rounding to original core.
    const planId=item.sources[0]!.menuPlanRef, original=lookup(inputs.menuPlans,planId)!;
    const indices=new Set(item.sources.map(s=>s.mealIndex));
    const plan: MenuPlan={...clone(original),schemaVersion:'2',meals:original.meals.filter((_,i)=>indices.has(i)).map(m=>({...clone(m),plannedServings:m.plannedServings!}))};
    const dishes: Record<Id,Dish>={};
    for (const source of item.sources) {
      const dish=lookup(inputs.dishes,source.dishRef)!;
      dishes[source.dishRef]={...clone(dish),schemaVersion:'2',components:(dish.components ?? [])
        .filter(c=>c.ingredientRef===item.ingredientRef).map(c=>({...clone(c),qty:clone(c.qty!)}))};
    }
    const result=expand(plan,dishes,inputs.ingredients);
    if (result.issues.length || result.pending.length || !finiteNumbers(result.lines)) {
      const conversion=result.issues.some(i=>i.code==='unit-conversion-missing');
      return {ingredientRef:item.ingredientRef,status:'unavailable',reasons:[{code:conversion?'unit-conversion-missing':'engine-issue'}]};
    }
    return {ingredientRef:item.ingredientRef,status:'complete',reasons:[],lines:clone(result.lines)};
  });
  const lines=items.flatMap(i=>i.status==='complete'?i.lines:[]);
  const currencies=new Set(lines.flatMap(l=>l.line.amount?[l.line.amount.currency]:[]));
  const opaque=collection.coverage.enumeration==='incomplete';
  const complete=!opaque && items.every(i=>i.status==='complete') && lines.every(l=>l.line.amount!==undefined)
    && currencies.size<=1 && Number.isFinite(lines.reduce((sum,l)=>sum+(l.line.amount?.amount ?? 0),0));
  return {items,budgetStatus:!items.length&&!opaque?'not-applicable':complete?'complete':'incomplete'};
}

/** Read-only projection context; selection may be empty. Never persist it as ShoppingBasis. */
export interface TeamProjectionContext { sourceRevision: string; selection: ShoppingSelection[] }
export interface TeamMealsProjection {
  projectionVersion:'1'; sourceRevision:string; selection:ShoppingSelection[];
  menuPlans:Record<Id,AnyMenuPlan>; dishes:Record<Id,AnyDish>;
  ingredients:Record<Id,Ingredient>; techniques:Technique[]; collection:IngredientCollection;
}
export function projectTeamMeals(inputs: TeamMealInputs, basis: TeamProjectionContext, options: {emptyMenuPlanRefs?: Id[]} = {}): TeamMealsProjection {
  if (!/^[0-9a-f]{40}$/.test(basis.sourceRevision)) throw new TeamMealsError('invalid_revision','Projection requires a full source revision');
  const scope=normalizeSelection(basis.selection), collection=collectIngredientReferences(inputs,scope);
  const menuPlans: Record<Id,AnyMenuPlan>={}, dishes: Record<Id,AnyDish>={}, ingredients: Record<Id,Ingredient>={};
  const techniqueIds=new Set<Id>();
  for (const id of options.emptyMenuPlanRefs ?? []) {
    const plan=lookup(inputs.menuPlans,id);
    if (scope.length || !plan || plan.meals.length) throw new TeamMealsError('invalid_selection','Empty projection must explicitly name an existing empty plan');
    menuPlans[id]=plan;
  }
  for (const slot of scope) {
    const plan=lookup(inputs.menuPlans,slot.menuPlanRef);
    if (!plan) continue;
    menuPlans[slot.menuPlanRef]=plan;
    for (const meal of plan.meals.filter(m=>m.date===slot.date&&m.mealType===slot.mealType)) {
      const dish=lookup(inputs.dishes,meal.dishRef); if (!dish) continue;
      dishes[meal.dishRef]=dish;
      for (const component of dish.components ?? []) if (component.prep?.techniqueRef) techniqueIds.add(component.prep.techniqueRef);
      for (const step of dish.steps ?? []) if (step.techniqueRef) techniqueIds.add(step.techniqueRef);
    }
  }
  for (const item of collection.items) if (lookup(inputs.ingredients,item.ingredientRef)) ingredients[item.ingredientRef]=lookup(inputs.ingredients,item.ingredientRef)!;
  return clone({projectionVersion:'1',sourceRevision:basis.sourceRevision,selection:scope,menuPlans,dishes,ingredients,
    techniques:inputs.techniques.filter(t=>techniqueIds.has(t.id)),collection});
}
