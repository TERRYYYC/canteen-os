/** Session-only inbox buffers; never persist source text or reviewer details in browser storage. */
import { onAuthSessionChange } from '../../../admin/token';
import { createAttempt, getKnowledgeApi, KnowledgeError, type Attempt } from '../../../api/knowledge';
import { registerAuxiliaryEdits, type AuxiliaryEditHandle, type AuxiliaryOperation } from '../../../view-models/reload-safety';

export interface InboxBuffer {
  values: Record<string, string>;
  baseline: Record<string, string>;
  extras: Record<string, unknown>;
  generation: number;
  busy: boolean;
  unknown: boolean;
  error?: unknown;
  refresh?: () => void;
  previousSession?: boolean;
  attempt?: { request: Attempt; fields: Record<string, string>; ticket: AuxiliaryOperation };
  registration: AuxiliaryEditHandle;
}
const buffers = new Map<string, InboxBuffer>(), protectedOwners = new Set<InboxBuffer>();
export function inboxDirty(buffer: InboxBuffer): boolean { return JSON.stringify(buffer.values) !== JSON.stringify(buffer.baseline) || !!buffer.extras.file; }
export function inboxBuffer(key: string): InboxBuffer {
  let buffer = buffers.get(key);
  if (!buffer) {
    const state: InboxBuffer = { values: {}, baseline: {}, extras: {}, generation: 0, busy: false, unknown: false,
      registration: registerAuxiliaryEdits({ ownerId: `inbox:${key}:${crypto.randomUUID()}`, identity: { kind: 'knowledge-inbox', id: key }, operationTracking: 'tickets',
        read: () => ({ generation: state.generation, dirty: inboxDirty(state), phase: state.unknown ? 'unknown' : state.busy ? 'busy' : 'idle' }) }) };
    buffer = state; buffers.set(key, state); protectedOwners.add(state);
  }
  return buffer;
}
export function bindInboxValue(buffer: InboxBuffer, key: string, control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, initial = control.value): void {
  if (!(key in buffer.values)) { buffer.values[key] = initial; buffer.baseline[key] = initial; }
  control.value = buffer.values[key]!;
  const change = () => { if (buffer.values[key] !== control.value) { buffer.values[key] = control.value; buffer.generation++; } };
  control.addEventListener('input', change); control.addEventListener('change', change);
}
/** A retry reuses the original request and ticket even if newer local input differs. */
export async function writeInbox<T>(buffer: InboxBuffer, path?: string, value?: unknown, fields: string[] = []): Promise<T> {
  if (buffer.busy) throw new Error('Inbox operation already running');
  if (!buffer.attempt) {
    if (!path) throw new Error('Inbox request unavailable');
    buffer.attempt = { request: createAttempt(path, 'POST', value), fields: Object.fromEntries(fields.map(key => [key, buffer.values[key] ?? ''])), ticket: buffer.registration.beginOperation('write') };
  }
  const attempt = buffer.attempt;
  const refresh = buffer.refresh;
  buffer.busy = true; buffer.error = undefined; buffer.generation++;
  try {
    const { data } = await getKnowledgeApi().send<T>(attempt.request);
    for (const [key, text] of Object.entries(attempt.fields)) buffer.baseline[key] = text;
    buffer.unknown = false; buffer.registration.settleOperation(attempt.ticket, 'completed'); buffer.attempt = undefined;
    return data;
  } catch (error) {
    buffer.error = error;
    buffer.unknown = error instanceof KnowledgeError && (error.uncertain || error.code === 'session_changed');
    if (buffer.unknown) buffer.registration.markUnknown(attempt.ticket);
    else { buffer.registration.settleOperation(attempt.ticket, 'failed'); buffer.attempt = undefined; }
    throw error;
  } finally {
    buffer.busy = false; buffer.generation++;
    if (buffer.previousSession && buffer.registration.dispose()) protectedOwners.delete(buffer);
    // The new render owns its refresh. Never repaint the detached origin of a write.
    else if (buffer.refresh !== refresh) buffer.refresh?.();
  }
}
onAuthSessionChange(() => {
  for (const buffer of buffers.values()) {
    // Retain only operation metadata when an old-session write has no definite result.
    buffer.values = {}; buffer.baseline = {}; buffer.extras = {}; buffer.error = undefined; buffer.refresh = undefined; buffer.previousSession = true;
    if (buffer.attempt) { buffer.attempt.request.body = ''; buffer.attempt.fields = {}; }
    if (buffer.registration.dispose()) protectedOwners.delete(buffer);
  }
  buffers.clear();
});
window.addEventListener('beforeunload', event => {
  if ([...protectedOwners].some(buffer => inboxDirty(buffer) || buffer.busy || buffer.unknown)) { event.preventDefault(); event.returnValue = ''; }
});
