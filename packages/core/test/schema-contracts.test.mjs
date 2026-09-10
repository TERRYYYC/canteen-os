import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const validator = new URL('../../../scripts/validate-schemas.mjs', import.meta.url).href;

test('formal validator import is silent and exposes reusable API without exiting', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `const api = await import(${JSON.stringify(validator)}); console.log(JSON.stringify(Object.keys(api).sort()));`], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), ['createSchemaValidators','main','validateData']);
});

test('formal validation uses explicit root/dataDir/schemaDir and reports malformed files', async () => {
  const { validateData } = await import(validator);
  const dir = mkdtempSync(path.join(tmpdir(), 'team-schema-'));
  try {
    mkdirSync(path.join(dir,'inputs','menu-plans'), {recursive:true});
    writeFileSync(path.join(dir,'inputs','techniques.json'), '[]');
    writeFileSync(path.join(dir,'inputs','menu-plans','small.json'), JSON.stringify({schemaVersion:'2',meals:[{date:'2026-09-14',mealType:'lunch',dishRef:'rice'}]}));
    const options = {root:dir,dataDir:path.join(dir,'inputs'),schemaDir:path.join(root,'schemas')};
    let report = validateData(options);
    assert.equal(report.failed, 1);
    assert.equal(report.results.find(r=>r.file.endsWith('small.json')).errors[0].keyword, 'required');
    writeFileSync(path.join(dir,'inputs','menu-plans','small.json'), '{broken');
    report = validateData(options);
    assert.equal(report.failed, 1);
    assert.equal(report.results.find(r=>r.file.endsWith('small.json')).errors[0].keyword, 'parse');
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
