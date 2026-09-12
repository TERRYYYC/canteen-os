/** Team plan page. D0 design: docs/design/team-meals-pages/. */
import './plan.css';
import { weekStartOfPlanId, planIdOfDate, type MealType, type AnyMenuPlan } from '@canteenos/core';
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
import {hrefOf} from '../../router';
import {registerAuxiliaryEdits,type AuxiliaryEditHandle} from '../../view-models/reload-safety';
export { createPlanForm } from './plan-form';
// toSavePlan intentionally remains local: the regression probe exercises the real page serializer.
void toSavePlan;
const meals:MealType[]=['breakfast','lunch','dinner'];
interface View { preview?:boolean; editing?:number; addExpanded?:boolean; range:'all'|'day'|'week'; date:string; invalid:Map<number,string>; addDate:string; addMeal:MealType; addDish:string; addBaseline:readonly [string,MealType,string]; initialized:boolean; generation:number; reads:number }
export interface PlanAuxiliaryState { readonly ownerId:string; readonly identity:{readonly kind:'plan';readonly id:string}; readonly generation:number; readonly dirty:boolean; readonly phase:'idle'|'busy' }
const addPending=(view:View)=>view.addDate!==view.addBaseline[0]||view.addMeal!==view.addBaseline[1]||view.addDish!==view.addBaseline[2];
const rawPending=(view:View)=>view.invalid.size>0||addPending(view);

/** An injected API changes transport only; browser fixtures still execute this production page. */
export function createPlanRenderer(api:TeamMealsApi) {
  const views=new Map<string,View>();
  const auxiliary=new WeakMap<View,AuxiliaryEditHandle>();
  let cleanup:()=>void=()=>{}, renderSequence=0,rawGeneration=0;
  const touch=(view:View)=>{view.generation=++rawGeneration;};
  const createForm=()=>createPlanForm(api,{remapRows(id,order){
    const view=views.get(id);if(!view)return ()=>{};
    const previous=view.invalid;
    view.invalid=new Map(order.flatMap<[number,string]>((old,index)=>previous.has(old)?[[index,previous.get(old)!]]:[]));touch(view);
    return ()=>{view.invalid=previous;touch(view);};
  },beginRead(id){
    const view=views.get(id),handle=view&&auxiliary.get(view);
    if(!view||!handle)throw new Error('Plan read owner is not registered');
    const ticket=handle.beginOperation('read');view.reads++;touch(view);
    return {finish(failed){view.reads--;touch(view);handle.settleOperation(ticket,failed?'failed':'completed');}};
  }});
  let form=createForm(),auth=api.sessionKey();
  let previewModule:typeof import('./plan-preview')|undefined;
  async function renderPlan(el:HTMLElement,ctx:PageCtx,rest:string):Promise<void> {
    const drafts=bindDraftStore(api);
    cleanup(); const renderTicket=++renderSequence;
    if(auth!==api.sessionKey()){
      form.session.getState();
      for(const view of views.values())auxiliary.get(view)?.dispose();
      views.clear();form=createForm();auth=api.sessionKey();
    }
    const owner=form, lang=ctx.lang, tr=(key:Parameters<typeof text>[1])=>text(lang,key);
    const id=rest||ctx.planId||planIdOfDate(new Date().toISOString().slice(0,10))||'';
    if(!/^[a-z][a-z0-9-]*$/.test(id)){el.append(h('p',{role:'alert'},tr('error')));ctx.setReloadCoverage?.('read-only');return;}
    el.classList.add('tm-page');el.classList.add('tm-plan');
    const header=h('div',{class:'tm-head'},h('a',{href:adminHref()},tr('back')),h('h2',{class:'tm-plan-sr'},tr('plan')),h('a',{href:adminHref('plan',id,'import')},tr('import')));
    const body=h('div',{});el.append(body,header);
    if(api.mode==='unconfigured'){body.append(h('div',{class:'tm-status',role:'status'},tr('unconfigured')));ctx.setReloadCoverage?.('read-only');return;}
    let catalog:TeamCatalog|null=null,loadError:unknown=null,remote:Source<AnyMenuPlan>|null|undefined;
    let compareError:unknown=null,comparing=false,contextId=0;
    let initialized=false,boundKey:string|undefined,requestedKey:string|undefined;
    let previewLoading=false,previewError:unknown=null;
    const photos=new Map<string,{url?:string;failed?:boolean}>();
    const disposePhotos=()=>{for(const photo of photos.values())if(photo.url)URL.revokeObjectURL(photo.url);photos.clear();};
    const today=new Date().toISOString().slice(0,10);
    const defaultDate=weekStartOfPlanId(id,today)??today;
    const view:View=views.get(id)??{range:'all',date:defaultDate,invalid:new Map(),addDate:defaultDate,addMeal:'lunch',addDish:'',addBaseline:[defaultDate,'lunch',''],initialized:false,generation:++rawGeneration,reads:0};views.set(id,view);
    if(!auxiliary.has(view))auxiliary.set(view,registerAuxiliaryEdits({ownerId:`plan-buffer/${id}`,identity:{kind:'plan',id},boundary:api,operationTracking:'tickets',
      read:()=>({generation:view.generation,dirty:rawPending(view),phase:view.reads?'busy':'idle'})}));
    const isLive=()=>renderTicket===renderSequence&&el.isConnected&&owner===form&&auth===api.sessionKey();
    const sourceKey=()=>owner.session.getState().source?.commit??'current-unsaved';
    // Bind what actually arrived, never whichever source happens to be current after an await.
    const catalogKey=(value:TeamCatalog|null)=>sourceKey()==='current-unsaved'?'current-unsaved':value?.commit;
    function paint() {
      if(!isLive())return;
      const s=owner.session.getState();contextId=s.contextId;
      if(s.identity?.id!==id){replace(body,h('p',{role:'status'},tr('loading')),...(loadError?[h('p',{role:'alert'},apiMessage(loadError,lang)),action(tr('retry'),()=>void reloadCatalog())]:[]));return;}
      if(boundKey!==sourceKey()){catalog=null;disposePhotos();}
      if(initialized&&!catalog&&requestedKey!==sourceKey()){requestedKey=sourceKey();void reloadCatalog(false);}
      const active=document.activeElement instanceof HTMLElement?document.activeElement.dataset.focus:undefined;
      const documentStatus=status(s,lang),output:HTMLElement[]=[];
      if(s.draft)output.push(filters());
      output.push(documentStatus);
      if(rawPending(view)){
        // C1 may be unchanged while page-owned inputs are still unapplied.
        if(s.phase==='clean'){
          documentStatus.firstChild!.textContent=tr('dirty');documentStatus.classList.add('dirty');
        }
        documentStatus.append(h('div',{'data-plan-raw-pending':'true'},
          view.invalid.size>0?h('p',{},tr('invalidServings')):null,
          addPending(view)?h('p',{},`${view.addDate||tr('date')} · ${tr(view.addMeal)} — `,lang==='zh'?'添加栏的选择尚未加入计划；点击“加一道菜”后才会应用。':lang==='en'?'The Add choices have not been added to the plan. Use “Add a dish” to apply them.':'Вибір для додавання ще не внесено в план. Натисніть «Додати страву», щоб застосувати його.'):null));
      }
      if(loadError)output.push(h('div',{class:'tm-error',role:'alert'},apiMessage(loadError,lang),action(tr('retry'),()=>void reloadCatalog())));
      if(s.error)output.push(h('p',{class:'tm-error',role:'alert'},apiMessage(new ApiError(s.error.status,s.error.code,s.error.message,s.error.errors,s.error.retryAfter,s.error.reviewRequired),lang)));
      if(s.phase==='outcome-unknown'){
        const recover=action(tr('recover'),()=>void owner.session.reconcileUnknown(s.contextId));recover.disabled=s.recovering;output.push(recover);
      }
      if(s.phase==='conflict')output.push(conflict());
      if(s.draft){
        output.push(h('p',{class:'tm-plan-note'},lang==='zh'?'每道菜的份数可留空':lang==='en'?'Servings are optional for each dish':'Порції для кожної страви необов’язкові'));
        const plan=s.draft;
        const groups=new Map<string,number[]>();
        plan.meals.forEach((meal,index)=>{
          if(view.range==='day'&&meal.date!==view.date)return;
          if(view.range==='week'&&(meal.date<view.date||meal.date>shift(view.date,6)))return;
          const key=`${meal.date}|${meal.mealType}`;groups.set(key,[...(groups.get(key)??[]),index]);
        });
        for(const [key,indices] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
          const [date,meal]=key.split('|');
          output.push(h('section',{class:'tm-plan-group'},h('h3',{class:'tm-plan-sr'},`${date} · ${tr(meal as MealType)}`),...indices.map(index=>row(index))));
        }
        if(groups.size===0)output.push(h('p',{class:'tm-card'},tr('empty')));
        const save=action(tr('save'),()=>void owner.session.save(s.contextId),true);
        save.disabled=!s.dirty||s.operationId!==null||s.phase==='conflict'||view.invalid.size>0;
        output.push(h('div',{class:'tm-actions'},save,h('a',{class:'tm-button primary tm-plan-purchase',href:hrefOf('purchase',`new/${id}`)},lang==='zh'?'建立采购清单':lang==='en'?'Create shopping list':'Створити список покупок')),
          h('p',{class:'tm-plan-note'},lang==='zh'?'采购清单使用已保存的计划':lang==='en'?'Shopping uses the saved plan':'Закупівлі використовують збережений план'));
        if(catalog){
          output.push(addForm(),h('div',{class:'tm-plan-secondary'},action(tr('preview'),()=>{if(!isLive())return;view.preview=previewError?true:!view.preview;previewError=null;paint();}),h('a',{href:adminHref('publish')},tr('publish'))));
          if(view.preview){
            if(previewModule)output.push(previewModule.render(id,plan,catalog,lang,[...groups.values()].flat()));
            else if(previewError)output.push(h('p',{class:'tm-error',role:'alert'},apiMessage(previewError,lang)));
            else{output.push(h('p',{role:'status'},tr('loading')));if(!previewLoading)void loadPreview();}
          }
        }
      }
      replace(body,...output);
      if(active)body.querySelector<HTMLElement>(`[data-focus="${active}"]`)?.focus();
    }
    async function loadPreview():Promise<void>{
      previewLoading=true;const handle=auxiliary.get(view)!,ticket=handle.beginOperation('read');view.reads++;touch(view);let failed=false;
      try{previewModule=await import('./plan-preview');}
      catch(error){failed=true;if(isLive())previewError=error;}
      finally{view.reads--;touch(view);handle.settleOperation(ticket,failed?'failed':'completed');previewLoading=false;if(isLive())paint();}
    }
    function selectDate(date:string):void {
      // Only clean defaults follow navigation; unapplied Add intent keeps its own destination.
      if(!addPending(view)){view.addDate=date;view.addBaseline=[date,view.addMeal,view.addDish];}
      view.date=date;
    }
    function filters():HTMLElement {
      const range=h('select',{'data-focus':'range','aria-label':tr('filter'),class:'tm-plan-range-select',tabindex:-1,'aria-hidden':'true'});
      for(const key of ['all','day','week'] as const)range.append(h('option',{value:key,selected:view.range===key},tr(key)));
      range.addEventListener('change',()=>{view.range=range.value as View['range'];paint();});
      const periods=h('div',{class:'tm-plan-periods',role:'group','aria-label':tr('filter')});
      for(const key of ['day','week','all'] as const){
        const button=action(tr(key),()=>{if(!isLive())return;view.range=key;paint();});
        button.setAttribute('aria-pressed',String(view.range===key));periods.append(button);
      }
      const date=h('input',{type:'date',value:view.date,'data-focus':'filter-date','aria-label':tr('date')});
      date.addEventListener('change',()=>{if(!isLive())return;if(date.value)selectDate(date.value);paint();});
      const start=shift(view.date,-((new Date(`${view.date}T12:00:00Z`).getUTCDay()+6)%7));
      const days=h('div',{class:'tm-plan-dates',role:'group','aria-label':tr('date')});
      const weekday=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':lang==='uk'?'uk-UA':'en-GB',{weekday:'short',timeZone:'UTC'});
      for(let offset=0;offset<7;offset++){
        const value=shift(start,offset),button=h('button',{type:'button',class:'tm-plan-day','aria-pressed':String(value===view.date),'aria-label':value},h('span',{},weekday.format(new Date(`${value}T12:00:00Z`))),h('b',{},String(Number(value.slice(8)))));
        button.addEventListener('click',()=>{if(!isLive())return;selectDate(value);view.range='day';paint();});days.append(button);
      }
      return h('div',{class:'tm-plan-calendar'},periods,h('div',{class:'tm-plan-date-picker'},date,range),days);
    }
    function photo(dishRef:string,name:string):HTMLElement {
      const record=catalog?.dishes[dishRef],revision=catalog?.commit;
      const missing=lang==='zh'?'图片未录':lang==='en'?'No image':'Без фото';
      const box=h('div',{class:'tm-plan-photo',role:'img','aria-label':missing},h('span',{'aria-hidden':'true'},'♧'));
      if(!record?.image||!revision)return box;
      const key=`${revision}/${dishRef}`;
      let state=photos.get(key);
      if(!state){
        state={};photos.set(key,state);
        const current=state,handle=auxiliary.get(view)!,ticket=handle.beginOperation('read');view.reads++;touch(view);
        void api.getAsset({revision,owner:`data/dishes/${dishRef}.json`,pointer:'/image'}).then(result=>{
          if(!isLive()||catalog?.commit!==revision)return;
          if(result.sourceRevision!==revision)throw new Error('revision_mismatch');
          current.url=URL.createObjectURL(result.bytes);
        }).catch(()=>{current.failed=true;}).finally(()=>{
          view.reads--;touch(view);handle.settleOperation(ticket,current.failed?'failed':'completed');
          if(isLive()&&catalog?.commit===revision)paint();
        });
      }
      if(state.url){
        const img=h('img',{src:state.url,alt:name});
        img.addEventListener('error',()=>{if(!isLive()||!img.isConnected||!state?.url)return;URL.revokeObjectURL(state.url);state.url=undefined;state.failed=true;paint();});
        replace(box,img);box.removeAttribute('role');box.removeAttribute('aria-label');
      }else {
        const label=state.failed?(lang==='zh'?'图片未载入':lang==='en'?'Image unavailable':'Фото недоступне'):tr('loading');
        box.setAttribute('aria-label',label);
        if(state.failed)replace(box,h('span',{class:'tm-plan-photo-state'},label));
      }
      return box;
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
      const input=h('input',{type:'number',min:1,step:1,placeholder:'—','aria-label':tr('servings'),value:view.invalid.get(index)??meal.plannedServings??'','data-focus':`servings-${index}`,'aria-invalid':view.invalid.has(index)?'true':undefined});
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
      const name=pick(catalog?.dishes[meal.dishRef]?.name,lang)||meal.dishRef;
      const edit=h('details',{class:'tm-plan-edit',open:view.editing===index},h('summary',{'aria-label':`${tr('dish')}: ${name}`},lang==='zh'?'编辑':lang==='en'?'Edit':'Змінити'),h('div',{},field(tr('dish'),dish),remove));
      edit.addEventListener('toggle',()=>{if(isLive()&&edit.isConnected){if(edit.open)view.editing=index;else if(view.editing===index)view.editing=undefined;}});
      const node=h('div',{class:'tm-meal-row','data-meal-index':index},h('div',{class:'tm-plan-row-main'},photo(meal.dishRef,name),h('div',{class:'tm-plan-dish-name'},h('b',{},name),h('small',{},`${meal.date.slice(5)} · ${tr(meal.mealType)}${meal.serviceWindow?` · ${meal.serviceWindow}`:''}`)),field(lang==='zh'?'份数':lang==='en'?'Servings':'Порції',input)),edit);
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
      const extra=h('details',{class:'tm-plan-add-extra',open:view.addExpanded||addPending(view)},h('summary',{},`${view.addDate.slice(5)} · ${tr(view.addMeal)}`),h('div',{},field(tr('date'),date),field(tr('meal'),meal)));
      extra.addEventListener('toggle',()=>{if(isLive()&&extra.isConnected)view.addExpanded=extra.open;});
      const formEl=h('form',{class:'tm-card tm-add-form'},field(tr('dish'),dish),add,extra);
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
    const stopObserve=onDetached(el,()=>{unsubscribe();disposePhotos();if(owner.session.getState().contextId===contextId)owner.detach();});
    cleanup=()=>{unsubscribe();stopObserve();disposePhotos();};
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
    finally{ctx.setReloadCoverage?.('tracked');}
    initialized=true;requestedKey=loadError?sourceKey():boundKey;
    paint();
  }
  return Object.assign(renderPlan,{
    /** Read-only metadata for the page buffer registered above; C1 owns saved JSON. */
    readAuxiliary(id:string):PlanAuxiliaryState|null {
      const view=views.get(id);if(!view)return null;
      return Object.freeze({ownerId:`plan-buffer/${id}`,identity:Object.freeze({kind:'plan' as const,id}),generation:view.generation,dirty:rawPending(view),phase:view.reads?'busy' as const:'idle' as const});
    },
  });
}
function shift(date:string,days:number):string {return new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);}
let renderer:ReturnType<typeof createPlanRenderer>|undefined;
export function render(el:HTMLElement,ctx:PageCtx,rest:string):Promise<void>{return (renderer??=createPlanRenderer(getTeamMealsApi()))(el,ctx,rest);}
