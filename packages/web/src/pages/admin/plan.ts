/** Team plan page. D0 design: docs/design/team-meals-pages/. */
import './plan.css';
import { weekStartOfPlanId, planIdOfDate, type MealType, type AnyMenuPlan } from '@canteenos/core';
import { getTeamMealsApi, type TeamMealsApi, type TeamCatalog } from '../../api/team-meals';
import { ApiError, type Source } from '../../api/types';
import { apiMessage } from '../../admin/kit';
import { getDraftPlan, clearDraftPlan } from '../../admin/store';
import { h, replace } from '../../dom';
import { pick } from '../../i18n';
import type { PageCtx } from '../../types';
import { adminHref } from '../admin';
import { text, action, field, status, onDetached } from '../team-ui';
import { createPlanForm, toSavePlan } from './plan-form';
export { createPlanForm } from './plan-form';
// toSavePlan intentionally remains local: the regression probe exercises the real page serializer.
void toSavePlan;
const meals:MealType[]=['breakfast','lunch','dinner'];
interface View { range:'all'|'day'|'week'; date:string; invalid:Map<number,string>; addDate:string; addMeal:MealType; addDish:string }

/** An injected API changes transport only; browser fixtures still execute this production page. */
export function createPlanRenderer(api:TeamMealsApi) {
  let form=createPlanForm(api),auth=api.sessionKey();
  const views=new Map<string,View>();
  let cleanup:()=>void=()=>{};
  return async function renderPlan(el:HTMLElement,ctx:PageCtx,rest:string):Promise<void> {
    cleanup();
    if(auth!==api.sessionKey()){form=createPlanForm(api);auth=api.sessionKey();views.clear();}
    const owner=form, lang=ctx.lang, tr=(key:Parameters<typeof text>[1])=>text(lang,key);
    const id=rest||ctx.planId||planIdOfDate(new Date().toISOString().slice(0,10))||'';
    if(!/^[a-z][a-z0-9-]*$/.test(id)){el.append(h('p',{role:'alert'},tr('error')));return;}
    el.classList.add('tm-page');
    const header=h('div',{class:'tm-head'},h('a',{href:adminHref()},tr('back')),h('h2',{},tr('plan')),h('a',{href:adminHref('plan',id,'import')},tr('import')));
    const body=h('div',{});el.append(header,body);
    if(api.mode==='unconfigured'){body.append(h('div',{class:'tm-status',role:'status'},tr('unconfigured')));return;}
    let catalog:TeamCatalog|null=null,loadError:unknown=null,remote:Source<AnyMenuPlan>|null|undefined;
    let compareError:unknown=null,comparing=false,contextId=0;
    const today=new Date().toISOString().slice(0,10);
    const defaultDate=weekStartOfPlanId(id,today)??today;
    const view=views.get(id)??{range:'all',date:defaultDate,invalid:new Map(),addDate:defaultDate,addMeal:'lunch',addDish:''};views.set(id,view);
    const isLive=()=>el.isConnected&&owner===form&&auth===api.sessionKey();
    function paint() {
      if(!isLive())return;
      const s=owner.session.getState();contextId=s.contextId;
      if(s.identity?.id!==id){replace(body,h('p',{role:'status'},tr('loading')),...(loadError?[h('p',{role:'alert'},apiMessage(loadError,lang)),action(tr('retry'),()=>void reloadCatalog())]:[]));return;}
      const active=document.activeElement instanceof HTMLElement?document.activeElement.dataset.focus:undefined;
      const output:HTMLElement[]=[status(s,lang)];
      if(loadError)output.push(h('div',{class:'tm-error',role:'alert'},apiMessage(loadError,lang),action(tr('retry'),()=>void reloadCatalog())));
      if(s.error)output.push(h('p',{class:'tm-error',role:'alert'},apiMessage(new ApiError(s.error.status,s.error.code,s.error.message,s.error.errors,s.error.retryAfter,s.error.reviewRequired),lang)));
      if(s.phase==='outcome-unknown'){
        const recover=action(tr('recover'),()=>void owner.session.reconcileUnknown(s.contextId));recover.disabled=s.recovering;output.push(recover);
      }
      if(s.phase==='conflict')output.push(conflict());
      if(s.draft){
        output.push(h('p',{class:'muted'},tr('optional')),filters());
        const plan=s.draft;
        const groups=new Map<string,number[]>();
        plan.meals.forEach((meal,index)=>{
          if(view.range==='day'&&meal.date!==view.date)return;
          if(view.range==='week'&&(meal.date<view.date||meal.date>shift(view.date,6)))return;
          const key=`${meal.date}|${meal.mealType}`;groups.set(key,[...(groups.get(key)??[]),index]);
        });
        for(const [key,indices] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
          const [date,meal]=key.split('|');
          output.push(h('section',{class:'tm-card'},h('h3',{},`${date} · ${tr(meal as MealType)}`),...indices.map(index=>row(index))));
        }
        if(groups.size===0)output.push(h('p',{class:'tm-card'},tr('empty')));
        if(catalog)output.push(addForm());
        const save=action(tr('save'),()=>void owner.session.save(s.contextId),true);
        save.disabled=!s.dirty||s.operationId!==null||s.phase==='conflict'||view.invalid.size>0;
        output.push(h('div',{class:'tm-actions'},save,h('a',{href:adminHref('publish')},tr('publish'))));
      }
      replace(body,...output);
      if(active)body.querySelector<HTMLElement>(`[data-focus="${active}"]`)?.focus();
    }
    function filters():HTMLElement {
      const range=h('select',{'data-focus':'range'});
      for(const key of ['all','day','week'] as const)range.append(h('option',{value:key,selected:view.range===key},tr(key)));
      range.addEventListener('change',()=>{view.range=range.value as View['range'];paint();});
      const date=h('input',{type:'date',value:view.date,'data-focus':'filter-date'});date.addEventListener('change',()=>{if(date.value)view.date=date.value;paint();});
      return h('div',{class:'tm-tools'},field(tr('filter'),range),field(tr('date'),date));
    }
    function dishSelect(value:string,key:string):HTMLSelectElement {
      const select=h('select',{'data-focus':key});select.append(h('option',{value:''},tr('choose')));
      if(value&&!catalog?.dishes[value])select.append(h('option',{value},`${value} — ${tr('missingDish')}`));
      for(const [dishId,dish] of Object.entries(catalog?.dishes??{}))select.append(h('option',{value:dishId},`${pick(dish.name,lang)}${dish.status&&dish.status!=='active'?` · ${dish.status}`:''}`));
      select.value=value;return select;
    }
    function row(index:number):HTMLElement {
      const s=owner.session.getState(),meal=s.draft!.meals[index]!;
      const captured=s.contextId;
      const dish=dishSelect(meal.dishRef,`dish-${index}`);dish.disabled=!catalog;
      dish.addEventListener('change',()=>{if(dish.value)owner.changeDish(index,dish.value,captured);});
      const input=h('input',{type:'number',min:1,step:1,value:view.invalid.get(index)??meal.plannedServings??'','data-focus':`servings-${index}`,'aria-invalid':view.invalid.has(index)?'true':undefined});
      input.addEventListener('input',()=>{
        if(input.validity.badInput){view.invalid.set(index,input.value);paint();return;}
        try{view.invalid.delete(index);owner.servings(index,input.value,captured);}catch{view.invalid.set(index,input.value);paint();}
      });
      const remove=action(tr('remove'),()=>{view.invalid.clear();owner.remove(index,captured);});
      const node=h('div',{class:'tm-meal-row','data-meal-index':index},field(tr('dish'),dish),field(tr('servings'),input),remove);
      if(meal.serviceWindow)node.append(h('small',{class:'muted'},meal.serviceWindow));
      if(view.invalid.has(index))node.append(h('p',{class:'tm-error'},tr('invalidServings')));
      return node;
    }
    function addForm():HTMLElement {
      const s=owner.session.getState(),captured=s.contextId;
      const date=h('input',{type:'date',value:view.addDate,required:true,'data-focus':'add-date'});
      const meal=h('select',{'data-focus':'add-meal'});for(const key of meals)meal.append(h('option',{value:key,selected:key===view.addMeal},tr(key)));
      const dish=dishSelect(view.addDish,'add-dish');dish.required=true;
      date.addEventListener('input',()=>{view.addDate=date.value;});meal.addEventListener('change',()=>{view.addMeal=meal.value as MealType;});dish.addEventListener('change',()=>{view.addDish=dish.value;});
      const add=h('button',{type:'submit',class:'tm-button'},tr('add'));
      const formEl=h('form',{class:'tm-card tm-add-form'},field(tr('date'),date),field(tr('meal'),meal),field(tr('dish'),dish),add);
      formEl.addEventListener('submit',event=>{event.preventDefault();if(date.value&&dish.value)owner.add(date.value,meal.value as MealType,dish.value,captured);});return formEl;
    }
    function conflict():HTMLElement {
      const card=h('div',{class:'tm-card'},action(tr('compare'),()=>void compare()));
      if(comparing)card.append(h('p',{},tr('loading')));
      if(compareError)card.append(h('p',{role:'alert'},apiMessage(compareError,lang)));
      if(remote!==undefined){
        const s=owner.session.getState(),captured=s.contextId;
        card.append(h('div',{class:'tm-compare'},h('section',{},h('h3',{},tr('local')),h('pre',{},JSON.stringify(s.draft,null,2))),h('section',{},h('h3',{},tr('remote')),h('pre',{},JSON.stringify(remote?.content??null,null,2)))));
        card.append(action(tr('keep'),()=>{if(s.draft)owner.session.replace(s.draft,remote??null,captured);}),action(tr('adopt'),()=>{owner.session.replace(remote?toSavePlan({plan:remote.content}):{schemaVersion:'3',meals:[]},remote??null,captured);}));
      }return card;
    }
    async function compare(){
      const captured=owner.session.getState().contextId;comparing=true;compareError=null;paint();
      try{const result=await owner.compareRemote();if(isLive()&&owner.session.getState().contextId===captured)remote=result;}catch(error){if(isLive())compareError=error;}
      finally{if(isLive()){comparing=false;paint();}}
    }
    async function reloadCatalog(){
      try{const result=owner.session.getState().draft?await owner.loadCatalog():await owner.load(id,isLive);if(isLive()){catalog=result;loadError=null;}}catch(error){if(isLive())loadError=error;}paint();
    }
    replace(body,h('p',{role:'status'},tr('loading')));
    const unsubscribe=owner.session.subscribe(()=>paint());
    const stopObserve=onDetached(el,()=>{unsubscribe();if(owner.session.getState().contextId===contextId)owner.detach();});
    cleanup=()=>{unsubscribe();stopObserve();};
    try{
      catalog=await owner.load(id,isLive);
      if(!isLive())return;
      const imported=getDraftPlan(id),s=owner.session.getState();
      if(imported&&!s.operationId&&s.phase!=='conflict'){
        owner.session.edit(toSavePlan({plan:imported}),s.contextId);clearDraftPlan(id);
      }
      const date=s.draft?.meals[0]?.date;if(date&&view.date===defaultDate){view.date=date;view.addDate=date;}
    }catch(error){if(isLive())loadError=error;}
    paint();
  };
}
function shift(date:string,days:number):string {return new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);}
let renderer:ReturnType<typeof createPlanRenderer>|undefined;
export function render(el:HTMLElement,ctx:PageCtx,rest:string):Promise<void>{return (renderer??=createPlanRenderer(getTeamMealsApi()))(el,ctx,rest);}
