/**
 * 采购引擎（v2 收窄模型，ADR-0006）。全部为纯函数：无 I/O、无时钟
 * （生成时间由调用方经 EngineContext 注入）、无随机；同输入必同输出。
 *
 * 设计依据：docs/adr/0006-scope-reduction-v2.md（v2 收窄；ADR-0005 中 PO 状态机
 *           与旧七步管线口径已被其取代）
 * 流程定义：docs/modules/procurement.md §2
 * 数字基准（黄金测试）：data/menu-plans/week-41.json + data/dishes/ + data/ingredients/
 *           → 番茄 19×5kg / 鸡蛋 720 pcs = 4 箱 / 食盐 20×500g / 油 2×5L
 *           （逐格推导见 data/purchase-orders/README.md）
 *
 * 硬性约束：
 *  - 单位换算失败 / 食材缺采购规格必须产生结构化 issue，绝不猜测：
 *    该食材进入返回值 pending（"待补全"区），不阻断其余行照常出单。
 *  - 规则（ADR-0006 §3）：yield 单一数字；pcs 食材不套 yield、不套 margin；
 *    margin（默认 1.1）吸收固定尾料，作用点 = 净需求聚合之后、扣 onHand 之前；
 *    packs = max(minPacks ?? 1, ceil(需求 ÷ packSize))。
 */
import type {
  Dish,
  Id,
  Ingredient,
  I18nString,
  LineTrace,
  MealType,
  MenuPlan,
  Money,
  PurchaseOrder,
  PurchaseOrderLine,
  Quantity,
  Technique,
  TraceMeal,
  Unit,
} from "../types.js";

// ---------------------------------------------------------------------------
// 常量与上下文
// ---------------------------------------------------------------------------

/** 备量系数默认值（menuPlan.margin 缺省时使用） */
export const DEFAULT_MARGIN = 1.1;

/** 同量纲单位换算（代码常量，不建实体）：g↔kg、ml↔l；pcs↔g 只靠 Ingredient.pcsToGram */
export const UNIT_SCALE: Readonly<Partial<Record<Unit, { to: Unit; factor: number }>>> = {
  kg: { to: "g", factor: 1000 },
  l: { to: "ml", factor: 1000 },
};

/** 无 purchase.supplier（或无 purchase）时的归组名（场景 F：未指定供应商单独成组标注） */
export const UNSPECIFIED_SUPPLIER = "未指定供应商";

export interface EngineContext {
  /** 生成时间由调用方注入，保持核心确定性 */
  generatedAt: string; // ISO date-time
  /** 来源菜单计划 id（= data/menu-plans/ 文件名；MenuPlan 本体不带 id，目录即知识库） */
  menuPlanRef?: Id;
  /** PO 文件名/id 生成策略（如 (supplier) => `po-2026-10-03-${slug(supplier)}`），供调用方命名文件用 */
  nextPoId?: (supplier: string) => Id;
}

// ---------------------------------------------------------------------------
// 结构化 issue（显式错误而非猜测）
// ---------------------------------------------------------------------------

export type ProcurementIssueCode =
  | "missing-dish" // menu-plan 引用了不存在的 Dish
  | "dish-not-active" // 菜品非 active（draft/archived），该 meal 跳过
  | "dish-incomplete" // 菜品缺 components/baseServings，无法展开（readiness 不足）
  | "missing-ingredient" // component 引用了不存在的 Ingredient
  | "no-purchase-spec" // 食材无 purchase 信息 → 入 pending「待补全」区并告警
  | "unit-conversion-missing"; // 如 ml 食材的需求按 g 登记且无 pcsToGram 可用——绝不猜测

export interface ProcurementIssue {
  code: ProcurementIssueCode;
  kind: "error" | "warning";
  ingredientRef?: Id;
  dishRef?: Id;
  message: string;
}

// ---------------------------------------------------------------------------
// 中间结构
// ---------------------------------------------------------------------------

/** 单条展开需求（BOM 展开 + 份数缩放的中间结构） */
export interface ExpandedRequirement {
  date: string;
  mealType: MealType;
  dishRef: Id;
  ingredientRef: Id;
  /** 份数缩放后的净用量（原单位）：plannedServings/baseServings × qty */
  scaled: Quantity;
  scaleFactor: number;
}

/** 聚合 + 取整后的一行（renderPurchaseOrders 的输入） */
export interface ProcurementLine {
  ingredientRef: Id;
  supplier: string; // purchase.supplier 或「未指定供应商」
  line: PurchaseOrderLine; // qty/packs/trace 齐备
}

/**
 * 「待补全」行：需求可推导（或部分可推导）但无法出正式采购行——
 * 缺 purchase 规格或单位无法换算。不进 PO 快照（schema 要求完整 trace），
 * 由 formatPurchaseOrdersText 单独成区展示，不阻断整单。
 */
export interface PendingLine {
  ingredientRef: Id;
  supplier: string; // 一律为 UNSPECIFIED_SUPPLIER
  reason: Extract<ProcurementIssueCode, "no-purchase-spec" | "unit-conversion-missing">;
  /** 聚合净需求（baseUnit 计）；单位无法换算导致聚合不完整时为 null（不给误导性部分值） */
  netNeed: Quantity | null;
  /** ÷yield ×margin −onHand 后的需求；换算失败时为 null */
  grossNeed: Quantity | null;
  meals: TraceMeal[];
}

// ---------------------------------------------------------------------------
// 数值与单位工具
// ---------------------------------------------------------------------------

/** 数量保留 4 位小数（去除浮点尾差，快照可读） */
function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

/** 金额保留 2 位小数 */
function round2(x: number): number {
  return Math.round(x * 1e2) / 1e2;
}

/** 单位所属量纲的基准单位：质量 g / 体积 ml / 计数 pcs；不可换算单位（tbsp 等）为 null */
function dimBase(unit: Unit): Unit | null {
  if (unit === "g" || unit === "kg") return "g";
  if (unit === "ml" || unit === "l") return "ml";
  if (unit === "pcs") return "pcs";
  return null; // pack/tbsp/tsp/pinch：无换算路径
}

/** 同量纲内换算到基准单位（kg→g、l→ml 走 UNIT_SCALE 常量） */
function toDimBase(value: number, unit: Unit): number {
  if (unit === "g" || unit === "ml" || unit === "pcs") return value;
  const rule = UNIT_SCALE[unit];
  return rule && rule.to === dimBase(unit) ? value * rule.factor : Number.NaN;
}

/** 从基准单位换算到同量纲目标单位 */
function fromDimBase(value: number, unit: Unit): number {
  if (unit === "g" || unit === "ml" || unit === "pcs") return value;
  const rule = UNIT_SCALE[unit];
  return rule && rule.to === dimBase(unit) ? value / rule.factor : Number.NaN;
}

/**
 * 单位换算（绝不猜测，失败返回 null）：
 *  - 同单位直通；同量纲（g↔kg、ml↔l）走 UNIT_SCALE 代码常量；
 *  - pcs↔质量 只靠 ingredient.pcsToGram（可再链到 kg，如 pcs→g→kg）；
 *  - 体积↔质量、tbsp/tsp/pinch/pack 跨单位：null（调用方产出 unit-conversion-missing）。
 */
export function convertQuantity(
  value: number,
  from: Unit,
  to: Unit,
  ingredient?: Ingredient,
): number | null {
  if (from === to) return value;
  const df = dimBase(from);
  const dt = dimBase(to);
  if (df === null || dt === null) return null;
  let base: number; // 先归一到某量纲基准（g / ml / pcs）
  let baseDim: Unit;
  if (df === dt) {
    base = toDimBase(value, from);
    baseDim = df;
  } else if (df === "pcs" && dt === "g") {
    // pcs → g：一个多少克
    if (!ingredient?.pcsToGram) return null;
    base = value * ingredient.pcsToGram;
    baseDim = "g";
  } else if (df === "g" && dt === "pcs") {
    if (!ingredient?.pcsToGram) return null;
    base = toDimBase(value, from) / ingredient.pcsToGram;
    baseDim = "pcs";
  } else {
    return null; // 体积↔质量、体积↔计数：无路径
  }
  if (baseDim !== dt) return null;
  const out = fromDimBase(base, to);
  return Number.isNaN(out) ? null : out;
}

/** I18nString 取值，fallback 链：lang → zh → en → uk（docs/i18n.md） */
export function pickI18n(s: I18nString | undefined, lang: keyof I18nString): string {
  if (!s) return "";
  return s[lang] ?? s.zh ?? s.en ?? s.uk ?? "";
}

// ---------------------------------------------------------------------------
// 核心管线（research-brief-v2 §0 的五个函数）
// ---------------------------------------------------------------------------

interface RequirementAcc {
  meals: TraceMeal[];
  /** 已归一到 baseUnit 的净需求合计；ok=false 时该值不完整（仅内部参考） */
  net: number;
  /** 有 component 无法换算到 baseUnit → true（整食材进 pending，netNeed 记 null） */
  ok: boolean;
}

/**
 * expand：menuPlan → 每食材一行（带 trace）。
 * 步骤：
 *  1. BOM 展开 + 缩放：scale = plannedServings / baseServings
 *  2. 按 ingredientRef 聚合净需求 netNeed（归一到 baseUnit；
 *     pcs↔g 用 Ingredient.pcsToGram，g↔kg/ml↔l 用 UNIT_SCALE；失败 → unit-conversion-missing）
 *  3. baseUnit=g/ml：grossNeed = netNeed ÷ (yield ?? 1) × margin；
 *     baseUnit=pcs：grossNeed = netNeed（不套 yield、不乘 margin）
 *  4. trackStock=true：grossNeed = max(0, grossNeed − (onHand ?? 0))
 *  5. packs = max(minPacks ?? 1, ceil(grossNeed ÷ packSize))（packUnit ≠ baseUnit 时先常量换算）
 *  6. 组装 PurchaseOrderLine + trace（meals/netNeed/yieldApplied/marginApplied/
 *     onHandDeducted/grossNeed/packSize/packUnit/packsRaw/minPacksApplied）
 * 无 purchase 或换算失败的食材进 pending（「待补全」区），不阻断其余行。
 * 黄金测试 = data/purchase-orders/README.md 的验收基准表。
 */
export function expand(
  menuPlan: MenuPlan,
  dishes: Readonly<Record<Id, Dish>>,
  ingredients: Readonly<Record<Id, Ingredient>>,
): { lines: ProcurementLine[]; pending: PendingLine[]; issues: ProcurementIssue[] } {
  const issues: ProcurementIssue[] = [];
  const margin = menuPlan.margin ?? DEFAULT_MARGIN;

  // 1-2. BOM 展开 + 缩放 + 聚合（归一到 baseUnit）
  const acc = new Map<Id, RequirementAcc>();
  for (const meal of menuPlan.meals) {
    const dish = dishes[meal.dishRef];
    if (!dish) {
      issues.push({
        code: "missing-dish",
        kind: "error",
        dishRef: meal.dishRef,
        message: `菜单 ${meal.date} ${meal.mealType} 引用的菜品 ${meal.dishRef} 在 data/dishes/ 不存在，该餐次跳过`,
      });
      continue;
    }
    if ((dish.status ?? "draft") !== "active") {
      issues.push({
        code: "dish-not-active",
        kind: "warning",
        dishRef: meal.dishRef,
        message: `菜品 ${meal.dishRef} 状态为 ${dish.status ?? "draft"}（非 active），该餐次跳过`,
      });
      continue;
    }
    if (!dish.baseServings || !dish.components || dish.components.length === 0) {
      issues.push({
        code: "dish-incomplete",
        kind: "error",
        dishRef: meal.dishRef,
        message: `菜品 ${meal.dishRef} 缺 baseServings 或 components，无法展开，该餐次跳过`,
      });
      continue;
    }
    const scale = meal.plannedServings / dish.baseServings;
    for (const comp of dish.components) {
      const ing = ingredients[comp.ingredientRef];
      if (!ing) {
        issues.push({
          code: "missing-ingredient",
          kind: "error",
          ingredientRef: comp.ingredientRef,
          dishRef: meal.dishRef,
          message: `菜品 ${meal.dishRef} 的配料 ${comp.ingredientRef} 在 data/ingredients/ 不存在，该配料跳过`,
        });
        continue;
      }
      let entry = acc.get(comp.ingredientRef);
      if (!entry) {
        entry = { meals: [], net: 0, ok: true };
        acc.set(comp.ingredientRef, entry);
      }
      const v = convertQuantity(comp.qty.value, comp.qty.unit, ing.baseUnit, ing);
      if (v === null) {
        entry.ok = false;
        issues.push({
          code: "unit-conversion-missing",
          kind: "error",
          ingredientRef: comp.ingredientRef,
          dishRef: meal.dishRef,
          message: `配料 ${comp.ingredientRef} 的用量单位 ${comp.qty.unit} 无法换算到基准单位 ${ing.baseUnit}（绝不猜测，该食材进「待补全」区）`,
        });
      } else {
        entry.net += v * scale;
      }
      if (
        !entry.meals.some(
          (m) => m.date === meal.date && m.mealType === meal.mealType && m.dishRef === meal.dishRef,
        )
      ) {
        entry.meals.push({
          date: meal.date,
          mealType: meal.mealType,
          dishRef: meal.dishRef,
          servings: meal.plannedServings,
        });
      }
    }
  }

  // 3-6. 逐食材出采购行 / 待补全行
  const lines: ProcurementLine[] = [];
  const pending: PendingLine[] = [];
  for (const [ref, a] of acc) {
    const ing = ingredients[ref];
    if (!ing) continue; // 不会触发：acc 只在食材存在时建立
    if (!a.ok) {
      pending.push({
        ingredientRef: ref,
        supplier: UNSPECIFIED_SUPPLIER,
        reason: "unit-conversion-missing",
        netNeed: null,
        grossNeed: null,
        meals: a.meals,
      });
      continue;
    }
    const netNeed: Quantity = { value: round4(a.net), unit: ing.baseUnit };

    // 3. ÷yield ×margin（pcs 整条跳过）；4. 扣 onHand
    let need = a.net;
    let yieldApplied: number | null = null;
    let marginApplied: number | null = null;
    if (ing.baseUnit !== "pcs") {
      yieldApplied = ing.yield ?? null;
      marginApplied = margin;
      need = (need / (ing.yield ?? 1)) * margin;
    }
    let onHandDeducted: Quantity | null = null;
    if (ing.trackStock && (ing.onHand ?? 0) > 0) {
      const deducted = Math.min(need, ing.onHand as number);
      onHandDeducted = { value: round4(deducted), unit: ing.baseUnit };
      need = Math.max(0, need - deducted);
    }
    const grossNeed: Quantity = { value: round4(need), unit: ing.baseUnit };

    // 需求被库存完全覆盖 → 不出行（minPacks 是起订量而非长期订货；多余库存补充以实际需求触发）
    if (need <= 0) continue;

    // 5. 无 purchase → 「待补全」区 + 告警（不阻断）
    const p = ing.purchase;
    if (!p) {
      issues.push({
        code: "no-purchase-spec",
        kind: "warning",
        ingredientRef: ref,
        message: `食材 ${ref} 缺 purchase 采购规格，进「待补全」区（净需求 ${grossNeed.value} ${grossNeed.unit}），不阻断其余行`,
      });
      pending.push({
        ingredientRef: ref,
        supplier: UNSPECIFIED_SUPPLIER,
        reason: "no-purchase-spec",
        netNeed,
        grossNeed,
        meals: a.meals,
      });
      continue;
    }

    // 6. 包装取整（packUnit ≠ baseUnit 时先常量/pcsToGram 换算；失败 → 待补全，绝不猜测）
    const packNeed = convertQuantity(need, ing.baseUnit, p.packUnit, ing);
    if (packNeed === null) {
      issues.push({
        code: "unit-conversion-missing",
        kind: "error",
        ingredientRef: ref,
        message: `食材 ${ref} 的包装单位 ${p.packUnit} 与基准单位 ${ing.baseUnit} 无法换算（绝不猜测，该行进「待补全」区）`,
      });
      pending.push({
        ingredientRef: ref,
        supplier: UNSPECIFIED_SUPPLIER,
        reason: "unit-conversion-missing",
        netNeed,
        grossNeed,
        meals: a.meals,
      });
      continue;
    }
    const packsRaw = packNeed / p.packSize;
    const ceilPacks = Math.ceil(packsRaw - 1e-9); // 1e-9 吸收浮点尾差（如 4.000000000000001 → 4）
    const minPacks = p.minPacks ?? 1;
    const packs = Math.max(minPacks, ceilPacks);
    const minPacksApplied = packs > ceilPacks;

    const trace: LineTrace = {
      meals: a.meals,
      netNeed,
      yieldApplied,
      marginApplied,
      onHandDeducted,
      grossNeed,
      packSize: p.packSize,
      packUnit: p.packUnit,
      packsRaw: round4(packsRaw),
      minPacksApplied,
    };
    const line: PurchaseOrderLine = {
      ingredientRef: ref,
      qty: { value: round4(packs * p.packSize), unit: p.packUnit },
      packs,
      trace,
    };
    if (p.lastPrice) {
      line.unitPrice = p.lastPrice;
      line.amount = { amount: round2(packs * p.lastPrice.amount), currency: p.lastPrice.currency };
    }
    const supplier = p.supplier?.trim() ? p.supplier : UNSPECIFIED_SUPPLIER;
    lines.push({ ingredientRef: ref, supplier, line });
  }

  // 确定性输出：按 ingredientRef 排序
  lines.sort((x, y) => x.ingredientRef.localeCompare(y.ingredientRef));
  pending.sort((x, y) => x.ingredientRef.localeCompare(y.ingredientRef));
  return { lines, pending, issues };
}

// ---------------------------------------------------------------------------
// 文本渲染的本地化小表
// ---------------------------------------------------------------------------

const MEAL_LABEL: Record<keyof I18nString, Record<MealType, string>> = {
  zh: { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" },
  en: { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" },
  uk: { breakfast: "Сніданок", lunch: "Обід", dinner: "Вечеря" },
};

/** 单位显示名（数据内仍是规范符号；pcs 在 uk 场景显示 шт、zh 显示 个） */
const UNIT_LABEL: Record<keyof I18nString, Partial<Record<Unit, string>>> = {
  zh: { pcs: "个" },
  en: {},
  uk: { g: "г", kg: "кг", ml: "мл", l: "л", pcs: "шт" },
};

/** 包装量词（数据模型无包装名字段——箱/袋/桶是数据缺口，统一用通用量词） */
const PACK_LABEL: Record<keyof I18nString, string> = { zh: "包", en: "pack", uk: "уп." };

const CURRENCY_SYMBOL: Record<Money["currency"], string> = {
  CNY: "¥",
  USD: "$",
  UAH: "₴",
  EUR: "€",
};

function unitLabel(unit: Unit, lang: keyof I18nString): string {
  return UNIT_LABEL[lang][unit] ?? unit;
}

function moneyText(m: Money): string {
  return `${CURRENCY_SYMBOL[m.currency]}${m.amount.toFixed(2)}`;
}

const MEAL_ORDER: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2 };

function sortedMeals(menuPlan: MenuPlan): MenuPlan["meals"] {
  return [...menuPlan.meals].sort(
    (a, b) => a.date.localeCompare(b.date) || MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType],
  );
}

/** 展示用数量：g/ml ≥ 1000 时升级为 kg/l，去掉小数尾零 */
function displayQty(q: Quantity, lang: keyof I18nString): string {
  let { value, unit } = q;
  if ((unit === "g" || unit === "ml") && value >= 1000) {
    const rule = UNIT_SCALE[unit === "g" ? "kg" : "l"];
    value = value / (rule?.factor ?? 1000);
    unit = unit === "g" ? "kg" : "l";
  }
  const v = Math.round(value * 100) / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} ${unitLabel(unit, lang)}`;
}

// ---------------------------------------------------------------------------
// renderPrepList（场景 E：备料单，乌克兰语为主场景）
// ---------------------------------------------------------------------------

const PREP_TITLE: Record<keyof I18nString, string> = {
  zh: "【备料单】",
  en: "【Prep list】",
  uk: "【Підготовча відомість】",
};
const SERVINGS_LABEL: Record<keyof I18nString, string> = {
  zh: "份",
  en: "servings",
  uk: "порцій",
};
const NO_PREP_LABEL: Record<keyof I18nString, string> = {
  zh: "（无切配规格）",
  en: "(no prep spec)",
  uk: "(без специфікації нарізки)",
};

/**
 * renderPrepList：备料单（给帮厨，乌克兰语为主）。
 * 按日期/餐次分组列出：要准备哪些食材（份数缩放后的净量）、切成什么样
 * （prep.techniqueRef → techniques 词表三语名 + size + note）。
 * 纯函数：techniques/ingredients 由调用方读文件注入；ingredients 缺省时食材名回退为 id。
 */
export function renderPrepList(
  menuPlan: MenuPlan,
  dishes: Readonly<Record<Id, Dish>>,
  techniques: readonly Technique[],
  lang: keyof I18nString,
  ingredients?: Readonly<Record<Id, Ingredient>>,
): string {
  const techById = new Map(techniques.map((t) => [t.id, t]));
  const planName = pickI18n(menuPlan.name, lang);
  const out: string[] = [`${PREP_TITLE[lang]}${planName ? planName : ""}`.trimEnd()];

  let lastDate = "";
  for (const meal of sortedMeals(menuPlan)) {
    if (meal.date !== lastDate) {
      lastDate = meal.date;
      out.push("", `—— ${meal.date} ——`);
    }
    const dish = dishes[meal.dishRef];
    const mealLabel = MEAL_LABEL[lang][meal.mealType];
    if (!dish) {
      out.push(`${mealLabel}：⚠ ${meal.dishRef}（菜品缺失）`);
      continue;
    }
    const dishName = pickI18n(dish.name, lang) || meal.dishRef;
    if ((dish.status ?? "draft") !== "active") {
      out.push(`${mealLabel}：⚠ ${dishName}（${dish.status ?? "draft"}，未激活）`);
      continue;
    }
    out.push(`${mealLabel}：${dishName} ×${meal.plannedServings} ${SERVINGS_LABEL[lang]}`);
    if (!dish.baseServings || !dish.components?.length) {
      out.push(`  ⚠ 缺 baseServings/components，无法展开`);
      continue;
    }
    const scale = meal.plannedServings / dish.baseServings;
    for (const comp of dish.components) {
      const ingName =
        (ingredients && pickI18n(ingredients[comp.ingredientRef]?.name, lang)) ||
        comp.ingredientRef;
      const scaled: Quantity = { value: comp.qty.value * scale, unit: comp.qty.unit };
      let prepText = "";
      if (comp.prep?.techniqueRef) {
        const tech = techById.get(comp.prep.techniqueRef);
        const techName = tech
          ? pickI18n(tech.name, lang)
          : `⚠ ${comp.prep.techniqueRef}（不在词表）`;
        prepText = ` — ${techName}`;
        if (comp.prep.size) prepText += `，${comp.prep.size}`;
        const note = pickI18n(comp.prep.note, lang);
        if (note) prepText += `（${note}）`;
      } else {
        prepText = ` ${NO_PREP_LABEL[lang]}`;
      }
      out.push(`  · ${ingName} — ${displayQty(scaled, lang)}${prepText}`);
    }
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// renderPurchaseOrders（场景 F：按 supplier 分组出 PO 快照）+ 微信文本
// ---------------------------------------------------------------------------

/**
 * renderPurchaseOrders：expand 的行按 supplier 字符串分组出 PO 快照（无状态机）。
 * 「未指定供应商」组固定排在最后并带 notes 标注（文本端即"标黄"）。
 * totalAmount 仅在全行都有同币种金额时汇总；generatedAt/menuPlanRef 由 ctx 注入。
 */
export function renderPurchaseOrders(
  lines: readonly ProcurementLine[],
  _menuPlan: MenuPlan,
  ctx: EngineContext,
): PurchaseOrder[] {
  const groups = new Map<string, PurchaseOrderLine[]>();
  for (const l of lines) {
    const arr = groups.get(l.supplier) ?? [];
    arr.push(l.line);
    groups.set(l.supplier, arr);
  }
  // 未指定供应商组排最后
  if (groups.has(UNSPECIFIED_SUPPLIER)) {
    const g = groups.get(UNSPECIFIED_SUPPLIER) as PurchaseOrderLine[];
    groups.delete(UNSPECIFIED_SUPPLIER);
    groups.set(UNSPECIFIED_SUPPLIER, g);
  }
  const pos: PurchaseOrder[] = [];
  for (const [supplier, groupLines] of groups) {
    const po: PurchaseOrder = {
      schemaVersion: "2",
      supplier,
      generatedAt: ctx.generatedAt,
      lines: groupLines,
    };
    if (ctx.menuPlanRef) po.menuPlanRef = ctx.menuPlanRef;
    const amounts = groupLines.map((l) => l.amount);
    if (
      amounts.length > 0 &&
      amounts.every((a): a is Money => !!a) &&
      amounts.every((a) => a?.currency === amounts[0]?.currency)
    ) {
      po.totalAmount = {
        amount: round2(amounts.reduce((s, a) => s + (a?.amount ?? 0), 0)),
        currency: (amounts[0] as Money).currency,
      };
    }
    if (supplier === UNSPECIFIED_SUPPLIER) {
      po.notes = "⚠️ 未指定供应商：请指派供应商后再下单";
    }
    pos.push(po);
  }
  return pos;
}

export interface PoTextOptions {
  /** 食材名本地化（缺省时回退显示 ingredientRef id） */
  ingredients?: Readonly<Record<Id, Ingredient>>;
  lang?: keyof I18nString;
  /** 单头日期（缺省取 po.generatedAt 的日期部分） */
  date?: string;
}

/**
 * formatPurchaseOrderText：一张 PO 快照 → 微信转发纯文本（场景 F 排版样例：
 * `【采购单】日期 · 供应商名` 分组头、数量+单位、预估总价标"按上次价"、
 * 未指定供应商组带 ⚠️ 标注）。图片"标黄"在文本端等价于 ⚠️ 前缀。
 */
export function formatPurchaseOrderText(po: PurchaseOrder, opts: PoTextOptions = {}): string {
  const lang = opts.lang ?? "zh";
  const date = opts.date ?? po.generatedAt.slice(0, 10);
  const header =
    po.supplier === UNSPECIFIED_SUPPLIER
      ? `【采购单】${date} · ⚠️ ${UNSPECIFIED_SUPPLIER}（请先指派再下单）`
      : `【采购单】${date} · ${po.supplier}`;
  const sep = "────────────────";
  const pack = PACK_LABEL[lang];
  const rows = po.lines.map((l) => {
    const name =
      (opts.ingredients && pickI18n(opts.ingredients[l.ingredientRef]?.name, lang)) ||
      l.ingredientRef;
    const packDesc = `${l.packs} ${pack} × ${l.trace.packSize} ${unitLabel(l.trace.packUnit, lang)}`;
    const totalDesc = `共 ${displayQty(l.qty, lang)}`;
    return `${name}  ${packDesc}（${totalDesc}）`;
  });
  const priced = po.lines.filter((l) => l.amount);
  let footer: string;
  if (po.totalAmount && priced.length === po.lines.length) {
    footer = `共 ${po.lines.length} 样 · 预估 ${moneyText(po.totalAmount)}（按上次价）`;
  } else if (priced.length > 0) {
    const sum = round2(priced.reduce((s, l) => s + (l.amount?.amount ?? 0), 0));
    const cur = (priced[0] as PurchaseOrderLine).amount?.currency ?? "CNY";
    footer = `共 ${po.lines.length} 样 · 已估价 ${CURRENCY_SYMBOL[cur]}${sum.toFixed(2)}（${po.lines.length - priced.length} 样缺上次价）`;
  } else {
    footer = `共 ${po.lines.length} 样 · 无上次价记录`;
  }
  const linesOut = [header, sep, ...rows, sep, footer];
  if (po.notes) linesOut.push(po.notes);
  return linesOut.join("\n");
}

const PENDING_REASON_LABEL: Record<PendingLine["reason"], string> = {
  "no-purchase-spec": "缺采购规格（supplier/packSize）",
  "unit-conversion-missing": "单位无法换算",
};

/**
 * formatAllPurchaseOrdersText：全部 PO + 「待补全」区 → 一段完整微信文本。
 * 待补全区（缺 purchase / 单位无法换算的食材）不混入任何供应商分组。
 */
export function formatAllPurchaseOrdersText(
  pos: readonly PurchaseOrder[],
  opts: PoTextOptions & { pending?: readonly PendingLine[] } = {},
): string {
  const lang = opts.lang ?? "zh";
  const sections = pos.map((po) => formatPurchaseOrderText(po, opts));
  if (opts.pending && opts.pending.length > 0) {
    const rows = opts.pending.map((p) => {
      const name =
        (opts.ingredients && pickI18n(opts.ingredients[p.ingredientRef]?.name, lang)) ||
        p.ingredientRef;
      const need = p.grossNeed ?? p.netNeed;
      const needText = need ? `需求约 ${displayQty(need, lang)}` : "需求金额/数量待定";
      return `${name}  ${needText} — ${PENDING_REASON_LABEL[p.reason]}`;
    });
    sections.push(["⚠️ 待补全（未计入采购单）", ...rows].join("\n"));
  }
  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// renderMenu（顾客菜单）
// ---------------------------------------------------------------------------

const MENU_TITLE: Record<keyof I18nString, string> = {
  zh: "【菜单】",
  en: "【Menu】",
  uk: "【Меню】",
};

/**
 * renderMenu：顾客菜单。菜名按 lang 取值，fallback 链 zh → en → uk；
 * 按日期 → 餐次（早餐/午餐/晚餐）排序分组。菜品缺失时显式标 ⚠（不静默）。
 */
export function renderMenu(
  menuPlan: MenuPlan,
  dishes: Readonly<Record<Id, Dish>>,
  lang: keyof I18nString,
): string {
  const planName = pickI18n(menuPlan.name, lang);
  const range = menuPlan.dateRange ? `（${menuPlan.dateRange.start} — ${menuPlan.dateRange.end}）` : "";
  const out: string[] = [`${MENU_TITLE[lang]}${planName}${range}`];
  let lastDate = "";
  for (const meal of sortedMeals(menuPlan)) {
    if (meal.date !== lastDate) {
      lastDate = meal.date;
      out.push("", meal.date);
    }
    const dish = dishes[meal.dishRef];
    const name = dish ? pickI18n(dish.name, lang) || meal.dishRef : `⚠ ${meal.dishRef}`;
    out.push(`  ${MEAL_LABEL[lang][meal.mealType]}：${name}`);
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// readiness（能教 / 能排 / 能采 三关卡）
// ---------------------------------------------------------------------------

/**
 * readiness：能教 / 能排 / 能采 三关卡（允许不完整——缺什么进 missing 待办，不拒绝）。
 *  能教（teach）：有 components 且所有 component 有 prep.techniqueRef，steps 非空
 *  能排（plan）：baseServings 与全部 component 的 qty 齐备
 *  能采（buy）：所有 ingredientRef 指向的食材都存在且都有 purchase
 */
export function readiness(
  dish: Dish,
  ingredients: Readonly<Record<Id, Ingredient>>,
): { teach: boolean; plan: boolean; buy: boolean; missing: string[] } {
  const missing: string[] = [];
  const components = dish.components ?? [];
  const hasComponents = components.length > 0;

  // 能教
  let teach = hasComponents && (dish.steps?.length ?? 0) > 0;
  for (const c of components) {
    if (!c.prep?.techniqueRef) {
      teach = false;
      missing.push(`配料 ${c.ingredientRef} 缺 prep.techniqueRef 备菜规格（能教 ✗）`);
    }
  }
  if (!hasComponents) missing.push("缺 components（能教/能排/能采 ✗）");
  if (!(dish.steps?.length ?? 0)) missing.push("缺 steps 步骤（能教 ✗）");

  // 能排
  let plan = hasComponents;
  if (typeof dish.baseServings !== "number" || !(dish.baseServings > 0)) {
    plan = false;
    missing.push("缺 baseServings 基准份数（能排 ✗）");
  }
  for (const c of components) {
    if (!c.qty || !(c.qty.value > 0)) {
      plan = false;
      missing.push(`配料 ${c.ingredientRef} 缺 qty 用量（能排 ✗）`);
    }
  }

  // 能采
  let buy = hasComponents;
  for (const c of components) {
    const ing = ingredients[c.ingredientRef];
    if (!ing) {
      buy = false;
      missing.push(`配料 ${c.ingredientRef} 在 data/ingredients/ 不存在（能采 ✗）`);
    } else if (!ing.purchase) {
      buy = false;
      missing.push(`食材 ${c.ingredientRef} 缺 purchase 采购规格（能采 ✗）`);
    }
  }

  return { teach, plan, buy, missing };
}
