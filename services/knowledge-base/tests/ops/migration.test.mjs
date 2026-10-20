import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('../../scripts/migrate-database.mjs', import.meta.url));

test('deployment migration uses application ledger and reruns without losing rows', async t => {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'canteen-migrate-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const first = JSON.parse((await execute(process.execPath, [script, directory, '6'])).stdout);
  assert.equal(first.schemaVersion, 6);
  const file = path.join(directory, 'knowledge.sqlite');
  const db = new DatabaseSync(file);
  try {
    assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n, 6);
    db.prepare('INSERT INTO recipes(id,title) VALUES(?,?)').run(randomUUID(), '{"zh":"保留这道菜"}');
  } finally { db.close(); }
  await execute(process.execPath, [script, directory, '6']);
  const reopened = new DatabaseSync(file, { readOnly: true });
  try { assert.equal(reopened.prepare('SELECT count(*) n FROM recipes').get().n, 1); } finally { reopened.close(); }
});

test('manifest schema mismatch fails before creating or migrating database', async t => {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'canteen-mismatch-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await assert.rejects(execute(process.execPath, [script, directory, '7']), /Manifest schema version differs/);
  await assert.rejects(fs.stat(path.join(directory, 'knowledge.sqlite')), { code: 'ENOENT' });
});
