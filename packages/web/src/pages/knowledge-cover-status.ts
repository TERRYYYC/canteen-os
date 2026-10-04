import type { AnyDish } from '@canteenos/core';

export type KnowledgeCoverState = 'not-recorded' | 'needs-image' | 'rights-pending' | 'external-unpinned' | 'unavailable';

/** Frozen dishes expose only a publish-safe state, never source media metadata. */
export function knowledgeCoverState(dish: AnyDish | undefined): KnowledgeCoverState {
  if (dish?.provenance?.source !== 'knowledge') return 'not-recorded';
  return dish.provenance.coverState ?? 'needs-image';
}
