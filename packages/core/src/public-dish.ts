/** Public projection for both current and legacy frozen KB dishes. */
import type { AnyDish, ImageRef, KnowledgeProvenance } from './types.js';
import { completeKnowledgeImageRights } from './image-rights.js';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function legacyCoverState(provenance: KnowledgeProvenance): KnowledgeProvenance['coverState'] {
  const cover = provenance.evidence?.media?.find(item => item.role === 'cover' || item.selectedRole === 'cover');
  if (!cover) return 'needs-image';
  if (cover.publicationState === 'external-unpinned' || cover.publicationState === 'rights-pending' || cover.publicationState === 'unavailable') {
    return cover.publicationState;
  }
  if (typeof cover.url === 'string' && /^https?:\/\//i.test(cover.url)) return 'external-unpinned';
  if (!completeKnowledgeImageRights(cover.rights)) return 'rights-pending';
  return 'unavailable';
}

function publicImage(ref: ImageRef | undefined, dishRef: string): ImageRef | undefined {
  if (!ref || !completeKnowledgeImageRights(ref)) return undefined;
  // A legacy ImageRef may point at a private URL or another dish's file.
  // Only images pinned under this exact versioned dish can be published.
  const prefix = `${dishRef}/images/`, absolutePrefix = `data/dishes/${prefix}`;
  const name = ref.src.startsWith(prefix) ? ref.src.slice(prefix.length)
    : ref.src.startsWith(absolutePrefix) ? ref.src.slice(absolutePrefix.length) : '';
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(name) ? ref : undefined;
}

/** Never return raw KB source records, quotes, review notes, private media or unlicensed image refs. */
export function publicDish(dish: AnyDish, dishRef: string): AnyDish {
  const copy = clone(dish);
  if (copy.provenance?.source !== 'knowledge') return copy;
  const provenance = copy.provenance as KnowledgeProvenance;
  const legacy = provenance.evidence;
  if (provenance.sourceGapCount === undefined && legacy?.unresolved?.length) {
    provenance.sourceGapCount = legacy.unresolved.length;
  }
  if (!publicImage(copy.image, dishRef)) {
    if (copy.image && !provenance.coverState) provenance.coverState = 'rights-pending';
    delete copy.image;
  }
  if (!copy.image && !provenance.coverState) provenance.coverState = legacyCoverState(provenance);
  delete provenance.review;
  delete provenance.sourceUrl;
  delete provenance.evidence;
  for (const component of copy.components ?? []) {
    if ('originalText' in component) delete component.originalText;
    if (component.prep?.image && !publicImage(component.prep.image, dishRef)) delete component.prep.image;
  }
  for (const step of copy.steps ?? []) {
    if (step.image && !publicImage(step.image, dishRef)) delete step.image;
    // Knowledge videos remain in the private KB even when an old frozen step had a clip URL.
    delete step.clip;
  }
  return copy;
}
