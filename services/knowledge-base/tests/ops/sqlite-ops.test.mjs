import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../apps/api/database.mjs';
import { createBackup, verifyBackup, restoreBackup, safeKey, checkRuntime } from '../../scripts/sqlite-ops.mjs';

async function fixture(t) {
  const tempRoot = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(tempRoot, 'canteen-ops-'));
  const data = path.join(root, 'data');
  await fs.mkdir(path.join(data, 'uploads', 'nested'), { recursive: true });
  const { db } = openDatabase(path.join(data, 'knowledge.sqlite'));
  db.exec('PRAGMA wal_autocheckpoint=0');
  t.after(async () => { if (db.isOpen) db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const recipeId = randomUUID();
  const assetId = randomUUID();
  const contents = Buffer.from('original source image bytes');
  const sha = createHash('sha256').update(contents).digest('hex');
  await fs.writeFile(path.join(data, 'uploads', 'nested', 'photo.png'), contents);
  db.prepare('INSERT INTO recipes(id,title) VALUES(?,?)').run(recipeId, JSON.stringify({ zh: '红烧肉' }));
  db.prepare('INSERT INTO recipes(id,title) VALUES(?,?)').run(randomUUID(), JSON.stringify({ zh: '红烧肉' }));
  db.prepare('INSERT INTO recipe_ingredients(id,recipe_id,position,name,amount_kind,amount_value,amount_unit) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), recipeId, 0, JSON.stringify({ zh: '盐' }), 'exact', '0.12345678901234567890123456789', 'g');
  db.prepare('INSERT INTO recipe_ingredients(id,recipe_id,position,name) VALUES(?,?,?,?)').run(randomUUID(), recipeId, 1, JSON.stringify({ zh: '八角' }));
  db.prepare('INSERT INTO assets(id,kind,storage,object_key,status,sha256,byte_size) VALUES(?,?,?,?,?,?,?)').run(assetId, 'image', 'local', 'nested/photo.png', 'ready', sha, contents.length);
  // This asset is only historical/source evidence, not in recipe_assets.
  db.prepare('INSERT INTO sources(id,kind,asset_id) VALUES(?,?,?)').run(randomUUID(), 'file', assetId);
  db.prepare('INSERT INTO recipe_revisions(recipe_id,version,document,actor) VALUES(?,?,?,?)').run(recipeId, 1, JSON.stringify({ title: { zh: '红烧肉' }, assets: [assetId] }), 'ops-test');
  return { root, data, db, recipeId, assetId, contents, out: path.join(root, 'bundle') };
}

test('actual SQLite runtime meets deployment minimum', () => {
  assert.match(checkRuntime().sqliteVersion, /^3\./);
});

test('backup includes committed WAL, same names, exact/unknown amounts and historical media; restore survives reopen', async t => {
  const f = await fixture(t);
  assert.ok((await fs.stat(path.join(f.data, 'knowledge.sqlite-wal'))).size > 0);
  await fs.writeFile(path.join(f.data, '.env'), 'DO_NOT_BACK_UP=secret');
  await fs.writeFile(path.join(f.data, 'uploads', 'orphan.tmp'), 'not in committed DB');
  const manifest = await createBackup({ dataDir: f.data, targetDir: f.out, releaseId: 'test-release' });
  assert.equal(manifest.database.counts.recipes, 2);
  assert.equal(manifest.database.schemaVersion, 6);
  assert.equal(manifest.database.migrations.length, 6);
  assert.equal(manifest.database.counts.legacy_imports, 0);
  assert.equal(manifest.database.counts.techniques, 0);
  assert.equal(manifest.assets.length, 1);
  assert.deepEqual((await fs.readdir(f.out)).sort(), ['knowledge.sqlite', 'manifest.json', 'uploads']);
  assert.deepEqual(await fs.readdir(path.join(f.out, 'uploads')), ['nested']);
  await verifyBackup(f.out);
  // Later source writes cannot leak into the already completed snapshot.
  f.db.prepare('INSERT INTO recipes(id,title) VALUES(?,?)').run(randomUUID(), '{"zh":"后来的菜"}');
  assert.equal(f.db.prepare('SELECT count(*) n FROM recipes').get().n, 3);
  const restored = path.join(f.root, 'rehearsal');
  await restoreBackup({ bundleDir: f.out, targetDir: restored });
  const restoredDb = openDatabase(path.join(restored, 'knowledge.sqlite')).db;
  try {
    assert.equal(restoredDb.prepare('SELECT count(*) n FROM recipes').get().n, 2);
    assert.equal(restoredDb.prepare('SELECT amount_value FROM recipe_ingredients WHERE position=0').get().amount_value, '0.12345678901234567890123456789');
    assert.deepEqual({ ...restoredDb.prepare('SELECT amount_kind,amount_value,amount_unit FROM recipe_ingredients WHERE position=1').get() }, { amount_kind: 'unknown', amount_value: null, amount_unit: null });
    assert.equal(restoredDb.prepare('SELECT count(*) n FROM recipe_revisions').get().n, 1);
    assert.equal(restoredDb.prepare('SELECT count(*) n FROM sources').get().n, 1);
  } finally { restoredDb.close(); }
  const reopened = new DatabaseSync(path.join(restored, 'knowledge.sqlite'), { readOnly: true });
  try { assert.equal(reopened.prepare('SELECT count(*) n FROM recipes').get().n, 2); } finally { reopened.close(); }
  assert.deepEqual(await fs.readFile(path.join(restored, 'uploads', 'nested', 'photo.png')), f.contents);
  await verifyBackup(f.out);
});

test('refuses existing backup or restore paths without changing them', async t => {
  const f = await fixture(t);
  await createBackup({ dataDir: f.data, targetDir: f.out });
  const original = await fs.readFile(path.join(f.out, 'manifest.json'));
  await assert.rejects(createBackup({ dataDir: f.data, targetDir: f.out }), /EEXIST/);
  assert.deepEqual(await fs.readFile(path.join(f.out, 'manifest.json')), original);
  await assert.rejects(restoreBackup({ bundleDir: f.out, targetDir: f.data }), /EEXIST/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM recipes').get().n, 2);
  await assert.rejects(createBackup({ dataDir: f.data, targetDir: path.join(f.data, 'backup') }), /outside/);
  await assert.rejects(restoreBackup({ bundleDir: f.out, targetDir: path.join(f.out, 'restore') }), /outside/);
});

test('incomplete/missing or modified media fail the whole bundle and clean the reserved output', async t => {
  const f = await fixture(t);
  const media = path.join(f.data, 'uploads', 'nested', 'photo.png');
  await fs.writeFile(media, 'tampered');
  await assert.rejects(createBackup({ dataDir: f.data, targetDir: f.out }), /mismatch/);
  await assert.rejects(fs.stat(f.out), { code: 'ENOENT' });
  await fs.rm(media);
  await assert.rejects(createBackup({ dataDir: f.data, targetDir: f.out }), /ENOENT/);
  await assert.rejects(fs.stat(f.out), { code: 'ENOENT' });
});

test('restoration rejects tampered DB/assets or an incomplete inventory before creating target', async t => {
  const f = await fixture(t);
  await createBackup({ dataDir: f.data, targetDir: f.out });
  const manifestFile = path.join(f.out, 'manifest.json');
  const original = await fs.readFile(manifestFile, 'utf8');
  const altered = JSON.parse(original); altered.assets = [];
  await fs.writeFile(manifestFile, JSON.stringify(altered));
  await assert.rejects(restoreBackup({ bundleDir: f.out, targetDir: path.join(f.root, 'restore') }), /inventory/);
  await fs.writeFile(manifestFile, original);
  const image = path.join(f.out, 'uploads', 'nested', 'photo.png');
  await fs.writeFile(image, 'tampered');
  await assert.rejects(verifyBackup(f.out), /fingerprint/);
  await fs.writeFile(image, f.contents);
  await fs.appendFile(path.join(f.out, 'knowledge.sqlite'), 'damage');
  await assert.rejects(verifyBackup(f.out), /fingerprint/);
  await assert.rejects(fs.stat(path.join(f.root, 'restore')), { code: 'ENOENT' });
});

test('rejects traversal and symlink files/directories, including absolute caller roots', async t => {
  for (const key of ['../escape', '/absolute', 'a/../b', 'a//b', 'a\\b', './b', 'a\0b']) assert.throws(() => safeKey(key), /Unsafe/);
  const f = await fixture(t);
  const media = path.join(f.data, 'uploads', 'nested', 'photo.png');
  await fs.rm(media);
  await fs.writeFile(path.join(f.root, 'outside.png'), f.contents);
  await fs.symlink(path.join(f.root, 'outside.png'), media);
  await assert.rejects(createBackup({ dataDir: f.data, targetDir: f.out }), /Symbolic/);
  await fs.symlink(f.data, path.join(f.root, 'data-link'));
  await assert.rejects(createBackup({ dataDir: path.join(f.root, 'data-link'), targetDir: f.out }), /Symbolic/);
  await fs.symlink(f.root, path.join(f.root, 'output-link'));
  await assert.rejects(createBackup({ dataDir: f.data, targetDir: path.join(f.root, 'output-link', 'backup') }), /Symbolic/);
  await fs.rm(media);
  await fs.writeFile(media, f.contents);
  f.db.prepare('UPDATE assets SET object_key=? WHERE id=?').run('../outside.png', f.assetId);
  await assert.rejects(createBackup({ dataDir: f.data, targetDir: f.out }), /Unsafe/);
});
