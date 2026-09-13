import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const web = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const require = createRequire(import.meta.url);
const esbuild = await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')));
const bundle = await esbuild.build({ stdin: { contents: `
  export { createDishForm } from './src/pages/admin/dish-new';
  export { createPlanForm } from './src/pages/admin/plan-form';
  export { createPurchaseForm } from './src/pages/purchase-form';
  export { inspectReloadSafety } from './src/view-models/reload-safety';
  export { getAuthSessionVersion, onAuthSessionChange } from './src/admin/token';
`, resolveDir: web }, bundle: true, write: false, format: 'esm', platform: 'browser', loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_WORKER_URL': '""' }, logLevel: 'silent' });
const dir = await mkdtemp(join(tmpdir(), 'team-pages-peek-'));
after(() => rm(dir, { recursive: true, force: true }));
await writeFile(join(dir, 'peek.mjs'), bundle.outputFiles[0].text);
const page = await import(pathToFileURL(join(dir, 'peek.mjs')));
page.getAuthSessionVersion();

for (const [kind, create] of [
  ['dish', api => page.createDishForm(api)],
  ['plan', api => page.createPlanForm(api)],
  ['shopping-list', api => page.createPurchaseForm(api, { at: '2026-09-11T00:00:00Z' })],
]) {
  test(`${kind} reload inspection uses pure peek and hides changed-scope identity`, () => {
    let key = 0, calls = 0, peeks = 0, events = 0;
    const api = { mode: 'mock', sessionKey: () => { calls++; return key; }, peekSessionKey: () => { peeks++; return key; } };
    const form = create(api), off = page.onAuthSessionChange(() => events++);
    const id = `${kind}-private-identity`;
    form.session.open({ kind, id }, { schemaVersion: '3' }, { content: { schemaVersion: '3' }, commit: 'a'.repeat(40), blobSha: 'fixture-blob' });
    try {
      const before = calls;
      const initial = page.inspectReloadSafety();
      assert.ok(initial.records.some(row => row.id === id && row.phase === 'clean'), 'verified C1 document must be visible in the real registry');
      assert.equal(calls, before);
      key++;
      const changed = page.inspectReloadSafety(), again = page.inspectReloadSafety();
      assert.equal(changed.reason, 'unknown');
      assert.equal(changed.stamp, again.stamp);
      assert.equal(JSON.stringify(changed).includes(id), false, 'old document ID must not leak through failed identity verification');
      assert.equal(calls, before, 'inspection must not observe auth through sessionKey');
      assert.equal(events, 0);
      assert.equal(peeks, 3);
      key--;
      assert.equal(form.session.getState().identity.id, id, 'inspection must not retire the editor');
    } finally { off(); form.session.dispose(); }
  });

  test(`${kind} without pure peek stays unknown without polling sessionKey`, () => {
    let calls = 0;
    const form = create({ mode: 'mock', sessionKey: () => { calls++; return 0; } });
    form.session.open({ kind, id: 'private-without-peek' }, { schemaVersion: '3' }, null);
    try {
      const before = calls, snapshot = page.inspectReloadSafety();
      assert.equal(snapshot.reason, 'unknown');
      assert.equal(JSON.stringify(snapshot).includes('private-without-peek'), false);
      assert.equal(calls, before);
    } finally { form.session.dispose(); }
  });
}
