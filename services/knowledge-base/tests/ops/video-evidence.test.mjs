import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('video evidence preparation, integrity checks and cache reuse', () => {
  const result = spawnSync('python3', [fileURLToPath(new URL('./video-evidence-tests.py', import.meta.url))], {
    encoding: 'utf8', timeout: 120000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
