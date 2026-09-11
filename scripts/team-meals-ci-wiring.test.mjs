import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const contract = 'packages/web/test/e2e/team-meals/api-contract.test.mjs';
const gate = 'Gate — build-data --check --compare-snapshots';

function workflowStep(workflow, name) {
  const lines = readFileSync(path.join(root, '.github/workflows', workflow), 'utf8').split('\n');
  const start = lines.indexOf(`      - name: ${name}`);
  assert.notEqual(start, -1, `missing existing step ${name}`);
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('      - ')) end++;
  const step = lines.slice(start, end);
  const run = step.findIndex(line => line.startsWith('        run: '));
  assert.notEqual(run, -1, `${name} has no run command`);
  if (step[run] !== '        run: |') return step[run].slice('        run: '.length);
  const body = [];
  for (const line of step.slice(run + 1)) {
    if (!line.trim()) { body.push(''); continue; }
    if (!line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}

// Package managers execute the checkout's real script strings. Compilers and
// test processes are replaced at the boundary: no builds, network or writes to
// repository artifacts occur in these orchestration tests.
function commandStub() {
  const fs = require('node:fs');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const args = process.argv.slice(2);
  const command = path.basename(process.argv[1]);
  const env = process.env;
  const event = name => {
    fs.appendFileSync(env.TEAM_WIRING_EVENTS, `${name}\n`);
    if (env.TEAM_WIRING_FAIL === name) process.exit(31);
  };
  if (command === 'pnpm' || command === 'npm') {
    let cwd = process.cwd();
    if (args[0] === '-C' || args[0] === '--prefix') {
      args.shift();
      cwd = path.resolve(cwd, args.shift());
    }
    const name = args[0] === 'run' ? args[1] : args[0];
    const script = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).scripts[name];
    if (!script || !['test', 'build', 'gen:validators'].includes(name)) process.exit(99);
    const phase = `${path.basename(cwd)}:${name}`;
    event(phase);
    const result = spawnSync('/bin/bash', ['-c', script], {cwd, env, stdio: 'inherit'});
    if (result.status === 0 && phase === 'worker:build') fs.writeFileSync(env.TEAM_WIRING_READY, 'built');
    process.exit(result.status ?? 99);
  }
  if (command === 'tsc') process.exit(0);
  if (command === 'node') {
    if (args[0] === '--test' && args.includes(env.TEAM_WIRING_CONTRACT)) {
      if (!fs.existsSync(env.TEAM_WIRING_READY)) process.exit(88);
      event('contract');
      process.exit(0);
    }
    if (args[0] === '--test') { event(`${path.basename(process.cwd())}:tests`); process.exit(0); }
    if (args[0] === 'scripts/gen-validators.mjs') process.exit(0);
    if (args[0] === 'scripts/build-data.mjs' && args.includes('--check')) { event('build-check'); process.exit(0); }
  }
  process.exit(99);
}

function runWorkflow(t, workflow, fail = '') {
  const dir = mkdtempSync(path.join(tmpdir(), 'team-wiring-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  const stub = `#!${process.execPath}\n(${commandStub.toString()})();\n`;
  for (const name of ['pnpm', 'npm', 'node', 'tsc']) writeFileSync(path.join(bin, name), stub, {mode: 0o755});
  const log = path.join(dir, 'events');
  const env = {...process.env, PATH: `${bin}:/usr/bin:/bin`, TEAM_WIRING_EVENTS: log,
    TEAM_WIRING_READY: path.join(dir, 'worker-ready'), TEAM_WIRING_CONTRACT: contract, TEAM_WIRING_FAIL: fail};
  let names = [gate];
  if (workflow === 'ci.yml') {
    const yaml = readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
    assert.ok(yaml.indexOf('- name: packages/worker tests') < yaml.indexOf('- name: packages/web tests'), 'Worker step must precede Web step');
    names = ['packages/worker tests', 'packages/web tests'];
  }
  let status = 0;
  for (const name of names) {
    const result = spawnSync('/bin/bash', ['-c', workflowStep(workflow, name)], {cwd: root, env, encoding: 'utf8'});
    assert.equal(result.error, undefined);
    assert.equal(result.stderr, '');
    status = result.status;
    if (status !== 0) break; // A failed Actions step prevents the following one.
  }
  return {status, events: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []};
}

test('CI builds Worker/core through the existing test chain, then runs Web and the nested contract once', t => {
  const {status, events} = runWorkflow(t, 'ci.yml');
  assert.equal(status, 0);
  for (const phase of ['core:build', 'worker:build', 'worker:tests', 'web:tests', 'contract']) {
    assert.equal(events.filter(event => event === phase).length, 1, `${phase} must run exactly once`);
  }
  assert.ok(events.indexOf('worker:tests') < events.indexOf('web:tests'));
  assert.ok(events.indexOf('web:tests') < events.indexOf('contract'));
});

for (const phase of ['worker:build', 'worker:tests', 'web:tests', 'contract']) {
  test(`CI propagates ${phase} failure and stops dependent work`, t => {
    const {status, events} = runWorkflow(t, 'ci.yml', phase);
    assert.equal(status, 31);
    assert.equal(events.at(-1), phase);
  });
}

test('deploy gate builds Worker/core before the nested contract, then checks data', t => {
  const {status, events} = runWorkflow(t, 'build-deploy.yml');
  assert.equal(status, 0);
  assert.equal(events.filter(event => event === 'worker:build').length, 1);
  assert.equal(events.filter(event => event === 'contract').length, 1);
  assert.ok(events.includes('core:build'));
  assert.ok(events.indexOf('core:build') < events.indexOf('contract'));
  assert.ok(events.indexOf('contract') < events.indexOf('build-check'));
});

for (const phase of ['worker:build', 'contract', 'build-check']) {
  test(`deploy gate propagates ${phase} failure before later checks`, t => {
    const {status, events} = runWorkflow(t, 'build-deploy.yml', phase);
    assert.equal(status, 31);
    assert.equal(events.at(-1), phase);
  });
}
