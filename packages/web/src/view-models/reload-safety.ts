/** Metadata-only, application-lifetime protection for an intentional whole-page update. */
import { getAuthSessionVersion, peekAuthSessionVersion, stripTokenFromRest } from '../admin/token';
import type { ApiMode } from '../api/types';

export interface ReloadRecord {
  ownerId: string;
  kind: string;
  id: string;
  generation: number;
  dirty: boolean;
  phase: string;
  pending?: boolean;
  recovering?: boolean;
  context?: number;
  operation?: number;
}
export type ReloadCoverage = 'tracked' | 'read-only' | 'untracked';
export interface ReloadSnapshot {
  readonly reason: 'clear' | 'dirty' | 'saving' | 'unknown' | 'untracked';
  readonly records: readonly Readonly<ReloadRecord>[];
  readonly stamp: string;
}
const providers = new Map<string, () => ReloadRecord[]>();
interface CoverageEntry { ownerId: string; auth: number; value: ReloadCoverage; marker: number }
const coverage = new Map<string, CoverageEntry>();
let coverageSequence = 0;
let registryGeneration = 0;

/** Internal C1/store seam. Page buffers use registerAuxiliaryEdits instead. */
export function registerReloadRecords(ownerId: string, read: () => ReloadRecord[]): () => void {
  if (typeof ownerId !== 'string' || !ownerId || providers.has(ownerId)) throw new Error('Duplicate reload safety owner');
  providers.set(ownerId, read);
  registryGeneration++;
  return () => { if (providers.get(ownerId) === read) { providers.delete(ownerId); registryGeneration++; } };
}

/** An untracked surface stays protected after navigation, until its owner declares coverage. */
export function setReloadCoverage(value: ReloadCoverage, ownerId = 'application'): void {
  setCoverage(value, ownerId, getAuthSessionVersion());
}
function setCoverage(value: ReloadCoverage, ownerId: string, auth: number): void {
  if (!['tracked', 'read-only', 'untracked'].includes(value) || !ownerId) throw new Error('Invalid reload coverage');
  const key = JSON.stringify([auth, ownerId]);
  const prior = coverage.get(key);
  if (prior?.value === value) return;
  coverage.set(key, { ownerId, auth, value, marker: prior?.marker ?? ++coverageSequence });
  registryGeneration++;
}

/** App shell owns render identity; pages only acknowledge their own completed setup. */
export function createPageReloadCoverage() {
  let generation = 0;
  const latest = new Map<string, number>();
  return { beginRender(route: string, rest: string) {
    // Defense for a stale ctx.rest captured before history.replaceState removed a login link.
    const safeRest = route === 'admin' ? stripTokenFromRest(rest) : rest;
    const owner = `page:${route}/${safeRest.split('/').filter(Boolean).join('/')}`;
    const auth = getAuthSessionVersion(), key = JSON.stringify([auth, owner]);
    const current = ++generation;
    latest.set(key, current);
    setCoverage(['menu', 'prep', 'qr'].includes(route) ? 'read-only' : 'untracked', owner, auth);
    return (value: 'tracked' | 'read-only') => {
      if (latest.get(key) === current) setCoverage(value, owner, auth);
    };
  } };
}

export interface AuxiliaryEditState { generation: number; dirty: boolean; phase: 'idle' | 'busy' | 'unknown' }
export interface AuxiliaryEditOptions {
  ownerId: string;
  identity: { kind: string; id: string };
  read(): AuxiliaryEditState;
  boundary?: { readonly mode: ApiMode; sessionKey(): number; peekSessionKey?(): number | null };
  operationTracking?: 'tickets' | 'local-only';
}
declare const auxiliaryOperation: unique symbol;
export interface AuxiliaryOperation { readonly [auxiliaryOperation]: true }
export interface AuxiliaryEditHandle {
  dispose(): boolean;
  beginOperation(kind: 'read' | 'write'): AuxiliaryOperation;
  markUnknown(ticket: AuxiliaryOperation): boolean;
  settleOperation(ticket: AuxiliaryOperation, outcome: 'completed' | 'failed'): boolean;
  cancelRead(ticket: AuxiliaryOperation): boolean;
}
let auxiliarySequence = 0;
const auxiliaryOwners = new Set<{ ownerId: string; boundary: AuxiliaryEditOptions['boundary']; key: number | undefined; mode: ApiMode | undefined; auth: number }>();

export function registerAuxiliaryEdits(options: AuxiliaryEditOptions): AuxiliaryEditHandle {
  const { ownerId: privateOwner, boundary, operationTracking } = options;
  const key = boundary?.sessionKey(), mode = boundary?.mode, auth = getAuthSessionVersion();
  if (typeof privateOwner !== 'string' || !privateOwner || (boundary && (!Number.isSafeInteger(key) || key! < 0))) throw new Error('Invalid auxiliary boundary');
  for (const owner of auxiliaryOwners) if (owner.ownerId === privateOwner && owner.boundary === boundary && owner.key === key && owner.mode === mode && owner.auth === auth) throw new Error('Duplicate auxiliary owner');
  const owner = { ownerId: privateOwner, boundary, key, mode, auth };
  const ownerId = `auxiliary-${++auxiliarySequence}`;
  const identity = { kind: options.identity?.kind, id: options.identity?.id };
  const operations = new Map<AuxiliaryOperation, { kind: 'read' | 'write'; unknown: boolean }>();
  let maxGeneration = -1;
  let operationGeneration = 0;
  let invalid = false;
  let disposed = false;
  function scope(): 'live' | 'changed' | 'unknown' {
    try {
      const now = peekAuthSessionVersion();
      if (now === null) return 'unknown';
      if (now !== auth) return 'changed';
      if (boundary) {
        const current = boundary.peekSessionKey?.();
        if (current == null || !Number.isSafeInteger(current) || current < 0) return 'unknown';
        if (current !== key || boundary.mode !== mode) return 'changed';
      }
      return 'live';
    } catch { return 'unknown'; }
  }
  const read = (): ReloadRecord[] => {
    const current = scope();
    if (current !== 'live') return [{ ownerId, kind: 'unknown', id: 'previous-session-operation', generation: operationGeneration, dirty: false,
      phase: current === 'changed' && operationTracking && !invalid && operations.size === 0 ? 'idle' : 'unknown' }];
    const state = options.read();
    if (typeof identity.kind !== 'string' || !identity.kind || typeof identity.id !== 'string' || !identity.id || !state || !Number.isSafeInteger(state.generation) || state.generation < 0 ||
      state.generation < maxGeneration || typeof state.dirty !== 'boolean' || !['idle', 'busy', 'unknown'].includes(state.phase)) invalid = true;
    if (state?.phase !== 'idle' && operationTracking && operations.size === 0) invalid = true;
    if (invalid) throw new Error('Invalid auxiliary edit metadata');
    maxGeneration = state.generation;
    const phase = [...operations.values()].some(o => o.unknown) ? 'unknown' : operations.size ? 'busy' : state.phase;
    return [{ ownerId, ...identity, generation: state.generation, dirty: state.dirty, phase, operation: operationGeneration }];
  };
  const unregister = registerReloadRecords(ownerId, read);
  auxiliaryOwners.add(owner);
  function retire(): void { unregister(); auxiliaryOwners.delete(owner); disposed = true; }
  function changed(): void { operationGeneration++; registryGeneration++; }
  function settle(ticket: AuxiliaryOperation): boolean {
    if (disposed || !operations.delete(ticket)) return false;
    changed();
    // Retire only this old owner after every one of its operations has a definite outcome.
    if (scope() === 'changed' && operations.size === 0 && !invalid) retire();
    return true;
  }
  return { dispose() {
    if (disposed) return true;
    if (operations.size || invalid) return false;
    try {
      if (scope() === 'changed' && operationTracking) { retire(); return true; }
      const state = read()[0]!;
      if (state.dirty || state.phase !== 'idle') return false;
      retire();
      return true;
    } catch { return false; }
  }, beginOperation(kind) {
    if (disposed || invalid || operationTracking !== 'tickets' || scope() !== 'live' || !['read', 'write'].includes(kind)) throw new Error('Auxiliary operation scope unavailable');
    const ticket = Object.freeze({}) as AuxiliaryOperation;
    operations.set(ticket, { kind, unknown: false }); changed(); return ticket;
  }, markUnknown(ticket) {
    const operation = operations.get(ticket);
    if (disposed || !operation) return false;
    if (!operation.unknown) { operation.unknown = true; changed(); }
    return true;
  }, settleOperation(ticket, outcome) {
    return ['completed', 'failed'].includes(outcome) && settle(ticket);
  }, cancelRead(ticket) {
    return operations.get(ticket)?.kind === 'read' && settle(ticket);
  } };
}

/** Pure with respect to owner state: no save, reconciliation, disposal, or view rebinding. */
export function inspectReloadSafety(): ReloadSnapshot {
  const auth = peekAuthSessionVersion();
  if (auth === null) {
    const unknown = Object.freeze({ ownerId: 'auth', kind: 'unknown', id: 'auth-session', generation: -1, dirty: false, phase: 'unknown' });
    return Object.freeze({ reason: 'unknown', records: Object.freeze([unknown]), stamp: JSON.stringify([registryGeneration, null, unknown]) });
  }
  const records: ReloadRecord[] = [];
  for (const [ownerId, read] of providers) {
    try {
      for (const row of read()) records.push({ ...row });
    } catch {
      records.push({ ownerId, kind: 'unknown', id: ownerId, generation: -1, dirty: false, phase: 'unknown' });
    }
  }
  const coverageStamp: unknown[] = [];
  for (const entry of coverage.values()) {
    if (entry.auth === auth) {
      coverageStamp.push([entry.ownerId, entry.value]);
      if (entry.value === 'untracked') records.push({ ownerId: entry.ownerId, kind: 'page', id: entry.ownerId.replace(/^page:/, ''), generation: registryGeneration, dirty: false, phase: 'untracked' });
    } else if (entry.value === 'untracked') {
      records.push({ ownerId: `previous-page-${entry.marker}`, kind: 'unknown', id: 'previous-session-page', generation: 0, dirty: false, phase: 'unknown' });
    }
  }
  records.sort((a, b) => JSON.stringify([a.ownerId, a.kind, a.id]).localeCompare(JSON.stringify([b.ownerId, b.kind, b.id])));
  const unknown = records.some(r => r.phase === 'unknown' || r.phase === 'outcome-unknown' || r.recovering);
  const reason = unknown ? 'unknown' : records.some(r => r.pending || r.phase === 'saving' || r.phase === 'busy') ? 'saving' :
    records.some(r => r.phase === 'untracked') ? 'untracked' : records.some(r => r.dirty) ? 'dirty' : 'clear';
  return Object.freeze({ reason, records: Object.freeze(records.map(r => Object.freeze(r))),
    stamp: JSON.stringify([registryGeneration, auth, coverageStamp, records]) });
}

export type ReloadDecision = { status: 'blocked' | 'confirm-discard' | 'started'; snapshot: ReloadSnapshot };
export function createReloadCoordinator(options: { reload(): void; activate(): Promise<void>; hasWaiting(): boolean }) {
  let consent: ReloadSnapshot | null = null;
  let proposal: ReloadSnapshot | null = null;
  let reloaded = false;
  let activating = false;
  const allowed = (s: ReloadSnapshot) => s.reason === 'clear' || s.reason === 'dirty';
  function onNeedReload(): boolean {
    if (!consent || reloaded) return false;
    const current = inspectReloadSafety();
    if (!allowed(current) || current.stamp !== consent.stamp) { consent = null; return false; }
    // Consume intent before calling application code, including synchronous reentry.
    consent = null; reloaded = true;
    options.reload();
    return true;
  }
  async function start(snapshot: ReloadSnapshot): Promise<ReloadDecision> {
    const current = inspectReloadSafety();
    if (reloaded || activating || !allowed(current) || current.stamp !== snapshot.stamp) return { status: 'blocked', snapshot: current };
    consent = current;
    if (options.hasWaiting()) {
      activating = true;
      try { await options.activate(); }
      catch { consent = null; return { status: 'blocked', snapshot: inspectReloadSafety() }; }
      finally { activating = false; }
    } else if (!onNeedReload()) return { status: 'blocked', snapshot: inspectReloadSafety() };
    return { status: 'started', snapshot: current };
  }
  return {
    async requestUpdate(): Promise<ReloadDecision> {
      consent = null; proposal = null;
      const snapshot = inspectReloadSafety();
      if (reloaded || activating || !allowed(snapshot)) return { status: 'blocked', snapshot };
      if (snapshot.reason === 'dirty') { proposal = snapshot; return { status: 'confirm-discard', snapshot }; }
      return start(snapshot);
    },
    async confirmDiscard(snapshot: ReloadSnapshot): Promise<ReloadDecision> {
      const expected = proposal; proposal = null;
      if (!expected || snapshot !== expected) return { status: 'blocked', snapshot: inspectReloadSafety() };
      return start(expected);
    },
    cancel() { consent = null; proposal = null; },
    timeout() { consent = null; proposal = null; },
    onNeedReload,
  };
}
