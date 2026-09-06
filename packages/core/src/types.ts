/**
 * CanteenOS 核心类型（v2 收窄模型，ADR-0006）。
 *
 * ⚠️ 单一事实源是 schemas/*.schema.json（JSON Schema draft 2020-12）。
 * 本文件是与其逐字段对应的手写 TypeScript 投影；变更顺序硬性规定为
 * schema → types → data → docs（见 CONTRIBUTING.md / ADR-0003）。
 *
 * v2 实体（5 个，目录即知识库 data/，一实体一文件、文件名即 ID）：
 *   Ingredient / Technique（单文件词表）/ Dish / MenuPlan / PurchaseOrder（引擎输出快照）
 * 已删除（git 历史保留）：Supplier、UnitConversionRule、Feedback、DishPack 及 PO 状态机。
 */

// ---------------------------------------------------------------------------
// common.schema.json
// ---------------------------------------------------------------------------

/** 人类可读的稳定 ID，小写 kebab-case（schema: ^[a-z][a-z0-9-]*$）。实体 id = data/ 下的文件名。 */
export type Id = string;

/**
 * 内容级三语字符串。至少提供一种语言；fallback 链 zh → en → uk。
 * 翻译状态（machine/human）不在数据本体，走旁文件 translations.lock.json。
 * 见 docs/i18n.md。
 */
export interface I18nString {
  zh?: string;
  en?: string;
  uk?: string;
}

/**
 * 规范单位（内部统一符号，本地化显示由客户端负责）。
 * g↔kg、ml↔l 为代码常量换算；pcs↔g 只靠 Ingredient.pcsToGram。
 */
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

/** 数量一律为 { value, unit } 结构 */
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

export type ConfidenceSource = "manual" | "video" | "llm-inference";

/**
 * AI 解析结果置信度。低于阈值（默认 0.85）的字段在 PR 审核中必须人工确认，
 * 见 skills/video-recipe-ingest/SKILL.md。
 */
export interface Confidence {
  value: number; // 0..1
  source: ConfidenceSource;
}

/**
 * 图片引用 + 许可元数据（CC BY-SA 裁决的落实，ADR-0006）：
 * Wikidata Commons 食材图约 78% 为 CC BY-SA，必须逐图存许可与来源。
 */
export interface Image {
  /** 仓库内相对路径（如 images/tomato.jpg）或 URL */
  src: string;
  /** 许可短名，如 CC0 / CC BY 4.0 / CC BY-SA 3.0 / Public domain / own（自摄） */
  license: string;
  author?: string;
  /** 图片来源 URL；自摄图片填仓库内路径 */
  sourceUrl: string;
}

export type MealType = "breakfast" | "lunch" | "dinner";

// ---------------------------------------------------------------------------
// ingredient.schema.json
// ---------------------------------------------------------------------------

/** 采购规格。缺失 = 该食材还不能算采购（readiness「能采」关卡不过）。 */
export interface PurchaseSpec {
  /** 供应商名字符串（不是实体引用），采购单按它分组（场景 F） */
  supplier: string;
  /** 单包装净含量（packUnit 计），如 5（kg）/ 180（枚/箱） */
  packSize: number; // > 0
  packUnit: Unit;
  /** 最小起订量（包装数），缺省视为 1；packs = max(minPacks, ceil(需求/packSize)) */
  minPacks?: number; // >= 1
  /** 最近一次每包价格；更新时跳过 0 与空值 */
  lastPrice?: Money;
}

/**
 * 食材/调料。一食材一文件：data/ingredients/<id>.json。
 * 字段定义以 docs/research/research-brief-v2.md §0 为准。
 */
export interface Ingredient {
  schemaVersion: "2";
  name: I18nString;
  image?: Image;
  /** Wikidata QID（场景 A 种子数据来源），如 Q23501 */
  externalId?: string;
  /** 库存与采购聚合的基准单位：g（重量）/ ml（体积）/ pcs（个数） */
  baseUnit: Unit;
  /** 一个多少克（pcs→g 的唯一换算依据） */
  pcsToGram?: number; // > 0
  /**
   * 净料率 0–1 单一数字，仅对按重量/体积（g/ml）计的食材有意义；
   * pcs 食材不得设置（pcs 不套 yield、不套 margin，ADR-0006）。
   */
  yield?: number; // (0, 1]
  purchase?: PurchaseSpec;
  /** 是否记现有量：仅耐放品（盐、油、干货）为 true */
  trackStock: boolean;
  /** 现有量（baseUnit 计）；仅 trackStock=true 时有意义 */
  onHand?: number; // >= 0
}

// ---------------------------------------------------------------------------
// techniques.schema.json（单文件词表 data/techniques.json，整体是数组）
// ---------------------------------------------------------------------------

/** cut=刀法与成形规格；heat=加热烹调法；pretreat=预处理与着衣 */
export type TechniqueKind = "cut" | "heat" | "pretreat";

/**
 * 中餐技法受控词表条目（场景 B 四层骨架的首批核心集，逐步补到约 80 项）。
 * 本词表是视频解析 skill 的输出闭集：techniqueRef 只能引用表内 id。
 */
export interface Technique {
  id: Id;
  kind: TechniqueKind;
  name: I18nString;
  image?: Image;
  note?: I18nString;
}

// ---------------------------------------------------------------------------
// dish.schema.json
// ---------------------------------------------------------------------------

/** 缺省视为 draft；只有 active 的菜参与菜单与采购推导 */
export type DishStatus = "draft" | "active" | "archived";

export type ProvenanceSource = "manual" | "video";

/** 配料在本菜中的备菜规格（备料单「能教」关卡的依据） */
export interface DishPrep {
  /** 刀工/预处理技法，必须是 data/techniques.json 中的 id（闭集） */
  techniqueRef: Id;
  /** 尺寸/规格补充，如 3mm、2cm 见方 */
  size?: string;
  note?: I18nString;
  /** 该配料「被切的几秒」的截帧（视频导入时由 skill 产出） */
  image?: Image;
}

/**
 * 菜品分量。必须 ingredientRef 引用 data/ingredients/ 下的食材——
 * 采购引擎 BOM 展开的前提。
 */
export interface DishComponent {
  ingredientRef: Id;
  qty: Quantity;
  prep?: DishPrep;
  /** 机器来源的用量置信度；人工录入省略（视为 1.0/manual） */
  confidence?: Confidence;
}

export interface DishStep {
  text: I18nString;
  /** 本步涉及的加热/处理技法，闭集引用 data/techniques.json */
  techniqueRef?: Id;
  image?: Image;
  /** 对应视频片段（秒），便于备料/教学时回放 */
  clip?: { videoUrl: string; start: number; end: number };
}

export interface DishProvenance {
  source: ProvenanceSource;
  videoUrl?: string;
}

/**
 * 菜品。一菜一文件：data/dishes/<id>.json。
 * **允许不完整：除 name 外全部可选**——一道菜只有名字也能导入，
 * 缺什么由 readiness 关卡分级（能教/能排/能采），不拒绝。
 */
export interface Dish {
  schemaVersion?: "2";
  name: I18nString;
  image?: Image;
  /** 配方基准份数，食堂尺度（如 50）；按 plannedServings/baseServings 缩放 */
  baseServings?: number;
  components?: DishComponent[]; // >= 1
  steps?: DishStep[]; // >= 1
  provenance?: DishProvenance;
  status?: DishStatus;
}

// ---------------------------------------------------------------------------
// menu-plan.schema.json
// ---------------------------------------------------------------------------

export interface DateRange {
  start: string; // ISO date
  end: string;
}

export interface MenuPlanMeal {
  date: string; // ISO date
  mealType: MealType;
  /** data/dishes/ 下的菜品 id（文件名） */
  dishRef: Id;
  plannedServings: number; // >= 1
}

/** 菜单计划：日期 × 餐次 × 菜品 × 份数 + margin。采购引擎的输入。 */
export interface MenuPlan {
  schemaVersion: "2";
  name?: I18nString;
  dateRange?: DateRange;
  /**
   * 备量系数，默认 1.1：吸收固定尾料/挂壁损耗（ADR-0006）。
   * 作用于净需求聚合之后（净需求 ÷ yield × margin）；pcs 食材不乘。
   */
  margin?: number; // > 0
  meals: MenuPlanMeal[]; // >= 1
}

// ---------------------------------------------------------------------------
// purchase-order.schema.json（引擎输出快照，无状态机）
// ---------------------------------------------------------------------------

/** trace 中一条需求来源：哪个菜、哪个餐次、多少份 */
export interface TraceMeal {
  date: string; // ISO date
  mealType: MealType;
  dishRef: Id;
  servings: number; // >= 1
}

/**
 * 单行采购量的完整推导链（ADR-0006：每行必带）。
 * 全部为引擎计算当时的数值快照，事后不随 ingredient 数据变更而变。
 */
export interface LineTrace {
  meals: TraceMeal[]; // >= 1
  /** Σ plannedServings/baseServings × qty 聚合后的净需求（baseUnit 计） */
  netNeed: Quantity;
  /** ÷ 的净料率；pcs 食材或食材无 yield 时为 null */
  yieldApplied: number | null;
  /** × 的备量系数（menu-plan.margin）；pcs 食材为 null */
  marginApplied: number | null;
  /** 扣减的现有量（baseUnit 计）；trackStock=false 或无 onHand 时为 null */
  onHandDeducted: Quantity | null;
  /** 净需求 ÷ yield × margin − onHand 之后、取整之前（baseUnit 计） */
  grossNeed: Quantity;
  packSize: number; // > 0
  packUnit: Unit;
  /** grossNeed ÷ packSize 的未取整值（g↔kg、ml↔l 常量换算后） */
  packsRaw: number; // > 0
  /** ceil(packsRaw) 是否被 minPacks 抬高 */
  minPacksApplied: boolean;
}

export interface PurchaseOrderLine {
  ingredientRef: Id;
  /** 实际采购总量 = packs × packSize（packUnit 计） */
  qty: Quantity;
  /** max(minPacks, ceil(扣减后需求 ÷ packSize)) */
  packs: number; // >= 1
  /** 下单时 ingredient.purchase.lastPrice 快照（可能未知而缺省） */
  unitPrice?: Money;
  /** 行金额 = packs × unitPrice（unitPrice 缺省时缺省） */
  amount?: Money;
  trace: LineTrace;
}

/**
 * 采购单：引擎输出快照。一单一文件：data/purchase-orders/<id>.json。
 * 无状态机——确认/下单/收货在线下（微信/电话）完成，不进数据模型。
 */
export interface PurchaseOrder {
  schemaVersion: "2";
  /** 供应商名字符串（分组键）；无 purchase 的食材归入「未指定供应商」单 */
  supplier: string;
  /** 来源菜单计划（data/menu-plans/ 文件名 id） */
  menuPlanRef?: Id;
  generatedAt: string; // ISO date-time
  lines: PurchaseOrderLine[]; // >= 1
  totalAmount?: Money;
  notes?: string;
}
