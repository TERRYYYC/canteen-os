// canteen-os#182: the KB's own editor keeps format 3 fields when it saves, and a chef can delete one unclear entry (K7).
// Needs `npm run build` first and a Playwright Chromium. Fabricated data on an isolated temporary database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../apps/api/app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// A built copy of the web app on its own temporary database and port.
async function editor(t) {
  assert(existsSync(join(root, 'apps/web/dist/index.html')), 'run npm run build first');
  const dataDir = await mkdtemp(join(tmpdir(), 'kb-editor-quantities-'));
  const webDist = join(dataDir, 'web-dist');
  await cp(join(root, 'apps/web/dist'), webDist, { recursive: true });
  const app = await buildApp({ dataDir, port: 0, webDist });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  app.kbConfig.allowedOrigins.add(base);
  const api = async (path, init = {}) => {
    const response = await fetch(`${base}/api/v1${path}`, init);
    const body = await response.json();
    assert(response.ok, JSON.stringify(body));
    return body;
  };
  const create = recipe => api('/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-KB-Client': 'agent', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(recipe) });
  return { base, api, create, browser };
}

test('the editor saves a format 3 recipe without dropping original, canteen quantity, source, lead time or unknowns', { timeout: 60000 }, async t => {
  const { base, api, create, browser } = await editor(t);
  const rows = [randomUUID(), randomUUID(), randomUUID()], steps = [randomUUID(), randomUUID()];
  const recipe = { recipeFormatVersion: '3', title: { zh: '造的腌羊肉' }, baseServings: 1,
    ingredients: [
      { id: rows[0], name: { zh: '羊肉' }, role: 'main', originalAmount: '5斤', originalQty: { value: '2500', unit: 'g' },
        qty: { value: '150', unit: 'g' }, qtySource: { kind: 'measured', by: '造的师傅甲', date: '2026-10-19' },
        kitchenPrep: { timing: 'day-before', size: '3cm', leadTime: { value: '12', unit: 'h' } } },
      { id: rows[1], name: { zh: '盐' }, role: 'seasoning', originalAmount: '一点点', qty: { value: '1.5', unit: 'g' }, qtySource: { kind: 'rule', ruleId: 'salt-per-serving' } },
      { id: rows[2], name: { zh: '油' }, role: 'seasoning' },
    ],
    steps: [{ id: steps[0], text: { zh: '羊肉加盐腌。' } }, { id: steps[1], text: { zh: '下锅炸。' } }],
    unknowns: [
      { kind: 'prep-ahead', action: 'marinate', stepId: steps[0], text: '造的原话：腌多久没说' },
      { kind: 'heat', stepId: steps[1], text: '造的原话：油温没说' },
      { kind: 'identity', ingredientRowId: rows[0], text: '造的原话：部位没说' },
      { text: '造的原话：煲多久没说' },
    ] };
  const created = await create(recipe);
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const save = async () => {
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await expect(page.getByText('已保存，所有资料都收好了。', { exact: true })).toBeVisible();
  };
  const revision = async version => (await api(`/recipes/${created.id}/revisions/${version}`)).recipe;

  await page.goto(`${base}/#${created.id}`);
  await expect(page.getByRole('heading', { name: '没说清的地方', exact: true })).toBeVisible();
  await expect(page.locator('.unknown-list li')).toHaveCount(4);
  await expect(page.getByText('提前 12 小时（保存时保留）')).toBeVisible();
  await page.getByRole('textbox', { name: '一句话描述 / 备注', exact: true }).fill('只改了备注。');
  await save();
  const second = await revision(2);
  assert.deepEqual(second, { ...recipe, description: { zh: '只改了备注。' }, tags: [], sources: [], assets: [] });

  // Fill a canteen quantity with its source through the form.
  const oil = page.locator('.ingredient-row').nth(2);
  await oil.getByRole('textbox', { name: '食堂数量', exact: true }).fill('10');
  await oil.getByRole('combobox', { name: '食堂单位', exact: true }).selectOption('ml');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('第 3 项食材的食堂用量请填写数量、单位和出处。');
  await oil.getByRole('combobox', { name: '出处', exact: true }).selectOption('specified');
  await oil.getByRole('textbox', { name: '谁给的', exact: true }).fill('造的师傅丙');
  await oil.getByLabel('哪天给的', { exact: true }).fill('2026-10-20');
  await save();
  const third = await revision(3);
  assert.deepEqual(third.ingredients[2], { ...recipe.ingredients[2], qty: { value: '10', unit: 'ml' }, qtySource: { kind: 'specified', by: '造的师傅丙', date: '2026-10-20' } });
  assert.deepEqual(third.ingredients.slice(0, 2), recipe.ingredients.slice(0, 2));
  assert.deepEqual(third.unknowns, recipe.unknowns);

  // K7: delete one answered entry; the new version drops it, older versions keep it.
  await page.getByRole('button', { name: '删掉这一条：造的原话：腌多久没说', exact: true }).click();
  await expect(page.locator('.unknown-list li')).toHaveCount(3);
  await save();
  assert.deepEqual((await revision(4)).unknowns, recipe.unknowns.slice(1));
  assert.deepEqual((await revision(3)).unknowns, recipe.unknowns);

  // Removing a step keeps its entries as whole-dish entries instead of leaving a dangling position.
  await page.locator('.step-row').nth(1).getByRole('button', { name: '移除', exact: true }).click();
  for (const text of ['造的原话：油温没说', '造的原话：部位没说', '造的原话：煲多久没说']) await page.getByRole('button', { name: `删掉这一条：${text}`, exact: true }).click();
  await expect(page.getByText('原方没有标出没说清的地方。')).toBeVisible();
  await save();
  const fifth = await revision(5);
  assert.equal('unknowns' in fifth, false);
  assert.equal(fifth.steps.length, 1);

  // History renders both the new rows and the entries of an older version.
  await page.getByRole('button', { name: '查看历史版本', exact: true }).click();
  await page.getByRole('combobox', { name: '选择版本', exact: true }).selectOption('3');
  await expect(page.locator('.snapshot').getByText('造的原话：腌多久没说')).toBeVisible();
  await expect(page.locator('.snapshot').getByText('150 克 · 师傅实称 · 造的师傅甲 · 2026-10-19')).toBeVisible();
  assert.deepEqual(errors, []);
});

test('removing a step with unclear entries keeps them on the row they also point at', { timeout: 60000 }, async t => {
  const { base, api, create, browser } = await editor(t);
  const step = randomUUID(), row = randomUUID();
  const recipe = { recipeFormatVersion: '3', title: { zh: '造的炸丸子' }, ingredients: [{ id: row, name: { zh: '肉馅' } }], steps: [{ id: step, text: { zh: '下锅炸。' } }],
    unknowns: [{ kind: 'heat', stepId: step, ingredientRowId: row, text: '造的原话：油温没说' }] };
  const created = await create(recipe);
  const page = await browser.newPage();
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${base}/#${created.id}`);
  await page.locator('.step-row').first().getByRole('button', { name: '移除', exact: true }).click();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('已保存，所有资料都收好了。', { exact: true })).toBeVisible();
  const saved = await api(`/recipes/${created.id}/revisions/2`);
  assert.deepEqual(saved.recipe.unknowns, [{ kind: 'heat', ingredientRowId: row, text: '造的原话：油温没说' }]);
});

// ADR-0012 §2: an amount entered as "per serving" is saved for 1 serving, whatever the servings field said before.
test('a canteen amount is saved for 1 serving; amounts saved for another count must be converted first', { timeout: 60000 }, async t => {
  const { base, api, create, browser } = await editor(t);
  const page = await browser.newPage();
  page.on('dialog', dialog => dialog.accept());
  const step = () => ({ id: randomUUID(), text: { zh: '下锅。' } });
  const fillCanteen = async () => {
    const row = page.locator('.ingredient-row').first();
    await row.getByRole('textbox', { name: '食堂数量', exact: true }).fill('150');
    await row.getByRole('combobox', { name: '食堂单位', exact: true }).selectOption('g');
    await row.getByRole('combobox', { name: '出处', exact: true }).selectOption('specified');
    await row.getByRole('textbox', { name: '谁给的', exact: true }).fill('造的师傅甲');
    await row.getByLabel('哪天给的', { exact: true }).fill('2026-10-20');
  };
  const servings = page.getByRole('spinbutton', { name: '份量（可留空）', exact: true });
  const saved = async () => {
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await expect(page.getByText('已保存，所有资料都收好了。', { exact: true })).toBeVisible();
  };

  // Original servings 2 (or none) and no canteen amount yet: entering one counts the recipe per serving.
  for (const baseServings of [2, undefined]) {
    const recipe = { recipeFormatVersion: '3', title: { zh: '造的炖羊肉' }, ...(baseServings ? { baseServings } : {}),
      ingredients: [{ id: randomUUID(), name: { zh: '羊肉' }, originalAmount: '5斤', originalQty: { value: '2500', unit: 'g' } }], steps: [step()] };
    const created = await create(recipe);
    await page.goto(`${base}/#${created.id}`);
    await expect(servings).toHaveValue(baseServings ? '2' : '');
    await fillCanteen();
    await expect(servings).toHaveValue('1');
    await expect(servings).toBeDisabled();
    await expect(page.getByTestId('servings-basis')).toHaveText('份数按每份记：填了食堂用量，份数就是 1。');
    await saved();
    const second = (await api(`/recipes/${created.id}/revisions/2`)).recipe;
    assert.equal(second.baseServings, 1);
    assert.deepEqual(second.ingredients[0].qty, { value: '150', unit: 'g' });
    assert.equal((await api(`/recipes/${created.id}/revisions/1`)).recipe.baseServings, baseServings);
  }

  // Canteen amounts already saved for 2 servings (allowed for older data): the editor stops until the chef converts them.
  const row = randomUUID();
  const held = await create({ recipeFormatVersion: '3', title: { zh: '造的两份羊肉' }, baseServings: 2,
    ingredients: [{ id: row, name: { zh: '羊肉' }, qty: { value: '300', unit: 'g' }, qtySource: { kind: 'specified', by: '造的师傅甲', date: '2026-10-19' } }], steps: [step()] });
  await page.goto(`${base}/#${held.id}`);
  const message = '这道菜的食堂用量是按 2 份记的。先把每行用量换成一份的量，再把份数改成 1，然后保存。';
  await expect(page.getByTestId('servings-basis')).toHaveText(message);
  await expect(servings).toBeEnabled();
  await page.getByRole('textbox', { name: '一句话描述 / 备注', exact: true }).fill('只改了备注。');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(message);
  assert.equal((await api(`/recipes/${held.id}/revisions`)).items.length, 1);
  await page.locator('.ingredient-row').first().getByRole('textbox', { name: '食堂数量', exact: true }).fill('150');
  await servings.fill('1');
  await expect(servings).toBeDisabled();
  await saved();
  const converted = (await api(`/recipes/${held.id}/revisions/2`)).recipe;
  assert.equal(converted.baseServings, 1);
  assert.deepEqual(converted.ingredients[0].qty, { value: '150', unit: 'g' });
  assert.equal((await api(`/recipes/${held.id}/revisions/1`)).recipe.baseServings, 2);
});
