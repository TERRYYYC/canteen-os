/** Fixed-input orchestration for team pages. Core owns all demand semantics; C1 owns writes. */
import {
  applyShoppingDecision, collectIngredientReferences, createShoppingList, estimateShoppingList,
  normalizeSelection, projectTeamMeals, reconcileShoppingList, TeamMealsError,
} from '@canteenos/core';
import type {
  IngredientCollection, ReconciledShoppingList, ShoppingDecision, ShoppingEstimate,
  ShoppingList, ShoppingSelection, TeamMealInputs, TeamMealsProjection,
} from '@canteenos/core';
import { requireRevision } from '../api/team-meals';
import type { AssetQuery, RevisionAsset, TeamMealsApi } from '../api/team-meals';
import { ApiError } from '../api/types';
import type { Source } from '../api/types';

export interface SavedViewRequest {
  revision: string;
  selection: ShoppingSelection[];
  at: string;
  emptyMenuPlanRefs?: string[];
  force?: boolean;
}
declare const savedViewBrand: unique symbol;
/** Frozen, session-bound handle. Cloning or reconstructing it does not preserve provenance. */
export interface SavedTeamMealsView {
  readonly [savedViewBrand]: true;
  readonly kind: 'saved';
  readonly mode: 'real' | 'mock';
  readonly sourceRevision: string;
  readonly projection: TeamMealsProjection;
  readonly estimate: ShoppingEstimate;
}
export interface DraftViewRequest { inputs: TeamMealInputs; selection: ShoppingSelection[]; at: string }
export interface DraftTeamMealsView {
  kind: 'draft'; selection: ShoppingSelection[]; collection: IngredientCollection; estimate: ShoppingEstimate;
}
export interface ShoppingListView { source: Source<ShoppingList>; basis: SavedTeamMealsView }
export interface ShoppingReviewView {
  previous: SavedTeamMealsView; next: SavedTeamMealsView; result: ReconciledShoppingList;
}
export interface TeamMealsViewModel {
  loadSaved(request: SavedViewRequest): Promise<SavedTeamMealsView>;
  loadList(id: string, options: {at:string; revision?:string; force?:boolean}): Promise<ShoppingListView | null>;
  createList(id: string, basis: SavedTeamMealsView): ShoppingList;
  decide(list: ShoppingList, basis: SavedTeamMealsView, ingredientRef: string, decision: ShoppingDecision, bought?: boolean): ShoppingList;
  reviewList(previous: ShoppingList, next: SavedTeamMealsView, options: {at:string; force?:boolean}): Promise<ShoppingReviewView>;
  getAsset(basis: SavedTeamMealsView, query: Omit<AssetQuery,'revision'>): Promise<RevisionAsset>;
  dispose(): void;
}

/** Pure local preview; it never supplies a revision, ShoppingBasis or persistent list. */
export function previewTeamMealsDraft({inputs,selection,at}: DraftViewRequest): DraftTeamMealsView {
  const scope=normalizeSelection(selection);
  return {kind:'draft',selection:scope,collection:collectIngredientReferences(inputs,scope),
    estimate:estimateShoppingList(inputs,scope,at)};
}

function freeze<T>(value: T): T {
  if (value && typeof value==='object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const fail=(code: string): never => { throw new ApiError(0,code,''); };
function derive<T>(run: () => T): T {
  try { return run(); }
  catch (error) { if (error instanceof TeamMealsError) return fail(error.code); throw error; }
}
const basisOf=(view: SavedTeamMealsView) => ({sourceRevision:view.sourceRevision,selection:view.projection.selection});

/** One reader per authenticated API lifetime. No mutable projection store, subscriptions or writes. */
export function createTeamMealsViewModel(api: TeamMealsApi): TeamMealsViewModel {
  const session=api.sessionKey(), mode=api.mode;
  let active=true;
  let snapshots=new WeakMap<SavedTeamMealsView,TeamMealInputs>();
  function dispose(): void { active=false; snapshots=new WeakMap(); }
  function guard(): void {
    if (!active || api.sessionKey()!==session || api.mode!==mode) { dispose(); fail('session_changed'); }
    if (mode==='unconfigured') fail('worker_unconfigured');
  }
  function inputsOf(view: SavedTeamMealsView): TeamMealInputs {
    guard();
    const inputs=snapshots.get(view);
    if (!inputs) return fail('invalid_view');
    return inputs;
  }
  function assertListBasis(list: ShoppingList, view: SavedTeamMealsView, inputs: TeamMealInputs): void {
    const basis=basisOf(view);
    if (list.basis.sourceRevision!==basis.sourceRevision ||
      JSON.stringify(normalizeSelection(list.basis.selection))!==JSON.stringify(basis.selection)) fail('basis_mismatch');
    // Formal core verifies exact membership, including duplicates. No parallel Web candidate algorithm.
    derive(()=>reconcileShoppingList(list,inputs,basis,inputs));
  }
  async function loadSaved(request: SavedViewRequest): Promise<SavedTeamMealsView> {
    guard();
    // Capture every caller-owned field before the first await.
    const {revision,selection,at,emptyMenuPlanRefs=[],force}=structuredClone(request);
    requireRevision(revision);
    if (!selection.length && !emptyMenuPlanRefs.length) fail('invalid_selection');
    if (selection.length && emptyMenuPlanRefs.length) fail('invalid_selection');
    const planIds=[...new Set([...selection.map(s=>s.menuPlanRef),...emptyMenuPlanRefs])];
    const options={revision,force};
    const [catalog,plans]=await Promise.all([
      api.getCatalog(options),
      Promise.all(planIds.map(async id=>({id,source:await api.getPlan(id,options)}))),
    ]);
    guard();
    // C1 already checks these; keep provenance explicit for injected TeamMealsApi adapters too.
    if (catalog.commit!==revision || plans.some(p=>p.source && p.source.commit!==revision)) fail('revision_mismatch');
    if (plans.some(p=>!p.source)) fail('basis_unavailable');
    const inputs: TeamMealInputs=structuredClone({
      menuPlans:Object.fromEntries(plans.map(p=>[p.id,p.source!.content])),
      dishes:catalog.dishes,ingredients:catalog.ingredients,techniques:catalog.techniques,
    });
    const view=freeze({kind:'saved',mode,sourceRevision:revision,
      projection:derive(()=>projectTeamMeals(inputs,{sourceRevision:revision,selection},{emptyMenuPlanRefs})),
      estimate:estimateShoppingList(inputs,selection,at),
    }) as SavedTeamMealsView;
    snapshots.set(view,inputs);
    return view;
  }
  async function loadList(id: string, options: {at:string; revision?:string; force?:boolean}): Promise<ShoppingListView | null> {
    guard();
    const {at,revision,force}=structuredClone(options);
    const source=await api.getShoppingList(id,{revision,force});
    guard();
    if (!source) return null;
    if (source.content.id!==id) fail('bad_response');
    const basis=await loadSaved({revision:source.content.basis.sourceRevision,
      selection:source.content.basis.selection,at,force});
    guard();
    assertListBasis(source.content,basis,inputsOf(basis));
    return {source,basis};
  }
  function createList(id: string, view: SavedTeamMealsView): ShoppingList {
    const inputs=inputsOf(view);
    return derive(()=>createShoppingList(id,basisOf(view),inputs));
  }
  function decide(list: ShoppingList, view: SavedTeamMealsView, ingredientRef: string, decision: ShoppingDecision, bought?: boolean): ShoppingList {
    const inputs=inputsOf(view);
    assertListBasis(list,view,inputs);
    if (decision!=='check' && !Object.hasOwn(inputs.ingredients,ingredientRef)) fail('unresolved_ingredient');
    return derive(()=>applyShoppingDecision(list,ingredientRef,decision,bought));
  }
  async function reviewList(previous: ShoppingList, next: SavedTeamMealsView, options: {at:string; force?:boolean}): Promise<ShoppingReviewView> {
    const nextInputs=inputsOf(next), old=structuredClone(previous), {at,force}=structuredClone(options);
    const oldView=await loadSaved({revision:old.basis.sourceRevision,selection:old.basis.selection,at,force});
    guard();
    return {previous:oldView,next,result:derive(()=>reconcileShoppingList(old,inputsOf(oldView),basisOf(next),nextInputs))};
  }
  async function getAsset(view: SavedTeamMealsView, query: Omit<AssetQuery,'revision'>): Promise<RevisionAsset> {
    inputsOf(view);
    const result=await api.getAsset({...query,revision:view.sourceRevision});
    guard();
    if (result.sourceRevision!==view.sourceRevision) fail('revision_mismatch');
    return result;
  }
  return {loadSaved,loadList,createList,decide,reviewList,getAsset,dispose};
}
