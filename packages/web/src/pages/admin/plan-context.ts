/** The plan explicitly opened in this signed-in app session. No repository or auth writes. */
import type {AnyMenuPlan} from '@canteenos/core';
import type {TeamMealsApi} from '../../api/team-meals';
import type {PageCtx} from '../../types';
let selected:{api:TeamMealsApi;session:number;id:string;name?:AnyMenuPlan['name']}|undefined;
export function selectPlan(api:TeamMealsApi,id:string,name?:AnyMenuPlan['name']):void {
 if(/^[a-z][a-z0-9-]*$/.test(id))selected={api,session:api.sessionKey(),id,name};
}
export function currentPlan(ctx:PageCtx,api:TeamMealsApi):{id:string|null;name?:AnyMenuPlan['name']} {
 return selected?.api===api&&selected.session===api.sessionKey()?selected:{id:ctx.planId};
}
