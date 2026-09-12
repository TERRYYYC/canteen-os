/** Optional local preview; loaded only when the user asks to inspect materials. */
import {normalizeSelection,type AnyMenuPlan} from '@canteenos/core';
import type {TeamCatalog} from '../../api/team-meals';
import type {Lang} from '../../i18n';
import {h} from '../../dom';
import {previewTeamMealsDraft} from '../../view-models/team-meals';
import {renderCandidates} from '../purchase-list';
import {text} from '../team-ui';
export function render(id:string,plan:AnyMenuPlan,catalog:TeamCatalog,lang:Lang,indices:number[]):HTMLElement {
 const selection=normalizeSelection(indices.map(index=>{const meal=plan.meals[index]!;return{menuPlanRef:id,date:meal.date,mealType:meal.mealType};}));
 const preview=previewTeamMealsDraft({inputs:{menuPlans:{[id]:plan},dishes:catalog.dishes,ingredients:catalog.ingredients,techniques:catalog.techniques},selection,at:new Date().toISOString()});
 return h('section',{'data-preview':'draft'},h('h3',{},text(lang,'localPreview')),renderCandidates({lang,collection:preview.collection,estimate:preview.estimate,ingredients:catalog.ingredients,dishes:catalog.dishes}));
}
