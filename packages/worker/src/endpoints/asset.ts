import type { Ctx } from '../context.js';
import { githubClient } from '../context.js';
import { fail } from '../http.js';
import { resolveRevision } from '../revision.js';
import { inspectImage } from '../image-integrity.js';
import { parseSource } from '../source.js';

const OWNER = /^data\/(ingredients|dishes)\/[a-z][a-z0-9-]*\.json$/;
const IMAGE = /^data\/(ingredients|dishes)\/(?:[a-z][a-z0-9-]*\.(?:jpg|png|webp)|[a-z][a-z0-9-]*(?:\/images)?\/[a-z][a-z0-9-]*\.(?:jpg|png|webp))$/;

/** Resolves only a schema ImageRef belonging to an owner at the captured commit. */
export async function handleAsset(ctx: Ctx): Promise<Response> {
  const gh = githubClient(ctx);
  const revision = await resolveRevision(gh, await gh.getHeadSha(), ctx.url.searchParams.get('revision'));
  const owner = ctx.url.searchParams.get('owner') ?? '';
  const pointer = ctx.url.searchParams.get('pointer') ?? '';
  const ownerMatch = OWNER.exec(owner);
  const kind = owner === 'data/techniques.json' ? 'techniques' : ownerMatch?.[1] === 'dishes' ? 'dish' : ownerMatch ? 'ingredient' : null;
  if (!kind) throw fail('asset_unavailable');
  const index = '(?:0|[1-9][0-9]*)';
  const validPointer = kind === 'techniques' ? new RegExp(`^/${index}/image$`).test(pointer)
    : pointer === '/image' || (kind === 'dish' && new RegExp(`^/(?:components/${index}/prep|steps/${index})/image$`).test(pointer));
  if (!validPointer) throw fail('asset_unavailable');
  const entries = await gh.getTree(revision, true);
  const ownerEntry = entries.find(e => e.path === owner);
  if (!ownerEntry || ownerEntry.type !== 'blob' || ownerEntry.mode !== '100644') throw fail('asset_unavailable');
  let ref = parseSource(await gh.getBlobText(ownerEntry.sha), kind, owner);
  for (const segment of pointer.slice(1).split('/')) {
    if (!ref || typeof ref !== 'object' || !Object.hasOwn(ref, segment)) throw fail('asset_unavailable');
    ref = (ref as Record<string, unknown>)[segment];
  }
  const src = (ref as { src?: unknown } | null)?.src;
  if (typeof src !== 'string') throw fail('asset_unavailable');
  if (/^https?:\/\//i.test(src)) throw fail('external_asset_unpinned');
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/') || /[\\%?#\x00-\x20\x7f]/.test(src)) throw fail('asset_unavailable');
  const parts = (src.startsWith('data/') ? src : `${owner.slice(0, owner.lastIndexOf('/'))}/${src}`).split('/');
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === '..') { if (normalized.length <= 1) throw fail('asset_unavailable'); normalized.pop(); }
    else if (part !== '.' && part !== '') normalized.push(part);
  }
  const path = normalized.join('/');
  if (!IMAGE.test(path)) throw fail('asset_unavailable');
  const asset = entries.find(e => e.path === path);
  if (!asset || asset.type !== 'blob' || asset.mode !== '100644') throw fail('asset_unavailable');
  const bytes = await gh.getBlobBytes(asset.sha);
  const info = inspectImage(bytes);
  if (!info || !path.endsWith(`.${info.ext}`)) throw fail('asset_unavailable');
  const type = path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return new Response(bytes as BodyInit, { headers: {
    'Content-Type': type, 'X-Source-Revision': revision,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}
