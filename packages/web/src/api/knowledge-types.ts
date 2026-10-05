export type Lang = 'zh' | 'en' | 'uk';
export type I18n = Partial<Record<Lang, string>>;
export type Amount = { kind: 'unknown'; raw?: string } | { kind: 'exact'; value: string; unit: string; raw?: string } | { kind: 'to_taste' | 'text'; raw: string };
export interface Ingredient { id: string; name: I18n; ingredientId?: string; rawText?: string; role?: 'main' | 'seasoning' | 'unspecified'; amount: Amount; preparation?: I18n; kitchenPrep?: KitchenPrep }
export interface KitchenPrep {techniqueId?:string;timing?:'before-service'|'on-order';size?:string;note?:I18n}
export interface Step { id: string; text: I18n; techniqueId?:string }
export interface AssetRef { assetId: string; role: 'cover' | 'reference' | 'step'; stepId?: string; clip?: { start: number; end: number } }
export interface SourceRef { sourceId: string; evidence?: Record<string, unknown> }
export interface Recipe { recipeFormatVersion?: '2'; title: I18n; description?: I18n; tags?: string[]; baseServings?: number; ingredients?: Ingredient[]; steps?: Step[]; sources?: SourceRef[]; assets?: AssetRef[] }
export interface Media { rights?: {license: string; author?: string; sourceUrl?: string}; assetId: string; kind: string; url: string; status: string; role?: AssetRef['role']; stepId?: string; clip?: AssetRef['clip'] }
export interface Source { id: string; kind: 'web' | 'video' | 'text' | 'file'; title?: string; author?: string; url?: string; textContent?: string; assetId?: string }
export interface RecipeDetail { legacy?: unknown; id: string; version: number; recipe: Recipe; createdAt: string; updatedAt?: string; archivedAt?: string | null; media?: Media[]; sources?: Source[]; sourceRecords?: Source[] }
export interface SourceIllustration { assetId: string; role: 'ingredient' | 'step' | 'finished'; sourceStepId: string | null; caption?: I18n; rightsState: 'pending' | 'verified'; sourceRecordId?: string }
export interface SourceIllustrationLinks { recipeId: string; recipeVersion: number; candidateId: string | null; approvedCandidateVersion: number | null; illustrations: SourceIllustration[]; stepLinks: { sourceStepId: string; recipeStepId: string | null }[] }
export interface Summary { id: string; title: I18n; description?: I18n; tags?: string[]; version: number; updatedAt: string; cover?: Media }
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

export interface StandardIngredient { name:I18n;aliases?:string[];externalId?:string;baseUnit?:'g'|'ml'|'pcs';pcsToGram?:number;yield?:number;role?:'main'|'seasoning';trackStock?:boolean;onHand?:number;purchase?:{supplier:string;packSize:number;packUnit:string;minPacks?:number;lastPrice?:{amount:number;currency:'CNY'|'USD'|'UAH'|'EUR'}} }
export interface IngredientRevision {id:string;version:number;ingredient:StandardIngredient;createdAt:string}
export interface StandardTechnique {kind:'cut'|'heat'|'pretreat';name:I18n;note?:I18n}
export interface TechniqueRevision {id:string;version:number;technique:StandardTechnique;createdAt:string|null}
export interface KitchenApproval {approvalVersion:'1';status:'approved';recipeId:string;recipeVersion:number;origin:{kind:'favorite'|'manual'|'legacy';originalRecipeVersion:number;candidateId?:string};dependencies:{ingredients:IngredientRevision[];techniques:{id:string;version?:number;hash:string;technique:StandardTechnique}[]};reviewer:string;note:string;createdAt:string;approvalHash:string;unresolved?:unknown[]}
export interface Adoption {recipeId:string;recipeVersion:number;current:{version:number;archived:boolean};origin:KitchenApproval['origin'];source:{status:'approved'|'needs_review'};kitchenApproval:KitchenApproval|null;issues:string[]}
export interface ApprovalInput {reviewer:string;note:string;sourceConfirmed:boolean;ingredientVersions:Record<string,number>;techniqueVersions:Record<string,number>}
export interface Materialization {dishRef:string;recipeId:string;recipeVersion:number;commit:string;unchanged:boolean}
