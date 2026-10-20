/**
 * 本机网页：只发一次 `vite build` 的产物目录，别的什么都不发（#196，#199 审查 pr199/vite-serves-worker-secret-config）。
 *
 * 不用 Vite 开发服务器：它允许读整个 workspace（/@fs/…），默认的拒绝名单里没有 .dev.vars。
 * 这里只认 GET/HEAD，Host 必须是 127.0.0.1:<端口>，路径解析后必须还在产物目录里（含符号链接），
 * 不发目录列表，不带任何 CORS 头。hash 路由只有一个入口，所以 / 就是 index.html。
 *
 *   node scripts/mac-local/web-server.mjs --dir <产物目录> --port <端口>（平时由 start.mjs 起）
 */
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

const plain = (res, status, text) => {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(text);
};

/** root 必须是已存在的目录；返回还没 listen 的 http.Server。 */
export async function createWebServer({ root, port }) {
  const base = await realpath(root);
  const host = `127.0.0.1:${port}`;
  return createServer(async (req, res) => {
    try {
      if (req.headers.host !== host) return plain(res, 403, 'forbidden');
      if (req.method !== 'GET' && req.method !== 'HEAD') return plain(res, 405, 'method not allowed');
      let path;
      try { path = decodeURIComponent(new URL(req.url, `http://${host}`).pathname); } catch { return plain(res, 400, 'bad request'); }
      if (path.includes('\0')) return plain(res, 400, 'bad request');
      const wanted = resolve(base, path === '/' ? 'index.html' : `.${path}`);
      if (!wanted.startsWith(base + sep)) return plain(res, 404, 'not found');
      let file;
      try { file = await realpath(wanted); } catch { return plain(res, 404, 'not found'); }
      if (!file.startsWith(base + sep) || !(await stat(file)).isFile()) return plain(res, 404, 'not found');
      const bytes = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': bytes.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      if (!res.headersSent) plain(res, 500, 'error');
      else res.destroy();
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = name => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : undefined; };
  const root = arg('--dir'), port = Number(arg('--port'));
  if (!root || !Number.isInteger(port) || port <= 1024 || port >= 65536) {
    console.error('用法：node scripts/mac-local/web-server.mjs --dir <产物目录> --port <端口>');
    process.exit(2);
  }
  const server = await createWebServer({ root, port });
  server.once('error', error => {
    console.error(error?.code === 'EADDRINUSE' ? `✗ ${port} 端口已被占用` : `✗ 网页起不来：${error?.message}`);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ event: 'ready', service: 'web', port })));
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
