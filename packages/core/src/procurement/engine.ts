/**
 * 采购引擎骨架（spec-first：只定义契约与步骤，不实现完整逻辑）。
 *
 * 设计依据：docs/adr/0005-procurement-engine-design.md
 * 流程定义：docs/modules/procurement.md §2（七步管线 + 伪代码）
 * 数字基准：examples/menu-plan-week41.example.json → 两份 PO 样例
 *
 * 硬性约束：
 *  - planProcurement 是纯函数：无 I/O、无时钟、无随机；同输入必同输出。
 *  - 单位换算失败 / 食材缺供应商必须产生结构化 error，绝不猜测。
 *  - 人数预测与库存是注入端口，不进核心。
 */
import type {
  Dish,
  Id,
  Ingredient,
  MenuPlan,
  PurchaseOrder,
  Quantity,
  Supplier,
  SupplierSku,
  Unit,
  UnitConversion,
  UnitConversionRule,
} from "../types.js";

// ---------------------------------------------------------------------------
// 端口（注入依赖）
// ---------------------------------------------------------------------------

/** 库存端口：ingredientRef → 现货数量（baseUnit 计）。空表 = 保守全量采购。 */
export type InventoryPort = Readonly<Record<Id, number>>;

/** 人数预测端口（可插拔：订餐汇总 / 历史模型 / 外部 AI）。 */
export interface ServingForecastPort {
  predict(date: string, mealType: string, canteenCtx?: unknown): number;
}

export interface EngineContext {
  inventory?: InventoryPort;
  /** 生成时间等时钟因素由调用方注入，保持核心确定性 */
  generatedAt: string; // ISO date-time
  /** PO id 生成策略（确定性要求下通常为调用方提供的序号函数） */
  nextPoId: (supplierRef: Id) => Id;
}

// ---------------------------------------------------------------------------
// 结构化错误 / 告警 / 溯源
// ---------------------------------------------------------------------------

export type ProcurementErrorCode =
  | "missing-dish" // MenuPlan 引用了不存在或非 published 的 Dish
  | "no-supplier" // 食材没有任何供应商 SKU
  | "ambiguous-supplier" // 多 SKU 且无 isPreferred 可决策
  | "unit-conversion-missing"; // 查表失败，绝不猜测

export type ProcurementWarningCode =
  | "shelf-life-risk" // 保质期 < 菜单跨度 + 提前期，建议拆单分次采购
  | "lead-time-missed" // 下单日已过 用餐日 − leadTimeDays
  | "moq-surplus" // MOQ 导致超量采购（多余量进库存）
  | "inventory-assumed-zero"; // 无库存数据，按全量采购

export interface ProcurementIssue {
  code: ProcurementErrorCode | ProcurementWarningCode;
  kind: "error" | "warning";
  ingredientRef?: Id;
  dishRef?: Id;
  message: string;
}

/** 单行采购量的完整推导链，支撑"采购准确度"审计 */
export interface LineTrace {
  ingredientRef: Id;
  meals: { date: string; mealType: string; dishRef: Id; plannedServings: number }[];
  scaleFactors: number[]; // 各 meal 的 plannedServings/baseServings
  grossQtyBase: number; // 损耗放大 + 聚合后（baseUnit）
  stockDeducted: number; // 扣减的库存（baseUnit）
  netQtyBase: number; // 净需求（baseUnit）
  packageCount: number;
  moqApplied: boolean;
}

export interface ProcurementPlan {
  purchaseOrders: PurchaseOrder[];
  issues: ProcurementIssue[];
  trace: LineTrace[];
}

// ---------------------------------------------------------------------------
// 量纲换算器（UnitConverter）：一等公民 UnitConversionRule 的解析骨架
// 规范：docs/modules/unit-conversion.md（三元组模型 / 优先级链 / 生效期语义）
// ---------------------------------------------------------------------------

/** 单次换算查询：解析所需的最小上下文。 */
export interface ConversionQuery {
  ingredientRef: Id;
  /** 有菜品上下文时传入，启用"菜品特定"优先级层 */
  dishRef?: Id;
  from: Unit;
  to: Unit;
  /**
   * 换算基准日（ISO date），决定取哪一版生效规则：
   * 步骤 4（聚合归一）用各 meal.date；步骤 6（包装取整）用 menuPlan.dateRange.end。
   * 历史采购单复算时沿用原日期，调整量纲不污染历史。
   */
  asOfDate: string;
}

export type UnitConversionErrorCode =
  | "unit-conversion-missing" // 优先级链三级均无命中规则，绝不猜测
  | "unit-conversion-ambiguous" // 同优先级层多条规则同时生效且无法裁决（数据冲突）
  | "unit-conversion-cycle"; // 链式多跳换算检测到环（如 A→B→A）

/** 换算失败的结构化错误：进 issues / 人工确认队列，引擎不猜测。 */
export interface UnresolvableConversion {
  code: UnitConversionErrorCode;
  query: ConversionQuery;
  /** ambiguous 时的候选规则 id，便于人工裁决 */
  candidateRuleIds?: Id[];
  message: string;
}

export type ConversionResult =
  | { ok: true; factor: number; rule: UnitConversionRule }
  | { ok: false; error: UnresolvableConversion };

/**
 * 按优先级链 + 生效日期解析单跳换算系数（纯函数）。
 * 解析步骤（对应 docs/modules/unit-conversion.md §3）：
 *  0. from === to → 直接 factor = 1，不查表；
 *  1. 候选过滤：from/to 与查询一致，status ≠ draft，
 *     且 effectiveFrom <= asOfDate < (effectiveTo ?? 无限期)；
 *  2. 优先级分层取最高层：菜品特定（context.dishRef === query.dishRef 且
 *     ingredientRef 匹配） > 食材特定（仅 ingredientRef 匹配） > 全局（context 为空）；
 *  3. 同层多条命中：effectiveFrom 最新者优先；仍并列 → ambiguous + candidateRuleIds；
 *  4. 无命中 → missing。链式多跳换算（如 pinch→g→kg）留待阶段 2，需环检测（cycle）。
 * TODO(阶段2): 实现；管线步骤 4/6 届时改调本函数，替代直接查
 *              Ingredient.unitConversions / 内嵌全局表。
 */
export function resolveConversionFactor(
  _rules: readonly UnitConversionRule[],
  _query: ConversionQuery,
): ConversionResult {
  throw new Error("not implemented: docs/modules/unit-conversion.md §3");
}

// ---------------------------------------------------------------------------
// 七步管线（函数签名与 TODO；实现归属阶段 2）
// ---------------------------------------------------------------------------

/** 单条展开需求（步骤 1-2 的中间结构） */
export interface ExpandedRequirement {
  date: string;
  mealType: string;
  dishRef: Id;
  ingredientRef: Id;
  /** 份数缩放后的净用量（原单位） */
  scaled: Quantity;
  scaleFactor: number;
}

/**
 * 步骤 1-2：BOM 展开 + 份数缩放。
 * 对 menuPlan.meals 逐条查 Dish，scale = plannedServings / baseServings。
 * TODO(阶段2): 实现；dishRef 缺失或非 published → issue(missing-dish)。
 */
export function expandMenuPlan(
  _menuPlan: MenuPlan,
  _dishes: Readonly<Record<Id, Dish>>,
): { requirements: ExpandedRequirement[]; issues: ProcurementIssue[] } {
  throw new Error("not implemented: procurement.md §2 step 1-2");
}

/**
 * 步骤 3：损耗率放大。
 * loss = component.lossRateOverride ?? ingredient.lossRate ?? 0
 * grossQty = scaled / (1 - loss)
 * TODO(阶段2): 实现。
 */
export function applyLossRates(
  _requirements: readonly ExpandedRequirement[],
  _ingredients: Readonly<Record<Id, Ingredient>>,
): { gross: (ExpandedRequirement & { gross: Quantity })[] } {
  throw new Error("not implemented: procurement.md §2 step 3");
}

/**
 * 步骤 4：按 ingredientRef 聚合，先归一到 Ingredient.baseUnit。
 * 换算顺序：食材专属 unitConversions → 全局 unitConversions；
 * 查表失败 → issue(unit-conversion-missing)，该条跳过，绝不猜测。
 * TODO(阶段2): 实现。换算改调 resolveConversionFactor（优先级链
 *              菜品特定 > 食材特定 > 全局通用，asOfDate = 各 meal.date），
 *              规则源从 Ingredient.unitConversions 迁到 UnitConversionRule 全集。
 */
export function aggregateByIngredient(
  _gross: readonly (ExpandedRequirement & { gross: Quantity })[],
  _ingredients: Readonly<Record<Id, Ingredient>>,
  _globalConversions: readonly UnitConversion[],
): { aggregated: Map<Id, number>; issues: ProcurementIssue[] } {
  throw new Error("not implemented: procurement.md §2 step 4");
}

/**
 * 步骤 5：扣减库存。net = max(0, grossBase - stock)。
 * 无库存数据 → net = grossBase + issue(inventory-assumed-zero)。
 * TODO(阶段2): 实现。
 */
export function deductInventory(
  _aggregated: ReadonlyMap<Id, number>,
  _inventory: InventoryPort | undefined,
): { netNeeds: Map<Id, number>; issues: ProcurementIssue[] } {
  throw new Error("not implemented: procurement.md §2 step 5");
}

/**
 * 步骤 6：选 SKU 并向上取整。
 * 选 SKU：isPreferred 优先；多 preferred 取单价最低；无 preferred → issue(ambiguous-supplier)。
 * 取整：packageCount = max(moq ?? 1, ceil(netInPackageUnit / packageSize))；
 * 包装单位 ≠ baseUnit 时先换算（失败 → unit-conversion-missing）；
 * 此处的换算同样走 resolveConversionFactor，asOfDate = menuPlan.dateRange.end。
 * TODO(阶段2): 实现；附 shelf-life-risk / lead-time-missed / moq-surplus 告警。
 */
export function roundUpToPackages(
  _netNeeds: ReadonlyMap<Id, number>,
  _ingredients: Readonly<Record<Id, Ingredient>>,
  _suppliers: readonly Supplier[],
  _globalConversions: readonly UnitConversion[],
): {
  lines: { supplierRef: Id; sku: SupplierSku; packageCount: number; netBase: number }[];
  issues: ProcurementIssue[];
} {
  throw new Error("not implemented: procurement.md §2 step 6");
}

/**
 * 步骤 7：按供应商拆分为 PO 草稿（status=draft）。
 * qty = packageCount × packageSize（packageUnit 计）；amount = packageCount × unitPrice；
 * totalAmount = Σ amount；expectedAt 留待 confirmed→ordered 时按 leadTimeDays 计算。
 * TODO(阶段2): 实现。
 */
export function splitIntoPurchaseOrders(
  _lines: readonly {
    supplierRef: Id;
    sku: SupplierSku;
    packageCount: number;
    netBase: number;
  }[],
  _menuPlan: MenuPlan,
  _ctx: EngineContext,
): PurchaseOrder[] {
  throw new Error("not implemented: procurement.md §2 step 7");
}

/**
 * 引擎入口：七步管线的纯函数组合。
 * 返回 PO 草稿 + 结构化 issues + 全量 trace；不抛业务异常（全部进 issues）。
 * TODO(阶段2): 依次调用 expandMenuPlan → applyLossRates → aggregateByIngredient
 *              → deductInventory → roundUpToPackages → splitIntoPurchaseOrders。
 */
export function planProcurement(
  _menuPlan: MenuPlan,
  _dishes: Readonly<Record<Id, Dish>>,
  _ingredients: Readonly<Record<Id, Ingredient>>,
  _suppliers: readonly Supplier[],
  _globalConversions: readonly UnitConversion[],
  _ctx: EngineContext,
): ProcurementPlan {
  throw new Error("not implemented: ADR-0005 / procurement.md §2");
}
