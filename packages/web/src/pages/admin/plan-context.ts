/** The plan explicitly opened in this signed-in app session. No repository or auth writes. */
import {datedPlanIdOfDate,isoWeekOf,mondayOfIsoWeek,type AnyMenuPlan} from '@canteenos/core';
import type {TeamMealsApi} from '../../api/team-meals';
import type {PageCtx} from '../../types';
let selected:{api:TeamMealsApi;session:number;id:string;name?:AnyMenuPlan['name']}|undefined;
export function selectPlan(api:TeamMealsApi,id:string,name?:AnyMenuPlan['name']):void {
 if(/^[a-z][a-z0-9-]*$/.test(id))selected={api,session:api.sessionKey(),id,name};
}
export function currentPlan(ctx:PageCtx,api:TeamMealsApi):{id:string|null;name?:AnyMenuPlan['name']} {
 if(ctx.planSelection)return {id:ctx.planId,name:ctx.planSelection.choices.find(choice=>choice.id===ctx.planId)?.name};
 return selected?.api===api&&selected.session===api.sessionKey()?selected:{id:ctx.planId};
}

/** Reuse a saved plan for this ISO week, including old week-N IDs, before creating a dated ID. */
export async function planForCurrentWeek(ctx:PageCtx,api:TeamMealsApi,today:string):Promise<{id:string;weekStart:string}> {
 const week=isoWeekOf(today),id=datedPlanIdOfDate(today);
 if(!week||!id)throw new Error('Invalid local date');
 const weekStart=mondayOfIsoWeek(week.year,week.week);
 if(!weekStart)throw new Error('Invalid ISO week');
 const end=new Date(`${weekStart}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+6);
 const weekEnd=end.toISOString().slice(0,10);
 if(api.mode==='unconfigured')return {id,weekStart};
 const candidates=[currentPlan(ctx,api).id,`week-${week.week}`,id].filter((value):value is string=>!!value&&/^[a-z][a-z0-9-]*$/.test(value));
 for(const candidate of new Set(candidates)){
  const source=await api.getPlan(candidate);
  if(!source)continue;
  const range=source.content.dateRange;
  if(range&&range.start<=weekStart&&range.end>=weekEnd)return {id:candidate,weekStart};
  if(candidate===id)throw new Error('Current-week plan ID already belongs to another date range');
 }
 return {id,weekStart};
}
