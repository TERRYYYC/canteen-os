/** Current-language record labels; original metadata stays in optional disclosures. */
import type {I18nString} from '@canteenos/core';
import {h} from '../dom';
import {chefOnly} from './chef-only';
import {type Lang,LANG_TAG} from '../i18n';
export const word=(lang:Lang,zh:string,en:string,uk:string)=>lang==='zh'?zh:lang==='en'?en:uk;
const labels:Record<string,readonly [string,string,string]>={
 active:['已入库，完整性仍需核对','In library; completeness still needs review','У бібліотеці; повноту ще слід перевірити'],
 draft:['草稿，资料待完善','Draft; information needs completing','Чернетка; дані слід доповнити'],
 archived:['已归档','Archived','Архівовано'],
 manual:['手动录入','Entered manually','Введено вручну'],video:['从视频录入，仍需核对','Entered from video; review needed','Введено з відео; потрібна перевірка'],
 example:['示例配方，未经厨房验证','Example recipe; not kitchen-verified','Приклад рецепта; не перевірено на кухні'],
 'day-before':['前一天','The day before','Напередодні'],morning:['当天早上','This morning','Сьогодні вранці'],'before-service':['出餐前','Before service','Перед подачею'],
};
export function recordValue(value:string|boolean|undefined,lang:Lang):string|undefined {
 if(value===undefined)return undefined;
 if(typeof value==='boolean')return value?word(lang,'已启用','Enabled','Увімкнено'):word(lang,'未启用','Not enabled','Не ввімкнено');
 const translated=labels[value];return translated?translated[lang==='zh'?0:lang==='en'?1:2]:value;
}
/** Raw ids and JSON are for the chef. Without a token nothing is built: an empty text node comes back,
 * so every existing append(...) call site stays as it is and no "null" text can appear. */
export function supportDetails(lang:Lang,...contents:(Node|string)[]):HTMLElement|Text {
 return chefOnly(()=>h('details',{class:'record-support'},h('summary',{},word(lang,'支持用技术详情','Technical support details','Технічні дані для підтримки')),...contents))??document.createTextNode('');
}
/** Plain-language replacement for the raw "KB <id> · v<n> · <hash>" line; chef-only like the line it replaces. */
export function recipeLibraryLine(lang:Lang,version:number):HTMLElement|null {
 return chefOnly(()=>h('p',{},lang==='zh'?`来自菜谱库 · 第 ${version} 版`:lang==='en'?`From the recipe library · version ${version}`:`З бібліотеки рецептів · версія ${version}`));
}
export function translations(name:I18nString|undefined,lang:Lang):HTMLElement {
 return h('details',{class:'record-translations'},h('summary',{},word(lang,'其他语言原文','Other language versions','Інші мовні версії')),
 ...(['zh','en','uk'] as const).filter(code=>code!==lang).map(code=>h('p',{lang:LANG_TAG[code]},`${code.toUpperCase()}: ${name?.[code]??word(lang,'未录','Not recorded','Не записано')}`)));
}
