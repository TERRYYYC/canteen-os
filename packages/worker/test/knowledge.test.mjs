import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKER, makeEnv, bearer } from './helpers.mjs';

const worker = (await import(WORKER)).default;
const { KNOWLEDGE_ROUTES, KNOWLEDGE_JSON_MAX_BYTES, KNOWLEDGE_UPLOAD_MAX_BYTES } = await import('../dist/knowledge-routes.js');
const id = '3f4c6638-dcf8-4231-966c-1c5e2816c059';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6D4sAAAAASUVORK5CYII=', 'base64');
const asJson = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function fixture(respond = async req => req.url.endsWith('/content') ? new Response(png, { headers: { 'Content-Type': 'image/png' } }) : asJson({ id, version: 2 }, req.method === 'POST' ? 201 : 200), overrides = {}) {
  const seen = [];
  let gitCalls = 0;
  const { env, logs, clock } = makeEnv(null, {
    GITHUB_PAT: undefined,
    KNOWLEDGE_BASE_URL: 'http://127.0.0.1:4390',
    __fetch: async () => { gitCalls++; throw Error('GitHub must not be called'); },
    __knowledgeFetch: async (input, init) => {
      const request = new Request(input, init);
      seen.push(request);
      return respond(request, init);
    },
    ...overrides,
  });
  return { env, logs, clock, seen, get gitCalls() { return gitCalls; } };
}

function send(f, method, path, { role = 'chef', body, headers = {}, raw } = {}) {
  const h = new Headers(role ? bearer(role) : {});
  for (const [name, value] of Object.entries(headers)) h.set(name, value);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return worker.fetch(new Request(`http://worker.example${path}`, {
    method, headers: h,
    ...(raw !== undefined ? { body: raw, duplex: 'half' } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), f.env);
}

test('all knowledge routes require Bearer; buyers read all routes but cannot write; chefs and admins can write', async () => {
  for (const [method, template] of KNOWLEDGE_ROUTES) {
    const path = template.replace(':id', id).replace(':version', '1');
    const upload = path.endsWith('/upload');
    const request = method === 'GET' ? {} : upload ? { raw: '--test--\r\n', headers: { 'Content-Type': 'multipart/form-data; boundary=test' } } : { body: {} };
    for (const role of [null, 'buyer', 'chef', 'admin']) {
      const f = fixture();
      const response = await send(f, method, path, { ...request, role });
      const expected = role === null ? 401 : role === 'buyer' && (method !== 'GET' || path.startsWith('/knowledge/favorites')) ? 403 : method === 'POST' ? 201 : 200;
      assert.equal(response.status, expected, `${role} ${method} ${path}: ${await response.text()}`);
      assert.equal(f.seen.length, expected < 400 ? 1 : 0);
      assert.equal(f.gitCalls, 0);
    }
  }
});

test('favorites inbox has fixed routes, private access and bounded query forwarding', async () => {
  const f = fixture();
  const response = await send(f, 'GET', '/knowledge/favorites/items?folder=%E5%90%83%E7%9A%84&state=evidence_pending&limit=50');
  assert.equal(response.status, 200);
  assert.equal(f.seen[0].url, 'http://127.0.0.1:4390/api/v1/favorites/items?folder=%E5%90%83%E7%9A%84&state=evidence_pending&limit=50');
  assert.equal((await send(fixture(), 'GET', '/knowledge/favorites/items', { role: 'buyer' })).status, 403);
  assert.equal((await send(fixture(), 'GET', '/knowledge/favorites/items?sourceUrl=https://outside.invalid')).status, 400);
  assert.equal((await send(fixture(), 'POST', `/knowledge/favorites/items/${id}/captures`, { body: {} })).status, 201);
  assert.equal((await send(fixture(), 'POST', `/knowledge/favorites/items/${id}/candidates`, { body: {} })).status, 201);
  assert.equal((await send(fixture(), 'POST', `/knowledge/favorites/candidates/${id}/review`, { body: {} })).status, 201);
});

test('PUT keeps raw decimal strings, preconditions and KB error bodies, and does not forward old credentials or ambient headers', async () => {
  const upstreamBody = { error: { code: 'VERSION_CONFLICT', message: '此菜谱已经更新。', details: { currentVersion: 7 } } };
  const f = fixture(async req => {
    assert.equal(req.method, 'PUT');
    assert.equal(req.url, `http://127.0.0.1:4390/api/v1/recipes/${id}`);
    assert.deepEqual([...req.headers.keys()].sort(), ['content-type', 'idempotency-key', 'if-match', 'x-kb-client']);
    assert.equal(req.headers.get('x-kb-client'), 'web');
    assert.equal(req.headers.get('if-match'), '"v2"');
    assert.equal(req.headers.get('idempotency-key'), 'stable-retry-key');
    assert.equal(await req.text(), '{"amount":"0.123456789012345678901234567890123456"}');
    return asJson(upstreamBody, 409, { ETag: '"v7"', 'Idempotency-Replayed': 'true', 'Retry-After': '3', 'Set-Cookie': 'must-not-leak=1', Location: 'https://outside.invalid/', Server: 'private-server' });
  });
  const response = await send(f, 'PUT', `/knowledge/recipes/${id}`, {
    raw: '{"amount":"0.123456789012345678901234567890123456"}',
    headers: { 'Content-Type': 'application/json', 'If-Match': '"v2"', 'Idempotency-Key': 'stable-retry-key', Cookie: 'private=secret', Origin: 'https://browser.invalid', 'X-KB-Client': 'agent', 'X-Forwarded-Host': 'outside.invalid', 'X-Arbitrary': 'ignored' },
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), upstreamBody);
  for (const [key, expected] of [['etag', '"v7"'], ['idempotency-replayed', 'true'], ['retry-after', '3'], ['cache-control', 'no-store'], ['x-content-type-options', 'nosniff']]) assert.equal(response.headers.get(key), expected);
  for (const key of ['set-cookie', 'location', 'server']) assert.equal(response.headers.get(key), null);
  assert.match(response.headers.get('access-control-expose-headers'), /ETag.*Idempotency-Replayed/);
  assert.equal(f.gitCalls, 0);
  assert.deepEqual(Object.keys(f.logs[0]).sort(), ['endpoint', 'role', 'status', 'time']);
  assert.equal(f.logs[0].endpoint, 'PUT /knowledge/recipes/:id');
});

test('upstream creates, idempotency replies, errors and image bytes preserve their status and payload', async () => {
  for (const status of [201, 400, 404, 409, 422, 428, 429, 500, 503]) {
    const body = status === 201 ? { id, version: 1 } : { error: { code: `UPSTREAM_${status}`, message: '知识库原样错误。' } };
    const f = fixture(async () => asJson(body, status, { 'Idempotency-Replayed': 'true' }));
    const response = await send(f, 'POST', '/knowledge/recipes', { body: { title: { zh: '红烧肉' } }, headers: { 'Idempotency-Key': 'create-key' } });
    assert.equal(response.status, status); assert.deepEqual(await response.json(), body);
    assert.equal(response.headers.get('idempotency-replayed'), 'true');
  }
  const f = fixture();
  const image = await send(f, 'GET', `/knowledge/assets/${id}/content`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
});

test('fixed path and query whitelist refuses alternate proxy destinations, aliases and unsupported methods', async () => {
  const failures = [
    ['GET', '/knowledge/recipes?url=http://outside.invalid', 400],
    ['GET', '/knowledge/recipes?q=one&q=two', 400],
    ['GET', '/knowledge/recipes?limit=101', 400],
    ['GET', '/knowledge/recipes?limit=00', 400],
    ['GET', '/knowledge/recipes?q=%00', 400],
    ['GET', `/knowledge/recipes?q=${'x'.repeat(201)}`, 400],
    ['GET', `/knowledge/recipes/${id}?revision=1`, 400],
    ['GET', `/knowledge/recipes/${id.toUpperCase()}`, 400],
    ['GET', '/knowledge/recipes/not-a-uuid', 400],
    ['GET', `/knowledge/recipes/${id}/revisions/01`, 400],
    ['GET', `/knowledge/recipes/${id}/revisions/9007199254740992`, 400],
    ['GET', `/knowledge/recipes/${id.replace('3', '%33')}`, 400],
    ['GET', '/knowledge//recipes', 400],
    ['GET', '/knowledge/recipes/', 400],
    ['GET', '/knowledge/recipes/%2Fsecret', 400],
    ['GET', '/knowledge/proxy', 404],
    ['DELETE', `/knowledge/recipes/${id}`, 404],
    ['POST', '/knowledge/ingredients', 404],
    ['GET', '/knowledge/ingredients?tag=one', 400],
    ['GET', '/knowledge/techniques?after=one', 400],
    ['GET', `/knowledge/ingredients?cursor=${'x'.repeat(1001)}`, 400],
  ];
  for (const [method, path, expected] of failures) {
    const f = fixture();
    assert.equal((await send(f, method, path)).status, expected, path);
    assert.equal(f.seen.length, 0, path); assert.equal(f.gitCalls, 0);
  }
  for (const path of ['/knowledge/recipes?q=%E7%BA%A2%E7%83%A7%E8%82%89&tag=test&limit=100&cursor=opaque_cursor', '/knowledge/ingredients?q=salt&limit=20&cursor=opaque_cursor', '/knowledge/techniques?q=%E7%82%92&limit=1&cursor=opaque_cursor']) {
    const f = fixture();
    assert.equal((await send(f, 'GET', path)).status, 200);
    assert.equal(new URL(f.seen[0].url).searchParams.get('cursor'), 'opaque_cursor');
  }
});

test('missing or unsafe trusted URL fails closed, independent of request URL and Git fetch configuration', async () => {
  for (const url of [undefined, '', 'https://outside.invalid', 'http://localhost:4390', 'http://127.0.0.1:4380', 'http://127.0.0.1:4390@outside.invalid', 'http://127.0.0.1:4390/api/v1', 'http://127.0.0.1:4390?target=x', 'http://127.0.0.1:4390#x']) {
    const f = fixture(undefined, { KNOWLEDGE_BASE_URL: url });
    const response = await send(f, 'GET', '/knowledge/health');
    assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'KNOWLEDGE_NOT_CONFIGURED');
    assert.equal(f.seen.length, 0); assert.equal(f.gitCalls, 0);
  }
  const recovery = fixture(undefined, { KNOWLEDGE_BASE_URL: 'http://127.0.0.1:4391/' });
  assert.equal((await send(recovery, 'GET', '/knowledge/health')).status, 200);
  assert.equal(recovery.seen[0].url, 'http://127.0.0.1:4391/api/v1/health');
});

test('network failure, redirection, invalid response and whole-body timeout are explicit; none fall back to Git', async () => {
  for (const respond of [
    async () => { throw Error('secret internal endpoint'); },
    async (_req, init) => { assert.equal(init.redirect, 'manual'); return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1:4380/' } }); },
    async () => new Response('<html>secret internal endpoint</html>', { headers: { 'Content-Type': 'text/html' } }),
    async () => new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
  ]) {
    const f = fixture(respond);
    const response = await send(f, 'GET', '/knowledge/recipes');
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes('secret internal endpoint'));
    assert.equal(f.gitCalls, 0);
  }
  for (const bodyStall of [false, true]) {
    let signal;
    let bodyCancelled = false;
    const f = fixture(async (req, init) => {
      signal = init.signal;
      if (bodyStall) return new Response(new ReadableStream({ start() {}, cancel() { bodyCancelled = true; } }), { headers: { 'Content-Type': 'application/json' } });
      return new Promise(() => {});
    }, { KNOWLEDGE_TIMEOUT_MS: '100' });
    const response = await send(f, 'GET', '/knowledge/recipes');
    assert.equal(response.status, 504); assert.equal((await response.json()).error.code, 'KNOWLEDGE_TIMEOUT');
    assert.equal(signal.aborted, true); assert.equal(f.gitCalls, 0);
    if (bodyStall) assert.equal(bodyCancelled, true, 'deadline must release the stalled upstream response reader');
  }
});

test('PUT JSON is bounded at 4 MiB; old JSON remains 256 KiB; streams are cancelled at their bound', async () => {
  const raw = '{"text":"' + 'x'.repeat(KNOWLEDGE_JSON_MAX_BYTES - 11) + '"}';
  assert.equal(Buffer.byteLength(raw), KNOWLEDGE_JSON_MAX_BYTES);
  const f = fixture(async req => { assert.equal((await req.arrayBuffer()).byteLength, KNOWLEDGE_JSON_MAX_BYTES); return asJson({ id }); });
  assert.equal((await send(f, 'PUT', `/knowledge/recipes/${id}`, { raw, headers: { 'Content-Type': 'application/json' } })).status, 200);
  const over = fixture();
  assert.equal((await send(over, 'PUT', `/knowledge/recipes/${id}`, { raw: raw + ' ', headers: { 'Content-Type': 'application/json' } })).status, 413);
  assert.equal(over.seen.length, 0);
  assert.equal((await send(fixture(), 'POST', '/plan/week-43', { raw, headers: { 'Content-Type': 'application/json' } })).status, 413);
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(KNOWLEDGE_JSON_MAX_BYTES + 1)); }, cancel() { cancelled = true; } });
  assert.equal((await send(fixture(), 'PUT', `/knowledge/recipes/${id}`, { raw: stream, headers: { 'Content-Type': 'application/json' } })).status, 413);
  assert.equal(cancelled, true);
  assert.equal((await send(fixture(), 'PUT', `/knowledge/recipes/${id}`, { raw: '{broken', headers: { 'Content-Type': 'application/json' } })).status, 400);
});

test('multipart uploads retain boundary and bytes with 8 MiB plus 64 KiB envelope cap', async () => {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(8 * 1024 * 1024)], { type: 'image/png' }), 'large.png');
  const prepared = new Request('http://form.invalid', { method: 'POST', body: form });
  const bytes = await prepared.arrayBuffer();
  const type = prepared.headers.get('content-type');
  assert.ok(bytes.byteLength > 8 * 1024 * 1024 && bytes.byteLength <= KNOWLEDGE_UPLOAD_MAX_BYTES);
  const f = fixture(async req => {
    assert.equal(req.headers.get('content-type'), type);
    assert.deepEqual(Buffer.from(await req.arrayBuffer()), Buffer.from(bytes));
    return asJson({ id, kind: 'image' }, 201);
  });
  assert.equal((await send(f, 'POST', '/knowledge/assets/upload', { raw: bytes, headers: { 'Content-Type': type } })).status, 201);
  for (const options of [
    { raw: new Uint8Array(KNOWLEDGE_UPLOAD_MAX_BYTES + 1), headers: { 'Content-Type': type } },
    { raw: '', headers: { 'Content-Type': type, 'Content-Length': String(KNOWLEDGE_UPLOAD_MAX_BYTES + 1) } },
  ]) {
    const over = fixture(); assert.equal((await send(over, 'POST', '/knowledge/assets/upload', options)).status, 413); assert.equal(over.seen.length, 0);
  }
  for (const contentType of ['application/json', 'multipart/form-data', `multipart/form-data; boundary=${'x'.repeat(71)}`]) {
    const invalid = fixture(); assert.equal((await send(invalid, 'POST', '/knowledge/assets/upload', { raw: '--invalid--', headers: { 'Content-Type': contentType } })).status, 400); assert.equal(invalid.seen.length, 0);
  }
});

test('knowledge rates are isolated from old read/write budgets and OPTIONS permits PUT and idempotency headers', async () => {
  const f = fixture();
  f.env.__rateStore.set('chef:write', Array(60).fill(f.clock.t));
  f.env.__rateStore.set('chef:read', Array(600).fill(f.clock.t));
  assert.equal((await send(f, 'GET', '/knowledge/recipes')).status, 200);
  assert.equal((await send(f, 'POST', '/knowledge/recipes', { body: {} })).status, 201);
  f.env.__rateStore.set('chef:knowledge-write', Array(60).fill(f.clock.t));
  const denied = await send(f, 'PUT', `/knowledge/recipes/${id}`, { body: {} });
  assert.equal(denied.status, 429); assert.ok(Number(denied.headers.get('retry-after')) > 0);
  assert.equal(f.seen.length, 2);
  const options = await send(f, 'OPTIONS', `/knowledge/recipes/${id}`, { role: null });
  assert.equal(options.status, 200);
  assert.match(options.headers.get('access-control-allow-methods'), /PUT/);
  assert.match(options.headers.get('access-control-allow-headers'), /Idempotency-Key/);
  assert.equal(options.headers.get('access-control-allow-credentials'), null);
});
