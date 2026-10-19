import { newRecipe, type Recipe, type RecipeDetail, type Media, type Source, type Attempt, type Amount, type Ingredient, type QtyUnit, type ValueSource } from '../../../api/knowledge';
import type { AuxiliaryEditHandle, AuxiliaryOperation } from '../../../view-models/reload-safety';
export interface Draft {
  key: string; recipe: Recipe; baseline: string; detail?: RecipeDetail; etag?: string;
  media: Media[]; sources: Source[]; pending: Record<string, string>; attempt?: Attempt;
  rightsChanged?: boolean; supportError?: unknown; workflow?: {dirty:boolean;busy:boolean;unknown:boolean};
  busy: boolean; unknown: boolean; conflict: boolean; error: string; notice: string;
  historyEpoch: number; lang?: 'zh' | 'en' | 'uk'; mount?: HTMLElement; repaint?: () => void; generation: number; registration: AuxiliaryEditHandle; ticket?: AuxiliaryOperation;
}
/** The whole revision document: fields this editor does not show (unknowns, later additions) go back unchanged. */
export function editable(recipe: Recipe): Recipe { return structuredClone(recipe); }
export function fresh(): Recipe { return newRecipe(); }
export function pending(draft: Draft): boolean { return Object.entries(draft.pending).some(([key, value]) => key !== 'assetKind' && value.trim()); }
export function dirty(draft: Draft): boolean { return JSON.stringify(draft.recipe) !== draft.baseline || pending(draft) || !!draft.rightsChanged || !!draft.workflow?.dirty; }
const decimal = /^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$/;
const positive = (value: string | undefined) => !!value && decimal.test(value) && value.length <= 40;
export const QTY_UNITS: readonly QtyUnit[] = ['g', 'kg', 'ml', 'l', 'pcs', 'pack', 'tbsp', 'tsp', 'pinch', 'to-taste'];
export function sourceComplete(source: ValueSource): boolean {
  if (source.kind === 'rule') return /^[a-z][a-z0-9-]*$/.test(source.ruleId);
  return !!source.by.trim() && /^\d{4}-\d{2}-\d{2}$/.test(source.date) && !Number.isNaN(Date.parse(source.date)) && new Date(source.date).toISOString().startsWith(source.date);
}
export function validate(recipe: Recipe): string | null {
  const named = (value: object | undefined) => Object.values(value || {}).some(v => typeof v === 'string' && v.trim());
  if (!named(recipe.title)) return 'title';
  if (recipe.baseServings !== undefined && (!Number.isSafeInteger(recipe.baseServings) || recipe.baseServings < 1)) return 'servings';
  for (const row of recipe.ingredients || []) {
    if (!named(row.name)) return 'ingredient';
    if (row.amount?.kind === 'exact' && (!positive(row.amount.value) || !row.amount.unit.trim())) return 'amount';
    if (row.amount && ['to_taste', 'text'].includes(row.amount.kind) && !row.amount.raw?.trim()) return 'raw';
    if (row.qty && (!QTY_UNITS.includes(row.qty.unit) || (row.qty.unit === 'to-taste' ? row.qty.value !== undefined : !positive(row.qty.value)))) return 'qty';
    if (!row.qty !== !row.qtySource || (row.qtySource && !sourceComplete(row.qtySource))) return 'qty-source';
    const lead = row.kitchenPrep?.leadTime;
    if (lead && (!positive(lead.value) || !['min', 'h', 'd'].includes(lead.unit))) return 'lead-time';
  }
  if (recipe.steps?.some(step => !named(step.text))) return 'step';
  for (const ref of recipe.assets || []) {
    if (ref.role === 'step' && !recipe.steps?.some(step => step.id === ref.stepId)) return 'asset-step';
    if (ref.clip && (!Number.isFinite(ref.clip.start) || !Number.isFinite(ref.clip.end) || ref.clip.start < 0 || ref.clip.end <= ref.clip.start)) return 'clip';
  }
  if (recipe.unknowns?.some(item => !placed(recipe, item))) return 'unknown-place';
  return null;
}
/** An unknown points at a step or row by ID; the KB rejects one whose step or row is gone. */
export function placed(recipe: Recipe, item: NonNullable<Recipe['unknowns']>[number]): boolean {
  return (!item.stepId || !!recipe.steps?.some(step => step.id === item.stepId)) && (!item.ingredientRowId || !!recipe.ingredients?.some(row => row.id === item.ingredientRowId));
}
/** Canteen use or a lead time only exists in format 3, so filling one in a legacy recipe upgrades it on save. */
export function canteenFormat(recipe: Recipe): boolean {
  return recipe.recipeFormatVersion === '3' || !!recipe.ingredients?.some(row => row.qty || row.qtySource || row.kitchenPrep?.leadTime);
}
/**
 * What a save sends (ADR-0012 §1, KB #182). On upgrade each legacy `amount` becomes the display-only original and never
 * `qty`: canteen use comes only from what the chef entered. Format 3 always names its unknowns, `[]` when none are left,
 * because the KB refuses a save that leaves them out instead of guessing (409 UNKNOWNS_REQUIRED, K7).
 */
export function saveBody(recipe: Recipe): Recipe {
  const body = structuredClone(recipe);
  if (!canteenFormat(body)) return body;
  body.recipeFormatVersion = '3';
  for (const row of body.ingredients || []) if (row.amount) { Object.assign(row, original(row.amount)); delete row.amount; }
  body.unknowns ??= [];
  return body;
}
// The unit words the KB importer also reads into `originalQty` (#182); anything else stays words only.
const ORIGINAL_UNITS = new Map<string, [QtyUnit, bigint?]>([['g', ['g']], ['克', ['g']], ['kg', ['kg']], ['千克', ['kg']], ['公斤', ['kg']], ['斤', ['g', 500n]], ['两', ['g', 50n]], ['ml', ['ml']], ['毫升', ['ml']], ['l', ['l']], ['升', ['l']], ['pcs', ['pcs']], ['个', ['pcs']], ['只', ['pcs']]]);
function original(amount: Amount): Pick<Ingredient, 'originalAmount' | 'originalQty'> {
  const words = amount.raw?.trim() ? amount.raw : amount.kind === 'exact' ? `${amount.value} ${amount.unit}` : '';
  if (!words) return {};
  const unit = amount.kind === 'exact' && positive(amount.value) ? ORIGINAL_UNITS.get(amount.unit.trim().toLowerCase()) ?? ORIGINAL_UNITS.get(amount.unit.trim()) : undefined;
  if (!unit || amount.kind !== 'exact') return { originalAmount: words };
  return { originalAmount: words, originalQty: { value: unit[1] ? times(amount.value, unit[1]) : amount.value, unit: unit[0] } };
}
/** Decimal string × whole number without floating point (1.5 斤 → 750 g). */
function times(value: string, factor: bigint): string {
  const [whole = '', fraction = ''] = value.split('.');
  const digits = (BigInt(whole + fraction) * factor).toString().padStart(fraction.length + 1, '0'), cut = digits.length - fraction.length;
  return fraction ? `${digits.slice(0, cut)}.${digits.slice(cut)}`.replace(/\.?0+$/, '') : digits;
}
export function removeStep(recipe: Recipe, id: string): void {
  recipe.steps = recipe.steps?.filter(step => step.id !== id);
  recipe.assets = recipe.assets?.map(asset => {
    if (asset.stepId !== id) return asset;
    const next = { ...asset, role: 'reference' as const }; delete next.stepId; return next;
  });
}
