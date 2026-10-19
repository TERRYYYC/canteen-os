#!/usr/bin/env node
import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TABLES = ['recipes', 'ingredients', 'recipe_ingredients', 'recipe_steps', 'assets', 'sources', 'recipe_sources', 'recipe_assets', 'recipe_revisions', 'write_receipts'];
const FAVORITES_TABLES = ['favorite_import_batches','favorite_source_items','favorite_import_rows','favorite_capture_jobs','favorite_captures','favorite_candidates','favorite_classifications'];
const ADOPTION_TABLES = ['ingredient_revisions','recipe_approvals'];
const INTEGRATION_TABLES = ['legacy_imports', 'legacy_files', 'legacy_bindings', 'ingredient_knowledge', 'techniques', 'legacy_recipe_evidence'];
const fail = (message) => { throw new Error(message); };
const digest = (value) => createHash('sha256').update(value).digest('hex');

export function checkRuntime() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 18)) fail('Node 24.18+ is required');
  const db = new DatabaseSync(':memory:');
  try {
    const version = db.prepare('SELECT sqlite_version() AS version').get().version;
    const actual = version.split('.').map(Number);
    const minimum = [3, 51, 3];
    const comparison = actual.reduce((result, part, i) => result || Math.sign(part - minimum[i]), 0);
    if (comparison < 0) fail('SQLite 3.51.3+ is required');
    return { nodeVersion: process.versions.node, sqliteVersion: version };
  } finally { db.close(); }
}

export function safeKey(key) {
  if (typeof key !== 'string' || !key || key.includes('\\') || /[\x00-\x1f\x7f]/.test(key) || path.posix.isAbsolute(key) || key.split('/').some(p => !p || p === '.' || p === '..')) fail('Unsafe relative asset path');
  return key;
}

// Refuse symlinks in every existing component, including the supplied root.
export async function noLinks(target, { allowMissing = false } = {}) {
  const resolved = path.resolve(target);
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) fail(`Symbolic links are not allowed: ${current}`);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return resolved;
      throw error;
    }
  }
  return resolved;
}

async function fingerprint(file) {
  await noLinks(file);
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail('Expected a regular file');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail('File changed while hashing');
    return { sha256: hash.digest('hex'), bytes: after.size };
  } finally { await handle.close(); }
}

async function copyChecked(source, destination, expected = {}) {
  await noLinks(source);
  await noLinks(path.dirname(destination));
  await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
  const actual = await fingerprint(destination);
  if (expected.sha256 != null && actual.sha256 !== expected.sha256) fail(`SHA-256 mismatch: ${path.basename(source)}`);
  if (expected.bytes != null && actual.bytes !== expected.bytes) fail(`Size mismatch: ${path.basename(source)}`);
  // Uploaded assets are immutable. Detect mutation during the copy as well.
  const original = await fingerprint(source);
  if (actual.sha256 !== original.sha256 || actual.bytes !== original.bytes) fail('Source changed while copying');
  const handle = await fs.open(destination, 'r+');
  try { await handle.sync(); } finally { await handle.close(); }
  return actual;
}

function inspectDb(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') fail('SQLite integrity_check failed');
    if (db.prepare('PRAGMA foreign_key_check').all().length) fail('SQLite foreign_key_check failed');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(r => r.name));
    for (const table of TABLES) if (!tables.has(table)) fail(`Missing knowledge-base table: ${table}`);
    const migrations = tables.has('schema_migrations') ? db.prepare('SELECT version,name,sha256 FROM schema_migrations ORDER BY version').all() : [];
    const includedTables = [...TABLES, ...(migrations.at(-1)?.version >= 2 ? INTEGRATION_TABLES : []), ...(migrations.at(-1)?.version >= 3 ? FAVORITES_TABLES : []), ...(migrations.at(-1)?.version >= 4 ? ['favorite_candidate_illustrations'] : []), ...(migrations.at(-1)?.version >= 5 ? ADOPTION_TABLES : []), ...(migrations.at(-1)?.version >= 6 ? ['technique_revisions'] : [])];
    for (const table of includedTables) if (!tables.has(table)) fail(`Missing knowledge-base table: ${table}`);
    const counts = Object.fromEntries(includedTables.map(table => [table, db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count]));
    const assets = db.prepare("SELECT id, object_key, sha256, byte_size FROM assets WHERE storage='local' AND status='ready' ORDER BY id").all();
    const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    return { userVersion: db.prepare('PRAGMA user_version').get().user_version, schemaVersion: migrations.at(-1)?.version || 0, migrations, schemaSha256: digest(JSON.stringify(schema)), counts, assets };
  } finally { db.close(); }
}

function separatePaths(source, target) {
  const relative = path.relative(source, target);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) fail('Backup/restore destination must be outside the source directory');
}

async function reserveDirectory(directory) {
  await noLinks(directory, { allowMissing: true });
  await fs.mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
  await noLinks(path.dirname(directory));
  // mkdir without recursive is intentional: existing targets are never reused.
  await fs.mkdir(directory, { mode: 0o700 });
}

async function syncDirectory(directory) {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function syncTreeDirectories(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) fail('Unexpected symlink in output');
    if (item.isDirectory()) await syncTreeDirectories(path.join(directory, item.name));
  }
  await syncDirectory(directory);
}

export async function createBackup({ dataDir, targetDir, databasePath, releaseId = 'unspecified' }) {
  const runtime = checkRuntime();
  const data = await noLinks(dataDir);
  const target = path.resolve(targetDir);
  separatePaths(data, target);
  const database = await noLinks(databasePath || path.join(data, 'knowledge.sqlite'));
  await reserveDirectory(target);
  try {
    const snapshot = path.join(target, 'knowledge.sqlite');
    const source = new DatabaseSync(database, { readOnly: true });
    try { source.exec('PRAGMA busy_timeout=5000'); await sqliteBackup(source, snapshot); } finally { source.close(); }
    // Standalone closed snapshot: no WAL sidecars need to travel with a bundle.
    const snapshotDb = new DatabaseSync(snapshot);
    try { snapshotDb.exec('PRAGMA journal_mode=DELETE'); } finally { snapshotDb.close(); }
    const inspection = inspectDb(snapshot);
    const assets = [];
    await fs.mkdir(path.join(target, 'uploads'), { mode: 0o700 });
    for (const row of inspection.assets) {
      const key = safeKey(row.object_key);
      const destination = path.join(target, 'uploads', key);
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      const value = await copyChecked(path.join(data, 'uploads', key), destination, { sha256: row.sha256, bytes: row.byte_size });
      assets.push({ id: row.id, key, ...value });
    }
    await syncTreeDirectories(path.join(target, 'uploads'));
    const dbHash = await fingerprint(snapshot);
    const dbHandle = await fs.open(snapshot, 'r+');
    try { await dbHandle.sync(); } finally { await dbHandle.close(); }
    const manifest = { format: 'canteen-kb-backup-v1', createdAt: new Date().toISOString(), releaseId, ...runtime,
      database: { file: 'knowledge.sqlite', ...dbHash, userVersion: inspection.userVersion, schemaVersion: inspection.schemaVersion, migrations: inspection.migrations, schemaSha256: inspection.schemaSha256, counts: inspection.counts }, assets };
    // Manifest is the completion marker; it is written last.
    const manifestHandle = await fs.open(path.join(target, 'manifest.json'), 'wx', 0o600);
    try { await manifestHandle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`); await manifestHandle.sync(); } finally { await manifestHandle.close(); }
    await syncDirectory(target);
    await syncDirectory(path.dirname(target));
    return manifest;
  } catch (error) { await fs.rm(target, { recursive: true, force: true }); throw error; }
}

export async function verifyBackup(bundleDir) {
  checkRuntime();
  const bundle = await noLinks(bundleDir);
  await noLinks(path.join(bundle, 'manifest.json'));
  const manifest = JSON.parse(await fs.readFile(path.join(bundle, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'canteen-kb-backup-v1' || manifest.database?.file !== 'knowledge.sqlite' || !Array.isArray(manifest.assets)) fail('Unsupported backup manifest');
  const database = await fingerprint(path.join(bundle, 'knowledge.sqlite'));
  if (database.sha256 !== manifest.database.sha256 || database.bytes !== manifest.database.bytes) fail('Database fingerprint mismatch');
  const inspection = inspectDb(path.join(bundle, 'knowledge.sqlite'));
  if (inspection.schemaSha256 !== manifest.database.schemaSha256 || inspection.userVersion !== manifest.database.userVersion) fail('Database schema mismatch');
  if (inspection.schemaVersion !== manifest.database.schemaVersion || JSON.stringify(inspection.migrations) !== JSON.stringify(manifest.database.migrations)) fail('Database migration mismatch');
  const recorded=manifest.database.counts;
  const exactKeys=expected=>recorded&&typeof recorded==='object'&&!Array.isArray(recorded)&&Object.keys(recorded).length===expected.length&&expected.every(key=>Object.hasOwn(recorded,key));
  const complete=Object.keys(inspection.counts);
  // Producer 0291f9b reported exactly these 16 counters for schema 3/4.
  // No arbitrary subset is accepted, and newer schemas require full inventory.
  const legacy=[...TABLES,...INTEGRATION_TABLES];
  const knownLegacy=[3,4].includes(inspection.schemaVersion)&&exactKeys(legacy);
  if ((!exactKeys(complete)&&!knownLegacy)||Object.entries(recorded||{}).some(([key,count])=>!Number.isSafeInteger(count)||count<0||count!==inspection.counts[key])) fail('Database count mismatch');
  if (inspection.assets.length !== manifest.assets.length) fail('Asset inventory mismatch');
  const keys = new Set();
  for (let index = 0; index < inspection.assets.length; index++) {
    const row = inspection.assets[index];
    const item = manifest.assets[index];
    if (row.id !== item.id || row.object_key !== item.key || keys.has(item.key)) fail('Asset inventory mismatch');
    keys.add(safeKey(item.key));
    const actual = await fingerprint(path.join(bundle, 'uploads', item.key));
    if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes || (row.sha256 != null && row.sha256 !== actual.sha256) || (row.byte_size != null && row.byte_size !== actual.bytes)) fail('Asset fingerprint mismatch');
  }
  return manifest;
}

export async function restoreBackup({ bundleDir, targetDir }) {
  const bundle = await noLinks(bundleDir);
  const target = path.resolve(targetDir);
  separatePaths(bundle, target);
  const manifest = await verifyBackup(bundle);
  await reserveDirectory(target);
  try {
    await copyChecked(path.join(bundle, 'knowledge.sqlite'), path.join(target, 'knowledge.sqlite'), manifest.database);
    await fs.mkdir(path.join(target, 'uploads'), { mode: 0o700 });
    for (const item of manifest.assets) {
      const destination = path.join(target, 'uploads', safeKey(item.key));
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await copyChecked(path.join(bundle, 'uploads', item.key), destination, item);
    }
    inspectDb(path.join(target, 'knowledge.sqlite'));
    await syncTreeDirectories(path.join(target, 'uploads'));
    await syncDirectory(target);
    await syncDirectory(path.dirname(target));
    return { restoredTo: target, releaseId: manifest.releaseId, database: manifest.database, assetCount: manifest.assets.length };
  } catch (error) { await fs.rm(target, { recursive: true, force: true }); throw error; }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith('--') || !args[index + 1] || args[index + 1].startsWith('--')) fail('Expected --option value pairs');
    options[args[index].slice(2)] = args[index + 1];
  }
  const required = (key) => options[key] || fail(`Missing --${key}`);
  if (command === 'runtime') return checkRuntime();
  if (command === 'backup') return createBackup({ dataDir: required('data'), targetDir: required('out'), databasePath: options.database, releaseId: options.release });
  if (command === 'verify') return verifyBackup(required('backup'));
  if (command === 'restore') return restoreBackup({ bundleDir: required('backup'), targetDir: required('into') });
  fail('Usage: sqlite-ops.mjs runtime | backup --data DIR --out NEW_DIR [--release ID] [--database FILE] | verify --backup DIR | restore --backup DIR --into NEW_DIR');
}

// Node 24 resolves entrypoint symlinks; import.meta.main also works through current/.
if (import.meta.main) {
  main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(`sqlite-ops: ${error.message}`); process.exitCode = 1; });
}
