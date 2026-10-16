import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, after } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const vr = createRequire(require.resolve('vite/package.json')), esbuild = await import(pathToFileURL(vr.resolve('esbuild')));
const dir = await mkdtemp(join(tmpdir(), 'dishes-page-'));
after(() => rm(dir, { recursive: true, force: true }));
async function load(file, name) {
  const entry = join(here, '../src', file), source = await readFile(entry, 'utf8');
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: dirname(entry), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', loader: { '.css': 'empty' }, define: { 'import.meta.env.BASE_URL': '"/"' }, logLevel: 'silent' });
  const out = join(dir, `${name}.mjs`); await writeFile(out, bundle.outputFiles[0].text); return import(pathToFileURL(out));
}
const page = await load('pages/dishes.ts', 'dishes'), router = await load('router.ts', 'router');

// Minimal DOM transport; this is not browser/layout evidence.
class NodeDouble {
  constructor(tag = '', text = '') { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.parentNode = null; this.connected = false; this.text = text; this.listeners = {}; this.value = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
  appendChild(child) { if (typeof child === 'string') child = new NodeDouble('', child); child.parentNode = this; this.children.push(child); return child; }
  append(...c) { c.forEach(x => this.appendChild(x)); }
  replaceChildren(...c) { this.children.forEach(x => x.parentNode = null); this.children = []; this.text = ''; this.append(...c); }
  remove() { if (this.parentNode) { const p = this.parentNode; p.children = p.children.filter(c => c !== this); this.parentNode = null; } }
  get isConnected() { return this.connected || Boolean(this.parentNode?.isConnected); }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); } dispatch(type) { for (const fn of this.listeners[type] ?? []) fn({ target: this }); }
}
const body = new NodeDouble('body'); body.connected = true;
globalThis.document = { body, createElement: t => new NodeDouble(t), createTextNode: t => new NodeDouble('', t) };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
const session = new Map();
globalThis.sessionStorage = { getItem: k => session.get(k) ?? null, setItem: (k, v) => session.set(k, v), removeItem: k => session.delete(k) };
const revoked = []; let made = 0;
globalThis.URL.createObjectURL = () => `blob:test-${++made}`; globalThis.URL.revokeObjectURL = u => revoked.push(u);
const all = n => [n, ...n.children.flatMap(all)];
const byClass = (n, c) => all(n).filter(x => x.getAttribute('class')?.split(' ').includes(c));
const byTag = (n, t) => all(n).filter(x => x.tagName === t.toUpperCase());
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

const revision = 'a'.repeat(40), image = { src: 'x.png', license: 'CC BY 4.0' };
const projection = {
  sourceRevision: revision, selection: [], techniques: [{ id: 'dice', kind: 'cut', name: { zh: '切丁', en: 'Dice', uk: 'Нарізати кубиками' }, note: { zh: '技法备注' } }],
  menuPlans: { week: { schemaVersion: '3', name: { zh: '示例' }, meals: [
    { date: '2026-10-19', mealType: 'lunch', dishRef: 'dish-a' }, { date: '2026-10-19', mealType: 'dinner', dishRef: 'dish-b' },
    { date: '2026-10-20', mealType: 'lunch', dishRef: 'dish-a' }, { date: '2026-10-20', mealType: 'lunch', dishRef: 'ghost' }, { date: '2026-10-21', mealType: 'lunch', dishRef: 'dish-c' }] } },
  dishes: {
    'dish-a': { schemaVersion: '3', name: { zh: '番茄炒蛋', en: 'Tomato eggs', uk: 'Яєчня з помідорами' }, status: 'draft', image, baseServings: 20,
      components: [
        { ingredientRef: 'tomato', qty: { value: 1500, unit: 'g' }, originalAmount: '3 个大的', prep: { techniqueRef: 'dice', size: '2 cm', note: { zh: '去皮', en: 'peeled', uk: 'без шкірки' } } },
        { ingredientRef: 'egg', qty: { value: 6, unit: 'pcs' } }, { ingredientRef: 'salt', qty: { unit: 'to-taste' } }, { ingredientRef: 'oil' }],
      steps: [{ text: { zh: '先炒蛋', en: 'Fry the eggs first', uk: 'Спершу засмажити яйця' }, techniqueRef: 'dice', clip: { videoUrl: 'https://video.example/watch?v=1', start: 1, end: 5 } }, { text: { zh: '再下番茄', en: 'Add tomatoes', uk: 'Додати помідори' } }],
      provenance: { source: 'video', videoUrl: 'https://video.example/watch?v=1' } },
    'dish-b': { schemaVersion: '3', name: { zh: '清汤', uk: 'Прозорий суп' }, status: 'draft', components: [{ ingredientRef: 'tomato', qty: { value: 100, unit: 'g' } }], steps: [] },
    'dish-c': { schemaVersion: '3', name: { en: 'Plain rice' }, status: 'draft' },
  },
  ingredients: {
    tomato: { schemaVersion: '2', name: { zh: '番茄', en: 'Tomato', uk: 'Помідор' }, baseUnit: 'g', trackStock: false, role: 'main' },
    egg: { schemaVersion: '2', name: { zh: '鸡蛋', en: 'Egg', uk: 'Яйце' }, baseUnit: 'g', trackStock: false, role: 'main' },
    salt: { schemaVersion: '2', name: { zh: '盐', en: 'Salt', uk: 'Сіль' }, baseUnit: 'g', trackStock: false, role: 'seasoning' },
    oil: { schemaVersion: '2', name: { zh: '油', en: 'Oil', uk: 'Олія' }, baseUnit: 'g', trackStock: false, role: 'main' },
  },
  collection: { items: [], issues: [], coverage: {} },
};
function ctx(lang, over = {}) {
  const calls = { plan: [], asset: [] };
  const view = { planId: 'week', projection, sourceRevision: revision, builtAt: '2026-10-15T00:00:00Z', issues: [] };
  return { calls, lang, planId: 'week', route: 'dishes', rest: '', publication: { kind: 'team-meals', manifest: { plans: ['week'], builtAt: '', commit: 'c' } }, publicationError: null,
    t: () => '加载中', planSelection: undefined,
    data: { loadPublishedTeamPlan: async (p, id) => { calls.plan.push(id); return view; }, loadPublishedAsset: async (v, pointer) => { calls.asset.push(pointer); return { kind: 'available', sourceRevision: revision, bytes: new Blob(['x']) }; } }, ...over };
}
async function run(lang, over) {
  const el = new NodeDouble('section'); body.append(el); const c = ctx(lang, over); await page.render(el, c); await tick(); return { el, c };
}
const cards = el => byClass(el, 'dishes-card');
const SECRET = /dish-[abc]|ghost|video\.example|https?:|[0-9a-f]{40}|kb[it]?-[0-9a-f]|[0-9a-f]{32}|schemaVersion|recipeId|commit/;

test('router parses #/dishes and #/dishes/<id>', () => {
  assert.ok(router.ROUTES.includes('dishes'));
  assert.deepEqual({ ...router.parseHash('#/dishes') }, { page: 'dishes', rest: '' });
  assert.deepEqual({ ...router.parseHash('#/dishes/dish-a?plan=week') }, { page: 'dishes', rest: 'dish-a', planId: 'week' });
  assert.equal(router.hrefOf('dishes', 'dish-a'), '#/dishes/dish-a');
});

test('list: dedup by dishRef in first-seen order, skips records that do not exist, reads one publication', async () => {
  const { el, c } = await run('zh');
  assert.deepEqual(cards(el).map(a => a.getAttribute('href')), ['#/dishes/dish-a', '#/dishes/dish-b', '#/dishes/dish-c']);
  assert.deepEqual(c.calls.plan, ['week']);
  assert.equal(SECRET.test(cards(el).map(a => a.textContent).join('|')), false);
});

test('list: other-language line and main ingredients follow the reader language', async () => {
  const zh = (await run('zh')).el, en = (await run('en')).el, uk = (await run('uk')).el;
  const [a, b, cc] = cards(zh); assert.ok(a.textContent.includes('番茄炒蛋')); assert.ok(a.textContent.includes('Яєчня з помідорами'));
  assert.ok(a.textContent.includes('主料: 番茄 · 鸡蛋 · 油'), 'every main ingredient, seasonings left out'); assert.equal(a.textContent.includes('盐'), false); assert.equal(a.textContent.includes('Tomato eggs'), false);
  assert.ok(b.textContent.includes('清汤') && b.textContent.includes('Прозорий суп'));
  assert.equal(byClass(cc, 'dishes-other').length, 0, 'dish-c has no uk text: no filler line');
  const [ea, eb] = cards(en); assert.ok(ea.textContent.includes('Tomato eggs') && ea.textContent.includes('番茄炒蛋')); assert.equal(ea.textContent.includes('Яєчня'), false);
  assert.ok(ea.textContent.includes('Main ingredients: Tomato · Egg · Oil'));
  assert.equal(eb.textContent.includes('Прозорий'), false, 'en reader: other line is zh only');
  assert.equal(byClass(eb, 'dishes-other').length, 0, 'the zh name already shown as the title is not repeated');
  const ua = cards(uk)[0]; assert.ok(ua.textContent.includes('Яєчня з помідорами') && ua.textContent.includes('番茄炒蛋')); assert.ok(ua.textContent.includes('Основні інгредієнти: Помідор · Яйце · Олія'));
  assert.equal(ua.textContent.includes('Tomato eggs'), false);
});

test('search matches dish and ingredient names in all three languages, ignoring case', async () => {
  const { el } = await run('uk'); const input = byTag(el, 'input')[0];
  assert.ok(input.getAttribute('placeholder').includes('中文') && input.getAttribute('placeholder').includes('English') && input.getAttribute('placeholder').includes('Українська'));
  const search = q => { input.value = q; input.dispatch('input'); return cards(el).map(a => a.getAttribute('href').slice(9)); };
  assert.deepEqual(search('番茄'), ['dish-a', 'dish-b']); assert.deepEqual(search('TOMATO'), ['dish-a', 'dish-b']);
  assert.deepEqual(search('яйце'), ['dish-a']); assert.deepEqual(search('ПРОЗОРИЙ'), ['dish-b']);
  assert.deepEqual(search('plain'), ['dish-c']); assert.deepEqual(search('清汤'), ['dish-b']);
  assert.deepEqual(search(''), ['dish-a', 'dish-b', 'dish-c']);
  assert.deepEqual(search('zzz'), []); assert.ok(el.textContent.includes('Нічого не знайдено'));
});

test('cover: same-version image where recorded, first-letter placeholder otherwise, object URLs released', async () => {
  const { el, c } = await run('zh');
  assert.deepEqual(c.calls.asset, ['/dishes/dish-a/image']);
  const [a, b] = cards(el); assert.equal(byTag(a, 'img').length, 1); assert.equal(byTag(b, 'img').length, 0);
  assert.equal(byClass(b, 'dishes-initial')[0].textContent, '清');
  assert.equal(byClass(cards(el)[2], 'dishes-initial')[0].textContent, 'P');
  const failing = await run('zh', { data: { ...ctx('zh').data, loadPublishedAsset: async () => { throw new Error('nope'); } } });
  assert.equal(byTag(cards(failing.el)[0], 'img').length, 0); assert.equal(byClass(cards(failing.el)[0], 'dishes-initial')[0].textContent, '番');
  const pending = await run('zh', { data: { ...ctx('zh').data, loadPublishedAsset: async () => ({ kind: 'not-recorded' }) } });
  assert.equal(byTag(cards(pending.el)[0], 'img').length, 0);
  const img = byTag(a, 'img')[0]; img.dispatch('error'); assert.ok(revoked.length >= 1);
});

test('detail: both sections, default method, original quantities unscaled, servings wording', async () => {
  const { el } = await run('zh', { rest: 'dish-a' });
  const [ing, method] = byClass(el, 'dishes-tab'); assert.equal(method.getAttribute('aria-pressed'), 'true'); assert.equal(ing.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(ing.textContent, '食材'); assert.equal(method.textContent, '做法');
  const steps = byClass(el, 'dishes-step'); assert.equal(steps.length, 2);
  assert.ok(steps[0].textContent.includes('1') && steps[0].textContent.includes('先炒蛋') && steps[0].textContent.includes('技法: 切丁'));
  assert.ok(steps[1].textContent.includes('2') && steps[1].textContent.includes('再下番茄'));
  const head = el.textContent; assert.ok(head.includes('番茄炒蛋') && head.includes('Tomato eggs') && head.includes('Яєчня з помідорами'));
  ing.dispatch('click');
  assert.equal(ing.getAttribute('aria-pressed'), 'true'); assert.equal(method.getAttribute('aria-pressed'), 'false'); assert.equal(byClass(el, 'dishes-step').length, 0);
  const rows = byClass(el, 'dishes-row'); assert.equal(rows.length, 4);
  assert.ok(rows[0].textContent.includes('番茄') && rows[0].textContent.includes('1.5 千克'), 'the recorded value, never scaled');
  assert.ok(rows[0].textContent.includes('（3 个大的）'), 'the recipe\'s own wording is written as is beside it');
  assert.ok(rows[0].textContent.includes('切丁，2 cm') && rows[0].textContent.includes('备注: 去皮'));
  assert.ok(rows[1].textContent.includes('6 个')); assert.ok(rows[2].textContent.includes('适量')); assert.ok(rows[3].textContent.includes('用量未录'));
  assert.ok(el.textContent.includes('原配方 20 份'));
  method.dispatch('click'); assert.equal(byClass(el, 'dishes-step').length, 2);
});

test('detail: recipe servings read naturally in English and Ukrainian', async () => {
  for (const [lang, expected] of [['en', 'Original recipe: 20 servings'], ['uk', 'Порцій за рецептом: 20']]) {
    const { el } = await run(lang, { rest: 'dish-a' }); const [ing] = byClass(el, 'dishes-tab'); ing.dispatch('click');
    assert.ok(el.textContent.includes(expected), `${lang}: ${el.textContent}`);
  }
});

test('detail: servings not recorded says so, empty sections say so, no filler language line', async () => {
  const { el } = await run('zh', { rest: 'dish-b' });
  const [ing] = byClass(el, 'dishes-tab'); assert.ok(el.textContent.includes('还没有录入做法'));
  ing.dispatch('click'); assert.ok(el.textContent.includes('原配方份数没写')); assert.equal(byClass(el, 'dishes-other').length, 1, 'only the recorded uk name');
});

test('detail: no video, source address, ids, versions or hashes; no back-office link without a token', async () => {
  for (const lang of ['zh', 'en', 'uk']) for (const rest of ['', 'dish-a']) {
    const { el } = await run(lang, { rest }); const [ing] = byClass(el, 'dishes-tab'); ing?.dispatch('click');
    const text = el.textContent; assert.equal(SECRET.test(text.replace(/dish-[abc]/g, '')), false, `${lang} ${rest}: ${text}`);
    assert.equal(byTag(el, 'video').length, 0); assert.equal(byTag(el, 'iframe').length, 0);
    const hrefs = byTag(el, 'a').map(a => a.getAttribute('href')); assert.ok(hrefs.every(h => h.startsWith('#/dishes')), hrefs.join());
    assert.equal(hrefs.some(h => h.includes('admin')), false);
  }
});

test('detail: dish outside this plan, or unknown, gets a plain message and a way back', async () => {
  for (const rest of ['ghost', 'nope', 'dish-zzz']) {
    const { el } = await run('uk', { rest }); assert.ok(el.textContent.includes('Цієї страви немає в плані'));
    assert.equal(byTag(el, 'a')[0].getAttribute('href'), '#/dishes');
  }
  assert.ok((await run('en', { rest: 'nope' })).el.textContent.includes('This dish is not in the plan'));
});

test('states: loading, no publication, no plan chosen, plan not published, read failure', async () => {
  const text = async (lang, over) => (await run(lang, over)).el.textContent;
  assert.equal(await text('zh', { publication: null }), '加载中');
  assert.ok((await text('zh', { publication: { kind: 'team-meals', manifest: { plans: [] } } })).includes('本版没有发布计划'));
  assert.ok((await text('zh', { planId: null })).includes('选择一个计划'));
  assert.ok((await text('en', { planId: null })).includes('Choose a plan'));
  assert.ok((await text('zh', { planId: 'other' })).includes('尚未在本版发布'));
  assert.ok((await text('uk', { planId: 'other' })).includes('немає в цій публікації'));
  const { PublishedDataError } = await load('view-models/published.ts', 'published');
  const bad = { ...ctx('zh').data, loadPublishedTeamPlan: async () => { throw new PublishedDataError('unavailable', 'manifest', 'secret/path', 500, revision); } };
  const failed = await text('zh', { data: bad }); assert.ok(failed.includes('无法读取这版资料')); assert.equal(/secret|500|manifest|unavailable/.test(failed), false);
  assert.ok((await text('zh', { publicationError: new Error('x') })).includes('无法读取这版资料'));
});

test('a plan with no dishes says so in plain words in every language', async () => {
  const empty = { ...ctx('zh').data, loadPublishedTeamPlan: async () => ({ planId: 'week', sourceRevision: revision, builtAt: '', issues: [], projection: { ...projection, menuPlans: { week: { schemaVersion: '3', meals: [] } } } }) };
  for (const [lang, words] of [['zh', '还没有安排菜'], ['en', 'No dishes are planned'], ['uk', 'ще немає страв']]) {
    const { el } = await run(lang, { data: empty }); assert.ok(el.textContent.includes(words)); assert.equal(byTag(el, 'input').length, 0);
  }
});

test('labels exist in all three languages', async () => {
  const labels = { zh: ['食材', '做法'], en: ['Ingredients', 'Method'], uk: ['Інгредієнти', 'Приготування'] };
  for (const lang of ['zh', 'en', 'uk']) {
    const { el } = await run(lang, { rest: 'dish-a' }); assert.deepEqual(byClass(el, 'dishes-tab').map(b => b.textContent), labels[lang]);
    assert.ok(byClass(el, 'dishes-back')[0].textContent.length > 2);
  }
});

test('search shows or hides the same cards: each picture is read once and no extra object URLs are made', async () => {
  const { el, c } = await run('zh'); const input = byTag(el, 'input')[0];
  const before = made, first = cards(el)[0];
  for (const q of ['番', '番茄', '', 'zzz', '']) { input.value = q; input.dispatch('input'); }
  await tick();
  assert.deepEqual(c.calls.asset, ['/dishes/dish-a/image']); assert.equal(made, before);
  assert.equal(cards(el)[0], first, 'the same card comes back after clearing the search');
  assert.equal(byTag(first, 'img')[0].getAttribute('alt'), '', 'the dish name is written right below the picture');
});

// Shape written by the recipe-library adoption (packages/worker/src/knowledge-materialization.ts): fixed-version
// dish and ingredient ids, role on the dish row, the recipe's own amount and preparation words, shared records without role.
const kbHex = '0123456789abcdef0123456789abcdef', kbDish = `kb-${kbHex}-v1`, kbi = n => `kbi-${kbHex}-v1-${n}`;
const blanch = `kbt-${'f'.repeat(32)}-${'e'.repeat(12)}`, lost = `kbt-${'0'.repeat(32)}-${'1'.repeat(12)}`;
const kbProjection = {
  ...projection,
  techniques: [{ id: blanch, kind: 'heat', name: { zh: '焯水', en: 'Blanch', uk: 'Бланшувати' }, note: { zh: '水开再下', en: 'Into boiling water', uk: 'У киплячу воду' } }],
  menuPlans: { week: { schemaVersion: '3', meals: [{ date: '2026-10-19', mealType: 'lunch', dishRef: kbDish }] } },
  dishes: { [kbDish]: { schemaVersion: '3', name: { zh: '土豆烧肉' }, status: 'draft', baseServings: 4,
    components: [
      { ingredientRef: kbi(1), qty: { value: 500, unit: 'g' }, originalAmount: '1 斤', originalPreparation: { zh: '切块' }, role: 'main', prep: { techniqueRef: blanch, size: '3 cm' }, knowledgeIngredientId: '11111111-1111-4111-8111-111111111111' },
      { ingredientRef: kbi(2), qty: { unit: 'to-taste' }, originalAmount: '适量', role: 'seasoning' },
      { ingredientRef: kbi(3), originalAmount: '未录用量', role: 'main' },
      { ingredientRef: kbi(4), qty: { value: 200, unit: 'g' }, originalAmount: '200 g', role: 'main' },
      { ingredientRef: kbi(5), originalAmount: '一小把', role: 'seasoning', prep: { techniqueRef: lost } },
      { ingredientRef: 'kbi-gone', qty: { value: 1, unit: 'pcs' }, originalAmount: '1 个' }],
    steps: [{ text: { zh: '土豆焯水', en: 'Blanch the potatoes' }, techniqueRef: blanch }, { text: { zh: '下锅' }, techniqueRef: lost }, { text: { zh: '肉也焯水' }, techniqueRef: blanch }],
    provenance: { source: 'knowledge', recipeId: '22222222-2222-4222-8222-222222222222', recipeVersion: 1, snapshotHash: 'b'.repeat(64), approvalHash: 'c'.repeat(64) } } },
  ingredients: {
    [kbi(1)]: { schemaVersion: '3', name: { zh: '土豆', uk: 'Картопля' }, baseUnit: 'g', trackStock: false },
    [kbi(2)]: { schemaVersion: '3', name: { zh: '盐', en: 'Salt', uk: 'Сіль' }, baseUnit: 'g', trackStock: false },
    [kbi(3)]: { schemaVersion: '3', name: { zh: '五花肉' }, baseUnit: 'g', trackStock: false },
    [kbi(4)]: { schemaVersion: '3', name: { zh: '洋葱' }, baseUnit: 'g', trackStock: false },
    [kbi(5)]: { schemaVersion: '3', name: { zh: '香菜' }, baseUnit: 'g', trackStock: false } },
};
const kbRun = (lang, rest = '') => run(lang, { rest, data: { ...ctx(lang).data, loadPublishedTeamPlan: async () => ({ planId: 'week', projection: kbProjection, sourceRevision: revision, builtAt: '', issues: [] }) } });
const rowsOf = async (lang) => { const { el } = await kbRun(lang, kbDish); byClass(el, 'dishes-tab')[0].dispatch('click'); return byClass(el, 'dishes-row').map(r => r.textContent); };

test('recipe-library dish: main ingredients come from the role on the dish row', async () => {
  const card = cards((await kbRun('zh')).el)[0];
  assert.ok(card.textContent.includes('土豆烧肉') && card.textContent.includes('主料: 土豆 · 五花肉 · 洋葱'), card.textContent);
  assert.equal(/盐|香菜/.test(card.textContent), false);
  assert.equal(card.getAttribute('href'), `#/dishes/${kbDish}`);
});

test('recipe-library dish: amounts written as recorded, localized where they are words of ours, never filled in', async () => {
  const zh = await rowsOf('zh');
  assert.ok(zh[0].includes('土豆') && zh[0].includes('500 克') && zh[0].includes('（1 斤）'), zh[0]);
  assert.ok(zh[0].includes('焯水，3 cm') && zh[0].includes('原方: 切块'), 'technique, size and the recipe\'s own preparation words');
  assert.ok(zh[1].includes('适量') && !zh[1].includes('（适量）'), 'the default to-taste wording is not repeated');
  assert.ok(zh[2].includes('五花肉') && zh[2].includes('用量未录') && !zh[2].includes('未录用量'), 'the stored placeholder is not shown');
  assert.ok(zh[3].includes('200 克') && !zh[3].includes('200 g'), '"200 g" is the same amount, not another wording');
  assert.ok(zh[4].includes('一小把') && zh[4].includes('技法资料未找到'));
  assert.ok(zh[5].includes('食材资料未找到') && zh[5].includes('1 个'));
  const en = await rowsOf('en');
  assert.ok(en[0].includes('500 g') && en[0].includes(' (1 斤)') && en[0].includes('Original: 切块'), en[0]);
  assert.ok(en[1].includes('To taste') && !en[1].includes('适量'), en[1]);
  assert.ok(en[2].includes('Quantity not recorded')); assert.ok(en[4].includes('Technique information unavailable'));
  assert.ok(en[5].includes('Ingredient information unavailable'));
  const uk = await rowsOf('uk');
  assert.ok(uk[1].includes('За смаком') && !uk[1].includes('适量'), uk[1]); assert.ok(uk[0].includes('Картопля') && uk[0].includes('Бланшувати, 3 cm'));
  assert.ok(uk[5].includes('Дані інгредієнта недоступні'));
});

test('recipe-library dish: method shows the technique, its note where it first comes up; an unknown technique says so', async () => {
  for (const [lang, tech, note, missing] of [['zh', '技法: 焯水', '备注: 水开再下', '技法: 技法资料未找到'], ['en', 'Technique: Blanch', 'Note: Into boiling water', 'Technique: Technique information unavailable'], ['uk', 'Техніка: Бланшувати', 'Примітка: У киплячу воду', 'Техніка: Дані техніки недоступні']]) {
    const steps = byClass((await kbRun(lang, kbDish)).el, 'dishes-step').map(s => s.textContent);
    assert.ok(steps[0].includes(tech) && steps[0].includes(note), `${lang}: ${steps[0]}`); assert.ok(steps[1].includes(missing), `${lang}: ${steps[1]}`);
    assert.ok(steps[2].includes(tech) && !steps[2].includes(note), `${lang}: the same note is not repeated: ${steps[2]}`);
  }
});

test('recipe-library dish: no ids, versions or hashes in any language or section', async () => {
  for (const lang of ['zh', 'en', 'uk']) for (const rest of ['', kbDish]) for (const tab of [0, 1]) {
    const { el } = await kbRun(lang, rest); byClass(el, 'dishes-tab')[tab]?.dispatch('click');
    assert.equal(SECRET.test(el.textContent), false, `${lang} ${rest} ${tab}: ${el.textContent}`);
    assert.equal(/knowledge|snapshot|approval|v1\b/.test(el.textContent), false);
  }
});
