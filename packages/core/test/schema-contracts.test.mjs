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

test('explicit v3 accepts omitted servings and empty plans while v2 stays strict', async () => {
  const {createSchemaValidators} = await import(validator);
  const {validateEntity:v} = createSchemaValidators({schemaDir:path.join(root,'schemas')});
  const meal={date:'2026-09-14',mealType:'lunch',dishRef:'rice'};
  assert.equal(v('plan',{schemaVersion:'3',meals:[meal]}).valid,true);
  assert.equal(v('plan',{schemaVersion:'3',meals:[]}).valid,true);
  assert.equal(v('plan',{schemaVersion:'2',meals:[]}).valid,false);
  assert.equal(v('plan',{schemaVersion:'2',meals:[meal]}).valid,false);
  for(const version of ['2','3']) for(const servings of [0,null,-1,1.5]) {
    assert.equal(v('plan',{schemaVersion:version,meals:[{...meal,plannedServings:servings}]}).valid,false);
  }
  for(const version of ['1','4',null,undefined]) assert.equal(v('plan',{schemaVersion:version,meals:[{...meal,plannedServings:2}]}).valid,false);
  assert.equal(v('plan',{schemaVersion:'3',meals:[{...meal,date:'2026-02-30'}]}).valid,false);
});

test('only explicit Dish v3 preserves recorded references without invented qty', async () => {
  const {createSchemaValidators} = await import(validator);
  const {validateEntity:v} = createSchemaValidators({schemaDir:path.join(root,'schemas')});
  const dish={name:{zh:'米饭'},components:[{ingredientRef:'rice'}]};
  assert.equal(v('dish',{...dish,schemaVersion:'3'}).valid,true);
  for(const version of ['2',undefined,'99']) assert.equal(v('dish',{...dish,schemaVersion:version}).valid,false);
  assert.equal(v('dish',{name:{zh:'米饭'}}).valid,true);
  for(const qty of [null,{},0,{unit:'g'},{unit:'g',value:0}]) {
    assert.equal(v('dish',{...dish,schemaVersion:'3',components:[{ingredientRef:'rice',qty}]}).valid,false);
  }
  assert.equal(v('dish',{...dish,schemaVersion:'3',components:[{ingredientRef:'rice',qty:{unit:'to-taste'}}]}).valid,true);
  assert.equal(v('dish',{...dish,schemaVersion:'3',steps:[{n:1,text:{en:'Cook'}}]}).valid,false);
});

test('ShoppingList v1 is strict, has independent decisions and constrained previous/bought fields', async () => {
  const {createSchemaValidators} = await import(validator);
  const {validateEntity:v} = createSchemaValidators({schemaDir:path.join(root,'schemas')});
  const basis={sourceRevision:'a'.repeat(40),selection:[{menuPlanRef:'week-one',date:'2026-09-14',mealType:'lunch'}]};
  const list={shoppingListVersion:'1',id:'shop-one',basis,items:[{ingredientRef:'rice',decision:'check'}]};
  assert.equal(v('shopping-list',list).valid,true);
  assert.equal(v('shopping-list',{...list,items:[]}).valid,true);
  for(const invalid of [{...list,schemaVersion:'2'},{...list,basis:{...basis,sourceRevision:'main'}},
    {...list,basis:{...basis,selection:[...basis.selection,...basis.selection]}},
    {...list,items:[{ingredientRef:'rice',decision:'bought'}]},
    {...list,items:[{ingredientRef:'rice',decision:'available',bought:true}]},
    {...list,items:[{ingredientRef:'rice',decision:'buy',previous:{basis,decision:'available'}}]}]) {
      assert.equal(v('shopping-list',invalid).valid,false,JSON.stringify(invalid));
  }
  assert.equal(v('shopping-list',{...list,items:[{ingredientRef:'rice',decision:'buy',bought:true}]}).valid,true);
  assert.equal(v('shopping-list',{...list,items:[{ingredientRef:'rice',decision:'check',previous:{basis,decision:'buy',bought:true}}]}).valid,true);
});

test('Python subset enforces exclusive version branches rather than ignoring oneOf', () => {
  const script=path.join(root,'scripts','local-validate.py');
  const py=`import importlib.util, pathlib\ns=importlib.util.spec_from_file_location('v',${JSON.stringify(script)})\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nbranches={'oneOf':[{'type':'object','properties':{'version':{'const':'2'}},'required':['version']},{'type':'object','properties':{'version':{'const':'3'}},'required':['version']}]}\nm.validate({'version':'99'},branches,pathlib.Path(${JSON.stringify(path.join(root,'schemas','common.schema.json'))}),'root')\nassert len(m.errors)>0, 'oneOf ignored unknown version'\nm.errors.clear()\nm.validate(2,{'oneOf':[{'type':'number'},{'type':'integer'}]},pathlib.Path(${JSON.stringify(path.join(root,'schemas','common.schema.json'))}),'root')\nassert len(m.errors)>0, 'oneOf accepted two branches'\n`;
  const r=spawnSync('python3',['-c',py],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
});

test('explicit upgrades preserve quantities, omission and order without mutating inputs', async () => {
  const core=await import('../dist/index.js');
  assert.equal(typeof core.upgradeMenuPlan,'function');
  assert.equal(typeof core.upgradeDish,'function');
  const plan={schemaVersion:'2',margin:1.1,meals:[{date:'2026-09-14',mealType:'lunch',dishRef:'rice',plannedServings:200}]};
  const dish={name:{zh:'米饭'},baseServings:50,components:[{ingredientRef:'rice',qty:{value:2,unit:'kg'}},{ingredientRef:'salt',qty:{unit:'to-taste'}}]};
  const old=JSON.stringify({plan,dish});
  const p=core.upgradeMenuPlan(plan),d=core.upgradeDish(dish);
  assert.deepEqual(p,{...plan,schemaVersion:'3'});
  assert.deepEqual(d,{...dish,schemaVersion:'3'});
  assert.deepEqual(core.upgradeMenuPlan(p),p);
  assert.deepEqual(core.upgradeDish(d),d);
  p.meals[0].plannedServings=2;d.components[0].qty.value=1;
  assert.equal(JSON.stringify({plan,dish}),old);
  const unknown={schemaVersion:'3',name:{en:'Rice'},components:[{ingredientRef:'rice'}]};
  assert.deepEqual(core.upgradeDish(unknown),unknown);
  assert.deepEqual(core.upgradeMenuPlan({schemaVersion:'3',meals:[]}),{schemaVersion:'3',meals:[]});
});
