/** Assertions over Q's native 5049 repair replay; this file does not drive a browser. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../../../../',import.meta.url));
const dir=join(root,'docs/field-test/team-meals/page-repair-5049');
const json=async name=>JSON.parse(await readFile(join(dir,name),'utf8'));
const text=name=>readFile(join(dir,name),'utf8');
const ledger=await json('ledger.json');
const old=JSON.parse(await readFile(join(root,'docs/field-test/team-meals/page-browser/ledger-842-page-run.json')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const basis='9d2e93483b9d16ab6f2e66161b1bcb337c20cedc';

test('repair native custody binds approved production and exactly reproduces original lunch writes',async()=>{
  const metadata=await json('source-integrity.json');
  assert.deepEqual(metadata,ledger.metadata);
  assert.equal(metadata.head,'862ab0980d09493b92c5554768f05599ce925444');
  assert.equal(metadata.approvedProduction,'5049f0a47c76c4149a91a288a6a9b6edf279b1ea');
  assert.equal(metadata.approvedProductionPackagesTree,'b0407a1b761561f03aa07d66a5c6b003687458c8');
  assert.equal(metadata.node,'v20.20.2');
  assert.equal(metadata.fixtureRevision,old.metadata.fixtureRevision);
  assert.equal(metadata.fixedAt,old.metadata.fixedAt);
  assert.equal(metadata.sourceIntegrity.length,57);
  for(const source of metadata.sourceIntegrity)for(const ref of [metadata.head,metadata.approvedProduction])assert.equal(sha(execFileSync('git',['show',`${ref}:${source.file}`],{cwd:root})),source.sha256,source.file);
  const controls=execFileSync('git',['show','f33dd42f1033073329d12579783d470e89dec00d:docs/field-test/team-meals-pages/q-ui-t08-01-browser/copy-controls.js'],{cwd:root});
  assert.equal(sha(controls),metadata.clipboardControlSha256);
  assert.equal(ledger.requests.length,9);
  assert.deepEqual(ledger.requests.filter(r=>r.method==='POST').map(r=>r.id),[3,7,8]);
  for(const id of [3,7,8]){
    const actual=ledger.requests.find(r=>r.id===id),prior=old.requests.find(r=>r.id===id);
    for(const key of ['method','path','search','body','ifMatch','ifNoneMatch','status','response','responseSha256','responseHeaders'])assert.deepEqual(actual[key],prior[key],`${id}:${key}`);
  }
  assert.deepEqual(ledger.requests[6].body.basis,{sourceRevision:basis,selection:[{menuPlanRef:'team-week',date:'2026-09-14',mealType:'lunch'}]});
  assert.deepEqual(ledger.controls,[{action:'change-metadata'}]);
  assert.equal(ledger.requests[8].response.commit,'c3d9f2299e7ca0a19899737063dcf727aa37ea27');
  assert.deepEqual(ledger.files['data/shopping-lists/page-shop.json'].json,ledger.requests[7].body);
});

test('original lunch native success, readonly fallback and A-after-B copies agree in all three languages',async()=>{
  const labels={
    zh:{source:'使用来源:',row:'计划行',component:'配料项',missing:['计划份数未录','配方基准份数未录','原用量未录','采购规格未录','菜谱待完善'],taste:'适量'},
    en:{source:'Used in:',row:'Plan row',component:'Recipe item',missing:['Planned servings missing','Recipe servings missing','Recipe quantity missing','Purchase specification missing','Recipe is not active'],taste:'To taste'},
    uk:{source:'Використовується в:',row:'Рядок плану',component:'Складник рецепта',missing:['Порції в плані не вказано','Порції рецепта не вказано','Кількість рецепта не вказано','Закупівельні параметри не записано','Рецепт ще не активний'],taste:'За смаком'},
  };
  for(const [lang,l] of Object.entries(labels)){
    const value=await text(`T08-original-lunch-native-${lang}.txt`);
    assert.equal(value,await text(`T08-original-lunch-fallback-${lang}.txt`));
    assert.equal(value,await text(`T08-bound-A-unapplied-B-native-${lang}.txt`));
    assert.ok(value.includes(basis));assert.ok(!value.includes('name-only'));assert.ok(!value.includes('2026-09-15'));
    for(const id of ['cooking-oil','salt','tomato','tomato-other'])assert.ok(value.includes(`[${id}]`));
    for(const gap of l.missing)assert.ok(value.includes(gap),`${lang}:${gap}`);
    const sources=value.split('\n').filter(line=>line.trimStart().startsWith(l.source));
    assert.equal(sources.length,6,lang);
    for(const [dish,row,component] of [['first-dish',1,1],['first-dish',1,2],['first-dish',1,3],['second-dish',2,1],['second-dish',2,2],['second-dish',2,3]])assert.equal(sources.filter(s=>s.includes(`[${dish}]`)&&s.includes(`${l.row}: ${row}`)&&s.includes(`${l.component}: ${component}`)).length,1,`${lang}:${dish}:${component}`);
    for(const quantity of ['300 g','200 g','20 ml'])assert.ok(sources.some(s=>s.includes(quantity)));
    assert.equal(sources.filter(s=>s.includes(l.taste)).length,2);
  }
});

test('mobile copy evidence records business widths separately from overflowing test controls',async()=>{
  const m=await json('mobile-metrics-detailed.json');
  assert.equal(m.innerWidth,393);assert.equal(m.innerHeight,852);assert.equal(m.lang,'uk');
  assert.equal(m.main.scrollWidth,m.main.clientWidth);assert.equal(m.main.clientWidth,393);
  assert.equal(m.manualCopy.scrollWidth,m.manualCopy.clientWidth);
  assert.ok(m.testControlPanel.scrollWidth>m.testControlPanel.clientWidth);
  assert.ok(m.documentScrollWidth>m.innerWidth,'this harness screenshot is not evidence of whole-document no-overflow');
});
