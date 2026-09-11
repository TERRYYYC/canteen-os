/** Page-owned form adapter. C1 remains the sole owner of document/save state. */
import { upgradeMenuPlan, type AnyMenuPlan, type MealType, type MenuPlanV3 } from '@canteenos/core';
import type { TeamMealsApi, TeamCatalog } from '../../api/team-meals';
import type { Source } from '../../api/types';
import { createEditSession } from '../../view-models/edit-session';
import { parseServingsInput } from './servings-input';

export function toSavePlan(s: { plan: AnyMenuPlan }): MenuPlanV3 { return upgradeMenuPlan(s.plan); }

export function createPlanForm(api: TeamMealsApi) {
  const session = createEditSession<AnyMenuPlan>({
    mode: () => api.mode, authSession: () => api.sessionKey(),
    save: (identity, body, condition) => api.savePlan(identity.id, body, condition),
    read: (identity, options) => api.getPlan(identity.id, options),
  });
  const known = new Set<string>();
  // Catalogs are versioned data, never metadata owned by a plan id.
  const catalogs = new Map<string, TeamCatalog>();
  const pending = new Map<string, Promise<TeamCatalog>>();
  let sequence = 0;
  const loadCatalog = async (force = false): Promise<TeamCatalog> => {
    const state = session.getState(), auth = api.sessionKey();
    const revision = state.source?.commit;
    const key = revision ?? 'current-unsaved';
    if (!force && catalogs.has(key)) return catalogs.get(key)!;
    if (pending.has(key)) return pending.get(key)!;
    const request = api.getCatalog({...(revision ? {revision} : {}), ...(force ? {force:true} : {})}).then(catalog => {
      if (revision && catalog.commit !== revision) throw new Error('catalog_revision_mismatch');
      if (auth === api.sessionKey()) catalogs.set(key,catalog);
      return catalog;
    }).finally(() => pending.delete(key));
    pending.set(key,request); return request;
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
        const source = await api.getPlan(id);
        if (!live()) return null;
        const initial: AnyMenuPlan = source ? toSavePlan({plan: source.content}) : {schemaVersion:'3',meals:[]};
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
    loadCatalog,
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
      return api.getPlan(state.identity.id,{force:true});
    },
    detach() { sequence++; session.invalidate(); },
  };
}
