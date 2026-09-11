/** Reusable Ingredient form. The caller owns raw inputs, auth and operation tickets. */
import "./ingredient-new.css";
import { EditorModuleUnavailable, legacyModuleUnavailable, loadEditorImage, moduleUnavailableMessage } from "./editor-actions";
import { createIngredientDraft, draftFromIngredient, draftToIngredient, slugify, type IngredientDraft, type PendingImage } from "./ingredient-draft";
export { createIngredientDraft, draftFromIngredient, draftToIngredient, slugify, type IngredientDraft, type PendingImage } from "./ingredient-draft";
import type { CompressedImage } from "./editor-image";
export type { CompressedImage } from "./editor-image";
export const IMAGE_MAX_EDGE = 1280;
export const IMAGE_MAX_BYTES = 200 * 1024;
export async function compressImage(file: Blob, limits = { maxEdge: IMAGE_MAX_EDGE, maxBytes: IMAGE_MAX_BYTES }): Promise<CompressedImage | null> {
  const module = await loadEditorImage();
  return module.compressImage(file, limits);
}

import type { Currency, Unit } from "@canteenos/core";

import type { AdminApi } from "../../api/client";
import { type Catalog, type FieldError, type ImageMeta, type ImageRef, type Ingredient, type WriteResult } from "../../api/types";
import { adm, applyFieldErrors, busy, button, clearFieldErrors, fieldRow, stepper } from "../../admin/kit";
import { append, h } from "../../dom";
import type { Lang } from "../../i18n";
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
    uk: "Дані про паковання впливають на довідкову кількість. Якщо їх не вказано, інгредієнт усе одно можна перевірити вручну у списку закупівель.",
    zh: "包装信息影响可选的数量参考；未填写时，仍可在采购清单中人工核对这个食材。",
    en: "Packaging details inform optional quantity references. If left blank, you can still check this ingredient manually in the shopping list.",
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

export function tt(lang: Lang, key: Key, params?: Params): string {
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


type Attrs = Record<string, string | number | boolean | null | undefined>;

// ---------------------------------------------------------------------------
// 草稿（推论 A：全部是原始输入串，切语言回填时一个字都不丢）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 照片压缩（决议追加「§9 图片压缩」：浏览器 canvas 压到最长边 ≤ 1280 且 ≤ 200 KB；worker 只校验尺寸与 magic bytes）
// ---------------------------------------------------------------------------

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
  api: AdminApi | (() => Promise<AdminApi>);
  /** 草稿：调用方自己持有（本屏放模块级变量；#24 放自己的），表单件只读写它 */
  draft: IngredientDraft;
  /** true = 文件已存在：id 锁定、不查重 */
  editing: boolean;
  /** 供应商下拉 + 重名检查；null = catalog 还没到（只留自由输入，不阻塞；晚到时 setCatalog） */
  catalog: Pick<Catalog, "ingredients" | "suppliers"> | null;
  /** DOM id 前缀（§3.4：adm-<screen>-<field>）；#24 内嵌时换一个，免得与自己的字段撞 id */
  idPrefix?: string;
  /** 任何输入变化后回调（草稿的 dirty 已经置好） */
  onChange?: () => void;
  /** Optional owner lifetime for the private photo/translation awaits. Null declines a new task. */
  onTaskStart?: (kind: "photo" | "translation") => { valid(): boolean; finish(): void } | null;
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
  setCatalog(catalog: Pick<Catalog, "ingredients" | "suppliers">): void;
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
    const task = opts.onTaskStart?.("translation");
    if (task === null) return;
    translating = true;
    const done = busy(translateBtn, L("ing.translating"));
    setTranslateHint("");
    try {
      const legacy = typeof api === "function" ? await api() : api;
      if (task && !task.valid()) return;
      const r = await legacy.translate(zh, ["en", "uk"]);
      if (task && !task.valid()) return;
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
    } catch (error) {
      // 不阻塞保存（I18nString 只要求至少一种语言）；401 留给保存那一步去锁屏
      if (!task || task.valid()) setTranslateHint(error instanceof EditorModuleUnavailable ? moduleUnavailableMessage(lang) : L("ing.translateFailed"));
    } finally {
      done();
      translating = false;
      task?.finish();
      if (legacyModuleUnavailable()) translateBtn.disabled = true;
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
    const task = opts.onTaskStart?.("photo");
    if (task === null) return;
    setPhotoMsg(L("ing.photo.compressing"));
    try {
      let out: CompressedImage | null;
      try {
        const image = await loadEditorImage();
        if (task && !task.valid()) return;
        out = await image.compressImage(file);
      } catch (error) {
        if (!task || task.valid()) setPhotoMsg(error instanceof EditorModuleUnavailable ? moduleUnavailableMessage(lang) : L("ing.photo.unreadable"));
        return;
      }
      if (task && !task.valid()) return;
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
    } finally {
      task?.finish();
    }
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

  function setCatalog(c: Pick<Catalog, "ingredients" | "suppliers">): void {
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

