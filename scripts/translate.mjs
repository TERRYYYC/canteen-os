#!/usr/bin/env node
/**
 * translate.mjs — 扫描 data/ 全部 I18nString，缺 en/uk 的用 DeepL 补齐，翻译状态维护在
 * 旁文件 data/translations.lock.json（执行简报 §5「翻译锁」；issue #4）。
 *
 *   node scripts/translate.mjs              # 有 DEEPL_API_KEY：机翻并写回 data/ + lock；
 *                                           # 无 key：不报错，打印缺失统计，只写 lock 的 human 采集，exit 0
 *   node scripts/translate.mjs --dry-run    # 只打印将翻译的条目与预估字符数，不写任何文件
 *   node scripts/translate.mjs --check      # 只报告（缺失 / stale / 待重翻 / 孤儿），不写任何文件
 *   node scripts/translate.mjs --root <dir> # 指定仓库根目录（测试用；默认为脚本所在仓库）
 *
 * I18nString 识别规则：对象含 `zh` 键且值为字符串。条目键 = `<相对文件路径>#<RFC 6901 JSON pointer>`，
 * 如 `data/dishes/tomato-egg-stir-fry.json#/steps/0/text`。
 *
 * lock 格式：{ "<file>#<pointer>": { source_hash: sha1(zh), status: "machine"|"human", updatedAt: ISO, stale?: true } }
 *
 * 规则：
 *   - en/uk 已存在（至少其一）且 lock 无记录 → 视为 human 写入 lock（保守：已有译文当人工）
 *   - en/uk 缺失 → 需要机翻（不覆盖任何已有文本，任何 status 下都补）
 *   - zh 变了且 status=machine → en/uk 全部重翻，更新 source_hash
 *   - zh 变了且 status=human → 永不覆盖，只标 stale: true；zh 恢复（hash 再次匹配）时 stale 自动消失
 *   - lock 中已不存在于 data/ 的键 → 孤儿，默认模式下从 lock 移除
 *
 * 机翻后端：DEEPL_API_KEY（`:fx` 结尾走 api-free.deepl.com）；glossary 由 data/techniques.json 的
 * name.zh→en / zh→uk 自动生成，优先 v3 多语 glossary，失败退回 v2 单语对，再失败则不用 glossary 并提示。
 * 翻译逻辑可注入：runTranslate({ files, lock, translator })，translator = { name, translate(texts, lang) }。
 *
 * 纯 Node ≥ 20，零依赖，ESM。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LANGS = ["en", "uk"];
export const LOCK_FILE = "translations.lock.json";
export const DATA_DIR = "data";

/** DeepL target_lang 代码（en 取 EN-US；glossary 侧用 en/uk） */
const DEEPL_TARGET = { en: "EN-US", uk: "UK" };
const DEEPL_BATCH = 50; // /v2/translate 单次最多 50 条 text

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

export function sha1(text) {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

/** RFC 6901：`~` → `~0`，`/` → `~1` */
export function escapePointerToken(token) {
  return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

export function isI18nString(node) {
  return node !== null && typeof node === "object" && !Array.isArray(node) && typeof node.zh === "string";
}

/**
 * 深度遍历，收集所有 I18nString。返回 [{ pointer, node }]；不进入 I18nString 内部。
 */
export function collectI18nStrings(root) {
  const out = [];
  const walk = (node, pointer) => {
    if (node === null || typeof node !== "object") return;
    if (isI18nString(node)) {
      out.push({ pointer, node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${pointer}/${i}`));
      return;
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${pointer}/${escapePointerToken(k)}`);
  };
  walk(root, "");
  return out;
}

/** 写入一种语言的译文，并把键序整理为 zh, en, uk, 其余（原地修改，保持对象身份） */
export function setLang(node, lang, text) {
  const merged = { ...node, [lang]: text };
  for (const k of Object.keys(node)) delete node[k];
  for (const k of ["zh", "en", "uk"]) if (merged[k] !== undefined) node[k] = merged[k];
  for (const k of Object.keys(merged)) if (!(k in node)) node[k] = merged[k];
}

function missingLangs(node) {
  return LANGS.filter((l) => typeof node[l] !== "string" || node[l].length === 0);
}

function sortKeys(obj) {
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
}

export function stringifyJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// 文件装载 / 写回（I/O 边界，runTranslate 本身不碰磁盘）
// ---------------------------------------------------------------------------

/** 递归列出 data/ 下全部 *.json（排除 lock 文件），返回 [{ path: 'data/…', abs, data }]，按路径排序 */
export function loadDataFiles(root) {
  const dataAbs = path.join(root, DATA_DIR);
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
      } else if (name.endsWith(".json") && name !== LOCK_FILE) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        files.push({ path: rel, abs, data: JSON.parse(readFileSync(abs, "utf8")) });
      }
    }
  };
  if (existsSync(dataAbs)) walk(dataAbs);
  return files;
}

export function readLock(root) {
  const abs = path.join(root, DATA_DIR, LOCK_FILE);
  return existsSync(abs) ? JSON.parse(readFileSync(abs, "utf8")) : {};
}

/** 从 techniques.json 生成 glossary：{ en: [[zh, en], …], uk: [[zh, uk], …] }（只取 name，去重、去空） */
export function buildGlossary(techniques) {
  const out = { en: [], uk: [] };
  if (!Array.isArray(techniques)) return out;
  for (const lang of LANGS) {
    const seen = new Set();
    for (const t of techniques) {
      const name = t && t.name;
      if (!isI18nString(name)) continue;
      const src = name.zh.trim();
      const dst = typeof name[lang] === "string" ? name[lang].trim() : "";
      if (!src || !dst || seen.has(src) || /[\t\n\r]/.test(src + dst)) continue;
      seen.add(src);
      out[lang].push([src, dst]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 核心：纯逻辑，可注入 translator
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {Array<{path: string, data: any}>} opts.files  数据文件（data 会被原地写入译文）
 * @param {object} [opts.lock]                          现有 lock（不修改，返回新对象）
 * @param {{name?: string, translate(texts: string[], lang: 'en'|'uk'): Promise<string[]>}|null} [opts.translator]
 *        null → 不机翻，只做统计与 human 采集
 * @param {string} [opts.now]                           ISO 时间戳（测试可固定）
 * @param {boolean} [opts.removeOrphans=true]           从 lock 移除 data/ 中已不存在的键
 * @returns {Promise<{lock: object, changedFiles: string[], stats: object}>}
 */
export async function runTranslate({ files, lock = {}, translator = null, now = new Date().toISOString(), removeOrphans = true }) {
  const newLock = {};
  const seen = new Set();
  const plan = []; // { key, lang, zh, reason: 'missing'|'changed', node, hash, file }
  const stats = {
    files: files.length,
    strings: 0,
    missing: { total: 0, byLang: Object.fromEntries(LANGS.map((l) => [l, 0])), byFile: {} },
    recordedHuman: 0,
    retranslate: 0,
    stale: [],
    orphans: [],
    plan: [],
    chars: 0,
    translated: 0,
    lockChanged: false,
  };

  for (const file of files) {
    for (const { pointer, node } of collectI18nStrings(file.data)) {
      stats.strings++;
      const key = `${file.path}#${pointer}`;
      seen.add(key);
      const hash = sha1(node.zh);
      const missing = missingLangs(node);
      if (missing.length) {
        stats.missing.total += missing.length;
        const perFile = (stats.missing.byFile[file.path] ??= Object.fromEntries(LANGS.map((l) => [l, 0])));
        for (const l of missing) {
          stats.missing.byLang[l]++;
          perFile[l]++;
        }
      }
      const push = (langs, reason) => {
        for (const lang of langs) plan.push({ key, lang, zh: node.zh, reason, node, hash, file });
      };

      const entry = lock[key];
      if (!entry) {
        if (missing.length < LANGS.length) {
          // 已有译文但没记录 → 保守视为人工
          newLock[key] = { source_hash: hash, status: "human", updatedAt: now };
          stats.recordedHuman++;
        }
        push(missing, "missing");
      } else if (entry.status === "machine") {
        const copy = { ...entry };
        delete copy.stale; // machine 条目不存在 stale 概念
        newLock[key] = copy;
        if (entry.source_hash !== hash) {
          stats.retranslate++;
          push(LANGS, "changed");
        } else {
          push(missing, "missing");
        }
      } else {
        // human：永不覆盖；zh 变了只标 stale，zh 恢复则清除
        const copy = { ...entry };
        if (entry.source_hash !== hash) {
          copy.stale = true;
          stats.stale.push({ key, zh: node.zh, currentHash: hash, lockedHash: entry.source_hash });
        } else {
          delete copy.stale;
        }
        newLock[key] = copy;
        push(missing, "missing");
      }
    }
  }

  for (const key of Object.keys(lock)) {
    if (!seen.has(key)) {
      stats.orphans.push(key);
      if (!removeOrphans) newLock[key] = lock[key];
    }
  }

  stats.plan = plan.map(({ key, lang, zh, reason }) => ({ key, lang, zh, reason }));
  stats.chars = plan.reduce((n, p) => n + p.zh.length, 0);

  const changed = new Set();
  if (translator && plan.length) {
    for (const lang of LANGS) {
      const items = plan.filter((p) => p.lang === lang);
      if (!items.length) continue;
      const results = await translator.translate(items.map((p) => p.zh), lang);
      if (!Array.isArray(results) || results.length !== items.length) {
        throw new Error(`translator 返回条数不符（${lang}）：期望 ${items.length}，实际 ${results && results.length}`);
      }
      items.forEach((p, i) => {
        const text = typeof results[i] === "string" ? results[i].trim() : "";
        if (!text) throw new Error(`translator 返回空译文：${p.key} (${lang})`);
        setLang(p.node, lang, text);
        changed.add(p.file.path);
        stats.translated++;
        const prev = newLock[p.key];
        if (prev && prev.status === "human") {
          prev.updatedAt = now; // 只是补缺，source_hash 与 stale 保持不变
        } else {
          newLock[p.key] = { source_hash: p.hash, status: "machine", updatedAt: now };
        }
      });
    }
  }

  const sortedLock = sortKeys(newLock);
  stats.lockChanged = JSON.stringify(sortedLock) !== JSON.stringify(sortKeys(lock));
  return { lock: sortedLock, changedFiles: [...changed].sort(), stats };
}

// ---------------------------------------------------------------------------
// DeepL 后端（全局 fetch；glossary v3 → v2 → 无）
// ---------------------------------------------------------------------------

export function deeplBaseUrl(apiKey) {
  return apiKey.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
}

/**
 * @param {{apiKey: string, glossary?: {en: string[][], uk: string[][]}, fetch?: typeof fetch, log?: (s: string) => void, retryDelayMs?: number}} opts
 *        429 / 5xx 重试最多 3 次（间隔 retryDelayMs × 次数）
 */
export function createDeepLTranslator({ apiKey, glossary = { en: [], uk: [] }, fetch: fetchImpl = globalThis.fetch, log = () => {}, retryDelayMs = 1000 }) {
  const base = deeplBaseUrl(apiKey);
  const headers = { Authorization: `DeepL-Auth-Key ${apiKey}` };
  let glossaryIds = null; // { en?: id, uk?: id } | {}

  async function request(pathname, init, attempt = 1) {
    const res = await fetchImpl(`${base}${pathname}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
      return request(pathname, init, attempt + 1);
    }
    return res;
  }

  const tsv = (pairs) => pairs.map(([s, t]) => `${s}\t${t}`).join("\n");
  const glossaryName = () => `canteenos-techniques-${sha1(JSON.stringify(glossary)).slice(0, 8)}`;

  async function tryGlossaryV3() {
    const name = glossaryName();
    // 先复用同名 glossary，避免每次运行都新建
    const listRes = await request("/v3/glossaries", { method: "GET" });
    if (listRes.ok) {
      const list = await listRes.json();
      const found = (list.glossaries || []).find((g) => g.name === name);
      if (found) return { en: found.glossary_id, uk: found.glossary_id, via: `v3 (复用 ${found.glossary_id})` };
    }
    const dictionaries = LANGS.filter((l) => glossary[l] && glossary[l].length).map((l) => ({
      source_lang: "zh",
      target_lang: l,
      entries: tsv(glossary[l]),
      entries_format: "tsv",
    }));
    if (!dictionaries.length) return null;
    const res = await request("/v3/glossaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, dictionaries }),
    });
    if (!res.ok) throw new Error(`v3 glossary ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const g = await res.json();
    return { en: g.glossary_id, uk: g.glossary_id, via: `v3 (${g.glossary_id})` };
  }

  async function tryGlossaryV2() {
    const ids = {};
    for (const l of LANGS) {
      if (!glossary[l] || !glossary[l].length) continue;
      const body = new URLSearchParams({
        name: `${glossaryName()}-${l}`,
        source_lang: "ZH",
        target_lang: l.toUpperCase(),
        entries: tsv(glossary[l]),
        entries_format: "tsv",
      });
      const res = await request("/v2/glossaries", { method: "POST", body });
      if (!res.ok) throw new Error(`v2 glossary ${res.status}: ${(await res.text()).slice(0, 200)}`);
      ids[l] = (await res.json()).glossary_id;
    }
    return Object.keys(ids).length ? { ...ids, via: "v2" } : null;
  }

  async function ensureGlossary() {
    if (glossaryIds) return glossaryIds;
    try {
      glossaryIds = (await tryGlossaryV3()) || {};
    } catch (e3) {
      log(`glossary v3 失败（${e3.message}），退回 v2`);
      try {
        glossaryIds = (await tryGlossaryV2()) || {};
      } catch (e2) {
        log(`glossary v2 也失败（${e2.message}），本次不带术语表翻译`);
        glossaryIds = {};
      }
    }
    log(glossaryIds.via ? `glossary：${glossaryIds.via}` : "glossary：无（techniques.json 为空或上传失败）");
    return glossaryIds;
  }

  return {
    name: `DeepL (${new URL(base).host})`,
    async translate(texts, lang) {
      const ids = await ensureGlossary();
      const out = [];
      for (let i = 0; i < texts.length; i += DEEPL_BATCH) {
        const batch = texts.slice(i, i + DEEPL_BATCH);
        const body = { text: batch, source_lang: "ZH", target_lang: DEEPL_TARGET[lang] };
        if (ids[lang]) body.glossary_id = ids[lang];
        const res = await request("/v2/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`DeepL /v2/translate ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const json = await res.json();
        out.push(...(json.translations || []).map((t) => t.text));
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { dryRun: false, check: false, root: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--check") args.check = true;
    else if (a === "--root") args.root = argv[++i];
    else if (a === "-h" || a === "--help") args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  return args;
}

function printReport({ stats, changedFiles, lock }, { mode, translatorName, out }) {
  const langCols = (m) => LANGS.map((l) => `${l} ${m[l]}`).join(" · ");
  out(`translate.mjs [${mode}] 扫描 ${stats.files} 个文件 · ${stats.strings} 条 I18nString`);
  out(`缺失译文：${langCols(stats.missing.byLang)} · 共 ${stats.missing.total} 处`);
  for (const [file, m] of Object.entries(stats.missing.byFile)) out(`  ${file.padEnd(48)} ${langCols(m)}`);
  out(
    `lock：条目 ${Object.keys(lock).length} · 新采集 human ${stats.recordedHuman} · 待重翻(machine, zh 变化) ${stats.retranslate}` +
      ` · stale(human, zh 变化) ${stats.stale.length} · 孤儿 ${stats.orphans.length}`,
  );
  for (const s of stats.stale) out(`  stale  ${s.key}  zh 已变：sha1 ${s.lockedHash.slice(0, 8)}… → ${s.currentHash.slice(0, 8)}…（人工校对后把 source_hash 改为新值）`);
  for (const k of stats.orphans) out(`  孤儿   ${k}`);
  out(`待机翻：${stats.plan.length} 条 · 预估 ${stats.chars} 字符（按 zh 长度 × 目标语言数）`);
  if (mode === "dry-run") for (const p of stats.plan) out(`  ${p.lang}  ${p.reason === "changed" ? "重翻" : "补缺"}  ${p.key}`);
  if (translatorName) {
    out(`机翻后端：${translatorName} · 已翻 ${stats.translated} 条 · 写回文件 ${changedFiles.length} 个`);
    for (const f of changedFiles) out(`  写回   ${f}`);
  }
}

export async function main(argv = process.argv.slice(2), env = process.env, out = console.log) {
  const args = parseArgs(argv);
  if (args.help) {
    out(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].split("\n").slice(2).map((l) => l.replace(/^ \* ?/, "")).join("\n"));
    return 0;
  }
  const root = args.root ? path.resolve(args.root) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const files = loadDataFiles(root);
  const lock = readLock(root);
  const readOnly = args.dryRun || args.check;
  const mode = args.dryRun ? "dry-run" : args.check ? "check" : "write";

  const apiKey = (env.DEEPL_API_KEY || "").trim();
  let translator = null;
  if (apiKey && !readOnly) {
    const techniques = files.find((f) => f.path === `${DATA_DIR}/techniques.json`);
    translator = createDeepLTranslator({ apiKey, glossary: buildGlossary(techniques ? techniques.data : []), log: out });
  }

  const result = await runTranslate({ files, lock, translator, removeOrphans: !readOnly });
  printReport(result, { mode, translatorName: translator ? translator.name : null, out });

  if (readOnly) {
    out(`[${mode}] 未写任何文件。`);
    return 0;
  }
  if (!apiKey) out("未设置 DEEPL_API_KEY：跳过机翻，只写入 lock 的 human 采集（exit 0）。");

  for (const f of files) {
    if (result.changedFiles.includes(f.path)) writeFileSync(f.abs, stringifyJson(f.data));
  }
  if (result.stats.lockChanged) {
    writeFileSync(path.join(root, DATA_DIR, LOCK_FILE), stringifyJson(result.lock));
    out(`已写入 ${DATA_DIR}/${LOCK_FILE}（${Object.keys(result.lock).length} 条）`);
  } else {
    out(`${DATA_DIR}/${LOCK_FILE} 无变化`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`translate.mjs 失败：${err && err.stack ? err.stack : err}`);
      process.exit(1);
    },
  );
}
