#!/usr/bin/env node
/**
 * 给演练知识库（只认 127.0.0.1:4392）放一条造的收藏候选，好在网页里走「存为菜谱 → 补用量 → 排进菜单 → 发布」（#196）。
 *
 * 菜和文字都是造的，标明「演练」；不碰 4391 上的正式库。重复跑不会多出第二条（知识库按内容去重）。
 *
 *   node scripts/mac-local/rehearsal-seed.mjs [--kb http://127.0.0.1:4392]
 */
import { randomUUID } from 'node:crypto';

const at = process.argv.indexOf('--kb');
const kb = at > 0 ? process.argv[at + 1] : 'http://127.0.0.1:4392';
if (!/^http:\/\/127\.0\.0\.1:4392\/?$/.test(kb)) {
  console.error('✗ 只往演练知识库（http://127.0.0.1:4392）里放造的菜；4391 是正式库，不碰。');
  process.exit(2);
}
const base = kb.replace(/\/$/, '') + '/api/v1';

async function call(method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: { 'X-KB-Client': 'agent', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${json?.error?.code ?? ''}`);
  return json;
}

const contentId = '7000000000000196001';
const url = `https://www.douyin.com/note/${contentId}`;
const text = [
  '演练菜：番茄炒蛋（造的，不是真菜谱）',
  '番茄两个，鸡蛋三个，盐少许。',
  '番茄切块，鸡蛋打散。',
  '先炒蛋，再下番茄，加盐炒匀。',
].join('\n');

await call('POST', '/favorites/import/apply', {
  folder: '演练（#196）', claimedCount: 1,
  rows: [{ index: '1', folder: '演练（#196）', kind: 'note', content_id: contentId, url, author: '演练', card_alt: '演练：番茄炒蛋', display_text: '演练：番茄炒蛋' }],
});
const item = (await call('GET', '/favorites/items')).items.find(x => x.contentId === contentId);
const capture = await call('POST', `/favorites/items/${item.id}/captures`, { method: 'manual_post', status: 'ready', evidence: { sourceUrl: url, text } });
const existing = (await call('GET', `/favorites/items/${item.id}/candidates`)).items ?? [];
if (existing.length) {
  console.log(JSON.stringify({ ok: true, candidate: existing[0].id, status: existing[0].status, note: '已经放过了' }));
  process.exit(0);
}

const rows = { tomato: randomUUID(), egg: randomUUID(), salt: randomUUID() };
const steps = { cut: randomUUID(), fry: randomUUID() };
const recipe = {
  recipeFormatVersion: '3',
  title: { zh: '演练菜：番茄炒蛋（造的）' },
  description: { zh: '只给 #196 演练用，不是真菜谱。' },
  ingredients: [
    { id: rows.tomato, name: { zh: '番茄' }, role: 'main', originalAmount: '两个', originalQty: { value: '2', unit: 'pcs' } },
    { id: rows.egg, name: { zh: '鸡蛋' }, role: 'main', originalAmount: '三个', originalQty: { value: '3', unit: 'pcs' } },
    { id: rows.salt, name: { zh: '盐' }, role: 'seasoning', originalAmount: '少许' },
  ],
  steps: [
    { id: steps.cut, text: { zh: '番茄切块，鸡蛋打散。' } },
    { id: steps.fry, text: { zh: '先炒蛋，再下番茄，加盐炒匀。' } },
  ],
  // 一条已分类的「没说清」：备料页应写「……没说 · 问师傅」。
  unknowns: [{ kind: 'heat', stepId: steps.fry, text: '火候没说' }],
};
const quote = q => ({ locator: '正文', quote: q });
const candidate = await call('POST', `/favorites/items/${item.id}/candidates`, {
  captureId: capture.id, recipe, imageCandidates: [],
  fieldEvidence: {
    title: quote('演练菜：番茄炒蛋'),
    ingredients: [quote('番茄两个'), quote('鸡蛋三个'), quote('盐少许')],
    steps: [quote('番茄切块，鸡蛋打散。'), quote('先炒蛋，再下番茄，加盐炒匀。')],
  },
  unresolved: ['火候没说'],
});
console.log(JSON.stringify({ ok: true, candidate: candidate.id, status: candidate.status }));
