/**
 * 数据层：只读 public/data/*.json（scripts/build-data.mjs 的产物；Vite 把 public/ 原样拷进 dist/）。
 *
 *   ./data/build.json                     BuildManifest { builtAt, commit, plans[, readiness] }
 *   ./data/prep/<planId>.json             PrepSheet
 *   ./data/purchase/<planId>.json         PurchaseSheet
 *   ./data/menu/<planId>.json             MenuSheet
 *
 * 类型来自 @canteenos/core（packages/core/src/sheets.ts，只 import type，不进产物）。
 * 内存缓存：同一 URL 只 fetch 一次（并发请求共享同一个 Promise）；失败不缓存，下次调用会重试。
 * 失败抛 DataError（含 url / status）——页面捕获后显示「数据未就绪」，不要吞掉。
 * 路径相对于页面 URL（base "./"），GitHub Pages 子路径与本地都能跑；PWA 预缓存（#12）在 SW 层做，这里不管。
 */
import type { BuildManifest, MenuSheet, PrepSheet, PurchaseSheet } from "@canteenos/core";

export class DataError extends Error {
  readonly url: string;
  readonly status: number | null;
  constructor(url: string, status: number | null, cause?: unknown) {
    super(status === null ? `fetch failed: ${url}` : `HTTP ${status}: ${url}`, { cause });
    this.name = "DataError";
    this.url = url;
    this.status = status;
  }
}

/** 相对 URL 前缀（"./data/"）；BASE_URL 由 vite.config.ts 的 base 决定 */
export const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

export const dataUrl = {
  build: (): string => `${DATA_BASE}build.json`,
  prep: (planId: string): string => `${DATA_BASE}prep/${encodeURIComponent(planId)}.json`,
  purchase: (planId: string): string => `${DATA_BASE}purchase/${encodeURIComponent(planId)}.json`,
  menu: (planId: string): string => `${DATA_BASE}menu/${encodeURIComponent(planId)}.json`,
};

const cache = new Map<string, Promise<unknown>>();

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new DataError(url, null, err);
  }
  if (!res.ok) throw new DataError(url, res.status);
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new DataError(url, res.status, err);
  }
}

function cached<T>(url: string): Promise<T> {
  const hit = cache.get(url);
  if (hit) return hit as Promise<T>;
  const p = fetchJson<T>(url).catch((err: unknown) => {
    cache.delete(url); // 失败不缓存
    throw err;
  });
  cache.set(url, p);
  return p;
}

export function loadBuild(): Promise<BuildManifest> {
  return cached<BuildManifest>(dataUrl.build());
}
export function loadPrep(planId: string): Promise<PrepSheet> {
  return cached<PrepSheet>(dataUrl.prep(planId));
}
export function loadPurchase(planId: string): Promise<PurchaseSheet> {
  return cached<PurchaseSheet>(dataUrl.purchase(planId));
}
export function loadMenu(planId: string): Promise<MenuSheet> {
  return cached<MenuSheet>(dataUrl.menu(planId));
}
/** 清缓存（#12 收到「有新版本」时用） */
export function clearCache(): void {
  cache.clear();
}

/** 页面通过 PageCtx.data 拿到的就是这个对象 */
export const dataApi = { loadBuild, loadPrep, loadPurchase, loadMenu, clearCache } as const;
export type DataApi = typeof dataApi;
