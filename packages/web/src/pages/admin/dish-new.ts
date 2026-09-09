/**
 * /admin/dish/new · /admin/dish/<id> —— 手动加菜 / 改菜 / 补全草稿（#24；docs/specs/v03-admin-frontend-contract.md §4.5）。
 *
 * 两个标签页：「手动输入」（本 PR 的全部内容）与「从视频」（只放占位：第二轮上线，现在由 Terry 用命令行导入，链接到
 * skills/video-recipe-ingest/SKILL.md；§4.5 屏上有什么第 7 条）。
 *
 * 手动输入分支：
 *   - 顶部 readiness 三 chip（能教 / 能排 / 能采）：@canteenos/core 的 readiness() 喂当前表单值 + catalog 的食材，随输入实时变化，
 *     BuildReadiness.missing 的机器键（prep:<ref> / components / steps / baseServings / qty:<ref> / ingredient:<ref> / purchase:<ref>）翻成人话；
 *   - 三语名：zh 必填，en / uk 由 api.translate 即时填充并标「机翻，可改」，用户改过就不再自动覆盖；一句话简介同法；
 *   - 英文短名 = 实体 id = 文件名（D-04 / §9 矛盾 6）：默认由 name.en slug 化，可改；catalog.dishes 查重（id 撞名阻止 + 「去改它」）；存过一次锁定；
 *   - 基准份数 baseServings：kit.stepper，默认 50（§9 矛盾 10：本轮常量）；
 *   - 配料 components[]：从 api.getCatalog().ingredients 搜索添加；每条 = 用量（数量 + 单位，或「适量」= to-taste，value 不写）/
 *     怎么切（techniqueRef，只能从 catalog.techniques 闭集选，词表读不到则禁用）/ 切多大 / 提前多久 / 备注（三语）；
 *     食材库里没有 → 行内内联 #23 的食材表单件（buildIngredientForm / submitIngredientForm），存成功后该行直接引用新 id；
 *     上移 / 下移按钮（§7 第 8 条：不做拖拽）；删掉可撤销；收起时只显示「食材名 · 用量」；
 *   - 步骤 steps[]：文本（三语，可机翻）+ 可选技法；上移 / 下移 / 删掉；
 *   - 成品图 image：拍一张 / 选一张 → compressImage（#23 的 canvas 压图）→ 保存时 api.uploadImage("dishes", id, …)；license 必填；
 *   - provenance：手输分支写死 { source: "manual" }；改菜时原样保留源文件的 provenance（视频导入的菜仍是 video）；绝不写 example；
 *   - 「存草稿」→ api.saveDishDraft（worker 无条件 draft；warnings 含 status-forced 时照实说）；
 *     「入库」→ api.saveDish(…, status: "active")（决议追加第 1 条：不置灰，schema 校验是唯一闸门）；
 *   - 改菜 / 补全草稿：api.getDish(id) 载入，保存带 ifMatch = blobSha；409 → 「有人刚改过」+ 重新读取；
 *   - 字段错误：worker / mock 的 errors[] 交给 kit.applyFieldErrors 按 JSON Pointer 标黄（/components/2/qty/value …），message 原样；
 *     标黄前先把命中的配料 / 步骤卡展开；本地只查 API 看不见的：id 形状 / 撞名、待上传照片缺许可、还没选食材的行、没存的内联新食材；
 *   - 从 #22 的导入屏跳来（store.takeHandoff）：菜名预填 newDishName，保存成功后回 returnTo；
 *   - 推论 A：整份表单的未提交值（含 components / steps 数组、内联食材表单的草稿）都在模块级 `draft` 里，切语言 = 重新 render 时回填；
 *     离开本屏（hashchange 到别处）即丢弃；有未保存改动时 beforeunload 拦一下；返回键先二次确认；
 *   - 文案：私有字典 T（前缀 dish.，三语齐全）；共用文案走 kit 的 adm()；
 *   - 样式：同目录 dish-new.css，每条选择器以 .adm-dish 开头；不改 kit.ts / store.ts / api/* / ingredient-new.ts（§3.4 规则 0）。
 *
 * 字段映射（schemas/dish.schema.json 逐条；见 draftToDish）：schemaVersion 写死 "2"；name / description 只写非空语言；
 * image 只在有图时写；baseServings 整数 ≥ 1；components / steps 为空时整个不写（minItems 1）；qty unit=to-taste 时不写 value；
 * prep 只在任一子字段非空时写（给了 prep 就得有 techniqueRef，缺了让校验按 pointer 标黄）；confidence / prep.image / steps[].image /
 * steps[].clip 表单不编辑，载入什么写回什么（改视频导入的菜不丢字段）；status 由按钮决定。
 */
import "./dish-new.css";

import { readiness, type DishComponent, type DishPrep, type DishProvenance, type DishStatus, type DishStep, type I18nString, type PrepTiming, type Technique, type Unit } from "@canteenos/core";

import { getApi, type AdminApi } from "../../api/client";
import { isApiError, type Catalog, type Dish, type FieldError, type ImageMeta, type ImageRef } from "../../api/types";
import { adm, apiMessage, applyFieldErrors, busy, button, clearFieldErrors, errorCard, fieldRow, notice, sessionExpired, stepper, topBar } from "../../admin/kit";
import { takeHandoff } from "../../admin/store";
import { append, h } from "../../dom";
import { pick, type Lang } from "../../i18n";
import type { PageCtx } from "../../types";
import { adminHref } from "../admin";
import {
  buildIngredientForm,
  compressImage,
  createIngredientDraft,
  slugify,
  submitIngredientForm,
  type CompressedImage,
  type IngredientDraft,
} from "./ingredient-new";

// ---------------------------------------------------------------------------
// 文案（§5.2：点分小写，前缀 dish.，三语缺一即编译错误；§5.4 的最小集 + 本屏自用）
// ---------------------------------------------------------------------------

const T = {
  "dish.title.new": { uk: "Додати страву", zh: "加一道菜", en: "Add a dish" },
  "dish.title.edit": { uk: "Змінити страву", zh: "改这道菜", en: "Edit this dish" },
  "dish.notFound": { uk: "Такої страви немає", zh: "没找到这道菜", en: "Couldn't find this dish" },
  "dish.tab.manual": { uk: "Ввести вручну", zh: "手动输入", en: "Enter by hand" },
  "dish.tab.video": { uk: "З відео", zh: "从视频", en: "From video" },
  "dish.video.later": {
    uk: "З'явиться на 2-му етапі; поки що Terry імпортує відео з командного рядка",
    zh: "第二轮上线；现在由 Terry 用命令行导入",
    en: "Coming in round 2; for now Terry imports videos from the command line",
  },
  "dish.video.link": { uk: "Інструкція для командного рядка", zh: "看命令行说明", en: "See the command-line guide" },

  "dish.status.draft": { uk: "Чернетка", zh: "草稿", en: "Draft" },
  "dish.status.active": { uk: "У базі", zh: "已入库", en: "In the library" },
  "dish.status.archived": { uk: "В архіві", zh: "已归档", en: "Archived" },

  "dish.ready.teach": { uk: "Можна навчити", zh: "能教", en: "Teachable" },
  "dish.ready.plan": { uk: "Можна планувати", zh: "能排", en: "Plannable" },
  "dish.ready.procure": { uk: "Можна закупити", zh: "能采", en: "Purchasable" },
  "dish.ready.ok": { uk: "так", zh: "✓", en: "✓" },
  "dish.ready.no": { uk: "ні", zh: "✗", en: "✗" },
  "dish.ready.unknown": { uk: "ще читаю базу", zh: "还在读食材库", en: "still loading the library" },
  "dish.missing.title": { uk: "Чого не вистачає", zh: "还差什么", en: "What's missing" },
  "dish.missing.none": { uk: "Усе на місці", zh: "什么都不缺", en: "Nothing missing" },
  "dish.missing.components": { uk: "Ще немає інгредієнтів", zh: "还没有配料", en: "No ingredients yet" },
  "dish.missing.steps": { uk: "Ще немає кроків", zh: "还没有步骤", en: "No steps yet" },
  "dish.missing.baseServings": { uk: "Не вказано, на скільки порцій", zh: "还没写按几份", en: "Servings not set" },
  "dish.missing.prep": { uk: "{name}: не вказано, як нарізати", zh: "{name} 还没写怎么切", en: "{name}: how to cut not set" },
  "dish.missing.qty": { uk: "{name}: не вказано кількість", zh: "{name} 还没写用量", en: "{name}: quantity not set" },
  "dish.missing.ingredient": { uk: "{name} немає в базі інгредієнтів", zh: "食材库里没有 {name}", en: "{name} isn't in the ingredient library" },
  "dish.missing.purchase": { uk: "{name}: не вказано, як купувати", zh: "{name} 还没写怎么买", en: "{name}: how to buy not set" },

  "dish.name.zh": { uk: "Назва страви", zh: "菜名", en: "Dish name" },
  "dish.name.zh.hint": {
    uk: "Обов'язково. Англійську та українську можна перекласти автоматично",
    zh: "必填；英文、乌克兰语可以机翻",
    en: "Required. English and Ukrainian can be machine-translated",
  },
  "dish.name.en": { uk: "Англійською", zh: "英文名", en: "In English" },
  "dish.name.uk": { uk: "Українською", zh: "乌克兰语名", en: "In Ukrainian" },
  "dish.names.other": { uk: "Англійська · українська", zh: "英文 · 乌克兰语", en: "English · Ukrainian" },
  "dish.translate": { uk: "Перекласти", zh: "机翻", en: "Translate" },
  "dish.translating": { uk: "Перекладаю…", zh: "机翻中…", en: "Translating…" },
  "dish.translateFailed": {
    uk: "Автопереклад зараз недоступний — можна зберегти лише китайську",
    zh: "机翻暂时用不了，可以先存中文",
    en: "Machine translation isn't available right now — you can save with just the Chinese text",
  },
  "dish.slug": { uk: "Коротка англійська назва (ім'я файлу)", zh: "英文短名（当文件名用）", en: "Short English name (used as the file name)" },
  "dish.slug.hint": { uk: "Лише малі латинські літери, цифри та дефіс", zh: "只能用小写字母、数字和短横线", en: "Lowercase letters, digits and hyphens only" },
  "dish.slug.locked": { uk: "Після збереження ім'я файлу змінити не можна", zh: "文件名存过就不能改了", en: "The file name can't change once saved" },
  "dish.slug.required": { uk: "Спочатку вкажіть коротку англійську назву", zh: "先填英文短名", en: "Fill in the short English name first" },
  "dish.slug.bad": {
    uk: "Лише малі латинські літери, цифри та дефіс; починається з літери",
    zh: "只能用小写字母、数字和短横线，开头必须是字母",
    en: "Lowercase letters, digits and hyphens only, starting with a letter",
  },
  "dish.slug.taken": { uk: "Така страва вже є — хочете змінити її?", zh: "已有同名的菜，是要改它吗？", en: "There's already a dish with this name — did you mean to edit it?" },
  "dish.slug.goEdit": { uk: "Перейти до неї", zh: "去改它", en: "Edit it instead" },

  "dish.description": { uk: "Один рядок опису (для гостей у меню)", zh: "一句话介绍（菜单上给顾客看）", en: "One-line description (shown to guests on the menu)" },
  "dish.description.en": { uk: "Опис англійською", zh: "介绍 · 英文", en: "Description in English" },
  "dish.description.uk": { uk: "Опис українською", zh: "介绍 · 乌克兰语", en: "Description in Ukrainian" },
  "dish.baseServings": { uk: "На скільки порцій написано рецепт", zh: "这个配方按几份写的", en: "How many servings this recipe is written for" },
  "dish.baseServings.hint": { uk: "Їдальня рахує за 50; закупівля масштабує від цього числа", zh: "食堂按 50 份写；采购按这个数缩放", en: "The canteen writes for 50; purchasing scales from this number" },

  "dish.photo": { uk: "Фото готової страви", zh: "成品图", en: "Photo of the finished dish" },
  "dish.photo.camera": { uk: "Зробити фото", zh: "拍一张", en: "Take a photo" },
  "dish.photo.pick": { uk: "Вибрати файл", zh: "选一张", en: "Choose a file" },
  "dish.photo.license": { uk: "Ліцензія", zh: "许可", en: "License" },
  "dish.photo.license.hint": {
    uk: "Власне фото: own; з інтернету — коротка назва ліцензії, напр. CC BY-SA 4.0",
    zh: "自己拍的填 own；网上来的填许可短名，如 CC BY-SA 4.0",
    en: "Your own photo: own; from the web: the license short name, e.g. CC BY-SA 4.0",
  },
  "dish.photo.author": { uk: "Автор (необов'язково)", zh: "作者（可不填）", en: "Author (optional)" },
  "dish.photo.sourceUrl": { uk: "Адреса джерела (необов'язково)", zh: "来源网址（可不填）", en: "Source URL (optional)" },
  "dish.photo.tooBig": { uk: "Це фото завелике — виберіть інше або обріжте", zh: "这张照片太大，换一张或裁小一点", en: "This photo is too big — try another one or crop it" },
  "dish.photo.unreadable": { uk: "Не вдалося відкрити зображення — спробуйте інше", zh: "这张图片打不开，换一张再试", en: "Can't open this image — try another one" },
  "dish.photo.compressing": { uk: "Стискаю…", zh: "正在压缩…", en: "Compressing…" },
  "dish.photo.pending": { uk: "Стиснуто до {kb} КБ · {w}×{h}; завантажиться під час збереження", zh: "已压到 {kb} KB · {w}×{h}，保存时一起上传", en: "Compressed to {kb} KB · {w}×{h}; uploads when you save" },
  "dish.photo.remove": { uk: "Прибрати фото", zh: "去掉照片", en: "Remove photo" },
  "dish.photo.licenseRequired": { uk: "Для фото потрібна ліцензія", zh: "照片要写许可", en: "The photo needs a license" },
  "dish.photo.uploadFailed": { uk: "Не вдалося завантажити фото: {msg}", zh: "照片没传上去：{msg}", en: "Photo upload failed: {msg}" },
  "dish.photo.source": { uk: "Джерело", zh: "来源", en: "Source" },

  "dish.components": { uk: "Інгредієнти", zh: "配料", en: "Ingredients" },
  "dish.components.count": { uk: "{n} інгр.", zh: "{n} 样", en: "{n} items" },
  "dish.components.add": { uk: "Додати інгредієнт", zh: "加一样配料", en: "Add an ingredient" },
  "dish.components.search": { uk: "Знайти інгредієнт", zh: "搜食材", en: "Search ingredients" },
  "dish.components.search.hint": { uk: "Введіть кілька літер назви", zh: "输一两个字就出结果", en: "Type a few letters of the name" },
  "dish.components.noMatch": { uk: "Нічого не знайдено", zh: "没搜到", en: "No matches" },
  "dish.components.newIngredient": { uk: "Немає в базі · створити", zh: "食材库里没有 · 新建", en: "Not in the library · create it" },
  "dish.components.noPurchase": { uk: "ще без даних закупівлі", zh: "还没写怎么买", en: "no purchase info yet" },
  "dish.components.unpicked": { uk: "(інгредієнт ще не вибрано)", zh: "（还没选食材）", en: "(no ingredient picked yet)" },
  "dish.components.pickFirst": { uk: "Спочатку виберіть інгредієнт", zh: "先选食材", en: "Pick an ingredient first" },
  "dish.components.change": { uk: "Замінити", zh: "换一个", en: "Change" },
  "dish.components.nth": { uk: "Інгредієнт {n}", zh: "第 {n} 个配料", en: "Ingredient {n}" },
  "dish.components.expand": { uk: "Розгорнути", zh: "展开", en: "Expand" },
  "dish.components.collapse": { uk: "Згорнути", zh: "收起", en: "Collapse" },
  "dish.components.catalogLoading": { uk: "Читаю базу інгредієнтів…", zh: "正在读食材库…", en: "Loading the ingredient library…" },
  "dish.components.catalogFailed": { uk: "Не вдалося прочитати базу інгредієнтів", zh: "食材库读不到", en: "Couldn't load the ingredient library" },
  "dish.newIngredient.title": { uk: "Новий інгредієнт", zh: "新食材", en: "New ingredient" },
  "dish.newIngredient.save": { uk: "Зберегти інгредієнт", zh: "存这个食材", en: "Save this ingredient" },
  "dish.newIngredient.saved": { uk: "Інгредієнт збережено, він підставлений у цей рядок", zh: "食材已存好，这行已经用上它了", en: "Ingredient saved and used on this row" },
  "dish.newIngredient.unsaved": { uk: "Спочатку збережіть новий інгредієнт (або скасуйте)", zh: "先把新食材存了（或者取消）", en: "Save the new ingredient first (or cancel it)" },

  "dish.qty": { uk: "Кількість", zh: "用量", en: "Quantity" },
  "dish.qty.unit": { uk: "Одиниця", zh: "单位", en: "Unit" },
  "dish.qty.toTaste": { uk: "За смаком", zh: "适量", en: "To taste" },
  "dish.qty.toTaste.hint": { uk: "Без кількості: закупівля пропускає цей рядок", zh: "不写数量：采购跳过这一行", en: "No amount: purchasing skips this row" },
  "dish.qty.required": { uk: "Вкажіть кількість або поставте «за смаком»", zh: "填个数量，或者勾「适量」", en: "Enter an amount or tick “to taste”" },
  "dish.prep.technique": { uk: "Як нарізати", zh: "怎么切", en: "How to cut" },
  "dish.prep.technique.none": { uk: "— не потрібно —", zh: "— 不用切 —", en: "— not needed —" },
  "dish.prep.technique.required": { uk: "Виберіть, як нарізати (або очистіть решту полів)", zh: "选一个切法（或把下面几格清空）", en: "Pick how to cut (or clear the fields below)" },
  "dish.prep.noCatalog": {
    uk: "Словник технік недоступний — поки що вкажіть лише кількість",
    zh: "技法词表读不到，先只填数量",
    en: "The technique list isn't available — fill in just the quantity for now",
  },
  "dish.prep.size": { uk: "Якого розміру", zh: "切多大", en: "How big" },
  "dish.prep.size.hint": { uk: "Напр. 3 мм або 2 см", zh: "如 3mm、2cm 见方", en: "e.g. 3 mm or 2 cm" },
  "dish.prep.timing": { uk: "Коли готувати", zh: "提前多久", en: "When to prep" },
  "dish.prep.timing.default": { uk: "— вранці (за замовчуванням) —", zh: "— 当天早上（缺省） —", en: "— that morning (default) —" },
  "dish.prep.timing.dayBefore": { uk: "Напередодні", zh: "前一天", en: "The day before" },
  "dish.prep.timing.morning": { uk: "Вранці того ж дня", zh: "当天早上", en: "That morning" },
  "dish.prep.timing.beforeService": { uk: "Перед подачею", zh: "开餐前", en: "Right before service" },
  "dish.prep.note": { uk: "Примітка", zh: "备注", en: "Note" },
  "dish.prep.note.en": { uk: "Примітка англійською", zh: "备注 · 英文", en: "Note in English" },
  "dish.prep.note.uk": { uk: "Примітка українською", zh: "备注 · 乌克兰语", en: "Note in Ukrainian" },
  "dish.prep.image": { uk: "Кадр нарізання (з відео)", zh: "切配照片（视频截帧）", en: "Cutting frame (from video)" },
  "dish.confidence": { uk: "Впевненість {v} ({src})", zh: "置信 {v}（{src}）", en: "Confidence {v} ({src})" },

  "dish.steps": { uk: "Кроки", zh: "步骤", en: "Steps" },
  "dish.steps.count": { uk: "{n} кроків", zh: "{n} 步", en: "{n} steps" },
  "dish.steps.add": { uk: "Додати крок", zh: "加一步", en: "Add a step" },
  "dish.steps.nth": { uk: "Крок {n}", zh: "第 {n} 步", en: "Step {n}" },
  "dish.steps.text": { uk: "Що робити", zh: "这一步做什么", en: "What to do" },
  "dish.steps.text.en": { uk: "Англійською", zh: "英文", en: "In English" },
  "dish.steps.text.uk": { uk: "Українською", zh: "乌克兰语", en: "In Ukrainian" },
  "dish.steps.text.required": { uk: "Напишіть, що робити на цьому кроці", zh: "写一下这一步做什么", en: "Write what this step does" },
  "dish.steps.technique": { uk: "Техніка (необов'язково)", zh: "技法（可不选）", en: "Technique (optional)" },
  "dish.steps.technique.none": { uk: "— без техніки —", zh: "— 不选 —", en: "— none —" },
  "dish.steps.clip": { uk: "Фрагмент відео {start}–{end} с", zh: "视频片段 {start}–{end} 秒", en: "Video clip {start}–{end} s" },
  "dish.steps.empty": { uk: "(порожній крок)", zh: "（空步骤）", en: "(empty step)" },

  "dish.moveUp": { uk: "Вгору", zh: "上移", en: "Move up" },
  "dish.moveDown": { uk: "Вниз", zh: "下移", en: "Move down" },
  "dish.remove": { uk: "Видалити", zh: "删掉", en: "Remove" },
  "dish.removed.component": { uk: "Інгредієнт видалено: {name}", zh: "已删掉配料：{name}", en: "Removed ingredient: {name}" },
  "dish.removed.step": { uk: "Крок видалено: {name}", zh: "已删掉步骤：{name}", en: "Removed step: {name}" },

  "dish.provenance.manual": { uk: "Введено вручну", zh: "手动录入", en: "Entered by hand" },
  "dish.provenance.video": { uk: "Імпортовано з відео", zh: "视频导入", en: "Imported from video" },
  "dish.provenance.example": { uk: "Приклад із макета (не публікується)", zh: "设计稿示例菜（不会发布）", en: "Design-mockup example (never published)" },

  "dish.saveDraft": { uk: "Зберегти чернетку", zh: "存草稿", en: "Save draft" },
  "dish.saveDraft.return": { uk: "Зберегти чернетку й повернутися", zh: "存草稿，回到导入", en: "Save draft and go back" },
  "dish.savedDraft": { uk: "Збережено як чернетку · ще не опубліковано", zh: "已存为草稿 · 还没发布", en: "Saved as a draft · not published yet" },
  "dish.activate": { uk: "Додати в базу", zh: "入库", en: "Add to library" },
  "dish.activate.return": { uk: "Додати в базу й повернутися", zh: "入库，回到导入", en: "Add to library and go back" },
  "dish.activated": { uk: "Додано в базу · ще не опубліковано", zh: "已入库 · 还没发布", en: "Added to the library · not published yet" },
  "dish.activate.hint": {
    uk: "«Додати в базу» ≠ «можна планувати»: чи потрапить страва в меню, вирішують три позначки вгорі",
    zh: "「入库」不等于「能排」：能不能排看上面三个关卡",
    en: "“Add to library” isn't “plannable”: the three chips at the top decide whether it can go on a menu",
  },
  "dish.statusForced": {
    uk: "Кабінет зберіг це як чернетку (статус «у базі» не застосовано)",
    zh: "后台按草稿存了（没有入库）",
    en: "The back office stored this as a draft (not added to the library)",
  },
  "dish.warn.dangling": { uk: "Є посилання на те, чого не існує, але збережено: {list}", zh: "有引用指向不存在的东西，先存下了：{list}", en: "Some references point to things that don't exist; saved anyway: {list}" },
  "dish.warnings": { uk: "Зауваження кабінету: {list}", zh: "后台提醒：{list}", en: "Back-office notes: {list}" },
  "dish.addAnother": { uk: "Додати ще одну", zh: "再加一道", en: "Add another" },
  "dish.goPlan": { uk: "До планування меню", zh: "去排菜单", en: "Go plan the menu" },
  "dish.reload": { uk: "Перечитати", zh: "重新读取", en: "Reload" },

  "dish.unit.g": { uk: "г", zh: "克", en: "g" },
  "dish.unit.kg": { uk: "кг", zh: "千克", en: "kg" },
  "dish.unit.ml": { uk: "мл", zh: "毫升", en: "ml" },
  "dish.unit.l": { uk: "л", zh: "升", en: "l" },
  "dish.unit.pcs": { uk: "шт", zh: "个", en: "pcs" },
  "dish.unit.pack": { uk: "уп.", zh: "包", en: "pack" },
  "dish.unit.tbsp": { uk: "ст. л.", zh: "汤匙", en: "tbsp" },
  "dish.unit.tsp": { uk: "ч. л.", zh: "茶匙", en: "tsp" },
  "dish.unit.pinch": { uk: "дрібка", zh: "撮", en: "pinch" },
  "dish.unit.to-taste": { uk: "за смаком", zh: "适量", en: "to taste" },
  "dish.kind.cut": { uk: "Нарізання", zh: "刀工", en: "Cutting" },
  "dish.kind.pretreat": { uk: "Підготовка", zh: "预处理", en: "Pre-treatment" },
  "dish.kind.heat": { uk: "Теплова обробка", zh: "加热", en: "Heat" },
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

const ID_PREFIX = "adm-dish";
/** schemas/common.schema.json#/$defs/Id */
const ID_RE = /^[a-z][a-z0-9-]*$/;
/** §9 矛盾 10：「全局设置」没有存放处，本轮是常量 */
const DEFAULT_BASE_SERVINGS = 50;
/** 用量单位下拉（to-taste 走「适量」开关，不进下拉） */
const QTY_UNITS: readonly Unit[] = ["g", "kg", "ml", "l", "pcs", "pack", "tbsp", "tsp", "pinch"];
const TIMINGS: readonly PrepTiming[] = ["day-before", "morning", "before-service"];
const TIMING_KEY: Record<PrepTiming, Key> = { "day-before": "dish.prep.timing.dayBefore", morning: "dish.prep.timing.morning", "before-service": "dish.prep.timing.beforeService" };
const UNIT_KEY: Record<Unit, Key> = {
  g: "dish.unit.g",
  kg: "dish.unit.kg",
  ml: "dish.unit.ml",
  l: "dish.unit.l",
  pcs: "dish.unit.pcs",
  pack: "dish.unit.pack",
  tbsp: "dish.unit.tbsp",
  tsp: "dish.unit.tsp",
  pinch: "dish.unit.pinch",
  "to-taste": "dish.unit.to-taste",
};
const KIND_ORDER: readonly Technique["kind"][] = ["cut", "pretreat", "heat"];
const KIND_KEY: Record<Technique["kind"], Key> = { cut: "dish.kind.cut", pretreat: "dish.kind.pretreat", heat: "dish.kind.heat" };
/** §4.5 屏上有什么第 7 条：视频分支占位链接到 skills/video-recipe-ingest/SKILL.md */
const VIDEO_SKILL_URL = "https://github.com/TERRYYYC/canteen-os/blob/main/skills/video-recipe-ingest/SKILL.md";
/** 搜索结果最多列几条 */
const SEARCH_LIMIT = 8;

type Attrs = Record<string, string | number | boolean | null | undefined>;

// ---------------------------------------------------------------------------
// 草稿（推论 A：全部是原始输入串 + 载入时原样保留的字段，切语言回填时一个字都不丢）
// ---------------------------------------------------------------------------

/** 三语文本 + 机翻状态（菜名 / 简介 / 步骤文本 / 配料备注共用） */
export interface Tri {
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
}

export interface PendingImage {
  blob: Blob;
  width: number;
  height: number;
  /** blob: URL，只给预览；换图 / 去掉 / 上传成功 / 丢弃草稿时 revoke */
  previewUrl: string;
  license: string;
  author: string;
  sourceUrl: string;
}

export interface ComponentDraft {
  /** DOM key（新增时递增），与数组下标无关 */
  key: number;
  ingredientRef: string;
  /** 还没选食材时搜索框里的字 */
  search: string;
  toTaste: boolean;
  /** 原始输入串；"" = 没填 */
  qty: string;
  /** toTaste 时保留上次选的单位，取消「适量」时回来 */
  unit: Unit;
  techniqueRef: string;
  size: string;
  /** "" = 缺省（早上），不写字段 */
  timing: "" | PrepTiming;
  note: Tri;
  /** 视频导入的截帧：表单不编辑，载入什么写回什么（可去掉） */
  prepImage: ImageRef | null;
  /** 机器来源的置信度：表单不编辑，原样写回 */
  confidence: DishComponent["confidence"] | null;
  expanded: boolean;
  /** 「食材库里没有 · 新建」→ 行内内联的 #23 表单草稿；null = 没开 */
  newIngredient: IngredientDraft | null;
}

export interface StepDraft {
  key: number;
  text: Tri;
  techniqueRef: string;
  image: ImageRef | null;
  clip: DishStep["clip"] | null;
  expanded: boolean;
}

export interface DishDraft {
  tab: "manual" | "video";
  name: Tri;
  description: Tri;
  /** 英文短名 = 实体 id = 文件名 */
  id: string;
  idTouched: boolean;
  baseServings: number;
  image: ImageRef | null;
  pending: PendingImage | null;
  components: ComponentDraft[];
  steps: StepDraft[];
  /** 载入的来源；null = 新建 → 保存时写 { source: "manual" } */
  provenance: DishProvenance | null;
  /** 载入的 status；null = 源文件没写（视为 draft） */
  status: DishStatus | null;
  /** 文件已存在：保存时 If-Match 用；null = 还没存过 */
  blobSha: string | null;
  dirty: boolean;
  /** 下一个 key */
  seq: number;
}

function makeTri(s?: I18nString | null): Tri {
  const zh = s?.zh ?? "";
  const en = s?.en ?? "";
  const uk = s?.uk ?? "";
  return { zh, en, uk, enMachine: false, ukMachine: false, enTouched: en !== "", ukTouched: uk !== "", translatedFrom: zh };
}

/** Tri → I18nString：只写非空语言（顺序 zh / en / uk，与 data/ 里的文件一致）；全空 → null */
function triToI18n(t: Tri): I18nString | null {
  const out: I18nString = {};
  if (t.zh.trim()) out.zh = t.zh.trim();
  if (t.en.trim()) out.en = t.en.trim();
  if (t.uk.trim()) out.uk = t.uk.trim();
  return out.zh || out.en || out.uk ? out : null;
}

function triEmpty(t: Tri): boolean {
  return t.zh.trim() === "" && t.en.trim() === "" && t.uk.trim() === "";
}

/** 空草稿；seed.zh 来自 #22 的 handoff（newDishName） */
export function createDishDraft(seed: { zh?: string } = {}): DishDraft {
  const name = makeTri();
  name.zh = seed.zh ?? "";
  name.translatedFrom = "";
  return {
    tab: "manual",
    name,
    description: makeTri(),
    id: "",
    idTouched: false,
    baseServings: DEFAULT_BASE_SERVINGS,
    image: null,
    pending: null,
    components: [],
    steps: [],
    provenance: null,
    status: null,
    blobSha: null,
    dirty: false,
    seq: 1,
  };
}

function newComponent(d: DishDraft, seed: { ingredientRef?: string; search?: string } = {}): ComponentDraft {
  return {
    key: d.seq++,
    ingredientRef: seed.ingredientRef ?? "",
    search: seed.search ?? "",
    toTaste: false,
    qty: "",
    unit: "g",
    techniqueRef: "",
    size: "",
    timing: "",
    note: makeTri(),
    prepImage: null,
    confidence: null,
    expanded: true,
    newIngredient: null,
  };
}

function newStep(d: DishDraft): StepDraft {
  return { key: d.seq++, text: makeTri(), techniqueRef: "", image: null, clip: null, expanded: true };
}

/** 既有菜 → 草稿（api.getDish 的 content + blobSha）；表单不编辑的字段（confidence / prep.image / steps[].image / clip / provenance）原样带着 */
export function draftFromDish(dish: Dish, id: string, blobSha: string | null): DishDraft {
  const d = createDishDraft();
  d.name = makeTri(dish.name);
  d.description = makeTri(dish.description);
  d.id = id;
  d.idTouched = true;
  d.baseServings = typeof dish.baseServings === "number" && dish.baseServings >= 1 ? Math.round(dish.baseServings) : DEFAULT_BASE_SERVINGS;
  d.image = dish.image ? { ...dish.image } : null;
  for (const c of dish.components ?? []) {
    const row = newComponent(d, { ingredientRef: c.ingredientRef });
    row.toTaste = c.qty.unit === "to-taste";
    row.qty = c.qty.value !== undefined ? String(c.qty.value) : "";
    if (!row.toTaste) row.unit = c.qty.unit;
    if (c.prep) {
      row.techniqueRef = c.prep.techniqueRef ?? "";
      row.size = c.prep.size ?? "";
      row.timing = c.prep.timing ?? "";
      row.note = makeTri(c.prep.note);
      row.prepImage = c.prep.image ? { ...c.prep.image } : null;
    }
    row.confidence = c.confidence ? { ...c.confidence } : null;
    row.expanded = false;
    d.components.push(row);
  }
  for (const s of dish.steps ?? []) {
    const row = newStep(d);
    row.text = makeTri(s.text);
    row.techniqueRef = s.techniqueRef ?? "";
    row.image = s.image ? { ...s.image } : null;
    row.clip = s.clip ? { ...s.clip } : null;
    row.expanded = false;
    d.steps.push(row);
  }
  d.provenance = dish.provenance ? { ...dish.provenance } : null;
  d.status = dish.status ?? null;
  d.blobSha = blobSha;
  return d;
}

/** "" → NaN（调用方先判空）；认不出的字串也是 NaN → JSON 里变 null → 校验回 type 错误并标黄那一行 */
function num(s: string): number {
  const v = s.trim().replace(",", ".");
  return v === "" ? Number.NaN : Number(v);
}

function prepOf(c: ComponentDraft): DishPrep | null {
  const note = triToI18n(c.note);
  if (!c.techniqueRef && !c.size.trim() && !c.timing && !note && !c.prepImage) return null;
  // 键序照 data/dishes/*.json：techniqueRef, size, timing, note, image；techniqueRef 空时不写（让校验按 /components/i/prep 标黄）
  const p = {} as DishPrep;
  if (c.techniqueRef) p.techniqueRef = c.techniqueRef;
  if (c.size.trim()) p.size = c.size.trim();
  if (c.timing) p.timing = c.timing;
  if (note) p.note = note;
  if (c.prepImage) p.image = { ...c.prepImage };
  return p;
}

/**
 * 草稿 → 实体 JSON（字段映射逐条对 schemas/dish.schema.json，键序照 data/dishes/*.json）：
 *   schemaVersion "2" · name / description 只写非空语言（description 全空不写）· image 有图才写 · baseServings 整数
 *   · components / steps 为空整个不写（minItems 1）· qty: to-taste 时只写 { unit }，否则 { value, unit }（value 空 → NaN → null → 标黄）
 *   · prep 只在任一子字段非空时写 · confidence / prep.image / steps[].image / clip 原样写回 · provenance 缺省 { source: "manual" }
 *   · status 只在有值时写（「入库」由调用方置 active）。
 */
export function draftToDish(d: DishDraft): Dish {
  const dish: Dish = { schemaVersion: "2", name: triToI18n(d.name) ?? {} };
  const desc = triToI18n(d.description);
  if (desc) dish.description = desc;
  if (d.image) dish.image = { ...d.image };
  dish.baseServings = d.baseServings;
  if (d.components.length > 0) {
    dish.components = d.components.map((c) => {
      const out: DishComponent = { ingredientRef: c.ingredientRef.trim(), qty: c.toTaste ? { unit: "to-taste" } : { value: num(c.qty), unit: c.unit } };
      const prep = prepOf(c);
      if (prep) out.prep = prep;
      if (c.confidence) out.confidence = { ...c.confidence };
      return out;
    });
  }
  if (d.steps.length > 0) {
    dish.steps = d.steps.map((s) => {
      const out: DishStep = { text: triToI18n(s.text) ?? {} };
      if (s.techniqueRef) out.techniqueRef = s.techniqueRef;
      if (s.image) out.image = { ...s.image };
      if (s.clip) out.clip = { ...s.clip };
      return out;
    });
  }
  dish.provenance = d.provenance ? { ...d.provenance } : { source: "manual" };
  if (d.status) dish.status = d.status;
  return dish;
}

/** 预览地址：blob: / data: / http(s) 原样；仓库内相对路径挂 BASE_URL（同 prep.ts 的 imgSrc） */
function imgSrc(src: string): string {
  if (/^(https?:[/][/]|blob:|data:)/i.test(src)) return src;
  return `${import.meta.env.BASE_URL}${src.replace(/^[/]+/, "")}`;
}

/** 食材名（按界面语言，回退链 pick）；catalog 没到或没这个食材 → 直接给 id */
function ingredientName(catalog: Catalog | null, ref: string, lang: Lang): string {
  const ing = catalog?.ingredients[ref];
  return (ing ? pick(ing.name, lang) : "") || ref;
}

function techniqueName(catalog: Catalog | null, ref: string, lang: Lang): string {
  const t = catalog?.techniques.find((x) => x.id === ref);
  return (t ? pick(t.name, lang) : "") || ref;
}

function formatQty(c: ComponentDraft, lang: Lang): string {
  if (c.toTaste) return tt(lang, "dish.qty.toTaste");
  const v = c.qty.trim();
  return v ? `${v} ${tt(lang, UNIT_KEY[c.unit])}` : "";
}

// ---------------------------------------------------------------------------
// 屏：模块级草稿（推论 A）+ 离开即丢弃
// ---------------------------------------------------------------------------

let draft: DishDraft | null = null;
/** 草稿对应的 rest（"new" | "<id>"）；切语言重画时 rest 没变 → 回填 */
let draftKey: string | null = null;
/** #22 带来的「保存后回哪」（store.takeHandoff 读一次即清空，所以记在这） */
let returnTo: string | null = null;
let unwatch: (() => void) | null = null;
let disposePaint: (() => void) | null = null;

function discardDraft(): void {
  if (draft) {
    if (draft.pending) URL.revokeObjectURL(draft.pending.previewUrl);
    for (const c of draft.components) if (c.newIngredient?.pending) URL.revokeObjectURL(c.newIngredient.pending.previewUrl);
  }
  draft = null;
  draftKey = null;
  returnTo = null;
  unwatch?.();
  unwatch = null;
  disposePaint?.();
  disposePaint = null;
}

function isMyHash(hash: string, key: string): boolean {
  const m = /^#[/]?admin[/]dish[/]([^/?#]+)[/]?$/.exec(hash);
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
    ev.returnValue = true;
  };
  window.addEventListener("hashchange", onHash);
  window.addEventListener("beforeunload", onUnload);
  unwatch = () => {
    window.removeEventListener("hashchange", onHash);
    window.removeEventListener("beforeunload", onUnload);
  };
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
    if (isNew) draft = createDishDraft(hand.newDishName ? { zh: hand.newDishName } : {});
  }
  watchLeave(rest);

  if (!draft) {
    // 改菜 / 补全草稿：先读源文件（content + blobSha）
    const bar = (): HTMLElement => topBar({ back: adminHref(), title: tt(lang, "dish.title.edit") });
    const root = h("div", { class: "adm adm-dish" }, bar(), h("p", { class: "muted" }, adm("adm.loading", undefined, lang)));
    el.append(root);
    let src: Awaited<ReturnType<AdminApi["getDish"]>>;
    try {
      src = await api.getDish(rest);
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
        h("div", { class: "card adm-dish-notfound", role: "status" }, h("p", {}, tt(lang, "dish.notFound")), h("a", { class: "adm-btn", href: adminHref() }, adm("adm.back.home", undefined, lang))),
      );
      return;
    }
    draft = draftFromDish(src.content, rest, src.blobSha);
    el.replaceChildren();
  }
  paintScreen(el, ctx, rest, api, []);
}

// ---------------------------------------------------------------------------
// 画屏
// ---------------------------------------------------------------------------

/** 待撤销的一次删除 */
type Removed = { kind: "component"; index: number; item: ComponentDraft } | { kind: "step"; index: number; item: StepDraft };

function paintScreen(el: HTMLElement, ctx: PageCtx, rest: string, api: AdminApi, flash: HTMLElement[]): void {
  const lang = ctx.lang;
  if (!draft) return;
  const d: DishDraft = draft;
  disposePaint?.();
  const L = (key: Key, params?: Params): string => tt(lang, key, params);
  /** 存过一次（blobSha 已有）就按「改菜」画：id 锁定、不查重、带 If-Match */
  const editing = d.blobSha !== null;
  const title = L(editing || rest !== "new" ? "dish.title.edit" : "dish.title.new");
  let catalog: Catalog | null = null;
  let catalogFailed = false;
  let saving = false;

  // ---- 顶部：通知条 -------------------------------------------------------------
  const notices = h("div", { class: "adm-dish-notices" }, ...flash);
  const transient: HTMLElement[] = [];
  function addTransient(node: HTMLElement): void {
    transient.push(node);
    notices.append(node);
  }
  function clearTransient(): void {
    for (const n of transient) n.remove();
    transient.length = 0;
  }

  /** 配料 / 步骤卡收起时的一行摘要：随输入实时刷新（不重建卡） */
  const summaries: Array<() => void> = [];
  const stepSummaries: Array<() => void> = [];
  function changed(): void {
    d.dirty = true;
    for (const f of summaries) f();
    for (const f of stepSummaries) f();
    paintReadiness();
  }

  function leaveTo(hash: string): void {
    if (d.dirty && !window.confirm(adm("adm.leave.confirm", undefined, lang))) return;
    location.hash = hash; // hashchange → watchLeave 丢弃草稿
  }

  // ---- 小控件 ---------------------------------------------------------------------
  function row(name: string, pointer: string, label: string, control: HTMLElement, hint?: string): HTMLElement {
    const r = fieldRow(hint === undefined ? { idPrefix: ID_PREFIX, name, pointer, label, control } : { idPrefix: ID_PREFIX, name, pointer, label, hint, control });
    // 步进器的第一个可标注元素是「−」按钮：把 id 挪到中间的 <input> 上，<label for> 才指到数值
    const stepperInput = control.querySelector<HTMLInputElement>(".adm-stepper-input");
    if (stepperInput) {
      const holder = control.querySelector<HTMLElement>(`#${ID_PREFIX}-${name}`);
      if (holder && holder !== stepperInput) {
        const described = holder.getAttribute("aria-describedby");
        holder.removeAttribute("id");
        holder.removeAttribute("aria-describedby");
        stepperInput.id = `${ID_PREFIX}-${name}`;
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

  function textarea(value: string, attrs: Attrs, onInput: (v: string) => void): HTMLTextAreaElement {
    const ta = h("textarea", { rows: "2", ...attrs });
    ta.value = value;
    ta.addEventListener("input", () => {
      onInput(ta.value);
      changed();
    });
    return ta;
  }

  function select(options: Array<{ value: string; label: string; group?: string }>, current: string, onChange: (v: string) => void, attrs: Attrs = {}): HTMLSelectElement {
    const sel = h("select", attrs);
    let group: HTMLOptGroupElement | null = null;
    for (const o of options) {
      const opt = h("option", { value: o.value, selected: o.value === current ? true : null }, o.label);
      if (o.group) {
        if (!group || group.label !== o.group) {
          group = h("optgroup", { label: o.group });
          sel.append(group);
        }
        group.append(opt);
      } else {
        group = null;
        sel.append(opt);
      }
    }
    sel.addEventListener("change", () => {
      onChange(sel.value);
      changed();
    });
    return sel;
  }

  /** 技法下拉（闭集：只能从 catalog.techniques 选；词表没到 → 禁用 + 提示，不允许手打）；current 不在词表里也补一格，不悄悄丢 */
  function techniqueSelect(current: string, noneLabel: string, onChange: (v: string) => void, attrs: Attrs = {}): HTMLSelectElement {
    const options: Array<{ value: string; label: string; group?: string }> = [{ value: "", label: noneLabel }];
    if (catalog) {
      const list = [...catalog.techniques].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
      for (const t of list) options.push({ value: t.id, label: pick(t.name, lang) || t.id, group: L(KIND_KEY[t.kind]) });
      if (current && !catalog.techniques.some((t) => t.id === current)) options.push({ value: current, label: current });
    } else if (current) {
      options.push({ value: current, label: current });
    }
    return select(options, current, onChange, { ...attrs, disabled: catalog ? null : true });
  }

  interface TriOpts {
    /** 字段名前缀（DOM id），如 "name" / "c3-note" */
    name: string;
    /** JSON Pointer 前缀，如 "/name" / "/components/2/prep/note" */
    pointer: string;
    labels: { zh: string; en: string; uk: string };
    hint?: string;
    multiline?: boolean;
    /** zh 改完（change）自动机翻一次（只填用户没改过的） */
    auto: boolean;
    onZh?: (v: string) => void;
    /** 机翻成功后（en 变了 → 英文短名要跟着变） */
    onTranslated?: () => void;
  }

  /** 三语一组：zh 行 + 「英文 · 乌克兰语」小标题（机翻 chip + 机翻按钮）+ en / uk 两格 */
  function triFields(t: Tri, o: TriOpts): { el: HTMLElement; zhInput: HTMLInputElement | HTMLTextAreaElement; translate(manual: boolean): Promise<void> } {
    const make = (value: string, attrs: Attrs, on: (v: string) => void): HTMLInputElement | HTMLTextAreaElement =>
      o.multiline ? textarea(value, attrs, on) : text(value, { enterkeyhint: "next", ...attrs }, on);
    const zhInput = make(t.zh, { lang: "zh" }, (v) => {
      t.zh = v;
      o.onZh?.(v);
    });
    if (o.auto) zhInput.addEventListener("change", () => void translate(false));
    const enInput = make(t.en, { lang: "en" }, (v) => {
      t.en = v;
      t.enTouched = v !== "";
      t.enMachine = false;
      paintMachine();
      o.onTranslated?.();
    });
    const ukInput = make(t.uk, { lang: "uk" }, (v) => {
      t.uk = v;
      t.ukTouched = v !== "";
      t.ukMachine = false;
      paintMachine();
    });
    const zhRow = row(`${o.name}-zh`, o.pointer, o.labels.zh, zhInput, o.hint);
    const enRow = row(`${o.name}-en`, `${o.pointer}/en`, o.labels.en, enInput);
    const ukRow = row(`${o.name}-uk`, `${o.pointer}/uk`, o.labels.uk, ukInput);
    const machineChip = h("span", { class: "chip adm-dish-chip", hidden: true }, adm("adm.machineTranslated", undefined, lang));
    const translateBtn = button({ label: L("dish.translate"), kind: "ghost", class: "adm-dish-translate", onClick: () => void translate(true) });
    const hint = h("p", { class: "adm-dish-hint adm-dish-warn", role: "status", hidden: true });
    const sub = h("div", { class: "adm-dish-sub" }, h("span", { class: "adm-dish-sub-title" }, L("dish.names.other")), machineChip, translateBtn);
    function paintMachine(): void {
      machineChip.hidden = !(t.enMachine || t.ukMachine);
    }
    paintMachine();
    let translating = false;
    /** manual = 点了「机翻」：两个都覆盖；自动（zh 改完）：只填用户没改过的 */
    async function translate(manual: boolean): Promise<void> {
      const zh = t.zh.trim();
      if (!zh || translating) return;
      if (!manual && (zh === t.translatedFrom || (t.enTouched && t.ukTouched))) return;
      translating = true;
      const done = busy(translateBtn, L("dish.translating"));
      hint.hidden = true;
      try {
        const r = await api.translate(zh, ["en", "uk"]);
        t.translatedFrom = zh;
        if (r.en && (manual || !t.enTouched)) {
          t.en = r.en;
          t.enTouched = false;
          t.enMachine = true;
          enInput.value = r.en;
        }
        if (r.uk && (manual || !t.ukTouched)) {
          t.uk = r.uk;
          t.ukTouched = false;
          t.ukMachine = true;
          ukInput.value = r.uk;
        }
        if (!r.en && !r.uk) {
          hint.textContent = L("dish.translateFailed");
          hint.hidden = false;
        }
        paintMachine();
        o.onTranslated?.();
        changed();
      } catch {
        // 不阻塞保存（I18nString 只要求至少一种语言）；401 留给保存那一步去锁屏
        hint.textContent = L("dish.translateFailed");
        hint.hidden = false;
      } finally {
        done();
        translating = false;
      }
    }
    const el = h("div", { class: "adm-dish-tri" }, zhRow, sub, h("div", { class: "adm-dish-grid2" }, enRow, ukRow), hint);
    return { el, zhInput, translate };
  }

  // ---- readiness 三 chip（core 的 readiness() 现算，aria-live 播报） ------------------------
  const readyChips = h("div", { class: "adm-dish-ready", role: "status", "aria-live": "polite" });
  const missingBox = h("div", { class: "adm-dish-missing" });
  function missingText(key: string): string {
    const [kind, ref = ""] = key.split(":", 2);
    const name = ref ? ingredientName(catalog, ref, lang) : L("dish.components.unpicked");
    switch (kind) {
      case "components":
        return L("dish.missing.components");
      case "steps":
        return L("dish.missing.steps");
      case "baseServings":
        return L("dish.missing.baseServings");
      case "prep":
        return L("dish.missing.prep", { name });
      case "qty":
        return L("dish.missing.qty", { name });
      case "ingredient":
        return L("dish.missing.ingredient", { name });
      case "purchase":
        return L("dish.missing.purchase", { name });
      default:
        return key;
    }
  }
  function paintReadiness(): void {
    const r = readiness(draftToDish(d), catalog?.ingredients ?? {});
    const chip = (ok: boolean | null, label: string): HTMLElement =>
      h("span", { class: `chip ${ok === null ? "" : ok ? "ok" : "warn"} adm-dish-ready-chip` }, `${label} ${ok === null ? "…" : L(ok ? "dish.ready.ok" : "dish.ready.no")}`);
    // catalog 没到：能采说不准（食材存不存在 / 有没有采购规格都要看库），先画「…」，缺项也不列 ingredient: / purchase:
    const procure = catalog ? r.canProcure : null;
    readyChips.replaceChildren(chip(r.canTeach, L("dish.ready.teach")), chip(r.canPlan, L("dish.ready.plan")), chip(procure, L("dish.ready.procure")));
    const keys = [...new Set(r.missingKeys)].filter((k) => catalog || !(k.startsWith("ingredient:") || k.startsWith("purchase:")));
    missingBox.replaceChildren();
    if (keys.length === 0) {
      missingBox.append(h("p", { class: "muted adm-dish-missing-none" }, catalog ? L("dish.missing.none") : L("dish.ready.unknown")));
      return;
    }
    missingBox.append(h("ul", { class: "adm-dish-missing-list" }, ...keys.map((k) => h("li", {}, missingText(k)))));
  }

  // ---- 标签页 ---------------------------------------------------------------------
  const tabManual = h("button", { type: "button", role: "tab", class: "adm-dish-tab", id: `${ID_PREFIX}-tab-manual`, "aria-controls": `${ID_PREFIX}-pane-manual` }, L("dish.tab.manual"));
  const tabVideo = h("button", { type: "button", role: "tab", class: "adm-dish-tab", id: `${ID_PREFIX}-tab-video`, "aria-controls": `${ID_PREFIX}-pane-video` }, L("dish.tab.video"));
  const tabs = h("div", { class: "adm-dish-tabs", role: "tablist" }, tabManual, tabVideo);
  const paneVideo = h(
    "div",
    { class: "card adm-dish-video", role: "tabpanel", id: `${ID_PREFIX}-pane-video`, "aria-labelledby": tabVideo.id },
    h("p", {}, L("dish.video.later")),
    h("p", {}, h("a", { class: "adm-btn", href: VIDEO_SKILL_URL, target: "_blank", rel: "noopener" }, L("dish.video.link"))),
  );
  function paintTabs(): void {
    const manual = d.tab === "manual";
    tabManual.setAttribute("aria-selected", manual ? "true" : "false");
    tabVideo.setAttribute("aria-selected", manual ? "false" : "true");
    tabManual.classList.toggle("adm-dish-on", manual);
    tabVideo.classList.toggle("adm-dish-on", !manual);
    tabManual.tabIndex = manual ? 0 : -1;
    tabVideo.tabIndex = manual ? -1 : 0;
    formEl.hidden = !manual;
    paneVideo.hidden = manual;
  }
  tabManual.addEventListener("click", () => {
    d.tab = "manual";
    paintTabs();
  });
  tabVideo.addEventListener("click", () => {
    d.tab = "video";
    paintTabs();
  });
  tabs.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    d.tab = d.tab === "manual" ? "video" : "manual";
    paintTabs();
    (d.tab === "manual" ? tabManual : tabVideo).focus();
  });

  // ---- 菜名 / 英文短名 / 简介 / 份数 ---------------------------------------------------
  const idInput = text(
    d.id,
    { autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "next", readonly: editing ? true : null },
    (v) => {
      d.id = v;
      d.idTouched = v.trim() !== "";
      refreshDup();
    },
  );
  const dupBox = h("p", { class: "adm-dish-dup", role: "status", hidden: true });
  const idRow = row("id", "/id", L("dish.slug"), idInput, L(editing ? "dish.slug.locked" : "dish.slug.hint"));
  idRow.append(dupBox);

  function syncSlug(): void {
    if (editing || d.idTouched) return;
    d.id = slugify(d.name.en);
    idInput.value = d.id;
    refreshDup();
  }
  let dup: { id: string; name: string } | null = null;
  function findDup(): { id: string; name: string } | null {
    if (!catalog || editing) return null;
    const entries = catalog.dishes;
    const hit = (k: string): { id: string; name: string } | null => {
      const v = entries[k];
      return v ? { id: k, name: pick(v.name, lang) || k } : null;
    };
    const id = d.id.trim();
    if (id && entries[id]) return hit(id);
    const zh = d.name.zh.trim();
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
    const link = h("a", { class: "adm-dish-dup-link", href: adminHref("dish", target) }, `${L("dish.slug.goEdit")} → ${dup.name} (${target})`);
    link.addEventListener("click", (ev) => {
      ev.preventDefault();
      leaveTo(adminHref("dish", target));
    });
    append(dupBox, L("dish.slug.taken"), " ", link);
    dupBox.hidden = false;
  }

  const nameTri = triFields(d.name, {
    name: "name",
    pointer: "/name",
    labels: { zh: L("dish.name.zh"), en: L("dish.name.en"), uk: L("dish.name.uk") },
    hint: L("dish.name.zh.hint"),
    auto: true,
    onZh: () => refreshDup(),
    onTranslated: () => syncSlug(),
  });
  const descTri = triFields(d.description, {
    name: "description",
    pointer: "/description",
    labels: { zh: L("dish.description"), en: L("dish.description.en"), uk: L("dish.description.uk") },
    multiline: true,
    auto: true,
  });
  const servingsRow = row(
    "baseServings",
    "/baseServings",
    L("dish.baseServings"),
    stepper({
      value: d.baseServings,
      min: 1,
      step: 10,
      bigStep: 50,
      label: L("dish.baseServings"),
      onChange: (v) => {
        d.baseServings = v;
        changed();
      },
    }),
    L("dish.baseServings.hint"),
  );

  // ---- 成品图（#23 的压图 + 保存时 uploadImage("dishes", …)） --------------------------------
  const cameraInput = h("input", { type: "file", accept: "image/*", capture: "environment", class: "sr-only adm-dish-file" });
  const pickInput = h("input", { type: "file", accept: "image/*", class: "sr-only adm-dish-file", id: `${ID_PREFIX}-photo-pick` });
  for (const input of [cameraInput, pickInput]) {
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.value = "";
      if (file) void takePhoto(file);
    });
  }
  const photoView = h("div", { class: "adm-dish-photo-view" });
  const photoMsg = h("p", { class: "adm-dish-hint adm-dish-warn", role: "status", hidden: true });
  const photoBox = h("div", { class: "adm-dish-photo" }, cameraInput, pickInput, photoView, photoMsg);
  const photoRow = row("photo", "/image", L("dish.photo"), photoBox);
  function setPhotoMsg(s: string): void {
    photoMsg.textContent = s;
    photoMsg.hidden = s === "";
  }
  function dropPending(): void {
    if (d.pending) URL.revokeObjectURL(d.pending.previewUrl);
    d.pending = null;
  }
  async function takePhoto(file: File): Promise<void> {
    setPhotoMsg(L("dish.photo.compressing"));
    let out: CompressedImage | null;
    try {
      out = await compressImage(file);
    } catch {
      setPhotoMsg(L("dish.photo.unreadable"));
      return;
    }
    if (!out) {
      setPhotoMsg(L("dish.photo.tooBig"));
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
      photoView.append(
        h(
          "div",
          { class: "adm-dish-preview" },
          h("img", { src: p.previewUrl, alt: "" }),
          h(
            "div",
            { class: "adm-dish-preview-meta" },
            h("p", { class: "muted" }, L("dish.photo.pending", { kb: Math.round(p.blob.size / 1024), w: p.width, h: p.height })),
            button({
              label: L("dish.photo.remove"),
              onClick: () => {
                dropPending();
                changed();
                paintPhoto();
              },
            }),
          ),
        ),
        row("image-license", "/image/license", L("dish.photo.license"), licenseInput, L("dish.photo.license.hint")),
        h("div", { class: "adm-dish-grid2" }, row("image-author", "/image/author", L("dish.photo.author"), authorInput), row("image-sourceUrl", "/image/sourceUrl", L("dish.photo.sourceUrl"), urlInput)),
      );
      return;
    }
    if (d.image) {
      const img = d.image;
      photoView.append(
        h(
          "div",
          { class: "adm-dish-preview" },
          h("img", { src: imgSrc(img.src), alt: "" }),
          h(
            "div",
            { class: "adm-dish-preview-meta" },
            h("p", {}, `${L("dish.photo.license")}: ${img.license}`),
            img.author ? h("p", {}, `${L("dish.photo.author")}: ${img.author}`) : null,
            img.sourceUrl ? h("p", {}, `${L("dish.photo.source")}: `, h("a", { href: img.sourceUrl, target: "_blank", rel: "noopener" }, img.sourceUrl)) : null,
            button({
              label: L("dish.photo.remove"),
              onClick: () => {
                d.image = null;
                changed();
                paintPhoto();
              },
            }),
          ),
        ),
      );
      return;
    }
    photoView.append(
      h(
        "div",
        { class: "adm-dish-photos" },
        h("label", { class: "adm-dish-tile", for: cameraInput.id }, h("b", { "aria-hidden": "true" }, "+"), L("dish.photo.camera")),
        h("label", { class: "adm-dish-tile", for: pickInput.id }, h("b", { "aria-hidden": "true" }, "…"), L("dish.photo.pick")),
      ),
    );
  }
  paintPhoto();

  // ---- 删除可撤销 ------------------------------------------------------------------
  let removed: Removed | null = null;
  function offerUndo(text: string): void {
    clearTransient();
    addTransient(
      notice({
        kind: "info",
        text,
        action: {
          label: adm("adm.undo", undefined, lang),
          onClick: () => {
            if (!removed) return;
            if (removed.kind === "component") d.components.splice(Math.min(removed.index, d.components.length), 0, removed.item);
            else d.steps.splice(Math.min(removed.index, d.steps.length), 0, removed.item);
            removed = null;
            clearTransient();
            changed();
            paintComponents();
            paintSteps();
          },
        },
      }),
    );
  }

  // ---- 配料 ------------------------------------------------------------------------
  const componentsList = h("ol", { class: "adm-dish-list", "aria-label": L("dish.components") });
  const componentsCount = h("span", { class: "muted adm-dish-count" });

  function moveButtons(list: unknown[], i: number, onMove: () => void, nth: string): HTMLElement {
    const up = button({
      label: "↑",
      ariaLabel: `${nth} · ${L("dish.moveUp")}`,
      class: "adm-dish-move",
      disabled: i === 0,
      onClick: () => {
        const [it] = list.splice(i, 1);
        list.splice(i - 1, 0, it);
        onMove();
      },
    });
    const down = button({
      label: "↓",
      ariaLabel: `${nth} · ${L("dish.moveDown")}`,
      class: "adm-dish-move",
      disabled: i === list.length - 1,
      onClick: () => {
        const [it] = list.splice(i, 1);
        list.splice(i + 1, 0, it);
        onMove();
      },
    });
    return h("div", { class: "adm-dish-moves" }, up, down);
  }

  function searchIngredients(q: string): string[] {
    if (!catalog) return [];
    const needle = q.trim().toLowerCase();
    const hits: string[] = [];
    for (const [id, ing] of Object.entries(catalog.ingredients)) {
      const hay = [id, ing.name.zh ?? "", ing.name.en ?? "", ing.name.uk ?? ""].join(" ").toLowerCase();
      if (!needle || hay.includes(needle)) hits.push(id);
    }
    hits.sort((a, b) => ingredientName(catalog, a, lang).localeCompare(ingredientName(catalog, b, lang), lang));
    return hits.slice(0, SEARCH_LIMIT);
  }

  function paintComponents(): void {
    summaries.length = 0;
    componentsList.replaceChildren();
    componentsCount.textContent = d.components.length ? L("dish.components.count", { n: d.components.length }) : "";
    d.components.forEach((c, i) => componentsList.append(componentCard(c, i)));
  }

  function componentCard(c: ComponentDraft, i: number): HTMLElement {
    const P = `/components/${i}`;
    const N = `c${c.key}`;
    const nth = L("dish.components.nth", { n: i + 1 });
    const name = c.ingredientRef ? ingredientName(catalog, c.ingredientRef, lang) : c.search.trim() || L("dish.components.unpicked");
    const summaryOf = (): string =>
      [c.ingredientRef ? ingredientName(catalog, c.ingredientRef, lang) : c.search.trim() || L("dish.components.unpicked"), formatQty(c, lang), c.techniqueRef ? techniqueName(catalog, c.techniqueRef, lang) : ""]
        .filter(Boolean)
        .join(" · ");
    const summaryEl = h("span", { class: "adm-dish-card-summary" }, summaryOf());
    const toggle = h(
      "button",
      { type: "button", class: "adm-dish-card-toggle", "aria-expanded": c.expanded ? "true" : "false" },
      h("span", { class: "adm-dish-card-num", "aria-hidden": "true" }, String(i + 1)),
      summaryEl,
      h("span", { class: "adm-dish-card-caret", "aria-hidden": "true" }, c.expanded ? "▾" : "▸"),
    );
    const refreshSummary = (): void => {
      summaryEl.textContent = summaryOf();
      toggle.setAttribute("aria-label", `${nth}：${summaryEl.textContent} · ${L(c.expanded ? "dish.components.collapse" : "dish.components.expand")}`);
    };
    refreshSummary();
    summaries.push(refreshSummary);
    toggle.addEventListener("click", () => {
      c.expanded = !c.expanded;
      paintComponents();
    });
    const head = h("div", { class: "adm-dish-card-head" }, toggle, moveButtons(d.components, i, () => {
      changed();
      paintComponents();
    }, nth));

    const body = h("div", { class: "adm-dish-card-body", hidden: !c.expanded });

    // 食材：选好了 → 名字 + 「换一个」；没选 → 搜索框 + 结果 + 「食材库里没有 · 新建」
    const pickRowHost = h("div", { class: "adm-dish-pick" });
    function paintPick(): void {
      pickRowHost.replaceChildren();
      if (c.newIngredient) {
        // 没存的内联新食材：本地错误落在 /components/i/ingredientRef —— 给它一个带 data-pointer 的 .adm-field 壳（错误位放最前，
        // 免得 kit 抓到内联表单自己的错误位）；不用 fieldRow，否则它会把 id 落到内联表单的第一个输入上
        pickRowHost.append(h("div", { class: "adm-field adm-dish-inline-field", "data-pointer": `${P}/ingredientRef` }, h("p", { class: "adm-field-error", hidden: true }), inlineIngredient(c)));
        return;
      }
      if (c.ingredientRef) {
        const change = button({
          label: L("dish.components.change"),
          kind: "ghost",
          onClick: () => {
            c.ingredientRef = "";
            c.search = "";
            changed();
            paintComponents();
          },
        });
        const chosen = h("div", { class: "adm-dish-chosen" }, h("b", {}, ingredientName(catalog, c.ingredientRef, lang)), h("code", { class: "muted" }, c.ingredientRef), change);
        pickRowHost.append(row(`${N}-ingredientRef`, `${P}/ingredientRef`, L("dish.components"), chosen));
        return;
      }
      const results = h("div", { class: "adm-dish-results", role: "listbox", "aria-label": L("dish.components.search") });
      const searchInput = text(c.search, { inputmode: "search", enterkeyhint: "search", placeholder: L("dish.components.search.hint") }, (v) => {
        c.search = v;
        paintResults();
      });
      function paintResults(): void {
        results.replaceChildren();
        if (!catalog) {
          results.append(h("p", { class: "muted adm-dish-hint" }, L(catalogFailed ? "dish.components.catalogFailed" : "dish.components.catalogLoading")));
        } else {
          const hits = searchIngredients(c.search);
          if (hits.length === 0) results.append(h("p", { class: "muted adm-dish-hint" }, L("dish.components.noMatch")));
          for (const id of hits) {
            const ing = catalog.ingredients[id];
            const opt = h("button", { type: "button", role: "option", class: "adm-dish-result" }, h("b", {}, ingredientName(catalog, id, lang)), h("small", { class: "muted" }, ing?.purchase ? id : `${id} · ${L("dish.components.noPurchase")}`));
            opt.addEventListener("click", () => {
              c.ingredientRef = id;
              c.expanded = true;
              changed();
              paintComponents();
              componentsList.querySelector<HTMLElement>(`#${ID_PREFIX}-${N}-qty`)?.focus();
            });
            results.append(opt);
          }
        }
        const create = button({
          label: c.search.trim() ? `${L("dish.components.newIngredient")}：${c.search.trim()}` : L("dish.components.newIngredient"),
          class: "adm-dish-result adm-dish-result-new",
          onClick: () => {
            c.newIngredient = createIngredientDraft(c.search.trim() ? { zh: c.search.trim() } : {});
            paintComponents();
          },
        });
        results.append(create);
      }
      paintResults();
      pickRowHost.append(row(`${N}-ingredientRef`, `${P}/ingredientRef`, L("dish.components.search"), h("div", { class: "adm-dish-search" }, searchInput, results)));
    }
    paintPick();

    // 用量：数量 + 单位 / 「适量」
    const qtyInput = text(c.qty, { inputmode: "decimal", enterkeyhint: "next" }, (v) => {
      c.qty = v;
    });
    const unitSelect = select(QTY_UNITS.map((u) => ({ value: u, label: L(UNIT_KEY[u]) })), c.unit, (v) => {
      c.unit = v as Unit;
    });
    const qtyRow = row(`${N}-qty`, `${P}/qty/value`, L("dish.qty"), qtyInput);
    const unitRow = row(`${N}-unit`, `${P}/qty/unit`, L("dish.qty.unit"), unitSelect);
    const qtyGrid = h("div", { class: "adm-dish-grid2" }, qtyRow, unitRow);
    const toTasteInput = h("input", { type: "checkbox", class: "adm-dish-check-input", checked: c.toTaste ? true : null });
    toTasteInput.addEventListener("change", () => {
      c.toTaste = toTasteInput.checked;
      qtyGrid.hidden = c.toTaste;
      changed();
    });
    const toTasteRow = row(`${N}-toTaste`, `${P}/qty`, L("dish.qty.toTaste"), h("div", { class: "adm-dish-check" }, toTasteInput, h("span", { class: "muted adm-dish-check-text" }, L("dish.qty.toTaste.hint"))));
    qtyGrid.hidden = c.toTaste;

    // 切法（闭集）/ 切多大 / 提前多久 / 备注
    const techRow = row(
      `${N}-technique`,
      `${P}/prep/techniqueRef`,
      L("dish.prep.technique"),
      techniqueSelect(c.techniqueRef, L("dish.prep.technique.none"), (v) => {
        c.techniqueRef = v;
      }),
      catalog ? undefined : L("dish.prep.noCatalog"),
    );
    const sizeRow = row(`${N}-size`, `${P}/prep/size`, L("dish.prep.size"), text(c.size, { enterkeyhint: "next" }, (v) => {
      c.size = v;
    }), L("dish.prep.size.hint"));
    const timingRow = row(
      `${N}-timing`,
      `${P}/prep/timing`,
      L("dish.prep.timing"),
      select([{ value: "", label: L("dish.prep.timing.default") }, ...TIMINGS.map((t) => ({ value: t, label: L(TIMING_KEY[t]) }))], c.timing, (v) => {
        c.timing = v as "" | PrepTiming;
      }),
    );
    const noteTri = triFields(c.note, { name: `${N}-note`, pointer: `${P}/prep/note`, labels: { zh: L("dish.prep.note"), en: L("dish.prep.note.en"), uk: L("dish.prep.note.uk") }, auto: false });

    const extras: HTMLElement[] = [];
    if (c.prepImage) {
      const img = c.prepImage;
      extras.push(
        h(
          "div",
          { class: "adm-dish-preview adm-dish-preview-sm" },
          h("img", { src: imgSrc(img.src), alt: L("dish.prep.image") }),
          h(
            "div",
            { class: "adm-dish-preview-meta" },
            h("p", { class: "muted" }, `${L("dish.prep.image")} · ${img.license}`),
            button({
              label: L("dish.photo.remove"),
              onClick: () => {
                c.prepImage = null;
                changed();
                paintComponents();
              },
            }),
          ),
        ),
      );
    }
    if (c.confidence) extras.push(h("p", { class: "muted adm-dish-hint" }, L("dish.confidence", { v: c.confidence.value, src: c.confidence.source })));

    const remove = button({
      label: L("dish.remove"),
      kind: "ghost",
      class: "adm-dish-remove",
      onClick: () => {
        removed = { kind: "component", index: i, item: c };
        d.components.splice(i, 1);
        changed();
        paintComponents();
        offerUndo(L("dish.removed.component", { name }));
      },
    });

    body.append(pickRowHost, toTasteRow, qtyGrid, techRow, h("div", { class: "adm-dish-grid2" }, sizeRow, timingRow), noteTri.el, ...extras, h("div", { class: "adm-dish-card-actions" }, remove));
    return h("li", { class: "card adm-dish-card", "aria-label": nth, "data-key": String(c.key) }, head, body);
  }

  /** 「食材库里没有 · 新建」：就地内联 #23 的表单件；存成功 → 本行引用新 id，catalog 重取 */
  function inlineIngredient(c: ComponentDraft): HTMLElement {
    const ingDraft = c.newIngredient;
    if (!ingDraft) return h("div");
    const form = buildIngredientForm({
      lang,
      api,
      draft: ingDraft,
      editing: false,
      catalog,
      idPrefix: `${ID_PREFIX}-c${c.key}-ing`,
      onChange: () => {
        d.dirty = true;
      },
      onGoEdit: (id) => {
        // 库里已有：直接用它，不再新建
        if (ingDraft.pending) URL.revokeObjectURL(ingDraft.pending.previewUrl);
        c.newIngredient = null;
        c.ingredientRef = id;
        changed();
        paintComponents();
      },
    });
    const msg = h("div", { class: "adm-dish-inline-msg" });
    const saveBtn = button({ label: L("dish.newIngredient.save"), kind: "primary" });
    const cancelBtn = button({
      label: adm("adm.cancel", undefined, lang),
      kind: "ghost",
      onClick: () => {
        if (ingDraft.pending) URL.revokeObjectURL(ingDraft.pending.previewUrl);
        c.newIngredient = null;
        paintComponents();
      },
    });
    let busyNow = false;
    saveBtn.addEventListener("click", () => void saveInline());
    async function saveInline(): Promise<void> {
      if (busyNow) return;
      form.clearErrors();
      msg.replaceChildren();
      if (!catalog) {
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
      busyNow = true;
      const done = busy(saveBtn, adm("adm.saving", undefined, lang));
      try {
        const out = await submitIngredientForm(api, form);
        if (!el.isConnected) return;
        if (out.ok) {
          const id = form.id();
          c.newIngredient = null;
          c.ingredientRef = id;
          try {
            catalog = await api.getCatalog(); // 写入成功后 api 层已失效缓存（§3.5）：这里拿到的就带新食材
          } catch {
            /* 名字先用 id 顶着 */
          }
          if (!el.isConnected) return;
          changed();
          paintComponents();
          paintSteps();
          clearTransient();
          addTransient(notice({ kind: "ok", text: L("dish.newIngredient.saved") }));
          return;
        }
        const err = out.error;
        if (isApiError(err) && err.status === 401) {
          discardDraft();
          sessionExpired(el, lang);
          return;
        }
        if (out.stage === "upload") {
          form.showErrors(isApiError(err) && err.hasFieldErrors ? err.errors : [{ path: "/image", code: isApiError(err) ? err.code : "network", message: L("dish.photo.uploadFailed", { msg: apiMessage(err, lang) }) }]);
          return;
        }
        if (isApiError(err) && (err.hasFieldErrors || err.status === 400)) {
          form.showErrors(err.errors);
          return;
        }
        msg.append(errorCard(apiMessage(err, lang), () => void saveInline()));
      } finally {
        done();
        busyNow = false;
      }
    }
    return h(
      "div",
      { class: "adm-dish-inline" },
      h("p", { class: "section-label adm-dish-inline-title" }, L("dish.newIngredient.title")),
      form.el,
      msg,
      h("div", { class: "adm-dish-inline-actions" }, cancelBtn, saveBtn),
    );
  }

  const addComponent = button({
    label: L("dish.components.add"),
    class: "adm-dish-add",
    onClick: () => {
      for (const c of d.components) c.expanded = false;
      d.components.push(newComponent(d));
      changed();
      paintComponents();
      componentsList.lastElementChild?.querySelector<HTMLElement>("input")?.focus();
    },
  });

  // ---- 步骤 ------------------------------------------------------------------------
  const stepsList = h("ol", { class: "adm-dish-list", "aria-label": L("dish.steps") });
  const stepsCount = h("span", { class: "muted adm-dish-count" });
  function paintSteps(): void {
    stepSummaries.length = 0;
    stepsList.replaceChildren();
    stepsCount.textContent = d.steps.length ? L("dish.steps.count", { n: d.steps.length }) : "";
    d.steps.forEach((s, i) => stepsList.append(stepCard(s, i)));
  }
  function stepCard(s: StepDraft, i: number): HTMLElement {
    const P = `/steps/${i}`;
    const N = `s${s.key}`;
    const nth = L("dish.steps.nth", { n: i + 1 });
    const previewOf = (): string => pick({ zh: s.text.zh || undefined, en: s.text.en || undefined, uk: s.text.uk || undefined }, lang).trim() || L("dish.steps.empty");
    const preview = previewOf();
    const summaryOf = (): string => [previewOf(), s.techniqueRef ? techniqueName(catalog, s.techniqueRef, lang) : ""].filter(Boolean).join(" · ");
    const summaryEl = h("span", { class: "adm-dish-card-summary" }, summaryOf());
    const toggle = h(
      "button",
      { type: "button", class: "adm-dish-card-toggle", "aria-expanded": s.expanded ? "true" : "false" },
      h("span", { class: "adm-dish-card-num", "aria-hidden": "true" }, String(i + 1)),
      summaryEl,
      h("span", { class: "adm-dish-card-caret", "aria-hidden": "true" }, s.expanded ? "▾" : "▸"),
    );
    const refreshSummary = (): void => {
      summaryEl.textContent = summaryOf();
      toggle.setAttribute("aria-label", `${nth}：${summaryEl.textContent} · ${L(s.expanded ? "dish.components.collapse" : "dish.components.expand")}`);
    };
    refreshSummary();
    stepSummaries.push(refreshSummary);
    toggle.addEventListener("click", () => {
      s.expanded = !s.expanded;
      paintSteps();
    });
    const head = h("div", { class: "adm-dish-card-head" }, toggle, moveButtons(d.steps, i, () => {
      changed();
      paintSteps();
    }, nth));
    const body = h("div", { class: "adm-dish-card-body", hidden: !s.expanded });
    const textTri = triFields(s.text, { name: `${N}-text`, pointer: `${P}/text`, labels: { zh: L("dish.steps.text"), en: L("dish.steps.text.en"), uk: L("dish.steps.text.uk") }, multiline: true, auto: true });
    const techRow = row(
      `${N}-technique`,
      `${P}/techniqueRef`,
      L("dish.steps.technique"),
      techniqueSelect(s.techniqueRef, L("dish.steps.technique.none"), (v) => {
        s.techniqueRef = v;
      }),
      catalog ? undefined : L("dish.prep.noCatalog"),
    );
    const extras: HTMLElement[] = [];
    if (s.image) extras.push(h("div", { class: "adm-dish-preview adm-dish-preview-sm" }, h("img", { src: imgSrc(s.image.src), alt: "" }), h("p", { class: "muted" }, s.image.license)));
    if (s.clip) extras.push(h("p", { class: "muted adm-dish-hint" }, h("a", { href: s.clip.videoUrl, target: "_blank", rel: "noopener" }, L("dish.steps.clip", { start: s.clip.start, end: s.clip.end }))));
    const remove = button({
      label: L("dish.remove"),
      kind: "ghost",
      class: "adm-dish-remove",
      onClick: () => {
        removed = { kind: "step", index: i, item: s };
        d.steps.splice(i, 1);
        changed();
        paintSteps();
        offerUndo(L("dish.removed.step", { name: preview }));
      },
    });
    body.append(textTri.el, techRow, ...extras, h("div", { class: "adm-dish-card-actions" }, remove));
    return h("li", { class: "card adm-dish-card", "aria-label": nth, "data-key": String(s.key) }, head, body);
  }
  const addStep = button({
    label: L("dish.steps.add"),
    class: "adm-dish-add",
    onClick: () => {
      for (const s of d.steps) s.expanded = false;
      d.steps.push(newStep(d));
      changed();
      paintSteps();
      stepsList.lastElementChild?.querySelector<HTMLElement>("textarea")?.focus();
    },
  });

  // ---- 组装 ------------------------------------------------------------------------
  const statusChip = (): HTMLElement | null => {
    const s = d.status ?? (editing ? "draft" : null);
    if (!s) return null;
    return h("span", { class: `chip ${s === "active" ? "ok" : s === "archived" ? "" : "warn"} adm-dish-status` }, L(s === "active" ? "dish.status.active" : s === "archived" ? "dish.status.archived" : "dish.status.draft"));
  };
  const provenanceLine = (): HTMLElement | null => {
    const src = d.provenance?.source;
    if (!src) return null;
    const label = L(src === "video" ? "dish.provenance.video" : src === "example" ? "dish.provenance.example" : "dish.provenance.manual");
    return h("p", { class: "muted adm-dish-hint adm-dish-provenance" }, d.provenance?.videoUrl ? h("a", { href: d.provenance.videoUrl, target: "_blank", rel: "noopener" }, label) : label);
  };

  const basic = h("div", { class: "card adm-dish-section" }, nameTri.el, idRow, descTri.el, servingsRow, photoRow, provenanceLine());
  const componentsSection = h(
    "div",
    { class: "adm-dish-block" },
    h("p", { class: "section-label adm-dish-label" }, L("dish.components"), " ", componentsCount),
    componentsList,
    h("div", { class: "adm-dish-add-row" }, addComponent),
  );
  const stepsSection = h("div", { class: "adm-dish-block" }, h("p", { class: "section-label adm-dish-label" }, L("dish.steps"), " ", stepsCount), stepsList, h("div", { class: "adm-dish-add-row" }, addStep));

  const draftBtn = button({ label: L(returnTo ? "dish.saveDraft.return" : "dish.saveDraft"), class: "adm-dish-save-draft", onClick: () => void save("draft") });
  const activeBtn = button({ label: L(returnTo ? "dish.activate.return" : "dish.activate"), kind: "primary", class: "adm-dish-save-active", onClick: () => void save("active") });
  const bottom = h("div", { class: "adm-dish-bottom" }, h("p", { class: "muted adm-dish-bottom-hint" }, L("dish.activate.hint")), h("div", { class: "adm-dish-bottom-btns" }, draftBtn, activeBtn));

  const formEl = h("form", { class: "adm-dish-form", novalidate: true, role: "tabpanel", id: `${ID_PREFIX}-pane-manual`, "aria-labelledby": tabManual.id }, h("div", { class: "card adm-dish-readycard" }, readyChips, h("p", { class: "adm-dish-missing-title" }, L("dish.missing.title")), missingBox), basic, componentsSection, stepsSection, bottom);
  formEl.addEventListener("submit", (ev) => ev.preventDefault()); // 保存只认底部两个按钮，免得 Enter 手滑提交
  formEl.addEventListener("keydown", (ev) => {
    // 单行输入里的 Enter = 下一格（中文输入法选词的 Enter 不拦）
    if (ev.key !== "Enter" || ev.isComposing) return;
    const target = ev.target;
    if (!(target instanceof HTMLInputElement) || target.type === "checkbox" || target.type === "file") return;
    ev.preventDefault();
    const fields = [...formEl.querySelectorAll<HTMLElement>("input, select, textarea")].filter((x) => !(x as HTMLInputElement).disabled && x.offsetParent !== null && !(x instanceof HTMLInputElement && (x.type === "checkbox" || x.type === "file")));
    const next = fields[fields.indexOf(target) + 1];
    if (next) next.focus();
    else target.blur();
  });

  const head = h("div", { class: "adm-dish-head" }, tabs, statusChip());
  el.append(h("div", { class: "adm adm-dish" }, topBar({ back: () => leaveTo(returnTo ?? adminHref()), title }), notices, head, formEl, paneVideo));
  paintTabs();
  paintComponents();
  paintSteps();
  paintReadiness();

  // 没网：只能看不能存（§7 排除 2、3）
  const offline = notice({ kind: "info", text: adm("adm.offline", undefined, lang) });
  notices.append(offline);
  function syncNet(): void {
    const online = navigator.onLine;
    offline.hidden = online;
    draftBtn.disabled = !online;
    activeBtn.disabled = !online;
  }
  syncNet();
  window.addEventListener("online", syncNet);
  window.addEventListener("offline", syncNet);
  disposePaint = () => {
    window.removeEventListener("online", syncNet);
    window.removeEventListener("offline", syncNet);
  };

  // catalog：食材搜索 / 技法闭集 / 查重 / readiness 的能采；晚到就晚到，不阻塞（§4.5 空态）
  void api
    .getCatalog()
    .then((c) => {
      if (!el.isConnected) return;
      catalog = c;
      refreshDup();
      paintComponents();
      paintSteps();
      paintReadiness();
    })
    .catch(() => {
      if (!el.isConnected) return;
      catalogFailed = true;
      paintComponents();
      paintSteps();
    });
  // handoff 带来的菜名（#22「新建」）：一进来就机翻一次；切语言重画时 translatedFrom 已等于 zh，不会重复调
  if (d.name.zh.trim() && !editing) void nameTri.translate(false);

  // ---- 保存 ------------------------------------------------------------------------
  /** 本地只查 API 看不见的：id 形状 / 撞名、待上传照片缺许可、还没选食材的行、没存的内联新食材、空数量、给了 prep 没选切法、空步骤 */
  function localErrors(): FieldError[] {
    const errs: FieldError[] = [];
    if (!editing) {
      const id = d.id.trim();
      if (!id) errs.push({ path: "/id", code: "required", message: L("dish.slug.required") });
      else if (!ID_RE.test(id)) errs.push({ path: "/id", code: "pattern", message: L("dish.slug.bad") });
      else if (dup && dup.id === id) errs.push({ path: "/id", code: "conflict", message: L("dish.slug.taken") });
    }
    if (d.pending && !d.pending.license.trim()) errs.push({ path: "/image/license", code: "required", message: L("dish.photo.licenseRequired") });
    d.components.forEach((c, i) => {
      const P = `/components/${i}`;
      if (c.newIngredient) errs.push({ path: `${P}/ingredientRef`, code: "required", message: L("dish.newIngredient.unsaved") });
      else if (!c.ingredientRef.trim()) errs.push({ path: `${P}/ingredientRef`, code: "required", message: L("dish.components.pickFirst") });
      if (!c.toTaste && !(num(c.qty) > 0)) errs.push({ path: `${P}/qty/value`, code: "required", message: L("dish.qty.required") });
      if (prepOf(c) && !c.techniqueRef) errs.push({ path: `${P}/prep/techniqueRef`, code: "required", message: L("dish.prep.technique.required") });
    });
    d.steps.forEach((s, i) => {
      if (triEmpty(s.text)) errs.push({ path: `/steps/${i}/text`, code: "required", message: L("dish.steps.text.required") });
    });
    return errs;
  }

  function remapError(e: FieldError): FieldError {
    if (e.code === "bad_id" || e.code === "bad_path") return { ...e, path: "/id" };
    if (e.path === "/license") return { ...e, path: "/image/license" };
    return e;
  }

  /** 标黄前先把命中的配料 / 步骤卡展开（收起的卡里 focus 不到） */
  function showErrors(errors: readonly FieldError[]): void {
    let repaint = false;
    for (const e of errors) {
      const m = /^[/](components|steps)[/](\d+)/.exec(e.path);
      if (!m) continue;
      const list = m[1] === "components" ? d.components : d.steps;
      const item = list[Number(m[2])];
      if (item && !item.expanded) {
        item.expanded = true;
        repaint = true;
      }
    }
    if (repaint) {
      paintComponents();
      paintSteps();
    }
    applyFieldErrors(formEl, errors.map(remapError));
  }

  function reload(): void {
    // 409：丢掉本地改动，按线上版本重读。新建后第一次撞上时 rest 还是 "new"，跳到 /dish/<id> 重进
    const id = d.id.trim();
    discardDraft();
    if (rest === "new" && id) {
      location.hash = adminHref("dish", id);
      return;
    }
    el.replaceChildren();
    void render(el, ctx, rest);
  }

  /** 保存后顶部那条：绿条 + 「再加一道」/「去排菜单」 */
  function savedBar(text: string): HTMLElement {
    const again = button({
      label: L("dish.addAnother"),
      kind: "ghost",
      class: "adm-notice-action",
      onClick: () => {
        // 同一个 hash（#/admin/dish/new）再进一次不会触发 hashchange：手动丢弃 + 重画
        discardDraft();
        if (location.hash !== adminHref("dish", "new")) {
          location.hash = adminHref("dish", "new");
          return;
        }
        el.replaceChildren();
        void render(el, ctx, "new");
      },
    });
    const plan = h("a", { class: "adm-notice-action", href: adminHref("plan") }, L("dish.goPlan"));
    return h("div", { class: "adm-notice adm-ok adm-dish-saved", role: "status" }, h("p", {}, text), again, plan);
  }

  /** 悬空引用（worker 只给 "dangling-ref" 一个词，具体是哪些自己对着 catalog 算） */
  function danglingRefs(): string[] {
    if (!catalog) return [];
    const out = new Set<string>();
    const known = new Set(catalog.techniques.map((t) => t.id));
    for (const c of d.components) {
      if (c.ingredientRef && !catalog.ingredients[c.ingredientRef]) out.add(c.ingredientRef);
      if (c.techniqueRef && !known.has(c.techniqueRef)) out.add(c.techniqueRef);
    }
    for (const s of d.steps) if (s.techniqueRef && !known.has(s.techniqueRef)) out.add(s.techniqueRef);
    return [...out];
  }

  async function save(mode: "draft" | "active"): Promise<void> {
    if (saving) return;
    if (!navigator.onLine) {
      syncNet();
      return;
    }
    clearFieldErrors(formEl);
    clearTransient();
    // 新建时 catalog 还没到 → 先等它一次再查重，免得静默覆盖同名文件（worker 不带 If-Match 会直接写）
    if (!editing && !catalog) {
      try {
        catalog = await api.getCatalog();
        if (!el.isConnected) return;
        refreshDup();
      } catch {
        /* 查不了重也让存 */
      }
    }
    const local = localErrors();
    if (local.length > 0) {
      showErrors(local);
      return;
    }
    saving = true;
    const btn = mode === "draft" ? draftBtn : activeBtn;
    const other = mode === "draft" ? activeBtn : draftBtn;
    const done = busy(btn, adm("adm.saving", undefined, lang));
    const doneOther = busy(other);
    const id = d.id.trim();
    try {
      // 1. 待上传的成品图先传（失败只在照片区显示错误，表单其它内容原样；§4.4 同款）
      if (d.pending) {
        const meta: ImageMeta = { license: d.pending.license.trim() };
        if (d.pending.author.trim()) meta.author = d.pending.author.trim();
        if (d.pending.sourceUrl.trim()) meta.sourceUrl = d.pending.sourceUrl.trim();
        try {
          const ref = await api.uploadImage("dishes", id, d.pending.blob, meta);
          if (!el.isConnected) return;
          dropPending();
          d.image = { ...ref };
          paintPhoto();
        } catch (err) {
          if (!el.isConnected) return;
          if (isApiError(err) && err.status === 401) {
            discardDraft();
            sessionExpired(el, lang);
            return;
          }
          showErrors(isApiError(err) && err.hasFieldErrors ? err.errors : [{ path: "/image", code: isApiError(err) ? err.code : "network", message: L("dish.photo.uploadFailed", { msg: apiMessage(err, lang) }) }]);
          return;
        }
      }
      // 2. 存草稿 → POST /dish/:id/draft（worker 无条件 draft）；入库 → POST /dish/:id + status: "active"（决议追加第 1 条）
      const dish = draftToDish(d);
      if (mode === "active") dish.status = "active";
      const opts = d.blobSha ? { ifMatch: d.blobSha } : undefined;
      const result = mode === "draft" ? await api.saveDishDraft(id, dish, opts) : await api.saveDish(id, dish, opts);
      d.blobSha = result.blobSha;
      d.dirty = false;
      const forced = result.warnings.includes("status-forced");
      d.status = mode === "active" && !forced ? "active" : "draft";
      if (returnTo) {
        location.hash = returnTo; // 从导入屏跳来的：保存成功后回去，#22 重新匹配菜名（hashchange → 丢弃已保存的草稿）
        return;
      }
      if (!el.isConnected) return;
      const bars: HTMLElement[] = [];
      if (result.unchanged) bars.push(savedBar(adm("adm.saved.unchanged", undefined, lang)));
      else bars.push(savedBar(L(d.status === "active" ? "dish.activated" : "dish.savedDraft")));
      if (mode === "active" && forced) bars.push(notice({ kind: "warn", text: L("dish.statusForced") }));
      if (result.warnings.includes("dangling-ref")) bars.push(notice({ kind: "warn", text: L("dish.warn.dangling", { list: danglingRefs().join(", ") || "dangling-ref" }) }));
      const rest2 = result.warnings.filter((w) => w !== "no-if-match" && w !== "status-forced" && w !== "dangling-ref");
      if (rest2.length > 0) bars.push(notice({ kind: "warn", text: L("dish.warnings", { list: rest2.join(", ") }) }));
      // 留在本屏，重画成「改菜」（id 锁定、以后带 If-Match）
      el.replaceChildren();
      paintScreen(el, ctx, rest, api, bars);
    } catch (err) {
      if (!el.isConnected) return;
      if (isApiError(err) && err.status === 401) {
        discardDraft();
        sessionExpired(el, lang);
        return;
      }
      if (isApiError(err) && (err.hasFieldErrors || err.status === 400)) {
        showErrors(err.errors); // message 原样，按 JSON Pointer 标黄，焦点移到第一个出错控件（kit）
        return;
      }
      if (isApiError(err) && err.status === 409) {
        addTransient(errorCard(apiMessage(err, lang), reload)); // 「有人刚改过，刷新后重试」+ 重新读取
        return;
      }
      addTransient(errorCard(apiMessage(err, lang), () => void save(mode))); // 403 / 413 / 429 / 502 / 503 / 断网：原样 + 重试
    } finally {
      done();
      doneOther();
      saving = false;
    }
  }
}
