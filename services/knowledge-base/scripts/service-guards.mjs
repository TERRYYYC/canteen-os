#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function oldStatusIdentity(status) {
  const result = {};
  for (const key of ['productionRevision', 'privateHead', 'publicHead', 'bootId']) {
    if (typeof status[key] !== 'string' || !status[key]) throw new Error(`Old status missing ${key}`);
    result[key] = status[key];
  }
  if (!Number.isInteger(status.pid) || status.pid < 1) throw new Error('Old status missing pid');
  result.pid = status.pid;
  return result;
}

export function compareOldStatus(before, after) {
  if (JSON.stringify(oldStatusIdentity(before)) !== JSON.stringify(oldStatusIdentity(after))) throw new Error('Old service process or data revision changed during deployment');
  return { oldServiceUnchanged: true };
}

export function checkPortOwner(output, expectedPid, required = false) {
  const lines = output.trim().split('\n').filter(Boolean);
  if (!lines.length) {
    if (required) throw new Error('4390 has no listener');
    return { port4390: 'free' };
  }
  if (!Number.isInteger(expectedPid) || expectedPid < 1) throw new Error('4390 is already occupied outside canteen-kb.service');
  for (const line of lines) {
    const columns = line.trim().split(/\s+/);
    const localAddress = columns[3];
    const owners = [...line.matchAll(/pid=(\d+)/g)].map(match => Number(match[1]));
    if (localAddress !== '127.0.0.1:4390' || !owners.length || owners.some(pid => pid !== expectedPid)) throw new Error('4390 must belong only to canteen-kb.service on 127.0.0.1');
  }
  return { port4390: 'owned-loopback', pid: expectedPid };
}

// Node 24 resolves entrypoint symlinks; import.meta.main also works through current/.
if (import.meta.main) {
  const [command, first, second, third] = process.argv.slice(2);
  (async () => {
    if (command === 'old-status') return compareOldStatus(JSON.parse(await fs.readFile(first, 'utf8')), JSON.parse(await fs.readFile(second, 'utf8')));
    if (command === 'port-owner') return checkPortOwner(await fs.readFile(first, 'utf8'), Number(second), third === 'required');
    throw new Error('Usage: service-guards.mjs old-status BEFORE_JSON AFTER_JSON | port-owner SS_OUTPUT PID [required]');
  })().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
