/** L1 client–Worker composition. Only GitHub is replaced by the existing FakeRepo.
 * Its commit graph is synthetic; this is not browser, deployment, or L2 evidence.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FakeRepo, makeEnv, TOKENS, WORKER } from '../../../../worker/test/helpers.mjs';
import { materializeFixture, CONTRACTS_ROOT } from '../../../../../scripts/validate-contract-fixtures.mjs';
import { validateData } from '../../../../../scripts/validate-schemas.mjs';

const worker = (await import(WORKER)).default;
const webRoot = fileURLToPath(new URL('../../../', import.meta.url));
const schemaDir = fileURLToPath(new URL('../../../../../schemas/', import.meta.url));
const origin = 'https://worker.example.invalid';
export const selection = [{ menuPlanRef: 'team-week', date: '2026-09-14', mealType: 'lunch' }];
export const json = value => `${JSON.stringify(value, null, 2)}\n`;
export const clone = value => structuredClone(value);

/** One bundle keeps the client's and editor's ApiError constructor identical. */
export async function loadClient(t) {
  const require = createRequire(import.meta.url);
  const viteRequire = createRequire(require.resolve('vite/package.json'));
  const esbuild = await import(pathToFileURL(viteRequire.resolve('esbuild')).href);
  const bundle = await esbuild.build({
    stdin: {
      contents: 'export { createTeamMealsApi } from "./src/api/team-meals.ts"; export { createEditSession } from "./src/view-models/edit-session.ts"; export { ApiError } from "./src/api/types.ts";',
      resolveDir: webRoot,
    },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
    define: { 'import.meta.env.VITE_WORKER_URL': '""' }, logLevel: 'silent',
  });
  const dir = await mkdtemp(join(tmpdir(), 'canteenos-client-worker-bundle-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const entry = join(dir, 'client.mjs');
  await writeFile(entry, bundle.outputFiles[0].text);
  return import(pathToFileURL(entry).href);
}

async function filesUnder(root, relative = 'data') {
  const files = {};
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = `${relative}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(files, await filesUnder(root, path));
    else files[path] = await readFile(join(root, path));
  }
  return files;
}

export function filesAt(repo, revision = repo.head) {
  const tree = repo.trees.get(repo.commits.get(revision).tree);
  return Object.fromEntries([...tree].map(([path, sha]) => [path, Buffer.from(repo.blobs.get(sha))]));
}

export function changedFiles(repo, before, after = repo.head) {
  const a = repo.trees.get(repo.commits.get(before).tree);
  const b = repo.trees.get(repo.commits.get(after).tree);
  return [...new Set([...a.keys(), ...b.keys()])].filter(path => a.get(path) !== b.get(path)).sort();
}

export async function setup(t, client) {
  const dir = await mkdtemp(join(tmpdir(), 'canteenos-client-worker-inputs-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  materializeFixture('local-image', dir);
  for (const [source, target] of [
    ['menu-plan-v3.json', 'menu-plans/team-week.json'],
    ['dish-v3.json', 'dishes/second-dish.json'],
  ]) {
    await writeFile(join(dir, 'data', target), await readFile(join(CONTRACTS_ROOT, 'pending-a1/valid', source)));
  }
  const report = validateData({ root: dir, schemaDir });
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter(result => !result.valid)));
  const repo = new FakeRepo();
  const revision = repo.commit(await filesUnder(dir), 'L1 frozen fixture materialization');
  const { env } = makeEnv(repo);
  const fakeFetch = env.__fetch;
  env.__fetch = (input, init) => {
    assert.equal(new URL(typeof input === 'string' ? input : input.url).origin, 'https://api.github.com');
    return fakeFetch(input, init);
  };
  const requests = [];
  const reads = [];
  let dropPath = null;
  const apis = [], editors = [];
  t.after(() => {
    editors.forEach(editor => editor.dispose());
    apis.forEach(api => api.dispose());
    t.diagnostic(JSON.stringify({
      layer: 'L1 client–Worker', requests: requests.length,
      clientPosts: requests.filter(request => request.method === 'POST').length,
      responseDrops: requests.filter(request => request.dropped).length,
      githubModelWrites: repo.writeCalls().length,
    }));
  });
  function api(role = 'buyer') {
    const api = client.createTeamMealsApi(origin, {
      mode: 'mock', token: () => TOKENS[role],
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        assert.equal(url.origin, origin);
        const trace = {
          method: request.method, path: url.pathname, search: url.search,
          ifMatch: request.headers.get('If-Match'), ifNoneMatch: request.headers.get('If-None-Match'),
          cache: request.cache, redirect: request.redirect,
          body: request.method === 'POST' ? await request.clone().json() : undefined,
        };
        requests.push(trace);
        // Never stub a Worker response: the real handler performs all validation and writes.
        const response = await worker.fetch(request, env);
        trace.status = response.status;
        trace.sourceRevision = response.headers.get('X-Source-Revision');
        if (response.headers.get('Content-Type')?.includes('application/json')) {
          trace.response = await response.clone().json();
        }
        if (dropPath === url.pathname && request.method === 'POST' && response.ok) {
          dropPath = null;
          trace.dropped = true;
          // Fault is after the actual handler committed; its response is then lost in transport.
          throw new TypeError('L1 simulated response loss');
        }
        return response;
      },
    });
    apis.push(api);
    return api;
  }
  function editor(api, identity, draft, source = null) {
    const suffix = { plan: 'Plan', dish: 'Dish', 'shopping-list': 'ShoppingList' };
    const editor = client.createEditSession({
      mode: () => api.mode,
      authSession: () => api.sessionKey(),
      save: (identity, body, condition) => api[`save${suffix[identity.kind]}`](identity.id, body, condition),
      read: (identity, options) => {
        reads.push({ identity: clone(identity), options: clone(options) });
        return api[`get${suffix[identity.kind]}`](identity.id, options);
      },
    });
    editor.open(identity, draft, source);
    editors.push(editor);
    return editor;
  }
  return { repo, revision, requests, reads, api, editor, dropNextResponse: path => { dropPath = path; } };
}

export async function inputsAt(api, revision) {
  const [catalog, plan] = await Promise.all([
    api.getCatalog({ revision }), api.getPlan('team-week', { revision }),
  ]);
  assert.equal(catalog.commit, revision);
  assert.equal(plan?.commit, revision);
  return { menuPlans: { 'team-week': plan.content }, dishes: catalog.dishes, ingredients: catalog.ingredients, techniques: catalog.techniques };
}

export async function saveOK(editor) {
  assert.equal((await editor.save()).status, 'saved', JSON.stringify(editor.getState()));
  return editor.getState().source;
}
