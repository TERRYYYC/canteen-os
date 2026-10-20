import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../apps/api/database.mjs';
import { buildApp } from '../../apps/api/app.mjs';
import { Repository } from '../../apps/api/repository.mjs';
import { readLegacyBundle, importLegacyBundle } from '../../apps/api/legacy-import.mjs';
import { createBackup, restoreBackup } from '../../scripts/sqlite-ops.mjs';
import { runImport } from '../../scripts/import-legacy.mjs';

const revision = 'f'.repeat(40), namespace = 'synthetic-legacy-test';
const precise = '0.12345678901234567890123456789012345670';
const i18n = { zh: '红烧肉', en: 'Braised pork', uk: 'Тушкована свинина' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/b1sAAAAASUVORK5CYII=', 'base64');

async function fixture(t, { image = false } = {}) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'kb-legacy-'));
  const sourceDir = join(root, 'export', 'data'), dataDir = join(root, 'kb'), uploadsDir = join(dataDir, 'uploads');
  await mkdir(join(sourceDir, 'ingredients'), { recursive: true });
  await mkdir(join(sourceDir, 'dishes'), { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  const ingredient = { schemaVersion: '2', name: { zh:'盐', en:'Salt', uk:'Сіль' }, role:'seasoning', baseUnit:'g', trackStock:true, onHand:12, purchase:{supplier:'synthetic',packSize:500,packUnit:'g'} };
  const techniques = [{ id:'stir-fry', kind:'heat', name:{zh:'炒',en:'Stir-fry',uk:'Обсмажувати'}, note:{zh:'说明',en:'Note',uk:'Примітка'} }];
  const dish = { schemaVersion:'3', name:i18n, status:'active', provenance:{source:'video',videoUrl:'https://example.test/video'},
    components:[{ingredientRef:'salt',qty:{value:'PRECISE',unit:'g'},prep:{techniqueRef:'stir-fry',size:'3mm',timing:'morning',note:{zh:'保留原备注',en:'Keep note',uk:'Нотатка'}},confidence:{value:0.72,source:'video'}},
      {ingredientRef:'salt'}], steps:[{text:{zh:'炒匀',en:'Mix',uk:'Змішати'},techniqueRef:'stir-fry',clip:{videoUrl:'https://example.test/video',start:1,end:3}}],
    ...(image ? { image:{src:'photo.png',license:'CC BY-SA 4.0',author:'Synthetic Author',sourceUrl:'https://example.test/license'} } : {}) };
  await writeFile(join(sourceDir,'ingredients','salt.json'), JSON.stringify(ingredient,null,2)+'\n');
  await writeFile(join(sourceDir,'techniques.json'), JSON.stringify(techniques,null,2)+'\n');
  await writeFile(join(sourceDir,'dishes','first.json'), JSON.stringify(dish,null,2).replace('"PRECISE"',precise)+'\n');
  await writeFile(join(sourceDir,'dishes','second.json'), JSON.stringify({schemaVersion:'3',name:i18n,status:'draft'}));
  await writeFile(join(sourceDir,'translations.lock.json'), JSON.stringify({'data/dishes/first.json#/name':{status:'human',source_hash:'original'}}));
  if (image) await writeFile(join(sourceDir,'dishes','photo.png'),png);
  const { db } = openDatabase(join(dataDir,'knowledge.sqlite'));
  const repo = new Repository(db,uploadsDir);
  t.after(async () => { if (db.isOpen) db.close(); await rm(root,{recursive:true,force:true}); });
  const bundle = () => readLegacyBundle({sourceDir,namespace,revision});
  const apply = () => importLegacyBundle({db,uploadsDir,bundle:bundle()});
  return {root,sourceDir,dataDir,uploadsDir,db,repo,bundle,apply};
}

function save(repo, recipe, id, version) {
  return repo.write({method:id?'PUT':'POST',path:id?`/api/v1/recipes/${id}`:'/api/v1/recipes',headers:{actor:'web',key:randomUUID(),match:id?`"v${version}"`:null,version},recipe,id});
}
const minimal = title => ({title,tags:[],ingredients:[],steps:[],sources:[],assets:[]});
const count = (db,table) => db.prepare(`SELECT count(*) n FROM ${table}`).get().n;

test('atomic import keeps existing same-name recipes, exact original bytes, decimal tokens, prep, languages and clips', async t => {
  const f = await fixture(t);
  const existing = save(f.repo,minimal(i18n)).body;
  const result = f.apply();
  assert.equal(result.counts.recipes,2); assert.equal(count(f.db,'recipes'),3);
  assert.deepEqual(f.repo.detail(existing.id),existing);
  const first = f.repo.detail(result.recipes.find(r=>r.legacyId==='first').id);
  const second = f.repo.detail(result.recipes.find(r=>r.legacyId==='second').id);
  assert.deepEqual(first.recipe.title,i18n);
  assert.equal(first.recipe.ingredients[0].amount.value,precise);
  assert.deepEqual(first.recipe.ingredients[1].amount,{kind:'unknown'});
  assert.equal(first.recipe.ingredients[0].role,'seasoning');
  assert.equal(first.recipe.ingredients[0].ingredientId,first.recipe.ingredients[1].ingredientId);
  assert.notEqual(first.recipe.ingredients[0].id,first.recipe.ingredients[1].id);
  assert.match(first.recipe.ingredients[0].preparation.zh,/炒 · 3mm · 当天早上 · 保留原备注/);
  assert.equal(first.recipe.assets[0].stepId,first.recipe.steps[0].id);
  assert.deepEqual(first.recipe.assets[0].clip,{start:1,end:3});
  assert.equal(first.legacy.original.components[0].confidence.value,0.72);
  assert.equal(first.legacy.source.sourceRevision,revision);
  assert.equal(first.legacy.techniques[0].original.id,'stir-fry');
  assert.match(first.legacy.rawText,new RegExp(precise.replace('.','\\.')));
  assert.equal(first.legacy.rows.ingredients[0].id,first.recipe.ingredients[0].id);
  assert.equal(first.legacy.warnings[0].code,'LEGACY_UNVERIFIED');
  assert.equal(first.sourceRecords[0].textContent,first.legacy.rawText);
  assert.equal('baseServings' in second.recipe,false);
  assert.deepEqual(second.recipe.ingredients,[]);
  const raw = await readFile(join(f.sourceDir,'dishes','first.json'));
  const stored = f.db.prepare('SELECT raw_bytes,sha256 FROM legacy_files WHERE path=?').get('data/dishes/first.json');
  assert.deepEqual(Buffer.from(stored.raw_bytes),raw);
  assert.equal(stored.sha256,createHash('sha256').update(raw).digest('hex'));
  assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('same snapshot replay leaves human edits intact; new revision or changed raw bytes refuse all writes', async t => {
  const f = await fixture(t), result = f.apply(), id = result.recipes[0].id;
  const first = f.repo.detail(id);
  const edited = save(f.repo,{...first.recipe,title:{zh:'人工修改'}},id,1).body;
  const before = ['recipes','sources','assets','recipe_revisions','legacy_bindings'].map(table=>count(f.db,table));
  assert.deepEqual(f.apply(),{...result,replayed:true});
  assert.deepEqual(f.repo.detail(id),edited);
  assert.deepEqual(f.repo.revision(id,1).legacy,first.legacy);
  assert.deepEqual(edited.legacy,first.legacy);
  assert.throws(()=>importLegacyBundle({db:f.db,uploadsDir:f.uploadsDir,bundle:readLegacyBundle({sourceDir:f.sourceDir,namespace,revision:'e'.repeat(40)})}),e=>e.code==='LEGACY_NEW_REVISION_REQUIRES_REVIEW');
  const file=join(f.sourceDir,'dishes','first.json'); await writeFile(file,(await readFile(file,'utf8'))+'\n');
  assert.throws(()=>f.apply(),e=>e.code==='LEGACY_SOURCE_CHANGED');
  assert.deepEqual(['recipes','sources','assets','recipe_revisions','legacy_bindings'].map(table=>count(f.db,table)),before);
});

test('missing reference rolls back every import table and preserves unrelated data', async t => {
  const f=await fixture(t); const existing=save(f.repo,minimal({zh:'原资料'})).body;
  const path=join(f.sourceDir,'dishes','first.json'); await writeFile(path,(await readFile(path,'utf8')).replaceAll('"salt"','"missing"'));
  assert.throws(()=>f.apply(),e=>e.code==='INVALID_LEGACY_IMPORT');
  for(const table of ['legacy_imports','legacy_files','legacy_bindings','legacy_recipe_evidence','ingredients','ingredient_knowledge','techniques','sources','assets']) assert.equal(count(f.db,table),0,table);
  assert.deepEqual(f.repo.detail(existing.id),existing);
});

test('local image rights persist in history; fault after file creation rolls back DB and removes new media',async t=>{
  const f=await fixture(t,{image:true});
  f.db.exec("CREATE TRIGGER import_fault BEFORE INSERT ON recipe_revisions BEGIN SELECT RAISE(ABORT,'injected failure'); END");
  assert.throws(()=>f.apply(),/injected failure/);
  assert.equal(count(f.db,'recipes'),0); assert.equal(count(f.db,'legacy_imports'),0);
  assert.deepEqual(await readdir(f.uploadsDir),[]);
  f.db.exec('DROP TRIGGER import_fault');
  const result=f.apply(), id=result.recipes.find(r=>r.legacyId==='first').id, first=f.repo.detail(id);
  const picture=first.media.find(a=>a.kind==='image');
  assert.deepEqual(picture.rights,{license:'CC BY-SA 4.0',author:'Synthetic Author',sourceUrl:'https://example.test/license'});
  assert.equal(picture.sha256,createHash('sha256').update(png).digest('hex'));
  assert.equal(f.repo.list({limit:20}).items.find(row=>row.id===id).cover?.rights,undefined,'list thumbnail cannot claim live metadata as fixed-version rights');
  f.db.prepare("UPDATE assets SET metadata='{}' WHERE id=?").run(picture.assetId);
  assert.deepEqual(f.repo.revision(id,1).media.find(a=>a.kind==='image').rights,picture.rights);
  assert.deepEqual(f.repo.legacy(id).evidence.assets.find(a=>a.kind==='image').rights,picture.rights);
});

test('knowledge APIs expose paginated standard records and immutable recipe evidence',async t=>{
  const f=await fixture(t), result=f.apply();
  const app=await buildApp({dataDir:f.dataDir,webDist:join(f.root,'no-web')}); t.after(()=>app.close());
  const get=path=>app.inject({method:'GET',url:`/api/v1${path}`,headers:{host:'127.0.0.1:4390'}});
  const ingredients=(await get('/ingredients?q=盐&limit=1')).json();
  assert.equal(ingredients.items.length,1);assert.equal(ingredients.items[0].role,'seasoning');
  assert.equal(ingredients.items[0].original.onHand,12); assert.equal(ingredients.items[0].legacy.sourceRevision,revision);
  const techniques=(await get('/techniques')).json(); assert.equal(techniques.items[0].kind,'heat');
  const id=result.recipes[0].id, legacy=(await get(`/recipes/${id}/legacy`)).json();
  assert.equal(legacy.recipeId,id);assert.deepEqual(legacy.evidence,f.repo.detail(id).legacy);
  assert.equal((await get('/ingredients?limit=101')).statusCode,400);
  assert.equal((await get('/techniques?unexpected=true')).statusCode,400);
  const another=save(f.repo,minimal({zh:'新建'})).body;
  assert.equal((await get(`/recipes/${another.id}/legacy`)).json().evidence,null);
  // Insert a second independent dictionary entry so the cursor path is exercised.
  f.db.prepare('INSERT INTO ingredients(id,name) VALUES(?,?)').run(randomUUID(),'{"zh":"另一种盐"}');
  const page=(await get('/ingredients?limit=1')).json();assert.ok(page.nextCursor);
  const page2=(await get(`/ingredients?limit=1&cursor=${page.nextCursor}`)).json();assert.equal(page2.items.length,1);
  assert.notEqual(page.items[0].id,page2.items[0].id);
  assert.equal((await get(`/techniques?cursor=${page.nextCursor}`)).statusCode,400);
});

test('SQLite backup/restore includes new evidence tables and exact original bytes; replay survives restore',async t=>{
  const f=await fixture(t,{image:true}), result=f.apply();
  const target=join(f.root,'backup'), restored=join(f.root,'restored');
  const manifest=await createBackup({dataDir:f.dataDir,targetDir:target});
  assert.equal(manifest.database.schemaVersion,6);assert.equal(manifest.database.counts.legacy_imports,1);
  assert.equal(manifest.database.counts.legacy_files,5);assert.equal(manifest.database.counts.techniques,1);
  await restoreBackup({bundleDir:target,targetDir:restored});
  const {db}=openDatabase(join(restored,'knowledge.sqlite'));
  try {
    assert.deepEqual(importLegacyBundle({db,uploadsDir:join(restored,'uploads'),bundle:f.bundle()}),{...result,replayed:true});
    assert.deepEqual(Buffer.from(db.prepare('SELECT raw_bytes FROM legacy_files WHERE path=?').get('data/dishes/first.json').raw_bytes),await readFile(join(f.sourceDir,'dishes','first.json')));
  } finally {db.close();}
});

test('raw decimal exponent is expanded without rounding; zero and oversized values are rejected',async t=>{
  const f=await fixture(t), path=join(f.sourceDir,'dishes','first.json'), raw=await readFile(path,'utf8');
  await writeFile(path,raw.replace(precise,'1.234567890123456789e-3'));
  const result=f.apply(), first=f.repo.detail(result.recipes.find(r=>r.legacyId==='first').id);
  assert.equal(first.recipe.ingredients[0].amount.value,'0.001234567890123456789');
  for(const invalid of ['0','1e-100']){
    await writeFile(path,raw.replace(precise,invalid));
    const bundle=readLegacyBundle({sourceDir:f.sourceDir,namespace:`bad-${invalid==='0'?'zero':'huge'}`,revision});
    assert.throws(()=>importLegacyBundle({db:f.db,uploadsDir:f.uploadsDir,bundle}),e=>e.code==='INVALID_LEGACY_IMPORT');
  }
  assert.equal(count(f.db,'legacy_imports'),1);
});

test('CLI inventory opens no database and refuses symlink input; applied import is repeatable',async t=>{
  const f=await fixture(t);
  const args=['--source',f.sourceDir,'--revision',revision,'--namespace',namespace];
  assert.equal(runImport(args).mode,'inventory');assert.equal(count(f.db,'legacy_imports'),0);
  const apply=[...args,'--db',join(f.dataDir,'knowledge.sqlite'),'--apply'];
  assert.equal(runImport(apply).replayed,false);assert.equal(runImport(apply).replayed,true);
  const linked=join(f.root,'linked-data');await symlink(f.sourceDir,linked);
  assert.throws(()=>readLegacyBundle({sourceDir:linked,namespace,revision}),/符号链接/);
  const entry=join(f.root,'import-current.mjs');await symlink(fileURLToPath(new URL('../../scripts/import-legacy.mjs',import.meta.url)),entry);
  const run=await promisify(execFile)(process.execPath,[entry,...args]);
  assert.equal(JSON.parse(run.stdout).mode,'inventory');
});

test('001 database upgrades additively and its old backup remains restorable',async t=>{
  const root=await mkdtemp(join(await realpath(tmpdir()),'kb-upgrade-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const oldMigrations=join(root,'old-migrations'), dataDir=join(root,'data');
  await mkdir(oldMigrations);await mkdir(join(dataDir,'uploads'),{recursive:true});
  const originalDDL=await readFile(new URL('../../db/001_core.sql',import.meta.url));
  await writeFile(join(oldMigrations,'001_core.sql'),originalDDL);
  const old=openDatabase(join(dataDir,'knowledge.sqlite'),oldMigrations), id=randomUUID();
  old.db.prepare('INSERT INTO recipes(id,title) VALUES(?,?)').run(id,'{"zh":"升级前的资料"}');
  old.db.close();
  const backup=join(root,'old-backup');
  const manifest=await createBackup({dataDir,targetDir:backup});
  assert.equal(manifest.database.schemaVersion,1);assert.equal('legacy_imports' in manifest.database.counts,false);
  const upgraded=openDatabase(join(dataDir,'knowledge.sqlite'));
  try{
    assert.equal(upgraded.schemaVersion,6);
    assert.equal(upgraded.db.prepare('SELECT title FROM recipes WHERE id=?').get(id).title,'{"zh":"升级前的资料"}');
    assert.equal(count(upgraded.db,'legacy_imports'),0);
    assert.equal(upgraded.db.prepare('SELECT sha256 FROM schema_migrations WHERE version=1').get().sha256,createHash('sha256').update(originalDDL).digest('hex'));
  }finally{upgraded.db.close();}
  const restored=join(root,'restored');await restoreBackup({bundleDir:backup,targetDir:restored});
  const reopened=openDatabase(join(restored,'knowledge.sqlite'));
  try{assert.equal(reopened.schemaVersion,6);assert.equal(count(reopened.db,'recipes'),1);}finally{reopened.db.close();}
});
