/** T03: real source-save warning vs formal publication blocking. No browser claim. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createPageFixture,json,fixedAt} from './page-fixture.mjs';
import {WORKER,TOKENS,gitBlobSha} from '../../../../worker/test/helpers.mjs';
import {runBuild} from '../../../../../scripts/build-data.mjs';
const worker=(await import(WORKER)).default;

for(const kind of ['dish','ingredient'])test(`T03 missing ${kind}: save warns, collection is unresolved, publication retains old bytes`,async t=>{
  const f=createPageFixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  const file=kind==='dish'?'data/menu-plans/team-week.json':'data/dishes/first-dish.json';
  const body=JSON.parse(f.files[file]);
  if(kind==='dish')body.meals.push({date:'2026-09-14',mealType:'lunch',dishRef:'missing-dish'});
  else body.components[0].ingredientRef='missing-ingredient';
  const route=kind==='dish'?'/plan/team-week':'/dish/first-dish';
  const response=await worker.fetch(new Request(`https://worker.example.invalid${route}`,{method:'POST',headers:{Authorization:`Bearer ${TOKENS.chef}`,'Content-Type':'application/json','If-Match':gitBlobSha(f.files[file])},body:JSON.stringify(body)}),f.env);
  const reply=await response.json();
  assert.equal(response.status,200,JSON.stringify(reply));
  assert.ok(reply.warnings.includes('dangling-ref'));
  assert.deepEqual(JSON.parse(f.repo.fileText(file)),body);
  // Materialize precisely that body in a real isolated Git commit for the producer.
  await writeFile(join(f.root,file),json(body));
  const git=args=>execFileSync('git',args,{cwd:f.root,encoding:'utf8',env:{...process.env,GIT_AUTHOR_DATE:fixedAt,GIT_COMMITTER_DATE:fixedAt}}).trim();
  git(['add',file]);git(['-c','user.name=RC-Q local fixture','-c','user.email=rcq-fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m',`T03 unresolved ${kind}`]);
  const revision=git(['rev-parse','HEAD']);
  const oldManifest=await readFile(join(f.publicDir,'build.json'));
  const oldProjection=await readFile(join(f.publicDir,'team-meals/team-week.json'));
  const built=runBuild({root:f.root,outDir:f.publicDir,commit:revision,target:'team-meals',at:fixedAt,write:true});
  assert.ok(built.issues.some(i=>i.kind==='error'&&i.code===`missing-${kind}`));
  assert.equal(built.sheets['team-week'].teamMeals.collection.coverage.references,'unresolved');
  assert.ok(built.sheets['team-week'].teamMeals.collection.items.length>=4);
  assert.deepEqual(built.written,[]);
  assert.deepEqual(await readFile(join(f.publicDir,'build.json')),oldManifest);
  assert.deepEqual(await readFile(join(f.publicDir,'team-meals/team-week.json')),oldProjection);
  t.diagnostic(JSON.stringify({layer:'real Worker + formal producer, isolated Git/FakeRepo',kind,revision,workerStatus:response.status,warnings:reply.warnings,blocking:built.issues.filter(i=>i.kind==='error')}));
});
