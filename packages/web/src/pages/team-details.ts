/** Read-only raw details from one fixed projection. Scaling remains in core estimates. */
import type { TeamMealsProjection, I18nString, Quantity, ImageRef, Technique } from '@canteenos/core';
import type { RevisionAsset } from '../api/team-meals';
import { h } from '../dom';
import { pick, type Lang } from '../i18n';
import { action, onDetached, text } from './team-ui';
const copy={
 missing:['未录','Not recorded','Не записано'],qty:['用量未录','Quantity not recorded','Кількість не записано'],taste:['适量','To taste','За смаком'],
 role:['材料角色','Ingredient role','Роль інгредієнта'],main:['主料','Main ingredient','Основний інгредієнт'],seasoning:['调料','Seasoning','Приправа'],
 package:['包装规格','Package size','Розмір упаковки'],supplier:['供应商','Supplier','Постачальник'],price:['记录价格','Recorded price','Записана ціна'],min:['最小起订包数','Minimum packs','Мінімум упаковок'],
 base:['基准单位','Base unit','Базова одиниця'],stock:['资料中的现有量（不是本次判断）','Recorded on hand (separate from this list)','Записаний залишок (окремо від цього списку)'],track:['记录库存','Track stock','Облік запасів'],
 source:['资料版本','Source version','Версія даних'],current:['另看当前资料','View current information separately','Окремо переглянути поточні дані'],
 sources:['哪些菜用到它','Recipes that use this ingredient','У яких стравах використовується'],missingSource:['未找到资料，原引用已保留','Information missing; original reference retained','Даних немає; вихідне посилання збережено'],
 imageMissing:['同版图片不可用','Same-version image unavailable','Зображення цієї версії недоступне'],imageLoading:['正在读取同版图片','Loading same-version image','Завантаження зображення цієї версії'],license:['许可','License','Ліцензія'],author:['作者','Author','Автор'],
 recipe:['原配方用量，未缩放','Original recipe quantities, unscaled','Початкові кількості рецепта, без масштабування'],baseServings:['原配方基准份数','Original recipe servings','Порції вихідного рецепта'],
 components:['食材与调料','Ingredients and seasonings','Інгредієнти та приправи'],steps:['完整做法','Full method','Повний спосіб приготування'],technique:['技法','Technique','Техніка'],
 provenance:['配方来源','Recipe source','Джерело рецепта'],confidence:['记录的置信度','Recorded confidence','Записана впевненість'],
 size:['切配规格','Prep size','Розмір підготовки'],timing:['准备时机','Prep timing','Час підготовки'],note:['备注','Note','Примітка'],
 coverage:['这里只展示已录资料；配方完整性仍需人工核对。','Only recorded information is shown; recipe completeness still needs human review.','Показано лише записані дані; повноту рецепта має перевірити людина.'],
 languages:['三语原文','Original language versions','Оригінальні мовні версії'],
} as const;
type Key=keyof typeof copy;
const lookup=<T>(map:Record<string,T>,id:string):T|undefined=>Object.hasOwn(map,id)?map[id]:undefined;
const tr=(lang:Lang,key:Key)=>copy[key][lang==='zh'?0:lang==='en'?1:2];
export function quantityText(qty:Quantity|undefined,lang:Lang):string {
  if(!qty)return tr(lang,'qty');if(qty.unit==='to-taste')return tr(lang,'taste');
  return qty.value===undefined?tr(lang,'qty'):`${qty.value} ${qty.unit}`;
}
export function safeLink(value:string|undefined):string|null {
  if(!value||!/^https?:\/\//i.test(value))return null;
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
export interface DetailOptions {
  lang:Lang;projection:TeamMealsProjection;kind:'ingredient'|'dish';id:string;
  asset:(owner:string,pointer:string)=>Promise<RevisionAsset>;
  techniqueAsset?:(techniqueRef:string)=>Promise<RevisionAsset>;
  href:(kind:'ingredient'|'dish',id:string)=>string;
  current?:()=>void;
}
export function renderTeamDetails(el:HTMLElement,options:DetailOptions):()=>void {
  const {lang,projection,kind,id}=options,t=(key:Key)=>tr(lang,key),urls=new Set<string>();let live=true;
  el.classList.add('tm-detail');
  const dispose=()=>{live=false;for(const url of urls)URL.revokeObjectURL(url);urls.clear();};
  const stop=onDetached(el,dispose);
  const missing=()=>h('span',{class:'muted'},t('missing'));
  const fact=(label:string,value:string|number|boolean|undefined)=>h('div',{class:'tm-fact'},h('dt',{},label),h('dd',{},value===undefined?missing():String(value)));
  const names=(name:I18nString)=>h('details',{class:'tm-detail-languages'},h('summary',{},t('languages')),h('dl',{class:'tm-facts'},...(['zh','en','uk'] as const).map(code=>fact(code.toUpperCase(),name[code]))));
  const link=(url:string|undefined,label:string):HTMLElement=>{const safe=safeLink(url);return safe?h('a',{href:safe,target:'_blank',rel:'noopener noreferrer'},label):h('span',{},label,': ',url??t('missing'));};
  function image(ref:ImageRef|undefined,owner:string,pointer:string,placeholder=false,read?:()=>Promise<RevisionAsset>):HTMLElement {
    const box=h('figure',{class:'tm-detail-image'});
    if(!ref){if(placeholder)box.append(h('p',{class:'muted'},t('imageMissing')));return box;}
    const state=h('p',{class:'muted',role:'status'},t('imageLoading'));box.append(state,h('figcaption',{},`${t('license')}: ${ref.license} · ${t('author')}: ${ref.author??t('missing')} · `,link(ref.sourceUrl,ref.sourceUrl??t('missing'))));
    void (read?read():options.asset(owner,pointer)).then(result=>{
      if(!live||!el.isConnected)return;
      if(result.sourceRevision!==projection.sourceRevision)throw new Error('revision_mismatch');
      const url=URL.createObjectURL(result.bytes);urls.add(url);
      const img=h('img',{src:url,alt:kind==='dish'?pick(lookup(projection.dishes,id)?.name,lang):pick(lookup(projection.ingredients,id)?.name,lang),loading:'lazy'});
      img.addEventListener('error',()=>{img.remove();state.textContent=t('imageMissing');URL.revokeObjectURL(url);urls.delete(url);});
      state.textContent='';box.prepend(img);
    }).catch(()=>{if(live)state.textContent=t('imageMissing');});return box;
  }
  function technique(id:string|undefined):HTMLElement {
    if(!id)return h('p',{class:'muted'},`${t('technique')}: ${t('missing')}`);
    const value:Technique|undefined=projection.techniques.find(x=>x.id===id);
    return h('div',{},h('p',{},`${t('technique')}: ${value?pick(value.name,lang):t('missingSource')} · ${id}`),value?names(value.name):null,value?.note?h('p',{},pick(value.note,lang)):null,value?.image?image(value.image,'data/techniques.json','',false,()=>options.techniqueAsset?options.techniqueAsset(id):Promise.reject(new Error('technique_asset_unavailable'))):null);
  }
  function renderSources():void {
    el.append(h('h3',{},t('sources')));
    const sources=projection.collection.items.find(x=>x.ingredientRef===id)?.sources??[];
    for(const source of sources)el.append(h('p',{},`${source.date} · ${text(lang,source.mealType)} · `,h('a',{href:options.href('dish',source.dishRef)},pick(lookup(projection.dishes,source.dishRef)?.name,lang)||source.dishRef),h('small',{class:'muted'},` · ${source.menuPlanRef} / ${source.mealIndex} / ${source.componentIndex}`)));
  }
  const record=kind==='ingredient'?lookup(projection.ingredients,id):lookup(projection.dishes,id);
  el.append(h('details',{class:'tm-source'},h('summary',{},`${t('source')}: ${projection.sourceRevision.slice(0,8)}`),h('code',{},projection.sourceRevision)));
  if(!record){el.append(h('p',{role:'alert'},`${t('missingSource')} · ${id}`));if(options.current)el.append(action(t('current'),options.current));if(kind==='ingredient')renderSources();return ()=>{stop();dispose();};}
  el.append(h('h2',{},pick(record.name,lang)),h('p',{class:'muted tm-detail-id'},id));
  const owner=`data/${kind==='dish'?'dishes':'ingredients'}/${id}.json`;
  el.append(image(record.image,owner,'/image',true));
  el.append(names(record.name));
  if(kind==='ingredient'){
    const item=lookup(projection.ingredients,id)!,p=item.purchase;
    el.append(h('dl',{class:'tm-facts'},fact(t('role'),item.role?t(item.role):undefined),fact(t('base'),item.baseUnit),fact('Wikidata',item.externalId),fact(t('supplier'),p?.supplier),fact(t('package'),p?`${p.packSize} ${p.packUnit}`:undefined),fact(t('min'),p?.minPacks),fact(t('price'),p?.lastPrice?`${p.lastPrice.amount} ${p.lastPrice.currency}`:undefined),fact(t('track'),item.trackStock),fact(t('stock'),item.onHand!==undefined?`${item.onHand} ${item.baseUnit}`:undefined)));
    renderSources();
  }else{
    const dish=lookup(projection.dishes,id)!;
    el.append(h('p',{},pick(dish.description,lang)||t('missing')),h('dl',{class:'tm-facts'},fact(t('baseServings'),dish.baseServings),fact(t('provenance'),dish.provenance?.source)));
    if(dish.provenance?.videoUrl)el.append(link(dish.provenance.videoUrl,dish.provenance.videoUrl));
    el.append(h('h3',{},t('components')),h('p',{class:'muted'},t('recipe')));
    if(!dish.components?.length)el.append(h('p',{role:'status'},t('missing')));
    for(const [index,component] of (dish.components??[]).entries()){
      const ingredient=lookup(projection.ingredients,component.ingredientRef),prep=component.prep;
      const card=h('section',{class:'tm-card','data-component-index':index},h('h4',{},h('a',{href:options.href('ingredient',component.ingredientRef)},ingredient?pick(ingredient.name,lang):component.ingredientRef)),h('p',{},quantityText(component.qty,lang)),h('p',{class:'muted'},`${t('role')}: ${ingredient?.role?t(ingredient.role):t('missing')}`));
      if(prep)card.append(technique(prep.techniqueRef),h('dl',{class:'tm-facts'},fact(t('size'),prep.size),fact(t('timing'),prep.timing),fact(t('note'),prep.note?pick(prep.note,lang):undefined)),image(prep.image,owner,`/components/${index}/prep/image`));
      if(component.confidence)card.append(h('small',{},`${t('confidence')}: ${component.confidence.value} · ${component.confidence.source}`));
      el.append(card);
    }
    el.append(h('h3',{},t('steps')));
    if(!dish.steps?.length)el.append(h('p',{class:'muted'},t('missing')));
    for(const [index,step] of (dish.steps??[]).entries()){
      const card=h('section',{class:'tm-card','data-step-index':index},h('h4',{},String(index+1)),h('p',{},pick(step.text,lang)),names(step.text),technique(step.techniqueRef),image(step.image,owner,`/steps/${index}/image`));
      if(step.clip)card.append(h('p',{},`${step.clip.start}s–${step.clip.end}s · `,link(step.clip.videoUrl,step.clip.videoUrl)));
      el.append(card);
    }
  }
  if(options.current)el.append(action(t('current'),options.current));
  el.append(h('p',{class:'muted'},t('coverage')));return ()=>{stop();dispose();};
}
