/**
 * buildMenuSheet：menu-plan → 顾客菜单结构化 JSON（MenuSheet，契约见 sheets.ts）。
 * 纯函数：dishes / ingredients 由调用方注入。
 *
 * 规则：
 *  - 同日期同餐次的多条 meal 合并为一个 MenuSheetMeal（dishes[] 多项），serviceWindow 取首个非空；
 *  - composition：按配料顺序、去调料（role=seasoning 或 to-taste）、带食材图；
 *  - approxGrams：每份估算克重 = Σ(配料净重折克) / baseServings，四舍五入到整数——
 *    g 原值、kg×1000、ml 按 1:1、l×1000、pcs×pcsToGram；to-taste 跳过；调料**计入**；
 *    无 pcsToGram / tbsp·tsp·pinch·pack 无折算路径 → 跳过并标 approxGramsIncomplete（绝不猜测）；
 *  - allergens：第一轮 ingredient 无该字段（schema 冻结）→ 恒为 []；
 *  - 菜品缺失/未激活：条目照常出现并带 issue，不静默。
 */
import type { Dish, Id, Ingredient, MenuPlan, Quantity } from "../types.js";
import type { MenuSheet, MenuSheetDay, MenuSheetDish, MenuSheetMeal, SheetIssue } from "../sheets.js";
import { idAsName, isSeasoningComponent, sortedMeals } from "./shared.js";

/**
 * 单个配料量折算为克（估算口径，非采购换算）：
 * g / kg / ml(1:1) / l / pcs×pcsToGram；to-taste → 0（跳过，不算缺口）；
 * 无路径（pcs 无 pcsToGram、tbsp/tsp/pinch/pack、value 缺失）→ null。
 */
export function approxGramsOf(qty: Quantity, ingredient?: Ingredient): number | null {
  if (qty.unit === "to-taste") return 0;
  const v = qty.value;
  if (typeof v !== "number" || !(v >= 0)) return null;
  switch (qty.unit) {
    case "g":
    case "ml":
      return v;
    case "kg":
    case "l":
      return v * 1000;
    case "pcs":
      return ingredient?.pcsToGram ? v * ingredient.pcsToGram : null;
    default:
      return null;
  }
}

export function buildMenuSheet(
  menuPlan: MenuPlan,
  dishes: Readonly<Record<Id, Dish>>,
  ingredients: Readonly<Record<Id, Ingredient>>,
): MenuSheet {
  const issues: SheetIssue[] = [];
  const seenDishLevel = new Set<string>();
  const pushDishLevel = (issue: SheetIssue): void => {
    const key = `${issue.code}|${issue.dishRef}|${issue.ingredientRef ?? ""}`;
    if (seenDishLevel.has(key)) return;
    seenDishLevel.add(key);
    issues.push(issue);
  };

  const days: MenuSheetDay[] = [];
  const dayByDate = new Map<string, MenuSheetDay>();
  const mealByKey = new Map<string, MenuSheetMeal>();

  for (const meal of sortedMeals(menuPlan)) {
    let day = dayByDate.get(meal.date);
    if (!day) {
      day = { date: meal.date, meals: [] };
      dayByDate.set(meal.date, day);
      days.push(day);
    }
    const key = `${meal.date}|${meal.mealType}`;
    let m = mealByKey.get(key);
    if (!m) {
      m = { mealType: meal.mealType, dishes: [] };
      mealByKey.set(key, m);
      day.meals.push(m);
    }
    if (meal.serviceWindow && !m.serviceWindow) m.serviceWindow = meal.serviceWindow;

    const dish = dishes[meal.dishRef];
    const entry: MenuSheetDish = {
      id: meal.dishRef,
      name: dish?.name ?? idAsName(meal.dishRef),
      composition: [],
      allergens: [],
      approxGrams: null,
    };
    m.dishes.push(entry);
    if (!dish) {
      const issue: SheetIssue = {
        code: "missing-dish",
        dishRef: meal.dishRef,
        date: meal.date,
        mealType: meal.mealType,
        message: `菜单 ${meal.date} ${meal.mealType} 引用的菜品 ${meal.dishRef} 在 data/dishes/ 不存在`,
      };
      entry.issue = issue;
      issues.push(issue);
      continue;
    }
    if (dish.description) entry.description = dish.description;
    if (dish.image) entry.image = dish.image;
    if ((dish.status ?? "draft") !== "active") {
      const issue: SheetIssue = {
        code: "dish-not-active",
        dishRef: meal.dishRef,
        date: meal.date,
        mealType: meal.mealType,
        message: `菜品 ${meal.dishRef} 状态为 ${dish.status ?? "draft"}（非 active），仍列出但需处理`,
      };
      entry.issue = issue;
      issues.push(issue);
    }

    const comps = dish.components ?? [];
    for (const comp of comps) {
      const ing = ingredients[comp.ingredientRef];
      if (!ing) {
        pushDishLevel({
          code: "missing-ingredient",
          dishRef: meal.dishRef,
          ingredientRef: comp.ingredientRef,
          message: `菜品 ${meal.dishRef} 的配料 ${comp.ingredientRef} 在 data/ingredients/ 不存在（名字回退为 id）`,
        });
      }
      if (isSeasoningComponent(comp, ing)) continue; // 成分句去调料（克重仍计入，见下）
      const item = { ingredientRef: comp.ingredientRef, name: ing?.name ?? idAsName(comp.ingredientRef) };
      entry.composition.push(ing?.image ? { ...item, image: ing.image } : item);
    }

    // 每份估算克重：Σ 折克 / baseServings，四舍五入到整数；缺口显式标记
    if (dish.baseServings && comps.length > 0) {
      let sum = 0;
      let incomplete = false;
      for (const comp of comps) {
        const g = approxGramsOf(comp.qty, ingredients[comp.ingredientRef]);
        if (g === null) incomplete = true;
        else sum += g;
      }
      entry.approxGrams = Math.round(sum / dish.baseServings);
      if (incomplete) entry.approxGramsIncomplete = true;
    } else {
      pushDishLevel({
        code: "dish-incomplete",
        dishRef: meal.dishRef,
        message: `菜品 ${meal.dishRef} 缺 baseServings 或 components，无法估算每份克重（approxGrams=null）`,
      });
    }
  }

  const sheet: MenuSheet = { days, issues };
  if (menuPlan.name) sheet.name = menuPlan.name;
  if (menuPlan.dateRange) sheet.dateRange = menuPlan.dateRange;
  return sheet;
}
