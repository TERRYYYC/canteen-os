import test from 'node:test';
import assert from 'node:assert/strict';
import { compareOldStatus, checkPortOwner } from '../../scripts/service-guards.mjs';

test('old service guard catches data changes even when production code revision is fixed', () => {
  const initial = { productionRevision: 'code', privateHead: 'private', publicHead: 'public', bootId: 'boot', pid: 123 };
  assert.deepEqual(compareOldStatus(initial, { ...initial, uptime: 500 }), { oldServiceUnchanged: true });
  for (const key of Object.keys(initial)) {
    assert.throws(() => compareOldStatus(initial, { ...initial, [key]: key === 'pid' ? 124 : 'changed' }), /changed/);
    const missing = { ...initial }; delete missing[key];
    assert.throws(() => compareOldStatus(initial, missing), /missing/);
  }
});

test('port guard rejects foreign owners, public listeners, hidden PIDs and unexpected absence', () => {
  const local = 'LISTEN 0 511 127.0.0.1:4390 0.0.0.0:* users:(("node",pid=234,fd=22))';
  assert.deepEqual(checkPortOwner('', 0), { port4390: 'free' });
  assert.equal(checkPortOwner(local, 234, true).pid, 234);
  assert.throws(() => checkPortOwner('', 234, true), /no listener/);
  assert.throws(() => checkPortOwner(local, 0), /occupied/);
  assert.throws(() => checkPortOwner(local, 235), /belong/);
  assert.throws(() => checkPortOwner(local.replace('127.0.0.1:4390', '0.0.0.0:4390'), 234), /belong/);
  assert.throws(() => checkPortOwner('LISTEN 0 511 127.0.0.1:4390 0.0.0.0:*', 234), /belong/);
});
