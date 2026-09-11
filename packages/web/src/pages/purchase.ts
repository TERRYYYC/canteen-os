/** Team shopping: C1 owns writes, C2 owns basis/collection/review/estimate. */
import './admin/plan.css';
import './purchase.css';
import {normalizeSelection,type AnyMenuPlan,type ShoppingSelection,type ShoppingList} from '@canteenos/core';
import {getTeamMealsApi,type TeamMealsApi} from '../api/team-meals';
import {ApiError,type Source} from '../api/types';
import {apiMessage} from '../admin/kit';
import {h,replace} from '../dom';
import type {PageCtx} from '../types';
import {hrefOf} from '../router';
import {pick} from '../i18n';
import {adminHref} from './admin';
import {action,field,onDetached,status,text} from './team-ui';
import {createPurchaseForm,type PurchaseConflict} from './purchase-form';
import {renderTeamDetails} from './team-details';
import {shoppingText,shoppingCopy,renderCandidates,type ShoppingWord} from './purchase-list';

interface Scope {revision:string;plans:Record<string,AnyMenuPlan>;options:ShoppingSelection[];selected:ShoppingSelection[]}
interface View {listId:string;planIds:string;scope:Scope|null}
const validId=(value:string)=>/^[a-z][a-z0-9-]*$/.test(value);
const slotKey=(s:ShoppingSelection)=>JSON.stringify([s.menuPlanRef,s.date,s.mealType]);
export function createPurchaseRenderer(api:TeamMealsApi){
 let auth=api.sessionKey(),controller=createPurchaseForm(api,{at:new Date().toISOString()}),epoch=0,cleanup=()=>{};
 const views=new Map<string,View>();
 return async function renderPurchase(el:HTMLElement,ctx:PageCtx):Promise<void>{
  cleanup();const ticket=++epoch;
  if(auth!==api.sessionKey()){auth=api.sessionKey();controller=createPurchaseForm(api,{at:new Date().toISOString()});views.clear();}
  const form=controller,lang=ctx.lang,t=(key:ShoppingWord)=>shoppingText(lang,key),tr=(key:Parameters<typeof text>[1])=>text(lang,key);
  const [routeId='',detailKind='',detailId='',extra]=ctx.rest.split('/');
  const creating=!routeId||routeId==='new';
  const detail=!creating&&(detailKind==='ingredient'||detailKind==='dish')&&validId(detailId);
  if((!creating&&!validId(routeId))||extra||(!creating&&detailKind&&!detail)){el.append(h('p',{role:'alert'},t('missing')));return;}
  const key=creating?`new/${detailKind}`:routeId;
  const view=views.get(key)??{listId:creating?`shop-${new Date().toISOString().slice(0,10)}`:routeId,planIds:creating?(detailKind||ctx.planId||''):ctx.planId||'',scope:null};views.set(key,view);
  const live=()=>ticket===epoch&&el.isConnected&&controller===form&&auth===api.sessionKey();
  let error:unknown=null,busy=false,notFound=false,remote:PurchaseConflict|null=null,disposeDetail=()=>{},context=0;
  el.classList.add('tm-page');const body=h('div',{});
  el.append(h('div',{class:'tm-head'},h('a',{href:hrefOf('purchase')},tr('back')),h('h2',{},t('title')),h('a',{href:adminHref('plan',ctx.planId??'')},tr('plan'))),body);
  if(api.mode==='unconfigured'){body.append(h('p',{class:'tm-status',role:'status'},tr('unconfigured')));return;}
  async function run(work:()=>Promise<unknown>){if(busy)return;busy=true;error=null;paint();try{await work();}catch(e){if(live())error=e;}finally{if(live()){busy=false;paint();}}}
  function sourceVersion(revision:string){return h('details',{class:'tm-source'},h('summary',{},`${t('revision')}: ${revision.slice(0,8)}`),h('code',{},revision));}
  function scopeLabel(s:ShoppingSelection){return `${s.date} · ${tr(s.mealType)} · ${s.menuPlanRef}`;}
  function errorNode(e:unknown){return h('p',{class:'tm-error',role:'alert'},apiMessage(e,lang));}
  function paint(){
   if(!live())return;disposeDetail();disposeDetail=()=>{};
   const s=form.session.getState();context=s.contextId;
   const loaded=!creating&&s.identity?.id===routeId&&s.phase!=='closed'&&s.draft&&form.basis;
   const nodes:HTMLElement[]=[];
   if(api.mode==='mock')nodes.push(h('p',{class:'tm-status'},tr('mock')));
   if(error)nodes.push(errorNode(error));
   if(busy)nodes.push(h('p',{role:'status'},tr('loading')));
   if(!loaded){
    if(notFound)nodes.push(h('p',{role:'status'},t('noList')));
    nodes.push(openForm());
    if(creating||notFound)nodes.push(scopeForm(false));
    else if(!busy)nodes.push(action(tr('retry'),()=>void load()));
    replace(body,...nodes);return;
   }
   const list=s.draft!,basis=form.basis!;
   if(!view.scope){const selection=normalizeSelection(list.basis.selection);view.scope={revision:basis.sourceRevision,plans:basis.projection.menuPlans,options:selection,selected:selection};view.planIds=Object.keys(basis.projection.menuPlans).join(', ');}
   const stateNode=status(s,lang);if(s.phase==='saved-but-unpublished'&&stateNode.firstChild)stateNode.firstChild.textContent=t('saved');if(s.phase==='saving'&&stateNode.firstChild)stateNode.firstChild.textContent=lang==='zh'?'正在保存清单…':lang==='en'?'Saving list…':'Збереження списку…';nodes.push(stateNode,sourceVersion(basis.sourceRevision));
   if(s.error)nodes.push(errorNode(new ApiError(s.error.status,s.error.code,s.error.message,s.error.errors,s.error.retryAfter,s.error.reviewRequired)));
   if(detail){
    const holder=h('article',{});nodes.push(h('a',{href:hrefOf('purchase',list.id)},t('title')),holder);replace(body,...nodes);
    disposeDetail=renderTeamDetails(holder,{lang,projection:basis.projection,kind:detailKind as 'ingredient'|'dish',id:detailId,
     asset:(owner,pointer)=>form.getAsset(owner,pointer),techniqueAsset:async techniqueRef=>{
      const catalog=await api.getCatalog({revision:basis.sourceRevision});
      if(catalog.commit!==basis.sourceRevision)throw new ApiError(0,'revision_mismatch','');
      const index=catalog.techniques.findIndex(item=>item.id===techniqueRef);
      if(index<0)throw new ApiError(404,'not_found','');
      if(!live()||form.basis!==basis)throw new ApiError(0,'session_changed','');
      return form.getAsset('data/techniques.json',`/${index}/image`);
     },href:(kind,id)=>hrefOf('purchase',`${list.id}/${kind}/${id}`),current:()=>{location.hash=adminHref(detailKind,detailId);}});return;
   }
   nodes.push(h('div',{class:'tm-card'},h('h3',{},t('scope')),...list.basis.selection.map(slot=>h('p',{},scopeLabel(slot)))));
   if(s.phase==='outcome-unknown'){const recover=action(tr('recover'),()=>void run(()=>form.reconcileUnknown(s.contextId)));recover.disabled=s.recovering||busy;nodes.push(recover);}
   if(s.phase==='conflict')nodes.push(conflictPanel(list));
   if(!s.source)nodes.push(h('p',{class:'tm-status'},t('first')));
   else if(!form.canDecide&&!s.operationId&&s.phase!=='conflict')nodes.push(h('p',{class:'tm-status'},t('changed')));
   const save=action(t('save'),()=>void run(()=>form.save(s.contextId)),true);save.disabled=busy||!s.dirty||!!s.operationId||s.phase==='conflict';nodes.push(h('div',{class:'tm-actions'},save));
   const removed=form.review?.removed??[];
   if(removed.length)nodes.push(h('section',{class:'tm-card tm-removed'},h('h3',{},t('removed')),...removed.map(item=>h('p',{},`${item.ingredientRef} · ${t(item.decision)}${item.bought?` · ${t('bought')}`:''}`))));
   nodes.push(renderCandidates({lang,...basis.projection,estimate:basis.estimate,
    href:(kind,id)=>hrefOf('purchase',`${list.id}/${kind}/${id}`),controls:(id)=>decisions(id,list)}));
   nodes.push(scopeForm(true),copyPanel(list));replace(body,...nodes);
  }
  function openForm(){
   const id=h('input',{value:view.listId,pattern:'[a-z][a-z0-9-]*',required:true,'data-focus':'list-id'});id.addEventListener('input',()=>view.listId=id.value);
   const open=h('button',{type:'submit',class:'tm-button'},t('open'));open.disabled=busy;
   const formEl=h('form',{class:'tm-card tm-tools'},field(t('id'),id),open,h('a',{href:hrefOf('purchase','new')},t('new')));
   formEl.addEventListener('submit',e=>{e.preventDefault();if(validId(id.value))location.hash=hrefOf('purchase',id.value);});return formEl;
  }
  async function readScope(){
   const ids=[...new Set(view.planIds.split(',').map(s=>s.trim()).filter(Boolean))];
   if(!ids.length||ids.some(id=>!validId(id)))throw new ApiError(400,'invalid_selection','');
   const first=await api.getPlan(ids[0]!,{force:true});if(!first)throw new ApiError(404,'not_found','');
   const sources:[string,Source<AnyMenuPlan>][]=[[ids[0]!,first]];
   for(const id of ids.slice(1)){const source=await api.getPlan(id,{revision:first.commit,force:true});if(!source)throw new ApiError(404,'not_found','');sources.push([id,source]);}
   if(!live())return;
   if(sources.some(([,source])=>source.commit!==first.commit))throw new ApiError(0,'revision_mismatch','');
   const prior=form.session.getState().draft?.basis.selection??[];
   const options=normalizeSelection([...sources.flatMap(([menuPlanRef,source])=>source.content.meals.map(m=>({menuPlanRef,date:m.date,mealType:m.mealType}))),...prior.filter(s=>ids.includes(s.menuPlanRef))]);
   view.scope={revision:first.commit,plans:Object.fromEntries(sources.map(([id,source])=>[id,source.content])),options,selected:prior.length?options.filter(s=>prior.some(p=>slotKey(s)===slotKey(p))):options};
  }
  function scopeForm(existing:boolean){
   const input=h('input',{value:view.planIds,'data-focus':'plan-ids'});input.addEventListener('input',()=>view.planIds=input.value);
   const read=action(t('read'),()=>void run(readScope));read.disabled=busy||(existing&&!form.canRebase);
   const card=h('section',{class:'tm-card'},h('h3',{},existing?t('apply'):t('new')),field(t('plans'),input),read);
   if(existing&&!form.canRebase)card.append(h('p',{class:'muted'},t('saveBefore')));
   if(!existing){const name=h('input',{value:view.listId,pattern:'[a-z][a-z0-9-]*','data-focus':'new-list-id'});name.addEventListener('input',()=>view.listId=name.value);card.prepend(field(t('id'),name));}
   if(view.scope){
    const scope=view.scope;card.append(sourceVersion(scope.revision));
    for(const option of scope.options){const checkbox=h('input',{type:'checkbox',checked:scope.selected.some(s=>slotKey(s)===slotKey(option))});checkbox.disabled=busy;
     checkbox.addEventListener('change',()=>{scope.selected=normalizeSelection(checkbox.checked?[...scope.selected,option]:scope.selected.filter(s=>slotKey(s)!==slotKey(option)));});
     card.append(h('label',{class:'tm-slot'},checkbox,h('span',{},scopeLabel(option))));}
    const apply=action(existing?t('apply'):t('create'),()=>void run(async()=>{
     if(!scope.selected.length||!validId(view.listId))throw new ApiError(400,'invalid_selection',t('choose'));
     const request={revision:scope.revision,selection:scope.selected,at:new Date().toISOString()};
     if(existing)await form.rebase(request,live);else {const result=await form.create(view.listId,request,live);if(result&&live())location.hash=hrefOf('purchase',view.listId);}
    }),true);apply.disabled=busy||(existing&&!form.canRebase);card.append(apply);
   }return card;
  }
  function decisions(id:string,list:ShoppingList){
   const item=list.items.find(x=>x.ingredientRef===id)!,s=form.session.getState(),captured=s.contextId;
   const group=h('div',{class:'tm-decisions'});
   for(const decision of ['check','buy','available'] as const){const button=action(t(decision),()=>{try{form.decide(id,decision,undefined,captured);}catch(e){error=e;paint();}});button.setAttribute('aria-pressed',String(item.decision===decision));button.disabled=busy||!form.canDecide||(decision!=='check'&&!Object.hasOwn(form.basis!.projection.ingredients,id));group.append(button);}
   if(item.decision==='buy'){const bought=h('input',{type:'checkbox',checked:item.bought===true});bought.disabled=busy||!form.canDecide;bought.addEventListener('change',()=>{try{form.decide(id,'buy',bought.checked,captured);}catch(e){error=e;paint();}});group.append(h('label',{class:'tm-slot'},bought,t('bought')));}
   if(item.previous)group.append(h('p',{class:'muted'},`${t('previous')}: ${t(item.previous.decision)}${item.previous.bought?` · ${t('bought')}`:''} · ${item.previous.basis.sourceRevision.slice(0,8)}`));return group;
  }
  function conflictPanel(list:ShoppingList){
   const card=h('section',{class:'tm-card'},action(tr('compare'),()=>void run(async()=>{remote=await form.compareRemote(live);if(!remote)throw new ApiError(404,'not_found','');})));
   if(remote){const summary=(title:string,value:ShoppingList)=>h('section',{},h('h3',{},title),...value.basis.selection.map(s=>h('p',{},scopeLabel(s))),...value.items.map(item=>h('p',{},`${item.ingredientRef} · ${t(item.decision)}${item.bought?` · ${t('bought')}`:''}`)));
    card.append(h('div',{class:'tm-compare'},summary(tr('local'),list),summary(tr('remote'),remote.source.content)));
    const compared=remote;
    card.append(action(t('keep'),()=>void run(()=>form.adoptRemote(compared,'keep-local',live))),action(tr('adopt'),()=>void run(()=>form.adoptRemote(compared,'remote',live))));
   }return card;
  }
  function copyPanel(list:ShoppingList){
   const content=shoppingCopy(list,form.basis!.projection,lang),feedback=h('p',{role:'status'}),area=h('textarea',{readonly:true,rows:8,'aria-label':t('copy')});area.value=content;area.hidden=true;
   const button=action(t('copy'),()=>{void navigator.clipboard?.writeText(content).then(()=>{if(live())feedback.textContent=t('copied');}).catch(()=>{if(live()){feedback.textContent=t('copyFailed');area.hidden=false;area.focus();area.select();}});if(!navigator.clipboard){feedback.textContent=t('copyFailed');area.hidden=false;}});
   return h('section',{class:'tm-card'},button,feedback,area);
  }
  async function load(){await run(async()=>{notFound=!(await form.load(routeId,live));});}
  const unsub=form.session.subscribe(paint),stop=onDetached(el,()=>{unsub();disposeDetail();if(form.session.getState().contextId===context)form.detach();});cleanup=()=>{unsub();stop();disposeDetail();};
  if(creating)paint();else await load();
 };
}
let renderer:ReturnType<typeof createPurchaseRenderer>|undefined;
export function render(el:HTMLElement,ctx:PageCtx):Promise<void>{return(renderer??=createPurchaseRenderer(getTeamMealsApi()))(el,ctx);}
