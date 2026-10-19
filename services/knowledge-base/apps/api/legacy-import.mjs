// Trusted-operator import of a fixed CanteenOS data export. No network access.
import { createHash, randomUUID } from 'node:crypto';
import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { transaction } from './database.mjs';
import { Repository } from './repository.mjs';
import { fail } from './errors.mjs';
import { hash, httpUrl, recipeBody } from './validation.mjs';
import { imageType, MAX_IMAGE_BYTES } from './media.mjs';

const json = JSON.stringify;
const idPattern = /^[a-z][a-z0-9-]*$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const blobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const text = value => typeof value === 'string' && value.trim();

function invalid(message) { fail(422, 'INVALID_LEGACY_IMPORT', message); }
function name(value) { return recipeBody({ title: value }).title; }
function object(value, label) { if (!value || Array.isArray(value) || typeof value !== 'object') invalid(`${label} 必须是对象。`); return value; }

function sourceFile(root, path) {
  if (!path.startsWith('data/') || path.includes('\\') || posix.normalize(path) !== path) invalid('资料路径越界。');
  const relative = path.slice(5);
  let current = root;
  for (const segment of relative.split('/')) {
    if (!segment || segment === '.' || segment === '..') invalid('资料路径越界。');
    current = join(current, segment);
    const info = lstatSync(current);
    if (info.isSymbolicLink()) invalid('导入资料不能包含符号链接。');
  }
  const info = lstatSync(current);
  if (!info.isFile() || info.size > MAX_IMAGE_BYTES) invalid('资料文件类型或大小不支持。');
  const bytes = readFileSync(current, { flag: constants.O_RDONLY | constants.O_NOFOLLOW });
  return { path, bytes, sha256: sha256(bytes), gitBlobSha: blobSha(bytes) };
}

function decode(file) {
  if (file.bytes.length > 2 * 1024 * 1024) invalid('单份 JSON 资料超过 2MiB。');
  const rawText = file.bytes.toString('utf8');
  if (!Buffer.from(rawText, 'utf8').equals(file.bytes)) invalid('资料必须是有效 UTF-8。');
  try {
    const original = JSON.parse(rawText);
    // Reviver context retains the exact JSON number token, before Number rounding.
    const lexical = JSON.parse(rawText, (_key, value, context) => typeof value === 'number' ? context.source : value);
    return { ...file, rawText, original, lexical };
  } catch { invalid(`JSON 无法解析：${file.path}`); }
}

function imagePath(owner, src) {
  if (/^https?:\/\//.test(src)) return null;
  if (!text(src) || src.includes('\\') || src.startsWith('/') || /^[a-z]+:/i.test(src) || src.includes('?') || src.includes('#')) invalid('旧图片路径不支持。');
  const path = posix.normalize(src.startsWith('data/') ? src : posix.join(posix.dirname(owner), src));
  if (!path.startsWith('data/')) invalid('旧图片路径越界。');
  return path;
}

export function readLegacyBundle({ sourceDir, namespace, revision }) {
  if (!/^[a-z][a-z0-9._-]{0,127}$/.test(namespace ?? '')) invalid('需要稳定的小写来源 namespace。');
  if (!/^[0-9a-f]{40}$/.test(revision ?? '')) invalid('需要40位源 Git revision。');
  if (lstatSync(resolve(sourceDir)).isSymbolicLink()) invalid('导入根目录不能是符号链接。');
  const root = realpathSync(sourceDir), files = [];
  for (const directory of ['ingredients', 'dishes']) {
    if (!existsSync(join(root, directory))) continue;
    if (lstatSync(join(root, directory)).isSymbolicLink()) invalid('资料目录不能是符号链接。');
    for (const entry of readdirSync(join(root, directory)).sort()) {
      if (!entry.endsWith('.json')) continue;
      if (!idPattern.test(entry.slice(0, -5))) invalid('旧实体ID格式错误。');
      files.push(decode(sourceFile(root, `data/${directory}/${entry}`)));
    }
  }
  files.push(decode(sourceFile(root, 'data/techniques.json')));
  if (existsSync(join(root, 'translations.lock.json'))) files.push(decode(sourceFile(root, 'data/translations.lock.json')));
  if (files.length > 2000) invalid('单次迁移最多2000份JSON，请拆分来源清单。');
  const techniquesFile = files.find(f => f.path === 'data/techniques.json');
  if (!Array.isArray(techniquesFile.original) || techniquesFile.original.length > 2000) invalid('技法词表必须是有界数组。');
  const techniqueIds = new Set();
  for (const technique of techniquesFile.original) {
    object(technique, '技法');
    if (!idPattern.test(technique.id) || techniqueIds.has(technique.id) || !['cut', 'heat', 'pretreat'].includes(technique.kind)) invalid('技法ID重复或类型错误。');
    techniqueIds.add(technique.id); name(technique.name);
    if (technique.note !== undefined) name(technique.note);
  }
  const mediaFiles = new Map();
  function visit(value, owner) {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && typeof value.src === 'string') {
      const path = imagePath(owner, value.src);
      if (path && !mediaFiles.has(path)) {
        const file = sourceFile(root, path);
        file.type = imageType(file.bytes); mediaFiles.set(path, file);
      }
    }
    for (const child of Object.values(value)) visit(child, owner);
  }
  for (const file of files.filter(f => f.path !== 'data/translations.lock.json')) visit(file.original, file.path);
  const manifest = [...files, ...mediaFiles.values()].map(f => ({ path: f.path, sha256: f.sha256, gitBlobSha: f.gitBlobSha, byteSize: f.bytes.length })).sort((a,b) => a.path.localeCompare(b.path));
  if (manifest.reduce((n,f) => n + f.byteSize, 0) > 64 * 1024 * 1024) invalid('单次迁移资料超过64MiB。');
  return { namespace, revision, files, mediaFiles, manifest, manifestHash: hash({ namespace, revision, files: manifest }),
    counts: { recipes: files.filter(f => f.path.startsWith('data/dishes/')).length, ingredients: files.filter(f => f.path.startsWith('data/ingredients/')).length, techniques: techniquesFile.original.length, files: files.length, mediaFiles: mediaFiles.size } };
}

function decimal(token) {
  if (typeof token !== 'string' || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(token)) invalid('旧数量不是正十进制值。');
  let result = token;
  if (/[eE]/.test(token)) {
    const [mantissa, exponentText] = token.toLowerCase().split('e');
    const exponent = Number(exponentText);
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) invalid('旧数量指数超过支持范围。');
    const parts = mantissa.split('.'), digits = parts.join(''), point = parts[0].length + exponent;
    result = point <= 0 ? `0.${'0'.repeat(-point)}${digits}` : point >= digits.length ? digits + '0'.repeat(point - digits.length) : `${digits.slice(0,point)}.${digits.slice(point)}`;
    result = result.replace(/^0+(?=\d)/, '');
  }
  if (result.length > 40 || !/^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$/.test(result)) invalid('旧数量无法无损放入正十进制字符串，需人工处理。');
  return result;
}

function amount(component, lexical) {
  if (component.qty === undefined) return { kind: 'unknown' };
  object(component.qty, '配料数量');
  if (!text(component.qty.unit)) invalid('旧数量缺少单位。');
  if (component.qty.unit === 'to-taste') {
    if (component.qty.value !== undefined) invalid('适量字段同时带数值，需人工处理。');
    return { kind: 'to_taste', raw: 'to-taste' };
  }
  return { kind: 'exact', value: decimal(lexical.qty?.value), unit: component.qty.unit };
}

const timing = {
  'day-before': { zh:'前一天', en:'Day before', uk:'Напередодні' },
  morning: { zh:'当天早上', en:'Morning', uk:'Вранці' },
  'before-service': { zh:'开餐前', en:'Before service', uk:'Перед подачею' },
};

function preparation(prep, techniques) {
  if (!prep) return undefined;
  object(prep, '备料');
  const technique = techniques.get(prep.techniqueRef);
  if (!technique) invalid(`备料引用不存在的技法：${prep.techniqueRef}`);
  if (prep.note !== undefined) name(prep.note);
  if (prep.size !== undefined && !text(prep.size)) invalid('备料尺寸必须是文字。');
  if (prep.timing !== undefined && !timing[prep.timing]) invalid('备料时机不支持。');
  const languages = new Set([...Object.keys(technique.original.name), ...Object.keys(prep.note ?? {})]);
  return Object.fromEntries([...languages].map(lang => [lang, [technique.original.name[lang], prep.size, timing[prep.timing]?.[lang], prep.note?.[lang]].filter(Boolean).join(' · ')]));
}

function persistImage(file, uploadsDir, id, createdFiles) {
  const objectKey = `${id}.${file.type.extension}`;
  mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });
  const pending = join(uploadsDir, `.${id}.pending`), final = join(uploadsDir, objectKey);
  let moved = false;
  try {
    const fd = openSync(pending, 'wx', 0o600);
    try { writeFileSync(fd, file.bytes); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(pending, final); moved = true; createdFiles.push(final);
    const directory = openSync(uploadsDir, constants.O_RDONLY);
    try { fsyncSync(directory); } finally { closeSync(directory); }
    return objectKey;
  } catch (error) { if (!moved) { try { unlinkSync(pending); } catch {} } throw error; }
}

export function importLegacyBundle({ db, uploadsDir, bundle }) {
  const repository = new Repository(db, uploadsDir), createdFiles = [];
  try {
    return transaction(db, () => {
      const previous = repository.one('SELECT * FROM legacy_imports WHERE namespace=? AND source_revision=?', bundle.namespace, bundle.revision);
      if (previous) {
        if (previous.manifest_hash !== bundle.manifestHash) fail(409, 'LEGACY_SOURCE_CHANGED', '同一源版本的原始字节已改变，拒绝覆盖。');
        return { ...JSON.parse(previous.result), replayed: true };
      }
      if (repository.one('SELECT id FROM legacy_imports WHERE namespace=?', bundle.namespace)) {
        fail(409, 'LEGACY_NEW_REVISION_REQUIRES_REVIEW', '该来源已导入其他版本；需要人工对照，不自动覆盖现有编辑。');
      }
      const importId = randomUUID(), now = new Date().toISOString();
      const ingredients = new Map(), techniques = new Map(), dishes = new Map();
      for (const file of bundle.files) {
        if (file.path.startsWith('data/ingredients/')) ingredients.set(posix.basename(file.path, '.json'), { ...file, id: randomUUID() });
        if (file.path.startsWith('data/dishes/')) dishes.set(posix.basename(file.path, '.json'), { ...file, id: randomUUID() });
      }
      const techniquesFile = bundle.files.find(f => f.path === 'data/techniques.json');
      techniquesFile.original.forEach((entry, index) => techniques.set(entry.id, { ...techniquesFile, original: entry, id: randomUUID(), pointer: `/${index}` }));
      const result = { importId, namespace: bundle.namespace, sourceRevision: bundle.revision, manifestHash: bundle.manifestHash, manifest: bundle.manifest, counts: bundle.counts,
        recipes: [...dishes].map(([legacyId,f]) => ({ legacyId, id: f.id, version: 1 })), replayed: false };
      repository.run('INSERT INTO legacy_imports(id,namespace,source_revision,manifest_hash,result,created_at) VALUES(?,?,?,?,?,?)', importId, bundle.namespace, bundle.revision, bundle.manifestHash, json(result), now);
      for (const file of bundle.files) repository.run('INSERT INTO legacy_files(import_id,path,raw_bytes,sha256,git_blob_sha) VALUES(?,?,?,?,?)', importId, file.path, file.bytes, file.sha256, file.gitBlobSha);
      const origin = (legacyId, file) => ({ namespace: bundle.namespace, legacyId, sourceRevision: bundle.revision, path: file.path, pointer: file.pointer ?? '', sha256: file.sha256, gitBlobSha: file.gitBlobSha });
      const bind = (kind, legacyId, file) => repository.run('INSERT INTO legacy_bindings(namespace,kind,legacy_id,target_id,target_version,import_id,source_path,source_pointer) VALUES(?,?,?,?,?,?,?,?)', bundle.namespace, kind, legacyId, file.id, kind === 'dish' ? 1 : null, importId, file.path, file.pointer ?? '');
      const assetCache = new Map();
      function asset(kind, src, owner, rights, pointer) {
        const key = hash({ kind, src, owner: /^https?:\/\//.test(src) ? null : owner, rights: rights ?? null });
        if (assetCache.has(key)) return assetCache.get(key);
        const id = randomUUID(), metadata = { ...(rights ? { rights } : {}), legacy: { namespace: bundle.namespace, sourceRevision: bundle.revision, path: owner, pointer, originalSrc: src } };
        if (/^https?:\/\//.test(src)) {
          httpUrl(src);
          repository.run("INSERT INTO assets(id,kind,storage,external_url,status,metadata) VALUES(?,?,'external',?,'ready',?)", id, kind, src, json(metadata));
        } else {
          if (kind !== 'image') invalid('仅本地图像可迁入，视频保留 HTTP/HTTPS 外链。');
          const file = bundle.mediaFiles.get(imagePath(owner, src));
          if (!file) invalid('缺少导出包内图像。');
          const objectKey = persistImage(file, uploadsDir, id, createdFiles);
          repository.run("INSERT INTO assets(id,kind,storage,object_key,status,sha256,mime_type,byte_size,metadata) VALUES(?,'image','local',?,'ready',?,?,?,?)", id, objectKey, file.sha256, file.type.mime, file.bytes.length, json(metadata));
        }
        const publicAsset = repository.publicAsset(repository.asset(id));
        assetCache.set(key, publicAsset); return publicAsset;
      }
      function image(ref, owner, pointer) {
        if (!ref) return undefined;
        object(ref, '图像');
        if (!text(ref.src)) invalid('图像缺少原地址。');
        const rights = Object.fromEntries(['license','author','sourceUrl'].filter(k => ref[k] !== undefined).map(k => [k, ref[k]]));
        if (Object.values(rights).some(v => !text(v))) invalid('图像许可和来源字段必须是非空文字。');
        return asset('image', ref.src, owner, rights, pointer);
      }
      for (const [legacyId, file] of ingredients) {
        const original = object(file.original, '食材'); name(original.name);
        repository.run('INSERT INTO ingredients(id,name,aliases,created_at) VALUES(?,?,?,?)', file.id, json(original.name), '[]', now);
        const picture = image(original.image, file.path, '/image');
        file.knowledge = { ...(original.role ? { role: original.role } : {}), ...(original.externalId ? { externalId: original.externalId } : {}), ...(picture ? { image: picture } : {}), legacy: origin(legacyId, file), original };
        repository.run('INSERT INTO ingredient_knowledge(ingredient_id,document) VALUES(?,?)', file.id, json(file.knowledge)); bind('ingredient', legacyId, file);
      }
      for (const [legacyId, file] of techniques) {
        const original = file.original, picture = image(original.image, file.path, `${file.pointer}/image`);
        file.knowledge = { ...(picture ? { image: picture } : {}), legacy: origin(legacyId, file), original };
        repository.run('INSERT INTO techniques(id,kind,name,note,document) VALUES(?,?,?,?,?)', file.id, original.kind, json(original.name), original.note ? json(original.note) : null, json(file.knowledge)); bind('technique', legacyId, file);
      }
      for (const [legacyId, file] of dishes) {
        const original = object(file.original, '菜谱'), componentRows = [], stepRows = [], media = [], importedAssets = [];
        if (original.components !== undefined && !Array.isArray(original.components)) invalid('配料必须为数组。');
        if (original.steps !== undefined && !Array.isArray(original.steps)) invalid('步骤必须为数组。');
        const ingredientIds = new Set(), techniqueIds = new Set();
        const warnings = [{ code: 'LEGACY_UNVERIFIED', message: '从旧资料导入；原始 active/draft 与翻译状态不代表配方已经人工核验。' }];
        function addImage(ref, pointer, role, stepId) {
          const found = image(ref, file.path, pointer);
          if (!found) return;
          importedAssets.push({ assetId: found.id, pointer, ...found });
          media.push({ assetId: found.id, role, ...(stepId ? { stepId } : {}) });
        }
        addImage(original.image, '/image', 'cover');
        const recipeIngredients = (original.components ?? []).map((component, index) => {
          object(component, '配料'); const ingredient = ingredients.get(component.ingredientRef);
          if (!ingredient) invalid(`配料引用不存在的食材：${component.ingredientRef}`);
          ingredientIds.add(component.ingredientRef);
          const id = randomUUID(); componentRows.push({ id, pointer: `/components/${index}` });
          const prep = preparation(component.prep, techniques);
          if (component.prep?.techniqueRef) techniqueIds.add(component.prep.techniqueRef);
          addImage(component.prep?.image, `/components/${index}/prep/image`, 'reference');
          return { id, ingredientId: ingredient.id, name: ingredient.original.name, role: ingredient.original.role ?? 'unspecified', amount: amount(component, file.lexical.components[index]), ...(prep ? { preparation: prep } : {}) };
        });
        const recipeSteps = (original.steps ?? []).map((step, index) => {
          object(step, '步骤'); const id = randomUUID(); stepRows.push({ id, pointer: `/steps/${index}` });
          if (step.techniqueRef) {
            if (!techniques.has(step.techniqueRef)) invalid(`步骤引用不存在的技法：${step.techniqueRef}`);
            techniqueIds.add(step.techniqueRef);
          }
          addImage(step.image, `/steps/${index}/image`, 'step', id);
          if (step.clip) {
            object(step.clip, '视频片段');
            if (!Number.isFinite(step.clip.start) || !Number.isFinite(step.clip.end) || step.clip.start < 0 || step.clip.end <= step.clip.start) invalid('视频片段顺序或数值错误。');
            const video = asset('video', step.clip.videoUrl, file.path, undefined, `/steps/${index}/clip`);
            importedAssets.push({ assetId: video.id, pointer: `/steps/${index}/clip`, ...video });
            media.push({ assetId: video.id, role: 'step', stepId: id, clip: { start: step.clip.start, end: step.clip.end } });
          }
          return { id, text: step.text };
        });
        if (original.provenance?.videoUrl) {
          const video = asset('video', original.provenance.videoUrl, file.path, undefined, '/provenance/videoUrl');
          if (!media.some(m => m.assetId === video.id)) media.push({ assetId: video.id, role: 'reference' });
        }
        if (importedAssets.some(a => a.url && /example|placeholder/i.test(a.url))) warnings.push({ code: 'PLACEHOLDER_MEDIA', message: '原资料含占位示例链接，保存不代表视频可用。' });
        if (original.provenance?.source === 'example') warnings.push({ code: 'EXAMPLE_RECIPE', message: '原资料标记为演示样本。' });
        const sourceId = randomUUID();
        repository.run("INSERT INTO sources(id,kind,title,text_content,metadata,created_at) VALUES(?,'text',?,?,?,?)", sourceId, `CanteenOS ${legacyId}`, file.rawText, json(origin(legacyId, file)), now);
        const recipe = recipeBody({ title: original.name, ...(original.description ? { description: original.description } : {}), ...(original.baseServings !== undefined ? { baseServings: original.baseServings } : {}), tags: [], ingredients: recipeIngredients, steps: recipeSteps,
          sources: [{ sourceId, evidence: { sourceRevision: bundle.revision, path: file.path, sha256: file.sha256 } }], assets: media });
        repository.run('INSERT INTO recipes(id,title,description,tags,base_servings,version,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?)', file.id, json(recipe.title), recipe.description ? json(recipe.description) : null, json(recipe.tags), recipe.baseServings ?? null, original.status === 'archived' ? now : null, now, now);
        repository.validateReferences(recipe, file.id); repository.replaceChildren(file.id, recipe);
        const translations = bundle.files.find(f => f.path === 'data/translations.lock.json');
        const evidence = { schemaVersion: 'canteen-legacy-evidence-v1', source: { ...origin(legacyId, file), revision: bundle.revision, importId }, original, rawText: file.rawText,
          ingredients: [...ingredientIds].map(key => { const f = ingredients.get(key); return { id: f.id, legacyId: key, original: f.original, rawText: f.rawText, source: origin(key, f), ...(f.knowledge.image ? { media: f.knowledge.image } : {}) }; }),
          techniques: [...techniqueIds].map(key => { const f = techniques.get(key); return { id: f.id, legacyId: key, original: f.original, source: origin(key, f), ...(f.knowledge.image ? { media: f.knowledge.image } : {}) }; }),
          rows: { ingredients: componentRows, steps: stepRows }, assets: importedAssets, warnings,
          ...(translations ? { translations: { rawText: translations.rawText, sha256: translations.sha256, path: translations.path } } : {}) };
        repository.run('INSERT INTO legacy_recipe_evidence(recipe_id,import_id,document) VALUES(?,?,?)', file.id, importId, json(evidence));
        bind('dish', legacyId, file);
        const snapshot = repository.snapshot(file.id, recipe);
        repository.run('INSERT INTO recipe_revisions(recipe_id,version,document,actor,created_at) VALUES(?,1,?,?,?)', file.id, json(snapshot), `legacy:${bundle.namespace}`, now);
      }
      return result;
    });
  } catch (error) {
    for (const path of createdFiles) { try { unlinkSync(path); } catch {} }
    throw error;
  }
}
