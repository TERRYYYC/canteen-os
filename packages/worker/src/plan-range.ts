import type { AnyMenuPlan } from "@canteenos/core";

/** Schema validation precedes this v3 cross-field check. */
export function planRangeError(value: unknown): string | null {
  const plan = value as AnyMenuPlan;
  if (plan.schemaVersion !== '3' || !plan.dateRange) return null;
  const {start, end} = plan.dateRange;
  if (start > end) return '/dateRange';
  const index = plan.meals.findIndex(meal => meal.date < start || meal.date > end);
  return index < 0 ? null : `/meals/${index}/date`;
}
