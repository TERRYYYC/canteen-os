/**
 * 跨屏内存 store（docs/specs/v03-admin-frontend-contract.md §3.5；签名钉死，#21–#25 只读写不改）。
 *
 * 只放**未保存**的东西：已保存的一切一律回 api 拿。进程内内存，刷新即失——这是有意的（不落 localStorage）。
 *
 *   - 未保存的周计划：#22 导入后写入，#21 读出来渲染并允许撤销（一层）。
 *   - 跨屏「带着一句话去下一屏」（handoff）：替代 query string —— 隐私红线：不把数据放 URL（D-15）。
 *
 * 存取都做一次 structuredClone：屏内后续改动不会悄悄改掉 store 里的那份，反之亦然。
 */
import type { MenuPlan } from "@canteenos/core";

export type DraftSource = "import" | "copy-last-week" | "edit";

interface DraftEntry {
  plan: MenuPlan;
  source: DraftSource;
  /** 上一层（一层撤销）；null = 撤销后回到「没有草稿」 */
  prev: { plan: MenuPlan; source: DraftSource } | null;
}

const drafts = new Map<string, DraftEntry>();

export function getDraftPlan(planId: string): MenuPlan | null {
  const entry = drafts.get(planId);
  return entry ? structuredClone(entry.plan) : null;
}

/** 草稿从哪来（#21 顶部「已导入 N 行 · 还没保存」/「已复制上周」的文案依据）；没有草稿 → null */
export function getDraftSource(planId: string): DraftSource | null {
  return drafts.get(planId)?.source ?? null;
}

export function setDraftPlan(planId: string, plan: MenuPlan, source: DraftSource): void {
  const current = drafts.get(planId);
  drafts.set(planId, {
    plan: structuredClone(plan),
    source,
    prev: current ? { plan: current.plan, source: current.source } : null,
  });
}

export function clearDraftPlan(planId: string): void {
  drafts.delete(planId);
}

/** 一层撤销：回到上一次 setDraftPlan 之前的状态（可能是「没有草稿」）。没有可撤销的 → false */
export function undoDraftPlan(planId: string): boolean {
  const entry = drafts.get(planId);
  if (!entry) return false;
  if (entry.prev) drafts.set(planId, { plan: entry.prev.plan, source: entry.prev.source, prev: null });
  else drafts.delete(planId);
  return true;
}

export interface Handoff {
  /** #22 「新建」→ #24 预填菜名 */
  newDishName?: string;
  /** #24 「新建这个食材」→ #23 预填食材名 */
  newIngredientName?: string;
  /** 保存成功后回哪一屏（完整 hash，如 "#/admin/plan/week-43/import"） */
  returnTo?: string;
}

let handoff: Handoff = {};

/** 整体替换（不合并）：一次跳转只带一句话 */
export function setHandoff(v: Handoff): void {
  handoff = { ...v };
}

/** 读一次即清空 */
export function takeHandoff(): Handoff {
  const v = handoff;
  handoff = {};
  return v;
}
