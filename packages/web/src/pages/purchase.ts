/** Team shopping: C1 owns writes, C2 owns basis/collection/review/estimate. */
import './admin/plan.css';
import './purchase.css';
import {normalizeSelection,type AnyMenuPlan,type ShoppingSelection,type ShoppingList} from '@canteenos/core';
import {getTeamMealsApi,type TeamMealsApi,type ShoppingListIndex,type ShoppingListSummary,type ShoppingDecisionCounts} from '../api/team-meals';
import {ApiError,type Source} from '../api/types';
import type {PublishedTeamPlan} from '../data';
import {apiMessage} from '../admin/kit';
import {h,replace} from '../dom';
import type {PageCtx} from '../types';
import {hrefOf} from '../router';
import {registerAuxiliaryEdits,type AuxiliaryEditHandle} from '../view-models/reload-safety';
import {adminHref} from './admin';
import {action,field,onDetached,status,text} from './team-ui';
import {createPurchaseForm,type PurchaseConflict} from './purchase-form';
import {shoppingText,renderCandidates,type ShoppingWord} from './purchase-list';
import {shoppingCopy} from './shopping-copy';
import {pick} from '../i18n';
import {word,supportDetails} from './record-display';

interface Scope {revision:string;planIds:string;plans:Record<string,AnyMenuPlan>;options:ShoppingSelection[];selected:ShoppingSelection[]}
interface View {listId:string;planIds:string;scope:Scope|null;baseline:{listId:string;planIds:string;scope:string};generation:number;inputGeneration:number;active:number;createdId?:string;completed?:boolean;listeners:Set<()=>void>;reload:AuxiliaryEditHandle}
export interface PurchaseAuxiliaryState {readonly ownerId:string;readonly identity:{readonly kind:'shopping-list';readonly id:string};readonly generation:number;readonly dirty:boolean;readonly phase:'idle'}
const scopeKey=(scope:Scope|null)=>scope?JSON.stringify([scope.revision,normalizeSelection(scope.selected)]):'';
const rawPending=(view:View)=>view.listId!==view.baseline.listId||view.planIds!==view.baseline.planIds||scopeKey(view.scope)!==view.baseline.scope;
const validId=(value:string)=>/^[a-z][a-z0-9-]*$/.test(value);
const slotKey=(s:ShoppingSelection)=>JSON.stringify([s.menuPlanRef,s.date,s.mealType]);
const selectionKey=(selection:ShoppingSelection[])=>JSON.stringify(normalizeSelection(selection).map(slotKey));
const countDecisions=(list:ShoppingList):ShoppingDecisionCounts=>{
 const counts={check:0,buy:0,available:0,bought:0};
 for(const item of list.items)counts[item.decision==='buy'&&item.bought===true?'bought':item.decision]++;
 return counts;
};
export function createPurchaseRenderer(api:TeamMealsApi){
 let auth=api.sessionKey(),controller=createPurchaseForm(api,{at:new Date().toISOString()}),epoch=0,cleanup=()=>{};
 const views=new Map<string,View>();let generation=0;
 const recent:ShoppingList[]=[];
 let detailsModule:typeof import('./team-details')|undefined;
 const touch=(view:View)=>{view.generation=++generation;};
 const notify=(view:View)=>{for(const paint of view.listeners)paint();};
 function createView(key:string,listId:string,planIds:string):View {
  const value={listId,planIds,scope:null,baseline:{listId,planIds,scope:''},generation:++generation,inputGeneration:0,active:0,listeners:new Set<()=>void>()};
  const reload=registerAuxiliaryEdits({ownerId:`purchase-buffer/${key}`,identity:{kind:'shopping-list',id:key},boundary:api,operationTracking:'tickets',read:()=>({generation:value.generation,dirty:rawPending(view),phase:'idle'})});
  const view=Object.assign(value,{reload});return view;
 }
 async function renderPurchase(el:HTMLElement,ctx:PageCtx):Promise<void>{
  let covered=false;
  try{
  cleanup();const ticket=++epoch;
  if(auth!==api.sessionKey()){auth=api.sessionKey();controller=createPurchaseForm(api,{at:new Date().toISOString()});for(const previous of views.values())previous.reload.dispose();views.clear();recent.length=0;}
  const form=controller,lang=ctx.lang,t=(key:ShoppingWord)=>shoppingText(lang,key),tr=(key:Parameters<typeof text>[1])=>text(lang,key);
  const [routeId='',detailKind='',detailId='',rangeDate='',extra]=ctx.rest.split('/');
  const creating=!routeId||routeId==='new';
  const entry=!routeId,range=creating&&detailId?detailId:'all';
  const validRange=['all','day','week'].includes(range)&&(!rangeDate||/^\d{4}-\d{2}-\d{2}$/.test(rangeDate)&&Number.isFinite(Date.parse(`${rangeDate}T12:00:00Z`))&&new Date(`${rangeDate}T12:00:00Z`).toISOString().slice(0,10)===rangeDate);
  const detail=!creating&&(detailKind==='ingredient'||detailKind==='dish')&&validId(detailId);
  if((!creating&&!validId(routeId))||extra||(!creating&&(rangeDate||detailKind&&!detail))||(creating&&(!validRange||detailKind&&!validId(detailKind)||range!=='all'&&!rangeDate))){el.append(h('p',{role:'alert'},t('missing')));return;}
  if(api.mode==='unconfigured'){await renderPublishedOnly(el,ctx);return;}
  const key=creating?`new/${detailKind}${detailId?`/${detailId}/${rangeDate}`:''}`:routeId;
  const previous=views.get(key);
  if(creating&&previous?.completed&&!rawPending(previous)&&!previous.active){previous.reload.dispose();views.delete(key);}
  const view=views.get(key)??createView(key,creating?`shop-${new Date().toISOString().slice(0,10)}-${crypto.randomUUID().slice(0,8)}`:routeId,creating?(detailKind||ctx.planId||''):ctx.planId||'');views.set(key,view);covered=true;
  const live=()=>ticket===epoch&&el.isConnected&&controller===form&&auth===api.sessionKey();
  let error:unknown=null,notFound=false,remote:PurchaseConflict|null=null,disposeDetail=()=>{},context=0;
  let index:ShoppingListIndex|null=null,indexError:unknown=null,indexBusy=false;
  const planChoices=new Map<string,AnyMenuPlan|null>();let plansFailed=false;
  const w=(zh:string,en:string,uk:string)=>word(lang,zh,en,uk);
  el.classList.add('tm-page');el.classList.add('tm-purchase');const body=h('div',{});
  el.append(body,h('div',{class:'tm-head'},h('a',{href:hrefOf('purchase',detail?routeId:'')},tr('back')),h('h2',{class:'sr-only'},t('title')),h('a',{href:adminHref('plan',ctx.planId??'')},tr('plan'))));
  // Every non-C1 readonly operation settles its own original handle, even after auth/navigation.
  async function read<T>(work:()=>Promise<T>,advance=true):Promise<T>{
   const handle=view.reload,operation=handle.beginOperation('read');if(advance)touch(view);
   try{const result=await work();handle.settleOperation(operation,'completed');return result;}
   catch(e){handle.settleOperation(operation,'failed');throw e;}
   finally{if(advance)touch(view);}
  }
  async function run(work:()=>Promise<unknown>,kind:'read'|'c1'='read',initial=false){
   if(!live()||(!initial&&view.active))return;view.active++;error=null;notify(view);
   try{await(kind==='read'?read(work):work());}catch(e){if(live())error=e;}
   finally{view.active--;notify(view);}
  }
  function update(key:'listId'|'planIds',value:string){if(!live()||view[key]===value)return;view[key]=value;view.inputGeneration++;touch(view);const active=document.activeElement instanceof HTMLElement?document.activeElement.dataset.focus:undefined;paint();if(active)body.querySelector<HTMLElement>(`[data-focus="${active}"]`)?.focus();}
  function rawNotice(){return h('p',{class:'tm-status dirty',role:'status','data-purchase-raw-pending':'true'},lang==='zh'?'清单名称或范围选择尚未应用。':lang==='en'?'The list ID or scope choices have not been applied.':'Назву списку або вибір діапазону ще не застосовано.');}
  function sourceVersion(revision:string){return h('details',{class:'tm-source'},h('summary',{},t('revision')),h('code',{},revision));}
  function scopeLabel(s:ShoppingSelection){const name=pick(view.scope?.plans[s.menuPlanRef]?.name??planChoices.get(s.menuPlanRef)?.name,lang);return `${s.date} · ${tr(s.mealType)}${name?` · ${name}`:''}`;}
  function errorNode(e:unknown){return h('p',{class:'tm-error',role:'alert'},apiMessage(e,lang));}
  function paint(){
   if(!live())return;const busy=view.active>0;disposeDetail();disposeDetail=()=>{};
   const s=form.session.getState();context=s.contextId;
   if(s.identity&&s.phase!=='closed')for(const origin of views.values())if(origin.createdId===s.identity.id)origin.completed=!!s.source&&!s.dirty&&!s.operationId&&s.phase!=='conflict'&&s.phase!=='outcome-unknown';
   const loaded=!creating&&s.identity?.id===routeId&&s.phase!=='closed'&&s.draft&&form.basis;
   const nodes:HTMLElement[]=[];
   if(api.mode==='mock')nodes.push(h('p',{class:'tm-status'},tr('mock')));
   if(error)nodes.push(errorNode(error));
   if(rawPending(view))nodes.push(rawNotice());
   if(busy)nodes.push(h('p',{role:'status'},tr('loading')));
   if(!loaded){
    if(notFound)nodes.push(h('p',{role:'status'},t('noList')));
    nodes.push(h('section',{class:'tm-purchase-intro'},h('small',{},t('intro')),h('h2',{},t('headline'))));
    if(entry)nodes.push(discovery());
    else if(creating||notFound)nodes.push(scopeForm(false));
    else if(!busy)nodes.push(action(tr('retry'),()=>void load()));
    nodes.push(h('details',{class:'tm-card tm-purchase-advanced'},h('summary',{},w('按清单编号打开','Open by list ID','Відкрити за номером списку')),openForm()));
    replace(body,...nodes);return;
   }
   const list=s.draft!,basis=form.basis!;
   if(s.source&&!s.dirty&&!s.operationId){const i=recent.findIndex(x=>x.id===list.id);if(i>=0)recent.splice(i,1);recent.unshift(structuredClone(list));recent.splice(5);}
   if(!view.scope){
    const selection=normalizeSelection(list.basis.selection),planIds=Object.keys(basis.projection.menuPlans).join(', ');
    view.scope={revision:basis.sourceRevision,planIds,plans:basis.projection.menuPlans,options:selection,selected:selection};
    if(view.planIds===view.baseline.planIds)view.planIds=planIds;
    view.baseline.planIds=planIds;view.baseline.scope=scopeKey(view.scope);touch(view);
   }
   const stateNode=status(s,lang);if(s.phase==='saved-but-unpublished'&&stateNode.firstChild)stateNode.firstChild.textContent=t('saved');if(s.phase==='saving'&&stateNode.firstChild)stateNode.firstChild.textContent=lang==='zh'?'正在保存清单…':lang==='en'?'Saving list…':'Збереження списку…';const savedVersion=stateNode.querySelector('details');savedVersion?.remove();nodes.push(stateNode);
   const record=h('details',{class:'tm-purchase-record'},h('summary',{},w('清单与资料','List and source records','Список і вихідні дані')),listReference(list.id),savedVersion,sourceVersion(basis.sourceRevision));
   if(s.error)nodes.push(errorNode(new ApiError(s.error.status,s.error.code,s.error.message,s.error.errors,s.error.retryAfter,s.error.reviewRequired)));
   if(detail){
    nodes.push(record);
    if(!detailsModule){nodes.push(h('p',{role:'status'},tr('loading')));if(!busy)nodes.push(action(tr('retry'),()=>void load()));replace(body,...nodes);return;}
    const holder=h('article',{});nodes.push(h('a',{href:hrefOf('purchase',list.id)},t('title')),holder);replace(body,...nodes);
    disposeDetail=detailsModule.renderTeamDetails(holder,{lang,projection:basis.projection,kind:detailKind as 'ingredient'|'dish',id:detailId,
     asset:(owner,pointer)=>read(()=>form.getAsset(owner,pointer)),techniqueAsset:async techniqueRef=>{
      const catalog=await read(()=>api.getCatalog({revision:basis.sourceRevision}));
      if(catalog.commit!==basis.sourceRevision)throw new ApiError(0,'revision_mismatch','');
      const index=catalog.techniques.findIndex(item=>item.id===techniqueRef);
      if(index<0)throw new ApiError(404,'not_found','');
      if(!live()||form.basis!==basis)throw new ApiError(0,'session_changed','');
      return read(()=>form.getAsset('data/techniques.json',`/${index}/image`));
     },href:(kind,id)=>hrefOf('purchase',`${list.id}/${kind}/${id}`),current:()=>{location.hash=adminHref(detailKind,detailId);}});return;
   }
   const dates=[...new Set(list.basis.selection.map(slot=>slot.date))].sort(),meals=[...new Set(list.basis.selection.map(slot=>tr(slot.mealType)))];
   const scopeTitle=`${dates.length>1?`${dates[0]} – ${dates.at(-1)}`:dates[0]??t('scope')} · ${meals.join(' / ')}`;
   nodes.push(h('section',{class:'tm-purchase-intro tm-purchase-loaded'},h('h2',{},t('title')),
    h('details',{class:'tm-purchase-scope'},h('summary',{},scopeTitle),...list.basis.selection.map(slot=>h('p',{},scopeLabel(slot))))));
   const counts=countDecisions(list);
   nodes.push(h('div',{class:'tm-purchase-metrics',role:'group','aria-label':t('summary')},...(['check','buy','available','bought'] as const).map(decision=>h('div',{},h('small',{},t(decision)),h('b',{'data-decision-count':decision},String(counts[decision]))))));
   if(s.phase==='outcome-unknown'){const recover=action(tr('recover'),()=>void run(()=>form.reconcileUnknown(s.contextId),'c1'));recover.disabled=s.recovering||busy;nodes.push(recover);}
   if(s.phase==='conflict')nodes.push(conflictPanel(list));
   if(!s.source)nodes.push(h('p',{class:'tm-status'},t('first')));
   else if(!form.canDecide&&!s.operationId&&s.phase!=='conflict')nodes.push(h('p',{class:'tm-status'},t('changed')));
   const save=action(t('save'),()=>void run(()=>form.save(s.contextId),'c1'),true);save.disabled=busy||!s.dirty||!!s.operationId||s.phase==='conflict';nodes.push(h('div',{class:'tm-purchase-actions'},save,copyPanel(list)));
   const removed=form.review?.removed??[];
   if(removed.length)nodes.push(h('section',{class:'tm-card tm-removed'},h('h3',{},t('removed')),...removed.map(item=>h('p',{},`${item.ingredientRef} · ${t(item.decision)}${item.bought?` · ${t('bought')}`:''}`))));
   nodes.push(renderCandidates({lang,...basis.projection,estimate:basis.estimate,compact:true,
    href:(kind,id)=>hrefOf('purchase',`${list.id}/${kind}/${id}`),controls:(id)=>decisions(id,list)}));
   nodes.push(record,h('details',{class:'tm-purchase-advanced'},h('summary',{},t('apply')),scopeForm(true)));replace(body,...nodes);
  }
  function listReference(id:string){return h('p',{class:'tm-list-reference'},w('清单编号','List number','Номер списку'),' · ',h('code',{},id));}
  function savedLink(item:ShoppingListSummary,continuing=false){
   const dates=[...new Set(item.selection.map(s=>s.date))].sort(),label=dates.length>1?`${dates[0]} – ${dates.at(-1)}`:dates[0]??w('未记录日期','Date unrecorded','Дату не записано');
   return h('article',{class:'tm-saved-list'},h('a',{href:hrefOf('purchase',item.id)},h('b',{},label),h('span',{},`${[...new Set(item.selection.map(slot=>tr(slot.mealType)))].join(' / ')} · ${item.itemCount} ${w('项材料','ingredients','інгредієнтів')} · ${item.selection.length} ${w('餐次','meal slots','прийомів їжі')}`),continuing?h('strong',{},w('继续这份清单','Continue list','Продовжити цей список')):null),
    h('div',{class:'tm-saved-progress',role:'group','aria-label':w('已保存判断','Saved decisions','Збережені рішення')},h('p',{},w('已保存判断','Saved decisions','Збережені рішення')),...(['check','buy','available','bought'] as const).map(decision=>h('div',{},h('span',{},t(decision)),h('b',{'data-decision-count':decision},String(item.decisionCounts[decision]))))),listReference(item.id),
    h('details',{},h('summary',{},w('查看范围','View scope','Переглянути діапазон')),...item.selection.map(s=>h('p',{},scopeLabel(s))),supportDetails(lang,JSON.stringify({id:item.id,selection:item.selection}))));
  }
  const matchingLists=(selection:ShoppingSelection[])=>index?.items.filter(item=>selectionKey(item.selection)===selectionKey(selection))??[];
  const indexComplete=()=>!!index&&!indexBusy&&!indexError&&!index.nextCursor&&!index.skipped;
  function savedIndex(selection?:ShoppingSelection[]){
   const card=h('section',{[selection?'data-same-scope':'data-shopping-index']:'true'},h('h3',{},selection?w('相同范围的已保存清单','Saved lists for this exact scope','Збережені списки для цього діапазону'):w('已保存的清单','Saved lists','Збережені списки')));
   if(!selection&&recent.length)card.append(h('details',{},h('summary',{},w('本次使用最近打开','Recently opened in this session','Нещодавно відкриті в цьому сеансі')),...recent.map(list=>savedLink({id:list.id,selection:list.basis.selection,itemCount:list.items.length,decisionCounts:countDecisions(list)}))));
   if(indexBusy)card.append(h('p',{role:'status'},tr('loading')));
   const items=selection?matchingLists(selection):index?.items??[];
   card.append(...items.map(item=>savedLink(item,!!selection)));
   if(indexComplete()&&!items.length)card.append(h('p',{},selection?w('这个范围还没有已保存清单。','No saved list has this exact scope.','Для цього діапазону ще немає збереженого списку.'):w('还没有保存的采购清单。先从计划选择采购范围。','No saved shopping lists yet. Choose a plan to start.','Збережених списків ще немає. Спочатку виберіть план.')));
   if(index?.nextCursor)card.append(h('p',{},w('当前仅检查了部分清单，还有下一页。','Only part of the saved lists has been checked. More results are available.','Перевірено лише частину списків. Доступна наступна сторінка.')));
   if(index?.skipped)card.append(h('p',{role:'status'},`${index.skipped} ${w('份记录无法读取，清单列表不完整。请联系管理员检查。','records could not be read; this list is incomplete. Ask an administrator to check.','записів не вдалося прочитати; список неповний. Зверніться до адміністратора.')}`));
   if(indexError)card.append(h('p',{role:'alert'},w('清单列表读取失败；不能据此判断没有清单。','Saved lists could not be loaded; this does not mean none exist.','Не вдалося завантажити списки; це не означає, що їх немає.')),errorNode(indexError));
   if(indexError&&index?.items.length)card.append(h('p',{role:'status'},w('以上是上次读到的清单和已保存判断；本次未更新成功。','Showing previously loaded lists and saved decisions; this refresh failed.','Показано попередньо завантажені списки та рішення; оновлення не вдалося.')));
   const more=action(index?.nextCursor?w('加载更多','Load more','Завантажити ще'):indexError?tr('retry'):w('刷新清单','Refresh lists','Оновити списки'),()=>void loadIndex(index?.nextCursor??undefined));more.disabled=indexBusy;card.append(more);
   return card;
  }
  function discovery(){
   const card=savedIndex();
   const start=h('section',{class:'tm-card'},h('h3',{},w('从计划新建清单','Create from a plan','Створити з плану')));
   for(const [id,plan] of planChoices){if(plan)start.append(h('a',{class:'tm-button',href:hrefOf('purchase',`new/${id}/all`)},pick(plan.name,lang)||w('已保存的计划','Saved plan','Збережений план')));}
   if(!planChoices.size||plansFailed)start.append(h('p',{},w('未能列出可用计划。可从排菜单页打开所需计划，再选择“建立采购清单”。','Available plans could not be listed. Open a plan on the planning page and choose “Create shopping list”.','Не вдалося показати доступні плани. Відкрийте потрібний план і виберіть «Створити список покупок».')));
   start.append(h('a',{href:adminHref('plan',ctx.planId??'')},tr('plan')));card.append(start);return card;
  }
  async function loadIndex(cursor?:string){
   if(!live()||indexBusy)return;indexBusy=true;indexError=null;paint();
   try{const result=await read(()=>api.listShoppingLists({cursor,force:true}),false);if(!live())return;
    if(cursor&&index&&result.commit!==index.commit)throw new ApiError(0,'revision_mismatch','');
    index=cursor&&index?{...result,items:[...index.items,...result.items],skipped:index.skipped+result.skipped}:result;
   }catch(e){if(live())indexError=e;}finally{indexBusy=false;paint();}
  }
  async function loadPlans(){
   const ids=[...new Set([ctx.planId,...(ctx.publication?.manifest.plans??[])].filter((id):id is string=>!!id&&validId(id)))];
   const results=await read(()=>Promise.allSettled(ids.slice(0,20).map(async id=>[id,(await api.getPlan(id))?.content??null] as const)));
   if(!live())return;plansFailed=ids.length>20;
   for(const result of results){if(result.status==='fulfilled'){planChoices.set(...result.value);if(!result.value[1])plansFailed=true;}else plansFailed=true;}paint();
  }
  function openForm(){
   const busy=view.active>0;
   const id=h('input',{value:view.listId,pattern:'[a-z][a-z0-9-]*',required:true,'data-focus':'list-id'});id.addEventListener('input',()=>update('listId',id.value));
   const open=h('button',{type:'submit',class:'tm-button'},t('open'));open.disabled=busy;
   const formEl=h('form',{class:'tm-card tm-tools'},field(t('id'),id),open,h('a',{href:hrefOf('purchase','new')},t('new')));
   formEl.addEventListener('submit',e=>{e.preventDefault();if(live()&&!busy&&validId(id.value))location.hash=hrefOf('purchase',id.value);});return formEl;
  }
  async function readScope(){
   // Settling an older read is not a new user choice. Only input edits invalidate this scope.
   const captured=view.inputGeneration,planIds=view.planIds;
   const ids=[...new Set(planIds.split(',').map(s=>s.trim()).filter(Boolean))];
   if(!ids.length||ids.some(id=>!validId(id)))throw new ApiError(400,'invalid_selection','');
   const first=await api.getPlan(ids[0]!,{force:true});if(!first)throw new ApiError(404,'not_found','');
   const sources:[string,Source<AnyMenuPlan>][]=[[ids[0]!,first]];
   for(const id of ids.slice(1)){const source=await api.getPlan(id,{revision:first.commit,force:true});if(!source)throw new ApiError(404,'not_found','');sources.push([id,source]);}
   if(!live()||view.inputGeneration!==captured)return;
   if(sources.some(([,source])=>source.commit!==first.commit))throw new ApiError(0,'revision_mismatch','');
   const prior=view.scope?.selected??(!creating?form.session.getState().draft?.basis.selection:undefined);
   const options=normalizeSelection([...sources.flatMap(([menuPlanRef,source])=>source.content.meals.map(m=>({menuPlanRef,date:m.date,mealType:m.mealType}))),...(prior??[]).filter(s=>ids.includes(s.menuPlanRef))]);
   const end=rangeDate?new Date(`${rangeDate}T12:00:00Z`):null;if(end)end.setUTCDate(end.getUTCDate()+6);
   const selected=prior?options.filter(s=>prior.some(p=>slotKey(s)===slotKey(p))):options.filter(s=>range==='all'||range==='day'&&s.date===rangeDate||range==='week'&&s.date>=rangeDate&&s.date<=end!.toISOString().slice(0,10));
   view.scope={revision:first.commit,planIds,plans:Object.fromEntries(sources.map(([id,source])=>[id,source.content])),options,selected};touch(view);
  }
  function scopeForm(existing:boolean){
   const busy=view.active>0;
   const generated=!existing&&view.createdId===view.listId;
   const resume=()=>h('section',{class:'tm-card'},h('p',{},w('这份清单已生成，请打开继续处理并保存。','This list has been created. Open it to continue and save.','Цей список уже створено. Відкрийте його, щоб продовжити та зберегти.')),h('a',{class:'tm-button primary',href:hrefOf('purchase',view.createdId!)},t('open')));
   if(generated&&!rawPending(view))return resume();
   const input=h('input',{value:view.planIds,'data-focus':'plan-ids'});input.addEventListener('input',()=>update('planIds',input.value));
   const read=action(t('read'),()=>void run(readScope));read.disabled=busy||(existing&&!form.canRebase);
   const advanced=h('details',{class:'tm-purchase-advanced'},h('summary',{},w('调整计划编号','Change plan IDs','Змінити номери планів')),field(t('plans'),input));
   const card=h('section',{class:'tm-card'},h('h3',{},existing?t('apply'):t('new')),h('p',{},w('选择日期和餐次；清单编号已自动生成。','Choose dates and meals. The list ID is generated automatically.','Виберіть дати та прийоми їжі. Номер списку створено автоматично.')),advanced,read);
   if(generated)card.prepend(resume());
   if(existing&&!form.canRebase)card.append(h('p',{class:'muted'},t('saveBefore')));
   if(!existing){const name=h('input',{value:view.listId,pattern:'[a-z][a-z0-9-]*','data-focus':'new-list-id'});name.addEventListener('input',()=>update('listId',name.value));advanced.append(field(w('清单编号','List ID','Номер списку'),name));}
   if(view.scope){
    const scope=view.scope;card.append(sourceVersion(scope.revision));
    if(!scope.options.length)card.append(h('p',{role:'status'},w('此计划还没有餐次。先在排菜单页添加并保存。','This plan has no meals. Add and save meals on the planning page first.','У плані ще немає прийомів їжі. Спочатку додайте та збережіть їх.')));
    else if(!scope.selected.length)card.append(h('p',{role:'status'},w('当前范围没有选中餐次，请从下面选择。','No meals selected for this range. Choose below.','У цьому діапазоні не вибрано прийомів їжі. Виберіть нижче.')));
    for(const option of scope.options){const checkbox=h('input',{type:'checkbox',checked:scope.selected.some(s=>slotKey(s)===slotKey(option))});checkbox.disabled=busy;
     checkbox.addEventListener('change',()=>{if(!live()||view.scope!==scope||busy)return;scope.selected=normalizeSelection(checkbox.checked?[...scope.selected,option]:scope.selected.filter(s=>slotKey(s)!==slotKey(option)));view.inputGeneration++;touch(view);paint();});
     card.append(h('label',{class:'tm-slot'},checkbox,h('span',{},scopeLabel(option))));}
    if(!existing&&scope.selected.length)card.append(savedIndex(scope.selected));
    const checkedIndex=index,checkedError=indexError,choiceScope=scopeKey(scope);
    const createLabel=indexBusy?t('create'):!indexComplete()?w('未查全旧单，仍要新建','Create despite incomplete search','Створити попри неповну перевірку'):matchingLists(scope.selected).length?w('新建另一份清单','Create another list','Створити окремий список'):t('create');
    if(!existing&&!indexBusy&&!indexComplete())card.append(h('p',{class:'muted'},w('可能还有同范围旧单。可继续检查，也可明确新建；已有清单会保留。','Other lists may have this scope. Keep checking or explicitly create a separate list; existing lists stay unchanged.','Можуть бути інші списки з цим діапазоном. Продовжте перевірку або створіть окремий список; наявні залишаться без змін.')));
    const apply=action(existing?t('apply'):createLabel,()=>void run(async()=>{
     // This visible choice belongs to the exact scope and discovery result shown.
     if(!existing&&(indexBusy||checkedIndex!==index||checkedError!==indexError||scope!==view.scope||choiceScope!==scopeKey(scope)))return;
     if(!scope.selected.length||!validId(view.listId)||view.planIds!==scope.planIds)throw new ApiError(400,'invalid_selection',t('choose'));
     const id=view.listId,baseline={listId:id,planIds:view.planIds,scope:scopeKey(scope)};
     const request={revision:scope.revision,selection:structuredClone(scope.selected),at:new Date().toISOString()};
     const result=existing?await form.rebase(request,live):await form.create(id,request,live);
     if(result){view.baseline=baseline;if(!existing){view.createdId=id;view.completed=false;}touch(view);if(!existing&&live())location.hash=hrefOf('purchase',id);}
    }),true);apply.disabled=generated||busy||(!existing&&indexBusy)||!scope.selected.length||!validId(view.listId)||view.planIds!==scope.planIds||(existing&&!form.canRebase);card.append(apply);
   }return card;
  }
  function decisions(id:string,list:ShoppingList){
   const busy=view.active>0;
   const item=list.items.find(x=>x.ingredientRef===id)!,s=form.session.getState(),captured=s.contextId;
   const group=h('div',{class:'tm-decisions'});
   for(const decision of ['check','buy','available'] as const){const button=action(t(decision),()=>{try{form.decide(id,decision,undefined,captured);}catch(e){error=e;paint();}});button.setAttribute('aria-pressed',String(item.decision===decision));button.disabled=busy||!form.canDecide||(decision!=='check'&&!Object.hasOwn(form.basis!.projection.ingredients,id));group.append(button);}
   if(item.decision==='buy'){const bought=h('input',{type:'checkbox',checked:item.bought===true});bought.disabled=busy||!form.canDecide;bought.addEventListener('change',()=>{try{form.decide(id,'buy',bought.checked,captured);}catch(e){error=e;paint();}});group.append(h('label',{class:'tm-slot'},bought,t('bought')));}
   if(item.previous)group.append(h('p',{class:'muted'},`${t('previous')}: ${t(item.previous.decision)}${item.previous.bought?` · ${t('bought')}`:''} · ${item.previous.basis.sourceRevision.slice(0,8)}`));return group;
  }
  function conflictPanel(list:ShoppingList){
   const card=h('section',{class:'tm-card'},action(tr('compare'),()=>void run(async()=>{const result=await form.compareRemote(live);if(!live())return;remote=result;if(!remote)throw new ApiError(404,'not_found','');})));
   if(remote){const summary=(title:string,value:ShoppingList)=>h('section',{},h('h3',{},title),...value.basis.selection.map(s=>h('p',{},scopeLabel(s))),...value.items.map(item=>h('p',{},`${item.ingredientRef} · ${t(item.decision)}${item.bought?` · ${t('bought')}`:''}`)));
    card.append(h('div',{class:'tm-compare'},summary(tr('local'),list),summary(tr('remote'),remote.source.content)));
    const compared=remote;
    card.append(action(t('keep'),()=>void run(()=>adopt(compared,'keep-local'))),action(tr('adopt'),()=>void run(()=>adopt(compared,'remote'))));
   }return card;
  }
  async function adopt(compared:PurchaseConflict,choice:'remote'|'keep-local'){
   const captured=view.generation,pending=rawPending(view);
   if(!await form.adoptRemote(compared,choice,live)||!live())return;
   const basis=form.basis!,list=form.session.getState().draft!,selection=normalizeSelection(list.basis.selection);
   const planIds=Object.keys(basis.projection.menuPlans).join(', ');
   const scope:Scope={revision:basis.sourceRevision,planIds,plans:basis.projection.menuPlans,options:selection,selected:selection};
   // Explicit adoption advances the real baseline; later raw input still belongs to its owner.
   if(!pending&&view.generation===captured){view.listId=list.id;view.planIds=planIds;view.scope=scope;}
   view.baseline={listId:list.id,planIds,scope:scopeKey(scope)};touch(view);
  }
  function copyPanel(list:ShoppingList){
   const content=shoppingCopy(list,form.basis!.projection,lang,form.basis!.estimate),feedback=h('p',{role:'status'}),area=h('textarea',{readonly:true,rows:8,'aria-label':t('copy')});area.value=content;area.hidden=true;
   const fallback=()=>{if(live()){feedback.textContent=t('copyFailed');area.hidden=false;area.focus();area.select();}};
   const button=action(t('copy'),()=>{
    if(!live())return;if(!navigator.clipboard){fallback();return;}
    const handle=view.reload,operation=handle.beginOperation('write');touch(view);
    // Clipboard API rejection is a definite local failure; no repository write is involved.
    try{void navigator.clipboard.writeText(content).then(()=>{handle.settleOperation(operation,'completed');touch(view);if(live())feedback.textContent=t('copied');},()=>{handle.settleOperation(operation,'failed');touch(view);fallback();});}
    catch{handle.settleOperation(operation,'failed');touch(view);fallback();}
   });
   return h('section',{class:'tm-card'},button,feedback,area);
  }
  async function load(){await run(async()=>{if(detail&&!detailsModule){const loaded=await import('./team-details');if(!live())return;detailsModule=loaded;}const result=await form.load(routeId,live);if(live())notFound=!result;},'read',true);}
  view.listeners.add(paint);
  const unsub=form.session.subscribe(paint),stop=onDetached(el,()=>{view.listeners.delete(paint);unsub();disposeDetail();if(controller===form&&auth===api.sessionKey()&&form.session.getState().contextId===context)form.detach();});cleanup=()=>{view.listeners.delete(paint);unsub();stop();disposeDetail();};
  if(creating){paint();if(entry)await Promise.allSettled([loadIndex(),loadPlans()]);else await Promise.allSettled([loadIndex(),...(detailId&&!view.scope&&!rawPending(view)?[run(async()=>{await readScope();if(live()&&view.scope)view.baseline.scope=scopeKey(view.scope);},'read',true)]:[])]);}else await load();
  }finally{ctx.setReloadCoverage?.(covered?'tracked':'read-only');}
 }
 return Object.assign(renderPurchase,{readAuxiliary(key:string):PurchaseAuxiliaryState|null {
  if(api.peekSessionKey?.()!==auth)return null;
  const view=views.get(key);if(!view)return null;
  return Object.freeze({ownerId:`purchase-buffer/${key}`,identity:Object.freeze({kind:'shopping-list' as const,id:key}),generation:view.generation,dirty:rawPending(view),phase:'idle' as const});
 }});
}
/**
 * Demo and offline surface: the published projection is already approved and verified, so it is
 * shown as an ordinary read-only shopping list. Every write control stays rendered and disabled,
 * the same visible degradation as the dish editor, and no saved API source is read.
 */
async function renderPublishedOnly(el:HTMLElement,ctx:PageCtx):Promise<void>{
 const lang=ctx.lang,t=(key:ShoppingWord)=>shoppingText(lang,key),tr=(key:Parameters<typeof text>[1])=>text(lang,key);
 el.classList.add('tm-page');el.classList.add('tm-purchase');
 const body=h('div',{});
 el.append(h('p',{class:'tm-status',role:'status','data-purchase-readonly':'published'},t('readonly')),
  h('section',{class:'tm-purchase-intro'},h('small',{},t('intro')),h('h2',{},t('title'))),body);
 const say=(state:string,message:string)=>replace(body,h('p',{class:'tm-card',role:'status','data-purchase-readonly-state':state},message));
 const publication=ctx.publication;
 if(ctx.publicationError){say('unavailable',t('readonlySource'));return;}
 if(!publication){say('loading',tr('loading'));return;}
 if(publication.kind!=='team-meals'||!publication.manifest.plans.length){say('no-plans',t('readonlySource'));return;}
 say('loading',tr('loading'));
 let plan:PublishedTeamPlan;
 try{plan=await ctx.data.loadPublishedTeamPlan(publication,ctx.planId??'');}
 catch{if(el.isConnected)say('unavailable',t('readonlySource'));return;}
 if(!el.isConnected)return;
 const blocked=(label:string)=>{const button=action(label,()=>{});button.disabled=true;return button;};
 const decisions=()=>{
  const group=h('div',{class:'tm-decisions','data-purchase-decisions':'blocked'});
  for(const decision of ['check','buy','available'] as const){const button=blocked(t(decision));button.setAttribute('aria-pressed','false');group.append(button);}
  const bought=h('input',{type:'checkbox'});bought.disabled=true;group.append(h('label',{class:'tm-slot'},bought,t('bought')));
  return group;
 };
 replace(body,
  h('div',{class:'tm-purchase-actions','data-purchase-writes':'blocked'},blocked(t('save')),blocked(t('read')),h('p',{class:'muted'},t('readonlyWrites'))),
  renderCandidates({lang,...plan.projection,estimate:plan.estimates,compact:true,controls:decisions}),
  h('details',{class:'tm-purchase-record'},h('summary',{},t('revision')),h('code',{},plan.sourceRevision),h('p',{},plan.builtAt)));
}
let renderer:ReturnType<typeof createPurchaseRenderer>|undefined;
export function render(el:HTMLElement,ctx:PageCtx):Promise<void>{return(renderer??=createPurchaseRenderer(getTeamMealsApi()))(el,ctx);}
