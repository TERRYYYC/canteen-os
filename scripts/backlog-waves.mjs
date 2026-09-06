#!/usr/bin/env node
/**
 * 从 .github/backlog/round-1.json 的 blockedBy 依赖算出"可并行的波次"（拓扑分层），
 * 给调度 thread 派工用：同一波次里的 issue 互不依赖，可以同时开子 thread。
 *
 *   node scripts/backlog-waves.mjs                # 全部里程碑
 *   node scripts/backlog-waves.mjs --milestone v0.2
 *   node scripts/backlog-waves.mjs --md           # 输出 markdown 表（贴进文档）
 *
 * 规则：波次 = max(本里程碑内依赖的波次) + 1（跨里程碑依赖视为已完成）；owner:terry 的任务单列，不占 agent 并行度。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backlog = JSON.parse(readFileSync(path.join(ROOT, ".github/backlog/round-1.json"), "utf8"));
const args = process.argv.slice(2);
const msFilter = args.includes("--milestone") ? args[args.indexOf("--milestone") + 1] : undefined;
const MD = args.includes("--md");

let lock = {};
try { lock = JSON.parse(readFileSync(path.join(ROOT, ".github/backlog/round-1.lock.json"), "utf8")).issues ?? {}; } catch {}

const byKey = Object.fromEntries(backlog.issues.map((i) => [i.key, i]));
const wave = {};
function waveOf(key, seen = new Set()) {
  if (wave[key] != null) return wave[key];
  if (seen.has(key)) throw new Error(`依赖环：${[...seen, key].join(" → ")}`);
  seen.add(key);
  // 跨里程碑的依赖视为已完成（上一里程碑收尾时验收），只在本里程碑内分层
  const deps = (byKey[key].blockedBy ?? []).filter((d) => byKey[d].milestone === byKey[key].milestone);
  wave[key] = deps.length ? Math.max(...deps.map((d) => waveOf(d, new Set(seen)))) + 1 : 1;
  return wave[key];
}
backlog.issues.forEach((i) => waveOf(i.key));

const area = (i) => (i.labels.find((l) => l.startsWith("area:")) ?? "area:-").slice(5);
const isTerry = (i) => i.labels.includes("owner:terry") && !i.labels.includes("owner:agent");
const ref = (i) => (lock[i.key] ? `#${lock[i.key]}` : i.key);

for (const m of backlog.milestones) {
  if (msFilter && !m.title.startsWith(msFilter)) continue;
  const list = backlog.issues.filter((i) => i.milestone === m.title);
  const waves = [...new Set(list.map((i) => wave[i.key]))].sort((a, b) => a - b);
  const maxAgents = Math.max(...waves.map((w) => list.filter((i) => wave[i.key] === w && !isTerry(i)).length));
  if (MD) {
    console.log(`\n### ${m.title}（截止 ${m.due}，agent 并行度峰值 ${maxAgents}）\n`);
    console.log(`| 波次 | agent 任务（可同时开） | Terry 任务 |\n|---|---|---|`);
    waves.forEach((w, idx) => {
      const ag = list.filter((i) => wave[i.key] === w && !isTerry(i)).map((i) => `${ref(i)} ${i.title.replace(/^\[v[\d.]+\]\s*/, "")} _(${area(i)})_`).join("<br>");
      const te = list.filter((i) => wave[i.key] === w && isTerry(i)).map((i) => `${ref(i)} ${i.title.replace(/^\[v[\d.]+\]\[Terry\]\s*|^\[v[\d.]+\]\s*/, "")}`).join("<br>");
      console.log(`| ${idx + 1} | ${ag || "—"} | ${te || "—"} |`);
    });
  } else {
    console.log(`\n${m.title}  (due ${m.due}, agent 并行度峰值 ${maxAgents})`);
    waves.forEach((w, idx) => {
      console.log(`  wave ${idx + 1}`);
      list.filter((i) => wave[i.key] === w).forEach((i) => console.log(`    ${isTerry(i) ? "[Terry]" : `[agent:${area(i)}]`.padEnd(14)} ${ref(i)} ${i.title}`));
    });
  }
}
