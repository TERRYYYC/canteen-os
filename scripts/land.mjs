#!/usr/bin/env node
/**
 * 把子 thread 交付的 bundle 落地成 GitHub PR —— Owner 每波跑一次的唯一命令。
 *
 *   node scripts/land.mjs            # 处理 .handoff/*.bundle：fetch 分支 → push → gh pr create → 移到 .handoff/landed/
 *   node scripts/land.mjs --dry-run  # 只列出会做什么
 *
 * 子 thread 在沙箱里不能 push，所以它把提交打成 git bundle 放到 .handoff/：
 *   .handoff/<slug>.bundle   由 `git bundle create <slug>.bundle main..<branch>` 生成
 *   .handoff/<slug>.json     { "issue": 1, "branch": "...", "title": "...", "body": "PR 正文（四段式）", "review"?: "调度线审查结论（会作为 PR 评论贴上）" }
 * 没有 .json 旁文件的 bundle 会被跳过（例如探针文件）。
 *
 * 依赖：git、gh（已 gh auth login）。在仓库根目录、main 分支、工作树干净时运行。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HANDOFF = path.join(ROOT, ".handoff");
const LANDED = path.join(HANDOFF, "landed");
const DRY = process.argv.includes("--dry-run");

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opts }).trim();

if (!existsSync(HANDOFF)) { console.log("没有 .handoff/ 目录，无事可做。"); process.exit(0); }
const dirty = sh("git", ["status", "--porcelain"]);
if (dirty && !DRY) { console.error("工作树不干净，先提交或 stash：\n" + dirty); process.exit(1); }
const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main" && !DRY) { console.error(`请在 main 上运行（当前 ${branch}）`); process.exit(1); }
if (!DRY) sh("git", ["pull", "--ff-only"]);

const bundles = readdirSync(HANDOFF).filter((f) => f.endsWith(".bundle"));
if (!bundles.length) { console.log("没有待落地的 bundle。"); process.exit(0); }
mkdirSync(LANDED, { recursive: true });

for (const b of bundles) {
  const slug = b.replace(/\.bundle$/, "");
  const metaPath = path.join(HANDOFF, `${slug}.json`);
  if (!existsSync(metaPath)) { console.log(`跳过 ${b}（无 ${slug}.json 旁文件）`); continue; }
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const { issue, branch: br, title, body } = meta;
  if (!br || !title) { console.log(`跳过 ${b}（旁文件缺 branch/title）`); continue; }

  console.log(`\n== ${slug} → 分支 ${br} · issue #${issue}`);
  try { sh("git", ["bundle", "verify", path.join(HANDOFF, b)]); } catch { console.error(`  bundle 校验失败，跳过`); continue; }
  if (DRY) { console.log(`  [dry-run] fetch → push origin ${br} → gh pr create "${title}"`); continue; }

  // fetch 分支（bundle 只含 main..branch 的提交，基于本地 main 即可解析）
  sh("git", ["fetch", path.join(HANDOFF, b), `${br}:${br}`]);
  sh("git", ["push", "-u", "origin", br]);

  const bodyFile = path.join(HANDOFF, `${slug}.pr.md`);
  writeFileSync(bodyFile, (body ?? "") + (issue ? `\n\nCloses #${issue}\n` : "\n"));
  let url = "";
  try {
    url = sh("gh", ["pr", "create", "--head", br, "--base", "main", "--title", title, "--body-file", bodyFile]);
  } catch {
    // 可能已存在 PR
    url = sh("gh", ["pr", "view", br, "--json", "url", "-q", ".url"]);
  }
  console.log(`  PR: ${url}`);
  if (meta.review) {
    const rf = path.join(HANDOFF, `${slug}.review.md`);
    writeFileSync(rf, meta.review + "\n");
    try { sh("gh", ["pr", "comment", br, "--body-file", rf]); console.log("  已贴调度线审查结论"); } catch {}
  }
  if (issue) {
    try { sh("gh", ["issue", "comment", String(issue), "--body", `PR 已开：${url}（由 land.mjs 落地，分支 \`${br}\`）`]); } catch {}
  }
  for (const f of [b, `${slug}.json`, `${slug}.pr.md`, `${slug}.review.md`]) {
    try { renameSync(path.join(HANDOFF, f), path.join(LANDED, f)); } catch {}
  }
}
console.log("\n完成。去 GitHub 看 PR，CI 绿 + 调度线 Approve 后合并。");
