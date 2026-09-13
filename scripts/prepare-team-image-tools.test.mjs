import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, appendFileSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TEAM_IMAGE_TOOL_RELEASE as RELEASE, teamImageToolsDirectory, requireTeamImageTools, prepareTeamImageTools } from './prepare-team-image-tools.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function workspace(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'team-image-supply-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return {root, cacheRoot: path.join(root, 'cache')};
}
function readyFixture(cacheRoot, version = RELEASE.version) {
  const directory = teamImageToolsDirectory({cacheRoot});
  mkdirSync(path.join(directory, 'bin'), { recursive: true });
  const files = {};
  for (const name of ['dwebp', 'webpmux']) {
    const relative = `bin/${name}`;
    const bytes = `#!/bin/sh\nprintf '%s\\n' '${version}'\n`;
    writeFileSync(path.join(directory, relative), bytes, {mode: 0o755});
    files[relative] = hash(bytes);
  }
  for (const name of ['COPYING', 'PATENTS', 'AUTHORS']) {
    writeFileSync(path.join(directory, name), `test notice ${name}\n`);
    files[name] = hash(readFileSync(path.join(directory, name)));
  }
  const manifest = {schemaVersion: 1, version: RELEASE.version, sourceSha256: RELEASE.sha256, recipe: RELEASE.recipe, configure: RELEASE.configure, platform: process.platform, arch: process.arch, files};
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  return {directory, manifest};
}

test('offline read of missing tools fails without creating a cache', t => {
  const {cacheRoot} = workspace(t);
  assert.throws(() => requireTeamImageTools({cacheRoot}), /prepare-team-image-tools/);
  assert.equal(existsSync(cacheRoot), false);
});

test('complete cache returns verified absolute tool paths and preparation reuses it offline', async t => {
  const {cacheRoot, root} = workspace(t);
  const {directory} = readyFixture(cacheRoot);
  const tools = requireTeamImageTools({cacheRoot});
  assert.equal(tools.dwebp, path.join(directory, 'bin/dwebp'));
  assert.equal(tools.webpmux, path.join(directory, 'bin/webpmux'));
  assert.equal(tools.version, '1.6.0');
  assert.deepEqual(await prepareTeamImageTools({cacheRoot, archivePath: path.join(root, 'does-not-exist.tar.gz')}), tools);
});

test('a changed executable is rejected before it can be trusted by version alone', t => {
  const {cacheRoot} = workspace(t);
  const {directory} = readyFixture(cacheRoot);
  appendFileSync(path.join(directory, 'bin/dwebp'), '# altered binary\n');
  assert.throws(() => requireTeamImageTools({cacheRoot}), /integrity|checksum/i);
});

test('a matching file hash cannot conceal the wrong actual tool version', t => {
  const {cacheRoot} = workspace(t);
  readyFixture(cacheRoot, '1.5.0');
  assert.throws(() => requireTeamImageTools({cacheRoot}), /version/i);
});

test('missing source notice and wrong source recipe are not ready caches', t => {
  const {cacheRoot} = workspace(t);
  const {directory, manifest} = readyFixture(cacheRoot);
  rmSync(path.join(directory, 'COPYING'));
  assert.throws(() => requireTeamImageTools({cacheRoot}), /COPYING|notice|incomplete/i);
  readyFixture(cacheRoot);
  manifest.sourceSha256 = '0'.repeat(64);
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  assert.throws(() => requireTeamImageTools({cacheRoot}), /recipe|source|manifest/i);
});

test('checksum failure publishes nothing and releases owned preparation state', async t => {
  const {cacheRoot, root} = workspace(t);
  const archivePath = path.join(root, 'bad.tar.gz');
  writeFileSync(archivePath, 'this archive must never execute');
  await assert.rejects(prepareTeamImageTools({cacheRoot, archivePath}), /checksum|SHA-256/i);
  const directory = teamImageToolsDirectory({cacheRoot});
  assert.equal(existsSync(directory), false);
  assert.equal(existsSync(`${directory}.lock`), false);
  await assert.rejects(prepareTeamImageTools({cacheRoot, archivePath}), /checksum|SHA-256/i);
});

test('busy preparation is not overwritten or cleaned up by another process', async t => {
  const {cacheRoot} = workspace(t);
  const lock = `${teamImageToolsDirectory({cacheRoot})}.lock`;
  mkdirSync(lock, {recursive: true});
  writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({pid: 12345}));
  await assert.rejects(prepareTeamImageTools({cacheRoot}), /prepar|lock|busy/i);
  assert.equal(existsSync(path.join(lock, 'owner.json')), true);
});

test('CLI invoked through a symlink still checks missing tools and exits nonzero', t => {
  const {cacheRoot, root} = workspace(t);
  const link = path.join(root, 'prepare-link.mjs');
  symlinkSync(fileURLToPath(new URL('./prepare-team-image-tools.mjs', import.meta.url)), link);
  const result = spawnSync(process.execPath, [link, '--check', '--cache-dir', cacheRoot], {encoding: 'utf8'});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Prepare explicitly/);
  assert.equal(existsSync(cacheRoot), false);
});

for (const workflow of ['ci.yml', 'build-deploy.yml']) {
  test(`${workflow}: failed package installation stops before tool preparation`, t => {
    const {root} = workspace(t);
    const bin = path.join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\nexit 23\n', {mode: 0o755});
    const marker = path.join(root, 'preparation-called');
    writeFileSync(path.join(bin, 'node'), `#!${process.execPath}
const {spawnSync} = require('node:child_process');
if (process.argv[2] === 'scripts/prepare-team-image-tools.mjs') {
  require('node:fs').writeFileSync(process.env.PREPARATION_MARKER, 'called');
} else {
  const result = spawnSync(process.execPath, process.argv.slice(2), {stdio: 'inherit'});
  process.exit(result.status ?? 99);
}
`, {mode: 0o755});
    const yaml = readFileSync(new URL(`../.github/workflows/${workflow}`, import.meta.url), 'utf8');
    const install = yaml.slice(yaml.indexOf('- name: Install workspace dependencies'));
    const match = install.match(/\n        run: \|\n((?:          [^\n]*\n)+)/);
    assert.ok(match, 'expected the actual dependency-install run block');
    const script = match[1].split('\n').map(line => line.slice(10)).join('\n');
    // Execute the actual block without relying on the runner's implicit -e.
    const result = spawnSync('/bin/bash', ['-c', script], {encoding: 'utf8', env: {...process.env,
      PATH: `${bin}:/usr/bin:/bin`, PREPARATION_MARKER: marker,
      WORKER_URL_INPUT: 'https://canteen.unit-fixture.workers.dev',
      GITHUB_ENV: path.join(root, 'job-env'), GITHUB_STEP_SUMMARY: path.join(root, 'summary'),
    }});
    assert.equal(result.status, 23);
    assert.equal(result.stdout, '');
    assert.equal(existsSync(marker), false, 'failed installation must never prepare tools');
  });
}
