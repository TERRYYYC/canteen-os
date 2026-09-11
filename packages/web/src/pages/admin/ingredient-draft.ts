/** Raw Ingredient draft conversion and synchronous IDs; no page or transport dependencies. */
import type { Currency, PurchaseSpec, Unit } from "@canteenos/core";
import type { ImageRef, Ingredient } from "../../api/types";

export interface PendingImage {
  /** 已压好的 JPEG（或原文件：本来就 ≤ 上限时不重编码） */
  blob: Blob;
  width: number;
  height: number;
  /** blob: URL，只给预览；换图 / 去掉 / 上传成功 / 丢弃草稿时 revoke */
  previewUrl: string;
  license: string;
  author: string;
  sourceUrl: string;
}

export interface IngredientDraft {
  zh: string;
  en: string;
  uk: string;
  /** 值来自机翻（标「机翻，可改」）；用户一改就变 false */
  enMachine: boolean;
  ukMachine: boolean;
  /** 用户改过（或载入时已有）→ 自动机翻不再覆盖 */
  enTouched: boolean;
  ukTouched: boolean;
  /** 最近一次机翻的中文原文；zh 没变就不再自动机翻 */
  translatedFrom: string;
  /** 英文短名 = 实体 id = 文件名 */
  id: string;
  /** 用户手改过 id → 不再跟着 name.en 自动生成 */
  idTouched: boolean;
  externalId: string;
  /** 已经存在 / 已上传的图 */
  image: ImageRef | null;
  /** 选好、压好、还没上传的图（保存时先传） */
  pending: PendingImage | null;
  baseUnit: Unit;
  pcsToGram: string;
  /** 净料率，界面按百分数；"" = 100%（不写字段，D-08） */
  yieldPct: string;
  /** null = 源文件没写（保持不写）；开关一动就是 main / seasoning */
  role: "main" | "seasoning" | null;
  supplier: string;
  packSize: string;
  packUnit: Unit;
  minPacks: number;
  /** 源文件写了 minPacks 或用户动过步进器 → 保存时写出（否则 1 = 缺省，不写） */
  minPacksExplicit: boolean;
  priceAmount: string;
  currency: Currency;
  trackStock: boolean;
  onHand: string;
  /** 文件已存在：保存时 If-Match 用；null = 还没存过（新建） */
  blobSha: string | null;
  dirty: boolean;
}

/** 空草稿；seed.zh 来自 #24 的 handoff（newIngredientName） */
export function createIngredientDraft(seed: { zh?: string } = {}): IngredientDraft {
  return {
    zh: seed.zh ?? "",
    en: "",
    uk: "",
    enMachine: false,
    ukMachine: false,
    enTouched: false,
    ukTouched: false,
    translatedFrom: "",
    id: "",
    idTouched: false,
    externalId: "",
    image: null,
    pending: null,
    baseUnit: "g",
    pcsToGram: "",
    yieldPct: "",
    role: "main",
    supplier: "",
    packSize: "",
    packUnit: "kg",
    minPacks: 1,
    minPacksExplicit: false,
    priceAmount: "",
    currency: "CNY",
    trackStock: false,
    onHand: "",
    blobSha: null,
    dirty: false,
  };
}

/** 既有食材 → 草稿（api.getIngredient 的 content + blobSha） */
export function draftFromIngredient(ing: Ingredient, id: string, blobSha: string | null): IngredientDraft {
  const d = createIngredientDraft();
  d.zh = ing.name.zh ?? "";
  d.en = ing.name.en ?? "";
  d.uk = ing.name.uk ?? "";
  d.enTouched = d.en !== "";
  d.ukTouched = d.uk !== "";
  d.translatedFrom = d.zh;
  d.id = id;
  d.idTouched = true;
  d.externalId = ing.externalId ?? "";
  d.image = ing.image ? { ...ing.image } : null;
  d.baseUnit = ing.baseUnit;
  d.pcsToGram = ing.pcsToGram !== undefined ? String(ing.pcsToGram) : "";
  d.yieldPct = ing.yield !== undefined ? String(Math.round(ing.yield * 10000) / 100) : "";
  d.role = ing.role ?? null;
  if (ing.purchase) {
    d.supplier = ing.purchase.supplier;
    d.packSize = String(ing.purchase.packSize);
    d.packUnit = ing.purchase.packUnit;
    if (ing.purchase.minPacks !== undefined) {
      d.minPacks = ing.purchase.minPacks;
      d.minPacksExplicit = true;
    }
    if (ing.purchase.lastPrice) {
      d.priceAmount = String(ing.purchase.lastPrice.amount);
      d.currency = ing.purchase.lastPrice.currency;
    }
  }
  d.trackStock = ing.trackStock;
  d.onHand = ing.onHand !== undefined ? String(ing.onHand) : "";
  d.blobSha = blobSha;
  return d;
}

/** "" → NaN（调用方先判空）；认不出的字串也是 NaN → JSON 里变 null → worker 回 type 错误并标黄那一行 */
function num(s: string): number {
  const v = s.trim().replace(",", ".");
  return v === "" ? Number.NaN : Number(v);
}

/**
 * 草稿 → 实体 JSON（字段映射逐条对 schemas/ingredient.schema.json）：
 *   schemaVersion 写死 "2"；name 只写非空语言；yield 空或 100% 不写；pcs 食材不写 yield（types.ts 规则）；
 *   pcsToGram 只在 pcs 时写；role null 不写；purchase 整组空不写（= 还不能算采购）；minPacks 缺省 1 不写；
 *   lastPrice 金额空不写；onHand 只在 trackStock 时写。数字填错了照样送出去（NaN → null），让校验按 pointer 标黄。
 */
export function draftToIngredient(d: IngredientDraft): Ingredient {
  const name: Ingredient["name"] = {};
  if (d.zh.trim()) name.zh = d.zh.trim();
  if (d.en.trim()) name.en = d.en.trim();
  if (d.uk.trim()) name.uk = d.uk.trim();
  const ing: Ingredient = { schemaVersion: "2", name, baseUnit: d.baseUnit, trackStock: d.trackStock };
  if (d.image) ing.image = { ...d.image };
  if (d.externalId.trim()) ing.externalId = d.externalId.trim();
  // pcsToGram 是 pcs→g 的唯一换算：pcs 食材必填；按 g / ml 计的食材也可能带着它（菜谱里按「个」写用量，如 data/ 里的 tomato），
  // 界面只在有值时才露出那一行，但只要有值就照写，不悄悄丢
  if (d.pcsToGram.trim()) ing.pcsToGram = num(d.pcsToGram);
  if (d.baseUnit !== "pcs" && d.yieldPct.trim()) {
    const pct = num(d.yieldPct);
    if (pct !== 100) ing.yield = Number.isFinite(pct) ? Math.round(pct * 100) / 10000 : Number.NaN;
  }
  if (d.role) ing.role = d.role;
  if (d.supplier.trim() !== "" || d.packSize.trim() !== "") {
    const p: PurchaseSpec = { supplier: d.supplier.trim(), packSize: num(d.packSize), packUnit: d.packUnit };
    if (d.minPacksExplicit || d.minPacks !== 1) p.minPacks = d.minPacks;
    if (d.priceAmount.trim()) p.lastPrice = { amount: num(d.priceAmount), currency: d.currency };
    ing.purchase = p;
  }
  if (d.trackStock && d.onHand.trim()) ing.onHand = num(d.onHand);
  return ing;
}

/** name.en → 文件名：去音标、小写、非 [a-z0-9] 一律成 "-"、掐头去尾、开头必须是字母（D-04） */
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "");
}

