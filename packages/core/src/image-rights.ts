export interface KnowledgeImageRights { license: string; author: string; sourceUrl?: string }
declare const URL: { new (value: string): { protocol: string; username: string; password: string } };

/** The publish pipeline accepts this exact set of image license labels. */
export function allowedImageLicense(value: unknown): value is string {
  return typeof value === 'string' && /^(own|CC0(?: 1\.0)?|Public domain|CC BY(?:-SA)?(?: [1-4]\.0)?)$/.test(value);
}

function sourceUrl(value: unknown, own: boolean): boolean {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u0020]/.test(value)) return false;
  if (own && !value.includes(':') && !value.startsWith('/') && !value.includes('\\') && !/[?#]/.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..')) return true;
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password; }
  catch { return false; }
}

/** Knowledge media need an explicit author even when older generic ImageRefs omitted one. */
export function completeKnowledgeImageRights(value: unknown): value is KnowledgeImageRights {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rights = value as Record<string, unknown>;
  return allowedImageLicense(rights.license) && typeof rights.author === 'string' &&
    Boolean(rights.author.trim()) && rights.author.length <= 500 && !/[\u0000-\u001f\u007f]/.test(rights.author) &&
    (rights.sourceUrl === undefined ? rights.license === 'own' : sourceUrl(rights.sourceUrl, rights.license === 'own'));
}
