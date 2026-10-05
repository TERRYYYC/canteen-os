/** App-owned public plan identity. It never owns an editor, shopping basis, or auth. */
import {datedPlanIdOfDate,isoWeekOf,mondayOfIsoWeek,type AnyMenuPlan,type MealType} from '@canteenos/core';
import type {DataApi,Publication} from './data';
import type {Lang} from './i18n';
import {localDateIso} from './local-date';
import type {Route} from './router';

export const validPlanId=(id:unknown):id is string=>typeof id==='string'&&/^[a-z][a-z0-9-]*$/.test(id);
export interface PlanChoice {readonly id:string;readonly name?:AnyMenuPlan['name'];readonly start?:string;readonly end?:string}
export interface PlanSlot {readonly date:string;readonly mealType:MealType}
export interface PlanSelection {
 readonly id:string|null;
 readonly choices:readonly PlanChoice[];
 readonly slot?:PlanSlot|null;
 select(id:string,name?:AnyMenuPlan['name']):void;
 selectSlot?(date:string,mealType:MealType):void;
 /** A page may bind a newly painted link to its displayed slot; plan identity stays fixed. */
 href(page:Route,rest?:string,displayedSlot?:PlanSlot):string;
}
const storageKey='canteenos.selected-plan';
export function planHref(page:Route,rest='',id:string|null=null):string {
 const path=`#/${page}${rest?'/'+rest.split('/').map(encodeURIComponent).join('/'):''}`;
 return validPlanId(id)?`${path}?plan=${encodeURIComponent(id)}`:path;
}
export function routePlanId(page:Route,rest:string):string|null {
 const parts=rest.split('/');
 const id=page==='admin'&&parts[0]==='plan'&&parts[1]!=='import'?parts[1]:page==='purchase'&&parts[0]==='new'?parts[1]:undefined;
 return validPlanId(id)?id:null;
}
const shift=(date:string,days:number)=>new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);
export function weekPlanId(offset=0,today=localDateIso()):string {
 return datedPlanIdOfDate(shift(today,offset*7))!;
}
export function planChoiceLabel(choice:PlanChoice,lang:Lang):string {
 const name=choice.name?.[lang]??choice.name?.zh??choice.name?.en??choice.name?.uk;
 const dates=choice.start?`${choice.start}${choice.end&&choice.end!==choice.start?' — '+choice.end:''}`:'';
 return [name||({zh:'菜单计划',en:'Meal plan',uk:'План меню'})[lang],dates].filter(Boolean).join(' · ');
}
export function createPlanSelection(storage:Pick<Storage,'getItem'|'setItem'>|null=null) {
 let selected:string|null=null,explicit=false,choices:PlanChoice[]=[],generation=0;
 const privateNames=new Map<string,AnyMenuPlan['name']>();
 const slots=new Map<string,{date:string;mealType:MealType}>();
 const slotHref=(page:Route,rest:string|undefined,id:string|null,slot:ReturnType<typeof slots.get>)=>{
  const fallback=slot&&(page==='menu'||page==='prep')?`${slot.date}${page==='prep'?'/'+slot.mealType:''}`:'';
  const path=planHref(page,rest||fallback,id);
  return slot&&(page==='menu'||page==='prep')&&validPlanId(id)?`${path}&meal=${slot.mealType}`:path;
 };
 const visibleChoices=()=>[...choices.map(choice=>({...choice,...(privateNames.has(choice.id)?{name:privateNames.get(choice.id)}:{})})),
  ...[...privateNames].filter(([id])=>!choices.some(choice=>choice.id===id)).map(([id,name])=>({id,name}))];
 try{const remembered=storage?.getItem(storageKey);if(validPlanId(remembered)){selected=remembered;explicit=true;}}catch{/* Public navigation also works with storage disabled. */}
 const select=(id:string,name?:AnyMenuPlan['name'])=>{
  if(!validPlanId(id))return;
  selected=id;explicit=true;
  if(name)privateNames.set(id,name);
  try{storage?.setItem(storageKey,id);}catch{/* URL remains the copyable identity. */}
 };
 return {
  get id(){return selected;},get choices(){return visibleChoices();},select,
  selectSlot(date:string,mealType:MealType){const at=Date.parse(`${date}T12:00:00Z`);if(selected&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(at)&&new Date(at).toISOString().slice(0,10)===date&&['breakfast','lunch','dinner'].includes(mealType))slots.set(selected,{date,mealType});},
  clearPrivateNames(){privateNames.clear();},
  href(page:Route,rest='',displayedSlot?:PlanSlot){return slotHref(page,rest,selected,displayedSlot??(selected?slots.get(selected):undefined));},
  snapshot():PlanSelection{const id=selected,slot=id?slots.get(id):undefined;return {id,choices:visibleChoices(),slot:slot??null,select,href:(page,rest='',displayedSlot)=>slotHref(page,rest,id,displayedSlot??slot)};},
  async resolve(publication:Publication|null,data:DataApi,today=localDateIso()):Promise<boolean>{
   const ticket=++generation;
   if(!publication){choices=[];if(!explicit)selected=null;return true;}
   const next=await Promise.all(publication.manifest.plans.map(async id=>{
    try{
     if(publication.kind==='team-meals'){
      const loaded=await data.loadPublishedTeamPlan(publication,id),plan=loaded.projection.menuPlans[id];
      if(!plan)return {id};
      const dates=plan.meals.map(meal=>meal.date).sort(),range=plan.dateRange;
      return {id,name:plan.name,start:range?.start??dates[0],end:range?.end??dates.at(-1)};
     }
     const sheet=await data.loadMenu(id),dates=sheet.days.map(day=>day.date).sort();
     return {id,start:dates[0],end:dates.at(-1)};
    }catch{return {id};}
   }));
   if(ticket!==generation)return false;
   choices=next;
   if(!explicit){
    const week=isoWeekOf(today),monday=week&&mondayOfIsoWeek(week.year,week.week);
    const end=monday&&shift(monday,13);
    const dated=next.filter(choice=>choice.start&&choice.end&&monday&&end&&choice.end>=today&&choice.start<=end)
      .sort((a,b)=>Number(!(a.start!<=today&&a.end!>=today))-Number(!(b.start!<=today&&b.end!>=today))||a.start!.localeCompare(b.start!)||a.id.localeCompare(b.id));
    selected=dated[0]?.id??(publication.kind==='legacy'&&next.length===1?next[0]!.id:null);
   }
   return true;
  },
 };
}
