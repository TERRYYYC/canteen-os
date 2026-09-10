import { fail } from './http.js';

const IMAGE = /^data\/(ingredients|dishes)\/(?:[a-z][a-z0-9-]*\.(?:jpg|png|webp)|[a-z][a-z0-9-]*(?:\/images)?\/[a-z][a-z0-9-]*\.(?:jpg|png|webp))$/;

/** Resolve a local ImageRef; HTTP(S) metadata has no pinned local asset. */
export function localAssetPath(owner: string, src: string): string | null {
  if (/^https?:\/\//i.test(src)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/') || /[\\%?#\x00-\x20\x7f]/.test(src)) throw fail('asset_unavailable');
  const parts = (src.startsWith('data/') ? src : `${owner.slice(0, owner.lastIndexOf('/'))}/${src}`).split('/');
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === '..') { if (normalized.length <= 1) throw fail('asset_unavailable'); normalized.pop(); }
    else if (part !== '.' && part !== '') normalized.push(part);
  }
  const path = normalized.join('/');
  if (!IMAGE.test(path)) throw fail('asset_unavailable');
  return path;
}
