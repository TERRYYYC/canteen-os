export type Lang = 'zh' | 'en' | 'uk';
export type I18n = Partial<Record<Lang, string>>;
export type Amount = { kind: 'unknown'; raw?: string } | { kind: 'exact'; value: string; unit: string; raw?: string } | { kind: 'to_taste' | 'text'; raw: string };
// recipeFormatVersion 3 (ADR-0012): a row has no single amount. The original words/number are display-only;
// the canteen quantity is what procurement uses, and it always carries its source.
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'pcs' | 'pack' | 'tbsp' | 'tsp' | 'pinch' | 'to-taste';
/** unit is '' only while a person is still filling the row in; validation blocks saving it. */
export interface Quantity { value?: string; unit: Unit | '' }
export type ValueSource = { kind: 'measured' | 'specified'; by: string; date: string } | { kind: 'rule'; ruleId: string };
export interface LeadTime { value: string; unit: 'min' | 'h' | 'd' }
export type UnknownKind = 'prep-ahead' | 'amount' | 'net-or-gross' | 'cut-size' | 'identity' | 'heat' | 'duration' | 'doneness' | 'other';
export type PrepAheadAction = 'marinate' | 'soak' | 'brine' | 'rest' | 'cool' | 'other';
export interface RecipeUnknown { kind?: UnknownKind; action?: PrepAheadAction; stepId?: string; ingredientRowId?: string; text: string }
export interface Ingredient { id: string; name: I18n; ingredientId?: string; rawText?: string; role?: 'main' | 'seasoning' | 'unspecified'; amount?: Amount; preparation?: I18n; kitchenPrep?: {techniqueId?:string; timing?:'day-before'|'morning'|'before-service';size?:string;note?:I18n;leadTime?:LeadTime};
  originalAmount?: string; originalQty?: Quantity; qty?: Quantity; qtySource?: ValueSource }
export interface Step { id: string; text: I18n; techniqueId?:string }
export interface AssetRef { assetId: string; role: 'cover' | 'reference' | 'step'; stepId?: string; clip?: { start: number; end: number } }
export interface SourceRef { sourceId: string; evidence?: Record<string, unknown> }
export interface Recipe { recipeFormatVersion?: '2' | '3'; unknowns?: RecipeUnknown[]; title: I18n; description?: I18n; tags?: string[]; baseServings?: number; ingredients?: Ingredient[]; steps?: Step[]; sources?: SourceRef[]; assets?: AssetRef[] }
export interface Media { assetId: string; kind: string; url: string; status: string; role?: AssetRef['role']; stepId?: string; clip?: AssetRef['clip'] }
export interface Source { id: string; kind: 'web' | 'video' | 'text' | 'file'; title?: string; author?: string; url?: string; textContent?: string; assetId?: string }
export interface RecipeDetail { id: string; version: number; recipe: Recipe; createdAt: string; updatedAt?: string; archivedAt?: string | null; media?: Media[]; sources?: Source[]; sourceRecords?: Source[] }
export interface Summary { id: string; title: I18n; description?: I18n; tags?: string[]; version: number; updatedAt: string }
export interface RecipeList { items: Summary[]; nextCursor: string | null }
export interface Revision { version: number; createdAt: string }
export const label = (value?: I18n) => value?.zh || value?.en || value?.uk || '';
export const newRecipe = (): Recipe => ({ title: {}, tags: [], ingredients: [], steps: [], sources: [], assets: [] });
export function localized(value: I18n | undefined, lang: Lang, text: string): I18n {
  const copy = { ...value };
  if (text.trim()) copy[lang] = text;
  else delete copy[lang];
  return copy;
}
export function httpUrl(value?: string): string | null {
  if (!value) return null;
  try { const u = new URL(value, window.location.origin); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
