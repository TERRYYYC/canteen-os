/** Page-owned form adapter. C1 remains the sole owner of document/save state. */
import { upgradeMenuPlan, weekStartOfPlanId, type AnyMenuPlan, type MealType, type MenuPlanV3 } from '@canteenos/core';
import type { TeamMealsApi, TeamCatalog } from '../../api/team-meals';
import type { Source } from '../../api/types';
import { createEditSession } from '../../view-models/edit-session';
import { parseServingsInput } from './servings-input';
import { connectPlanImport } from './plan-import';
import { localDateIso } from '../../local-date';

export function toSavePlan(s: { plan: AnyMenuPlan }): MenuPlanV3 { return upgradeMenuPlan(s.plan); }

const MEAL_ORDER: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2 };

export interface PlanHints {
  /** Rows that have a dish. */
  readonly dishes: number;
  /** Different dishRef values. */
  readonly different: number;
  /** dishRef values that appear more than once. */
  readonly repeated: number;
  /** Row index -> this row's turn in the plan, and the date of the turn before it. */
  readonly turns: ReadonlyMap<number, { readonly nth: number; readonly previous?: string }>;
}

/** Recomputed from the plan being edited, saved or not. It never reads another plan. */
export function planHints(plan: AnyMenuPlan): PlanHints {
  const byDish = new Map<string, number[]>();
  plan.meals.forEach((meal, index) => { if (meal.dishRef) byDish.set(meal.dishRef, [...(byDish.get(meal.dishRef) ?? []), index]); });
  const turns = new Map<number, { nth: number; previous?: string }>();
  let repeated = 0, dishes = 0;
  for (const indices of byDish.values()) {
    dishes += indices.length;
    if (indices.length < 2) continue;
    repeated++;
    const ordered = [...indices].sort((a, b) => {
      const x = plan.meals[a]!, y = plan.meals[b]!;
      return x.date.localeCompare(y.date) || MEAL_ORDER[x.mealType] - MEAL_ORDER[y.mealType] || a - b;
    });
    ordered.forEach((index, at) => turns.set(index, { nth: at + 1, ...(at > 0 ? { previous: plan.meals[ordered[at - 1]!]!.date } : {}) }));
  }
  return { dishes, different: byDish.size, repeated, turns };
}

export function createPlanForm(api: TeamMealsApi, options: { beginRead?(id: string): { finish(failed: boolean): void }; remapRows?(id:string,order:number[]):()=>void } = {}) {
  async function read<T>(id: string, request: () => Promise<T>): Promise<T> {
    const operation = options.beginRead?.(id);
    try { const value = await request(); operation?.finish(false); return value; }
    catch (error) { operation?.finish(true); throw error; }
  }
  const session = createEditSession<AnyMenuPlan>({
    mode: () => api.mode, authSession: () => api.sessionKey(),
    peekAuthSession: () => api.peekSessionKey?.(),
    save: (identity, body, condition) => api.savePlan(identity.id, body, condition),
    read: (identity, options) => api.getPlan(identity.id, options),
  });
  const known = new Set<string>();
  connectPlanImport(api,(id,merge,live)=>{
    if(!known.has(id))return 'absent';
    // open resumes the real record, including detached pending/unknown/conflict state.
    session.open({kind:'plan',id},{schemaVersion:'3',meals:[]},null);
    const state=session.getState();
    if(!live()||state.phase==='closed'||state.identity?.id!==id||!state.draft)return 'rejected';
    const {plan,order}=merge(state.draft),restore=options.remapRows?.(id,order);
    let accepted=false;
    try{accepted=live()&&session.edit(plan,state.contextId);return accepted?'applied':'rejected';}
    finally{if(!accepted)restore?.();}
  });
  // Catalogs are versioned data, never metadata owned by a plan id.
  const catalogs = new Map<string, TeamCatalog>();
  const pending = new Map<string, Promise<TeamCatalog>>();
  let sequence = 0;
  const mutationVersion = () => api.mutationVersion?.() ?? 0;
  const initialMutation = mutationVersion();
  const catalogBindings = new WeakMap<TeamCatalog, string>();
  const bindCatalog = (catalog: TeamCatalog, revision: string | undefined, mutation: number) => {
    catalogBindings.set(catalog,`${revision??'current-unsaved'}/${mutation}`);
    return catalog;
  };
  // A newer choice catalog belongs to this editor's source baseline, without replacing it.
  const latestCatalogs = new Map<string, { sourceCommit?: string; mutation: number; catalog: TeamCatalog }>();
  const loadLatestCatalog = async (): Promise<TeamCatalog> => {
    const state=session.getState(),auth=api.sessionKey();
    if(!state.identity)throw new Error('plan_not_open');
    const id=state.identity.id,sourceCommit=state.source?.commit;
    let mutation: number, catalog: TeamCatalog;
    do {
      mutation=mutationVersion();
      catalog=await read(id,()=>api.getCatalog({force:true}));
      if(auth!==api.sessionKey())throw new Error('session_changed');
      // A write may finish while an older HEAD request is in flight.
    } while(mutation!==mutationVersion());
    latestCatalogs.set(id,{sourceCommit,mutation,catalog});
    return bindCatalog(catalog,sourceCommit,mutation);
  };
  const loadCatalog = async (force = false): Promise<TeamCatalog> => {
    const state = session.getState(), auth = api.sessionKey(), mutation = mutationVersion();
    const revision = state.source?.commit;
    const latest = latestCatalogs.get(state.identity!.id);
    if (!force && latest && latest.sourceCommit === revision && latest.mutation === mutation) return latest.catalog;
    if (mutation !== initialMutation) return loadLatestCatalog();
    const key = revision ?? 'current-unsaved';
    if (!force && catalogs.has(key)) return catalogs.get(key)!;
    let request = pending.get(key);
    if (!request) {
      request = read(state.identity!.id, () => api.getCatalog({...(revision ? {revision} : {}), ...(force ? {force:true} : {})})).then(catalog => {
        if (revision && catalog.commit !== revision) throw new Error('catalog_revision_mismatch');
        if (auth === api.sessionKey() && mutation === mutationVersion()) catalogs.set(key,catalog);
        return bindCatalog(catalog,revision,mutation);
      }).finally(() => pending.delete(key));
      pending.set(key,request);
    }
    const catalog = await request;
    return mutation === mutationVersion() ? catalog : loadLatestCatalog();
  };
  const mutate = (fn: (draft: MenuPlanV3) => void, contextId = session.getState().contextId) => {
    const state = session.getState();
    if (!state.draft || state.contextId !== contextId) return false;
    const next = toSavePlan({plan: state.draft}); fn(next);
    return session.edit(next, contextId);
  };
  return {
    session, api,
    async load(id: string, isCurrent: () => boolean = () => true, imported?: AnyMenuPlan, consumed?: () => void): Promise<TeamCatalog | null> {
      const ticket = ++sequence, auth = api.sessionKey();
      const live = () => ticket === sequence && isCurrent() && auth === api.sessionKey();
      if (known.has(id)) {
        const state = session.getState();
        if (state.identity?.id === id && state.phase !== 'closed') session.refreshView();
        else session.open({kind:'plan',id},{schemaVersion:'3',meals:[]},null);
      } else {
        const source = await read(id, () => api.getPlan(id));
        if (!live()) return null;
        const start=!source&&/^week-\d{4}-\d{1,2}$/.test(id)?weekStartOfPlanId(id,localDateIso()):null;
        const dateRange=start?{start,end:new Date(Date.parse(`${start}T12:00:00Z`)+6*86400000).toISOString().slice(0,10)}:undefined;
        const initial: AnyMenuPlan = source ? toSavePlan({plan: source.content}) : {schemaVersion:'3',...(dateRange?{dateRange}:{}),meals:[]};
        session.open({kind:'plan',id},initial,source); known.add(id);
      }
      // Import before the next asynchronous boundary: later typing is always newer.
      const state = session.getState();
      if (imported && !state.operationId && state.phase !== 'conflict') {
        if (session.edit(toSavePlan({plan:imported}),state.contextId)) consumed?.();
      }
      const catalog = await loadCatalog();
      return live() ? catalog : null;
    },
    loadCatalog,loadLatestCatalog,
    catalogKey: (catalog: TeamCatalog | null) => catalog && catalogBindings.get(catalog),
    servings(index: number, raw: string, contextId?: number) {
      const parsed = parseServingsInput(raw);
      if (!parsed.valid) throw new Error('invalid_servings');
      const {value} = parsed;
      return mutate(plan => {const meal=plan.meals[index]; if(!meal)return; if(value===undefined) delete meal.plannedServings; else meal.plannedServings=value;},contextId);
    },
    add(date: string, mealType: MealType, dishRef: string, contextId?: number) {
      return mutate(plan => {plan.meals.push({date,mealType,dishRef});},contextId);
    },
    changeDish(index: number, dishRef: string, contextId?: number) {
      return mutate(plan => {const meal=plan.meals[index]; if(meal)meal.dishRef=dishRef;},contextId);
    },
    remove(index: number, contextId?: number) {return mutate(plan => {plan.meals.splice(index,1);},contextId);},
    async compareRemote(): Promise<Source<AnyMenuPlan> | null> {
      const state=session.getState(); if(!state.identity)return null;
      return read(state.identity.id, () => api.getPlan(state.identity!.id,{force:true}));
    },
    detach() { sequence++; session.invalidate(); },
  };
}
