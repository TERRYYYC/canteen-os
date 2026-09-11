/** Metadata-only, application-lifetime protection for an intentional whole-page update. */
import { peekAuthSessionVersion, stripTokenFromRest } from '../admin/token';

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
const coverage = new Map<string, ReloadCoverage>();
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
  if (!['tracked', 'read-only', 'untracked'].includes(value) || !ownerId) throw new Error('Invalid reload coverage');
  if (coverage.get(ownerId) === value) return;
  coverage.set(ownerId, value);
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
    const current = ++generation;
    latest.set(owner, current);
    setReloadCoverage(['menu', 'prep', 'qr'].includes(route) ? 'read-only' : 'untracked', owner);
    return (value: 'tracked' | 'read-only') => {
      if (latest.get(owner) === current) setReloadCoverage(value, owner);
    };
  } };
}

export interface AuxiliaryEditState { generation: number; dirty: boolean; phase: 'idle' | 'busy' | 'unknown' }
export interface AuxiliaryEditOptions {
  ownerId: string;
  identity: { kind: string; id: string };
  read(): AuxiliaryEditState;
}
export interface AuxiliaryEditHandle { dispose(): boolean }

export function registerAuxiliaryEdits(options: AuxiliaryEditOptions): AuxiliaryEditHandle {
  const { ownerId } = options;
  const identity = { kind: options.identity?.kind, id: options.identity?.id };
  let maxGeneration = -1;
  let invalid = false;
  let disposed = false;
  const read = (): ReloadRecord[] => {
    const state = options.read();
    if (typeof identity.kind !== 'string' || !identity.kind || typeof identity.id !== 'string' || !identity.id || !state || !Number.isSafeInteger(state.generation) || state.generation < 0 ||
      state.generation < maxGeneration || typeof state.dirty !== 'boolean' || !['idle', 'busy', 'unknown'].includes(state.phase)) invalid = true;
    if (invalid) throw new Error('Invalid auxiliary edit metadata');
    maxGeneration = state.generation;
    return [{ ownerId, ...identity, generation: state.generation, dirty: state.dirty, phase: state.phase }];
  };
  const unregister = registerReloadRecords(ownerId, read);
  return { dispose() {
    if (disposed) return true;
    try {
      const state = read()[0]!;
      if (state.dirty || state.phase !== 'idle') return false;
      unregister();
      disposed = true;
      return true;
    } catch { return false; }
  } };
}

/** Pure with respect to owner state: no save, reconciliation, disposal, or view rebinding. */
export function inspectReloadSafety(): ReloadSnapshot {
  const records: ReloadRecord[] = [];
  for (const [ownerId, read] of providers) {
    try {
      for (const row of read()) records.push({ ...row });
    } catch {
      records.push({ ownerId, kind: 'unknown', id: ownerId, generation: -1, dirty: false, phase: 'unknown' });
    }
  }
  for (const [ownerId, value] of coverage) if (value === 'untracked') {
    records.push({ ownerId, kind: 'page', id: ownerId.replace(/^page:/, ''), generation: registryGeneration, dirty: false, phase: 'untracked' });
  }
  records.sort((a, b) => JSON.stringify([a.ownerId, a.kind, a.id]).localeCompare(JSON.stringify([b.ownerId, b.kind, b.id])));
  const unknown = records.some(r => r.phase === 'unknown' || r.phase === 'outcome-unknown' || r.recovering);
  const reason = unknown ? 'unknown' : records.some(r => r.pending || r.phase === 'saving' || r.phase === 'busy') ? 'saving' :
    [...coverage.values()].some(v => v === 'untracked') ? 'untracked' : records.some(r => r.dirty) ? 'dirty' : 'clear';
  return Object.freeze({ reason, records: Object.freeze(records.map(r => Object.freeze(r))),
    stamp: JSON.stringify([registryGeneration, peekAuthSessionVersion(), [...coverage], records]) });
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
