/**
 * 令牌校验（契约 §2 / ADR-0007 §4）。
 *
 * 顺序逐条照 §2.3：
 *   1. 没有 `Bearer ` 前缀 → 401
 *   2. 长度不是 43 → 401（先判长度再算哈希，省一次 SHA-256）
 *   3. 算 SHA-256 十六进制
 *   4. 与三个 TOKEN_HASH_* **逐个用常数时间比较**，三个都要比完，**不许命中即短路**
 *      —— 短路会把「哪个角色」泄露成时间差
 *   5. 都不中 → 401；中了 → 得到角色
 *
 * worker 只存哈希；明文令牌只存在于发给人的那条链接里。
 */
import type { Env, Role } from "./types.js";

/** base64url 编码的 32 字节 = 43 字符（ADR-0007 §4）。 */
export const TOKEN_LENGTH = 43;

const HEX = "0123456789abcdef";
/** 一个不可能等于任何真实哈希的占位值：secret 没配时拿它去比，保持时间恒定。 */
const ABSENT_HASH = "z".repeat(64);

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let out = "";
  for (const b of view) {
    out += HEX[b >> 4];
    out += HEX[b & 0x0f];
  }
  return out;
}

/**
 * 常数时间比较两个十六进制串。
 * 长度不同也走完整轮比较（用 a 的长度做上界），避免用长度差做旁路。
 */
export function constantTimeEquals(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    // b 越界时取 0，仍然进 XOR，循环次数只跟 a 有关。
    diff |= a.charCodeAt(i) ^ (i < b.length ? b.charCodeAt(i) : 0);
  }
  return diff === 0;
}

function hashFor(env: Env, role: Role): string {
  const raw = role === "chef" ? env.TOKEN_HASH_CHEF : role === "buyer" ? env.TOKEN_HASH_BUYER : env.TOKEN_HASH_ADMIN;
  const value = (raw ?? "").trim().toLowerCase();
  return value.length === 64 ? value : ABSENT_HASH;
}

/** 三个角色固定顺序全比一遍，命中不 break。 */
export async function resolveRole(env: Env, authorization: string | null): Promise<Role | null> {
  if (!authorization || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  if (token.length !== TOKEN_LENGTH) return null;

  const actual = await sha256Hex(token);
  const roles: Role[] = ["chef", "buyer", "admin"];
  let matched: Role | null = null;
  for (const role of roles) {
    if (constantTimeEquals(actual, hashFor(env, role))) matched = role;
  }
  return matched;
}

/** 权限矩阵（契约 §1.0 / §2.5 + 2026-09-08 决议追加：POST /dish/:id 与两个只读端点）。 */
export const PERMISSIONS: Record<string, readonly Role[]> = {
  "POST /plan/:planId": ["chef", "admin"],
  "POST /ingredient/:id": ["chef", "admin"],
  "POST /dish/:id/draft": ["chef", "admin"],
  "POST /dish/:id": ["chef", "admin"],
  "POST /publish": ["chef", "admin"],
  "GET /publish/latest": ["chef", "buyer", "admin"],
  "GET /publish/:runId": ["chef", "buyer", "admin"],
  "POST /rollback/:sha": ["admin"],
  "GET /source/:kind/:id": ["chef", "buyer", "admin"],
  "GET /catalog": ["chef", "buyer", "admin"],
  "GET /changes": ["chef", "buyer", "admin"],
  "POST /translate": ["chef", "admin"],
  "POST /image/:kind/:id": ["chef", "admin"],
};

export function isAllowed(endpoint: string, role: Role): boolean {
  const allowed = PERMISSIONS[endpoint];
  return allowed !== undefined && allowed.includes(role);
}
