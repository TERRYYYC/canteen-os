export interface KnowledgeImageRights { license: string; author: string; sourceUrl?: string }
declare const URL: { new (value: string): { protocol: string; username: string; password: string; hostname: string; search: string; hash: string } };

/** The publish pipeline accepts this exact set of image license labels. */
export function allowedImageLicense(value: unknown): value is string {
  return typeof value === 'string' && /^(own|CC0(?: 1\.0)?|Public domain|CC BY(?:-SA)?(?: [1-4]\.0)?)$/.test(value);
}

function sourceUrl(value: unknown, own: boolean): boolean {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u0020]/.test(value)) return false;
  // Existing owned assets may cite a local source path. Keep that attribution
  // editable, while excluding traversal, encoded paths and private URL parts.
  if(own&&value.split('/').every(part=>/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)&&part!=='.'&&part!=='..'))return true;
  try { const parsed = new URL(value),host=parsed.hostname.toLowerCase();
    return parsed.protocol==='https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash &&
      host.includes('.') && !host.endsWith('.') && !host.startsWith('[') && !/^\d+(?:\.\d+){3}$/.test(host) &&
      host!=='localhost' && !/\.(?:localhost|local|internal|invalid|test)$/.test(host);
  }
  catch { return false; }
}

/** Knowledge media need an explicit author even when older generic ImageRefs omitted one. */
export function completeKnowledgeImageRights(value: unknown): value is KnowledgeImageRights {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rights = value as Record<string, unknown>;
  return allowedImageLicense(rights.license) && typeof rights.author === 'string' &&
    Boolean(rights.author.trim()) && rights.author.length <= 500 && !/[\u0000-\u001f\u007f]/.test(rights.author) &&
    (rights.sourceUrl === undefined ? rights.license === 'own' : sourceUrl(rights.sourceUrl,rights.license === 'own'));
}
