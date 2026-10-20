import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('deployment entrypoints require an explicit operator before any host inspection or mutation', () => {
  const env = { ...process.env };
  delete env.KB_DEPLOY_USER;
  delete env.KB_SOURCE_RUNTIME;
  for (const [script, args] of [
    ['remote-prepare.sh', []],
    ['remote-deploy.sh', ['r-test', '--deploy-ready']],
  ]) {
    const result = spawnSync('bash', [fileURLToPath(new URL(`../../scripts/${script}`, import.meta.url)), ...args], { env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /KB_DEPLOY_USER/, script);
  }
});
