import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../../apps/api/database.mjs';
import {createBackup,verifyBackup,restoreBackup} from '../../scripts/sqlite-ops.mjs';
// Official 0291f9b backup-v1 count inventory: schema 3/4 already existed,
// but that producer reported exactly base + integration tables (16 keys).
const legacy=['recipes','ingredients','recipe_ingredients','recipe_steps','assets','sources','recipe_sources','recipe_assets','recipe_revisions','write_receipts','legacy_imports','legacy_files','legacy_bindings','ingredient_knowledge','techniques','legacy_recipe_evidence'];
for(const version of [3,4])test(`official legacy schema${version} inventory restores; partial or false counts reject`,async t=>{
 const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'kb-legacy-backup-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const data=join(root,'data'),migrations=join(root,'migrations');await fs.mkdir(migrations);await fs.mkdir(join(data,'uploads'),{recursive:true});
 const source=fileURLToPath(new URL('../../db/',import.meta.url));for(const name of await fs.readdir(source))if(Number(name.slice(0,3))<=version)await fs.copyFile(join(source,name),join(migrations,name));
 const {db}=openDatabase(join(data,'knowledge.sqlite'),migrations);db.close();
 const bundle=join(root,'backup');const manifest=await createBackup({dataDir:data,targetDir:bundle});
 const legacyManifest=structuredClone(manifest);legacyManifest.database.counts=Object.fromEntries(legacy.map(key=>[key,manifest.database.counts[key]]));
 const save=value=>fs.writeFile(join(bundle,'manifest.json'),JSON.stringify(value));await save(legacyManifest);
 assert.deepEqual((await verifyBackup(bundle)).database.counts,legacyManifest.database.counts);
 await restoreBackup({bundleDir:bundle,targetDir:join(root,'restored')});
 const partial=structuredClone(legacyManifest);delete partial.database.counts.recipes;await save(partial);await assert.rejects(verifyBackup(bundle),/count mismatch/);
 const falseCount=structuredClone(legacyManifest);falseCount.database.counts.recipes++;await save(falseCount);await assert.rejects(verifyBackup(bundle),/count mismatch/);
 const full=structuredClone(manifest);full.database.counts.favorite_candidates++;await save(full);await assert.rejects(verifyBackup(bundle),/count mismatch/);
 await save(manifest);await verifyBackup(bundle);
});
test('current schema inventory cannot use the legacy abbreviated counts',async t=>{
 const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'kb-current-backup-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const data=join(root,'data');await fs.mkdir(join(data,'uploads'),{recursive:true});const {db}=openDatabase(join(data,'knowledge.sqlite'));db.close();const bundle=join(root,'backup'),manifest=await createBackup({dataDir:data,targetDir:bundle});manifest.database.counts=Object.fromEntries(legacy.map(key=>[key,manifest.database.counts[key]]));await fs.writeFile(join(bundle,'manifest.json'),JSON.stringify(manifest));await assert.rejects(verifyBackup(bundle),/count mismatch/);
});
