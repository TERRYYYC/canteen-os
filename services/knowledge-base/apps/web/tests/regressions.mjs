// Real Fastify + disk SQLite regressions for client recovery and full-replace fidelity.
import { chromium, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../api/app.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = await mkdtemp(join(tmpdir(), 'canteen-web-regressions-'));
const evidence = join(webRoot, 'evidence');
const checks = [];
let app, browser;
try {
  app = await buildApp({ dataDir, port: 0, webDist: join(webRoot, 'dist') });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  app.kbConfig.allowedOrigins.add(base);
  async function post(path, body) {
    const response = await fetch(`${base}/api/v1${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-KB-Client': 'agent', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body) });
    expect(response.status).toBe(201);
    return response.json();
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${base}/#new`);
  await page.getByRole('textbox', { name: '菜名 *', exact: true }).fill('仅有名称的红烧肉');
  await page.getByText('＋ 添加来源', { exact: true }).click();
  await page.getByRole('textbox', { name: '原文或笔记', exact: true }).fill('尚未添加的原文不能丢失');
  await page.getByRole('button', { name: '收藏这款菜谱', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('尚未添加');
  await page.reload();
  await page.getByText('＋ 添加来源', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: '原文或笔记', exact: true })).toHaveValue('尚未添加的原文不能丢失');
  await page.getByRole('textbox', { name: '原文或笔记', exact: true }).fill('');
  checks.push('待添加来源计入草稿且刷新恢复，阻止总保存时遗漏原文');
  let lost = false;
  const attempts = [];
  await page.route('**/api/v1/recipes', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
    if (!lost) { lost = true; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: '收藏这款菜谱', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('保存结果暂时无法确认');
  await expect(page.getByRole('textbox', { name: '菜名 *', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByText('已恢复上次未确认的保存请求，请先核对保存结果。')).toBeVisible();
  await page.getByRole('button', { name: '核对保存结果', exact: true }).first().click();
  await expect(page.getByText('已收藏这款菜谱，可以继续补充。')).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  const list = await fetch(`${base}/api/v1/recipes`).then(r => r.json());
  expect(list.items).toHaveLength(1);
  checks.push('创建响应丢失后刷新页面，恢复相同请求键和正文，只生成一款菜谱');

  const video = await post('/assets/external', { kind: 'video', url: 'https://example.com/video' });
  const source = await post('/sources', { kind: 'text', title: '原始手写记录', textContent: '调料原文：少许。' });
  const firstStep = randomUUID();
  const secondStep = randomUUID();
  const ingredient = { id: randomUUID(), name: { zh: '盐', en: 'Salt', uk: 'Сіль' }, rawText: '盐 少许', role: 'seasoning', amount: { kind: 'text', raw: '少许' }, preparation: { zh: '磨细', en: 'finely ground' } };
  const created = await post('/recipes', { title: { zh: '红烧肉', en: 'Braised pork', uk: 'Тушкована свинина' }, ingredients: [ingredient], steps: [{ id: firstStep, text: { zh: '第一步', en: 'First step' } }, { id: secondStep, text: { zh: '第二步' } }], assets: [{ assetId: video.id, role: 'step', stepId: firstStep, clip: { start: 1.25, end: 7.5 } }], sources: [{ sourceId: source.id, evidence: { excerpt: '原文少许', line: 2 } }] });
  await page.goto(`${base}/#${created.id}`);
  await expect(page.getByText('原始手写记录', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '菜名 *', exact: true }).fill('红烧肉 · 自己的版本');
  await page.locator('.step-row').first().getByRole('button', { name: '移除', exact: true }).click();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('已保存，所有资料都收好了。')).toBeVisible();
  const saved = await fetch(`${base}/api/v1/recipes/${created.id}`).then(r => r.json());
  expect(saved.recipe.title.en).toBe('Braised pork');
  expect(saved.recipe.title.uk).toBe('Тушкована свинина');
  expect(saved.recipe.ingredients[0]).toEqual(ingredient);
  expect(saved.recipe.steps[0].id).toBe(secondStep);
  expect(saved.recipe.assets[0]).toEqual({ assetId: video.id, role: 'reference', clip: { start: 1.25, end: 7.5 } });
  expect(saved.recipe.sources[0].evidence).toEqual({ excerpt: '原文少许', line: 2 });
  checks.push('完整替换保存保留其他语言、原文、预处理、来源证据、精确视频片段与稳定行 ID');
  checks.push('删除步骤把其素材改为参考资料，无失效步骤引用');
  await page.getByRole('button', { name: '查看历史版本', exact: true }).click();
  await page.getByRole('combobox', { name: '选择版本', exact: true }).selectOption('1');
  await expect(page.locator('.snapshot').getByRole('heading', { name: '红烧肉', exact: true })).toBeVisible();
  await expect(page.locator('.snapshot').getByText('第一步', { exact: true })).toBeVisible();
  await expect(page.locator('.snapshot').getByText('原始手写记录', { exact: true })).toBeVisible();
  checks.push('旧版本展示旧名称、已删除步骤和快照来源正文');
  await page.getByRole('button', { name: '收起历史', exact: true }).click();
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, 'editor-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(evidence, 'editor-mobile.png'), fullPage: true });
  checks.push('390px 编辑页面无横向溢出');
  expect(errors).toEqual([]);
  await writeFile(join(evidence, 'regressions.json'), JSON.stringify({ date: new Date().toISOString(), checks, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, checks }));
} finally {
  await browser?.close();
  await app?.close();
  await rm(dataDir, { recursive: true, force: true });
}
