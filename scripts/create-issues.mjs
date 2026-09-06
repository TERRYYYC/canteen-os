#!/usr/bin/env node
/**
 * 把 .github/backlog/round-1.json 幂等同步到 GitHub Issues。
 *
 * 用法：
 *   gh auth login                                   # 一次
 *   node scripts/create-issues.mjs --dry-run        # 只打印，不联网
 *   node scripts/create-issues.mjs                  # 建标签、里程碑、issue、依赖、跟踪 issue
 *   node scripts/create-issues.mjs --milestone v0.1 # 只同步某个里程碑（前缀匹配）
 *   node scripts/create-issues.mjs --repo OWNER/REPO
 *
 * 幂等规则：
 *   - 标签按 name 覆盖（gh label create --force）
 *   - 里程碑按 title 判重，缺则建
 *   - issue 按 title 判重，缺则建；已存在的只在 body 变化时更新
 *   - 依赖：第二遍把 "Blocked by: #n" 写进 body（数据源是 JSON 的 blockedBy）
 *   - 每个里程碑一个 "[tracking] <milestone>" issue，body 是清单
 *   - 结果写 .github/backlog/round-1.lock.json（key → issue number），供 agent 引用
 *
 * 依赖：gh CLI（https://cli.github.com），Node >= 20。不引入 npm 包。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG = path.join(ROOT, ".github/backlog/round-1.json");
const LOCK = path.join(ROOT, ".github/backlog/round-1.lock.json");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const repoArg = argValue("--repo");
const msFilter = argValue("--milestone");

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function gh(ghArgs, { input, json = false } = {}) {
  const out = execFileSync("gh", ghArgs, { input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] });
  return json ? JSON.parse(out || "null") : out.trim();
}

const backlog = JSON.parse(readFileSync(BACKLOG, "utf8"));
const repo = repoArg ?? (DRY ? "OWNER/REPO" : gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]));
const issues = backlog.issues.filter((i) => !msFilter || i.milestone.startsWith(msFilter));
const byKey = Object.fromEntries(backlog.issues.map((i) => [i.key, i]));

for (const i of issues) {
  for (const dep of i.blockedBy ?? []) {
    if (!byKey[dep]) throw new Error(`issue ${i.key} 的依赖 ${dep} 不存在`);
  }
}

console.log(`${DRY ? "[dry-run] " : ""}repo=${repo}  issues=${issues.length}${msFilter ? `  milestone~=${msFilter}` : ""}\n`);

// ---------- 1. labels ----------
for (const l of backlog.labels) {
  if (DRY) { console.log(`label   ${l.name}`); continue; }
  gh(["label", "create", l.name, "--color", l.color, "--description", l.description, "--force", "--repo", repo]);
}

// ---------- 2. milestones ----------
const wantedMs = backlog.milestones.filter((m) => !msFilter || m.title.startsWith(msFilter));
let existingMs = [];
if (!DRY) existingMs = gh(["api", `repos/${repo}/milestones?state=all&per_page=100`], { json: true });
for (const m of wantedMs) {
  if (DRY) { console.log(`milestone ${m.title} (due ${m.due})`); continue; }
  if (existingMs.some((e) => e.title === m.title)) continue;
  gh(["api", "-X", "POST", `repos/${repo}/milestones`, "-f", `title=${m.title}`, "-f", `due_on=${m.due}T23:59:59Z`, "-f", `description=${m.description}`]);
  console.log(`milestone + ${m.title}`);
}

// ---------- 3. issues (create) ----------
let existing = [];
if (!DRY) existing = gh(["issue", "list", "--repo", repo, "--state", "all", "--limit", "500", "--json", "number,title,body"], { json: true });
const numberByTitle = new Map(existing.map((e) => [e.title, e.number]));
const bodyByNumber = new Map(existing.map((e) => [e.number, e.body ?? ""]));
const numberByKey = {};

const tmp = mkdtempSync(path.join(tmpdir(), "canteen-issues-"));
function writeTmp(name, content) { const p = path.join(tmp, name); writeFileSync(p, content); return p; }

function renderBody(i) {
  const deps = (i.blockedBy ?? []).map((k) => {
    const n = numberByKey[k];
    return n ? `- Blocked by #${n}（${byKey[k].title}）` : `- Blocked by ${byKey[k].title}`;
  });
  const parts = [i.body.trim()];
  if (deps.length) parts.push(`## 依赖\n${deps.join("\n")}`);
  if (i.branch) parts.push(`## 分支\n\`${i.branch}\``);
  parts.push(`---\n_由 \`scripts/create-issues.mjs\` 从 \`.github/backlog/round-1.json\`（key: \`${i.key}\`）生成；改内容请改 JSON 再重跑。_`);
  return parts.join("\n\n") + "\n";
}

for (const i of issues) {
  const labels = i.labels.join(",");
  if (DRY) {
    numberByKey[i.key] = 0;
    console.log(`issue   ${i.title}\n        labels=${labels}  milestone=${i.milestone}${i.branch ? `  branch=${i.branch}` : ""}${i.blockedBy?.length ? `  blockedBy=${i.blockedBy.join(",")}` : ""}`);
    continue;
  }
  if (numberByTitle.has(i.title)) { numberByKey[i.key] = numberByTitle.get(i.title); continue; }
  const bodyFile = writeTmp(`${i.key}.md`, renderBody(i)); // 依赖号此时可能未知，第二遍补
  const url = gh(["issue", "create", "--repo", repo, "--title", i.title, "--body-file", bodyFile, "--label", labels, "--milestone", i.milestone]);
  const n = Number(url.split("/").pop());
  numberByKey[i.key] = n;
  numberByTitle.set(i.title, n);
  bodyByNumber.set(n, "");
  console.log(`issue + #${n} ${i.title}`);
}

// ---------- 4. issues (second pass: bodies with resolved deps) ----------
if (!DRY) {
  for (const i of issues) {
    const n = numberByKey[i.key];
    const body = renderBody(i);
    if ((bodyByNumber.get(n) ?? "").trim() === body.trim()) continue;
    gh(["issue", "edit", String(n), "--repo", repo, "--body-file", writeTmp(`${i.key}.final.md`, body)]);
    console.log(`issue ~ #${n} body updated`);
  }
}

// ---------- 5. tracking issue per milestone ----------
for (const m of wantedMs) {
  const list = issues.filter((i) => i.milestone === m.title);
  const title = `[tracking] ${m.title}`;
  const lines = list.map((i) => `- [ ] ${DRY ? i.title : `#${numberByKey[i.key]}`}${DRY ? "" : ` ${i.title}`}`);
  const body = [
    `截止 **${m.due}** · ${m.description}`,
    `完成定义：\`docs/execution-brief.md\` §3 对应版本；节奏与门：\`docs/plan-for-terry.md\`。`,
    `## 清单\n${lines.join("\n")}`,
    `## 收尾三件事\n- [ ] 对照 DoD 逐条核实（跑命令，不读汇报）\n- [ ] CHANGELOG 一段 + git tag\n- [ ] 周五用真实数据演示，记录进 docs/field-test/log.md`,
    `---\n_由 \`scripts/create-issues.mjs\` 生成。_`,
  ].join("\n\n");
  if (DRY) { console.log(`tracking ${title}\n${lines.map((l) => "        " + l).join("\n")}`); continue; }
  const n = numberByTitle.get(title);
  const file = writeTmp(`tracking-${m.title}.md`, body);
  if (n) {
    if ((bodyByNumber.get(n) ?? "").trim() !== body.trim()) { gh(["issue", "edit", String(n), "--repo", repo, "--body-file", file]); console.log(`tracking ~ #${n}`); }
  } else {
    const url = gh(["issue", "create", "--repo", repo, "--title", title, "--body-file", file, "--label", "tracking", "--milestone", m.title]);
    console.log(`tracking + #${url.split("/").pop()} ${title}`);
  }
}

// ---------- 6. lock ----------
if (!DRY) {
  let lock = {};
  try { lock = JSON.parse(readFileSync(LOCK, "utf8")); } catch {}
  writeFileSync(LOCK, JSON.stringify({ ...lock, repo, updatedAt: new Date().toISOString(), issues: { ...(lock.issues ?? {}), ...numberByKey } }, null, 2) + "\n");
  console.log(`\nlock → ${path.relative(ROOT, LOCK)}`);
}
rmSync(tmp, { recursive: true, force: true });
console.log("\ndone.");
