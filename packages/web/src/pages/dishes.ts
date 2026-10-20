import './dishes.css';
/** 菜品页：只读所选计划同一次发布的资料（ctx.publication + ctx.planId），不读当前菜谱库，不调用 Worker。 */
import type { AnyDish, I18nString, TeamMealsProjection } from '@canteenos/core';
import type { PublishedTeamPlan } from '../data';
import { PublishedDataError } from '../view-models/published';
import { append, h, replace } from '../dom';
import { pick, type Lang } from '../i18n';
import type { PageCtx } from '../types';
import { word } from './record-display';
import { onDetached } from './team-ui';
import { rawQuantityText, recordedAmountText } from './prep';
import { ALL_KINDS, dishUnknownLine, unknownLine, unknownsAt } from './recipe-unknowns';

const copy = {
  noPlans: { zh: '本版没有发布计划', en: 'No plans in this publication', uk: 'У цій публікації немає планів' },
  unavailable: { zh: '无法读取这版资料', en: 'This publication could not be read', uk: 'Не вдалося прочитати цю версію' },
  empty: { zh: '这个计划里还没有安排菜', en: 'No dishes are planned yet', uk: 'У цьому плані ще немає страв' },
  noMatch: { zh: '没有找到符合的菜', en: 'No dishes match', uk: 'Нічого не знайдено' },
  search: { zh: '搜菜名或材料', en: 'Search dish or ingredient', uk: 'Пошук страви або інгредієнта' },
  placeholder: { zh: '搜菜名或材料：中文、English、Українська', en: 'Search dish or ingredient: 中文, English, Українська', uk: 'Пошук страви або інгредієнта: 中文, English, Українська' },
  main: { zh: '主料', en: 'Main ingredients', uk: 'Основні інгредієнти' },
  back: { zh: '返回菜品', en: 'Back to dishes', uk: 'Назад до страв' },
  missingDish: { zh: '这个计划里找不到这道菜', en: 'This dish is not in the plan', uk: 'Цієї страви немає в плані' },
  ingredients: { zh: '食材', en: 'Ingredients', uk: 'Інгредієнти' },
  method: { zh: '做法', en: 'Method', uk: 'Приготування' },
  noIngredients: { zh: '还没有录入食材', en: 'No ingredients recorded', uk: 'Інгредієнтів ще не записано' },
  noSteps: { zh: '还没有录入做法', en: 'No method recorded', uk: 'Способу приготування ще не записано' },
  note: { zh: '备注', en: 'Note', uk: 'Примітка' },
  technique: { zh: '技法', en: 'Technique', uk: 'Техніка' },
  size: { zh: '大小', en: 'Size', uk: 'Розмір' },
  original: { zh: '原方', en: 'Original', uk: 'За рецептом' },
  ingredientMissing: { zh: '食材资料未找到', en: 'Ingredient information unavailable', uk: 'Дані інгредієнта недоступні' },
  ingredientUnnamed: { zh: '食材名称未录', en: 'Ingredient name not recorded', uk: 'Назву інгредієнта не записано' },
  techniqueMissing: { zh: '技法资料未找到', en: 'Technique information unavailable', uk: 'Дані техніки недоступні' },
  noServings: { zh: '原配方份数没写', en: 'Original recipe servings not recorded', uk: 'Порції вихідного рецепта не вказано' },
} as const;
type Key = keyof typeof copy;
const LANG_CODES = ['zh', 'en', 'uk'] as const;
const own = <T,>(map: Record<string, T>, id: string): T | undefined => (Object.hasOwn(map, id) ? map[id] : undefined);
const dishHref = (ctx: PageCtx, id?: string) => ctx.planSelection?.href('dishes', id ?? '') ?? `#/dishes${id ? `/${encodeURIComponent(id)}` : ''}`;
// Ukrainian as label and number, so no numeral agreement is needed (1 порція / 2 порції / 5 порцій).
const servingsLine = (lang: Lang, n: number) => word(lang, `原配方 ${n} 份`, `Original recipe: ${n} ${n === 1 ? 'serving' : 'servings'}`, `Порцій за рецептом: ${n}`);
/** 读者中文 → 乌语；读者乌语或英语 → 中文。只取对方语言自己的文字。 */
export const otherLanguageName = (name: I18nString | undefined, lang: Lang): string => (lang === 'zh' ? name?.uk : name?.zh) ?? '';
const initialOf = (name: string) => Array.from(name.trim())[0] ?? '·';
/** Same separator as the prep list: technique name, then the recorded size. */
const sizeSep = (lang: Lang) => (lang === 'zh' ? '，' : ', ');
const squash = (text: string) => text.replace(/\s+/g, '');
type Component = NonNullable<AnyDish['components']>[number];

/**
 * 原配方用量，写法同备料清单（D0 四条线第一批第 1、4 条）：有数值按读者语言写数值，已录原文另有说法时照原文附在旁边；
 * 没有数值时照原文写，原文也没有就写「用量未录」；to-taste 写「适量」。都不补数，也不按份数换算。
 */
export function originalAmount(component: Component, lang: Lang): { amount: string; wording?: string; unrecorded?: true } {
  const recorded = recordedAmountText('originalAmount' in component ? component.originalAmount : undefined);
  const qty = component.qty;
  if (qty?.unit === 'to-taste') return { amount: rawQuantityText(qty, lang), wording: recorded && recorded !== '适量' ? recorded : undefined };
  if (qty?.value !== undefined) {
    // "500 g" recorded for 500 g is the same amount in another language's words, not a different wording.
    const same = recorded !== undefined && LANG_CODES.some(code => squash(rawQuantityText(qty, code)) === squash(recorded));
    return { amount: rawQuantityText(qty, lang), wording: recorded && !same ? recorded : undefined };
  }
  if (recorded) return { amount: recorded };
  return { amount: rawQuantityText(qty, lang), unrecorded: true };
}

export async function render(el: HTMLElement, ctx: PageCtx): Promise<void> {
  const { lang, publication } = ctx;
  const t = (key: Key) => copy[key][lang];
  let live = true;
  const urls = new Set<string>();
  const dispose = () => { live = false; for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
  onDetached(el, dispose);
  const status = (state: string, message: string) => replace(el, h('p', { class: 'card', role: 'status', 'data-dishes-state': state }, message));
  if (ctx.publicationError) { status('unavailable', t('unavailable')); return; }
  if (!publication) { status('loading', ctx.t('data.loading')); return; }
  if (publication.kind === 'legacy' || !publication.manifest.plans.length) { status('no-plans', t('noPlans')); return; }
  if (!ctx.planId) { status('choose-plan', word(lang, '选择一个计划，或创建本周计划后保存并发布。', 'Choose a plan, or create this week’s plan, save and publish it.', 'Виберіть план або створіть план на цей тиждень, збережіть і опублікуйте його.')); return; }
  if (!publication.manifest.plans.includes(ctx.planId)) { status('not-published', word(lang, '所选计划尚未在本版发布。保存后还需要发布，其他计划不会替代它。', 'The selected plan is not in this publication. Save and publish it; other plans do not replace it.', 'Вибраного плану немає в цій публікації. Збережіть і опублікуйте його; інші плани його не замінюють.')); return; }
  status('loading', ctx.t('data.loading'));
  let plan: PublishedTeamPlan;
  try { plan = await ctx.data.loadPublishedTeamPlan(publication, ctx.planId); }
  catch (error) { if (live && el.isConnected) status(error instanceof PublishedDataError ? error.code : 'unavailable', t('unavailable')); return; }
  if (!live || !el.isConnected) return;
  const projection: TeamMealsProjection = plan.projection;
  const meals = projection.menuPlans[plan.planId]?.meals ?? [];

  const ingredientName = (ref: string) => pick(own(projection.ingredients, ref)?.name, lang);
  const techniqueOf = (ref: string | undefined) => (ref ? projection.techniques.find(x => x.id === ref) : undefined);
  // A recipe-library dish keeps the role on its row; a shared standard ingredient record has none.
  const roleOf = (c: Component) => ('role' in c && c.role) || own(projection.ingredients, c.ingredientRef)?.role;
  /** 材料角色是 main 的全部材料名（读者语言），同名只写一次。 */
  const mainNames = (dish: AnyDish) => [...new Set((dish.components ?? []).filter(c => roleOf(c) === 'main').map(c => ingredientName(c.ingredientRef)).filter(Boolean))];

  /** 同版图片；读不到、没有图或使用权待确认时用菜名首字放在海水纹上。菜名就在旁边，所以图片的替代文字留空。 */
  function cover(id: string, dish: AnyDish): HTMLElement {
    const box = h('div', { class: 'dishes-cover' }, h('span', { class: 'dishes-initial', 'aria-hidden': 'true' }, initialOf(pick(dish.name, lang))));
    if (!dish.image) return box;
    void Promise.resolve().then(() => ctx.data.loadPublishedAsset(plan, `/dishes/${id}/image`)).then(result => {
      if (!live || !el.isConnected || !('kind' in result) || result.kind !== 'available') return;
      if (result.sourceRevision !== plan.sourceRevision) return;
      const url = URL.createObjectURL(result.bytes); urls.add(url);
      const img = h('img', { src: url, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => { img.remove(); URL.revokeObjectURL(url); urls.delete(url); box.setAttribute('data-image-state', 'unavailable'); });
      box.setAttribute('data-image-state', 'available'); box.append(img);
    }).catch(() => { /* 占位已在 */ });
    return box;
  }

  const dishId = ctx.rest.split('/')[0] ?? '';
  const root = h('div', { class: 'dishes-page' });
  replace(el, root);

  if (dishId) { renderDetail(root, dishId); return; }
  renderList(root);

  function renderList(page: HTMLElement): void {
    const seen = new Set<string>();
    const entries: { haystack: string; node: HTMLElement }[] = [];
    for (const meal of meals) {
      if (seen.has(meal.dishRef)) continue;
      seen.add(meal.dishRef);
      const dish = own(projection.dishes, meal.dishRef);
      if (!dish) continue;
      const words = [...LANG_CODES.map(code => dish.name[code]), ...(dish.components ?? []).flatMap(c => LANG_CODES.map(code => own(projection.ingredients, c.ingredientRef)?.name[code]))];
      const main = mainNames(dish), name = pick(dish.name, lang), other = otherLanguageName(dish.name, lang);
      // Each card (and its picture) is built once; searching only shows or hides it.
      const node = h('li', {}, h('a', { class: 'dishes-card', href: dishHref(ctx, meal.dishRef) }, cover(meal.dishRef, dish),
        h('span', { class: 'dishes-name' }, name),
        other && other !== name ? h('span', { class: 'dishes-other muted' }, other) : null,
        main.length ? h('span', { class: 'dishes-main' }, `${t('main')}: ${main.join(' · ')}`) : null));
      entries.push({ haystack: words.filter(Boolean).join('\n').toLowerCase(), node });
    }
    const input = h('input', { type: 'search', class: 'dishes-search', placeholder: t('placeholder'), 'aria-label': t('search'), autocomplete: 'off' });
    const grid = h('ul', { class: 'dishes-grid' });
    const empty = h('p', { class: 'muted', role: 'status' });
    const paint = () => {
      const query = ((input as HTMLInputElement).value ?? '').trim().toLowerCase();
      const shown = entries.filter(entry => !query || entry.haystack.includes(query));
      replace(grid, ...shown.map(entry => entry.node));
      replace(empty, entries.length ? (shown.length ? null : t('noMatch')) : t('empty'));
    };
    input.addEventListener('input', paint);
    append(page, entries.length ? h('label', { class: 'dishes-searchbox' }, h('span', { class: 'sr-only' }, t('search')), input) : null, grid, empty);
    paint();
  }

  function renderDetail(page: HTMLElement, id: string): void {
    const back = h('a', { class: 'dishes-back', href: dishHref(ctx) }, `← ${t('back')}`);
    const dish = meals.some(meal => meal.dishRef === id) ? own(projection.dishes, id) : undefined;
    if (!dish) { page.append(back, h('p', { class: 'card', role: 'status', 'data-dishes-state': 'missing-dish' }, t('missingDish'))); return; }
    let section: 'ingredients' | 'method' = 'method';
    const body = h('div', { class: 'dishes-body' });
    const buttons = (['ingredients', 'method'] as const).map(key => {
      const button = h('button', { type: 'button', class: 'dishes-tab', 'aria-pressed': 'false' }, t(key));
      button.addEventListener('click', () => { section = key; paint(); });
      return [key, button] as const;
    });
    function ingredientsView(): HTMLElement {
      const rows = (dish!.components ?? []).map((component, componentIndex) => {
        const record = own(projection.ingredients, component.ingredientRef);
        const name = record ? pick(record.name, lang) || t('ingredientUnnamed') : t('ingredientMissing');
        const { amount, wording, unrecorded } = originalAmount(component, lang);
        // Every kind not said in the video, minus what the data has and what 「用量未录」 already says (D3 §4.4).
        const unsaid = unknownLine(unknownsAt(dish, { component: componentIndex }, ALL_KINDS, unrecorded ? ['amount'] : []), lang);
        // How to cut: technique and size; a technique id with no record says so; the recorded size and
        // the recipe's own preparation words stay visible either way.
        const prep = component.prep, technique = techniqueOf(prep?.techniqueRef), size = prep?.size?.trim();
        const cut = technique ? `${pick(technique.name, lang)}${size ? `${sizeSep(lang)}${size}` : ''}` : prep?.techniqueRef ? t('techniqueMissing') : '';
        const originalPrep = 'originalPreparation' in component && component.originalPreparation ? pick(component.originalPreparation, lang) : '';
        const note = pick(prep?.note, lang);
        return h('li', { class: 'dishes-row' },
          h('div', { class: 'dishes-row-top' }, h('span', { class: record ? 'dishes-row-name' : 'dishes-row-name missing' }, name),
            h('span', { class: 'dishes-row-qty' }, h('b', { class: 'num' }, amount),
              wording ? h('span', { class: 'dishes-row-wording muted' }, lang === 'zh' ? `（${wording}）` : ` (${wording})`) : null)),
          cut ? h('span', { class: technique ? 'dishes-row-cut' : 'dishes-row-cut missing' }, cut) : null,
          !technique && size ? h('span', { class: 'dishes-row-note' }, `${t('size')}: ${size}`) : null,
          originalPrep ? h('span', { class: 'dishes-row-note' }, `${t('original')}: ${originalPrep}`) : null,
          note ? h('span', { class: 'dishes-row-note muted' }, `${t('note')}: ${note}`) : null,
          unsaid ? h('span', { class: 'dishes-row-note', 'data-unknowns': 'component' }, unsaid) : null);
      });
      const whole = dishUnknownLine(unknownsAt(dish, 'dish', ALL_KINDS), lang);
      return h('div', {}, h('p', { class: 'muted dishes-servings' }, typeof dish!.baseServings === 'number' ? servingsLine(lang, dish!.baseServings) : t('noServings')),
        whole ? h('p', { class: 'dishes-servings', 'data-unknowns': 'dish' }, whole) : null,
        rows.length ? h('ul', { class: 'dishes-rows' }, ...rows) : h('p', { class: 'muted' }, t('noIngredients')));
    }
    function methodView(): HTMLElement {
      const explained = new Set<string>();
      const steps = (dish!.steps ?? []).map((step, index) => {
        // Steps carry no note of their own; the note is the referenced technique's, written where it first comes up.
        const technique = techniqueOf(step.techniqueRef);
        const tech = technique ? pick(technique.name, lang) : step.techniqueRef ? t('techniqueMissing') : '';
        const remark = technique && !explained.has(technique.id) ? pick(technique.note, lang) : '';
        if (technique) explained.add(technique.id);
        // Every kind on this step, heat, how long and doneness included: they are shown on the dish page only (D3 §3).
        const unsaid = unknownLine(unknownsAt(dish, { step: index }, ALL_KINDS), lang);
        return h('li', { class: 'dishes-step' }, h('span', { class: 'dishes-step-no num', 'aria-hidden': 'true' }, String(index + 1)),
          h('div', {}, h('p', { class: 'dishes-step-text' }, pick(step.text, lang)),
            tech ? h('p', { class: 'muted' }, `${t('technique')}: ${tech}`) : null, remark ? h('p', { class: 'muted' }, `${t('note')}: ${remark}`) : null,
            unsaid ? h('p', { class: 'dishes-step-unknowns', 'data-unknowns': 'step' }, unsaid) : null));
      });
      return steps.length ? h('ol', { class: 'dishes-steps' }, ...steps) : h('p', { class: 'muted' }, t('noSteps'));
    }
    function paint(): void {
      for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === section));
      replace(body, section === 'ingredients' ? ingredientsView() : methodView());
    }
    const others = LANG_CODES.filter(code => code !== lang).map(code => dish.name[code]).filter(name => name && name !== pick(dish.name, lang));
    page.append(back, h('div', { class: 'dishes-hero' }, cover(id, dish)),
      h('h2', { class: 'dishes-title' }, pick(dish.name, lang)), ...others.map(name => h('p', { class: 'dishes-other muted' }, name)),
      h('div', { class: 'dishes-tabs', role: 'group', 'aria-label': `${t('ingredients')} / ${t('method')}` }, ...buttons.map(([, button]) => button)), body);
    paint();
  }
}
