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
import { fail, HttpError } from "../http.js";
import { localAssetPath } from "../asset-path.js";
import { inspectImage } from "../image-integrity.js";
import { resolveRevision } from "../revision.js";
import { parseSource, parseTranslationLock } from "../source.js";
import { SKIP_CI } from "../write.js";

type EntryMap = Map<string, TreeEntry>;
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
    const current = await listEntries(gh, headCommit.treeSha);
    const historical = target === head ? current : await listEntries(gh, targetCommit.treeSha);
    const candidate = new Map(current);

    for (const path of current.keys()) {
      if (isKnowledgePath(path) && !historical.has(path)) candidate.delete(path);
    }
    for (const [path, entry] of historical) {
      if (isKnowledgePath(path)) candidate.set(path, entry);
    }

    await validateRollbackCandidate(gh, current, historical, candidate);
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

async function listEntries(gh: GitHubClient, treeSha: string): Promise<EntryMap> {
  const entries = await gh.getTree(treeSha, true);
  // Keep submodules and malformed source directories visible to validation. Only
  // ordinary directory scaffolding is omitted from the per-file candidate map.
  return new Map(entries.filter((entry) => entry.type !== "tree" || entry.mode !== "040000" || entry.path.endsWith(".json"))
    .map((entry) => [entry.path, entry]));
}

function treeChanges(current: EntryMap, candidate: EntryMap): TreeChange[] {
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
 * Validate the complete candidate before createTree on every attempt, even when
 * its knowledge blobs match HEAD. Existing v3 protection precedes candidate errors.
 */
async function validateRollbackCandidate(gh: GitHubClient, current: EntryMap, historical: EntryMap, candidate: EntryMap): Promise<void> {
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

  for (const input of [current, historical]) {
    for (const [path, entry] of input) {
      if (path === "data" || /^data\/(ingredients|dishes|menu-plans)$/.test(path)) {
        throw fail("invalid_source", { path });
      }
      if (isKnowledgePath(path) && (entry.type !== "blob" || entry.mode !== "100644")) {
        throw fail("invalid_source", { path });
      }
    }
  }

  if (!candidate.has("data/techniques.json")) throw fail("invalid_source", { path: "data/techniques.json" });
  const sources = new Map<string, unknown>();
  for (const [path, entry] of candidate) {
    if (!isKnowledgePath(path) || !path.endsWith(".json")) continue;
    const text = await gh.getBlobText(entry.sha);
    if (path === "data/translations.lock.json") {
      parseTranslationLock(text);
    } else if (path === "data/techniques.json") {
      sources.set(path, parseSource(text, "techniques", path));
    } else {
      const match = /^data\/(ingredients|dishes|menu-plans)\/[a-z][a-z0-9-]*\.json$/.exec(path);
      if (!match) throw fail("invalid_source", { path });
      const kind = match[1] === "ingredients" ? "ingredient" : match[1] === "dishes" ? "dish" : "plan";
      sources.set(path, parseSource(text, kind, path));
    }
  }

  const techniques = sources.get("data/techniques.json") as Array<{ id: string }>;
  const techniqueIds = new Set(techniques.map((technique) => technique.id));
  for (const [path, value] of sources) {
    if (path.startsWith("data/menu-plans/")) {
      for (const meal of (value as { meals: Array<{ dishRef: string }> }).meals) {
        if (!sources.has(`data/dishes/${meal.dishRef}.json`)) throw fail("invalid_source", { path });
      }
    } else if (path.startsWith("data/dishes/")) {
      const dish = value as {
        components?: Array<{ ingredientRef: string; prep?: { techniqueRef: string } }>;
        steps?: Array<{ techniqueRef?: string }>;
      };
      for (const component of dish.components ?? []) {
        if (!sources.has(`data/ingredients/${component.ingredientRef}.json`) ||
            (component.prep && !techniqueIds.has(component.prep.techniqueRef))) {
          throw fail("invalid_source", { path });
        }
      }
      for (const step of dish.steps ?? []) {
        if (step.techniqueRef !== undefined && !techniqueIds.has(step.techniqueRef)) {
          throw fail("invalid_source", { path });
        }
      }
    }
  }

  await validateCandidateImages(gh, candidate, sources);
}

async function validateCandidateImages(gh: GitHubClient, candidate: EntryMap, sources: Map<string, unknown>): Promise<void> {
  const checked = new Set<string>();
  for (const [owner, value] of sources) {
    const refs: Array<{ pointer: string; src: string }> = [];
    const add = (pointer: string, image: unknown): void => {
      if (image !== undefined) refs.push({ pointer, src: (image as { src: string }).src });
    };
    if (owner === "data/techniques.json") {
      for (const [index, technique] of (value as Array<{ image?: unknown }>).entries()) add(`/${index}/image`, technique.image);
    } else if (!owner.startsWith("data/menu-plans/")) {
      const source = value as { image?: unknown; components?: Array<{ prep?: { image?: unknown } }>; steps?: Array<{ image?: unknown }> };
      add("/image", source.image);
      for (const [index, component] of (source.components ?? []).entries()) add(`/components/${index}/prep/image`, component.prep?.image);
      for (const [index, step] of (source.steps ?? []).entries()) add(`/steps/${index}/image`, step.image);
    }
    for (const { pointer, src } of refs) {
      const errorPath = `${owner}#${pointer}`;
      let imagePath: string | null;
      try {
        imagePath = localAssetPath(owner, src);
      } catch (error) {
        if (error instanceof HttpError) throw fail("invalid_source", { path: errorPath });
        throw error;
      }
      // An external source remains metadata; rollback never fetches mutable bytes.
      if (imagePath === null) continue;
      const entry = candidate.get(imagePath);
      if (!entry || entry.type !== "blob" || entry.mode !== "100644") throw fail("invalid_source", { path: errorPath });
      const cacheKey = `${imagePath}\0${entry.sha}`;
      if (checked.has(cacheKey)) continue;
      const info = inspectImage(await gh.getBlobBytes(entry.sha));
      if (!info || !imagePath.endsWith(`.${info.ext}`)) throw fail("invalid_source", { path: errorPath });
      checked.add(cacheKey);
    }
  }
}
