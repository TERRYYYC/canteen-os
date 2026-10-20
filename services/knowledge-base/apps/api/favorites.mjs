import { randomUUID } from 'node:crypto';
import { fail } from './errors.mjs';
import { canonical, hash, recipeBody, uuid } from './validation.mjs';
import { transaction } from './database.mjs';

const ID = /^[0-9]{15,22}$/;
const text = (value, max) => typeof value === 'string' && value.length <= max;
const publicBatch = row => ({
  id: row.id, digest: row.digest, folder: row.folder, claimedCount: row.claimed_count,
  submittedCount: row.submitted_count, validCount: row.valid_count,
  insertedCount: row.inserted_count, rejectedCount: row.rejected_count,
  coverageGap: row.coverage_gap, importedAt: row.imported_at,
});
const publicItem = row => ({
  id: row.id, platform: row.platform, contentId: row.content_id, kind: row.kind,
  url: row.url, folder: row.folder, index: row.first_index, author: row.author,
  cardAlt: row.card_alt, displayText: row.display_text, state: row.state,
  ...(row.last_error ? { lastError: row.last_error } : {}),
  createdAt: row.created_at, updatedAt: row.updated_at,
});
const publicCapture = row => ({ id: row.id, sourceItemId: row.source_item_id, method: row.method,
  status: row.status, evidence: JSON.parse(row.evidence_json), sha256: row.sha256, capturedAt: row.captured_at });
const publicCandidate = row => ({ id: row.id, sourceItemId: row.source_item_id, captureId: row.capture_id,
  ...JSON.parse(row.document), status: row.status, ...(row.reviewer ? { reviewer: row.reviewer } : {}),
  ...(row.review_note !== null ? { reviewNote: row.review_note } : {}),
  ...(row.recipe_id ? { recipeId: row.recipe_id, recipeVersion: row.recipe_version } : {}),
  createdAt: row.created_at, ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}) });

function candidateBody(body, capture) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !['captureId','recipe','fieldEvidence','imageCandidates','unresolved'].includes(k)) ||
      body.captureId !== capture.id || !body.fieldEvidence || Array.isArray(body.fieldEvidence) || typeof body.fieldEvidence !== 'object' ||
      !Array.isArray(body.imageCandidates) || body.imageCandidates.length > 100) fail(400,'INVALID_CANDIDATE','菜谱候选格式不正确。');
  if (body.unresolved !== undefined && (!Array.isArray(body.unresolved) || body.unresolved.length > 100 ||
    body.unresolved.some(value => !text(value,2000) || !value.trim()))) fail(400,'INVALID_CANDIDATE','待核实事项格式不正确。');
  const recipe = recipeBody(body.recipe);
  if (recipe.sources.length || recipe.assets.length) fail(400,'INVALID_CANDIDATE','候选中的来源和图片由审核流程单独关联。');
  if (capture.method === 'video_analysis' && recipe.baseServings !== undefined) fail(400,'INVALID_CANDIDATE','视频候选的原方份数须由师傅在审核后的菜谱修订中核定。');
  const fields = body.fieldEvidence;
  if (Object.keys(fields).some(k => !['title','ingredients','steps'].includes(k)) ||
      !Array.isArray(fields.ingredients) || fields.ingredients.length !== recipe.ingredients.length ||
      !Array.isArray(fields.steps) || fields.steps.length !== recipe.steps.length) fail(400,'INVALID_EVIDENCE','每项食材和步骤都需要原文位置。');
  const evidence = JSON.parse(capture.evidence_json), corpus = [evidence.text ?? '', ...(evidence.segments ?? []).map(s => s.text)].join('\n');
  const refs = [fields.title,...fields.ingredients,...fields.steps];
  const segmentsById = new Map((evidence.segments ?? []).filter(segment => segment.id).map(segment => [segment.id,segment]));
  const invalidRef = ref => {
    if (!ref || Array.isArray(ref) || typeof ref !== 'object' || Object.keys(ref).some(k => !['locator','quote','evidenceIds'].includes(k)) ||
      !text(ref.locator,500) || !ref.locator.trim() || !text(ref.quote,20000) || !ref.quote.trim() || !corpus.includes(ref.quote)) return true;
    if (ref.evidenceIds === undefined) return capture.method === 'video_analysis';
    return !Array.isArray(ref.evidenceIds) || !ref.evidenceIds.length || ref.evidenceIds.length > 30 ||
      ref.evidenceIds.some(id => !segmentsById.has(id)) ||
      !ref.evidenceIds.some(id => segmentsById.get(id).text.includes(ref.quote) &&
        (capture.method !== 'video_analysis' || segmentsById.get(id).locator === ref.locator));
  };
  if (refs.some(invalidRef)) {
    fail(400,'INVALID_EVIDENCE','字段引文必须能在本次证据中找到。');
  }
  const capturedImages = new Map((evidence.images ?? []).map(i => [i.url,i]));
  if (body.imageCandidates.some(i => !i || Array.isArray(i) || typeof i !== 'object' || Object.keys(i).some(k => !['url','role','licenseStatus'].includes(k)) ||
      !capturedImages.has(i.url) || i.role !== capturedImages.get(i.url).role || i.licenseStatus !== capturedImages.get(i.url).licenseStatus)) {
    fail(400,'INVALID_IMAGE_CANDIDATE','图片候选必须来自同一证据并保留角色与许可状态。');
  }
  return { recipe, fieldEvidence: fields, imageCandidates: body.imageCandidates, ...(body.unresolved ? { unresolved:body.unresolved } : {}) };
}

function captureBody(body, sourceUrl, sourceKind) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !['method','status','evidence'].includes(k)) ||
      !['card','manual_post','manual_transcript','official_api','platform_error','video_analysis'].includes(body.method) ||
      !['ready','blocked_auth','unavailable','card_only'].includes(body.status) ||
      !body.evidence || Array.isArray(body.evidence) || typeof body.evidence !== 'object') fail(400,'INVALID_CAPTURE','来源证据格式不正确。');
  const e = body.evidence;
  if (Object.keys(e).some(k => !['sourceUrl','text','segments','images','httpStatus','error','media'].includes(k)) || e.sourceUrl !== sourceUrl ||
      (e.text !== undefined && !text(e.text,200000)) ||
      (e.error !== undefined && !text(e.error,2000)) ||
      (e.httpStatus !== undefined && (!Number.isInteger(e.httpStatus) || e.httpStatus < 100 || e.httpStatus > 599)) ||
      (e.segments !== undefined && (!Array.isArray(e.segments) || e.segments.length > 1000 || e.segments.some(s => !s || Array.isArray(s) || typeof s !== 'object' || Object.keys(s).some(k => !['id','kind','locator','text','startMs','endMs'].includes(k)) ||
        !['post_text','subtitle','image_text','spoken','visual'].includes(s.kind) || !text(s.locator,500) || !s.locator.trim() || !text(s.text,20000) || !s.text.trim() ||
        (s.id !== undefined && (!text(s.id,100) || !/^[a-zA-Z0-9_-]+$/.test(s.id))) ||
        ((s.startMs !== undefined || s.endMs !== undefined) && (!Number.isSafeInteger(s.startMs) || !Number.isSafeInteger(s.endMs) || s.startMs < 0 || s.endMs < s.startMs))))) ||
      (e.images !== undefined && (!Array.isArray(e.images) || e.images.length > 100 || e.images.some(i => !i || Array.isArray(i) || typeof i !== 'object' || Object.keys(i).some(k => !['url','role','licenseStatus','sourceUrl','author','locator'].includes(k)) ||
        !text(i.url,4096) || !safeMediaUrl(i.url) || !['preview','finished','step','ingredient'].includes(i.role) || !['unknown','granted','restricted'].includes(i.licenseStatus) ||
        i.sourceUrl !== sourceUrl || (i.author !== undefined && !text(i.author,500)) || (i.locator !== undefined && !text(i.locator,500)))))) fail(400,'INVALID_CAPTURE','来源证据字段不正确。');
  if (body.method === 'video_analysis') {
    const m = e.media;
    if (sourceKind !== 'video' || body.status !== 'ready' || !m || Array.isArray(m) || typeof m !== 'object' ||
      Object.keys(m).some(k => !['sha256','durationMs','byteCount','audioDurationMs','videoDurationMs','sourceMethod','coverage'].includes(k)) ||
      typeof m.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(m.sha256) || !Number.isSafeInteger(m.durationMs) || m.durationMs <= 0 ||
      !Number.isSafeInteger(m.byteCount) || m.byteCount <= 0 || !['f2','browser_playback','user_file'].includes(m.sourceMethod) ||
      !Number.isSafeInteger(m.audioDurationMs) || m.audioDurationMs < 0 || m.audioDurationMs > m.durationMs + 1000 ||
      !Number.isSafeInteger(m.videoDurationMs) || m.videoDurationMs <= 0 || m.videoDurationMs < m.durationMs - 2000 || m.videoDurationMs > m.durationMs + 1000 ||
      !m.coverage || Array.isArray(m.coverage) || typeof m.coverage !== 'object' ||
      Object.keys(m.coverage).some(k => !['audioProcessedThroughMs','frameCount','lastFrameMs','maxFrameGapMs'].includes(k)) ||
      !Number.isSafeInteger(m.coverage.audioProcessedThroughMs) || m.coverage.audioProcessedThroughMs < 0 || m.coverage.audioProcessedThroughMs > m.durationMs + 1000 ||
      (m.audioDurationMs > 0 ? m.coverage.audioProcessedThroughMs < m.audioDurationMs - 1000 || m.coverage.audioProcessedThroughMs > m.audioDurationMs + 1000 : m.coverage.audioProcessedThroughMs !== 0) ||
      !Number.isSafeInteger(m.coverage.frameCount) || m.coverage.frameCount < 2 ||
      !Number.isSafeInteger(m.coverage.lastFrameMs) || m.coverage.lastFrameMs < m.videoDurationMs - 2000 || m.coverage.lastFrameMs > m.videoDurationMs + 1000 ||
      !Number.isSafeInteger(m.coverage.maxFrameGapMs) || m.coverage.maxFrameGapMs < 1 || m.coverage.maxFrameGapMs > 2000 ||
      m.coverage.frameCount * m.coverage.maxFrameGapMs < m.coverage.lastFrameMs ||
      !e.segments?.length || e.segments.some(s => !s.id || s.startMs === undefined || s.endMs === undefined ||
        !['spoken','subtitle','visual'].includes(s.kind) ||
        (s.kind === 'spoken' ? m.audioDurationMs === 0 || s.endMs > m.audioDurationMs + 1000 : s.endMs > m.videoDurationMs + 1000)) ||
      new Set(e.segments.map(s => s.id)).size !== e.segments.length) fail(400,'INVALID_CAPTURE','整片视频证据需要媒体身份和有效时码。');
  } else if (e.media !== undefined || e.segments?.some(s => s.kind === 'visual' || s.id || s.startMs !== undefined)) {
    fail(400,'INVALID_CAPTURE','视频时码证据须标明视频解析来源。');
  }
  if (body.status === 'ready' && (body.method === 'card' || body.method === 'platform_error' || !((e.text && e.text.trim()) || e.segments?.length))) fail(400,'INVALID_CAPTURE','卡片或错误结果不能作为作品正文。');
  if (body.status === 'card_only' && body.method !== 'card') fail(400,'INVALID_CAPTURE','卡片证据必须明确标为卡片。');
  if (body.status === 'card_only' && !e.text?.trim()) fail(400,'INVALID_CAPTURE','卡片证据不能是空白。');
  if (['blocked_auth','unavailable'].includes(body.status) && !e.error && !e.httpStatus) fail(400,'INVALID_CAPTURE','失败结果需要错误原因或 HTTP 状态。');
  return body;
}

function safeMediaUrl(value) {
  try { const parsed = new URL(value); return ['http:','https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !/[\u0000-\u0020]/.test(value); }
  catch { return false; }
}

function rowIssue(row, folder, seen) {
  if (!row || Array.isArray(row) || typeof row !== 'object') return 'INVALID_ROW';
  if (Object.keys(row).some(key => !['index','folder','kind','content_id','url','author','card_alt','display_text'].includes(key))) return 'INVALID_ROW';
  if (row.folder !== folder || !['video','note'].includes(row.kind) || !text(row.content_id,22) || !ID.test(row.content_id)) return 'INVALID_SOURCE';
  if (!/^[1-9][0-9]{0,5}$/.test(String(row.index)) || !text(row.author,500) || !text(row.card_alt,20000) || !text(row.display_text,20000)) return 'INVALID_CARD';
  if (typeof row.url !== 'string' || row.url !== `https://www.douyin.com/${row.kind}/${row.content_id}`) return 'INVALID_SOURCE_URL';
  if (seen.has(row.content_id)) return 'DUPLICATE_SOURCE_IN_BATCH';
  seen.add(row.content_id);
  return null;
}

export function prepareFavorites(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !['folder','claimedCount','rows'].includes(k)) ||
      !text(body.folder,200) || !body.folder.trim() || !Number.isSafeInteger(body.claimedCount) || body.claimedCount < 0 || body.claimedCount > 100000 ||
      !Array.isArray(body.rows) || body.rows.length > 1000) fail(400, 'INVALID_IMPORT', '收藏导入参数不正确。');
  const seen = new Set();
  const results = body.rows.map((row, n) => ({ rowNumber: n + 1, code: rowIssue(row, body.folder, seen) }));
  const validCount = results.filter(x => !x.code).length;
  if (body.claimedCount < validCount) fail(400, 'INVALID_COUNT', '页面总数不能小于有效作品数。');
  return { digest: hash(body), folder: body.folder, claimedCount: body.claimedCount, submittedCount: body.rows.length,
    validCount, rejectedCount: body.rows.length - validCount, coverageGap: body.claimedCount - validCount,
    rejections: results.filter(x => x.code) };
}

export class FavoritesRepository {
  constructor(db, recipes) { this.db = db; this.recipes = recipes; }
  one(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }

  apply(body) {
    const preview = prepareFavorites(body);
    return transaction(this.db, () => {
      const previous = this.one('SELECT * FROM favorite_import_batches WHERE digest=?', preview.digest);
      if (previous) return { batch: publicBatch(previous), replayed: true };
      const id = randomUUID(), now = new Date().toISOString();
      let inserted = 0;
      this.run(`INSERT INTO favorite_import_batches(id,digest,folder,claimed_count,submitted_count,valid_count,inserted_count,rejected_count,coverage_gap,imported_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`, id, preview.digest, preview.folder, preview.claimedCount, preview.submittedCount,
        preview.validCount, 0, preview.rejectedCount, preview.coverageGap, now);
      const rejected = new Map(preview.rejections.map(x => [x.rowNumber, x.code]));
      body.rows.forEach((row, index) => {
        const code = rejected.get(index + 1) ?? null;
        let itemId = null;
        if (!code) {
          const existing = this.one("SELECT id FROM favorite_source_items WHERE platform='douyin' AND content_id=?", row.content_id);
          itemId = existing?.id ?? randomUUID();
          if (!existing) {
            this.run(`INSERT INTO favorite_source_items(id,platform,content_id,kind,url,folder,first_index,author,card_alt,display_text,created_at,updated_at)
              VALUES(?,'douyin',?,?,?,?,?,?,?,?,?,?)`, itemId, row.content_id, row.kind, row.url, row.folder, Number(row.index), row.author, row.card_alt, row.display_text, now, now);
            inserted++;
          }
        }
        this.run('INSERT INTO favorite_import_rows(batch_id,row_number,raw_json,source_item_id,rejection_code) VALUES(?,?,?,?,?)', id, index + 1, JSON.stringify(row), itemId, code);
      });
      this.run('UPDATE favorite_import_batches SET inserted_count=? WHERE id=?', inserted, id);
      return { batch: publicBatch(this.one('SELECT * FROM favorite_import_batches WHERE id=?', id)), replayed: false };
    });
  }

  batch(id) {
    const row = this.one('SELECT * FROM favorite_import_batches WHERE id=?', id);
    if (!row) fail(404, 'IMPORT_NOT_FOUND', '收藏导入批次不存在。');
    return { ...publicBatch(row), rejections: this.all('SELECT row_number,rejection_code FROM favorite_import_rows WHERE batch_id=? AND rejection_code IS NOT NULL ORDER BY row_number', id)
      .map(x => ({ rowNumber: x.row_number, code: x.rejection_code })) };
  }

  batches() { return { items: this.all('SELECT * FROM favorite_import_batches ORDER BY imported_at DESC,id DESC LIMIT 50').map(publicBatch) }; }

  item(id) {
    const row = this.one('SELECT * FROM favorite_source_items WHERE id=?',id);
    if (!row) fail(404,'SOURCE_ITEM_NOT_FOUND','收藏作品不存在。');
    const classification = this.one('SELECT * FROM favorite_classifications WHERE source_item_id=?',id);
    return { ...publicItem(row), ...(classification ? { classification:{ decision:classification.decision,reviewer:classification.reviewer,reason:classification.reason,captureId:classification.capture_id,createdAt:classification.created_at } } : {}) };
  }

  captures(id) {
    this.item(id);
    return { items: this.all('SELECT * FROM favorite_captures WHERE source_item_id=? ORDER BY captured_at DESC,id DESC',id).map(publicCapture) };
  }

  capture(id, input) {
    return transaction(this.db, () => {
      const item = this.item(id);
      const body = captureBody(input,item.url,item.kind), digest = hash(body);
      const prior = this.one('SELECT * FROM favorite_captures WHERE source_item_id=? AND sha256=?',id,digest);
      if (prior) return { capture: publicCapture(prior), replayed: true };
      const captureId = randomUUID(), now = new Date().toISOString();
      this.run('INSERT INTO favorite_captures(id,source_item_id,method,status,evidence_json,sha256,captured_at) VALUES(?,?,?,?,?,?,?)',
        captureId,id,body.method,body.status,JSON.stringify(body.evidence),digest,now);
      if (body.status === 'ready') this.run("UPDATE favorite_source_items SET state='evidence_ready',last_error=NULL,updated_at=? WHERE id=? AND state IN ('evidence_pending','blocked_auth','unavailable')",now,id);
      else if (['blocked_auth','unavailable'].includes(body.status)) this.run("UPDATE favorite_source_items SET state=?,last_error=?,updated_at=? WHERE id=? AND state IN ('evidence_pending','blocked_auth','unavailable')",
        body.status,body.evidence.error ?? `HTTP ${body.evidence.httpStatus}`,now,id);
      return { capture: publicCapture(this.one('SELECT * FROM favorite_captures WHERE id=?',captureId)), replayed: false };
    });
  }

  candidates(id) {
    this.item(id);
    return { items: this.all('SELECT * FROM favorite_candidates WHERE source_item_id=? ORDER BY created_at DESC,id DESC',id).map(row => this.candidate(row.id)) };
  }

  candidate(id) {
    const row = this.one('SELECT * FROM favorite_candidates WHERE id=?',id);
    if (!row) fail(404,'CANDIDATE_NOT_FOUND','菜谱候选不存在。');
    return { ...publicCandidate(row), illustrations: this.illustrations(id) };
  }

  illustrations(id) {
    return this.all('SELECT * FROM favorite_candidate_illustrations WHERE candidate_id=? ORDER BY created_at,id',id).map(row => ({ id:row.id, ...JSON.parse(row.document), url:`/api/v1/assets/${row.asset_id}/content`, createdAt:row.created_at }));
  }

  sourceIllustrations(recipeId, version) {
    return transaction(this.db, () => {
      this.recipes.recipeRow(recipeId);
      const revision=this.recipes.revision(recipeId,version);
      const candidate=this.one(`SELECT id,recipe_version,document FROM favorite_candidates
        WHERE recipe_id=? AND status='approved' AND recipe_version<=?
        ORDER BY recipe_version DESC,reviewed_at DESC,id DESC LIMIT 1`,recipeId,version);
      if (!candidate) return {recipeId,recipeVersion:version,candidateId:null,approvedCandidateVersion:null,illustrations:[],stepLinks:[]};
      const sourceSteps=JSON.parse(candidate.document).recipe.steps;
      const revisionSteps=new Map(revision.recipe.steps.map(step=>[step.id,step]));
      const stepLinks=sourceSteps.map(step=>({sourceStepId:step.id,
        recipeStepId:revisionSteps.has(step.id)&&canonical(revisionSteps.get(step.id).text)===canonical(step.text)?step.id:null}));
      const illustrations=this.all('SELECT asset_id,document FROM favorite_candidate_illustrations WHERE candidate_id=? ORDER BY created_at,id',candidate.id)
        .map(row=>{
          const {role,stepId,caption}=JSON.parse(row.document);
          return {assetId:row.asset_id,role,sourceStepId:role==='step'?stepId:null,...(caption?{caption}:{}),rightsState:'pending'};
        });
      return {recipeId,recipeVersion:version,candidateId:candidate.id,approvedCandidateVersion:candidate.recipe_version,illustrations,stepLinks};
    },false);
  }

  illustrate(id, body) {
    const fields=['assetId','sourceMediaSha256','frameMs','role','stepId','caption','sourceUrl','author','rightsState'];
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !fields.includes(k)) ||
        fields.some(k => body[k] === undefined) || !/^[0-9a-f]{64}$/.test(body.sourceMediaSha256 ?? '') ||
        !Number.isSafeInteger(body.frameMs) || body.frameMs < 0 || !['ingredient','step','finished'].includes(body.role) ||
        body.rightsState !== 'unknown' || !text(body.sourceUrl,4096) || !text(body.author,500) || !body.author.trim() ||
        !body.caption || Array.isArray(body.caption) || typeof body.caption !== 'object' ||
        !Object.keys(body.caption).length || Object.keys(body.caption).some(k => !['zh','en','uk'].includes(k) || !text(body.caption[k],2000) || !body.caption[k].trim())) {
      fail(400,'INVALID_ILLUSTRATION','原片参考图需有效时码、来源和多语言说明；使用权须保留待核实。');
    }
    uuid(body.assetId); uuid(body.stepId);
    return transaction(this.db, () => {
      const candidate=this.candidate(id);
      const capture=this.one('SELECT * FROM favorite_captures WHERE id=?',candidate.captureId);
      const evidence=JSON.parse(capture.evidence_json), media=evidence.media;
      if (capture.method !== 'video_analysis' || capture.status !== 'ready' || !media || media.sha256 !== body.sourceMediaSha256 || evidence.sourceUrl !== body.sourceUrl)
        fail(422,'ILLUSTRATION_SOURCE_MISMATCH','参考图必须来自候选的同一完整原片。');
      if (body.frameMs > media.videoDurationMs) fail(422,'INVALID_ILLUSTRATION_TIME','图片时码超过原视频时长。');
      if (!candidate.recipe.steps.some(step => step.id === body.stepId)) fail(422,'INVALID_STEP_REFERENCE','参考图须关联本候选中的步骤。');
      const asset=this.recipes.readyAsset(body.assetId);
      if (asset.kind !== 'image' || asset.storage !== 'local' || asset.status !== 'ready') fail(422,'ILLUSTRATION_ASSET_NOT_READY','参考图必须是已上传的内部图片。');
      const {assetId,...identity}=body;
      const digest=hash({...identity,imageSha256:asset.sha256});
      const prior=this.one('SELECT id FROM favorite_candidate_illustrations WHERE candidate_id=? AND digest=?',id,digest);
      if (prior) return { illustration:this.illustrations(id).find(x=>x.id===prior.id), replayed:true };
      if (this.illustrations(id).length >= 100) fail(422,'ILLUSTRATION_LIMIT','每个候选最多保存100张原片参考图。');
      const eventId=randomUUID(),now=new Date().toISOString();
      this.run('INSERT INTO favorite_candidate_illustrations(id,candidate_id,asset_id,digest,document,created_at) VALUES(?,?,?,?,?,?)',eventId,id,assetId,digest,JSON.stringify({...body,imageSha256:asset.sha256}),now);
      return { illustration:this.illustrations(id).find(x=>x.id===eventId), replayed:false };
    });
  }

  propose(itemId, input) {
    return transaction(this.db, () => {
      const item=this.item(itemId);
      if(item.state==='non_recipe')fail(409,'ALREADY_CLASSIFIED','此作品已被标记为非菜谱。');
      const capture = this.one('SELECT * FROM favorite_captures WHERE id=? AND source_item_id=?',uuid(input?.captureId),itemId);
      if (!capture) fail(404,'CAPTURE_NOT_FOUND','来源证据不存在。');
      if (!['ready','card_only'].includes(capture.status)) fail(409,'EVIDENCE_NOT_READY','失败的采集结果不能生成菜谱草稿。');
      const document = candidateBody(input,capture), digest = hash(document), id = randomUUID(), now = new Date().toISOString();
      const previous = this.one('SELECT * FROM favorite_candidates WHERE source_item_id=? AND capture_id=? AND digest=?',itemId,capture.id,digest);
      if (previous) return { candidate:publicCandidate(previous),replayed:true };
      this.run("INSERT INTO favorite_candidates(id,source_item_id,capture_id,digest,document,status,created_at) VALUES(?,?,?,?,?,'needs_review',?)",id,itemId,capture.id,digest,JSON.stringify(document),now);
      this.run("UPDATE favorite_source_items SET state='needs_review',updated_at=? WHERE id=? AND state IN ('evidence_pending','evidence_ready','draft_ready')",now,itemId);
      return { candidate:publicCandidate(this.one('SELECT * FROM favorite_candidates WHERE id=?',id)),replayed:false };
    });
  }

  review(id, body) {
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !['decision','reviewer','note'].includes(k)) ||
        !['approve','reject'].includes(body.decision) || !text(body.reviewer,200) || !body.reviewer.trim() ||
        !text(body.note,2000)) fail(400,'INVALID_REVIEW','审核决定需要审核人和备注。');
    return transaction(this.db, () => {
      const existing = this.candidate(id);
      if (existing.status !== 'needs_review') {
        if (existing.status === (body.decision === 'approve' ? 'approved' : 'rejected') && existing.reviewer === body.reviewer && existing.reviewNote === body.note) return existing;
        fail(409,'ALREADY_REVIEWED','此候选已有不同的审核决定。');
      }
      const candidate = this.one('SELECT * FROM favorite_candidates WHERE id=?',id);
      const capture = this.one('SELECT * FROM favorite_captures WHERE id=?',candidate.capture_id);
      const item = this.item(candidate.source_item_id);
      const now = new Date().toISOString();
      if (body.decision === 'reject') {
        this.run("UPDATE favorite_candidates SET status='rejected',reviewer=?,review_note=?,reviewed_at=? WHERE id=?",body.reviewer,body.note,now,id);
        this.run("UPDATE favorite_source_items SET state='rejected',updated_at=? WHERE id=? AND state<>'approved'",now,item.id);
        return this.candidate(id);
      }
      if(item.state==='non_recipe')fail(409,'ALREADY_CLASSIFIED','此作品已被标记为非菜谱。');
      if (capture.status !== 'ready') fail(409,'ORIGINAL_POST_REQUIRED','必须先核对作品正文或字幕，卡片文字不能直接批准成菜谱。');
      const proposal = JSON.parse(candidate.document), evidence = JSON.parse(capture.evidence_json);
      const sourceId = randomUUID(), sourceText = evidence.text || (evidence.segments ?? []).map(s => s.text).join('\n');
      const metadata = { platform:'douyin',contentId:item.contentId,captureId:capture.id,captureHash:capture.sha256,method:capture.method,reviewer:body.reviewer };
      this.run('INSERT INTO sources(id,kind,title,author,url,text_content,metadata) VALUES(?,?,?,?,?,?,?)',
        sourceId,item.kind === 'video' ? 'video' : 'web',proposal.recipe.title.zh ?? Object.values(proposal.recipe.title)[0],item.author,item.url,sourceText,JSON.stringify(metadata));
      const recipe = { ...proposal.recipe, sources: [{ sourceId, evidence: { captureHash:capture.sha256,fieldEvidence:proposal.fieldEvidence,
        ...(proposal.unresolved?.length ? {unresolved:proposal.unresolved} : {}) } }] };
      const saved = this.recipes.write({ method:'POST',path:'/api/v1/recipes',headers:{ actor:'web',key:`favorite-candidate-${id}`,match:null,version:null },recipe },{ inTransaction:true });
      this.run("UPDATE favorite_candidates SET status='approved',reviewer=?,review_note=?,recipe_id=?,recipe_version=?,reviewed_at=? WHERE id=?",
        body.reviewer,body.note,saved.body.id,saved.body.version,now,id);
      this.run("UPDATE favorite_source_items SET state='approved',updated_at=? WHERE id=?",now,item.id);
      return this.candidate(id);
    });
  }

  classify(id, body) {
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !['decision','captureId','reviewer','reason'].includes(k)) ||
      body.decision !== 'non_recipe' || !text(body.reviewer,200) || !body.reviewer.trim() ||
      !text(body.reason,2000) || !body.reason.trim()) fail(400,'INVALID_CLASSIFICATION','非菜谱判断需要审核人和原因。');
    return transaction(this.db, () => {
      const item = this.item(id), capture = this.one('SELECT * FROM favorite_captures WHERE id=? AND source_item_id=?',uuid(body.captureId),id);
      if (!capture || capture.status !== 'ready') fail(409,'ORIGINAL_POST_REQUIRED','必须先核对作品正文或字幕，才能判断不是菜谱。');
      if (item.state === 'approved') fail(409,'ALREADY_APPROVED','已批准的菜谱不能直接标记为非菜谱。');
      const previous = this.one('SELECT * FROM favorite_classifications WHERE source_item_id=?',id);
      if (previous) {
        if (previous.capture_id === capture.id && previous.reviewer === body.reviewer && previous.reason === body.reason) return this.item(id);
        fail(409,'ALREADY_CLASSIFIED','此作品已有不同的分类决定。');
      }
      const now = new Date().toISOString();
      this.run("INSERT INTO favorite_classifications(source_item_id,capture_id,decision,reviewer,reason,created_at) VALUES(?,?,'non_recipe',?,?,?)",id,capture.id,body.reviewer,body.reason,now);
      this.run("UPDATE favorite_source_items SET state='non_recipe',last_error=NULL,updated_at=? WHERE id=?",now,id);
      return this.item(id);
    });
  }

  items(query) {
    if (!query || Array.isArray(query) || typeof query !== 'object' || Object.keys(query).some(k => !['folder','state','q','cursor','limit'].includes(k))) fail(400,'INVALID_QUERY','查询参数不正确。');
    const folder = query.folder ?? '';
    if (typeof folder !== 'string' || folder.length > 200) fail(400,'INVALID_QUERY','收藏夹名称不正确。');
    const state = query.state ?? '';
    if (typeof state !== 'string' || state.length > 40) fail(400,'INVALID_QUERY','状态不正确。');
    if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 200 || /[\u0000-\u001f\u007f]/.test(query.q))) fail(400,'INVALID_QUERY','菜名查询不正确。');
    const q = query.q?.trim() ?? '';
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || String(limit) !== String(query.limit ?? limit)) fail(400,'INVALID_LIMIT','每页数量必须为 1 到 100。');
    const where = [], args = [];
    if (folder) { where.push('i.folder=?'); args.push(folder); }
    if (state) { where.push('i.state=?'); args.push(state); }
    if (q) {
      where.push(`(instr(lower(json_extract(c.document,'$.recipe.title.zh')),lower(?))>0 OR
        instr(lower(json_extract(c.document,'$.recipe.title.en')),lower(?))>0 OR
        instr(lower(json_extract(c.document,'$.recipe.title.uk')),lower(?))>0)`);
      args.push(q,q,q);
    }
    // Keep old no-search cursors valid; a search term is part of the filter only when present.
    const filter = hash({ folder,state,...(q ? { q } : {}) });
    if (query.cursor) {
      try {
        if (typeof query.cursor !== 'string' || query.cursor.length > 1000 || !/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw Error();
        const c = JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));
        if (!Number.isSafeInteger(c.index) || typeof c.id !== 'string' || c.filter !== filter) throw Error();
        where.push('(i.first_index>? OR (i.first_index=? AND i.id>?))'); args.push(c.index,c.index,c.id);
      } catch { fail(400,'INVALID_CURSOR','收藏分页游标无效。'); }
    }
    // One bounded query: indexed latest-candidate and illustration lookups, no full candidate documents returned.
    const rows = this.all(`SELECT i.*, c.id AS candidate_id, c.status AS candidate_status,
      json_extract(c.document,'$.recipe.title') AS candidate_title,
      json_array_length(c.document,'$.recipe.ingredients') AS ingredient_count,
      json_array_length(c.document,'$.recipe.steps') AS step_count,
      coalesce(json_array_length(c.document,'$.unresolved'),0) AS unresolved_count,
      (SELECT count(*) FROM favorite_candidate_illustrations AS ci WHERE ci.candidate_id=c.id) AS illustration_count,
      (SELECT ci.asset_id FROM favorite_candidate_illustrations AS ci WHERE ci.candidate_id=c.id
        ORDER BY CASE json_extract(ci.document,'$.role') WHEN 'finished' THEN 0 WHEN 'ingredient' THEN 1 ELSE 2 END,
          ci.created_at,ci.id LIMIT 1) AS thumbnail_asset_id
      FROM favorite_source_items AS i
      LEFT JOIN favorite_candidates AS c ON c.id=(SELECT newer.id FROM favorite_candidates AS newer
        WHERE newer.source_item_id=i.id ORDER BY newer.created_at DESC,newer.id DESC LIMIT 1)
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.first_index,i.id LIMIT ?`, ...args,limit+1);
    const page = rows.slice(0,limit), last = page.at(-1);
    return { items: page.map(row => ({ ...publicItem(row), ...(row.candidate_id ? {candidateSummary:{
      candidateId:row.candidate_id,title:JSON.parse(row.candidate_title),status:row.candidate_status,
      ingredientCount:row.ingredient_count,stepCount:row.step_count,illustrationCount:row.illustration_count,
      thumbnailAssetId:row.thumbnail_asset_id,unresolvedCount:row.unresolved_count,
    }} : {}) })), nextCursor: rows.length > limit ? Buffer.from(JSON.stringify({ index:last.first_index,id:last.id,filter })).toString('base64url') : null };
  }
}
