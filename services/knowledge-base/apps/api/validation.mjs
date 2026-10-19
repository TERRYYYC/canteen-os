import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { fail } from './errors.mjs';

const schema = JSON.parse(readFileSync(new URL('../../contracts/import-batch.schema.json', import.meta.url), 'utf8'));
export const quantitiesSchema = JSON.parse(readFileSync(new URL('../../contracts/canteen-quantities.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false });
addFormats(ajv);
ajv.addSchema(quantitiesSchema);
ajv.addSchema(schema);
const checkRecipe = ajv.compile({ $ref: `${schema.$id}#/$defs/recipe` });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function uuid(value) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) fail(400, 'INVALID_ID', 'ID 必须是 UUID。');
  return value;
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const hash = value => createHash('sha256').update(canonical(value)).digest('hex');

export function unique(items, key, label) {
  const values = items.map(item => item[key]);
  if (new Set(values).size !== values.length) fail(422, 'DUPLICATE_ID', `${label} ID 不能重复。`);
}

// Absent = 1. A saved recipe never goes back to an older format (an old client would drop fields it does not know).
export const formatRank = recipe => ({ '2': 2, '3': 3 })[recipe?.recipeFormatVersion] ?? 1;
const v3RowFields = ['originalAmount', 'originalQty', 'qty', 'qtySource'];
const usesFormatThree = value => Boolean(value && typeof value === 'object' && (value.unknowns !== undefined ||
  (Array.isArray(value.ingredients) && value.ingredients.some(row => row && typeof row === 'object' &&
    (v3RowFields.some(key => key in row) || (row.kitchenPrep && typeof row.kitchenPrep === 'object' && 'leadTime' in row.kitchenPrep))))));

export function recipeBody(value) {
  if (usesFormatThree(value) && value.recipeFormatVersion !== '3') fail(400, 'RECIPE_FORMAT_REQUIRED', '原方与食堂用量分开记、提前时长和「没说清」需要 recipeFormatVersion 3。');
  if (!checkRecipe(value)) {
    fail(400, 'INVALID_RECIPE', '菜谱字段不符合约定。', checkRecipe.errors.slice(0, 12).map(e => ({ path: e.instancePath, rule: e.keyword })));
  }
  const recipe = structuredClone(value);
  for (const key of ['tags', 'ingredients', 'steps', 'sources', 'assets']) recipe[key] ??= [];
  if ((recipe.ingredients.some(row=>row.kitchenPrep)||recipe.steps.some(row=>row.techniqueId))&&formatRank(recipe)<2) fail(400,'RECIPE_FORMAT_REQUIRED','结构化厨房核定字段需要 recipeFormatVersion 2。');
  if (recipe.baseServings !== undefined && !Number.isSafeInteger(recipe.baseServings)) {
    fail(400, 'INVALID_SERVINGS', '人数必须是安全范围内的正整数。');
  }
  for (const row of recipe.ingredients) {
    row.id = uuid(row.id);
    if (row.ingredientId) row.ingredientId = uuid(row.ingredientId);
  }
  for (const row of recipe.steps) row.id = uuid(row.id);
  for (const row of recipe.sources) row.sourceId = uuid(row.sourceId);
  for (const row of recipe.assets) {
    row.assetId = uuid(row.assetId);
    if (row.stepId) row.stepId = uuid(row.stepId);
    if (row.clip && row.clip.end <= row.clip.start) fail(422, 'INVALID_CLIP', '视频片段结束时间必须大于开始时间。');
  }
  unique(recipe.ingredients, 'id', '配料');
  unique(recipe.steps, 'id', '步骤');
  unique(recipe.sources, 'sourceId', '来源');
  if (recipe.assets.filter(a => a.role === 'cover').length > 1) fail(422, 'MULTIPLE_COVERS', '每份菜谱只能设置一个封面。');
  const steps = new Set(recipe.steps.map(row => row.id));
  if (recipe.assets.some(row => row.stepId && !steps.has(row.stepId))) fail(422, 'INVALID_STEP_REFERENCE', '步骤素材必须引用本次菜谱中存在的步骤。');
  if (recipe.unknowns) {
    // No entries means no field (K5): an empty list is never stored or returned.
    if (!recipe.unknowns.length) delete recipe.unknowns;
    else {
      const rows = new Set(recipe.ingredients.map(row => row.id)), seen = new Set();
      for (const entry of recipe.unknowns) {
        if (entry.stepId) entry.stepId = uuid(entry.stepId);
        if (entry.ingredientRowId) entry.ingredientRowId = uuid(entry.ingredientRowId);
        if ((entry.stepId && !steps.has(entry.stepId)) || (entry.ingredientRowId && !rows.has(entry.ingredientRowId))) fail(422, 'INVALID_UNKNOWN_REFERENCE', '「没说清」只能指向本菜谱里的步骤或食材行。');
        const key = canonical(entry);
        if (seen.has(key)) fail(422, 'DUPLICATE_UNKNOWN', '同一条「没说清」不能重复。');
        seen.add(key);
      }
    }
  }
  return recipe;
}

export function objectBody(value, fields) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(k => !fields.includes(k))) {
    fail(400, 'INVALID_BODY', '请求字段不符合约定。');
  }
  return value;
}

export function httpUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { fail(400, 'INVALID_URL', '请输入完整的 HTTP 或 HTTPS 地址。'); }
  if (typeof value !== 'string' || value.length > 4096 || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || /[\u0000-\u0020]/.test(value)) {
    fail(400, 'INVALID_URL', '请输入不含凭据的 HTTP 或 HTTPS 地址。');
  }
  return parsed.href;
}

export function externalBody(value) {
  objectBody(value, ['kind', 'url']);
  if (!['video', 'image'].includes(value.kind)) fail(400, 'INVALID_ASSET_KIND', '外链素材仅支持图片或视频。');
  return { kind: value.kind, url: httpUrl(value.url) };
}

export function rightsBody(value) {
  objectBody(value, ['license', 'author', 'sourceUrl']);
  if (typeof value.license !== 'string' || !/^(own|CC0(?: 1\.0)?|Public domain|CC BY(?:-SA)?(?: [1-4]\.0)?)$/.test(value.license) ||
      typeof value.author !== 'string' || !value.author.trim() || value.author.length > 500 || /[\u0000-\u001f\u007f]/.test(value.author)) {
    fail(400, 'INVALID_RIGHTS', '请填写可用于发布的图片许可及作者；未知、受限或未列出的许可不能用于固定图片。');
  }
  let sourceUrl;
  if (value.sourceUrl !== undefined) {
    if (value.license === 'own' && typeof value.sourceUrl === 'string' && value.sourceUrl.length <= 4096 &&
        !/[\u0000-\u0020:?#\\]/.test(value.sourceUrl) && !value.sourceUrl.startsWith('/') &&
        value.sourceUrl.split('/').every(part => part && part !== '.' && part !== '..')) sourceUrl = value.sourceUrl;
    else sourceUrl = httpUrl(value.sourceUrl);
  }
  if (value.license !== 'own' && !sourceUrl) fail(400, 'INVALID_RIGHTS', '非自有图片还需要来源网址。');
  return { license:value.license,author:value.author.trim(),...(sourceUrl?{sourceUrl}:{}) };
}

export function sourceBody(value) {
  objectBody(value, ['kind', 'title', 'author', 'url', 'textContent', 'assetId']);
  if (!['web', 'video', 'text', 'file'].includes(value.kind)) fail(400, 'INVALID_SOURCE_KIND', '来源类型不正确。');
  const body = { ...value };
  for (const key of ['title', 'author', 'textContent']) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > (key === 'textContent' ? 200000 : 2000))) {
      fail(400, 'INVALID_SOURCE', '来源文字字段不正确或过长。');
    }
  }
  if (body.url !== undefined) body.url = httpUrl(body.url);
  if (body.assetId !== undefined) body.assetId = uuid(body.assetId);
  if (!body.url && !body.assetId && !body.textContent?.trim()) fail(400, 'EMPTY_SOURCE', '来源需要地址、素材或原文。');
  return body;
}

export function writeHeaders(request, needsVersion) {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length > 200 || !key.trim() || /[\u0000-\u001f\u007f]/.test(key)) fail(400, 'IDEMPOTENCY_KEY_REQUIRED', '保存请求需要有效的 Idempotency-Key。');
  const match = request.headers['if-match'];
  if (needsVersion && match === undefined) fail(428, 'VERSION_REQUIRED', '修改请求需要 If-Match 版本条件。');
  if (match !== undefined && (typeof match !== 'string' || !/^"v[1-9][0-9]*"$/.test(match) || !Number.isSafeInteger(Number(match.slice(2, -1))))) {
    fail(400, 'INVALID_VERSION', '版本条件必须采用 "vN" 格式。');
  }
  return { key, actor: request.headers['x-kb-client'], match: match ?? null, version: match ? Number(match.slice(2, -1)) : null };
}

export function listQuery(query) {
  if (Object.keys(query).some(k => !['q', 'tag', 'cursor', 'limit'].includes(k))) fail(400, 'INVALID_QUERY', '查询参数不正确。');
  for (const [key, max] of [['q', 200], ['tag', 100], ['cursor', 2000]]) {
    if (query[key] !== undefined && (typeof query[key] !== 'string' || query[key].length > max)) fail(400, 'INVALID_QUERY', '查询参数不正确。');
  }
  if (query.limit !== undefined && (typeof query.limit !== 'string' || !/^[1-9][0-9]{0,2}$/.test(query.limit) || Number(query.limit) > 100)) fail(400, 'INVALID_LIMIT', '每页数量必须为 1 到 100。');
  const q = query.q?.trim() ?? '';
  const tag = query.tag ?? '';
  const filter = hash({ q, tag });
  let after;
  if (query.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw Error();
      after = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
      if (!after || after.filter !== filter || !uuidPattern.test(after.id) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(after.time)) throw Error();
    } catch { fail(400, 'INVALID_CURSOR', '分页游标无效或不属于当前筛选条件。'); }
  }
  return { q, tag, filter, after, limit: Number(query.limit ?? 20) };
}

export function knowledgeQuery(kind, query) {
  objectBody(query, ['q', 'cursor', 'limit']);
  if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 200)) fail(400, 'INVALID_QUERY', '查询参数不正确。');
  if (query.limit !== undefined && (typeof query.limit !== 'string' || !/^[1-9][0-9]{0,2}$/.test(query.limit) || Number(query.limit) > 100)) fail(400, 'INVALID_LIMIT', '每页数量必须为 1 到 100。');
  const q = query.q?.trim() ?? '', filter = hash({ kind, q });
  let after;
  if (query.cursor !== undefined) {
    try {
      if (typeof query.cursor !== 'string' || query.cursor.length > 1000 || !/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw Error();
      const parsed = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
      if (parsed.filter !== filter || !uuidPattern.test(parsed.after)) throw Error();
      after = parsed.after;
    } catch { fail(400, 'INVALID_CURSOR', '分页游标不属于当前资料查询。'); }
  }
  return { q, after, filter, limit: Number(query.limit ?? 100) };
}
