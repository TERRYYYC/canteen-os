import { randomUUID } from 'node:crypto';
import { fail } from './errors.mjs';
import { hash } from './validation.mjs';
import { transaction } from './database.mjs';
import { assertAssetReady, assetUrl } from './media.mjs';

const json = JSON.stringify;
const optional = (key, value) => value === null || value === undefined ? {} : { [key]: value };
const missing = value => value === null || value === undefined || value === '';
function sameRight(key, prior, next) {
  if (prior === next) return true;
  if (typeof prior !== 'string' || typeof next !== 'string') return false;
  if (key === 'author') return prior.trim() === next.trim();
  if (key !== 'sourceUrl' || /[\u0000-\u0020]/.test(prior)) return false;
  try {
    const oldUrl = new URL(prior);
    const newUrl = new URL(next);
    return ['http:', 'https:'].includes(oldUrl.protocol) && !oldUrl.username && !oldUrl.password && oldUrl.href === newUrl.href;
  } catch { return false; }
}

export class Repository {
  constructor(db, uploadsDir) { this.db = db; this.uploadsDir = uploadsDir; }
  one(sql, ...values) { return this.db.prepare(sql).get(...values); }
  all(sql, ...values) { return this.db.prepare(sql).all(...values); }
  run(sql, ...values) { return this.db.prepare(sql).run(...values); }

  recipeRow(id) {
    const row = this.one('SELECT * FROM recipes WHERE id=?', id);
    if (!row) fail(404, 'RECIPE_NOT_FOUND', '菜谱不存在。');
    return row;
  }

  detailWithinTransaction(id) {
    const row = this.recipeRow(id);
    const revision = this.one('SELECT document FROM recipe_revisions WHERE recipe_id=? AND version=?', id, row.version);
    if (!revision) throw new Error('Missing current recipe revision');
    return JSON.parse(revision.document);
  }

  detail(id) { return transaction(this.db, () => this.detailWithinTransaction(id), false); }

  list({ q, tag, after, limit, filter }) {
    const where = ['r.archived_at IS NULL'];
    const params = [];
    if (q) {
      const needle = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      where.push(`(EXISTS (SELECT 1 FROM json_each(r.title) t WHERE t.value LIKE ? ESCAPE '\\') OR EXISTS
        (SELECT 1 FROM recipe_ingredients ri, json_each(ri.name) n WHERE ri.recipe_id=r.id AND n.value LIKE ? ESCAPE '\\'))`);
      params.push(needle, needle);
    }
    if (tag) { where.push('EXISTS (SELECT 1 FROM json_each(r.tags) t WHERE t.value=?)'); params.push(tag); }
    if (after) { where.push('(r.updated_at<? OR (r.updated_at=? AND r.id<?))'); params.push(after.time, after.time, after.id); }
    params.push(limit + 1);
    const rows = this.all(`SELECT r.id,r.title,r.description,r.tags,r.version,r.updated_at,
      a.id AS cover_id,a.storage AS cover_storage,a.external_url AS cover_external_url,
      a.status AS cover_status
      FROM recipes r
      LEFT JOIN recipe_assets ra ON ra.recipe_id=r.id AND ra.role='cover'
      LEFT JOIN assets a ON a.id=ra.asset_id AND a.kind='image' AND a.status='ready' AND a.storage IN ('local','external')
      WHERE ${where.join(' AND ')} ORDER BY r.updated_at DESC,r.id DESC LIMIT ?`, ...params);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(row => ({ id: row.id, title: JSON.parse(row.title), ...optional('description', row.description && JSON.parse(row.description)), tags: JSON.parse(row.tags), version: row.version, updatedAt: row.updated_at,
        ...(row.cover_id ? { cover: { assetId: row.cover_id, kind: 'image', url: assetUrl({ id: row.cover_id, storage: row.cover_storage, external_url: row.cover_external_url }), status: row.cover_status } } : {}) })),
      nextCursor: rows.length > limit ? Buffer.from(json({ time: last.updated_at, id: last.id, filter })).toString('base64url') : null,
    };
  }

  revisions(id) {
    return transaction(this.db, () => {
      this.recipeRow(id);
      return { items: this.all('SELECT version,created_at FROM recipe_revisions WHERE recipe_id=? ORDER BY version DESC', id).map(row => ({ version: row.version, createdAt: row.created_at })) };
    }, false);
  }

  revision(id, version) {
    const row = this.one('SELECT document,created_at FROM recipe_revisions WHERE recipe_id=? AND version=?', id, version);
    if (!row) fail(404, 'REVISION_NOT_FOUND', '历史版本不存在。');
    return { ...JSON.parse(row.document), createdAt: row.created_at };
  }

  asset(id) { return this.one('SELECT * FROM assets WHERE id=?', id); }

  readyAsset(id) {
    const asset = this.asset(id);
    assertAssetReady(this.uploadsDir, asset);
    return asset;
  }

  publicAsset(asset) {
    const metadata = JSON.parse(asset.metadata ?? '{}');
    return { id: asset.id, kind: asset.kind, url: assetUrl(asset), status: asset.status, ...(asset.storage === 'external' ? { external: true } : {}),
      ...optional('rights', metadata.rights), ...optional('sha256', asset.sha256) };
  }

  registerExternal(body) {
    const id = randomUUID();
    return transaction(this.db, () => {
      this.run("INSERT INTO assets(id,kind,storage,external_url,status) VALUES(?,?,'external',?,'ready')", id, body.kind, body.url);
      return this.publicAsset(this.asset(id));
    });
  }

  registerImage(asset) {
    return transaction(this.db, () => {
      this.run('INSERT INTO assets(id,kind,storage,object_key,status,sha256,mime_type,byte_size) VALUES(?,?,?,?,?,?,?,?)', asset.id, asset.kind, asset.storage, asset.object_key, asset.status, asset.sha256, asset.mime_type, asset.byte_size);
      return this.publicAsset(this.asset(asset.id));
    });
  }

  registerRights(id, rights) {
    return transaction(this.db, () => {
      const asset = this.asset(id);
      if (!asset) fail(404, 'ASSET_NOT_FOUND', '图片文件不存在。');
      if (asset.kind !== 'image' || asset.storage !== 'local') fail(422, 'ASSET_NOT_READY', '只有已上传的本地图片可以固定许可资料。');
      this.readyAsset(id);
      const metadata = JSON.parse(asset.metadata ?? '{}');
      if (metadata.rights) {
        const prior = metadata.rights;
        if (typeof prior !== 'object' || Array.isArray(prior) ||
            Object.entries(prior).some(([key, value]) => !missing(value) && !sameRight(key, value, rights[key]))) {
          fail(409, 'RIGHTS_CONFLICT', '已有图片许可不能改写；如需更正，请重新上传并保存新版本。');
        }
        const added = Object.fromEntries(Object.entries(rights).filter(([key]) => missing(prior[key])));
        if (!Object.keys(added).length) return this.publicAsset(asset);
        this.run('UPDATE assets SET metadata=? WHERE id=?', json({ ...metadata, rights: { ...prior, ...added } }), id);
        return this.publicAsset(this.asset(id));
      }
      this.run('UPDATE assets SET metadata=? WHERE id=?', json({ ...metadata, rights }), id);
      return this.publicAsset(this.asset(id));
    });
  }

  publicSource(source) {
    const metadata = JSON.parse(source.metadata ?? '{}');
    return { id: source.id, kind: source.kind, ...optional('title', source.title), ...optional('author', source.author), ...optional('url', source.url), ...optional('textContent', source.text_content), ...optional('assetId', source.asset_id), createdAt: source.created_at,
      ...(Object.keys(metadata).length ? { metadata } : {}) };
  }

  registerSource(body) {
    return transaction(this.db, () => {
      if (body.assetId) this.readyAsset(body.assetId);
      const id = randomUUID();
      this.run('INSERT INTO sources(id,kind,title,author,url,text_content,asset_id) VALUES(?,?,?,?,?,?,?)', id, body.kind, body.title ?? null, body.author ?? null, body.url ?? null, body.textContent ?? null, body.assetId ?? null);
      return this.publicSource(this.one('SELECT * FROM sources WHERE id=?', id));
    });
  }

  validateReferences(recipe, id) {
    for (const [table, rows] of [['recipe_ingredients', recipe.ingredients], ['recipe_steps', recipe.steps]]) {
      for (const row of rows) {
        const owner = this.one(`SELECT recipe_id FROM ${table} WHERE id=?`, row.id);
        if (owner && owner.recipe_id !== id) fail(422, 'ROW_OWNED_BY_OTHER_RECIPE', '配料或步骤 ID 已属于另一份菜谱。');
      }
    }
    for (const row of recipe.ingredients) {
      if (row.ingredientId && !this.one('SELECT id FROM ingredients WHERE id=?', row.ingredientId)) fail(422, 'INGREDIENT_NOT_FOUND', '关联的标准食材不存在。');
    }
    for(const techniqueId of [...recipe.ingredients.map(row=>row.kitchenPrep?.techniqueId),...recipe.steps.map(row=>row.techniqueId)].filter(Boolean)) {
      if(!this.one('SELECT id FROM techniques WHERE id=?',techniqueId))fail(422,'TECHNIQUE_NOT_FOUND','关联的标准技法不存在。');
    }
    for (const row of recipe.sources) {
      const source = this.one('SELECT * FROM sources WHERE id=?', row.sourceId);
      if (!source) fail(422, 'SOURCE_NOT_FOUND', '关联的来源不存在。');
      if (source.asset_id) this.readyAsset(source.asset_id);
    }
    for (const row of recipe.assets) {
      const asset = this.readyAsset(row.assetId);
      if (row.clip && asset.kind !== 'video') fail(422, 'INVALID_CLIP_KIND', '只有视频素材可以设置时间片段。');
    }
  }

  replaceChildren(id, recipe) {
    // Delete dependent edges first, then recreate rows with stable client IDs.
    // This handles arbitrary reordering under SQLite immediate UNIQUE checks.
    for (const table of ['recipe_assets', 'recipe_sources', 'recipe_ingredients', 'recipe_steps']) this.run(`DELETE FROM ${table} WHERE recipe_id=?`, id);
    recipe.ingredients.forEach((row, index) => {
      this.run(`INSERT INTO recipe_ingredients(id,recipe_id,position,ingredient_id,name,raw_text,role,amount_kind,amount_value,amount_unit,amount_raw,preparation)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, row.id, id, index, row.ingredientId ?? null, json(row.name), row.rawText ?? '', row.role ?? 'unspecified', row.amount.kind, row.amount.value ?? null, row.amount.unit ?? null, row.amount.raw ?? '', row.preparation ? json(row.preparation) : null);
    });
    recipe.steps.forEach((row, index) => this.run('INSERT INTO recipe_steps(id,recipe_id,position,text) VALUES(?,?,?,?)', row.id, id, index, json(row.text)));
    for (const row of recipe.sources) this.run('INSERT INTO recipe_sources(recipe_id,source_id,evidence) VALUES(?,?,?)', id, row.sourceId, json(row.evidence ?? {}));
    recipe.assets.forEach((row, index) => this.run('INSERT INTO recipe_assets(id,recipe_id,asset_id,role,step_id,position,clip_start,clip_end) VALUES(?,?,?,?,?,?,?,?)', randomUUID(), id, row.assetId, row.role, row.stepId ?? null, index, row.clip?.start ?? null, row.clip?.end ?? null));
  }

  snapshot(id, recipe) {
    const row = this.recipeRow(id);
    const media = recipe.assets.map(ref => {
      const asset = this.asset(ref.assetId);
      const { id: assetId, ...publicFields } = this.publicAsset(asset);
      return { assetId, ...publicFields, role: ref.role, ...optional('stepId', ref.stepId), ...optional('clip', ref.clip) };
    });
    const sourceRecords = recipe.sources.map(ref => {
      const source = this.one('SELECT * FROM sources WHERE id=?', ref.sourceId);
      return { ...this.publicSource(source), ...(source.asset_id ? { asset: this.publicAsset(this.asset(source.asset_id)) } : {}) };
    });
    const evidence = this.one('SELECT document FROM legacy_recipe_evidence WHERE recipe_id=?', id);
    return { id, version: row.version, recipe, createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: row.archived_at, media, sourceRecords,
      ...(evidence ? { legacy: JSON.parse(evidence.document) } : {}) };
  }

  legacy(id) {
    const detail = this.detail(id);
    return { recipeId: id, version: detail.version, evidence: detail.legacy ?? null };
  }

  knowledgeList(kind, { q, after, limit, filter }) {
    const table = kind === 'ingredients' ? 'ingredients' : 'techniques';
    const where = [], params = [];
    if (q) {
      where.push("EXISTS (SELECT 1 FROM json_each(name) n WHERE n.value LIKE ? ESCAPE '\\')");
      params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    }
    if (after) { where.push('id>?'); params.push(after); }
    params.push(limit + 1);
    const rows = this.all(`SELECT * FROM ${table} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id LIMIT ?`, ...params);
    const page = rows.slice(0, limit);
    const items = page.map(row => {
      if (kind === 'techniques') return { id: row.id, version: row.version, kind: row.kind, name: JSON.parse(row.name), ...optional('note', row.note && JSON.parse(row.note)), ...JSON.parse(row.document) };
      const extra = this.one('SELECT document FROM ingredient_knowledge WHERE ingredient_id=?', row.id);
      const revision=this.one('SELECT document FROM ingredient_revisions WHERE ingredient_id=? AND version=?',row.id,row.version);
      return { id: row.id, name: JSON.parse(row.name), aliases: JSON.parse(row.aliases), ...(extra ? JSON.parse(extra.document) : {}),
        ...(revision?JSON.parse(revision.document).ingredient:{}),version:row.version };
    });
    return { items, nextCursor: rows.length > limit ? Buffer.from(json({ after: page.at(-1).id, filter })).toString('base64url') : null };
  }

  write({ method, path, headers, recipe, id, archive = false }, { inTransaction = false } = {}) {
    const requestHash = hash({ method, path, ifMatch: headers.match, body: archive ? {} : recipe });
    const perform = () => {
      const receipt = this.one('SELECT request_hash,http_status,response FROM write_receipts WHERE actor=? AND request_key=?', headers.actor, headers.key);
      if (receipt) {
        if (receipt.request_hash !== requestHash) fail(409, 'IDEMPOTENCY_KEY_REUSED', '这个请求键已用于不同内容，请使用新请求键。');
        return { status: receipt.http_status, body: JSON.parse(receipt.response), replayed: true };
      }
      let current;
      const creating = !id;
      if (creating) id = randomUUID();
      else {
        current = this.recipeRow(id);
        if (current.version !== headers.version) fail(409, 'VERSION_CONFLICT', '菜谱已被修改，请保留当前输入并重新读取最新版本。', { currentVersion: current.version });
        if (current.archived_at) fail(409, 'RECIPE_ARCHIVED', '菜谱已归档。');
        if (archive) recipe = this.detailWithinTransaction(id).recipe;
        if(!archive&&this.detailWithinTransaction(id).recipe.recipeFormatVersion==='2'&&recipe.recipeFormatVersion!=='2')fail(409,'FORMAT_DOWNGRADE','已升级的厨房核定资料不能被旧客户端降级。');
      }
      // Archive preserves a historical snapshot even if an external file was
      // removed outside the service; create/update require ready references.
      if (!archive) this.validateReferences(recipe, id);
      const now = new Date().toISOString();
      if (creating) {
        this.run('INSERT INTO recipes(id,title,description,tags,base_servings,version,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)', id, json(recipe.title), recipe.description ? json(recipe.description) : null, json(recipe.tags), recipe.baseServings ?? null, now, now);
      } else {
        const result = this.run('UPDATE recipes SET title=?,description=?,tags=?,base_servings=?,version=version+1,archived_at=?,updated_at=? WHERE id=? AND version=?', json(recipe.title), recipe.description ? json(recipe.description) : null, json(recipe.tags), recipe.baseServings ?? null, archive ? now : null, now, id, headers.version);
        if (Number(result.changes) !== 1) fail(409, 'VERSION_CONFLICT', '菜谱版本已变化。');
      }
      if (!archive) this.replaceChildren(id, recipe);
      const body = this.snapshot(id, recipe);
      const status = creating ? 201 : 200;
      this.run('INSERT INTO recipe_revisions(recipe_id,version,document,actor,created_at) VALUES(?,?,?,?,?)', id, body.version, json(body), headers.actor, now);
      this.run('INSERT INTO write_receipts(actor,request_key,request_hash,http_status,response,created_at) VALUES(?,?,?,?,?,?)', headers.actor, headers.key, requestHash, status, json(body), now);
      return { status, body, replayed: false };
    };
    return inTransaction ? perform() : transaction(this.db, perform);
  }
}
