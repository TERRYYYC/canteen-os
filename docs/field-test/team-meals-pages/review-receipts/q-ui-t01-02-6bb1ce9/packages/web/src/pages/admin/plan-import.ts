/** Synchronous page capability only. JSON and save operations stay in the original C1 session. */
import type {AnyMenuPlan, MenuPlanV3} from '@canteenos/core';
import type {TeamMealsApi} from '../../api/team-meals';
export type ImportPlan = (base:AnyMenuPlan)=>{plan:MenuPlanV3;order:number[]};
export type ImportResult = 'absent'|'applied'|'rejected';
type Apply = (id:string,merge:ImportPlan,live:()=>boolean)=>ImportResult;
const targets=new WeakMap<TeamMealsApi,{auth:number;mode:TeamMealsApi['mode'];apply:Apply}>();
export function connectPlanImport(api:TeamMealsApi,apply:Apply):void {
 targets.set(api,{auth:api.sessionKey(),mode:api.mode,apply});
}
export function applyPlanImport(api:TeamMealsApi,id:string,merge:ImportPlan,live:()=>boolean):ImportResult {
 const target=targets.get(api);
 if(!target)return 'absent';
 if(target.auth!==api.sessionKey()||target.mode!==api.mode||!live())return 'rejected';
 return target.apply(id,merge,live);
}
