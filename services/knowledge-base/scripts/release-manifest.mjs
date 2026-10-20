#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { noLinks, safeKey } from './sqlite-ops.mjs';

export function releaseId(value) {
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value || '') || value.includes('..')) throw new Error('Invalid release ID');
  return value;
}

const ROOTS = ['apps', 'contracts', 'db', 'infra', 'scripts'];
const FILES = ['package.json', 'package-lock.json', 'release.env'];
const forbidden = /(^|\/)(node_modules|\.git|\.env(?:\.[^/]*)?|data|uploads|backups)(\/|$)|\.(sqlite|sqlite3|db)(?:-(?:wal|shm))?$|(?:^|\/)(?:id_rsa|id_ed25519|[^/]*\.(?:pem|key))$/i;

export async function releaseFiles(root) {
  await noLinks(root);
  const files = [];
  async function walk(relative) {
    const key = safeKey(relative);
    if (forbidden.test(key)) throw new Error(`Runtime data or secret in release: ${key}`);
    const absolute = path.join(root, key);
    await noLinks(absolute);
    const stat = await fs.lstat(absolute);
    if (stat.isDirectory()) {
      for (const entry of (await fs.readdir(absolute)).sort()) await walk(`${key}/${entry}`);
    } else if (stat.isFile()) files.push({ path: key, bytes: stat.size, sha256: createHash('sha256').update(await fs.readFile(absolute)).digest('hex') });
    else throw new Error(`Unsupported release file: ${key}`);
  }
  for (const item of [...FILES, ...ROOTS]) await walk(item);
  for (const required of ['apps/api/server.mjs', 'apps/web/dist/index.html', 'db/001_core.sql', 'infra/canteen-kb.service', 'scripts/sqlite-ops.mjs']) {
    if (!files.some(item => item.path === required)) throw new Error(`Incomplete release: ${required}`);
  }
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

export async function createReleaseManifest(root, id, schemaVersion) {
  releaseId(id);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) throw new Error('Expected positive schema version');
  await noLinks(root);
  const environment = path.join(root, 'release.env');
  await fs.writeFile(environment, `KB_RELEASE_ID=${id}\n`, { flag: 'wx', mode: 0o600 });
  try {
    const files = await releaseFiles(root);
    const manifest = { format: 'canteen-kb-release-v1', id, schemaVersion, createdAt: new Date().toISOString(), files };
    await fs.writeFile(path.join(root, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return manifest;
  } catch (error) { await fs.rm(environment); throw error; }
}

export async function verifyRelease(root, expectedId) {
  releaseId(expectedId);
  await noLinks(path.join(root, 'release.json'));
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'release.json'), 'utf8'));
  if (manifest.format !== 'canteen-kb-release-v1' || manifest.id !== expectedId || !Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) throw new Error('Release identity/schema mismatch');
  const files = await releaseFiles(root);
  if (JSON.stringify(files) !== JSON.stringify(manifest.files)) throw new Error('Release checksum/inventory mismatch');
  if (await fs.readFile(path.join(root, 'release.env'), 'utf8') !== `KB_RELEASE_ID=${expectedId}\n`) throw new Error('Release environment identity mismatch');
  return { id: manifest.id, schemaVersion: manifest.schemaVersion, fileCount: files.length };
}

// Node 24 resolves entrypoint symlinks; import.meta.main also works through current/.
if (import.meta.main) {
  const [command, root, id, schema] = process.argv.slice(2);
  const operation = command === 'create' ? createReleaseManifest(root, id, Number(schema)) : command === 'verify' ? verifyRelease(root, id) : Promise.reject(new Error('Usage: release-manifest.mjs create ROOT RELEASE_ID SCHEMA_VERSION | verify ROOT RELEASE_ID'));
  operation.then(value => console.log(JSON.stringify(value, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
