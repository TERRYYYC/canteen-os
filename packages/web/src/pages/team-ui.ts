/** Presentation shared by team-meal pages; no domain algorithms or persistence. */
import type { Lang } from '../i18n';
import { h } from '../dom';
import type { EditState } from '../view-models/edit-session';
export const words = {
  plan:['排每天的菜','Plan meals','Планувати страви'], back:['返回','Back','Назад'],
  save:['保存计划','Save plan','Зберегти план'], publish:['去发布','Go to publish','До публікації'],
  loading:['正在读取…','Loading…','Завантаження…'], retry:['重新读取','Read again','Прочитати знову'],
  unconfigured:['未连接后台，不能保存','Not connected; saving is unavailable','Немає з’єднання; збереження недоступне'],
  mock:['模拟演示，未写入真实仓库','Simulation; no real repository write','Симуляція; без запису в справжнє сховище'],
  clean:['已读取，尚未修改','Loaded; unchanged','Завантажено; без змін'], dirty:['有未保存的修改','Unsaved changes','Є незбережені зміни'],
  saving:['正在保存，可继续编辑','Saving; you can keep editing','Зберігається; можна редагувати далі'],
  saved:['已保存；发布状态请到发布页查看','Saved; check publication on the publish page','Збережено; стан публікації на сторінці публікації'],
  conflict:['版本冲突，本地修改已保留','Version conflict; local changes retained','Конфлікт версій; локальні зміни збережено'],
  unknown:['保存结果未知，请先核实','Save outcome unknown; verify first','Результат збереження невідомий; перевірте'],
  error:['保存未完成','Save not completed','Збереження не завершено'], recover:['核实保存结果','Verify save outcome','Перевірити результат збереження'],
  compare:['查看远端并比较','Read remote and compare','Прочитати й порівняти віддалені дані'], local:['本地修改','Local changes','Локальні зміни'], remote:['远端内容','Remote content','Віддалені дані'],
  keep:['保留本地稿，采用新基线','Keep local draft with new baseline','Залишити локальне з новою базою'], adopt:['采用远端内容','Use remote content','Використати віддалені дані'],
  date:['日期','Date','Дата'], meal:['餐次','Meal','Прийом їжі'], dish:['菜品','Dish','Страва'], servings:['份数（选填）','Servings (optional)','Порції (необов’язково)'],
  breakfast:['早餐','Breakfast','Сніданок'], lunch:['午餐','Lunch','Обід'], dinner:['晚餐','Dinner','Вечеря'],
  add:['加一道菜','Add a dish','Додати страву'], remove:['移除','Remove','Прибрати'], all:['全部日期','All dates','Усі дати'], day:['一天','Day','День'], week:['一周','Week','Тиждень'],
  filter:['查看范围','View range','Діапазон перегляду'], empty:['还没安排菜品','No dishes planned','Страви ще не заплановано'],
  optional:['份数可以留空；保存会保留整份计划，使用新格式。','Counts may stay blank. Saving keeps the whole plan in the new format.','Кількість можна не вказувати. Зберігається весь план у новому форматі.'],
  invalidServings:['填写正整数或留空','Enter a positive whole number or leave blank','Вкажіть додатне ціле число або залиште порожнім'],
  missingDish:['菜谱未找到','Recipe unavailable','Рецепт недоступний'], catalogError:['菜品资料未读到；已有计划已保留','Dish catalog unavailable; the loaded plan is retained','Каталог недоступний; завантажений план збережено'],
  offline:['当前离线，资料可能无法读取','Offline; some information may be unavailable','Немає мережі; частина даних може бути недоступна'],
  source:['资料版本','Source version','Версія даних'], preview:['查看材料候选','Preview ingredients','Переглянути інгредієнти'], localPreview:['未保存的本地预览','Unsaved local preview','Незбережений локальний перегляд'],
  noSource:['尚未保存','Not saved yet','Ще не збережено'], choose:['选择菜品','Choose a dish','Виберіть страву'], import:['粘贴导入','Paste import','Імпорт тексту'],
} as const;
export type Word = keyof typeof words;
export function text(lang: Lang,key: Word):string {return words[key][lang==='zh'?0:lang==='en'?1:2];}
export function action(label:string,fn:()=>void,primary=false):HTMLButtonElement {
  const button=h('button',{type:'button',class:`tm-button${primary?' primary':''}`},label);button.addEventListener('click',fn);return button;
}
export function field(label:string,input:HTMLElement):HTMLLabelElement {return h('label',{class:'tm-field'},h('span',{},label),input);}
export function status<T>(state:EditState<T>,lang:Lang):HTMLElement {
  const key:Word=state.phase==='outcome-unknown'?'unknown':state.phase==='saved-but-unpublished'?'saved':state.phase==='closed'?'loading':state.phase;
  const node=h('div',{class:`tm-status ${state.phase}`,role:'status','data-phase':state.phase},text(lang,key));
  if(state.mode==='mock')node.append(h('p',{},text(lang,'mock')));
  if(state.mode==='unconfigured')node.append(h('p',{},text(lang,'unconfigured')));
  if(typeof navigator!=='undefined'&&!navigator.onLine)node.append(h('p',{},text(lang,'offline')));
  if(state.source)node.append(h('details',{},h('summary',{},text(lang,'source')),h('code',{},state.source.commit)));
  return node;
}
/** Teardown only when this exact view is detached; a language render can rebind first. */
export function onDetached(el:HTMLElement,cleanup:()=>void):()=>void {
  const observer=new MutationObserver(()=>{if(!el.isConnected){observer.disconnect();cleanup();}});
  observer.observe(document.body,{childList:true,subtree:true});return ()=>observer.disconnect();
}
