/**
 * CanteenOS 核心类型。
 *
 * ⚠️ 单一事实源是 schemas/*.schema.json（JSON Schema draft 2020-12）。
 * 本文件是与其逐字段对应的手写 TypeScript 投影；变更顺序硬性规定为
 * schema → types → examples → docs（见 CONTRIBUTING.md / ADR-0003）。
 * 实体数 > 15 或嵌套 > 4 层时切换 json-schema-to-typescript 生成
 * （见 docs/architecture.md Open Question #1）。
 */

// ---------------------------------------------------------------------------
// common.schema.json
// ---------------------------------------------------------------------------

/** 人类可读的稳定 ID，小写 kebab-case（schema: ^[a-z][a-z0-9-]*$） */
export type Id = string;

/**
 * 内容级三语字符串。至少提供一种语言；fallback 链 zh → en → uk。
 * 见 docs/i18n.md。
 */
export interface I18nString {
  zh?: string;
  en?: string;
  uk?: string;
}

/** 规范单位（内部统一符号，本地化显示由客户端负责） */
export type Unit =
  | "g"
  | "kg"
  | "ml"
  | "l"
  | "pcs"
  | "pack"
  | "tbsp"
  | "tsp"
  | "pinch";

/** 数量一律为 { value, unit } 结构；跨单位换算必须通过 UnitConversion 表 */
export interface Quantity {
  value: number; // > 0
  unit: Unit;
}

/** ISO 4217 */
export type Currency = "CNY" | "USD" | "UAH" | "EUR";

export interface Money {
  amount: number; // >= 0
  currency: Currency;
}

export type ConfidenceSource =
  | "manual"
  | "video-import"
  | "web-import"
  | "llm-inference";

/**
 * AI 解析结果置信度。低于阈值（默认 0.85）的字段必须进入人工确认队列，
 * 见 skills/video-recipe-ingest/SKILL.md。
 */
export interface Confidence {
  value: number; // 0..1
  source: ConfidenceSource;
}

export type StorageType = "ambient" | "chilled" | "frozen";

export type MealType = "breakfast" | "lunch" | "dinner";

/**
 * 单位换算规则：from × factor = to。
 * ingredientRef 为空表示通用换算（如 g↔kg），否则为特定食材换算（pcs↔g）。
 */
export interface UnitConversion {
  from: Unit;
  to: Unit;
  factor: number; // > 0
  ingredientRef?: Id;
}

// ---------------------------------------------------------------------------
// ingredient.schema.json
// ---------------------------------------------------------------------------

export type IngredientCategory =
  | "vegetable"
  | "fruit"
  | "meat"
  | "poultry"
  | "seafood"
  | "egg-dairy"
  | "grain-staple"
  | "legume"
  | "seasoning"
  | "oil"
  | "beverage"
  | "other";

/** EU 1169/2011 十四类过敏原 */
export type Allergen =
  | "gluten"
  | "crustaceans"
  | "eggs"
  | "fish"
  | "peanuts"
  | "soy"
  | "milk"
  | "nuts"
  | "celery"
  | "mustard"
  | "sesame"
  | "sulphites"
  | "lupin"
  | "molluscs";

export interface NutritionPer100g {
  kcal?: number;
  proteinG?: number;
  fatG?: number;
  carbsG?: number;
}

/** 食材/调料。调料以 isSeasoning 区分。模型借鉴 Tandoor（仅概念，ADR-0002）。 */
export interface Ingredient {
  id: Id;
  schemaVersion: "1";
  name: I18nString;
  category: IngredientCategory;
  isSeasoning: boolean;
  /** 库存与采购聚合的基准单位 */
  baseUnit: Unit;
  /** 加工损耗率 0..1，采购量放大时使用 */
  lossRate?: number;
  storageType?: StorageType;
  shelfLifeDays?: number;
  allergens?: Allergen[];
  nutrition?: { per100g: NutritionPer100g };
  /** 食材专属换算（如鸡蛋 1 pcs = 55 g）；未命中时回退全局换算表 */
  unitConversions?: UnitConversion[];
}

// ---------------------------------------------------------------------------
// supplier.schema.json
// ---------------------------------------------------------------------------

export interface SupplierContact {
  phone?: string;
  email?: string;
}

export interface SupplierSku {
  skuId: string;
  ingredientRef: Id;
  /** 单包装净含量（packageUnit 计），> 0 */
  packageSize: number;
  packageUnit: Unit;
  /** 单包装价格 */
  price: Money;
  /** 最小起订量（包装数，默认视为 1） */
  moq?: number;
  /** 下单到收货的自然日数 */
  leadTimeDays: number;
  /** 同一 ingredientRef 多个 SKU 时标记首选 */
  isPreferred?: boolean;
}

export interface Supplier {
  id: Id;
  schemaVersion: "1";
  name: I18nString;
  contact?: SupplierContact;
  skus: SupplierSku[]; // >= 1
}

// ---------------------------------------------------------------------------
// dish.schema.json
// ---------------------------------------------------------------------------

export type DishCategory =
  | "staple"
  | "meat-dish"
  | "vegetable-dish"
  | "soup"
  | "cold-dish"
  | "snack"
  | "dessert"
  | "drink";

export type DishStatus = "draft" | "review" | "published" | "archived";

export type ProvenanceSource = "manual" | "video-import" | "web-import";

/**
 * 菜品分量。必须 ingredientRef 引用知识库 Ingredient——采购引擎 BOM
 * 展开的前提，也是与 schema.org/Recipe 纯字符串 recipeIngredient 的
 * 关键差异（导入映射见 docs/video-import.md §3）。
 */
export interface DishComponent {
  ingredientRef: Id;
  quantity: Quantity;
  /** 覆盖 Ingredient.lossRate 的本菜品专用损耗率 */
  lossRateOverride?: number;
  note?: I18nString;
  /** 机器来源的用量置信度；人工录入省略（视为 1.0/manual） */
  confidence?: Confidence;
}

export interface DishStep {
  order: number; // >= 1
  instruction: I18nString;
  durationMinutes?: number;
  tools?: string[];
}

export interface DishProvenance {
  source: ProvenanceSource;
  videoUrl?: string;
  /** 转写文本引用，通常是 dishpack 内相对路径 */
  transcriptRef?: string;
  dishpackRef?: Id;
  confidence?: Confidence;
}

export interface Dish {
  id: Id;
  schemaVersion: "1";
  name: I18nString;
  description?: I18nString;
  category: DishCategory;
  cuisine?: string;
  /** 配方基准份数；采购按 plannedServings/baseServings 缩放 */
  baseServings: number;
  components: DishComponent[]; // >= 1
  steps: DishStep[]; // >= 1
  provenance?: DishProvenance;
  tags?: string[];
  /** 内容版本号，每次修改 +1；状态机见 docs/modules/knowledge-base.md */
  version: number;
  status: DishStatus;
}

// ---------------------------------------------------------------------------
// menu-plan.schema.json
// ---------------------------------------------------------------------------

export type MenuPlanStatus = "draft" | "published" | "locked";

export interface DateRange {
  start: string; // ISO date
  end: string;
}

export interface MenuPlanMeal {
  date: string; // ISO date
  mealType: MealType;
  dishRef: Id;
  plannedServings: number; // >= 1
}

export interface MenuPlan {
  id: Id;
  schemaVersion: "1";
  name?: I18nString;
  dateRange: DateRange;
  meals: MenuPlanMeal[]; // >= 1
  status: MenuPlanStatus;
}

// ---------------------------------------------------------------------------
// purchase-order.schema.json
// ---------------------------------------------------------------------------

export type PurchaseOrderStatus =
  | "draft"
  | "confirmed"
  | "ordered"
  | "received"
  | "settled";

export interface PurchaseOrderLine {
  ingredientRef: Id;
  /** 命中的供应商 SKU（supplier.skus[].skuId） */
  skuId: string;
  /** 实际采购总净量 = packageCount × packageSize（unit 计） */
  qty: number;
  unit: Unit;
  /** 按包装规格/MOQ 向上取整后的包装数 */
  packageCount: number;
  /** 单包装价格 */
  unitPrice: Money;
  /** 行金额 = packageCount × unitPrice */
  amount: Money;
}

export interface PurchaseOrderDates {
  createdAt: string; // ISO date-time
  confirmedAt?: string;
  orderedAt?: string;
  /** 预计到货日 = 下单日 + leadTimeDays（ISO date） */
  expectedAt?: string;
  receivedAt?: string;
  settledAt?: string;
}

export interface PurchaseOrder {
  id: Id;
  schemaVersion: "1";
  supplierRef: Id;
  /** 来源菜单计划，便于追溯采购准确度 */
  menuPlanRef?: Id;
  lines: PurchaseOrderLine[]; // >= 1
  totalAmount: Money;
  status: PurchaseOrderStatus;
  dates: PurchaseOrderDates;
  notes?: string;
}

// ---------------------------------------------------------------------------
// feedback.schema.json
// ---------------------------------------------------------------------------

export type FeedbackType = "mealOrder" | "rating" | "comment";

export type OrderStatus = "reserved" | "redeemed" | "cancelled" | "no-show";

/** 结构化反馈标签（受控词表，扩充走 schema 变更流程） */
export type FeedbackTag =
  | "too-salty"
  | "too-bland"
  | "too-spicy"
  | "too-greasy"
  | "portion-small"
  | "portion-large"
  | "temperature-cold"
  | "fresh"
  | "would-reorder";

export interface FeedbackComment {
  originalLang: "zh" | "en" | "uk";
  /** 用户原文，永不被覆盖 */
  original: string;
  /** 三语翻译（含原文语言本身）；机器初稿可人工修 */
  translations?: I18nString;
}

/**
 * 点餐/评分/评论三态合一。schema 用 if/then 按 type 施加条件必填；
 * TS 侧用判别联合见 FeedbackOf<T>。运行期校验仍以 schema 为准。
 */
export interface Feedback {
  id: Id;
  schemaVersion: "1";
  type: FeedbackType;
  dishRef: Id;
  date: string; // ISO date
  /** 仅 mealOrder 必填 */
  mealType?: MealType;
  /** 匿名化顾客标识，不存 PII */
  customerRef: string;
  /** 仅 mealOrder：预定份数 */
  servings?: number;
  /** 仅 mealOrder */
  orderStatus?: OrderStatus;
  /** 仅 rating：1-5 星 */
  rating?: number;
  tags?: FeedbackTag[];
  /** 仅 comment */
  comment?: FeedbackComment;
  createdAt: string; // ISO date-time
}

// ---------------------------------------------------------------------------
// dishpack.schema.json
// ---------------------------------------------------------------------------

export type DishPackEngine =
  | "gemini-flash"
  | "gemini-pro"
  | "qwen-vl"
  | "self-hosted-pipeline"
  | "manual";

export interface DishPackGenerator {
  name: string;
  engine: DishPackEngine;
  engineVersion?: string;
  promptVersion?: string;
}

export type VideoPlatform =
  | "youtube"
  | "bilibili"
  | "douyin"
  | "tiktok"
  | "instagram"
  | "local-file"
  | "other";

export type DetectedLang = "zh" | "en" | "uk" | "other";

export interface DishPackSource {
  videoUrl: string;
  platform?: VideoPlatform;
  detectedLang: DetectedLang;
  durationSeconds?: number;
}

/**
 * schema.org/Recipe JSON-LD 原始输出。
 * 注意 recipeIngredient 为纯字符串数组——这是交换格式；
 * 内部存储必须经 ingredientMappings 映射为 ingredientRef 引用。
 */
export interface SchemaOrgRecipe {
  "@context": "https://schema.org";
  "@type": "Recipe";
  name: string;
  description?: string;
  recipeYield?: string;
  recipeIngredient: string[]; // >= 1
  recipeInstructions: SchemaOrgHowToStep[]; // >= 1
  /** ISO 8601 duration，如 PT10M */
  prepTime?: string;
  cookTime?: string;
  recipeCuisine?: string;
  keywords?: string;
  tool?: string[];
}

export interface SchemaOrgHowToStep {
  "@type": "HowToStep";
  text: string;
  position?: number;
}

export interface IngredientMapping {
  /** recipeIngredient 中的原始字符串，如 "鸡蛋 3 个" */
  raw: string;
  /** 映射到的知识库食材；匹配失败留空 + needsReview=true */
  ingredientRef?: Id;
  quantity?: Quantity;
  confidence: Confidence;
  /** 冗余标记：等于 confidence.value < 阈值（默认 0.85） */
  needsReview: boolean;
}

export interface StepMapping {
  order: number;
  instruction: I18nString;
  durationMinutes?: number;
  tools?: string[];
  /** 对应视频时间段（秒），便于人工抽检回放 */
  timestampRange?: { startSec: number; endSec: number };
}

export interface SuggestedDish {
  name: I18nString;
  category: DishCategory;
  baseServings: number;
}

export interface DishPackManifest {
  recipe: SchemaOrgRecipe;
  ingredientMappings: IngredientMapping[];
  stepMapping?: StepMapping[];
  suggestedDish?: SuggestedDish;
  overallConfidence: Confidence;
}

export interface DishPackTranscript {
  lang: DetectedLang;
  text: string;
  segments?: { startSec: number; endSec: number; text: string }[];
}

export interface DishPackMedia {
  kind: "keyframe" | "cover" | "clip";
  /** 包内相对路径或外部 URL */
  ref: string;
  timestampSec?: number;
}

export interface ReviewQueue {
  status: "pending" | "approved" | "rejected";
  /** 入队原因，如 low-confidence-ingredient、unit-conversion-missing */
  reasons?: string[];
}

/**
 * 视频导入标准包：云端/第三方解析 skill 与本地知识库之间的交换格式。
 * 规范见 docs/video-import.md 与 skills/video-recipe-ingest/SKILL.md。
 */
export interface DishPack {
  /** 标准包格式版本，独立于实体 schemaVersion */
  packVersion: "1";
  id: Id;
  createdAt: string;
  generator: DishPackGenerator;
  source: DishPackSource;
  manifest: DishPackManifest;
  transcript?: DishPackTranscript;
  media?: DishPackMedia[];
  reviewQueue: ReviewQueue;
}
