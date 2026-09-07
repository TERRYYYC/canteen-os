/**
 * 三张单的结构化 JSON 契约（docs/execution-brief.md §5「三张单 JSON」）。
 *
 * 生产者：scripts/build-data.mjs（v0.1）跑 buildPrepSheet / buildMenuSheet / expand；
 * 消费者：packages/web（v0.2）只读。所有可展示名字保留 I18nString——语言在客户端切换，
 * 构建期不选语言（docs/i18n.md）。文本渲染器 renderPrepList / renderMenu 建立在同一结构之上。
 *
 * 契约原文（§5）：
 *  prep:  { days:[{ date, meals:[{ mealType, dishRef, servings, dish:{name,image?},
 *           components:[{ ingredientRef, name, qty, prep?:{techniqueRef, technique:{name}, size?, note?, image?, timing}, isSeasoning }],
 *           steps:[{ n, text, techniqueRef?, image?, clip? }] }] }] }
 *  menu:  { days:[{ date, meals:[{ mealType, serviceWindow?, dishes:[{ id, name, description?, image?,
 *           composition:[{ingredientRef,name,image?}], allergens[], approxGrams }] }] }] }
 *  purchase: 与 data/purchase-orders/ 快照同构，外加 wechatText[supplier]
 * 本文件在契约之上只加可选字段（group / issue / issues / name / dateRange 等），不删不改。
 */
import type {
  DateRange,
  DishStep,
  I18nString,
  Id,
  ImageRef,
  MealType,
  PrepTiming,
  PurchaseOrder,
  Quantity,
} from "./types.js";
import type { PendingLine } from "./procurement/engine.js";

// ---------------------------------------------------------------------------
// 共用
// ---------------------------------------------------------------------------

/** prep.timing 缺省值：备料单按 timing 分组，无 timing 归「早上」（execution-brief §3 v0.1） */
export const DEFAULT_PREP_TIMING: PrepTiming = "morning";

/**
 * 备料单分组键：三个备料时机 + 「调料 · 备在手边」（at-hand）。
 * 调料（isSeasoning）一律归 at-hand，与其 prep.timing 无关；主料按 prep.timing（缺省 morning）。
 */
export type PrepGroup = PrepTiming | "at-hand";

/** 分组展示顺序：前一天 → 早上 → 开餐前 → 备在手边 */
export const PREP_GROUP_ORDER: readonly PrepGroup[] = [
  "day-before",
  "morning",
  "before-service",
  "at-hand",
];

export type SheetIssueCode =
  | "missing-dish" // menu-plan 引用的 Dish 不存在
  | "dish-not-active" // 菜品非 active（draft/archived）
  | "dish-incomplete" // 缺 baseServings / components，无法缩放或估算克重
  | "missing-ingredient" // component 引用的 Ingredient 不存在
  | "missing-technique"; // prep.techniqueRef 不在 techniques 词表

/** 结构化问题（显式记录，绝不静默；文本渲染器用 ⚠ 前缀对应） */
export interface SheetIssue {
  code: SheetIssueCode;
  message: string;
  dishRef?: Id;
  ingredientRef?: Id;
  techniqueRef?: Id;
  date?: string;
  mealType?: MealType;
}

// ---------------------------------------------------------------------------
// prep/<planId>.json
// ---------------------------------------------------------------------------

export interface PrepSheetTechnique {
  name: I18nString;
}

export interface PrepSheetPrep {
  techniqueRef: Id;
  /** 词表三语名；techniqueRef 不在词表时 name 为 {} 且 techniqueMissing=true */
  technique: PrepSheetTechnique;
  techniqueMissing?: true;
  size?: string;
  note?: I18nString;
  /** 该配料「被切的几秒」截帧 */
  image?: ImageRef;
  /** 备料时机；数据缺省时填 DEFAULT_PREP_TIMING（"morning"） */
  timing: PrepTiming;
}

export interface PrepSheetComponent {
  ingredientRef: Id;
  /** 食材三语名；食材不存在时三语均回退为 ingredientRef */
  name: I18nString;
  /** 食材图（ingredient.image，可选） */
  image?: ImageRef;
  /** 按 servings/baseServings 缩放后的量；unit = "to-taste" 时无 value（显示「适量」） */
  qty: Quantity;
  prep?: PrepSheetPrep;
  /** ingredient.role === "seasoning" 或 qty.unit === "to-taste"；调料不提示「无切配规格」 */
  isSeasoning: boolean;
  /** 分组键（派生）：isSeasoning ? "at-hand" : prep.timing ?? "morning" */
  group: PrepGroup;
}

export interface PrepSheetStep {
  n: number; // 1-based
  text: I18nString;
  techniqueRef?: Id;
  technique?: PrepSheetTechnique;
  image?: ImageRef;
  clip?: NonNullable<DishStep["clip"]>;
}

export interface PrepSheetMeal {
  mealType: MealType;
  dishRef: Id;
  /** = menu-plan.meals[].plannedServings */
  servings: number;
  dish: { name: I18nString; image?: ImageRef };
  /** 按配料原顺序；分组由 components[].group 表达 */
  components: PrepSheetComponent[];
  steps: PrepSheetStep[];
  /** 菜品缺失 / 未激活 / 不完整时的显式标记（components/steps 为空） */
  issue?: SheetIssue;
}

export interface PrepSheetDay {
  date: string; // ISO date
  meals: PrepSheetMeal[];
}

export interface PrepSheet {
  name?: I18nString;
  dateRange?: DateRange;
  days: PrepSheetDay[];
  /** 全单问题汇总（菜品级问题每餐次一条；食材/技法级问题按菜去重） */
  issues: SheetIssue[];
}

// ---------------------------------------------------------------------------
// menu/<planId>.json
// ---------------------------------------------------------------------------

export interface MenuSheetComposition {
  ingredientRef: Id;
  name: I18nString;
  image?: ImageRef;
}

export interface MenuSheetDish {
  /** = dishRef（data/dishes/ 文件名） */
  id: Id;
  name: I18nString;
  description?: I18nString;
  image?: ImageRef;
  /** 成分：按配料顺序，去调料（isSeasoning），含食材图 */
  composition: MenuSheetComposition[];
  /** 第一轮 ingredient 无 allergens 字段（schema 冻结），恒为 []；第二轮加字段后从食材读 */
  allergens: string[];
  /**
   * 每份估算克重（≈，四舍五入到整数）= Σ 配料净重 / baseServings：
   * g 原值、kg×1000、ml 1:1、l×1000、pcs×pcsToGram；to-taste 跳过；调料计入。
   * 缺 baseServings/components 时为 null。
   */
  approxGrams: number | null;
  /** 有配料无法折算（pcs 无 pcsToGram、tbsp/tsp/pinch/pack）时为 true：approxGrams 偏小 */
  approxGramsIncomplete?: true;
  issue?: SheetIssue;
}

export interface MenuSheetMeal {
  mealType: MealType;
  serviceWindow?: string;
  dishes: MenuSheetDish[];
}

export interface MenuSheetDay {
  date: string; // ISO date
  meals: MenuSheetMeal[];
}

export interface MenuSheet {
  name?: I18nString;
  dateRange?: DateRange;
  days: MenuSheetDay[];
  issues: SheetIssue[];
}

// ---------------------------------------------------------------------------
// purchase/<planId>.json（最小定义：与快照同构 + 微信文本）
// ---------------------------------------------------------------------------

export interface PurchaseSheet {
  /** renderPurchaseOrders 输出（与 data/purchase-orders/ 快照同构，一供应商一单） */
  orders: PurchaseOrder[];
  /** 「待补全」区（缺 purchase / 单位无法换算），不混入任何供应商单 */
  pending?: PendingLine[];
  /** supplier → formatPurchaseOrderText 的微信文本 */
  wechatText: Record<string, string>;
}
