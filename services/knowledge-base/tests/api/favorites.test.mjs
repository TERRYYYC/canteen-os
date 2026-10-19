import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from '../../apps/api/app.mjs';

const row = (index, kind, id, text) => ({
  index: String(index), folder: '吃的', kind, content_id: id,
  url: `https://www.douyin.com/${kind === 'note' ? 'note' : 'video'}/${id}`,
  author: '作者', card_alt: `作者：${text}`, display_text: text,
});
const sample = { folder: '吃的', claimedCount: 264, rows: [
  row(2, 'video', '7000000000000000002', '古法羊腩煲，配方很好'),
  row(44, 'note', '7000000000000000001', '蜜汁叉烧，1 公斤肉'),
  { ...row(45, 'video', '7000000000000000004', '坏链接'), url: 'https://other.example/video/7000000000000000004' },
] };

async function request(app, method, path, payload) {
  return app.inject({ method, url: `/api/v1${path}`, headers: { host: '127.0.0.1:4390', ...(method === 'GET' ? {} : { 'x-kb-client': 'agent' }) }, ...(payload === undefined ? {} : { payload }) });
}

test('favorites prepare is read only; apply is idempotent and keeps bad rows and coverage gap after restart', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'kb-favorites-'));
  let app = await buildApp({ dataDir });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  const prepared = await request(app, 'POST', '/favorites/import/prepare', sample);
  assert.equal(prepared.statusCode, 200, prepared.body);
  assert.equal(prepared.json().validCount, 2);
  assert.equal(prepared.json().rejectedCount, 1);
  assert.equal(prepared.json().coverageGap, 262);
  assert.equal((await request(app, 'GET', '/favorites/items')).json().items.length, 0);

  const applied = await request(app, 'POST', '/favorites/import/apply', sample);
  assert.equal(applied.statusCode, 201, applied.body);
  assert.equal(applied.json().insertedCount, 2);
  assert.equal(applied.json().rejectedCount, 1);
  assert.equal(applied.json().coverageGap, 262);
  const replay = await request(app, 'POST', '/favorites/import/apply', sample);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().id, applied.json().id);
  assert.equal(replay.json().replayed, true);
  assert.equal(replay.json().insertedCount, 2);
  assert.equal((await request(app, 'GET', '/favorites/items')).json().items.length, 2);
  const batch = await request(app, 'GET', `/favorites/imports/${applied.json().id}`);
  assert.equal(batch.statusCode, 200, batch.body);
  assert.equal(batch.json().rejections.length, 1);
  assert.equal(batch.json().rejections[0].code, 'INVALID_SOURCE_URL');

  await app.close(); app = await buildApp({ dataDir });
  assert.equal((await request(app, 'GET', '/favorites/items')).json().items.length, 2);
  assert.equal((await request(app, 'GET', `/favorites/imports/${applied.json().id}`)).json().coverageGap, 262);
});

test('a later import links the same source item without resetting its state or duplicating it', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'kb-favorites-'));
  const app = await buildApp({ dataDir });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  const first = await request(app, 'POST', '/favorites/import/apply', sample);
  assert.equal(first.statusCode, 201, first.body);
  const changed = { ...sample, rows: [{ ...sample.rows[0], display_text: '更新的卡片文字' }] };
  const second = await request(app, 'POST', '/favorites/import/apply', changed);
  assert.equal(second.statusCode, 201, second.body);
  assert.equal(second.json().insertedCount, 0);
  const items = (await request(app, 'GET', '/favorites/items')).json().items;
  assert.equal(items.length, 2);
  assert.equal(items.find(x => x.contentId === sample.rows[0].content_id).displayText, sample.rows[0].display_text);
  assert.equal(items.find(x => x.contentId === sample.rows[0].content_id).state, 'evidence_pending');
});

test('manual post evidence is immutable, replayable and never conflated with a card or blocked request', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'kb-favorites-'));
  let app = await buildApp({ dataDir });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  await request(app, 'POST', '/favorites/import/apply', sample);
  const item = (await request(app, 'GET', '/favorites/items')).json().items.find(x => x.kind === 'note');
  const card = await request(app, 'POST', `/favorites/items/${item.id}/captures`, {
    method: 'card', status: 'card_only', evidence: { sourceUrl: item.url, text: item.cardAlt },
  });
  assert.equal(card.statusCode, 201, card.body);
  assert.equal((await request(app, 'GET', `/favorites/items/${item.id}`)).json().state, 'evidence_pending');
  const invalid = await request(app, 'POST', `/favorites/items/${item.id}/captures`, {
    method: 'card', status: 'ready', evidence: { sourceUrl: item.url, text: item.cardAlt },
  });
  assert.equal(invalid.statusCode, 400, invalid.body);
  const evidence = { sourceUrl: item.url, text: '肉一公斤，盐三克。',
    segments: [{ kind: 'post_text', locator: '正文第 1 行', text: '肉一公斤，盐三克。' }],
    images: [{ url: 'https://example.test/preview.jpg', role: 'preview', licenseStatus: 'unknown', sourceUrl: item.url }],
  };
  const ready = await request(app, 'POST', `/favorites/items/${item.id}/captures`, { method: 'manual_post', status: 'ready', evidence });
  assert.equal(ready.statusCode, 201, ready.body);
  assert.equal(ready.json().status, 'ready');
  assert.equal((await request(app, 'GET', `/favorites/items/${item.id}`)).json().state, 'evidence_ready');
  const replay = await request(app, 'POST', `/favorites/items/${item.id}/captures`, { method: 'manual_post', status: 'ready', evidence });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().id, ready.json().id);
  const captures = (await request(app, 'GET', `/favorites/items/${item.id}/captures`)).json().items;
  assert.equal(captures.length, 2);
  assert.equal(captures.find(x => x.id === ready.json().id).evidence.images[0].role, 'preview');
  await app.close(); app = await buildApp({ dataDir });
  assert.equal((await request(app, 'GET', `/favorites/items/${item.id}`)).json().state, 'evidence_ready');
});

test('whole-video evidence retains media identity, timed observations and unresolved questions', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'kb-video-evidence-'));
  const app = await buildApp({ dataDir });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  await request(app, 'POST', '/favorites/import/apply', sample);
  const item = (await request(app, 'GET', '/favorites/items')).json().items.find(x => x.kind === 'video');
  const evidence = { sourceUrl:item.url, media:{ sha256:'a'.repeat(64), durationMs:120000, byteCount:12345,
    audioDurationMs:120000, videoDurationMs:119950, sourceMethod:'browser_playback',
    coverage:{audioProcessedThroughMs:120000,frameCount:240,lastFrameMs:119500,maxFrameGapMs:500} },
    segments:[{ id:'sub-title', kind:'subtitle', locator:'00:01', startMs:1000, endMs:2000, text:'羊腩煲' },
      { id:'sub-meat', kind:'subtitle', locator:'00:10', startMs:10000, endMs:11000, text:'羊腩5斤' },
      { id:'vis-fry', kind:'visual', locator:'01:00', startMs:60000, endMs:61000, text:'整块羊肉下锅炸' }] };
  const captured = await request(app, 'POST', `/favorites/items/${item.id}/captures`, { method:'video_analysis', status:'ready', evidence });
  assert.equal(captured.statusCode, 201, captured.body);
  assert.deepEqual(captured.json().evidence.media, evidence.media);
  assert.equal((await request(app, 'GET', `/favorites/items/${item.id}`)).json().state, 'evidence_ready');
  const recipe = { title:{zh:'羊腩煲'}, ingredients:[{ id:'497fd12d-d38e-4742-a157-86c0562c2e9b',name:{zh:'羊腩'},amount:{kind:'exact',value:'5',unit:'斤',raw:'5斤'} }],
    steps:[{id:'49e04de3-bdc5-4b8b-9760-423dad360b5a',text:{zh:'整块羊肉下锅炸'}}] };
  const proposed = await request(app, 'POST', `/favorites/items/${item.id}/candidates`, {captureId:captured.json().id,recipe,
    fieldEvidence:{title:{locator:'00:01',quote:'羊腩煲',evidenceIds:['sub-title']},ingredients:[{locator:'00:10',quote:'羊腩5斤',evidenceIds:['sub-meat']}],
      steps:[{locator:'01:00',quote:'整块羊肉下锅炸',evidenceIds:['vis-fry']}]}, imageCandidates:[],unresolved:['煲煮时长未说明']});
  assert.equal(proposed.statusCode, 201, proposed.body);
  assert.deepEqual(proposed.json().unresolved,['煲煮时长未说明']);
  const invalid = await request(app, 'POST', `/favorites/items/${item.id}/captures`, { method:'video_analysis', status:'ready', evidence:{...evidence,segments:[{...evidence.segments[0],endMs:130000}]} });
  assert.equal(invalid.statusCode, 400, invalid.body);
  const partial = await request(app, 'POST', `/favorites/items/${item.id}/captures`, { method:'video_analysis', status:'ready', evidence:{...evidence,media:{...evidence.media,coverage:{...evidence.media.coverage,lastFrameMs:3000}}} });
  assert.equal(partial.statusCode,400,partial.body);
  const noAudioProof = await request(app, 'POST', `/favorites/items/${item.id}/captures`, {method:'video_analysis',status:'ready',evidence:{...evidence,media:{...evidence.media,audioDurationMs:undefined,coverage:{...evidence.media.coverage,audioProcessedThroughMs:0}}}});
  assert.equal(noAudioProof.statusCode,400,noAudioProof.body);
  const withoutVideoIds = await request(app,'POST',`/favorites/items/${item.id}/candidates`,{captureId:captured.json().id,recipe,
    fieldEvidence:{title:{locator:'00:01',quote:'羊腩煲'},ingredients:[{locator:'00:10',quote:'羊腩5斤',evidenceIds:['sub-meat']}],
      steps:[{locator:'01:00',quote:'整块羊肉下锅炸',evidenceIds:['vis-fry']}]},imageCandidates:[]});
  assert.equal(withoutVideoIds.statusCode,400,withoutVideoIds.body);
  const crossedCitation = await request(app,'POST',`/favorites/items/${item.id}/candidates`,{captureId:captured.json().id,recipe,
    fieldEvidence:{title:{locator:'00:10',quote:'羊腩煲',evidenceIds:['sub-title','sub-meat']},ingredients:[{locator:'00:10',quote:'羊腩5斤',evidenceIds:['sub-meat']}],
      steps:[{locator:'01:00',quote:'整块羊肉下锅炸',evidenceIds:['vis-fry']}]},imageCandidates:[]});
  assert.equal(crossedCitation.statusCode,400,crossedCitation.body);
  const unsupportedYield=await request(app,'POST',`/favorites/items/${item.id}/candidates`,{captureId:captured.json().id,recipe:{...recipe,baseServings:50},
    fieldEvidence:{title:{locator:'00:01',quote:'羊腩煲',evidenceIds:['sub-title']},ingredients:[{locator:'00:10',quote:'羊腩5斤',evidenceIds:['sub-meat']}],
      steps:[{locator:'01:00',quote:'整块羊肉下锅炸',evidenceIds:['vis-fry']}]},imageCandidates:[]});
  assert.equal(unsupportedYield.statusCode,400,unsupportedYield.body);
  const impossibleVideoDuration=await request(app,'POST',`/favorites/items/${item.id}/captures`,{method:'video_analysis',status:'ready',evidence:{...evidence,media:{...evidence.media,videoDurationMs:1}}});
  assert.equal(impossibleVideoDuration.statusCode,400,impossibleVideoDuration.body);
  const silentWithSpeech=await request(app,'POST',`/favorites/items/${item.id}/captures`,{method:'video_analysis',status:'ready',evidence:{...evidence,media:{...evidence.media,audioDurationMs:0,coverage:{...evidence.media.coverage,audioProcessedThroughMs:0}},segments:[...evidence.segments,{id:'fake-spoken',kind:'spoken',locator:'01:10',startMs:70000,endMs:71000,text:'加盐'}]}});
  assert.equal(silentWithSpeech.statusCode,400,silentWithSpeech.body);
  const speechPastAudio=await request(app,'POST',`/favorites/items/${item.id}/captures`,{method:'video_analysis',status:'ready',evidence:{...evidence,media:{...evidence.media,audioDurationMs:119000,coverage:{...evidence.media.coverage,audioProcessedThroughMs:119000}},segments:[...evidence.segments,{id:'late-spoken',kind:'spoken',locator:'01:10',startMs:70000,endMs:120500,text:'加盐'}]}});
  assert.equal(speechPastAudio.statusCode,400,speechPastAudio.body);
  const visualPastVideo=await request(app,'POST',`/favorites/items/${item.id}/captures`,{method:'video_analysis',status:'ready',evidence:{...evidence,media:{...evidence.media,videoDurationMs:119000},segments:evidence.segments.map(s=>s.id==='vis-fry'?{...s,endMs:120500}:s)}});
  assert.equal(visualPastVideo.statusCode,400,visualPastVideo.body);
  const borrowedPostText=await request(app,'POST',`/favorites/items/${item.id}/captures`,{method:'video_analysis',status:'ready',evidence:{...evidence,segments:[...evidence.segments,{id:'post-text',kind:'post_text',locator:'01:10',startMs:70000,endMs:71000,text:'加盐'}]}});
  assert.equal(borrowedPostText.statusCode,400,borrowedPostText.body);
  const approved=await request(app,'POST',`/favorites/candidates/${proposed.json().id}/review`,{decision:'approve',reviewer:'测试厨师',note:'已逐项核对，保留原视频未说明的条件'});
  assert.equal(approved.statusCode,200,approved.body);
  const revision=await request(app,'GET',`/recipes/${approved.json().recipeId}/revisions/${approved.json().recipeVersion}`);
  assert.deepEqual(revision.json().recipe.sources[0].evidence.unresolved,['煲煮时长未说明']);
});

test('review saves one evidence-linked KB recipe version and cannot approve card-only suggestions', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'kb-favorites-'));
  const app = await buildApp({ dataDir });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  await request(app, 'POST', '/favorites/import/apply', sample);
  const items = (await request(app, 'GET', '/favorites/items')).json().items;
  const note = items.find(x => x.kind === 'note');
  const video = items.find(x => x.kind === 'video');
  const card = await request(app, 'POST', `/favorites/items/${note.id}/captures`, { method: 'card', status: 'card_only', evidence: { sourceUrl: note.url, text: '蜜汁叉烧，1 公斤肉，加盐，腌肉。' } });
  assert.equal(card.statusCode, 201, card.body);
  const proposal = captureId => ({ captureId, recipe: { title: { zh: '蜜汁叉烧' }, ingredients: [
    { id: '497fd12d-d38e-4742-a157-86c0562c2e9b', name: { zh: '肉' }, amount: { kind: 'exact', value: '1', unit: '公斤', raw: '1 公斤肉' } },
    { id: '1df4c90b-f935-4267-aa34-df624a13a413', name: { zh: '盐' }, role: 'seasoning', amount: { kind: 'unknown' } },
  ], steps: [{ id: '49e04de3-bdc5-4b8b-9760-423dad360b5a', text: { zh: '腌肉' } }] },
    fieldEvidence: { title: { locator: '正文', quote: '蜜汁叉烧' }, ingredients: [
      { locator: '正文', quote: '1 公斤肉' }, { locator: '正文', quote: '盐' },
    ], steps: [{ locator: '正文', quote: '腌肉' }] }, imageCandidates: [] });
  const provisional = await request(app, 'POST', `/favorites/items/${note.id}/candidates`, proposal(card.json().id));
  assert.equal(provisional.statusCode, 201, provisional.body);
  assert.equal(provisional.json().status, 'needs_review');
  const provisionalReplay = await request(app, 'POST', `/favorites/items/${note.id}/candidates`, proposal(card.json().id));
  assert.equal(provisionalReplay.statusCode, 200, provisionalReplay.body);
  assert.equal(provisionalReplay.json().id, provisional.json().id);
  assert.equal((await request(app, 'POST', `/favorites/candidates/${provisional.json().id}/review`, { decision: 'approve', reviewer: '师傅', note: '仅卡片，尚未看原帖' })).statusCode, 409);
  assert.equal((await request(app, 'GET', '/recipes')).json().items.length, 0);

  const ready = await request(app, 'POST', `/favorites/items/${video.id}/captures`, { method: 'manual_post', status: 'ready', evidence: {
    sourceUrl: video.url, text: '蜜汁叉烧。1 公斤肉，加盐，腌肉。', segments: [{ kind: 'post_text', locator: '正文', text: '蜜汁叉烧。1 公斤肉，加盐，腌肉。' }],
  } });
  assert.equal(ready.statusCode, 201, ready.body);
  const candidate = await request(app, 'POST', `/favorites/items/${video.id}/candidates`, proposal(ready.json().id));
  assert.equal(candidate.statusCode, 201, candidate.body);
  const approved = await request(app, 'POST', `/favorites/candidates/${candidate.json().id}/review`, { decision: 'approve', reviewer: '师傅', note: '已对照原帖' });
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal(approved.json().status, 'approved');
  assert.equal(approved.json().recipeVersion, 1);
  const repeat = await request(app, 'POST', `/favorites/candidates/${candidate.json().id}/review`, { decision: 'approve', reviewer: '师傅', note: '已对照原帖' });
  assert.equal(repeat.statusCode, 200, repeat.body);
  assert.equal(repeat.json().recipeId, approved.json().recipeId);
  assert.equal((await request(app, 'GET', '/recipes')).json().items.length, 1);
  const recipe = (await request(app, 'GET', `/recipes/${approved.json().recipeId}/revisions/1`)).json();
  assert.equal(recipe.sourceRecords[0].url, video.url);
  assert.equal(recipe.recipe.ingredients[1].amount.kind, 'unknown');
  assert.equal(recipe.recipe.sources[0].evidence.captureHash, ready.json().sha256);
});

test('capture failure and human non-recipe decision retain their reasons without creating recipes', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'kb-favorites-'));
  const app = await buildApp({ dataDir });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  await request(app, 'POST', '/favorites/import/apply', sample);
  const item = (await request(app, 'GET', '/favorites/items')).json().items.find(x => x.kind === 'video');
  const failure = await request(app, 'POST', `/favorites/items/${item.id}/captures`, {
    method: 'platform_error', status: 'blocked_auth', evidence: { sourceUrl: item.url, httpStatus: 403, error: '匿名访问被拒绝' },
  });
  assert.equal(failure.statusCode, 201, failure.body);
  assert.equal((await request(app, 'GET', `/favorites/items/${item.id}`)).json().state, 'blocked_auth');
  assert.equal((await request(app, 'POST', `/favorites/items/${item.id}/classify`, { decision: 'non_recipe', captureId: failure.json().id, reviewer: '师傅', reason: '只是探店' })).statusCode, 409);
  const ready = await request(app, 'POST', `/favorites/items/${item.id}/captures`, {
    method: 'manual_post', status: 'ready', evidence: { sourceUrl: item.url, text: '今天逛了伊犁的餐厅，没有讲做法。' },
  });
  assert.equal(ready.statusCode, 201, ready.body);
  const classified = await request(app, 'POST', `/favorites/items/${item.id}/classify`, { decision: 'non_recipe', captureId: ready.json().id, reviewer: '师傅', reason: '探店，无配方步骤' });
  assert.equal(classified.statusCode, 200, classified.body);
  assert.equal(classified.json().state, 'non_recipe');
  assert.equal((await request(app, 'POST', `/favorites/items/${item.id}/candidates`, { captureId: ready.json().id })).statusCode, 409);
  assert.equal((await request(app, 'POST', `/favorites/items/${item.id}/classify`, { decision: 'non_recipe', captureId: ready.json().id, reviewer: '师傅', reason: '探店，无配方步骤' })).json().state, 'non_recipe');
  assert.equal((await request(app, 'GET', '/recipes')).json().items.length, 0);
});
