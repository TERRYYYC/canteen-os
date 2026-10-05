import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createSchemaValidators} from './validate-schemas.mjs';
import {validateEntity} from '../packages/worker/dist/validate.js';
const fixtures=JSON.parse(readFileSync(new URL('../test/fixtures/contracts/adoption-parity.json',import.meta.url)));
const python=String.raw`import importlib.util,json,sys
from pathlib import Path
root=Path(sys.argv[1])
spec=importlib.util.spec_from_file_location('adoption_validator',root/'scripts/local-validate.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
out=[]
for f in json.load(sys.stdin):
    m.errors.clear()
    p=root/'schemas'/f['schema']
    m.validate(f['value'],m.load_schema(p),p,'#')
    out.append({'valid':not m.errors,'errors':list(m.errors)})
print(json.dumps(out))`;
test('independent adoption conditional fixtures agree in Python, CLI and fresh Worker validators',()=>{
  const py=JSON.parse(execFileSync('python3',['-c',python,fileURLToPath(new URL('../',import.meta.url))],{input:JSON.stringify(fixtures),encoding:'utf8'}));
  const cli=createSchemaValidators();
  for(const [i,f]of fixtures.entries()){
    assert.equal(cli.validateEntity(f.kind,f.value).valid,f.expected,`CLI: ${f.name}`);
    assert.equal(validateEntity(f.kind,f.value).valid,f.expected,`Worker: ${f.name}`);
    assert.equal(py[i].valid,f.expected,`Python: ${f.name}: ${py[i].errors.join(';')}`);
  }
});
