import { newRecipe, type Recipe, type RecipeDetail, type Media, type Source, type Attempt } from '../../../api/knowledge';
import type { AuxiliaryEditHandle, AuxiliaryOperation } from '../../../view-models/reload-safety';
export interface Draft {
  key: string; recipe: Recipe; baseline: string; detail?: RecipeDetail; etag?: string;
  media: Media[]; sources: Source[]; pending: Record<string, string>; attempt?: Attempt;
  rightsChanged?: boolean; supportError?: unknown; workflow?: {dirty:boolean;busy:boolean;unknown:boolean};
  busy: boolean; unknown: boolean; conflict: boolean; error: string; notice: string;
  historyEpoch: number; lang?: 'zh' | 'en' | 'uk'; mount?: HTMLElement; repaint?: () => void; generation: number; registration: AuxiliaryEditHandle; ticket?: AuxiliaryOperation;
}
export function editable(recipe: Recipe): Recipe {
  const copy: Recipe = { title: recipe.title };
  for (const key of ['recipeFormatVersion', 'description', 'tags', 'baseServings', 'ingredients', 'steps', 'sources', 'assets'] as const) {
    if (recipe[key] !== undefined) Object.assign(copy, { [key]: recipe[key] });
  }
  return structuredClone(copy);
}
export function fresh(): Recipe { return newRecipe(); }
export function pending(draft: Draft): boolean { return Object.entries(draft.pending).some(([key, value]) => key !== 'assetKind' && value.trim()); }
export function dirty(draft: Draft): boolean { return JSON.stringify(draft.recipe) !== draft.baseline || pending(draft) || !!draft.rightsChanged || !!draft.workflow?.dirty; }
export function validate(recipe: Recipe): string | null {
  const named = (value: object | undefined) => Object.values(value || {}).some(v => typeof v === 'string' && v.trim());
  if (!named(recipe.title)) return 'title';
  if (recipe.baseServings !== undefined && (!Number.isSafeInteger(recipe.baseServings) || recipe.baseServings < 1)) return 'servings';
  for (const row of recipe.ingredients || []) {
    if (!named(row.name)) return 'ingredient';
    if (row.amount.kind === 'exact' && (!/^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$/.test(row.amount.value) || row.amount.value.length > 40 || !row.amount.unit.trim())) return 'amount';
    if (['to_taste', 'text'].includes(row.amount.kind) && !row.amount.raw?.trim()) return 'raw';
  }
  if (recipe.steps?.some(step => !named(step.text))) return 'step';
  for (const ref of recipe.assets || []) {
    if (ref.role === 'step' && !recipe.steps?.some(step => step.id === ref.stepId)) return 'asset-step';
    if (ref.clip && (!Number.isFinite(ref.clip.start) || !Number.isFinite(ref.clip.end) || ref.clip.start < 0 || ref.clip.end <= ref.clip.start)) return 'clip';
  }
  return null;
}
export function removeStep(recipe: Recipe, id: string): void {
  recipe.steps = recipe.steps?.filter(step => step.id !== id);
  recipe.assets = recipe.assets?.map(asset => {
    if (asset.stepId !== id) return asset;
    const next = { ...asset, role: 'reference' as const }; delete next.stepId; return next;
  });
}
