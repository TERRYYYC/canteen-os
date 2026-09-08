/**
 * 三个只读端点。**不产生任何 commit，不计入写入限流**（走 read 桶，D-16）。
 *
 *   GET /source/:kind/:id  契约 §1.7（D-06）—— 前端拿 blobSha 做 If-Match 的唯一途径
 *   GET /catalog           2026-09-08 决议追加第 3 条 / 前端契约 §6.3 —— 全库索引
 *   GET /changes           同上 —— 未发布改动（D-12 口径）+ 最近发布记录
 *
 * 为什么不让前端直读 GitHub：匿名 GitHub API 是 60 次/小时/IP，后台一屏就可能打光
 * （契约 §1.7）。
 */
import type { Ctx } from "../context.js";
import { githubClient } from "../context.js";
import { fail } from "../http.js";
import { ID_RE, entityPath, isSourceKind, looksLikeTraversal } from "../paths.js";

/** 一次 catalog 最多读多少个文件。见交付说明：Cloudflare 免费版单请求 50 个子请求。 */
const CATALOG_MAX_FILES = 200;
/** 一次 changes 最多展开多少个 commit 的文件列表。 */
const CHANGES_MAX_COMMITS = 30;

const MACHINE_TRANSLATION_SUBJECT = "chore(i18n): machine translations";

export async function handleSource(ctx: Ctx): Promise<unknown> {
  const kindRaw = ctx.params.kind ?? "";
  const idRaw = ctx.params.id ?? "";
  if (looksLikeTraversal(idRaw) || looksLikeTraversal(kindRaw)) throw fail("bad_path");
  if (!isSourceKind(kindRaw)) throw fail("bad_id", { message: "只能读 plan / ingredient / dish" });
  if (!ID_RE.test(idRaw)) throw fail("bad_id");

  const gh = githubClient(ctx);
  const head = await gh.getHeadSha();
  const file = await gh.getFile(entityPath(kindRaw, idRaw), head);
  if (!file) throw fail("not_found");

  let content: unknown;
  try {
    content = JSON.parse(file.text);
  } catch {
    throw fail("upstream_error", { message: "仓库里这个文件不是合法 JSON" });
  }
  return { ok: true, content, blobSha: file.sha, commit: head };
}

export async function handleCatalog(ctx: Ctx): Promise<unknown> {
  const gh = githubClient(ctx);
  const head = await gh.getHeadSha();
  const entries = (await gh.getTree(head, true)).filter((e) => e.type === "blob");

  const wanted = entries.filter(
    (e) =>
      /^data\/ingredients\/[^/]+\.json$/.test(e.path) ||
      /^data\/dishes\/[^/]+\.json$/.test(e.path) ||
      e.path === "data/techniques.json" ||
      e.path === "data/translations.lock.json",
  );
  if (wanted.length > CATALOG_MAX_FILES) {
    throw fail("upstream_error", {
      message: `知识库已经有 ${wanted.length} 个文件，超过 catalog 的一次读取上限，需要改成按需读`,
    });
  }

  const dishes: Record<string, unknown> = {};
  const ingredients: Record<string, unknown> = {};
  let techniques: unknown[] = [];
  let lock: Record<string, { status?: string; stale?: boolean }> = {};

  for (const entry of wanted) {
    const text = await gh.getBlobText(entry.sha);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue; // 坏文件不该让整个后台打不开；发布时的 Validate 才是闸门。
    }
    if (entry.path === "data/techniques.json") {
      techniques = Array.isArray(parsed) ? parsed : [];
    } else if (entry.path === "data/translations.lock.json") {
      lock = (parsed ?? {}) as Record<string, { status?: string; stale?: boolean }>;
    } else {
      const id = entry.path.slice(entry.path.lastIndexOf("/") + 1, -".json".length);
      if (entry.path.startsWith("data/dishes/")) dishes[id] = parsed;
      else ingredients[id] = parsed;
    }
  }

  const suppliers = new Set<string>();
  for (const value of Object.values(ingredients)) {
    const purchase = (value as { purchase?: { supplier?: unknown } }).purchase;
    if (typeof purchase?.supplier === "string" && purchase.supplier.length > 0) {
      suppliers.add(purchase.supplier);
    }
  }

  let machine = 0;
  let human = 0;
  let stale = 0;
  for (const entry of Object.values(lock)) {
    if (entry?.status === "machine") machine++;
    else if (entry?.status === "human") human++;
    if (entry?.stale === true) stale++;
  }

  return {
    ok: true,
    commit: head,
    dishes,
    ingredients,
    techniques,
    suppliers: [...suppliers].sort(),
    translations: { machine, human, stale },
  };
}

interface ChangeItem {
  sha: string;
  shortSha: string;
  at: string;
  role: string | null;
  endpoint: string | null;
  subject: string;
  files: string[];
}

export async function handleChanges(ctx: Ctx): Promise<unknown> {
  const gh = githubClient(ctx);
  const warnings: string[] = [];

  const online = await readOnlineBuild(ctx);
  if (!online) warnings.push("online-unknown");

  const unpublished: ChangeItem[] = [];
  let truncated = false;

  if (online?.commit) {
    const commits = await gh.compare(online.commit, gh.branch);
    const considered = commits.slice(-CHANGES_MAX_COMMITS);
    truncated = commits.length > considered.length;
    for (const commit of considered) {
      const subject = firstLine(commit.message);
      // D-12 排除一：CI 的机翻回写是上一次发布的产物，不是师傅的未发布改动。
      if (subject.startsWith(MACHINE_TRANSLATION_SUBJECT)) continue;
      const files = await gh.getCommitFiles(commit.sha);
      const dataFiles = files.filter((f) => f.startsWith("data/"));
      // D-12 排除二：不动 data/ 的 commit（含 push-trigger 的空 commit）。
      if (dataFiles.length === 0) continue;
      unpublished.push({
        sha: commit.sha,
        shortSha: commit.sha.slice(0, 7),
        at: commit.authoredAt,
        role: trailer(commit.message, "X-CanteenOS-Role"),
        endpoint: trailer(commit.message, "X-CanteenOS-Endpoint"),
        subject: subject.replace(/\s*\[skip ci\]\s*$/, ""),
        files: dataFiles,
      });
    }
  }

  const workflow = ctx.env.PUBLISH_WORKFLOW ?? "build-deploy.yml";
  let publishes: Array<{ sha: string; at: string; runId: number; isOnline: boolean }> = [];
  try {
    const runs = await gh.listRuns(workflow, "?per_page=10");
    publishes = runs.map((run) => ({
      sha: run.headSha,
      at: run.createdAt,
      runId: run.id,
      isOnline: online?.commit !== undefined && run.headSha === online.commit,
    }));
  } catch {
    warnings.push("runs-unavailable");
  }

  return {
    ok: true,
    onlineCommit: online?.commit ?? null,
    lastPublishedAt: online?.builtAt ?? publishes.find((p) => p.isOnline)?.at ?? null,
    unpublished: unpublished.reverse(),
    publishes,
    truncated,
    warnings,
  };
}

/** 线上产物的 data/build.json —— 「已经发布到哪个 commit」的唯一事实源（ADR-0007 §3）。 */
async function readOnlineBuild(ctx: Ctx): Promise<{ commit: string; builtAt: string | null } | null> {
  const base = ctx.env.PAGES_BASE_URL ?? "https://terryyyc.github.io/canteen-os/";
  const url = `${base.replace(/\/$/, "")}/data/build.json`;
  try {
    const res = await ctx.rt.fetch(url, { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) return null;
    const body = (await res.json()) as { commit?: unknown; builtAt?: unknown; generatedAt?: unknown };
    if (typeof body.commit !== "string") return null;
    const builtAt =
      typeof body.builtAt === "string"
        ? body.builtAt
        : typeof body.generatedAt === "string"
          ? body.generatedAt
          : null;
    return { commit: body.commit, builtAt };
  } catch {
    return null;
  }
}

function firstLine(message: string): string {
  return message.split("\n", 1)[0] ?? "";
}

function trailer(message: string, key: string): string | null {
  for (const line of message.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}:`)) return trimmed.slice(key.length + 1).trim();
  }
  return null;
}
