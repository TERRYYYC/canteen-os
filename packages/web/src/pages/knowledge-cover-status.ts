import type { AnyDish } from '@canteenos/core';

export type KnowledgeCoverState = 'not-recorded' | 'needs-image' | 'rights-pending' | 'external-unpinned' | 'unavailable';

/** Source media is evidence only. Never treat its URL as a published recipe image. */
export function knowledgeCoverState(dish: AnyDish | undefined): KnowledgeCoverState {
  if (dish?.provenance?.source !== 'knowledge') return 'not-recorded';
  const covers = dish.provenance.evidence?.media?.filter(item => item.kind === 'image' && (item.selectedRole === 'cover' || item.role === 'cover')) ?? [];
  if (!covers.length) return 'needs-image';
  if (covers.some(item => typeof item.url === 'string' && /^https?:\/\//i.test(item.url))) return 'external-unpinned';
  if (covers.some(item => !item.rights || typeof item.rights !== 'object' || !('license' in item.rights))) return 'rights-pending';
  return 'unavailable';
}
