import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const cli = join(repo, 'scripts/replay-video-recipe.mjs');
const fixture = join(repo, 'examples/video-recipe/fixture');

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'canteen-replay-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, 'input');
  cpSync(fixture, input, { recursive: true });
  return { root, input, output: join(root, 'output') };
}

function edit(dir, name, change) {
  const path = join(dir, name);
  const value = JSON.parse(readFileSync(path, 'utf8'));
  change(value);
  writeFileSync(path, JSON.stringify(value));
}

function run(s, extra = []) {
  return spawnSync(process.execPath, [cli, '--artifact-dir', s.input, '--media', join(s.input, 'media.txt'), '--output-dir', s.output, '--synthetic-fixture', ...extra], { encoding: 'utf8' });
}

function rejects(s, pattern) {
  const result = run(s);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, pattern);
  assert.equal(existsSync(s.output), false, 'invalid input must not create output');
}

test('replays a clearly synthetic reference and preserves quantities, alternatives and unknowns', t => {
  const s = setup(t);
  const before = readFileSync(join(s.input, 'candidate.json'));
  const result = run(s);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(join(s.output, 'receipt.json'), 'utf8'));
  assert.equal(receipt.mode, 'synthetic_reference_replay');
  assert.equal(receipt.newAiAnalysis, false);
  assert.equal(receipt.downloadPerformed, false);
  assert.equal(receipt.kbWrites, false);
  assert.equal(receipt.independentlyDecoded, false);
  assert.equal(receipt.status, 'needs_human_review');
  assert.deepEqual(receipt.counts, { ingredients: 2, steps: 2, evidence: 3, illustrations: 1 });
  const report = readFileSync(join(s.output, 'recipe.md'), 'utf8');
  for (const text of ['合成契约样例', '两勺', '替代液', '不能同时累计', '勺容量未知', '火力未说明', '份数未说明']) assert.ok(report.includes(text), `missing ${text}`);
  assert.deepEqual(readFileSync(join(s.input, 'candidate.json')), before);
});

test('normal mode is cached artifact replay, never a new AI or independent media decode', t => {
  const s = setup(t);
  edit(s.input, 'source.json', value => { delete value.synthetic; });
  const result = spawnSync(process.execPath, [cli, '--artifact-dir', s.input, '--media', join(s.input, 'media.txt'), '--output-dir', s.output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(join(s.output, 'receipt.json'), 'utf8'));
  assert.equal(receipt.mode, 'cached_artifact_replay');
  assert.equal(receipt.independentlyDecoded, false);
  assert.equal(receipt.newAiAnalysis, false);
});

test('rejects a synthetic input without its explicit flag', t => {
  const s = setup(t);
  const result = spawnSync(process.execPath, [cli, '--artifact-dir', s.input, '--media', join(s.input, 'media.txt'), '--output-dir', s.output], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /synthetic-fixture/);
  assert.equal(existsSync(s.output), false);
});

test('rejects media bytes that differ from the recorded source hash', t => {
  const s = setup(t);
  const path = join(s.input, 'media.txt');
  const bytes = readFileSync(path);
  bytes[0] ^= 1;
  writeFileSync(path, bytes);
  rejects(s, /media.*SHA-256/i);
});

test('rejects a candidate that belongs to a different source', t => {
  const s = setup(t);
  edit(s.input, 'candidate.json', value => { value.sourceSha256 = '0'.repeat(64); });
  rejects(s, /candidate.*source/i);
});

test('rejects dangling audiovisual references', t => {
  const s = setup(t);
  edit(s.input, 'candidate.json', value => { value.ingredients[0].evidenceIds = ['missing']; });
  rejects(s, /evidence.*missing/i);
});

test('metadata cannot replace audiovisual evidence', t => {
  const s = setup(t);
  edit(s.input, 'evidence.json', value => { value[0].kind = 'source_metadata'; });
  rejects(s, /audiovisual/i);
});

test('rejects evidence well beyond its source stream', t => {
  const s = setup(t);
  edit(s.input, 'evidence.json', value => { value[0].endMs = 100000; });
  rejects(s, /evidence.*time/i);
});

test('rejects step windows that do not overlap any cited evidence', t => {
  const s = setup(t);
  edit(s.input, 'candidate.json', value => { value.steps[1].startMs = 0; value.steps[1].endMs = 500; });
  rejects(s, /step.*overlap/i);
});

test('rejects incomplete recorded audio coverage', t => {
  const s = setup(t);
  edit(s.input, 'source.json', value => { value.analysisCoverage.audioProcessedThroughMs = 100; });
  rejects(s, /audio.*coverage/i);
});

test('rejects changed illustration bytes', t => {
  const s = setup(t);
  writeFileSync(join(s.input, 'reference.bin'), 'changed illustration bytes');
  rejects(s, /illustration.*(SHA-256|bytes)/i);
});

test('rejects illustration paths escaping the artifact directory', t => {
  const s = setup(t);
  edit(s.input, 'illustrations.json', value => { value.images[0].path = '../outside.jpg'; });
  rejects(s, /illustration.*path/i);
});

test('rejects illustration symlinks outside the artifact directory', t => {
  const s = setup(t);
  const outside = join(s.root, 'outside.bin');
  writeFileSync(outside, readFileSync(join(s.input, 'reference.bin')));
  rmSync(join(s.input, 'reference.bin'));
  symlinkSync(outside, join(s.input, 'reference.bin'));
  rejects(s, /illustration.*path/i);
});

test('rejects existing output directories and keeps their content', t => {
  const s = setup(t);
  mkdirSync(s.output);
  writeFileSync(join(s.output, 'keep.txt'), 'keep');
  const result = run(s);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /output.*exists/i);
  assert.equal(readFileSync(join(s.output, 'keep.txt'), 'utf8'), 'keep');
  assert.equal(existsSync(join(s.output, 'recipe.md')), false);
});

test('rejects output inside the input or repository', t => {
  const s = setup(t);
  s.output = join(s.input, 'output');
  rejects(s, /output.*(input|artifact)/i);
  s.output = resolve(repo, '.video-replay-test-output');
  rejects(s, /output.*repository/i);
});

test('rejects approval flags or imprecise quantities promoted into arithmetic', t => {
  const a = setup(t);
  edit(a.input, 'candidate.json', value => { value.approvedForMenu = true; });
  rejects(a, /approval/i);
  const b = setup(t);
  edit(b.input, 'candidate.json', value => { value.ingredients[1].normalizedQuantity = { value: 10, unit: 'ml' }; });
  rejects(b, /imprecise/i);
});
