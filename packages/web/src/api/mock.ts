/**
 * 后台 API 的内存 mock（docs/specs/v03-admin-frontend-contract.md §6.5 的 8 条，逐条对应见文末）。
 *
 * **刷新页面即回初值。** 全部状态只在本模块的内存里（一个 Map + 几个变量）：不发任何网络请求、
 * 不 import 任何真实端点常量、不用 localStorage —— 别拿它造持久状态，那会误导联调。
 * 初值 = 内置 fixture：照 data/ 里的真实文件抄的 9 个食材 + 1 道 active 菜 + 全部 32 条技法 + week-41，
 * 外加 2 道后台建的草稿菜和 2 条「还没发布」的改动（其中一条就是 issue #25 举的例子：第 41 周 · 周三午 160 → 180），
 * 六屏一打开就有东西可看。
 *
 * 行为对齐 packages/worker（真实实现）；对不上的地方以 worker 为准，#27 接线时调用方零改动：
 *   - 写入：稳定序列化（键排序 + 2 空格 + 末尾换行）后与现有文件比 git blob sha，相同 → unchanged: true
 *     且不 bump commit（worker 契约 §3.1）；ifMatch 与当前 blobSha 不符 → 409 conflict（§3.2）；
 *     不带 ifMatch → warnings 含 "no-if-match"。
 *   - 校验：按 schemas/*.schema.json 手写的最小校验器（必填 / 类型 / 枚举 / 正则 / 上下限 / minItems /
 *     additionalProperties / format / anyOf / const）。code 逐字用 ajv keyword，path 是真正的 JSON Pointer
 *     （/meals/0/plannedServings，不是 /meals/0/servings），message 与 worker 的 validate.ts 同一套中文。
 *     required 的 path 是缺字段的那个对象（ajv 的 instancePath），message 形如「这项必须填：plannedServings」。
 *   - saveDishDraft 无条件写 status: "draft"（请求体带了别的值 → warnings 含 "status-forced"）；saveDish 不强制。
 *   - 悬空引用（dishRef / ingredientRef / techniqueRef 指向不存在的文件）与 pcs 食材设 yield：只警告不拒绝（D-10）。
 *   - 发布：publish() 之后 getPublish() 按脚本推进四步（每步默认 2 秒），success / failure / timeout / unmapped / slow 五种终局都能演；
 *     四步全绿后 onlineCommit 前移、未发布列表清空、发布记录多一条。
 *   - 回退：只回退 data/、不发布、产生一条新 commit（ADR-0007 §7）；回退后未发布计数变成非零。
 *
 * 错误注入 / 脚本控制：只读 `sessionStorage["canteenos.mock"]`（不走 URL），JSON 形如
 *   {
 *     "publishMode": "dispatch" | "push-trigger" | "off",          // 默认 dispatch；off → publish() 抛 503 dispatch_unavailable
 *     "publishOutcome": "success" | "failure" | "timeout" | "unmapped" | "slow",   // 默认 success
 *     "failStep": "validate" | "translate" | "build" | "deploy",   // outcome = failure 时停在哪一步，默认 build
 *     "runIdNull": true,                                           // publish() 返回 runId: null（worker 契约 D-17：还没认领到 run）
 *     "stepMs": 2000,                                              // 每步耗时（毫秒），默认 2000
 *     "latencyMs": 200,                                            // 每次调用的模拟延迟，默认 200
 *     "failNext": { "status": 409, "code": "conflict", "message": "有人刚改过，刷新后重试",
 *                   "errors"?: [{ "path": "/meals/0/plannedServings", "code": "minimum", "message": "不能小于 1" }],
 *                   "retryAfter"?: 30 }                            // 下一次**任何**调用抛这个错；抛完即从 sessionStorage 里删掉
 *   }
 * 在控制台粘：sessionStorage.setItem("canteenos.mock", JSON.stringify({ failNext: { status: 429, code: "rate_limited", message: "操作太频繁，等几分钟再试", retryAfter: 15 } }))
 */
import type { Dish, Ingredient, MenuPlan, Technique } from "@canteenos/core";

import type { AdminApi, WriteOpts } from "./client";
import type {
  Catalog,
  ChangeItem,
  Changes,
  FieldError,
  ImageRef,
  PublishProgress,
  PublishRecord,
  PublishResult,
  PublishStep,
  PublishStepKey,
  RollbackResult,
  Source,
  Translation,
  WriteResult,
} from "./types";
import { ApiError } from "./types";

// ---------------------------------------------------------------------------
// 脚本 / 错误注入（sessionStorage["canteenos.mock"]）
// ---------------------------------------------------------------------------

const MOCK_KEY = "canteenos.mock";

type PublishOutcome = "success" | "failure" | "timeout" | "unmapped" | "slow";

interface MockConfig {
  publishMode?: "dispatch" | "push-trigger" | "off";
  publishOutcome?: PublishOutcome;
  failStep?: PublishStepKey;
  runIdNull?: boolean;
  stepMs?: number;
  latencyMs?: number;
  failNext?: { status: number; code: string; message: string; errors?: FieldError[]; retryAfter?: number };
}

function readConfig(): MockConfig {
  try {
    const raw = sessionStorage.getItem(MOCK_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? (parsed as MockConfig) : {};
  } catch {
    return {};
  }
}

function writeConfig(cfg: MockConfig): void {
  try {
    if (Object.keys(cfg).length === 0) sessionStorage.removeItem(MOCK_KEY);
    else sessionStorage.setItem(MOCK_KEY, JSON.stringify(cfg));
  } catch {
    /* 隐私模式：注入的错误只能抛一次以上也无妨 */
  }
}

/** 每次调用开头：模拟延迟 + 消费 failNext */
async function enter(): Promise<void> {
  const cfg = readConfig();
  const latency = typeof cfg.latencyMs === "number" && cfg.latencyMs >= 0 ? cfg.latencyMs : 200;
  if (latency > 0) await new Promise((r) => setTimeout(r, latency));
  if (cfg.failNext) {
    const f = cfg.failNext;
    delete cfg.failNext;
    writeConfig(cfg);
    throw new ApiError(f.status, f.code, f.message, f.errors, f.retryAfter);
  }
}

// ---------------------------------------------------------------------------
// worker 同款：错误文案（http.ts）、稳定序列化（serialize.ts）、git blob sha（gitsha.ts）
// ---------------------------------------------------------------------------

const MESSAGES = {
  bad_id: "名称只能用小写字母、数字和短横线",
  bad_path: "这个位置不允许写入",
  bad_json: "数据没发全，重试一次",
  bad_image: "这张图片打不开，换一张再试",
  unauthorized: "链接失效了，找 Terry 要新的",
  forbidden: "你这条链接不能做这件事",
  not_found: "没找到这个版本",
  conflict: "有人刚改过，刷新后重试",
  too_large: "照片太大了，从后台页面正常上传",
  rate_limited: "操作太频繁，等几分钟再试",
  upstream_error: "GitHub 那边出问题了，先看看 PAT 是不是到期了",
  dispatch_unavailable: "发布功能暂时关着",
  not_configured: "这项功能还没配好，找 Terry",
} as const;

const STATUS: Record<keyof typeof MESSAGES, number> = {
  bad_id: 400,
  bad_path: 400,
  bad_json: 400,
  bad_image: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  rate_limited: 429,
  upstream_error: 502,
  dispatch_unavailable: 503,
  not_configured: 503,
};

function fail(code: keyof typeof MESSAGES, message?: string, path = ""): ApiError {
  const msg = message ?? MESSAGES[code];
  return new ApiError(STATUS[code], code, msg, [{ path, code, message: msg }]);
}

function validationFailure(errors: FieldError[]): ApiError {
  const first = errors[0] ?? { path: "", code: "type", message: "这一项填得不对" };
  return new ApiError(400, first.code, first.message, errors);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortKeysDeep(src[key]);
    return out;
  }
  return value;
}

function stableSerialize(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

/** 同步 SHA-1（mock 不能依赖 crypto.subtle：局域网 http 调试手机时它是 undefined） */
function sha1Hex(bytes: Uint8Array): string {
  const ml = bytes.length;
  const withPad = ((ml + 8) >> 6 << 4) + 16; // 32 位字数（含填充）
  const words = new Uint32Array(withPad);
  for (let i = 0; i < ml; i++) words[i >> 2] = (words[i >> 2] ?? 0) | ((bytes[i] ?? 0) << (24 - (i & 3) * 8));
  words[ml >> 2] = (words[ml >> 2] ?? 0) | (0x80 << (24 - (ml & 3) * 8));
  words[withPad - 1] = ml * 8;
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < withPad; off += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[off + t] ?? 0;
    for (let t = 16; t < 80; t++) {
      const x = (w[t - 3] ?? 0) ^ (w[t - 8] ?? 0) ^ (w[t - 14] ?? 0) ^ (w[t - 16] ?? 0);
      w[t] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t++) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + (w[t] ?? 0)) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((n) => n.toString(16).padStart(8, "0")).join("");
}

const encoder = new TextEncoder();

/** git blob sha = sha1("blob <len>\0" + bytes)，与 GitHub 返回的 sha / If-Match 凭据同一个值 */
function gitBlobSha(text: string): string {
  const body = encoder.encode(text);
  const header = encoder.encode(`blob ${body.length}\0`);
  const all = new Uint8Array(header.length + body.length);
  all.set(header, 0);
  all.set(body, header.length);
  return sha1Hex(all);
}

// ---------------------------------------------------------------------------
// 最小 schema 校验器（照 schemas/*.schema.json；错误形状照 worker 的 validate.ts）
// ---------------------------------------------------------------------------

type Schema =
  | {
      kind: "object";
      props: Record<string, Schema>;
      required?: readonly string[];
      /** I18nString 的 anyOf：zh / en / uk 至少一个 */
      atLeastOne?: boolean;
      /** 结构之外的条件（Quantity 的 if/then） */
      extra?: (obj: Record<string, unknown>, path: string, errs: FieldError[]) => void;
    }
  | { kind: "array"; items: Schema; minItems?: number }
  | { kind: "string"; minLength?: number; pattern?: RegExp; patternMessage?: string; enum?: readonly string[]; const?: string; format?: "date" | "uri" }
  | { kind: "number"; integer?: boolean; minimum?: number; exclusiveMinimum?: number; maximum?: number }
  | { kind: "boolean" };

const ID_RE = /^[a-z][a-z0-9-]*$/;
const SHA_RE = /^[0-9a-f]{7,40}$/;
const UNITS = ["g", "kg", "ml", "l", "pcs", "pack", "tbsp", "tsp", "pinch", "to-taste"] as const;
const MEAL_TYPE_LABELS: Record<string, string> = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" };
const TYPE_LABELS: Record<string, string> = {
  integer: "应为整数",
  number: "这里要填数字",
  string: "这里要填文字",
  boolean: "这里只能是「是」或「否」",
  array: "这里应该是一组内容",
  object: "这里应该是一组字段",
};
const ID_PATTERN_MESSAGE = "格式不对，只能用小写字母、数字和短横线";
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const URI_RE = /^[a-zA-Z][a-zA-Z0-9+\-.]*:[^\s]*$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = mo === 2 && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return d <= (leap ? 29 : (DAYS_IN_MONTH[mo - 1] ?? 31));
}

function ptr(path: string, key: string | number): string {
  return `${path}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

function err(path: string, code: string, message: string): FieldError {
  return { path, code, message };
}

function check(schema: Schema, value: unknown, path: string, errs: FieldError[]): void {
  switch (schema.kind) {
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        errs.push(err(path, "type", TYPE_LABELS.object ?? ""));
        return;
      }
      const obj = value as Record<string, unknown>;
      for (const key of schema.required ?? []) if (!(key in obj)) errs.push(err(path, "required", `这项必须填：${key}`));
      if (schema.atLeastOne && !Object.keys(schema.props).some((k) => k in obj)) errs.push(err(path, "anyOf", "中 / 英 / 乌至少填一个"));
      for (const [key, v] of Object.entries(obj)) {
        const sub = schema.props[key];
        if (!sub) errs.push(err(path, "additionalProperties", `有一项系统不认识，先删掉再存：${key}`));
        else check(sub, v, ptr(path, key), errs);
      }
      schema.extra?.(obj, path, errs);
      return;
    }
    case "array": {
      if (!Array.isArray(value)) {
        errs.push(err(path, "type", TYPE_LABELS.array ?? ""));
        return;
      }
      if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(err(path, "minItems", `至少要有 ${schema.minItems} 项`));
      value.forEach((item, i) => check(schema.items, item, ptr(path, i), errs));
      return;
    }
    case "string": {
      if (typeof value !== "string") {
        errs.push(err(path, "type", TYPE_LABELS.string ?? ""));
        return;
      }
      if (schema.const !== undefined && value !== schema.const) errs.push(err(path, "const", `这里只能是 ${JSON.stringify(schema.const)}`));
      if (schema.minLength !== undefined && [...value].length < schema.minLength) errs.push(err(path, "minLength", "这项不能是空的"));
      if (schema.enum && !schema.enum.includes(value)) {
        errs.push(err(path, "enum", `只能选：${schema.enum.map((v) => MEAL_TYPE_LABELS[v] ?? v).join(" / ")}`));
      }
      if (schema.pattern && !schema.pattern.test(value)) errs.push(err(path, "pattern", schema.patternMessage ?? ID_PATTERN_MESSAGE));
      if (schema.format === "date" && !isDate(value)) errs.push(err(path, "format", "日期格式应为 2026-10-19"));
      if (schema.format === "uri" && !URI_RE.test(value)) errs.push(err(path, "format", "这里要填一个网址"));
      return;
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errs.push(err(path, "type", (schema.integer ? TYPE_LABELS.integer : TYPE_LABELS.number) ?? ""));
        return;
      }
      if (schema.integer && !Number.isInteger(value)) {
        errs.push(err(path, "type", TYPE_LABELS.integer ?? ""));
        return;
      }
      if (schema.minimum !== undefined && value < schema.minimum) errs.push(err(path, "minimum", `不能小于 ${schema.minimum}`));
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errs.push(err(path, "exclusiveMinimum", `必须大于 ${schema.exclusiveMinimum}`));
      if (schema.maximum !== undefined && value > schema.maximum) errs.push(err(path, "maximum", `不能超过 ${schema.maximum}`));
      return;
    }
    case "boolean": {
      if (typeof value !== "boolean") errs.push(err(path, "type", TYPE_LABELS.boolean ?? ""));
      return;
    }
  }
}

const STR1: Schema = { kind: "string", minLength: 1 };
const ID: Schema = { kind: "string", pattern: ID_RE };
const UNIT: Schema = { kind: "string", enum: UNITS };
const I18N: Schema = { kind: "object", props: { zh: STR1, en: STR1, uk: STR1 }, atLeastOne: true };
const IMAGE: Schema = { kind: "object", props: { src: STR1, license: STR1, author: STR1, sourceUrl: STR1 }, required: ["src", "license"] };
const MONEY: Schema = {
  kind: "object",
  props: { amount: { kind: "number", minimum: 0 }, currency: { kind: "string", enum: ["CNY", "USD", "UAH", "EUR"] } },
  required: ["amount", "currency"],
};
const QUANTITY: Schema = {
  kind: "object",
  props: { value: { kind: "number", exclusiveMinimum: 0 }, unit: UNIT },
  required: ["unit"],
  // common.schema.json#/$defs/Quantity 的 if/then：unit ≠ to-taste 时 value 必填
  extra: (obj, path, errs) => {
    if (typeof obj.unit === "string" && obj.unit !== "to-taste" && (UNITS as readonly string[]).includes(obj.unit) && !("value" in obj)) {
      errs.push(err(path, "required", "这项必须填：value"));
    }
  },
};
const CONFIDENCE: Schema = {
  kind: "object",
  props: { value: { kind: "number", minimum: 0, maximum: 1 }, source: { kind: "string", enum: ["manual", "video", "llm-inference"] } },
  required: ["value", "source"],
};
const PURCHASE: Schema = {
  kind: "object",
  props: {
    supplier: STR1,
    packSize: { kind: "number", exclusiveMinimum: 0 },
    packUnit: UNIT,
    minPacks: { kind: "number", integer: true, minimum: 1 },
    lastPrice: MONEY,
  },
  required: ["supplier", "packSize", "packUnit"],
};
const INGREDIENT: Schema = {
  kind: "object",
  props: {
    schemaVersion: { kind: "string", const: "2" },
    name: I18N,
    image: IMAGE,
    externalId: { kind: "string", pattern: /^Q\d+$/ },
    baseUnit: UNIT,
    pcsToGram: { kind: "number", exclusiveMinimum: 0 },
    yield: { kind: "number", exclusiveMinimum: 0, maximum: 1 },
    role: { kind: "string", enum: ["main", "seasoning"] },
    purchase: PURCHASE,
    trackStock: { kind: "boolean" },
    onHand: { kind: "number", minimum: 0 },
  },
  required: ["schemaVersion", "name", "baseUnit", "trackStock"],
};
const PREP: Schema = {
  kind: "object",
  props: { techniqueRef: ID, size: STR1, timing: { kind: "string", enum: ["day-before", "morning", "before-service"] }, note: I18N, image: IMAGE },
  required: ["techniqueRef"],
};
const COMPONENT: Schema = { kind: "object", props: { ingredientRef: ID, qty: QUANTITY, prep: PREP, confidence: CONFIDENCE }, required: ["ingredientRef", "qty"] };
const CLIP: Schema = {
  kind: "object",
  props: { videoUrl: { kind: "string", format: "uri" }, start: { kind: "number", minimum: 0 }, end: { kind: "number", minimum: 0 } },
  required: ["videoUrl", "start", "end"],
};
const STEP: Schema = { kind: "object", props: { text: I18N, techniqueRef: ID, image: IMAGE, clip: CLIP }, required: ["text"] };
const PROVENANCE: Schema = {
  kind: "object",
  props: { source: { kind: "string", enum: ["manual", "video", "example"] }, videoUrl: { kind: "string", format: "uri" } },
  required: ["source"],
};
const DISH: Schema = {
  kind: "object",
  props: {
    schemaVersion: { kind: "string", const: "2" },
    name: I18N,
    description: I18N,
    image: IMAGE,
    baseServings: { kind: "number", integer: true, minimum: 1 },
    components: { kind: "array", minItems: 1, items: COMPONENT },
    steps: { kind: "array", minItems: 1, items: STEP },
    provenance: PROVENANCE,
    status: { kind: "string", enum: ["draft", "active", "archived"] },
  },
  required: ["name"],
};
const MEAL: Schema = {
  kind: "object",
  props: {
    date: { kind: "string", format: "date" },
    mealType: { kind: "string", enum: ["breakfast", "lunch", "dinner"] },
    dishRef: ID,
    plannedServings: { kind: "number", integer: true, minimum: 1 },
    serviceWindow: { kind: "string", pattern: /^\d{2}:\d{2}-\d{2}:\d{2}$/, patternMessage: "格式不对，例如 12:00-14:00" },
  },
  required: ["date", "mealType", "dishRef", "plannedServings"],
};
const PLAN: Schema = {
  kind: "object",
  props: {
    schemaVersion: { kind: "string", const: "2" },
    name: I18N,
    dateRange: { kind: "object", props: { start: { kind: "string", format: "date" }, end: { kind: "string", format: "date" } }, required: ["start", "end"] },
    margin: { kind: "number", exclusiveMinimum: 0 },
    meals: { kind: "array", minItems: 1, items: MEAL },
  },
  required: ["schemaVersion", "meals"],
};

function validate(schema: Schema, body: unknown): FieldError[] {
  const errs: FieldError[] = [];
  check(schema, body, "", errs);
  return errs;
}

// ---------------------------------------------------------------------------
// 内置 fixture（照 data/ 抄；技法只留 id / kind / name，note 省略）
// ---------------------------------------------------------------------------

const TECHNIQUES: Technique[] = [
  { id: "roll-cut-chunks", kind: "cut", name: { zh: "滚刀块", en: "Roll-cut chunks", uk: "Шматки рулонним нарізанням" } },
  { id: "fine-shreds", kind: "cut", name: { zh: "细丝", en: "Fine shreds (julienne)", uk: "Тонка соломка (жульєн)" } },
  { id: "coarse-shreds", kind: "cut", name: { zh: "粗丝", en: "Coarse shreds", uk: "Товста соломка" } },
  { id: "thin-slices", kind: "cut", name: { zh: "薄片", en: "Thin slices", uk: "Тонкі скибочки" } },
  { id: "thick-slices", kind: "cut", name: { zh: "厚片", en: "Thick slices", uk: "Товсті скибочки" } },
  { id: "small-cubes", kind: "cut", name: { zh: "丁", en: "Small cubes (dice)", uk: "Дрібні кубики" } },
  { id: "minced", kind: "cut", name: { zh: "末", en: "Minced", uk: "Дрібно рублене" } },
  { id: "strips", kind: "cut", name: { zh: "条", en: "Strips (batons)", uk: "Смужки" } },
  { id: "sections", kind: "cut", name: { zh: "段", en: "Sections", uk: "Сегменти" } },
  { id: "chunks", kind: "cut", name: { zh: "块", en: "Chunks", uk: "Шматки" } },
  { id: "scored", kind: "cut", name: { zh: "花刀", en: "Scored (decorative scoring)", uk: "Декоративне надрізання" } },
  { id: "oblique-slices", kind: "cut", name: { zh: "斜批", en: "Oblique slices", uk: "Косі скибочки" } },
  { id: "blanch", kind: "pretreat", name: { zh: "焯水", en: "Blanching", uk: "Бланшування" } },
  { id: "velvet", kind: "pretreat", name: { zh: "上浆", en: "Velveting", uk: "Вельветинг (осадження в крохмально-білковій суміші)" } },
  { id: "batter-coat", kind: "pretreat", name: { zh: "挂糊", en: "Batter coating", uk: "Обвалювання в клярі" } },
  { id: "starch-dust", kind: "pretreat", name: { zh: "拍粉", en: "Starch dusting", uk: "Припудрювання крохмалем" } },
  { id: "marinate", kind: "pretreat", name: { zh: "腌制", en: "Marinating", uk: "Маринування" } },
  { id: "starch-thicken", kind: "pretreat", name: { zh: "勾芡", en: "Starch thickening (slurry)", uk: "Загущення крохмальною рідиною" } },
  { id: "water-soak", kind: "pretreat", name: { zh: "水发", en: "Water rehydrating (dried goods)", uk: "Відмочування сушених продуктів" } },
  { id: "oil-pass", kind: "pretreat", name: { zh: "过油", en: "Oil passing (pre-frying)", uk: "Попереднє обсмажування в олії" } },
  { id: "pre-steam", kind: "pretreat", name: { zh: "预蒸", en: "Pre-steaming", uk: "Попереднє пропарювання" } },
  { id: "flash-fry", kind: "heat", name: { zh: "爆炒", en: "Flash-frying (high-heat stir-fry)", uk: "Швидке смаження на сильному вогні" } },
  { id: "stir-fry", kind: "heat", name: { zh: "炒", en: "Stir-frying", uk: "Смаження з постійним помішуванням" } },
  { id: "pan-fry", kind: "heat", name: { zh: "煎", en: "Pan-frying", uk: "Смаження на сковороді (невелика кількість олії)" } },
  { id: "deep-fry", kind: "heat", name: { zh: "炸", en: "Deep-frying", uk: "Фритюр" } },
  { id: "braise", kind: "heat", name: { zh: "烧", en: "Braising", uk: "Тушкування" } },
  { id: "braise-covered", kind: "heat", name: { zh: "焖", en: "Covered braising (steam stewing)", uk: "Томління під кришкою" } },
  { id: "stew", kind: "heat", name: { zh: "炖", en: "Stewing (gradual simmering)", uk: "Томління (повільне кип'ятіння)" } },
  { id: "boil", kind: "heat", name: { zh: "煮", en: "Boiling", uk: "Варіння" } },
  { id: "quick-boil", kind: "heat", name: { zh: "汆", en: "Quick boiling", uk: "Коротке кип'ятіння" } },
  { id: "steam", kind: "heat", name: { zh: "蒸", en: "Steaming", uk: "Пропарювання" } },
  { id: "roast", kind: "heat", name: { zh: "烤", en: "Roasting / baking", uk: "Запікання" } },
];

const INGREDIENTS: Record<string, Ingredient> = {
  "cooking-oil": {
    schemaVersion: "2",
    name: { zh: "食用油", en: "Cooking oil", uk: "Олія рослинна" },
    baseUnit: "ml",
    role: "seasoning",
    purchase: { supplier: "宏达粮油调味批发", packSize: 5, packUnit: "l", minPacks: 2, lastPrice: { amount: 68, currency: "CNY" } },
    trackStock: true,
    onHand: 1000,
  },
  egg: {
    schemaVersion: "2",
    name: { zh: "鸡蛋", en: "Chicken egg", uk: "Яйця курячі" },
    externalId: "Q15260613",
    baseUnit: "pcs",
    role: "main",
    pcsToGram: 55,
    purchase: { supplier: "绿源农产品配送", packSize: 180, packUnit: "pcs", minPacks: 1, lastPrice: { amount: 150, currency: "CNY" } },
    trackStock: false,
  },
  ketchup: { schemaVersion: "2", name: { zh: "番茄酱", en: "Ketchup", uk: "Томатний кетчуп" }, baseUnit: "g", role: "seasoning", trackStock: false },
  salt: {
    schemaVersion: "2",
    name: { zh: "食盐", en: "Salt", uk: "Сіль" },
    baseUnit: "g",
    role: "seasoning",
    purchase: { supplier: "宏达粮油调味批发", packSize: 500, packUnit: "g", minPacks: 20, lastPrice: { amount: 2.5, currency: "CNY" } },
    trackStock: true,
    onHand: 500,
  },
  scallion: {
    schemaVersion: "2",
    name: { zh: "小葱", en: "Scallion", uk: "Зелена цибуля" },
    baseUnit: "g",
    role: "main",
    yield: 0.8,
    purchase: { supplier: "绿源农产品配送", packSize: 1, packUnit: "kg", minPacks: 1, lastPrice: { amount: 12, currency: "CNY" } },
    trackStock: false,
  },
  starch: { schemaVersion: "2", name: { zh: "淀粉", en: "Starch", uk: "Крохмаль" }, baseUnit: "g", role: "seasoning", trackStock: false },
  sugar: { schemaVersion: "2", name: { zh: "白糖", en: "Sugar", uk: "Цукор" }, baseUnit: "g", role: "seasoning", trackStock: false },
  tomato: {
    schemaVersion: "2",
    name: { zh: "番茄", en: "Tomato", uk: "Помідор" },
    externalId: "Q23501",
    baseUnit: "g",
    role: "main",
    pcsToGram: 180,
    yield: 0.85,
    purchase: { supplier: "绿源农产品配送", packSize: 5, packUnit: "kg", minPacks: 2, lastPrice: { amount: 28.5, currency: "CNY" } },
    trackStock: false,
  },
  "white-vinegar": { schemaVersion: "2", name: { zh: "白醋", en: "White vinegar", uk: "Білий оцет" }, baseUnit: "g", role: "seasoning", trackStock: false },
};

const VIDEO = "https://www.bilibili.com/video/BV1example888";

const DISHES: Record<string, Dish> = {
  "tomato-egg-stir-fry": {
    schemaVersion: "2",
    name: { zh: "番茄炒蛋", en: "Tomato and egg stir-fry", uk: "Смажені яйця з томатами" },
    description: {
      zh: "家常快手菜：番茄炒出汁，包裹嫩滑鸡蛋，酸甜下饭。",
      en: "Home-style quick stir-fry: juicy tomatoes folded into soft scrambled eggs, sweet and tangy over rice.",
      uk: "Швидка домашня страва: соковиті томати з ніжною яєчнею, кисло-солодка, чудово до рису.",
    },
    baseServings: 50,
    components: [
      {
        ingredientRef: "tomato",
        qty: { value: 7500, unit: "g" },
        prep: {
          techniqueRef: "roll-cut-chunks",
          size: "3–4 cm",
          timing: "morning",
          note: { zh: "去皮口感更好", en: "Peeled for better texture", uk: "Очищені від шкірки для кращої текстури" },
        },
        confidence: { value: 0.96, source: "video" },
      },
      { ingredientRef: "egg", qty: { value: 75, unit: "pcs" }, confidence: { value: 0.98, source: "video" } },
      { ingredientRef: "salt", qty: { value: 75, unit: "g" }, confidence: { value: 0.8, source: "video" } },
      {
        ingredientRef: "scallion",
        qty: { value: 250, unit: "g" },
        prep: {
          techniqueRef: "minced",
          timing: "morning",
          note: { zh: "切葱花，出锅前撒", en: "Chopped as garnish, added before serving", uk: "Подрібнити для посипання перед подачею" },
        },
        confidence: { value: 0.72, source: "video" },
      },
      { ingredientRef: "cooking-oil", qty: { value: 500, unit: "ml" }, confidence: { value: 0.9, source: "video" } },
    ],
    steps: [
      {
        text: {
          zh: "番茄切滚刀块，鸡蛋加少许盐打散。",
          en: "Roll-cut tomatoes into chunks; beat eggs with a pinch of salt.",
          uk: "Наріжте томати рулонним способом; збийте яйця з дрібкою солі.",
        },
        techniqueRef: "roll-cut-chunks",
        clip: { videoUrl: VIDEO, start: 12, end: 55 },
      },
      {
        text: {
          zh: "热油下蛋液，凝固后盛出备用。",
          en: "Pour eggs into hot oil; remove once just set.",
          uk: "Вилийте яйця на розігріту олію; зніміть, щойно схопляться.",
        },
        techniqueRef: "stir-fry",
        clip: { videoUrl: VIDEO, start: 56, end: 92 },
      },
      {
        text: {
          zh: "下番茄炒出汁，回锅鸡蛋翻炒均匀，加盐调味，撒葱花出锅。",
          en: "Stir-fry tomatoes until juicy, return eggs to the wok, season with salt, garnish with scallions and serve.",
          uk: "Обсмажте томати до появи соку, поверніть яйця, посоліть, посипте зеленою цибулею і подавайте.",
        },
        techniqueRef: "stir-fry",
        clip: { videoUrl: VIDEO, start: 93, end: 160 },
      },
    ],
    provenance: { source: "video", videoUrl: VIDEO },
    status: "active",
  },
};

/** 后台建的两道草稿（mock 里的「未发布改动」之一；名字只有中文，en / uk 待机翻 —— 工作台「翻译待审」的来源） */
const DRAFT_DISHES: Record<string, Dish> = {
  "scallion-egg-pancake": {
    schemaVersion: "2",
    name: { zh: "葱花蛋饼" },
    baseServings: 50,
    components: [
      { ingredientRef: "egg", qty: { value: 60, unit: "pcs" } },
      { ingredientRef: "scallion", qty: { value: 300, unit: "g" }, prep: { techniqueRef: "minced", timing: "morning" } },
      { ingredientRef: "salt", qty: { unit: "to-taste" } },
      { ingredientRef: "cooking-oil", qty: { value: 400, unit: "ml" } },
    ],
    provenance: { source: "manual" },
    status: "draft",
  },
  "sweet-sour-tomato": {
    schemaVersion: "2",
    name: { zh: "糖醋番茄" },
    provenance: { source: "manual" },
    status: "draft",
  },
};

const PLAN_WEEK_41: MenuPlan = {
  schemaVersion: "2",
  name: { zh: "2026 年第 41 周菜单", en: "2026 Week 41 Menu", uk: "Меню на 41 тиждень 2026" },
  dateRange: { start: "2026-10-05", end: "2026-10-11" },
  margin: 1.1,
  meals: [
    { date: "2026-10-05", mealType: "lunch", dishRef: "tomato-egg-stir-fry", plannedServings: 200, serviceWindow: "12:00-14:00" },
    { date: "2026-10-07", mealType: "lunch", dishRef: "tomato-egg-stir-fry", plannedServings: 160, serviceWindow: "12:00-14:00" },
    { date: "2026-10-09", mealType: "dinner", dishRef: "tomato-egg-stir-fry", plannedServings: 120, serviceWindow: "18:00-20:00" },
  ],
};

// ---------------------------------------------------------------------------
// 内存仓库：文件 + commit 历史 + 线上版本
// ---------------------------------------------------------------------------

interface StoredFile {
  text: string;
  sha: string;
}

interface Commit {
  sha: string;
  at: string;
  subject: string;
  endpoint: string | null;
  /** 本次动过的文件 */
  files: string[];
  /** 这次 commit 之后的 data/ 快照（回退用） */
  snapshot: Map<string, StoredFile>;
}

type Kind = "plan" | "ingredient" | "dish";
const KIND_DIR: Record<Kind, string> = { plan: "menu-plans", ingredient: "ingredients", dish: "dishes" };

function entityPath(kind: Kind, id: string): string {
  return `data/${KIND_DIR[kind]}/${id}.json`;
}

let files = new Map<string, StoredFile>();
const commits: Commit[] = [];
let onlineCommit: string | null = null;
let lastPublishedAt: string | null = null;
const publishes: PublishRecord[] = [];
let catalogCache: Catalog | null = null;
let changesCache: Changes | null = null;

function head(): string {
  return commits[commits.length - 1]?.sha ?? "0".repeat(40);
}

function invalidate(): void {
  catalogCache = null;
  changesCache = null;
}

function putFile(path: string, text: string): StoredFile {
  const file = { text, sha: gitBlobSha(text) };
  files.set(path, file);
  return file;
}

function commit(subject: string, endpoint: string | null, changed: string[], at = new Date().toISOString()): Commit {
  const sha = sha1Hex(encoder.encode(`${head()}\n${subject}\n${at}\n${changed.join("\n")}`));
  const c: Commit = { sha, at, subject, endpoint, files: changed, snapshot: new Map(files) };
  commits.push(c);
  invalidate();
  return c;
}

function seed(): void {
  const now = Date.now();
  const iso = (msAgo: number): string => new Date(now - msAgo).toISOString();
  const DAY = 24 * 3600 * 1000;

  for (const [id, v] of Object.entries(INGREDIENTS)) putFile(entityPath("ingredient", id), stableSerialize(v));
  for (const [id, v] of Object.entries(DISHES)) putFile(entityPath("dish", id), stableSerialize(v));
  putFile(entityPath("plan", "week-41"), stableSerialize(PLAN_WEEK_41));
  const base = commit("data: 初始知识库（示例数据）", null, [...files.keys()], iso(3 * DAY));

  // 已发布：线上 = base
  onlineCommit = base.sha;
  lastPublishedAt = iso(3 * DAY - 6 * 60 * 1000);
  publishes.push({ sha: base.sha, at: lastPublishedAt, runId: 17_240_001, isOnline: true });

  // 还没发布的两条改动（issue #25 的例子：第 41 周 · 周三午 160 → 180）
  const plan = structuredClone(PLAN_WEEK_41);
  const wed = plan.meals[1];
  if (wed) wed.plannedServings = 180;
  putFile(entityPath("plan", "week-41"), stableSerialize(plan));
  commit("data(plan): 排 2026-10-05 那周（3 道菜）", "POST /plan/week-41", [entityPath("plan", "week-41")], iso(5 * 3600 * 1000));

  const draftPaths: string[] = [];
  for (const [id, v] of Object.entries(DRAFT_DISHES)) {
    putFile(entityPath("dish", id), stableSerialize(v));
    draftPaths.push(entityPath("dish", id));
  }
  commit("data(dish): 草稿 scallion-egg-pancake、sweet-sour-tomato", "POST /dish/scallion-egg-pancake/draft", draftPaths, iso(70 * 60 * 1000));
}

seed();

// ---------------------------------------------------------------------------
// 发布脚本
// ---------------------------------------------------------------------------

const STEP_KEYS: readonly PublishStepKey[] = ["validate", "translate", "build", "deploy"];
const STAGE_LABELS: Record<PublishStepKey, string> = { validate: "检查数据", translate: "补翻译", build: "生成三张单", deploy: "上线" };
/** 失败时 failureReason = 该步里第一个失败的 workflow 步骤名（原样，不翻译） */
const FAIL_REASON: Record<PublishStepKey, string> = {
  validate: "Validate data/**/*.json against schemas/*.schema.json",
  translate: "Machine-translate missing strings",
  build: "Gate — build-data --check --compare-snapshots",
  deploy: "Deploy to GitHub Pages",
};
const QUEUE_MS = 500;

interface Run {
  id: number;
  startedAt: number;
  outcome: PublishOutcome;
  failStep: PublishStepKey;
  stepMs: number;
  /** 发布时的 HEAD：四步全绿后它就是线上版本 */
  commitAtPublish: string;
  settled: boolean;
}

const runs = new Map<number, Run>();
let nextRunId = 17_240_002;

function progressOf(run: Run, now: number): PublishProgress {
  const S = run.startedAt + QUEUE_MS;
  const iso = (ms: number): string => new Date(ms).toISOString();
  // slow：「生成三张单」多花 3 倍时间；timeout：卡在这一步永远不结束
  const durations = STEP_KEYS.map((_k, i) =>
    i === 2 && run.outcome === "slow" ? 3 * run.stepMs : i === 2 && run.outcome === "timeout" ? Number.POSITIVE_INFINITY : run.stepMs,
  );
  const failIdx = run.outcome === "failure" ? STEP_KEYS.indexOf(run.failStep) : -1;
  let cursor = S;
  let failed = false;
  const steps: PublishStep[] = STEP_KEYS.map((key, i) => {
    const start = cursor;
    const end = cursor + (durations[i] ?? run.stepMs);
    cursor = end;
    let state: PublishStep["state"];
    if (failed) state = "skipped";
    else if (now < start) state = "pending";
    else if (now < end) state = "in_progress";
    else if (i === failIdx) {
      state = "failure";
      failed = true;
    } else state = "success";
    return {
      key,
      label: STAGE_LABELS[key],
      state,
      startedAt: state === "pending" || state === "skipped" ? null : iso(start),
      completedAt: state === "success" || state === "failure" ? iso(end) : null,
    };
  });

  let status: PublishProgress["status"];
  let failedStep: string | null = null;
  let failureReason: string | null = null;
  const unmappedSteps: string[] = [];
  if (now < S) status = "queued";
  else if (failed) {
    status = "failure";
    failedStep = run.failStep;
    failureReason = FAIL_REASON[run.failStep];
  } else if (run.outcome === "unmapped" && steps[0]?.state === "success") {
    // workflow 多了一个没映射的显式步骤：显示坏了，不是发布坏了（worker 契约 §4.3）
    status = "unmapped";
    unmappedSteps.push("Upload sheets artifact");
  } else if (run.outcome === "timeout" && now > S + 6 * run.stepMs) {
    // 压缩版的 worker 契约 §4.4「整体超过 20 分钟」：这里用 6 步的时长代替
    status = "timeout";
  } else if (steps.every((s) => s.state === "success")) status = "success";
  else status = "in_progress";

  const progress: PublishProgress = {
    runId: run.id,
    status,
    htmlUrl: `https://github.com/TERRYYYC/canteen-os/actions/runs/${run.id}`,
    steps,
    failedStep,
    failureReason,
    unmappedSteps,
  };
  // slow：单步进行中超过「平时」一步的时长 → slow: true（worker 契约 §4.4 的 10 分钟，这里压成 1 步）
  if (run.outcome === "slow" && steps[2]?.state === "in_progress" && now > S + 3 * run.stepMs) progress.slow = true;
  return progress;
}

/** 四步全绿 → 线上换版（只做一次） */
function settle(run: Run, progress: PublishProgress): void {
  if (run.settled || progress.status !== "success") return;
  run.settled = true;
  onlineCommit = run.commitAtPublish;
  lastPublishedAt = progress.steps[3]?.completedAt ?? new Date().toISOString();
  for (const p of publishes) p.isOnline = false;
  publishes.unshift({ sha: run.commitAtPublish, at: lastPublishedAt, runId: run.id, isOnline: true });
  changesCache = null;
}

function settleAll(now: number): void {
  for (const run of runs.values()) if (!run.settled) settle(run, progressOf(run, now));
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

function assertId(id: string): void {
  if (id.includes("/") || id.includes("\\") || id.includes("..") || id.includes("%") || id.includes(":")) throw fail("bad_path");
  if (!ID_RE.test(id)) throw fail("bad_id");
}

interface WriteParams {
  kind: Kind;
  id: string;
  schema: Schema;
  value: unknown;
  opts: WriteOpts | undefined;
  endpoint: string;
  subject: (exists: boolean, body: Record<string, unknown>) => string;
  /** 校验通过后、落盘前：加 warnings / 改 body（saveDishDraft 的 status 强制） */
  after?: (body: Record<string, unknown>, warnings: string[]) => void;
}

function writeEntity(p: WriteParams): WriteResult {
  assertId(p.id);
  // 与真实链路一致：先过一遍 JSON（去掉 undefined），再校验
  const body = JSON.parse(JSON.stringify(p.value ?? null)) as unknown;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw validationFailure([{ path: "", code: "type", message: "这里应该是一组字段" }]);
  }
  const errors = validate(p.schema, body);
  if (errors.length > 0) throw validationFailure(errors);

  const obj = body as Record<string, unknown>;
  const warnings: string[] = [];
  const ifMatch = p.opts?.ifMatch?.trim().replace(/^"|"$/g, "") ?? "";
  if (ifMatch === "") warnings.push("no-if-match");
  p.after?.(obj, warnings);

  const path = entityPath(p.kind, p.id);
  const current = files.get(path) ?? null;
  // 文件级冲突：立即 409，不重试（worker 契约 §3.2）
  if (ifMatch !== "" && current?.sha !== ifMatch) throw fail("conflict");

  const text = stableSerialize(obj);
  const sha = gitBlobSha(text);
  // 内容幂等：相同 → 不产生 commit（§3.1）
  if (current && current.sha === sha) return { commit: head(), blobSha: sha, unchanged: true, warnings };

  putFile(path, text);
  const c = commit(`${p.subject(current !== null, obj)} [skip ci]`, p.endpoint, [path]);
  return { commit: c.sha, blobSha: sha, unchanged: false, warnings };
}

function pushWarning(list: string[], w: string): void {
  if (!list.includes(w)) list.push(w);
}

function readSource<T>(kind: Kind, id: string): Source<T> | null {
  assertId(id);
  const file = files.get(entityPath(kind, id));
  if (!file) return null;
  return { content: JSON.parse(file.text) as T, blobSha: file.sha, commit: head() };
}

// ---------------------------------------------------------------------------
// AdminApi 实现
// ---------------------------------------------------------------------------

export function createMockApi(): AdminApi {
  return {
    async getCatalog(opts) {
      await enter();
      if (catalogCache && !opts?.force) return structuredClone(catalogCache);
      const dishes: Record<string, Dish> = {};
      const ingredients: Record<string, Ingredient> = {};
      const suppliers = new Set<string>();
      let machine = 0;
      for (const [path, file] of files) {
        const m = /^data\/(dishes|ingredients)\/([a-z][a-z0-9-]*)\.json$/.exec(path);
        if (!m) continue;
        const parsed = JSON.parse(file.text) as Dish | Ingredient;
        // 只有中文名的实体 = 发布时会被机翻 = 「翻译待审」
        const name = parsed.name as { zh?: string; en?: string; uk?: string } | undefined;
        if (name?.zh && (!name.en || !name.uk)) machine++;
        if (m[1] === "dishes") dishes[m[2] ?? ""] = parsed as Dish;
        else {
          const ing = parsed as Ingredient;
          ingredients[m[2] ?? ""] = ing;
          if (ing.purchase?.supplier) suppliers.add(ing.purchase.supplier);
        }
      }
      catalogCache = {
        commit: head(),
        dishes,
        ingredients,
        techniques: TECHNIQUES,
        suppliers: [...suppliers].sort(),
        translations: { machine, human: 80, stale: 0 },
      };
      return structuredClone(catalogCache);
    },

    async getChanges(opts) {
      await enter();
      settleAll(Date.now());
      if (changesCache && !opts?.force) return structuredClone(changesCache);
      const onlineIdx = commits.findIndex((c) => c.sha === onlineCommit);
      const unpublished: ChangeItem[] = commits
        .slice(onlineIdx + 1)
        // D-12：只算动过 data/ 的 commit（push-trigger 的空 commit 不算）
        .filter((c) => c.files.some((f) => f.startsWith("data/")))
        .map((c) => ({
          sha: c.sha,
          shortSha: c.sha.slice(0, 7),
          at: c.at,
          role: c.endpoint ? "chef" : null,
          endpoint: c.endpoint,
          subject: c.subject.replace(/\s*\[skip ci\]\s*$/, ""),
          files: c.files.filter((f) => f.startsWith("data/")),
        }))
        .reverse();
      changesCache = {
        onlineCommit,
        lastPublishedAt,
        unpublished,
        publishes: publishes.slice(0, 10).map((p) => ({ ...p })),
        truncated: false,
        warnings: [],
      };
      return structuredClone(changesCache);
    },

    async getPlan(planId) {
      await enter();
      return readSource<MenuPlan>("plan", planId);
    },
    async getIngredient(id) {
      await enter();
      return readSource<Ingredient>("ingredient", id);
    },
    async getDish(id) {
      await enter();
      return readSource<Dish>("dish", id);
    },

    async savePlan(planId, plan, opts) {
      await enter();
      return writeEntity({
        kind: "plan",
        id: planId,
        schema: PLAN,
        value: plan,
        opts,
        endpoint: `POST /plan/${planId}`,
        subject: (_exists, body) => {
          const meals = Array.isArray(body.meals) ? (body.meals as Array<{ date?: unknown }>) : [];
          const range = body.dateRange as { start?: unknown } | undefined;
          const start = typeof range?.start === "string" ? range.start : typeof meals[0]?.date === "string" ? meals[0].date : planId;
          return `data(plan): 排 ${start} 那周（${meals.length} 道菜）`;
        },
        after: (body, warnings) => {
          if (!/^week-\d{1,2}$/.test(planId)) pushWarning(warnings, "plan-id-shape");
          const meals = Array.isArray(body.meals) ? (body.meals as Array<{ dishRef?: unknown }>) : [];
          for (const m of meals) {
            if (typeof m.dishRef === "string" && !files.has(entityPath("dish", m.dishRef))) pushWarning(warnings, "dangling-ref");
          }
        },
      });
    },

    async saveIngredient(id, ingredient, opts) {
      await enter();
      return writeEntity({
        kind: "ingredient",
        id,
        schema: INGREDIENT,
        value: ingredient,
        opts,
        endpoint: `POST /ingredient/${id}`,
        subject: (exists) => `data(ingredient): ${exists ? "更新" : "新增"} ${id}`,
        after: (body, warnings) => {
          if (body.baseUnit === "pcs" && body.yield !== undefined) pushWarning(warnings, "yield-on-pcs");
        },
      });
    },

    async saveDishDraft(id, dish, opts) {
      await enter();
      return dishWrite(id, dish, opts, true);
    },

    async saveDish(id, dish, opts) {
      await enter();
      return dishWrite(id, dish, opts, false);
    },

    async translate(zh, targets) {
      await enter();
      if (typeof zh !== "string") throw validationFailure([{ path: "/text", code: "required", message: "这项必须填：text" }]);
      if (zh.trim().length === 0) throw validationFailure([{ path: "/text", code: "minLength", message: "这项不能是空的" }]);
      const wanted = (targets ?? ["en", "uk"]).filter((t) => t === "en" || t === "uk");
      if (wanted.length === 0) throw validationFailure([{ path: "/targets", code: "enum", message: "只能选：en / uk" }]);
      // §6.5 第 7 条：假译文必须可辨认，免得有人把 mock 输出当真译文提交
      const out: Translation = {};
      if (wanted.includes("en")) out.en = `EN·${zh}`;
      if (wanted.includes("uk")) out.uk = `UK·${zh}`;
      return out;
    },

    async uploadImage(kind, id, file, meta) {
      await enter();
      if (kind !== "ingredients" && kind !== "dishes") throw fail("bad_id", "只能传到 ingredients / dishes");
      assertId(id);
      if (file.size > 200 * 1024) throw fail("too_large");
      if (file.type && !/^image\/(jpeg|png|webp)$/.test(file.type)) throw fail("bad_image", "只认 jpg / png / webp，且要能读出尺寸");
      const license = typeof meta?.license === "string" ? meta.license.trim() : "";
      if (!license) throw validationFailure([{ path: "/license", code: "required", message: "这项必须填：license" }]);
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `data/${kind}/${id}/images/cover.${ext}`;
      // §6.5 第 8 条：不真的写盘 —— 仓库里记一条占位，src 用 blob: URL 给界面预览
      putFile(path, `<blob ${file.size} bytes>\n`);
      commit(`data(${kind}): 加图 ${id}/cover.${ext} [skip ci]`, `POST /image/${kind}/${id}`, [path]);
      const image: ImageRef = { src: URL.createObjectURL(file), license };
      if (meta.author) image.author = meta.author;
      if (meta.sourceUrl) image.sourceUrl = meta.sourceUrl;
      return image;
    },

    async publish() {
      await enter();
      const cfg = readConfig();
      const mode = cfg.publishMode ?? "dispatch";
      if (mode === "off") throw fail("dispatch_unavailable");
      const stepMs = typeof cfg.stepMs === "number" && cfg.stepMs > 0 ? cfg.stepMs : 2000;
      const run: Run = {
        id: nextRunId++,
        startedAt: Date.now(),
        outcome: cfg.publishOutcome ?? "success",
        failStep: cfg.failStep ?? "build",
        stepMs,
        commitAtPublish: head(),
        settled: false,
      };
      const result: PublishResult = { runId: cfg.runIdNull ? null : run.id, mode: mode === "push-trigger" ? "push-trigger" : "dispatch" };
      if (mode === "push-trigger") {
        // D1 降级：main 上多一条不带 [skip ci] 的空 commit（不动 data/，不计入未发布）
        const c = commit("chore(publish): 触发构建", "POST /publish", []);
        run.commitAtPublish = c.sha;
        result.commit = c.sha;
      }
      runs.set(run.id, run);
      return result;
    },

    async getPublish(runId) {
      await enter();
      const run = runs.get(runId);
      if (!run) throw fail("not_found");
      const progress = progressOf(run, Date.now());
      settle(run, progress);
      return progress;
    },

    async getPublishLatest() {
      await enter();
      let latest: Run | null = null;
      for (const run of runs.values()) if (!latest || run.id > latest.id) latest = run;
      if (!latest) throw fail("not_found");
      const progress = progressOf(latest, Date.now());
      settle(latest, progress);
      return progress;
    },

    async rollback(sha) {
      await enter();
      if (!SHA_RE.test(sha)) throw fail("bad_id", "版本号只能是 7–40 位的十六进制");
      const target = commits.find((c) => c.sha.startsWith(sha));
      if (!target) throw fail("not_found");
      const changed = new Set<string>();
      for (const [path, file] of files) if (target.snapshot.get(path)?.sha !== file.sha) changed.add(path);
      for (const path of target.snapshot.keys()) if (!files.has(path)) changed.add(path);
      const result: RollbackResult = { commit: head(), restoredFrom: target.sha, changedFiles: changed.size };
      if (changed.size === 0) return result;
      files = new Map(target.snapshot);
      const c = commit(`revert(data): 恢复到 ${target.sha.slice(0, 7)} [skip ci]`, `POST /rollback/${target.sha.slice(0, 7)}`, [...changed]);
      result.commit = c.sha;
      return result;
    },
  };
}

function dishWrite(id: string, dish: Dish, opts: WriteOpts | undefined, forceDraft: boolean): WriteResult {
  return writeEntity({
    kind: "dish",
    id,
    schema: DISH,
    value: dish,
    opts,
    endpoint: forceDraft ? `POST /dish/${id}/draft` : `POST /dish/${id}`,
    subject: (exists) => (forceDraft ? `data(dish): 草稿 ${id}` : `data(dish): ${exists ? "更新" : "新增"} ${id}`),
    after: (body, warnings) => {
      if (forceDraft) {
        // worker 契约 §1.3：请求体带了别的值也覆盖成 draft，并在 warnings 里说明
        if (typeof body.status === "string" && body.status !== "draft") pushWarning(warnings, "status-forced");
        body.status = "draft";
      }
      const components = Array.isArray(body.components) ? (body.components as Array<{ ingredientRef?: unknown; prep?: { techniqueRef?: unknown } }>) : [];
      const steps = Array.isArray(body.steps) ? (body.steps as Array<{ techniqueRef?: unknown }>) : [];
      const known = new Set(TECHNIQUES.map((t) => t.id));
      for (const c of components) {
        if (typeof c.ingredientRef === "string" && !files.has(entityPath("ingredient", c.ingredientRef))) pushWarning(warnings, "dangling-ref");
        if (typeof c.prep?.techniqueRef === "string" && !known.has(c.prep.techniqueRef)) pushWarning(warnings, "dangling-ref");
      }
      for (const s of steps) if (typeof s.techniqueRef === "string" && !known.has(s.techniqueRef)) pushWarning(warnings, "dangling-ref");
    },
  });
}

/*
 * §6.5 对照
 *   1. 不发网络请求、不 import 端点常量：本文件没有 fetch / XMLHttpRequest / URL 常量；只 import 类型与 ApiError。
 *   2. 只用内存：files / commits / publishes / runs 全是模块级变量，刷新即回 seed()；没有 localStorage。
 *   3. 写入像真的：writeEntity —— 内容幂等（blob sha 相同 → unchanged: true，不 bump commit）、
 *      ifMatch 不符 → 409 conflict、saveDishDraft 强制 draft + "status-forced"、不带 ifMatch → "no-if-match"。
 *   4. 校验真跑：check() —— required / type / enum / pattern / minimum / exclusiveMinimum / maximum / minItems /
 *      minLength / additionalProperties / const / format / anyOf，path 是 JSON Pointer（/meals/0/plannedServings）。
 *   5. 发布演全：progressOf() 按 publishOutcome 演 success / failure（停在 failStep）/ timeout / unmapped / slow；
 *      每步 stepMs（默认 2 秒）；四步全绿后 settle() 换线上版本。
 *   6. 错误注入不走 URL：readConfig() 只读 sessionStorage["canteenos.mock"]；failNext 抛一次即删。
 *   7. 假译文可辨认：translate() 返回 "EN·…" / "UK·…"。
 *   8. 传图不写盘：uploadImage() 返回 blob: URL，仓库里只记一条占位。
 */
