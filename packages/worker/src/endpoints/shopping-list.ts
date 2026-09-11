import { applyShoppingDecision, createShoppingList, reconcileShoppingList } from '@canteenos/core';
import type { ShoppingList } from '@canteenos/core';
import type { Ctx } from '../context.js';
import { githubClient } from '../context.js';
import { fail, ReviewRequiredError, validationFailure } from '../http.js';
import { entityPath } from '../paths.js';
import { writePrecondition } from '../preconditions.js';
import { stableSerialize } from '../serialize.js';
import { resolveListRevisions } from '../shopping-basis.js';
import { createShoppingInputReader } from '../shopping-inputs.js';
import { assertCandidates, normalizeList, sameValue, validateStoredList } from '../shopping-validation.js';
import { parseSource } from '../source.js';
import { validateEntity } from '../validate.js';
import { commitSingleFile } from '../write.js';
import { asObject, assertId } from './entities.js';
import type { WriteResponse } from './entities.js';

/** A single locked blob owns both the source basis and every manual decision. */
export async function handleShoppingList(ctx: Ctx): Promise<WriteResponse> {
  const id = assertId(ctx.params.id ?? '');
  const body = asObject(ctx.body);
  const validation = validateEntity('shopping-list', body);
  if (!validation.valid) throw validationFailure(validation.errors);
  const received = body as unknown as ShoppingList;
  const next = normalizeList(received);
  const gh = githubClient(ctx);
  const readInputs = createShoppingInputReader(gh);
  const path = entityPath('shopping-list', id);
  const outcome = await commitSingleFile(gh, {
    path, bytes: new TextEncoder().encode(stableSerialize(next)),
    subject: exists => `data(shopping-list): ${exists ? '更新' : '新增'} ${id}`,
    role: ctx.role, endpoint: ctx.endpointConcrete, ifMatch: null,
    precondition: writePrecondition(ctx.request.headers),
    verify: async (head, current) => {
      const checkedRevisions = new Set<string>();
      if (next.id !== id) throw fail('invalid_selection', { path: '/id' });
      await resolveListRevisions(gh, head, next, checkedRevisions);
      const inputs = await readInputs(next.basis);
      const fresh = createShoppingList(id, next.basis, inputs);
      if (!current) {
        assertCandidates(received, fresh, 'invalid_selection');
        for (const [index, item] of received.items.entries()) {
          if (item.decision !== 'check') throw fail('invalid_selection', { path: `/items/${index}/decision` });
          if (item.previous) throw fail('invalid_selection', { path: `/items/${index}/previous` });
        }
        return;
      }
      const stored = parseSource(current.text, 'shopping-list', path) as ShoppingList;
      const previousInputs = await validateStoredList(gh, head, stored, id, readInputs, checkedRevisions);
      const previous = normalizeList(stored);
      if (!sameValue(previous.basis, next.basis)) {
        const reconciled = reconcileShoppingList(previous, previousInputs, next.basis, inputs);
        if (!sameValue(next, normalizeList(reconciled.list))) throw new ReviewRequiredError(reconciled.reviewRequired);
        return;
      }
      assertCandidates(received, fresh, 'invalid_selection');
      for (const [index, item] of received.items.entries()) {
        const normalized = next.items.find(value => value.ingredientRef === item.ingredientRef)!;
        const old = previous.items.find(value => value.ingredientRef === item.ingredientRef)!;
        if (sameValue(old, normalized)) continue;
        if (item.decision !== 'check' && !Object.hasOwn(inputs.ingredients, item.ingredientRef)) {
          throw fail('unresolved_reference', { path: `/items/${index}/ingredientRef` });
        }
        const applied = applyShoppingDecision(previous, item.ingredientRef, item.decision, item.bought)
          .items.find(value => value.ingredientRef === item.ingredientRef)!;
        if (!sameValue(applied, normalized)) throw fail('invalid_selection', { path: `/items/${index}/previous` });
      }
    },
  });
  return { ok: true, commit: outcome.commit, blobSha: outcome.blobSha, unchanged: outcome.unchanged, warnings: ctx.warnings };
}
