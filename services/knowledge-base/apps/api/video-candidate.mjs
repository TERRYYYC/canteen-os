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

// Only units that map onto a CanteenOS unit without guessing. 片, 根, 段, 勺 and the like keep the words only.
const ORIGINAL_UNITS = { 克:['g',1n], g:['g',1n], 千克:['kg',1n], 公斤:['kg',1n], kg:['kg',1n], 斤:['g',500n], 两:['g',50n],
  毫升:['ml',1n], ml:['ml',1n], 升:['l',1n], L:['l',1n], 个:['pcs',1n], 只:['pcs',1n] };

function scaled(value, factor) {
  const [whole, fraction = ''] = value.split('.');
  const digits = (BigInt(whole + fraction) * factor).toString().padStart(fraction.length + 1, '0');
  const integer = digits.slice(0, digits.length - fraction.length), decimals = digits.slice(digits.length - fraction.length).replace(/0+$/, '');
  return decimals ? `${integer}.${decimals}` : integer;
}

// ADR-0012 §1: a number read from the original words is display-only. It is returned as originalQty and
// never as qty; the canteen quantity is written later by a person, with its source.
export function originalQuantity(raw) {
  const match = /^(?:([1-9]\d*(?:\.\d+)?)|(0\.\d*[1-9]\d*))\s*(克|g|千克|公斤|kg|斤|两|毫升|ml|升|L|个|只)$/.exec(raw.trim());
  if (!match) return undefined;
  const [unit, factor] = ORIGINAL_UNITS[match[3]];
  return { value:scaled(match[1] ?? match[2], factor), unit };
}

const UNKNOWN_KINDS = ['prep-ahead','amount','net-or-gross','cut-size','identity','heat','duration','doneness','other'];
const PREP_AHEAD_ACTIONS = ['marinate','soak','brine','rest','cool','other'];

// An unclear point is plain words (older parses: no kind yet) or {text, kind?, action?}. A given kind is kept as is (K2).
function unclear(value) {
  const entry = typeof value === 'string' ? { text:value } : value;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !['text','kind','action'].includes(key)) ||
    typeof entry.text !== 'string' || !entry.text.trim() || entry.text.trim().length > 2000) fail('Invalid unclear point');
  if (entry.kind !== undefined && entry.kind !== null && !UNKNOWN_KINDS.includes(entry.kind)) fail('Invalid unclear point kind');
  const prepAhead = entry.kind === 'prep-ahead';
  if (prepAhead ? !PREP_AHEAD_ACTIONS.includes(entry.action) : entry.action !== undefined && entry.action !== null) fail('Invalid unclear point action');
  return { ...(entry.kind ? { kind:entry.kind } : {}), ...(prepAhead ? { action:entry.action } : {}), text:entry.text.trim() };
}
const unclearList = value => value === undefined || value === null ? [] : Array.isArray(value) ? value.map(unclear) : [unclear(value)];

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
    unclearList(row.uncertainty);
    if (row.substituteFor) fail('An alternative must be attached to the original ingredient, not a separate shopping ingredient');
    cite(row.evidenceIds);
    if (row.substitution) {
      if (typeof row.substitution.name !== 'string' || !row.substitution.name.trim()) fail('Invalid substitution');
      cite(row.substitution.evidenceIds);
    }
    // Original words only; stated_imprecise keeps its words even when they contain a number.
    const original = row.quantityState === 'not_stated' ? {} : { originalAmount:row.rawQuantity.trim(),
      ...(row.quantityState === 'stated' && originalQuantity(row.rawQuantity) ? { originalQty:originalQuantity(row.rawQuantity) } : {}) };
    return { id:stableId(source.sha256,'ingredient',index),name:{zh:row.name.trim()},...original,
      ...((row.prep || row.substitution) ? {preparation:{zh:[row.prep,
        row.substitution ? `可用${row.substitution.name}替代；${row.substitution.uncertainty ?? '替代量待核实'}` : null].filter(Boolean).join('；')}} : {}) };
  });
  const steps = candidate.steps.map((row,index) => {
    if (typeof row?.action !== 'string' || !row.action.trim() || row.order !== index + 1) fail('Invalid step order or action');
    if (row.unknowns !== undefined && !Array.isArray(row.unknowns)) fail('Invalid step unknowns');
    unclearList(row.unknowns);
    cite(row.evidenceIds);
    return { id:stableId(source.sha256,'step',index),text:{zh:row.action.trim()} };
  });
  // K1: every unclear point keeps where it belongs: a step, an ingredient row, or (neither) the whole dish.
  const located = [
    ...unclearList(candidate.unresolved).map(entry => ({ entry, label:entry.text })),
    ...candidate.ingredients.flatMap((row,index) => unclearList(row.uncertainty).map(entry => ({ entry:{ ...entry,ingredientRowId:ingredients[index].id },label:`${row.name}：${entry.text}` }))),
    ...candidate.steps.flatMap((row,index) => unclearList(row.unknowns).map(entry => ({ entry:{ ...entry,stepId:steps[index].id },label:`步骤 ${row.order}：${entry.text}` }))),
  ];
  const unknowns = [...new Map(located.map(({ entry }) => [JSON.stringify(entry),entry])).values()];
  // The flat list stays for the inbox count and older readers; recipe.unknowns is the located form.
  const unresolved = [...new Set(located.map(({ label }) => label))];
  if (unresolved.length > 100 || unknowns.length > 200) fail('Invalid unresolved question');
  const media = { sha256:source.sha256,durationMs:source.durationMs,byteCount:source.byteCount,sourceMethod,coverage,
    audioDurationMs:source.audioDurationMs,videoDurationMs:source.videoDurationMs };
  const recipe = { recipeFormatVersion:'3',title:{zh:candidate.title.trim()},ingredients,steps,sources:[],assets:[],...(unknowns.length ? { unknowns } : {}) };
  // AI-reported yield is not a kitchen scaling basis. A cook records baseServings in a reviewed KB revision.
  return { capture:{method:'video_analysis',status:'ready',evidence:{sourceUrl:item.url,media,segments}},
    proposal:{recipe,fieldEvidence:{title:cite(candidate.titleEvidenceIds),
      ingredients:candidate.ingredients.map(row => cite(row.evidenceIds)),steps:candidate.steps.map(row => cite(row.evidenceIds))},imageCandidates:[],unresolved} };
}
