import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, after } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite/package.json'));
const esbuild = await import(pathToFileURL(viteRequire.resolve('esbuild')));
const dir = await mkdtemp(join(tmpdir(), 'team-home-'));
after(() => rm(dir, { recursive: true, force: true }));
const entry = join(here, '../src/pages/admin/home.ts');
const injected = {
  '../../api/client': 'export const getApi = () => globalThis.__homeHarness.getLegacy();',
  '../../api/team-meals': 'export const getTeamMealsApi = () => globalThis.__homeHarness.team;',
  '../../shell': 'export const netState = () => globalThis.__homeHarness.online ? "online" : "offline"; export const formatBuiltAt = value => value;',
  '../admin': 'export const adminHref = (...parts) => "#/admin" + (parts.length ? "/" + parts.map(encodeURIComponent).join("/") : "");',
};
const bundle = await esbuild.build({
  stdin: { contents: await readFile(entry, 'utf8') + `\nexport { createTeamMealsApi } from ${JSON.stringify(join(here, '../src/api/team-meals.ts'))};\nexport { HttpAdminApi } from ${JSON.stringify(join(here, '../src/api/client.ts'))};\nexport { setLang as switchLanguage } from ${JSON.stringify(join(here, '../src/i18n.ts'))};\nexport { clearToken as changeAuth } from ${JSON.stringify(join(here, '../src/admin/token.ts'))};`, resolveDir: dirname(entry), loader: 'ts' },
  plugins: [{ name: 'home-dependencies', setup(build) {
    build.onResolve({ filter: /^\.\.\// }, args => injected[args.path] && (args.importer === '' || args.importer === '<stdin>' || args.importer.endsWith('home.ts')) ? { path: args.path, namespace: 'home-test' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'home-test' }, args => ({ contents: injected[args.path], loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'browser', loader: { '.css': 'empty' },
  define: { 'import.meta.env.VITE_WORKER_URL': '""', 'import.meta.env.BASE_URL': '"/"' }, logLevel: 'silent',
});
const output = join(dir, 'home.mjs');
await writeFile(output, bundle.outputFiles[0].text);

// The real home renderer, DOM helpers, C1 and legacy HTTP readers execute here.
// This minimal DOM implements their presentation surface; it is not layout/browser evidence.
class NodeDouble {
  constructor(tag = '', text = '') { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.parentNode = null; this.text = text; this.hidden = false; this.listeners = {}; this.classList = { add: c => this.classChange(c, true), remove: c => this.classChange(c, false), toggle: (c, yes) => this.classChange(c, yes) }; }
  classChange(name, yes) { const list = new Set((this.attrs.class ?? '').split(' ').filter(Boolean)); if (yes) list.add(name); else list.delete(name); this.attrs.class = [...list].join(' '); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); }
  getAttribute(k) { return k.startsWith('data-') ? this.dataset[k.slice(5)] ?? null : this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { children.forEach(c => this.appendChild(c)); }
  replaceChildren(...children) { this.children.forEach(c => c.parentNode = null); this.children = []; this.text = ''; this.append(...children); }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this.text = String(value); }
  get isConnected() { return this.tagName === 'BODY' || Boolean(this.parentNode?.isConnected); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({ target: this }); }
  focus() {}
}
const walk = node => [node, ...node.children.flatMap(walk)];
const byClass = (node, name) => walk(node).filter(n => (n.attrs.class ?? '').split(' ').includes(name));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const A = 'a'.repeat(40);
function fixture() {
  return {
    plan: { schemaVersion: '3', meals: [{ date: '2026-09-14', mealType: 'lunch', dishRef: 'z-v3' }, { date: '2026-09-15', mealType: 'dinner', dishRef: 'a-v2', plannedServings: 7 }] },
    catalog: { commit: A, dishes: { 'z-v3': { schemaVersion: '3', name: { zh: '无份数' }, components: [{ ingredientRef: 'salt' }] }, 'a-v2': { schemaVersion: '2', name: { zh: '旧菜' }, baseServings: 7, status: 'draft', components: [{ ingredientRef: 'salt', qty: { unit: 'to-taste' } }] } }, ingredients: { salt: { schemaVersion: '2', name: { zh: '盐' }, role: 'seasoning', baseUnit: 'g', trackStock: false } }, techniques: [], suppliers: [], translations: { machine: 3, human: 0, stale: 0 } },
    changes: { unpublished: [{ path: 'data/dishes/z-v3.json', kind: 'dish', name: { zh: '新菜' } }], lastPublishedAt: '2026-09-10T10:00:00Z' },
  };
}
let serial = 0;
async function setup({ mode = 'real', input = fixture(), response } = {}) {
  const events = {};
  globalThis.window = { addEventListener: (name, fn) => (events[name] ??= []).push(fn) };
  globalThis.location = { hash: '#/admin', replace() {} };
  const storage = new Map();
  globalThis.localStorage = globalThis.sessionStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  globalThis.document = { body: new NodeDouble('body'), createElement: tag => new NodeDouble(tag), createTextNode: text => new NodeDouble('', text) };
  const page = await import(`${pathToFileURL(output)}?case=${++serial}`);
  const calls = [], legacyReads = [];
  let identity = 0;
  const fetch = async (url, init) => {
    const path = new URL(url).pathname; calls.push(path);
    const body = structuredClone(path === '/catalog' ? input.catalog : path === '/changes' ? input.changes : path.startsWith('/source/plan/') ? { content: input.plan, commit: A, blobSha: 'blob' } : null);
    if (response) { const custom = await response(path, init); if (custom) return custom; }
    return new Response(JSON.stringify(body), { status: body ? 200 : 404 });
  };
  const opts = { fetch, token: () => 'local-fixture', identity: () => identity };
  const team = page.createTeamMealsApi(mode === 'unconfigured' ? '' : 'https://fixture.invalid', { ...opts, ...(mode === 'mock' ? { mode: 'mock' } : {}) });
  const legacy = new page.HttpAdminApi('https://fixture.invalid', opts);
  for (const method of ['getCatalog', 'getPlan', 'getChanges']) { const original = legacy[method].bind(legacy); legacy[method] = (...args) => { legacyReads.push(method); return original(...args); }; }
  const harness = { team, online: true, getLegacy() { legacyReads.push('getApi'); return legacy; } };
  globalThis.__homeHarness = harness;
  const mount = (lang = 'zh') => { page.switchLanguage(lang); const el = new NodeDouble('section'); document.body.append(el); page.render(el, { lang, planId: 'week-38', rest: '' }, ''); return el; };
  return { page, team, legacy, calls, legacyReads, harness, mount, input, events, bumpIdentity() { identity++; }, async flush() { for (let i = 0; i < 6; i++) await tick(); }, cleanup() { team.dispose(); legacy.dispose(); document.body.replaceChildren(); } };
}

test('unconfigured home keeps unknown numbers, three-language connection notice, and never enters legacy mock', async () => {
  const s = await setup({ mode: 'unconfigured' });
  try {
    for (const [lang, marker] of [['zh', '未连接'], ['en', 'Not connected'], ['uk', 'Немає з’єднання']]) {
      const el = s.mount(lang); await s.flush();
      assert.equal(s.legacyReads.length, 0, 'unconfigured home must never invoke default legacy getApi');
      assert.equal(s.calls.length, 0);
      assert.match(el.textContent, new RegExp(marker));
      assert.equal(byClass(el, 'adm-home-tile').length, 7);
      assert.match(byClass(el, 'adm-home-tile-plan')[0].textContent, /—/);
      assert.doesNotMatch(el.textContent, /都发布了|Everything is published|Усе опубліковано/);
      el.remove();
    }
  } finally { s.cleanup(); }
});

test('mixed v2/v3 catalog and unknown servings render through C1; only publication uses legacy API', async () => {
  const s = await setup();
  try {
    const before = JSON.stringify(s.input), el = s.mount(); await s.flush();
    assert.deepEqual(s.legacyReads, ['getApi', 'getChanges']);
    assert.match(byClass(el, 'adm-home-tile-plan')[0].textContent, /本周已排 2 餐/);
    assert.match(byClass(el, 'adm-home-tile-draft')[0].textContent, /2 道草稿/);
    assert.equal(byClass(el, 'adm-home-tile-draft')[0].getAttribute('href'), '#/admin/dish/a-v2');
    assert.match(el.textContent, /1 项改动还没发布/);
    assert.equal(JSON.stringify(s.input), before, 'reading home must not invent counts or mutate original fields');
    const count = s.calls.length; s.page.switchLanguage('en'); el.remove();
    const en = s.mount('en'); await s.flush();
    assert.equal(s.calls.length, count, 'language change reuses the same auth-bound snapshot');
    assert.match(en.textContent, /2 meals planned this week/);
  } finally { s.cleanup(); }
});

test('explicit simulation is labelled and cannot claim actual publication', async () => {
  const s = await setup({ mode: 'mock' });
  try {
    const el = s.mount('en'); await s.flush();
    assert.match(el.textContent, /Simulation; no real repository write/);
    assert.equal(s.legacyReads.length, 0);
    assert.match(el.textContent, /2 meals planned this week/);
    assert.doesNotMatch(el.textContent, /changes not published yet|Everything is published|Last published/);
  } finally { s.cleanup(); }
});

test('C1 read failures leave unknown numbers; a confirmed missing plan alone may display zero', async () => {
  let missing = false;
  const s = await setup({ response: async path => path.startsWith('/source/plan/') ? new Response(JSON.stringify({ ok: false, errors: [{ path: '', code: missing ? 'not_found' : 'forbidden', message: 'fixture read refused' }] }), { status: missing ? 404 : 403 }) : undefined });
  try {
    const el = s.mount(); await s.flush();
    assert.match(byClass(el, 'adm-home-tile-plan')[0].textContent, /本周已排 — 餐.*数字暂时取不到/);
    missing = true; el.remove(); const next = s.mount(); await s.flush();
    assert.match(byClass(next, 'adm-home-tile-plan')[0].textContent, /本周已排 0 餐/);
  } finally { s.cleanup(); }
});

test('late prior-account replies cannot populate a new-account language render', async () => {
  let release;
  const held = new Promise(resolve => release = resolve);
  let hold = true;
  const s = await setup({ response: async () => { if (hold) await held; } });
  try {
    const old = s.mount(); await tick();
    s.bumpIdentity(); s.page.switchLanguage('en'); old.remove();
    hold = false; s.input.plan.meals.push({ date: '2026-09-16', mealType: 'lunch', dishRef: 'z-v3' });
    const current = s.mount('en'); await s.flush();
    assert.match(current.textContent, /3 meals planned this week/);
    release(); await s.flush();
    assert.match(current.textContent, /3 meals planned this week/);
    assert.equal(byClass(current, 'adm-lock').length, 0);
  } finally { release(); s.cleanup(); }
});

test('auth changes immediately remove cached private numbers and late results do not return them', async () => {
  const s = await setup();
  try {
    const el = s.mount('en'); await s.flush();
    assert.match(el.textContent, /2 meals planned this week/);
    s.page.changeAuth(); await s.flush();
    assert.doesNotMatch(el.textContent, /2 meals planned this week|2 draft dishes|Last published/);
    s.page.switchLanguage('en'); el.remove(); const next = s.mount('en'); await s.flush();
    assert.match(next.textContent, /2 meals planned this week/);
    assert.equal(s.calls.filter(path => path === '/catalog').length, 2);
  } finally { s.cleanup(); }
});


test('a completed snapshot from an earlier auth identity is not reused on language change', async () => {
  const input = fixture();
  input.plan.schemaVersion = '2';
  input.plan.meals[0].plannedServings = 5;
  input.catalog.dishes['z-v3'].schemaVersion = '2';
  input.catalog.dishes['z-v3'].baseServings = 5;
  const s = await setup({ input });
  try {
    const old = s.mount(); await s.flush();
    assert.match(old.textContent, /本周已排 2 餐/);
    s.bumpIdentity(); s.input.plan.meals.push({ date: '2026-09-16', mealType: 'dinner', dishRef: 'a-v2', plannedServings: 8 });
    s.page.switchLanguage('en'); old.remove(); const next = s.mount('en');
    assert.doesNotMatch(next.textContent, /2 meals planned this week/, 'old private numbers must not flash during replacement');
    await s.flush();
    assert.match(next.textContent, /3 meals planned this week/);
    assert.equal(s.calls.filter(path => path === '/catalog').length, 2);
  } finally { s.cleanup(); }
});

test('offline repaint retains known figures, explicitly marks offline and disables write entry links', async () => {
  const s = await setup();
  try {
    const el = s.mount('en'); await s.flush(); const reads = s.calls.length;
    s.harness.online = false; s.events.offline.forEach(fn => fn());
    assert.match(el.textContent, /No network/);
    assert.match(el.textContent, /2 meals planned this week/);
    for (const key of ['plan', 'dish', 'draft', 'ingredient']) assert.equal(byClass(el, 'adm-home-tile-' + key)[0].getAttribute('href'), null);
    assert.equal(byClass(el, 'adm-home-tile-qr')[0].getAttribute('href'), '#/qr');
    assert.equal(s.calls.length, reads);
    s.harness.online = true; s.events.online.forEach(fn => fn());
    assert.equal(byClass(el, 'adm-home-tile-plan')[0].getAttribute('href'), '#/admin/plan');
  } finally { s.cleanup(); }
});
