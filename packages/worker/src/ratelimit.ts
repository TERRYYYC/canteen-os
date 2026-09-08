/**
 * 限流（契约 §3.5 + D-11 + D-16）。四个桶，按角色令牌计：
 *
 *   write     60 次/小时   写入端点（ADR-0007 §5）
 *   publish   10 次/小时   POST /publish（ADR-0007 §5）
 *   rollback   5 次/小时   POST /rollback/:sha（D-11：低频高危，塞进 60/h 等于没有保护）
 *   read     600 次/小时   只读端点（D-16：够 5 路并发轮询用）
 *
 * 实现：滑动窗口，存在 isolate 内的 Map 里。**这不是全局精确的** —— Cloudflare 会开多个
 * isolate，每个各算各的。单人后台够用；要精确就绑一个 KV 或 Workers 的限流绑定，
 * 只需换掉本文件里的 store（wrangler.toml 末尾有注释）。
 */
import type { RateStore, Role } from "./types.js";

export type Bucket = "write" | "publish" | "rollback" | "read";

export const LIMITS: Record<Bucket, number> = {
  write: 60,
  publish: 10,
  rollback: 5,
  read: 600,
};

export const WINDOW_MS = 60 * 60 * 1000;

const globalStore: RateStore = new Map();

export function defaultStore(): RateStore {
  return globalStore;
}

export interface RateResult {
  allowed: boolean;
  /** 429 时给 Retry-After（秒）。 */
  retryAfter: number;
}

export function consume(store: RateStore, role: Role, bucket: Bucket, now: number): RateResult {
  const key = `${role}:${bucket}`;
  const limit = LIMITS[bucket];
  const cutoff = now - WINDOW_MS;
  const hits = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    store.set(key, hits);
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)) };
  }

  hits.push(now);
  store.set(key, hits);
  return { allowed: true, retryAfter: 0 };
}
