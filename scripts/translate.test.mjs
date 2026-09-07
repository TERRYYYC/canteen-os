/**
 * scripts/translate.mjs 单元测试（node:test，零依赖）。
 *   node --test scripts/translate.test.mjs
 *
 * 覆盖：human 不被覆盖 / zh 变化触发 machine 重翻 / human 遇 zh 变化标 stale（并可恢复）/
 *       缺失统计 / 无 lock 记录时已有译文采集为 human / 孤儿清理 / JSON pointer 转义 /
 *       dry-run 与 check 不写文件（临时目录复制 data/ 子集跑真实 CLI）/ 无 key 默认模式只写 lock。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGlossary,
  collectI18nStrings,
  createDeepLTranslator,
  deeplBaseUrl,
  loadDataFiles,
  runTranslate,
  setLang,
  sha1,
} from "./translate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SCRIPT = path.join(HERE, "translate.mjs");
const NOW = "2026-09-07T00:00:00.000Z";

/** 假翻译器：`[lang] zh`，并记录调用 */
function fakeTranslator() {
  const calls = [];
  return {
    name: "fake",
    calls,
    async translate(texts, lang) {
      calls.push({ texts: [...texts], lang });
      return texts.map((t) => `[${lang}] ${t}`);
    },
  };
}

const dishFile = (over = {}) => ({
  path: "data/dishes/d.json",
  data: {
    schemaVersion: "2",
    name: { zh: "番茄炒蛋", en: "Tomato and egg stir-fry", uk: "Смажені яйця з томатами" },
    steps: [{ text: { zh: "番茄切块。" } }],
    ...over,
  },
});

// ---------------------------------------------------------------------------

test("扫描：I18nString 识别与 JSON pointer（含 ~ / 转义）", () => {
  const data = {
    name: { zh: "a", en: "A" },
    list: [{ text: { zh: "b" } }, { text: { zh: "c", uk: "C" } }],
    "we/ird~key": { zh: "d" },
    qty: { value: 1, unit: "g" },
  };
  const found = collectI18nStrings(data).map((x) => x.pointer);
  assert.deepEqual(found, ["/name", "/list/0/text", "/list/1/text", "/we~1ird~0key"]);
});

test("无 lock 记录且已有译文 → 采集为 human，不动数据；缺失译文不翻则不入 lock", async () => {
  const file = dishFile();
  const before = JSON.stringify(file.data);
  const { lock, changedFiles, stats } = await runTranslate({ files: [file], lock: {}, translator: null, now: NOW });
  assert.deepEqual(lock, {
    "data/dishes/d.json#/name": { source_hash: sha1("番茄炒蛋"), status: "human", updatedAt: NOW },
  });
  assert.equal(stats.recordedHuman, 1);
  assert.equal(stats.lockChanged, true);
  assert.deepEqual(changedFiles, []);
  assert.equal(JSON.stringify(file.data), before, "无 translator 不得改数据");
});

test("缺失统计：按语言、按文件、总数与预估字符数正确", async () => {
  const files = [
    dishFile(), // steps[0].text 缺 en、uk（zh 5 字）
    {
      path: "data/ingredients/x.json",
      data: { name: { zh: "小葱", en: "Scallion" } }, // 缺 uk（2 字）
    },
    { path: "data/purchase-orders/po.json", data: { supplier: "宏达", lines: [] } }, // 无 I18nString
  ];
  const { stats } = await runTranslate({ files, lock: {}, translator: null, now: NOW });
  assert.equal(stats.files, 3);
  assert.equal(stats.strings, 3);
  assert.deepEqual(stats.missing.byLang, { en: 1, uk: 2 });
  assert.deepEqual(stats.missing.byFile, {
    "data/dishes/d.json": { en: 1, uk: 1 },
    "data/ingredients/x.json": { en: 0, uk: 1 },
  });
  assert.equal(stats.missing.total, 3);
  assert.equal(stats.plan.length, 3);
  assert.equal(stats.chars, 5 + 5 + 2);
  assert.deepEqual(
    stats.plan.map((p) => `${p.lang}:${p.key}:${p.reason}`).sort(),
    ["en:data/dishes/d.json#/steps/0/text:missing", "uk:data/dishes/d.json#/steps/0/text:missing", "uk:data/ingredients/x.json#/name:missing"],
  );
});

test("有 translator：补缺写入数据、键序 zh/en/uk、lock 记 machine；已存在的 human 补缺后仍是 human", async () => {
  const file = {
    path: "data/dishes/d.json",
    data: {
      name: { zh: "番茄炒蛋", uk: "Смажені яйця" }, // 缺 en → 采集 human + 补 en
      steps: [{ text: { zh: "番茄切块。" } }], // 全缺 → machine
    },
  };
  const tr = fakeTranslator();
  const { lock, changedFiles, stats } = await runTranslate({ files: [file], lock: {}, translator: tr, now: NOW });
  assert.deepEqual(Object.keys(file.data.name), ["zh", "en", "uk"]);
  assert.equal(file.data.name.en, "[en] 番茄炒蛋");
  assert.equal(file.data.name.uk, "Смажені яйця", "已有 uk 不得被覆盖");
  assert.deepEqual(file.data.steps[0].text, { zh: "番茄切块。", en: "[en] 番茄切块。", uk: "[uk] 番茄切块。" });
  assert.equal(lock["data/dishes/d.json#/name"].status, "human");
  assert.deepEqual(lock["data/dishes/d.json#/steps/0/text"], { source_hash: sha1("番茄切块。"), status: "machine", updatedAt: NOW });
  assert.deepEqual(changedFiles, ["data/dishes/d.json"]);
  assert.equal(stats.translated, 3);
  assert.deepEqual(
    tr.calls.map((c) => `${c.lang}:${c.texts.join("|")}`),
    ["en:番茄炒蛋|番茄切块。", "uk:番茄切块。"],
  );
});

test("zh 变化 + status=machine → en/uk 全部重翻，source_hash 更新", async () => {
  const key = "data/dishes/d.json#/steps/0/text";
  const file = dishFile({ steps: [{ text: { zh: "番茄切滚刀块。", en: "OLD EN", uk: "OLD UK" } }] });
  const lock = {
    [key]: { source_hash: sha1("番茄切块。"), status: "machine", updatedAt: "2026-01-01T00:00:00.000Z" },
    "data/dishes/d.json#/name": { source_hash: sha1("番茄炒蛋"), status: "human", updatedAt: "2026-01-01T00:00:00.000Z" },
  };
  const { lock: next, stats } = await runTranslate({ files: [file], lock, translator: fakeTranslator(), now: NOW });
  assert.equal(stats.retranslate, 1);
  assert.deepEqual(file.data.steps[0].text, { zh: "番茄切滚刀块。", en: "[en] 番茄切滚刀块。", uk: "[uk] 番茄切滚刀块。" });
  assert.deepEqual(next[key], { source_hash: sha1("番茄切滚刀块。"), status: "machine", updatedAt: NOW });
  assert.equal(file.data.name.en, "Tomato and egg stir-fry", "hash 未变的 human 不动");
});

test("zh 未变 + status=machine → 不重翻（无 translator 调用）", async () => {
  const key = "data/dishes/d.json#/steps/0/text";
  const file = dishFile({ steps: [{ text: { zh: "番茄切块。", en: "E", uk: "U" } }] });
  const lock = { [key]: { source_hash: sha1("番茄切块。"), status: "machine", updatedAt: NOW } };
  const tr = fakeTranslator();
  const { lock: next, stats } = await runTranslate({ files: [file], lock, translator: tr, now: NOW });
  assert.equal(tr.calls.length, 0);
  assert.equal(stats.retranslate, 0);
  assert.equal(file.data.steps[0].text.en, "E");
  assert.equal(next[key].status, "machine");
});

test("zh 变化 + status=human → 不覆盖，标 stale: true；zh 恢复后 stale 消失", async () => {
  const key = "data/dishes/d.json#/name";
  const human = { source_hash: sha1("番茄炒蛋"), status: "human", updatedAt: "2026-01-01T00:00:00.000Z" };
  const file = dishFile({ name: { zh: "西红柿炒鸡蛋", en: "Tomato and egg stir-fry", uk: "Смажені яйця з томатами" }, steps: [] });
  const tr = fakeTranslator();
  const { lock: next, stats, changedFiles } = await runTranslate({ files: [file], lock: { [key]: human }, translator: tr, now: NOW });
  assert.equal(file.data.name.en, "Tomato and egg stir-fry", "human 译文不得被覆盖");
  assert.equal(file.data.name.uk, "Смажені яйця з томатами");
  assert.equal(tr.calls.length, 0, "human 且无缺失 → 不调用 translator");
  assert.deepEqual(next[key], { ...human, stale: true }, "source_hash 保持人工翻译时的值，只加 stale");
  assert.equal(stats.stale.length, 1);
  assert.equal(stats.stale[0].key, key);
  assert.deepEqual(changedFiles, []);

  // zh 改回去 → stale 自动清除
  file.data.name.zh = "番茄炒蛋";
  const again = await runTranslate({ files: [file], lock: next, translator: tr, now: NOW });
  assert.deepEqual(again.lock[key], human);
  assert.equal(again.stats.stale.length, 0);
});

test("human 且 stale，仍补缺失语言但不动已有译文与 source_hash", async () => {
  const key = "data/dishes/d.json#/name";
  const human = { source_hash: sha1("番茄炒蛋"), status: "human", updatedAt: "2026-01-01T00:00:00.000Z" };
  const file = dishFile({ name: { zh: "西红柿炒鸡蛋", en: "Tomato and egg stir-fry" }, steps: [] });
  const { lock: next } = await runTranslate({ files: [file], lock: { [key]: human }, translator: fakeTranslator(), now: NOW });
  assert.equal(file.data.name.en, "Tomato and egg stir-fry");
  assert.equal(file.data.name.uk, "[uk] 西红柿炒鸡蛋");
  assert.deepEqual(next[key], { source_hash: sha1("番茄炒蛋"), status: "human", updatedAt: NOW, stale: true });
});

test("孤儿键：默认移除并计入 stats；removeOrphans=false 保留", async () => {
  const file = dishFile({ steps: [] });
  const lock = {
    "data/dishes/d.json#/name": { source_hash: sha1("番茄炒蛋"), status: "human", updatedAt: NOW },
    "data/dishes/gone.json#/name": { source_hash: "x", status: "machine", updatedAt: NOW },
  };
  const a = await runTranslate({ files: [file], lock, translator: null, now: NOW });
  assert.deepEqual(a.stats.orphans, ["data/dishes/gone.json#/name"]);
  assert.equal("data/dishes/gone.json#/name" in a.lock, false);
  assert.equal(a.stats.lockChanged, true);
  const b = await runTranslate({ files: [file], lock, translator: null, now: NOW, removeOrphans: false });
  assert.equal("data/dishes/gone.json#/name" in b.lock, true);
  assert.equal(b.stats.lockChanged, false);
});

test("setLang 键序整理；buildGlossary 只取 name、去重去空；DeepL 端点按 :fx 判断", () => {
  const node = { zh: "a", uk: "U" };
  setLang(node, "en", "E");
  assert.deepEqual(Object.keys(node), ["zh", "en", "uk"]);
  const g = buildGlossary([
    { id: "blanch", name: { zh: "焯水", en: "Blanching", uk: "Бланшування" }, note: { zh: "x", en: "y", uk: "z" } },
    { id: "dup", name: { zh: "焯水", en: "Other" } },
    { id: "no-uk", name: { zh: "炒", en: "Stir-frying" } },
  ]);
  assert.deepEqual(g, { en: [["焯水", "Blanching"], ["炒", "Stir-frying"]], uk: [["焯水", "Бланшування"]] });
  assert.equal(deeplBaseUrl("abc:fx"), "https://api-free.deepl.com");
  assert.equal(deeplBaseUrl("abc"), "https://api.deepl.com");
});

// ---------------------------------------------------------------------------
// DeepL 后端：假 fetch 走通 glossary v3 / 退回 v2 / 无 glossary 三条路径 + 分批
// ---------------------------------------------------------------------------

function mockFetch(handlers) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || "GET"} ${u.pathname}`;
    calls.push({ key, init });
    const h = handlers[key];
    if (!h) throw new Error(`未预期请求 ${key}`);
    const r = typeof h === "function" ? h(init) : h;
    return { ok: r.status < 400, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  return { fetch, calls };
}

const GLOSSARY = { en: [["焯水", "Blanching"]], uk: [["焯水", "Бланшування"]] };

test("DeepL：v3 glossary 创建一次并复用；/v2/translate 带 glossary_id、按 50 条分批、free 端点", async () => {
  const translateBodies = [];
  const { fetch, calls } = mockFetch({
    "GET /v3/glossaries": { status: 200, body: { glossaries: [] } },
    "POST /v3/glossaries": (init) => {
      const b = JSON.parse(init.body);
      assert.equal(b.dictionaries.length, 2);
      assert.equal(b.dictionaries[0].entries, "焯水\tBlanching");
      assert.equal(b.dictionaries[1].target_lang, "uk");
      return { status: 201, body: { glossary_id: "g-1" } };
    },
    "POST /v2/translate": (init) => {
      const b = JSON.parse(init.body);
      translateBodies.push(b);
      return { status: 200, body: { translations: b.text.map((t) => ({ text: `${b.target_lang}:${t}` })) } };
    },
  });
  const tr = createDeepLTranslator({ apiKey: "k:fx", glossary: GLOSSARY, fetch });
  assert.equal(tr.name, "DeepL (api-free.deepl.com)");
  const texts = Array.from({ length: 51 }, (_, i) => `t${i}`);
  const en = await tr.translate(texts, "en");
  assert.equal(en.length, 51);
  assert.equal(en[50], "EN-US:t50");
  assert.equal(translateBodies.length, 2, "51 条 → 2 批");
  assert.equal(translateBodies[0].text.length, 50);
  assert.equal(translateBodies[0].glossary_id, "g-1");
  assert.equal(translateBodies[0].source_lang, "ZH");
  const uk = await tr.translate(["x"], "uk");
  assert.deepEqual(uk, ["UK:x"]);
  assert.equal(calls.filter((c) => c.key === "POST /v3/glossaries").length, 1, "glossary 只建一次");
  assert.ok(calls.every((c) => c.init.headers.Authorization === "DeepL-Auth-Key k:fx"));
});

test("DeepL：v3 失败退回 v2（每语言一个 glossary）；v2 也失败则不带 glossary 翻译", async () => {
  const logs = [];
  const a = mockFetch({
    "GET /v3/glossaries": { status: 404, body: {} },
    "POST /v3/glossaries": { status: 404, body: { message: "not found" } },
    "POST /v2/glossaries": (init) => ({ status: 201, body: { glossary_id: `v2-${init.body.get("target_lang")}` } }),
    "POST /v2/translate": (init) => {
      const b = JSON.parse(init.body);
      return { status: 200, body: { translations: b.text.map((t) => ({ text: `${b.glossary_id}:${t}` })) } };
    },
  });
  const tr = createDeepLTranslator({ apiKey: "k", glossary: GLOSSARY, fetch: a.fetch, log: (s) => logs.push(s) });
  assert.equal(tr.name, "DeepL (api.deepl.com)");
  assert.deepEqual(await tr.translate(["a"], "en"), ["v2-EN:a"]);
  assert.deepEqual(await tr.translate(["a"], "uk"), ["v2-UK:a"]);
  assert.ok(logs.some((l) => l.includes("退回 v2")));

  const b = mockFetch({
    "GET /v3/glossaries": { status: 500, body: {} },
    "POST /v3/glossaries": { status: 400, body: {} },
    "POST /v2/glossaries": { status: 400, body: {} },
    "POST /v2/translate": (init) => {
      const body = JSON.parse(init.body);
      assert.equal("glossary_id" in body, false);
      return { status: 200, body: { translations: body.text.map((t) => ({ text: `plain:${t}` })) } };
    },
  });
  const logs2 = [];
  const tr2 = createDeepLTranslator({ apiKey: "k", glossary: GLOSSARY, fetch: b.fetch, log: (s) => logs2.push(s), retryDelayMs: 1 });
  assert.deepEqual(await tr2.translate(["a"], "en"), ["plain:a"]);
  assert.equal(b.calls.filter((c) => c.key === "GET /v3/glossaries").length, 3, "5xx 重试 3 次");
  assert.ok(logs2.some((l) => l.includes("不带术语表")));
});

test("DeepL：翻译接口报错时抛出（由 CLI 转为 exit 1）", async () => {
  const { fetch } = mockFetch({
    "GET /v3/glossaries": { status: 200, body: { glossaries: [] } },
    "POST /v2/translate": { status: 456, body: { message: "Quota exceeded" } },
  });
  const tr = createDeepLTranslator({ apiKey: "k", glossary: { en: [], uk: [] }, fetch });
  await assert.rejects(() => tr.translate(["a"], "en"), /456/);
});

// ---------------------------------------------------------------------------
// CLI：临时目录复制 data/ 子集
// ---------------------------------------------------------------------------

function makeTempRepo() {
  const tmp = mkdtempSync(path.join(tmpdir(), "canteenos-translate-"));
  mkdirSync(path.join(tmp, "data/dishes"), { recursive: true });
  mkdirSync(path.join(tmp, "data/ingredients"), { recursive: true });
  cpSync(path.join(ROOT, "data/techniques.json"), path.join(tmp, "data/techniques.json"));
  cpSync(path.join(ROOT, "data/ingredients/tomato.json"), path.join(tmp, "data/ingredients/tomato.json"));
  // 一道缺 uk 的菜
  writeFileSync(
    path.join(tmp, "data/dishes/d.json"),
    `${JSON.stringify({ schemaVersion: "2", name: { zh: "番茄炒蛋", en: "Tomato and egg stir-fry" } }, null, 2)}\n`,
  );
  return tmp;
}

function snapshot(dir) {
  return Object.fromEntries(loadDataFiles(dir).map((f) => [f.path, readFileSync(f.abs, "utf8")]));
}

function runCli(args, cwd) {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, DEEPL_API_KEY: "" },
  });
}

test("CLI --dry-run：报告缺失与预估字符，不写任何文件", () => {
  const tmp = makeTempRepo();
  try {
    const before = snapshot(tmp);
    const out = runCli(["--dry-run", "--root", tmp], tmp);
    assert.match(out, /缺失译文：en 0 · uk 1 · 共 1 处/);
    assert.match(out, /待机翻：1 条 · 预估 4 字符/);
    assert.match(out, /uk\s+补缺\s+data\/dishes\/d\.json#\/name/);
    assert.match(out, /未写任何文件/);
    assert.equal(existsSync(path.join(tmp, "data/translations.lock.json")), false, "dry-run 不得生成 lock");
    assert.deepEqual(snapshot(tmp), before, "dry-run 不得改数据文件");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("CLI 默认（无 key）：exit 0，只写 lock 的 human 采集，数据文件不变；--check 不写", () => {
  const tmp = makeTempRepo();
  try {
    const before = snapshot(tmp);
    const out = runCli(["--root", tmp], tmp);
    assert.match(out, /未设置 DEEPL_API_KEY/);
    const lockPath = path.join(tmp, "data/translations.lock.json");
    assert.equal(existsSync(lockPath), true);
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    // techniques 32 条 × (name + note) = 64，tomato name 1，dish name（有 en）1 → 66 条 human
    assert.equal(Object.keys(lock).length, 66);
    assert.ok(Object.values(lock).every((e) => e.status === "human" && /^[0-9a-f]{40}$/.test(e.source_hash) && e.updatedAt));
    assert.equal(lock["data/dishes/d.json#/name"].source_hash, sha1("番茄炒蛋"));
    assert.deepEqual(snapshot(tmp), before, "无 key 不得改数据文件");
    assert.ok(readFileSync(lockPath, "utf8").endsWith("}\n"), "lock 末尾换行");

    // 再跑一次：无变化
    assert.match(runCli(["--root", tmp], tmp), /无变化/);
    // --check：改 zh 触发 stale，但不写
    const dish = JSON.parse(readFileSync(path.join(tmp, "data/dishes/d.json"), "utf8"));
    dish.name.zh = "西红柿炒鸡蛋";
    writeFileSync(path.join(tmp, "data/dishes/d.json"), `${JSON.stringify(dish, null, 2)}\n`);
    const lockBefore = readFileSync(lockPath, "utf8");
    const checkOut = runCli(["--check", "--root", tmp], tmp);
    assert.match(checkOut, /stale\(human, zh 变化\) 1/);
    assert.match(checkOut, /未写任何文件/);
    assert.equal(readFileSync(lockPath, "utf8"), lockBefore, "--check 不得改 lock");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
