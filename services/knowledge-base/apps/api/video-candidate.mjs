import { createHash } from 'node:crypto';

const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const whole = value => Number.isSafeInteger(value) && value >= 0;
const fail = message => { throw new Error(message); };

function stableId(sourceHash, kind, index) {
  const hex = createHash('sha256').update(`${sourceHash}:${kind}:${index}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

function time(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
}

function amount(raw) {
  if (raw == null || raw === '') return { kind:'unknown' };
  if (typeof raw !== 'string' || !raw.trim()) fail('Invalid ingredient quantity');
  const value = raw.trim();
  if (value === '适量') return { kind:'to_taste', raw:value };
  const exact = /^(?:([1-9]\d*(?:\.\d+)?)|(0\.\d*[1-9]\d*))\s*(克|千克|公斤|斤|两|毫升|升|片|个|根|段|勺)$/.exec(value);
  return exact ? { kind:'exact',value:exact[1] ?? exact[2],unit:exact[3],raw:value } : { kind:'text',raw:value };
}

export function buildVideoImport({ item, source, evidence, candidate, sourceMethod }) {
  if (item?.kind !== 'video' || typeof item.url !== 'string' || !/^https:\/\/www\.douyin\.com\/video\/[0-9]{15,22}$/.test(item.url)) fail('Invalid video source item');
  if (source?.sourceUrl !== item.url || source.workId !== item.url.split('/').at(-1)) fail('Media manifest does not match source item');
  if (source.accessMethod !== sourceMethod) fail('Acquisition method does not match media manifest');
  if (!sha(source?.sha256) || !sha(candidate?.sourceSha256) || source.sha256 !== candidate.sourceSha256) fail('Source and candidate media hash mismatch');
  if (!whole(source.byteCount) || !source.byteCount || !whole(source.durationMs) || !source.durationMs ||
    !whole(source.audioDurationMs) || source.audioDurationMs > source.durationMs + 1000 ||
    !whole(source.videoDurationMs) || !source.videoDurationMs || source.videoDurationMs < source.durationMs - 2000 || source.videoDurationMs > source.durationMs + 1000 ||
    source.streams?.video !== true || source.streams.audio !== (source.audioDurationMs > 0) ||
    !['f2','browser_playback','user_file'].includes(sourceMethod)) fail('Invalid source media metadata');
  const coverage = source.analysisCoverage;
  if (!coverage || !whole(coverage.audioProcessedThroughMs) || !whole(coverage.frameCount) || !whole(coverage.lastFrameMs) ||
    !whole(coverage.maxFrameGapMs) || coverage.maxFrameGapMs < 1 || coverage.maxFrameGapMs > 2000 ||
    coverage.lastFrameMs < source.videoDurationMs - 2000 || coverage.lastFrameMs > source.videoDurationMs + 1000 ||
    (source.audioDurationMs > 0 ? coverage.audioProcessedThroughMs < source.audioDurationMs - 1000 || coverage.audioProcessedThroughMs > source.audioDurationMs + 1000 : coverage.audioProcessedThroughMs !== 0) ||
    coverage.frameCount * coverage.maxFrameGapMs < coverage.lastFrameMs) fail('Incomplete source media analysis coverage');
  if (candidate.classification !== 'recipe' || candidate.status !== 'needs_human_review' || candidate.approvedForMenu !== false || candidate.approvedForProcurement !== false) fail('Only unapproved recipe candidates can enter the inbox');
  if (!Array.isArray(evidence) || !evidence.length || evidence.length > 1000 || !Array.isArray(candidate.ingredients) || !Array.isArray(candidate.steps) ||
    !candidate.ingredients.length || !candidate.steps.length || typeof candidate.title !== 'string' || !candidate.title.trim()) fail('Incomplete video candidate');
  if (candidate.unresolved !== undefined && !Array.isArray(candidate.unresolved)) fail('Invalid unresolved question');
  const byId = new Map();
  const segments = evidence.map(row => {
    if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(row.id) || byId.has(row.id) ||
      !['spoken','subtitle','visual'].includes(row.kind) || !whole(row.startMs) || !whole(row.endMs) || row.endMs < row.startMs ||
      (row.kind === 'spoken' ? source.audioDurationMs === 0 || row.endMs > source.audioDurationMs + 1000 : row.endMs > source.videoDurationMs + 1000) ||
      typeof row.text !== 'string' || !row.text.trim()) fail('Invalid timed evidence');
    byId.set(row.id,row);
    return { id:row.id,kind:row.kind,locator:`${time(row.startMs)}–${time(row.endMs)}`,startMs:row.startMs,endMs:row.endMs,text:row.text };
  });
  const cite = ids => {
    if (!Array.isArray(ids) || !ids.length || ids.length > 30 || ids.some(id => !byId.has(id))) fail('Missing field evidence');
    const first = byId.get(ids[0]);
    return { locator:`${time(first.startMs)}–${time(first.endMs)}`,quote:first.text,evidenceIds:ids };
  };
  const ingredients = candidate.ingredients.map((row,index) => {
    if (typeof row?.name !== 'string' || !row.name.trim()) fail('Invalid ingredient name');
    if (!['stated','stated_imprecise','not_stated'].includes(row.quantityState) ||
      (row.quantityState === 'not_stated' ? row.rawQuantity != null && row.rawQuantity !== '' : typeof row.rawQuantity !== 'string' || !row.rawQuantity.trim())) fail('Ingredient quantityState is not checked or invalid');
    if (row.uncertainty !== undefined && row.uncertainty !== null && (typeof row.uncertainty !== 'string' || !row.uncertainty.trim())) fail('Invalid ingredient uncertainty');
    if (row.substituteFor) fail('An alternative must be attached to the original ingredient, not a separate shopping ingredient');
    cite(row.evidenceIds);
    if (row.substitution) {
      if (typeof row.substitution.name !== 'string' || !row.substitution.name.trim()) fail('Invalid substitution');
      cite(row.substitution.evidenceIds);
    }
    const mappedAmount = row.quantityState === 'not_stated' ? {kind:'unknown'} :
      row.quantityState === 'stated_imprecise' ? {kind:'text',raw:row.rawQuantity.trim()} : amount(row.rawQuantity);
    return { id:stableId(source.sha256,'ingredient',index),name:{zh:row.name.trim()},amount:mappedAmount,
      ...((row.prep || row.substitution) ? {preparation:{zh:[row.prep,
        row.substitution ? `可用${row.substitution.name}替代；${row.substitution.uncertainty ?? '替代量待核实'}` : null].filter(Boolean).join('；')}} : {}) };
  });
  const steps = candidate.steps.map((row,index) => {
    if (typeof row?.action !== 'string' || !row.action.trim() || row.order !== index + 1) fail('Invalid step order or action');
    if (row.unknowns !== undefined && (!Array.isArray(row.unknowns) || row.unknowns.some(value => typeof value !== 'string' || !value.trim()))) fail('Invalid step unknowns');
    cite(row.evidenceIds);
    return { id:stableId(source.sha256,'step',index),text:{zh:row.action.trim()} };
  });
  const unresolved = [...new Set([...(candidate.unresolved ?? []),
    ...candidate.ingredients.filter(row => row.uncertainty).map(row => `${row.name}：${row.uncertainty}`),
    ...candidate.steps.flatMap(row => (row.unknowns ?? []).map(value => `步骤 ${row.order}：${value}`))])];
  if (unresolved.length > 100 || unresolved.some(x => typeof x !== 'string' || !x.trim())) fail('Invalid unresolved question');
  const media = { sha256:source.sha256,durationMs:source.durationMs,byteCount:source.byteCount,sourceMethod,coverage,
    audioDurationMs:source.audioDurationMs,videoDurationMs:source.videoDurationMs };
  const recipe = { title:{zh:candidate.title.trim()},ingredients,steps,sources:[],assets:[] };
  // AI-reported yield is not a kitchen scaling basis. A cook records baseServings in a reviewed KB revision.
  return { capture:{method:'video_analysis',status:'ready',evidence:{sourceUrl:item.url,media,segments}},
    proposal:{recipe,fieldEvidence:{title:cite(candidate.titleEvidenceIds),
      ingredients:candidate.ingredients.map(row => cite(row.evidenceIds)),steps:candidate.steps.map(row => cite(row.evidenceIds))},imageCandidates:[],unresolved} };
}
