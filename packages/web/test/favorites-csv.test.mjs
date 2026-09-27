import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFavoritesCsv } from '../src/pages/admin/knowledge/favorites-csv.ts';

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
