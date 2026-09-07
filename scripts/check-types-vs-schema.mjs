#!/usr/bin/env node
/**
 * CanteenOS types ↔ schema 一致性检查（CI 入口，issue #2）。
 *   node scripts/check-types-vs-schema.mjs               # 检查本仓库
 *   node scripts/check-types-vs-schema.mjs --root <dir>  # 指定仓库根目录（测试用；默认为脚本所在仓库）
 *
 * 背景：schemas/*.schema.json 是单一事实源，packages/core/src/types.ts 是手写投影；两处维护必然漂移。
 * 做法：用 TypeScript compiler API（packages/core 的 devDependency，零新增依赖）解析 types.ts，
 *       按下方 MAPPING 表逐项与 schema 比对。比对种类由 schema 节点自动判定：
 *   object     properties 键集合 ↔ interface 成员名；required 集合 ↔ 非可选成员集合；
 *              带 const 的属性（schemaVersion）↔ 字面量类型
 *   enum       enum 值集合 ↔ 字符串字面量联合
 *   alias      $defs 里的纯 $ref（Image → ImageRef）↔ type 别名指向同一个 TS 类型
 *   primitive  $defs 里的标量定义（Id: string）↔ type X = string
 * 覆盖性（两边封闭，保证"schema 改字段名而 types 未同步 → CI 必红"）：
 *   - schema 里每个 object / enum 节点、以及 $defs 的每个直接子项，都必须在 MAPPING 登记；
 *   - types.ts 里每个顶层 interface / type 声明，都必须是 MAPPING 的目标。
 * 不比对：标量类型（string/number/boolean）、数值约束、format/pattern、null 联合、
 *        applicator 内的条件（allOf/anyOf/oneOf/if/then 不遍历，如 Quantity 的 to-taste 条件必填）。
 * 输出：逐项 OK / MISMATCH / ERROR / UNMAPPED；任一非 OK → exit 1。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA_DIR = "schemas";
export const TYPES_FILE = "packages/core/src/types.ts";

/**
 * 映射表：schema 定义（文件#JSON pointer）→ types.ts 里的类型。
 *   ts = `Name`        顶层 interface / type 别名
 *   ts = `Name.member` 某成员的内联类型（对象字面量类型，或字符串字面量联合）
 * 新增 schema 定义（含嵌套对象、枚举）必须在此登记，否则脚本报 UNMAPPED 并退出 1。
 */
export const MAPPING = [
  // ---- common.schema.json ----
  { schema: "common.schema.json#/$defs/Id", ts: "Id" },
  { schema: "common.schema.json#/$defs/I18nString", ts: "I18nString" },
  { schema: "common.schema.json#/$defs/Unit", ts: "Unit" },
  { schema: "common.schema.json#/$defs/Quantity", ts: "Quantity" },
  { schema: "common.schema.json#/$defs/Currency", ts: "Currency" },
  { schema: "common.schema.json#/$defs/Money", ts: "Money" },
  { schema: "common.schema.json#/$defs/Confidence", ts: "Confidence" },
  { schema: "common.schema.json#/$defs/Confidence/properties/source", ts: "ConfidenceSource" },
  { schema: "common.schema.json#/$defs/ImageRef", ts: "ImageRef" },
  { schema: "common.schema.json#/$defs/Image", ts: "Image" },
  { schema: "common.schema.json#/$defs/MealType", ts: "MealType" },
  // ---- ingredient.schema.json ----
  { schema: "ingredient.schema.json#", ts: "Ingredient" },
  { schema: "ingredient.schema.json#/properties/role", ts: "Ingredient.role" },
  { schema: "ingredient.schema.json#/properties/purchase", ts: "PurchaseSpec" },
  // ---- techniques.schema.json（整个文件是数组，条目在 #/items）----
  { schema: "techniques.schema.json#/items", ts: "Technique" },
  { schema: "techniques.schema.json#/items/properties/kind", ts: "TechniqueKind" },
  // ---- dish.schema.json ----
  { schema: "dish.schema.json#", ts: "Dish" },
  { schema: "dish.schema.json#/properties/components/items", ts: "DishComponent" },
  { schema: "dish.schema.json#/properties/components/items/properties/prep", ts: "DishPrep" },
  { schema: "dish.schema.json#/properties/components/items/properties/prep/properties/timing", ts: "PrepTiming" },
  { schema: "dish.schema.json#/properties/steps/items", ts: "DishStep" },
  { schema: "dish.schema.json#/properties/steps/items/properties/clip", ts: "DishStep.clip" },
  { schema: "dish.schema.json#/properties/provenance", ts: "DishProvenance" },
  { schema: "dish.schema.json#/properties/provenance/properties/source", ts: "ProvenanceSource" },
  { schema: "dish.schema.json#/properties/status", ts: "DishStatus" },
  // ---- menu-plan.schema.json ----
  { schema: "menu-plan.schema.json#", ts: "MenuPlan" },
  { schema: "menu-plan.schema.json#/properties/dateRange", ts: "DateRange" },
  { schema: "menu-plan.schema.json#/properties/meals/items", ts: "MenuPlanMeal" },
  // ---- purchase-order.schema.json ----
  { schema: "purchase-order.schema.json#", ts: "PurchaseOrder" },
  { schema: "purchase-order.schema.json#/properties/lines/items", ts: "PurchaseOrderLine" },
  { schema: "purchase-order.schema.json#/properties/lines/items/properties/trace", ts: "LineTrace" },
  { schema: "purchase-order.schema.json#/properties/lines/items/properties/trace/properties/meals/items", ts: "TraceMeal" },
];

// ---------------------------------------------------------------------------
// typescript 模块加载（devDependency 在 packages/core；--root 指向的临时目录通常没有 node_modules，
// 所以先从脚本所在仓库解析，再退回 --root）
// ---------------------------------------------------------------------------

export async function loadTypeScript(root) {
  const bases = [...new Set([path.join(SCRIPT_ROOT, "packages/core"), path.join(root, "packages/core"), SCRIPT_ROOT, root])];
  const tried = [];
  for (const base of bases) {
    try {
      const resolved = createRequire(path.join(base, "package.json")).resolve("typescript");
      const mod = await import(pathToFileURL(resolved).href);
      return mod.default ?? mod;
    } catch (err) {
      tried.push(`${base}: ${err && err.code ? err.code : err}`);
    }
  }
  throw new Error(
    `找不到 typescript 模块（脚本用它解析 types.ts）。已尝试从以下目录解析：\n  ${tried.join("\n  ")}\n` +
      "请先安装 packages/core 的 devDependencies：pnpm install --dir packages/core（或 npm --prefix packages/core install）",
  );
}

// ---------------------------------------------------------------------------
// schema 侧
// ---------------------------------------------------------------------------

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const escPtr = (s) => s.replace(/~/g, "~0").replace(/\//g, "~1");
const unescPtr = (s) => s.replace(/~1/g, "/").replace(/~0/g, "~");

export function loadSchemas(root) {
  const dir = path.join(root, SCHEMA_DIR);
  if (!existsSync(dir)) throw new Error(`schema 目录不存在：${dir}`);
  const schemas = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".schema.json")).sort()) {
    schemas.set(file, JSON.parse(readFileSync(path.join(dir, file), "utf8")));
  }
  if (schemas.size === 0) throw new Error(`${dir} 下没有 *.schema.json`);
  return schemas;
}

/** `file#/a/b` → { file, pointer: "#/a/b" } */
function splitRef(ref) {
  const i = ref.indexOf("#");
  if (i < 0) throw new Error(`引用缺少 #：${ref}`);
  return { file: ref.slice(0, i), pointer: ref.slice(i) };
}

function resolvePointer(doc, pointer) {
  if (!pointer.startsWith("#")) throw new Error(`pointer 必须以 # 开头：${pointer}`);
  const parts = pointer.slice(1).split("/").slice(1).map(unescPtr);
  let cur = doc;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object" || !hasOwn(cur, p)) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function resolveSchemaRef(schemas, ref) {
  const { file, pointer } = splitRef(ref);
  const doc = schemas.get(file);
  if (!doc) return undefined;
  return resolvePointer(doc, pointer);
}

/** 规范化 $ref：同文件 `#/...` 补上文件名；跨文件 `x.schema.json#/...` 原样 */
function normalizeRef(fromFile, ref) {
  return ref.startsWith("#") ? `${fromFile}${ref}` : ref;
}

export function classifySchemaNode(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  if (hasOwn(node, "properties")) return "object";
  if (hasOwn(node, "enum")) return "enum";
  if (hasOwn(node, "$ref")) return "alias";
  if (["string", "number", "integer", "boolean"].includes(node.type)) return "primitive";
  return null;
}

/**
 * 收集"必须映射"的 schema 定义：object / enum 节点，以及 $defs 的直接子项。
 * 只沿 $defs / properties / items 结构性下钻，不进 allOf/anyOf/oneOf/if/then（那些是约束，不是定义）。
 */
export function collectSchemaDefinitions(schemas) {
  const out = [];
  const visit = (file, node, pointer) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const isDefsChild = /^#\/\$defs\/[^/]+$/.test(pointer);
    if (isDefsChild || hasOwn(node, "properties") || hasOwn(node, "enum")) out.push(`${file}${pointer}`);
    if (node.$defs && typeof node.$defs === "object") {
      for (const [k, v] of Object.entries(node.$defs)) visit(file, v, `${pointer}/$defs/${escPtr(k)}`);
    }
    if (node.properties && typeof node.properties === "object") {
      for (const [k, v] of Object.entries(node.properties)) visit(file, v, `${pointer}/properties/${escPtr(k)}`);
    }
    if (node.items && typeof node.items === "object" && !Array.isArray(node.items)) visit(file, node.items, `${pointer}/items`);
  };
  for (const [file, doc] of schemas) visit(file, doc, "#");
  return out;
}

// ---------------------------------------------------------------------------
// types.ts 侧（TypeScript compiler API，只看语法树，不做类型检查）
// ---------------------------------------------------------------------------

export function parseTypes(ts, text, fileName = TYPES_FILE) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const decls = new Map();
  for (const st of sf.statements) {
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) {
      if (decls.has(st.name.text)) throw new Error(`types.ts 重复声明：${st.name.text}`);
      decls.set(st.name.text, st);
    }
  }
  return decls;
}

function entityName(ts, n) {
  if (ts.isIdentifier(n)) return n.text;
  if (ts.isQualifiedName(n)) return `${entityName(ts, n.left)}.${n.right.text}`;
  if (ts.isPropertyAccessExpression(n)) return `${entityName(ts, n.expression)}.${n.name.text}`;
  throw new Error(`无法读取名称（${ts.SyntaxKind[n.kind]}）`);
}

/** interface / 对象字面量类型 → Map<成员名, { optional, type }>（interface 的 extends 在同文件内展开） */
function objectMembers(ts, decls, node, label) {
  if (ts.isTypeAliasDeclaration(node)) node = node.type;
  const members = new Map();
  const add = (m) => {
    if (!ts.isPropertySignature(m)) throw new Error(`${label}: 只支持属性成员，遇到 ${ts.SyntaxKind[m.kind]}`);
    if (!(ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) throw new Error(`${label}: 不支持计算属性名`);
    members.set(m.name.text, { optional: Boolean(m.questionToken), type: m.type });
  };
  if (ts.isInterfaceDeclaration(node)) {
    for (const h of node.heritageClauses ?? []) {
      for (const t of h.types) {
        const baseName = entityName(ts, t.expression);
        const base = decls.get(baseName);
        if (!base) throw new Error(`${label}: extends ${baseName} 无法在 types.ts 内解析`);
        for (const [k, v] of objectMembers(ts, decls, base, baseName)) members.set(k, v);
      }
    }
    node.members.forEach(add);
    return members;
  }
  if (ts.isTypeLiteralNode(node)) {
    node.members.forEach(add);
    return members;
  }
  throw new Error(`${label}: 不是对象类型（interface / 对象字面量类型），无法与 schema object 比对`);
}

/** `Name` → 声明节点；`Name.member[.member]` → 该成员的类型节点 */
export function resolveTsPath(ts, decls, tsPath) {
  const [head, ...rest] = tsPath.split(".");
  let node = decls.get(head);
  if (!node) throw new Error(`types.ts 里没有顶层声明 ${head}`);
  let label = head;
  for (const seg of rest) {
    const m = objectMembers(ts, decls, node, label).get(seg);
    if (!m) throw new Error(`${label} 没有成员 ${seg}`);
    if (!m.type) throw new Error(`${label}.${seg} 没有类型标注`);
    node = m.type;
    label += `.${seg}`;
  }
  return node;
}

const unwrapAlias = (ts, node) => (ts.isTypeAliasDeclaration(node) ? node.type : node);

function literalValues(ts, node, label) {
  const typeNode = unwrapAlias(ts, node);
  const parts = ts.isUnionTypeNode(typeNode) ? typeNode.types : [typeNode];
  return parts.map((t) => {
    if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) return t.literal.text;
    throw new Error(`${label}: 不是字符串字面量联合（遇到 ${ts.SyntaxKind[t.kind]}）`);
  });
}

function singleLiteral(ts, typeNode) {
  if (!typeNode || !ts.isLiteralTypeNode(typeNode)) return null;
  const l = typeNode.literal;
  if (ts.isStringLiteral(l)) return { value: l.text };
  if (ts.isNumericLiteral(l)) return { value: Number(l.text) };
  if (l.kind === ts.SyntaxKind.TrueKeyword) return { value: true };
  if (l.kind === ts.SyntaxKind.FalseKeyword) return { value: false };
  return null;
}

// ---------------------------------------------------------------------------
// 比对
// ---------------------------------------------------------------------------

const setDiff = (a, b) => a.filter((x) => !b.includes(x));

function compareObject(ts, schemaNode, members) {
  const props = schemaNode.properties;
  const schemaKeys = Object.keys(props);
  const required = Array.isArray(schemaNode.required) ? schemaNode.required : [];
  const tsKeys = [...members.keys()];
  const problems = [];

  const missingInTs = schemaKeys.filter((k) => !members.has(k));
  const extraInTs = tsKeys.filter((k) => !hasOwn(props, k));
  if (missingInTs.length) problems.push(`schema 有而 types 没有: ${missingInTs.join(", ")}`);
  if (extraInTs.length) problems.push(`types 有而 schema 没有: ${extraInTs.join(", ")}`);
  const danglingRequired = required.filter((k) => !hasOwn(props, k));
  if (danglingRequired.length) problems.push(`schema 自身不一致 · required 里有但 properties 没有: ${danglingRequired.join(", ")}`);

  const common = schemaKeys.filter((k) => members.has(k));
  const schemaReqTsOpt = common.filter((k) => required.includes(k) && members.get(k).optional);
  const tsReqSchemaOpt = common.filter((k) => !required.includes(k) && !members.get(k).optional);
  if (schemaReqTsOpt.length) problems.push(`必填不一致 · schema 必填但 types 可选: ${schemaReqTsOpt.join(", ")}`);
  if (tsReqSchemaOpt.length) problems.push(`必填不一致 · types 必填但 schema 可选: ${tsReqSchemaOpt.join(", ")}`);

  for (const k of common) {
    const ps = props[k];
    const lit = singleLiteral(ts, members.get(k).type);
    if (ps && typeof ps === "object" && hasOwn(ps, "const")) {
      if (!lit || lit.value !== ps.const) {
        problems.push(`const 不一致 · ${k}: schema const ${JSON.stringify(ps.const)}，types ${lit ? JSON.stringify(lit.value) : "不是字面量类型"}`);
      }
    } else if (lit && !(ps && typeof ps === "object" && hasOwn(ps, "enum"))) {
      problems.push(`const 不一致 · ${k}: types 是字面量 ${JSON.stringify(lit.value)}，schema 无 const`);
    }
  }
  return { problems, note: `${schemaKeys.length} 属性 · ${required.length} 必填` };
}

function compareEnum(ts, schemaNode, tsNode, label) {
  const problems = [];
  const schemaVals = schemaNode.enum;
  const nonString = schemaVals.filter((v) => typeof v !== "string");
  if (nonString.length) {
    problems.push(`schema enum 含非字符串值，不支持: ${nonString.map((v) => JSON.stringify(v)).join(", ")}`);
    return { problems, note: `${schemaVals.length} 值` };
  }
  const tsVals = literalValues(ts, tsNode, label);
  const missingInTs = setDiff(schemaVals, tsVals);
  const extraInTs = setDiff(tsVals, schemaVals);
  if (missingInTs.length) problems.push(`schema 有而 types 没有: ${missingInTs.join(", ")}`);
  if (extraInTs.length) problems.push(`types 有而 schema 没有: ${extraInTs.join(", ")}`);
  return { problems, note: `${schemaVals.length} 值` };
}

function compareAlias(ts, schemas, entry, schemaNode, tsNode, mappingBySchema) {
  const problems = [];
  const target = normalizeRef(splitRef(entry.schema).file, schemaNode.$ref);
  if (resolveSchemaRef(schemas, target) === undefined) problems.push(`$ref 目标不存在: ${target}`);
  const expected = mappingBySchema.get(target);
  if (!expected) problems.push(`$ref 目标 ${target} 未在 MAPPING 登记，无法确定应指向的 TS 类型`);
  const typeNode = unwrapAlias(ts, tsNode);
  if (!ts.isTypeReferenceNode(typeNode)) {
    problems.push(`types 不是类型别名引用（遇到 ${ts.SyntaxKind[typeNode.kind]}）`);
  } else if (expected) {
    const actual = entityName(ts, typeNode.typeName);
    if (actual !== expected.ts) problems.push(`别名指向不一致 · schema → ${target}（= ${expected.ts}），types → ${actual}`);
  }
  return { problems, note: `→ ${target}` };
}

function comparePrimitive(ts, schemaNode, tsNode) {
  const want = { string: ts.SyntaxKind.StringKeyword, number: ts.SyntaxKind.NumberKeyword, integer: ts.SyntaxKind.NumberKeyword, boolean: ts.SyntaxKind.BooleanKeyword }[schemaNode.type];
  const typeNode = unwrapAlias(ts, tsNode);
  const problems = [];
  if (typeNode.kind !== want) problems.push(`schema type ${schemaNode.type}，types 是 ${ts.SyntaxKind[typeNode.kind]}`);
  return { problems, note: schemaNode.type };
}

/**
 * 主逻辑。返回 { ok, results, counts }；results 每项 { schema, ts, kind, status, note, problems }。
 * status ∈ OK | MISMATCH | ERROR（定义或类型缺失/无法解析）| UNMAPPED（覆盖性失败）。
 */
export function check({ root, ts, mapping = MAPPING }) {
  const schemas = loadSchemas(root);
  const typesPath = path.join(root, TYPES_FILE);
  if (!existsSync(typesPath)) throw new Error(`types 文件不存在：${typesPath}`);
  const decls = parseTypes(ts, readFileSync(typesPath, "utf8"), typesPath);
  const mappingBySchema = new Map(mapping.map((e) => [e.schema, e]));
  const results = [];

  for (const entry of mapping) {
    const r = { schema: entry.schema, ts: entry.ts, kind: "?", status: "OK", note: "", problems: [] };
    results.push(r);
    const schemaNode = resolveSchemaRef(schemas, entry.schema);
    if (schemaNode === undefined) {
      r.status = "ERROR";
      r.problems.push("schema 定义不存在（被删除或改名？MAPPING 需同步）");
      continue;
    }
    const kind = classifySchemaNode(schemaNode);
    if (!kind) {
      r.status = "ERROR";
      r.problems.push("schema 节点既无 properties / enum / $ref，也不是标量，无法比对");
      continue;
    }
    r.kind = kind;
    let tsNode;
    try {
      tsNode = resolveTsPath(ts, decls, entry.ts);
      const cmp =
        kind === "object"
          ? compareObject(ts, schemaNode, objectMembers(ts, decls, tsNode, entry.ts))
          : kind === "enum"
            ? compareEnum(ts, schemaNode, tsNode, entry.ts)
            : kind === "alias"
              ? compareAlias(ts, schemas, entry, schemaNode, tsNode, mappingBySchema)
              : comparePrimitive(ts, schemaNode, tsNode);
      r.note = cmp.note;
      if (cmp.problems.length) {
        r.status = "MISMATCH";
        r.problems = cmp.problems;
      }
    } catch (err) {
      r.status = "ERROR";
      r.problems.push(err && err.message ? err.message : String(err));
    }
  }

  // 覆盖性：schema 定义 ⊆ MAPPING；types.ts 顶层声明 ⊆ MAPPING 目标
  const schemaDefs = collectSchemaDefinitions(schemas);
  for (const def of schemaDefs.filter((d) => !mappingBySchema.has(d))) {
    results.push({ schema: def, ts: "—", kind: classifySchemaNode(resolveSchemaRef(schemas, def)) ?? "?", status: "UNMAPPED", note: "", problems: ["schema 定义未在 MAPPING 登记（新增嵌套对象 / 枚举 / $defs 时请在脚本顶部登记）"] });
  }
  const mappedHeads = new Set(mapping.map((e) => e.ts.split(".")[0]));
  for (const name of [...decls.keys()].filter((n) => !mappedHeads.has(n))) {
    results.push({ schema: "—", ts: name, kind: ts.isInterfaceDeclaration(decls.get(name)) ? "interface" : "type", status: "UNMAPPED", note: "", problems: ["types.ts 顶层声明没有对应的 schema 定义（types.ts 只放 schema 投影；若 schema 已加请在 MAPPING 登记）"] });
  }

  const counts = { ok: 0, mismatch: 0, error: 0, unmapped: 0, schemaDefs: schemaDefs.length, tsDecls: decls.size };
  for (const r of results) {
    if (r.status === "OK") counts.ok++;
    else if (r.status === "MISMATCH") counts.mismatch++;
    else if (r.status === "ERROR") counts.error++;
    else counts.unmapped++;
  }
  return { ok: counts.mismatch + counts.error + counts.unmapped === 0, results, counts };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { root: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i];
    else if (a === "-h" || a === "--help") args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (args.root === undefined) throw new Error("--root 需要一个目录参数");
  return args;
}

export function printReport({ results, counts }, out) {
  for (const r of results) {
    const head = `${r.status.padEnd(9)} ${r.kind.padEnd(9)} ${r.schema}  ↔  ${r.ts}`;
    out(r.note ? `${head}  (${r.note})` : head);
    for (const p of r.problems) out(`            ${p}`);
  }
  out(`覆盖：schema 定义 ${counts.schemaDefs} 个 · types.ts 顶层声明 ${counts.tsDecls} 个 · 未映射 ${counts.unmapped}`);
  out(`结果：OK ${counts.ok} · MISMATCH ${counts.mismatch} · ERROR ${counts.error} · UNMAPPED ${counts.unmapped}`);
}

export async function main(argv = process.argv.slice(2), out = console.log) {
  const args = parseArgs(argv);
  if (args.help) {
    out(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].split("\n").slice(2).map((l) => l.replace(/^ \* ?/, "")).join("\n"));
    return 0;
  }
  const root = args.root ? path.resolve(args.root) : SCRIPT_ROOT;
  const ts = await loadTypeScript(root);
  out(`check-types-vs-schema · root=${root} · typescript ${ts.version}`);
  const report = check({ root, ts });
  printReport(report, out);
  if (!report.ok) {
    out("types.ts 与 schemas/ 不一致：schema 是事实源，请改 packages/core/src/types.ts（或补 MAPPING）后重跑。");
    return 1;
  }
  out("types.ts 与 schemas/ 一致。");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`check-types-vs-schema.mjs 失败：${err && err.stack ? err.stack : err}`);
      process.exit(1);
    },
  );
}
