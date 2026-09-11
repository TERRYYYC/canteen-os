/**
 * Memory-only editor for a JSON document. A save acknowledges its submitted generation;
 * it does not publish, replace later edits, confirm shopping decisions, or retry itself.
 *
 * One owner keeps this editor for the entire authenticated application lifetime.
 * open() initializes/resumes a document; refreshView() rebinds language/presentation.
 * Both return a contextId for page callbacks. invalidate() detaches a page without
 * losing document drafts or unresolved operations. Returning with open() resumes them.
 * replace() explicitly adopts a resolved source/draft and refuses pending operations.
 * dispose() returns false while any document has an unresolved write, true otherwise;
 * a disposed editor cannot reopen. Auth changes erase and seal it immediately; create
 * a new editor with freshly authenticated sources. A mode change also seals it.
 * Adapters must save the whole supplied body unchanged and read null only for not_found.
 */
import { ApiError } from "../api/types";
import type { ApiMode, FieldError, Source, WriteCondition, WriteResult } from "../api/types";
import { getAuthSessionVersion, onAuthSessionChange } from "../admin/token";

export interface EditIdentity {
  kind: "plan" | "dish" | "shopping-list";
  id: string;
}

export interface EditAdapters<T> {
  mode(): ApiMode;
  /** Opaque identity generation, never a credential. Custom transports pass their sessionKey. */
  authSession?(): unknown;
  save(identity: EditIdentity, body: T, condition: WriteCondition, operation: { operationId: string }): Promise<WriteResult>;
  /** force bypasses current caches; revision must pin an exact source version. */
  read(identity: EditIdentity, options: { revision?: string; force: true }): Promise<Source<T> | null>;
}

export type EditPhase = "closed" | "clean" | "dirty" | "saving" | "saved-but-unpublished" | "conflict" | "outcome-unknown" | "error";

export interface EditFailure {
  status: number;
  code: string;
  message: string;
  errors: FieldError[];
  retryAfter?: number;
  reviewRequired?: string[];
}

export interface SavedEdit {
  operationId: string;
  generation: number;
  mode: ApiMode;
  commit: string;
  blobSha: string;
  reconciled: boolean;
  /** A lost response cannot supply warnings or an unchanged claim. */
  unchanged?: boolean;
  warnings?: string[];
}

export interface EditState<T> {
  contextId: number;
  identity: EditIdentity | null;
  generation: number;
  mode: ApiMode;
  phase: EditPhase;
  dirty: boolean;
  draft: T | null;
  source: Source<T> | null;
  operationId: string | null;
  recovering: boolean;
  lastSave: SavedEdit | null;
  error: EditFailure | null;
}

export interface EditResult {
  status: "saved" | "unchanged" | "not-saved" | "blocked" | "stale" | "conflict" | "outcome-unknown" | "error";
  contextId: number;
  mode: ApiMode;
  operationId?: string;
}

interface Operation<T> {
  contextId: number;
  identity: EditIdentity;
  operationId: string;
  generation: number;
  mode: ApiMode;
  body: T;
  condition: WriteCondition;
  original: Source<T> | null;
}

interface DocumentRecord<T> {
  state: EditState<T>;
  pending: Operation<T> | null;
}

/** Compare the JSON bytes' meaning, preserving array order and all supplied values. */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, sort(item)]));
    }
    return v;
  };
  return JSON.stringify(sort(JSON.parse(JSON.stringify(value))));
}

function failure(error: unknown): EditFailure {
  if (error instanceof ApiError) {
    return structuredClone({
      status: error.status, code: error.code, message: error.message, errors: error.errors,
      ...(error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}),
      ...(error.reviewRequired !== undefined ? { reviewRequired: error.reviewRequired } : {}),
    });
  }
  // Fetch/body-read failures may contain secrets in a raw exception. Keep no raw error.
  return { status: 0, code: "network", message: "", errors: [] };
}

function localFailure(code: string, status = 0): EditFailure {
  return { status, code, message: "", errors: [{ path: "", code, message: "" }] };
}

let sessionSequence = 0;

export function createEditSession<T extends object>(adapters: EditAdapters<T>) {
  const sessionId = ++sessionSequence;
  let operationSequence = 0;
  let viewSequence = 0;
  let sealed = false;
  const mode = adapters.mode();
  const authSession = adapters.authSession ?? getAuthSessionVersion;
  const authIdentity = authSession();
  const documents = new Map<string, DocumentRecord<T>>();
  let active: DocumentRecord<T> | null = null;
  const emptyState = (): EditState<T> => ({
    contextId: viewSequence, identity: null, generation: 0, mode, phase: "closed",
    dirty: false, draft: null, source: null, operationId: null, recovering: false, lastSave: null, error: null,
  });
  let detached = emptyState();
  let unsubscribeAuth = () => {};
  const listeners = new Set<(snapshot: EditState<T>) => void>();
  const snapshot = (): EditState<T> => structuredClone(active?.state ?? detached);
  const notify = (listener: (snapshot: EditState<T>) => void) => {
    // Rendering failures cannot convert a committed write into a retryable failure.
    try { listener(snapshot()); } catch { /* observer owns its rendering error */ }
  };
  const emit = () => { for (const listener of listeners) notify(listener); };
  const result = (status: EditResult["status"], operation?: Operation<T>, contextId = viewSequence): EditResult => ({
    status, contextId, mode: operation?.mode ?? mode,
    ...(operation ? { operationId: operation.operationId } : {}),
  });
  const seal = (error: EditFailure | null, erase: boolean) => {
    if (sealed) return;
    sealed = true;
    const previous = snapshot();
    viewSequence++;
    active = null;
    documents.clear();
    detached = erase ? emptyState() : { ...previous, contextId: viewSequence, phase: "closed", operationId: null, recovering: false };
    detached.error = error;
    unsubscribeAuth();
    emit();
    listeners.clear();
  };
  const scopeMatches = () => {
    if (sealed) return false;
    if (authSession() !== authIdentity) { seal(localFailure("session_changed"), true); return false; }
    if (adapters.mode() !== mode) { seal(localFailure("mode_changed"), false); return false; }
    return true;
  };
  unsubscribeAuth = onAuthSessionChange(() => { scopeMatches(); });
  const getState = (): EditState<T> => { scopeMatches(); return snapshot(); };
  const isLive = (document: DocumentRecord<T>, operation: Operation<T>) => scopeMatches() && document.pending === operation;
  const emitDocument = (document: DocumentRecord<T>) => { if (active === document) emit(); };
  const completion = (status: EditResult["status"], document: DocumentRecord<T>, operation: Operation<T>, contextId: number) =>
    result(active === document && document.state.contextId === contextId ? status : "stale", operation, contextId);
  const clearOperation = (document: DocumentRecord<T>) => {
    document.pending = null;
    document.state.operationId = null;
    document.state.recovering = false;
  };
  const saved = (document: DocumentRecord<T>, operation: Operation<T>, contextId: number, source: Source<T>, acknowledgement?: WriteResult) => {
    const state = document.state;
    state.source = structuredClone(source);
    state.lastSave = {
      operationId: operation.operationId, generation: operation.generation, mode: operation.mode,
      commit: source.commit, blobSha: source.blobSha, reconciled: !acknowledgement,
      ...(acknowledgement ? { unchanged: acknowledgement.unchanged, warnings: [...acknowledgement.warnings] } : {}),
    };
    state.dirty = state.generation !== operation.generation;
    state.phase = state.dirty ? "dirty" : "saved-but-unpublished";
    state.error = null;
    clearOperation(document);
    emitDocument(document);
    return completion("saved", document, operation, contextId);
  };
  const conflicted = (document: DocumentRecord<T>, operation: Operation<T>, contextId: number, error = localFailure("conflict", 409)) => {
    document.state.phase = "conflict";
    document.state.error = error;
    clearOperation(document);
    emitDocument(document);
    return completion("conflict", document, operation, contextId);
  };
  const initialState = (identity: EditIdentity, draft: T, source: Source<T> | null): EditState<T> => {
    const dirty = source === null || canonical(draft) !== canonical(source.content);
    return {
      contextId: viewSequence, identity: structuredClone(identity), generation: 0, mode,
      phase: dirty ? "dirty" : "clean", dirty, draft: structuredClone(draft), source: structuredClone(source),
      operationId: null, recovering: false, lastSave: null, error: null,
    };
  };
  const refreshView = () => {
    if (!scopeMatches() || !active) return viewSequence;
    active.state.contextId = ++viewSequence;
    emit();
    return viewSequence;
  };
  const invalidate = () => {
    if (!scopeMatches()) return;
    const previous = snapshot();
    viewSequence++;
    active = null;
    detached = { ...previous, contextId: viewSequence, phase: "closed", operationId: null, recovering: false };
    emit();
  };

  return {
    getState,
    /** Initial values apply only on first open; reopening always resumes the document record. */
    open(identity: EditIdentity, draft: T, source: Source<T> | null = null): number {
      if (!scopeMatches()) return viewSequence;
      const key = JSON.stringify([identity.kind, identity.id]);
      let document = documents.get(key);
      if (!document) {
        document = { state: initialState(identity, draft, source), pending: null };
        documents.set(key, document);
      }
      active = document;
      return refreshView();
    },
    refreshView,
    /** Explicit conflict resolution/discard. Never a way to forget an unresolved write. */
    replace(draft: T, source: Source<T> | null, contextId = viewSequence): boolean {
      if (contextId !== viewSequence || !scopeMatches() || !active || active.pending || !active.state.identity) return false;
      active.state = initialState(active.state.identity, draft, source);
      refreshView();
      return true;
    },
    edit(draft: T, contextId = viewSequence): boolean {
      if (contextId !== viewSequence || !scopeMatches() || !active) return false;
      const state = active.state;
      if (canonical(draft) === canonical(state.draft)) return true;
      state.draft = structuredClone(draft);
      state.generation++;
      state.dirty = true;
      if (!active.pending && state.phase !== "conflict") { state.phase = "dirty"; state.error = null; }
      emit();
      return true;
    },
    async save(contextId = viewSequence): Promise<EditResult> {
      if (contextId !== viewSequence) return result("stale", undefined, contextId);
      if (!scopeMatches() || !active || !active.state.identity || !active.state.draft) return result("blocked");
      const document = active;
      const state = document.state;
      if (document.pending || state.phase === "conflict") return result("blocked");
      if (state.mode === "unconfigured") {
        state.error = localFailure("unconfigured");
        emit();
        return result("blocked");
      }
      if (!state.dirty) return result("unchanged");
      const operation: Operation<T> = {
        contextId, identity: structuredClone(state.identity!), generation: state.generation,
        operationId: `edit-${sessionId}-${++operationSequence}`, mode: state.mode,
        body: structuredClone(state.draft!), original: structuredClone(state.source),
        condition: state.source ? { ifMatch: state.source.blobSha } : { ifNoneMatch: "*" },
      };
      document.pending = operation;
      state.phase = "saving";
      state.operationId = operation.operationId;
      state.error = null;
      emit();
      if (!isLive(document, operation)) return result("stale", operation, contextId);
      try {
        const acknowledgement = await adapters.save(
          structuredClone(operation.identity), structuredClone(operation.body), structuredClone(operation.condition),
          { operationId: operation.operationId },
        );
        if (!isLive(document, operation)) return result("stale", operation, contextId);
        return saved(document, operation, contextId, { content: operation.body, commit: acknowledgement.commit, blobSha: acknowledgement.blobSha }, acknowledgement);
      } catch (error) {
        if (!isLive(document, operation)) return result("stale", operation, contextId);
        const detail = failure(error);
        if (detail.code === "session_changed") { seal(detail, true); return result("stale", operation, contextId); }
        if (detail.status === 409) return conflicted(document, operation, contextId, detail);
        state.error = detail;
        if (detail.status === 0 || detail.status >= 500 || detail.code === "bad_response") {
          state.phase = "outcome-unknown";
          emitDocument(document);
          return completion("outcome-unknown", document, operation, contextId);
        }
        state.phase = "error";
        clearOperation(document);
        emitDocument(document);
        return completion("error", document, operation, contextId);
      }
    },
    /** Read only. A confirmed miss/baseline unlocks a subsequent user-triggered conditional save. */
    async reconcileUnknown(contextId = viewSequence): Promise<EditResult> {
      if (contextId !== viewSequence) return result("stale", undefined, contextId);
      if (!scopeMatches() || !active) return result("blocked");
      const document = active;
      const state = document.state;
      const operation = document.pending;
      if (!operation || state.phase !== "outcome-unknown" || state.recovering || !isLive(document, operation)) return result("blocked");
      state.recovering = true;
      emit();
      try {
        if (!isLive(document, operation)) return result("stale", operation, contextId);
        const current = await adapters.read(structuredClone(operation.identity), { force: true });
        if (!isLive(document, operation)) return result("stale", operation, contextId);
        if (current) {
          const pinned = await adapters.read(structuredClone(operation.identity), { revision: current.commit, force: true });
          if (!isLive(document, operation)) return result("stale", operation, contextId);
          if (!pinned || pinned.commit !== current.commit || pinned.blobSha !== current.blobSha) {
            throw new ApiError(422, "invalid_source", "");
          }
          if (canonical(pinned.content) === canonical(operation.body)) return saved(document, operation, contextId, pinned);
          if (!operation.original || pinned.blobSha !== operation.original.blobSha || canonical(pinned.content) !== canonical(operation.original.content)) {
            return conflicted(document, operation, contextId);
          }
        } else if (operation.original) {
          return conflicted(document, operation, contextId);
        }
        // Original bytes/lock are intact, or a new target is explicitly absent. No write is issued here.
        state.phase = "dirty";
        state.error = null;
        clearOperation(document);
        emitDocument(document);
        return completion("not-saved", document, operation, contextId);
      } catch (error) {
        if (!isLive(document, operation)) return result("stale", operation, contextId);
        state.error = failure(error);
        if (state.error.code === "session_changed") { seal(state.error, true); return result("stale", operation, contextId); }
        state.recovering = false;
        emitDocument(document);
        return completion("outcome-unknown", document, operation, contextId);
      }
    },
    invalidate,
    /** false means the app owner must keep this editor alive for unresolved recovery. */
    dispose(): boolean {
      if (!scopeMatches()) return true;
      if ([...documents.values()].some(document => document.pending !== null)) return false;
      seal(null, true);
      return true;
    },
    subscribe(listener: (snapshot: EditState<T>) => void): () => void {
      if (!scopeMatches()) { notify(listener); return () => {}; }
      listeners.add(listener);
      notify(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
