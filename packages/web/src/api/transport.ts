import { getToken, getAuthSessionVersion, onAuthSessionChange } from '../admin/token';
import { ApiError } from './types';
import type { FieldError, WriteCondition } from './types';

export interface HttpApiOptions {
  fetch?: typeof fetch;
  token?: () => string | null;
  /** Optional application identity boundary; kept in memory only. */
  identity?: () => unknown;
  timeoutMs?: number;
  publishTimeoutMs?: number;
}
export interface RequestSpec {
  method: 'GET' | 'POST'; path: string; json?: unknown; binary?: Blob;
  headers?: Record<string, string>; timeoutMs?: number;
}
export interface SessionBoundary {
  sessionKey(): number;
  onSessionChange(listener: () => void): () => void;
}

/** A single authenticated request; no retries, storage, URLs containing credentials, or fallback reads. */
export class HttpTransport implements SessionBoundary {
  private readonly base: string;
  private readonly token: () => string | null;
  private credential: string | null | undefined;
  private identity: unknown;
  private authVersion = -1;
  private generation = 0;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  constructor(base: string, private readonly opts: HttpApiOptions = {}) {
    this.base = base.replace(/\/+$/, '');
    this.token = opts.token ?? getToken;
    this.unsubscribe = onAuthSessionChange(() => this.invalidate());
  }
  private invalidate(): void {
    this.generation++;
    for (const listener of this.listeners) listener();
  }
  sessionKey(): number {
    const token = this.token();
    const version = getAuthSessionVersion();
    const identity = this.opts.identity?.();
    if (token !== this.credential || version !== this.authVersion || identity !== this.identity) {
      this.credential = token; this.authVersion = version; this.identity = identity; this.invalidate();
    }
    return this.generation;
  }
  onSessionChange(listener: () => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  dispose(): void { this.disposed = true; this.credential = undefined; this.invalidate(); this.unsubscribe(); this.listeners.clear(); }
  private assertSession(key: number): void {
    if (this.disposed || key !== this.sessionKey()) throw new ApiError(0, 'session_changed', '');
  }
  private async response(spec: RequestSpec): Promise<{ response: Response; key: number }> {
    if (this.disposed) throw new ApiError(0, 'session_changed', '');
    if (!this.base) throw new ApiError(0, 'worker_unconfigured', '');
    const key = this.sessionKey();
    const token = this.token();
    if (!token) throw new ApiError(401, 'unauthorized', '链接失效了，找 Terry 要新的');
    const headers = new Headers(spec.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const init: RequestInit = { method: spec.method, headers, cache: 'no-store', redirect: 'error' };
    if (spec.binary) { headers.set('Content-Type', spec.binary.type || 'application/octet-stream'); init.body = spec.binary; }
    else if (spec.json !== undefined) { headers.set('Content-Type', 'application/json; charset=utf-8'); init.body = JSON.stringify(spec.json); }
    const timeout = spec.timeoutMs ?? this.opts.timeoutMs ?? 30_000;
    if (timeout > 0 && typeof AbortSignal?.timeout === 'function') init.signal = AbortSignal.timeout(timeout);
    let response: Response;
    try { response = await (this.opts.fetch ?? globalThis.fetch)(`${this.base}${spec.path}`, init); }
    catch { this.assertSession(key); throw new ApiError(0, 'network', ''); }
    this.assertSession(key);
    return { response, key };
  }
  private async body<T>(read: () => Promise<T>, key: number): Promise<T> {
    try { const value = await read(); this.assertSession(key); return value; }
    catch (err) { this.assertSession(key); if (err instanceof ApiError) throw err; throw new ApiError(0, 'network', ''); }
  }
  private async jsonBody(response: Response, key: number): Promise<Record<string, unknown>> {
    const text = await this.body(() => response.text(), key);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    if (!response.ok) {
      const errors = Array.isArray(body?.errors) ? body.errors.filter(isFieldError) : [];
      const first = errors[0];
      const retry = response.status === 429 ? response.headers.get('Retry-After') : null;
      const retryAfter = retry !== null && Number.isFinite(Number(retry)) && Number(retry) >= 0 ? Number(retry) : undefined;
      const ids = body?.reviewRequired;
      const review = Array.isArray(ids) && ids.every(id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) ? ids as string[] : undefined;
      throw new ApiError(response.status, first?.code ?? 'bad_response', first?.message ?? '', first ? errors : undefined, retryAfter, review);
    }
    if (!body || body.ok === false) throw new ApiError(response.status, 'bad_response', '');
    return body;
  }
  async request<T>(spec: RequestSpec): Promise<T> {
    const {response, key} = await this.response(spec);
    return await this.jsonBody(response, key) as T;
  }
  async asset(path: string, revision: string): Promise<{bytes: Blob; sourceRevision: string}> {
    const {response, key} = await this.response({method:'GET',path});
    if (!response.ok) await this.jsonBody(response, key);
    if (response.headers.get('X-Source-Revision') !== revision) throw new ApiError(502, 'revision_mismatch', '');
    if (!response.headers.get('Content-Type')?.startsWith('image/')) throw new ApiError(502, 'bad_response', '');
    const bytes = await this.body(() => response.blob(), key);
    return {bytes, sourceRevision:revision};
  }
}
function isFieldError(value: unknown): value is FieldError {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.path === 'string' && typeof v.code === 'string' && typeof v.message === 'string';
}
/** Reject malformed locks locally, preserving the caller's chosen create/update intent. */
export function conditionHeaders(condition: WriteCondition): Record<string, string> {
  if (!condition || typeof condition !== 'object') throw new ApiError(428, 'precondition_required', '');
  if ('ifMatch' in condition && 'ifNoneMatch' in condition) throw new ApiError(400, 'invalid_precondition', '');
  if (condition.ifNoneMatch === '*') return {'If-None-Match':'*'};
  const value = condition.ifMatch;
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9_-]+|"[A-Za-z0-9_-]+")$/.test(value)) throw new ApiError(400, 'invalid_precondition', '');
  return {'If-Match':value};
}
