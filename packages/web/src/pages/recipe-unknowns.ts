/**
 * 视频里没说清的地方（ADR-0012 第 11 条；D3 设计 docs/design/recipe-unknowns/README.md §4）。
 * 备料清单、备料页下方的做法、菜品页三处都用这里的同一个判断：
 *   1. 资料里已经有值，就不显示（§4.1 的表；只看资料，三处结果一样）；
 *   2. 这一行页面上已经有等价提示，也不重复（由页面说明它这一行真的显示了哪句，不按缺字段去猜）。
 * 只决定显示不显示，不改资料。条目里只有类别和位置，没有原话；这里也不放任何后台入口。
 */
import type { AnyDish, RecipeUnknown, RecipeUnknownKind } from '@canteenos/core';
import type { Lang } from '../i18n';

/** Where an item points: one ingredient row, one step, or the whole dish (no position). */
export type UnknownPlace = { component: number } | { step: number } | 'dish';
/** A hint the page already shows on that row: 「还没写怎么切 · 问师傅」, or 「用量未录」 / the amount's own 「……问师傅」. */
export type PageHint = 'cut' | 'amount';

export const PREP_LIST_KINDS: readonly RecipeUnknownKind[] = ['cut-size', 'amount', 'net-or-gross', 'identity'];
export const PREP_LIST_SEASONING_KINDS: readonly RecipeUnknownKind[] = ['identity'];
export const PREP_STEP_KINDS: readonly RecipeUnknownKind[] = ['prep-ahead', 'cut-size', 'other'];
export const ALL_KINDS: readonly RecipeUnknownKind[] = ['prep-ahead', 'cut-size', 'amount', 'net-or-gross', 'identity', 'heat', 'duration', 'doneness', 'other'];

type Words = readonly [zh: string, en: string, uk: string];
/** §4.6 category words, in the order they are listed; prep-ahead takes its words from the action. */
const WORDS: Record<string, Words> = {
  'prep-ahead:marinate': ['腌多久', 'how long to marinate', 'скільки маринувати'],
  'prep-ahead:soak': ['泡多久', 'how long to soak', 'скільки замочувати'],
  'prep-ahead:brine': ['卤多久', 'how long to simmer in the spiced broth', 'скільки тушкувати в пряному відварі'],
  'prep-ahead:rest': ['醒多久', 'how long to rest the dough', 'скільки має відпочити тісто'],
  'prep-ahead:cool': ['晾多久', 'how long to cool', 'скільки остуджувати'],
  'prep-ahead:other': ['提前多久', 'how far ahead', 'за скільки часу наперед'],
  'cut-size': ['切多大', 'cut size', 'розмір нарізки'],
  amount: ['用量', 'how much', 'скільки класти'],
  'net-or-gross': ['毛重还是净重', 'weight before or after trimming', 'вага до чи після чищення'],
  identity: ['用哪种', 'which kind', 'який саме продукт'],
  heat: ['火候', 'heat level', 'який вогонь'],
  duration: ['做多久', 'how long to cook', 'скільки готувати'],
  doneness: ['做到什么样', 'when it is done', 'до якого стану'],
  other: ['还有别的', 'something else', 'ще дещо'],
};
const ORDER = Object.keys(WORDS);
/** What is done ahead, for the line at the top of the prep list: 要提前腌 / marinate ahead / треба замаринувати заздалегідь. */
const AHEAD: Record<string, Words> = {
  marinate: ['腌', 'marinate', 'замаринувати'],
  soak: ['泡', 'soak', 'замочити'],
  brine: ['卤', 'simmer in the spiced broth', 'потушкувати в пряному відварі'],
  rest: ['醒', 'rest the dough', 'дати тісту відпочити'],
  cool: ['晾凉', 'cool', 'остудити'],
};
const keyOf = (item: RecipeUnknown) => item.kind === 'prep-ahead' ? `prep-ahead:${item.action ?? 'other'}` : item.kind;
const pickWord = (words: Words, lang: Lang) => words[lang === 'zh' ? 0 : lang === 'en' ? 1 : 2];
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const list = (words: string[], lang: Lang) => words.join(lang === 'zh' ? '、' : ', ');

type Component = NonNullable<AnyDish['components']>[number];
const position = (value: number | undefined, length: number) => value === undefined || (Number.isSafeInteger(value) && value >= 0 && value < length);

/** The dish's items that point somewhere it has. An item past the last step or row is skipped, not an error (D3 §2.2). */
function itemsOf(dish: AnyDish): RecipeUnknown[] {
  const items = 'unknowns' in dish && Array.isArray(dish.unknowns) ? dish.unknowns : [];
  return items.filter(item => position(item.componentIndex, dish.components?.length ?? 0) && position(item.stepIndex, dish.steps?.length ?? 0));
}

/**
 * Step 1 (§4.1): the published data already holds what the item says is missing. Only a row's own fields count; an
 * item on a step or on the whole dish has no field to look at (the chef deletes it in the KB, K7).
 * - amount: the row has a number (qty.value).
 * - cut-size: the row has a size (prep.size).
 * - net-or-gross: the row has qty with its source; ADR-0012 §4 makes every qty net.
 * - prep-ahead: the row has how far ahead (prep.leadTime); prep.timing only says when, so it does not count.
 * - identity: the row is bound to a standard ingredient (canonicalIngredientId), which fixes the kind (#178 §2.2).
 */
export function settledByData(dish: AnyDish, item: RecipeUnknown): boolean {
  if (item.componentIndex === undefined) return false;
  const row = dish.components?.[item.componentIndex] as (Component & { qtySource?: unknown; canonicalIngredientId?: string; prep?: { leadTime?: unknown } }) | undefined;
  if (!row) return false;
  switch (item.kind) {
    case 'amount': return row.qty?.value !== undefined;
    case 'cut-size': return Boolean(row.prep?.size?.trim());
    case 'net-or-gross': return row.qty !== undefined && row.qtySource !== undefined;
    case 'prep-ahead': return row.prep?.leadTime !== undefined;
    case 'identity': return Boolean(row.canonicalIngredientId);
    default: return false;
  }
}

/** Step 2 (§4.1): only a hint the page really shows on that row stands in for the item. */
const saidByPage = (item: RecipeUnknown, hints: readonly PageHint[]) =>
  (item.kind === 'cut-size' && hints.includes('cut')) || (item.kind === 'amount' && hints.includes('amount'));

const at = (item: RecipeUnknown, place: UnknownPlace) =>
  place === 'dish' ? item.componentIndex === undefined && item.stepIndex === undefined
    : 'component' in place ? item.componentIndex === place.component
      // An item on a row belongs to the row; a step shows only the items that name no row.
      : item.stepIndex === place.step && item.componentIndex === undefined;

/** What to show at one place on one page: only `kinds`, minus what the data settles and what the page already says. One per word. */
export function unknownsAt(dish: AnyDish | undefined, place: UnknownPlace, kinds: readonly RecipeUnknownKind[], hints: readonly PageHint[] = []): RecipeUnknown[] {
  if (!dish) return [];
  const seen = new Set<string>();
  return itemsOf(dish)
    .filter(item => at(item, place) && kinds.includes(item.kind) && !settledByData(dish, item) && !saidByPage(item, hints))
    .sort((a, b) => ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b)))
    .filter(item => !seen.has(keyOf(item)) && Boolean(seen.add(keyOf(item))));
}

/** Every prep-ahead item of the dish, wherever it points, that the data does not settle (top of the prep list, §4.2). */
export function prepAheadOf(dish: AnyDish | undefined): RecipeUnknown[] {
  if (!dish) return [];
  const seen = new Set<string>();
  return itemsOf(dish).filter(item => item.kind === 'prep-ahead' && !settledByData(dish, item))
    .sort((a, b) => ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b)))
    .filter(item => !seen.has(keyOf(item)) && Boolean(seen.add(keyOf(item))));
}

const wordsOf = (items: readonly RecipeUnknown[], lang: Lang) => items.map(item => pickWord(WORDS[keyOf(item)] ?? WORDS.other!, lang));

/** 「腌多久没说 · 问师傅」, or several in one line: 「没说：腌多久、切多大 · 问师傅」 (§4.6). Empty when there is nothing to say. */
export function unknownLine(items: readonly RecipeUnknown[], lang: Lang): string {
  const words = wordsOf(items, lang);
  if (!words.length) return '';
  if (words.length === 1) {
    const one = words[0]!;
    return lang === 'zh' ? `${one}没说 · 问师傅` : lang === 'en' ? `${capital(one)} is not said · ask the chef` : `${capital(one)} — не сказано · спитайте шефа`;
  }
  return lang === 'zh' ? `没说：${list(words, lang)} · 问师傅` : lang === 'en' ? `Not said: ${list(words, lang)} · ask the chef` : `Не сказано: ${list(words, lang)} · спитайте шефа`;
}

/** The whole-dish line on the dish page: 「这道菜还有没说清的：用量、用哪种 · 问师傅」. */
export function dishUnknownLine(items: readonly RecipeUnknown[], lang: Lang): string {
  const words = wordsOf(items, lang);
  if (!words.length) return '';
  return lang === 'zh' ? `这道菜还有没说清的：${list(words, lang)} · 问师傅` : lang === 'en' ? `Also not clear in this dish: ${list(words, lang)} · ask the chef` : `У цій страві ще не уточнено: ${list(words, lang)} · спитайте шефа`;
}

/** One line per dish at the top of the prep list: 「示例菜：要提前腌，腌多久没说 · 问师傅」. */
export function prepAheadLine(dish: string, items: readonly RecipeUnknown[], lang: Lang): string {
  const actions = [...new Set(items.map(item => item.action ?? 'other'))];
  if (!actions.length) return '';
  if (actions.length > 1) {
    const words = list(wordsOf(items, lang), lang);
    return lang === 'zh' ? `${dish}：有几样要提前做，没说：${words} · 问师傅` : lang === 'en' ? `${dish}: some things are done ahead; not said: ${words} · ask the chef` : `${dish}: дещо роблять заздалегідь; не сказано: ${words} · спитайте шефа`;
  }
  const verb = AHEAD[actions[0]!];
  if (!verb) return lang === 'zh' ? `${dish}：有一步要提前做，提前多久没说 · 问师傅` : lang === 'en' ? `${dish}: one step is done ahead; how far ahead is not said · ask the chef` : `${dish}: один крок роблять заздалегідь; наскільки — не сказано · спитайте шефа`;
  const [zh, en, uk] = verb, said = wordsOf(items, 'zh')[0];
  return lang === 'zh' ? `${dish}：要提前${zh}，${said}没说 · 问师傅` : lang === 'en' ? `${dish}: ${en} ahead; how long is not said · ask the chef` : `${dish}: треба ${uk} заздалегідь; скільки — не сказано · спитайте шефа`;
}

/** Servings are not a kind (D3 §2.2): a missing baseServings is "not recorded", one line for the meal (§4.2). */
export function servingsUnrecordedLine(dishes: readonly string[], lang: Lang): string {
  if (!dishes.length) return '';
  const names = list([...dishes], lang);
  return lang === 'zh' ? `份数还没录：${names} · 标「原方」的量是原配方的量，这次备多少问师傅`
    : lang === 'en' ? `Servings not recorded yet: ${names} · amounts marked “original” are the original recipe’s; ask the chef how much to prepare`
      : `Кількість порцій ще не записано: ${names} · кількості з позначкою «за рецептом» — з оригінального рецепта; скільки готувати, спитайте шефа`;
}
