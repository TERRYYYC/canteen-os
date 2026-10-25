#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { readFile, writeFile, realpath, lstat, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname, basename, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
// Matches the KB importer's recorded-timing tolerance. It is not a new decode.
const TIMING_TOLERANCE_MS = 1000;
const AV_KINDS = new Set(['spoken', 'subtitle', 'visual']);
const usage = 'node scripts/replay-video-recipe.mjs --artifact-dir <directory> --media <file> --output-dir <new external directory> [--synthetic-fixture]';

function check(condition, message) {
  if (!condition) throw new Error(message);
}
const whole = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.trim().length > 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const inside = (parent, path) => path === parent || (!relative(parent, path).startsWith(`..${sep}`) && relative(parent, path) !== '..' && !isAbsolute(relative(parent, path)));

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function hashFile(path) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest('hex'), bytes };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--synthetic-fixture') { check(!options.synthetic, 'Duplicate --synthetic-fixture'); options.synthetic = true; continue; }
    const key = { '--artifact-dir': 'artifactDir', '--media': 'media', '--output-dir': 'outputDir' }[argv[i]];
    check(key && argv[i + 1] && !argv[i + 1].startsWith('--'), `Unknown or incomplete option: ${argv[i]}`);
    check(!options[key], `Duplicate option: ${argv[i]}`);
    options[key] = argv[++i];
  }
  for (const key of ['artifactDir', 'media', 'outputDir']) check(options[key], `Missing option. Usage: ${usage}`);
  return options;
}

async function newOutputPath(requested, artifactDir) {
  const path = resolve(requested);
  try { await lstat(path); throw new Error('Output directory already exists; choose a new directory.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const parent = await realpath(dirname(path)).catch(() => { throw new Error('Output parent must already exist.'); });
  const canonical = resolve(parent, basename(path));
  check(!inside(artifactDir, canonical), 'Output must be outside the input artifact directory.');
  check(!inside(await realpath(REPOSITORY), canonical), 'Output must be outside the repository; private recipes must not enter Git.');
  return canonical;
}

function validateSource(source, candidate, synthetic) {
  check(source.classification === 'video', 'Source classification must be video.');
  check(source.synthetic === true ? synthetic : !synthetic, 'Synthetic fixture requires both source.synthetic=true and --synthetic-fixture.');
  check(['f2', 'browser_playback', 'user_file'].includes(source.accessMethod), 'Source acquisition method is missing or unsupported.');
  check(text(source.workId) && text(source.sourceUrl), 'Source workId and sourceUrl are required.');
  check(digest(source.sha256) && whole(source.byteCount) && source.byteCount > 0, 'Source SHA-256 and byte count are required.');
  check(whole(source.durationMs) && source.durationMs > 0 && whole(source.videoDurationMs) && source.videoDurationMs > 0 && whole(source.audioDurationMs), 'Source durations must be recorded in integer milliseconds.');
  check(source.streams?.video === true && source.streams.audio === (source.audioDurationMs > 0), 'Source stream fields are inconsistent.');
  check(source.videoDurationMs <= source.durationMs + TIMING_TOLERANCE_MS && source.audioDurationMs <= source.durationMs + TIMING_TOLERANCE_MS, 'Source stream durations exceed the recorded duration.');
  const coverage = source.analysisCoverage;
  check(coverage && whole(coverage.audioProcessedThroughMs) && (source.streams.audio ? Math.abs(coverage.audioProcessedThroughMs - source.audioDurationMs) <= TIMING_TOLERANCE_MS : coverage.audioProcessedThroughMs === 0), 'Recorded audio coverage is incomplete or inconsistent.');
  check(whole(coverage.frameCount) && coverage.frameCount > 0 && whole(coverage.lastFrameMs) && coverage.lastFrameMs <= source.videoDurationMs + TIMING_TOLERANCE_MS && source.videoDurationMs - coverage.lastFrameMs <= 2000 && whole(coverage.maxFrameGapMs) && coverage.maxFrameGapMs <= 2000, 'Recorded frame coverage is incomplete or inconsistent.');
  check(candidate.sourceSha256 === source.sha256, 'Candidate source SHA-256 does not match source.');
  check(candidate.status === 'needs_human_review' && candidate.classification === 'recipe', 'Only a needs_human_review recipe candidate can be replayed.');
  check(candidate.approvedForMenu === false && candidate.approvedForProcurement === false, 'Candidate approval flags must remain false; replay never records approval.');
  check(text(candidate.title), 'Candidate title is required.');
}

function validateCandidate(source, candidate, evidence) {
  check(Array.isArray(evidence) && evidence.length > 0, 'Evidence array is required.');
  const byId = new Map();
  for (const row of evidence) {
    check(text(row.id) && !byId.has(row.id), 'Evidence IDs must be unique and nonempty.');
    const streamDuration = row.kind === 'spoken' ? source.audioDurationMs : source.videoDurationMs;
    check(whole(row.startMs) && whole(row.endMs) && row.endMs >= row.startMs && row.endMs <= streamDuration + TIMING_TOLERANCE_MS && (row.kind !== 'spoken' || source.streams.audio), `Evidence ${row.id} time is outside its recorded stream.`);
    check(text(row.text) && text(row.extractor), `Evidence ${row.id} requires text and extractor.`);
    byId.set(row.id, row);
  }
  function references(ids, label) {
    check(Array.isArray(ids) && ids.length > 0, `${label} requires audiovisual evidence IDs.`);
    return ids.map(id => {
      check(byId.has(id), `${label}: evidence ${id} is missing.`);
      check(AV_KINDS.has(byId.get(id).kind), `${label}: evidence ${id} is not audiovisual.`);
      return byId.get(id);
    });
  }
  references(candidate.titleEvidenceIds, 'Title');
  check(candidate.yield && ['stated', 'stated_imprecise', 'not_stated'].includes(candidate.yield.state), 'Yield must record its known or unknown state.');
  check(Array.isArray(candidate.ingredients) && candidate.ingredients.length > 0, 'Ingredients array is required.');
  for (const ingredient of candidate.ingredients) {
    check(text(ingredient.name), 'Ingredient name is required.');
    check(['stated', 'stated_imprecise', 'not_stated'].includes(ingredient.quantityState), 'Ingredient quantity is incomplete or unsupported.');
    check(ingredient.rawQuantity === null || text(ingredient.rawQuantity), 'Ingredient raw quantity must be original text or null.');
    check(ingredient.quantityState !== 'stated_imprecise' || ingredient.normalizedQuantity === null, 'Imprecise quantities cannot become arithmetic values.');
    references(ingredient.evidenceIds, `Ingredient ${ingredient.name}`);
    if (ingredient.substitution) {
      check(text(ingredient.substitution.name), 'Substitution name is required.');
      references(ingredient.substitution.evidenceIds, `Substitution for ${ingredient.name}`);
    }
  }
  check(Array.isArray(candidate.steps) && candidate.steps.length > 0, 'Steps array is required.');
  for (const [index, step] of candidate.steps.entries()) {
    check(step.order === index + 1 && text(step.action), 'Step order must be consecutive from 1 with an action.');
    check(whole(step.startMs) && whole(step.endMs) && step.endMs >= step.startMs && step.endMs <= source.durationMs + TIMING_TOLERANCE_MS, `Step ${step.order} time is outside the recorded source.`);
    const rows = references(step.evidenceIds, `Step ${step.order}`);
    check(rows.some(row => row.startMs <= step.endMs && row.endMs >= step.startMs), `Step ${step.order} does not overlap any cited evidence.`);
    check(Array.isArray(step.unknowns) && step.unknowns.every(text), `Step ${step.order} unknowns must be a text array.`);
  }
  check(Array.isArray(candidate.unresolved) && candidate.unresolved.every(text), 'Unresolved conditions must be a text array.');
}

async function validateIllustrations(artifactDir, source, candidate) {
  const manifestPath = resolve(artifactDir, 'illustrations.json');
  try { await lstat(manifestPath); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const manifest = await json(manifestPath);
  check(manifest.sourceMediaSha256 === source.sha256 && Array.isArray(manifest.images), 'Illustration manifest source or images are invalid.');
  for (const image of manifest.images) {
    check(text(image.path) && !isAbsolute(image.path) && !image.path.split(/[\\/]/).includes('..'), 'Illustration path must stay inside the artifact directory.');
    const path = await realpath(resolve(artifactDir, image.path));
    check(inside(artifactDir, path), 'Illustration path escapes the artifact directory.');
    check(whole(image.frameMs) && image.frameMs <= source.videoDurationMs + TIMING_TOLERANCE_MS && Number.isInteger(image.stepOrder) && image.stepOrder >= 1 && image.stepOrder <= candidate.steps.length && ['ingredient', 'step', 'finished'].includes(image.role), 'Illustration time, role or step is invalid.');
    check(image.sourceMediaSha256 === source.sha256, 'Illustration source hash differs from media.');
    const actual = await hashFile(path);
    check(actual.sha256 === image.sha256 && actual.bytes === image.byteCount, 'Illustration bytes or SHA-256 do not match manifest.');
    check(actual.bytes <= 200000 && whole(image.width) && whole(image.height) && image.width > 0 && image.height > 0 && Math.max(image.width, image.height) <= 1280, 'Illustration recorded dimensions or byte size exceed limits.');
  }
  return manifest.images;
}

// Escape source text so reading the report cannot load embedded Markdown images.
const md = value => String(value ?? '').replace(/[\\`*_{}\[\]<>#|~]/g, '\\$&').replace(/\r?\n/g, ' / ');
function report(source, candidate, evidence, images, synthetic) {
  const lines = [
    `# ${md(candidate.title)}`, '',
    synthetic ? '**合成契约样例，不是实际视频或可用菜谱。**' : '**已有解析草稿的本地重放，未重新进行 AI 分析。**', '',
    '本次只核对文件字节与已记录字段，没有重新解码音画、重做转写或判断菜谱是否正确；没有写入 App、审批、排菜或发布。', '',
    `原方份数：${md(candidate.yield.raw ?? '未说明')}。未知条件保留，不据此推算采购量。`, '',
    '## 材料与原话用量', '', '| 材料 | 原话用量 | 处理方式与待核实 |', '| --- | --- | --- |',
  ];
  for (const item of candidate.ingredients) {
    const notes = [item.prep, item.uncertainty].filter(Boolean);
    if (item.substitution) notes.push(`可替代为 ${item.substitution.name}（${item.substitution.rawQuantity ?? '用量未说明'}）；不能同时累计。${item.substitution.uncertainty ?? ''}`);
    lines.push(`| ${md(item.name)} | ${md(item.rawQuantity ?? '未说明')} | ${md(notes.join('；'))} |`);
  }
  lines.push('', '## 完整做法', '');
  for (const step of candidate.steps) {
    lines.push(`${step.order}. ${md(step.action)}`);
    for (const unknown of step.unknowns) lines.push(`   - 待核实：${md(unknown)}`);
  }
  lines.push('', '## 尚需核实', '');
  for (const unresolved of candidate.unresolved) lines.push(`- ${md(unresolved)}`);
  lines.push('', '份数、换算、用量和火力的外部核定由使用者完成；本报告不记录审批结论。', '', '## 来源与参考图', '', `- 作品：${md(source.workId)}`, `- 来源地址：${md(source.sourceUrl)}`, `- 使用权状态：${md(source.rightsState ?? 'unknown')}`, `- 参考图：${images.length} 张，仅检查本地字节与清单；没有复制或公开。原图请从输入产物目录查看。`, '', '<details>', '<summary>技术依据与本次边界</summary>', '', `- 原片 SHA-256：\`${source.sha256}\``, `- 字节数：${source.byteCount}`, `- 记录的音频 / 视频时长：${source.audioDurationMs} / ${source.videoDurationMs} ms`, `- 已记录证据：${evidence.length} 条`, `- 时码容差：${TIMING_TOLERANCE_MS} ms（沿用 KB 导入器；没有重新解码核实）`, '- recipe.md 中保留全部原话用量、替代项、逐材料疑问和逐步骤未知条件。', '- 没有运行 F2 / ASR / OCR / AI，没有调用 API，没有保存为正式菜谱或发布菜单。', '', '</details>', '');
  return lines.join('\n');
}

export async function replay(options) {
  const artifactDir = await realpath(resolve(options.artifactDir));
  const outputDir = await newOutputPath(options.outputDir, artifactDir);
  const [source, candidate, evidence] = await Promise.all(['source.json', 'candidate.json', 'evidence.json'].map(name => json(resolve(artifactDir, name))));
  await readFile(resolve(artifactDir, 'review.md'), 'utf8');
  validateSource(source, candidate, Boolean(options.synthetic));
  const actual = await hashFile(resolve(options.media));
  check(actual.sha256 === source.sha256, 'Media SHA-256 does not match source manifest.');
  check(actual.bytes === source.byteCount, 'Media byte count does not match source manifest.');
  validateCandidate(source, candidate, evidence);
  const images = await validateIllustrations(artifactDir, source, candidate);
  const receipt = {
    schemaVersion: 1,
    mode: options.synthetic ? 'synthetic_reference_replay' : 'cached_artifact_replay',
    newAiAnalysis: false, downloadPerformed: false, kbWrites: false,
    independentlyDecoded: false, approvalRecorded: false, status: 'needs_human_review',
    source: { workId: source.workId, sourceUrl: source.sourceUrl, sha256: actual.sha256, byteCount: actual.bytes, recordedAccessMethod: source.accessMethod, recordedDurationMs: source.durationMs, recordedAudioDurationMs: source.audioDurationMs, recordedVideoDurationMs: source.videoDurationMs },
    recordedCoverage: { audioProcessedThroughMs: source.analysisCoverage.audioProcessedThroughMs, frameCount: source.analysisCoverage.frameCount, lastFrameMs: source.analysisCoverage.lastFrameMs, maxFrameGapMs: source.analysisCoverage.maxFrameGapMs },
    counts: { ingredients: candidate.ingredients.length, steps: candidate.steps.length, evidence: evidence.length, illustrations: images.length },
    checks: ['media_bytes_and_sha256', 'recorded_coverage_fields', 'audiovisual_reference_resolution', 'recorded_time_bounds_and_step_overlap', 'illustration_bytes_and_sha256', 'draft_approval_flags_unchanged'],
    timingToleranceMs: TIMING_TOLERANCE_MS,
    limitations: ['Recorded coverage and dimensions were checked as fields, not independently decoded.', 'Evidence semantics and recipe completeness were not re-evaluated.', 'No download, new AI analysis, API writes, approval or publication occurred.'],
  };
  await mkdir(outputDir);
  try {
    await writeFile(resolve(outputDir, 'recipe.md'), report(source, candidate, evidence, images, Boolean(options.synthetic)), { flag: 'wx' });
    await writeFile(resolve(outputDir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    throw error;
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).includes('--help')) process.stdout.write(usage + '\n');
  else {
    try { process.stdout.write(JSON.stringify(await replay(parseArgs(process.argv.slice(2))), null, 2) + '\n'); }
    catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
  }
}
