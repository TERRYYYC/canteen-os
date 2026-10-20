/**
 * Mac 本机三件套（知识库 + Worker + 网页，#196）的配置：读 packages/worker/.dev.vars，逐项检查。
 *
 * 错误提示只写「哪一项、为什么」，绝不把值打出来——值里可能是 PAT 或钥匙哈希。
 * Worker 拿到的 env 只含下面列出的键，不带任何 `__` 测试接缝。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DEFAULT_CONFIG = join(REPO_ROOT, 'packages/worker/.dev.vars');
export const MIN_NODE = '24.18.0';

/** 4390 是连远端服务器的 SSH 隧道；3003/3004 是 Clowder；6398/6399 是 Redis；5177 是知识库自带编辑器。 */
export const RESERVED_PORTS = new Set([3003, 3004, 4390, 5177, 6398, 6399]);
/** 本机知识库：4391 是正式那份（装着 49 道），4392 是演练用的临时库。 */
export const KB_PORTS = { 4391: 'real', 4392: 'rehearsal' };

const SECRET_KEYS = ['GITHUB_PAT', 'TOKEN_HASH_CHEF', 'TOKEN_HASH_BUYER', 'TOKEN_HASH_ADMIN', 'DEEPL_API_KEY'];
const REQUIRED = [
  'GITHUB_PAT', 'TOKEN_HASH_CHEF', 'TOKEN_HASH_BUYER', 'TOKEN_HASH_ADMIN',
  'GITHUB_REPO', 'GITHUB_BRANCH', 'PUBLISH_MODE', 'PUBLISH_WORKFLOW', 'PAGES_BASE_URL',
  'KNOWLEDGE_BASE_URL', 'KB_MODE', 'WORKER_PORT', 'WEB_PORT', 'ALLOWED_ORIGIN',
];
const OPTIONAL = ['DEEPL_API_KEY', 'PUBLISH_CLAIM_TIMEOUT_MS', 'KNOWLEDGE_TIMEOUT_MS', 'KB_DATA_DIR', 'KB_DB_PATH', 'GITHUB_API_BASE'];
const KNOWN = new Set([...REQUIRED, ...OPTIONAL]);
const PLACEHOLDER = /^(?:<.*>|changeme|todo|xxx+|填.*)$/i;

/** dotenv 的子集：`KEY=VALUE`、`#` 注释、空行；值可用一对引号包起来。和 wrangler 的 .dev.vars 兼容。 */
export function parseVars(text) {
  const values = {};
  const errors = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    const match = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) { errors.push(`第 ${index + 1} 行看不懂，要写成 名字=值`); return; }
    const [, key, raw] = match;
    let value = raw;
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
    if (key in values) errors.push(`${key} 写了两遍`);
    values[key] = value;
  });
  return { values, errors };
}

export function nodeVersionOk(version = process.versions.node, minimum = MIN_NODE) {
  const a = version.split('.').map(Number), b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i];
  }
  return true;
}

function port(value) {
  if (!/^[0-9]{4,5}$/.test(value ?? '')) return null;
  const n = Number(value);
  return n > 1024 && n < 65536 ? n : null;
}

function loopbackOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && port(url.port) !== null && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

function insideRepo(path, root) {
  const rel = relative(resolve(root), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * 检查配置，返回 { errors, config }。errors 是给 Terry 看的中文句子，一条一件事。
 * options.root 只给测试用：把「仓库目录」换成临时目录。
 */
export function validateConfig(values, { root = REPO_ROOT } = {}) {
  const errors = [];
  const v = { ...values };
  if (v.KB_MODE === undefined) v.KB_MODE = 'start';

  for (const key of Object.keys(v)) if (!KNOWN.has(key)) errors.push(`${key} 不认识（拼错了？）`);
  for (const key of REQUIRED) {
    if (v[key] === undefined || v[key] === '') errors.push(`${key} 没填`);
    else if (PLACEHOLDER.test(v[key])) errors.push(`${key} 还是模板里的占位，要换成真值`);
  }
  for (const key of SECRET_KEYS) if (v[key] && /\s/.test(v[key])) errors.push(`${key} 里有空格或换行，重新复制一次`);

  // —— 发布目标：模拟和真实必须成对，不能「假 GitHub + 真 Pages」或反过来 ——
  const rehearsal = v.GITHUB_API_BASE !== undefined && v.GITHUB_API_BASE !== '';
  if (rehearsal && !loopbackOrigin(v.GITHUB_API_BASE)) errors.push('GITHUB_API_BASE 只给演练用，只能是 http://127.0.0.1:<端口>（假 GitHub）；真实发布不要写这一项');
  if (v.PAGES_BASE_URL) {
    let pages;
    try { pages = new URL(v.PAGES_BASE_URL); } catch { /* 下面报错 */ }
    const shape = pages && pages.pathname.endsWith('/') && !pages.search && !pages.hash && !pages.username && !pages.password;
    if (!shape) errors.push('PAGES_BASE_URL 要是完整网址，以 / 结尾');
    else if (rehearsal && !(pages.protocol === 'http:' && pages.hostname === '127.0.0.1')) errors.push('演练（写了 GITHUB_API_BASE）时，PAGES_BASE_URL 也要指向本机的假 Pages');
    else if (!rehearsal && pages.protocol !== 'https:') errors.push('PAGES_BASE_URL 要是 https:// 开头的线上地址');
  }
  if (v.GITHUB_PAT && !rehearsal && !v.GITHUB_PAT.startsWith('github_pat_')) {
    errors.push('GITHUB_PAT 要用细粒度 token（github_pat_ 开头），只给本仓库 Contents 和 Actions 读写');
  }
  if (v.GITHUB_REPO && !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(v.GITHUB_REPO)) errors.push('GITHUB_REPO 要写成 主人/仓库');
  if (v.GITHUB_BRANCH && !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v.GITHUB_BRANCH)) errors.push('GITHUB_BRANCH 格式不对');
  if (v.PUBLISH_MODE && !['dispatch', 'push-trigger', 'off'].includes(v.PUBLISH_MODE)) errors.push('PUBLISH_MODE 只能是 dispatch、push-trigger 或 off');
  // build-deploy.yml 会把被触发的分支发布到正式 Pages，译文还会推回 main；测试分支只能写、不能发。
  if (v.GITHUB_BRANCH && v.GITHUB_BRANCH !== 'main' && v.PUBLISH_MODE && v.PUBLISH_MODE !== 'off') {
    errors.push('GITHUB_BRANCH 不是 main 时，PUBLISH_MODE 只能是 off：在测试分支上点发布，会把它发到正式 Pages');
  }
  if (v.PUBLISH_WORKFLOW && !/^[A-Za-z0-9._-]+\.ya?ml$/.test(v.PUBLISH_WORKFLOW)) errors.push('PUBLISH_WORKFLOW 要是 .github/workflows 里的文件名，比如 build-deploy.yml');
  if (v.PUBLISH_CLAIM_TIMEOUT_MS && !(/^[0-9]+$/.test(v.PUBLISH_CLAIM_TIMEOUT_MS) && Number(v.PUBLISH_CLAIM_TIMEOUT_MS) <= 120000)) errors.push('PUBLISH_CLAIM_TIMEOUT_MS 要是 0 到 120000 的毫秒数');
  if (v.KNOWLEDGE_TIMEOUT_MS && !(/^[0-9]+$/.test(v.KNOWLEDGE_TIMEOUT_MS) && Number(v.KNOWLEDGE_TIMEOUT_MS) >= 100 && Number(v.KNOWLEDGE_TIMEOUT_MS) <= 30000)) errors.push('KNOWLEDGE_TIMEOUT_MS 要是 100 到 30000 的毫秒数');

  // —— 钥匙：只放哈希，三个各不相同 ——
  const hashes = ['TOKEN_HASH_CHEF', 'TOKEN_HASH_BUYER', 'TOKEN_HASH_ADMIN'];
  for (const key of hashes) if (v[key] && !/^[0-9a-f]{64}$/.test(v[key])) errors.push(`${key} 要是 64 位小写十六进制（钥匙的 SHA-256），不是钥匙本身`);
  const filled = hashes.map(key => v[key]).filter(Boolean);
  if (filled.length === 3 && new Set(filled).size !== 3) errors.push('三个 TOKEN_HASH_* 不能相同：每个角色一条钥匙');

  // —— 端口和来源 ——
  let kbPort = null;
  const kbMatch = /^http:\/\/127\.0\.0\.1:([0-9]+)\/?$/.exec(v.KNOWLEDGE_BASE_URL ?? '');
  if (v.KNOWLEDGE_BASE_URL) {
    if (kbMatch?.[1] === '4390') errors.push('KNOWLEDGE_BASE_URL 不能用 4390：那是连远端服务器的隧道。正式库用 4391，演练用 4392');
    else if (!kbMatch || !(kbMatch[1] in KB_PORTS)) errors.push('KNOWLEDGE_BASE_URL 只能是 http://127.0.0.1:4391（正式）或 http://127.0.0.1:4392（演练）');
    else kbPort = Number(kbMatch[1]);
  }
  const workerPort = v.WORKER_PORT ? port(v.WORKER_PORT) : null;
  const webPort = v.WEB_PORT ? port(v.WEB_PORT) : null;
  if (v.WORKER_PORT && workerPort === null) errors.push('WORKER_PORT 要是 1025–65535 的端口号');
  if (v.WEB_PORT && webPort === null) errors.push('WEB_PORT 要是 1025–65535 的端口号');
  for (const [key, n] of [['WORKER_PORT', workerPort], ['WEB_PORT', webPort]]) {
    if (n !== null && (RESERVED_PORTS.has(n) || n in KB_PORTS)) errors.push(`${key} 不能用 ${n}：这个端口留给别的服务`);
  }
  if (workerPort !== null && workerPort === webPort) errors.push('WORKER_PORT 和 WEB_PORT 不能一样');
  if (v.ALLOWED_ORIGIN && webPort !== null && v.ALLOWED_ORIGIN !== `http://127.0.0.1:${webPort}`) {
    errors.push(`ALLOWED_ORIGIN 要和网页地址一字不差：http://127.0.0.1:${webPort}（不带结尾的 /，不用 localhost）`);
  }

  // —— 知识库：自己起，或者用已经在跑的那份 ——
  if (!['start', 'existing'].includes(v.KB_MODE)) errors.push('KB_MODE 只能是 start（脚本来起知识库）或 existing（用已经在跑的）');
  let dataDir = null, dbPath = null;
  if (v.KB_MODE === 'start') {
    if (!v.KB_DATA_DIR) errors.push('KB_MODE=start 时要填 KB_DATA_DIR：知识库的数据目录');
    else if (!isAbsolute(v.KB_DATA_DIR)) errors.push('KB_DATA_DIR 要写完整路径（/ 开头）');
    else if (insideRepo(v.KB_DATA_DIR, root)) errors.push('KB_DATA_DIR 不能放在仓库里面：数据库不进 Git');
    else if (!existsSync(v.KB_DATA_DIR) || !statSync(v.KB_DATA_DIR).isDirectory()) errors.push('KB_DATA_DIR 这个目录不存在');
    else dataDir = resolve(v.KB_DATA_DIR);
    if (v.KB_DB_PATH) {
      if (!isAbsolute(v.KB_DB_PATH)) errors.push('KB_DB_PATH 要写完整路径（/ 开头）');
      else if (insideRepo(v.KB_DB_PATH, root)) errors.push('KB_DB_PATH 不能放在仓库里面');
      else dbPath = resolve(v.KB_DB_PATH);
    }
    // 4391 是正式库：数据库文件必须已经在，免得在空目录里悄悄新建一个空库，师傅以为菜都没了。
    const db = dbPath ?? (dataDir ? join(dataDir, 'knowledge.sqlite') : null);
    if (kbPort === 4391 && db && !existsSync(db)) errors.push('4391 是正式知识库，但数据目录里没有数据库文件：目录填错了？演练请用 4392');
  } else if (v.KB_DATA_DIR || v.KB_DB_PATH) {
    errors.push('KB_MODE=existing 时不要填 KB_DATA_DIR / KB_DB_PATH：知识库由别处起，脚本不管它的数据');
  }

  if (errors.length) return { errors, config: null };
  const workerEnv = {
    TOKEN_HASH_CHEF: v.TOKEN_HASH_CHEF,
    TOKEN_HASH_BUYER: v.TOKEN_HASH_BUYER,
    TOKEN_HASH_ADMIN: v.TOKEN_HASH_ADMIN,
    GITHUB_PAT: v.GITHUB_PAT,
    GITHUB_REPO: v.GITHUB_REPO,
    GITHUB_BRANCH: v.GITHUB_BRANCH,
    PAGES_BASE_URL: v.PAGES_BASE_URL,
    ALLOWED_ORIGIN: v.ALLOWED_ORIGIN,
    PUBLISH_MODE: v.PUBLISH_MODE,
    PUBLISH_WORKFLOW: v.PUBLISH_WORKFLOW,
    KNOWLEDGE_BASE_URL: v.KNOWLEDGE_BASE_URL,
  };
  for (const key of ['PUBLISH_CLAIM_TIMEOUT_MS', 'KNOWLEDGE_TIMEOUT_MS', 'DEEPL_API_KEY', 'GITHUB_API_BASE']) {
    if (v[key]) workerEnv[key] = v[key];
  }
  return {
    errors,
    config: {
      workerEnv,
      rehearsal,
      ports: { kb: kbPort, worker: workerPort, web: webPort },
      kb: { mode: v.KB_MODE, url: `http://127.0.0.1:${kbPort}`, port: kbPort, which: KB_PORTS[kbPort], dataDir, dbPath },
      web: { origin: v.ALLOWED_ORIGIN, workerUrl: `http://127.0.0.1:${workerPort}` },
      target: { repo: v.GITHUB_REPO, branch: v.GITHUB_BRANCH, publish: v.PUBLISH_MODE, workflow: v.PUBLISH_WORKFLOW, pages: v.PAGES_BASE_URL },
    },
  };
}

/** 读文件 + 检查。文件不在、读不了也算一条错误，不抛。 */
export function loadConfig(path = DEFAULT_CONFIG, options) {
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch { return { errors: [`配置文件不在：先把 packages/worker/.dev.vars.example 复制成 ${path === DEFAULT_CONFIG ? 'packages/worker/.dev.vars' : '你指定的那个文件'}，再填`], config: null }; }
  const parsed = parseVars(text);
  if (parsed.errors.length) return { errors: parsed.errors, config: null };
  return validateConfig(parsed.values, options);
}

/** 只给日志用：把路径写成相对仓库的，免得把本机目录打进截图。 */
export function shortPath(path, root = REPO_ROOT) {
  return insideRepo(path, root) ? relative(root, path) || '.' : `…${sep}${path.split(sep).slice(-2).join(sep)}`;
}
