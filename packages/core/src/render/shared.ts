/**
 * render/* 共用小工具（不从 index.ts 导出，避免与 engine.ts 的同名内部函数冲突）。
 */
import type { DishComponent, I18nString, Id, Ingredient, MealType, MenuPlan } from "../types.js";

export const MEAL_ORDER: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2 };

/** 按日期 → 餐次（早/午/晚）稳定排序；同键保持 menu-plan 原顺序 */
export function sortedMeals(menuPlan: MenuPlan): MenuPlan["meals"] {
  return [...menuPlan.meals].sort(
    (a, b) => a.date.localeCompare(b.date) || MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType],
  );
}

/** 实体不存在时的名字回退：三语均为 id（前台永不空白，且问题已进 issues） */
export function idAsName(id: Id): I18nString {
  return { zh: id, en: id, uk: id };
}

/** 数量保留 4 位小数（去浮点尾差，JSON 可读） */
export function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

/**
 * 调料判定：ingredient.role === "seasoning" 或 qty.unit === "to-taste"。
 * 备料单归「备在手边」组且不提示「无切配规格」；菜单成分句去掉它们（克重仍计入）。
 * ingredient 缺省（未注入/不存在）时只看 to-taste，其余按主料处理。
 */
export function isSeasoningComponent(comp: Pick<DishComponent, "qty">, ing?: Ingredient): boolean {
  return ing?.role === "seasoning" || comp.qty.unit === "to-taste";
}
