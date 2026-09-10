import type { ShoppingList } from '@canteenos/core';
import type { GitHubClient } from './github.js';
import { resolveRevision } from './revision.js';

/** Validate every explicit revision, including history the requested edit removes. */
export async function resolveListRevisions(gh: GitHubClient, head: string, list: ShoppingList): Promise<void> {
  const revisions = new Set([list.basis.sourceRevision]);
  for (const item of list.items) if (item.previous) revisions.add(item.previous.basis.sourceRevision);
  for (const revision of revisions) await resolveRevision(gh, head, revision, 'basis_unavailable');
}
