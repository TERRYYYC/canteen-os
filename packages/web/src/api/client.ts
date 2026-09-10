/**
 * 后台唯一的调用面（docs/specs/v03-admin-frontend-contract.md §6.1）。
 *
 * 方法名与参数里没有任何 URL —— 这是「#27 换真实实现时调用方零改动」的全部机制：
 * `getApi()` 按构建期变量 `VITE_WORKER_URL` 二选一：
 *   - 没配（GitHub Pages 今天的状态）→ mock（api/mock.ts），行为与 v0.3 一致；
 *   - 配了 → 本文件的 `HttpAdminApi`（真实 fetch，端点对照见 §6.4 与 packages/worker/src/index.ts 的路由表）。
 * 六屏一行不动。
 *
 * 令牌：真实实现从 admin/token.ts 的 getToken() 取，只进 `Authorization: Bearer` 头，
 * 不进 URL、不进日志（worker 契约 §2.2）。mock 不需要令牌。
 *
 * 比契约 §6.1 多出的两个方法（worker 已实现，六屏可用）：
 *   saveDish          POST /dish/:id —— 前端契约开头「决议追加」第 1 条：status 由请求体决定，#24「入库」用它
 *   getPublishLatest  GET /publish/latest —— worker 契约 D-17：publish() 返回 runId: null 时靠它补最近一次 run
 *
 * mock 与 client 在同一个动态分包里（都只被六屏引用，不进首屏）。
 */
import { HttpTransport, conditionHeaders } from "./transport";
import type { HttpApiOptions, RequestSpec, SessionBoundary } from "./transport";
export type { HttpApiOptions } from "./transport";
import { createMockApi } from "./mock";
import type {
  Catalog,
  Changes,
  Dish,
  ImageMeta,
  ImageRef,
  Ingredient,
  MenuPlan,
  PublishProgress,
  PublishResult,
  RollbackResult,
  Source,
  Translation,
  WriteResult,
} from "./types";
import { ApiError } from "./types";

export interface WriteOpts {
  /** 目标文件当前 blobSha（从 getPlan / getIngredient / getDish 取）：带上做文件级冲突检测（worker 契约 §3.2） */
  ifMatch?: string;
}

export interface AdminApi {
  // —— 读 ——
  /** GET /catalog；有缓存，任何写入成功后自动失效（§3.5 边界） */
  getCatalog(opts?: { force?: boolean }): Promise<Catalog>;
  /** GET /changes；有缓存，任何写入 / 发布 / 回退成功后自动失效 */
  getChanges(opts?: { force?: boolean }): Promise<Changes>;
  /** GET /source/plan/:id；目标不存在 → null（不抛） */
  getPlan(planId: string): Promise<Source<MenuPlan> | null>;
  getIngredient(id: string): Promise<Source<Ingredient> | null>;
  getDish(id: string): Promise<Source<Dish> | null>;

  // —— 写 ——
  /** POST /plan/:planId */
  savePlan(planId: string, plan: MenuPlan, opts?: WriteOpts): Promise<WriteResult>;
  /** POST /ingredient/:id */
  saveIngredient(id: string, ingredient: Ingredient, opts?: WriteOpts): Promise<WriteResult>;
  /** POST /dish/:id/draft：无条件写 status: "draft"（请求体带了别的值 → warnings 含 "status-forced"） */
  saveDishDraft(id: string, dish: Dish, opts?: WriteOpts): Promise<WriteResult>;
  /**
   * POST /dish/:id：status 由请求体决定，后台可直接建 active
   * （前端契约开头「决议追加」第 1 条 / 硬伤 1 已解；#24「入库」按钮用它）。
   */
  saveDish(id: string, dish: Dish, opts?: WriteOpts): Promise<WriteResult>;

  // —— 辅助写 ——
  /** POST /translate：即时机翻单条中文；没配翻译服务时返回 {}（不抛），前端退化成自己填 */
  translate(zh: string, targets?: ReadonlyArray<"en" | "uk">): Promise<Translation>;
  /** POST /image/:kind/:id：浏览器先压到最长边 ≤ 1280 且 ≤ 200 KB（ADR-0007 §9）；超 200 KB → 413 */
  uploadImage(kind: "ingredients" | "dishes", id: string, file: Blob, meta: ImageMeta): Promise<ImageRef>;

  // —— 发布 ——
  /** POST /publish */
  publish(): Promise<PublishResult>;
  /** GET /publish/:runId；轮询协议见 worker 契约 §4.6 */
  getPublish(runId: number): Promise<PublishProgress>;
  /** GET /publish/latest：最近一次构建的进度（publish() 返回 runId: null 时用；没有任何 run → 404 not_found） */
  getPublishLatest(): Promise<PublishProgress>;
  /** POST /rollback/:sha（只有 admin 令牌）；回退不自动发布 */
  rollback(sha: string): Promise<RollbackResult>;
}

// ---------------------------------------------------------------------------
// 真实 HTTP 实现（#27 前置；端点、请求体、响应体、错误形状以 packages/worker/src 为准）
// ---------------------------------------------------------------------------

function seg(value: string): string {
  return encodeURIComponent(value);
}

/**
 * fetch 的请求头值必须是 ByteString（码点 ≤ 0xFF），中文 / 乌克兰文作者名直接放头里会让 fetch 抛 TypeError。
 * 超出的值按 RFC 3986 百分号编码送出；worker 侧（endpoints/image.ts）目前原样存，这是 #68 联调前要补的一处（见 PR 差异表）。
 */
function headerValue(value: string): string {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0xff) return encodeURIComponent(value);
  }
  return value;
}

function stripOk<T extends object>(body: T & { ok?: unknown }): Omit<T, "ok"> {
  const { ok: _ok, ...rest } = body;
  return rest;
}

export class HttpAdminApi implements AdminApi {
  readonly transport: HttpTransport;
  private readonly publishTimeoutMs: number;
  constructor(base: string, opts: HttpApiOptions = {}) {
    this.transport = new HttpTransport(base, opts);
    this.publishTimeoutMs = opts.publishTimeoutMs ?? 150_000;
  }

  // —— 读 ——

  async getCatalog(): Promise<Catalog> {
    const body = await this.request<Catalog & { ok: true }>({ method: "GET", path: "/catalog" });
    for (const dish of Object.values(body.dishes)) assertLegacyFormat(dish);
    return stripOk(body);
  }

  async getChanges(): Promise<Changes> {
    const body = await this.request<Changes & { ok: true }>({ method: "GET", path: "/changes" });
    return stripOk(body);
  }

  getPlan(planId: string): Promise<Source<MenuPlan> | null> {
    return this.source<MenuPlan>("plan", planId);
  }

  getIngredient(id: string): Promise<Source<Ingredient> | null> {
    return this.source<Ingredient>("ingredient", id);
  }

  getDish(id: string): Promise<Source<Dish> | null> {
    return this.source<Dish>("dish", id);
  }

  /** GET /source/:kind/:id（worker read.ts handleSource）：404 not_found → null，其余错误照抛 */
  private async source<T>(kind: "plan" | "ingredient" | "dish", id: string): Promise<Source<T> | null> {
    try {
      const body = await this.request<Source<T> & { ok: true }>({ method: "GET", path: `/source/${kind}/${seg(id)}` });
      if (kind !== "ingredient") assertLegacyFormat(body.content);
      return { content: body.content, blobSha: body.blobSha, commit: body.commit };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404 && err.code === "not_found") return null;
      throw err;
    }
  }

  // —— 写 ——

  savePlan(planId: string, plan: MenuPlan, opts?: WriteOpts): Promise<WriteResult> {
    return this.write(`/plan/${seg(planId)}`, plan, opts, true);
  }

  saveIngredient(id: string, ingredient: Ingredient, opts?: WriteOpts): Promise<WriteResult> {
    return this.write(`/ingredient/${seg(id)}`, ingredient, opts);
  }

  saveDishDraft(id: string, dish: Dish, opts?: WriteOpts): Promise<WriteResult> {
    return this.write(`/dish/${seg(id)}/draft`, dish, opts, true);
  }

  saveDish(id: string, dish: Dish, opts?: WriteOpts): Promise<WriteResult> {
    return this.write(`/dish/${seg(id)}`, dish, opts, true);
  }

  /** 四个实体写入的共同形状（worker entities.ts WriteResponse）；If-Match 透传 opts.ifMatch（§3.2） */
  private async write(path: string, value: unknown, opts?: WriteOpts, conditional = false): Promise<WriteResult> {
    const headers: Record<string, string> = {};
    const ifMatch = opts?.ifMatch?.trim();
    if (conditional) Object.assign(headers, conditionHeaders(opts?.ifMatch !== undefined ? { ifMatch: opts.ifMatch } : { ifNoneMatch: "*" }));
    else if (ifMatch) headers["If-Match"] = ifMatch;
    const body = await this.request<WriteResult & { ok: true }>({ method: "POST", path, json: value, headers });
    return { commit: body.commit, blobSha: body.blobSha, unchanged: body.unchanged, warnings: body.warnings ?? [] };
  }

  // —— 辅助写 ——

  /** POST /translate（worker translate.ts）：请求 `{ text, targets }`，响应 `{ translations: { en?, uk? } }` → 只返回 translations */
  async translate(zh: string, targets?: ReadonlyArray<"en" | "uk">): Promise<Translation> {
    const json: { text: string; targets?: string[] } = { text: zh };
    if (targets) json.targets = [...targets];
    const body = await this.request<{ ok: true; translations?: Translation }>({ method: "POST", path: "/translate", json });
    const out: Translation = {};
    if (typeof body.translations?.en === "string") out.en = body.translations.en;
    if (typeof body.translations?.uk === "string") out.uk = body.translations.uk;
    return out;
  }

  /**
   * POST /image/:kind/:id（worker image.ts）：请求体是**原始图片字节**（不是 multipart），
   * 元数据走 X-Image-License / X-Image-Author / X-Image-Source-Url 头（http.ts ALLOWED_HEADERS）；
   * 文件名固定用 worker 的缺省 cover（X-Image-Name 不发）。响应里的 image 就是 ImageRef。
   */
  async uploadImage(kind: "ingredients" | "dishes", id: string, file: Blob, meta: ImageMeta): Promise<ImageRef> {
    const headers: Record<string, string> = { "X-Image-License": headerValue(meta.license ?? "") };
    if (meta.author) headers["X-Image-Author"] = headerValue(meta.author);
    if (meta.sourceUrl) headers["X-Image-Source-Url"] = headerValue(meta.sourceUrl);
    const body = await this.request<{ ok: true; image: ImageRef }>({
      method: "POST",
      path: `/image/${kind}/${seg(id)}`,
      binary: file,
      headers,
    });
    const image: ImageRef = { src: body.image.src, license: body.image.license };
    if (body.image.author) image.author = body.image.author;
    if (body.image.sourceUrl) image.sourceUrl = body.image.sourceUrl;
    return image;
  }

  // —— 发布 ——

  /** POST /publish（worker publish.ts handlePublish）：`{ runId, mode, requestId? | commit? }` → PublishResult（requestId 不透出） */
  async publish(): Promise<PublishResult> {
    const body = await this.request<{ ok: true; runId: number | null; mode: PublishResult["mode"]; commit?: string }>({
      method: "POST",
      path: "/publish",
      json: {},
      timeoutMs: this.publishTimeoutMs,
    });
    const result: PublishResult = { runId: body.runId ?? null, mode: body.mode };
    if (typeof body.commit === "string") result.commit = body.commit;
    return result;
  }

  async getPublish(runId: number): Promise<PublishProgress> {
    return this.progress(`/publish/${seg(String(runId))}`);
  }

  async getPublishLatest(): Promise<PublishProgress> {
    return this.progress("/publish/latest");
  }

  private async progress(path: string): Promise<PublishProgress> {
    const body = await this.request<PublishProgress & { ok: true }>({ method: "GET", path });
    return stripOk(body);
  }

  /** POST /rollback/:sha（worker rollback.ts）：响应多一个 unchanged，RollbackResult 里没有，不透出 */
  async rollback(sha: string): Promise<RollbackResult> {
    const body = await this.request<RollbackResult & { ok: true }>({ method: "POST", path: `/rollback/${seg(sha)}`, json: {} });
    return { commit: body.commit, restoredFrom: body.restoredFrom, changedFiles: body.changedFiles };
  }

  // —— 底层 ——

  /**
   * 发一次请求：
   *   - 无令牌 → 不发请求，直接 401 unauthorized（屏会走 kit.sessionExpired）；
   *   - 网络错误 / 超时 → ApiError(0, "network")；
   *   - 非 2xx → 解析 `{ ok:false, errors }`，status 取 HTTP 状态、code / message 取 errors[0]，429 带 Retry-After 秒数；
   *     响应体不是 worker 的 JSON（Cloudflare 52x 页等）→ ApiError(status, "bad_response", "")，kit.apiMessage 会显示「连不上后台」；
   *   - 2xx → 返回解析后的 JSON。
   */
  private request<T>(spec: RequestSpec): Promise<T> { return this.transport.request<T>(spec); }
}

/** Existing numeric pages must opt into the new API before consuming optional quantities. */
function assertLegacyFormat(value: unknown): void {
  if (value && typeof value === "object" && "schemaVersion" in value && value.schemaVersion !== undefined && value.schemaVersion !== "2") {
    throw new ApiError(422, "unsupported_format", "");
  }
}

// ---------------------------------------------------------------------------
// catalog / changes 缓存（前端契约 §3.5：任何写入成功后 api 层自行失效缓存；屏不管缓存）
// ---------------------------------------------------------------------------

/**
 * 给任意 AdminApi 套一层读缓存，失效规则与 mock 一致（mock.ts 的 invalidate / settle）：
 *   - getCatalog / getChanges 结果常驻内存，force 跳过；返回 structuredClone，屏改了不会污染缓存；
 *   - 任何写入（savePlan / saveIngredient / saveDishDraft / saveDish / uploadImage）、publish、rollback 成功 → 两个都失效；
 *   - getPublish / getPublishLatest 报 success → 线上换版了，changes 失效（catalog 不变：它读的是 main）；
 *   - 失败的调用不动缓存；请求进行中发生失效 → 那次结果不入缓存（generation 计数）。
 * mock 自己已经带同样的缓存（且 latencyMs / failNext 要每次调用都过 enter()），所以只套在 HttpAdminApi 上。
 */
export function withReadCache(inner: AdminApi, session?: SessionBoundary): AdminApi {
  let catalog: Promise<Catalog> | null = null;
  let changes: Promise<Changes> | null = null;
  let gen = 0;

  const invalidate = (which: "all" | "changes"): void => {
    gen++;
    changes = null;
    if (which === "all") catalog = null;
  };

  session?.onSessionChange(() => invalidate("all"));

  const cached = <T>(slot: () => Promise<T> | null, set: (p: Promise<T> | null) => void, load: () => Promise<T>, force: boolean): Promise<T> => {
    const sessionAt = session?.sessionKey();
    const guarded = (v: T): T => {
      if (session && sessionAt !== session.sessionKey()) throw new ApiError(0, "session_changed", "");
      return structuredClone(v);
    };
    const hit = slot();
    if (hit && !force) return hit.then(guarded);
    const at = gen;
    const p = load();
    set(p);
    p.then(
      () => {
        if (gen !== at && slot() === p) set(null); // 加载期间有写入：这份可能已经旧了，下次重取
      },
      () => {
        if (slot() === p) set(null);
      },
    );
    return p.then(guarded);
  };

  const afterWrite = async <T>(p: Promise<T>): Promise<T> => {
    const v = await p;
    invalidate("all");
    return v;
  };

  const afterProgress = async (p: Promise<PublishProgress>): Promise<PublishProgress> => {
    const v = await p;
    if (v.status === "success") invalidate("changes");
    return v;
  };

  return {
    getCatalog: (opts) =>
      cached(
        () => catalog,
        (p) => {
          catalog = p;
        },
        () => inner.getCatalog({ force: true }),
        opts?.force === true,
      ),
    getChanges: (opts) =>
      cached(
        () => changes,
        (p) => {
          changes = p;
        },
        () => inner.getChanges({ force: true }),
        opts?.force === true,
      ),
    getPlan: (planId) => inner.getPlan(planId),
    getIngredient: (id) => inner.getIngredient(id),
    getDish: (id) => inner.getDish(id),
    savePlan: (planId, plan, opts) => afterWrite(inner.savePlan(planId, plan, opts)),
    saveIngredient: (id, ingredient, opts) => afterWrite(inner.saveIngredient(id, ingredient, opts)),
    saveDishDraft: (id, dish, opts) => afterWrite(inner.saveDishDraft(id, dish, opts)),
    saveDish: (id, dish, opts) => afterWrite(inner.saveDish(id, dish, opts)),
    translate: (zh, targets) => inner.translate(zh, targets),
    uploadImage: (kind, id, file, meta) => afterWrite(inner.uploadImage(kind, id, file, meta)),
    publish: () => afterWrite(inner.publish()),
    getPublish: (runId) => afterProgress(inner.getPublish(runId)),
    getPublishLatest: () => afterProgress(inner.getPublishLatest()),
    rollback: (sha) => afterWrite(inner.rollback(sha)),
  };
}

/** 真实实现 = HTTP 客户端 + 读缓存；getApi() 与测试都用这一个工厂 */
export function createHttpApi(base: string, opts?: HttpApiOptions): AdminApi {
  const inner = new HttpAdminApi(base, opts);
  return withReadCache(inner, inner.transport);
}

// ---------------------------------------------------------------------------
// 开关
// ---------------------------------------------------------------------------

let instance: AdminApi | null = null;

/**
 * 构建期变量 VITE_WORKER_URL（packages/web/.env.example）：
 *   有值 → 真实 worker（#68 部署完把它配进 Pages 的构建环境即可联调）；
 *   没有 → mock（GitHub Pages 今天的默认行为）。
 * 调用方零改动。
 */
export function getApi(): AdminApi {
  if (!instance) {
    const raw: unknown = import.meta.env.VITE_WORKER_URL;
    const base = typeof raw === "string" ? raw.trim() : "";
    instance = base ? createHttpApi(base) : createMockApi();
  }
  return instance;
}
