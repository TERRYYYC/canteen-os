/** Presentation only: collection and numerical estimates are supplied by core/C2. */
import type {IngredientCollection,ShoppingEstimate,AnyDish,Ingredient} from '@canteenos/core';
import {h} from '../dom';
import {pick,type Lang} from '../i18n';
import {text} from './team-ui';
import {quantityText} from './quantity-text';
import {word,supportDetails} from './record-display';
export const shoppingWords={
 title:['本次采购','This shopping list','Цей список покупок'],check:['待核对','Check','Перевірити'],buy:['待买','Buy','Купити'],available:['已有','Available','Є в наявності'],bought:['已买','Bought','Куплено'],
 open:['打开清单','Open list','Відкрити список'],new:['新建清单','New list','Новий список'],id:['清单编号（字母、数字、短横线）','List ID (letters, numbers, hyphens)','Номер списку (латиниця, цифри, дефіс)'],
 plans:['计划编号，多个用逗号分隔','Plan IDs, separated by commas','Номери планів через кому'],read:['读取最新已保存计划','Read latest saved plans','Прочитати останні збережені плани'],
 scope:['本次日期和餐次','Dates and meals for this list','Дати й прийоми їжі цього списку'],create:['生成待核对清单','Create list to check','Створити список для перевірки'],apply:['应用新范围并重新核对','Apply scope and review again','Застосувати діапазон і перевірити знову'],
 save:['保存清单','Save list','Зберегти список'],saved:['清单已保存','List saved','Список збережено'],first:['先保存这份待核对清单，再逐项判断。','Save this list first, then make individual decisions.','Спочатку збережіть список, потім приймайте рішення щодо інгредієнтів.'],
 changed:['范围或资料已变；先保存重新核对的清单，再确认。','Scope or information changed. Save the reviewed list before confirming items.','Діапазон або дані змінилися. Збережіть перевірений список перед підтвердженням.'],
 saveBefore:['修改范围前，请先保存当前判断。','Save current decisions before changing scope.','Збережіть поточні рішення перед зміною діапазону.'],
 missing:['资料未找到','Information unavailable','Дані недоступні'],empty:['所选餐次目前没有已录材料。','No recorded ingredients for these meals.','Для цих прийомів їжі немає записаних інгредієнтів.'],
 choose:['至少选择一个日期和餐次。','Select at least one date and meal.','Виберіть хоча б одну дату й прийом їжі.'],noList:['未找到清单，可用这个名称新建。','List not found; you can create one with this ID.','Список не знайдено; можна створити його з цією назвою.'],
 coverage:['已录材料候选；配方完整性仍需人工核对。','Recorded ingredient candidates; recipe completeness needs human review.','Записані інгредієнти; повноту рецепта має перевірити людина.'],
 sources:['使用来源','Used in','Використовується в'],estimate:['可计算的参考','Calculated reference','Розрахунковий орієнтир'],unavailable:['无法完整计算','Complete estimate unavailable','Повний розрахунок недоступний'],
 removed:['移出的材料（原购买记录仅供参考）','Removed ingredients (old purchase records for reference)','Вилучені інгредієнти (старі покупки лише для довідки)'],previous:['上次判断，仅供重新核对','Previous decision, for review only','Попереднє рішення, лише для перевірки'],
 copy:['复制清单','Copy list','Копіювати список'],copyTitle:['当前页面清单（请核对保存状态）','Current page list (check save status)','Список поточної сторінки (перевірте стан збереження)'],copied:['已复制','Copied','Скопійовано'],copyFailed:['复制失败，可选取下面文字复制。','Copy failed; select the text below to copy.','Не вдалося скопіювати; виділіть текст нижче.'],
 revision:['材料和菜单资料版本','Ingredient and menu version','Версія інгредієнтів і меню'],keep:['保留本地范围并重新核对','Keep local scope and review again','Зберегти локальний діапазон і перевірити знову'],
 current:['打开当前资料编辑页','Open current information editor','Відкрити редактор поточних даних'],unknownCount:['份数未录','Servings unspecified','Порції не вказано'],main:['主料','Main ingredient','Основний інгредієнт'],seasoning:['调料','Seasoning','Приправа'],
 budget:['金额只按可计算项参考，不代表完整预算。','Calculable amounts are references, not a complete budget.','Розраховані суми є орієнтирами, а не повним бюджетом.'],
 intro:['来自菜单计划','FROM YOUR MENU PLAN','З ПЛАНУ МЕНЮ'],headline:['这次买什么，逐项确认。','Decide what to buy.','Вирішіть, що купити.'],
 issues:['需要核对的资料','Information to check','Дані для перевірки'],summary:['本次材料判断','Current ingredient decisions','Поточні рішення щодо інгредієнтів'],
} as const;
export type ShoppingWord=keyof typeof shoppingWords;
export const shoppingText=(lang:Lang,key:ShoppingWord)=>shoppingWords[key][lang==='zh'?0:lang==='en'?1:2];
const lookup=<T>(map:Record<string,T>,id:string):T|undefined=>Object.hasOwn(map,id)?map[id]:undefined;
const reasons:Record<string,readonly[string,string,string]>={
 'missing-planned-servings':['计划份数未录','Planned servings missing','Порції в плані не вказано'],'missing-base-servings':['配方基准份数未录','Recipe servings missing','Порції рецепта не вказано'],
 'missing-qty':['原用量未录','Recipe quantity missing','Кількість рецепта не вказано'],'to-taste':['适量','To taste','За смаком'],'dish-not-active':['菜谱待完善','Recipe is not active','Рецепт ще не активний'],
 'missing-dish':['菜谱未找到','Recipe missing','Рецепт не знайдено'],'missing-ingredient':['材料资料未找到','Ingredient missing','Інгредієнт не знайдено'],'components-unrecorded':['尚未录入配料','Ingredients not recorded','Інгредієнти не записано'],
 'missing-purchase':['采购规格未录','Purchase specification missing','Закупівельні параметри не записано'],'unit-conversion-missing':['单位不能换算','Units cannot be converted','Одиниці не можна перетворити'],
 'multiple-plans':['多个计划不能完整合算','Multiple plans cannot be estimated together','Кілька планів неможливо повністю розрахувати разом'],'engine-issue':['计算资料有问题','Calculation data issue','Проблема даних розрахунку'],
};
export function reasonText(code:string,lang:Lang):string{return reasons[code]?.[lang==='zh'?0:lang==='en'?1:2]??code;}
export interface CandidatesOptions {
 compact?:boolean;lang:Lang;collection:IngredientCollection;estimate:ShoppingEstimate;ingredients:Record<string,Ingredient>;dishes:Record<string,AnyDish>;
 href?:(kind:'ingredient'|'dish',id:string)=>string;
 controls?:(id:string)=>HTMLElement;
}
export function renderCandidates(options:CandidatesOptions):HTMLElement {
 const {lang,collection,estimate,ingredients,dishes}=options,t=(key:ShoppingWord)=>shoppingText(lang,key);
 const name=(kind:'ingredient'|'dish',id:string)=>pick(lookup<Ingredient|AnyDish>(kind==='ingredient'?ingredients:dishes,id)?.name,lang)||t('missing');
 const ref=(kind:'ingredient'|'dish',id:string)=>options.href?h('a',{href:options.href(kind,id)},name(kind,id)):h('span',{},name(kind,id));
 const result=h('div',{class:'tm-candidates'},h('p',{class:'muted'},t('coverage')));
 if(collection.issues.length)result.append(h('details',{class:'tm-status tm-candidate-issues'},h('summary',{},`${t('issues')} · ${collection.issues.length}`),...collection.issues.map(issue=>h('article',{},h('p',{},reasonText(issue.code,lang),' · ',[issue.date,issue.mealType?text(lang,issue.mealType):''].filter(Boolean).join(' / ')),issue.dishRef?ref('dish',issue.dishRef):null,issue.ingredientRef?ref('ingredient',issue.ingredientRef):null,h('p',{},word(lang,'查看来源资料并补齐后，再核对采购范围。','Check and complete the source records, then review the shopping scope.','Перевірте й доповніть вихідні дані, потім перевірте діапазон закупівель.')),supportDetails(lang,JSON.stringify(issue))))));
 if(!collection.items.length)result.append(h('p',{class:'tm-card'},t('empty')));
 for(const item of collection.items){
  const ingredient=lookup(ingredients,item.ingredientRef),estimateItem=estimate.items.find(x=>x.ingredientRef===item.ingredientRef);
  const heading=h('h3',{},ref('ingredient',item.ingredientRef)),role=h('p',{class:'muted'},ingredient?.role?t(ingredient.role):t('missing'));
  const card=h('section',{class:'tm-card tm-material','data-ingredient':item.ingredientRef},...(options.compact?[h('div',{class:'tm-material-heading'},heading,role)]:[heading,role]));
  const reference=options.compact?h('details',{class:'tm-material-reference'},h('summary',{},word(lang,'来源与数量参考','Sources and quantity reference','Джерела й кількісні орієнтири'),` · ${item.sources.length}`)):null;
  if(options.controls)card.append(options.controls(item.ingredientRef));
  (reference??card).append(h(options.compact?'section':'details',{},h(options.compact?'h4':'summary',{},`${t('sources')} · ${item.sources.length}`),h('ul',{},...item.sources.map(s=>h('li',{},`${s.date} · ${text(lang,s.mealType)} · `,ref('dish',s.dishRef),` · ${s.plannedServings??t('unknownCount')} · ${quantityText(s.qty,lang)}`,supportDetails(lang,s.menuPlanRef))))));
  if(estimateItem?.status==='complete')(reference??card).append(h(options.compact?'section':'details',{},h(options.compact?'h4':'summary',{},t('estimate')),...estimateItem.lines.map(({supplier,line})=>h('p',{},`${supplier} · ${quantityText(line.qty,lang)} · ${line.packs} × ${line.trace.packSize} ${line.trace.packUnit}`,line.amount?` · ${line.amount.amount} ${line.amount.currency}`:''))));
  else if(estimateItem)(reference??card).append(h(options.compact?'section':'details',{class:'muted'},h(options.compact?'h4':'summary',{},t('unavailable')),h('p',{},[...new Set(estimateItem.reasons.map(r=>reasonText(r.code,lang)))].join(' · '))));
  if(reference)card.append(reference);
  result.append(card);
 }
 result.append(h('p',{class:'muted'},t('budget')));return result;
}
