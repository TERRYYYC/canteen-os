import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// CI runs Node 20, which cannot import TypeScript source directly. Use the same
// Vite/esbuild test boundary as the other web source tests.
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite/package.json'));
const esbuild = await import(pathToFileURL(viteRequire.resolve('esbuild')).href);
const bundle = await esbuild.build({
  entryPoints: [fileURLToPath(new URL('../src/pages/admin/knowledge/favorites-csv.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser', logLevel: 'silent',
});
const dir = await mkdtemp(join(tmpdir(), 'canteenos-favorites-csv-'));
test.after(() => rm(dir, { recursive: true, force: true }));
const entry = join(dir, 'favorites-csv.mjs');
await writeFile(entry, bundle.outputFiles[0].text);
const { parseFavoritesCsv } = await import(pathToFileURL(entry).href);

test('favorite CSV keeps quoted multiline card text and never treats it as verified post text', () => {
  const csv = '\ufeffindex,folder,kind,content_id,url,author,card_alt,display_text\r\n'
    + '"44","吃的","note","7676372301671218289","https://www.douyin.com/note/7676372301671218289","可可酱","第一行\r\n3勺酱油，""适量""盐","卡片显示"\r\n';
  const rows = parseFavoritesCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].card_alt, '第一行\r\n3勺酱油，"适量"盐');
  assert.equal(rows[0].display_text, '卡片显示');
  assert.equal(rows[0].kind, 'note');
  assert.equal(Object.hasOwn(rows[0], 'postText'), false);
  assert.throws(() => parseFavoritesCsv('index,folder\n1,吃的'), /CSV/);
});
