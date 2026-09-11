/** Team plan page. D0 design: docs/design/team-meals-pages/. */
import './plan.css';
import { weekStartOfPlanId, planIdOfDate, normalizeSelection, type MealType, type AnyMenuPlan } from '@canteenos/core';
import { getTeamMealsApi, type TeamMealsApi, type TeamCatalog } from '../../api/team-meals';
import { ApiError, type Source } from '../../api/types';
import { apiMessage } from '../../admin/kit';
import { bindDraftStore } from '../../admin/store';
import { h, replace } from '../../dom';
import { pick } from '../../i18n';
import type { PageCtx } from '../../types';
import { adminHref } from '../admin';
import { text, action, field, status, onDetached } from '../team-ui';
import { createPlanForm, toSavePlan } from './plan-form';
import {previewTeamMealsDraft} from '../../view-models/team-meals';
import {renderCandidates} from '../purchase-list';
import {hrefOf} from '../../router';
export { createPlanForm } from './plan-form';
// toSavePlan intentionally remains local: the regression probe exercises the real page serializer.
void toSavePlan;
const meals:MealType[]=['breakfast','lunch','dinner'];
interface View { preview?:boolean; range:'all'|'day'|'week'; date:string; invalid:Map<number,string>; addDate:string; addMeal:MealType; addDish:string; addBaseline:readonly [string,MealType,string]; initialized:boolean; generation:number }
export interface PlanAuxiliaryState { readonly ownerId:string; readonly identity:{readonly kind:'plan';readonly id:string}; readonly generation:number; readonly dirty:boolean; readonly phase:'idle' }
const addPending=(view:View)=>view.addDate!==view.addBaseline[0]||view.addMeal!==view.addBaseline[1]||view.addDish!==view.addBaseline[2];
const rawPending=(view:View)=>view.invalid.size>0||addPending(view);

/** An injected API changes transport only; browser fixtures still execute this production page. */
export function createPlanRenderer(api:TeamMealsApi) {
  let form=createPlanForm(api),auth=api.sessionKey();
  const views=new Map<string,View>();
  let cleanup:()=>void=()=>{}, renderSequence=0,rawGeneration=0;
  const touch=(view:View)=>{view.generation=++rawGeneration;};
  async function renderPlan(el:HTMLElement,ctx:PageCtx,rest:string):Promise<void> {
    const drafts=bindDraftStore(api);
    cleanup(); const renderTicket=++renderSequence;
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
    let initialized=false,boundKey:string|undefined,requestedKey:string|undefined;
    const today=new Date().toISOString().slice(0,10);
    const defaultDate=weekStartOfPlanId(id,today)??today;
    const view:View=views.get(id)??{range:'all',date:defaultDate,invalid:new Map(),addDate:defaultDate,addMeal:'lunch',addDish:'',addBaseline:[defaultDate,'lunch',''],initialized:false,generation:++rawGeneration};views.set(id,view);
    const isLive=()=>renderTicket===renderSequence&&el.isConnected&&owner===form&&auth===api.sessionKey();
    const sourceKey=()=>owner.session.getState().source?.commit??'current-unsaved';
    // Bind what actually arrived, never whichever source happens to be current after an await.
    const catalogKey=(value:TeamCatalog|null)=>sourceKey()==='current-unsaved'?'current-unsaved':value?.commit;
    function paint() {
      if(!isLive())return;
      const s=owner.session.getState();contextId=s.contextId;
      if(s.identity?.id!==id){replace(body,h('p',{role:'status'},tr('loading')),...(loadError?[h('p',{role:'alert'},apiMessage(loadError,lang)),action(tr('retry'),()=>void reloadCatalog())]:[]));return;}
      if(boundKey!==sourceKey())catalog=null;
      if(initialized&&!catalog&&requestedKey!==sourceKey()){requestedKey=sourceKey();void reloadCatalog(false);}
      const active=document.activeElement instanceof HTMLElement?document.activeElement.dataset.focus:undefined;
      const documentStatus=status(s,lang),output:HTMLElement[]=[documentStatus];
      if(rawPending(view)){
        // C1 may be unchanged while page-owned inputs are still unapplied.
        if(s.phase==='clean'){
          documentStatus.firstChild!.textContent=tr('dirty');documentStatus.classList.add('dirty');
        }
        documentStatus.append(h('div',{'data-plan-raw-pending':'true'},
          view.invalid.size>0?h('p',{},tr('invalidServings')):null,
          addPending(view)?h('p',{},lang==='zh'?'添加栏的选择尚未加入计划；点击“加一道菜”后才会应用。':lang==='en'?'The Add choices have not been added to the plan. Use “Add a dish” to apply them.':'Вибір для додавання ще не внесено в план. Натисніть «Додати страву», щоб застосувати його.'):null));
      }
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
        if(catalog){
          output.push(addForm(),action(tr('preview'),()=>{view.preview=!view.preview;paint();}));
          if(view.preview){
            const selection=normalizeSelection([...groups.values()].flat().map(index=>{const meal=plan.meals[index]!;return{menuPlanRef:id,date:meal.date,mealType:meal.mealType};}));
            const preview=previewTeamMealsDraft({inputs:{menuPlans:{[id]:plan},dishes:catalog.dishes,ingredients:catalog.ingredients,techniques:catalog.techniques},selection,at:new Date().toISOString()});
            output.push(h('section',{'data-preview':'draft'},h('h3',{},tr('localPreview')),renderCandidates({lang,collection:preview.collection,estimate:preview.estimate,ingredients:catalog.ingredients,dishes:catalog.dishes})));
          }
        }
        output.push(h('a',{href:hrefOf('purchase',`new/${id}`)},lang==='zh'?'从已保存计划建立采购清单':lang==='en'?'Create shopping list from saved plan':'Створити список покупок зі збереженого плану'));
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
      if(value&&!Object.hasOwn(catalog?.dishes??{},value))select.append(h('option',{value},`${value} — ${tr('missingDish')}`));
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
        if(!isLive()||owner.session.getState().contextId!==captured)return;
        touch(view);
        if(input.validity.badInput){view.invalid.set(index,input.value);paint();return;}
        try{const invalid=view.invalid.delete(index);owner.servings(index,input.value,captured);if(invalid)paint();}catch{view.invalid.set(index,input.value);paint();}
      });
      const remove=action(tr('remove'),()=>{
        if(!isLive()||owner.session.getState().contextId!==captured)return;
        const previous=view.invalid;
        // Preserve the original row's raw text when earlier rows change its index.
        view.invalid=new Map([...previous].filter(([row])=>row!==index).map(([row,raw])=>[row>index?row-1:row,raw]));
        if([...previous.keys()].some(row=>row>=index))touch(view);
        if(!owner.remove(index,captured))view.invalid=previous;
        paint();
      });
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
      const update=()=>{
        if(!isLive()||owner.session.getState().contextId!==captured)return;
        view.addDate=date.value;view.addMeal=meal.value as MealType;view.addDish=dish.value;touch(view);paint();
      };
      date.addEventListener('input',update);meal.addEventListener('change',update);dish.addEventListener('change',update);
      const add=h('button',{type:'submit',class:'tm-button'},tr('add'));
      const formEl=h('form',{class:'tm-card tm-add-form'},field(tr('date'),date),field(tr('meal'),meal),field(tr('dish'),dish),add);
      formEl.addEventListener('submit',event=>{
        event.preventDefault();if(!isLive()||owner.session.getState().contextId!==captured)return;
        if(date.value&&dish.value&&owner.add(date.value,meal.value as MealType,dish.value,captured)){
          view.addBaseline=[view.addDate,view.addMeal,view.addDish];touch(view);paint();
        }
      });return formEl;
    }
    function conflict():HTMLElement {
      const card=h('div',{class:'tm-card'},action(tr('compare'),()=>void compare()));
      if(comparing)card.append(h('p',{},tr('loading')));
      if(compareError)card.append(h('p',{role:'alert'},apiMessage(compareError,lang)));
      if(remote!==undefined){
        const s=owner.session.getState(),captured=s.contextId;
        card.append(h('div',{class:'tm-compare'},comparePlan(tr('local'),s.draft),comparePlan(tr('remote'),remote?.content??null)));
        card.append(h('p',{},lang==='zh'?'保留本地稿会更新保存基线，仍需再次保存；采用远端会替换本地稿。':lang==='en'?'Keeping local changes updates the baseline and requires another save. Using remote content replaces the local draft.':'Локальні зміни отримають нову базу й потребуватимуть збереження. Віддалені дані замінять локальну чернетку.'));
        card.append(action(tr('keep'),()=>{if(s.draft)owner.session.replace(s.draft,remote??null,captured);}),action(tr('adopt'),()=>{owner.session.replace(remote?toSavePlan({plan:remote.content}):{schemaVersion:'3',meals:[]},remote??null,captured);}));
      }return card;
    }
    function comparePlan(label:string,plan:AnyMenuPlan|null):HTMLElement {
      return h('section',{},h('h3',{},label),plan&&plan.meals.length?h('ul',{},...plan.meals.map(meal=>h('li',{},
        `${meal.date} · ${tr(meal.mealType)} · ${meal.dishRef} · ${meal.plannedServings??(lang==='zh'?'份数未录':lang==='en'?'Count unspecified':'Кількість не вказана')}`))):h('p',{},tr('empty')),
        h('details',{},h('summary',{},lang==='zh'?'原始数据':lang==='en'?'Raw data':'Вихідні дані'),h('pre',{},JSON.stringify(plan,null,2))));
    }
    async function compare(){
      const captured=owner.session.getState().contextId;comparing=true;compareError=null;paint();
      try{const result=await owner.compareRemote();if(isLive()&&owner.session.getState().contextId===captured)remote=result;}catch(error){if(isLive())compareError=error;}
      finally{if(isLive()){comparing=false;paint();}}
    }
    async function reloadCatalog(force=true){
      const state=owner.session.getState();
      try{
        const key=sourceKey();
        const result=state.identity?.id===id&&state.phase!=='closed'
          ? await owner.loadCatalog(force)
          : await owner.load(id,isLive,drafts.getDraftPlan(id)??undefined,()=>drafts.clearDraftPlan(id));
        if(isLive()&&owner.session.getState().identity?.id===id&&(state.identity?.id!==id||sourceKey()===key)){
          catalog=result;boundKey=catalogKey(result);requestedKey=boundKey;loadError=null;
        }
      }catch(error){if(isLive())loadError=error;}paint();
    }
    replace(body,h('p',{role:'status'},tr('loading')));
    const unsubscribe=owner.session.subscribe(()=>paint());
    const stopObserve=onDetached(el,()=>{unsubscribe();if(owner.session.getState().contextId===contextId)owner.detach();});
    cleanup=()=>{unsubscribe();stopObserve();};
    try{
      catalog=await owner.load(id,isLive,drafts.getDraftPlan(id)??undefined,()=>drafts.clearDraftPlan(id));
      if(!isLive())return;
      boundKey=catalogKey(catalog);
      const s=owner.session.getState();
      if(!view.initialized){
        const date=s.draft?.meals[0]?.date;
        if(date&&view.date===defaultDate)view.date=date;
        if(date&&!addPending(view)){view.addDate=date;view.addBaseline=[date,view.addMeal,view.addDish];}
        view.initialized=true;
      }
    }catch(error){if(isLive())loadError=error;}
    initialized=true;requestedKey=loadError?sourceKey():boundKey;
    paint();
  }
  return Object.assign(renderPlan,{
    /** Actual raw-buffer summary only; registration and C1 JSON coverage belong to shared C. */
    readAuxiliary(id:string):PlanAuxiliaryState|null {
      const view=views.get(id);if(!view)return null;
      return Object.freeze({ownerId:`plan-buffer/${id}`,identity:Object.freeze({kind:'plan' as const,id}),generation:view.generation,dirty:rawPending(view),phase:'idle' as const});
    },
  });
}
function shift(date:string,days:number):string {return new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);}
let renderer:ReturnType<typeof createPlanRenderer>|undefined;
export function render(el:HTMLElement,ctx:PageCtx,rest:string):Promise<void>{return (renderer??=createPlanRenderer(getTeamMealsApi()))(el,ctx,rest);}
