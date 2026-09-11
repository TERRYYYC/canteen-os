/** Page-owned form adapter. C1 remains the sole owner of document/save state. */
import { upgradeMenuPlan, type AnyMenuPlan, type MealType, type MenuPlanV3 } from '@canteenos/core';
import type { TeamMealsApi, TeamCatalog } from '../../api/team-meals';
import type { Source } from '../../api/types';
import { createEditSession } from '../../view-models/edit-session';

export function toSavePlan(s: { plan: AnyMenuPlan }): MenuPlanV3 { return upgradeMenuPlan(s.plan); }

export function createPlanForm(api: TeamMealsApi) {
  const session = createEditSession<AnyMenuPlan>({
    mode: () => api.mode, authSession: () => api.sessionKey(),
    save: (identity, body, condition) => api.savePlan(identity.id, body, condition),
    read: (identity, options) => api.getPlan(identity.id, options),
  });
  const known = new Set<string>();
  const catalogs = new Map<string, TeamCatalog>();
  let sequence = 0;
  const mutate = (fn: (draft: MenuPlanV3) => void, contextId = session.getState().contextId) => {
    const state = session.getState();
    if (!state.draft || state.contextId !== contextId) return false;
    const next = toSavePlan({plan: state.draft}); fn(next);
    return session.edit(next, contextId);
  };
  return {
    session, api,
    async load(id: string, isCurrent: () => boolean = () => true): Promise<TeamCatalog | null> {
      const ticket = ++sequence, auth = api.sessionKey();
      const live = () => ticket === sequence && isCurrent() && auth === api.sessionKey();
      if (known.has(id)) {
        const state = session.getState();
        if (state.identity?.id === id && state.phase !== 'closed') session.refreshView();
        else session.open({kind:'plan',id},{schemaVersion:'3',meals:[]},null);
        return catalogs.get(id) ?? null;
      }
      const source = await api.getPlan(id);
      if (!live()) return null;
      // A failed catalog cannot turn a genuine source into an empty document.
      const initial: AnyMenuPlan = source ? toSavePlan({plan: source.content}) : {schemaVersion:'3',meals:[]};
      session.open({kind:'plan',id},initial,source); known.add(id);
      const catalog = await api.getCatalog(source ? {revision:source.commit} : {});
      if (!live()) return null;
      catalogs.set(id,catalog); return catalog;
    },
    async loadCatalog(): Promise<TeamCatalog> {
      const state=session.getState(), auth=api.sessionKey();
      const catalog=await api.getCatalog(state.source ? {revision:state.source.commit,force:true} : {force:true});
      if(auth===api.sessionKey() && state.identity) catalogs.set(state.identity.id,catalog);
      return catalog;
    },
    servings(index: number, raw: string, contextId?: number) {
      const value = raw.trim() === '' ? undefined : Number(raw);
      if (value !== undefined && (!Number.isInteger(value) || value < 1)) throw new Error('invalid_servings');
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
