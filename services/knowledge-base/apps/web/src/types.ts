export type Lang = 'zh' | 'en' | 'uk';
export type I18n = Partial<Record<Lang, string>>;
export type Amount = { kind: 'unknown'; raw?: string } | { kind: 'exact'; value: string; unit: string; raw?: string } | { kind: 'to_taste' | 'text'; raw: string };
export interface Ingredient { id: string; name: I18n; ingredientId?: string; rawText?: string; role?: 'main' | 'seasoning' | 'unspecified'; amount: Amount; preparation?: I18n; kitchenPrep?: {techniqueId?:string; timing?:'before-service'|'on-order';size?:string;note?:I18n} }
export interface Step { id: string; text: I18n; techniqueId?:string }
export interface AssetRef { assetId: string; role: 'cover' | 'reference' | 'step'; stepId?: string; clip?: { start: number; end: number } }
export interface SourceRef { sourceId: string; evidence?: Record<string, unknown> }
export interface Recipe { recipeFormatVersion?: '2'; title: I18n; description?: I18n; tags?: string[]; baseServings?: number; ingredients?: Ingredient[]; steps?: Step[]; sources?: SourceRef[]; assets?: AssetRef[] }
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
