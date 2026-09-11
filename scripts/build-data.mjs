#!/usr/bin/env node
/**
 * build-data.mjs — data/ → 引擎 → 三张单 JSON + build.json（执行简报 §3 v0.1 / §5 接口契约；issue #3）。
 *
 *   node scripts/build-data.mjs                        # 写 packages/web/public/data/{prep,purchase,menu}/<planId>.json + build.json
 *   node scripts/build-data.mjs --check                # 只校验不写：任何 issue / pending 非空 → 逐条打印并 exit 1
 *   node scripts/build-data.mjs --compare-snapshots    # 生成的采购单与 data/purchase-orders/ 快照逐行比对（可与 --check 连用）
 *   node scripts/build-data.mjs --at <ISO>             # 固定 builtAt / generatedAt（幂等、复现快照；默认 new Date()）
 *   node scripts/build-data.mjs --root <dir>           # 仓库根（测试用；默认脚本所在仓库）
 *   node scripts/build-data.mjs --out <dir>            # 输出目录（默认 <root>/packages/web/public/data）
 *   node scripts/build-data.mjs --target team-meals --check # 校验固定 Git JSON/图片，数量缺项为 warning
 *   node scripts/build-data.mjs --target team-meals --revision <完整SHA> # 从指定祖先 commit 构建 team 投影
 *
 * 前置：packages/core 已构建（npm --prefix packages/core run build）；team 图片完整解码使用构建开发依赖。
 *
 * 管线（每个 data/menu-plans/<planId>.json）：
 *   prep     = buildPrepSheet(plan, dishes, techniques, ingredients)        → PrepSheet（sheets.ts）
 *   menu     = buildMenuSheet(plan, dishes, ingredients)                    → MenuSheet
 *   purchase = expand → renderPurchaseOrders（generatedAt = builtAt, menuPlanRef = planId）
 *              + wechatText[supplier] = formatPurchaseOrderText(po, { ingredients })   → PurchaseSheet
 *   build.json = { builtAt, commit, plans, readiness: { dishId → { canTeach, canPlan, canProcure, missing } } }
 *
 * 规则：
 *   - provenance.source === "example" 的菜在进引擎前从 dishes 剔除（不当真实数据发布，简报 §7）；
 *     menu-plan 引用了示例菜 → 打 warning（example-dish-referenced），三张单里该餐次表现为 missing-dish；
 *   - 数字全部来自 @canteenos/core（不在此重算）；builtAt / commit 是本脚本唯一注入的非数据输入；
 *   - 写模式：issues 打到 stderr 但照常写出（构建门禁用 --check）；输出目录里已不存在的 plan 文件会被清掉；
 *   - 快照比对：忽略 generatedAt，比 supplier / lines[].{ingredientRef,qty,packs,trace,unitPrice,amount} / totalAmount / notes。
 *
 * 纯 Node ≥ 20，ESM。导出 loadData / buildPlan / runBuild / compareSnapshots / main 供 scripts/build-data.test.mjs 使用。
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSchemaValidators } from "./validate-schemas.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE_DIST = new URL("../packages/core/dist/index.js", import.meta.url);

let core;
try {
  core = await import(CORE_DIST.href);
} catch (err) {
  if (err && err.code === "ERR_MODULE_NOT_FOUND") {
    throw new Error(
      `找不到 ${fileURLToPath(CORE_DIST)}：先构建核心包（npm --prefix packages/core run build）再跑 build-data.mjs`,
      { cause: err },
    );
  }
  throw err;
}
const { buildMenuSheet, buildPrepSheet, expand, formatPurchaseOrderText, readiness, renderPurchaseOrders } = core;

export const DATA_DIR = "data";
export const DEFAULT_OUT_DIR = path.join("packages", "web", "public", "data");
export const SHEET_DIRS = ["prep", "purchase", "menu"];
export const BUILD_FILE = "build.json";
export const EXAMPLE_SOURCE = "example";

// ---------------------------------------------------------------------------
// 装载 data/（一实体一文件、文件名即 ID；与 packages/core/scripts/generate-week41.mjs 同一读法）
// ---------------------------------------------------------------------------

const readJson = (abs) => JSON.parse(readFileSync(abs, "utf8"));

/** 目录下全部 *.json → { <文件名去 .json>: 内容 }，按文件名排序；目录不存在 → {} */
function loadDir(dir) {
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => [f.slice(0, -".json".length), readJson(path.join(dir, f))]),
  );
}

/**
 * 读全部实体。dishes 已剔除示例菜（provenance.source === "example"），被剔除的 id 列在 excludedDishes。
 * 返回 { ingredients, dishes, excludedDishes, techniques, menuPlans }
 */
export function loadData(root) {
  const dataDir = path.join(root, DATA_DIR);
  const ingredients = loadDir(path.join(dataDir, "ingredients"));
  const menuPlans = loadDir(path.join(dataDir, "menu-plans"));
  const techniquesFile = path.join(dataDir, "techniques.json");
  const techniques = existsSync(techniquesFile) ? readJson(techniquesFile) : [];
  const dishes = {};
  const excludedDishes = [];
  for (const [id, dish] of Object.entries(loadDir(path.join(dataDir, "dishes")))) {
    if (dish && dish.provenance && dish.provenance.source === EXAMPLE_SOURCE) excludedDishes.push(id);
    else dishes[id] = dish;
  }
  return { ingredients, dishes, excludedDishes, techniques, menuPlans };
}

/** git rev-parse HEAD；无 git / 非仓库 → "local" */
export function resolveCommit(root) {
  try {
    const sha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : "local";
  } catch {
    return "local";
  }
}

// ---------------------------------------------------------------------------
// 单个 menu-plan → 三张单
// ---------------------------------------------------------------------------

/** 汇总一份 menu-plan 三张单的全部问题为扁平列表（planId / sheet / code / kind / message） */
function collectIssues(planId, { prep, purchase, menu }, buildIssues) {
  const flat = [];
  for (const i of buildIssues) flat.push({ planId, sheet: "build", ...i });
  for (const i of prep.issues) flat.push({ planId, sheet: "prep", kind: "error", ...i });
  for (const i of purchase.issues) flat.push({ planId, sheet: "purchase", ...i });
  for (const p of purchase.pending) {
    flat.push({
      planId,
      sheet: "purchase",
      code: `pending:${p.reason}`,
      kind: "warning",
      ingredientRef: p.ingredientRef,
      message: `食材 ${p.ingredientRef} 进入「待补全」区（${p.reason}），未计入任何供应商单`,
    });
  }
  for (const i of menu.issues) flat.push({ planId, sheet: "menu", kind: "error", ...i });
  return flat;
}

/**
 * 一份 menu-plan → { prep, purchase, menu, issues }。
 * data 为 loadData 的返回值（dishes 已无示例菜）；at 注入 generatedAt。
 */
export function buildPlan(planId, menuPlan, data, { at }) {
  const { ingredients, dishes, techniques, excludedDishes } = data;
  if (menuPlan.schemaVersion !== "2" || menuPlan.meals.some(m => dishes[m.dishRef]?.schemaVersion === "3")) {
    throw new Error(`unsupported-format: ${planId} requires the team-meals target`);
  }

  const buildIssues = [];
  const seen = new Set();
  for (const meal of menuPlan.meals ?? []) {
    if (!excludedDishes.includes(meal.dishRef) || seen.has(meal.dishRef)) continue;
    seen.add(meal.dishRef);
    buildIssues.push({
      code: "example-dish-referenced",
      kind: "warning",
      dishRef: meal.dishRef,
      message: `菜单计划 ${planId} 引用了示例菜 ${meal.dishRef}（provenance.source = "example"，构建时排除）：该餐次在三张单里表现为 missing-dish，请换成真实菜品`,
    });
  }

  const prep = buildPrepSheet(menuPlan, dishes, techniques, ingredients);
  const menu = buildMenuSheet(menuPlan, dishes, ingredients);

  const { lines, pending, issues } = expand(menuPlan, dishes, ingredients);
  const orders = renderPurchaseOrders(lines, menuPlan, { generatedAt: at, menuPlanRef: planId });
  const wechatText = Object.fromEntries(orders.map((po) => [po.supplier, formatPurchaseOrderText(po, { ingredients })]));
  const purchase = { orders, pending, issues, wechatText };

  const sheets = { prep, purchase, menu };
  return { ...sheets, issues: collectIssues(planId, sheets, buildIssues) };
}

// ---------------------------------------------------------------------------
// 全量构建 + 写出
// ---------------------------------------------------------------------------

const stringify = (x) => JSON.stringify(x, null, 2) + "\n";

/** 写 outDir/{prep,purchase,menu}/<planId>.json + build.json；清掉已不存在的 plan 文件。返回相对 outDir 的已写路径 */
function writeOutputs(outDir, build, sheets) {
  const written = [];
  const keep = new Set(build.plans.map((id) => `${id}.json`));
  for (const sub of SHEET_DIRS) {
    const dir = path.join(outDir, sub);
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".json") && !keep.has(f)) rmSync(path.join(dir, f));
    }
    for (const planId of build.plans) {
      writeFileSync(path.join(dir, `${planId}.json`), stringify(sheets[planId][sub]), "utf8");
      written.push(path.join(sub, `${planId}.json`));
    }
  }
  writeFileSync(path.join(outDir, BUILD_FILE), stringify(build), "utf8");
  written.push(BUILD_FILE);
  return written;
}

/**
 * runBuild({ root, outDir?, at?, write?, commit? })
 *   → { build, sheets: { [planId]: { prep, purchase, menu } }, issues, excludedDishes, written, outDir, counts }
 * write=false 时只算不写（--check）。
 */
export function runBuild({
  root,
  outDir = path.join(root, DEFAULT_OUT_DIR),
  at = new Date().toISOString(),
  write = true,
  commit = resolveCommit(root),
  target = "legacy-numeric",
} = {}) {
  if (!root) throw new Error("runBuild：缺 root");
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) throw new Error(`--at 不是合法的 ISO 时间：${at}`);
  if (target === "team-meals") return runTeamBuild({ root, outDir, at, write, commit });
  if (target !== "legacy-numeric") throw new Error(`Unknown build target: ${target}`);
  const data = loadData(root);
  const planIds = Object.keys(data.menuPlans).sort();

  const sheets = {};
  const issues = [];
  for (const planId of planIds) {
    const { prep, purchase, menu, issues: planIssues } = buildPlan(planId, data.menuPlans[planId], data, { at });
    sheets[planId] = { prep, purchase, menu };
    issues.push(...planIssues);
  }

  const readinessByDish = Object.fromEntries(
    Object.keys(data.dishes)
      .sort()
      .map((id) => {
        if (data.dishes[id].schemaVersion === "3") return [id, {canTeach:false,canPlan:false,canProcure:false,missing:["unsupported-format"]}];
        const r = readiness(data.dishes[id], data.ingredients);
        return [id, { canTeach: r.canTeach, canPlan: r.canPlan, canProcure: r.canProcure, missing: r.missingKeys }];
      }),
  );
  const build = { builtAt: at, commit, plans: planIds, readiness: readinessByDish };

  const written = write ? writeOutputs(outDir, build, sheets) : [];
  const counts = {
    ingredients: Object.keys(data.ingredients).length,
    dishes: Object.keys(data.dishes).length,
    techniques: Array.isArray(data.techniques) ? data.techniques.length : 0,
    plans: planIds.length,
  };
  return { build, sheets, issues, excludedDishes: data.excludedDishes, written, outDir, counts };
}

// ---------------------------------------------------------------------------
// 黄金快照比对：生成的采购单 ↔ data/purchase-orders/*.json
// ---------------------------------------------------------------------------

const isPlainObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const fmt = (x) => (x === undefined ? "（缺）" : JSON.stringify(x));

/** 结构化深比较：把每处不同记为 { path, expected, actual }（键序无关） */
function diffValues(expected, actual, at, out) {
  if (isPlainObject(expected) && isPlainObject(actual)) {
    for (const k of new Set([...Object.keys(expected), ...Object.keys(actual)]).values()) {
      diffValues(expected[k], actual[k], `${at}.${k}`, out);
    }
  } else if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) out.push({ path: `${at}.length`, expected: expected.length, actual: actual.length });
    const n = Math.min(expected.length, actual.length);
    for (let i = 0; i < n; i++) diffValues(expected[i], actual[i], `${at}[${i}]`, out);
  } else if (!Object.is(expected, actual)) {
    out.push({ path: at, expected, actual });
  }
}

/** 读 data/purchase-orders/*.json 快照，按 menuPlanRef（缺省按文件名前缀 <planId>-）归到 plan */
export function loadSnapshots(root, planIds) {
  const dir = path.join(root, DATA_DIR, "purchase-orders");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const po = readJson(path.join(dir, f));
    const planId = po.menuPlanRef ?? planIds.find((id) => f.startsWith(`${id}-`)) ?? null;
    out.push({ file: `${DATA_DIR}/purchase-orders/${f}`, planId, po });
  }
  return out;
}

/**
 * compareSnapshots(root, sheets) → { entries: [{ file, planId, supplier, lines, diffs }], linesCompared, diffs }
 * 每张快照按 (planId, supplier) 找生成的 PO；行按 ingredientRef 配对；忽略 generatedAt。
 * 快照对不上生成单（plan 未构建 / 供应商单缺失 / 生成了快照里没有的单）都算差异。
 */
export function compareSnapshots(root, sheets) {
  const planIds = Object.keys(sheets);
  const snapshots = loadSnapshots(root, planIds);
  const entries = [];
  let linesCompared = 0;
  const matchedGenerated = new Set();

  for (const { file, planId, po: snap } of snapshots) {
    const entry = { file, planId, supplier: snap.supplier, lines: 0, diffs: [] };
    entries.push(entry);
    const d = entry.diffs;
    const generated = planId && sheets[planId] ? sheets[planId].purchase.orders : null;
    if (!generated) {
      d.push({ path: "menuPlanRef", expected: planId, actual: undefined, note: "快照对应的 menu-plan 未构建（data/menu-plans/ 无此 plan）" });
      continue;
    }
    const po = generated.find((p) => p.supplier === snap.supplier);
    if (!po) {
      d.push({ path: "supplier", expected: snap.supplier, actual: undefined, note: "生成结果里没有这家供应商的单" });
      continue;
    }
    matchedGenerated.add(`${planId}|${snap.supplier}`);

    // 单头：除 generatedAt / lines 之外全部比（schemaVersion / supplier / menuPlanRef / totalAmount / notes）
    const { generatedAt: _s, lines: snapLines, ...snapHead } = snap;
    const { generatedAt: _g, lines: genLines, ...genHead } = po;
    diffValues(snapHead, genHead, "", d);

    // 行：按 ingredientRef 配对，逐字段比（qty / packs / trace / unitPrice / amount）
    const genByRef = new Map(genLines.map((l) => [l.ingredientRef, l]));
    for (const sl of snapLines) {
      const gl = genByRef.get(sl.ingredientRef);
      if (!gl) {
        d.push({ path: `lines[${sl.ingredientRef}]`, expected: sl, actual: undefined, note: "生成单缺此行" });
        continue;
      }
      genByRef.delete(sl.ingredientRef);
      const before = d.length;
      diffValues(sl, gl, `lines[${sl.ingredientRef}]`, d);
      if (d.length === before) entry.lines += 1;
    }
    for (const [ref, gl] of genByRef) d.push({ path: `lines[${ref}]`, expected: undefined, actual: gl, note: "快照没有这行" });
    linesCompared += entry.lines;
  }

  // 生成了快照里没有的单（只对已有快照的 plan 计较；没有任何快照的 plan 视为未锁定，跳过）
  const snapshotPlans = new Set(snapshots.map((s) => s.planId).filter(Boolean));
  for (const planId of planIds) {
    if (!snapshotPlans.has(planId)) continue;
    for (const po of sheets[planId].purchase.orders) {
      if (matchedGenerated.has(`${planId}|${po.supplier}`)) continue;
      entries.push({
        file: `${DATA_DIR}/purchase-orders/（无快照）`,
        planId,
        supplier: po.supplier,
        lines: 0,
        diffs: [{ path: "supplier", expected: undefined, actual: po.supplier, note: "生成了快照里没有的供应商单" }],
      });
    }
  }

  const diffs = entries.flatMap((e) => e.diffs.map((x) => ({ file: e.file, planId: e.planId, supplier: e.supplier, ...x })));
  return { entries, linesCompared, diffs, snapshotPlans: [...snapshotPlans] };
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Team target: fixed Git inputs, complete references, optional numeric estimates.
// ---------------------------------------------------------------------------
function gitBytes(root, args) {
  return execFileSync('git', ['-C',root,...args], {stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});
}
function loadCommittedInputs(root, revision) {
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('invalid_revision: a complete saved commit is required');
  try {
    const top=gitBytes(root,['rev-parse','--show-toplevel']).toString().trim();
    if (realpathSync(top)!==realpathSync(root)) throw new Error('Not the repository root');
    if(gitBytes(root,['cat-file','-t',revision]).toString().trim()!=='commit') throw new Error('Object is not a commit');
    gitBytes(root,['merge-base','--is-ancestor',revision,'HEAD']);
  } catch { throw new Error('revision_unavailable: revision must be reachable from this repository HEAD'); }
  const entries=new Map(gitBytes(root,['ls-tree','-rz','--full-tree',revision,'--','data']).toString().split('\0').filter(Boolean).map(row=>{
    const tab=row.indexOf('\t'),[mode,type,sha]=row.slice(0,tab).split(' ');
    return [row.slice(tab+1),{mode,type,sha}];
  }));
  const read=(file)=>{
    const entry=entries.get(file);
    if (!entry || entry.type!=='blob' || !['100644','100755'].includes(entry.mode)) throw new Error(`asset_unavailable: ${file}`);
    return gitBytes(root,['cat-file','blob',entry.sha]);
  };
  const inputs={menuPlans:{},dishes:{},ingredients:{},techniques:[]};
  const {validateEntity}=createSchemaValidators({schemaDir:path.resolve(HERE,'../schemas')});
  let haveTechniques=false;
  for (const file of entries.keys()) {
    const match=/^data\/(ingredients|dishes|menu-plans)\/([^/]+)\.json$/.exec(file);
    if (!match && file!=='data/techniques.json') continue;
    const kind=match ? {'ingredients':'ingredient','dishes':'dish','menu-plans':'plan'}[match[1]] : 'techniques';
    if (match && !/^[a-z][a-z0-9-]*$/.test(match[2])) throw new Error(`invalid_source: invalid entity ID in ${file}`);
    let value;
    try { value=JSON.parse(read(file).toString('utf8')); } catch { throw new Error(`invalid_source: unreadable JSON ${file}`); }
    const checked=validateEntity(kind,value);
    if (!checked.valid) throw new Error(`invalid_source: ${file}: ${checked.errors.map(e=>`${e.instancePath} ${e.keyword}`).join(', ')}`);
    if (kind==='techniques') {inputs.techniques=value;haveTechniques=true;}
    else inputs[{'ingredient':'ingredients','dish':'dishes','plan':'menuPlans'}[kind]][match[2]]=value;
  }
  if (!haveTechniques) throw new Error('invalid_source: missing techniques.json');
  return {inputs,read,entries};
}

/** Decode in a bounded child so the existing synchronous build API stays stable. */
function verifyRaster(content) {
  if(!content.length||content.length>200*1024) throw new Error('Image exceeds the byte limit');
  const result=execFileSync(process.execPath,[path.join(HERE,'verify-team-image.mjs')],{
    input:content,stdio:['pipe','pipe','pipe'],timeout:30000,maxBuffer:64*1024,
  });
  const decoded=JSON.parse(result.toString('utf8'));
  if(!decoded||!['png','jpeg','webp'].includes(decoded.format)||
    !Number.isInteger(decoded.width)||!Number.isInteger(decoded.height)||
    decoded.width<1||decoded.height<1||decoded.width>1280||decoded.height>1280) throw new Error('Invalid decoder result');
}

function projectAssets(projection, source, revision, planId) {
  const assets=[], bytes=new Map(), issues=[];
  const add=(image,ownerPath,jsonPointer,techniqueRef)=>{
    if (!image) return;
    const asset={ownerPath,jsonPointer,source:image,status:'missing'};
    if(techniqueRef!==undefined) asset.techniqueRef=techniqueRef;
    assets.push(asset);
    const fail=(message)=>issues.push({planId,kind:'error',code:'asset-unavailable',ownerPath,jsonPointer,message});
    if (!/^(own|CC0(?: 1\.0)?|Public domain|CC BY(?:-SA)?(?: [1-4]\.0)?)$/.test(image.license) ||
      (/^CC BY/.test(image.license)&&(!image.author||!image.sourceUrl))) {
      asset.status='invalid';fail('Image license or attribution is incomplete');return;
    }
    const src=image.src;
    if (/^https?:\/\//.test(src)) {
      asset.status='external-unpinned';
      issues.push({planId,kind:'warning',code:'external-unpinned',ownerPath,jsonPointer,message:'External image bytes are not retained at this revision'});
      return;
    }
    if (path.posix.isAbsolute(src)||src.includes('\\')||src.includes('\0')||/^[a-z][a-z0-9+.-]*:/i.test(src)) {asset.status='invalid';fail('Image path is not an allowed repository path');return;}
    const file=path.posix.normalize(src.startsWith('data/')?src:path.posix.join(path.posix.dirname(ownerPath),src));
    if (!file.startsWith('data/') || !/\.(?:png|jpe?g|webp)$/i.test(file)) {asset.status='invalid';fail('Image path escapes data or has an unsupported format');return;}
    try {
      const content=source.read(file);verifyRaster(content);
      asset.status='available';asset.path=`assets/${revision}/${file}`;
      bytes.set(asset.path,content);
    } catch {fail(`Same-revision image is unavailable: ${file}`);}
  };
  for (const [id,ingredient] of Object.entries(projection.ingredients)) add(ingredient.image,`data/ingredients/${id}.json`,'/image');
  for (const [id,dish] of Object.entries(projection.dishes)) {
    const owner=`data/dishes/${id}.json`;
    add(dish.image,owner,'/image');
    (dish.components??[]).forEach((c,i)=>add(c.prep?.image,owner,`/components/${i}/prep/image`));
    (dish.steps??[]).forEach((s,i)=>add(s.image,owner,`/steps/${i}/image`));
  }
  const selectedTechniques=new Set(projection.techniques.map(t=>t.id));
  source.inputs.techniques.forEach((t,i)=>{if(selectedTechniques.has(t.id)) add(t.image,'data/techniques.json',`/${i}/image`,t.id);});
  return {assets,bytes,issues};
}

function runTeamBuild({root,outDir,at,write,commit}) {
  const source=loadCommittedInputs(root,commit),{inputs}=source;
  const sheets={},issues=[],assetBytes=new Map();
  const planIds=Object.keys(inputs.menuPlans).sort();
  const excludedDishes=Object.keys(inputs.dishes).filter(id=>inputs.dishes[id].provenance?.source==='example').sort();
  const blocking=new Set(['missing-plan','missing-dish','missing-ingredient','missing-technique']);
  const seenTechniques=new Set();
  for (const t of inputs.techniques) {
    if(seenTechniques.has(t.id)) issues.push({kind:'error',code:'invalid-source',message:`Duplicate technique ${t.id}`});
    seenTechniques.add(t.id);
  }
  for (const [id,ingredient] of Object.entries(inputs.ingredients)) if (ingredient.baseUnit==='pcs'&&ingredient.yield!==undefined) issues.push({kind:'error',code:'invalid-source',message:`Ingredient ${id}: pcs cannot declare yield`});
  for (const planId of planIds) {
    const plan=inputs.menuPlans[planId];
    if (plan.dateRange && (plan.dateRange.start>plan.dateRange.end || plan.meals.some(m=>m.date<plan.dateRange.start||m.date>plan.dateRange.end))) {
      issues.push({planId,kind:'error',code:'invalid-selection',message:'Plan dates fall outside its dateRange'});
    }
    const selection=core.normalizeSelection(plan.meals.map(m=>({menuPlanRef:planId,date:m.date,mealType:m.mealType})));
    const projection=core.projectTeamMeals(inputs,{sourceRevision:commit,selection},selection.length?{}:{emptyMenuPlanRefs:[planId]});
    const estimates=core.estimateShoppingList(inputs,selection,at);
    for (const issue of projection.collection.issues) issues.push({planId,...issue,kind:blocking.has(issue.code)?'error':'warning'});
    for (const item of estimates.items) {
      if (item.status==='unavailable') for (const reason of item.reasons) issues.push({planId,kind:'warning',code:reason.code,ingredientRef:item.ingredientRef,source:reason.source});
      const ingredient=projection.ingredients[item.ingredientRef];
      if (ingredient?.purchase && !ingredient.purchase.lastPrice) issues.push({planId,kind:'warning',code:'missing-price',ingredientRef:item.ingredientRef,ownerPath:`data/ingredients/${item.ingredientRef}.json`,jsonPointer:'/purchase/lastPrice'});
    }
    for (const [dishId,dish] of Object.entries(projection.dishes)) {
      const ownerPath=`data/dishes/${dishId}.json`;
      if (dish.provenance?.source==='example') issues.push({planId,kind:'error',code:'example-dish-referenced',dishRef:dishId});
      if (dish.provenance?.source==='video'&&!dish.provenance.videoUrl) issues.push({planId,kind:'error',code:'invalid-source',dishRef:dishId,ownerPath,jsonPointer:'/provenance/videoUrl',message:'Video provenance requires its source URL'});
      for (const [stepIndex,step] of (dish.steps??[]).entries()) if (step.clip && step.clip.end<=step.clip.start) issues.push({planId,kind:'error',code:'invalid-source',dishRef:dishId,stepIndex,ownerPath,jsonPointer:`/steps/${stepIndex}/clip`,message:'Clip end must be after start'});
    }
    const projectedAssets=projectAssets(projection,source,commit,planId);
    issues.push(...projectedAssets.issues);
    for(const [key,value] of projectedAssets.bytes) assetBytes.set(key,value);
    sheets[planId]={teamMeals:{...projection,estimates,assets:projectedAssets.assets,issues:issues.filter(i=>!i.planId||i.planId===planId)}};
  }
  const build={builtAt:at,commit,plans:planIds,target:'team-meals',projectionVersion:'1'};
  const written=[];
  if (write && !issues.some(i=>i.kind==='error')) {
    const files=new Map(planIds.map(id=>[`team-meals/${id}.json`,stringify(sheets[id].teamMeals)]));
    for(const [file,content] of assetBytes) files.set(file,content);
    files.set(BUILD_FILE,stringify(build));
    publishTeamOutputs(root,outDir,files);
    written.push(...files.keys());
  }
  return {build,sheets,issues,excludedDishes,written,outDir,counts:{ingredients:Object.keys(inputs.ingredients).length,dishes:Object.keys(inputs.dishes).length,techniques:inputs.techniques.length,plans:planIds.length}};
}

/** Build into a sibling directory, then exchange complete output trees. */
function publishTeamOutputs(root,outDir,files) {
  const canonical=(file)=>existsSync(file)?realpathSync(file):path.join(canonical(path.dirname(file)),path.basename(file));
  const within=(a,b)=>{const relative=path.relative(b,a);return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));};
  const sourceRoot=realpathSync(root),output=canonical(outDir);
  if (output===path.parse(output).root || within(sourceRoot,output) || ['data','schemas','scripts','packages/core','.git'].some(part=>{
    const protectedPath=path.join(sourceRoot,part);return within(output,protectedPath)||within(protectedPath,output);
  })) throw new Error('invalid_output: output overlaps repository inputs');
  if (existsSync(outDir) && (!lstatSync(outDir).isDirectory()||lstatSync(outDir).isSymbolicLink())) throw new Error('invalid_output: output must be a real directory');
  if(within(output,sourceRoot)) {
    const tracked=gitBytes(sourceRoot,['ls-files','-z','--',path.relative(sourceRoot,output)]).toString().split('\0').filter(Boolean);
    if(tracked.some(file=>path.basename(file)!=='.gitkeep')) throw new Error('invalid_output: output contains tracked source files');
  }
  if(existsSync(outDir)&&readdirSync(outDir).some(file=>file!=='.gitkeep')) {
    let previous;
    try {
      const manifest=path.join(outDir,BUILD_FILE);
      if(!lstatSync(manifest).isFile()||lstatSync(manifest).isSymbolicLink()) throw new Error('Not a generated manifest');
      previous=readJson(manifest);
    } catch {throw new Error('invalid_output: nonempty output is not a recognized generated directory');}
    if(typeof previous.builtAt!=='string'||typeof previous.commit!=='string'||!Array.isArray(previous.plans)||
      !(previous.target==='team-meals'||previous.target===undefined&&previous.readiness&&typeof previous.readiness==='object')) {
      throw new Error('invalid_output: nonempty output is not a recognized generated directory');
    }
  }
  mkdirSync(path.dirname(outDir),{recursive:true});
  const holder=mkdtempSync(path.join(path.dirname(outDir),`.${path.basename(outDir)}-build-`));
  const stage=path.join(holder,'next'),backup=path.join(holder,'previous');
  let moved=false,keepRecovery=false;
  try {
    mkdirSync(stage);
    if (existsSync(outDir)) cpSync(outDir,stage,{recursive:true,dereference:false,verbatimSymlinks:true});
    // These directories are generated surfaces owned by this build. Keep other
    // files at the output root, but never carry a stale target or asset mapping.
    for(const entry of [...SHEET_DIRS,'team-meals','assets',BUILD_FILE]) rmSync(path.join(stage,entry),{recursive:true,force:true});
    for(const [file,content] of files) {const dest=path.join(stage,file);mkdirSync(path.dirname(dest),{recursive:true});writeFileSync(dest,content);}
    if (existsSync(outDir)) {renameSync(outDir,backup);moved=true;}
    try {renameSync(stage,outDir);}
    catch(error) {
      if(moved) {
        try {renameSync(backup,outDir);moved=false;}
        catch(restoreError) {keepRecovery=true;throw new AggregateError([error,restoreError],`output restore failed; complete prior output retained at ${backup}`);}
      }
      throw error;
    }
  } finally {
    if(!keepRecovery) rmSync(holder,{recursive:true,force:true});
  }
}

// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { check: false, compare: false, at: null, root: null, out: null, help: false, target:"legacy-numeric", revision:null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--compare-snapshots") args.compare = true;
    else if (a === "--at") args.at = argv[++i];
    else if (a === "--root") args.root = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--target") args.target = argv[++i];
    else if (a === "--revision") args.revision = argv[++i];
    else if (a === "-h" || a === "--help") args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  for (const k of ["at", "root", "out", "target", "revision"]) {
    if (args[k] === undefined) throw new Error(`--${k} 缺值`);
  }
  return args;
}

const issueLine = (i) =>
  `  [${i.planId}] ${i.sheet.padEnd(8)} ${i.kind === "warning" ? "⚠" : "✗"} ${i.code}` +
  `${i.dishRef ? ` dish=${i.dishRef}` : ""}${i.ingredientRef ? ` ingredient=${i.ingredientRef}` : ""}: ${i.message}`;

export function main(argv = process.argv.slice(2), out = console.log, err = console.error) {
  const args = parseArgs(argv);
  if (args.help) {
    out(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].split("\n").slice(2).map((l) => l.replace(/^ \* ?/, "")).join("\n"));
    return 0;
  }
  const root = args.root ? path.resolve(args.root) : path.resolve(HERE, "..");
  const outDir = args.out ? path.resolve(args.out) : path.join(root, DEFAULT_OUT_DIR);
  const mode = args.check ? "check" : "write";
  const rel = (abs) => path.relative(root, abs).split(path.sep).join("/") || ".";

  if (args.target === "team-meals" && args.compare) throw new Error("--compare-snapshots requires --target legacy-numeric");
  if (args.revision && args.target !== "team-meals") throw new Error("--revision requires --target team-meals");
  const result = runBuild({ root, outDir, at: args.at ?? undefined, write: !args.check, target:args.target, commit:args.revision ?? undefined });
  const { build, sheets, issues, excludedDishes, written, counts } = result;

  if (args.target === "team-meals") {
    out(`build-data.mjs [${mode}] target=team-meals revision=${build.commit}`);
    for (const planId of build.plans) out(`  ${planId}: ${sheets[planId].teamMeals.collection.items.length} recorded ingredients; budget=${sheets[planId].teamMeals.estimates.budgetStatus}`);
    for (const issue of issues) out(`  ${issue.kind} ${issue.code}: ${issue.planId ?? ""} ${issue.message ?? ""}`);
    out(`${issues.filter(i=>i.kind==="error").length} blocking errors; ${written.length} outputs written`);
    return issues.some(i=>i.kind==="error") ? 1 : 0;
  }

  out(
    `build-data.mjs [${mode}] data/：食材 ${counts.ingredients} · 菜品 ${counts.dishes}（排除示例菜 ${excludedDishes.length}${excludedDishes.length ? `：${excludedDishes.join(", ")}` : ""}）· 技法 ${counts.techniques} · 菜单计划 ${counts.plans}`,
  );
  for (const planId of build.plans) {
    const { prep, purchase, menu } = sheets[planId];
    const meals = prep.days.reduce((n, d) => n + d.meals.length, 0);
    const lines = purchase.orders.reduce((n, po) => n + po.lines.length, 0);
    const planIssues = issues.filter((i) => i.planId === planId).length;
    out(
      `  ${planId}：备料 ${prep.days.length} 天 ${meals} 餐次 · 采购 ${purchase.orders.length} 单 ${lines} 行（待补全 ${purchase.pending.length}）· 菜单 ${menu.days.length} 天 · issues ${planIssues}`,
    );
  }
  out(`build.json：builtAt ${build.builtAt} · commit ${build.commit} · plans [${build.plans.join(", ")}] · readiness ${Object.keys(build.readiness).length} 道菜`);

  let code = 0;
  if (issues.length > 0) {
    (args.check ? out : err)(`issues ${issues.length} 条：`);
    for (const i of issues) (args.check ? out : err)(issueLine(i));
    if (args.check) code = 1;
  } else {
    out("issues 0");
  }

  if (args.compare) {
    const cmp = compareSnapshots(root, sheets);
    if (cmp.entries.length === 0) {
      out("快照比对：data/purchase-orders/ 无快照，跳过");
    } else {
      for (const e of cmp.entries) {
        out(`快照比对 ${e.file} ↔ ${e.planId ?? "?"} / ${e.supplier}：${e.lines} 行一致${e.diffs.length ? `，${e.diffs.length} 处差异` : ""}`);
        for (const d of e.diffs) out(`    ✗ ${d.path || "(单头)"}：快照 ${fmt(d.expected)} ≠ 生成 ${fmt(d.actual)}${d.note ? `（${d.note}）` : ""}`);
      }
      out(`快照比对合计：${cmp.linesCompared} 行一致，${cmp.diffs.length} 处差异（忽略 generatedAt）`);
      if (cmp.diffs.length > 0) code = 1;
    }
  }

  if (args.check) {
    out(`[check] 未写任何文件。${code ? "存在 issue/差异，exit 1。" : ""}`);
  } else {
    for (const f of written) out(`已写入 ${rel(path.join(outDir, f))}`);
  }
  return code;
}

let directExecution = false;
try { directExecution = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch {}
if (directExecution) {
  try {
    process.exit(main());
  } catch (e) {
    console.error(`build-data.mjs 失败：${e && e.stack ? e.stack : e}`);
    process.exit(1);
  }
}
