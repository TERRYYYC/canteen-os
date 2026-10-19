// ADR-0012 contract checks: fixtures under test/fixtures/canteen-quantities/ are synthetic, not kitchen data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSchemaValidators, validateData} from './validate-schemas.mjs';
import {validateEntity as workerValidate} from '../packages/worker/dist/validate.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FIXTURES = path.join(ROOT, 'test/fixtures/canteen-quantities');
const read = (rel) => JSON.parse(readFileSync(path.join(FIXTURES, rel), 'utf8'));
const kindOf = (file) => file.replace(/^(valid|invalid)\//, '').split('-')[0] === 'chef' ? 'chef-rules'
  : file.includes('/ingredient-') ? 'ingredient' : 'dish';

// file → [layer, keyword, instancePath]. semantic = rules JSON Schema cannot express (validate-schemas.mjs only).
const INVALID = {
  'invalid/dish-v3-servings-1-qty-without-source.json': ['semantic', 'missingQtySource', '/components/1'],
  'invalid/dish-v3-unknown-step-out-of-range.json': ['semantic', 'unknownOutOfRange', '/unknowns/0/stepIndex'],
  'invalid/dish-v3-unknown-component-out-of-range.json': ['semantic', 'unknownOutOfRange', '/unknowns/0/componentIndex'],
  'invalid/dish-v3-unknown-step-without-steps.json': ['semantic', 'unknownOutOfRange', '/unknowns/0/stepIndex'],
  'invalid/chef-rules-duplicate-id.json': ['semantic', 'duplicateRuleId', '/1/id'],
  'invalid/dish-v3-unknowns-empty.json': ['schema', 'minItems', '/unknowns'],
  'invalid/dish-v3-unknowns-duplicate.json': ['schema', 'uniqueItems', '/unknowns'],
  'invalid/dish-v3-prep-ahead-without-action.json': ['schema', 'required', '/unknowns/0'],
  'invalid/dish-v3-action-without-prep-ahead.json': ['schema', 'const', '/unknowns/1/kind'],
  'invalid/dish-v3-rule-source-without-rule-id.json': ['schema', 'required', '/components/1/qtySource'],
  'invalid/dish-v3-rule-source-with-date.json': ['schema', 'not', '/components/1/qtySource'],
  'invalid/dish-v3-measured-without-date.json': ['schema', 'required', '/components/0/qtySource'],
  'invalid/dish-v3-source-names-a-person.json': ['schema', 'const', '/components/0/qtySource/by'],
  'invalid/dish-v3-source-without-qty.json': ['schema', 'dependentRequired', '/components/3'],
  'invalid/dish-v3-original-qty-without-amount.json': ['schema', 'dependentRequired', '/components/0'],
  'invalid/dish-v3-lead-time-bad-unit.json': ['schema', 'enum', '/components/0/prep/leadTime/unit'],
  'invalid/ingredient-v3-yield-source-without-yield.json': ['schema', 'dependentRequired', ''],
  'invalid/chef-rules-yield-with-unit.json': ['schema', 'not', '/0'],
  'invalid/chef-rules-yield-above-1.json': ['schema', 'maximum', '/0/value'],
  'invalid/chef-rules-per-serving-without-unit.json': ['schema', 'required', '/0'],
};
const VALID = readdirSync(path.join(FIXTURES, 'valid')).sort().map((f) => `valid/${f}`);
const {validateEntity} = createSchemaValidators();

test('every fixture file is listed exactly once', () => {
  const invalid = readdirSync(path.join(FIXTURES, 'invalid')).sort().map((f) => `invalid/${f}`);
  assert.deepEqual(invalid, Object.keys(INVALID).sort());
  assert.deepEqual(VALID, ['valid/chef-rules.json', 'valid/dish-v2-servings-1.json', 'valid/dish-v3-all-fields.json',
    'valid/dish-v3-servings-2-no-source.json', 'valid/ingredient-v3-sources.json']);
});

test('existing data/ still passes unchanged, including the empty chef rules list', () => {
  const report = validateData();
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter((r) => !r.valid)));
  const rules = report.results.find((r) => r.file.endsWith(`${path.sep}chef-rules.json`));
  assert.equal(rules?.schema, 'chef-rules.schema.json');
  assert.deepEqual(JSON.parse(readFileSync(path.join(ROOT, 'data/chef-rules.json'), 'utf8')), []);
});

test('valid fixtures pass: all new fields, servings 2 without sources, v2 at servings 1', () => {
  for (const file of VALID) {
    const result = validateEntity(kindOf(file), read(file));
    assert.equal(result.valid, true, `${file}: ${JSON.stringify(result.errors)}`);
  }
});

test('invalid fixtures are rejected at the recorded keyword and position', () => {
  for (const [file, [, keyword, instancePath]] of Object.entries(INVALID)) {
    const result = validateEntity(kindOf(file), read(file));
    assert.equal(result.valid, false, file);
    assert.ok(result.errors.some((e) => e.keyword === keyword && e.instancePath === instancePath),
      `${file}: ${JSON.stringify(result.errors)}`);
  }
});

test('semantic errors only after the schema passes, and only for dish v3 at servings 1', () => {
  const dish = read('valid/dish-v3-all-fields.json');
  delete dish.components[0].qtySource;
  delete dish.components[1].qtySource;
  const result = validateEntity('dish', dish);
  assert.deepEqual(result.errors.map((e) => [e.keyword, e.instancePath]),
    [['missingQtySource', '/components/0'], ['missingQtySource', '/components/1']]);
  assert.match(result.errors[0].message, /每个用量都要写明出处/);
  for (const baseServings of [2, 50, undefined]) {
    const copy = structuredClone(dish);
    if (baseServings === undefined) delete copy.baseServings; else copy.baseServings = baseServings;
    assert.equal(validateEntity('dish', copy).valid, true, String(baseServings));
  }
});

test('schema-level cases agree in the CLI, fresh Worker and Python subset validators', () => {
  const cases = [...VALID.map((file) => [file, true]),
    ...Object.entries(INVALID).filter(([, [layer]]) => layer === 'schema').map(([file]) => [file, false])];
  const schemaFor = (kind, value) => kind === 'chef-rules' ? 'chef-rules.schema.json'
    : value.schemaVersion === '3' ? `${kind}-v3.schema.json` : `${kind}.schema.json`;
  const py = String.raw`import importlib.util,json,sys
from pathlib import Path
root=Path(sys.argv[1])
spec=importlib.util.spec_from_file_location('v',root/'scripts/local-validate.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
out=[]
for f in json.load(sys.stdin):
    m.errors.clear()
    p=root/'schemas'/f['schema']
    m.validate(f['value'],m.load_schema(p),p,'#')
    out.append({'valid':not m.errors,'errors':list(m.errors)})
print(json.dumps(out))`;
  const inputs = cases.map(([file]) => ({kind: kindOf(file), value: read(file)}));
  const python = JSON.parse(execFileSync('python3', ['-c', py, ROOT], {encoding: 'utf8',
    input: JSON.stringify(inputs.map(({kind, value}) => ({schema: schemaFor(kind, value), value})))}));
  cases.forEach(([file, expected], i) => {
    const {kind, value} = inputs[i];
    assert.equal(validateEntity(kind, value).valid, expected, `CLI: ${file}`);
    assert.equal(python[i].valid, expected, `Python: ${file}: ${python[i].errors.join(';')}`);
    if (kind !== 'chef-rules') assert.equal(workerValidate(kind, value).valid, expected, `Worker: ${file}`);
  });
});

test('rule reference fixtures are schema-valid, so build-data rejects them only at the reference layer', () => {
  const dir = path.join(FIXTURES, 'references');
  assert.equal(validateEntity('chef-rules', read('references/chef-rules.json')).valid, true);
  for (const group of ['valid', 'invalid']) for (const file of readdirSync(path.join(dir, group)).sort()) {
    const result = validateEntity(file.startsWith('ingredient') ? 'ingredient' : 'dish', read(`references/${group}/${file}`));
    assert.equal(result.valid, true, `${group}/${file}: ${JSON.stringify(result.errors)}`);
  }
});

test('chef rules file is optional for older data roots but checked when present', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'chef-rules-'));
  try {
    mkdirSync(path.join(dir, 'data'));
    cpSync(path.join(ROOT, 'data/techniques.json'), path.join(dir, 'data/techniques.json'));
    let report = validateData({root: dir, schemaDir: path.join(ROOT, 'schemas')});
    assert.equal(report.failed, 0);
    assert.equal(report.results.some((r) => r.file.endsWith('chef-rules.json')), false);
    writeFileSync(path.join(dir, 'data/chef-rules.json'), JSON.stringify(read('invalid/chef-rules-duplicate-id.json')));
    report = validateData({root: dir, schemaDir: path.join(ROOT, 'schemas')});
    assert.equal(report.failed, 1);
    assert.equal(report.results.find((r) => r.file.endsWith('chef-rules.json')).errors[0].keyword, 'duplicateRuleId');
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
