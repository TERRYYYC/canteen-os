#!/usr/bin/env node
/**
 * 演练用的假 GitHub + 假 Pages（#196），只给「先模拟」那一遍用，不碰真实仓库。
 *
 * 复用 remote-test 那套本地模型（packages/web/test/e2e/team-meals/workflow-publication-fixture.mjs）：
 * - 假 GitHub 的仓库是临时目录里的真 Git 仓库，起点是空业务数据（seedMode: 'empty'）；
 * - 收到 build-deploy.yml 的 dispatch，就用正式的 build-data 和 Vite 构建一份「Pages」；
 * - Pages 在 http://127.0.0.1:<端口>/canteen/ 上，只读，和线上一样带 data/build.json。
 *
 * 和真 Worker 之间走真 HTTP：Worker 配 GITHUB_API_BASE=http://127.0.0.1:<端口>，
 * PAGES_BASE_URL=http://127.0.0.1:<端口>/canteen/。只监听 127.0.0.1，重启就丢（演练不需要留）。
 *
 *   TMPDIR=<演练目录> node scripts/mac-local/rehearsal-github.mjs [--port 4480]
 *
 * 模型自己构建时把 VITE_WORKER_URL 固定成 /__q/worker；这里对同一份资料再用空的 VITE_WORKER_URL 构建一次，
 * 和线上 Pages 一样是只读的（采购页不会去找 Worker）。新版构建好之前，照旧给上一版，像 Pages 换版要等一会儿。
 */
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createWorkflowPublicationFixture } from '../../packages/web/test/e2e/team-meals/workflow-publication-fixture.mjs';
import { REPO_ROOT } from './config.mjs';

const REPO = 'TERRYYYC/canteen-os';

const at = process.argv.indexOf('--port');
const port = Number(at > 0 ? process.argv[at + 1] : 4480);
if (!Number.isInteger(port) || port <= 1024 || port >= 65536) throw new Error('--port 要是 1025–65535');
const origin = `http://127.0.0.1:${port}`;
const productionRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

const f = await createWorkflowPublicationFixture({ productionRevision, siteUrl: `${origin}/canteen/`, seedMode: 'empty' });
const github = f.env.__fetch;
// vite 装在 packages/web 下面，不在根目录。
const { build } = await import(pathToFileURL(join(REPO_ROOT, 'packages/web/node_modules/vite/dist/node/index.js')).href);
f.env.__now = Date.now;

/** 同一次快照（同样的 data/、qr/），用空的 VITE_WORKER_URL 再构建一份只读的。 */
async function readOnly(snapshot) {
  const outDir = join(snapshot.root, 'dist-readonly'), previous = process.env.VITE_WORKER_URL;
  process.env.VITE_WORKER_URL = '';
  try { await build({ root: snapshot.root, configFile: join(snapshot.root, 'vite.config.ts'), logLevel: 'warn', build: { outDir, emptyOutDir: true } }); }
  finally { if (previous === undefined) delete process.env.VITE_WORKER_URL; else process.env.VITE_WORKER_URL = previous; }
  return outDir;
}
let pagesDist = await readOnly(f.active);

const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const send = (res, status, body, type = 'application/json') => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
const log = (event, extra = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), event, ...extra }));

async function pages(res, pathname) {
  let relative;
  try { relative = decodeURIComponent(pathname.slice('/canteen/'.length)) || 'index.html'; } catch { return send(res, 400, '{}'); }
  const root = pagesDist, file = resolve(root, relative);
  if (relative.includes('\0') || !file.startsWith(root + '/')) return send(res, 404, '{}');
  let info;
  try { info = await stat(file); } catch { /* 下面 404 */ }
  if (!info?.isFile()) return send(res, 404, '{"error":"not_found"}');
  send(res, 200, await readFile(file), mime[extname(file)] ?? 'application/octet-stream');
}

const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, '{"error":"local_host_required"}');
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname.startsWith('/canteen/')) return await pages(res, url.pathname);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined;
    // dispatch 由这里接：真 Worker 的 request_id 是 UUID，模型自带的接法只认它自己的编号。
    // 照 Actions 的样子排一个 run（run-name = "publish · <request_id>"），再构建、换上新的 Pages。
    if (req.method === 'POST' && url.pathname === `/repos/${REPO}/actions/workflows/build-deploy.yml/dispatches`) {
      const input = JSON.parse(body ?? '{}');
      if (input.ref !== 'main' || typeof input.inputs?.request_id !== 'string') return send(res, 422, '{"message":"rehearsal only models main"}');
      const id = 8100 + f.jobs.length, now = new Date().toISOString();
      const run = { id, name: `publish · ${input.inputs.request_id}`, status: 'queued', conclusion: null, html_url: `${origin}/__run/${id}`, head_sha: f.repo.head, created_at: now, run_started_at: null };
      f.repo.dispatches.push(input); f.repo.runs.unshift(run);
      const job = { id, commit: f.repo.head, state: 'queued', run, requestId: input.inputs.request_id };
      f.jobs.push(job);
      res.writeHead(204); res.end();
      log('dispatch', { run: id, commit: job.commit.slice(0, 7) });
      setTimeout(async () => {
        const done = await f.complete(id);
        if (done.state === 'success') pagesDist = await readOnly(f.active);
        log('build_finished', { run: id, state: done.state, pagesCommit: f.active.commit.slice(0, 7), plans: f.active.manifest.plans, error: done.error });
      }, 3000);
      return;
    }
    const headers = {};
    for (const name of ['authorization', 'content-type', 'accept']) if (req.headers[name]) headers[name] = req.headers[name];
    const response = await github(`https://api.github.com${url.pathname}${url.search}`, { method: req.method, headers, body });
    const bytes = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' });
    res.end(bytes);
    if (req.method !== 'GET') log('github', { method: req.method, path: url.pathname, status: response.status, head: f.repo.head.slice(0, 7) });
  } catch (error) {
    log('error', { message: String(error?.message ?? error).slice(0, 300) });
    if (!res.headersSent) send(res, 500, '{"error":"rehearsal_failure"}');
  }
});
server.listen(port, '127.0.0.1', () => log('ready', { github: origin, pages: `${origin}/canteen/`, head: f.repo.head.slice(0, 7), pagesCommit: f.active.commit.slice(0, 7) }));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); process.exit(0); });
