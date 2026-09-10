#!/usr/bin/env node
/** Formal Ajv 2020 validation, shared by the CLI and fixture consumers.
 * Importing this module performs no validation, logging, or process exit.
 * CLI: node scripts/validate-schemas.mjs [--root dir] [--data-dir dir] [--schema-dir dir]
 * Cross-file references/assets remain separate checks; valid here means format only.
 */
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
  {path:'ingredients', kind:'ingredient', dir:true},
  {path:'dishes', kind:'dish', dir:true},
  {path:'menu-plans', kind:'plan', dir:true},
  {path:'purchase-orders', kind:'purchase-order', dir:true},
  {path:'techniques.json', kind:'techniques', dir:false},
];
const SCHEMAS = {ingredient:'ingredient.schema.json',dish:'dish.schema.json',plan:'menu-plan.schema.json',
  'purchase-order':'purchase-order.schema.json',techniques:'techniques.schema.json'};
const error = (keyword,message,params={}) => ({instancePath:'',keyword,message,params});

export function createSchemaValidators({schemaDir=path.join(ROOT,'schemas')}={}) {
  const ajv = new Ajv2020({allErrors:true,strict:false});
  addFormats(ajv);
  for (const file of readdirSync(schemaDir).filter(f=>f.endsWith('.schema.json')).sort()) {
    ajv.addSchema(JSON.parse(readFileSync(path.join(schemaDir,file),'utf8')),file);
  }
  return {
    validateEntity(kind,value) {
      const schema = Object.hasOwn(SCHEMAS,kind) ? SCHEMAS[kind] : null;
      if (!schema) return {valid:false,schema:null,errors:[error('kind','unknown entity kind',{kind})]};
      const validate = ajv.getSchema(schema);
      if (!validate) throw new Error(`schema 未注册成功: ${schema}`);
      const valid = validate(value);
      return {valid,schema,errors:valid ? [] : structuredClone(validate.errors ?? [])};
    },
  };
}

export function validateData({root=ROOT,dataDir=path.join(root,'data'),schemaDir=path.join(root,'schemas')}={}) {
  const {validateEntity} = createSchemaValidators({schemaDir});
  const results = [];
  for (const target of TARGETS) {
    const location = path.resolve(dataDir,target.path);
    const files = target.dir ? (existsSync(location)
      ? readdirSync(location).filter(f=>f.endsWith('.json')).sort().map(f=>path.join(location,f)) : []) : [location];
    for (const file of files) {
      if (!existsSync(file)) {
        results.push({file,schema:SCHEMAS[target.kind],valid:false,errors:[error('missing','文件缺失')]});
        continue;
      }
      let value;
      try { value = JSON.parse(readFileSync(file,'utf8')); }
      catch { results.push({file,schema:SCHEMAS[target.kind],valid:false,errors:[error('parse','文件不是合法 JSON')]}); continue; }
      results.push({file,...validateEntity(target.kind,value)});
    }
  }
  const passed = results.filter(r=>r.valid).length;
  return {passed,failed:results.length-passed,total:results.length,results};
}

export function main(argv=process.argv.slice(2)) {
  const options = {};
  for (let i=0;i<argv.length;i++) {
    const key = {'--root':'root','--data-dir':'dataDir','--schema-dir':'schemaDir'}[argv[i]];
    if (!key || !argv[i+1] || argv[i+1].startsWith('--')) throw new Error(`未知参数或缺少值: ${argv[i]}`);
    options[key] = path.resolve(argv[++i]);
  }
  const report = validateData(options);
  for (const r of report.results) {
    const label = path.relative(options.root ?? ROOT,r.file);
    if (r.valid) console.log(`PASS  ${label}  ✓ ${r.schema}`);
    else {
      console.error(`FAIL  ${label}  ✗ ${r.schema}`);
      for (const e of r.errors) console.error(`      ${e.instancePath || '(root)'} ${e.message}`);
    }
  }
  console.log(`\n${report.passed} passed, ${report.failed} failed, ${report.total} total`);
  return report.failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try { process.exitCode = main(); }
  catch (err) { console.error(`ERROR: ${err.message}`); process.exitCode = 1; }
}
