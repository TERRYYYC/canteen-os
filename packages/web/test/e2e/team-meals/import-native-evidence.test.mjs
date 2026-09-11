/** Checks of Q's newly operated native 6bb journey. This test does not drive a browser. */
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createPageFixture} from './page-fixture.mjs';
const root=fileURLToPath(new URL('../../../../../',import.meta.url));
const dir=join(root,'docs/field-test/team-meals/page-repair-6bb');
const json=async name=>JSON.parse(await readFile(join(dir,name),'utf8'));
const dom=name=>readFile(join(dir,name+'.txt'),'utf8');
const ledger=await json('ledger.json');
const row=id=>ledger.requests.find(r=>r.id===id);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const counts=text=>[...text.matchAll(/spinbutton "份数（选填）"(?: \[active\])?(?:: "([^"]*)")?/g)].map(m=>m[1]??'');

test('native import source custody binds approved 6bb and a fresh fixed history',async()=>{
  const metadata=await json('source-integrity.json');assert.deepEqual(metadata,ledger.metadata);
  assert.equal(metadata.head,'9084fcc64689ddb66ef925d97b0e2e4a40433233');
  assert.equal(metadata.approvedProduction,'6bb1ce916c9b4117b6e03db23a78a5d0b9724a10');
  assert.equal(metadata.approvedProductionPackagesTree,'38957ad074a6b7d102e730023613c9a5bb153ed7');
  assert.equal(metadata.node,'v20.20.2');assert.equal(metadata.fixedAt,'2026-09-10T00:00:00.000Z');
  assert.equal(metadata.fixtureRevision,'ab3f584656e1c85cad51a0ac3f6193fa2ff5f21d');
  assert.equal(metadata.sourceIntegrity.length,58);
  for(const source of metadata.sourceIntegrity)for(const ref of [metadata.head,metadata.approvedProduction])assert.equal(sha(execFileSync('git',['show',`${ref}:${source.file}`],{cwd:root})),source.sha256,source.file);
  assert.deepEqual(metadata.htmlChanges,['fixed-date/public-test-token bootstrap','remove external font links for offline isolation']);
  const old=JSON.parse(await readFile(join(root,'docs/field-test/team-meals/page-browser/ledger-842-page-run.json')));
  assert.deepEqual(row(3).body,old.requests.find(r=>r.id===39).body,'same saved whole plan before original failure');
  assert.equal(row(3).response.commit,'9203f8c29ad0a532699907e92da931f6a20b5a61');
  assert.notEqual(row(3).response.commit,old.requests.find(r=>r.id===39).response.commit,'new history is not the old 6f479 history');
});

test('original eleven-serving draft, scope and raw input survive imports and language changes',async()=>{
  assert.deepEqual(counts(await dom('T01-import-unrelated-edit-before')),['11','']);
  const after=await dom('T01-import-unrelated-edit-lost');assert.deepEqual(counts(after),['11','']);
  assert.match(after,/option "一天" \[selected\]/);assert.match(after,/有未保存的修改/);
  assert.match(await dom('T01-import-unrelated-input'),/2026-09-15 午 第一道样本菜/);
  assert.deepEqual(counts(await dom('T01-import-unrelated-all-dates')),['11','','','2','']);
  const initial=await json('ledger-original-repro-checkpoint.json');
  assert.equal(initial.requests.length,5);assert.deepEqual(initial.requests,ledger.requests.slice(0,5));
  assert.deepEqual(initial.requests.filter(r=>r.method==='POST').map(r=>r.id),[3]);
  assert.deepEqual(counts(await dom('T01-invalid-after-sort')),['','13.7','','','2','']);
  assert.deepEqual(counts(await dom('T01-matched-omitted-keeps-invalid')),['','13.7','','','2','']);
  for(const lang of ['en','uk'])assert.match(await dom(`T01-invalid-language-${lang}`),/"13\.7"/);
  assert.match(await dom('T01-invalid-after-sort'),/button "保存计划" \[disabled\]/);
  assert.deepEqual(counts(await dom('T01-explicit-seven-keeps-other-edits')),['','7','','2','','']);
  assert.deepEqual(counts(await dom('T01-explicit-blank-keyboard')),['','7','','','','']);
  assert.match(await dom('T01-explicit-clear-preview'),/清空|移除/);
  assert.deepEqual(counts(await dom('T01-explicit-clear-applied')),['','','','','','']);
});

test('imports send no POST and late real ACK preserves the seventh later meal and original locks',async()=>{
  assert.equal(ledger.requests.length,11);
  assert.deepEqual(ledger.requests.filter(r=>r.method==='POST').map(r=>r.id),[3,6,8]);
  assert.deepEqual(ledger.requests.filter(r=>r.path.startsWith('/source/')).map(r=>r.id),[1,10]);
  for(const [id,prior] of [[3,1],[6,3],[8,6]]){
    assert.equal(row(id).status,200);assert.equal(row(id).ifMatch,row(prior).response.blobSha);
    assert.equal(row(id).ifNoneMatch,null);
  }
  assert.deepEqual(ledger.controls,[{action:'hold-next',path:'/plan/team-week'},{action:'release'}]);
  assert.equal(row(6).held,true);assert.equal(row(6).released,true);assert.notEqual(row(6).dropped,true);
  assert.equal(row(6).body.meals.length,6);assert.ok(row(6).body.meals.every(m=>m.date!=='2026-09-17'));
  const pending=await dom('T07-import-before-old-ack');assert.match(pending,/正在保存，可继续编辑/);assert.match(pending,/2026-09-17 · 午餐/);
  const after=await dom('T07-import-after-old-ack');assert.match(after,/有未保存的修改/);assert.match(after,/2026-09-17 · 午餐/);assert.ok(after.includes(row(6).response.commit.slice(0,8)));
  assert.equal(row(8).body.meals.length,7);assert.equal(row(8).body.meals[6].date,'2026-09-17');
});

test('whole imported plan preserves add/remove, deliberate empty counts and metadata through day-save and reload',async()=>{
  const final=row(8).body;
  assert.deepEqual(final.name,row(3).body.name);
  assert.deepEqual(final.dateRange,{start:'2026-09-07',end:'2026-09-17'});
  assert.deepEqual(final.meals.map(m=>[m.date,m.mealType,m.dishRef]),[
    ['2026-09-13','dinner','first-dish'],['2026-09-14','lunch','first-dish'],
    ['2026-09-15','breakfast','first-dish'],['2026-09-15','lunch','first-dish'],
    ['2026-09-15','dinner','name-only'],['2026-09-16','breakfast','first-dish'],['2026-09-17','lunch','first-dish'],
  ]);
  assert.ok(final.meals.every(m=>!Object.hasOwn(m,'plannedServings')));
  assert.match(await dom('T01-final-day-filter-before-save'),/option "一天" \[selected\]/);
  assert.equal(counts(await dom('T01-final-day-filter-before-save')).length,1);
  assert.deepEqual(row(10).response.content,final);assert.equal(row(10).response.commit,row(8).response.commit);
  assert.equal((await json('T01-final-visible-rows.json')).length,7);
  assert.equal(counts(await dom('T01-final-source-reloaded')).length,7);
  const fixture=createPageFixture();after(()=>rm(fixture.root,{recursive:true,force:true}));
  assert.deepEqual(Object.keys(ledger.files).sort(),Object.keys(fixture.files).sort());
  for(const [file,bytes] of Object.entries(fixture.files))if(file!=='data/menu-plans/team-week.json')assert.equal(ledger.files[file].sha256,sha(bytes),file);
  assert.deepEqual(ledger.files['data/menu-plans/team-week.json'].json,final);
});
