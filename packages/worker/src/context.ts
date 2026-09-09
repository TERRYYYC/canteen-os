/**
 * 每个请求的上下文。端点拿到它时，鉴权（§2.3）、权限矩阵（§2.5）、限流（§3.5）、
 * 体积上限（§1.0）都已经过了；端点只管自己那点业务。
 */
import { GitHubClient } from "./github.js";
import { fail } from "./http.js";
import type { Env, Role, Runtime } from "./types.js";

export interface Ctx {
  request: Request;
  url: URL;
  env: Env;
  rt: Runtime;
  role: Role;
  /** 路由模板，如 "POST /plan/:planId"。日志与权限矩阵都用它。 */
  endpoint: string;
  /** 具体路径，如 "POST /plan/week-43"。进 commit trailer（ADR-0007 §2）。 */
  endpointConcrete: string;
  params: Record<string, string>;
  /** 已解析的 JSON 请求体（GET 与 POST /image 为 undefined）。 */
  body: unknown;
  rawBody: Uint8Array | null;
  warnings: string[];
}

export function githubClient(ctx: Ctx): GitHubClient {
  const token = ctx.env.GITHUB_PAT;
  if (!token) {
    throw fail("not_configured", { message: "worker 还没配 GITHUB_PAT，写不了 GitHub" });
  }
  return new GitHubClient({
    repo: ctx.env.GITHUB_REPO ?? "TERRYYYC/canteen-os",
    branch: ctx.env.GITHUB_BRANCH ?? "main",
    apiBase: ctx.env.GITHUB_API_BASE ?? "https://api.github.com",
    token,
    fetch: ctx.rt.fetch,
  });
}

export function addWarning(ctx: Ctx, warning: string): void {
  if (!ctx.warnings.includes(warning)) ctx.warnings.push(warning);
}

export function requireEnv(env: Env, key: keyof Env & string): string {
  const value = env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw fail("not_configured", { message: `worker 还没配 ${key}` });
  }
  return value;
}
