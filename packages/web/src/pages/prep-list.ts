/**
 * 备料页「要准备的」清单（D0 合同「四条线第一批」第 1 条）。
 * 只读已发布资料：不补数、不缩放。「已备」勾只存在本机 localStorage，只存编号和日期，不存菜名或配方内容。
 */
import type { I18nString, TeamMealsProjection } from '@canteenos/core';
import { h } from '../dom';
import { LANG_TAG, pick, type Lang } from '../i18n';
import { rawQuantityText, recordedAmountText, type FrozenMealRow } from './prep';
import { word } from './record-display';

export const PREP_DONE_KEY = 'canteenos.prep.done.v1';
const KEEP_DAYS = 7;
const SECTIONS = ['day-before', 'morning', 'before-service', 'unset', 'seasoning'] as const;
type Section = typeof SECTIONS[number];
type Shape = 'roll-cut' | 'cubes' | 'shreds' | 'slices' | 'minced' | 'strips';

const sectionName: Record<Section, readonly [string, string, string]> = {
  'day-before': ['前一天', 'The day before', 'Напередодні'],
  morning: ['当天早上', 'This morning', 'Сьогодні вранці'],
  'before-service': ['出餐前', 'Before service', 'Перед подачею'],
  unset: ['时机未录', 'Timing not recorded', 'Час не записано'],
  seasoning: ['调料 · 备在手边', 'Seasonings · keep at hand', 'Приправи · під рукою'],
};

/**
 * The six common cuts get a drawing. Git word-list techniques are known by id; techniques frozen from the
 * recipe library carry their own ids (kbt-…), so a cut technique with the same Chinese name gets the same drawing.
 */
const SHAPE_BY_ID: Record<string, Shape> = { 'roll-cut-chunks': 'roll-cut', 'small-cubes': 'cubes', 'fine-shreds': 'shreds', 'thin-slices': 'slices', minced: 'minced', strips: 'strips' };
const SHAPE_BY_NAME: Record<string, Shape> = { 滚刀块: 'roll-cut', 丁: 'cubes', 细丝: 'shreds', 薄片: 'slices', 末: 'minced', 条: 'strips' };
export function cutShape(technique: { id: string; kind?: string; name?: I18nString } | undefined): Shape | undefined {
  if (!technique) return undefined;
  if (Object.hasOwn(SHAPE_BY_ID, technique.id)) return SHAPE_BY_ID[technique.id];
  const zh = technique.name?.zh?.trim();
  return technique.kind === 'cut' && zh && Object.hasOwn(SHAPE_BY_NAME, zh) ? SHAPE_BY_NAME[zh] : undefined;
}
/** Line drawings in a 40×40 box; the stroke colour comes from prep.css. */
const SHAPE_PATHS: Record<Shape, string> = {
  'roll-cut': 'M6 26 L16 12 L26 22 L16 34 Z M20 30 L30 16 L36 24 L28 34 Z',
  cubes: 'M8 14 h9 v9 h-9 Z M21 14 h9 v9 h-9 Z M14 26 h9 v9 h-9 Z',
  shreds: 'M6 12 L34 12 M6 17 L34 17 M6 22 L34 22 M6 27 L34 27 M6 32 L34 32',
  slices: 'M8 28 L30 8 M12 32 L34 12 M16 36 L36 18',
  minced: 'M10 12 h3 v3 h-3 Z M22 10 h3 v3 h-3 Z M30 18 h3 v3 h-3 Z M14 24 h3 v3 h-3 Z M26 28 h3 v3 h-3 Z M8 33 h3 v3 h-3 Z',
  strips: 'M6 10 H34 V16 H6 Z M6 20 H34 V26 H6 Z M6 30 H34 V36 H6 Z',
};
function drawing(shape: Shape): HTMLElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', SHAPE_PATHS[shape]); path.setAttribute('fill', 'none');
  path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  const box = h('span', { class: 'prep-list-shape', 'aria-hidden': 'true', 'data-cut-shape': shape });
  box.appendChild(svg);
  return box;
}

// ---- 已备勾：只在本机 ----
let memoryDone: Record<string, string> = {};
const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cutoffOf = (now: Date) => dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - KEEP_DAYS));
const fresh = (marks: Record<string, string>, now: Date) => { const cutoff = cutoffOf(now); return Object.fromEntries(Object.entries(marks).filter(([, day]) => day >= cutoff)); };
/** Marks older than seven days are neither shown nor kept. Without usable storage the marks live in memory only. */
function readDone(now: Date): Record<string, string> {
  const storage = globalThis.localStorage;
  if (storage) {
    try {
      const raw = storage.getItem(PREP_DONE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      const clean: Record<string, string> = {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) clean[k] = v;
      memoryDone = clean;
    } catch { /* storage unavailable or unreadable: keep the in-memory copy */ }
  }
  return fresh(memoryDone, now);
}
function writeDone(next: Record<string, string>, now: Date): void {
  memoryDone = fresh(next, now);
  try { globalThis.localStorage?.setItem(PREP_DONE_KEY, JSON.stringify(memoryDone)); } catch { /* memory only */ }
}

export interface PrepListOptions {
  lang: Lang;
  projection: TeamMealsProjection;
  rows: readonly FrozenMealRow[];
  planId: string;
  timing: string;
  ingredientHref: (ingredientRef: string) => string;
  onOpen?: (mealIndex: number) => void;
  /** Tests only; the page reads the clock when a box is ticked. */
  now?: () => Date;
}

interface Item { key: string; section: Section; node: HTMLElement; done: boolean }

export function renderPrepList(o: PrepListOptions): HTMLElement {
  const { lang, projection } = o, clock = o.now ?? (() => new Date());
  const partner: Lang = lang === 'zh' ? 'uk' : 'zh';
  const w = (zh: string, en: string, uk: string) => word(lang, zh, en, uk);
  // Partner-language text only: no fallback chain, and nothing when it repeats the main text.
  const other = (name: I18nString | undefined, main: string): string | undefined => {
    const text = name?.[partner]?.trim();
    return text && text !== main ? text : undefined;
  };
  const partnerLine = (text: string | undefined) => text ? h('p', { class: 'prep-list-sub', lang: LANG_TAG[partner] }, text) : null;
  const done = readDone(clock());
  const items: Item[] = [];
  const notices: HTMLElement[] = [];
  const root = h('section', { class: 'prep-list', 'data-prep-list': '' });
  const count = h('span', { class: 'prep-list-count', 'data-prep-count': '' });
  root.append(h('div', { class: 'prep-list-head' },
    h('h2', {}, w('要准备的', 'What to prepare', 'Що підготувати')),
    h('p', { class: 'muted' }, w('怎么切、切多少', 'how to cut and how much', 'як нарізати і скільки')), count));
  const shown = () => items.filter(i => i.section === 'seasoning' || o.timing === 'all' || i.section === o.timing);
  // The size joins the cut name the way the cut name's own language writes it.
  const sizeSep = (l: Lang) => l === 'zh' ? '，' : ', ';

  const occurrences = new Map<string, number>();
  for (const row of o.rows) {
    const dish = row.dish;
    // Which time this dish appears in the meal: stable when other dishes are added or removed around it.
    const occurrence = occurrences.get(row.meal.dishRef) ?? 0;
    occurrences.set(row.meal.dishRef, occurrence + 1);
    if (!dish) { notices.push(h('p', { class: 'prep-list-notice', role: 'status' }, w('有一道菜的菜谱未找到 · 问师傅', 'A recipe for one dish is missing · ask the chef', 'Рецепт однієї страви не знайдено · спитайте шефа'))); continue; }
    const dishMain = pick(dish.name, lang) || w('菜谱未找到', 'Recipe missing', 'Рецепт не знайдено');
    if (!dish.components?.length) { notices.push(h('p', { class: 'prep-list-notice', role: 'status' }, `${dishMain}：${w('尚未录入配料 · 问师傅', 'ingredients not recorded · ask the chef', 'інгредієнти не записано · спитайте шефа')}`)); continue; }
    const dishOther = other(dish.name, dishMain);
    for (const [componentIndex, component] of dish.components.entries()) {
      const ingredient = Object.hasOwn(projection.ingredients, component.ingredientRef) ? projection.ingredients[component.ingredientRef] : undefined;
      const prep = component.prep;
      // A recipe-library dish keeps the role on its row; a shared standard ingredient record has none.
      const role = ('role' in component && component.role) || ingredient?.role;
      const timing = prep?.timing;
      const section: Section = role === 'seasoning' ? 'seasoning' : timing === 'day-before' || timing === 'morning' || timing === 'before-service' ? timing : 'unset';
      // Ids and positions only, never names or recipe content. The dish id is a fixed recipe version, so a
      // republished plan with another dish or version does not inherit this mark.
      const key = [o.planId, row.meal.date, row.meal.mealType, row.meal.dishRef, occurrence, componentIndex, component.ingredientRef].join('|');
      const technique = prep?.techniqueRef ? projection.techniques.find(t => t.id === prep.techniqueRef) : undefined;
      const main = ingredient ? pick(ingredient.name, lang) || w('食材名称未录', 'Ingredient name not recorded', 'Назву інгредієнта не записано') : w('食材资料未找到', 'Ingredient information unavailable', 'Дані інгредієнта недоступні');
      const forText = lang === 'uk' ? `Страва: ${dishMain}` : `${w('用于', 'For', '')} ${dishMain}`;
      const check = h('input', { type: 'checkbox', 'data-prep-done': key, 'aria-label': `${w('已备', 'Ready', 'Готово')}: ${main} · ${forText}` }) as HTMLInputElement;
      check.checked = Boolean(done[key]);
      const item: Item = { key, section, node: undefined as unknown as HTMLElement, done: check.checked };
      const name = h('a', { class: 'prep-list-name', href: o.ingredientHref(component.ingredientRef), 'data-ingredient-link': component.ingredientRef }, main);
      const mark = () => name.setAttribute('class', item.done ? 'prep-list-name done' : 'prep-list-name');
      mark();
      name.addEventListener('click', () => o.onOpen?.(row.mealIndex));
      check.addEventListener('change', () => {
        const now = clock(), next = readDone(now);
        if (check.checked) next[key] = dayOf(now); else delete next[key];
        writeDone(next, now);
        item.done = check.checked; mark();
        paintCount();
      });

      // How to cut: technique and size, or plain words when nothing is recorded; the recorded size and
      // original preparation stay visible either way.
      const size = prep?.size?.trim();
      const withSize = (text: string, l: Lang) => size ? `${text}${sizeSep(l)}${size}` : text;
      const originalPrep = 'originalPreparation' in component && component.originalPreparation ? pick(component.originalPreparation, lang) : '';
      const cut: (HTMLElement | null)[] = [];
      if (technique) {
        const shape = cutShape(technique), cutMain = pick(technique.name, lang);
        cut.push(h('p', { class: 'prep-list-cut' }, shape ? drawing(shape) : null, withSize(cutMain, lang)));
        const cutOther = other(technique.name, cutMain);
        cut.push(partnerLine(cutOther ? withSize(cutOther, partner) : undefined));
      } else {
        // Seasonings are kept at hand with a rough amount: with no cut recorded there is nothing to ask the chef.
        if (prep?.techniqueRef || section !== 'seasoning') cut.push(h('p', { class: 'prep-list-cut missing' }, prep?.techniqueRef ? w('技法资料未找到', 'Technique information unavailable', 'Дані техніки недоступні') : w('还没写怎么切 · 问师傅', 'No cut written yet · ask the chef', 'Як нарізати — ще не записано · спитайте шефа')));
        if (size) cut.push(h('p', { class: 'prep-list-note' }, `${w('大小', 'Size', 'Розмір')}: ${size}`));
      }
      if (originalPrep) cut.push(h('p', { class: 'prep-list-note' }, `${w('原方', 'Original', 'За рецептом')}: ${originalPrep}`));
      const note = prep?.note ? pick(prep.note, lang) : '';

      // How much: this meal's scaled amount; otherwise the original recipe amount, marked as such.
      const src = projection.collection.items.flatMap(entry => entry.sources.filter(s => (s.ingredientRef ?? entry.ingredientRef) === component.ingredientRef &&
        s.menuPlanRef === row.menuPlanRef && s.mealIndex === row.mealIndex && s.componentIndex === componentIndex &&
        s.date === row.meal.date && s.mealType === row.meal.mealType && s.dishRef === row.meal.dishRef))[0];
      const recorded = recordedAmountText(src?.originalAmount ?? ('originalAmount' in component ? component.originalAmount : undefined));
      const qty = component.qty;
      let amount: string, original = false, wording: string | undefined;
      if (src?.scaledQty) amount = rawQuantityText(src.scaledQty, lang);
      else if (qty?.unit === 'to-taste') { amount = rawQuantityText(qty, lang); wording = recorded && recorded !== '适量' ? recorded : undefined; }
      else if (qty?.value !== undefined) {
        amount = rawQuantityText(qty, lang); original = true;
        // "500 g" recorded for 500 g is the same amount in another language's words, not a different wording.
        const squash = (text: string) => text.replace(/\s+/g, '');
        const same = recorded !== undefined && (['zh', 'en', 'uk'] as const).some(code => squash(rawQuantityText(qty, code)) === squash(recorded));
        wording = recorded && !same ? recorded : undefined;
      }
      else if (recorded) { amount = recorded; original = true; }
      else amount = rawQuantityText(qty, lang);
      const quantity = h('span', { class: 'prep-list-qty' }, h('b', { class: 'num' }, amount),
        original ? h('small', { class: 'muted' }, w('原方', 'original', 'за рецептом')) : null,
        wording ? h('small', { class: 'muted prep-list-wording' }, wording) : null);

      const node = h('li', { class: 'prep-list-item', 'data-prep-item': key },
        h('label', { class: 'prep-list-check' }, check),
        h('div', { class: 'prep-list-body' },
          h('div', { class: 'prep-list-top' }, name, quantity),
          partnerLine(ingredient ? other(ingredient.name, main) : undefined),
          ...cut,
          note ? h('p', { class: 'prep-list-note' }, note) : null,
          h('p', { class: 'prep-list-for' }, forText),
          partnerLine(dishOther)));
      item.node = node; items.push(item);
    }
  }

  const paintCount = () => {
    const visible = shown(), ready = visible.filter(i => i.done).length;
    count.textContent = items.length ? w(`已备 ${ready} / ${visible.length}`, `${ready} of ${visible.length} ready`, `Готово ${ready} з ${visible.length}`) : '';
  };
  root.append(...notices);
  if (!items.length) {
    if (!notices.length) root.append(h('p', { class: 'muted', role: 'status' }, w('这一餐还没有要准备的材料', 'Nothing to prepare is recorded for this meal', 'Для цього прийому їжі ще не записано, що підготувати')));
    paintCount();
    return root;
  }
  const visible = new Set(shown());
  const hidden = o.timing === 'all' ? 0 : items.filter(i => i.section === 'unset' && !visible.has(i)).length;
  if (hidden) root.append(h('p', { class: 'muted prep-list-hidden', role: 'status' }, w(`另有 ${hidden} 项没写准备时机，选「全部时机」可以看到`, `${hidden} more without a preparation time: choose “All preparation times” to see them`, `Ще без часу підготовки: ${hidden}. Виберіть «Усі терміни підготовки», щоб їх побачити`)));
  for (const section of SECTIONS) {
    const inSection = items.filter(i => i.section === section && visible.has(i));
    if (!inSection.length) continue;
    const [zh, en, uk] = sectionName[section];
    root.append(h('section', { class: 'prep-list-section', 'data-prep-section': section },
      h('h3', { class: 'section-label' }, w(zh, en, uk)), h('ul', {}, ...inSection.map(i => i.node))));
  }
  paintCount();
  return root;
}
