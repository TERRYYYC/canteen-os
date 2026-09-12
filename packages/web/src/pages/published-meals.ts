/** Page-owned navigation and presentation for C's verified public reader. */
import type { MealType } from '@canteenos/core';
import type { PublishedTeamPlan, Publication } from '../data';
import { PublishedDataError } from '../view-models/published';
import { h, replace } from '../dom';
import { pick, type Lang } from '../i18n';
import type { PageCtx } from '../types';
import type { FrozenMealSource, FrozenMealRenderOptions, FrozenMealRow } from './prep';

type Presenter = (el: HTMLElement, source: FrozenMealSource, options: FrozenMealRenderOptions) => () => void;
const copy = {
 published: { zh: '已发布原配方', en: 'Published original recipes', uk: 'Опубліковані оригінальні рецепти' },
 noPlans: { zh: '本版没有发布计划', en: 'No plans in this publication', uk: 'У цій публікації немає планів' },
 empty: { zh: '此计划没有已录餐食', en: 'No recorded meals in this plan', uk: 'У цьому плані немає записаних страв' },
 unavailable: { zh: '无法读取这版资料', en: 'This publication could not be read', uk: 'Не вдалося прочитати цю версію' },
 warning: { zh: '发布资料提示', en: 'Publication notices', uk: 'Зауваження до публікації' },
 dates: { zh: '日期', en: 'Days', uk: 'Дні' }, meals: { zh: '餐次', en: 'Meals', uk: 'Прийоми їжі' },
 dishes: { zh: '菜品', en: 'Dishes', uk: 'Страви' }, back: { zh: '返回备料', en: 'Back to preparation', uk: 'Назад до підготовки' },
 missingDish: { zh: '此日期没有所选菜品', en: 'The selected dish is not recorded on this day', uk: 'Вибрану страву не записано на цей день' },
 chooseSource: { zh: '此材料用于多道菜，请选择原配方', en: 'This ingredient is used in several dishes. Choose its original recipe.', uk: 'Цей інгредієнт є в кількох стравах. Виберіть вихідний рецепт.' },
 missingIngredient: { zh: '此餐次未找到该材料，原引用保留', en: 'Ingredient not found in this meal; original reference retained', uk: 'Інгредієнт не знайдено в цьому прийомі їжі; посилання збережено' },
 close: { zh: '关闭原配方', en: 'Close recipe', uk: 'Закрити рецепт' },
 all: { zh: '全部时机', en: 'All preparation times', uk: 'Усі терміни підготовки' },
 morning: { zh: '当天早上', en: 'This morning', uk: 'Сьогодні вранці' },
 'before-service': { zh: '出餐前', en: 'Before service', uk: 'Перед подачею' },
 'day-before': { zh: '前一天', en: 'The day before', uk: 'Напередодні' },
} as const;
const mealNames = {
 breakfast: { zh: '早餐', en: 'Breakfast', uk: 'Сніданок' }, lunch: { zh: '午餐', en: 'Lunch', uk: 'Обід' }, dinner: { zh: '晚餐', en: 'Dinner', uk: 'Вечеря' },
};
const order: MealType[] = ['breakfast', 'lunch', 'dinner'];
const stops = new WeakMap<HTMLElement, () => void>();
const choices = new WeakMap<Publication, { meal: MealType | null; menuRow?: number; dishes: Map<string, number>; timing: string }>();
let openedByLink: string | null = null;
let focusDish: string | null = null;
const href = (page: string, ...parts: string[]) => `#/${page}${parts.length ? '/' + parts.map(encodeURIComponent).join('/') : ''}`;
const dayToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Returns false only for a verified legacy publication. Never repairs or clones reader handles. */
export async function renderPublishedMeals(el: HTMLElement, ctx: PageCtx, page: 'menu' | 'prep', present: Presenter, recipe: Presenter,
  selectRows: (source: FrozenMealSource, selection?: FrozenMealRenderOptions['selection']) => readonly FrozenMealRow[]): Promise<boolean> {
  stops.get(el)?.();
  let live = true;
  const children: (() => void)[] = [];
  const observer = new MutationObserver(() => { if (!el.isConnected) dispose(); });
  const dispose = () => { if (!live) return; live = false; observer.disconnect(); children.splice(0).forEach(stop => stop()); if (stops.get(el) === dispose) stops.delete(el); };
  stops.set(el, dispose); observer.observe(document.body, { childList: true, subtree: true });
  replace(el);
  const current = () => live && el.isConnected && stops.get(el) === dispose;
  const { publication, lang } = ctx;
  const t = (key: keyof typeof copy) => copy[key][lang];
  const status = (state: string, message: string) => replace(el, h('p', { class: 'card', role: 'status', 'data-publication-state': state }, message));
  const failure = (error: unknown) => {
    status(error instanceof PublishedDataError ? error.code : 'unavailable', t('unavailable'));
    if (error instanceof PublishedDataError) el.append(h('p', { class: 'muted', 'data-publication-error': error.code }, `${error.code} · ${error.stage}${error.status === null ? '' : ` · HTTP ${error.status}`}${error.sourceRevision ? ` · ${error.sourceRevision}` : ''}`));
  };
  if (ctx.publicationError) { failure(ctx.publicationError); return true; }
  if (!publication) { status('loading', ctx.t('data.loading')); return true; }
  if (publication.kind === 'legacy') { dispose(); return false; }
  if (!publication.manifest.plans.length) { status('no-plans', t('noPlans')); return true; }
  status('loading', ctx.t('data.loading'));
  let plan: PublishedTeamPlan;
  try { plan = await ctx.data.loadPublishedTeamPlan(publication, ctx.planId ?? ''); }
  catch (error) { if (current()) failure(error); return true; }
  if (!current()) return true;
  const source: FrozenMealSource = { mode: 'real', projection: plan.projection };
  const record = plan.projection.menuPlans[plan.planId]!;
  const root = h('div', { class: page === 'menu' ? 'menu-page menu-publication' : 'prep', 'data-publication-state': record.meals.length ? 'published' : 'empty-plan', 'data-published-plan': plan.planId });
  replace(el, root);
  const publicationInfo=h('details',{class:page==='menu'?'menu-publication-info':''},h('summary',{},page==='menu'?`${t('published')} · ${plan.sourceRevision.slice(0,8)}`:plan.sourceRevision.slice(0,8)),h('code',{},plan.sourceRevision),h('p',{},plan.builtAt));
  if(page==='menu')root.append(h('p',{class:'menu-plan-context'},pick(record.name,lang)||plan.planId));
  else root.append(h('h1',{},pick(record.name,lang)||plan.planId),h('p',{class:'muted',role:'status'},t('published')),publicationInfo);
  if (plan.issues.length) root.append(h('details', { 'data-publication-issues': '' }, h('summary', {}, t('warning')),
    ...plan.issues.map(issue => h('div', { 'data-publication-issue': issue.code }, h('p', {}, `${issue.kind} · ${issue.code}`), h('pre', { style: 'white-space:pre-wrap;overflow-wrap:anywhere' }, JSON.stringify(issue, null, 2))))));
  if (!record.meals.length) { root.append(h('p', { class: 'card', role: 'status' }, t('empty')));if(page==='menu')root.append(publicationInfo); return true; }
  let memory = choices.get(publication);
  if (!memory) { memory = { meal: null, dishes: new Map(), timing: 'all' }; choices.set(publication, memory); }
  const all = selectRows(source, { menuPlanRef: plan.planId });
  const slots = plan.projection.selection.filter(slot => slot.menuPlanRef === plan.planId);
  const dates = [...new Set(slots.map(slot => slot.date))].sort();
  const [datePart = '', second = '', ingredientRef = ''] = ctx.rest.split('/');
  const date = dates.includes(datePart) ? datePart : dates.find(d => d >= dayToday()) ?? dates.at(-1) ?? '';
  const mealTypes = order.filter(type => slots.some(slot => slot.date === date && slot.mealType === type));
  const matchingDishes = all.filter(row => row.meal.date === date && row.meal.dishRef === second);
  const requestedDish = page === 'menu' ? matchingDishes.find(row => row.mealIndex === memory!.menuRow) ?? matchingDishes.find(row => row.meal.mealType === memory!.meal) ?? matchingDishes[0] : undefined;
  let selectedMeal = page === 'menu' ? requestedDish?.meal.mealType ?? (mealTypes.includes(memory.meal!) ? memory.meal! : mealTypes[0]) : mealTypes.find(type => type === second) ?? mealTypes[0];
  const datesNav = h('nav', { class: page === 'menu' ? 'days' : 'tabs dates', 'aria-label': t('dates') }, ...dates.map(d => h('a', { class: d === date ? 'chip accent' : 'chip', href: href(page, d), 'data-date': d, 'aria-current': d === date ? 'date' : null }, ...(page==='menu'?[h('span',{class:'menu-date-weekday'},new Intl.DateTimeFormat(lang==='zh'?'zh-CN':lang==='uk'?'uk-UA':'en-GB',{weekday:'short',timeZone:'UTC'}).format(new Date(`${d}T12:00:00Z`))),h('b',{class:'menu-date-number'},String(Number(d.slice(8))))]:[d]))));
  const mealsNav = h('nav', { class: 'tabs meals', 'aria-label': t('meals') });
  const dishNav = h('nav', { class: 'tabs', 'aria-label': t('dishes'), 'data-published-dishes': '' });
  const body = h('div', { class: page === 'menu' ? 'menu-body' : 'list' });
  root.append(datesNav, mealsNav, dishNav, body);if(page==='menu')root.append(publicationInfo);
  let stopBody: (() => void) | undefined;
  children.push(() => stopBody?.());
  function options(row?: FrozenMealRow): FrozenMealRenderOptions {
    return { lang, selection: { menuPlanRef: plan.planId, date, mealType: selectedMeal, ...(row ? { mealIndex: row.mealIndex } : {}) },
      asset: query => {
        if (query.revision !== plan.sourceRevision) return Promise.reject(new Error('revision_mismatch'));
        const owner = /^data\/(dishes|ingredients)\/([a-z][a-z0-9-]*)\.json$/.exec(query.owner);
        if (!owner) return Promise.reject(new Error('asset_binding_invalid'));
        return ctx.data.loadPublishedAsset(plan, `/${owner[1]}/${owner[2]}${query.pointer}`);
      },
      techniqueAsset: id => {
        const index = plan.projection.techniques.findIndex(technique => technique.id === id);
        return index < 0 ? Promise.reject(new Error('asset_binding_invalid')) : ctx.data.loadPublishedAsset(plan, `/techniques/${index}/image`);
      },
      onReference: kind => { if (!row) return; if (kind === 'ingredient') memory!.dishes.set(JSON.stringify([plan.planId, date, selectedMeal]), row.mealIndex); else memory!.menuRow = row.mealIndex; },
      href: (kind, id) => kind === 'dish' ? href('menu', date, id) : href('prep', date, selectedMeal ?? '', id),
    };
  }
  function paint(): void {
    if (!current()) return;
    stopBody?.(); replace(body); replace(dishNav);
    const rows = selectRows(source, { menuPlanRef: plan.planId, date, mealType: selectedMeal });
    if (page === 'menu') {
      stopBody = present(body, source, { ...options(), recipeHref: row => href('menu', row.meal.date, row.meal.dishRef) });
      for (const link of body.querySelectorAll<HTMLAnchorElement>('[data-recipe-link]')) link.addEventListener('click', () => { openedByLink = link.getAttribute('href'); memory!.menuRow = Number(link.getAttribute('data-recipe-index')); });
      if (focusDish) { const link = [...body.querySelectorAll<HTMLElement>('[data-recipe-link]')].find(node => node.getAttribute('data-recipe-link') === focusDish); if (link && (!document.activeElement || document.activeElement === document.body)) link.focus(); focusDish = null; }
      return;
    }
    const key = JSON.stringify([plan.planId, date, selectedMeal]);
    const candidates = ingredientRef ? rows.filter(item => item.dish?.components?.some(component => component.ingredientRef === ingredientRef)) : rows;
    const row = candidates.find(item => item.mealIndex === memory!.dishes.get(key)) ?? (!ingredientRef || candidates.length === 1 ? candidates[0] : undefined);
    for (const item of candidates) {
      const button = h('button', { class: item === row ? 'chip accent' : 'chip', type: 'button', 'data-dish-index': item.mealIndex, 'aria-pressed': item === row ? 'true' : 'false' }, item.dish ? pick(item.dish.name, lang) : item.meal.dishRef);
      button.addEventListener('click', () => { memory!.dishes.set(key, item.mealIndex); paint(); }); dishNav.append(button);
    }
    if (ingredientRef && !row) { body.append(h('p', { role: 'status', 'data-ingredient-source-choice': candidates.length ? 'multiple' : 'missing' }, `${t(candidates.length ? 'chooseSource' : 'missingIngredient')} · ${ingredientRef}`)); return; }
    if (ingredientRef) body.append(h('a', { class: 'chip', href: href('prep', date, selectedMeal ?? '') }, t('back')));
    const content = h('div');
    if (!ingredientRef) {
      const timings = h('div', { class: 'tabs filters', role: 'group' });
      for (const timing of ['all', 'morning', 'before-service', 'day-before'] as const) {
        const button = h('button', { type: 'button', class: 'chip', 'data-filter': timing, 'aria-pressed': memory!.timing === timing ? 'true' : 'false' }, t(timing));
        button.addEventListener('click', () => { memory!.timing = timing; paint(); }); timings.append(button);
      }
      body.append(timings);
    }
    body.append(content);
    stopBody = recipe(content, source, { ...options(row), ingredientRef: ingredientRef || undefined, timing: ingredientRef ? undefined : memory!.timing });
  }
  for (const type of mealTypes) {
    const windows = [...new Set(all.filter(row => row.meal.date === date && row.meal.mealType === type).map(row => row.meal.serviceWindow).filter(Boolean))];
    const label = `${mealNames[type][lang]}${windows.length ? ` · ${windows.join(' · ')}` : ''}`;
    if (page === 'prep') mealsNav.append(h('a', { class: type === selectedMeal ? 'chip accent' : 'chip', href: href('prep', date, type), 'data-meal': type, 'aria-current': type === selectedMeal ? 'true' : null }, label));
    else {
      const button = h('button', { class: 'chip', type: 'button', 'data-meal': type, 'aria-pressed': type === selectedMeal ? 'true' : 'false' }, h('span',{},mealNames[type][lang]),windows.length?h('small',{},windows.join(' · ')):null);
      button.addEventListener('click', () => { selectedMeal = type; memory!.meal = type; for (const b of mealsNav.querySelectorAll('button')) b.setAttribute('aria-pressed', b.getAttribute('data-meal') === type ? 'true' : 'false'); paint(); }); mealsNav.append(button);
    }
  }
  if (page === 'menu' && selectedMeal) memory.meal = selectedMeal;
  paint();
  if (page === 'menu' && second) {
    if (!requestedDish) { root.append(h('p', { role: 'status' }, `${t('missingDish')} · ${second}`)); return true; }
    const close = h('button', { type: 'button', class: 'chip', style: 'min-height:44px;flex:none', 'aria-label': t('close') }, t('close'));
    const content = h('div', { class: 'body', style: 'overflow-wrap:anywhere;min-height:0' });
    const dialog = h('div', { class: 'dsheet menu-recipe-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('published'), tabindex: '-1' }, close, content);
    const scrim = h('div', { class: 'dsheet-scrim' });
    root.setAttribute('inert', ''); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; el.append(scrim, dialog);
    children.push(recipe(content, source, options(requestedDish)));
    const dismiss = () => { focusDish = requestedDish.meal.dishRef; if (openedByLink === location.hash) { openedByLink = null; history.back(); } else location.replace(href('menu', date)); };
    close.addEventListener('click', dismiss); scrim.addEventListener('click', dismiss);
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
      if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll<HTMLElement>('a,button,summary,[tabindex]')].filter(node => node !== dialog && node.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    const teardown = () => { root.removeAttribute('inert'); document.body.style.overflow = overflow; scrim.remove(); dialog.remove(); window.removeEventListener('hashchange', teardown); };
    children.push(teardown); window.addEventListener('hashchange', teardown);
    if (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected) dialog.focus();
  }
  return true;
}
