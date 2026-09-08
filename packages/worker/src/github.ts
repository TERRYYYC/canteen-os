/**
 * GitHub 客户端。**唯一**碰 GitHub API 的地方，构造时注入 fetch —— L1 契约测试就靠
 * 这个注入点打桩（契约 §6.0 的 L1 行：「GitHub API 用 fetch stub」）。
 *
 * 写入一律走 Git Data API（blob → tree → commit → 更新 ref，非 force），
 * 而不是 Contents API：回退（ADR-0007 §7）本来就必须用 Git Data API 造 tree，
 * 两条路合成一条，父提交也才控制得住（乐观锁的 ref 级那一半）。
 */
import type { Role } from "./types.js";

export const BOT_NAME = "canteenos-bot";
export const BOT_EMAIL = "canteenos-bot@users.noreply.github.com";

export class UpstreamError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

export interface GitHubConfig {
  repo: string;
  branch: string;
  apiBase: string;
  token: string;
  fetch: typeof fetch;
}

export interface FileContent {
  /** blob sha（If-Match 与幂等比较都用它 / 用内容）。 */
  sha: string;
  text: string;
}

export interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
}

export interface CommitInfo {
  sha: string;
  treeSha: string;
  message: string;
  authoredAt: string;
}

export interface CompareCommit {
  sha: string;
  message: string;
  authoredAt: string;
}

export interface WorkflowRun {
  id: number;
  name: string | null;
  status: string | null;
  conclusion: string | null;
  htmlUrl: string;
  headSha: string;
  createdAt: string;
  runStartedAt: string | null;
}

export interface JobStep {
  name: string;
  status: string | null;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: string | null;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  steps: JobStep[];
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 不依赖 btoa 的 base64（Workers 有 btoa，但它只吃 latin1，UTF-8 得先转字节）。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 0x3f] : "=";
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let outIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIndex++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, outIndex);
}

export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function base64ToText(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}

export class GitHubClient {
  readonly repo: string;
  readonly branch: string;
  private readonly apiBase: string;
  private readonly token: string;
  private readonly doFetch: typeof fetch;

  constructor(cfg: GitHubConfig) {
    this.repo = cfg.repo;
    this.branch = cfg.branch;
    this.apiBase = cfg.apiBase.replace(/\/$/, "");
    this.token = cfg.token;
    this.doFetch = cfg.fetch;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "canteenos-worker",
      Authorization: `Bearer ${this.token}`,
    };
    if (init.body !== undefined && init.body !== null) headers["Content-Type"] = "application/json";
    return this.doFetch(`${this.apiBase}${path}`, {
      ...init,
      headers: { ...headers, ...((init.headers as Record<string, string>) ?? {}) },
    });
  }

  /** 非 2xx 一律抛 UpstreamError（路由层转成 502 upstream_error）。 */
  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.request(path, init);
    if (!res.ok) {
      throw new UpstreamError(res.status, `GitHub ${init.method ?? "GET"} ${path} -> ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private repoPath(suffix: string): string {
    return `/repos/${this.repo}${suffix}`;
  }

  async getHeadSha(): Promise<string> {
    const ref = await this.json<{ object: { sha: string } }>(
      this.repoPath(`/git/ref/heads/${this.branch}`),
    );
    return ref.object.sha;
  }

  async getCommit(sha: string): Promise<CommitInfo> {
    const c = await this.json<{
      sha: string;
      tree: { sha: string };
      message: string;
      author: { date: string };
    }>(this.repoPath(`/git/commits/${sha}`));
    return { sha: c.sha, treeSha: c.tree.sha, message: c.message, authoredAt: c.author.date };
  }

  /** 目标不存在 → null（GET /source 的 404、以及「新建文件」都走这条）。 */
  async getFile(path: string, ref: string): Promise<FileContent | null> {
    const res = await this.request(
      this.repoPath(`/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`),
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new UpstreamError(res.status, `GitHub GET contents ${path} -> ${res.status}`);
    const body = (await res.json()) as { sha: string; content?: string; encoding?: string };
    return { sha: body.sha, text: body.content ? base64ToText(body.content) : "" };
  }

  async getTree(sha: string, recursive: boolean): Promise<TreeEntry[]> {
    const suffix = recursive ? "?recursive=1" : "";
    const body = await this.json<{ tree: TreeEntry[] }>(this.repoPath(`/git/trees/${sha}${suffix}`));
    return body.tree ?? [];
  }

  async getBlobText(sha: string): Promise<string> {
    const body = await this.json<{ content: string; encoding: string }>(
      this.repoPath(`/git/blobs/${sha}`),
    );
    return body.encoding === "base64" ? base64ToText(body.content) : body.content;
  }

  /** 短 sha → 全长 sha；不存在返回 null（契约 §1.6：解析不到 → 404 not_found）。 */
  async resolveCommit(shaish: string): Promise<CompareCommit | null> {
    const res = await this.request(this.repoPath(`/commits/${encodeURIComponent(shaish)}`));
    if (res.status === 404 || res.status === 422) return null;
    if (!res.ok) throw new UpstreamError(res.status, `GitHub GET commit ${shaish} -> ${res.status}`);
    const body = (await res.json()) as {
      sha: string;
      commit: { message: string; author: { date: string } };
    };
    return { sha: body.sha, message: body.commit.message, authoredAt: body.commit.author.date };
  }

  async getCommitFiles(sha: string): Promise<string[]> {
    const body = await this.json<{ files?: Array<{ filename: string }> }>(
      this.repoPath(`/commits/${sha}`),
    );
    return (body.files ?? []).map((f) => f.filename);
  }

  async compare(base: string, head: string): Promise<CompareCommit[]> {
    const body = await this.json<{
      commits?: Array<{ sha: string; commit: { message: string; author: { date: string } } }>;
    }>(this.repoPath(`/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`));
    return (body.commits ?? []).map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      authoredAt: c.commit.author.date,
    }));
  }

  // —— 写 ——

  async createBlob(content: string, encoding: "utf-8" | "base64" = "utf-8"): Promise<string> {
    const body = await this.json<{ sha: string }>(this.repoPath("/git/blobs"), {
      method: "POST",
      body: JSON.stringify({ content, encoding }),
    });
    return body.sha;
  }

  async createTree(
    baseTree: string | null,
    entries: Array<{ path: string; mode: string; type: string; sha: string | null }>,
  ): Promise<string> {
    const payload: Record<string, unknown> = { tree: entries };
    if (baseTree) payload.base_tree = baseTree;
    const body = await this.json<{ sha: string }>(this.repoPath("/git/trees"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return body.sha;
  }

  async createCommit(message: string, treeSha: string, parents: string[]): Promise<string> {
    const author = { name: BOT_NAME, email: BOT_EMAIL };
    const body = await this.json<{ sha: string }>(this.repoPath("/git/commits"), {
      method: "POST",
      body: JSON.stringify({ message, tree: treeSha, parents, author, committer: author }),
    });
    return body.sha;
  }

  /**
   * 非 force 更新 ref。不是快进（别人抢先推了）→ GitHub 返回 422，这里返回 false，
   * 由调用方按 ADR-0007 §2「重读一次并重试一次」处理。
   */
  async updateRef(sha: string): Promise<boolean> {
    const res = await this.request(this.repoPath(`/git/refs/heads/${this.branch}`), {
      method: "PATCH",
      body: JSON.stringify({ sha, force: false }),
    });
    if (res.ok) return true;
    if (res.status === 422 || res.status === 409) return false;
    throw new UpstreamError(res.status, `GitHub PATCH ref -> ${res.status}`);
  }

  // —— Actions ——

  async dispatchWorkflow(workflow: string, ref: string, inputs: Record<string, string>): Promise<void> {
    const res = await this.request(
      this.repoPath(`/actions/workflows/${encodeURIComponent(workflow)}/dispatches`),
      { method: "POST", body: JSON.stringify({ ref, inputs }) },
    );
    if (!res.ok) throw new UpstreamError(res.status, `GitHub dispatch -> ${res.status}`);
  }

  async listRuns(workflow: string, query: string): Promise<WorkflowRun[]> {
    const body = await this.json<{ workflow_runs?: RawRun[] }>(
      this.repoPath(`/actions/workflows/${encodeURIComponent(workflow)}/runs${query}`),
    );
    return (body.workflow_runs ?? []).map(toRun);
  }

  async getRun(runId: number): Promise<WorkflowRun | null> {
    const res = await this.request(this.repoPath(`/actions/runs/${runId}`));
    if (res.status === 404) return null;
    if (!res.ok) throw new UpstreamError(res.status, `GitHub GET run -> ${res.status}`);
    return toRun((await res.json()) as RawRun);
  }

  async listRunJobs(runId: number): Promise<WorkflowJob[]> {
    const body = await this.json<{ jobs?: RawJob[] }>(
      this.repoPath(`/actions/runs/${runId}/jobs?per_page=100`),
    );
    return (body.jobs ?? []).map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status ?? null,
      conclusion: j.conclusion ?? null,
      startedAt: j.started_at ?? null,
      completedAt: j.completed_at ?? null,
      steps: (j.steps ?? []).map((s) => ({
        name: s.name,
        status: s.status ?? null,
        conclusion: s.conclusion ?? null,
        startedAt: s.started_at ?? null,
        completedAt: s.completed_at ?? null,
      })),
    }));
  }
}

interface RawRun {
  id: number;
  name?: string | null;
  status?: string | null;
  conclusion?: string | null;
  html_url?: string;
  head_sha?: string;
  created_at?: string;
  run_started_at?: string | null;
}

interface RawJob {
  id: number;
  name: string;
  status?: string | null;
  conclusion?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  steps?: Array<{
    name: string;
    status?: string | null;
    conclusion?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
  }>;
}

function toRun(raw: RawRun): WorkflowRun {
  return {
    id: raw.id,
    name: raw.name ?? null,
    status: raw.status ?? null,
    conclusion: raw.conclusion ?? null,
    htmlUrl: raw.html_url ?? "",
    headSha: raw.head_sha ?? "",
    createdAt: raw.created_at ?? "",
    runStartedAt: raw.run_started_at ?? null,
  };
}

/** commit message 的固定形状（ADR-0007 §2）：首行人话 + 空行 + 两条 trailer。 */
export function commitMessage(subject: string, role: Role, endpoint: string): string {
  return `${subject}\n\nX-CanteenOS-Role: ${role}\nX-CanteenOS-Endpoint: ${endpoint}`;
}
