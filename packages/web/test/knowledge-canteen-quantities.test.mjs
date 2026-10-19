// #183 (ADR-0012 §1, §3, §11; KB format 3 from #182): the chef editor keeps every field of a format 3 revision,
// records canteen use with its source, upgrades a legacy recipe without turning the original into canteen use,
// deletes unclear items only by hand and speaks plainly in the standard ingredient dropdown. All data here is made up.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { Element } from './team-meals-pages-unload-dom.mjs';
const here = dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite/package.json'));
const esbuild = await import(pathToFileURL(viteRequire.resolve('esbuild')));
const dir = await mkdtemp(join(tmpdir(), 'knowledge-canteen-'));
after(() => rm(dir, { recursive: true, force: true }));
const output = join(dir, 'knowledge.mjs');
const bundle = await esbuild.build({ stdin: { contents: `export {render} from './pages/admin/knowledge'; export * from './api/knowledge'; export * from './pages/admin/knowledge/model'; export {inspectReloadSafety} from './view-models/reload-safety';`, loader: 'ts', resolveDir: join(here, '../src') }, bundle: true, write: false, format: 'esm', platform: 'browser', loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_WORKER_URL': '"/worker"' }, logLevel: 'silent', plugins: [{ name: 'auth-boundary', setup(build) {
  build.onResolve({ filter: /(?:\/admin\/token|\.\/token)$/ }, () => ({ path: 'token', namespace: 'test' }));
  build.onResolve({ filter: /\/router$/ }, () => ({ path: 'router', namespace: 'test' }));
  build.onResolve({ filter: /\/api\/team-meals$/ }, () => ({ path: 'team-meals', namespace: 'test' }));
  build.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'token' ? `export const getToken=()=>globalThis.fixture.token; export const peekToken=getToken; export const getAuthSessionVersion=()=>globalThis.fixture.auth; export const peekAuthSessionVersion=getAuthSessionVersion; export const stripTokenFromRest=x=>x; export const clearToken=()=>{}; export const renderLockScreen=()=>{}; export const onAuthSessionChange=fn=>{globalThis.fixture.authHooks.push(fn);return()=>{};};` : args.path === 'team-meals' ? `export const getTeamMealsApi=()=>globalThis.fixture.teamApi;` : `export const onRoute=fn=>{globalThis.fixture.routeHooks.push(fn);return()=>{};};`, loader: 'js' }));
} }] });
await writeFile(output, bundle.outputFiles[0].text);

const id = '10000000-0000-4000-8000-000000000001';
const [rowA, rowB, rowC, rowD, rowE, rowF] = ['a', 'b', 'c', 'd', 'e', 'f'].map(x => `30000000-0000-4000-8000-00000000000${x}`);
const [stepA, stepB] = ['a', 'b'].map(x => `40000000-0000-4000-8000-00000000000${x}`);
const [stdChicken, stdSoy, stdOil, stdPeanut] = [1, 2, 3, 4].map(x => `50000000-0000-4000-8000-00000000000${x}`);
const catalog = () => [
  { id: stdChicken, version: 3, name: { zh: '去骨鸡腿肉', en: 'Boneless chicken thigh', uk: 'Куряче стегно без кістки' }, aliases: ['鸡腿肉'], baseUnit: 'g', yield: 0.8, yieldSource: { kind: 'measured', by: '测试师傅', date: '2026-10-17' }, pcsToGram: 120, pcsToGramSource: { kind: 'rule', ruleId: 'test-thigh-piece' } },
  { id: stdSoy, version: 2, name: { zh: '生抽', en: 'Light soy sauce', uk: 'Світлий соєвий соус' }, aliases: ['酱油'], baseUnit: 'ml' },
  { id: stdOil, version: 7, name: { zh: '食用油', en: 'Cooking oil', uk: 'Олія' }, aliases: ['油'], baseUnit: 'ml' },
  { id: stdPeanut, version: 1, name: { zh: '花生油', en: 'Peanut oil', uk: 'Арахісова олія' }, aliases: ['油'], baseUnit: 'ml' },
];
const format3 = () => ({ recipeFormatVersion: '3', title: { zh: '测试鸡腿饭', en: 'Test chicken rice', uk: 'Тестовий рис з куркою' }, baseServings: 1,
  ingredients: [
    { id: rowA, name: { zh: '鸡腿肉' }, role: 'main', ingredientId: stdChicken, originalAmount: '两个鸡腿', originalQty: { value: '2', unit: 'pcs' }, qty: { value: '150', unit: 'g' }, qtySource: { kind: 'measured', by: '测试师傅', date: '2026-10-18' }, kitchenPrep: { timing: 'day-before', leadTime: { value: '2', unit: 'h' } } },
    { id: rowB, name: { zh: '生抽' }, role: 'seasoning', originalAmount: '一点' },
  ],
  steps: [{ id: stepA, text: { zh: '测试：腌一下' } }, { id: stepB, text: { zh: '测试：煎熟' } }], sources: [], assets: [],
  unknowns: [{ kind: 'prep-ahead', action: 'marinate', stepId: stepA, text: '测试原话：腌一会儿' }, { kind: 'amount', ingredientRowId: rowB, text: '测试原话：倒一点' }, { stepId: stepB, text: '测试原话：还没分类' }],
  laterField: { kept: true } });
const legacy = () => ({ recipeFormatVersion: '2', title: { zh: '测试旧菜' }, ingredients: [
    { id: rowA, name: { zh: '鸡腿肉' }, ingredientId: stdChicken, amount: { kind: 'exact', value: '500', unit: 'g', raw: '鸡腿500克' } },
    { id: rowB, name: { zh: '五花肉' }, amount: { kind: 'exact', value: '1.5', unit: '斤' } },
    { id: rowC, name: { zh: '盐' }, amount: { kind: 'to_taste', raw: '适量' } },
    { id: rowD, name: { zh: '糖' }, amount: { kind: 'unknown', raw: '少许' } },
    { id: rowE, name: { zh: '水' }, amount: { kind: 'unknown' } },
    { id: rowF, name: { zh: '葱' }, amount: { kind: 'exact', value: '3', unit: '根' } },
  ], steps: [{ id: stepA, text: { zh: '测试步骤' } }], sources: [], assets: [] });
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', etag: '"v1"', ...headers } });
const failure = (status, code, details) => json({ error: { code, message: 'RAW KB MESSAGE', details } }, status);

/** The private KB format 3 save rules (#182), with every saved revision kept so old versions can be compared. */
function knowledgeBase(recipe, { items = catalog(), refuse } = {}) {
  let stored = { id, version: 1, createdAt: '2026-10-19T00:00:00.000Z', recipe, media: [], sourceRecords: [] };
  const versions = [structuredClone(stored)], puts = [], standards = [];
  const handler = (url, init) => {
    if (url.includes('/source-illustrations')) return json({ recipeId: id, recipeVersion: stored.version, illustrations: [], stepLinks: [] });
    if (url.endsWith('/adoption')) return json({ recipeId: id, recipeVersion: stored.version, current: { version: stored.version, archived: false }, origin: { kind: 'manual', originalRecipeVersion: 1 }, source: { status: 'needs_review' }, kitchenApproval: null, issues: [] });
    if (url.includes('/ingredients?')) return json({ items, nextCursor: null });
    if (url.includes('/techniques?')) return json({ items: [], nextCursor: null });
    const one = /\/ingredients(?:\/([0-9a-f-]{36}))?$/.exec(url);
    if (one && init.method) { const body = JSON.parse(init.body); standards.push({ method: init.method, id: one[1], body }); return json({ id: one[1] || stdOil, version: 9, ingredient: body, createdAt: '2026-10-19' }, init.method === 'POST' ? 201 : 200); }
    if (one) { const { id: ingredientId, version, ...ingredient } = items.find(item => item.id === one[1]); return json({ id: ingredientId, version, ingredient, createdAt: '2026-10-19' }, 200, { etag: `"i${version}"` }); }
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body); puts.push(body);
      if (refuse) return refuse(body);
      if (stored.recipe.recipeFormatVersion === '3' && body.recipeFormatVersion !== '3') return failure(409, 'FORMAT_DOWNGRADE', {});
      if (stored.recipe.unknowns?.length && !('unknowns' in body)) return failure(409, 'UNKNOWNS_REQUIRED', { unknownCount: stored.recipe.unknowns.length });
      const saved = structuredClone(body); if (Array.isArray(saved.unknowns) && !saved.unknowns.length) delete saved.unknowns;
      stored = { ...stored, version: stored.version + 1, recipe: saved }; versions.push(structuredClone(stored));
      return json(stored, 200, { etag: `"v${stored.version}"` });
    }
    return json(stored, 200, { etag: `"v${stored.version}"` });
  };
  return { handler, puts, standards, versions };
}
let serial = 0;
async function setup(handler) {
  globalThis.fixture = { token: 'test-only-token', auth: 1, authHooks: [], routeHooks: [], calls: [], handler, teamApi: { sessionKey: () => 1, getPlan: async () => null } };
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  globalThis.window = { addEventListener() {}, confirm: () => true };
  globalThis.location = { hash: '#/admin/knowledge' };
  globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => new Element('', String(text)), activeElement: null };
  const body = new Element('body'), el = new Element('main'); body.append(el);
  globalThis.fetch = async (url, init = {}) => { fixture.calls.push({ url: String(url), init }); return fixture.handler(String(url), init); };
  const m = await import(pathToFileURL(output).href + `?run=${++serial}`);
  const flush = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };
  const mount = async (rest = id, lang = 'zh') => { await m.render(el, { lang, planId: 'week-2026-43', setReloadCoverage() {} }, rest); await flush(); };
  const all = selector => el.querySelectorAll(selector);
  const click = text => { const control = all('button').find(b => b.textContent === text); assert(control, `button ${text}`); control.click(); };
  return { m, el, flush, mount, all, click, row: index => all('.kb-row')[index] };
}
const control = (scope, text) => { const label = scope.querySelectorAll('label').find(l => l.children[0]?.textContent === text); assert(label, `label ${text}`); return label.querySelector('input,textarea,select'); };
const legend = (scope, text) => { const box = scope.querySelectorAll('fieldset').find(f => f.children[0]?.tagName === 'LEGEND' && f.children[0].textContent === text); assert(box, `fieldset ${text}`); return box; };
const put = (el, value) => { el.value = value; el.dispatchEvent({ type: el.tagName === 'SELECT' ? 'change' : 'input' }); };
const options = select => select.children.map(option => [option.getAttribute('value'), option.textContent]);

test('a format 3 revision saved after only a binding change keeps unknowns, canteen use, the original and later fields', async () => {
  const kb = knowledgeBase(format3()), h = await setup(kb.handler);
  assert.deepEqual(h.m.editable(format3()), format3(), 'the editable copy keeps every field of the revision');
  await h.mount();
  // Found by position, not label, so this also runs against the editor before #183.
  put(h.row(1).querySelector('.kb-kitchen-fields').querySelector('select'), stdSoy); await h.flush();
  h.click('保存菜谱'); await h.flush();
  const expected = format3(); expected.ingredients[1].ingredientId = stdSoy;
  assert.equal(kb.puts.length, 1); assert.deepEqual(kb.puts[0], expected);
  assert.equal(kb.versions.length, 2, 'saved as a new version'); assert.deepEqual(kb.versions[0].recipe, format3(), 'the old version is unchanged');
  assert.match(h.el.textContent, /已保存，每次修改都有历史版本/);
});

test('canteen use with its source and a lead time save as a new version; the original stays read only', async () => {
  const kb = knowledgeBase(format3()), h = await setup(kb.handler); await h.mount();
  assert.equal(h.row(1).querySelector('[data-testid="original-amount"]').textContent, '原方 · 只作参考：一点');
  assert.equal(h.row(0).querySelector('[data-testid="original-amount"]').textContent, '原方 · 只作参考：两个鸡腿（2 pcs）');
  assert.equal(h.row(0).querySelector('[data-testid="original-amount"]').querySelectorAll('input').length, 0);
  put(control(h.row(1), '对应的标准食材'), stdSoy); await h.flush();
  assert.match(h.row(1).textContent, /单位跟标准食材走：ml/);
  put(control(h.row(1), '每份多少（不知道就留空）'), '8');
  put(control(legend(h.row(1), '用量的出处'), '出处'), 'specified');
  assert.equal(h.m.inspectReloadSafety().reason, 'dirty', 'unsaved input stays protected');
  h.click('保存菜谱'); await h.flush();
  assert.equal(kb.puts.length, 0, 'a set value without who and when is not sent');
  assert.match(h.el.textContent, /用量和出处要一起填/);
  put(control(legend(h.row(1), '用量的出处'), '出处'), 'rule');
  put(control(legend(h.row(1), '用量的出处'), '规则编号'), 'test-soy-per-serving');
  put(control(h.row(1), '提前多久（腌、泡、醒；不知道就留空）'), '1');
  put(control(h.row(1), '时间单位'), 'd');
  put(control(legend(h.row(0), '用量的出处'), '谁'), '另一位测试师傅');
  put(control(legend(h.row(0), '用量的出处'), '哪天'), '2026-10-19');
  h.click('保存菜谱'); await h.flush();
  assert.equal(kb.puts.length, 1);
  const [chicken, soy] = kb.puts[0].ingredients;
  assert.deepEqual(soy, { id: rowB, name: { zh: '生抽' }, role: 'seasoning', ingredientId: stdSoy, originalAmount: '一点', qty: { value: '8', unit: 'ml' }, qtySource: { kind: 'rule', ruleId: 'test-soy-per-serving' }, kitchenPrep: { leadTime: { value: '1', unit: 'd' } } });
  assert.deepEqual(chicken.qtySource, { kind: 'measured', by: '另一位测试师傅', date: '2026-10-19' });
  assert.deepEqual(chicken.originalQty, { value: '2', unit: 'pcs' }); assert.deepEqual(chicken.qty, { value: '150', unit: 'g' });
  assert.deepEqual(kb.puts[0].unknowns, format3().unknowns, 'writing a value never deletes an unclear item (K7)');
  assert.deepEqual(kb.versions[0].recipe, format3(), 'the old version is unchanged');
  assert.equal(h.m.inspectReloadSafety().reason, 'clear');
});

test('deleting unclear items saves new versions; deleting the last one sends an explicit empty list', async () => {
  const kb = knowledgeBase(format3()), h = await setup(kb.handler); await h.mount();
  const items = () => h.all('[data-testid="recipe-unknown"]');
  assert.deepEqual(items().map(item => item.children[0].textContent + item.children[1].textContent), ['腌多久没说 · 第 1 步', '用量没说 · 材料：生抽', '还没分类 · 第 2 步']);
  const folded = items()[0].querySelector('details');
  assert.equal(folded.querySelector('summary').textContent, '原话（只给师傅看）'); assert.match(folded.textContent, /测试原话：腌一会儿/);
  items()[1].querySelector('button').click();
  h.click('保存菜谱'); await h.flush();
  assert.deepEqual(kb.puts[0].unknowns, [format3().unknowns[0], format3().unknowns[2]]);
  items()[0].querySelector('button').click(); items()[0].querySelector('button').click();
  assert.equal(items().length, 0); assert.match(h.el.textContent, /这一版没有没说清的地方/);
  h.click('保存菜谱'); await h.flush();
  assert.deepEqual(kb.puts[1].unknowns, []);
  put(control(h.all('fieldset').find(f => f.children[0]?.textContent === '菜名（至少一种语言）'), '中文'), '测试鸡腿饭二');
  h.click('保存菜谱'); await h.flush();
  assert.deepEqual(kb.puts[2].unknowns, [], 'a format 3 save always names its unclear items');
  assert.equal(kb.versions.length, 4);
  assert.deepEqual(kb.versions[0].recipe.unknowns, format3().unknowns); assert.equal(kb.versions[1].recipe.unknowns.length, 2);
});

test('a legacy recipe given canteen use becomes format 3; the original numbers never become canteen use', async () => {
  const kb = knowledgeBase(legacy()), h = await setup(kb.handler); await h.mount();
  assert.match(h.all('[data-testid="format-upgrade"]')[0].textContent, /这道菜还是旧格式/);
  put(control(h.row(0), '每份多少（不知道就留空）'), '150');
  put(control(legend(h.row(0), '用量的出处'), '出处'), 'specified');
  put(control(legend(h.row(0), '用量的出处'), '谁'), '测试师傅');
  put(control(legend(h.row(0), '用量的出处'), '哪天'), '2026-10-19');
  h.click('保存菜谱'); await h.flush();
  const { title, steps, sources, assets } = legacy();
  assert.deepEqual(kb.puts[0], { recipeFormatVersion: '3', title, steps, sources, assets, unknowns: [], ingredients: [
    { id: rowA, name: { zh: '鸡腿肉' }, ingredientId: stdChicken, originalAmount: '鸡腿500克', originalQty: { value: '500', unit: 'g' }, qty: { value: '150', unit: 'g' }, qtySource: { kind: 'specified', by: '测试师傅', date: '2026-10-19' } },
    { id: rowB, name: { zh: '五花肉' }, originalAmount: '1.5 斤', originalQty: { value: '750', unit: 'g' } },
    { id: rowC, name: { zh: '盐' }, originalAmount: '适量' },
    { id: rowD, name: { zh: '糖' }, originalAmount: '少许' },
    { id: rowE, name: { zh: '水' } },
    { id: rowF, name: { zh: '葱' }, originalAmount: '3 根' },
  ] });
  assert.deepEqual(kb.versions[0].recipe, legacy(), 'the legacy version is unchanged');
  assert.equal(h.all('[data-testid="format-upgrade"]').length, 0);
  assert.equal(h.row(1).querySelector('[data-testid="original-amount"]').textContent, '原方 · 只作参考：1.5 斤（750 g）');
});

test('a lead time alone upgrades a legacy recipe and a binding alone keeps it legacy', async () => {
  const { m } = await setup(() => json({}));
  const lead = legacy(); lead.ingredients[1].kitchenPrep = { leadTime: { value: '30', unit: 'min' } };
  const upgraded = m.saveBody(lead);
  assert.equal(upgraded.recipeFormatVersion, '3'); assert.deepEqual(upgraded.unknowns, []);
  assert(upgraded.ingredients.every(row => !('amount' in row) && !('qty' in row) && !('qtySource' in row)));
  assert.deepEqual(upgraded.ingredients[1], { id: rowB, name: { zh: '五花肉' }, originalAmount: '1.5 斤', originalQty: { value: '750', unit: 'g' }, kitchenPrep: { leadTime: { value: '30', unit: 'min' } } });
  assert.deepEqual(m.saveBody(legacy()), legacy());
  for (const value of ['0.25', '2', '10.50']) { const one = legacy(); one.ingredients[1].amount.value = value; one.ingredients[0].kitchenPrep = { leadTime: { value: '1', unit: 'h' } }; assert.equal(m.saveBody(one).ingredients[1].originalQty.value, { '0.25': '125', 2: '1000', '10.50': '5250' }[value]); }
});

test('the standard ingredient dropdown has no versions or IDs and puts the name suggestion first', async () => {
  const recipe = format3(); delete recipe.unknowns;
  recipe.ingredients = [{ id: rowA, name: { zh: '鸡腿肉（身份待核）' } }, { id: rowB, name: { zh: '酱油' } }, { id: rowC, name: { zh: '油' } }];
  const kb = knowledgeBase(recipe), h = await setup(kb.handler);
  const hidden = /\bv\d+\b|50000000/;
  for (const [lang, label, suggested, unlinked, also] of [
    ['zh', '对应的标准食材', '按名字建议：去骨鸡腿肉，还没选 · 名称待核，先看原话', '不绑定：采购单上单独一行', '生抽（也叫：酱油）'],
    ['en', 'Standard ingredient', 'Suggested by name: Boneless chicken thigh, not chosen yet · Name unclear; check the original wording first', 'Not linked: its own line in the shopping list', 'Light soy sauce (also: 酱油)'],
    ['uk', 'Стандартний інгредієнт', 'Пропозиція за назвою: Куряче стегно без кістки, ще не вибрано · Назва неточна; спершу перевірте оригінал', 'Без прив’язки: окремий рядок у списку закупівлі', 'Світлий соєвий соус (інші назви: 酱油)'],
  ]) {
    await h.mount(id, lang);
    const first = options(control(h.row(0), label));
    assert.deepEqual(first.slice(0, 2), [[stdChicken, suggested], ['', unlinked]], lang);
    assert(first.some(([, text]) => text === also), lang);
    assert.equal(h.row(0).querySelector('[data-testid="standard-suggestion"]').textContent, suggested);
    assert.equal(options(control(h.row(1), label))[0][0], stdSoy, 'an alias match is suggested');
    assert.deepEqual(options(control(h.row(2), label))[0], ['', unlinked], 'two standards called the same: no suggestion');
    for (const select of h.all('select')) for (const [, text] of options(select)) assert.doesNotMatch(text, hidden, `${lang}: ${text}`);
    assert.doesNotMatch(h.el.textContent, /核对|复核|核定/);
  }
  assert.equal(h.m.inspectReloadSafety().reason, 'clear', 'a suggestion never binds by itself');
  await h.mount(id, 'zh'); put(control(h.row(0), '对应的标准食材'), stdChicken); await h.flush();
  assert.deepEqual(options(control(h.row(0), '对应的标准食材')).slice(0, 2), [['', '不绑定：采购单上单独一行'], [stdChicken, '去骨鸡腿肉（也叫：鸡腿肉）']]);
  assert.equal(h.row(0).querySelectorAll('[data-testid="standard-suggestion"]').length, 0);
});

test('format refusals have plain words in three languages and fold the raw reply', async () => {
  for (const [status, code, details, words] of [
    [409, 'UNKNOWNS_REQUIRED', { unknownCount: 3 }, ['没存上：这道菜有视频里没说清的地方', 'Not saved: this recipe has points the video left unclear', 'Не збережено: у рецепті є неясні з відео місця']],
    [409, 'FORMAT_DOWNGRADE', {}, ['没存上：这道菜已经按新格式存过', 'Not saved: this recipe is already in the new format', 'Не збережено: рецепт уже в новому форматі']],
    [400, 'RECIPE_FORMAT_REQUIRED', {}, ['没存上：食堂用量、提前多久和没说清的地方要按新格式存', 'Not saved: canteen amounts, lead times and unclear items', 'Не збережено: кількості для їдальні, час наперед і неясні місця']],
  ]) for (const [index, lang] of ['zh', 'en', 'uk'].entries()) {
    const kb = knowledgeBase(format3(), { refuse: () => failure(status, code, details) }), h = await setup(kb.handler); await h.mount(id, lang);
    const title = h.all('fieldset').find(f => f.children[0]?.textContent === ['菜名（至少一种语言）', 'Title (at least one language)', 'Назва (хоча б однією мовою)'][index]);
    put(control(title, '中文'), '保留的输入');
    h.click(['保存菜谱', 'Save recipe', 'Зберегти рецепт'][index]); await h.flush();
    const alert = h.all('[role="alert"]').map(node => node.textContent).join('\n');
    assert(alert.startsWith(words[index]), `${code} ${lang}: ${alert}`);
    assert.doesNotMatch(alert, /RAW KB MESSAGE|已有更新|has changed|уже змінено|核对|复核|核定/);
    const support = h.all('details').find(node => node.querySelector('summary')?.textContent === ['技术支持详情', 'Support details', 'Деталі для підтримки'][index]);
    assert(support, `${code} ${lang}: folded details`); assert.match(support.textContent, new RegExp(code)); if (details.unknownCount) assert.match(support.textContent, /"unknownCount": 3/);
    assert.equal(control(title, '中文').value, '保留的输入');
  }
});

test('standard ingredient yield and grams-per-piece sources save, and survive an edit that does not touch them', async () => {
  const kb = knowledgeBase(format3()), h = await setup(kb.handler); await h.mount();
  const panel = () => h.all('[data-testid="recipe-adoption"]')[0], form = () => h.all('[data-testid="standard-editor"]')[0];
  const chooser = control(panel(), '标准材料');
  assert(options(chooser).every(([, text]) => !/\bv\d+\b|50000000/.test(text)));
  put(chooser, stdChicken); await h.flush();
  const name = legend(form(), '标准名称'); put(control(name, '中文'), '去骨鸡腿肉（测试改名）');
  h.click('保存标准资料新版本'); await h.flush();
  const { id: _id, version: _version, ...chicken } = catalog()[0];
  assert.deepEqual(kb.standards[0], { method: 'PUT', id: stdChicken, body: { ...chicken, name: { ...chicken.name, zh: '去骨鸡腿肉（测试改名）' } } }, 'yield, grams per piece and both sources go back unchanged');
  h.click('＋ 标准材料'); await h.flush();
  put(control(legend(form(), '标准名称'), '中文'), '测试料');
  put(control(form(), '每个克数（未知留空）'), '');
  put(control(legend(form(), '每个多少克的出处'), '出处'), 'rule');
  h.click('保存标准资料新版本'); await h.flush();
  assert.equal(kb.standards.length, 1, 'a source without its value is not sent');
  assert.match(panel().textContent, /出处要写全/);
  put(control(legend(form(), '每个多少克的出处'), '出处'), '');
  put(control(form(), '净料率（0–1，未知留空；pcs 不设）'), '0.9');
  put(control(legend(form(), '净料率的出处'), '出处'), 'specified');
  put(control(legend(form(), '净料率的出处'), '谁'), '测试师傅');
  put(control(legend(form(), '净料率的出处'), '哪天'), '2026-10-19');
  h.click('保存标准资料新版本'); await h.flush();
  assert.deepEqual(kb.standards[1], { method: 'POST', id: undefined, body: { name: { zh: '测试料' }, yield: 0.9, yieldSource: { kind: 'specified', by: '测试师傅', date: '2026-10-19' } } });
});

test('unclear items pointing at a removed row block the save instead of moving to another row', async () => {
  const kb = knowledgeBase(format3()), h = await setup(kb.handler); await h.mount();
  const remove = h.row(1).querySelectorAll('button').find(b => b.textContent === '移除'); remove.click(); await h.flush();
  assert.match(h.all('[data-testid="recipe-unknown"]')[1].textContent, /已删掉的材料或步骤/);
  h.click('保存菜谱'); await h.flush();
  assert.equal(kb.puts.length, 0); assert.match(h.el.textContent, /先删掉那一条再保存/);
  h.all('[data-testid="recipe-unknown"]')[1].querySelector('button').click();
  h.click('保存菜谱'); await h.flush();
  assert.deepEqual(kb.puts[0].unknowns, [format3().unknowns[0], format3().unknowns[2]]);
});
