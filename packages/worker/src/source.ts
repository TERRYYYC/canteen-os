import { planRangeError } from './plan-range.js';
import { fail } from './http.js';
import { validateEntity, VALIDATORS } from './validate.js';

export function parseSource(text: string, kind: keyof typeof VALIDATORS, path: string): unknown {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw fail('invalid_source', { path, message: '已存资料不是合法 JSON' }); }
  if (!validateEntity(kind, parsed).valid || (kind === 'plan' && planRangeError(parsed))) throw fail('invalid_source', { path });
  return parsed;
}

export function parseTranslationLock(text: string): Record<string, { status?: string; stale?: boolean }> {
  const path = 'data/translations.lock.json';
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw fail('invalid_source', { path }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw fail('invalid_source', { path });
  for (const value of Object.values(parsed)) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !['human', 'machine'].includes(value.status) ||
      (value.stale !== undefined && typeof value.stale !== 'boolean')) throw fail('invalid_source', { path });
  }
  return parsed as Record<string, { status?: string; stale?: boolean }>;
}
