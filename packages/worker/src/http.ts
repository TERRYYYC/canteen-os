/**
 * CORS、统一响应形状、统一错误。
 *
 * CORS 逐字照 ADR-0007 §1 / 契约 §1.0：
 *   Access-Control-Allow-Origin: https://terryyyc.github.io   （逐字，不用通配符）
 *   Vary: Origin
 *   允许 Authorization 头；预检缓存 600 秒；**不开 Allow-Credentials**（不使用 cookie）。
 */
import type { ErrorCode, FieldError } from "./types.js";

export const DEFAULT_ALLOWED_ORIGIN = "https://terryyyc.github.io";

/** 预检允许的请求头。If-Match 是乐观锁（契约 §3.2），X-Image-* 是 POST /image 的元数据（§9.1）。 */
export const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "If-Match",
  "X-Image-License",
  "X-Image-Author",
  "X-Image-Source-Url",
  "X-Image-Name",
].join(", ");

export function corsHeaders(allowedOrigin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    Vary: "Origin",
  };
}

export function preflightResponse(allowedOrigin: string): Response {
  return new Response(null, {
    status: 200,
    headers: {
      ...corsHeaders(allowedOrigin),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Max-Age": "600",
    },
  });
}

export function jsonResponse(
  body: unknown,
  status: number,
  allowedOrigin: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(allowedOrigin),
      ...extraHeaders,
    },
  });
}

/**
 * 端点抛这个，路由统一转成 `{ ok:false, errors:[…] }`。
 * 契约 §1.8：errors[].path 是 JSON Pointer，message 前端**原样显示**，不二次编造。
 */
export class HttpError extends Error {
  readonly status: number;
  readonly errors: FieldError[];
  readonly headers: Record<string, string>;

  constructor(status: number, errors: FieldError[], headers: Record<string, string> = {}) {
    super(errors[0]?.message ?? `HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.errors = errors;
    this.headers = headers;
  }
}

/** 契约 §1.8 的中文提示语（D-02）。前端原样显示。 */
const MESSAGES: Record<ErrorCode, string> = {
  bad_id: "名称只能用小写字母、数字和短横线",
  bad_path: "这个位置不允许写入",
  bad_json: "数据没发全，重试一次",
  bad_image: "这张图片打不开，换一张再试",
  unauthorized: "链接失效了，找 Terry 要新的",
  forbidden: "你这条链接不能做这件事",
  not_found: "没找到这个版本",
  conflict: "有人刚改过，刷新后重试",
  too_large: "照片太大了，从后台页面正常上传",
  rate_limited: "操作太频繁，等几分钟再试",
  upstream_error: "GitHub 那边出问题了，先看看 PAT 是不是到期了",
  dispatch_unavailable: "发布功能暂时关着",
  not_configured: "这项功能还没配好，找 Terry",
};

const STATUS: Record<ErrorCode, number> = {
  bad_id: 400,
  bad_path: 400,
  bad_json: 400,
  bad_image: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  rate_limited: 429,
  upstream_error: 502,
  dispatch_unavailable: 503,
  not_configured: 503,
};

export function fail(
  code: ErrorCode,
  opts: { path?: string; message?: string; headers?: Record<string, string> } = {},
): HttpError {
  return new HttpError(
    STATUS[code],
    [{ path: opts.path ?? "", code, message: opts.message ?? MESSAGES[code] }],
    opts.headers ?? {},
  );
}

/** ajv 校验失败：一次可能有多条，逐条给前端标黄。 */
export function validationFailure(errors: FieldError[]): HttpError {
  return new HttpError(400, errors);
}
