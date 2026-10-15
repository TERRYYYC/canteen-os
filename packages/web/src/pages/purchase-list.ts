/** Presentation only: collection and numerical estimates are supplied by core/C2. */
import {UNSPECIFIED_SUPPLIER,type IngredientCollection,type ShoppingEstimate,type AnyDish,type Ingredient} from '@canteenos/core';
import {h} from '../dom';
import {pick,type Lang} from '../i18n';
import {displayDate} from '../display-date';
import {text} from './team-ui';
import {displayQuantity,quantityText} from './quantity-text';
import {word,supportDetails} from './record-display';
import {moneyText,sumByCurrency,type EstimatedLine,type SupplierSection} from './supplier-copy';
export const shoppingWords={
 title:['本次采购','This shopping list','Цей список покупок'],check:['待核对','Check','Перевірити'],buy:['待买','Buy','Купити'],available:['已有','Available','Є в наявності'],bought:['已买','Bought','Куплено'],
 open:['打开清单','Open list','Відкрити список'],new:['新建清单','New list','Новий список'],id:['清单编号（字母、数字、短横线）','List ID (letters, numbers, hyphens)','Номер списку (латиниця, цифри, дефіс)'],
 plans:['计划编号，多个用逗号分隔','Plan IDs, separated by commas','Номери планів через кому'],read:['读取最新已保存计划','Read latest saved plans','Прочитати останні збережені плани'],
 scope:['本次日期和餐次','Dates and meals for this list','Дати й прийоми їжі цього списку'],create:['生成待核对清单','Create list to check','Створити список для перевірки'],apply:['应用新范围并重新核对','Apply scope and review again','Застосувати діапазон і перевірити знову'],
 save:['保存清单','Save list','Зберегти список'],saved:['清单已保存','List saved','Список збережено'],first:['先保存这份待核对清单，再逐项判断。','Save this list first, then make individual decisions.','Спочатку збережіть список, потім приймайте рішення щодо інгредієнтів.'],
 changed:['范围或资料已变；先保存重新核对的清单，再确认。','Scope or information changed. Save the reviewed list before confirming items.','Діапазон або дані змінилися. Збережіть перевірений список перед підтвердженням.'],
 saveBefore:['修改范围前，请先保存当前判断。','Save current decisions before changing scope.','Збережіть поточні рішення перед зміною діапазону.'],
 missing:['资料未找到','Information unavailable','Дані недоступні'],unclassified:['用途未分类','Role not classified','Роль не визначено'],empty:['所选餐次目前没有已录材料。','No recorded ingredients for these meals.','Для цих прийомів їжі немає записаних інгредієнтів.'],
 choose:['至少选择一个日期和餐次。','Select at least one date and meal.','Виберіть хоча б одну дату й прийом їжі.'],noList:['未找到清单，可用这个名称新建。','List not found; you can create one with this ID.','Список не знайдено; можна створити його з цією назвою.'],
 coverage:['已录材料候选；配方完整性仍需人工核对。','Recorded ingredient candidates; recipe completeness needs human review.','Записані інгредієнти; повноту рецепта має перевірити людина.'],
 sources:['使用来源','Used in','Використовується в'],estimate:['可计算的参考','Calculated reference','Розрахунковий орієнтир'],unavailable:['无法完整计算','Complete estimate unavailable','Повний розрахунок недоступний'],
 removed:['移出的材料（原购买记录仅供参考）','Removed ingredients (old purchase records for reference)','Вилучені інгредієнти (старі покупки лише для довідки)'],previous:['上次判断，仅供重新核对','Previous decision, for review only','Попереднє рішення, лише для перевірки'],
 copySection:['复制这一段','Copy this section','Копіювати цей розділ'],copySectionNone:['这一段没有还没买的「待买」材料。','Nothing here is marked Buy and still to buy.','Тут немає позицій «Купити», які ще не куплено.'],
 copySuppliers:['复制给菜贩','Copy for suppliers','Копіювати для постачальників'],copySuppliersScope:['只列「待买」且还没买的材料，按供应商分段。','Only items marked Buy and not yet bought, by supplier.','Лише позиції «Купити», ще не куплені, за постачальниками.'],copySuppliersNone:['还没有标为「待买」的材料。','No items are marked Buy yet.','Ще немає позицій «Купити».'],copySuppliersDone:['标为「待买」的材料都已买。','Everything marked Buy is already bought.','Усе, що позначено «Купити», вже куплено.'],copySuppliersPreview:['这里列出所选餐次要用的全部材料，没有「已有」「已买」标记。发给菜贩前，请先删掉已经有的。','This lists everything the selected meals need, with no Available or Bought marks. Remove what you already have before sending.','Тут усе, що потрібно для вибраних прийомів їжі, без позначок «Є в наявності» чи «Куплено». Перед надсиланням приберіть те, що вже є.'],copyRecord:['复制完整记录','Copy full record','Копіювати повний запис'],copyTitle:['当前页面清单（请核对保存状态）','Current page list (check save status)','Список поточної сторінки (перевірте стан збереження)'],copied:['已复制','Copied','Скопійовано'],copyFailed:['复制失败，可选取下面文字复制。','Copy failed; select the text below to copy.','Не вдалося скопіювати; виділіть текст нижче.'],
 revision:['材料和菜单资料版本','Ingredient and menu version','Версія інгредієнтів і меню'],keep:['保留本地范围并重新核对','Keep local scope and review again','Зберегти локальний діапазон і перевірити знову'],
 current:['打开当前资料编辑页','Open current information editor','Відкрити редактор поточних даних'],unknownCount:['份数未录','Servings unspecified','Порції не вказано'],main:['主料','Main ingredient','Основний інгредієнт'],seasoning:['调料','Seasoning','Приправа'],
 budget:['金额只按可计算项参考，不代表完整预算。','Calculable amounts are references, not a complete budget.','Розраховані суми є орієнтирами, а не повним бюджетом.'],
 intro:['来自菜单计划','FROM YOUR MENU PLAN','З ПЛАНУ МЕНЮ'],headline:['这次买什么，逐项确认。','Decide what to buy.','Вирішіть, що купити.'],
 issues:['需要核对的资料','Information to check','Дані для перевірки'],summary:['本次材料判断','Current ingredient decisions','Поточні рішення щодо інгредієнтів'],
 readonly:['未连接后台 · 这里是已发布版本的只读清单','Not connected · this is the published version, read only','Немає з’єднання · це опублікована версія лише для читання'],
 readonlyWrites:['这是只读清单：只能查看，保存、判断和打勾都用不了。','This is a read-only list: you can look, but not save, decide or tick.','Це список лише для читання: переглядати можна, а зберігати, вирішувати й позначати — ні.'],
 readonlySource:['这一版已发布资料现在读不到。稍后再看。','This published version cannot be read right now. Check again later.','Зараз не вдається прочитати цю опубліковану версію. Перегляньте пізніше.'],
 readonlySelect:['请先选择一个已发布计划。','Select a published plan first.','Спочатку виберіть опублікований план.'],
 readonlySaved:['已保存清单需要连接后台才能打开；下面仅显示当前已发布资料，不包含这份清单的购买判断。','A saved list needs a connected service. Below is only the current publication, without that list’s purchase decisions.','Для збереженого списку потрібне з’єднання. Нижче лише поточна публікація без рішень про купівлю зі збереженого списку.'],
} as const;
export type ShoppingWord=keyof typeof shoppingWords;
export const shoppingText=(lang:Lang,key:ShoppingWord)=>shoppingWords[key][lang==='zh'?0:lang==='en'?1:2];
const lookup=<T>(map:Record<string,T>,id:string):T|undefined=>Object.hasOwn(map,id)?map[id]:undefined;
const reasons:Record<string,readonly[string,string,string]>={
 'missing-yield':['标准材料的净料率未知，请人工判断采购量','The standard ingredient’s yield is unknown; decide the purchase quantity manually','Вихід стандартного інгредієнта невідомий; визначте закупівельну кількість вручну'],
 'missing-base-unit':['标准材料的基准单位未录','The standard ingredient’s base unit is not recorded','Базову одиницю стандартного інгредієнта не записано'],
 'ingredient-spec-conflict':['同一材料的采购规格版本不同，请核对后分别估算','This ingredient has different purchase specification versions. Review them before estimating separately','Інгредієнт має різні версії закупівельних параметрів. Перевірте їх перед окремими розрахунками'],
 'missing-planned-servings':['计划份数未录','Planned servings missing','Порції в плані не вказано'],'missing-base-servings':['配方基准份数未录','Recipe servings missing','Порції рецепта не вказано'],
 'missing-qty':['原用量未录','Recipe quantity missing','Кількість рецепта не вказано'],'to-taste':['适量','To taste','За смаком'],'dish-not-active':['菜谱待完善','Recipe is not active','Рецепт ще не активний'],
 'missing-dish':['菜谱未找到','Recipe missing','Рецепт не знайдено'],'missing-ingredient':['材料资料未找到','Ingredient missing','Інгредієнт не знайдено'],'components-unrecorded':['尚未录入配料','Ingredients not recorded','Інгредієнти не записано'],
 'missing-purchase':['采购规格未录','Purchase specification missing','Закупівельні параметри не записано'],'unit-conversion-missing':['单位不能换算','Units cannot be converted','Одиниці не можна перетворити'],
 'multiple-plans':['多个计划不能完整合算','Multiple plans cannot be estimated together','Кілька планів неможливо повністю розрахувати разом'],'engine-issue':['计算资料有问题','Calculation data issue','Проблема даних розрахунку'],
};
export function reasonText(code:string,lang:Lang):string{return reasons[code]?.[lang==='zh'?0:lang==='en'?1:2]??code;}
export interface CandidatesOptions {
 compact?:boolean;lang:Lang;collection:IngredientCollection;estimate:ShoppingEstimate;ingredients:Record<string,Pick<Ingredient,'name'|'role'>>;dishes:Record<string,AnyDish>;
 href?:(kind:'ingredient'|'dish',id:string)=>string;
 controls?:(id:string)=>HTMLElement;
 /** Candidates grouped by supplier, from supplierSections(); absent keeps the flat list. */
 sections?:readonly SupplierSection[];
 /** The copy-this-section button of a section, or null when there is nothing to copy there. */
 sectionCopy?:(section:SupplierSection)=>HTMLElement|null;
}
/** The other reader language's own text: zh readers get uk, uk and en readers get zh; none when missing or the same. */
export function counterpartName(name:Pick<Ingredient,'name'>['name']|undefined,lang:Lang):string {
 const other=(lang==='zh'?name?.uk:name?.zh)?.trim()??'';
 return other&&other!==pick(name,lang)?other:'';
}
const joinList=(lang:Lang,parts:readonly string[])=>parts.join(lang==='zh'?'、':', ');
const noPrice=(lang:Lang)=>word(lang,'暂无价格','No price yet','Ціни поки немає');
/** The supplier name as the copied text writes it. */
export function supplierTitle(supplier:string,lang:Lang):string {
 return supplier===UNSPECIFIED_SUPPLIER?word(lang,UNSPECIFIED_SUPPLIER,'No supplier assigned','Постачальника не вказано'):supplier;
}
export const kindsText=(n:number,lang:Lang)=>word(lang,`${n} 种`,`${n} ${n===1?'item':'items'}`,`Позицій: ${n}`);
export const totalsText=(totals:readonly {currency:string;amount:number}[],lang:Lang)=>totals.length?joinList(lang,totals.map(x=>moneyText(x.amount,x.currency))):noPrice(lang);
/** One estimated line next to the judgment: packs, pack size, total, and the amount when a price is recorded. */
function estimateLineText(line:EstimatedLine,lang:Lang):string {
 const packs=line.packs,each=displayQuantity({value:line.trace.packSize,unit:line.trace.packUnit},lang),all=displayQuantity(line.qty,lang);
 const base=word(lang,`${packs} 包 · 每包 ${each} · 共 ${all}`,`${packs} ${packs===1?'pack':'packs'} · ${each} each · ${all} in all`,`${packs} уп. · по ${each} · разом ${all}`);
 return `${base} · ${line.amount?moneyText(line.amount.amount,line.amount.currency):noPrice(lang)}`;
}
export function renderCandidates(options:CandidatesOptions):HTMLElement {
 const {lang,collection,estimate,ingredients,dishes}=options,t=(key:ShoppingWord)=>shoppingText(lang,key);
 const name=(kind:'ingredient'|'dish',id:string)=>pick(lookup<Pick<Ingredient,'name'|'role'>|AnyDish>(kind==='ingredient'?ingredients:dishes,id)?.name,lang)||t('missing');
 const ref=(kind:'ingredient'|'dish',id:string)=>options.href?h('a',{href:options.href(kind,id)},name(kind,id)):h('span',{},name(kind,id));
 const result=h('div',{class:'tm-candidates'});
 // The estimated total sits at the top, right after the whole-list copy, before the coverage note and issues.
 if(options.sections)result.append(h('section',{class:'tm-card tm-supplier-summary','data-supplier-summary':'all'},h('p',{},h('b',{},word(lang,'预计合计','Estimated total','Орієнтовний підсумок')),' ',totalsText(sumByCurrency(options.sections.flatMap(x=>x.group.lines.map(y=>y.line))),lang),' · ',kindsText(collection.items.length,lang)),h('p',{class:'muted'},t('budget'))));
 result.append(h('p',{class:'muted'},t('coverage')));
 if(collection.issues.length)result.append(h('details',{class:'tm-status tm-candidate-issues'},h('summary',{},`${t('issues')} · ${collection.issues.length}`),...collection.issues.map(issue=>h('article',{},h('p',{},reasonText(issue.code,lang),' · ',[issue.date,issue.mealType?text(lang,issue.mealType):''].filter(Boolean).join(' / ')),issue.dishRef?ref('dish',issue.dishRef):null,issue.ingredientRef?ref('ingredient',issue.ingredientRef):null,h('p',{},word(lang,'查看来源资料并补齐后，再核对采购范围。','Check and complete the source records, then review the shopping scope.','Перевірте й доповніть вихідні дані, потім перевірте діапазон закупівель.')),supportDetails(lang,JSON.stringify(issue))))));
 if(!collection.items.length)result.append(h('p',{class:'tm-card'},t('empty')));
 const materialCard=(item:IngredientCollection['items'][number],sectionLines?:readonly EstimatedLine[])=>{
  // Name and role describe the same record of this list's fixed basis; a canonical group reads its first snapshot.
  const recordRef=item.snapshotRefs?.[0]??item.ingredientRef,estimateItem=estimate.items.find(x=>x.ingredientRef===item.ingredientRef);
  const ingredient=lookup(ingredients,recordRef);
  // An absent role is unclassified, not a missing record; only an absent record keeps the missing notice (#131).
  const other=sectionLines?counterpartName(ingredient?.name,lang):'';
  const heading=h('h3',{},ref('ingredient',recordRef),other?h('span',{class:'tm-counterpart',lang:lang==='zh'?'uk':'zh'},other):null),role=h('p',{class:'muted','data-ingredient-role':!ingredient?'missing':ingredient.role??'unclassified'},!ingredient?t('missing'):ingredient.role?t(ingredient.role):t('unclassified'));
  const card=h('section',{class:'tm-card tm-material','data-ingredient':item.ingredientRef},...(options.compact?[h('div',{class:'tm-material-heading'},heading,role)]:[heading,role]));
  const reference=options.compact?h('details',{class:'tm-material-reference'},h('summary',{},word(lang,'来源与数量参考','Sources and quantity reference','Джерела й кількісні орієнтири'),` · ${item.sources.length}`)):null;
  if(options.controls)card.append(options.controls(item.ingredientRef));
  if(sectionLines){
   const reasons=estimateItem?.status==='complete'?[]:[...new Set((estimateItem?.reasons??[]).map(r=>reasonText(r.code,lang)))];
   card.append(h('div',{class:'tm-material-estimate','data-estimate':sectionLines.length?'lines':'reason'},...(sectionLines.length?sectionLines.map(line=>h('p',{},estimateLineText(line,lang))):[h('p',{class:'muted'},reasons.join(' · ')||t('unavailable'))])));
  }
  (reference??card).append(h(options.compact?'section':'details',{},h(options.compact?'h4':'summary',{},`${t('sources')} · ${item.sources.length}`),h('ul',{},...item.sources.map(s=>{
    const amount=s.scaledQty?quantityText(s.scaledQty,lang):reasonText(s.plannedServings===undefined?'missing-planned-servings':s.baseServings===undefined?'missing-base-servings':'missing-qty',lang);
    return h('li',{},`${displayDate(s.date,lang)} · ${text(lang,s.mealType)} · `,ref('dish',s.dishRef),` · ${s.plannedServings??t('unknownCount')} · ${amount}`,s.ingredientRef?h('span',{},' · ',ref('ingredient',s.ingredientRef)):null,s.originalAmount?` · ${word(lang,'原方','Original','Оригінал')}: ${s.originalAmount}`:'',supportDetails(lang,s.menuPlanRef));
  }))));
  if(estimateItem?.status==='complete')(reference??card).append(h(options.compact?'section':'details',{},h(options.compact?'h4':'summary',{},t('estimate')),...estimateItem.lines.map(({supplier,line})=>h('p',{},`${supplier} · ${quantityText(line.qty,lang)} · ${line.packs} × ${displayQuantity({value:line.trace.packSize,unit:line.trace.packUnit},lang)}`,line.amount?` · ${line.amount.amount} ${line.amount.currency}`:''))));
  else if(estimateItem)(reference??card).append(h(options.compact?'section':'details',{class:'muted'},h(options.compact?'h4':'summary',{},t('unavailable')),h('p',{},[...new Set(estimateItem.reasons.map(r=>reasonText(r.code,lang)))].join(' · '))));
  if(reference)card.append(reference);
  return card;
 };
 if(options.sections){
  for(const section of options.sections){
   const {unpriced,unquantified}=section,copy=options.sectionCopy?.(section);
   // Same split as the copied text: priced subtotal, estimated but unpriced, and quantity still to confirm (not in the subtotal).
   const sum=section.group.lines.length?[' · ',totalsText(section.totals,lang)]:[];
   const head=h('div',{class:'tm-supplier-head'},h('div',{},h('h3',{},supplierTitle(section.supplier,lang)),h('p',{},kindsText(section.entries.length,lang),...sum),
    unpriced?h('p',{class:'muted','data-section-unpriced':String(unpriced)},word(lang,`其中 ${unpriced} 种暂无价格`,`${unpriced} of them without a price yet`,`серед них без ціни: ${unpriced}`)):null,
    unquantified?h('p',{class:'muted','data-section-unquantified':String(unquantified)},word(lang,`其中 ${unquantified} 种数量待定，未计入小计`,`${unquantified} with quantity to confirm, not in the subtotal`,`кількість уточнити: ${unquantified} — не враховано в сумі`)):null),copy);
   const rows=section.entries.flatMap(entry=>{const item=collection.items.find(x=>x.ingredientRef===entry.ingredientRef);return item?[materialCard(item,entry.lines)]:[];});
   result.append(h('section',{class:'tm-supplier-section','data-supplier-section':section.supplier===UNSPECIFIED_SUPPLIER?'unspecified':'supplier'},head,...rows));
  }
  return result;
 }
 for(const item of collection.items)result.append(materialCard(item));
 result.append(h('p',{class:'muted'},t('budget')));return result;
}
