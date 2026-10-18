/** Human-readable warnings over unchanged fixed-source issues. No data repair or inference. */
import type {TeamMealsProjection} from '@canteenos/core';
import {h} from '../dom';
import {pick,type Lang} from '../i18n';
import {chefOnly} from './chef-only';
import {supportDetails,word} from './record-display';
const reasons:Record<string,readonly [string,string,string]>={
 'missing-plan':['排菜计划未找到，请检查安排。','Meal plan unavailable; check the schedule.','План харчування недоступний; перевірте розклад.'],
 'empty-selection':['所选餐次没有排菜。','No dishes in the selected meal.','У вибраному прийомі їжі немає страв.'],
 'missing-dish':['菜谱未找到，备料和采购可能漏项。','Recipe unavailable; preparation and shopping may be incomplete.','Рецепт недоступний; підготовка й закупівля можуть бути неповними.'],
 'missing-ingredient':['食材资料未找到，请补齐后再确认采购。','Ingredient information unavailable; complete it before confirming shopping.','Дані інгредієнта недоступні; доповніть їх перед підтвердженням закупівлі.'],
 'components-unrecorded':['尚未录入配料，备料和采购可能漏项。','Ingredients not recorded; preparation and shopping may be incomplete.','Інгредієнти не записано; підготовка й закупівля можуть бути неповними.'],
 'dish-not-active':['菜谱还没写完整，材料或做法可能缺项。','The recipe is not finished; ingredients or steps may be missing.','Рецепт ще не дописано; інгредієнтів або кроків може бракувати.'],
 'missing-technique':['技法资料未找到，怎么做问师傅。','Technique information unavailable; ask the chef how to do it.','Дані техніки недоступні; запитайте кухаря, як це зробити.'],
 'missing-planned-servings':['计划份数未录，暂不能换算本次用量；仍可查看原配方并人工判断。','Planned servings are blank; use the original quantities and judge manually.','Порції в плані не записано; користуйтеся вихідними кількостями та оцінюйте вручну.'],
 'missing-base-servings':['配方基准份数未录，暂不能按份数换算。','Recipe servings are blank; quantities cannot be scaled.','Базові порції рецепта не записано; кількості не можна масштабувати.'],
 'missing-qty':['原用量未录，问师傅。','Original quantity not recorded; ask the chef.','Вихідну кількість не записано; запитайте кухаря.'],
 'to-taste':['原配方记为适量，请人工判断本次需要多少。','Recorded as to taste; decide the amount manually.','Записано «за смаком»; визначте кількість вручну.'],
 'missing-purchase':['采购规格未录，请确认包装和购买单位。','Purchase specification not recorded; check packaging and units.','Закупівельні параметри не записано; перевірте пакування й одиниці.'],
 'unit-conversion-missing':['原用量和采购单位换算不了，算不出几包，请自己判断。','Recipe and purchase units cannot be converted, so packs cannot be worked out; decide yourself.','Одиниці рецепта й закупівлі не можна перетворити, тож упаковки не пораховано; вирішіть самі.'],
};
export function renderRecordNotice(issue:{code:string},lang:Lang,projection?:TeamMealsProjection,attribute='data-source-issue'):HTMLElement {
 const raw=issue as Record<string,unknown>,source=raw.source&&typeof raw.source==='object'?raw.source as Record<string,unknown>:{};
 const field=(key:string)=>typeof raw[key]==='string'?raw[key] as string:typeof source[key]==='string'?source[key] as string:undefined;
 const dishRef=field('dishRef'),ingredientRef=field('ingredientRef'),planRef=field('menuPlanRef')??field('planId'),date=field('date'),meal=field('mealType');
 const name=(kind:'dishes'|'ingredients'|'menuPlans',id:string|undefined)=>id&&projection&&Object.hasOwn(projection[kind],id)?pick(projection[kind][id]?.name,lang):'';
 const who=[date,meal==='lunch'?word(lang,'午餐','Lunch','Обід'):meal==='dinner'?word(lang,'晚餐','Dinner','Вечеря'):meal==='breakfast'?word(lang,'早餐','Breakfast','Сніданок'):undefined,
 dishRef?name('dishes',dishRef)||word(lang,'所选菜品','Selected dish','Вибрана страва'):undefined,ingredientRef?name('ingredients',ingredientRef)||word(lang,'所选材料','Selected ingredient','Вибраний інгредієнт'):undefined];
 if(!dishRef&&!ingredientRef&&planRef)who.push(name('menuPlans',planRef)||word(lang,'所选计划','Selected plan','Вибраний план'));
 const translated=reasons[issue.code];
 let reason=translated?translated[lang==='zh'?0:lang==='en'?1:2]:word(lang,'这项资料不全，问师傅。','This information is incomplete; ask the chef.','Ці дані неповні; запитайте кухаря.');
 if(issue.code==='components-unrecorded'&&!dishRef&&ingredientRef)reason=word(lang,'部分来源菜谱未录配料，这份材料清单可能不完整。','Some source recipes have no ingredients recorded; this ingredient list may be incomplete.','У частині вихідних рецептів не записано інгредієнтів; цей список може бути неповним.');
 const repair=dishRef?`#/admin/dish/${encodeURIComponent(dishRef)}`:ingredientRef?`#/admin/ingredient/${encodeURIComponent(ingredientRef)}`:planRef?`#/admin/plan/${encodeURIComponent(planRef)}`:null;
 return h('div',{class:'record-notice',[attribute]:issue.code},h('p',{},who.filter(Boolean).join(' · ')),h('p',{},reason),
 repair?chefOnly(()=>h('a',{href:repair},word(lang,'查看／补齐资料','View / complete information','Переглянути / доповнити дані'))):null,
 supportDetails(lang,h('pre',{},JSON.stringify(issue,null,2))));
}
