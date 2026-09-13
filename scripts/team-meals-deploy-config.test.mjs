import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const yaml = readFileSync(path.join(root, '.github/workflows/build-deploy.yml'), 'utf8');
const installName = 'Install workspace dependencies';
const buildName = 'Build web (vite → packages/web/dist/)';

function stepRun(name) {
  const lines = yaml.split('\n');
  const start = lines.indexOf(`      - name: ${name}`);
  assert.notEqual(start, -1, `existing step retained: ${name}`);
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('      - ')) end++;
  const step = lines.slice(start, end);
  const run = step.findIndex(line => line.startsWith('        run: '));
  assert.notEqual(run, -1);
  if (step[run] !== '        run: |') return step[run].slice(13);
  const body = [];
  for (const line of step.slice(run + 1)) {
    if (!line.trim()) { body.push(''); continue; }
    if (!line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}

function boundary() {
  const fs = require('node:fs');
  const {spawnSync} = require('node:child_process');
  const name = require('node:path').basename(process.argv[1]);
  const args = process.argv.slice(2);
  if (name === 'node' && args[0] !== 'scripts/prepare-team-image-tools.mjs') {
    const result = spawnSync(process.execPath, args, {stdio: 'inherit', env: process.env});
    process.exit(result.status ?? 99);
  }
  const kind = name === 'node' ? 'prepare' : args[0] === 'install' ? 'install' : 'build';
  fs.appendFileSync(process.env.DEPLOY_CONFIG_EVENTS,
    JSON.stringify({kind, args, workerUrl: process.env.VITE_WORKER_URL ?? ''}) + '\n');
  process.exit(process.env.DEPLOY_CONFIG_FAIL === kind ? 31 : 0);
}

// Execute only the actual configuration/install and Web build run blocks.
// The Node preflight is real; installation, tool preparation and Web compilation
// are observable boundaries. Translation, Git writes and deployment never run.
function run(t, value, fail = '', {noHandoff = false} = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'team-deploy-config-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const bin = path.join(dir, 'bin'); mkdirSync(bin);
  for (const name of ['node', 'pnpm']) {
    writeFileSync(path.join(bin, name), `#!${process.execPath}\n(${boundary.toString()})();\n`, {mode: 0o755});
  }
  const eventsFile = path.join(dir, 'events');
  const summaryFile = path.join(dir, 'summary');
  const handoffFile = path.join(dir, 'job-env');
  const env = {...process.env, PATH: `${bin}:/usr/bin:/bin`,
    GITHUB_ENV: handoffFile, GITHUB_STEP_SUMMARY: summaryFile, DEPLOY_CONFIG_EVENTS: eventsFile, DEPLOY_CONFIG_FAIL: fail};
  if (noHandoff) delete env.GITHUB_ENV;
  delete env.VITE_WORKER_URL;
  delete env.WORKER_URL_INPUT;
  // Keep the old unsafe boundary observable so the runner-log regression fails
  // if direct variable injection is accidentally restored.
  const source = yaml.match(/^      VITE_WORKER_URL: (.+)$/m)?.[1];
  if (source === '${{ vars.VITE_WORKER_URL }}') env.VITE_WORKER_URL = value ?? '';
  const protectedSource = yaml.match(/^          WORKER_URL_INPUT: (.+)$/m)?.[1];
  // Model Worker.InitializeSecretMasker: register a secret (and its trimmed
  // lines) before job execution. This is a log-boundary model, not a live runner.
  const secret = protectedSource === '${{ secrets.VITE_WORKER_URL }}' ? value ?? '' : '';
  const masks = [secret.trim(), ...secret.split(/[\r\n]/).map(line => line.trim())].filter(Boolean);
  const mask = text => masks.reduce((result, entry) => result.split(entry).join('***'), text);
  let status = 0, stdout = '', stderr = '', runnerLog = '';
  for (const name of [installName, buildName]) {
    const stepEnv = {...env};
    if (name === installName && protectedSource === '${{ secrets.VITE_WORKER_URL }}') stepEnv.WORKER_URL_INPUT = secret;
    // Handler.PrintActionDetails prints the expanded script and environment
    // before the script starts; an in-script add-mask cannot protect this log.
    runnerLog += mask(`${stepRun(name)}\n`);
    for (const key of ['VITE_WORKER_URL', 'WORKER_URL_INPUT']) {
      if (stepEnv[key] !== undefined) runnerLog += mask(`${key}: ${stepEnv[key]}\n`);
    }
    const result = spawnSync('/bin/bash', ['-e', '-c', stepRun(name)], {cwd: dir, env: stepEnv, encoding: 'utf8'});
    assert.equal(result.error, undefined);
    status = result.status; stdout += result.stdout; stderr += result.stderr;
    if (status !== 0) break;
    // Actions exposes GITHUB_ENV additions to subsequent steps, not this writer.
    if (existsSync(handoffFile)) {
      const line = readFileSync(handoffFile, 'utf8');
      assert.match(line, /^VITE_WORKER_URL=[^\r\n]*\n$/);
      env.VITE_WORKER_URL = line.slice('VITE_WORKER_URL='.length, -1);
    }
  }
  return {status, stdout, stderr, runnerLog,
    handoff: existsSync(handoffFile) ? readFileSync(handoffFile, 'utf8') : '',
    summary: existsSync(summaryFile) ? readFileSync(summaryFile, 'utf8') : '',
    events: existsSync(eventsFile) ? readFileSync(eventsFile, 'utf8').trim().split('\n').map(JSON.parse) : []};
}

test('raw credential-shaped configuration cannot reach the pre-execution runner log', t => {
  for (const value of ['https://chef:synthetic-private-value@worker.unit-fixture.workers.dev', 'https://worker.unit-fixture.workers.dev\nsynthetic-private-value']) {
    const result = run(t, value);
    assert.notEqual(result.status, 0);
    assert.equal(result.handoff, '');
    assert.doesNotMatch(result.runnerLog + result.stdout + result.stderr, /synthetic-private-value/);
  }
});

test('build protects raw input with a repository Secret and only hands validated public values to Vite', () => {
  const buildJob = yaml.slice(yaml.indexOf('  build:'), yaml.indexOf('  deploy:'));
  assert.doesNotMatch(buildJob, /vars\.VITE_WORKER_URL/);
  assert.match(buildJob, /^          WORKER_URL_INPUT: \$\{\{ secrets\.VITE_WORKER_URL \}\}$/m);
  assert.equal((buildJob.match(/secrets\.VITE_WORKER_URL/g) ?? []).length, 1);
  assert.doesNotMatch(buildJob.slice(0, buildJob.indexOf('    steps:')), /VITE_WORKER_URL|WORKER_URL_INPUT/, 'no job-wide raw input');
  assert.doesNotMatch(stepRun(installName), /\$\{\{/, 'raw expressions never enter script text');
  assert.ok(yaml.indexOf(`- name: ${installName}`) < yaml.indexOf('- name: Machine-translate'));
  assert.match(stepRun(buildName), /^pnpm -C packages\/web build$/);
});

for (const value of [undefined, '']) {
  test(`unset/empty Worker configuration preserves an explicitly read-only build (${String(value)})`, t => {
    const result = run(t, value);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.events.map(e => e.kind), ['install', 'prepare', 'build']);
    assert.ok(result.events.every(e => e.workerUrl === ''));
    assert.match(result.stdout, /::warning::.*read-only/i);
    assert.match(result.summary, /read-only/i);
    assert.match(result.summary, /not.*(?:full|writable)/i);
  });
}

for (const value of ['https://canteen.unit-fixture.workers.dev', 'https://canteen.unit-fixture.workers.dev/', 'https://api.kitchen-fixture.net', 'HTTPS://API.KITCHEN-FIXTURE.NET:443/']) {
  test(`valid public Worker origin reaches the unchanged Web build: ${value}`, t => {
    const result = run(t, value);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.events.map(e => e.kind), ['install', 'prepare', 'build']);
    assert.equal(result.events.at(-1).workerUrl, value);
    assert.ok(result.events.slice(0, -1).every(e => e.workerUrl === ''), 'raw config is not a step environment input');
    assert.equal(result.handoff, `VITE_WORKER_URL=${value}\n`);
    assert.match(result.summary, /format.*(?:only|passed)/i);
    assert.match(result.summary, /(?:connectivity|reachable)/i);
    assert.doesNotMatch(result.summary, /(?:full release|writable release) (?:ready|complete)/i);
  });
}

const invalid = [
  'not-a-url', ' ', ' https://worker.unit-fixture.workers.dev', 'https://worker.unit-fixture.workers.dev\n',
  '//worker.unit-fixture.workers.dev', 'http://worker.unit-fixture.workers.dev', 'file:///worker',
  'https://chef:synthetic-token@worker.unit-fixture.workers.dev',
  'https://@worker.unit-fixture.workers.dev',
  'https://worker.unit-fixture.workers.dev/plan/week', 'https://worker.unit-fixture.workers.dev/%2e',
  'https://worker.unit-fixture.workers.dev?token=synthetic-token', 'https://worker.unit-fixture.workers.dev?',
  'https://worker.unit-fixture.workers.dev#synthetic-token', 'https://worker.unit-fixture.workers.dev#',
  'https://worker.unit-fixture.workers.dev\\plan', 'https://localhost', 'https://localhost:8787',
  'https://127.0.0.1', 'https://[::1]', 'https://192.168.1.2', 'https://worker.local',
  'https://worker', 'https://worker.example', 'https://worker.invalid', 'https://example.com',
  'https://terryyyc.github.io/canteen-os/', 'https://terryyyc.github.io',
];
test('bad or misdirected addresses fail before dependencies/build and never echo the supplied value', t => {
  for (const value of invalid) {
    const result = run(t, value);
    assert.notEqual(result.status, 0, value);
    assert.deepEqual(result.events, [], value);
    assert.equal(result.handoff, '', 'invalid config must not enter later step environments');
    assert.match(result.stdout + result.stderr, /::error::.*VITE_WORKER_URL/);
    if (value.trim().length > 8) assert.equal((result.stdout + result.stderr + result.summary).includes(value), false, 'do not echo a value that might contain credentials');
    assert.doesNotMatch(result.stdout + result.stderr + result.summary, /synthetic-token/);
    assert.doesNotMatch(result.runnerLog, /synthetic-token/);
  }
});

test('a missing validated handoff fails before dependencies/build', t => {
  const result = run(t, 'https://canteen.unit-fixture.workers.dev', '', {noHandoff: true});
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.events, []);
  assert.equal(result.handoff, '');
});

for (const phase of ['install', 'prepare', 'build']) {
  test(`${phase} failure remains nonzero and prevents dependent work`, t => {
    const result = run(t, 'https://canteen.unit-fixture.workers.dev', phase);
    assert.equal(result.status, 31);
    assert.equal(result.events.at(-1).kind, phase);
  });
}
