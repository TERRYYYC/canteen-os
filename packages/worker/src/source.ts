import { planRangeError } from './plan-range.js';
import { fail } from './http.js';
import { validateEntity, VALIDATORS } from './validate.js';

export function parseSource(text: string, kind: keyof typeof VALIDATORS, path: string, detailed = false): unknown {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw fail('invalid_source', { path, message: '已存资料不是合法 JSON' }); }
  const result = validateEntity(kind, parsed, detailed);
  if (!result.valid) throw fail('invalid_source', { path: detailed ? `${path}#${result.errors[0]?.path ?? ''}` : path });
  const rangeError = kind === 'plan' ? planRangeError(parsed) : null;
  if (rangeError) throw fail('invalid_source', { path: detailed ? `${path}#${rangeError}` : path });
  return parsed;
}

export function parseTranslationLock(text: string, detailed = false): Record<string, { status?: string; stale?: boolean }> {
  const path = 'data/translations.lock.json';
  const invalid = (pointer: string) => fail('invalid_source', { path: detailed ? `${path}#${pointer}` : path });
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw fail('invalid_source', { path }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid('');
  for (const [key, value] of Object.entries(parsed)) {
    const pointer = `/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(pointer);
    if (!['human', 'machine'].includes(value.status)) throw invalid(`${pointer}/status`);
    if (value.stale !== undefined && typeof value.stale !== 'boolean') throw invalid(`${pointer}/stale`);
  }
  return parsed as Record<string, { status?: string; stale?: boolean }>;
}
