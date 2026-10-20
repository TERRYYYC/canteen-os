import Fastify, { LogController } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.mjs';
import { Repository } from './repository.mjs';
import { StandardIngredients, ingredientBody } from './standard-ingredients.mjs';
import { StandardTechniques, techniqueBody } from './standard-techniques.mjs';
import { RecipeAdoption } from './recipe-adoption.mjs';
import { FavoritesRepository, prepareFavorites } from './favorites.mjs';
import { fail, handleError } from './errors.mjs';
import { recipeBody, sourceBody, externalBody, rightsBody, writeHeaders, uuid, listQuery, knowledgeQuery, objectBody, sendsUnknowns } from './validation.mjs';
import { receiveImage, readImage, MAX_IMAGE_BYTES } from './media.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function appConfig(input = {}) {
  const host = input.host ?? '127.0.0.1';
  if (!loopback.has(host)) throw new Error('KB_HOST must be a loopback address');
  const port = Number(input.port ?? 4390);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('KB_PORT must be a valid port');
  const dataDir = resolve(input.dataDir ?? join(root, '.data'));
  const allowedOrigins = input.allowedOrigins ?? [4390, 5177, ...(port ? [port] : [])].flatMap(p => [`http://localhost:${p}`, `http://127.0.0.1:${p}`, `http://[::1]:${p}`]);
  if (!Array.isArray(allowedOrigins)) throw new Error('allowedOrigins must be an array');
  for (const origin of allowedOrigins) {
    let url;
    try { url = new URL(origin); } catch { throw new Error('Invalid KB_ALLOWED_ORIGINS'); }
    if (!loopback.has(url.hostname) || !['http:', 'https:'].includes(url.protocol) || origin !== url.origin) throw new Error('Allowed origins must be explicit loopback origins');
  }
  return { ...input, host: host === '[::1]' ? '::1' : host, port, dataDir, dbPath: resolve(input.dbPath ?? join(dataDir, 'knowledge.sqlite')), uploadsDir: join(dataDir, 'uploads'), webDist: resolve(input.webDist ?? join(root, 'apps/web/dist')), allowedOrigins: new Set(allowedOrigins), releaseId: input.releaseId ?? 'development' };
}

function validateHost(value) {
  if (typeof value !== 'string' || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(value)) fail(403, 'INVALID_HOST', '仅允许通过本机或 SSH 隧道访问。');
  const port = /:([0-9]+)$/.exec(value)?.[1];
  if (port && Number(port) > 65535) fail(403, 'INVALID_HOST', '访问地址不正确。');
}

function revisionVersion(value) {
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) fail(400, 'INVALID_VERSION', '历史版本必须为正整数。');
  return Number(value);
}

export async function buildApp(input = {}) {
  const config = appConfig(input);
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  mkdirSync(config.uploadsDir, { recursive: true, mode: 0o700 });
  const database = openDatabase(config.dbPath, config.migrationsDir);
  const repository = new Repository(database.db, config.uploadsDir);
  const standardIngredients = new StandardIngredients(repository);
  const standardTechniques = new StandardTechniques(repository);
  const adoption = new RecipeAdoption(repository, standardIngredients, standardTechniques);
  const app = Fastify({ logger: input.logger ?? false, trustProxy: false, bodyLimit: 4 * 1024 * 1024, logController: new LogController({ disableRequestLogging: true }) });
  app.decorate('kbConfig', config);
  app.addHook('onClose', async () => { database.db.close(); });
  app.setErrorHandler(handleError);
  app.addHook('onRequest', async (request, reply) => {
    validateHost(request.headers.host);
    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (!config.allowedOrigins.has(origin)) fail(403, 'ORIGIN_NOT_ALLOWED', '请求来源不在允许列表中。');
      reply.header('Access-Control-Allow-Origin', origin).header('Vary', 'Origin');
      reply.header('Access-Control-Expose-Headers', 'ETag, Idempotency-Replayed');
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !['web', 'agent'].includes(request.headers['x-kb-client'])) {
      fail(403, 'CLIENT_HEADER_REQUIRED', '写入请求需要有效客户端标记。');
    }
  });
  const favorites = new FavoritesRepository(database.db, repository);
  try {
    await app.register(multipart, { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 1 } });
    app.options('/api/v1/*', async (_request, reply) => reply
      .header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Content-Type, X-KB-Client, Idempotency-Key, If-Match')
      .header('Access-Control-Max-Age', '600').code(204).send());
    app.get('/api/v1/health', async () => ({ ok: true, sqliteVersion: database.sqliteVersion, schemaVersion: database.schemaVersion, releaseId: config.releaseId }));
    app.post('/api/v1/favorites/import/prepare', async request => prepareFavorites(request.body));
    app.post('/api/v1/favorites/import/apply', async (request, reply) => {
      const result = favorites.apply(request.body);
      return reply.code(result.replayed ? 200 : 201).send({ ...result.batch, replayed:result.replayed });
    });
    app.get('/api/v1/favorites/imports', async () => favorites.batches());
    app.get('/api/v1/favorites/imports/:id', async request => favorites.batch(uuid(request.params.id)));
    app.get('/api/v1/favorites/items', async request => favorites.items(request.query));
    app.get('/api/v1/favorites/items/:id', async request => favorites.item(uuid(request.params.id)));
    app.get('/api/v1/favorites/items/:id/captures', async request => favorites.captures(uuid(request.params.id)));
    app.post('/api/v1/favorites/items/:id/captures', async (request, reply) => {
      const result = favorites.capture(uuid(request.params.id), request.body);
      return reply.code(result.replayed ? 200 : 201).send(result.capture);
    });
    app.get('/api/v1/favorites/items/:id/candidates', async request => favorites.candidates(uuid(request.params.id)));
    app.post('/api/v1/favorites/items/:id/candidates', async (request, reply) => {
      const result = favorites.propose(uuid(request.params.id),request.body);
      return reply.code(result.replayed ? 200 : 201).send(result.candidate);
    });
    app.get('/api/v1/favorites/candidates/:id', async request => favorites.candidate(uuid(request.params.id)));
    app.post('/api/v1/favorites/candidates/:id/illustrations', async (request, reply) => {
      const result=favorites.illustrate(uuid(request.params.id),request.body);
      return reply.code(result.replayed ? 200 : 201).send(result.illustration);
    });
    app.post('/api/v1/favorites/candidates/:id/review', async request => favorites.review(uuid(request.params.id),request.body));
    app.post('/api/v1/favorites/items/:id/classify', async request => favorites.classify(uuid(request.params.id),request.body));
    app.get('/api/v1/recipes', async request => repository.list(listQuery(request.query)));
    for (const kind of ['ingredients', 'techniques']) app.get(`/api/v1/${kind}`, async request => repository.knowledgeList(kind, knowledgeQuery(kind, request.query)));
    app.get('/api/v1/ingredients/:id', async (request, reply) => {
      const detail = standardIngredients.detail(uuid(request.params.id));
      return reply.header('ETag', `"v${detail.version}"`).send(detail);
    });
    app.get('/api/v1/ingredients/:id/revisions/:version', async (request, reply) => {
      const detail = standardIngredients.revision(uuid(request.params.id), revisionVersion(request.params.version));
      return reply.header('ETag', `"v${detail.version}"`).send(detail);
    });
    const saveIngredient = (request, reply) => {
      const id = request.params.id ? uuid(request.params.id) : undefined;
      const result = standardIngredients.write({ method: request.method, path: request.url.split('?')[0], id,
        headers: writeHeaders(request, Boolean(id)), ingredient: ingredientBody(request.body) });
      return reply.code(result.status).header('ETag', `"v${result.body.version}"`).header('Idempotency-Replayed', String(result.replayed)).send(result.body);
    };
    app.post('/api/v1/ingredients', async (request, reply) => saveIngredient(request, reply));
    app.put('/api/v1/ingredients/:id', async (request, reply) => saveIngredient(request, reply));
    app.get('/api/v1/techniques/:id', async (request,reply) => {
      const detail=standardTechniques.detail(uuid(request.params.id));
      return reply.header('ETag',`"v${detail.version}"`).send(detail);
    });
    app.get('/api/v1/techniques/:id/revisions/:version', async (request,reply) => {
      const detail=standardTechniques.revision(uuid(request.params.id),revisionVersion(request.params.version));
      return reply.header('ETag',`"v${detail.version}"`).send(detail);
    });
    const saveTechnique=(request,reply)=>{
      const id=request.params.id?uuid(request.params.id):undefined;
      const result=standardTechniques.write({method:request.method,path:request.url.split('?')[0],id,headers:writeHeaders(request,Boolean(id)),technique:techniqueBody(request.body)});
      return reply.code(result.status).header('ETag',`"v${result.body.version}"`).header('Idempotency-Replayed',String(result.replayed)).send(result.body);
    };
    app.post('/api/v1/techniques',async(request,reply)=>saveTechnique(request,reply));
    app.put('/api/v1/techniques/:id',async(request,reply)=>saveTechnique(request,reply));
    app.get('/api/v1/recipes/:id/legacy', async request => repository.legacy(uuid(request.params.id)));
    app.get('/api/v1/recipes/:id', async (request, reply) => {
      const detail = repository.detail(uuid(request.params.id));
      return reply.header('ETag', `"v${detail.version}"`).send(detail);
    });
    app.get('/api/v1/recipes/:id/revisions', async request => repository.revisions(uuid(request.params.id)));
    app.get('/api/v1/recipes/:id/revisions/:version', async (request, reply) => {
      const detail = repository.revision(uuid(request.params.id), revisionVersion(request.params.version));
      return reply.header('ETag', `"v${detail.version}"`).send(detail);
    });
    app.get('/api/v1/recipes/:id/revisions/:version/adoption', async request => adoption.adoption(uuid(request.params.id), revisionVersion(request.params.version)));
    app.post('/api/v1/recipes/:id/revisions/:version/approve', async (request, reply) => {
      const result = adoption.approve(uuid(request.params.id), revisionVersion(request.params.version), request.body, writeHeaders(request, true));
      return reply.code(result.status).header('Idempotency-Replayed', String(result.replayed)).send(result.body);
    });
    app.get('/api/v1/recipes/:id/source-illustrations', async request => {
      const recipeId=uuid(request.params.id);
      const query=new URL(request.raw.url,'http://kb.local').searchParams;
      const versions=query.getAll('version');
      if ([...query.keys()].length!==1 || versions.length!==1 || !/^[1-9][0-9]*$/.test(versions[0]) || !Number.isSafeInteger(Number(versions[0])))
        fail(400,'INVALID_VERSION','请指定唯一的正整数菜谱版本。');
      return favorites.sourceIllustrations(recipeId,Number(versions[0]));
    });
    const save = (request, reply, archive = false) => {
      const id = request.params.id ? uuid(request.params.id) : undefined;
      const headers = writeHeaders(request, Boolean(id));
      const recipe = archive ? (objectBody(request.body, []), undefined) : recipeBody(request.body);
      const result = repository.write({ method: request.method, path: request.url.split('?')[0], headers, recipe, id, archive, unknownsSent: !archive && sendsUnknowns(request.body) });
      return reply.code(result.status).header('ETag', `"v${result.body.version}"`).header('Idempotency-Replayed', String(result.replayed)).send(result.body);
    };
    app.post('/api/v1/recipes', async (request, reply) => save(request, reply));
    app.put('/api/v1/recipes/:id', async (request, reply) => save(request, reply));
    app.post('/api/v1/recipes/:id/archive', async (request, reply) => save(request, reply, true));
    app.post('/api/v1/assets/external', async (request, reply) => reply.code(201).send(repository.registerExternal(externalBody(request.body))));
    app.post('/api/v1/assets/upload', async (request, reply) => {
      const asset = await receiveImage(request, config.uploadsDir);
      let result;
      try { result = repository.registerImage(asset); }
      catch (error) { await unlink(asset.finalPath).catch(() => {}); throw error; }
      return reply.code(201).send(result);
    });
    app.post('/api/v1/assets/:id/rights', async request => repository.registerRights(uuid(request.params.id), rightsBody(request.body)));
    app.get('/api/v1/assets/:id/content', async (request, reply) => {
      const asset = repository.asset(uuid(request.params.id));
      if (!asset || asset.storage !== 'local') fail(404, 'ASSET_NOT_FOUND', '图片文件不存在。');
      const bytes = readImage(config.uploadsDir, asset);
      return reply.header('Content-Type', asset.mime_type).header('Cache-Control', 'private, max-age=31536000, immutable').header('Content-Disposition', 'inline').send(bytes);
    });
    app.post('/api/v1/sources', async (request, reply) => reply.code(201).send(repository.registerSource(sourceBody(request.body))));
    const hasWeb = existsSync(join(config.webDist, 'index.html'));
    if (hasWeb) await app.register(fastifyStatic, { root: config.webDist, index: ['index.html'] });
    app.setNotFoundHandler((request, reply) => {
      if (hasWeb && request.method === 'GET' && !request.url.startsWith('/api/') && !request.url.split('?')[0].split('/').at(-1).includes('.')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '请求的资源不存在。' } });
    });
    await app.ready();
    return app;
  } catch (error) { await app.close(); throw error; }
}
