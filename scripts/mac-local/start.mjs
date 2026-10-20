#!/usr/bin/env node
/**
 * 一键启动 Mac 本机三件套（#196）：知识库 → Worker → 网页，都只监听 127.0.0.1；Ctrl+C 一起停。
 *
 *   node scripts/mac-local/start.mjs                    读 ~/.config/canteenos/mac-local.vars
 *   node scripts/mac-local/start.mjs --check            只检查环境和配置，不启动
 *   node scripts/mac-local/start.mjs --config <文件>    用别的配置（演练用；也必须在仓库外面）
 *
 * 网页先 `vite build` 到临时目录，再由 web-server.mjs 只发这个目录；不起 Vite 开发服务器
 * （它能经 /@fs/ 读整个 workspace，#199 审查）。停的时候删掉临时目录。
 * 任何一个停了，其余的一起停，脚本以非 0 退出。操作说明：docs/field-test/mac-local/README.md。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_CONFIG, MIN_NODE, REPO_ROOT, loadConfig, nodeVersionOk } from './config.mjs';

const KB_DIR = join(REPO_ROOT, 'services/knowledge-base');
const WEB_DIR = join(REPO_ROOT, 'packages/web');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** 有没有东西在 127.0.0.1:port 上听着。用连接试，能连上就算占用（也能发现监听 0.0.0.0 的）。 */
export function portInUse(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const socket = connect({ port, host });
    const done = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function kbHealthy(url) {
  try {
    const response = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok && (await response.json()).ok === true;
  } catch { return false; }
}

/** 启动前的检查。返回 [{ok, text}]，全部 ok 才启动。不打印任何配置值。 */
export async function preflight({ configPath = DEFAULT_CONFIG, nodeVersion = process.versions.node, root = REPO_ROOT } = {}) {
  const checks = [];
  const add = (ok, text) => { checks.push({ ok, text }); return ok; };
  add(nodeVersionOk(nodeVersion), `Node ${nodeVersion}（要 ${MIN_NODE} 或更新，知识库要求）`);
  const { errors, config } = loadConfig(configPath, { root });
  if (!add(errors.length === 0, errors.length ? '配置有问题：' : '配置齐全')) {
    for (const line of errors) add(false, `  ${line}`);
    return { checks, config: null };
  }
  add(existsSync(join(root, 'node_modules')) && existsSync(join(root, 'packages/web/node_modules/vite/bin/vite.js')),
    '主仓依赖已装（没装就在仓库根目录跑 pnpm install --frozen-lockfile）');
  if (config.kb.mode === 'start') {
    add(existsSync(join(root, 'services/knowledge-base/node_modules/fastify')),
      '知识库依赖已装（没装就在 services/knowledge-base 里跑 npm ci）');
  }
  const busy = '已被占用：先关掉占着它的程序（可能是上次没停干净），或在配置里换一个端口';
  for (const [name, port] of [['Worker', config.ports.worker], ['网页', config.ports.web]]) {
    const free = !(await portInUse(port));
    add(free, `${name}端口 ${port}${free ? ' 空着' : busy}`);
  }
  const label = config.kb.which === 'real' ? '正式知识库' : '演练知识库';
  if (config.kb.mode === 'start') {
    const free = !(await portInUse(config.kb.port));
    add(free, free ? `${label}端口 ${config.kb.port} 空着（由本脚本来起）`
      : `${label}端口 ${config.kb.port} 已经有程序在跑：如果那就是知识库，把 KB_MODE 改成 existing`);
  } else {
    const healthy = await kbHealthy(config.kb.url);
    add(healthy, healthy ? `${label}已经在 ${config.kb.port} 上跑，健康检查通过`
      : `${label}没在 ${config.kb.port} 上跑（KB_MODE=existing 要先把知识库起好）`);
  }
  return { checks, config };
}

function childEnv(extra) {
  // 不让 Terry 终端里的 KB_* / VITE_* / 钥匙漏进子进程，免得演练连到正式库。
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(KB_|VITE_|TOKEN_HASH_|GITHUB_|KNOWLEDGE_|PUBLISH_|DEEPL_)/.test(key)) continue;
    env[key] = value;
  }
  return { ...env, ...extra };
}

function pipe(stream, label, out) {
  let rest = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    const lines = (rest + chunk).split('\n');
    rest = lines.pop();
    for (const line of lines) if (line.trim()) out.write(`[${label}] ${line}\n`);
  });
  stream.on('end', () => { if (rest.trim()) out.write(`[${label}] ${rest}\n`); });
}

function launch(label, args, { cwd, env }) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  pipe(child.stdout, label, process.stdout);
  pipe(child.stderr, label, process.stderr);
  child.label = label;
  child.exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  return child;
}

async function waitFor(child, test, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let gone = false;
  child.exited.then(() => { gone = true; });
  while (Date.now() < deadline) {
    if (gone) return false;
    if (await test()) return true;
    await sleep(300);
  }
  return false;
}

async function stop(child, timeoutMs = 8000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const timer = sleep(timeoutMs).then(() => 'timeout');
  if (await Promise.race([child.exited, timer]) === 'timeout') child.kill('SIGKILL');
  await child.exited;
}

export async function main(argv = process.argv.slice(2)) {
  const at = argv.indexOf('--config');
  const configPath = at >= 0 ? argv[at + 1] : DEFAULT_CONFIG;
  const { checks, config } = await preflight({ configPath });
  for (const { ok, text } of checks) console.log(`${ok ? '✓' : '✗'} ${text}`);
  if (!config || checks.some(c => !c.ok)) { console.log('\n没启动：先把上面打 ✗ 的改好。'); return 1; }
  if (argv.includes('--check')) { console.log('\n检查通过（--check 只检查，不启动）。'); return 0; }

  console.log('\n编译 Worker（packages/worker/dist）…');
  const build = spawnSync('npm', ['--prefix', 'packages/worker', 'run', 'build'], { cwd: REPO_ROOT, encoding: 'utf8', env: childEnv({}) });
  if (build.status !== 0) { console.error(`${build.stdout}\n${build.stderr}`.trim().split('\n').slice(-15).join('\n')); console.log('✗ Worker 编译失败'); return 1; }

  console.log('编译网页（连本机 Worker，放临时目录）…');
  const webDist = mkdtempSync(join(tmpdir(), 'canteenos-mac-web-'));
  spawnSync(process.execPath, ['scripts/gen-icons.mjs'], { cwd: WEB_DIR, env: childEnv({}) });
  const webBuild = spawnSync(process.execPath, [join(WEB_DIR, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', webDist, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: WEB_DIR, encoding: 'utf8', env: childEnv({ VITE_WORKER_URL: config.web.workerUrl }),
  });
  if (webBuild.status !== 0) {
    console.error(`${webBuild.stdout}\n${webBuild.stderr}`.trim().split('\n').slice(-15).join('\n'));
    rmSync(webDist, { recursive: true, force: true });
    console.log('✗ 网页编译失败'); return 1;
  }

  const children = [];
  let stopping = null, failed = false, triggered;
  const asked = new Promise(resolve => { triggered = resolve; });
  // 只跑一次；之后再调用拿到的是同一个 promise。
  const shutdown = reason => stopping ??= (async () => {
    triggered();
    console.log(`\n${reason}，正在一起停…`);
    // 先停网页和 Worker，最后停知识库，让还在写的请求先做完。已在跑的知识库（existing）不归这里管。
    for (const child of [...children].reverse()) await stop(child);
    rmSync(webDist, { recursive: true, force: true });
    console.log('都停了。');
  })();
  const watch = child => child.exited.then(({ code, signal }) => {
    if (stopping) return;
    failed = true;
    void shutdown(`${child.label} 自己停了（${signal ?? `退出码 ${code}`}）`);
  });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => void shutdown('收到停止信号'));

  const label = config.kb.which === 'real' ? '知识库' : '演练知识库';
  if (config.kb.mode === 'start') {
    const kb = launch(label, ['apps/api/server.mjs'], {
      cwd: KB_DIR,
      env: childEnv({
        KB_DATA_DIR: config.kb.dataDir,
        ...(config.kb.dbPath ? { KB_DB_PATH: config.kb.dbPath } : {}),
        KB_HOST: '127.0.0.1',
        KB_PORT: String(config.kb.port),
        KB_ALLOWED_ORIGINS: `http://127.0.0.1:${config.kb.port},http://localhost:${config.kb.port}`,
      }),
    });
    children.push(kb);
    watch(kb);
    if (!await waitFor(kb, () => kbHealthy(config.kb.url), 30_000)) {
      await shutdown('知识库没起来'); return 1;
    }
  }
  console.log(`✓ ${label} http://127.0.0.1:${config.kb.port}`);

  const worker = launch('Worker', [join(REPO_ROOT, 'scripts/mac-local/worker-server.mjs'), '--config', configPath], { cwd: REPO_ROOT, env: childEnv({}) });
  children.push(worker);
  watch(worker);
  const corsOk = async () => {
    try {
      const response = await fetch(`${config.web.workerUrl}/catalog`, { method: 'OPTIONS', headers: { Origin: config.web.origin }, signal: AbortSignal.timeout(2000) });
      return response.status === 200 && response.headers.get('access-control-allow-origin') === config.web.origin;
    } catch { return false; }
  };
  if (!await waitFor(worker, corsOk, 15_000)) { await shutdown('Worker 没起来'); return 1; }
  console.log(`✓ Worker ${config.web.workerUrl}（只认来源 ${config.web.origin}）`);

  const web = launch('网页', [join(REPO_ROOT, 'scripts/mac-local/web-server.mjs'), '--dir', webDist, '--port', String(config.ports.web)], { cwd: REPO_ROOT, env: childEnv({}) });
  children.push(web);
  watch(web);
  const webOk = async () => {
    try { return (await fetch(`${config.web.origin}/`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
  };
  if (!await waitFor(web, webOk, 15_000)) { await shutdown('网页没起来'); return 1; }

  const t = config.target;
  console.log([
    '',
    '都起好了。',
    `  写到：${t.repo} 的 ${t.branch} 分支${config.rehearsal ? '（演练：假 GitHub）' : ''}`,
    `  发布：${t.publish === 'off' ? '关着（只写不发）' : `${t.publish} → ${t.workflow}`}；看结果：${t.pages}data/build.json?t=<随便一串数字>`,
    `  打开：${config.web.origin}/#/admin/t/<师傅或管理员的钥匙>`,
    '  停：在这个窗口按 Ctrl+C',
    '',
  ].join('\n'));

  // 等到收到 Ctrl+C，或者有一个自己停了。
  await asked;
  await stopping;
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
