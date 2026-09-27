import type { Ctx } from "../context.js";
import { BodyTooLarge, boundedBytes } from "../bounded-body.js";
import { fail } from "../http.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RESPONSE_MAX_BYTES = 16 * 1024 * 1024;
const FORWARD_RESPONSE_HEADERS = ["Content-Type", "ETag", "Idempotency-Replayed", "Retry-After", "Content-Disposition"];

function error(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function targetPath(ctx: Ctx): string {
  for (const [key, value] of Object.entries(ctx.params)) {
    if (key === "id" && !UUID.test(value)) throw fail("bad_id", { message: "菜谱和素材 ID 必须是小写 UUID" });
    if (key === "version" && (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))) throw fail("bad_path", { message: "历史版本必须是正整数" });
  }
  const template = ctx.endpoint.slice(ctx.request.method.length + 1);
  const canonical = template.replace(/:([a-z]+)/g, (_match, key: string) => ctx.params[key] ?? "");
  if (canonical !== ctx.url.pathname) throw fail("bad_path", { message: "知识库接口路径不正确" });
  const allowed = ctx.request.method !== "GET" ? new Map<string, number>()
    : canonical === "/knowledge/recipes" ? new Map([["q", 200], ["tag", 100], ["cursor", 2000], ["limit", 3]])
      : canonical === "/knowledge/favorites/items" ? new Map([["folder", 200], ["state", 40], ["cursor", 1000], ["limit", 3]])
      : ["/knowledge/ingredients", "/knowledge/techniques"].includes(canonical)
        ? new Map([["q", 200], ["cursor", 1000], ["limit", 3]]) : new Map<string, number>();
  const seen = new Set<string>();
  ctx.url.searchParams.forEach((value, key) => {
    const max = allowed.get(key);
    if (max === undefined || seen.has(key) || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw fail("bad_path", { message: "知识库查询参数不正确" });
    if (key === "limit" && (!/^[1-9][0-9]{0,2}$/.test(value) || Number(value) > 100)) throw fail("bad_path", { message: "每页数量必须为 1 到 100" });
    seen.add(key);
  });
  return `/api/v1${canonical.slice("/knowledge".length)}${ctx.url.searchParams.size ? `?${ctx.url.searchParams.toString()}` : ""}`;
}

function requestHeaders(ctx: Ctx): Headers {
  // Deliberately do not clone incoming headers: in particular no old Bearer,
  // Cookie, Origin, Host, X-Forwarded-* or caller-controlled X-KB-Client.
  const headers = new Headers({ "X-KB-Client": "web" });
  if (ctx.request.method === "GET") return headers;
  const contentType = ctx.request.headers.get("Content-Type") ?? "";
  if (ctx.endpoint === "POST /knowledge/assets/upload") {
    if (!/^multipart\/form-data;\s*boundary=(?:"[0-9A-Za-z'()+_,./:=? -]{1,70}"|[0-9A-Za-z'()+_,./:=?-]{1,70})$/i.test(contentType)) {
      throw fail("bad_image", { message: "图片上传需要有效的 multipart boundary" });
    }
  } else if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)) {
    throw fail("bad_json", { message: "知识库资料需要 application/json" });
  }
  headers.set("Content-Type", contentType);
  for (const key of ["If-Match", "Idempotency-Key"]) {
    const value = ctx.request.headers.get(key);
    if (value !== null) {
      if (value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw fail("invalid_precondition");
      headers.set(key, value);
    }
  }
  return headers;
}

export async function handleKnowledge(ctx: Ctx): Promise<Response> {
  const path = targetPath(ctx);
  const headers = requestHeaders(ctx);
  // Literal loopback addresses only, with explicit deployment/recovery ports.
  // No credentials, path prefix, query, fragment, hostname resolution or redirect.
  const configured = ctx.env.KNOWLEDGE_BASE_URL;
  if (typeof configured !== "string" || !/^http:\/\/127\.0\.0\.1:(?:4390|4391)\/?$/.test(configured)) {
    return error(503, "KNOWLEDGE_NOT_CONFIGURED", "菜谱知识库尚未连接，请联系管理员");
  }
  const timeout = ctx.env.KNOWLEDGE_TIMEOUT_MS === undefined ? 10000 : Number(ctx.env.KNOWLEDGE_TIMEOUT_MS);
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 30000) return error(503, "KNOWLEDGE_NOT_CONFIGURED", "菜谱知识库连接配置不正确");
  const controller = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { expired = true; controller.abort(); reject(new Error("knowledge timeout")); }, timeout);
  });
  try {
    const operation = async (): Promise<Response> => {
      // __fetch belongs exclusively to the modeled GitHub API, never this service.
      const send = ctx.env.__knowledgeFetch ?? fetch;
      const upstream = await send(`${configured.replace(/\/$/, "")}${path}`, {
        method: ctx.request.method, headers, redirect: "manual", signal: controller.signal,
        ...(ctx.request.method === "GET" ? {} : { body: new Uint8Array(ctx.rawBody ?? []).buffer }),
      });
      if (upstream.status < 200 || upstream.status >= 600 || (upstream.status >= 300 && upstream.status < 400)) {
        void upstream.body?.cancel().catch(() => {});
        return error(502, "KNOWLEDGE_BAD_RESPONSE", "菜谱知识库返回了无法识别的响应，请保留输入后重试");
      }
      const bytes = await boundedBytes(upstream.body, RESPONSE_MAX_BYTES, controller.signal);
      const contentType = upstream.headers.get("Content-Type") ?? "";
      const isImage = ctx.endpoint === "GET /knowledge/assets/:id/content" && upstream.ok;
      if (isImage ? !/^image\/(?:png|jpeg|webp)(?:;|$)/i.test(contentType) : !/^application\/json(?:;|$)/i.test(contentType)) {
        return error(502, "KNOWLEDGE_BAD_RESPONSE", "菜谱知识库返回了无法识别的响应，请保留输入后重试");
      }
      if (!isImage) {
        try { JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
        catch { return error(502, "KNOWLEDGE_BAD_RESPONSE", "菜谱知识库返回了不完整资料，请保留输入后重试"); }
      }
      const responseHeaders = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      for (const key of FORWARD_RESPONSE_HEADERS) {
        const value = upstream.headers.get(key);
        if (value !== null) responseHeaders.set(key, value);
      }
      return new Response(new Uint8Array(bytes).buffer, { status: upstream.status, headers: responseHeaders });
    };
    return await Promise.race([operation(), deadline]);
  } catch (cause) {
    if (expired) return error(504, "KNOWLEDGE_TIMEOUT", "菜谱知识库连接超时，请保留输入后重试");
    if (cause instanceof BodyTooLarge) return error(502, "KNOWLEDGE_BAD_RESPONSE", "菜谱知识库响应过大，请联系管理员");
    return error(502, "KNOWLEDGE_UNAVAILABLE", "暂时无法连接菜谱知识库，请保留输入后重试");
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
