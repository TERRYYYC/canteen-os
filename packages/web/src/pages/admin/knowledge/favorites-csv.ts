export type FavoriteCsvRow = Record<'index' | 'folder' | 'kind' | 'content_id' | 'url' | 'author' | 'card_alt' | 'display_text', string>;
const columns = ['index','folder','kind','content_id','url','author','card_alt','display_text'] as const;

/** RFC 4180 style rows: quoted fields may contain commas, CRLF and escaped quotes. */
export function parseFavoritesCsv(input: string): FavoriteCsvRow[] {
  if (input.length > 4 * 1024 * 1024) throw new Error('CSV 文件过大。');
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: string[][] = [];
  let field = '', row: string[] = [], quoted = false, afterQuote = false;
  const endField = () => { row.push(field); field = ''; afterQuote = false; };
  const endRow = () => { endField(); if (row.length !== 1 || row[0] !== '') records.push(row); row = []; };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; afterQuote = true; }
      else field += c;
      continue;
    }
    if (c === ',') { endField(); continue; }
    if (c === '\r' || c === '\n') { endRow(); if (c === '\r' && source[i + 1] === '\n') i++; continue; }
    if (c === '"' && !afterQuote && field === '') { quoted = true; continue; }
    if (afterQuote || c === '"') throw new Error('CSV 引号格式不正确。');
    field += c;
  }
  if (quoted) throw new Error('CSV 引号未闭合。');
  if (field || row.length || afterQuote) endRow();
  if (!records.length || records[0]?.length !== columns.length || columns.some((key,i) => records[0]?.[i] !== key)) throw new Error('CSV 列名不符合收藏导入格式。');
  if (records.length - 1 > 1000) throw new Error('CSV 每批最多 1000 条。');
  return records.slice(1).map((values, index) => {
    if (values.length !== columns.length) throw new Error(`CSV 第 ${index + 2} 行列数不正确。`);
    return Object.fromEntries(columns.map((key,i) => [key, values[i]!])) as FavoriteCsvRow;
  });
}
