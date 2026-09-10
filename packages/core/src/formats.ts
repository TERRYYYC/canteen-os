/** Explicit persisted-format upgrades. Call only after validating the source format. */
import type { AnyDish, AnyMenuPlan, DishV3, MenuPlanV3 } from './types.js';

function copyJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function upgradeMenuPlan(plan: AnyMenuPlan): MenuPlanV3 {
  return { ...copyJson(plan), schemaVersion: '3' };
}

export function upgradeDish(dish: AnyDish): DishV3 {
  return { ...copyJson(dish), schemaVersion: '3' };
}
