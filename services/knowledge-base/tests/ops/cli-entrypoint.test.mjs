import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, symlink, mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openDatabase } from '../../apps/api/database.mjs';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));

test('CLI runs through current symlink: runtime, actual backup, verify, restore and service guard', async () => {
  const scratch = await realpath(await mkdtemp(path.join(tmpdir(), 'kb-cli-entry-')));
  try {
    const current = path.join(scratch, 'current');
    await symlink(appRoot, current, 'dir');
    function cli(name, ...args) {
      const result = spawnSync(process.execPath, [path.join(current, 'scripts', name), ...args], { encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.trim(), 'CLI must execute and print a result instead of silently skipping its entrypoint');
      return JSON.parse(result.stdout);
    }
    assert.equal(cli('sqlite-ops.mjs', 'runtime').nodeVersion, process.versions.node);
    const data = path.join(scratch, 'data');
    await mkdir(path.join(data, 'uploads'), { recursive: true });
    const opened = openDatabase(path.join(data, 'knowledge.sqlite'));
    opened.db.close();
    const backup = path.join(scratch, 'backup');
    cli('sqlite-ops.mjs', 'backup', '--data', data, '--out', backup, '--release', 'cli-entry-test');
    assert.ok((await stat(path.join(backup, 'manifest.json'))).isFile());
    cli('sqlite-ops.mjs', 'verify', '--backup', backup);
    const restore = path.join(scratch, 'restore');
    cli('sqlite-ops.mjs', 'restore', '--backup', backup, '--into', restore);
    assert.ok((await stat(path.join(restore, 'knowledge.sqlite'))).isFile());
    const listener = path.join(scratch, 'listeners.txt');
    await writeFile(listener, '');
    assert.deepEqual(cli('service-guards.mjs', 'port-owner', listener, '0'), { port4390: 'free' });
    const invalid = spawnSync(process.execPath, [path.join(current, 'scripts/release-manifest.mjs'), 'bad-command'], { encoding: 'utf8' });
    assert.equal(invalid.status, 1, 'invalid CLI usage through symlink must fail');
    assert.match(invalid.stderr, /Usage:/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
