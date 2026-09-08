/**
 * CanteenOS 写入通道 —— 单文件 Cloudflare Worker 的入口（ADR-0007 §1：`export default { fetch }`）。
 *
 * 一个请求的固定顺序（契约 §1.0 / §2.3 / §3.5）：
 *   OPTIONS 预检 → 路由 → 鉴权(401) → 权限矩阵(403) → 限流(429) → 体积上限(413)
 *   → JSON 解析(400 bad_json) → 端点（路径校验 → schema 校验 → 写 GitHub）
 *
 * 日志只有 `{time, role, endpoint, status}`：不记令牌、不记请求体、不记可识别到人的字段
 * （ADR-0007 §8 补充）。endpoint 记的是**路由模板**，不是原始路径 —— 原始路径里可能带
 * 用户输入（比如路径穿越的构造），进日志就等于把请求体的一部分记下来了。
 */
import { isAllowed, resolveRole } from "./auth.js";
import type { Ctx } from "./context.js";
import { handleDish, handleDishDraft, handleIngredient, handlePlan } from "./endpoints/entities.js";
import { handleImage } from "./endpoints/image.js";
import { handlePublish, handlePublishLatest, handlePublishStatus } from "./endpoints/publish.js";
import { handleCatalog, handleChanges, handleSource } from "./endpoints/read.js";
import { handleRollback } from "./endpoints/rollback.js";
import { handleTranslate } from "./endpoints/translate.js";
import { UpstreamError } from "./github.js";
import {
  DEFAULT_ALLOWED_ORIGIN,
  HttpError,
  fail,
  jsonResponse,
  preflightResponse,
} from "./http.js";
import { IMAGE_MAX_BYTES } from "./endpoints/image.js";
import type { Bucket } from "./ratelimit.js";
import { consume, defaultStore } from "./ratelimit.js";
import type { Env, LogEntry, Role, Runtime } from "./types.js";

/** JSON 端点请求体上限（契约 D-07）。week-41.json 约 700 字节，256 KB 有 300 倍余量。 */
export const JSON_MAX_BYTES = 256 * 1024;

type Handler = (ctx: Ctx) => Promise<unknown>;

interface Route {
  method: string;
  /** 路径段；以 ":" 开头的是参数。 */
  segments: string[];
  template: string;
  handler: Handler;
  bucket: Bucket;
  /** true 时按二进制读请求体（POST /image）。 */
  binary?: boolean;
}

function route(
  method: string,
  path: string,
  handler: Handler,
  bucket: Bucket,
  binary = false,
): Route {
  return {
    method,
    segments: path.split("/").filter((s) => s.length > 0),
    template: `${method} ${path}`,
    handler,
    bucket,
    binary,
  };
}

/** 顺序有意义：字面量路由必须排在同长度的参数路由前面（/publish/latest 先于 /publish/:runId）。 */
export const ROUTES: Route[] = [
  route("POST", "/plan/:planId", handlePlan, "write"),
  route("POST", "/ingredient/:id", handleIngredient, "write"),
  route("POST", "/dish/:id/draft", handleDishDraft, "write"),
  route("POST", "/dish/:id", handleDish, "write"),
  route("POST", "/publish", handlePublish, "publish"),
  route("GET", "/publish/latest", handlePublishLatest, "read"),
  route("GET", "/publish/:runId", handlePublishStatus, "read"),
  route("POST", "/rollback/:sha", handleRollback, "rollback"),
  route("GET", "/source/:kind/:id", handleSource, "read"),
  route("GET", "/catalog", handleCatalog, "read"),
  route("GET", "/changes", handleChanges, "read"),
  route("POST", "/translate", handleTranslate, "write"),
  route("POST", "/image/:kind/:id", handleImage, "write", true),
];

interface Match {
  route: Route;
  params: Record<string, string>;
}

export function matchRoute(method: string, pathname: string): Match | null {
  const parts = pathname.split("/").filter((s) => s.length > 0);
  for (const candidate of ROUTES) {
    if (candidate.method !== method) continue;
    if (candidate.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < candidate.segments.length; i++) {
      const seg = candidate.segments[i] as string;
      const value = parts[i] as string;
      if (seg.startsWith(":")) {
        params[seg.slice(1)] = safeDecode(value);
      } else if (seg !== value) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: candidate, params };
  }
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // 坏的百分号转义：原样留着，后面的 looksLikeTraversal 会因为含 "%" 判成 bad_path。
    return value;
  }
}

/** commit trailer 里的具体端点。参数来自 URL，先把非白名单字符清掉，杖绝往 message 里注入换行。 */
function concreteEndpoint(method: string, pathname: string): string {
  const clean = pathname.replace(/[^A-Za-z0-9/:._-]/g, "");
  return `${method} ${clean}`;
}

function makeRuntime(env: Env): Runtime {
  return {
    now: env.__now ?? (() => Date.now()),
    sleep: env.__sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))),
    requestId: env.__requestId ?? (() => crypto.randomUUID()),
    log: env.__log ?? ((entry: LogEntry) => console.log(JSON.stringify(entry))),
    fetch: env.__fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)),
  };
}

async function readBody(request: Request, binary: boolean): Promise<{ raw: Uint8Array; json: unknown }> {
  const limit = binary ? IMAGE_MAX_BYTES : JSON_MAX_BYTES;
  const declared = request.headers.get("Content-Length");
  if (declared !== null && Number(declared) > limit) throw fail("too_large");

  const buffer = new Uint8Array(await request.arrayBuffer());
  if (buffer.length > limit) throw fail("too_large");
  if (binary) return { raw: buffer, json: undefined };

  const text = new TextDecoder().decode(buffer).trim();
  if (text.length === 0) return { raw: buffer, json: {} };
  try {
    return { raw: buffer, json: JSON.parse(text) };
  } catch {
    throw fail("bad_json");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigin = env.ALLOWED_ORIGIN ?? DEFAULT_ALLOWED_ORIGIN;
    const rt = makeRuntime(env);
    const url = new URL(request.url);
    let role: Role | null = null;
    let endpoint = `${request.method} (unmatched)`;

    const finish = (response: Response): Response => {
      rt.log({
        time: new Date(rt.now()).toISOString(),
        role,
        endpoint,
        status: response.status,
      });
      return response;
    };

    if (request.method === "OPTIONS") {
      endpoint = "OPTIONS (preflight)";
      return finish(preflightResponse(allowedOrigin));
    }

    try {
      const match = matchRoute(request.method, url.pathname);
      if (!match) throw fail("not_found", { message: "没有这个接口" });
      endpoint = match.route.template;

      role = await resolveRole(env, request.headers.get("Authorization"));
      if (role === null) throw fail("unauthorized");
      if (!isAllowed(match.route.template, role)) throw fail("forbidden");

      const gate = consume(
        env.__rateStore ?? defaultStore(),
        role,
        match.route.bucket,
        rt.now(),
      );
      if (!gate.allowed) {
        throw fail("rate_limited", { headers: { "Retry-After": String(gate.retryAfter) } });
      }

      let body: unknown;
      let rawBody: Uint8Array | null = null;
      if (request.method === "POST") {
        const read = await readBody(request, match.route.binary === true);
        body = read.json;
        rawBody = read.raw;
      }

      const ctx: Ctx = {
        request,
        url,
        env,
        rt,
        role,
        endpoint: match.route.template,
        endpointConcrete: concreteEndpoint(request.method, url.pathname),
        params: match.params,
        body,
        rawBody,
        warnings: [],
      };

      const result = await match.route.handler(ctx);
      return finish(jsonResponse(result, 200, allowedOrigin));
    } catch (err) {
      if (err instanceof HttpError) {
        return finish(
          jsonResponse({ ok: false, errors: err.errors }, err.status, allowedOrigin, err.headers),
        );
      }
      if (err instanceof UpstreamError) {
        const wrapped = fail("upstream_error");
        return finish(
          jsonResponse({ ok: false, errors: wrapped.errors }, wrapped.status, allowedOrigin),
        );
      }
      // 到这里说明是 worker 自己的 bug。不冒充「GitHub 那边出问题了」，也不回显任何细节。
      return finish(
        jsonResponse(
          {
            ok: false,
            errors: [{ path: "", code: "internal_error", message: "后台出了点问题，把这一步再试一次" }],
          },
          500,
          allowedOrigin,
        ),
      );
    }
  },
};
