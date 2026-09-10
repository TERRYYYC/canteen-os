/**
 * POST /rollback/:sha restores only the knowledge paths in team-meals contract §6.
 * Every attempt starts at one head: current lists and unrelated paths remain in its
 * base tree, version guards run before any write, and the new commit uses that head
 * as its parent. A ref conflict repeats all of those checks once.
 */
import type { Ctx } from "../context.js";
import { githubClient } from "../context.js";
import type { GitHubClient, TreeEntry } from "../github.js";
import { commitMessage } from "../github.js";
import { fail } from "../http.js";
import { resolveRevision } from "../revision.js";
import { SKIP_CI } from "../write.js";

type BlobMap = Map<string, TreeEntry>;
type TreeChange = { path: string; mode: string; type: string; sha: string | null };

/** Do not replace data/ as a subtree: future paths are preserved by default. */
function isKnowledgePath(path: string): boolean {
  return /^data\/(ingredients|dishes|menu-plans)\//.test(path)
    || path === "data/techniques.json"
    || path === "data/translations.lock.json";
}

export async function handleRollback(ctx: Ctx): Promise<unknown> {
  const raw = ctx.params.sha ?? "";
  const gh = githubClient(ctx);

  for (let attempt = 0; attempt < 2; attempt++) {
    const head = await gh.getHeadSha();
    const target = await resolveRevision(gh, head, raw);
    const headCommit = await gh.getCommit(head);
    const targetCommit = target === head ? headCommit : await gh.getCommit(target);
    const current = await listBlobs(gh, headCommit.treeSha);
    const historical = target === head ? current : await listBlobs(gh, targetCommit.treeSha);
    const candidate = new Map(current);

    for (const path of current.keys()) {
      if (isKnowledgePath(path) && !historical.has(path)) candidate.delete(path);
    }
    for (const [path, entry] of historical) {
      if (isKnowledgePath(path)) candidate.set(path, entry);
    }

    await validateRollbackCandidate(gh, current, candidate);
    const changes = treeChanges(current, candidate);
    if (changes.length === 0) {
      return { ok: true, commit: head, restoredFrom: target, changedFiles: 0, unchanged: true };
    }

    const treeSha = await gh.createTree(headCommit.treeSha, changes);
    const subject = `revert(data): 恢复到 ${target.slice(0, 7)} ${SKIP_CI}`;
    const commitSha = await gh.createCommit(
      commitMessage(subject, ctx.role, ctx.endpointConcrete),
      treeSha,
      [head],
    );
    if (await gh.updateRef(commitSha)) {
      return {
        ok: true,
        commit: commitSha,
        restoredFrom: target,
        changedFiles: changes.length,
        unchanged: false,
      };
    }
  }

  throw fail("conflict");
}

async function listBlobs(gh: GitHubClient, treeSha: string): Promise<BlobMap> {
  const entries = await gh.getTree(treeSha, true);
  return new Map(entries.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry]));
}

function treeChanges(current: BlobMap, candidate: BlobMap): TreeChange[] {
  const changes: TreeChange[] = [];
  for (const [path, next] of candidate) {
    const before = current.get(path);
    if (before?.sha !== next.sha || before.mode !== next.mode) {
      changes.push({ path, mode: next.mode, type: next.type, sha: next.sha });
    }
  }
  for (const [path, before] of current) {
    if (!candidate.has(path)) changes.push({ path, mode: before.mode, type: before.type, sha: null });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * This candidate validation boundary runs before createTree on every attempt.
 * B1 enforces the persistent version guard. B2 adds the shared version-selected
 * schema and reference validation here, against this complete candidate map.
 */
async function validateRollbackCandidate(gh: GitHubClient, current: BlobMap, candidate: BlobMap): Promise<void> {
  const versions = new Map<string, "2" | "3">();
  const readVersion = async (path: string, entry: TreeEntry): Promise<"2" | "3"> => {
    if (entry.mode !== "100644") throw fail("invalid_source", { path });
    const cacheKey = `${path}\0${entry.sha}`;
    const cached = versions.get(cacheKey);
    if (cached) return cached;
    const text = await gh.getBlobText(entry.sha);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      if (error instanceof SyntaxError) throw fail("invalid_source", { path });
      throw error;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw fail("invalid_source", { path });
    }
    const explicit = (value as { schemaVersion?: unknown }).schemaVersion;
    const version = explicit === undefined && path.startsWith("data/dishes/") ? "2" : explicit;
    if (version !== "2" && version !== "3") throw fail("invalid_source", { path });
    versions.set(cacheKey, version);
    return version;
  };

  for (const [path, before] of current) {
    if (!/^data\/(menu-plans|dishes)\/[^/]+\.json$/.test(path)) continue;
    if (await readVersion(path, before) !== "3") continue;
    const next = candidate.get(path);
    if (!next || await readVersion(path, next) !== "3") {
      throw fail("format_downgrade", { path });
    }
  }
}
