import type { FileContent } from './github.js';
import { fail } from './http.js';

export type WritePrecondition = { create: true } | { match: string };

export function writePrecondition(headers: Headers): WritePrecondition {
  const match = headers.get('If-Match');
  const none = headers.get('If-None-Match');
  if (match !== null && none !== null) throw fail('invalid_precondition');
  if (none !== null) {
    if (none.trim() !== '*') throw fail('invalid_precondition');
    return { create: true };
  }
  if (match === null) throw fail('precondition_required');
  const value = match.trim();
  if (!/^(?:[0-9a-f]{40}|"[0-9a-f]{40}")$/.test(value)) throw fail('invalid_precondition');
  return { match: value.replaceAll('"', '') };
}

export function checkPrecondition(condition: WritePrecondition, current: FileContent | null): void {
  if ('create' in condition ? current !== null : current?.sha !== condition.match) throw fail('conflict');
}
