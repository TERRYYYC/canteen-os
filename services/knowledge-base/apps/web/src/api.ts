export class ApiError extends Error {
  constructor(message: string, public status: number, public code = 'request_failed', public details?: unknown) { super(message); this.name = 'ApiError'; }
  get uncertain() { return this.status === 0 || this.status >= 500; }
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET') headers.set('X-KB-Client', 'web');
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response: Response;
  try { response = await fetch(`/api/v1${path}`, { ...init, headers }); }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; throw new ApiError('暂时无法连接服务。输入已保留。', 0); }
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new ApiError(response.ok ? '服务已响应，但保存结果无法确认。请重试核对。' : '服务暂时无法处理请求。', response.ok ? 0 : response.status); }
  if (!response.ok) {
    const data = payload as { error?: { message?: string; code?: string; details?: unknown } };
    throw new ApiError(data.error?.message || `请求未成功（${response.status}）`, response.status, data.error?.code, data.error?.details);
  }
  return payload as T;
}
export interface Attempt { key: string; path: string; method: 'POST' | 'PUT'; body: string; version?: number }
export function attemptFor(previous: Attempt | undefined, path: string, method: Attempt['method'], value: unknown, version?: number): Attempt {
  const body = JSON.stringify(value);
  if (previous && previous.path === path && previous.method === method && previous.body === body && previous.version === version) return previous;
  return { key: crypto.randomUUID(), path, method, body, version };
}
export function sendAttempt<T>(attempt: Attempt) {
  const headers: Record<string, string> = { 'Idempotency-Key': attempt.key };
  if (attempt.version !== undefined) headers['If-Match'] = `"v${attempt.version}"`;
  return request<T>(attempt.path, { method: attempt.method, body: attempt.body, headers });
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请再试一次。';
