/** Plain-text presentation of one saved basis; collection and estimates remain core-owned. */
import type {IngredientSource, ReferenceIssue, ShoppingEstimate, ShoppingList, TeamMealsProjection} from '@canteenos/core';
import {pick, type Lang} from '../i18n';
import {text} from './team-ui';
import {quantityText} from './quantity-text';
import {reasonText, shoppingText, type ShoppingWord} from './purchase-list';

const words={
 original:['原配方用量','Original recipe quantity','Початкова кількість рецепта'],
 planned:['计划份数','Planned servings','Порції в плані'],base:['配方基准份数','Recipe servings','Порції рецепта'],
 row:['计划行','Plan row','Рядок плану'],component:['配料项','Recipe item','Складник рецепта'],
 issues:['缺项与资料提示','Missing information and source notices','Відсутні дані й примітки джерела'],
 'missing-plan':['计划未找到','Plan missing','План не знайдено'],
 'empty-selection':['所选餐次没有菜品记录','No dish recorded for this meal','Для цього прийому їжі страву не записано'],
 'missing-technique':['技法资料未找到','Technique missing','Техніку не знайдено'],
} as const;

export function shoppingCopy(list:ShoppingList,projection:TeamMealsProjection,lang:Lang,estimate:ShoppingEstimate):string {
 const t=(key:ShoppingWord)=>shoppingText(lang,key),w=(key:keyof typeof words)=>words[key][lang==='zh'?0:lang==='en'?1:2];
 const reason=(code:string)=>Object.hasOwn(words,code)?w(code as keyof typeof words):reasonText(code,lang);
 const name=(kind:'ingredient'|'dish',id:string)=>{
  const records=kind==='ingredient'?projection.ingredients:projection.dishes;
  const value=Object.hasOwn(records,id)?pick(records[id]?.name,lang):'';
  return value?`${value} [${id}]`:id;
 };
 // Human row numbers preserve every source occurrence, including core index zero.
 const path=(s:IngredientSource|ReferenceIssue)=>[
  s.menuPlanRef,s.date,s.mealType?text(lang,s.mealType):undefined,
  s.dishRef?name('dish',s.dishRef):undefined,
  s.mealIndex!==undefined?`${w('row')}: ${s.mealIndex+1}`:undefined,
  s.componentIndex!==undefined?`${w('component')}: ${s.componentIndex+1}`:undefined,
  'ingredientRef' in s&&s.ingredientRef?name('ingredient',s.ingredientRef):undefined,
  'techniqueRef' in s?s.techniqueRef:undefined,
 ].filter(x=>x!==undefined).join(' · ');
 const decision=(item:ShoppingList['items'][number])=>item.decision==='buy'&&item.bought?'bought':item.decision;
 const lines=[t('copyTitle'),list.id,`${t('revision')}: ${list.basis.sourceRevision}`,
  ...list.basis.selection.map(s=>`${s.date} · ${text(lang,s.mealType)} · ${s.menuPlanRef}`)];
 for(const group of ['check','buy','available','bought'] as const){
  const items=list.items.filter(item=>decision(item)===group);
  if(!items.length)continue;
  lines.push('',t(group));
  for(const item of items){
   const id=item.ingredientRef,label=name('ingredient',id),ingredient=Object.hasOwn(projection.ingredients,id)?projection.ingredients[id]:undefined;
   lines.push(`${label} — ${t(group)}${ingredient?.role?` · ${t(ingredient.role)}`:''}`);
   for(const source of projection.collection.items.find(x=>x.ingredientRef===id)?.sources??[]){
    lines.push(`  ${t('sources')}: ${path(source)} · ${w('original')}: ${quantityText(source.qty,lang)} · ${w('planned')}: ${source.plannedServings??reason('missing-planned-servings')} · ${w('base')}: ${source.baseServings??reason('missing-base-servings')}`);
   }
   const reference=estimate.items.find(x=>x.ingredientRef===id);
   if(reference){
    for(const issue of reference.reasons)lines.push(`  ${label} · ${t('unavailable')}: ${reason(issue.code)}${issue.source?` · ${path(issue.source)}`:''}`);
    if(reference.status==='complete')for(const {supplier,line} of reference.lines)lines.push(`  ${label} · ${t('estimate')}: ${supplier} · ${quantityText(line.qty,lang)} · ${line.packs} × ${line.trace.packSize} ${line.trace.packUnit}${line.amount?` · ${line.amount.amount} ${line.amount.currency}`:''}`);
   }
  }
 }
 if(projection.collection.issues.length)lines.push('',w('issues'),...projection.collection.issues.map(issue=>`${reason(issue.code)} · ${path(issue)}`));
 lines.push('',t('coverage'),t('budget'));
 return lines.join('\n');
}
