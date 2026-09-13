/** Assertions over the frozen native 842 run. These checks do not rerun a browser. */
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createPageFixture} from './page-fixture.mjs';
import {PNG_B} from '../../../../worker/test/image-fixtures.mjs';
const root=fileURLToPath(new URL('../../../../../',import.meta.url));
const evidence=join(root,'docs/field-test/team-meals/page-browser');
const ledger=JSON.parse(await readFile(join(evidence,'ledger-842-page-run.json')));
const row=id=>{const value=ledger.requests.find(r=>r.id===id);assert.ok(value,`request ${id}`);return value;};
const item=(id,ref)=>row(id).body.items.find(i=>i.ingredientRef===ref);
const dom=name=>readFile(join(evidence,name+'.txt'),'utf8');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('native source custody binds actual Node20, 842 source and deterministic formal fixture',()=>{
  assert.equal(ledger.metadata.head,'842b778bd352c0dba8921584ce142d94665e5ca2');
  assert.equal(ledger.metadata.packagesTree,'dce6d72208652c80d2aa5b40865bef4a56732226');
  assert.equal(ledger.metadata.node,'v20.20.2');
  assert.equal(ledger.metadata.fixedAt,'2026-09-10T00:00:00.000Z');
  assert.equal(ledger.metadata.fixtureRevision,'ab3f584656e1c85cad51a0ac3f6193fa2ff5f21d');
  assert.equal(ledger.metadata.producer.blocking,0);
  assert.ok(ledger.metadata.sourceIntegrity.length>=56);
  for(const source of ledger.metadata.sourceIntegrity)assert.equal(sha(execFileSync('git',['show',`${ledger.metadata.head}:${source.file}`],{cwd:root})),source.sha256,source.file);
  assert.equal(ledger.requests.length,52);
  assert.ok(ledger.requests.every(r=>!r.path.startsWith('/publish')&&!r.path.startsWith('/rollback')));
});

test('T01 day-filter save sends all four rows, no defaults; empty v3 creates and reloads',()=>{
  const first=row(3);assert.equal(first.status,200);assert.match(first.ifMatch,/^[a-f0-9]{40}$/);
  assert.equal(first.body.schemaVersion,'3');
  assert.deepEqual(first.body.meals.map(m=>[m.date,m.mealType,m.dishRef,m.plannedServings]),[
    ['2026-09-14','lunch','first-dish',undefined],['2026-09-14','lunch','second-dish',undefined],
    ['2026-09-15','dinner','name-only',2],['2026-09-15','breakfast','first-dish',undefined],
  ]);
  assert.equal(row(49).ifNoneMatch,'*');assert.equal(row(49).status,200);
  assert.deepEqual(row(49).body,{schemaVersion:'3',meals:[]});
  assert.deepEqual(row(51).response.content,{schemaVersion:'3',meals:[]});
  assert.equal(row(51).response.commit,row(49).response.commit);
});

test('T02/T04 all four IDs, scoped judgments, metadata preservation and two-stage demand rebase',()=>{
  assert.deepEqual(row(7).body.items,['cooking-oil','salt','tomato','tomato-other'].map(ingredientRef=>({ingredientRef,decision:'check'})));
  assert.deepEqual(row(7).body.basis.selection,[{menuPlanRef:'team-week',date:'2026-09-14',mealType:'lunch'}]);
  assert.equal(row(7).body.basis.sourceRevision,row(3).response.commit);assert.equal(row(7).ifNoneMatch,'*');
  assert.deepEqual(item(8,'tomato'),{ingredientRef:'tomato',decision:'buy',bought:true});
  assert.equal(item(8,'salt').decision,'available');
  assert.deepEqual(row(19).body.items,row(8).body.items,'metadata-only change retains all judgments');
  assert.notEqual(row(19).body.basis.sourceRevision,row(8).body.basis.sourceRevision);
  assert.equal(row(29).body.basis.sourceRevision,row(22).response.commit);
  assert.deepEqual(item(29,'tomato'),{ingredientRef:'tomato',decision:'check',previous:{basis:row(19).body.basis,decision:'buy',bought:true}});
  assert.deepEqual(item(29,'salt'),{ingredientRef:'salt',decision:'check',previous:{basis:row(19).body.basis,decision:'available'}});
  assert.deepEqual(item(30,'tomato'),{ingredientRef:'tomato',decision:'available'});
  for(const [current,prior] of [[8,7],[19,8],[29,19],[30,29]]){
    assert.equal(row(current).status,200);assert.equal(row(current).ifMatch,row(prior).response.blobSha);
  }
});

test('T07 conflict retains stale lock; unknown recovery reads current and pinned; late ACK preserves later input',async()=>{
  assert.equal(row(24).status,409);assert.equal(row(24).ifMatch,row(22).ifMatch);
  assert.equal(row(24).body.meals[0].plannedServings,5);
  assert.equal(row(31).status,200);assert.equal(row(31).dropped,true);assert.equal(row(31).body.meals[0].plannedServings,6);
  assert.equal(row(32).method,'GET');assert.equal(row(32).search,'');
  assert.equal(row(33).search,`?revision=${row(31).response.commit}`);
  assert.ok(ledger.requests.filter(r=>r.id>31&&r.id<35).every(r=>r.method==='GET'));
  assert.match(await dom('T07-unknown-verified-later-edit'),/Unsaved changes/);
  assert.match(await dom('T07-unknown-verified-later-edit'),/spinbutton "Servings \(optional\)": "7"/);
  assert.equal(row(35).held,true);assert.equal(row(35).released,true);
  assert.equal(row(39).held,true);assert.equal(row(39).released,true);assert.equal(row(39).status,200);
  assert.equal(row(39).body.meals[0].plannedServings,8);
  const late=await dom('T07-late-ack-success-later-draft');assert.match(late,/Unsaved changes/);assert.match(late,/spinbutton "Servings \(optional\)": "9"/);assert.ok(late.includes(row(39).response.commit.slice(0,8)));
});

test('T06 ingredient and technique assets use their exact historical revision and owner/index',()=>{
  const assets=ledger.requests.filter(r=>r.path==='/asset');assert.ok(assets.length>=4);
  const old=assets.filter(r=>new URLSearchParams(r.search).get('revision')===row(3).response.commit);
  assert.ok(old.some(r=>new URLSearchParams(r.search).get('owner')==='data/ingredients/tomato.json'));
  assert.ok(old.some(r=>new URLSearchParams(r.search).get('owner')==='data/techniques.json'&&new URLSearchParams(r.search).get('pointer')==='/1/image'));
  for(const r of old){assert.equal(r.status,200);assert.equal(r.responseSha256,'b1ff9c8ea3a780bad09b346c423d2d0e46815926879b18e841d928376a946640');assert.equal(r.responseHeaders['x-source-revision'],row(3).response.commit);}
  for(const r of [row(41),row(43)]){assert.equal(r.status,200);assert.equal(new URLSearchParams(r.search).get('revision'),row(22).response.commit);assert.equal(r.responseSha256,sha(PNG_B));}
});

test('T08 six main pages have actual three-language/two-size captures with no horizontal overflow',async()=>{
  const metrics=JSON.parse(await readFile(join(evidence,'responsive-metrics.json')));
  for(const page of ['plan','purchase','ingredient','dish','public-menu','prep'])for(const [size,width] of [['desktop',1440],['mobile',393]])for(const lang of ['zh','en','uk']){
    const name=`T08-${page}-${lang}-${size}`,m=metrics.find(m=>m.name===name);assert.ok(m,name);
    assert.equal(m.viewport,width,name);assert.equal(m.width,width,name);assert.equal(m.lang,lang==='zh'?'zh-Hans':lang,name);
    if(page==='plan')assert.equal(m.inputs.find(i=>i.type==='number').value,'9',name);
    if(page==='purchase')for(const id of ['tomato','tomato-other','salt','cooking-oil'])assert.ok((await dom(name)).includes(`ingredient%2F${id}`),name+id);
  }
});

test('T04 complete final repository differs only in explicitly exercised fixture paths',async()=>{
  const fixture=createPageFixture();after(()=>rm(fixture.root,{recursive:true,force:true}));
  const changed=['data/menu-plans/team-week.json','data/ingredients/tomato.json','data/ingredients/pattern.png'];
  for(const [file,bytes] of Object.entries(fixture.files))if(!changed.includes(file))assert.equal(ledger.files[file].sha256,sha(bytes),file);
  assert.deepEqual(Object.keys(ledger.files).filter(file=>!Object.hasOwn(fixture.files,file)).sort(),['data/menu-plans/empty-check.json','data/shopping-lists/page-shop.json']);
  assert.equal(ledger.files['data/menu-plans/team-week.json'].json.meals[0].plannedServings,8);
  assert.deepEqual(ledger.files['data/shopping-lists/page-shop.json'].json,row(30).body);
});
