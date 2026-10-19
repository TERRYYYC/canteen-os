// node --test skills/video-recipe-ingest/scripts/fill-sheet.test.mjs — made-up fixtures only; no private data needed.
// Regenerate the committed sample after changing the script (from the repository root):
//   node skills/video-recipe-ingest/scripts/fill-sheet.mjs --results skills/video-recipe-ingest/fixtures/fill-sheet/batch-b/RESULTS.md \
//     --ids skills/video-recipe-ingest/fixtures/fill-sheet/ids.txt --groups skills/video-recipe-ingest/fixtures/fill-sheet/groups.json \
//     --out skills/video-recipe-ingest/fixtures/fill-sheet/sample.html
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCandidates, classifyGap, isPlainAmount, suggest, ownersOf, buildSheets, readReference, renderHtml, cutNames } from './fill-sheet.mjs';
import { buildCatalog } from '../../../docs/design/ingredient-catalog/catalog-stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, '../fixtures/fill-sheet');
const RESULTS = path.join(FIXTURE, 'batch-b/RESULTS.md');
const IDS = readFileSync(path.join(FIXTURE, 'ids.txt'), 'utf8').split(/\s+/).filter(Boolean);
const groups = JSON.parse(readFileSync(path.join(FIXTURE, 'groups.json'), 'utf8'));
const allTechniques = JSON.parse(readFileSync(path.join(HERE, '../../../data/techniques.json'), 'utf8'));
const techniques = cutNames(allTechniques);
const sheets = () => buildSheets(readCandidates(RESULTS, IDS), groups);
const row = (quantityState, rawQuantity, normalizedQuantity = null) => ({ quantityState, rawQuantity, normalizedQuantity });
const fillCells = html => [...html.matchAll(/<td class="fill[^"]*">([\s\S]*?)<\/td>/g)].map(match => match[1]);

test('reads the listed candidates in the given order, falling back to the sibling batch for moved links', () => {
  const dishes = readCandidates(RESULTS, IDS);
  assert.deepEqual(dishes.map(dish => dish.id), ['900000000000000002', '900000000000000001']);
  assert.equal(dishes[1].candidate.title, '示例菜乙（造的数据）');
  assert.throws(() => readCandidates(RESULTS, ['900000000000000009']), /找不到这些作品：900000000000000009/);
  assert.throws(() => readCandidates(RESULTS, ['900000000000000003']), /不是菜谱候选/);
});

test('sorts each gap into the four kinds and guesses nothing', () => {
  assert.equal(classifyGap(row('not_stated', null)), 1);
  assert.equal(classifyGap(row('stated', null)), 2);
  assert.equal(classifyGap(row('stated', '  ')), 2);
  for (const raw of ['500克', '2斤', '二斤', '一斤六两', '两斤半', '1.5克', '300 g', '3个', '18克（视频内配方）']) assert.equal(classifyGap(row('stated', raw)), 3, raw);
  for (const raw of ['一勺', '半勺', '各5克', '大概500克', '300-500克', '两斤多', '35克 / 38克', '35克（两值并列，待确认）', '料汁一勺；抓肉用量未说明', '两个大茴瓣']) assert.equal(classifyGap(row('stated', raw)), 4, raw);
  assert.equal(classifyGap(row('not_checked', null)), 4);
  assert.equal(classifyGap(row('not_checked', '500克')), 4);
  // stated_imprecise is never upgraded, even with a number in it (candidate-contract.md).
  assert.equal(classifyGap(row('stated_imprecise', '500克')), 4);
  assert.equal(classifyGap(row('stated_imprecise', '少许')), 4);
  assert.equal(classifyGap(row('not_stated', '500克')), 4);
  assert.equal(classifyGap(row('something_new', null)), 4);
  assert.equal(classifyGap(row('stated', '200克', { value: 200, unit: 'g' })), 0);
  assert.equal(isPlainAmount('一勺'), false);
});

test('suggests a standard ingredient only on an exact name match without parse notes', () => {
  const owners = ownersOf(groups);
  assert.deepEqual(suggest('鸡腿肉', owners).names, ['去骨鸡腿肉']);
  assert.equal(suggest('鸡腿肉', owners).section, 'main');
  assert.deepEqual(suggest('盐（煮料）', owners).names, ['食盐']);
  assert.equal(suggest('鸡腿', owners).kind, 'none');
  assert.deepEqual(suggest('盐、糖', owners).names, ['食盐', '白糖']);
  const identify = suggest('葱', owners);
  assert.equal(identify.kind, 'identify');
  assert.equal(identify.section, 'unsure');
  const doubtful = suggest('红色酱料（画面所见，名称待核）', owners);
  assert.deepEqual([doubtful.names, doubtful.doubt], [['豆瓣酱'], true]);
  assert.equal(suggest('盐（煮料）', owners).doubt, false);
  assert.equal(suggest('水', owners).section, 'other');
  assert.equal(suggest('料汁', owners).section, 'other');
});

test('marks 名称待核 exactly where the catalog marks †', () => {
  const dishes = readCandidates(RESULTS, IDS);
  const catalog = buildCatalog(dishes.map(({ id, candidate }) => ({ id, names: candidate.ingredients.map(item => item.name) })), groups);
  const dagger = new Set(catalog.entries.flatMap(entry => [...entry.doubt]));
  const owners = ownersOf(groups);
  for (const { candidate } of dishes) for (const { name } of candidate.ingredients) {
    const s = suggest(name, owners);
    if (s.kind !== 'none') assert.equal(s.doubt, dagger.has(s.base), name);
  }
});

test('prints one page per dish with every row, the original wording and 没说, and no filled-in numbers', () => {
  const html = renderHtml(sheets(), { techniques });
  assert.equal(html.match(/<section class="page/g).length, 3);
  for (const { candidate } of readCandidates(RESULTS, IDS)) {
    for (const item of candidate.ingredients) {
      assert.ok(html.includes(`<b>${item.name}</b>`), item.name);
      if (item.rawQuantity) assert.ok(html.includes(`<span class="tag">原方</span>${item.rawQuantity}`), item.rawQuantity);
    }
  }
  assert.match(html, /<td><b>葱<\/b>[\s\S]*?<\/td><td>没说<\/td>/);
  // Every canteen cell is blank: no digit anywhere in them, so 少许 or 500克 never turns into a number.
  const cells = fillCells(html);
  assert.equal(cells.length, 13 * 4);
  for (const cell of cells) assert.doesNotMatch(cell, /\d/);
  assert.doesNotMatch(html, /同类菜常见范围/);
});

test('leaves blanks for exactly the minimum fields of ADR-0012', () => {
  const html = renderHtml(sheets(), { techniques });
  for (const field of ['每份净料', '或毛料', '净料率', '每个多少克', '对应的标准食材（建议）', '切法', '大小', '时机', '提前多久']) assert.ok(html.includes(field), field);
  assert.match(html, /份数：按每份记，写 1/);
  for (const unit of ['g', 'ml', '个']) assert.ok(html.includes(`<i class="box"></i>${unit}</span>`), unit);
  for (const label of ['称', '定', '规', '前一天', '当天早上', '开餐前', '分钟', '小时', '天', '不用切']) assert.ok(html.includes(`<i class="box"></i>${label}</span>`), label);
  for (const name of techniques) assert.ok(html.includes(`<i class="box"></i>${name}</span>`), name);
  // Only cuts: pretreatment and cooking techniques are not a 切法.
  for (const technique of allTechniques.filter(t => t.kind !== 'cut')) assert.ok(!html.includes(`<i class="box"></i>${technique.name.zh}</span>`), technique.name.zh);
  assert.doesNotMatch(html, /火候 <span class="blank|做多久 <span class="blank/);
  // Prep blanks only for main and not-yet-identified rows; water and homemade rows need no yield.
  assert.equal(html.match(/<tr class="prep"><td><\/td><td colspan="8"><b>备料/g).length, 2 + 2 + 2);
  assert.equal(html.match(/<td class="fill na">不用填<\/td>/g).length, 4);
});

test('routes ②③ to the parser (#159) and leaves ①④ to the chef', () => {
  const html = renderHtml(sheets(), { techniques });
  const gapCells = [...html.matchAll(/<td class="gap g(\d)">([\s\S]*?)<\/td>/g)];
  for (const [, kind, text] of gapCells) {
    if (kind === '2' || kind === '3') assert.match(text, /归修解析（#159）/);
    if (kind === '1' || kind === '4') assert.match(text, /留给师傅/);
  }
  assert.deepEqual(sheets()[0].gaps, [0, 4, 1, 2, 4]);
  assert.deepEqual(sheets()[1].gaps, [1, 0, 0, 1, 0]);
});

test('lists what the dish leaves unclear: servings, step unknowns and whole-dish unresolved', () => {
  const html = renderHtml(sheets(), { techniques });
  assert.match(html, /<b>第 1 步<\/b><span class="step">鸡腿肉加料酒抓匀，腌一会儿。<\/span><br>没说清：腌多久没说。/);
  assert.doesNotMatch(html, /<b>第 3 步<\/b>/);
  assert.match(html, /<b>整道菜<\/b>：做几个人吃的量没说/);
  assert.match(html, /<b>份数<\/b>：视频没说。/);
  assert.match(html, /<b>份数<\/b>：原方「两三个人吃」，只作参考，不从这里推份数。/);
});

test('prints the reference column only when asked, with where its numbers come from', () => {
  const reference = readReference(path.join(FIXTURE, 'reference.json'));
  const html = renderHtml(sheets(), { techniques, reference });
  assert.match(html, /<th>同类菜常见范围（仅供参考）<\/th>/);
  assert.match(html, /去骨鸡腿肉 11–22 g/);
  assert.match(html, /数是从哪来的：造的数据，只用来测试这一栏怎么印/);
  for (const cell of fillCells(html)) assert.doesNotMatch(cell, /\d/);
  const dir = mkdtempSync(path.join(tmpdir(), 'fill-sheet-'));
  const write = (name, value) => { writeFileSync(path.join(dir, name), JSON.stringify(value)); return path.join(dir, name); };
  assert.throws(() => readReference(write('a.json', { ranges: {} })), /source/);
  assert.throws(() => readReference(write('b.json', { source: 'x', ranges: { 生抽: { min: 5, max: 3, unit: 'ml' } } })), /min ≤ max/);
  assert.throws(() => readReference(write('c.json', { source: 'x', ranges: { 生抽: { min: 3, max: 5, unit: '勺' } } })), /单位/);
});

test('the CLI writes the sheet and exits 0; bad arguments exit 2', () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'fill-sheet-')), 'sheet.html');
  const script = path.join(HERE, 'fill-sheet.mjs');
  const ok = spawnSync(process.execPath, [script, '--results', RESULTS, '--ids', path.join(FIXTURE, 'ids.txt'), '--groups', path.join(FIXTURE, 'groups.json'), '--out', out], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stderr, /共 2 道菜、13 样，缺口 ① 4 · ② 1 · ③ 3 · ④ 4/);
  assert.equal(readFileSync(out, 'utf8'), renderHtml(sheets(), { techniques }));
  assert.equal(spawnSync(process.execPath, [script, '--results', RESULTS], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [script, '--nope'], { encoding: 'utf8' }).status, 2);
});

test('the committed sample is current and carries no source links or machine paths', () => {
  const sample = readFileSync(path.join(FIXTURE, 'sample.html'), 'utf8');
  assert.equal(sample, renderHtml(sheets(), { techniques }), 'regenerate sample.html with the command at the top of this file');
  assert.doesNotMatch(sample, /example\.invalid|source\.json|elsewhere|造的作者|\/Users\/|\/private\/|\/home\//);
});
