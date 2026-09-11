import type { GitHubClient } from './github.js';
import { fail } from './http.js';

export const FULL_REVISION = /^[0-9a-f]{40}$/;
/** Caller captures H after authorization, once per request (or write attempt). */
export async function resolveRevision(
  gh: GitHubClient, head: string, raw: string | null,
  unavailable: 'revision_unavailable' | 'basis_unavailable' = 'revision_unavailable',
): Promise<string> {
  if (raw === null) return head;
  if (!FULL_REVISION.test(raw)) throw fail('invalid_revision');
  if (raw === head) return head;
  const commit = await gh.resolveCommit(raw);
  if (!commit || commit.sha !== raw || !(await gh.isAncestor(raw, head))) throw fail(unavailable);
  return raw;
}
