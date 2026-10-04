import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, cpSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const webRoot = path.join(root, 'packages/web');
const webRequire = createRequire(path.join(webRoot, 'package.json'));
const vitePackagePath = webRequire.resolve('vite/package.json');
const vitePackage = JSON.parse(readFileSync(vitePackagePath, 'utf8'));
const {build} = await import(pathToFileURL(path.resolve(path.dirname(vitePackagePath), vitePackage.exports['.'].import.default)).href);
const sha = 'a'.repeat(40);
const temporary = mkdtempSync(path.join(tmpdir(), 'team-pwa-assets-'));
const deployments = new Map();
after(() => rmSync(temporary, {recursive: true, force: true}));

// Evaluate the actual generated AMD modules. Registration/lifecycle hooks are
// observed, not installed in a browser; strategy/plugin constructors stay real.
function inspectWorker(outDir, base) {
  const origin = 'https://canteen.example';
  const scope = `${origin}${base}`;
  const exports = {};
  const constructorOptions = new Map();
  const routes = [], precache = [], precacheOptions = [];
  const context = vm.createContext({URL, Request, Response, Headers, console, setTimeout, clearTimeout,
    registration: {scope}, location: new URL('sw.js', scope), addEventListener() {},
    fetch() { throw new Error('Network is forbidden in generated-SW configuration tests'); }});
  context.self = context;
  context.define = (dependencies, factory) => {
    assert.deepEqual(Array.from(dependencies), ['exports']);
    factory(exports);
  };
  const workboxFile = readdirSync(outDir).find(name => /^workbox-.*\.js$/.test(name));
  assert.ok(workboxFile, 'production build must emit a real Workbox module');
  vm.runInContext(readFileSync(path.join(outDir, workboxFile), 'utf8'), context, {filename: workboxFile});
  const observed = {...exports,
    clientsClaim() {}, cleanupOutdatedCaches() {},
    precacheAndRoute(entries, options) { precache.push(...entries); precacheOptions.push(options); },
    createHandlerBoundToURL() { return () => {}; },
    registerRoute(capture, handler, method) { routes.push({capture, handler, method}); },
  };
  // Only the strategies the config actually uses get bundled into the generated SW. Since issue #110
  // dropped the manifest's NetworkFirst route, NetworkFirst is no longer exported — wrapping a missing
  // export would throw here and hide the real assertions below.
  for (const name of ['CacheFirst', 'NetworkFirst', 'StaleWhileRevalidate', 'ExpirationPlugin', 'CacheableResponsePlugin']) {
    if (typeof exports[name] !== 'function') continue;
    observed[name] = new Proxy(exports[name], {
      construct(target, args) {
        const instance = Reflect.construct(target, args);
        constructorOptions.set(instance, {name, options: args[0]});
        return instance;
      },
    });
  }
  context.define = (dependencies, factory) => {
    assert.equal(dependencies.length, 1);
    assert.match(dependencies[0], /^\.\/workbox-/);
    factory(observed);
  };
  vm.runInContext(readFileSync(path.join(outDir, 'sw.js'), 'utf8'), context, {filename: 'sw.js'});
  const runtime = routes.filter(route => constructorOptions.has(route.handler));
  return {origin, scope, base, runtime, precache, precacheOptions, constructorOptions, exports};
}

before(async () => {
  const publicDir = path.join(temporary, 'public');
  for (const dir of ['data/team-meals', `data/assets/${sha}/data/ingredients`, 'icons']) mkdirSync(path.join(publicDir, dir), {recursive: true});
  writeFileSync(path.join(publicDir, 'data/build.json'), JSON.stringify({target: 'team-meals', projectionVersion: '1', commit: sha, plans: ['week']}));
  writeFileSync(path.join(publicDir, 'data/team-meals/week.json'), JSON.stringify({sourceRevision: sha}));
  writeFileSync(path.join(publicDir, 'icons/probe.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  cpSync(path.join(root, 'test/fixtures/contracts/valid/local-image/data/ingredients/pattern.png'), path.join(publicDir, `data/assets/${sha}/data/ingredients/photo.png`));
  for (const base of ['/', '/canteen-os/']) {
    const outDir = path.join(temporary, base === '/' ? 'root' : 'subpath');
    await build({root: webRoot, configFile: path.join(webRoot, 'vite.config.ts'), base, publicDir,
      logLevel: 'silent', build: {outDir, emptyOutDir: true, reportCompressedSize: false}});
    deployments.set(base, inspectWorker(outDir, base));
  }
});

function published(deployment) {
  const route = deployment.runtime.find(route => route.handler.cacheName === 'published-assets');
  assert.ok(route, 'generated SW must route published fetch assets into a dedicated cache');
  return route;
}
function matches(deployment, route, href, method = 'GET') {
  const request = new Request(href, {method});
  assert.equal(request.destination, '', 'the reader uses fetch, not an image destination');
  const url = new URL(request.url);
  const before = [request.url, url.href, url.pathname];
  const result = route.capture({request, url, sameOrigin: url.origin === deployment.origin});
  assert.deepEqual([request.url, url.href, url.pathname], before, 'matcher must not rewrite encoded URLs');
  return result;
}

for (const base of ['/', '/canteen-os/']) {
  test(`${base}: generated SW routes published fetch assets before the generic image rule`, () => {
    const deployment = deployments.get(base), route = published(deployment);
    const image = deployment.runtime.find(route => route.handler.cacheName === 'images');
    assert.ok(route.handler instanceof deployment.exports.CacheFirst);
    assert.equal(route.method, 'GET');
    assert.ok(deployment.runtime.indexOf(route) < deployment.runtime.indexOf(image));
    assert.equal(matches(deployment, route, `${deployment.scope}data/assets/${sha}/data/ingredients/photo.png`), true);
    assert.equal(matches(deployment, image, `${deployment.scope}data/assets/${sha}/data/ingredients/photo.png`), false);
  });

  test(`${base}: encoded paths and distinct source versions are preserved`, () => {
    const deployment = deployments.get(base), route = published(deployment);
    for (const revision of [sha, 'b'.repeat(40)]) {
      for (const encoded of ['data/ingredients/photo.png', 'data/ingredients/%E7%95%AA%E8%8C%84%20%23%3F%25.png', 'data/dishes/literal%252F%252e%252e.png', 'data/ingredients/slash%2Fname.png']) {
        assert.equal(matches(deployment, route, `${deployment.scope}data/assets/${revision}/${encoded}`), true);
      }
    }
    assert.equal(route.handler.matchOptions, undefined);
    assert.equal(route.handler.plugins.some(plugin => typeof plugin.cacheKeyWillBeUsed === 'function'), false);
  });

  test(`${base}: other origins, methods, namespaces and malformed revision paths do not match`, () => {
    const deployment = deployments.get(base), route = published(deployment);
    const asset = `${deployment.scope}data/assets/${sha}/data/ingredients/photo.png`;
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) assert.equal(matches(deployment, route, asset, method), false);
    const rejected = [
      asset.replace(deployment.origin, 'https://external.example'),
      `${deployment.origin}${base === '/' ? '/other/' : '/'}data/assets/${sha}/photo.png`,
      `${deployment.scope}nested/data/assets/${sha}/photo.png`,
      `${deployment.scope}data/assets-other/${sha}/photo.png`,
      `${deployment.scope}data/build.json`, `${deployment.scope}data/team-meals/week.json`,
      `${deployment.scope}data/ingredients/photo.png`, `${deployment.scope}api/asset?revision=${sha}`,
      ...['latest', 'a'.repeat(39), 'a'.repeat(41), 'A'.repeat(40), 'g'.repeat(40), `%61${'a'.repeat(39)}`].map(revision => `${deployment.scope}data/assets/${revision}/photo.png`),
      `${deployment.scope}data/assets/${sha}`, `${deployment.scope}data/assets/${sha}/`,
    ];
    for (const href of rejected) assert.equal(matches(deployment, route, href), false, href);
  });

  test(`${base}: actual emitted response plugin caches only status 200`, async () => {
    const deployment = deployments.get(base), route = published(deployment);
    const plugin = route.handler.plugins.find(plugin => typeof plugin.cacheWillUpdate === 'function');
    assert.ok(plugin instanceof deployment.exports.CacheableResponsePlugin);
    const ok = new Response('same-version bytes', {status: 200});
    assert.equal(await plugin.cacheWillUpdate({response: ok}), ok);
    for (const response of [Response.error(), ...[201, 204, 206, 301, 302, 304, 400, 404, 500].map(status => new Response(null, {status}))]) {
      assert.equal(await plugin.cacheWillUpdate({response}), null, `status ${response.status}`);
    }
  });

  test(`${base}: published-assets has its own bounded CacheFirst expiration`, () => {
    const deployment = deployments.get(base), route = published(deployment);
    const expiration = route.handler.plugins.map(plugin => deployment.constructorOptions.get(plugin)).find(record => record?.name === 'ExpirationPlugin');
    assert.ok(expiration);
    assert.equal(expiration.options.maxEntries, 300);
    assert.equal(expiration.options.maxAgeSeconds, 30 * 24 * 3600);
    assert.notEqual(route.handler.cacheName, 'images');
  });

  test(`${base}: build.json is precached next to the projection so both swap in one activate`, async () => {
    const deployment = deployments.get(base);
    const paths = deployment.precache.map(entry => new URL(entry.url, deployment.scope).pathname);
    for (const suffix of ['data/team-meals/week.json', 'icons/probe.svg']) assert.ok(paths.includes(`${base}${suffix}`), suffix);
    // issue #110/#114: the manifest and the projection must come from the same precache generation.
    // Split across two cache paths, an installed client holds a new manifest plus an old projection
    // and validateProjection hard-fails with revision_mismatch; the waiting SW has no upper time bound.
    const manifestEntry = deployment.precache.find(entry => new URL(entry.url, deployment.scope).pathname === `${base}data/build.json`);
    assert.ok(manifestEntry, 'build.json must be precached');
    assert.match(manifestEntry.revision ?? '', /^[0-9a-f]{8,}$/, 'the precached manifest must be revisioned per build');
    assert.equal(paths.some(value => value.startsWith(`${base}data/assets/`)), false);
    const image = deployment.runtime.find(route => route.handler.cacheName === 'images');
    assert.ok(image.handler instanceof deployment.exports.CacheFirst);
    assert.equal(image.capture({request: {destination: 'image'}}), true);
    assert.equal(matches(deployment, image, `${deployment.scope}data/assets/${sha}/data/ingredients/photo.png`), false);
    const plugin = image.handler.plugins.find(plugin => typeof plugin.cacheWillUpdate === 'function');
    const zero = Response.error();
    assert.equal(await plugin.cacheWillUpdate({response: zero}), zero);
    for (const cacheName of ['google-fonts-css', 'google-fonts-files']) {
      assert.ok(deployment.runtime.find(route => route.handler.cacheName === cacheName).handler instanceof deployment.exports.StaleWhileRevalidate);
    }
  });

  test(`${base}: nothing routes build.json at runtime — probes stay NetworkOnly`, () => {
    const deployment = deployments.get(base);
    // issue #110 plan B: the manifest is served from precache, so there is no runtime cache for it.
    assert.equal(deployment.runtime.some(entry => entry.handler.cacheName === 'publication-manifest'), false,
      'a runtime manifest cache would desynchronise the manifest from the precached projection again');
    // issue #114: probe URLs are unique per call. They must not be cached anywhere — not in a runtime
    // cache (they evicted the offline fallback) and not in precache (they would pin a stale answer).
    // Workbox only ignores utm_/fbclid when matching precache entries, so any query-bearing request
    // falls through every route and goes to the network. Passing no options keeps that default.
    for (const options of deployment.precacheOptions) assert.equal(options?.ignoreURLParametersMatching, undefined,
      'precacheAndRoute must keep workbox default ignoreURLParametersMatching (utm_/fbclid only)');
    for (const href of [
      `${deployment.scope}data/build.json`,
      `${deployment.scope}data/build.json?__publication=probe-1758000000000-reader-1`,
      `${deployment.scope}data/build.json?__publication=${sha}`,
      `${deployment.scope}data/build.json?t=1758000000000`,
    ]) for (const route of deployment.runtime) {
      // Font routes are declared as RegExp (built inside the SW's vm realm, so `instanceof RegExp`
      // is false here); the rest are callbacks serialised into the SW.
      const claimed = typeof route.capture === 'function' ? matches(deployment, route, href) : route.capture.test(href);
      assert.equal(claimed, false, `${route.handler.cacheName} must not claim ${href}`);
    }
  });
}
