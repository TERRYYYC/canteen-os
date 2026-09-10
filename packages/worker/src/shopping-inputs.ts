import type { AnyDish, AnyMenuPlan, Ingredient, ShoppingBasis, TeamMealInputs, Technique } from '@canteenos/core';
import type { GitHubClient } from './github.js';
import { fail } from './http.js';
import { parseSource } from './source.js';

/** Hydrate an already resolved basis from one immutable tree; never consult current head. */
export async function loadShoppingInputs(gh: GitHubClient, basis: ShoppingBasis, basisPath = '/basis'): Promise<TeamMealInputs> {
  const entries = await gh.getTree(basis.sourceRevision, true);
  const menuPlans: Record<string, AnyMenuPlan> = {};
  const dishes: Record<string, AnyDish> = {};
  const ingredients: Record<string, Ingredient> = {};
  let techniques: Technique[] = [];
  const selected = new Set(basis.selection.map(s => s.menuPlanRef));
  for (const entry of entries) {
    const match = /^data\/(menu-plans|dishes|ingredients)\/([a-z][a-z0-9-]*)\.json$/.exec(entry.path);
    if (!match && entry.path !== 'data/techniques.json') continue;
    const group = match?.[1];
    const id = match?.[2] ?? '';
    if (group === 'menu-plans' && !selected.has(id)) continue;
    if (entry.type !== 'blob' || entry.mode !== '100644') throw fail('invalid_source', { path: entry.path });
    const kind = group === 'menu-plans' ? 'plan' : group === 'dishes' ? 'dish' : group === 'ingredients' ? 'ingredient' : 'techniques';
    const value = parseSource(await gh.getBlobText(entry.sha), kind, entry.path);
    if (kind === 'plan') menuPlans[id] = value as AnyMenuPlan;
    else if (kind === 'dish') dishes[id] = value as AnyDish;
    else if (kind === 'ingredient') ingredients[id] = value as Ingredient;
    else techniques = value as Technique[];
  }
  for (const [index, selection] of basis.selection.entries()) {
    if (!Object.hasOwn(menuPlans, selection.menuPlanRef)) throw fail('basis_unavailable', { path: `${basisPath}/selection/${index}/menuPlanRef` });
  }
  return { menuPlans, dishes, ingredients, techniques };
}
