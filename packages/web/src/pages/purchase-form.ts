/** Page controller: C2 owns derivations and fixed handles; C1 is the only document store. */
import { normalizeSelection, type ShoppingBasis, type ShoppingDecision, type ShoppingItem, type ShoppingList } from '@canteenos/core';
import type { TeamMealsApi } from '../api/team-meals';
import { ApiError, type Source } from '../api/types';
import { createEditSession } from '../view-models/edit-session';
import { createTeamMealsViewModel, type SavedTeamMealsView, type SavedViewRequest, type ShoppingListView, type ShoppingReviewView } from '../view-models/team-meals';

/** Presentation metadata only. Current list body lives exclusively in the C1 session. */
export interface PurchaseReview {
  previous: SavedTeamMealsView;
  added: string[];
  removed: ShoppingItem[];
  reviewRequired: string[];
  retained: string[];
}
export type PurchaseConflict = ShoppingListView;
const sameBasis = (a: ShoppingBasis, b: ShoppingBasis): boolean => a.sourceRevision === b.sourceRevision &&
  JSON.stringify(normalizeSelection(a.selection)) === JSON.stringify(normalizeSelection(b.selection));
const handleBasis = (view: SavedTeamMealsView): ShoppingBasis => ({ sourceRevision: view.sourceRevision, selection: view.projection.selection });
const reviewMetadata = (review: ShoppingReviewView): PurchaseReview => ({ previous: review.previous,
  ...structuredClone({ added: review.result.added, removed: review.result.removed, reviewRequired: review.result.reviewRequired, retained: review.result.retained }),
});

export function createPurchaseForm(api: TeamMealsApi, options: { at: string }) {
  const at = options.at;
  const auth = api.sessionKey();
  const vm = createTeamMealsViewModel(api);
  const metadata = new Map<string, { basis: SavedTeamMealsView; review: PurchaseReview | null }>();
  const comparisons = new WeakMap<PurchaseConflict, { id: string; source: Source<ShoppingList>; basis: SavedTeamMealsView }>();
  let sequence = 0;
  let sealed = false;
  const session = createEditSession<ShoppingList>({
    mode: () => api.mode, authSession: () => api.sessionKey(),
    save: (identity, body, condition) => api.saveShoppingList(identity.id, body, condition),
    read: (identity, opts) => api.getShoppingList(identity.id, opts),
  });
  function guard(): void {
    if (sealed || api.sessionKey() !== auth) {
      sealed = true; metadata.clear(); vm.dispose();
      session.getState();
      throw new ApiError(0, 'session_changed', '');
    }
  }
  function current() {
    guard();
    const state = session.getState();
    const record = state.phase !== 'closed' && state.identity ? metadata.get(state.identity.id) : undefined;
    return { state, record };
  }
  function canDecide(): boolean {
    const { state, record } = current();
    return !!record && !!state.draft && !!state.source && !state.operationId && state.phase !== 'conflict' &&
      sameBasis(state.source.content.basis, state.draft.basis) && sameBasis(state.draft.basis, handleBasis(record.basis));
  }
  function canRebase(): boolean {
    const { state, record } = current();
    return !!record && !!state.source && !!state.draft && !state.dirty && !state.operationId && state.phase !== 'conflict';
  }
  function bindingMatches(): boolean {
    const { state, record } = current();
    return !!record && !!state.draft && sameBasis(state.draft.basis, handleBasis(record.basis));
  }
  function loadTicket(isCurrent: () => boolean) {
    const ticket = ++sequence;
    return () => {
      guard();
      return ticket === sequence && isCurrent();
    };
  }
  function editTicket(isCurrent: () => boolean = () => true) {
    const start = session.getState(), live = loadTicket(isCurrent);
    return () => {
      if (!live()) return false;
      const state = session.getState();
      return state.contextId === start.contextId && state.identity?.id === start.identity?.id &&
        state.generation === start.generation && state.operationId === start.operationId &&
        state.source?.blobSha === start.source?.blobSha;
    };
  }
  return {
    api, session,
    get basis(): SavedTeamMealsView | null { return current().record?.basis ?? null; },
    get review(): PurchaseReview | null {
      const value = current().record?.review;
      return value ? { previous: value.previous, ...structuredClone({ added: value.added, removed: value.removed, reviewRequired: value.reviewRequired, retained: value.retained }) } : null;
    },
    get canDecide(): boolean { return canDecide(); },
    get canRebase(): boolean { return canRebase(); },
    async load(id: string, isCurrent: () => boolean = () => true): Promise<SavedTeamMealsView | null> {
      guard();
      const live = loadTicket(isCurrent), known = metadata.get(id);
      if (known) {
        if (!live()) return null;
        const state = session.getState();
        if (state.identity?.id === id && state.phase !== 'closed') session.refreshView();
        else session.open({ kind: 'shopping-list', id }, vm.createList(id, known.basis), null);
        return known.basis;
      }
      const loaded = await vm.loadList(id, { at });
      if (!live() || !loaded) return null;
      metadata.set(id, { basis: loaded.basis, review: null });
      session.open({ kind: 'shopping-list', id }, loaded.source.content, loaded.source);
      return loaded.basis;
    },
    /** Derive all-check from a genuine C2 saved handle. Saving is a separate explicit action. */
    async create(id: string, request: SavedViewRequest, isCurrent: () => boolean = () => true): Promise<SavedTeamMealsView | null> {
      guard();
      if (metadata.has(id)) throw new ApiError(409, 'conflict', '');
      const live = loadTicket(isCurrent);
      const basis = await vm.loadSaved(request);
      if (!live()) return null;
      const list = vm.createList(id, basis);
      metadata.set(id, { basis, review: null });
      session.open({ kind: 'shopping-list', id }, list, null);
      return basis;
    },
    /** A clean acknowledged old body is mandatory; never quietly save it as part of rebase. */
    async rebase(request: SavedViewRequest, isCurrent: () => boolean = () => true): Promise<PurchaseReview | null> {
      if (!canRebase()) return null;
      const { state, record } = current(), live = editTicket(isCurrent);
      const capturedRequest = structuredClone(request);
      const next = await vm.loadSaved(capturedRequest);
      if (!live()) return null;
      const reviewed = await vm.reviewList(state.source!.content, next, { at: capturedRequest.at, force: true });
      if (!live()) return null;
      // Bind the genuine next handle before C1 emits so observers see a consistent basis/body pair.
      const oldBasis = record!.basis, oldReview = record!.review;
      record!.basis = next; record!.review = reviewMetadata(reviewed);
      if (!session.edit(reviewed.result.list, state.contextId)) {
        record!.basis = oldBasis; record!.review = oldReview; return null;
      }
      return { previous: reviewed.previous, ...structuredClone({ added: reviewed.result.added, removed: reviewed.result.removed, reviewRequired: reviewed.result.reviewRequired, retained: reviewed.result.retained }) };
    },
    /** False means wait for creation/rebase acknowledgement or the unresolved save/conflict. */
    decide(ingredientRef: string, decision: ShoppingDecision, bought?: boolean, contextId = session.getState().contextId): boolean {
      if (!canDecide()) return false;
      const { state, record } = current();
      if (state.contextId !== contextId) return false;
      const next = vm.decide(state.draft!, record!.basis, ingredientRef, decision, bought);
      return session.edit(next, contextId);
    },
    async save(contextId = session.getState().contextId) {
      if (!bindingMatches()) return null;
      return session.save(contextId);
    },
    async compareRemote(isCurrent: () => boolean = () => true): Promise<PurchaseConflict | null> {
      const { state } = current();
      if (!state.identity || state.operationId || state.phase !== 'conflict') return null;
      const live = editTicket(isCurrent);
      const remote = await vm.loadList(state.identity.id, { at, force: true });
      if (!live() || !remote) return null;
      // The returned object is presentation only; adoption uses this captured source and real handle.
      const result = { source: structuredClone(remote.source), basis: remote.basis };
      comparisons.set(result, { id: state.identity.id, source: structuredClone(remote.source), basis: remote.basis });
      return result;
    },
    /** Different-basis keep-local means keep local scope, re-review remote decisions through core. */
    async adoptRemote(remote: PurchaseConflict, choice: 'remote' | 'keep-local', isCurrent: () => boolean = () => true): Promise<boolean> {
      const { state, record } = current(), captured = comparisons.get(remote);
      if (!captured || !record || !state.identity || captured.id !== state.identity.id || state.operationId || state.phase !== 'conflict') return false;
      const live = editTicket(isCurrent);
      let nextBody: ShoppingList, nextBasis: SavedTeamMealsView, nextReview: PurchaseReview | null;
      if (choice === 'remote') {
        nextBody = captured.source.content; nextBasis = captured.basis; nextReview = null;
      } else if (sameBasis(state.draft!.basis, captured.source.content.basis)) {
        nextBody = state.draft!; nextBasis = captured.basis; nextReview = record.review;
      } else {
        const reviewed = await vm.reviewList(captured.source.content, record.basis, { at, force: true });
        if (!live()) return false;
        nextBody = reviewed.result.list; nextBasis = record.basis; nextReview = reviewMetadata(reviewed);
      }
      if (!live()) return false;
      const previousBasis = record.basis, previousReview = record.review;
      record.basis = nextBasis; record.review = nextReview;
      if (!session.replace(nextBody, captured.source, state.contextId)) {
        record.basis = previousBasis; record.review = previousReview; return false;
      }
      comparisons.delete(remote);
      return true;
    },
    /** C1 performs current + exact-commit force reads; this method never writes. */
    async reconcileUnknown(contextId = session.getState().contextId) { guard(); return session.reconcileUnknown(contextId); },
    async getAsset(owner: string, pointer: string) {
      const { record } = current();
      if (!record || !bindingMatches()) throw new ApiError(0, 'basis_mismatch', '');
      return vm.getAsset(record.basis, { owner, pointer });
    },
    refresh(): number { guard(); ++sequence; return session.refreshView(); },
    detach(): void { guard(); ++sequence; session.invalidate(); },
    /** Unresolved writes keep this controller/VM alive for recovery when the user returns. */
    dispose(): boolean {
      if (!session.dispose()) return false;
      ++sequence; sealed = true; metadata.clear(); vm.dispose(); return true;
    },
  };
}
