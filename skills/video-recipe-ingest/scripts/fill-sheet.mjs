#!/usr/bin/env node
/** Fill sheets (#171, ADR-0012): one printable page per dish, for the chef to write canteen amounts outside the app. Read only.
 * CLI: node fill-sheet.mjs --results <batch RESULTS.md> --ids <file of work ids> --out <sheet.html>
 *        [--reference <ranges.json>] [--groups <groups.json>] [--techniques <techniques.json>]
 * Finds each dish's candidate.json the way docs/design/ingredient-catalog/catalog-stats.mjs does. The original wording is
 * printed as reference only and never turned into numbers; every canteen value is a blank for the chef. The optional
 * --reference column (similar dishes' usual range) is printed only when given, with its stated source, and goes into no data.
 * The sheet carries dish titles and the original wording, so keep generated sheets out of the repository.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseName } from '../../../docs/design/ingredient-catalog/catalog-stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const ROW = /^\| *\d+ *\/ *\d+ *\|/;
const SOURCE = /\[来源\]\(([^)]+)\)/;
const NOTE = /[（(]([^）)]*)[）)]/g;
// Same test as catalog-stats.mjs uses for its † mark: a parse note saying the name itself is in doubt.
const DOUBT = /待核|疑|视觉|画面|未说明|未述|未命名|未公开/;
// A note that makes an otherwise plain amount uncertain.
const HEDGE = /待|疑|约|大概|左右|估|或|不确定|两值/;
const NUM = String.raw`(?:\d+(?:\.\d+)?|[一二两三四五六七八九十百]+)`;
// The units knowledge-materialization.ts already treats as exact, plus 两 (50 g).
const UNIT = String.raw`(?:克|g|千克|公斤|kg|斤|两|毫升|ml|升|l|个|只|片)`;
const PLAIN = new RegExp(String.raw`^${NUM}\s*${UNIT}$`, 'i');
const JIN = new RegExp(String.raw`^${NUM}斤(?:${NUM}两|半)$`);

export const GAPS = {
  0: { mark: '', text: '原方有结构化的数', action: '只作参考' },
  1: { mark: '①', text: '视频确实没说', action: '留给师傅' },
  2: { mark: '②', text: '说了，没提取出来', action: '归修解析（#159）' },
  3: { mark: '③', text: '有数，没写成结构化', action: '归修解析（#159）' },
  4: { mark: '④', text: '还没核', action: '留给师傅' },
};
const SECTIONS = [
  ['main', '主料'],
  ['seasoning', '调料'],
  ['unsure', '还没认清的'],
  ['other', '水和菜里自制的'],
];
const TIMING = ['前一天', '当天早上', '开餐前'];

/** The listed dishes' candidates from a batch RESULTS.md, in the order of `ids`. */
export function readCandidates(resultsPath, ids) {
  const lines = readFileSync(resultsPath, 'utf8').split('\n');
  const header = lines.find(line => line.startsWith('|') && line.includes('分类') && line.includes('JSON'));
  if (!header) throw new Error('RESULTS.md: result table header not found');
  const column = header.split('|').map(cell => cell.trim()).indexOf('分类');
  const found = new Map();
  for (const line of lines.filter(line => ROW.test(line))) {
    const link = SOURCE.exec(line)?.[1];
    if (!link) continue;
    let dir = path.dirname(path.resolve(path.dirname(resultsPath), link));
    const id = path.basename(dir);
    if (!ids.includes(id) || found.has(id)) continue;
    if (line.split('|').map(cell => cell.trim())[column] !== '菜谱候选') throw new Error(`作品 ${id} 不是菜谱候选`);
    // Links may be absolute on the machine that wrote them; fall back to <batch>/<work id> next to this batch.
    if (!existsSync(path.join(dir, 'candidate.json'))) dir = path.resolve(path.dirname(resultsPath), '..', path.basename(path.dirname(dir)), id);
    const candidate = JSON.parse(readFileSync(path.join(dir, 'candidate.json'), 'utf8'));
    if (!Array.isArray(candidate.ingredients) || !Array.isArray(candidate.steps)) throw new Error(`作品 ${id}：candidate.json 缺 ingredients 或 steps`);
    found.set(id, candidate);
  }
  const missing = ids.filter(id => !found.has(id));
  if (missing.length) throw new Error(`RESULTS.md 里找不到这些作品：${missing.join(' ')}`);
  return ids.map(id => ({ id, candidate: found.get(id) }));
}

/** True only for one plain amount such as 500克, 2斤, 一斤六两, 3个. Ranges, hedges and spoons are not plain. */
export function isPlainAmount(raw) {
  const notes = [...raw.matchAll(NOTE)].map(match => match[1]);
  if (notes.some(note => HEDGE.test(note))) return false;
  const text = raw.replace(NOTE, '').trim();
  return PLAIN.test(text) || JIN.test(text);
}

/** Where the original amount falls short (ADR-0012, #171): 1–4, or 0 when the candidate already has a structured value. */
export function classifyGap(row) {
  if (row.normalizedQuantity != null) return 0;
  const raw = typeof row.rawQuantity === 'string' ? row.rawQuantity.trim() : '';
  if (row.quantityState === 'not_stated') return raw ? 4 : 1;
  if (row.quantityState === 'stated') return !raw ? 2 : isPlainAmount(raw) ? 3 : 4;
  // not_checked, stated_imprecise (never upgraded, candidate-contract.md) and anything else: cannot tell.
  return 4;
}

/** Name-only suggestion from groups.json: exact match on the name without parse notes. Never binds anything. */
export function suggest(name, owners) {
  const base = baseName(name);
  const doubt = name !== base && DOUBT.test(name);
  const list = owners.get(base) ?? [];
  if (!list.length) return { base, doubt, kind: 'none', names: [], role: null, section: 'unsure' };
  const other = list.find(entry => entry.kind !== 'standard');
  if (other) {
    const section = other.kind === 'identify' ? 'unsure' : 'other';
    return { base, doubt, kind: other.kind, names: [other.name], note: other.note, role: null, section };
  }
  const roles = new Set(list.map(entry => entry.role));
  const role = roles.size === 1 ? [...roles][0] : null;
  return { base, doubt, kind: 'standard', names: list.map(entry => entry.name), role, section: role ?? 'unsure' };
}

export function ownersOf(groups) {
  const owners = new Map();
  for (const entry of groups.entries) for (const member of entry.members) owners.set(member, [...(owners.get(member) ?? []), entry]);
  return owners;
}

/** Everything a page shows, taken from the candidate as is. */
export function buildSheets(dishes, groups) {
  const owners = ownersOf(groups);
  return dishes.map(({ id, candidate }) => {
    const rows = candidate.ingredients.map((row, index) => ({
      no: index + 1,
      name: row.name,
      raw: typeof row.rawQuantity === 'string' && row.rawQuantity.trim() ? row.rawQuantity.trim() : null,
      normalized: row.normalizedQuantity ?? null,
      prep: row.prep || null,
      uncertainty: row.uncertainty || null,
      substitution: row.substitution ?? null,
      gap: classifyGap(row),
      suggestion: suggest(row.name, owners),
    }));
    const gaps = [0, 1, 2, 3, 4].map(kind => rows.filter(row => row.gap === kind).length);
    return {
      id,
      title: candidate.title || '（没有菜名）',
      yieldRaw: candidate.yield?.raw ?? null,
      rows,
      gaps,
      steps: candidate.steps.filter(step => step.unknowns?.length).map(step => ({ order: step.order, action: step.action, unknowns: step.unknowns })),
      unresolved: candidate.unresolved ?? [],
    };
  });
}

/** Optional reference ranges: {source, ranges: {standard name: {min, max, unit}}}. Printed only, never written anywhere. */
export function readReference(file) {
  const reference = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof reference.source !== 'string' || !reference.source.trim()) throw new Error('参考范围文件要写明 source：这些数是从哪来的');
  for (const [name, range] of Object.entries(reference.ranges ?? {})) {
    const ok = range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min <= range.max && ['g', 'ml', '个'].includes(range.unit);
    if (!ok) throw new Error(`参考范围 ${name}：要有 min ≤ max 和单位 g、ml 或 个`);
  }
  return { source: reference.source.trim(), ranges: reference.ranges ?? {} };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const box = label => `<span class="opt"><i class="box"></i>${esc(label)}</span>`;
const blank = (cls = '') => `<span class="blank ${cls}"></span>`;
const source = () => `<div class="src">出处 ${box('称')}${box('定')}${box('规')}${blank('rule')}</div>`;

function originalCell(row) {
  if (row.raw) return `<span class="tag">原方</span>${esc(row.raw)}`;
  if (row.gap === 0) {
    const value = typeof row.normalized === 'object' && row.normalized?.value != null ? `${row.normalized.value} ${row.normalized.unit ?? ''}` : '有结构化的数';
    return `<span class="tag">原方</span>${esc(value)}`;
  }
  return { 1: '没说', 2: '没录下来' }[row.gap] ?? '没录';
}

function notesCell(row) {
  const notes = [];
  if (row.prep) notes.push(`原方做法：${esc(row.prep)}`);
  if (row.substitution?.name) notes.push(`原方可替换：${esc(row.substitution.name)}${row.substitution.rawQuantity ? ` ${esc(row.substitution.rawQuantity)}` : ''}`);
  if (row.uncertainty) notes.push(`没说清：${esc(row.uncertainty)}`);
  return notes.length ? `<div class="notes">${notes.join('<br>')}</div>` : '';
}

function suggestionCell(s) {
  const doubt = s.doubt ? '<span class="flag">名称待核</span>' : '';
  if (s.kind === 'identify') return `<b>先认是什么</b>：${esc(s.names[0])}${doubt}${s.note ? `<div class="notes">${esc(s.note)}</div>` : ''}<div>认清后写：${blank('wide')}</div>`;
  if (s.kind === 'water') return `${esc(s.names[0])}（不是采购项）${doubt}<div>${box('用这个')}</div>`;
  if (s.kind === 'homemade') return `菜里自制，不绑${doubt}<div class="notes">原料见别的行。其实是买现成的，写：</div>${blank('wide')}`;
  if (s.kind === 'none') return `没有建议${doubt}<div>该用哪种：${blank('wide')}</div>`;
  const split = s.names.length > 1 ? '<div class="notes">一行写了两种料，先拆成两行</div>' : '';
  return `${s.names.map(esc).join(' + ')}${doubt}${split}<div>${box('用这个')} 改成：${blank()}</div>`;
}

function referenceCell(row, reference) {
  if (row.suggestion.kind !== 'standard' && row.suggestion.kind !== 'water') return '—';
  const found = row.suggestion.names.map(name => reference.ranges[name] && `${esc(name)} ${reference.ranges[name].min}–${reference.ranges[name].max} ${esc(reference.ranges[name].unit)}`).filter(Boolean);
  return found.length ? found.join('<br>') : '—';
}

function prepRow(row, techniques, columns) {
  const label = row.suggestion.section === 'main' ? '备料' : '备料（是主料才填）';
  return `<tr class="prep"><td></td><td colspan="${columns - 1}"><b>${label}</b>　切法 ${techniques.map(box).join('')}${box('不用切')}｜ 大小 ${blank()}｜ 时机 ${TIMING.map(box).join('')}｜ 提前多久 ${blank('short')}${box('分钟')}${box('小时')}${box('天')}</td></tr>`;
}

function itemRows(row, techniques, reference, columns) {
  const gap = GAPS[row.gap];
  const plain = row.suggestion.section === 'other';
  const cells = [
    `<td class="no">${row.no}</td>`,
    `<td><b>${esc(row.name)}</b>${notesCell(row)}</td>`,
    `<td>${originalCell(row)}</td>`,
    `<td class="gap g${row.gap}">${gap.mark} ${esc(gap.text)}<div class="act">${esc(gap.action)}</div></td>`,
    `<td>${suggestionCell(row.suggestion)}</td>`,
    ...(reference ? [`<td class="ref">${referenceCell(row, reference)}</td>`] : []),
    `<td class="fill">${blank()}${box('g')}${box('ml')}${box('个')}${source()}</td>`,
    `<td class="fill">${blank()}</td>`,
    plain ? '<td class="fill na">不用填</td><td class="fill na">不用填</td>' : `<td class="fill">${blank()}${source()}</td><td class="fill">${blank()}<span class="notes">要换算时才填</span>${source()}</td>`,
  ];
  const prep = row.suggestion.section === 'main' || row.suggestion.section === 'unsure' ? prepRow(row, techniques, columns) : '';
  return `<tbody class="item"><tr>${cells.join('')}</tr>${prep}</tbody>`;
}

function seasoningPrep(techniques, columns) {
  const line = `<tr class="prep"><td></td><td colspan="${columns - 1}">第 ${blank('short')} 行　切法 ${blank()}（从 ${techniques.map(esc).join('、')} 里选）｜ 大小 ${blank()}｜ 时机 ${TIMING.map(box).join('')}｜ 提前多久 ${blank('short')}${box('分钟')}${box('小时')}${box('天')}</td></tr>`;
  return `<tbody class="item"><tr class="sub"><td></td><td colspan="${columns - 1}"><b>调料要切、要提前泡的，写在这里</b></td></tr>${line}${line}</tbody>`;
}

function gapSummary(gaps) {
  return [1, 2, 3, 4].map(kind => `${GAPS[kind].mark} ${gaps[kind]}`).join(' · ') + (gaps[0] ? ` · 原方有结构化的数 ${gaps[0]}` : '');
}

function page(sheet, techniques, reference) {
  const columns = reference ? 10 : 9;
  const widths = reference ? [7, 44, 24, 24, 30, 24, 40, 16, 32, 34] : [7, 54, 24, 24, 34, 40, 16, 36, 40];
  const head = `<colgroup>${widths.map(width => `<col style="width:${width}mm">`).join('')}</colgroup><thead><tr><th class="no">#</th><th>食材（原名）</th><th>原方用量（只作参考）</th><th>缺口</th><th>对应的标准食材（建议）</th>${reference ? '<th>同类菜常见范围（仅供参考）</th>' : ''}<th>每份净料</th><th>或毛料</th><th>净料率</th><th>每个多少克</th></tr></thead>`;
  const body = SECTIONS.map(([key, title]) => {
    const rows = sheet.rows.filter(row => row.suggestion.section === key);
    if (!rows.length) return '';
    return `<tbody class="section"><tr><td colspan="${columns}">${esc(title)} · ${rows.length} 样</td></tr></tbody>${rows.map(row => itemRows(row, techniques, reference, columns)).join('')}${key === 'seasoning' ? seasoningPrep(techniques, columns) : ''}`;
  }).join('');
  const unclear = [
    `<li><b>份数</b>：${sheet.yieldRaw ? `原方「${esc(sheet.yieldRaw)}」，只作参考，不从这里推份数。` : '视频没说。'}本表一律按每份记。</li>`,
    ...sheet.steps.map(step => `<li><b>第 ${esc(step.order)} 步</b><span class="step">${esc(step.action)}</span><br>没说清：${step.unknowns.map(esc).join(' ')}</li>`),
    ...sheet.unresolved.map(text => `<li><b>整道菜</b>：${esc(text)}</li>`),
  ].join('');
  return `<section class="page">
<header><div><h2>${esc(sheet.title)}</h2><div class="meta">作品编号 ${esc(sheet.id)} · ${sheet.rows.length} 样 · 缺口 ${gapSummary(sheet.gaps)}</div></div><div class="who">师傅 ${blank('wide')}　日期 ${blank()}</div></header>
<p class="rule"><b>份数：按每份记，写 1。每一格都填一份的量。</b>「原方」是视频里的原话，只作参考，不进计算。不知道的空着，不填 0 或 1，也不写「适量」。</p>
<p class="legend">出处：称＝按食堂做法实际称过 · 定＝师傅直接给的数 · 规＝按师傅定的规则，写规则号　｜　单位跟标准食材走：液体 ml，其余 g，按个买的写个　｜　缺口：① 视频没说 ② 没提取出来 ③ 有数没写成结构化数值 ④ 还没核；②③ 归修解析（#159），不用师傅补原方</p>
<table>${head}${body}</table>
<h3>这道菜哪里没说清</h3>
<p class="legend">只列出来给师傅看。这一轮只补上面表里的空格；火候、做多久、做到什么样以后在菜品库补（ADR-0012 第 8 条）。要提前腌、泡、卤、醒的，把时长写在那样材料的「提前多久」一格。</p>
<ul class="unclear">${unclear}</ul>
${reference ? `<p class="refnote">「同类菜常见范围」只供参考，不进任何数据。数是从哪来的：${esc(reference.source)}</p>` : ''}
</section>`;
}

function cover(sheets, reference) {
  const rows = sheets.map(sheet => {
    const count = key => sheet.rows.filter(row => row.suggestion.section === key).length;
    return `<tr><td>${esc(sheet.title)}</td><td>${esc(sheet.id)}</td><td>${sheet.rows.length}</td><td>${count('main')}</td><td>${count('seasoning')}</td><td>${count('unsure') + count('other')}</td>${[1, 2, 3, 4].map(kind => `<td>${sheet.gaps[kind]}</td>`).join('')}</tr>`;
  }).join('');
  return `<section class="page cover">
<h1>补料表 · ${sheets.length} 道菜</h1>
<p class="rule">给师傅在纸上补食堂用量。每道菜一页。补好的值之后录进知识库（#172）。</p>
<ol class="howto">
<li>份数一律按每份记，写 1。表里每一格都填一份的量。</li>
<li>「原方」是视频里的原话，只作参考，不进计算。视频是家庭量，不要照抄。</li>
<li>每份净料：去皮、去骨、择洗之后下锅的量。单位跟对应的标准食材走：液体 ml，其余 g，按个买的写个。</li>
<li>只知道毛料的，写在「或毛料」一格，再写净料率。不知道的空着，不填 0 或 1。</li>
<li>每个数都勾出处：称＝按食堂做法实际称过；定＝师傅直接给的数，没称过；规＝按师傅定的规则，写上规则号。</li>
<li>「点、少许」这类原话不用换成数。没有规则、也没称过的，空着。</li>
<li>净料率＝净重 ÷ 毛重；没有损耗的（盐、油、糖这类）也要写 1，不要空着。每个多少克：只在个数和重量要换算时填。</li>
<li>主料要填切法、大小、准备时机；要提前腌、泡、卤、醒的，写要多久。切法从表里勾。调料要切、要提前泡的，写在调料下面那几行。</li>
<li>对应的标准食材（建议）：只按名字给的建议，没有替师傅绑。对就勾「用这个」，不对就写该用哪种。「先认是什么」的，先认清是哪种再写。标「名称待核」的，先看原话。</li>
<li>缺口说的是原方的量缺在哪：
<ul>
<li>① 视频确实没说（已核原片）。留给师傅。</li>
<li>② 原片说了，但没提取出来。归修解析（#159）。</li>
<li>③ 原话里有清楚的数，但没写成结构化数值。归修解析（#159）。</li>
<li>④ 还没核。留给师傅。</li>
</ul>
②③ 不用师傅补原方。不管哪种缺口，每份净料用量都请师傅按食堂做法填。</li>
<li>「这道菜哪里没说清」只列出来给师傅看。这一轮不补火候、做多久、做到什么样。</li>
</ol>
<table class="summary"><thead><tr><th>菜</th><th>作品编号</th><th>样数</th><th>主料</th><th>调料</th><th>其他</th><th>①</th><th>②</th><th>③</th><th>④</th></tr></thead><tbody>${rows}</tbody></table>
${reference ? `<p class="refnote">这一版印了「同类菜常见范围（仅供参考）」一栏。这一栏不进任何数据。数是从哪来的：${esc(reference.source)}</p>` : ''}
</section>`;
}

const STYLE = `
@page { size: A4 landscape; margin: 9mm; }
* { box-sizing: border-box; }
html { background: #ddd; }
body { margin: 0; color: #111; font: 9pt/1.35 "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif; }
.page { background: #fff; width: 297mm; min-height: 210mm; margin: 8mm auto; padding: 9mm; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
h1 { font-size: 18pt; margin: 0 0 3mm; } h2 { font-size: 14pt; margin: 0; } h3 { font-size: 11pt; margin: 4mm 0 1mm; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1.2pt solid #111; padding-bottom: 1.5mm; }
.meta, .notes, .act, .legend, .step { color: #444; } .meta { font-size: 8.5pt; }
.notes { font-size: 7.5pt; margin-top: .8mm; } .act { font-size: 7.5pt; }
.who { font-size: 10pt; } p { margin: 1.5mm 0; } .legend { font-size: 8pt; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 2mm; }
th, td { border: .5pt solid #555; padding: 1.2mm 1.5mm; vertical-align: top; text-align: left; overflow-wrap: anywhere; }
th { background: #eee; font-weight: 600; font-size: 8pt; }
thead { display: table-header-group; } tbody.item { break-inside: avoid; page-break-inside: avoid; }
tbody.section td { background: #f3f3f3; font-weight: 700; border-top: 1.2pt solid #111; }
td.no { color: #444; text-align: right; padding-left: .5mm; }
tr.prep td { border-top: none; font-size: 7.5pt; padding-top: .3mm; padding-bottom: .8mm; } tr.prep td:first-child, tr.sub td:first-child { border-right: none; }
.tag { display: inline-block; font-size: 6.5pt; border: .5pt solid #777; border-radius: 1mm; padding: 0 .8mm; margin-right: 1mm; color: #555; }
.flag { display: inline-block; font-size: 7pt; border: .8pt solid #111; padding: 0 .8mm; margin-left: 1mm; font-weight: 700; }
.gap.g2, .gap.g3 { background: repeating-linear-gradient(135deg, #fff 0 2mm, #f0f0f0 2mm 4mm); }
.box { display: inline-block; width: 2.6mm; height: 2.6mm; border: .6pt solid #111; margin: 0 .5mm 0 0; vertical-align: -.3mm; }
.opt { white-space: nowrap; margin-right: 1.1mm; }
.blank { display: inline-block; min-width: 12mm; height: 4.5mm; border-bottom: .6pt solid #111; vertical-align: bottom; margin-right: 1mm; }
.blank.wide { min-width: 24mm; } .blank.short { min-width: 8mm; } .blank.rule { min-width: 8mm; }
.src { font-size: 7.5pt; margin-top: 1mm; white-space: nowrap; }
td.na { color: #888; font-size: 7.5pt; }
td.ref { font-size: 8pt; color: #333; }
ul.unclear { margin: 1mm 0 0; padding-left: 5mm; } ul.unclear li { margin-bottom: 1mm; break-inside: avoid; }
.step { margin-left: 2mm; font-size: 8pt; }
.refnote { border: .8pt dashed #111; padding: 1.5mm; font-size: 8.5pt; }
.howto li { margin-bottom: 1.2mm; font-size: 10pt; } .cover .summary { width: auto; } .cover .summary td, .cover .summary th { padding: 1mm 3mm; }
@media print {
  html { background: none; }
  .page { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
}`;

/** The whole printable file: a cover page, then one page per dish. */
export function renderHtml(sheets, { techniques, reference = null }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>补料表</title>
<style>${STYLE}
</style>
</head>
<body>
${cover(sheets, reference)}
${sheets.map(sheet => page(sheet, techniques, reference)).join('\n')}
</body>
</html>
`;
}

/** Cut names from data/techniques.json: the closed set prep.techniqueRef chooses from for 切法. */
export function cutNames(techniques) {
  return techniques.filter(technique => technique.kind === 'cut').map(technique => technique.name.zh);
}

function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (['--results', '--ids', '--out', '--reference', '--groups', '--techniques'].includes(argv[i])) args[argv[i].slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!args.results || !args.ids || !args.out) throw new Error('usage: node fill-sheet.mjs --results <batch RESULTS.md> --ids <file of work ids> --out <sheet.html> [--reference <ranges.json>]');
  const ids = readFileSync(args.ids, 'utf8').split(/\s+/).filter(Boolean);
  const groups = JSON.parse(readFileSync(args.groups ?? path.join(REPO, 'docs/design/ingredient-catalog/groups.json'), 'utf8'));
  const techniques = cutNames(JSON.parse(readFileSync(args.techniques ?? path.join(REPO, 'data/techniques.json'), 'utf8')));
  const reference = args.reference ? readReference(args.reference) : null;
  const sheets = buildSheets(readCandidates(args.results, ids), groups);
  writeFileSync(args.out, renderHtml(sheets, { techniques, reference }));
  for (const sheet of sheets) console.error(`${sheet.id}：${sheet.rows.length} 样，缺口 ${gapSummary(sheet.gaps)}，没说清的步骤 ${sheet.steps.length}，整道菜 ${sheet.unresolved.length}`);
  const total = kind => sheets.reduce((sum, sheet) => sum + sheet.gaps[kind], 0);
  console.error(`共 ${sheets.length} 道菜、${sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)} 样，缺口 ① ${total(1)} · ② ${total(2)} · ③ ${total(3)} · ④ ${total(4)}${reference ? '，印了同类菜常见范围' : ''} → ${args.out}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
