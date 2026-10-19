/** ADR-0012 in the chef editor: canteen use with its source, the original for reference, and what the video left unclear. */
import { h } from '../../../dom';
import type { Lang } from '../../../i18n';
import type { I18n, Ingredient, Qty, Recipe, StandardIngredient, ValueSource, UnknownKind, PrepAheadAction } from '../../../api/knowledge';
import { button, field, input, select, section, type Words } from './ui';
import { placed } from './model';
type Choice = StandardIngredient & { id: string; version: number };
const pick = (value: I18n | undefined, lang: Lang) => value?.[lang] || value?.zh || value?.en || value?.uk || '';
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const quantity = (qty: Qty, t: Words) => qty.unit === 'to-taste' ? t('适量', 'to taste', 'за смаком') : `${qty.value ?? ''} ${qty.unit}`.trim();

/** Display only: never edited here and never counted (ADR-0012 §1). */
export function originalLine(row: Ingredient, t: Words): HTMLElement {
  const words = row.originalAmount?.trim(), qty = row.originalQty ? quantity(row.originalQty, t) : '';
  return h('p', { class: 'kb-original', 'data-testid': 'original-amount' }, h('strong', {}, t('原方 · 只作参考', 'Original · reference only', 'За рецептом · лише для довідки')), t('：', ': ', ': '),
    words || qty || t('没写用量', 'No amount given', 'Кількість не вказано'), words && qty && qty !== words ? t(`（${qty}）`, ` (${qty})`, ` (${qty})`) : '');
}

/** Who and when for weighed or set values (a real name is fine in the private library); a rule cites its ID. */
export function sourceFields(legend: string, get: () => ValueSource | undefined, set: (source: ValueSource | undefined) => void, t: Words, changed: (repaint?: boolean) => void): HTMLElement {
  const source = get();
  const kind = select(source?.kind || '', [['', t('还没写', 'Not recorded', 'Не записано')], ['measured', t('实称：称过', 'Weighed', 'Зважено')], ['specified', t('指定：没称，师傅定的数', 'Set by the chef, not weighed', 'Задано шефом, без зважування')], ['rule', t('按规则', 'By a rule', 'За правилом')]], next => {
    const previous = get();
    if (next === 'rule') set({ kind: 'rule', ruleId: previous?.kind === 'rule' ? previous.ruleId : '' });
    else if (next === 'measured' || next === 'specified') set({ kind: next, by: previous && previous.kind !== 'rule' ? previous.by : '', date: previous && previous.kind !== 'rule' ? previous.date : '' });
    else set(undefined);
    changed(true);
  });
  const box = h('fieldset', { class: 'kb-source' }, h('legend', {}, legend), field(t('出处', 'Source', 'Джерело'), kind));
  if (source?.kind === 'rule') box.append(field(t('规则编号', 'Rule ID', 'Номер правила'), input(source.ruleId, text => { source.ruleId = text.trim(); changed(); })));
  else if (source) {
    const date = input(source.date, text => { source.date = text.trim(); changed(); }); date.setAttribute('type', 'date');
    box.append(h('div', { class: 'kb-grid' }, field(t('谁', 'Who', 'Хто'), input(source.by, text => { source.by = text; changed(); })), field(t('哪天', 'Date', 'Дата'), date)));
  }
  return box;
}

/** #178 §5.1: only an exact match of the name without brackets to exactly one standard; names never bind by themselves. */
const bare = (name: string) => name.replace(/[（(【[][^）)】\]]*[）)】\]]/g, '').trim();
export function suggestion(row: Ingredient, items: Choice[]): Choice | undefined {
  const names = new Set(Object.values(row.name).map(name => bare(name || '')).filter(Boolean));
  const hits = items.filter(item => [...Object.values(item.name), ...(item.aliases || [])].some(name => !!name && names.has(bare(name))));
  return hits.length === 1 ? hits[0] : undefined;
}
export const nameUnsure = (row: Ingredient) => Object.values(row.name).some(name => /待核|†/.test(name || ''));
export function standardLabel(item: Choice, lang: Lang, t: Words): string {
  const name = pick(item.name, lang), also = (item.aliases || []).filter(alias => alias && alias !== name);
  return also.length ? t(`${name}（也叫：${also.join('、')}）`, `${name} (also: ${also.join(', ')})`, `${name} (інші назви: ${also.join(', ')})`) : name;
}
/** Suggested first; the empty choice keeps the row on its own line in the shopping list. */
export function standardOptions(row: Ingredient, items: Choice[], lang: Lang, t: Words): [string, string][] {
  const suggested = row.ingredientId ? undefined : suggestion(row, items);
  const unsure = suggested && nameUnsure(row) ? t(' · 名称待核，先看原话', ' · Name unclear; check the original wording first', ' · Назва неточна; спершу перевірте оригінал') : '';
  return [
    ...(suggested ? [[suggested.id, t(`按名字建议：${pick(suggested.name, lang)}，还没选`, `Suggested by name: ${pick(suggested.name, lang)}, not chosen yet`, `Пропозиція за назвою: ${pick(suggested.name, lang)}, ще не вибрано`) + unsure] as [string, string]] : []),
    ['', t('不绑定：采购单上单独一行', 'Not linked: its own line in the shopping list', 'Без прив’язки: окремий рядок у списку закупівлі')],
    ...items.filter(item => item !== suggested).map(item => [item.id, standardLabel(item, lang, t)] as [string, string]),
    ...(row.ingredientId && !items.some(item => item.id === row.ingredientId) ? [[row.ingredientId, t('已选，正在读取', 'Chosen; loading', 'Вибрано; завантаження')] as [string, string]] : []),
  ];
}

// #177 §4.6 category words; the Ukrainian is still a draft for the kitchen helper to read.
const KIND: Record<UnknownKind, [string, string, string]> = {
  'prep-ahead': ['提前多久', 'how far ahead', 'за скільки часу наперед'], amount: ['用量', 'how much', 'скільки класти'],
  'net-or-gross': ['毛重还是净重', 'weight before or after trimming', 'вага до чи після чищення'], 'cut-size': ['切多大', 'cut size', 'розмір нарізки'],
  identity: ['用哪种', 'which kind', 'який саме продукт'], heat: ['火候', 'heat level', 'який вогонь'], duration: ['做多久', 'how long to cook', 'скільки готувати'],
  doneness: ['做到什么样', 'when it is done', 'до якого стану'], other: ['还有别的', 'something else', 'ще дещо'],
};
const ACTION: Record<PrepAheadAction, [string, string, string]> = {
  marinate: ['腌多久', 'how long to marinate', 'скільки маринувати'], soak: ['泡多久', 'how long to soak', 'скільки замочувати'],
  brine: ['卤多久', 'how long to simmer in the spiced broth', 'скільки тушкувати в пряному відварі'], rest: ['醒多久', 'how long to rest the dough', 'скільки має відпочити тісто'],
  cool: ['晾多久', 'how long to cool', 'скільки остуджувати'], other: ['提前多久', 'how far ahead', 'за скільки часу наперед'],
};
export function unknownTitle(item: NonNullable<Recipe['unknowns']>[number], t: Words): string {
  const words = item.kind === 'prep-ahead' && item.action ? ACTION[item.action] : item.kind ? KIND[item.kind] : undefined;
  if (!words) return t('还没分类', 'Not sorted yet', 'Ще не класифіковано');
  return t(`${words[0]}没说`, `${capital(words[1])}: not said`, `${capital(words[2])} — не сказано`);
}

/** K7: the chef deletes an item once it is clear; writing a value never deletes one. Deleting the last leaves `[]`. */
export function unknownsPanel(recipe: Recipe, lang: Lang, t: Words, changed: (repaint?: boolean) => void): HTMLElement | null {
  if (recipe.recipeFormatVersion !== '3' && !recipe.unknowns) return null;
  const items = recipe.unknowns || [];
  const where = (item: (typeof items)[number]) => {
    if (!placed(recipe, item)) return t('已删掉的材料或步骤', 'A removed ingredient or step', 'Вилучений інгредієнт або крок');
    if (item.stepId) { const n = (recipe.steps || []).findIndex(step => step.id === item.stepId) + 1; return t(`第 ${n} 步`, `Step ${n}`, `Крок ${n}`); }
    if (item.ingredientRowId) { const name = pick(recipe.ingredients?.find(row => row.id === item.ingredientRowId)?.name, lang); return t(`材料：${name}`, `Ingredient: ${name}`, `Інгредієнт: ${name}`); }
    return t('整道菜', 'Whole dish', 'Уся страва');
  };
  const panel = section(t('视频里没说清的地方', 'Unclear in the video', 'Неясно у відео'), h('p', { class: 'kb-muted' }, t('只给师傅看。问清以后，先在上面写上数，再删掉这一条；不会自动删。', 'Only chefs see this. Once it is clear, write the value above, then delete the item. Nothing is deleted for you.', 'Бачать лише шефи. Коли з’ясуєте, впишіть значення вище, потім видаліть пункт. Самі пункти не зникають.')));
  panel.setAttribute('data-testid', 'recipe-unknowns');
  if (!items.length) panel.append(h('p', {}, t('这一版没有没说清的地方。', 'Nothing is unclear in this version.', 'У цій версії немає неясних місць.')));
  else panel.append(h('ul', { class: 'kb-unknowns' }, ...items.map((item, index) => h('li', { 'data-testid': 'recipe-unknown' },
    h('strong', {}, unknownTitle(item, t)), ` · ${where(item)}`,
    h('details', {}, h('summary', {}, t('原话（只给师傅看）', 'Original words (chefs only)', 'Оригінальні слова (лише для шефів)')), h('p', {}, item.text)),
    button(t('删掉这一条', 'Delete this item', 'Видалити пункт'), () => { items.splice(index, 1); recipe.unknowns = items; changed(true); })))));
  return panel;
}
