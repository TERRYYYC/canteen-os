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
function run(t, value, fail = '') {
  const dir = mkdtempSync(path.join(tmpdir(), 'team-deploy-config-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const bin = path.join(dir, 'bin'); mkdirSync(bin);
  for (const name of ['node', 'pnpm']) {
    writeFileSync(path.join(bin, name), `#!${process.execPath}\n(${boundary.toString()})();\n`, {mode: 0o755});
  }
  const eventsFile = path.join(dir, 'events');
  const summaryFile = path.join(dir, 'summary');
  const env = {...process.env, PATH: `${bin}:/usr/bin:/bin`,
    GITHUB_STEP_SUMMARY: summaryFile, DEPLOY_CONFIG_EVENTS: eventsFile, DEPLOY_CONFIG_FAIL: fail};
  delete env.VITE_WORKER_URL;
  // Model Actions' documented vars -> job env handoff from the actual YAML.
  const source = yaml.match(/^      VITE_WORKER_URL: (.+)$/m)?.[1];
  if (source === '${{ vars.VITE_WORKER_URL }}') env.VITE_WORKER_URL = value ?? '';
  let status = 0, stdout = '', stderr = '';
  for (const name of [installName, buildName]) {
    const result = spawnSync('/bin/bash', ['-e', '-c', stepRun(name)], {cwd: root, env, encoding: 'utf8'});
    assert.equal(result.error, undefined);
    status = result.status; stdout += result.stdout; stderr += result.stderr;
    if (status !== 0) break;
  }
  return {status, stdout, stderr,
    summary: existsSync(summaryFile) ? readFileSync(summaryFile, 'utf8') : '',
    events: existsSync(eventsFile) ? readFileSync(eventsFile, 'utf8').trim().split('\n').map(JSON.parse) : []};
}

test('build job injects the public repository variable, before translation and without a secret fallback', () => {
  const buildJob = yaml.slice(yaml.indexOf('  build:'), yaml.indexOf('  deploy:'));
  assert.match(buildJob, /    env:\n(?:      #[^\n]*\n)*      VITE_WORKER_URL: \$\{\{ vars\.VITE_WORKER_URL \}\}/);
  assert.equal((buildJob.match(/VITE_WORKER_URL:/g) ?? []).length, 1, 'one job value reaches validation and Vite unchanged');
  assert.doesNotMatch(buildJob, /secrets\.VITE_WORKER_URL/);
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
    assert.match(result.stdout + result.stderr, /::error::.*VITE_WORKER_URL/);
    if (value.trim().length > 8) assert.equal((result.stdout + result.stderr + result.summary).includes(value), false, 'do not echo a value that might contain credentials');
    assert.doesNotMatch(result.stdout + result.stderr + result.summary, /synthetic-token/);
  }
});

for (const phase of ['install', 'prepare', 'build']) {
  test(`${phase} failure remains nonzero and prevents dependent work`, t => {
    const result = run(t, 'https://canteen.unit-fixture.workers.dev', phase);
    assert.equal(result.status, 31);
    assert.equal(result.events.at(-1).kind, phase);
  });
}
