/**
 * POST /rollback/:sha（契约 §1.6 / §4.5，ADR-0007 §7 逐字）：
 *   读目标 sha 的 data/ 目录树 → 用 Git Data API 造一个新 tree（**只替换 data/ 这一个条目，
 * 其余路径原样保留**）→ 以当前 main 为父提交 → 更新 ref（**非 force**）。
 *
 * 三条硬约束：绝不 force push（历史不改写）；只回退 data/；**回退不自动发布** ——
 * 所以 commit 带 [skip ci]（D-15，§7 的必然推论）。权限只有 admin。
 */
import type { Ctx } from "../context.js";
import { githubClient } from "../context.js";
import type { GitHubClient } from "../github.js";
import { commitMessage } from "../github.js";
import { fail } from "../http.js";
import { SHA_RE, looksLikeTraversal } from "../paths.js";
import { SKIP_CI } from "../write.js";

const DATA_DIR = "data";
const TREE_MODE = "040000";

export async function handleRollback(ctx: Ctx): Promise<unknown> {
  const raw = ctx.params.sha ?? "";
  if (looksLikeTraversal(raw)) throw fail("bad_path");
  if (!SHA_RE.test(raw)) throw fail("bad_id", { message: "版本号只能是 7–40 位十六进制" });

  const gh = githubClient(ctx);
  const target = await gh.resolveCommit(raw);
  if (!target) throw fail("not_found");

  const targetCommit = await gh.getCommit(target.sha);
  const targetDataSha = await dataTreeSha(gh, targetCommit.treeSha);
  if (!targetDataSha) throw fail("not_found", { message: "那个版本里没有 data/ 目录" });

  for (let attempt = 0; attempt < 2; attempt++) {
    const head = await gh.getHeadSha();
    const headCommit = await gh.getCommit(head);
    const headDataSha = await dataTreeSha(gh, headCommit.treeSha);

    if (headDataSha === targetDataSha) {
      // data/ 已经就是那个版本：不造空 commit（与 §3.1 的内容幂等同一口径）。
      return { ok: true, commit: head, restoredFrom: target.sha, changedFiles: 0, unchanged: true };
    }

    const changedFiles = await countChangedFiles(gh, headDataSha, targetDataSha);

    // 只替换 data/ 这一个条目，其余路径由 base_tree 原样保留。
    const treeSha = await gh.createTree(headCommit.treeSha, [
      { path: DATA_DIR, mode: TREE_MODE, type: "tree", sha: targetDataSha },
    ]);
    const subject = `revert(data): 恢复到 ${target.sha.slice(0, 7)} ${SKIP_CI}`;
    const commitSha = await gh.createCommit(
      commitMessage(subject, ctx.role, ctx.endpointConcrete),
      treeSha,
      [head],
    );
    if (await gh.updateRef(commitSha)) {
      return {
        ok: true,
        commit: commitSha,
        restoredFrom: target.sha,
        changedFiles,
        unchanged: false,
      };
    }
  }

  throw fail("conflict");
}

async function dataTreeSha(gh: GitHubClient, rootTreeSha: string): Promise<string | null> {
  const entries = await gh.getTree(rootTreeSha, false);
  const dir = entries.find((e) => e.path === DATA_DIR && e.type === "tree");
  return dir?.sha ?? null;
}

/** #25 的二次确认弹框要显示「会改动几个文件」。按 path→blob sha 的对称差集算。 */
async function countChangedFiles(gh: GitHubClient, fromSha: string | null, toSha: string): Promise<number> {
  const to = await listBlobs(gh, toSha);
  const from = fromSha ? await listBlobs(gh, fromSha) : new Map<string, string>();
  let changed = 0;
  for (const [path, sha] of to) if (from.get(path) !== sha) changed++;
  for (const path of from.keys()) if (!to.has(path)) changed++;
  return changed;
}

async function listBlobs(gh: GitHubClient, treeSha: string): Promise<Map<string, string>> {
  const entries = await gh.getTree(treeSha, true);
  const out = new Map<string, string>();
  for (const entry of entries) if (entry.type === "blob") out.set(entry.path, entry.sha);
  return out;
}
