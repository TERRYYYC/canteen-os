/**
 * 写入语义（契约 §3.1 内容幂等 / §3.2 并发 / ADR-0007 §2 commit 形状）。
 *
 * 一次写入的完整链路：
 *   读 ref → 读目标文件 → If-Match 文件级冲突检查 → 内容幂等检查
 *   → createBlob → createTree(base_tree) → createCommit(parent=当时的 HEAD) → updateRef(非 force)
 *
 * 两层并发（§3.2）：
 *   文件级（If-Match 对不上）→ 立即 409，**不重试**（重试会覆盖别人的改动）
 *   ref 级（updateRef 不是快进）→ **重读一次并重试一次**（ADR-0007 §2 逐字），仍冲突 → 409
 *
 * 幂等命中时**一次写 API 都不调**（T-21）。
 */
import type { GitHubClient } from "./github.js";
import { bytesToBase64, commitMessage } from "./github.js";
import { gitBlobSha } from "./gitsha.js";
import { fail } from "./http.js";
import type { Role } from "./types.js";

export const SKIP_CI = "[skip ci]";

export interface CommitFileParams {
  path: string;
  bytes: Uint8Array;
  /** 首行人话。入参是「目标文件此刻是否存在」，用来分「新增」还是「更新」。 */
  subject: (exists: boolean) => string;
  role: Role;
  /** 进 X-CanteenOS-Endpoint trailer 的具体端点，如 "POST /plan/week-43"。 */
  endpoint: string;
  ifMatch: string | null;
  /** 写入 commit 带 [skip ci]（ADR-0007 §3）；只有 publish 的触发 commit 不带。 */
  skipCi?: boolean;
}

export interface CommitFileResult {
  commit: string;
  blobSha: string;
  unchanged: boolean;
  /** ref 级重试次数（0 或 1）。T-24 断言用。 */
  refRetries: number;
}

export async function commitSingleFile(
  gh: GitHubClient,
  params: CommitFileParams,
): Promise<CommitFileResult> {
  const nextBlobSha = await gitBlobSha(params.bytes);
  const base64 = bytesToBase64(params.bytes);

  for (let attempt = 0; attempt < 2; attempt++) {
    const head = await gh.getHeadSha();
    const current = await gh.getFile(params.path, head);

    // 文件级冲突：立即 409，不重试。
    if (params.ifMatch !== null && current?.sha !== params.ifMatch) {
      throw fail("conflict");
    }

    // 内容幂等：逐字节相同 → 不产生 commit，一次写 API 都不调。
    if (current && current.sha === nextBlobSha) {
      return { commit: head, blobSha: current.sha, unchanged: true, refRetries: attempt };
    }

    const blobSha = await gh.createBlob(base64, "base64");
    const baseCommit = await gh.getCommit(head);
    const treeSha = await gh.createTree(baseCommit.treeSha, [
      { path: params.path, mode: "100644", type: "blob", sha: blobSha },
    ]);
    const subject = params.subject(current !== null);
    const line = params.skipCi === false ? subject : `${subject} ${SKIP_CI}`;
    const commitSha = await gh.createCommit(
      commitMessage(line, params.role, params.endpoint),
      treeSha,
      [head],
    );

    if (await gh.updateRef(commitSha)) {
      return { commit: commitSha, blobSha, unchanged: false, refRetries: attempt };
    }
    // 不是快进：别人抢先推了 main。重读一次并重试一次。
  }

  throw fail("conflict");
}
