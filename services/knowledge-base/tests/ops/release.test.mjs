import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createReleaseManifest, verifyRelease, releaseId } from '../../scripts/release-manifest.mjs';

async function releaseFixture(t) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'canteen-release-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const file of ['package.json', 'package-lock.json', 'apps/api/server.mjs', 'apps/web/dist/index.html', 'contracts/recipe.json', 'db/001_core.sql', 'infra/canteen-kb.service', 'scripts/sqlite-ops.mjs']) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), 'fixture');
  }
  return root;
}

test('release identity guards traversal and validates required built frontend/API', async t => {
  for (const id of ['', '..', '../escape', 'release/a', 'release\nx', 'a..b']) assert.throws(() => releaseId(id), /Invalid/);
  const root = await releaseFixture(t);
  await fs.rm(path.join(root, 'apps/web/dist/index.html'));
  await assert.rejects(createReleaseManifest(root, 'r1', 1), /Incomplete/);
});

test('release manifest detects edits and excludes installed root dependencies from source inventory', async t => {
  const root = await releaseFixture(t);
  await createReleaseManifest(root, 'r1', 1);
  assert.equal(await fs.readFile(path.join(root, 'release.env'), 'utf8'), 'KB_RELEASE_ID=r1\n');
  await fs.mkdir(path.join(root, 'node_modules'));
  await fs.writeFile(path.join(root, 'node_modules', 'runtime-dependency.js'), 'installed');
  assert.equal((await verifyRelease(root, 'r1')).schemaVersion, 1);
  await assert.rejects(verifyRelease(root, 'wrong'), /mismatch/);
  await fs.appendFile(path.join(root, 'apps/api/server.mjs'), 'modified');
  await assert.rejects(verifyRelease(root, 'r1'), /checksum/);
});

test('release refuses environment secrets, database files and symlinks', async t => {
  const root = await releaseFixture(t);
  const secret = path.join(root, 'apps/api/.env');
  await fs.writeFile(secret, 'private');
  await assert.rejects(createReleaseManifest(root, 'r1', 1), /secret/);
  await fs.rm(secret);
  const database = path.join(root, 'apps/api/knowledge.sqlite');
  await fs.writeFile(database, 'private');
  await assert.rejects(createReleaseManifest(root, 'r1', 1), /secret/);
  await fs.rm(database);
  await fs.symlink(path.join(root, 'package.json'), path.join(root, 'apps/api/linked'));
  await assert.rejects(createReleaseManifest(root, 'r1', 1), /Symbolic/);
});
