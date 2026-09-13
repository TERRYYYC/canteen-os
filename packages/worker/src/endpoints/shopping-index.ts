import type {ShoppingList} from '@canteenos/core';
import type {Ctx} from '../context.js';
import {githubClient} from '../context.js';
import {fail, HttpError} from '../http.js';
import {ID_RE} from '../paths.js';
import {resolveRevision} from '../revision.js';
import {parseSource} from '../source.js';

// Each page examines candidates, not just valid results: at most 20 blobs / 5 MiB
// and 24 GitHub reads including HEAD, revision ancestry and the complete tree.
const PAGE_SIZE = 20;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_INDEX_FILES = 10_000;
const CURSOR = /^v1\.([0-9a-f]{40})\.([1-9][0-9]*)$/;
const badCursor = () => fail('invalid_selection', {path:'/cursor', message:'清单分页位置无效，请重新打开已保存的清单'});

/** Discovery only. Opening a summary still requires the fully validated source reader. */
export async function handleShoppingIndex(ctx: Ctx): Promise<unknown> {
  const query = ctx.url.searchParams;
  query.forEach((_, key) => { if (key !== 'cursor') throw badCursor(); });
  if (query.getAll('cursor').length > 1) throw badCursor();
  const raw = query.get('cursor');
  const cursor = raw === null ? null : CURSOR.exec(raw);
  const offset = cursor ? Number(cursor[2]) : 0;
  if (raw !== null && (!cursor || !Number.isSafeInteger(offset) || offset % PAGE_SIZE !== 0)) throw badCursor();

  const gh = githubClient(ctx);
  const head = await gh.getHeadSha();
  if (typeof head !== 'string' || !/^[0-9a-f]{40}$/.test(head)) throw fail('upstream_error');
  const commit = await resolveRevision(gh, head, cursor?.[1] ?? null);
  const tree = await gh.getTree(commit, true);
  if (tree.some(entry => !entry || typeof entry.path !== 'string' || typeof entry.type !== 'string')) throw fail('upstream_error');
  const entries = tree.filter(entry => /^data\/shopping-lists\/[^/]+\.json$/.test(entry.path));
  if (entries.length > MAX_INDEX_FILES) throw fail('upstream_error', {message:'已保存清单超过索引读取上限'});
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (cursor && offset >= entries.length) throw badCursor();
  const candidates = entries.slice(offset, offset + PAGE_SIZE);
  const items: {id: string; selection: ShoppingList['basis']['selection']; itemCount: number; decisionCounts: Record<'check'|'buy'|'available'|'bought', number>}[] = [];
  let skipped = 0;
  for (const entry of candidates) {
    const id = entry.path.slice('data/shopping-lists/'.length, -'.json'.length);
    // Unknown size is unavailable metadata, not permission to fetch an unbounded blob.
    if (!ID_RE.test(id) || entry.type !== 'blob' || entry.mode !== '100644' || typeof entry.sha !== 'string' || !/^[0-9a-f]{40}$/.test(entry.sha)
      || typeof entry.size !== 'number' || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_FILE_BYTES) {
      skipped++; continue;
    }
    // Transport errors fail the whole page. Only record-local invalid_source is skippable.
    const bytes = await gh.getBlobBytes(entry.sha);
    if (bytes.length > MAX_FILE_BYTES || bytes.length !== entry.size) { skipped++; continue; }
    let list: ShoppingList;
    try { list = parseSource(new TextDecoder().decode(bytes), 'shopping-list', entry.path) as ShoppingList; }
    catch (error) {
      if (!(error instanceof HttpError) || error.errors[0]?.code !== 'invalid_source') throw error;
      skipped++; continue;
    }
    if (list.id !== id || new Set(list.items.map(item => item.ingredientRef)).size !== list.items.length) { skipped++; continue; }
    const decisionCounts = {check:0, buy:0, available:0, bought:0};
    for (const item of list.items) decisionCounts[item.decision === 'buy' && item.bought === true ? 'bought' : item.decision]++;
    items.push({id, selection:list.basis.selection, itemCount:list.items.length, decisionCounts});
  }
  const position = offset + candidates.length;
  return {ok:true, commit, items, nextCursor:position < entries.length ? `v1.${commit}.${position}` : null, skipped};
}
