#!/usr/bin/env node
/** Formal Ajv 2020 validation, shared by the CLI and fixture consumers.
 * Importing this module performs no validation, logging, or process exit.
 * CLI: node scripts/validate-schemas.mjs [--root dir] [--data-dir dir] [--schema-dir dir]
 * Cross-file references/assets remain separate checks; valid here means format only,
 * plus the in-document ADR-0012 rules JSON Schema cannot express (see semanticErrors).
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
  {path:'shopping-lists', kind:'shopping-list', dir:true},
  // ADR-0012 A1. Optional so data roots that predate chef rules stay valid.
  {path:'chef-rules.json', kind:'chef-rules', dir:false, optional:true},
];
const SCHEMAS = {ingredient:'ingredient.schema.json',dish:'dish.schema.json',plan:'menu-plan.schema.json',
  'purchase-order':'purchase-order.schema.json',techniques:'techniques.schema.json','shopping-list':'shopping-list.schema.json',
  'chef-rules':'chef-rules.schema.json'};
const error = (keyword,message,params={},instancePath='') => ({instancePath,keyword,message,params});

/** ADR-0012 rules on a schema-valid document. Dish v2 has no qtySource field, so only v3 is checked;
 * dishes whose baseServings is not 1 are old data (e.g. the demo dish at 50) and stay unconstrained. */
function semanticErrors(kind,value) {
  const out = [];
  if (kind === 'dish' && value.schemaVersion === '3') {
    const components = value.components ?? [], steps = value.steps ?? [];
    if (value.baseServings === 1) components.forEach((c,i) => {
      if (c.qty?.value !== undefined && !c.qtySource) out.push(error('missingQtySource',
        '份数按每份记的菜，每个用量都要写明出处',{missingProperty:'qtySource'},`/components/${i}`));
    });
    (value.unknowns ?? []).forEach((u,i) => {
      if (u.stepIndex !== undefined && u.stepIndex >= steps.length) out.push(error('unknownOutOfRange',
        `「没说清」指向第 ${u.stepIndex+1} 步，这道菜只有 ${steps.length} 步`,{limit:steps.length},`/unknowns/${i}/stepIndex`));
      if (u.componentIndex !== undefined && u.componentIndex >= components.length) out.push(error('unknownOutOfRange',
        `「没说清」指向第 ${u.componentIndex+1} 样材料，这道菜只有 ${components.length} 样`,{limit:components.length},`/unknowns/${i}/componentIndex`));
    });
  }
  if (kind === 'chef-rules') {
    const seen = new Set();
    value.forEach((rule,i) => {
      if (seen.has(rule.id)) out.push(error('duplicateRuleId',`规则 id 重复：${rule.id}`,{id:rule.id},`/${i}/id`));
      seen.add(rule.id);
    });
  }
  return out;
}

export function createSchemaValidators({schemaDir=path.join(ROOT,'schemas')}={}) {
  const ajv = new Ajv2020({allErrors:true,strict:false});
  addFormats(ajv);
  for (const file of readdirSync(schemaDir).filter(f=>f.endsWith('.schema.json')).sort()) {
    ajv.addSchema(JSON.parse(readFileSync(path.join(schemaDir,file),'utf8')),file);
  }
  return {
    validateEntity(kind,value) {
      let schema = Object.hasOwn(SCHEMAS,kind) ? SCHEMAS[kind] : null;
      if ((kind === 'plan' || kind === 'dish') && value?.schemaVersion === '3') {
        schema = kind === 'plan' ? 'menu-plan-v3.schema.json' : 'dish-v3.schema.json';
      }
      if (kind === 'ingredient' && value?.schemaVersion === '3') schema = 'ingredient-v3.schema.json';
      if (!schema) return {valid:false,schema:null,errors:[error('kind','unknown entity kind',{kind})]};
      const validate = ajv.getSchema(schema);
      if (!validate) throw new Error(`schema 未注册成功: ${schema}`);
      const errors = validate(value) ? semanticErrors(kind,value) : structuredClone(validate.errors ?? []);
      return {valid:errors.length === 0,schema,errors};
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
        if (target.optional) continue;
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

let directExecution = false;
try { directExecution = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
catch { /* stdin/eval and virtual entry points are imports, not CLI execution. */ }
if (directExecution) {
  try { process.exitCode = main(); }
  catch (err) { console.error(`ERROR: ${err.message}`); process.exitCode = 1; }
}
