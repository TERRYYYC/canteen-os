import { createShoppingList, normalizeSelection } from '@canteenos/core';
import type { ShoppingBasis, ShoppingList, TeamMealInputs } from '@canteenos/core';
import type { GitHubClient } from './github.js';
import { fail } from './http.js';
import { stableSerialize } from './serialize.js';
import { resolveListRevisions } from './shopping-basis.js';
import { loadShoppingInputs } from './shopping-inputs.js';

export const sameValue = (a: unknown, b: unknown): boolean => stableSerialize(a) === stableSerialize(b);
const normalizedBasis = (basis: ShoppingBasis): ShoppingBasis => ({ ...basis, selection: normalizeSelection(basis.selection) });
export function normalizeList(list: ShoppingList): ShoppingList {
  return { ...list, basis: normalizedBasis(list.basis), items: list.items.map(item => ({ ...item,
    ...(item.previous ? { previous: { ...item.previous, basis: normalizedBasis(item.previous.basis) } } : {}),
  })).sort((a, b) => a.ingredientRef.localeCompare(b.ingredientRef, 'en')) };
}

/** Exact candidates are owned by core; this adapter only locates malformed rows. */
export function assertCandidates(list: ShoppingList, expected: ShoppingList, code: 'invalid_source' | 'invalid_selection'): void {
  const expectedIds = new Set(expected.items.map(item => item.ingredientRef));
  const found = new Set<string>();
  for (const [index, item] of list.items.entries()) {
    if (found.has(item.ingredientRef) || !expectedIds.has(item.ingredientRef)) throw fail(code, { path: `/items/${index}/ingredientRef` });
    found.add(item.ingredientRef);
  }
  if (found.size !== expectedIds.size) throw fail(code, { path: '/items' });
}

/** Stored previous bases are validated even when the next request removes them. */
export async function validateStoredList(gh: GitHubClient, head: string, list: ShoppingList, id: string): Promise<TeamMealInputs> {
  if (list.id !== id) throw fail('invalid_source', { path: '/id' });
  await resolveListRevisions(gh, head, list);
  const inputs = await loadShoppingInputs(gh, list.basis);
  assertCandidates(list, createShoppingList(id, list.basis, inputs), 'invalid_source');
  const loaded = new Map<string, TeamMealInputs>([[stableSerialize(list.basis), inputs]]);
  for (const [index, item] of list.items.entries()) {
    if (!item.previous) continue;
    const basis = item.previous.basis;
    const key = stableSerialize(basis);
    let previousInputs = loaded.get(key);
    if (!previousInputs) {
      previousInputs = await loadShoppingInputs(gh, basis, `/items/${index}/previous/basis`);
      loaded.set(key, previousInputs);
    }
    if (!createShoppingList(id, basis, previousInputs).items.some(candidate => candidate.ingredientRef === item.ingredientRef)) {
      throw fail('invalid_source', { path: `/items/${index}/previous` });
    }
  }
  return inputs;
}
