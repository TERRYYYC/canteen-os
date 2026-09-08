/**
 * Worker 的公共类型。运行时形状（Env）与协议形状（Role / LogEntry / …）都在这里。
 *
 * Env 里带 `__` 前缀的几项是**测试接缝**：本地 L1 契约测试直接 import `src/index.ts` 的
 * fetch handler，用一个普通对象当 env 传进来，GitHub API 由 `__fetch` 打桩。
 * 它们**不出现在 wrangler.toml 里**，生产环境永远是 undefined。
 */

/** 三个角色（ADR-0007 §4）。与人无关，一个角色一条链接。 */
export type Role = "chef" | "buyer" | "admin";

/** 契约 §1.8 的错误 code 全集（D-02）。校验类的 code 逐字用 ajv 的 keyword，不在这里穷举。 */
export type ErrorCode =
  | "bad_id"
  | "bad_path"
  | "bad_json"
  | "bad_image"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_large"
  | "rate_limited"
  | "upstream_error"
  | "dispatch_unavailable"
  | "not_configured";

export interface FieldError {
  /** JSON Pointer；非字段级错误为 ""。 */
  path: string;
  code: string;
  message: string;
}

/** 日志只记这四项（ADR-0007 §8 补充）：不记令牌、不记请求体、不记可识别到人的字段。 */
export interface LogEntry {
  time: string;
  role: Role | null;
  /** 路由**模板**（如 "POST /plan/:planId"），不是原始路径 —— 原始路径含用户输入。 */
  endpoint: string;
  status: number;
}

/** 限流桶的存储；默认是 isolate 内的 Map（无状态、够单人后台用），换 KV 只改这一层。 */
export type RateStore = Map<string, number[]>;

export interface Env {
  // —— secrets（#68 手工设置）——
  TOKEN_HASH_CHEF?: string;
  TOKEN_HASH_BUYER?: string;
  TOKEN_HASH_ADMIN?: string;
  /** 细粒度 PAT：Contents RW + Actions RW，无 Workflows（契约 D-09 定名）。 */
  GITHUB_PAT?: string;
  DEEPL_API_KEY?: string;

  // —— vars（wrangler.toml）——
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  GITHUB_API_BASE?: string;
  PAGES_BASE_URL?: string;
  ALLOWED_ORIGIN?: string;
  PUBLISH_MODE?: string;
  PUBLISH_WORKFLOW?: string;
  PUBLISH_CLAIM_TIMEOUT_MS?: string;

  // —— 测试接缝（生产恒为 undefined）——
  __fetch?: typeof fetch;
  __log?: (entry: LogEntry) => void;
  __now?: () => number;
  __sleep?: (ms: number) => Promise<void>;
  __requestId?: () => string;
  __rateStore?: RateStore;
}

export interface Runtime {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  requestId: () => string;
  log: (entry: LogEntry) => void;
  fetch: typeof fetch;
}
