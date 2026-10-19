#!/usr/bin/env node
/** Candidate catalog of standard ingredients (#167): counts ingredient names in favorites-parse candidates, read only.
 * CLI: node catalog-stats.mjs --results <batch RESULTS.md> [--focus <file of work ids>] [--out <file>] [--check]
 * Reads the recipe-candidate rows of the RESULTS.md table and each row's candidate.json; writes only names and counts,
 * never titles, authors, links, quotes or local paths. Groupings come from groups.json next to this file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROW = /^\| *\d+ *\/ *\d+ *\|/;
const SOURCE = /\[来源\]\(([^)]+)\)/;
// Parse notes such as （煮料）（身份待核） describe use or doubt, not identity.
const NOTE = /[（(][^）)]*[）)]/g;
const DOUBT = /待核|疑|视觉|画面|未说明|未述|未命名|未公开/;
const KINDS = ['standard', 'water', 'homemade', 'identify'];
const ROLE = { main: '主料', seasoning: '调料' };

export const baseName = raw => raw.replace(NOTE, '').trim();

/** Recipe candidates listed in a batch RESULTS.md: [{id, names}] in table order. */
export function readDishes(resultsPath) {
  const lines = readFileSync(resultsPath, 'utf8').split('\n');
  const header = lines.find(line => line.startsWith('|') && line.includes('分类') && line.includes('JSON'));
  if (!header) throw new Error('RESULTS.md: result table header not found');
  const column = header.split('|').map(cell => cell.trim()).indexOf('分类');
  const dishes = [];
  for (const line of lines.filter(line => ROW.test(line))) {
    if (line.split('|').map(cell => cell.trim())[column] !== '菜谱候选') continue;
    const link = SOURCE.exec(line)?.[1];
    if (!link) throw new Error('RESULTS.md: a recipe row has no source link');
    let dir = path.dirname(path.resolve(path.dirname(resultsPath), link));
    // Links may be absolute on the machine that wrote them; fall back to <batch>/<work id> next to this batch.
    if (!existsSync(path.join(dir, 'candidate.json'))) dir = path.resolve(path.dirname(resultsPath), '..', path.basename(path.dirname(dir)), path.basename(dir));
    const candidate = JSON.parse(readFileSync(path.join(dir, 'candidate.json'), 'utf8'));
    dishes.push({ id: path.basename(dir), names: candidate.ingredients.map(row => row.name) });
  }
  return dishes;
}

/** Apply groups.json to the dishes. Every base name ends up in an entry or in `unmapped`. */
export function buildCatalog(dishes, groups, focus = null) {
  const entries = groups.entries.map(entry => {
    if (!KINDS.includes(entry.kind)) throw new Error(`groups.json: unknown kind ${entry.kind}`);
    if (entry.kind === 'standard' && !ROLE[entry.role]) throw new Error(`groups.json: ${entry.name} needs role main or seasoning`);
    return { ...entry, dishes: new Set(), focus: new Set(), rows: new Set(), memberDishes: new Map(), doubt: new Set() };
  });
  const owners = new Map();
  for (const entry of entries) for (const member of entry.members) owners.set(member, [...(owners.get(member) ?? []), entry]);
  for (const [member, list] of owners) {
    if (list.length > 1 && list.some(entry => entry.kind !== 'standard')) throw new Error(`groups.json: ${member} is both excluded and a standard`);
  }
  const raw = new Set(), base = new Map(), unmapped = new Map();
  let rows = 0;
  for (const dish of dishes) {
    for (const [index, name] of dish.names.entries()) {
      rows++; raw.add(name);
      const key = baseName(name);
      base.set(key, (base.get(key) ?? new Set()).add(dish.id));
      const list = owners.get(key);
      if (!list) { unmapped.set(key, (unmapped.get(key) ?? new Set()).add(dish.id)); continue; }
      for (const entry of list) {
        entry.rows.add(`${dish.id}#${index}`); entry.dishes.add(dish.id);
        if (focus?.has(dish.id)) entry.focus.add(dish.id);
        entry.memberDishes.set(key, (entry.memberDishes.get(key) ?? new Set()).add(dish.id));
        if (name !== key && DOUBT.test(name)) entry.doubt.add(key);
      }
    }
  }
  const stale = [...owners.keys()].filter(member => !base.has(member));
  return {
    dishes: dishes.length, rows, rawNames: raw.size, baseNames: base.size,
    shared: [...base.values()].filter(ids => ids.size >= 2).length,
    focusDishes: focus ? dishes.filter(dish => focus.has(dish.id)).length : null,
    entries, unmapped, stale, split: new Set([...owners].filter(([, list]) => list.length > 1).map(([member]) => member)),
  };
}

const order = (a, b) => b.dishes.size - a.dishes.size || b.rows.size - a.rows.size || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const cell = text => String(text ?? '').replaceAll('|', '\\|');
const covered = entries => new Set(entries.flatMap(entry => [...entry.rows])).size;

function memberList(entry, catalog) {
  return [...entry.memberDishes].sort(([a, x], [b, y]) => y.size - x.size || (a < b ? -1 : 1))
    .map(([member, ids]) => `${member}${entry.doubt.has(member) ? '†' : ''} ${ids.size}${catalog.split.has(member) ? '（拆）' : ''}`).join(' · ');
}

/** The committed table: names and counts only. */
export function renderMarkdown(catalog) {
  const used = catalog.entries.filter(entry => entry.rows.size);
  const of = kind => used.filter(entry => entry.kind === kind).sort(order);
  const standard = of('standard'), focus = catalog.focusDishes !== null, shared = standard.filter(e => e.dishes.size >= 2), first = standard.filter(e => e.focus.size);
  const names = kind => of(kind).reduce((sum, entry) => sum + entry.memberDishes.size, 0);
  const out = [
    '<!-- 由 catalog-stats.mjs 按 groups.json 生成，不要手改；改归组请改 groups.json 后重跑。 -->',
    '',
    '# 候选标准食材目录（统计表）',
    '',
    '> 附表，设计已签收（2026-10-19），见 [README](README.md)。只放食材名和出现次数。表里的归组、角色和说明仍是建议，按 README §9 C2 由 Terry 和师傅过一遍。',
    '',
    `- 数据：收藏解析的菜谱候选 ${catalog.dishes} 道，食材 ${catalog.rows} 行。名称原样 ${catalog.rawNames} 个；去掉括注（用途、待核说明）后 ${catalog.baseNames} 个，其中出现在 2 道以上的 ${catalog.shared} 个。`,
    `- 建议进目录：${standard.length} 种（主料 ${standard.filter(e => e.role === 'main').length}、调料 ${standard.filter(e => e.role === 'seasoning').length}），能绑上 ${covered(standard)} 行。其中出现在 2 道以上的 ${shared.length} 种，能绑上 ${covered(shared)} 行${focus ? `；首批 ${catalog.focusDishes} 道用到 ${first.length} 种（主料 ${first.filter(e => e.role === 'main').length}、调料 ${first.filter(e => e.role === 'seasoning').length}）` : ''}。`,
    `- 水不是采购项：${names('water')} 个名称、${covered(of('water'))} 行。不进目录的菜里自制品：${names('homemade')} 个名称、${covered(of('homemade'))} 行。先认是什么：${of('identify').length} 组、${names('identify')} 个名称、${covered(of('identify'))} 行。未归组：${catalog.unmapped.size} 个。`,
    `- 「道数」是用到这一组任一名称的菜有几道；「行数」是食材行数${focus ? '；「首批」是首批几道菜里有几道用到' : ''}。名称后的数字是这个名称出现在几道菜。† 表示至少有一行在括注里标了待核、疑似或种类没说；（拆）表示一行写了两种料，两边都计。`,
    '',
    '## 1. 建议进目录的标准食材',
    '',
    `| # | 建议标准食材 | 道数 | 行数 |${focus ? ' 首批 |' : ''} 建议角色 | 归入的名称 | 说明 |`,
    `|---:|---|---:|---:|${focus ? '---:|' : ''}---|---|---|`,
    ...standard.map((entry, index) => `| ${index + 1} | ${cell(entry.name)} | ${entry.dishes.size} | ${entry.rows.size} |${focus ? ` ${entry.focus.size || ''} |` : ''} ${ROLE[entry.role]} | ${cell(memberList(entry, catalog))} | ${cell(entry.note)} |`),
  ];
  for (const [kind, title] of [['water', '2. 水：不是采购项（怎么处理见 README §6.3）'], ['homemade', '3. 不进目录：菜里自制的'], ['identify', '4. 先认是什么（认清前不绑定）']]) {
    out.push('', `## ${title}`, '', '| 组 | 道数 | 行数 | 名称 | 说明 |', '|---|---:|---:|---|---|',
      ...of(kind).map(entry => `| ${cell(entry.name)} | ${entry.dishes.size} | ${entry.rows.size} | ${cell(memberList(entry, catalog))} | ${cell(entry.note)} |`));
  }
  out.push('', '## 5. 未归组', '', catalog.unmapped.size
    ? [...catalog.unmapped].sort(([, a], [, b]) => b.size - a.size).map(([name, ids]) => `- ${name} ${ids.size}`).join('\n')
    : '没有：每个名称都在上面某一组里。', '');
  return out.join('\n');
}

function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') args.check = true;
    else if (['--results', '--focus', '--out', '--groups'].includes(argv[i])) args[argv[i].slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!args.results) throw new Error('usage: node catalog-stats.mjs --results <batch RESULTS.md> [--focus <file>] [--out <file>] [--check]');
  const groups = JSON.parse(readFileSync(args.groups ?? path.join(HERE, 'groups.json'), 'utf8'));
  const focus = args.focus ? new Set(readFileSync(args.focus, 'utf8').split(/\s+/).filter(Boolean)) : null;
  const catalog = buildCatalog(readDishes(args.results), groups, focus);
  const text = renderMarkdown(catalog);
  const out = args.out ?? path.join(HERE, 'candidate-catalog.md');
  for (const member of catalog.stale) console.error(`groups.json: ${member} 不在数据里`);
  for (const [name] of catalog.unmapped) console.error(`未归组：${name}`);
  if (args.check) {
    const same = existsSync(out) && readFileSync(out, 'utf8') === text;
    console.error(same ? `${out}：与本次统计一致` : `${out}：与本次统计不一致`);
    return same ? 0 : 1;
  }
  writeFileSync(out, text);
  console.error(`${catalog.dishes} 道菜，${catalog.rows} 行，${catalog.baseNames} 个名称 → ${out}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
