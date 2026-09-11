/** Memory-only drafts, one-level undo and handoff, bound to the consuming API lifetime. */
import type { AnyMenuPlan } from '@canteenos/core';
import { ApiError, type ApiMode } from '../api/types';
import { getAuthSessionVersion, peekAuthSessionVersion, onAuthSessionChange } from './token';
import { registerReloadRecords, type ReloadRecord } from '../view-models/reload-safety';

export type DraftSource = 'import' | 'copy-last-week' | 'edit';
export interface Handoff { newDishName?: string; newIngredientName?: string; returnTo?: string }
export interface DraftStoreBoundary {
  readonly mode: ApiMode;
  sessionKey(): number;
  /** Must not advance auth state or emit events. Absent/null means unknown to reload inspection. */
  peekSessionKey?(): number | null;
}
export interface BoundDraftStore {
  getDraftPlan(planId: string): AnyMenuPlan | null;
  getDraftSource(planId: string): DraftSource | null;
  setDraftPlan(planId: string, plan: AnyMenuPlan, source: DraftSource): void;
  clearDraftPlan(planId: string): void;
  undoDraftPlan(planId: string): boolean;
  setHandoff(value: Handoff): void;
  takeHandoff(): Handoff;
}
interface DraftEntry {
  plan: AnyMenuPlan;
  source: DraftSource;
  prev: { plan: AnyMenuPlan; source: DraftSource } | null;
}
interface Binding {
  boundary: DraftStoreBoundary;
  key: number;
  mode: ApiMode;
  auth: number;
  drafts: Map<string, DraftEntry>;
  handoff: Handoff;
  handle?: BoundDraftStore;
}
let current: Binding | null = null;
let generation = 0;
const changed = (): never => { throw new ApiError(0, 'session_changed', ''); };
function retire(binding = current): void {
  if (!binding || current !== binding) return;
  binding.drafts.clear();
  binding.handoff = {};
  current = null;
  generation++;
}
onAuthSessionChange(() => retire());
function readKey(boundary: DraftStoreBoundary): number {
  const key = boundary.sessionKey();
  if (!Number.isSafeInteger(key) || key < 0 || !['real', 'mock', 'unconfigured'].includes(boundary.mode)) return changed();
  return key;
}
function matches(binding: Binding): boolean {
  const key = readKey(binding.boundary);
  return current === binding && key === binding.key && binding.mode === binding.boundary.mode && binding.auth === peekAuthSessionVersion();
}
function requireLive(binding: Binding): void {
  // Check captured owner before polling; a late old caller must not touch a newer binding.
  if (current !== binding) return changed();
  try { if (matches(binding)) return; } catch { /* Fail closed with no raw transport detail. */ }
  retire(binding);
  return changed();
}

/** Call once at a live render's synchronous entry, then capture this handle across awaits. */
export function bindDraftStore(boundary: DraftStoreBoundary): BoundDraftStore {
  getAuthSessionVersion();
  let key: number;
  try { key = readKey(boundary); } catch { retire(); return changed(); }
  const auth = peekAuthSessionVersion();
  if (auth === null) { retire(); return changed(); }
  if (current && current.boundary === boundary && current.key === key && current.mode === boundary.mode && current.auth === auth) return current.handle!;
  retire();
  const binding: Binding = { boundary, key, mode: boundary.mode, auth, drafts: new Map(), handoff: {} };
  current = binding;
  generation++;
  const handle: BoundDraftStore = {
    getDraftPlan(id) { requireLive(binding); const entry = binding.drafts.get(id); return entry ? structuredClone(entry.plan) : null; },
    getDraftSource(id) { requireLive(binding); return binding.drafts.get(id)?.source ?? null; },
    setDraftPlan(id, plan, source) {
      requireLive(binding);
      const copy = structuredClone(plan), previous = binding.drafts.get(id);
      binding.drafts.set(id, { plan: copy, source, prev: previous ? { plan: previous.plan, source: previous.source } : null });
      generation++;
    },
    clearDraftPlan(id) { requireLive(binding); if (binding.drafts.delete(id)) generation++; },
    undoDraftPlan(id) {
      requireLive(binding);
      const entry = binding.drafts.get(id);
      if (!entry) return false;
      if (entry.prev) binding.drafts.set(id, { ...entry.prev, prev: null });
      else binding.drafts.delete(id);
      generation++;
      return true;
    },
    setHandoff(value) { requireLive(binding); binding.handoff = { ...value }; generation++; },
    takeHandoff() { requireLive(binding); const value = binding.handoff; binding.handoff = {}; generation++; return value; },
  };
  binding.handle = handle;
  return handle;
}

registerReloadRecords('draft-store', () => {
  const marker: ReloadRecord = { ownerId: 'draft-store', kind: 'store', id: 'draft-store', generation, dirty: false, phase: 'idle' };
  const binding = current;
  if (!binding) return [marker];
  try {
    const key = binding.boundary.peekSessionKey?.();
    if (key == null || key !== binding.key || binding.boundary.mode !== binding.mode || peekAuthSessionVersion() !== binding.auth) return [{ ...marker, phase: 'unknown' }];
  }
  catch { return [{ ...marker, phase: 'unknown' }]; }
  // Never expose stale IDs, handoff text, paths, source bodies, or an API/session key.
  const records: ReloadRecord[] = [...binding.drafts.keys()].map(id => ({
    ownerId: 'draft-store', kind: 'plan', id, generation, dirty: true, phase: 'dirty',
  }));
  if (Object.keys(binding.handoff).length) records.push({ ownerId: 'draft-store', kind: 'handoff', id: 'pending-handoff', generation, dirty: true, phase: 'dirty' });
  return [marker, ...records];
});

/** Unscoped calls cannot distinguish a late prior principal from the current caller. */
function scopeRequired(): never { throw new ApiError(0, 'store_scope_required', ''); }
export const getDraftPlan: BoundDraftStore['getDraftPlan'] = scopeRequired;
export const getDraftSource: BoundDraftStore['getDraftSource'] = scopeRequired;
export const setDraftPlan: BoundDraftStore['setDraftPlan'] = scopeRequired;
export const clearDraftPlan: BoundDraftStore['clearDraftPlan'] = scopeRequired;
export const undoDraftPlan: BoundDraftStore['undoDraftPlan'] = scopeRequired;
export const setHandoff: BoundDraftStore['setHandoff'] = scopeRequired;
export const takeHandoff: BoundDraftStore['takeHandoff'] = scopeRequired;
