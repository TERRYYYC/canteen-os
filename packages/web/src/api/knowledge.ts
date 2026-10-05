/** SQLite contract stays distinct from the publication/Git API. */
import { getToken, getAuthSessionVersion, peekAuthSessionVersion } from '../admin/token';
export * from './knowledge-types';
import type {Adoption,ApprovalInput,KitchenApproval,Materialization} from './knowledge-types';
export class KnowledgeError extends Error {
  constructor(message: string, public status: number, public code = 'request_failed', public details?: unknown) { super(message); }
  get uncertain(): boolean { return this.status === 0 || this.status >= 500; }
}
export interface Reply<T> { data: T; etag: string | null; replayed: string | null }
export interface Attempt { key: string; path: string; method: 'POST' | 'PUT'; body: string; etag?: string }
export function createAttempt(path: string, method: Attempt['method'], value: unknown, etag?: string): Attempt {
  return { key: crypto.randomUUID(), path, method, body: JSON.stringify(value), etag };
}
export function createKnowledgeApi(options: { base: string; fetch?: typeof fetch; token?: () => string | null; session?: () => number | null; timeoutMs?: number }) {
  const fetcher = options.fetch ?? fetch;
  const token = options.token ?? getToken;
  const session = options.session ?? peekAuthSessionVersion;
  const base = options.base.replace(/\/+$/, '');
  async function raw(path: string, init: RequestInit = {}): Promise<Response> {
    if (!base) throw new KnowledgeError('Knowledge service is not configured', 503, 'knowledge_unconfigured');
    const materialization=/^\/materializations\/(?:recipes\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(path);
    if (!materialization && !/^\/(?:recipes|health|assets|sources|ingredients|techniques|favorites)(?:[/?]|$)/.test(path)) throw new KnowledgeError('Invalid knowledge path', 400);
    const credential = token(), generation = session();
    if (!credential) throw new KnowledgeError('Access link required', 401, 'unauthorized');
    const controller = new AbortController();
    const abort = () => controller.abort();
    init.signal?.addEventListener('abort', abort, { once: true });
    if (init.signal?.aborted) abort();
    const timer = setTimeout(abort, options.timeoutMs ?? 30000);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${credential}`);
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    try {
      const response = await fetcher(materialization?`${base}/knowledge-materializations/${path.slice('/materializations/'.length)}`:`${base}/knowledge${path}`, { ...init, headers, signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
      if (session() !== generation || token() !== credential) throw new KnowledgeError('Access session changed', 401, 'session_changed');
      const body = await response.arrayBuffer();
      if (session() !== generation || token() !== credential) throw new KnowledgeError('Access session changed', 401, 'session_changed');
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      if (error instanceof KnowledgeError) throw error;
      throw new KnowledgeError('Knowledge service unavailable', 0, 'knowledge_unavailable');
    } finally { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); }
  }
  async function request<T>(path: string, init: RequestInit = {}): Promise<Reply<T>> {
    const response = await raw(path, init);
    let data: unknown;
    try { data = await response.json(); } catch { throw new KnowledgeError('Invalid service response', response.ok ? 0 : response.status); }
    if (!response.ok) {
      const value = data as { error?: { message?: string; code?: string; details?: unknown }; errors?: { message?: string; code?: string }[] };
      const error = value.error ?? value.errors?.[0];
      throw new KnowledgeError(error?.message || `HTTP ${response.status}`, response.status, error?.code, value.error?.details);
    }
    return { data: data as T, etag: response.headers.get('ETag'), replayed: response.headers.get('Idempotency-Replayed') };
  }
  function send<T>(attempt: Attempt) {
    const headers: Record<string, string> = { 'Idempotency-Key': attempt.key };
    if (attempt.etag) headers['If-Match'] = attempt.etag;
    return request<T>(attempt.path, { method: attempt.method, body: attempt.body, headers });
  }
  return { request, send,
    getAdoption:(id:string,version:number)=>request<Adoption>(`/recipes/${id}/revisions/${version}/adoption`),
    approvalAttempt:(id:string,version:number,value:ApprovalInput,etag:string)=>createAttempt(`/recipes/${id}/revisions/${version}/approve`,'POST',value,etag),
    materializationAttempt:(id:string,version:number)=>createAttempt(`/materializations/recipes/${id}`,'POST',{recipeVersion:version}),
    approveRecipe:(attempt:Attempt)=>send<KitchenApproval>(attempt),
    materializeRecipe:(attempt:Attempt)=>send<Materialization>(attempt),
    async image(url: string, signal?: AbortSignal): Promise<Blob> {
    if (!/^\/api\/v1\/assets\/[0-9a-f-]{36}\/content$/.test(url)) throw new KnowledgeError('Invalid asset path', 400);
    const response = await raw(url.slice('/api/v1'.length), { signal });
    if (!response.ok) throw new KnowledgeError(`HTTP ${response.status}`, response.status);
    if (!response.headers.get('Content-Type')?.startsWith('image/')) throw new KnowledgeError('Invalid image content', 422);
    return response.blob();
  } };
}
let api: ReturnType<typeof createKnowledgeApi> | undefined;
export function getKnowledgeApi() {
  getAuthSessionVersion();
  return api ??= createKnowledgeApi({ base: String(import.meta.env.VITE_WORKER_URL || '') });
}
