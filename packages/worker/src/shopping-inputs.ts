import type { AnyDish, AnyMenuPlan, Ingredient, ShoppingBasis, TeamMealInputs, Technique } from '@canteenos/core';
import type { GitHubClient, TreeEntry } from './github.js';
import { fail } from './http.js';
import { parseSource } from './source.js';

export type ShoppingInputReader = (basis: ShoppingBasis, basisPath?: string) => Promise<TeamMealInputs>;

/** One request owns this cache of immutable trees/blobs, including its ref retry. */
export function createShoppingInputReader(gh: GitHubClient): ShoppingInputReader {
  const trees = new Map<string, TreeEntry[]>();
  const blobs = new Map<string, string>();
  return async (basis, basisPath = '/basis') => {
    let tree = trees.get(basis.sourceRevision);
    if (!tree) { tree = await gh.getTree(basis.sourceRevision, true); trees.set(basis.sourceRevision, tree); }
    return hydrate(tree, basis, basisPath, async sha => {
      let blob = blobs.get(sha);
      if (blob === undefined) { blob = await gh.getBlobText(sha); blobs.set(sha, blob); }
      return blob;
    });
  };
}

/** Hydrate an already resolved basis from one immutable tree; never consult current head. */
export async function loadShoppingInputs(gh: GitHubClient, basis: ShoppingBasis, basisPath = '/basis'): Promise<TeamMealInputs> {
  return createShoppingInputReader(gh)(basis, basisPath);
}

async function hydrate(entries: TreeEntry[], basis: ShoppingBasis, basisPath: string, blobText: (sha: string) => Promise<string>): Promise<TeamMealInputs> {
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
    const value = parseSource(await blobText(entry.sha), kind, entry.path);
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
