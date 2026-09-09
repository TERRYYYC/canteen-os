/**
 * 后台唯一的调用面（docs/specs/v03-admin-frontend-contract.md §6.1）。
 *
 * 方法名与参数里没有任何 URL —— 这是「#27 换真实实现时调用方零改动」的全部机制：
 * v0.3 `getApi()` 返回 mock（api/mock.ts）；#27 只改 `getApi()` 的函数体外加本文件里的 fetch 实现
 * （端点对照见 §6.4 与 packages/worker/src/index.ts 的路由表），六屏一行不动。
 *
 * 令牌：真实实现从 admin/token.ts 的 getToken() 取，只进 `Authorization: Bearer` 头，
 * 不进 URL、不进日志（worker 契约 §2.2）。mock 不需要令牌。
 *
 * 比契约 §6.1 多出的两个方法（worker 已实现，六屏可用；#27 接线时同样零改动）：
 *   saveDish          POST /dish/:id —— 前端契约开头「决议追加」第 1 条：status 由请求体决定，#24「入库」用它
 *   getPublishLatest  GET /publish/latest —— worker 契约 D-17：publish() 返回 runId: null 时靠它补最近一次 run
 *
 * mock 与 client 在同一个动态分包里（都只被六屏引用，不进首屏）。
 */
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

let instance: AdminApi | null = null;

/** v0.3 返回 mock；#27 只改这一个函数体（外加本文件里的 fetch 实现），调用方零改动 */
export function getApi(): AdminApi {
  if (!instance) instance = createMockApi();
  return instance;
}
