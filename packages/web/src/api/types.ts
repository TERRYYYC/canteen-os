/**
 * 后台 API 的类型（docs/specs/v03-admin-frontend-contract.md §6.2 / §6.3；错误 code 全集见
 * docs/specs/v03-worker-contract.md §1.8）。
 *
 * 只有类型与 ApiError 一个类。实体类型直接用 @canteenos/core 的投影（只 import type，不进产物）。
 * 错误一律 `throw new ApiError(...)`，不返回 `{ ok: false }` —— 调用方 try/catch 之后把 `err.errors`
 * 直接喂给 kit.applyFieldErrors。
 */
import type { Dish, Ingredient, MenuPlan, Technique } from "@canteenos/core";

export type { Dish, ImageRef, Ingredient, MenuPlan, Technique } from "@canteenos/core";

/** worker 契约 §1.8：path 是 JSON Pointer（非字段级为 ""），message 前端**原样显示**。 */
export interface FieldError {
  path: string;
  code: string;
  message: string;
}

/**
 * 字段级 code（ajv keyword，worker 契约 §1.8）：这些错误按 path 标黄；其余是整单级错误，走 errorCard。
 * `required` 的 path 是**缺字段的那个对象**（ajv instancePath），message 形如「这项必须填：plannedServings」；
 * kit.applyFieldErrors 会据此再试一次 `${path}/${字段名}`。
 */
export const FIELD_ERROR_CODES: ReadonlySet<string> = new Set([
  "type",
  "required",
  "enum",
  "const",
  "pattern",
  "minimum",
  "exclusiveMinimum",
  "maximum",
  "exclusiveMaximum",
  "minItems",
  "minLength",
  "additionalProperties",
  "format",
  "anyOf",
]);

export class ApiError extends Error {
  /** 400/401/403/404/409/413/429/502/503（worker 契约 §1.8） */
  readonly status: number;
  /** 同上表的 code；校验类逐字用 ajv keyword */
  readonly code: string;
  /** 字段级错误；非字段级时为 [{ path: "", code, message }] */
  readonly errors: FieldError[];
  /** 429 时的秒数 */
  readonly retryAfter?: number;

  constructor(status: number, code: string, message: string, errors?: FieldError[], retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors && errors.length > 0 ? errors : [{ path: "", code, message }];
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }

  /** 是否含可按 JSON Pointer 标黄的字段级错误（§4.0 的分流依据） */
  get hasFieldErrors(): boolean {
    return this.errors.some((e) => e.path !== "" && FIELD_ERROR_CODES.has(e.code));
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** GET /source/:kind/:id（worker 契约 §1.7）：内容 + 冲突检测用的 blobSha */
export interface Source<T> {
  content: T;
  blobSha: string;
  commit: string;
}

export interface WriteResult {
  commit: string;
  blobSha: string;
  /** worker 契约 §3.1（D-05）内容幂等：内容没变 → true，且 commit 是当前 HEAD（没有新 commit） */
  unchanged: boolean;
  /** "status-forced" | "dangling-ref" | "yield-on-pcs" | "no-if-match" | "plan-id-shape" | … */
  warnings: string[];
}

export interface PublishResult {
  runId: number | null;
  /** worker 契约 §1.4 / §5.2（D-04）：正常态 dispatch；降级态 push-trigger（runId 为 null，带 commit） */
  mode: "dispatch" | "push-trigger";
  commit?: string;
}

export type PublishStepKey = "validate" | "translate" | "build" | "deploy";
export type PublishStepState = "pending" | "in_progress" | "success" | "failure" | "skipped";

export interface PublishStep {
  key: PublishStepKey;
  /** worker 给的中文；前端按 key 出三语（D-12），只在 key 未知时兜底用它 */
  label: string;
  state: PublishStepState;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PublishProgress {
  runId: number | null;
  status: "queued" | "in_progress" | "success" | "failure" | "timeout" | "unmapped";
  htmlUrl: string;
  steps: PublishStep[];
  failedStep: string | null;
  failureReason: string | null;
  unmappedSteps: string[];
  /** 单步进行中超过 10 分钟（worker 契约 §4.4） */
  slow?: boolean;
}

export interface RollbackResult {
  commit: string;
  restoredFrom: string;
  changedFiles: number;
}

// ---------------------------------------------------------------------------
// 两个只读端点（前端契约 §6.3；worker 已实现 GET /catalog、GET /changes）
// ---------------------------------------------------------------------------

export interface TranslationCounts {
  machine: number;
  human: number;
  stale: number;
}

/** GET /catalog：全库实体索引（完整实体，#21 采购单预览要在浏览器里跑引擎） */
export interface Catalog {
  /** main HEAD */
  commit: string;
  dishes: Record<string, Dish>;
  ingredients: Record<string, Ingredient>;
  /** data/techniques.json 逐字 */
  techniques: Technique[];
  /** 从 ingredients[].purchase.supplier 去重、排序 */
  suppliers: string[];
  /** translations.lock.json 的计数 */
  translations: TranslationCounts;
}

/** 一项未发布改动 = 一个动过 data/ 的 commit（worker 契约 §3.6，D-12） */
export interface ChangeItem {
  sha: string;
  shortSha: string;
  /** ISO */
  at: string;
  /** commit trailer X-CanteenOS-Role；非 worker 写入（手工 PR）为 null */
  role: string | null;
  /** commit trailer X-CanteenOS-Endpoint，如 "POST /plan/week-43" */
  endpoint: string | null;
  /** commit message 首行，已去掉 [skip ci] */
  subject: string;
  files: string[];
}

export interface PublishRecord {
  sha: string;
  at: string;
  runId: number | null;
  isOnline: boolean;
}

/** GET /changes：未发布改动 + 发布记录 */
export interface Changes {
  /** 线上 build.json 里的 commit；线上产物读不到时为 null */
  onlineCommit: string | null;
  /** ISO；还没发布过为 null */
  lastPublishedAt: string | null;
  /** 新的在前 */
  unpublished: ChangeItem[];
  /** 最近 10 次 */
  publishes: PublishRecord[];
  /** unpublished 被截断（worker 一次最多展开 30 个 commit） */
  truncated?: boolean;
  /** "online-unknown" | "runs-unavailable" | … */
  warnings?: string[];
}

/** POST /translate 的返回：假译文（mock）或真译文；没配翻译服务时两项都缺 */
export interface Translation {
  en?: string;
  uk?: string;
}

/** POST /image 的 meta（worker 用请求头带，client.ts 负责映射） */
export interface ImageMeta {
  license: string;
  author?: string;
  sourceUrl?: string;
}
