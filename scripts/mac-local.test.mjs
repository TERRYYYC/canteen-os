/**
 * Mac 本机三件套（scripts/mac-local/，#196）的检查：配置、端口、Worker 适配层，以及一键启动的起齐、停齐。
 * 端到端那一条要 Node 24.18+ 和 services/knowledge-base 的依赖；缺了就跳过并说明（CI 是 Node 20）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, loadConfig, nodeVersionOk, parseVars, validateConfig } from './mac-local/config.mjs';
import { portInUse } from './mac-local/start.mjs';
import { MAX_BODY, WORKER_DIST, startWorkerServer } from './mac-local/worker-server.mjs';
import { createWebServer } from './mac-local/web-server.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const token = () => randomBytes(32).toString('base64url');

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'mac-local-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** 一份能通过的真实模式配置（演练知识库 4392，所以数据目录可以是空的）。 */
function good(dir, extra = {}) {
  return {
    GITHUB_PAT: 'github_pat_TEST_ONLY_not_a_real_token',
    TOKEN_HASH_CHEF: sha('chef'), TOKEN_HASH_BUYER: sha('buyer'), TOKEN_HASH_ADMIN: sha('admin'),
    GITHUB_REPO: 'TERRYYYC/canteen-os', GITHUB_BRANCH: 'main', PUBLISH_MODE: 'dispatch', PUBLISH_WORKFLOW: 'build-deploy.yml',
    PAGES_BASE_URL: 'https://terryyyc.github.io/canteen-os/', KNOWLEDGE_BASE_URL: 'http://127.0.0.1:4392',
    KB_MODE: 'start', KB_DATA_DIR: dir, WORKER_PORT: '8787', WEB_PORT: '5180', ALLOWED_ORIGIN: 'http://127.0.0.1:5180',
    ...extra,
  };
}

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('parseVars reads name=value lines, comments and quotes, and flags bad or repeated lines', () => {
  const { values, errors } = parseVars('# 注释\n\nA=1\nB = "two words"\nC=\'x\'\nD=\n');
  assert.deepEqual(values, { A: '1', B: 'two words', C: 'x', D: '' });
  assert.deepEqual(errors, []);
  const bad = parseVars('A=1\nnot a line\nA=2\n');
  assert.equal(bad.errors.length, 2);
  assert.match(bad.errors[0], /第 2 行/);
  assert.match(bad.errors[1], /A 写了两遍/);
});

test('Node version gate is 24.18.0 (the knowledge base requirement)', () => {
  assert.equal(nodeVersionOk('24.18.0'), true);
  assert.equal(nodeVersionOk('24.19.1'), true);
  assert.equal(nodeVersionOk('25.0.0'), true);
  assert.equal(nodeVersionOk('24.17.9'), false);
  assert.equal(nodeVersionOk('20.20.2'), false);
});

test('a complete config passes and the Worker gets only the listed keys, never a test seam', t => {
  const dir = scratch(t), root = join(dir, 'repo'), data = join(dir, 'kb');
  mkdirSync(root); mkdirSync(data);
  const { errors, config } = validateConfig(good(data), { root });
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(config.workerEnv).sort(), ['ALLOWED_ORIGIN', 'GITHUB_BRANCH', 'GITHUB_PAT', 'GITHUB_REPO', 'KNOWLEDGE_BASE_URL',
    'PAGES_BASE_URL', 'PUBLISH_MODE', 'PUBLISH_WORKFLOW', 'TOKEN_HASH_ADMIN', 'TOKEN_HASH_BUYER', 'TOKEN_HASH_CHEF']);
  assert.ok(Object.keys(config.workerEnv).every(key => !key.startsWith('__')));
  assert.deepEqual(config.ports, { kb: 4392, worker: 8787, web: 5180 });
  assert.equal(config.kb.which, 'rehearsal');
  assert.equal(config.rehearsal, false);
});

test('config rules: tunnel port, test branch, key hashes, origin, token kind, paired targets, data directory', t => {
  const dir = scratch(t), root = join(dir, 'repo'), data = join(dir, 'kb'), real = join(dir, 'real-kb');
  mkdirSync(join(root, 'inside'), { recursive: true }); mkdirSync(data); mkdirSync(real);
  const cases = [
    [{ KNOWLEDGE_BASE_URL: 'http://127.0.0.1:4390' }, /4390.*隧道/],
    [{ KNOWLEDGE_BASE_URL: 'http://127.0.0.1:4393' }, /只能是/],
    [{ KNOWLEDGE_BASE_URL: 'http://localhost:4391' }, /只能是/],
    [{ GITHUB_BRANCH: 'mac-worker-trial' }, /PUBLISH_MODE 只能是 off/],
    [{ GITHUB_BRANCH: 'mac-worker-trial', PUBLISH_MODE: 'push-trigger' }, /PUBLISH_MODE 只能是 off/],
    [{ PUBLISH_MODE: 'auto' }, /PUBLISH_MODE 只能是/],
    [{ TOKEN_HASH_CHEF: sha('chef').toUpperCase() }, /TOKEN_HASH_CHEF 要是 64 位/],
    [{ TOKEN_HASH_BUYER: token() }, /TOKEN_HASH_BUYER 要是 64 位/],
    [{ TOKEN_HASH_ADMIN: sha('chef') }, /不能相同/],
    [{ ALLOWED_ORIGIN: 'http://localhost:5180' }, /一字不差/],
    [{ ALLOWED_ORIGIN: 'http://127.0.0.1:5180/' }, /一字不差/],
    [{ ALLOWED_ORIGIN: 'https://terryyyc.github.io' }, /一字不差/],
    [{ GITHUB_PAT: 'ghp_classicTokenShape' }, /细粒度/],
    [{ GITHUB_PAT: '<填你的 token>' }, /占位/],
    [{ GITHUB_API_BASE: 'http://127.0.0.1:4480' }, /假 Pages/],
    [{ GITHUB_API_BASE: 'https://api.github.com' }, /只给演练用/],
    [{ PAGES_BASE_URL: 'http://127.0.0.1:4480/canteen/' }, /https:\/\//],
    [{ PAGES_BASE_URL: 'https://terryyyc.github.io/canteen-os' }, /以 \/ 结尾/],
    [{ TOKEN_HASH_COOK: sha('x') }, /不认识/],
    [{ KB_DATA_DIR: join(root, 'inside') }, /不能放在仓库里面/],
    [{ KB_DATA_DIR: 'relative/kb' }, /完整路径/],
    [{ KB_DATA_DIR: join(dir, 'missing') }, /不存在/],
    [{ KB_DATA_DIR: undefined }, /要填 KB_DATA_DIR/],
    [{ KNOWLEDGE_BASE_URL: 'http://127.0.0.1:4391', KB_DATA_DIR: real }, /4391 是正式知识库/],
    [{ KB_MODE: 'existing' }, /不要填 KB_DATA_DIR/],
    [{ KB_MODE: 'remote' }, /KB_MODE 只能是/],
    [{ WORKER_PORT: '4390' }, /留给别的服务/],
    [{ WEB_PORT: '4391', ALLOWED_ORIGIN: 'http://127.0.0.1:4391' }, /留给别的服务/],
    [{ WEB_PORT: '8787', ALLOWED_ORIGIN: 'http://127.0.0.1:8787' }, /不能一样/],
    [{ WORKER_PORT: '80' }, /端口号/],
  ];
  for (const [change, pattern] of cases) {
    const values = good(data, change);
    for (const [key, value] of Object.entries(change)) if (value === undefined) delete values[key];
    const { errors, config } = validateConfig(values, { root });
    assert.equal(config, null, JSON.stringify(change));
    assert.ok(errors.some(line => pattern.test(line)), `${JSON.stringify(change)} → ${errors.join(' / ')}`);
  }
  // 能过的几种：测试分支只写不发；演练的成对目标；正式库目录里已有数据库；已在跑的知识库。
  writeFileSync(join(real, 'knowledge.sqlite'), '');
  for (const change of [
    { GITHUB_BRANCH: 'mac-worker-trial', PUBLISH_MODE: 'off' },
    { GITHUB_API_BASE: 'http://127.0.0.1:4480', PAGES_BASE_URL: 'http://127.0.0.1:4480/canteen/', GITHUB_PAT: 'rehearsal' },
    { KNOWLEDGE_BASE_URL: 'http://127.0.0.1:4391', KB_DATA_DIR: real },
    { KNOWLEDGE_BASE_URL: 'http://127.0.0.1:4391', KB_MODE: 'existing', KB_DATA_DIR: undefined },
  ]) {
    const values = good(data, change);
    for (const [key, value] of Object.entries(change)) if (value === undefined) delete values[key];
    assert.deepEqual(validateConfig(values, { root }).errors, [], JSON.stringify(change));
  }
});

test('error messages never repeat the secret values', t => {
  const dir = scratch(t), data = join(dir, 'kb');
  mkdirSync(data);
  const pat = 'github_pat_SHOULD_NEVER_BE_PRINTED_123', hash = sha('chef');
  const values = good(data, { GITHUB_PAT: `${pat} x`, TOKEN_HASH_BUYER: hash, TOKEN_HASH_ADMIN: 'A'.repeat(64), DEEPL_API_KEY: 'deepl secret' });
  const { errors } = validateConfig(values, { root: join(dir, 'repo') });
  assert.ok(errors.length >= 3);
  for (const line of errors) {
    for (const secret of [pat, hash, 'A'.repeat(64), 'deepl secret']) assert.ok(!line.includes(secret), line);
  }
});

test('the template has empty secrets, known keys, and the same public targets as wrangler.toml', () => {
  const template = readFileSync(join(REPO_ROOT, 'packages/worker/.dev.vars.example'), 'utf8');
  const { values, errors } = parseVars(template);
  assert.deepEqual(errors, []);
  for (const key of ['GITHUB_PAT', 'TOKEN_HASH_CHEF', 'TOKEN_HASH_BUYER', 'TOKEN_HASH_ADMIN', 'KB_DATA_DIR']) assert.equal(values[key], '', key);
  assert.ok(!/github_pat_[A-Za-z0-9_]{20,}|[0-9a-f]{64}|\/Users\/|\/home\//.test(template), 'no real-looking secret or local path');
  const checked = validateConfig(values);
  assert.deepEqual(checked.errors.sort(), ['GITHUB_PAT 没填', 'KB_MODE=start 时要填 KB_DATA_DIR：知识库的数据目录',
    'TOKEN_HASH_ADMIN 没填', 'TOKEN_HASH_BUYER 没填', 'TOKEN_HASH_CHEF 没填'].sort());
  const wrangler = readFileSync(join(REPO_ROOT, 'packages/worker/wrangler.toml'), 'utf8');
  const vars = Object.fromEntries([...wrangler.matchAll(/^([A-Z_]+) = "([^"]*)"$/gm)].map(m => [m[1], m[2]]));
  for (const key of ['GITHUB_REPO', 'GITHUB_BRANCH', 'PAGES_BASE_URL', 'PUBLISH_MODE', 'PUBLISH_WORKFLOW', 'PUBLISH_CLAIM_TIMEOUT_MS']) {
    assert.equal(values[key], vars[key], key);
  }
  // 本机来源只在本机配置里；线上 Worker 的 CORS 来源不放宽。
  assert.equal(vars.ALLOWED_ORIGIN, 'https://terryyyc.github.io');
  assert.equal(values.ALLOWED_ORIGIN, `http://127.0.0.1:${values.WEB_PORT}`);
});

test('the real config file is ignored by Git, the template is not', () => {
  const run = path => spawnSync('git', ['check-ignore', '-q', path], { cwd: REPO_ROOT }).status;
  assert.equal(run('packages/worker/.dev.vars'), 0);
  assert.equal(run('packages/worker/.dev.vars.rehearsal'), 0);
  assert.equal(run('packages/worker/.dev.vars.example'), 1);
});

test('the config file must live outside the repo and be readable only by its owner', t => {
  const dir = scratch(t), root = join(dir, 'repo'), data = join(dir, 'kb');
  mkdirSync(join(root, 'packages/worker'), { recursive: true }); mkdirSync(data);
  const text = Object.entries(good(data)).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  const inside = join(root, 'packages/worker/.dev.vars'), outside = join(dir, 'mac-local.vars');
  writeFileSync(inside, text, { mode: 0o600 }); writeFileSync(outside, text, { mode: 0o600 });
  assert.match(loadConfig(inside, { root }).errors[0], /不能放在仓库里面/);
  // 经符号链接指进仓库也一样。
  symlinkSync(inside, join(dir, 'link.vars'));
  assert.match(loadConfig(join(dir, 'link.vars'), { root }).errors[0], /不能放在仓库里面/);
  assert.deepEqual(loadConfig(outside, { root }).errors, []);
  chmodSync(outside, 0o644);
  assert.match(loadConfig(outside, { root }).errors[0], /chmod 600/);
});

test('web server sends only the built directory: no traversal, no symlink escape, no CORS', async t => {
  const dir = scratch(t), dist = join(dir, 'dist'), sentinel = `SENTINEL-${randomBytes(8).toString('hex')}`;
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<div id="app"></div>');
  writeFileSync(join(dist, 'assets/app.js'), 'console.log(1)');
  writeFileSync(join(dir, '.dev.vars'), `GITHUB_PAT=${sentinel}\n`);
  symlinkSync(join(dir, '.dev.vars'), join(dist, 'escape.txt'));
  const port = await freePort();
  const server = await createWebServer({ root: dist, port });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${port}`;
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);
  assert.equal((await fetch(`${base}/assets/app.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(`${base}/assets/app.js`, { method: 'HEAD' })).status, 200);
  for (const path of ['/../.dev.vars', '/..%2F.dev.vars', '/%2e%2e/.dev.vars', '/escape.txt', `/@fs${dir}/.dev.vars`, '/assets', '/missing.js', '/%00']) {
    const response = await fetch(base + path, { headers: { Origin: 'http://localhost:1' } });
    const body = await response.text();
    assert.ok(response.status >= 400, `${path} → ${response.status}`);
    assert.ok(!body.includes(sentinel), `${path} leaked`);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  const host = await new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: '/', headers: { Host: `evil.example:${port}` } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(host, 403);
});

test('a missing config file is one readable error', () => {
  const { errors, config } = loadConfig(join(tmpdir(), 'no-such-mac-local-config'));
  assert.equal(config, null);
  assert.match(errors[0], /\.dev\.vars\.example/);
});

test('portInUse sees a listener on 127.0.0.1 and a freed port', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  assert.equal(await portInUse(port), true);
  await new Promise(resolve => server.close(resolve));
  assert.equal(await portInUse(port), false);
});

test('Worker adapter: loopback only, exact origin, real fetch to the knowledge base and GitHub', { skip: !existsSync(WORKER_DIST) && 'packages/worker/dist 还没编译（先跑 pnpm -C packages/worker build）' }, async t => {
  if (await portInUse(4392)) return t.skip('4392 已被占用（可能在演练），跳过');
  const tokens = { chef: token(), buyer: token(), admin: token() };
  const seen = { kb: [], github: [] };
  const kb = createServer((req, res) => {
    seen.kb.push({ url: req.url, client: req.headers['x-kb-client'], auth: req.headers.authorization });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sqliteVersion: 'stub', schemaVersion: 6, releaseId: 'stub' }));
  });
  const github = createServer((req, res) => {
    seen.github.push({ url: req.url, auth: req.headers.authorization });
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end('{"message":"Bad credentials"}');
  });
  await new Promise(resolve => kb.listen(4392, '127.0.0.1', resolve));
  await new Promise(resolve => github.listen(0, '127.0.0.1', resolve));
  t.after(() => { kb.close(); github.close(); });
  const gh = github.address().port, workerPort = await freePort(), webPort = await freePort();
  const dir = scratch(t);
  const { errors, config } = validateConfig({
    ...good(dir, { KB_MODE: 'existing', KB_DATA_DIR: undefined }),
    GITHUB_PAT: 'rehearsal-pat-for-test',
    TOKEN_HASH_CHEF: sha(tokens.chef), TOKEN_HASH_BUYER: sha(tokens.buyer), TOKEN_HASH_ADMIN: sha(tokens.admin),
    GITHUB_API_BASE: `http://127.0.0.1:${gh}`, PAGES_BASE_URL: `http://127.0.0.1:${gh}/canteen/`,
    WORKER_PORT: String(workerPort), WEB_PORT: String(webPort), ALLOWED_ORIGIN: `http://127.0.0.1:${webPort}`,
  });
  assert.deepEqual(errors, []);
  const logs = [];
  const original = console.log;
  console.log = line => logs.push(line);
  t.after(() => { console.log = original; });
  const server = await startWorkerServer({ config });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  assert.equal(server.address().address, '127.0.0.1');
  const base = `http://127.0.0.1:${workerPort}`, origin = `http://127.0.0.1:${webPort}`;
  const bearer = role => ({ Authorization: `Bearer ${tokens[role]}` });

  const preflight = await fetch(`${base}/catalog`, { method: 'OPTIONS', headers: { Origin: origin } });
  assert.equal(preflight.status, 200);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  for (const other of ['http://localhost:' + webPort, 'https://terryyyc.github.io', 'https://evil.example']) {
    assert.equal((await fetch(`${base}/catalog`, { headers: { Origin: other, ...bearer('chef') } })).status, 403, other);
  }
  const rebinding = await new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: workerPort, path: '/catalog', headers: { Host: `evil.example:${workerPort}` } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(rebinding, 403);
  assert.equal((await fetch(`${base}/catalog`)).status, 401);

  const health = await fetch(`${base}/knowledge/health`, { headers: bearer('chef') });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  assert.equal(seen.kb.at(-1).client, 'web');
  assert.equal(seen.kb.at(-1).auth, undefined, 'the role key never reaches the knowledge base');
  assert.equal((await fetch(`${base}/knowledge/recipes`, { headers: bearer('buyer') })).status, 403, 'ADR-0010');

  const catalog = await fetch(`${base}/catalog`, { headers: bearer('chef') });
  assert.equal(catalog.status, 502);
  assert.match(seen.github.at(-1).url, /^\/repos\/TERRYYYC\/canteen-os\//);
  assert.match(seen.github.at(-1).auth, /rehearsal-pat-for-test/);

  const big = await fetch(`${base}/knowledge/assets/upload`, { method: 'POST', headers: bearer('chef'), body: Buffer.alloc(MAX_BODY + 1) });
  assert.equal(big.status, 413);
  assert.ok(logs.join('\n').length > 0 && !logs.join('\n').includes(tokens.chef), 'logs never carry the key');
});

const e2eSkip = !nodeVersionOk() ? `要 Node 24.18+（现在 ${process.versions.node}）`
  : !existsSync(join(REPO_ROOT, 'services/knowledge-base/node_modules/fastify')) ? '知识库依赖没装（services/knowledge-base 里 npm ci）'
  : false;

/** 仓库里放带哨兵值的密钥形文件（名字都在 .gitignore 里），测完删掉；Terry 自己的 .dev.vars 在就不碰。 */
function plantSecrets(t) {
  const sentinel = `SENTINEL-${randomBytes(12).toString('hex')}`;
  const names = [`.dev.vars.mac-local-test-${randomBytes(4).toString('hex')}`, `.env.mac-local-test-${randomBytes(4).toString('hex')}`];
  if (!existsSync(join(REPO_ROOT, 'packages/worker/.dev.vars'))) names.push('.dev.vars');
  const files = names.map(name => join(REPO_ROOT, 'packages/worker', name));
  for (const file of files) writeFileSync(file, `GITHUB_PAT=${sentinel}\n`, { mode: 0o600 });
  t.after(() => { for (const file of files) rmSync(file, { force: true }); });
  return { sentinel, names };
}

test('start.mjs checks, starts all three on 127.0.0.1, never serves secret files, and stops all on Ctrl+C', { skip: e2eSkip, timeout: 240_000 }, async t => {
  if (await portInUse(4392)) return t.skip('4392 已被占用（可能在演练），跳过');
  const dir = scratch(t), data = join(dir, 'kb'), file = join(dir, 'test.vars');
  mkdirSync(data);
  const planted = plantSecrets(t);
  const github = createServer((req, res) => { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); });
  await new Promise(resolve => github.listen(0, '127.0.0.1', resolve));
  t.after(() => github.close());
  const gh = github.address().port, workerPort = await freePort(), webPort = await freePort();
  const values = {
    ...good(data), GITHUB_PAT: 'rehearsal-pat-for-test',
    GITHUB_API_BASE: `http://127.0.0.1:${gh}`, PAGES_BASE_URL: `http://127.0.0.1:${gh}/canteen/`,
    WORKER_PORT: String(workerPort), WEB_PORT: String(webPort), ALLOWED_ORIGIN: `http://127.0.0.1:${webPort}`,
  };
  writeFileSync(file, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });

  const check = spawnSync(process.execPath, ['scripts/mac-local/start.mjs', '--config', file, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /检查通过/);

  const child = spawn(process.execPath, ['scripts/mac-local/start.mjs', '--config', file], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  child.stderr.on('data', chunk => { out += chunk; });
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  // 测试失败时也要按正常流程停（SIGINT），直接 SIGKILL 会留下知识库、Worker、网页三个孤儿进程。
  t.after(async () => {
    if (child.exitCode !== null) return;
    child.kill('SIGINT');
    const timer = new Promise(resolve => setTimeout(resolve, 20_000, 'timeout'));
    if (await Promise.race([exited, timer]) === 'timeout') child.kill('SIGKILL');
  });
  const deadline = Date.now() + 120_000;
  while (!out.includes('都起好了') && child.exitCode === null && Date.now() < deadline) await new Promise(r => setTimeout(r, 300));
  assert.match(out, /都起好了/, out);
  for (const port of [4392, workerPort, webPort]) assert.equal(await portInUse(port), true, `listening on ${port}`);
  assert.equal((await fetch('http://127.0.0.1:4392/api/v1/health')).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${webPort}/`)).status, 200);
  assert.ok(!out.includes(values.TOKEN_HASH_CHEF) && !out.includes(values.GITHUB_PAT), 'nothing secret printed');

  // 反向回归（#199 审查 pr199/vite-serves-worker-secret-config）：网页那个端口不能把仓库里的密钥文件发出去。
  // 以前起的是 Vite 开发服务器，/@fs/<仓库>/packages/worker/.dev.vars 会 200 原样返回（.env 才被它默认挡住）。
  const web = `http://127.0.0.1:${webPort}`, root = REPO_ROOT.replace(/\/$/, '');
  const index = await fetch(`${web}/`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /id="app"/, 'positive control: the app itself is served');
  const probes = [];
  for (const name of planted.names) {
    probes.push(`/@fs${root}/packages/worker/${name}`, `/packages/worker/${name}`, `/../worker/${name}`,
      `/..%2Fworker%2F${name}`, `/%2e%2e/%2e%2e/packages/worker/${name}`, `/@fs${root}/packages/worker/${encodeURIComponent(name)}`);
  }
  probes.push(`/@fs${file}`); // 这次用的配置文件本身（在仓库外）
  const secrets = [planted.sentinel, values.GITHUB_PAT, values.TOKEN_HASH_CHEF];
  const answers = [];
  for (const path of probes) {
    const response = await fetch(web + path, { headers: { Origin: `http://localhost:${webPort}` } });
    answers.push({ path, status: response.status, body: await response.text(), cors: response.headers.get('access-control-allow-origin') });
  }
  const leaked = answers.filter(a => secrets.some(secret => a.body.includes(secret))).map(a => `${a.path} (${a.status})`);
  assert.deepEqual(leaked, [], 'secret file content was served');
  for (const a of answers) {
    assert.ok(a.status >= 400, `${a.path} → ${a.status}`);
    assert.equal(a.cors, null, `${a.path} must not grant CORS`);
  }

  child.kill('SIGINT');
  assert.equal(await exited, 0, out);
  assert.match(out, /都停了/);
  for (const port of [4392, workerPort, webPort]) assert.equal(await portInUse(port), false, `freed ${port}`);
  assert.ok(existsSync(join(data, 'knowledge.sqlite')), 'the knowledge base used the configured directory');
});
