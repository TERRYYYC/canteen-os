// node --test docs/design/ingredient-catalog/catalog-stats.test.mjs — synthetic fixture only; no private data needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { baseName, readDishes, buildCatalog, renderMarkdown } from './catalog-stats.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'catalog-'));
  const batch = path.join(root, 'batch-b');
  const dish = (dir, id, names) => {
    mkdirSync(path.join(root, dir, id), { recursive: true });
    writeFileSync(path.join(root, dir, id, 'candidate.json'), JSON.stringify({ title: '不应出现的菜名', ingredients: names.map(name => ({ name })) }));
  };
  dish('batch-a', '101', ['盐（煮料）', '姜片', '水']);
  dish('batch-b', '102', ['盐', '盐、糖', '葱（身份待核）', '新料']);
  dish('batch-b', '103', ['不应统计']);
  writeFileSync(path.join(batch, 'RESULTS.md'), [
    '| 批次 / 原收藏 | 作品来源 · 作者 | 菜名/内容 | 分类 | 料/步/图 | 最终技术状态 | JSON 及采集 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    // An absolute link from another machine falls back to <batch>/<id> next to this batch.
    '| 1 / 1 | [101](https://example.invalid/101) · 某作者 | 菜一 | 菜谱候选 | 3/0/0 | 完成 | [来源](/elsewhere/batch-a/101/source.json) |',
    '| 2 / 2 | [102](https://example.invalid/102) · 某作者 | 菜二 | 菜谱候选 | 4/0/0 | 完成 | [来源](102/source.json) |',
    '| 3 / 3 | [103](https://example.invalid/103) · 某作者 | 合集 | 非菜谱 | 0/0/0 | 完成 | [来源](103/source.json) |',
  ].join('\n'));
  return path.join(batch, 'RESULTS.md');
}

const groups = { entries: [
  { kind: 'standard', name: '食盐', role: 'seasoning', members: ['盐', '盐、糖', '咸盐'] },
  { kind: 'standard', name: '白糖', role: 'seasoning', members: ['盐、糖'] },
  { kind: 'standard', name: '生姜', role: 'main', members: ['姜片'] },
  { kind: 'water', name: '水', members: ['水'] },
  { kind: 'identify', name: '葱（大葱还是小葱）', members: ['葱'] },
] };

test('strips parse notes from names', () => {
  assert.equal(baseName('盐（煮料）'), '盐');
  assert.equal(baseName('鸡 (原片称呼)'), '鸡');
});

test('reads recipe candidates only and counts dishes, rows, splits and doubt marks', () => {
  const dishes = readDishes(fixture());
  assert.deepEqual(dishes.map(d => d.id), ['101', '102']);
  const catalog = buildCatalog(dishes, groups, new Set(['101']));
  const entry = name => catalog.entries.find(e => e.name === name);
  assert.equal(catalog.rows, 7);
  assert.equal(entry('食盐').dishes.size, 2);
  assert.equal(entry('食盐').rows.size, 3);
  assert.equal(entry('食盐').focus.size, 1);
  assert.equal(entry('白糖').rows.size, 1);
  assert(catalog.split.has('盐、糖'));
  assert(entry('葱（大葱还是小葱）').doubt.has('葱'));
  assert.deepEqual([...catalog.unmapped.keys()], ['新料']);
  assert.deepEqual(catalog.stale, ['咸盐']);
});

test('renders names and counts without titles, authors or links', () => {
  const text = renderMarkdown(buildCatalog(readDishes(fixture()), groups, null));
  assert.match(text, /\| 1 \| 食盐 \| 2 \| 3 \| 调料 \| 盐 2 · 盐、糖 1（拆） \|/);
  assert.match(text, /- 新料 1/);
  assert.doesNotMatch(text, /菜一|菜二|某作者|example\.invalid|source\.json|不应出现的菜名|首批/);
});

test('rejects a name that is both excluded and a standard', () => {
  const bad = { entries: [...groups.entries, { kind: 'water', name: '别名', members: ['姜片'] }] };
  assert.throws(() => buildCatalog([], bad), /both excluded and a standard/);
});
