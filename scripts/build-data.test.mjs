/**
 * scripts/build-data.mjs 单元测试（node:test；需先安装构建依赖并构建 core）。
 *   node --test scripts/build-data.test.mjs
 *
 * 覆盖：三张单 JSON 结构符合执行简报 §5 契约 / build.json 字段齐（含 readiness）/
 *       example 菜被排除且引用告警 / --check 不写文件且有 issue 时 exit 1 /
 *       黄金快照逐行一致且篡改可检出 / --at 固定后两次构建字节一致 / 输出目录清理过期 plan。
 * 全部在临时目录复制 data/ 子集跑，不碰仓库本体。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_FILE, DEFAULT_OUT_DIR, SHEET_DIRS, compareSnapshots, loadData, runBuild } from "./build-data.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SCRIPT = path.join(HERE, "build-data.mjs");
const AT = "2026-10-03T00:00:00.000Z"; // = data/purchase-orders/week-41-*.json 的 generatedAt
const PLAN = "week-41";
const DISH = "tomato-egg-stir-fry";
// Private 2x2 test rasters generated from a solid RGB colour; no shared fixture edits.
const RASTERS={
 png:'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGO0qdjCwMDAxAAGABCSAWwmSJZFAAAAAElFTkSuQmCC',
 jpeg:'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDx2iiiu04z/9k=',
 webp:'UklGRjgAAABXRUJQVlA4ICwAAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/upl//yz5/DZ1Of/FnIxHZeAAA==',
};
// Original private JPEG test material was malformed: second DQT at byte 89,
// length 67, expected next marker at 158, but 0x32 bytes precede SOF at 161.
// Keep that exact material as a negative, not an alleged implementation regression.
const INVALID_JPEG_DQT='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDMooor6Q8A/9k=';

const readJson = (abs) => JSON.parse(readFileSync(abs, "utf8"));
const writeJson = (abs, data) => writeFileSync(abs, JSON.stringify(data, null, 2) + "\n");

/** 临时仓库：复制 data/（无 .git → commit 为 "local"） */
function tempRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "build-data-"));
  cpSync(path.join(ROOT, "test/fixtures/contracts/valid/golden/data"), path.join(root, "data"), { recursive: true });
  return root;
}

/** 在临时仓库里加一道示例菜 + 一份引用它的菜单计划 */
function addExampleDish(root, { dishId = "example-dish", planId = "week-42" } = {}) {
  const dish = readJson(path.join(root, "data/dishes", `${DISH}.json`));
  dish.name = { zh: "示例菜", en: "Example dish", uk: "Приклад" };
  dish.provenance = { source: "example" };
  writeJson(path.join(root, "data/dishes", `${dishId}.json`), dish);
  writeJson(path.join(root, "data/menu-plans", `${planId}.json`), {
    schemaVersion: "2",
    meals: [{ date: "2026-10-12", mealType: "lunch", dishRef: dishId, plannedServings: 100 }],
  });
  return { dishId, planId };
}

function runCli(args, root) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8" });
}

// ---------------------------------------------------------------------------

test("prep/<planId>.json：days → meals → components/steps 结构符合契约，且与 runBuild 返回值一致", () => {
  const root = tempRepo();
  const out = path.join(root, "out");
  const { sheets, written } = runBuild({ root, outDir: out, at: AT });
  assert.deepEqual(written, ["prep/week-41.json", "purchase/week-41.json", "menu/week-41.json", BUILD_FILE]);

  const prep = readJson(path.join(out, "prep", `${PLAN}.json`));
  assert.deepEqual(prep, sheets[PLAN].prep, "落盘内容 = 内存结构");
  assert.deepEqual(prep.issues, []);
  assert.deepEqual(prep.dateRange, { start: "2026-10-05", end: "2026-10-11" });
  assert.deepEqual(prep.days.map((d) => d.date), ["2026-10-05", "2026-10-07", "2026-10-09"]);

  const meal = prep.days[0].meals[0];
  assert.equal(meal.mealType, "lunch");
  assert.equal(meal.dishRef, DISH);
  assert.equal(meal.servings, 200);
  assert.equal(meal.dish.name.zh, "番茄炒蛋");
  assert.equal(meal.components.length, 5);
  for (const c of meal.components) {
    assert.equal(typeof c.ingredientRef, "string");
    assert.equal(typeof c.name.zh, "string");
    assert.equal(typeof c.qty.unit, "string");
    assert.equal(typeof c.isSeasoning, "boolean");
    assert.ok(["day-before", "morning", "before-service", "at-hand"].includes(c.group));
  }
  const tomato = meal.components.find((c) => c.ingredientRef === "tomato");
  assert.deepEqual(tomato.qty, { value: 30000, unit: "g" }); // 7500 g × 200/50
  assert.equal(tomato.prep.techniqueRef, "roll-cut-chunks");
  assert.equal(tomato.prep.technique.name.uk, "Шматки рулонним нарізанням");
  assert.equal(tomato.prep.timing, "morning");
  assert.equal(tomato.prep.size, "3–4 cm");
  assert.equal(tomato.isSeasoning, false);
  const salt = meal.components.find((c) => c.ingredientRef === "salt");
  assert.equal(salt.isSeasoning, true);
  assert.equal(salt.group, "at-hand");
  assert.deepEqual(meal.steps.map((s) => s.n), [1, 2, 3]);
  assert.equal(meal.steps[0].techniqueRef, "roll-cut-chunks");
  assert.ok(meal.steps[0].clip && meal.steps[0].clip.videoUrl);
  rmSync(root, { recursive: true, force: true });
});

test("purchase/<planId>.json：orders 与快照同构（generatedAt = --at、menuPlanRef = planId）+ pending/issues + wechatText[supplier]", () => {
  const root = tempRepo();
  const out = path.join(root, "out");
  runBuild({ root, outDir: out, at: AT });
  const purchase = readJson(path.join(out, "purchase", `${PLAN}.json`));
  assert.deepEqual(Object.keys(purchase), ["orders", "pending", "issues", "wechatText"]);
  assert.deepEqual(purchase.pending, []);
  assert.deepEqual(purchase.issues, []);

  const suppliers = purchase.orders.map((po) => po.supplier);
  assert.deepEqual(suppliers, ["宏达粮油调味批发", "绿源农产品配送"]);
  for (const po of purchase.orders) {
    assert.equal(po.schemaVersion, "2");
    assert.equal(po.generatedAt, AT);
    assert.equal(po.menuPlanRef, PLAN);
    assert.ok(po.lines.length >= 1);
    for (const l of po.lines) {
      assert.ok(l.ingredientRef && l.qty && Number.isInteger(l.packs) && l.trace);
      assert.ok(l.trace.meals.length >= 1 && l.trace.netNeed && l.trace.grossNeed);
    }
  }
  // 与仓库快照同构：字段集一致（数字逐行一致由快照比对测试锁定）
  const snap = readJson(path.join(ROOT, "test/fixtures/contracts/valid/golden/data/purchase-orders/week-41-lvyuan.json"));
  const gen = purchase.orders.find((po) => po.supplier === snap.supplier);
  assert.deepEqual(Object.keys(gen).sort(), Object.keys(snap).sort());
  assert.deepEqual(Object.keys(gen.lines[0]).sort(), Object.keys(snap.lines[0]).sort());

  assert.deepEqual(Object.keys(purchase.wechatText).sort(), [...suppliers].sort());
  const text = purchase.wechatText["绿源农产品配送"];
  assert.ok(text.startsWith(`【采购单】2026-10-03 · 绿源农产品配送\n`), text);
  assert.match(text, /番茄  19 包 × 5 kg（共 95 kg）/);
  assert.match(text, /共 3 样 · 预估 ¥1339\.50（按上次价）$/);
  rmSync(root, { recursive: true, force: true });
});

test("menu/<planId>.json：days → meals（serviceWindow）→ dishes（composition 去调料、allergens、approxGrams）", () => {
  const root = tempRepo();
  const out = path.join(root, "out");
  runBuild({ root, outDir: out, at: AT });
  const menu = readJson(path.join(out, "menu", `${PLAN}.json`));
  assert.deepEqual(menu.issues, []);
  assert.equal(menu.name.uk, "Меню на 41 тиждень 2026");
  assert.deepEqual(
    menu.days.map((d) => d.meals.map((m) => [m.mealType, m.serviceWindow])),
    [[["lunch", "12:00-14:00"]], [["lunch", "12:00-14:00"]], [["dinner", "18:00-20:00"]]],
  );
  const dish = menu.days[0].meals[0].dishes[0];
  assert.equal(dish.id, DISH);
  assert.equal(dish.name.en, "Tomato and egg stir-fry");
  assert.ok(dish.description && dish.description.zh);
  assert.deepEqual(dish.composition.map((c) => c.ingredientRef), ["tomato", "egg", "scallion"]);
  assert.equal(dish.composition[0].name.uk, "Помідор");
  assert.deepEqual(dish.allergens, []);
  assert.equal(dish.approxGrams, 249); // 手算见 packages/core/test/sheets.test.mjs 头注
  assert.equal(dish.approxGramsIncomplete, undefined);
  rmSync(root, { recursive: true, force: true });
});

test("build.json：builtAt = --at、commit（无 git → local）、plans、readiness{canTeach,canPlan,canProcure,missing}", () => {
  const root = tempRepo();
  const out = path.join(root, "out");
  const { build } = runBuild({ root, outDir: out, at: AT });
  const onDisk = readJson(path.join(out, BUILD_FILE));
  assert.deepEqual(onDisk, build);
  assert.deepEqual(Object.keys(build), ["builtAt", "commit", "plans", "readiness"]);
  assert.equal(build.builtAt, AT);
  assert.match(build.commit, /^(local|[0-9a-f]{40})$/);
  assert.deepEqual(build.plans, [PLAN]);
  assert.deepEqual(build.readiness, {
    [DISH]: { canTeach: false, canPlan: true, canProcure: true, missing: ["prep:egg", "prep:salt", "prep:cooking-oil"] },
  });
  // commit 可显式注入（CI / 测试固定值）
  assert.equal(runBuild({ root, outDir: out, at: AT, write: false, commit: "abc" }).build.commit, "abc");
  rmSync(root, { recursive: true, force: true });
});

test("example 菜：进引擎前从 dishes 剔除、不进 readiness；被 menu-plan 引用 → warning + 三张单 missing-dish，其余 plan 不受影响", () => {
  const root = tempRepo();
  const { dishId, planId } = addExampleDish(root);
  const data = loadData(root);
  assert.deepEqual(data.excludedDishes, [dishId]);
  assert.deepEqual(Object.keys(data.dishes), [DISH]);

  const out = path.join(root, "out");
  const { build, sheets, issues } = runBuild({ root, outDir: out, at: AT });
  assert.deepEqual(build.plans, [PLAN, planId]);
  assert.deepEqual(Object.keys(build.readiness), [DISH]);

  const codes = issues.map((i) => `${i.planId}/${i.sheet}/${i.code}`);
  assert.deepEqual(codes, [
    `${planId}/build/example-dish-referenced`,
    `${planId}/prep/missing-dish`,
    `${planId}/purchase/missing-dish`,
    `${planId}/menu/missing-dish`,
  ]);
  assert.equal(issues[0].kind, "warning");
  assert.equal(issues[0].dishRef, dishId);

  const p42 = sheets[planId];
  assert.equal(p42.prep.days[0].meals[0].issue.code, "missing-dish");
  assert.deepEqual(p42.purchase.orders, []);
  assert.equal(p42.menu.days[0].meals[0].dishes[0].issue.code, "missing-dish");
  assert.ok(!JSON.stringify(sheets).includes("示例菜"), "示例菜的任何文本都不得进入产物");
  assert.deepEqual(sheets[PLAN].purchase.issues, []);
  assert.equal(existsSync(path.join(out, "prep", `${planId}.json`)), true, "有问题的 plan 仍写出（门禁靠 --check）");
  rmSync(root, { recursive: true, force: true });
});

test("--check：不写任何文件；干净数据 exit 0，有 issue 时逐条打印并 exit 1", () => {
  const root = tempRepo();
  const out = path.join(root, "out");
  const ok = runCli(["--check", "--out", out, "--at", AT], root);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /\[check\] 未写任何文件。/);
  assert.match(ok.stdout, /issues 0/);
  assert.equal(existsSync(out), false, "check 不得创建输出目录");
  assert.equal(existsSync(path.join(root, DEFAULT_OUT_DIR)), false);

  const { dishId } = addExampleDish(root);
  const bad = runCli(["--check", "--out", out, "--at", AT], root);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /issues 4 条/);
  assert.match(bad.stdout, new RegExp(`example-dish-referenced dish=${dishId}`));
  assert.match(bad.stdout, /purchase ✗ missing-dish/);
  assert.equal(existsSync(out), false);
  rmSync(root, { recursive: true, force: true });
});

test("黄金快照：与 data/purchase-orders/week-41-*.json 逐行一致（5 行、0 差异）；篡改 packs / trace 可检出", () => {
  const root = tempRepo();
  const { sheets } = runBuild({ root, at: AT, write: false });
  const cmp = compareSnapshots(root, sheets);
  assert.equal(cmp.linesCompared, 5);
  assert.deepEqual(cmp.diffs, []);
  assert.deepEqual(
    cmp.entries.map((e) => [path.basename(e.file), e.supplier, e.lines]),
    [
      ["week-41-hongda.json", "宏达粮油调味批发", 2],
      ["week-41-lvyuan.json", "绿源农产品配送", 3],
    ],
  );

  // 篡改快照的番茄行：packs 19→18、grossNeed 改值 → 两处差异，其余 4 行仍一致
  const file = path.join(root, "data/purchase-orders/week-41-lvyuan.json");
  const snap = readJson(file);
  const tomato = snap.lines.find((l) => l.ingredientRef === "tomato");
  tomato.packs = 18;
  tomato.trace.grossNeed.value = 1;
  writeJson(file, snap);
  const bad = compareSnapshots(root, sheets);
  assert.equal(bad.linesCompared, 4);
  assert.deepEqual(
    bad.diffs.map((d) => [d.path, d.expected, d.actual]),
    [
      ["lines[tomato].packs", 18, 19],
      ["lines[tomato].trace.grossNeed.value", 1, 93176.4706],
    ],
  );
  const cli = runCli(["--check", "--compare-snapshots", "--at", AT], root);
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /快照比对合计：4 行一致，2 处差异/);
  assert.match(cli.stdout, /lines\[tomato\]\.packs：快照 18 ≠ 生成 19/);
  rmSync(root, { recursive: true, force: true });
});

test("--at 固定后两次构建字节一致；过期 plan 的产物被清理", () => {
  const root = tempRepo();
  const out = path.join(root, "out");
  const snapshot = () =>
    Object.fromEntries(
      [BUILD_FILE, ...SHEET_DIRS.flatMap((d) => readdirSync(path.join(out, d)).map((f) => `${d}/${f}`))].map((f) => [
        f,
        readFileSync(path.join(out, f), "utf8"),
      ]),
    );
  execFileSync(process.execPath, [SCRIPT, "--root", root, "--out", out, "--at", AT]);
  const first = snapshot();
  execFileSync(process.execPath, [SCRIPT, "--root", root, "--out", out, "--at", AT]);
  assert.deepEqual(snapshot(), first);
  assert.deepEqual(Object.keys(first).sort(), ["build.json", "menu/week-41.json", "prep/week-41.json", "purchase/week-41.json"]);

  // 输出目录里有一份已删除 plan 的旧文件 → 重建后被清掉；非 .json 文件不动
  mkdirSync(path.join(out, "prep"), { recursive: true });
  writeFileSync(path.join(out, "prep", "week-40.json"), "{}");
  writeFileSync(path.join(out, "prep", "notes.txt"), "keep");
  runBuild({ root, outDir: out, at: AT });
  assert.equal(existsSync(path.join(out, "prep", "week-40.json")), false);
  assert.equal(existsSync(path.join(out, "prep", "notes.txt")), true);
  rmSync(root, { recursive: true, force: true });
});

// New target tests use isolated Git repositories: committed JSON and image bytes are
// real fixed revisions, not mock persistence or production write tests.
function git(root,...args) { return execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
function committedTeamRoot() {
  const root=tempRepo();
  const plan=readJson(path.join(root,'data/menu-plans/week-41.json'));
  plan.schemaVersion='3';for(const meal of plan.meals) delete meal.plannedServings;
  writeJson(path.join(root,'data/menu-plans/week-41.json'),plan);
  git(root,'init','-b','main');git(root,'add','data');
  git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Fixed team fixture');
  return {root,revision:git(root,'rev-parse','HEAD')};
}
function commitData(root) {git(root,'add','data');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Next fixed inputs');return git(root,'rev-parse','HEAD');}

test('team target reads only fixed revision JSON while legacy target rejects v3 without NaN',()=>{
  const {root,revision}=committedTeamRoot();
  try {
    const file=path.join(root,'data/ingredients/tomato.json');const changed=readJson(file);changed.name.zh='Uncommitted replacement';writeJson(file,changed);
    const r=runBuild({root,target:'team-meals',commit:revision,at:AT,write:false});
    assert.deepEqual(r.build,{target:'team-meals',projectionVersion:'1',builtAt:AT,commit:revision,plans:[PLAN]});
    assert.equal(r.sheets[PLAN].teamMeals.projectionVersion,'1');
    assert.equal(r.sheets[PLAN].teamMeals.ingredients.tomato.name.zh,'番茄');
    assert.ok(r.sheets[PLAN].teamMeals.collection.items.some(i=>i.ingredientRef==='salt'));
    assert.equal(r.sheets[PLAN].teamMeals.estimates.budgetStatus,'incomplete');
    assert.equal(r.issues.filter(i=>i.kind==='error').length,0);
    assert.throws(()=>runBuild({root,target:'legacy-numeric',write:false}),/unsupported-format/);
    assert.throws(()=>runBuild({root,target:'invalid',write:false}),/target/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('team publication separates quantity warnings from broken reference errors',()=>{
 const {root}=committedTeamRoot();
 try {
   const f=path.join(root,'data/ingredients/tomato.json');const ing=readJson(f);delete ing.purchase;writeJson(f,ing);let revision=commitData(root);
   let r=runBuild({root,target:'team-meals',commit:revision,write:false,at:AT});assert.equal(r.issues.filter(i=>i.kind==='error').length,0);
   let cli=runCli(['--target','team-meals','--check','--revision',revision,'--at',AT],root);assert.equal(cli.status,0,cli.stdout+cli.stderr);
   const d=path.join(root,`data/dishes/${DISH}.json`);const dish=readJson(d);dish.components.push({ingredientRef:'missing',qty:{unit:'to-taste'}});writeJson(d,dish);revision=commitData(root);
   r=runBuild({root,target:'team-meals',commit:revision,write:true,outDir:path.join(root,'out'),at:AT});
   assert.ok(r.issues.some(i=>i.code==='missing-ingredient'&&i.kind==='error'));assert.deepEqual(r.written,[]);assert.equal(existsSync(path.join(root,'out/build.json')),false);
   cli=runCli(['--target','team-meals','--check','--revision',revision],root);assert.equal(cli.status,1,cli.stdout+cli.stderr);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team empty plan publishes an empty projection without inventing scope or servings',()=>{
 const {root}=committedTeamRoot();
 try{
  writeJson(path.join(root,'data/menu-plans/week-41.json'),{schemaVersion:'3',meals:[]});const revision=commitData(root);
  const r=runBuild({root,target:'team-meals',commit:revision,write:true,outDir:path.join(root,'out'),at:AT});
  const p=r.sheets[PLAN].teamMeals;assert.deepEqual(p.menuPlans[PLAN],{schemaVersion:'3',meals:[]});assert.deepEqual(p.selection,[]);
  assert.equal(p.estimates.budgetStatus,'not-applicable');assert.ok(r.written.includes('team-meals/week-41.json'));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team publishes an empty manifest when the saved revision contains no plans',()=>{
 const {root}=committedTeamRoot();
 try {
  rmSync(path.join(root,'data/menu-plans'),{recursive:true});const revision=commitData(root),out=path.join(root,'out');
  const r=runBuild({root,target:'team-meals',commit:revision,outDir:out,at:AT});
  assert.deepEqual(r.build,{builtAt:AT,commit:revision,plans:[],target:'team-meals',projectionVersion:'1'});
  assert.deepEqual(r.sheets,{});assert.deepEqual(r.issues,[]);assert.deepEqual(r.written,['build.json']);
  assert.deepEqual(readdirSync(out),['build.json']);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('team images use matching commit bytes and missing/escaping/local symlink assets block',()=>{
 const {root}=committedTeamRoot();
 try{
  const f=path.join(root,'data/ingredients/tomato.json'),ing=readJson(f);ing.image={src:'tomato.png',license:'own'};writeJson(f,ing);
  const original=readFileSync(path.join(ROOT,'test/fixtures/contracts/valid/local-image/data/ingredients/pattern.png'));
  writeFileSync(path.join(root,'data/ingredients/tomato.png'),original);const revision=commitData(root);
  writeFileSync(path.join(root,'data/ingredients/tomato.png'),'bad newer bytes');
  let r=runBuild({root,target:'team-meals',commit:revision,write:true,outDir:path.join(root,'out'),at:AT});
  const asset=r.sheets[PLAN].teamMeals.assets.find(a=>a.ownerPath==='data/ingredients/tomato.json');
  assert.equal(asset.status,'available');assert.deepEqual(readFileSync(path.join(root,'out',asset.path)),original);
  ing.image.src='../../../outside.png';writeJson(f,ing);const bad=commitData(root);
  r=runBuild({root,target:'team-meals',commit:bad,write:false,at:AT});assert.ok(r.issues.some(i=>i.code==='asset-unavailable'&&i.kind==='error'));
  ing.image.src='absent.png';writeJson(f,ing);let invalid=commitData(root);
  assert.ok(runBuild({root,target:'team-meals',commit:invalid,write:false}).issues.some(i=>i.code==='asset-unavailable'));
  ing.image.src='link.png';writeJson(f,ing);symlinkSync('tomato.png',path.join(root,'data/ingredients/link.png'));invalid=commitData(root);
  assert.ok(runBuild({root,target:'team-meals',commit:invalid,write:false}).issues.some(i=>i.code==='asset-unavailable'));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team technique assets retain stable IDs and original pointers after filtering, even with identical image fields',()=>{
 const {root}=committedTeamRoot();
 try {
  const termsFile=path.join(root,'data/techniques.json'),template=readJson(termsFile)[0],image={src:'shared.png',license:'own'};
  const unused={...template,id:'unused-first'};delete unused.image;
  writeJson(termsFile,[unused,{...template,id:'selected-a',image},{...template,id:'selected-b',image}]);
  const dishFile=path.join(root,`data/dishes/${DISH}.json`),dish=readJson(dishFile);
  for(const c of dish.components??[])delete c.prep;
  for(const s of dish.steps??[])delete s.techniqueRef;
  dish.components[0].prep={techniqueRef:'selected-a'};dish.steps[0].techniqueRef='selected-b';writeJson(dishFile,dish);
  writeFileSync(path.join(root,'data/shared.png'),Buffer.from(RASTERS.png,'base64'));const revision=commitData(root);
  const r=runBuild({root,target:'team-meals',commit:revision,outDir:path.join(root,'out'),at:AT}),projection=r.sheets[PLAN].teamMeals;
  assert.deepEqual(projection.techniques.map(t=>t.id),['selected-a','selected-b']);
  const assets=projection.assets.filter(a=>a.ownerPath==='data/techniques.json');
  assert.deepEqual(assets.map(a=>[a.techniqueRef,a.jsonPointer]),[['selected-a','/1/image'],['selected-b','/2/image']]);
  assert.deepEqual(assets.map(a=>a.source),[image,image]);assert.equal(assets[0].path,assets[1].path);
  assert.ok(assets.every(a=>a.status==='available'));assert.ok(r.written.includes(assets[0].path));
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('team publishes original animated WebP bytes with legal metadata order and preserves old output when later frame decoding fails',()=>{
 const {root}=committedTeamRoot(),out=path.join(root,'out');
 try {
  const file=path.join(root,'data/ingredients/tomato.json'),ingredient=readJson(file);ingredient.image={src:'tomato.webp',license:'own'};writeJson(file,ingredient);
  const animation=Buffer.from('UklGRvgAAABXRUJQVlA4WAoAAAACAAAAMQAAMQAAQU5JTQYAAAD/////AABBTk1GYgAAAAAAAAAAADEAADEAAGQAAABWUDggSgAAAHAEAJ0BKjIAMgA+kUigTCWkIyIiCACwEglpANRCgH4AfgAAEXGAXU1AFdQAAP7e1j//RguA4Hvpf/9jMftGf5xTjtX6fAeQgAAAQU5NRmIAAAAAAAAAAAAxAAAxAABkAAAAVlA4IEoAAABwBACdASoyADIAPpFIoEwlpCMiIggAsBIJaQDUQoB+AH4AABFxgF1NQBXUAAD+3tY//0YLgOB76X//YzH7Rn+cU47V+nwHkIAAAA==','base64');
  const metadata=Buffer.from([69,88,73,70,1,0,0,0,97,0]);
  const original=Buffer.concat([animation.subarray(0,12),metadata,animation.subarray(12)]);original.writeUInt32LE(original.length-8,4);
  const image=path.join(root,'data/ingredients/tomato.webp');writeFileSync(image,original);const revision=commitData(root);
  const result=runBuild({root,target:'team-meals',commit:revision,outDir:out,at:AT});
  const asset=result.sheets[PLAN].teamMeals.assets.find(a=>a.ownerPath==='data/ingredients/tomato.json');
  assert.equal(asset.status,'available');assert.deepEqual(readFileSync(path.join(out,asset.path)),original);
  const oldManifest=readFileSync(path.join(out,'build.json')),oldProjection=readFileSync(path.join(out,'team-meals/week-41.json'));
  const second=original.indexOf('ANMF',original.indexOf('ANMF')+4),bad=Buffer.from(original.subarray(0,second+32+20));
  bad.writeUInt32LE(44,second+4);bad.writeUInt32LE(20,second+28);bad.writeUInt32LE(bad.length-8,4);
  writeFileSync(image,bad);const next=commitData(root),blocked=runBuild({root,target:'team-meals',commit:next,outDir:out,at:AT});
  assert.ok(blocked.issues.some(i=>i.code==='asset-unavailable'&&i.kind==='error'));assert.deepEqual(blocked.written,[]);
  assert.deepEqual(readFileSync(path.join(out,'build.json')),oldManifest);assert.deepEqual(readFileSync(path.join(out,'team-meals/week-41.json')),oldProjection);
  assert.deepEqual(readFileSync(path.join(out,asset.path)),original);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('team requires actual commit objects, including when a tag object is reachable',()=>{
 const {root,revision}=committedTeamRoot();
 try {
  git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','tag','-a','fixture','-m','Tag is not a commit');
  const tag=git(root,'rev-parse','fixture');assert.notEqual(tag,revision);
  assert.throws(()=>runBuild({root,target:'team-meals',commit:tag,write:false}),/revision/);
  git(root,'checkout','-b','side');writeJson(path.join(root,'data/menu-plans/side.json'),{schemaVersion:'3',meals:[]});
  const side=commitData(root);git(root,'checkout','main');
  assert.throws(()=>runBuild({root,target:'team-meals',commit:side,write:false}),/revision/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team projection includes actionable missing-price warnings without inventing amounts',()=>{
 const root=tempRepo();
 try {
  const file=path.join(root,'data/ingredients/tomato.json'),ingredient=readJson(file);delete ingredient.purchase.lastPrice;writeJson(file,ingredient);
  git(root,'init','-b','main');const revision=commitData(root);
  const r=runBuild({root,target:'team-meals',commit:revision,write:false});
  const warning=r.issues.find(i=>i.code==='missing-price'&&i.ingredientRef==='tomato');
  assert.equal(warning?.kind,'warning');assert.equal(warning?.ownerPath,'data/ingredients/tomato.json');
  const projected=r.sheets[PLAN].teamMeals;
  assert.ok(projected.issues.some(i=>i.code==='missing-price'&&i.ingredientRef==='tomato'));
  assert.equal(projected.estimates.budgetStatus,'incomplete');
  assert.ok(projected.estimates.items.find(i=>i.ingredientRef==='tomato').lines.every(l=>l.line.amount===undefined));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team rejects truncated image bytes even when their header has valid dimensions',()=>{
 const {root}=committedTeamRoot();
 try {
  const file=path.join(root,'data/ingredients/tomato.json'),ingredient=readJson(file);
  ingredient.image={src:'truncated.png',license:'own'};writeJson(file,ingredient);
  const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(1,16);bytes.writeUInt32BE(1,20);
  writeFileSync(path.join(root,'data/ingredients/truncated.png'),bytes);const revision=commitData(root);
  const r=runBuild({root,target:'team-meals',commit:revision,write:true,outDir:path.join(root,'out')});
  assert.ok(r.issues.some(i=>i.code==='asset-unavailable'&&i.kind==='error'));assert.deepEqual(r.written,[]);assert.equal(existsSync(path.join(root,'out')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team publication replaces generated directories together and refuses source/output overlap',()=>{
 const {root,revision}=committedTeamRoot();const out=path.join(root,'out');
 try {
  runBuild({root,target:'team-meals',commit:revision,write:true,outDir:out});
  mkdirSync(path.join(out,'prep'));writeFileSync(path.join(out,'prep/old.json'),'{}');writeFileSync(path.join(out,'notes.txt'),'keep');
  const file=path.join(root,'data/ingredients/tomato.json'),ingredient=readJson(file);ingredient.image={src:'tomato.png',license:'own'};writeJson(file,ingredient);
  cpSync(path.join(ROOT,'test/fixtures/contracts/valid/local-image/data/ingredients/pattern.png'),path.join(root,'data/ingredients/tomato.png'));
  const next=commitData(root);
  mkdirSync(path.join(out,`assets/${next}/data/ingredients/tomato.png`),{recursive:true});
  runBuild({root,target:'team-meals',commit:next,write:true,outDir:out});
  assert.equal(readJson(path.join(out,'build.json')).commit,next);
  assert.equal(readJson(path.join(out,'team-meals/week-41.json')).sourceRevision,next);
  assert.equal(existsSync(path.join(out,'prep')),false);assert.equal(readFileSync(path.join(out,'notes.txt'),'utf8'),'keep');
  assert.throws(()=>runBuild({root,target:'team-meals',commit:next,write:true,outDir:path.join(root,'data')}),/output/);
  assert.throws(()=>runBuild({root,target:'team-meals',commit:next,write:true,outDir:root}),/output/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team source errors block publication and carry the exact owner and field',()=>{
 const {root}=committedTeamRoot();
 try {
  const file=path.join(root,`data/dishes/${DISH}.json`),dish=readJson(file);dish.provenance={source:'video'};writeJson(file,dish);
  const revision=commitData(root),r=runBuild({root,target:'team-meals',commit:revision,write:true,outDir:path.join(root,'out')});
  const issue=r.issues.find(i=>i.code==='invalid-source'&&i.jsonPointer==='/provenance/videoUrl');
  assert.equal(issue?.ownerPath,`data/dishes/${DISH}.json`);assert.equal(issue?.kind,'error');assert.deepEqual(r.written,[]);
  assert.ok(r.sheets[PLAN].teamMeals.issues.some(i=>i.jsonPointer==='/provenance/videoUrl'));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team publication keeps the complete old output on staged-write or directory-swap failure',()=>{
 const {root,revision}=committedTeamRoot(),out=path.join(root,'out');
 try {
  runBuild({root,target:'team-meals',commit:revision,write:true,outDir:out});
  const oldManifest=readFileSync(path.join(out,'build.json')),oldProjection=readFileSync(path.join(out,'team-meals/week-41.json'));
  const file=path.join(root,'data/menu-plans/week-41.json'),plan=readJson(file);plan.margin=1.2;writeJson(file,plan);const next=commitData(root);
  for(const fault of ['write','rename']) {
   const script=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
    const {runBuild}=await import(${JSON.stringify(SCRIPT)});
    const origWrite=fs.writeFileSync,origRename=fs.renameSync;let failed=false;
    fs.writeFileSync=function(file,...args){if(${JSON.stringify(fault)}==='write'&&String(file).endsWith('week-41.json'))throw new Error('injected ENOSPC');return origWrite.call(this,file,...args)};
    fs.renameSync=function(from,to){if(${JSON.stringify(fault)}==='rename'&&to===${JSON.stringify(out)}&&!failed){failed=true;throw new Error('injected rename failure')}return origRename.call(this,from,to)};
    syncBuiltinESMExports();
    try{runBuild({root:${JSON.stringify(root)},target:'team-meals',commit:${JSON.stringify(next)},outDir:${JSON.stringify(out)},write:true});process.exitCode=2;}catch(e){if(!String(e).includes('injected'))throw e;}`;
   const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
   assert.equal(child.status,0,child.stderr);
   assert.deepEqual(readFileSync(path.join(out,'build.json')),oldManifest);
   assert.deepEqual(readFileSync(path.join(out,'team-meals/week-41.json')),oldProjection);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team refuses tracked or unrecognized source directories as output without removing files',()=>{
 const {root}=committedTeamRoot();
 try {
  const tracked=path.join(root,'packages/web/src'),untracked=path.join(root,'scratch-source');
  mkdirSync(path.join(tracked,'assets'),{recursive:true});writeFileSync(path.join(tracked,'assets/logo.svg'),'<svg/>');
  git(root,'add','packages');git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Tracked web source');
  const revision=git(root,'rev-parse','HEAD');
  mkdirSync(path.join(untracked,'assets'),{recursive:true});writeFileSync(path.join(untracked,'assets/logo.svg'),'<svg/>');
  for(const outDir of [tracked,untracked]) {
   assert.throws(()=>runBuild({root,target:'team-meals',commit:revision,write:true,outDir}),/output/);
   assert.equal(readFileSync(path.join(outDir,'assets/logo.svg'),'utf8'),'<svg/>');
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team source schema/date/technique errors stop without overwriting a successful generation',()=>{
 const {root,revision}=committedTeamRoot(),out=path.join(root,'out');
 try {
  runBuild({root,target:'team-meals',commit:revision,outDir:out});
  const before=readFileSync(path.join(out,'build.json'));
  const planFile=path.join(root,'data/menu-plans/week-41.json'),original=readJson(planFile);
  const invalid={...original,dateRange:{start:'2026-10-12',end:'2026-10-01'}};writeJson(planFile,invalid);
  let bad=commitData(root),r=runBuild({root,target:'team-meals',commit:bad,outDir:out});
  assert.ok(r.issues.some(i=>i.code==='invalid-selection'&&i.kind==='error'));assert.deepEqual(r.written,[]);
  writeJson(planFile,original);
  const dishFile=path.join(root,`data/dishes/${DISH}.json`),dish=readJson(dishFile);dish.components[0].prep={techniqueRef:'missing-technique'};writeJson(dishFile,dish);
  bad=commitData(root);r=runBuild({root,target:'team-meals',commit:bad,outDir:out});
  assert.ok(r.issues.some(i=>i.code==='missing-technique'&&i.kind==='error'));assert.deepEqual(r.written,[]);
  original.meals[0].plannedServings=0;writeJson(planFile,original);bad=commitData(root);
  assert.throws(()=>runBuild({root,target:'team-meals',commit:bad,outDir:out}),/invalid_source.*week-41\.json/);
  assert.deepEqual(readFileSync(path.join(out,'build.json')),before);
  assert.equal(runCli(['--target','team-meals','--revision',bad,'--out',out],root).status,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team decoder reads complete PNG/JPEG/WebP pixels and rejects truncated data after valid headers',()=>{
 const helper=path.join(HERE,'verify-team-image.mjs');
 for(const [format,encoded] of Object.entries(RASTERS)) {
  const bytes=Buffer.from(encoded,'base64');
  const valid=spawnSync(process.execPath,[helper],{input:bytes,encoding:'utf8'});
  assert.equal(valid.status,0,`${format}: ${valid.stderr}`);
  assert.deepEqual(JSON.parse(valid.stdout),{format,width:2,height:2});
  const bad=spawnSync(process.execPath,[helper],{input:bytes.subarray(0,-8),encoding:'utf8'});
  assert.equal(bad.status,1,`${format}: truncated compressed bytes must fail`);
 }
});

test('the original malformed JPEG test material remains a rejected DQT counterexample',()=>{
 const bytes=Buffer.from(INVALID_JPEG_DQT,'base64');
 assert.equal(bytes.readUInt16BE(91),67);assert.deepEqual(bytes.subarray(158,163),Buffer.from([0x32,0x32,0x32,0xff,0xc0]));
 const result=spawnSync(process.execPath,[path.join(HERE,'verify-team-image.mjs')],{input:bytes,encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/JPEG container: expected marker/);
});

test('team never publishes when its decoder times out or returns a missing or malformed result',()=>{
 const {root}=committedTeamRoot();
 try {
  const file=path.join(root,'data/ingredients/tomato.json'),ingredient=readJson(file);ingredient.image={src:'tomato.png',license:'own'};writeJson(file,ingredient);
  writeFileSync(path.join(root,'data/ingredients/tomato.png'),Buffer.from(RASTERS.png,'base64'));const revision=commitData(root);
  for(const response of ['', 'not-json', '{}', '{"format":"png","width":0,"height":2}', 'timeout']) {
   const code=`import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
    const {runBuild}=await import(${JSON.stringify(SCRIPT)});const original=childProcess.execFileSync;
    childProcess.execFileSync=function(command,args,options){if(args[0]?.endsWith('verify-team-image.mjs')){if(${JSON.stringify(response)}==='timeout')throw new Error('ETIMEDOUT');return Buffer.from(${JSON.stringify(response)});}return original.call(this,command,args,options)};
    syncBuiltinESMExports();const r=runBuild({root:${JSON.stringify(root)},target:'team-meals',commit:${JSON.stringify(revision)},outDir:${JSON.stringify(path.join(root,'out'))}});
    if(!r.issues.some(i=>i.code==='asset-unavailable'&&i.kind==='error')||r.written.length)process.exitCode=2;`;
   const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});
   assert.equal(child.status,0,child.stderr||`Decoder response incorrectly accepted: ${response}`);
  }
  assert.equal(existsSync(path.join(root,'out')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('team remote images remain unpinned and unsupported revisions never fall back',()=>{
 const {root}=committedTeamRoot();
 try{
  const f=path.join(root,'data/ingredients/tomato.json'),ing=readJson(f);ing.image={src:'https://example.org/tomato.jpg',license:'CC BY 4.0',author:'Fixture',sourceUrl:'https://example.org/source'};writeJson(f,ing);
  const revision=commitData(root);const r=runBuild({root,target:'team-meals',commit:revision,write:false,at:AT});
  assert.equal(r.sheets[PLAN].teamMeals.assets[0].status,'external-unpinned');assert.equal(r.sheets[PLAN].teamMeals.assets[0].path,undefined);
  assert.throws(()=>runBuild({root,target:'team-meals',commit:'a'.repeat(40),write:false}),/revision/);
  assert.throws(()=>runBuild({root,target:'team-meals',commit:'main',write:false}),/revision/);
  const cli=runCli(['--target','team-meals','--compare-snapshots','--out',path.join(root,'forbidden')],root);assert.equal(cli.status,1);assert.equal(existsSync(path.join(root,'forbidden')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
