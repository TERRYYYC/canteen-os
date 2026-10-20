/**
 * 在 Mac 上用 Node 跑真正的 Worker（packages/worker/dist，和 `pnpm -C packages/worker test` 用的是同一份），#196。
 *
 * 只做 HTTP 适配，鉴权、权限、限流、路径白名单、写 GitHub 全由 Worker 自己做：
 * - 只监听 127.0.0.1；Host 必须是 127.0.0.1:<端口>（挡 DNS 重绑定）；
 * - 带 Origin 的请求只认本机网页那一个来源；不带 Origin 的（curl）照常交给 Worker 鉴权；
 * - 只转发 Worker 用到的请求头，请求体最多 8 MiB + 64 KiB（知识库上传的上限），具体上限 Worker 再按路由卡；
 * - 日志是 Worker 自己的 {time, role, endpoint, status}，这里不记请求体、不记令牌。
 *
 * 单独跑：node scripts/mac-local/worker-server.mjs [--config <文件>]（平时由 start.mjs 起）。
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { forwardHeaders } from '../remote-test/http-adapter.mjs';
import { DEFAULT_CONFIG, REPO_ROOT, loadConfig } from './config.mjs';

export const WORKER_DIST = join(REPO_ROOT, 'packages/worker/dist/index.js');
export const MAX_BODY = 8 * 1024 * 1024 + 64 * 1024;

const refuse = (res, status, code, message) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ ok: false, errors: [{ path: '', code, message }] }));
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_BODY) { req.resume(); return null; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** 返回还没 listen 的 http.Server。worker 是 dist/index.js 的 default export，env 来自 validateConfig。 */
export function createWorkerServer({ worker, env, port }) {
  const host = `127.0.0.1:${port}`;
  const origin = env.ALLOWED_ORIGIN;
  return createServer(async (req, res) => {
    try {
      if (req.headers.host !== host) return refuse(res, 403, 'forbidden', '只能用 127.0.0.1 访问本机 Worker');
      if (req.headers.origin !== undefined && req.headers.origin !== origin) return refuse(res, 403, 'forbidden', '这个网页来源不能用本机 Worker');
      const body = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? Buffer.alloc(0) : await readBody(req);
      if (body === null) return refuse(res, 413, 'too_large', '请求太大了');
      const headers = new Headers();
      for (const name of forwardHeaders) if (typeof req.headers[name] === 'string') headers.set(name, req.headers[name]);
      const request = new Request(`http://${host}${req.url}`, { method: req.method, headers, body: body.length ? body : undefined });
      const response = await worker.fetch(request, env);
      const bytes = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(bytes);
    } catch (error) {
      // 不打印请求，只记出错的类别。
      console.error(JSON.stringify({ time: new Date().toISOString(), event: 'adapter_error', name: error?.name ?? 'Error' }));
      if (!res.headersSent) refuse(res, 500, 'upstream_error', '本机 Worker 出错了，看启动窗口的日志');
      else res.destroy();
    }
  });
}

export async function startWorkerServer({ config, workerPath = WORKER_DIST }) {
  const worker = (await import(pathToFileURL(workerPath).href)).default;
  const server = createWorkerServer({ worker, env: { ...config.workerEnv }, port: config.ports.worker });
  server.requestTimeout = 180_000; // 发布要等 Actions 认领 run，最长 PUBLISH_CLAIM_TIMEOUT_MS。
  server.headersTimeout = 15_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.ports.worker, '127.0.0.1', resolve);
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const at = process.argv.indexOf('--config');
  const file = at > 0 ? process.argv[at + 1] : DEFAULT_CONFIG;
  const { errors, config } = loadConfig(file);
  if (errors.length) {
    for (const line of errors) console.error(`✗ ${line}`);
    process.exit(2);
  }
  const server = await startWorkerServer({ config }).catch(error => {
    console.error(error?.code === 'EADDRINUSE' ? `✗ ${config.ports.worker} 端口已被占用` : `✗ Worker 起不来：${error?.message}`);
    process.exit(1);
  });
  console.log(JSON.stringify({ event: 'ready', service: 'worker', port: config.ports.worker }));
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => {
    // 浏览器的长连接会让 close 一直等；正在发布的请求最多再给 5 秒。
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
