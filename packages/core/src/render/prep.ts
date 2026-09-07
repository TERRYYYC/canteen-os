/**
 * buildPrepSheet：menu-plan → 备料单结构化 JSON（PrepSheet，契约见 sheets.ts）。
 * 纯函数：dishes / techniques / ingredients 由调用方读文件注入；无 I/O、无时钟。
 *
 * 规则：
 *  - 一条 menu-plan meal 一条 PrepSheetMeal（同日期同餐次多道菜 → 多条），按日期 → 餐次排序；
 *  - qty 按 servings/baseServings 缩放（to-taste 不缩放、不编数字）；
 *  - prep.timing 缺省填 "morning"；调料（role=seasoning 或 to-taste）group 固定 "at-hand"；
 *  - 菜品缺失/未激活/不完整：该餐次照常出现（components/steps 为空）并带 issue，不静默；
 *  - 食材/技法不在库：名字回退为 id（technique.name 为 {} + techniqueMissing），并进 issues。
 */
import type { Dish, Id, Ingredient, MenuPlan, PrepTiming, Technique } from "../types.js";
import type {
  PrepGroup,
  PrepSheet,
  PrepSheetComponent,
  PrepSheetDay,
  PrepSheetMeal,
  PrepSheetPrep,
  PrepSheetStep,
  SheetIssue,
} from "../sheets.js";
import { DEFAULT_PREP_TIMING } from "../sheets.js";
import { idAsName, isSeasoningComponent, round4, sortedMeals } from "./shared.js";

/** 分组键派生：调料 → at-hand；主料 → prep.timing（缺省 morning） */
export function prepGroupOf(isSeasoning: boolean, timing?: PrepTiming): PrepGroup {
  return isSeasoning ? "at-hand" : (timing ?? DEFAULT_PREP_TIMING);
}

export function buildPrepSheet(
  menuPlan: MenuPlan,
  dishes: Readonly<Record<Id, Dish>>,
  techniques: readonly Technique[],
  ingredients: Readonly<Record<Id, Ingredient>>,
): PrepSheet {
  const techById = new Map(techniques.map((t) => [t.id, t]));
  const issues: SheetIssue[] = [];
  const seenDishLevel = new Set<string>(); // 食材/技法级问题按菜去重（同一菜排三餐只报一次）
  const pushDishLevel = (issue: SheetIssue): void => {
    const key = `${issue.code}|${issue.dishRef}|${issue.ingredientRef ?? ""}|${issue.techniqueRef ?? ""}`;
    if (seenDishLevel.has(key)) return;
    seenDishLevel.add(key);
    issues.push(issue);
  };

  const days: PrepSheetDay[] = [];
  const dayByDate = new Map<string, PrepSheetDay>();

  for (const meal of sortedMeals(menuPlan)) {
    let day = dayByDate.get(meal.date);
    if (!day) {
      day = { date: meal.date, meals: [] };
      dayByDate.set(meal.date, day);
      days.push(day);
    }
    const dish = dishes[meal.dishRef];
    const entry: PrepSheetMeal = {
      mealType: meal.mealType,
      dishRef: meal.dishRef,
      servings: meal.plannedServings,
      dish: { name: dish?.name ?? idAsName(meal.dishRef) },
      components: [],
      steps: [],
    };
    if (dish?.image) entry.dish.image = dish.image;
    day.meals.push(entry);

    const fail = (code: SheetIssue["code"], message: string): void => {
      const issue: SheetIssue = {
        code,
        message,
        dishRef: meal.dishRef,
        date: meal.date,
        mealType: meal.mealType,
      };
      entry.issue = issue;
      issues.push(issue);
    };
    if (!dish) {
      fail("missing-dish", `菜单 ${meal.date} ${meal.mealType} 引用的菜品 ${meal.dishRef} 在 data/dishes/ 不存在`);
      continue;
    }
    if ((dish.status ?? "draft") !== "active") {
      fail("dish-not-active", `菜品 ${meal.dishRef} 状态为 ${dish.status ?? "draft"}（非 active），备料单不展开`);
      continue;
    }
    if (!dish.baseServings || !dish.components || dish.components.length === 0) {
      fail("dish-incomplete", `菜品 ${meal.dishRef} 缺 baseServings 或 components，无法按份数缩放`);
      continue;
    }

    const scale = meal.plannedServings / dish.baseServings;
    for (const comp of dish.components) {
      const ing = ingredients[comp.ingredientRef];
      if (!ing) {
        pushDishLevel({
          code: "missing-ingredient",
          dishRef: meal.dishRef,
          ingredientRef: comp.ingredientRef,
          message: `菜品 ${meal.dishRef} 的配料 ${comp.ingredientRef} 在 data/ingredients/ 不存在（名字回退为 id）`,
        });
      }
      const seasoning = isSeasoningComponent(comp, ing);

      let prep: PrepSheetPrep | undefined;
      if (comp.prep?.techniqueRef) {
        const tech = techById.get(comp.prep.techniqueRef);
        prep = {
          techniqueRef: comp.prep.techniqueRef,
          technique: { name: tech?.name ?? {} },
          timing: comp.prep.timing ?? DEFAULT_PREP_TIMING,
        };
        if (!tech) {
          prep.techniqueMissing = true;
          pushDishLevel({
            code: "missing-technique",
            dishRef: meal.dishRef,
            ingredientRef: comp.ingredientRef,
            techniqueRef: comp.prep.techniqueRef,
            message: `菜品 ${meal.dishRef} 配料 ${comp.ingredientRef} 的 prep.techniqueRef ${comp.prep.techniqueRef} 不在 data/techniques.json 词表`,
          });
        }
        if (comp.prep.size) prep.size = comp.prep.size;
        if (comp.prep.note) prep.note = comp.prep.note;
        if (comp.prep.image) prep.image = comp.prep.image;
      }

      // 键序与契约一致：ingredientRef, name, image?, qty, prep?, isSeasoning, group
      const c: PrepSheetComponent = {
        ingredientRef: comp.ingredientRef,
        name: ing?.name ?? idAsName(comp.ingredientRef),
        ...(ing?.image ? { image: ing.image } : {}),
        qty:
          comp.qty.unit === "to-taste"
            ? { unit: "to-taste" }
            : { value: round4((comp.qty.value ?? 0) * scale), unit: comp.qty.unit },
        ...(prep ? { prep } : {}),
        isSeasoning: seasoning,
        group: prepGroupOf(seasoning, prep?.timing),
      };
      entry.components.push(c);
    }

    entry.steps = (dish.steps ?? []).map((s, i) => {
      const step: PrepSheetStep = { n: i + 1, text: s.text };
      if (s.techniqueRef) {
        step.techniqueRef = s.techniqueRef;
        const tech = techById.get(s.techniqueRef);
        if (tech) step.technique = { name: tech.name };
        else
          pushDishLevel({
            code: "missing-technique",
            dishRef: meal.dishRef,
            techniqueRef: s.techniqueRef,
            message: `菜品 ${meal.dishRef} 步骤 ${i + 1} 的 techniqueRef ${s.techniqueRef} 不在 data/techniques.json 词表`,
          });
      }
      if (s.image) step.image = s.image;
      if (s.clip) step.clip = s.clip;
      return step;
    });
  }

  const sheet: PrepSheet = { days, issues };
  if (menuPlan.name) sheet.name = menuPlan.name;
  if (menuPlan.dateRange) sheet.dateRange = menuPlan.dateRange;
  return sheet;
}
