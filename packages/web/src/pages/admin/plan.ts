/** Team plan page. D0 design: docs/design/team-meals-pages/. */
import './plan.css';
import { weekStartOfPlanId, datedPlanIdOfDate, type MealType, type AnyMenuPlan } from '@canteenos/core';
import { getTeamMealsApi, type TeamMealsApi, type TeamCatalog } from '../../api/team-meals';
import { ApiError, type Source } from '../../api/types';
import { createAttempt, getKnowledgeApi, KnowledgeError, type Attempt, type I18n, type Materialization, type createKnowledgeApi } from '../../api/knowledge';
import { apiMessage, contractErrorText } from '../../admin/kit';
import { bindDraftStore } from '../../admin/store';
import { h, replace } from '../../dom';
import { pick } from '../../i18n';
import type { PageCtx } from '../../types';
import { adminHref } from '../admin';
import { text, action, field, status, onDetached } from '../team-ui';
import { createPlanForm, toSavePlan, planHints } from './plan-form';
import { displayDate } from '../../display-date';
import {hrefOf} from '../../router';
import {registerAuxiliaryEdits,type AuxiliaryEditHandle,type AuxiliaryOperation} from '../../view-models/reload-safety';
import {currentPlan,selectPlan} from './plan-context';
import {SYSTEM_REVIEWER,SYSTEM_NOTE} from './knowledge/review-label';
import {recordValue} from '../record-display';
import {localDateIso} from '../../local-date';
export { createPlanForm } from './plan-form';
// toSavePlan intentionally remains local: the regression probe exercises the real page serializer.
void toSavePlan;
const meals:MealType[]=['breakfast','lunch','dinner'];
interface View { preview?:boolean; editing?:number; addExpanded?:boolean; catalogCommit?:string; pendingSelection?:string; selectedRouteAdded?:boolean; range:'all'|'day'|'week'; date:string; invalid:Map<number,string>; addDate:string; addMeal:MealType; addDish:string; addBaseline:readonly [string,MealType,string]; initialized:boolean; generation:number; reads:number }
export interface PlanAuxiliaryState { readonly ownerId:string; readonly identity:{readonly kind:'plan';readonly id:string}; readonly generation:number; readonly dirty:boolean; readonly phase:'idle'|'busy' }
const placePending=(view:View)=>view.addDate!==view.addBaseline[0]||view.addMeal!==view.addBaseline[1];
const addPending=(view:View)=>placePending(view)||view.addDish!==view.addBaseline[2];
/** #202: besides catalog dishes, Add offers saved recipes and inbox candidates and fixes them on the way in with existing calls. */
type KnowledgeClient=Pick<ReturnType<typeof createKnowledgeApi>,'request'|'send'|'materializationAttempt'>;
interface Choice { value:string; id:string; title:I18n; version?:number }
interface Choices { auth:number; recipes:Choice[]; candidates:Choice[]; truncated:boolean }
/**
 * One knowledge write per choice. An unconfirmed one keeps its request and key, so another click verifies it instead of writing again.
 * `fixed` is a confirmed fix the catalog has not shown yet: another click only reads the catalog again.
 */
interface Fix { attempt?:Attempt; ticket?:AuxiliaryOperation; unknown:boolean; error?:unknown; fixed?:string }
interface Fixing { busy:boolean; fixes:Map<string,Fix> }
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHOICE_PAGES=10;
const recipeChoice=(id:string,version:number)=>`recipe:${id}:${version}`;
const knowledgeChoice=(value:string)=>/^(?:recipe|candidate):/.test(value);
const rawPending=(view:View)=>view.invalid.size>0||addPending(view);
const planRange=(plan:AnyMenuPlan|null|undefined)=>plan?.schemaVersion==='3'?plan.dateRange:undefined;
const inPlanRange=(date:string,range:NonNullable<ReturnType<typeof planRange>>)=>range.start<=range.end&&date>=range.start&&date<=range.end;

/** An injected API changes transport only; browser fixtures still execute this production page. Without knowledge, Add offers catalog dishes only. */
export function createPlanRenderer(api:TeamMealsApi,knowledge?:()=>KnowledgeClient) {
  const views=new Map<string,View>();
  const auxiliary=new WeakMap<View,AuxiliaryEditHandle>();
  const fixing=new WeakMap<View,Fixing>();
  let choices:Choices|undefined,choicesError:unknown;
  // The plan page in front: a knowledge write that ends after its own page was left repaints this one instead.
  let repaint:()=>void=()=>{};
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
      views.clear();form=createForm();auth=api.sessionKey();choices=undefined;choicesError=undefined;
    }
    const owner=form, lang=ctx.lang, tr=(key:Parameters<typeof text>[1])=>text(lang,key);
    const L=(zh:string,en:string,uk:string)=>lang==='zh'?zh:lang==='en'?en:uk;
    const ordinalEn=(n:number)=>`${n}${n%100>=11&&n%100<=13?'th':['th','st','nd','rd'][n%10]??'th'}`;
    const [routeId,actionName,selectedDishRef]=rest.split('/');
    const id=routeId||currentPlan(ctx,api).id||datedPlanIdOfDate(localDateIso())||'';
    const selectedDish=actionName==='select'&&selectedDishRef&&/^kb-[0-9a-f]{32}-v[1-9][0-9]*$/.test(selectedDishRef)?selectedDishRef:null;
    if(!/^[a-z][a-z0-9-]*$/.test(id)){el.append(h('p',{role:'alert'},tr('error')));ctx.setReloadCoverage?.('read-only');return;}
    el.classList.add('tm-page');el.classList.add('tm-plan');
    const header=h('div',{class:'tm-head'},h('a',{href:adminHref()},tr('back')),h('h2',{class:'tm-plan-sr'},tr('plan')),h('a',{href:adminHref('plan',id,'import')},tr('import')));
    // The unsaved reminder is appended to the outlet itself, after the footer links: sticky can only move inside its
    // containing block, so it needs the whole page (like .adm-dish-bottom inside its form), not a wrapper of its own height.
    const body=h('div',{}),reminder=h('p',{class:'tm-plan-unsaved'});el.append(body,header);
    if(api.mode==='unconfigured'){body.append(h('div',{class:'tm-status',role:'status'},tr('unconfigured')));ctx.setReloadCoverage?.('read-only');return;}
    let catalog:TeamCatalog|null=null,loadError:unknown=null,remote:Source<AnyMenuPlan>|null|undefined;
    let compareError:unknown=null,comparing=false,contextId=0;
    let initialized=false,boundKey:string|undefined,requestedKey:string|undefined;
    let previewLoading=false,previewError:unknown=null,choicesLoading=false;
    // Repeat hints of the draft being painted: computed once per paint, read by each row.
    let hints:ReturnType<typeof planHints>|undefined;
    const photos=new Map<string,{url?:string;failed?:boolean}>();
    const disposePhotos=()=>{for(const photo of photos.values())if(photo.url)URL.revokeObjectURL(photo.url);photos.clear();};
    const today=localDateIso();
    const weekStart=weekStartOfPlanId(id,today);
    const defaultDate=weekStart&&/^week-\d{4}-\d{1,2}$/.test(id)&&today>=weekStart&&today<=shift(weekStart,6)?today:weekStart??today;
    const view:View=views.get(id)??{range:'all',date:defaultDate,invalid:new Map(),addDate:defaultDate,addMeal:'lunch',addDish:'',addBaseline:[defaultDate,'lunch',''],initialized:false,generation:++rawGeneration,reads:0};views.set(id,view);
    if(!auxiliary.has(view))auxiliary.set(view,registerAuxiliaryEdits({ownerId:`plan-buffer/${id}`,identity:{kind:'plan',id},boundary:api,operationTracking:'tickets',
      read:()=>({generation:view.generation,dirty:rawPending(view),phase:view.reads?'busy':'idle'})}));
    const isLive=()=>renderTicket===renderSequence&&el.isConnected&&owner===form&&auth===api.sessionKey();
    const sourceKey=()=>view.catalogCommit??owner.session.getState().source?.commit??'current-unsaved';
    // Bind what actually arrived, never whichever source happens to be current after an await.
    const catalogKey=(value:TeamCatalog|null)=>sourceKey()==='current-unsaved'?'current-unsaved':value?.commit;
    function paint() {
      if(!isLive())return;
      const s=owner.session.getState();contextId=s.contextId;
      if(s.identity?.id!==id){reminder.remove();replace(body,h('p',{role:'status'},tr('loading')),...(loadError?[h('p',{role:'alert'},apiMessage(loadError,lang)),action(tr('retry'),()=>void reloadCatalog())]:[]));return;}
      if(boundKey!==sourceKey()){catalog=null;disposePhotos();}
      if(initialized&&!catalog&&requestedKey!==sourceKey()){requestedKey=sourceKey();void reloadCatalog(false);}
      const active=document.activeElement instanceof HTMLElement?document.activeElement.dataset.focus:undefined;
      const documentStatus=status(s,lang),output:HTMLElement[]=[];
      const version=documentStatus.querySelector('details');
      if(version){version.remove();version.classList.add('tm-plan-version');}
      if(s.draft){
        selectPlan(api,id,s.draft.name);
        ctx.planSelection?.select(id,s.draft.name);
        const dateRange=planRange(s.draft);
        output.push(h('h2',{},pick(s.draft.name,lang)||tr('plan')));
        if(dateRange)output.push(h('p',{class:'tm-plan-note'},`${lang==='zh'?'计划日期':lang==='en'?'Plan dates':'Дати плану'}：${dateRange.start} — ${dateRange.end}`));
        const overview=hints=planHints(s.draft);
        output.push(h('p',{class:'tm-plan-overview'},L(`${overview.dishes} 道菜 · ${overview.different} 种 · 重复 ${overview.repeated} 种`,
          `${overview.dishes} ${overview.dishes===1?'dish':'dishes'} · ${overview.different} different · ${overview.repeated} repeated`,
          // Label-number pairs keep Ukrainian free of numeral agreement (1 страва / 2 страви / 5 страв).
          `Страв: ${overview.dishes} · різних: ${overview.different} · повторів: ${overview.repeated}`)));
        output.push(filters());
      }
      output.push(documentStatus);
      if(rawPending(view)){
        // C1 may be unchanged while page-owned inputs are still unapplied.
        if(s.phase==='clean'){
          documentStatus.firstChild!.textContent=tr('dirty');documentStatus.classList.add('dirty');
        }
        // The Add choices are explained under the Add form itself: a line added up here would push its button away (#202).
        if(view.invalid.size>0)documentStatus.append(h('div',{'data-plan-raw-pending':'true'},h('p',{},tr('invalidServings'))));
      }
      if(loadError)output.push(h('div',{class:'tm-error',role:'alert'},apiMessage(loadError,lang),action(tr('retry'),()=>void reloadCatalog())));
      if(s.error)output.push(h('p',{class:'tm-error',role:'alert'},apiMessage(new ApiError(s.error.status,s.error.code,s.error.message,s.error.errors,s.error.retryAfter,s.error.reviewRequired),lang)));
      if(s.phase==='outcome-unknown'){
        const recover=action(tr('recover'),()=>void owner.session.reconcileUnknown(s.contextId));recover.disabled=s.recovering;output.push(recover);
      }
      if(s.phase==='conflict')output.push(conflict());
      if(s.draft){
        if(view.pendingSelection)output.push(h('div',{class:'tm-card',role:'status'},
          h('p',{},lang==='zh'?'添加栏已有尚未加入的选择；新菜暂未覆盖它。':lang==='en'?'The Add form has an unfinished choice; the new dish has not replaced it.':'У формі вже є незавершений вибір.'),
          action(lang==='zh'?'改选新菜':lang==='en'?'Choose new dish':'Вибрати нову страву',()=>{
            view.addDish=view.pendingSelection!;view.pendingSelection=undefined;touch(view);paint();
          })));
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
        const save=action(tr('save'),()=>{
          void owner.session.save(s.contextId).then(result=>{
            // Consume the one-time inbox selection only after its added meal is
            // actually saved. A failed/unknown save keeps the deep link recoverable.
            if(result.status==='saved'&&view.selectedRouteAdded&&selectedDish&&isLive()&&
              location.hash===adminHref('plan',id,'select',selectedDish)&&typeof history!=='undefined'){
              history.replaceState(history.state,'',adminHref('plan',id));
              view.selectedRouteAdded=false;
            }
          });
        },true);
        const dateRange=planRange(plan);
        const invalidPlanRange=!!dateRange&&(dateRange.start>dateRange.end||plan.meals.some(meal=>!inPlanRange(meal.date,dateRange)));
        save.disabled=!s.dirty||s.operationId!==null||s.phase==='conflict'||view.invalid.size>0||invalidPlanRange;
        if(invalidPlanRange)output.push(h('p',{class:'tm-error',role:'alert'},lang==='zh'?'有菜品日期不在计划日期范围内，请先改正。':lang==='en'?'A dish is outside the plan dates. Correct it before saving.':'Страва поза датами плану. Виправте дату перед збереженням.'));
        output.push(h('div',{class:'tm-actions'},save,h('a',{class:'tm-button primary tm-plan-purchase',href:hrefOf('purchase',`new/${id}/${view.range}${view.range==='all'?'':`/${view.date}`}`)},lang==='zh'?'建立采购清单':lang==='en'?'Create shopping list':'Створити список покупок')),
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
      if(version)output.push(version);
      // Unsaved means the session's draft or page-owned inputs not yet applied (the status line above says the same).
      // A lost response is not a failed save: while the outcome is unknown the reminder repeats the verify-first status instead.
      // That sentence is already the live status line above, so here it is plain text, not a second role=status announcement.
      // An Add choice not yet added is explained under the Add form: this bar sticks to the bottom and would cover its button (#202).
      if(s.draft&&(s.dirty||view.invalid.size>0)){
        const unknownOutcome=s.phase==='outcome-unknown';
        if(unknownOutcome)reminder.removeAttribute('role');else reminder.setAttribute('role','status');
        reminder.textContent=unknownOutcome?tr('unknown'):
          L('有改动没保存 · 保存后还要发布，帮厨和采购才看得到','Changes not saved · after saving, publish too so the prep cooks and the buyer can see them','Є незбережені зміни · після збереження план ще треба опублікувати, щоб його побачили помічники кухаря й закупівельник');
        if(reminder.parentNode!==el)el.append(reminder);
      }else reminder.remove();
      replace(body,...output);
      // Same control, same place: the page's scroll padding for the bottom bars would otherwise scroll a control near the bottom (#202).
      if(active)body.querySelector<HTMLElement>(`[data-focus="${active}"]`)?.focus({preventScroll:true});
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
      const fromKnowledge=record?.provenance?.source==='knowledge';
      const missing=fromKnowledge
        ?lang==='zh'?'原片参考图仅师傅可见；菜单图片待授权或补录':lang==='en'?'Source frames are chef-only; menu image needs rights or upload':'Кадри джерела доступні лише кухарю; фото меню потребує дозволу або завантаження'
        :lang==='zh'?'图片未录':lang==='en'?'No image':'Без фото';
      const pending=lang==='zh'?'待授权/补图':lang==='en'?'Image pending':'Фото очікується';
      const box=h('div',{class:'tm-plan-photo',role:'img','aria-label':missing},h('span',{class:fromKnowledge?'tm-plan-photo-state':undefined,'aria-hidden':'true'},fromKnowledge?pending:'♧'));
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
    function catalogLabel(dish:TeamCatalog['dishes'][string]):string {
      const version=dish.provenance?.source==='knowledge'?` · KB v${dish.provenance.recipeVersion} · ${dish.provenance.recipeId.slice(0,8)}`:'';
      return `${pick(dish.name,lang)}${version}${dish.status&&dish.status!=='active'?` · ${recordValue(dish.status,lang)}`:''}`;
    }
    function dishSelect(value:string,key:string):HTMLSelectElement {
      const select=h('select',{'data-focus':key});select.append(h('option',{value:''},tr('choose')));
      if(value&&!Object.hasOwn(catalog?.dishes??{},value))select.append(h('option',{value},`${value} — ${tr('missingDish')}`));
      for(const [dishId,dish] of Object.entries(catalog?.dishes??{}))select.append(h('option',{value:dishId},catalogLabel(dish)));
      select.value=value;return select;
    }
    /** Add adds only what the catalog it shows has confirmed; a recipe or candidate is fixed first. */
    const addable=(choice:string)=>!choice||knowledgeChoice(choice)||Object.hasOwn(catalog?.dishes??{},choice);
    /** Add's three groups (#202). The catalog already holds every fixed version, so a saved recipe is listed only until that version is fixed. */
    function addChoices():[label:string,options:[value:string,text:string][]][] {
      const dishes=catalog?.dishes??{},live=choices?.auth===api.sessionKey()?choices:undefined;
      const fixed=new Set(Object.values(dishes).flatMap(dish=>dish.provenance?.source==='knowledge'?[recipeChoice(dish.provenance.recipeId,dish.provenance.recipeVersion)]:[]));
      const name=(title:I18n)=>title[lang]||title.zh||title.en||title.uk||L('没有菜名','Untitled','Без назви');
      const groups:ReturnType<typeof addChoices>=[
        [L('已排进菜单','Ready for menus','Готові для меню'),Object.entries(dishes).map(([dishId,dish])=>[dishId,catalogLabel(dish)])],
        [L('已存菜谱 · 还没排进菜单','Saved recipes · not on a menu yet','Збережені рецепти · ще не в меню'),(live?.recipes??[]).filter(choice=>!fixed.has(choice.value)||choice.value===view.addDish).map(choice=>[choice.value,`${name(choice.title)} · KB v${choice.version} · ${choice.id.slice(0,8)}`])],
        [L('收件箱 · 还没存成菜谱','Inbox · not saved as a recipe yet','Вхідні · ще не збережено як рецепт'),(live?.candidates??[]).map(choice=>[choice.value,name(choice.title)])],
      ];
      const value=view.addDish;
      if(value&&!groups.some(([,options])=>options.some(([option])=>option===value)))
        groups.unshift(['',[[value,knowledgeChoice(value)&&(choicesLoading||fixing.get(view)?.busy)?tr('loading'):`${value} — ${tr('missingDish')}`]]]);
      return groups.filter(([,options])=>options.length>0);
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
      const dishName=catalog?.dishes[meal.dishRef]?.name,name=pick(dishName,lang)||meal.dishRef;
      // Only the other language's own text; no fallback chain stands in for it.
      const otherText=(lang==='zh'?dishName?.uk:dishName?.zh)?.trim()||'';
      const turn=hints?.turns.get(index);
      const turnText=turn?[L(`本计划第 ${turn.nth} 次`,`${ordinalEn(turn.nth)} time in this plan`,`${turn.nth}-й раз у цьому плані`),
        ...(turn.previous?[L('上次 ','Last: ','Минулого разу: ')+displayDate(turn.previous,lang,{weekday:true})]:[])].join(' · '):'';
      const servingsMissing=meal.plannedServings===undefined&&!view.invalid.has(index);
      const servings=field(L('份数','Servings','Порції'),input);
      if(servingsMissing)servings.append(h('small',{class:'tm-plan-missing'},L('份数没填','servings missing','порції не вказано')));
      const edit=h('details',{class:'tm-plan-edit',open:view.editing===index},h('summary',{'aria-label':`${tr('dish')}: ${name}`},lang==='zh'?'编辑':lang==='en'?'Edit':'Змінити'),h('div',{},field(tr('dish'),dish),remove));
      edit.addEventListener('toggle',()=>{if(isLive()&&edit.isConnected){if(edit.open)view.editing=index;else if(view.editing===index)view.editing=undefined;}});
      const node=h('div',{class:'tm-meal-row','data-meal-index':index},h('div',{class:'tm-plan-row-main'},photo(meal.dishRef,name),h('div',{class:'tm-plan-dish-name'},h('b',{},name),otherText&&otherText!==name?h('small',{class:'tm-plan-other'},otherText):null,turnText?h('small',{class:'tm-plan-turn'},turnText):null,h('small',{},`${meal.date.slice(5)} · ${tr(meal.mealType)}${meal.serviceWindow?` · ${meal.serviceWindow}`:''}`)),servings),edit);
      if(view.invalid.has(index))node.append(h('p',{class:'tm-error'},tr('invalidServings')));
      return node;
    }
    function createAddForm() {
      const date=h('input',{type:'date',required:true,'data-focus':'add-date'});
      const meal=h('select',{'data-focus':'add-meal'});for(const key of meals)meal.append(h('option',{value:key},tr(key)));
      const dish=h('select',{'data-focus':'add-dish',required:true});
      const add=h('button',{type:'submit',class:'tm-button'},tr('add'));
      const summary=h('summary',{}),extra=h('details',{class:'tm-plan-add-extra'},summary,h('div',{},field(tr('date'),date),field(tr('meal'),meal)));
      const notes=h('div',{class:'tm-plan-add-notes'});
      const parts={form:h('form',{class:'tm-card tm-add-form'},field(tr('dish'),dish),add,extra,notes),date,meal,dish,add,extra,summary,notes,options:'',contextId:owner.session.getState().contextId};
      const current=()=>isLive()&&owner.session.getState().contextId===parts.contextId;
      const update=()=>{
        if(!current())return;
        view.addDate=date.value;view.addMeal=meal.value as MealType;view.addDish=dish.value;touch(view);paint();
      };
      date.addEventListener('input',update);meal.addEventListener('change',update);dish.addEventListener('change',update);
      extra.addEventListener('toggle',()=>{if(isLive()&&extra.isConnected)view.addExpanded=extra.open;});
      parts.form.addEventListener('submit',event=>{
        event.preventDefault();if(!current()||fixing.get(view)?.busy)return;
        const dateRange=planRange(owner.session.getState().draft),choice=dish.value,captured=parts.contextId;
        if(!date.value||!choice||(dateRange&&!inPlanRange(date.value,dateRange)))return;
        if(knowledgeChoice(choice)){void fixAndAdd(choice,date.value,meal.value as MealType,captured);return;}
        if(!addable(choice))return;
        if(owner.add(date.value,meal.value as MealType,choice,captured)){
          if(selectedDish&&choice===selectedDish)view.selectedRouteAdded=true;
          view.addBaseline=[view.addDate,view.addMeal,view.addDish];touch(view);paint();
        }
      });
      return parts;
    }
    let addParts:ReturnType<typeof createAddForm>|undefined;
    /** Built once per render and updated in place (#202): choosing a dish keeps the same button where it was and leaves the date and meal folded. */
    function addForm():HTMLElement {
      const s=owner.session.getState(),parts=addParts??=createAddForm();parts.contextId=s.contextId;
      const {date,meal,dish,add,extra,summary,notes}=parts;
      const dateRange=planRange(s.draft);
      const invalidDate=!!dateRange&&!!view.addDate&&!inPlanRange(view.addDate,dateRange);
      if(date.value!==view.addDate)date.value=view.addDate;
      attr(date,'min',dateRange?.start);attr(date,'max',dateRange?.end);attr(date,'aria-invalid',invalidDate?'true':undefined);
      meal.value=view.addMeal;
      const groups=addChoices(),options=JSON.stringify(groups);
      // Rebuilding the list closes an open picker, so it is rebuilt only when the choices themselves change.
      if(options!==parts.options){
        parts.options=options;
        replace(dish,h('option',{value:''},tr('choose')),...groups.flatMap(([label,list])=>{
          const items=list.map(([value,text])=>h('option',{value},text));
          return label?[h('optgroup',{label},...items)]:items;
        }));
      }
      dish.value=view.addDish;
      const busy=!!fixing.get(view)?.busy;
      dish.disabled=busy;add.disabled=busy||!view.addDate||invalidDate||!addable(view.addDish);
      attr(extra,'open',view.addExpanded||placePending(view)?'':undefined);
      summary.textContent=`${view.addDate.slice(5)} · ${tr(view.addMeal)}`;
      replace(notes,...addNotes(busy),
        dateRange&&dateRange.end<today?h('p',{class:'tm-plan-note',role:'status'},lang==='zh'?'此计划已过期；若要补排，请手动选择计划范围内的旧日期。':lang==='en'?'This plan has expired. To backfill it, explicitly choose a past date within its range.':'Цей план завершився. Для доповнення вручну виберіть минулу дату в його межах.'):null,
        invalidDate?h('p',{class:'tm-error',role:'alert'},lang==='zh'?'日期超出计划范围，请选择范围内的日期。':lang==='en'?'Choose a date within the plan dates.':'Виберіть дату в межах плану.'):null);
      return parts.form;
    }
    /** Everything that changes with a choice sits below the Add row, so nothing above or beside the button moves. */
    function addNotes(busy:boolean):(HTMLElement|null)[] {
      const choice=view.addDish,fix=fixing.get(view)?.fixes.get(choice),live=choices?.auth===api.sessionKey()?choices:undefined;
      return [
        addPending(view)?h('p',{class:'tm-plan-note','data-plan-raw-pending':'true'},`${view.addDate||tr('date')} · ${tr(view.addMeal)} — `,lang==='zh'?'添加栏的选择尚未加入计划；点击“加一道菜”后才会应用。':lang==='en'?'The Add choices have not been added to the plan. Use “Add a dish” to apply them.':'Вибір для додавання ще не внесено в план. Натисніть «Додати страву», щоб застосувати його.'):null,
        busy?h('p',{class:'tm-plan-note',role:'status'},L('正在排进菜单，请稍候……','Putting it on a menu…','Додаємо в меню…'))
          :fix?.error?fixNotice(choice,fix)
          :fix?.fixed?h('p',{class:'tm-plan-note',role:'status'},L('这一版已排进菜单，还没加进计划。点“加一道菜”会再读一次菜品目录，然后加进计划。','This version is on a menu now but not in the plan yet. Add a dish reads the dish list again, then adds it.','Цю версію вже додано в меню, але ще не в план. «Додати страву» ще раз прочитає список страв і додасть її.'))
          :choice.startsWith('candidate:')?h('p',{class:'tm-plan-note'},L('点“加一道菜”会先存为菜谱，再排进菜单（固定这一版），然后加进计划。','Add a dish saves it as a recipe, puts this version on a menu, then adds it to the plan.','«Додати страву» збереже її як рецепт, додасть цю версію в меню, а потім — у план.'))
          :choice.startsWith('recipe:')?h('p',{class:'tm-plan-note'},L('点“加一道菜”会先把这一版排进菜单（固定这一版），再加进计划。','Add a dish puts this version on a menu, then adds it to the plan.','«Додати страву» додасть цю версію в меню, а потім — у план.')):null,
        choicesError&&!live?h('p',{class:'tm-plan-note',role:'status'},L('收件箱和菜谱库没读到，只列出已排进菜单的菜。','The inbox and recipe library could not be read; only dishes ready for menus are listed.','Не вдалося прочитати вхідні й бібліотеку рецептів; показано лише страви, готові для меню.'),' ',action(tr('retry'),()=>void loadChoices())):null,
        live?.truncated?h('p',{class:'tm-plan-note'},L(`收件箱和菜谱库各只列出前 ${CHOICE_PAGES*100} 条。`,`Only the first ${CHOICE_PAGES*100} inbox items and recipes are listed.`,`Показано лише перші ${CHOICE_PAGES*100} позицій вхідних і рецептів.`)):null,
      ];
    }
    function fixNotice(choice:string,fix:Fix):HTMLElement {
      const known=fix.error instanceof KnowledgeError?fix.error:undefined,said=known?.said(lang)??[];
      const support=h('details',{},h('summary',{},L('技术支持详情','Support details','Деталі для підтримки')),
        h('pre',{},JSON.stringify(known?{status:known.status,code:known.code,message:known.message,details:known.details,key:fix.attempt?.key}:{message:String(fix.error)},null,2)));
      if(fix.unknown)return h('div',{class:'tm-plan-add-result',role:'status'},
        h('p',{},L('结果还没确认。再点“加一道菜”会用原来的请求确认，不会重复写。','The result is not confirmed yet. Use Add a dish again to check it with the original request; nothing is written twice.','Результат ще не підтверджено. Натисніть «Додати страву» ще раз, щоб перевірити тим самим запитом; нічого не запишеться двічі.')),support);
      // Registered words say what to do; the Worker's own lines add what exactly, unless they repeat it (as on the recipe page).
      const primary=(known&&contractErrorText(known.code,lang))||said[0]||known?.message||L('没能排进菜单。','It could not be put on a menu.','Не вдалося додати в меню.'),more=said.filter(line=>!primary.includes(line));
      const recipe=/^recipe:([0-9a-f-]{36}):/.exec(choice)?.[1];
      return h('div',{class:'tm-plan-add-result tm-error',role:'alert'},h('p',{},primary),
        more.length?h('ul',{},...more.map(line=>h('li',{},line))):null,
        h('p',{},L('这道菜没加进计划，计划没变。','The dish was not added; the plan is unchanged.','Страву не додано; план не змінено.')),
        recipe?h('a',{href:adminHref('knowledge',recipe)},L('打开这道菜谱','Open this recipe','Відкрити рецепт')):null,support);
    }
    /** Saved recipes and inbox candidates for Add. A failed read leaves the catalog choices as they are. */
    async function loadChoices():Promise<void>{
      if(!knowledge||choicesLoading)return;
      const client=knowledge(),key=api.sessionKey(),handle=auxiliary.get(view)!,ticket=handle.beginOperation('read');
      choicesLoading=true;view.reads++;touch(view);let failed=false;
      const all=async<T>(path:string,query:Record<string,string>)=>{
        const items:T[]=[];let after:string|null=null,pages=0;
        do{
          const {data}:{data:{items:T[];nextCursor:string|null}}=await client.request<{items:T[];nextCursor:string|null}>(`${path}?${new URLSearchParams(after?{...query,limit:'100',cursor:after}:{...query,limit:'100'})}`);
          items.push(...data.items);after=data.nextCursor;
        }while(after&&++pages<CHOICE_PAGES);
        return {items,truncated:!!after};
      };
      try{
        const [recipes,inbox]=await Promise.all([all<{id:string;title?:I18n;version:number}>('/recipes',{}),
          all<{candidateSummary?:{candidateId:string;title?:I18n;status:string}|null}>('/favorites/items',{state:'needs_review'})]);
        if(key!==api.sessionKey())return;
        choices={auth:key,truncated:recipes.truncated||inbox.truncated,
          recipes:recipes.items.flatMap(recipe=>UUID.test(recipe.id)&&Number.isSafeInteger(recipe.version)&&recipe.version>0?[{value:recipeChoice(recipe.id,recipe.version),id:recipe.id,title:recipe.title??{},version:recipe.version}]:[]),
          candidates:inbox.items.flatMap(({candidateSummary:candidate})=>candidate?.status==='needs_review'&&UUID.test(candidate.candidateId)?[{value:`candidate:${candidate.candidateId}`,id:candidate.candidateId,title:candidate.title??{}}]:[])};
        choicesError=undefined;
      }catch(error){failed=true;if(key===api.sessionKey())choicesError=error;}
      finally{choicesLoading=false;view.reads--;touch(view);handle.settleOperation(ticket,failed?'failed':'completed');repaint();}
    }
    /** Same calls and order as the inbox and the recipe page; nothing reaches the plan until the dish is fixed and in the catalog. */
    async function fixAndAdd(choice:string,date:string,meal:MealType,captured:number):Promise<void>{
      if(!knowledge)return;
      const client=knowledge(),state=fixing.get(view)??{busy:false,fixes:new Map<string,Fix>()};
      if(state.busy)return;
      fixing.set(view,state);state.busy=true;touch(view);paint();
      let key=choice,changed=false;
      // Only the page that was clicked reads the catalog or adds; a page opened since is repainted and adds with its own click.
      const current=()=>isLive()&&owner.session.getState().contextId===captured;
      try{
        const candidate=/^candidate:([0-9a-f-]{36})$/.exec(key);
        if(candidate){
          const saved=await send<{status?:string;recipeId?:string;recipeVersion?:number}>(state,key,()=>createAttempt(`/favorites/candidates/${candidate[1]}/review`,'POST',{decision:'approve',reviewer:SYSTEM_REVIEWER,note:SYSTEM_NOTE}),
            data=>data.status==='approved'&&typeof data.recipeId==='string'&&UUID.test(data.recipeId)&&Number.isSafeInteger(data.recipeVersion)&&data.recipeVersion!>0);
          // It is a saved recipe from here on: a refusal or a retry continues with the recipe and never saves it twice.
          changed=true;key=recipeChoice(saved.recipeId!,saved.recipeVersion!);
          if(view.addDish===choice){view.addDish=key;touch(view);}
        }
        const recipe=/^recipe:([0-9a-f-]{36}):([1-9][0-9]*)$/.exec(key);
        if(!recipe)return;
        const id=recipe[1]!,version=Number(recipe[2]);
        // A confirmed fix waits here until the catalog shows it: another click only reads the catalog again.
        let dishRef=state.fixes.get(key)?.fixed;
        if(!dishRef){
          ({dishRef}=await send<Materialization>(state,key,()=>client.materializationAttempt(id,version),
            data=>data.recipeId===id&&data.recipeVersion===version&&typeof data.dishRef==='string'&&/^kb[a-z0-9-]+$/.test(data.dishRef),
            ()=>fixedVersion(id,version)));
          changed=true;state.fixes.set(key,{unknown:false,fixed:dishRef});
        }
        if(!current())return;
        await reloadCatalog(true);
        if(!current()||!catalog||!Object.hasOwn(catalog.dishes,dishRef))return;
        // In the catalog now: from here on it is an ordinary catalog dish.
        state.fixes.delete(key);
        if(view.addDish===key){view.addDish=dishRef;touch(view);}
        if(owner.add(date,meal,dishRef,captured)){view.addBaseline=[date,meal,dishRef];touch(view);}
      }catch{/* send() keeps the error with its choice; the Add form shows it. */}
      finally{
        state.busy=false;touch(view);
        if(changed)void loadChoices();
        repaint();
      }
    }
    /** The repository read back: the exact recipe version fixed as a dish, never a guess from a refusal. */
    async function fixedVersion(id:string,version:number):Promise<Materialization|undefined>{
      const latest=await owner.loadLatestCatalog();
      const dishRef=Object.keys(latest.dishes).find(ref=>{const source=latest.dishes[ref]!.provenance;return source?.source==='knowledge'&&source.recipeId===id&&source.recipeVersion===version;});
      return dishRef?{dishRef,recipeId:id,recipeVersion:version,commit:latest.commit,unchanged:true}:undefined;
    }
    async function send<T>(state:Fixing,key:string,attempt:()=>Attempt,valid:(data:T)=>boolean,readBack?:()=>Promise<T|undefined>):Promise<T>{
      const handle=auxiliary.get(view)!;
      let fix=state.fixes.get(key);
      if(!fix?.attempt){fix={attempt:attempt(),ticket:handle.beginOperation('write'),unknown:false};state.fixes.set(key,fix);}
      const unconfirmed=fix.unknown;fix.error=undefined;
      try{
        const {data}=await knowledge!().send<T>(fix.attempt!);
        if(!valid(data))throw new KnowledgeError('Knowledge result does not match the request',0,'invalid_source');
        handle.settleOperation(fix.ticket!,'completed');state.fixes.delete(key);
        return data;
      }catch(error){
        fix.error=error;
        const known=error instanceof KnowledgeError?error:undefined;
        if(known&&(known.uncertain||known.code==='session_changed')){fix.unknown=true;handle.markUnknown(fix.ticket!);throw error;}
        // The endpoint need not replay a success by key: a refusal of an unconfirmed try, or a conflict with a written
        // snapshot, may follow a write that landed. Read the repository back before dropping anything.
        if(readBack&&(unconfirmed||known?.code==='conflict')){
          let found:T|undefined;
          try{found=await readBack();}catch{fix.unknown=true;handle.markUnknown(fix.ticket!);throw error;}
          if(found!==undefined){handle.settleOperation(fix.ticket!,'completed');state.fixes.delete(key);return found;}
        }
        handle.settleOperation(fix.ticket!,'failed');fix.attempt=undefined;fix.ticket=undefined;fix.unknown=false;
        throw error;
      }
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
          ? force?await owner.loadLatestCatalog():await owner.loadCatalog(false)
          : await owner.load(id,isLive,drafts.getDraftPlan(id)??undefined,()=>drafts.clearDraftPlan(id));
        if(isLive()&&owner.session.getState().identity?.id===id&&(state.identity?.id!==id||sourceKey()===key)){
          if(force&&result)view.catalogCommit=result.commit;
          catalog=result;boundKey=catalogKey(result);requestedKey=boundKey;loadError=null;
        }
      }catch(error){if(isLive())loadError=error;}paint();
    }
    repaint=paint;
    replace(body,h('p',{role:'status'},tr('loading')));
    const unsubscribe=owner.session.subscribe(()=>paint());
    const stopObserve=onDetached(el,()=>{unsubscribe();disposePhotos();if(owner.session.getState().contextId===contextId)owner.detach();});
    cleanup=()=>{unsubscribe();stopObserve();disposePhotos();};
    try{
      catalog=await owner.load(id,isLive,drafts.getDraftPlan(id)??undefined,()=>drafts.clearDraftPlan(id));
      if(!isLive())return;
      if(selectedDish){
        const latest=await owner.loadLatestCatalog();
        if(!isLive())return;
        catalog=latest;view.catalogCommit=latest.commit;
        if(Object.hasOwn(latest.dishes,selectedDish)){
          if(!addPending(view)||view.addDish===selectedDish){view.addDish=selectedDish;view.pendingSelection=undefined;touch(view);}
          else view.pendingSelection=selectedDish;
        }
      }
      boundKey=catalogKey(catalog);
      const s=owner.session.getState();
      if(!view.initialized){
        const date=s.draft?.meals[0]?.date;
        const dateRange=planRange(s.draft);
        if(dateRange){
          const preferred=inPlanRange(defaultDate,dateRange)?defaultDate:date&&inPlanRange(date,dateRange)?date:dateRange.start;
          if(view.date===defaultDate)view.date=preferred;
          // A deep link may already have selected the dish. Its date is still an untouched default.
          if(view.addDate===view.addBaseline[0]){
            const addDate=dateRange.end<today?'':preferred;
            view.addDate=addDate;view.addBaseline=[addDate,view.addBaseline[1],view.addBaseline[2]];
          }
        }else{
          if(date&&view.date===defaultDate)view.date=date;
          if(date&&!addPending(view)){view.addDate=date;view.addBaseline=[date,view.addMeal,view.addDish];}
        }
        view.initialized=true;
      }
    }catch(error){if(isLive())loadError=error;}
    finally{ctx.setReloadCoverage?.('tracked');}
    initialized=true;requestedKey=loadError?sourceKey():boundKey;
    paint();
    void loadChoices();
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
function attr(node:Element,name:string,value:string|undefined):void {if(value===undefined)node.removeAttribute(name);else node.setAttribute(name,value);}
let renderer:ReturnType<typeof createPlanRenderer>|undefined;
const workerUrl:unknown=import.meta.env.VITE_WORKER_URL;
export function render(el:HTMLElement,ctx:PageCtx,rest:string):Promise<void>{return (renderer??=createPlanRenderer(getTeamMealsApi(),typeof workerUrl==='string'&&workerUrl?getKnowledgeApi:undefined))(el,ctx,rest);}
