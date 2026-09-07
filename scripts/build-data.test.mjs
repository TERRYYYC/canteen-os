/**
 * scripts/build-data.mjs 单元测试（node:test，零依赖；需先 npm --prefix packages/core run build）。
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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

const readJson = (abs) => JSON.parse(readFileSync(abs, "utf8"));
const writeJson = (abs, data) => writeFileSync(abs, JSON.stringify(data, null, 2) + "\n");

/** 临时仓库：复制 data/（无 .git → commit 为 "local"） */
function tempRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "build-data-"));
  cpSync(path.join(ROOT, "data"), path.join(root, "data"), { recursive: true });
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
  const snap = readJson(path.join(ROOT, "data/purchase-orders/week-41-lvyuan.json"));
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
