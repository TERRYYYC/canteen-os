#!/usr/bin/env node
// Explicit build-tool preparation. Importing this module never downloads or builds.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync, chmodSync, renameSync, rmSync, openSync, closeSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = realpathSync(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '..');
const DEFAULT_CACHE = path.join(ROOT, '.cache/team-image-tools');
const SOURCE_URL = 'https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.6.0.tar.gz';
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const NAMES = ['dwebp', 'webpmux'];
const NOTICES = ['COPYING', 'PATENTS', 'AUTHORS'];
const PREPARE = 'node scripts/prepare-team-image-tools.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export const TEAM_IMAGE_TOOL_RELEASE = Object.freeze({
  version: '1.6.0',
  sha256: 'e4ab7009bf0629fd11982d4c2aa83964cf244cffba7347ecd39019a9e38c4564',
  recipe: 1,
  configure: Object.freeze(['--disable-shared', '--enable-static', '--disable-png', '--disable-jpeg', '--disable-tiff', '--disable-gif', '--disable-gl', '--disable-sdl', '--disable-threading', '--disable-wic']),
});

export function teamImageToolsDirectory({cacheRoot = DEFAULT_CACHE, platform = process.platform, arch = process.arch} = {}) {
  if (!['darwin', 'linux'].includes(platform) || !['arm64', 'x64'].includes(arch)) {
    throw new Error(`Unsupported image-tool host: ${platform}/${arch}. Supported: macOS/Linux arm64/x64.`);
  }
  return path.resolve(cacheRoot, `libwebp-${TEAM_IMAGE_TOOL_RELEASE.version}-${platform}-${arch}-recipe${TEAM_IMAGE_TOOL_RELEASE.recipe}`);
}

function inspect(directory) {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const release = TEAM_IMAGE_TOOL_RELEASE;
  if (manifest.schemaVersion !== 1 || manifest.version !== release.version ||
      manifest.sourceSha256 !== release.sha256 || manifest.recipe !== release.recipe ||
      manifest.platform !== process.platform || manifest.arch !== process.arch ||
      JSON.stringify(manifest.configure) !== JSON.stringify(release.configure)) {
    throw new Error('Prepared image tools have an incompatible source/host/recipe manifest.');
  }
  // Paths come from this script, never from a cached manifest.
  for (const relative of [...NAMES.map(name => `bin/${name}`), ...NOTICES]) {
    const file = path.join(directory, relative);
    if (!lstatSync(file).isFile()) throw new Error(`Incomplete image tools: ${relative} must be a regular file.`);
    if (hash(readFileSync(file)) !== manifest.files?.[relative]) {
      throw new Error(`Image-tool integrity checksum failed: ${relative}`);
    }
  }
  const tools = {version: release.version};
  for (const name of NAMES) {
    const executable = path.join(directory, 'bin', name);
    const actual = execFileSync(executable, ['-version'], {encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024}).trim();
    if (actual !== release.version) throw new Error(`${name} version is ${actual}; expected ${release.version}.`);
    tools[name] = executable;
  }
  return tools;
}

// A's validator may call this synchronous API. It has no preparation side effects.
export function requireTeamImageTools(options = {}) {
  const directory = teamImageToolsDirectory(options);
  try {
    return inspect(directory);
  } catch (error) {
    throw new Error(`Image tools are missing, incomplete, or invalid at ${directory}: ${error.message}\nPrepare explicitly with: ${PREPARE}`, {cause: error});
  }
}

async function getSource(archivePath) {
  if (archivePath) {
    if (lstatSync(archivePath).size > MAX_ARCHIVE_BYTES) throw new Error('Source archive exceeds the 16 MiB limit.');
    return readFileSync(archivePath);
  }
  const response = await fetch(SOURCE_URL, {signal: AbortSignal.timeout(120000)});
  if (!response.ok) throw new Error(`Source download failed: HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_ARCHIVE_BYTES) throw new Error('Source download exceeds the 16 MiB limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function prepareTeamImageTools({cacheRoot = DEFAULT_CACHE, archivePath, jobs = 2} = {}) {
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('Build jobs must be an integer from 1 to 16.');
  const directory = teamImageToolsDirectory({cacheRoot});
  try { return inspect(directory); } catch { /* Explicit preparation may repair an invalid cache. */ }
  mkdirSync(path.dirname(directory), {recursive: true});
  const lock = `${directory}.lock`;
  try { mkdirSync(lock); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner = 'unrecorded';
    try { owner = readFileSync(path.join(lock, 'owner.json'), 'utf8'); } catch { /* A concurrent process may still be recording its PID. */ }
    throw new Error(`Image-tool preparation is busy at ${lock} (owner: ${owner}). If interrupted, verify the recorded process has stopped before removing this lock and retrying.`);
  }
  let stage;
  let log;
  try {
    writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({pid: process.pid}));
    stage = mkdtempSync(path.join(path.dirname(directory), '.prepare-'));
    const logPath = path.join(path.dirname(directory), 'last-preparation.log');
    log = openSync(logPath, 'w');
    const bytes = await getSource(archivePath);
    if (hash(bytes) !== TEAM_IMAGE_TOOL_RELEASE.sha256) throw new Error('Official libwebp source SHA-256 checksum mismatch; nothing was extracted or built.');
    const archive = path.join(stage, 'source.tar.gz');
    writeFileSync(archive, bytes);
    const source = path.join(stage, 'source');
    mkdirSync(source);
    // Fixed flags prevent inherited image-codec or static-system-runtime options.
    const env = {...process.env, CC: process.env.CC || 'cc', CFLAGS: '-O2', CPPFLAGS: '', LDFLAGS: '', LIBS: '', CONFIG_SITE: '/dev/null', MAKEFLAGS: '', GNUMAKEFLAGS: '', MFLAGS: ''};
    const run = (command, args, cwd = source) => {
      const result = spawnSync(command, args, {cwd, env, stdio: ['ignore', log, log], timeout: 300000});
      if (result.error || result.status !== 0) {
        throw new Error(`${command} failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}. See ${logPath}`, {cause: result.error});
      }
    };
    run(env.CC, ['--version']);
    run('make', ['--version']);
    run('tar', ['-xzf', archive, '--strip-components=1', '-C', source]);
    run('/bin/sh', ['./configure', ...TEAM_IMAGE_TOOL_RELEASE.configure]);
    // Upstream's dwebp/webpmux targets need these internal libraries. No other
    // example executable is requested and no global install target is invoked.
    for (const component of ['sharpyuv', 'src', 'imageio']) run('make', [`-j${jobs}`, '-C', component]);
    run('make', [`-j${jobs}`, '-C', 'examples', 'dwebp', 'webpmux']);
    const ready = path.join(stage, 'ready');
    mkdirSync(path.join(ready, 'bin'), {recursive: true});
    const files = {};
    for (const name of NAMES) {
      const relative = `bin/${name}`;
      copyFileSync(path.join(source, 'examples', name), path.join(ready, relative));
      chmodSync(path.join(ready, relative), 0o755);
      files[relative] = hash(readFileSync(path.join(ready, relative)));
    }
    for (const name of NOTICES) {
      copyFileSync(path.join(source, name), path.join(ready, name));
      files[name] = hash(readFileSync(path.join(ready, name)));
    }
    writeFileSync(path.join(ready, 'manifest.json'), JSON.stringify({
      schemaVersion: 1, version: TEAM_IMAGE_TOOL_RELEASE.version,
      sourceUrl: SOURCE_URL, sourceSha256: TEAM_IMAGE_TOOL_RELEASE.sha256,
      recipe: TEAM_IMAGE_TOOL_RELEASE.recipe, configure: TEAM_IMAGE_TOOL_RELEASE.configure,
      platform: process.platform, arch: process.arch, files,
    }, null, 2) + '\n');
    inspect(ready);
    // Only a verified staging bundle becomes ready. A failed build leaves the
    // previous directory untouched; an invalid old bundle is never reused.
    if (existsSync(directory)) renameSync(directory, path.join(stage, 'previous'));
    renameSync(ready, directory);
    return inspect(directory);
  } finally {
    if (log !== undefined) closeSync(log);
    if (stage) rmSync(stage, {recursive: true, force: true});
    rmSync(lock, {recursive: true, force: true});
  }
}

async function main(args) {
  const options = {};
  let check = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') {
      console.log(`Usage: ${PREPARE} [--check] [--archive <fixed-source.tar.gz>] [--cache-dir <directory>] [--jobs <1..16>]\nOnly explicit preparation downloads/builds. --check is offline.`);
      return;
    }
    if (arg === '--check') { check = true; continue; }
    if (!['--archive', '--cache-dir', '--jobs'].includes(arg) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${arg}. Use --help.`);
    }
    const value = args[++i];
    if (arg === '--archive') options.archivePath = path.resolve(value);
    if (arg === '--cache-dir') options.cacheRoot = path.resolve(value);
    if (arg === '--jobs') options.jobs = Number(value);
  }
  if (check && (options.archivePath || options.jobs !== undefined)) throw new Error('--check cannot be combined with preparation options.');
  const tools = check ? requireTeamImageTools(options) : await prepareTeamImageTools(options);
  console.log(JSON.stringify(tools));
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === SCRIPT) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
