#!/usr/bin/env node
/**
 * ajv standalone 预编译（ADR-0007 §5「worker 内置 schemas/*.schema.json 的预编译产物」，
 * 契约 §8 第 6 行归 #19）。
 *
 * 为什么必须预编译：Cloudflare Workers 禁止 `eval` / `new Function`，而 ajv 默认模式正是用
 * `new Function` 把 schema 编译成校验函数 —— **ajv 不能在 worker 运行时使用**。这个脚本在构建期
 * 把 schemas/*.schema.json 编译成纯 JS 源码（ajv/dist/standalone），worker 只 import 产物。
 *
 * 用法：
 *   node scripts/gen-validators.mjs           生成 generated/validators.js + validators.d.ts
 *   node scripts/gen-validators.mjs --check    只校验：产物与当前 schemas/ 不一致就 exit 1
 *
 * 产物**不入库**（.gitignore，与 packages/web/public/data、icons PNG 同一处理方式）：
 * `npm run build` / `npm test` 都会先跑一遍生成器；CI 用 --check 抓「schema 改了但产物没重生成」。
 *
 * 两处后处理，都带断言，坏了会当场炸而不是悄悄产出坏代码：
 *   1) ajv 的 esm 产物里仍然会写 `require("ajv/dist/runtime/ucs2length")`（ajv 8.x 的已知缺口），
 *      ESM 里没有 require → 用下面 prelude 里的同名实现替换掉。
 *   2) format 的实现走 code.formats 钩子指向 prelude 里的 `formats`，产物因此**不依赖 ajv-formats**，
 *      运行时零依赖。date / uri 两个实现是本文件自写的，不复制第三方代码。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import addFormats from "ajv-formats";
import { _ } from "ajv";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(PKG_ROOT, "..", "..");
const SCHEMA_DIR = join(REPO_ROOT, "schemas");
const OUT_DIR = join(PKG_ROOT, "generated");
const OUT_JS = join(OUT_DIR, "validators.js");
const OUT_DTS = join(OUT_DIR, "validators.d.ts");

/** 导出名 → schemas/ 下的文件名。写入端点各一个；techniques.json 没有写入端点，不编译。 */
const ROOTS = {
  validateMenuPlan: "menu-plan.schema.json",
  validateIngredient: "ingredient.schema.json",
  validateDish: "dish.schema.json",
};

/** 产物顶部的运行时 prelude：ucs2length + 两个 format 实现，均为本仓库自写，零依赖。 */
const PRELUDE = `// ucs2length：JSON Schema 的 minLength/maxLength 按 Unicode 码点计，不按 UTF-16 码元计。
function ucs2length(str) {
  const len = str.length;
  let length = 0;
  let pos = 0;
  while (pos < len) {
    length++;
    const value = str.charCodeAt(pos++);
    if (value >= 0xd800 && value <= 0xdbff && pos < len) {
      const next = str.charCodeAt(pos);
      if (next >= 0xdc00 && next <= 0xdfff) pos++;
    }
  }
  return length;
}

// format: date —— RFC 3339 full-date，且必须是真实存在的日期（2026-02-30 不算）。
const DATE_RE = /^(\\d{4})-(\\d{2})-(\\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function isDateFormat(str) {
  const m = DATE_RE.exec(str);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= (leap ? 29 : DAYS_IN_MONTH[month - 1]);
}

// format: uri —— 绝对 URI（有 scheme、无空白字符）。dish.steps[].clip.videoUrl 与
// provenance.videoUrl 用它；只挡明显不是 URI 的输入，不做 RFC 3986 全量解析。
const URI_RE = /^[a-zA-Z][a-zA-Z0-9+\\-.]*:[^\\s]*$/;
function isUriFormat(str) {
  return URI_RE.test(str);
}

// ajv 生成的调用形状跟着**注册时**的定义走：ajv-formats 把 date 注册成 { validate, compare }
// （产物里是 formats0.validate(x)），把 uri 注册成裸函数（产物里是 formats6(x)）。所以这里给出
// 「既能当函数调用、又带 .validate」的两用对象，两种形状都接得住，也不会随 ajv-formats 版本漂移。
function asFormat(validate) {
  const f = (value) => validate(value);
  f.validate = validate;
  f.type = "string";
  return f;
}

const formats = { date: asFormat(isDateFormat), uri: asFormat(isUriFormat) };
`;

function readSchemas() {
  const files = readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".schema.json"))
    .sort();
  return files.map((file) => ({ file, text: readFileSync(join(SCHEMA_DIR, file), "utf8") }));
}

function schemaDigest(schemas) {
  const h = createHash("sha256");
  for (const { file, text } of schemas) h.update(file).update("|").update(text).update("|");
  return h.digest("hex");
}

function generate() {
  const schemas = readSchemas();
  const digest = schemaDigest(schemas);

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    // source: 产出源码；esm: 产出 ESM；lines: 换行（可读、也让 --check 的 diff 有意义）；
    // formats: 把 format 实现指向 prelude 里的 `formats`，产物因此不 require ajv-formats。
    code: { source: true, esm: true, lines: true, formats: _`formats` },
  });
  // 只为「让 ajv 知道这两个 format 存在」而注册；真正跑的是 prelude 里的实现。
  addFormats(ajv, ["date", "uri"]);

  for (const { file, text } of schemas) ajv.addSchema(JSON.parse(text), file);

  let code = standaloneCode(ajv, ROOTS);

  // 后处理 1：干掉 ajv esm 产物里残留的 require（ajv 8.x 只有 ucs2length 这一处）。
  const UCS2 = 'require("ajv/dist/runtime/ucs2length").default';
  if (code.includes(UCS2)) code = code.split(UCS2).join("ucs2length");

  // 后处理 2：断言。产物里再出现 require / eval / new Function 就说明 ajv 换了行为，
  // 与其产出一份在 Workers 上必然崩的文件，不如现在就红。
  const leftoverRequire = /require\(([^)]*)\)/.exec(code);
  if (leftoverRequire) {
    throw new Error(
      `ajv standalone 产物里还有未处理的 require: ${leftoverRequire[0]}\n` +
        "（ESM 里没有 require，Workers 上会直接崩）。请在 gen-validators.mjs 里补一条替换规则。",
    );
  }
  const banned = /\beval\s*\(|new\s+Function\s*\(/.exec(code);
  if (banned) {
    throw new Error(
      `ajv standalone 产物里出现了 ${banned[0]} —— Cloudflare Workers 禁止动态求值，产物不可用。`,
    );
  }
  for (const name of Object.keys(ROOTS)) {
    if (!code.includes(`export const ${name} =`)) {
      throw new Error(`ajv standalone 产物缺少导出 ${name}`);
    }
  }

  const header =
    "// @generated by packages/worker/scripts/gen-validators.mjs —— 不要手改，也不入库。\n" +
    "// 事实源：schemas/*.schema.json（draft 2020-12）。重新生成：pnpm -C packages/worker gen:validators\n" +
    `// schema-digest: ${digest}\n`;

  const js = `${header}\n${PRELUDE}\n${code}\n`;

  const dts = `${header}
/** ajv 的错误对象（只列 worker 用得到的字段，形状同 ajv 8.x ErrorObject）。 */
export interface ValidatorError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}

export interface CompiledValidator {
  (data: unknown): boolean;
  errors?: ValidatorError[] | null;
}

${Object.keys(ROOTS)
  .map((name) => `export declare const ${name}: CompiledValidator;`)
  .join("\n")}
`;

  return { js, dts, digest };
}

/**
 * 冒烟：真的把产物 import 进来跑一遍。
 * 光比对文本挡不住「产物语法合法但一调用就炸」这类错（例如 format 的调用形状对不上），
 * 而 worker 运行时不可能再编译一次，所以这一步必须在构建期做。
 */
async function smoke(file) {
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  const okPlan = {
    schemaVersion: "2",
    meals: [{ date: "2026-10-19", mealType: "lunch", dishRef: "tomato-egg-stir-fry", plannedServings: 1 }],
  };
  const cases = [
    ["validateMenuPlan", okPlan, true],
    ["validateMenuPlan", { ...okPlan, dateRange: { start: "2026-02-30", end: "2026-10-25" } }, false],
    ["validateMenuPlan", { ...okPlan, meals: [{ ...okPlan.meals[0], plannedServings: "1" }] }, false],
    ["validateIngredient", { schemaVersion: "2", name: { zh: "番茄" }, baseUnit: "g", trackStock: false }, true],
    ["validateIngredient", { schemaVersion: "2", name: {}, baseUnit: "g", trackStock: false }, false],
    ["validateDish", { name: { zh: "番茄炒蛋" } }, true],
    ["validateDish", { name: { zh: "x" }, steps: [{ text: { zh: "煮" }, clip: { videoUrl: "not a uri", start: 0, end: 1 } }] }, false],
  ];
  for (const [name, data, want] of cases) {
    const fn = mod[name];
    if (typeof fn !== "function") throw new Error(`产物缺少导出 ${name}`);
    const got = fn(data);
    if (got !== want) {
      throw new Error(
        `ajv standalone 产物冒烟失败：${name}(${JSON.stringify(data).slice(0, 80)}) => ${got}，期望 ${want}` +
          (fn.errors ? `\n  errors: ${JSON.stringify(fn.errors)}` : ""),
      );
    }
  }
}

async function main() {
  const check = process.argv.includes("--check");
  const { js, dts, digest } = generate();

  if (check) {
    const problems = [];
    for (const [file, want] of [
      [OUT_JS, js],
      [OUT_DTS, dts],
    ]) {
      if (!existsSync(file)) {
        problems.push(`缺少产物: ${file}`);
        continue;
      }
      if (readFileSync(file, "utf8") !== want) problems.push(`产物与当前 schemas/ 不一致: ${file}`);
    }
    if (problems.length > 0) {
      for (const p of problems) console.error(`FAIL  ${p}`);
      console.error("\n跑一次 `pnpm -C packages/worker gen:validators` 重新生成。");
      process.exit(1);
    }
    await smoke(OUT_JS);
    console.log(`OK  ajv standalone 产物与 schemas/ 一致且冒烟通过（schema-digest ${digest.slice(0, 12)}）`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_JS, js);
  writeFileSync(OUT_DTS, dts);
  await smoke(OUT_JS);
  console.log(
    `generated ${Object.keys(ROOTS).length} validators → packages/worker/generated/validators.js ` +
      `(${js.length} bytes, schema-digest ${digest.slice(0, 12)})`,
  );
}

await main();
