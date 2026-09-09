/**
 * 四个写入端点（契约 §1.1 / §1.2 / §1.3 + 2026-09-08 决议追加第 2 条）：
 *
 *   POST /plan/:planId      → data/menu-plans/<planId>.json
 *   POST /ingredient/:id    → data/ingredients/<id>.json      （D-01：路径带 :id，不动 schema）
 *   POST /dish/:id/draft    → data/dishes/<id>.json           （无条件写 status: "draft"）
 *   POST /dish/:id          → data/dishes/<id>.json           （status 由请求体决定，可直接 active）
 *
 * 业务合理性一概不判（ADR-0007「没有审阅环节」）；只有 D-10 的两类**只警告不拒绝**的检查。
 */
import type { Ctx } from "../context.js";
import { addWarning, githubClient } from "../context.js";
import type { GitHubClient } from "../github.js";
import { fail, validationFailure } from "../http.js";
import { ID_RE, entityPath, looksLikeTraversal } from "../paths.js";
import { stableSerialize } from "../serialize.js";
import { validateEntity } from "../validate.js";
import { commitSingleFile } from "../write.js";

/** D-08：planId 不是 week-NN 形状**不拒绝**，只带 warning。 */
const WEEK_ID_RE = /^week-\d{1,2}$/;

export interface WriteResponse {
  ok: true;
  commit: string;
  blobSha: string;
  unchanged: boolean;
  warnings: string[];
}

function assertId(raw: string): string {
  if (looksLikeTraversal(raw)) throw fail("bad_path");
  if (!ID_RE.test(raw)) throw fail("bad_id");
  return raw;
}

function asObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw validationFailure([{ path: "", code: "type", message: "这里应该是一组字段" }]);
  }
  return body as Record<string, unknown>;
}

function ifMatch(ctx: Ctx): string | null {
  const header = ctx.request.headers.get("If-Match");
  if (header === null || header.trim() === "") {
    // §3.2：不带 If-Match 只做 ref 级检查（等价 last-write-wins），响应里说清楚。
    addWarning(ctx, "no-if-match");
    return null;
  }
  return header.trim().replace(/^"|"$/g, "");
}

/** 仓库里现有的路径集合，用来做 D-10 的悬空引用检查。一次 tree 调用拿全。 */
async function repoPaths(gh: GitHubClient, branch: string): Promise<Set<string>> {
  const entries = await gh.getTree(branch, true);
  return new Set(entries.filter((e) => e.type === "blob").map((e) => e.path));
}

async function techniqueIds(gh: GitHubClient, branch: string): Promise<Set<string>> {
  const file = await gh.getFile("data/techniques.json", branch);
  if (!file) return new Set();
  try {
    const parsed = JSON.parse(file.text) as Array<{ id?: unknown }>;
    return new Set(parsed.map((t) => String(t.id)).filter((id) => id !== "undefined"));
  } catch {
    return new Set();
  }
}

export async function handlePlan(ctx: Ctx): Promise<WriteResponse> {
  const planId = assertId(ctx.params.planId ?? "");
  const body = asObject(ctx.body);

  const result = validateEntity("plan", body);
  if (!result.valid) throw validationFailure(result.errors);

  if (!WEEK_ID_RE.test(planId)) addWarning(ctx, "plan-id-shape");

  const gh = githubClient(ctx);
  const branch = gh.branch;

  const meals = Array.isArray(body.meals) ? (body.meals as Array<Record<string, unknown>>) : [];
  const dishRefs = new Set(meals.map((m) => String(m.dishRef)));
  if (dishRefs.size > 0) {
    const paths = await repoPaths(gh, branch);
    for (const ref of dishRefs) {
      if (!paths.has(`data/dishes/${ref}.json`)) {
        addWarning(ctx, "dangling-ref");
        break;
      }
    }
  }

  const dateRange = body.dateRange as { start?: unknown } | undefined;
  const start =
    typeof dateRange?.start === "string"
      ? dateRange.start
      : typeof meals[0]?.date === "string"
        ? String(meals[0]?.date)
        : planId;

  return writeEntity(ctx, gh, {
    path: entityPath("plan", planId),
    value: body,
    subject: () => `data(plan): 排 ${start} 那周（${meals.length} 道菜）`,
  });
}

export async function handleIngredient(ctx: Ctx): Promise<WriteResponse> {
  const id = assertId(ctx.params.id ?? "");
  const body = asObject(ctx.body);

  const result = validateEntity("ingredient", body);
  if (!result.valid) throw validationFailure(result.errors);

  // D-10：pcs 食材设了 yield —— schema 只在 description 里禁止，这里只警告不拒绝。
  if (body.baseUnit === "pcs" && body.yield !== undefined) addWarning(ctx, "yield-on-pcs");

  const gh = githubClient(ctx);
  return writeEntity(ctx, gh, {
    path: entityPath("ingredient", id),
    value: body,
    subject: (exists) => `data(ingredient): ${exists ? "更新" : "新增"} ${id}`,
  });
}

export async function handleDishDraft(ctx: Ctx): Promise<WriteResponse> {
  return dishWrite(ctx, true);
}

export async function handleDish(ctx: Ctx): Promise<WriteResponse> {
  return dishWrite(ctx, false);
}

async function dishWrite(ctx: Ctx, forceDraft: boolean): Promise<WriteResponse> {
  const id = assertId(ctx.params.id ?? "");
  const body = asObject(ctx.body);

  const result = validateEntity("dish", body);
  if (!result.valid) throw validationFailure(result.errors);

  if (forceDraft) {
    // §1.3：请求体带了别的值也覆盖成 draft，并在 warnings 里说明。
    if (typeof body.status === "string" && body.status !== "draft") addWarning(ctx, "status-forced");
    body.status = "draft";
  }

  const gh = githubClient(ctx);
  const branch = gh.branch;

  const components = Array.isArray(body.components)
    ? (body.components as Array<Record<string, unknown>>)
    : [];
  const steps = Array.isArray(body.steps) ? (body.steps as Array<Record<string, unknown>>) : [];

  const ingredientRefs = new Set(components.map((c) => String(c.ingredientRef)));
  const techRefs = new Set<string>();
  for (const c of components) {
    const prep = c.prep as { techniqueRef?: unknown } | undefined;
    if (typeof prep?.techniqueRef === "string") techRefs.add(prep.techniqueRef);
  }
  for (const s of steps) {
    if (typeof s.techniqueRef === "string") techRefs.add(s.techniqueRef);
  }

  if (ingredientRefs.size > 0) {
    const paths = await repoPaths(gh, branch);
    for (const ref of ingredientRefs) {
      if (!paths.has(`data/ingredients/${ref}.json`)) {
        addWarning(ctx, "dangling-ref");
        break;
      }
    }
  }
  if (techRefs.size > 0) {
    const known = await techniqueIds(gh, branch);
    for (const ref of techRefs) {
      if (!known.has(ref)) {
        addWarning(ctx, "dangling-ref");
        break;
      }
    }
  }

  const subject = forceDraft
    ? () => `data(dish): 草稿 ${id}`
    : (exists: boolean) => `data(dish): ${exists ? "更新" : "新增"} ${id}`;

  return writeEntity(ctx, gh, { path: entityPath("dish", id), value: body, subject });
}

async function writeEntity(
  ctx: Ctx,
  gh: GitHubClient,
  params: { path: string; value: unknown; subject: (exists: boolean) => string },
): Promise<WriteResponse> {
  const content = stableSerialize(params.value);
  const outcome = await commitSingleFile(gh, {
    path: params.path,
    bytes: new TextEncoder().encode(content),
    subject: params.subject,
    role: ctx.role,
    endpoint: ctx.endpointConcrete,
    ifMatch: ifMatch(ctx),
  });

  return {
    ok: true,
    commit: outcome.commit,
    blobSha: outcome.blobSha,
    unchanged: outcome.unchanged,
    warnings: ctx.warnings,
  };
}
