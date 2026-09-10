/**
 * Memory-only editor for a JSON document. A save acknowledges its submitted generation;
 * it does not publish, replace later edits, confirm shopping decisions, or retry itself.
 *
 * Pages must open a new context on entity/language/auth changes and invalidate on exit.
 * open() returns a contextId for guarding later page callbacks (edit/save accept it).
 * After a conflict, explicitly resolve against a freshly read Source and open again.
 * Adapters must save the whole supplied body unchanged and read null only for not_found.
 */
import { ApiError } from "../api/types";
import type { ApiMode, FieldError, Source, WriteCondition, WriteResult } from "../api/types";

export interface EditIdentity {
  kind: "plan" | "dish" | "shopping-list";
  id: string;
}

export interface EditAdapters<T> {
  mode(): ApiMode;
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
  let pending: Operation<T> | null = null;
  let state: EditState<T> = {
    contextId: 0, identity: null, generation: 0, mode: adapters.mode(), phase: "closed",
    dirty: false, draft: null, source: null, operationId: null, recovering: false, lastSave: null, error: null,
  };
  const listeners = new Set<(snapshot: EditState<T>) => void>();
  const getState = (): EditState<T> => structuredClone(state);
  const notify = (listener: (snapshot: EditState<T>) => void) => {
    // Rendering failures cannot convert a committed write into a retryable failure.
    try { listener(getState()); } catch { /* observer owns its rendering error */ }
  };
  const emit = () => { for (const listener of listeners) notify(listener); };
  const result = (status: EditResult["status"], operation?: Operation<T>): EditResult => ({
    status, contextId: operation?.contextId ?? state.contextId, mode: operation?.mode ?? state.mode,
    ...(operation ? { operationId: operation.operationId } : {}),
  });
  const invalidate = () => {
    state.contextId++;
    state.phase = "closed";
    state.operationId = null;
    state.recovering = false;
    pending = null;
    emit();
  };
  const modeMatches = () => {
    if (adapters.mode() === state.mode) return true;
    state.error = localFailure("mode_changed");
    invalidate();
    return false;
  };
  const isCurrent = (operation: Operation<T>) => pending === operation && state.contextId === operation.contextId && modeMatches();
  const clearOperation = () => { pending = null; state.operationId = null; state.recovering = false; };
  const saved = (operation: Operation<T>, source: Source<T>, acknowledgement?: WriteResult) => {
    state.source = structuredClone(source);
    state.lastSave = {
      operationId: operation.operationId, generation: operation.generation, mode: operation.mode,
      commit: source.commit, blobSha: source.blobSha, reconciled: !acknowledgement,
      ...(acknowledgement ? { unchanged: acknowledgement.unchanged, warnings: [...acknowledgement.warnings] } : {}),
    };
    state.dirty = state.generation !== operation.generation;
    state.phase = state.dirty ? "dirty" : "saved-but-unpublished";
    state.error = null;
    clearOperation();
    emit();
    return result("saved", operation);
  };
  const conflicted = (operation: Operation<T>, error = localFailure("conflict", 409)) => {
    state.phase = "conflict";
    state.error = error;
    clearOperation();
    emit();
    return result("conflict", operation);
  };

  return {
    getState,
    /** Passing a local draft and its latest resolved source preserves edits after explicit conflict handling. */
    open(identity: EditIdentity, draft: T, source: Source<T> | null = null): number {
      const dirty = source === null || canonical(draft) !== canonical(source.content);
      state = {
        contextId: state.contextId + 1, identity: structuredClone(identity), generation: 0,
        mode: adapters.mode(), phase: dirty ? "dirty" : "clean", dirty, draft: structuredClone(draft),
        source: structuredClone(source), operationId: null, recovering: false, lastSave: null, error: null,
      };
      pending = null;
      emit();
      return state.contextId;
    },
    edit(draft: T, contextId = state.contextId): boolean {
      if (contextId !== state.contextId || state.phase === "closed" || !modeMatches()) return false;
      if (canonical(draft) === canonical(state.draft)) return true;
      state.draft = structuredClone(draft);
      state.generation++;
      state.dirty = true;
      if (!pending && state.phase !== "conflict") { state.phase = "dirty"; state.error = null; }
      emit();
      return true;
    },
    async save(contextId = state.contextId): Promise<EditResult> {
      if (contextId !== state.contextId) return result("stale");
      if (state.phase === "closed" || !modeMatches() || !state.identity || !state.draft) return result("blocked");
      if (pending || state.phase === "conflict") return result("blocked", pending ?? undefined);
      if (state.mode === "unconfigured") {
        state.error = localFailure("unconfigured");
        emit();
        return result("blocked");
      }
      if (!state.dirty) return result("unchanged");
      const operation: Operation<T> = {
        contextId: state.contextId, identity: structuredClone(state.identity), generation: state.generation,
        operationId: `edit-${sessionId}-${++operationSequence}`, mode: state.mode,
        body: structuredClone(state.draft), original: structuredClone(state.source),
        condition: state.source ? { ifMatch: state.source.blobSha } : { ifNoneMatch: "*" },
      };
      pending = operation;
      state.phase = "saving";
      state.operationId = operation.operationId;
      state.error = null;
      emit();
      if (!isCurrent(operation)) return result("stale", operation);
      try {
        const acknowledgement = await adapters.save(
          structuredClone(operation.identity), structuredClone(operation.body), structuredClone(operation.condition),
          { operationId: operation.operationId },
        );
        if (!isCurrent(operation)) return result("stale", operation);
        return saved(operation, { content: operation.body, commit: acknowledgement.commit, blobSha: acknowledgement.blobSha }, acknowledgement);
      } catch (error) {
        if (!isCurrent(operation)) return result("stale", operation);
        const detail = failure(error);
        if (detail.status === 409) return conflicted(operation, detail);
        state.error = detail;
        if (detail.status === 0 || detail.status >= 500 || detail.code === "bad_response") {
          state.phase = "outcome-unknown";
          emit();
          return result("outcome-unknown", operation);
        }
        state.phase = "error";
        clearOperation();
        emit();
        return result("error", operation);
      }
    },
    /** Read only. A confirmed miss/baseline unlocks a subsequent user-triggered conditional save. */
    async reconcileUnknown(): Promise<EditResult> {
      const operation = pending;
      if (!operation || state.phase !== "outcome-unknown" || state.recovering || !isCurrent(operation)) return result("blocked");
      state.recovering = true;
      emit();
      try {
        if (!isCurrent(operation)) return result("stale", operation);
        const current = await adapters.read(structuredClone(operation.identity), { force: true });
        if (!isCurrent(operation)) return result("stale", operation);
        if (current) {
          const pinned = await adapters.read(structuredClone(operation.identity), { revision: current.commit, force: true });
          if (!isCurrent(operation)) return result("stale", operation);
          if (!pinned || pinned.commit !== current.commit || pinned.blobSha !== current.blobSha) {
            throw new ApiError(422, "invalid_source", "");
          }
          if (canonical(pinned.content) === canonical(operation.body)) return saved(operation, pinned);
          if (!operation.original || pinned.blobSha !== operation.original.blobSha || canonical(pinned.content) !== canonical(operation.original.content)) {
            return conflicted(operation);
          }
        } else if (operation.original) {
          return conflicted(operation);
        }
        // Original bytes/lock are intact, or a new target is explicitly absent. No write is issued here.
        state.phase = "dirty";
        state.error = null;
        clearOperation();
        emit();
        return result("not-saved", operation);
      } catch (error) {
        if (!isCurrent(operation)) return result("stale", operation);
        state.error = failure(error);
        state.recovering = false;
        emit();
        return result("outcome-unknown", operation);
      }
    },
    invalidate,
    dispose() { invalidate(); listeners.clear(); },
    subscribe(listener: (snapshot: EditState<T>) => void): () => void {
      listeners.add(listener);
      notify(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
