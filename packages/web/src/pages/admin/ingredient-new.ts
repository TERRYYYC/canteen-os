/**
 * /admin/ingredient/new · /admin/ingredient/<id> —— 新食材 / 改食材（#23；docs/specs/v03-admin-frontend-contract.md §4.4）。
 *
 * 一屏填完（设计稿 docs/design/backoffice-v1.html 第 6 屏）：
 *   - 三语名：zh 必填；en / uk 由 api.translate 即时填充并标「机翻，可改」，用户改过就不再自动覆盖（手动点「机翻」才覆盖）；
 *   - 英文短名 = 实体 id = 文件名（D-04 / §9 矛盾 6）：默认由 name.en slug 化（^[a-z][a-z0-9-]*$），可改；
 *     getCatalog 查重：id 撞名 → 阻止保存 + 「已有同名食材，是要改它吗？」；只是 zh 同名 → 只提示不阻止；存过一次就锁定；
 *   - 照片：拍一张 / 选一张 → 浏览器 canvas 压到最长边 ≤ 1280 且 ≤ 200 KB（决议追加「§9 图片压缩」；算法见 compressImage）
 *     → 保存时先 api.uploadImage("ingredients", id, blob, { license, author?, sourceUrl? }) 再 saveIngredient；license 必填；
 *     「从 Wikidata 取」本轮只是占位 + 明确提示（mock 不通外网）；「从视频截」第二轮；
 *   - 按什么算 baseUnit（g / ml / pcs）；一个多少克 pcsToGram（选「个」时出现；g / ml 食材源文件已带值时也露出，不悄悄丢）；
 *     净料率 yield（仅 g / ml，界面按 %，100% 不写字段，D-08）；
 *   - 「调料 · 适量就行」→ role: "seasoning"，关掉 → "main"（D-11 / §9 矛盾 5：Ingredient 上没有 to-taste 字段）；
 *   - 怎么买 purchase：supplier（已有 + 新建）/ packSize / packUnit 三者必填，minPacks / lastPrice 可选；整组空 = 不写 purchase；
 *   - 耐放 · 记库存 trackStock（必填布尔）；现有量 onHand（仅 trackStock）；schemaVersion 写死 "2"。
 *
 *   - 签名 render(el, ctx, rest)：rest = "new" | "<id>"（pages/admin.ts 剥掉 "ingredient/" 之后的那段）；
 *   - 推论 A：未提交的表单值全部在模块级 `draft` 里，切语言 = 重新 render 时按 draftKey 回填；
 *     离开本屏（hashchange 到别处）即丢弃（§4.0：hashchange 无法取消，离开确认只做在自己的返回键 / 「去改它」上）；
 *   - 字段错误：worker / mock 的 errors[] 交给 kit.applyFieldErrors 按 JSON Pointer 标黄，message 原样；
 *     本屏自己只查 API 看不见的三样：id 形状、id 撞名、待上传照片缺许可（也走同一条标黄通道）；
 *   - 文案：私有字典 T（前缀 ing.，三语齐全）；共用文案走 kit 的 adm()；
 *   - 样式：同目录 ingredient-new.css，每条选择器以 .adm-ing 开头；
 *   - 不改 kit.ts / store.ts / api/*：缺的小部件（开关、分段单选、照片区、压图）都在本文件（§3.4 规则 0）。
 *
 * 给 #24 复用的导出（签名见各自的注释）：
 *   createIngredientDraft(seed?) · draftFromIngredient(ing, id, blobSha) · draftToIngredient(draft)
 *   buildIngredientForm(opts) · submitIngredientForm(api, form, opts?) · compressImage(file, limits?) · slugify(s)
 */
import "./ingredient-new.css";

import type { Currency, PurchaseSpec, Unit } from "@canteenos/core";

import { getApi, type AdminApi } from "../../api/client";
import { isApiError, type Catalog, type FieldError, type ImageMeta, type ImageRef, type Ingredient, type WriteResult } from "../../api/types";
import { adm, apiMessage, applyFieldErrors, busy, button, clearFieldErrors, errorCard, fieldRow, notice, sessionExpired, stepper, topBar } from "../../admin/kit";
import { takeHandoff } from "../../admin/store";
import { append, h } from "../../dom";
import type { Lang } from "../../i18n";
import type { PageCtx } from "../../types";
import { adminHref } from "../admin";

// ---------------------------------------------------------------------------
// 文案（§5.2：点分小写，前缀 ing.，三语缺一即编译错误）
// ---------------------------------------------------------------------------

const T = {
  "ing.title.new": { uk: "Новий інгредієнт", zh: "新食材", en: "New ingredient" },
  "ing.title.edit": { uk: "Змінити інгредієнт", zh: "改食材", en: "Edit ingredient" },
  "ing.notFound": { uk: "Такого інгредієнта немає", zh: "没找到这个食材", en: "Couldn't find this ingredient" },

  "ing.name.zh": { uk: "Назва китайською", zh: "中文名", en: "Chinese name" },
  "ing.name.zh.hint": {
    uk: "Обов'язково. Англійську та українську можна перекласти автоматично",
    zh: "必填；英文、乌克兰语可以机翻",
    en: "Required. English and Ukrainian can be machine-translated",
  },
  "ing.name.en": { uk: "Назва англійською", zh: "英文名", en: "English name" },
  "ing.name.uk": { uk: "Назва українською", zh: "乌克兰语名", en: "Ukrainian name" },
  "ing.names.other": { uk: "Англійська · українська", zh: "英文 · 乌克兰语", en: "English · Ukrainian" },
  "ing.translate": { uk: "Перекласти", zh: "机翻", en: "Translate" },
  "ing.translating": { uk: "Перекладаю…", zh: "机翻中…", en: "Translating…" },
  "ing.translateFailed": {
    uk: "Автопереклад зараз недоступний — можна зберегти лише китайську назву",
    zh: "机翻暂时用不了，可以先存中文名",
    en: "Machine translation isn't available right now — you can save with just the Chinese name",
  },

  "ing.slug": { uk: "Коротка англійська назва (ім'я файлу)", zh: "英文短名（当文件名用）", en: "Short English name (used as the file name)" },
  "ing.slug.hint": { uk: "Лише малі латинські літери, цифри та дефіс", zh: "只能用小写字母、数字和短横线", en: "Lowercase letters, digits and hyphens only" },
  "ing.slug.locked": { uk: "Після збереження ім'я файлу змінити не можна", zh: "文件名存过就不能改了", en: "The file name can't change once saved" },
  "ing.slug.required": { uk: "Спочатку вкажіть коротку англійську назву", zh: "先填英文短名", en: "Fill in the short English name first" },
  "ing.slug.bad": {
    uk: "Лише малі латинські літери, цифри та дефіс; починається з літери",
    zh: "只能用小写字母、数字和短横线，开头必须是字母",
    en: "Lowercase letters, digits and hyphens only, starting with a letter",
  },
  "ing.slug.taken": {
    uk: "Такий інгредієнт уже є — хочете змінити його?",
    zh: "已有同名食材，是要改它吗？",
    en: "There's already an ingredient with this name — did you mean to edit it?",
  },
  "ing.slug.goEdit": { uk: "Перейти до нього", zh: "去改它", en: "Edit it instead" },

  "ing.photo": { uk: "Фото", zh: "照片", en: "Photo" },
  "ing.photo.camera": { uk: "Зробити фото", zh: "拍一张", en: "Take a photo" },
  "ing.photo.pick": { uk: "Вибрати файл", zh: "选一张", en: "Choose a file" },
  "ing.photo.wikidata": { uk: "З Wikidata", zh: "从 Wikidata 取", en: "From Wikidata" },
  "ing.photo.video": { uk: "З відео (2-й етап)", zh: "从视频截（第二轮）", en: "From video (round 2)" },
  "ing.photo.wikidata.hint": {
    uk: "У цьому етапі Wikidata недоступна (mock без мережі; запрацює після #27). Поки що вкажіть ID Wikidata нижче, а фото додайте через «Зробити фото» або «Вибрати файл».",
    zh: "这一轮还连不上 Wikidata（mock 不通外网，#27 接线后可用）。先在下面填 Wikidata 编号，图片用「拍一张」或「选一张」。",
    en: "Wikidata isn't reachable in this round (the mock has no network; it works once #27 wires the worker). Fill in the Wikidata ID below and use “Take a photo” or “Choose a file” for now.",
  },
  "ing.photo.video.hint": {
    uk: "Кадри з відео — на 2-му етапі; поки що Terry імпортує їх з командного рядка",
    zh: "从视频截帧第二轮上线；现在由 Terry 用命令行导入",
    en: "Video frames arrive in round 2; for now Terry imports them from the command line",
  },
  "ing.photo.license": { uk: "Ліцензія", zh: "许可", en: "License" },
  "ing.photo.license.hint": {
    uk: "Власне фото: own; з інтернету — коротка назва ліцензії, напр. CC BY-SA 4.0",
    zh: "自己拍的填 own；网上来的填许可短名，如 CC BY-SA 4.0",
    en: "Your own photo: own; from the web: the license short name, e.g. CC BY-SA 4.0",
  },
  "ing.photo.author": { uk: "Автор (необов'язково)", zh: "作者（可不填）", en: "Author (optional)" },
  "ing.photo.sourceUrl": { uk: "Адреса джерела (необов'язково)", zh: "来源网址（可不填）", en: "Source URL (optional)" },
  "ing.photo.tooBig": { uk: "Це фото завелике — виберіть інше або обріжте", zh: "这张照片太大，换一张或裁小一点", en: "This photo is too big — try another one or crop it" },
  "ing.photo.unreadable": { uk: "Не вдалося відкрити зображення — спробуйте інше", zh: "这张图片打不开，换一张再试", en: "Can't open this image — try another one" },
  "ing.photo.compressing": { uk: "Стискаю…", zh: "正在压缩…", en: "Compressing…" },
  "ing.photo.pending": {
    uk: "Стиснуто до {kb} КБ · {w}×{h}; завантажиться під час збереження",
    zh: "已压到 {kb} KB · {w}×{h}，保存时一起上传",
    en: "Compressed to {kb} KB · {w}×{h}; uploads when you save",
  },
  "ing.photo.remove": { uk: "Прибрати фото", zh: "去掉照片", en: "Remove photo" },
  "ing.photo.licenseRequired": { uk: "Для фото потрібна ліцензія", zh: "照片要写许可", en: "The photo needs a license" },
  "ing.photo.uploadFailed": { uk: "Не вдалося завантажити фото: {msg}", zh: "照片没传上去：{msg}", en: "Photo upload failed: {msg}" },
  "ing.photo.source": { uk: "Джерело", zh: "来源", en: "Source" },

  "ing.externalId": { uk: "ID у Wikidata", zh: "Wikidata 编号", en: "Wikidata ID" },
  "ing.externalId.hint": { uk: "Напр. Q23501; необов'язково", zh: "形如 Q23501；可不填", en: "Like Q23501; optional" },

  "ing.baseUnit": { uk: "Одиниця обліку", zh: "按什么算", en: "Counted by" },
  "ing.baseUnit.g": { uk: "за вагою (г)", zh: "按重量（克）", en: "by weight (g)" },
  "ing.baseUnit.ml": { uk: "за об'ємом (мл)", zh: "按体积（毫升）", en: "by volume (ml)" },
  "ing.baseUnit.pcs": { uk: "поштучно", zh: "按个数", en: "by count" },
  "ing.pcsToGram": { uk: "Грамів на штуку", zh: "一个多少克", en: "Grams per piece" },
  "ing.pcsToGram.hint": {
    uk: "Так підготовка й закупівля переводять штуки в грами",
    zh: "备料和采购靠它把「个」换成克",
    en: "Prep and purchasing use this to turn pieces into grams",
  },
  "ing.yield": { uk: "Скільки залишається зі 100 г", zh: "用 100 g 能剩多少", en: "How much is left from 100 g" },
  "ing.yield.hint": {
    uk: "Що лишається після чищення; не впевнені — залиште порожнім (рахується як 100%)",
    zh: "去皮去根之后还剩下的部分；不确定就留着不填（按 100% 算）",
    en: "What's left after peeling and trimming; leave empty if unsure (counts as 100%)",
  },
  "ing.seasoning": { uk: "Приправа · «за смаком»", zh: "调料 · 适量就行", en: "Seasoning · “to taste” is fine" },
  "ing.seasoning.hint": {
    uk: "У рецепті можна писати «за смаком»; лист підготовки не вимагатиме нарізки",
    zh: "菜谱里可以写「适量」，备料单不催切配",
    en: "Recipes may say “to taste”; the prep sheet won't ask how to cut it",
  },

  "ing.purchase": { uk: "Як купувати", zh: "怎么买", en: "How to buy" },
  "ing.purchase.hint": {
    uk: "Цю групу можна поки не заповнювати — тоді інгредієнт ще не потрапить у закупівлю",
    zh: "整组可以先不填，那这个食材就先算不了采购",
    en: "You can leave this whole group empty for now — the ingredient just won't be purchasable yet",
  },
  "ing.purchase.supplier": { uk: "Постачальник", zh: "从谁那儿买", en: "Supplier" },
  "ing.purchase.supplier.new": { uk: "Виберіть наявного або введіть нового", zh: "选已有的，或直接输入新供应商", en: "Pick an existing one or type a new supplier" },
  "ing.purchase.packSize": { uk: "Розмір упаковки", zh: "一包多少", en: "Pack size" },
  "ing.purchase.packUnit": { uk: "Одиниця", zh: "单位", en: "Unit" },
  "ing.purchase.minPacks": { uk: "Мінімум упаковок", zh: "最少买几包", en: "Minimum packs" },
  "ing.purchase.lastPrice": { uk: "Остання ціна за упаковку", zh: "上次一包多少钱", en: "Last price per pack" },
  "ing.purchase.currency": { uk: "Валюта", zh: "币种", en: "Currency" },
  "ing.trackStock": { uk: "Довго зберігається · облік залишків", zh: "耐放 · 记库存", en: "Keeps well · track stock" },
  "ing.trackStock.hint": {
    uk: "Увімкнути для олії, солі, рису; вимкнути для свіжих продуктів — їх купують під меню",
    zh: "油盐米这类打开；生鲜关掉，按菜单买",
    en: "On for oil, salt, rice; off for fresh produce bought per menu",
  },
  "ing.onHand": { uk: "Зараз у наявності", zh: "现在还有多少", en: "On hand now" },
  "ing.onHand.hint": { uk: "В одиниці з «Одиниця обліку»", zh: "按上面「按什么算」的单位", en: "In the unit chosen under “Counted by”" },

  "ing.save.return": { uk: "Зберегти й повернутися", zh: "保存，回到复核", en: "Save and go back" },
  "ing.reload": { uk: "Перечитати", zh: "重新读取", en: "Reload" },
  "ing.warnings": { uk: "Зауваження кабінету: {list}", zh: "后台提醒：{list}", en: "Back-office notes: {list}" },

  "ing.unit.g": { uk: "г", zh: "克", en: "g" },
  "ing.unit.kg": { uk: "кг", zh: "千克", en: "kg" },
  "ing.unit.ml": { uk: "мл", zh: "毫升", en: "ml" },
  "ing.unit.l": { uk: "л", zh: "升", en: "l" },
  "ing.unit.pcs": { uk: "шт", zh: "个", en: "pcs" },
  "ing.unit.pack": { uk: "уп.", zh: "包", en: "pack" },
  "ing.unit.tbsp": { uk: "ст. л.", zh: "汤匙", en: "tbsp" },
  "ing.unit.tsp": { uk: "ч. л.", zh: "茶匙", en: "tsp" },
  "ing.unit.pinch": { uk: "дрібка", zh: "撮", en: "pinch" },
  "ing.unit.to-taste": { uk: "за смаком", zh: "适量", en: "to taste" },
} as const satisfies Record<string, Record<Lang, string>>;

type Key = keyof typeof T;
type Params = Record<string, string | number>;

function tt(lang: Lang, key: Key, params?: Params): string {
  let s: string = T[key][lang];
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const ID_PREFIX = "adm-ing";
/** schemas/common.schema.json#/$defs/Id */
const ID_RE = /^[a-z][a-z0-9-]*$/;
/** 表单里只给 g / ml / pcs 三选（schema 枚举更宽，食材库只用这三个）；编辑到别的值时多画一格，不悄悄改掉 */
const BASE_UNITS: readonly Unit[] = ["g", "ml", "pcs"];
/** packUnit 下拉：说得通的包装单位；编辑到别的值时也补进去 */
const PACK_UNITS: readonly Unit[] = ["g", "kg", "ml", "l", "pcs", "pack"];
const CURRENCIES: readonly Currency[] = ["CNY", "USD", "UAH", "EUR"];
const UNIT_KEY: Record<Unit, Key> = {
  g: "ing.unit.g",
  kg: "ing.unit.kg",
  ml: "ing.unit.ml",
  l: "ing.unit.l",
  pcs: "ing.unit.pcs",
  pack: "ing.unit.pack",
  tbsp: "ing.unit.tbsp",
  tsp: "ing.unit.tsp",
  pinch: "ing.unit.pinch",
  "to-taste": "ing.unit.to-taste",
};

/** ADR-0007 §9 / 决议追加：最长边 ≤ 1280、≤ 200 KB；worker 侧超 200 KB → 413 */
export const IMAGE_MAX_EDGE = 1280;
export const IMAGE_MAX_BYTES = 200 * 1024;

type Attrs = Record<string, string | number | boolean | null | undefined>;

// ---------------------------------------------------------------------------
// 草稿（推论 A：全部是原始输入串，切语言回填时一个字都不丢）
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 照片压缩（决议追加「§9 图片压缩」：浏览器 canvas 压到最长边 ≤ 1280 且 ≤ 200 KB；worker 只校验尺寸与 magic bytes）
// ---------------------------------------------------------------------------

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

/** 质量递减序列；全都超限就把边长再乘 0.8 重来，直到最长边 < 320 才放弃 */
const JPEG_QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];
const MIN_EDGE = 320;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-decode"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/**
 * 算法：
 *   1. 用 <img> 解码（浏览器会按 EXIF 方向摆正，naturalWidth/Height 就是摆正后的尺寸）；打不开 → 抛错；
 *   2. 原文件本来就 ≤ maxBytes、最长边 ≤ maxEdge、且是 jpg / png / webp → 原样返回，不重编码；
 *   3. scale = min(1, maxEdge / 最长边)，canvas 垫白后缩放绘制，按 JPEG_QUALITIES 逐档编码，第一个 ≤ maxBytes 的就是结果；
 *   4. 五档都超 → scale ×= 0.8 回到第 3 步；最长边缩到 < 320 还不行 → 返回 null（界面提示「这张照片太大，换一张或裁小一点」）。
 */
export async function compressImage(file: Blob, limits: { maxEdge: number; maxBytes: number } = { maxEdge: IMAGE_MAX_EDGE, maxBytes: IMAGE_MAX_BYTES }): Promise<CompressedImage | null> {
  const img = await loadImage(file);
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!w0 || !h0) throw new Error("image-decode");
  if (file.size <= limits.maxBytes && Math.max(w0, h0) <= limits.maxEdge && /^image\/(jpeg|png|webp)$/.test(file.type)) {
    return { blob: file, width: w0, height: h0 };
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  let scale = Math.min(1, limits.maxEdge / Math.max(w0, h0));
  for (;;) {
    const w = Math.max(1, Math.round(w0 * scale));
    const hh = Math.max(1, Math.round(h0 * scale));
    canvas.width = w;
    canvas.height = hh;
    ctx.fillStyle = "#fff"; // PNG 透明底转 JPEG 时垫白，不然是黑的
    ctx.fillRect(0, 0, w, hh);
    ctx.drawImage(img, 0, 0, w, hh);
    for (const q of JPEG_QUALITIES) {
      const blob = await canvasToBlob(canvas, "image/jpeg", q);
      if (blob && blob.size <= limits.maxBytes) return { blob, width: w, height: hh };
    }
    scale *= 0.8;
    if (Math.max(w0, h0) * scale < MIN_EDGE) return null;
  }
}

/** 预览地址：blob: / data: / http(s) 原样；仓库内相对路径挂 BASE_URL（同 prep.ts 的 imgSrc） */
function imgSrc(src: string): string {
  if (/^(https?:\/\/|blob:|data:)/i.test(src)) return src;
  return `${import.meta.env.BASE_URL}${src.replace(/^\/+/, "")}`;
}

// ---------------------------------------------------------------------------
// 表单件（给 #24 复用）
// ---------------------------------------------------------------------------

export interface IngredientFormOpts {
  lang: Lang;
  api: AdminApi;
  /** 草稿：调用方自己持有（本屏放模块级变量；#24 放自己的），表单件只读写它 */
  draft: IngredientDraft;
  /** true = 文件已存在：id 锁定、不查重 */
  editing: boolean;
  /** 供应商下拉 + 重名检查；null = catalog 还没到（只留自由输入，不阻塞；晚到时 setCatalog） */
  catalog: Catalog | null;
  /** DOM id 前缀（§3.4：adm-<screen>-<field>）；#24 内嵌时换一个，免得与自己的字段撞 id */
  idPrefix?: string;
  /** 任何输入变化后回调（草稿的 dirty 已经置好） */
  onChange?: () => void;
  /** 「去改它」被点（id）：本屏用它做离开确认；缺省直接跳 adminHref("ingredient", id) */
  onGoEdit?: (id: string) => void;
}

export interface IngredientFormHandle {
  /** 表单主体（两张卡），不含顶栏与保存按钮 */
  el: HTMLElement;
  /** API 看不见的本地检查：id 形状 / id 撞名 / 待上传照片缺许可；[] = 可以提交 */
  localErrors(): FieldError[];
  /** 当前表单值 → 实体 JSON（见 draftToIngredient） */
  toIngredient(): Ingredient;
  /** 当前 id（英文短名，已 trim） */
  id(): string;
  /** 待上传的照片（保存时先 uploadImage 再 saveIngredient）；null = 没有 */
  pendingImage(): { blob: Blob; meta: ImageMeta } | null;
  /** 上传成功后：把 ImageRef 写进草稿、丢掉待上传、重画照片区；null = 去掉照片 */
  setImage(ref: ImageRef | null): void;
  /** worker / mock 的 errors[] → 标黄（bad_id → /id；上传的 /license → /image/license） */
  showErrors(errors: readonly FieldError[]): void;
  clearErrors(): void;
  /** catalog 晚到时补上供应商下拉与查重 */
  setCatalog(catalog: Catalog): void;
}

function remapError(e: FieldError): FieldError {
  if (e.code === "bad_id" || e.code === "bad_path") return { ...e, path: "/id" };
  if (e.path === "/license") return { ...e, path: "/image/license" };
  return e;
}

/**
 * 食材表单件：把 draft 画成两张卡（基本 / 怎么买），所有输入直接写回 draft。
 * 每个 <label for> 由 kit.fieldRow 指到控件；每行带 JSON Pointer（data-pointer），kit.applyFieldErrors 靠它标黄。
 */
export function buildIngredientForm(opts: IngredientFormOpts): IngredientFormHandle {
  const { lang, api, draft: d } = opts;
  const P = opts.idPrefix ?? ID_PREFIX;
  const L = (key: Key, params?: Params): string => tt(lang, key, params);
  const unitLabel = (u: Unit): string => L(UNIT_KEY[u]);
  let catalog = opts.catalog;

  function changed(): void {
    d.dirty = true;
    opts.onChange?.();
  }

  function row(name: string, pointer: string, label: string, control: HTMLElement, hint?: string): HTMLElement {
    const r = fieldRow(hint === undefined ? { idPrefix: P, name, pointer, label, control } : { idPrefix: P, name, pointer, label, hint, control });
    // kit.fieldRow 把 id 落在控件里第一个可标注元素上；步进器的第一个是「−」按钮，把 id 挪到中间的 <input> 上，<label for> 才指到数值
    const stepperInput = control.querySelector<HTMLInputElement>(".adm-stepper-input");
    if (stepperInput) {
      const holder = control.querySelector<HTMLElement>(`#${P}-${name}`);
      if (holder && holder !== stepperInput) {
        const described = holder.getAttribute("aria-describedby");
        holder.removeAttribute("id");
        holder.removeAttribute("aria-describedby");
        stepperInput.id = `${P}-${name}`;
        if (described) stepperInput.setAttribute("aria-describedby", described);
      }
    }
    return r;
  }

  function text(value: string, attrs: Attrs, onInput: (v: string) => void): HTMLInputElement {
    const input = h("input", { type: "text", autocomplete: "off", value, ...attrs });
    input.addEventListener("input", () => {
      onInput(input.value);
      changed();
    });
    return input;
  }

  function select(values: readonly string[], current: string, label: (v: string) => string, onChange: (v: string) => void, attrs: Attrs = {}): HTMLSelectElement {
    const sel = h("select", attrs, ...values.map((v) => h("option", { value: v, selected: v === current ? true : null }, label(v))));
    sel.addEventListener("change", () => {
      onChange(sel.value);
      changed();
    });
    return sel;
  }

  function affix(input: HTMLInputElement, unit: string): HTMLElement {
    return h("div", { class: "adm-ing-affix" }, input, h("span", { class: "adm-ing-affix-unit", "aria-hidden": "true" }, unit));
  }

  function switchControl(checked: boolean, describe: string, onChange: (v: boolean) => void): HTMLElement {
    const input = h("input", { type: "checkbox", role: "switch", class: "adm-ing-switch-input", checked: checked ? true : null });
    input.addEventListener("change", () => {
      onChange(input.checked);
      changed();
    });
    return h("div", { class: "adm-ing-switch" }, h("span", { class: "adm-ing-switch-text muted" }, describe), input);
  }

  // ---- 三语名 ----------------------------------------------------------------
  const zhInput = text(d.zh, { enterkeyhint: "next", lang: "zh" }, (v) => {
    d.zh = v;
    refreshDup();
  });
  zhInput.addEventListener("change", () => void translate(false));
  const zhRow = row("name-zh", "/name", L("ing.name.zh"), zhInput, L("ing.name.zh.hint"));

  const enInput = text(d.en, { enterkeyhint: "next", lang: "en" }, (v) => {
    d.en = v;
    d.enTouched = v !== "";
    d.enMachine = false;
    paintMachine();
    syncSlug();
  });
  const ukInput = text(d.uk, { enterkeyhint: "next", lang: "uk" }, (v) => {
    d.uk = v;
    d.ukTouched = v !== "";
    d.ukMachine = false;
    paintMachine();
  });
  const enRow = row("name-en", "/name/en", L("ing.name.en"), enInput);
  const ukRow = row("name-uk", "/name/uk", L("ing.name.uk"), ukInput);
  const machineChip = h("span", { class: "chip adm-ing-chip", hidden: true }, adm("adm.machineTranslated", undefined, lang));
  const translateBtn = button({ label: L("ing.translate"), kind: "ghost", class: "adm-ing-translate", onClick: () => void translate(true) });
  const translateHint = h("p", { class: "adm-ing-hint adm-ing-warn", role: "status", hidden: true });
  const namesSub = h("div", { class: "adm-ing-sub" }, h("span", { class: "adm-ing-sub-title" }, L("ing.names.other")), machineChip, translateBtn);

  function paintMachine(): void {
    machineChip.hidden = !(d.enMachine || d.ukMachine);
  }
  function setTranslateHint(text: string): void {
    translateHint.textContent = text;
    translateHint.hidden = text === "";
  }

  let translating = false;
  /** manual = 点了「机翻」：两个都覆盖；自动（zh 改完）：只填用户没改过的 */
  async function translate(manual: boolean): Promise<void> {
    const zh = d.zh.trim();
    if (!zh || translating) return;
    if (!manual && (zh === d.translatedFrom || (d.enTouched && d.ukTouched))) return;
    translating = true;
    const done = busy(translateBtn, L("ing.translating"));
    setTranslateHint("");
    try {
      const r = await api.translate(zh, ["en", "uk"]);
      d.translatedFrom = zh;
      if (r.en && (manual || !d.enTouched)) {
        d.en = r.en;
        d.enTouched = false;
        d.enMachine = true;
        enInput.value = r.en;
      }
      if (r.uk && (manual || !d.ukTouched)) {
        d.uk = r.uk;
        d.ukTouched = false;
        d.ukMachine = true;
        ukInput.value = r.uk;
      }
      if (!r.en && !r.uk) setTranslateHint(L("ing.translateFailed"));
      paintMachine();
      syncSlug();
      changed();
    } catch {
      // 不阻塞保存（I18nString 只要求至少一种语言）；401 留给保存那一步去锁屏
      setTranslateHint(L("ing.translateFailed"));
    } finally {
      done();
      translating = false;
    }
  }

  // ---- 英文短名 = id ----------------------------------------------------------
  const idInput = text(
    d.id,
    { autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "next", readonly: opts.editing ? true : null },
    (v) => {
      d.id = v;
      d.idTouched = v.trim() !== "";
      refreshDup();
    },
  );
  const dupBox = h("p", { class: "adm-ing-dup", role: "status", hidden: true });
  const idRow = row("id", "/id", L("ing.slug"), idInput, L(opts.editing ? "ing.slug.locked" : "ing.slug.hint"));
  idRow.append(dupBox);

  function syncSlug(): void {
    if (opts.editing || d.idTouched) return;
    d.id = slugify(d.en);
    idInput.value = d.id;
    refreshDup();
  }

  let dup: { id: string; name: string } | null = null;
  function findDup(): { id: string; name: string } | null {
    if (!catalog || opts.editing) return null;
    const entries = catalog.ingredients;
    const hit = (k: string): { id: string; name: string } | null => {
      const v = entries[k];
      return v ? { id: k, name: v.name.zh ?? v.name.en ?? v.name.uk ?? k } : null;
    };
    const id = d.id.trim();
    if (id && entries[id]) return hit(id);
    const zh = d.zh.trim();
    if (zh) for (const [k, v] of Object.entries(entries)) if ((v.name.zh ?? "").trim() === zh) return hit(k);
    return null;
  }
  function refreshDup(): void {
    dup = findDup();
    dupBox.replaceChildren();
    if (!dup) {
      dupBox.hidden = true;
      return;
    }
    const target = dup.id;
    const link = h("a", { class: "adm-ing-dup-link", href: adminHref("ingredient", target) }, `${L("ing.slug.goEdit")} → ${dup.name} (${target})`);
    link.addEventListener("click", (ev) => {
      if (!opts.onGoEdit) return;
      ev.preventDefault();
      opts.onGoEdit(target);
    });
    append(dupBox, L("ing.slug.taken"), " ", link);
    dupBox.hidden = false;
  }

  // ---- 照片 -------------------------------------------------------------------
  const cameraInput = h("input", { type: "file", accept: "image/*", capture: "environment", class: "sr-only adm-ing-file" });
  const pickInput = h("input", { type: "file", accept: "image/*", class: "sr-only adm-ing-file", id: `${P}-photo-pick` });
  for (const input of [cameraInput, pickInput]) {
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.value = "";
      if (file) void takePhoto(file);
    });
  }
  const photoView = h("div", { class: "adm-ing-photo-view" });
  const photoMsg = h("p", { class: "adm-ing-hint adm-ing-warn", role: "status", hidden: true });
  // 两个 file input 常驻（fieldRow 把 id 落在第一个上，<label for> 才不会悬空），只重画 photoView
  const photoBox = h("div", { class: "adm-ing-photo" }, cameraInput, pickInput, photoView, photoMsg);
  const photoRow = row("photo", "/image", L("ing.photo"), photoBox);

  function setPhotoMsg(text: string): void {
    photoMsg.textContent = text;
    photoMsg.hidden = text === "";
  }
  function dropPending(): void {
    if (d.pending) URL.revokeObjectURL(d.pending.previewUrl);
    d.pending = null;
  }

  async function takePhoto(file: File): Promise<void> {
    setPhotoMsg(L("ing.photo.compressing"));
    let out: CompressedImage | null;
    try {
      out = await compressImage(file);
    } catch {
      setPhotoMsg(L("ing.photo.unreadable"));
      return;
    }
    if (!out) {
      setPhotoMsg(L("ing.photo.tooBig"));
      return;
    }
    dropPending();
    d.pending = { blob: out.blob, width: out.width, height: out.height, previewUrl: URL.createObjectURL(out.blob), license: "own", author: "", sourceUrl: "" };
    d.image = null;
    setPhotoMsg("");
    changed();
    paintPhoto();
  }

  function paintPhoto(): void {
    photoView.replaceChildren();
    if (d.pending) {
      const p = d.pending;
      const licenseInput = text(p.license, { enterkeyhint: "next" }, (v) => {
        p.license = v;
      });
      const authorInput = text(p.author, { enterkeyhint: "next" }, (v) => {
        p.author = v;
      });
      const urlInput = text(p.sourceUrl, { inputmode: "url", enterkeyhint: "next", autocapitalize: "off" }, (v) => {
        p.sourceUrl = v;
      });
      const remove = button({
        label: L("ing.photo.remove"),
        onClick: () => {
          dropPending();
          changed();
          paintPhoto();
        },
      });
      photoView.append(
        h(
          "div",
          { class: "adm-ing-preview" },
          h("img", { src: p.previewUrl, alt: "" }),
          h(
            "div",
            { class: "adm-ing-preview-meta" },
            h("p", { class: "muted" }, L("ing.photo.pending", { kb: Math.round(p.blob.size / 1024), w: p.width, h: p.height })),
            h("div", { class: "adm-ing-photo-actions" }, remove),
          ),
        ),
        row("image-license", "/image/license", L("ing.photo.license"), licenseInput, L("ing.photo.license.hint")),
        h("div", { class: "adm-ing-grid2" }, row("image-author", "/image/author", L("ing.photo.author"), authorInput), row("image-sourceUrl", "/image/sourceUrl", L("ing.photo.sourceUrl"), urlInput)),
      );
      return;
    }
    if (d.image) {
      const img = d.image;
      const remove = button({
        label: L("ing.photo.remove"),
        onClick: () => {
          d.image = null;
          changed();
          paintPhoto();
        },
      });
      // 取图带回来的 license / author / sourceUrl 只读展示（§4.4 Wikidata 一行）
      photoView.append(
        h(
          "div",
          { class: "adm-ing-preview" },
          h("img", { src: imgSrc(img.src), alt: "" }),
          h(
            "div",
            { class: "adm-ing-preview-meta" },
            h("p", {}, `${L("ing.photo.license")}: ${img.license}`),
            img.author ? h("p", {}, `${L("ing.photo.author")}: ${img.author}`) : null,
            img.sourceUrl ? h("p", {}, `${L("ing.photo.source")}: `, h("a", { href: img.sourceUrl, target: "_blank", rel: "noopener" }, img.sourceUrl)) : null,
            h("div", { class: "adm-ing-photo-actions" }, remove),
          ),
        ),
      );
      return;
    }
    const wikidata = button({ label: L("ing.photo.wikidata"), class: "adm-ing-tile", onClick: () => setPhotoMsg(L("ing.photo.wikidata.hint")) });
    wikidata.prepend(h("b", { "aria-hidden": "true" }, "W"));
    const video = button({ label: L("ing.photo.video"), class: "adm-ing-tile", onClick: () => setPhotoMsg(L("ing.photo.video.hint")) });
    video.setAttribute("aria-disabled", "true");
    video.prepend(h("b", { "aria-hidden": "true" }, "▶"));
    photoView.append(
      h(
        "div",
        { class: "adm-ing-photos" },
        h("label", { class: "adm-ing-tile", for: cameraInput.id }, h("b", { "aria-hidden": "true" }, "+"), L("ing.photo.camera")),
        h("label", { class: "adm-ing-tile", for: pickInput.id }, h("b", { "aria-hidden": "true" }, "…"), L("ing.photo.pick")),
        wikidata,
        video,
      ),
    );
  }
  paintPhoto();

  // ---- Wikidata 编号 ------------------------------------------------------------
  const externalInput = text(d.externalId, { autocapitalize: "characters", autocorrect: "off", spellcheck: "false", enterkeyhint: "next" }, (v) => {
    d.externalId = v;
  });
  const externalRow = row("externalId", "/externalId", L("ing.externalId"), externalInput, L("ing.externalId.hint"));

  // ---- 按什么算 / 一个多少克 / 净料率 -------------------------------------------------
  const seg = h("div", { class: "adm-ing-seg", role: "radiogroup", "aria-label": L("ing.baseUnit") });
  const segItems: HTMLLabelElement[] = [];
  const baseUnits: Unit[] = BASE_UNITS.includes(d.baseUnit) ? [...BASE_UNITS] : [...BASE_UNITS, d.baseUnit];
  for (const u of baseUnits) {
    const input = h("input", { type: "radio", name: `${P}-baseUnit`, value: u, class: "adm-ing-seg-input", checked: u === d.baseUnit ? true : null });
    const label = u === "g" ? L("ing.baseUnit.g") : u === "ml" ? L("ing.baseUnit.ml") : u === "pcs" ? L("ing.baseUnit.pcs") : unitLabel(u);
    const item = h("label", { class: `adm-ing-seg-item${u === d.baseUnit ? " adm-ing-on" : ""}` }, input, h("span", { class: "adm-ing-seg-text" }, label));
    input.addEventListener("change", () => {
      if (!input.checked) return;
      d.baseUnit = u;
      for (const it of segItems) it.classList.toggle("adm-ing-on", it === item);
      syncUnitRows();
      changed();
    });
    segItems.push(item);
    seg.append(item);
  }
  const baseUnitRow = row("baseUnit", "/baseUnit", L("ing.baseUnit"), seg);

  const pcsInput = text(d.pcsToGram, { inputmode: "decimal", enterkeyhint: "next" }, (v) => {
    d.pcsToGram = v;
    syncUnitRows();
  });
  const pcsRow = row("pcsToGram", "/pcsToGram", L("ing.pcsToGram"), affix(pcsInput, L("ing.unit.g")), L("ing.pcsToGram.hint"));

  const yieldInput = text(d.yieldPct, { inputmode: "decimal", enterkeyhint: "next", placeholder: "100" }, (v) => {
    d.yieldPct = v;
  });
  const yieldRow = row("yield", "/yield", L("ing.yield"), affix(yieldInput, "%"), L("ing.yield.hint"));

  function syncUnitRows(): void {
    // 「一个多少克」只在选「个」时出现（设计稿第 6 屏注）；按 g / ml 计但源文件已经带了值（tomato: 180）→ 也露出来，能看能改能清
    pcsRow.hidden = d.baseUnit !== "pcs" && d.pcsToGram.trim() === "";
    yieldRow.hidden = d.baseUnit === "pcs";
  }
  syncUnitRows();

  // ---- 调料开关 ---------------------------------------------------------------
  const roleRow = row(
    "role",
    "/role",
    L("ing.seasoning"),
    switchControl(d.role === "seasoning", L("ing.seasoning.hint"), (v) => {
      d.role = v ? "seasoning" : "main";
    }),
  );

  // ---- 怎么买 ------------------------------------------------------------------
  const supplierList = h("datalist", { id: `${P}-supplier-list` });
  const supplierInput = text(d.supplier, { list: `${P}-supplier-list`, enterkeyhint: "next" }, (v) => {
    d.supplier = v;
  });
  const supplierRow = row("supplier", "/purchase/supplier", L("ing.purchase.supplier"), h("div", { class: "adm-ing-supplier" }, supplierInput, supplierList), L("ing.purchase.supplier.new"));

  const packSizeInput = text(d.packSize, { inputmode: "decimal", enterkeyhint: "next" }, (v) => {
    d.packSize = v;
  });
  const packSizeRow = row("packSize", "/purchase/packSize", L("ing.purchase.packSize"), packSizeInput);
  const packUnits: Unit[] = PACK_UNITS.includes(d.packUnit) ? [...PACK_UNITS] : [...PACK_UNITS, d.packUnit];
  const packUnitSelect = select(packUnits, d.packUnit, (v) => unitLabel(v as Unit), (v) => {
    d.packUnit = v as Unit;
  });
  const packUnitRow = row("packUnit", "/purchase/packUnit", L("ing.purchase.packUnit"), packUnitSelect);
  const minPacksRow = row(
    "minPacks",
    "/purchase/minPacks",
    L("ing.purchase.minPacks"),
    stepper({
      value: d.minPacks,
      min: 1,
      step: 1,
      label: L("ing.purchase.minPacks"),
      onChange: (v) => {
        d.minPacks = v;
        d.minPacksExplicit = true;
        changed();
      },
    }),
  );
  const priceInput = text(d.priceAmount, { inputmode: "decimal", enterkeyhint: "next" }, (v) => {
    d.priceAmount = v;
  });
  const priceRow = row("lastPrice", "/purchase/lastPrice/amount", L("ing.purchase.lastPrice"), priceInput);
  const currencyRow = row(
    "currency",
    "/purchase/lastPrice/currency",
    L("ing.purchase.currency"),
    select(CURRENCIES, d.currency, (c) => c, (v) => {
      d.currency = v as Currency;
    }),
  );

  // ---- 库存 --------------------------------------------------------------------
  const onHandInput = text(d.onHand, { inputmode: "decimal", enterkeyhint: "done" }, (v) => {
    d.onHand = v;
  });
  const onHandRow = row("onHand", "/onHand", L("ing.onHand"), onHandInput, L("ing.onHand.hint"));
  const trackRow = row(
    "trackStock",
    "/trackStock",
    L("ing.trackStock"),
    switchControl(d.trackStock, L("ing.trackStock.hint"), (v) => {
      d.trackStock = v;
      onHandRow.hidden = !v;
    }),
  );
  onHandRow.hidden = !d.trackStock;

  // ---- 组装 --------------------------------------------------------------------
  const basic = h(
    "div",
    { class: "card adm-ing-card" },
    zhRow,
    namesSub,
    h("div", { class: "adm-ing-grid2" }, enRow, ukRow),
    translateHint,
    idRow,
    photoRow,
    externalRow,
    baseUnitRow,
    pcsRow,
    yieldRow,
    roleRow,
  );
  const buy = h(
    "div",
    { class: "card adm-ing-card" },
    h("p", { class: "adm-ing-hint muted" }, L("ing.purchase.hint")),
    supplierRow,
    h("div", { class: "adm-ing-grid3" }, packSizeRow, packUnitRow, minPacksRow),
    h("div", { class: "adm-ing-grid2" }, priceRow, currencyRow),
    trackRow,
    onHandRow,
  );
  const el = h("div", { class: "adm-ing-body" }, basic, h("p", { class: "section-label adm-ing-label" }, L("ing.purchase")), buy);

  function setCatalog(c: Catalog): void {
    catalog = c;
    supplierList.replaceChildren(...c.suppliers.map((s) => h("option", { value: s })));
    refreshDup();
  }
  if (catalog) setCatalog(catalog);
  // handoff 带来的中文名（#24「新建这个食材」）：一进来就机翻一次；切语言重画时 translatedFrom 已等于 zh，不会重复调
  if (d.zh.trim() && !opts.editing) void translate(false);

  return {
    el,
    localErrors() {
      const errs: FieldError[] = [];
      if (!opts.editing) {
        const id = d.id.trim();
        if (!id) errs.push({ path: "/id", code: "required", message: L("ing.slug.required") });
        else if (!ID_RE.test(id)) errs.push({ path: "/id", code: "pattern", message: L("ing.slug.bad") });
        else if (dup && dup.id === id) errs.push({ path: "/id", code: "conflict", message: L("ing.slug.taken") });
      }
      if (d.pending && !d.pending.license.trim()) errs.push({ path: "/image/license", code: "required", message: L("ing.photo.licenseRequired") });
      return errs;
    },
    toIngredient: () => draftToIngredient(d),
    id: () => d.id.trim(),
    pendingImage() {
      if (!d.pending) return null;
      const meta: ImageMeta = { license: d.pending.license.trim() };
      if (d.pending.author.trim()) meta.author = d.pending.author.trim();
      if (d.pending.sourceUrl.trim()) meta.sourceUrl = d.pending.sourceUrl.trim();
      return { blob: d.pending.blob, meta };
    },
    setImage(ref) {
      dropPending();
      d.image = ref ? { ...ref } : null;
      paintPhoto();
    },
    showErrors(errors) {
      applyFieldErrors(el, errors.map(remapError));
    },
    clearErrors() {
      clearFieldErrors(el);
    },
    setCatalog,
  };
}

export type SubmitOutcome = { ok: true; result: WriteResult } | { ok: false; stage: "upload" | "save"; error: unknown };

/**
 * 提交：有待上传的照片就先 api.uploadImage("ingredients", id, blob, meta)（成功后 ImageRef 进草稿，失败 stage = "upload"，
 * 表单其它内容原样保留），再 api.saveIngredient(id, ingredient, { ifMatch })（失败 stage = "save"）。
 * 不吞错：error 是原始的 ApiError / TypeError，调用方按 §4.0 分流（401 / 字段级 / 409 / 其它）。
 */
export async function submitIngredientForm(api: AdminApi, form: IngredientFormHandle, opts: { ifMatch?: string } = {}): Promise<SubmitOutcome> {
  const id = form.id();
  const pending = form.pendingImage();
  if (pending) {
    try {
      form.setImage(await api.uploadImage("ingredients", id, pending.blob, pending.meta));
    } catch (error) {
      return { ok: false, stage: "upload", error };
    }
  }
  try {
    const result = await api.saveIngredient(id, form.toIngredient(), opts.ifMatch ? { ifMatch: opts.ifMatch } : undefined);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, stage: "save", error };
  }
}

// ---------------------------------------------------------------------------
// 屏：模块级草稿（推论 A）+ 离开即丢弃 + 保存分流
// ---------------------------------------------------------------------------

let draft: IngredientDraft | null = null;
/** 草稿对应的 rest（"new" | "<id>"）；切语言重画时 rest 没变 → 回填 */
let draftKey: string | null = null;
/** #24 / #22 带来的「保存后回哪」（store.takeHandoff 读一次即清空，所以记在这） */
let returnTo: string | null = null;
let unwatch: (() => void) | null = null;
let disposePaint: (() => void) | null = null;

function discardDraft(): void {
  if (draft?.pending) URL.revokeObjectURL(draft.pending.previewUrl);
  draft = null;
  draftKey = null;
  returnTo = null;
  unwatch?.();
  unwatch = null;
  disposePaint?.();
  disposePaint = null;
}

function isMyHash(hash: string, key: string): boolean {
  const m = /^#\/?admin\/ingredient\/([^/?#]+)\/?$/.exec(hash);
  if (!m?.[1]) return false;
  try {
    return decodeURIComponent(m[1]) === key;
  } catch {
    return false;
  }
}

/** 离开本屏（hashchange 到别处）= 丢弃草稿（§4.0）；刷新 / 关页有未保存改动时 beforeunload 拦一下 */
function watchLeave(key: string): void {
  if (unwatch) return;
  const onHash = (): void => {
    if (!isMyHash(location.hash, key)) discardDraft();
  };
  const onUnload = (ev: BeforeUnloadEvent): void => {
    if (!draft?.dirty) return;
    ev.preventDefault();
    ev.returnValue = true; // Chrome / Edge < 119 还要这个
  };
  window.addEventListener("hashchange", onHash);
  window.addEventListener("beforeunload", onUnload);
  unwatch = () => {
    window.removeEventListener("hashchange", onHash);
    window.removeEventListener("beforeunload", onUnload);
  };
}

/** Enter = 下一格（中文输入法选词的 Enter 不拦：isComposing）；最后一格 Enter = 收起键盘。保存只认底部按钮，免得手滑提交 */
function enterToNext(ev: KeyboardEvent): void {
  if (ev.key !== "Enter" || ev.isComposing) return;
  const target = ev.target;
  if (!(target instanceof HTMLInputElement) || target.type === "checkbox" || target.type === "radio" || target.type === "file") return;
  const form = target.form;
  if (!form) return;
  ev.preventDefault();
  const fields = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")].filter(
    (x) => !x.disabled && x.offsetParent !== null && !(x instanceof HTMLInputElement && (x.type === "checkbox" || x.type === "radio" || x.type === "file")),
  );
  const next = fields[fields.indexOf(target) + 1];
  if (next) next.focus();
  else target.blur();
}

export async function render(el: HTMLElement, ctx: PageCtx, rest: string): Promise<void> {
  const lang = ctx.lang;
  const api = getApi();
  const isNew = rest === "new";

  if (draftKey !== rest) {
    discardDraft();
    draftKey = rest;
    const hand = takeHandoff();
    returnTo = hand.returnTo ?? null;
    if (isNew) draft = createIngredientDraft(hand.newIngredientName ? { zh: hand.newIngredientName } : {});
  }
  watchLeave(rest);

  if (!draft) {
    // 改食材：先读源文件（content + blobSha）
    const bar = (): HTMLElement => topBar({ back: adminHref(), title: tt(lang, "ing.title.edit") });
    const root = h("div", { class: "adm adm-ing" }, bar(), h("p", { class: "muted" }, adm("adm.loading", undefined, lang)));
    el.append(root);
    let src: Awaited<ReturnType<AdminApi["getIngredient"]>>;
    try {
      src = await api.getIngredient(rest);
    } catch (err) {
      if (!el.isConnected) return;
      if (isApiError(err) && err.status === 401) {
        discardDraft();
        sessionExpired(el, lang);
        return;
      }
      root.replaceChildren(
        bar(),
        errorCard(apiMessage(err, lang), () => {
          el.replaceChildren();
          void render(el, ctx, rest);
        }),
      );
      return;
    }
    if (!el.isConnected) return; // 语言 / 路由已变：下一次 render 会再读
    if (!src) {
      root.replaceChildren(
        bar(),
        h("div", { class: "card adm-ing-notfound", role: "status" }, h("p", {}, tt(lang, "ing.notFound")), h("a", { class: "adm-btn", href: adminHref() }, adm("adm.back.home", undefined, lang))),
      );
      return;
    }
    draft = draftFromIngredient(src.content, rest, src.blobSha);
    el.replaceChildren();
  }
  paintScreen(el, ctx, rest, api, []);
}

function paintScreen(el: HTMLElement, ctx: PageCtx, rest: string, api: AdminApi, flash: HTMLElement[]): void {
  const lang = ctx.lang;
  if (!draft) return;
  const d: IngredientDraft = draft; // 下面的函数声明会被提升，闭包里拿不到 if 的收窄，所以显式标类型
  disposePaint?.();
  /** 存过一次（blobSha 已有）就按「改食材」画：id 锁定、不查重、带 If-Match */
  const editing = d.blobSha !== null;
  const title = tt(lang, editing || rest !== "new" ? "ing.title.edit" : "ing.title.new");
  let catalog: Catalog | null = null;
  let saving = false;

  const notices = h("div", { class: "adm-ing-notices" }, ...flash);
  const transient: HTMLElement[] = [];
  function addTransient(node: HTMLElement): void {
    transient.push(node);
    notices.append(node);
  }
  function clearTransient(): void {
    for (const n of transient) n.remove();
    transient.length = 0;
  }

  function leaveTo(hash: string): void {
    if (d.dirty && !window.confirm(adm("adm.leave.confirm", undefined, lang))) return;
    location.hash = hash; // hashchange → watchLeave 丢弃草稿
  }

  const form = buildIngredientForm({ lang, api, draft: d, editing, catalog: null, onGoEdit: (id) => leaveTo(adminHref("ingredient", id)) });
  const saveBtn = button({ label: returnTo ? tt(lang, "ing.save.return") : adm("adm.save", undefined, lang), kind: "primary", type: "submit", class: "adm-ing-save" });
  const formEl = h("form", { class: "adm-ing-form", novalidate: true }, form.el, h("div", { class: "adm-ing-bottom" }, saveBtn));
  formEl.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void save();
  });
  formEl.addEventListener("keydown", enterToNext);
  el.append(h("div", { class: "adm adm-ing" }, topBar({ back: () => leaveTo(returnTo ?? adminHref()), title }), notices, formEl));

  // 没网：只能看不能存（§4.1 / §7 排除 2、3）
  const offline = notice({ kind: "info", text: adm("adm.offline", undefined, lang) });
  notices.append(offline);
  function syncNet(): void {
    const online = navigator.onLine;
    offline.hidden = online;
    saveBtn.disabled = !online;
  }
  syncNet();
  window.addEventListener("online", syncNet);
  window.addEventListener("offline", syncNet);
  disposePaint = () => {
    window.removeEventListener("online", syncNet);
    window.removeEventListener("offline", syncNet);
  };

  // 供应商下拉 + 查重：晚到就晚到，不阻塞（§4.4 空态）
  void api
    .getCatalog()
    .then((c) => {
      if (!el.isConnected) return;
      catalog = c;
      form.setCatalog(c);
    })
    .catch(() => {
      /* 取不到就只留自由输入 */
    });

  function reload(): void {
    // 409：丢掉本地改动，按线上版本重读。新建后第一次撞上时 rest 还是 "new"，跳到 /ingredient/<id> 重进
    const id = form.id();
    discardDraft();
    if (rest === "new" && id) {
      location.hash = adminHref("ingredient", id);
      return;
    }
    el.replaceChildren();
    void render(el, ctx, rest);
  }

  async function save(): Promise<void> {
    if (saving) return;
    if (!navigator.onLine) {
      syncNet();
      return;
    }
    form.clearErrors();
    clearTransient();
    // 新建时 catalog 还没到 → 先等它一次再查重，免得静默覆盖同名文件（worker 不带 If-Match 会直接写）
    if (!editing && !catalog) {
      try {
        catalog = await api.getCatalog();
        if (!el.isConnected) return;
        form.setCatalog(catalog);
      } catch {
        /* 查不了重也让存 */
      }
    }
    const local = form.localErrors();
    if (local.length > 0) {
      form.showErrors(local);
      return;
    }
    saving = true;
    const done = busy(saveBtn, adm("adm.saving", undefined, lang));
    try {
      const out = await submitIngredientForm(api, form, d.blobSha ? { ifMatch: d.blobSha } : {});
      if (out.ok) {
        d.blobSha = out.result.blobSha;
        d.dirty = false;
        if (returnTo) {
          location.hash = returnTo; // 从复核 / 导入屏跳来的：保存成功后回去（hashchange → 丢弃已保存的草稿）
          return;
        }
        if (!el.isConnected) return;
        // 直接进来的：留在本屏，顶部绿条「已存好 · 还没发布」+「回工作台」；重画成「改食材」（id 锁定、以后带 If-Match）
        const warns = out.result.warnings.filter((w) => w !== "no-if-match");
        const bars: HTMLElement[] = [
          notice({
            kind: "ok",
            text: adm(out.result.unchanged ? "adm.saved.unchanged" : "adm.saved", undefined, lang),
            action: { label: adm("adm.back.home", undefined, lang), href: adminHref() },
          }),
        ];
        if (warns.length > 0) bars.push(notice({ kind: "warn", text: tt(lang, "ing.warnings", { list: warns.join(", ") }) }));
        el.replaceChildren();
        paintScreen(el, ctx, rest, api, bars);
        return;
      }
      const err = out.error;
      if (!el.isConnected) return;
      if (isApiError(err) && err.status === 401) {
        discardDraft();
        sessionExpired(el, lang);
        return;
      }
      if (out.stage === "upload") {
        // 只在照片区显示错误，表单其它内容原样（§4.4）；已传上去的不会重传（setImage 已写进草稿）
        const errors: FieldError[] =
          isApiError(err) && err.hasFieldErrors ? err.errors : [{ path: "/image", code: isApiError(err) ? err.code : "network", message: tt(lang, "ing.photo.uploadFailed", { msg: apiMessage(err, lang) }) }];
        form.showErrors(errors);
        return;
      }
      if (isApiError(err) && (err.hasFieldErrors || err.status === 400)) {
        form.showErrors(err.errors); // message 原样，按 JSON Pointer 标黄，焦点移到第一个出错控件（kit）
        return;
      }
      if (isApiError(err) && err.status === 409) {
        addTransient(errorCard(apiMessage(err, lang), reload)); // 「有人刚改过，刷新后重试」+ 重新读取
        return;
      }
      addTransient(errorCard(apiMessage(err, lang), () => void save())); // 403 / 413 / 429 / 502 / 503 / 断网：原样 + 重试
    } finally {
      done();
      saving = false;
    }
  }
}
