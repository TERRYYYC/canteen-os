/** AnyDish editor: optional original quantities, C1 conditional saves; see dish-editor.md. */
import "./dish-new.css";

import { type AnyDish, type DishV3, type DishComponentV3, type DishComponent, type DishPrep, type DishProvenance, type DishStatus, type DishStep, type I18nString, type PrepTiming, type Technique, type Unit } from "@canteenos/core";

import { getApi, type AdminApi } from "../../api/client";
import { ApiError, isApiError, type Source, type FieldError, type ImageMeta, type ImageRef } from "../../api/types";
import { adm, apiMessage, applyFieldErrors, busy, button, clearFieldErrors, errorCard, fieldRow, notice, sessionExpired, topBar } from "../../admin/kit";
import { getTeamMealsApi, type TeamCatalog, type TeamMealsApi } from "../../api/team-meals";
import { createEditSession, type EditState } from "../../view-models/edit-session";
import { bindDraftStore } from "../../admin/store";
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

  "dish.description": { uk: "Короткий опис страви", zh: "一句话介绍", en: "Short dish description" },
  "dish.description.en": { uk: "Опис англійською", zh: "介绍 · 英文", en: "Description in English" },
  "dish.description.uk": { uk: "Опис українською", zh: "介绍 · 乌克兰语", en: "Description in Ukrainian" },
  "dish.baseServings": { uk: "На скільки порцій написано рецепт", zh: "这个配方按几份写的", en: "How many servings this recipe is written for" },
  "dish.baseServings.hint": { uk: "Необов’язково. Залиште порожнім, якщо невідомо", zh: "可不填；不知道就留空，已有真实份数会保留", en: "Optional. Leave blank if unknown; keep known recipe servings" },

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
  "dish.qty.toTaste.hint": { uk: "Позначайте лише коли в рецепті написано «за смаком». Невідому кількість залиште порожньою", zh: "只有原配方写了适量才勾选；未知用量请留空，材料仍会列入清单", en: "Select only if the recipe says to taste. Leave unknown amounts blank; ingredients remain on the list" },
  "dish.qty.required": { uk: "Вкажіть додатне число або залиште порожнім", zh: "填大于零的数字，未知则留空", en: "Enter a positive number or leave unknown amounts blank" },
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
    uk: "Збереження та додавання в базу не публікують зміни. Перевірте всі записані інгредієнти",
    zh: "存草稿和入库都不会自动发布；请核对已录配料是否齐全",
    en: "Saving or adding to the library does not publish. Check whether all recipe ingredients are recorded",
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

const EDIT_COPY = {
  processing: { zh: "正在处理照片或翻译", en: "Working on a photo or translation", uk: "Обробляється фото або переклад" },
  unconfigured: { zh: "未连接保存服务 · 草稿仅在本页内存中", en: "Save service is not connected · draft stays in memory", uk: "Сервіс збереження не підключено · чернетка лише в пам’яті" },
  mock: { zh: "模拟演示 · 未写入真实仓库", en: "Mock demonstration · no real repository write", uk: "Демонстрація · реальний репозиторій не змінено" },
  real: { zh: "已配置保存服务", en: "Save service configured", uk: "Сервіс збереження налаштовано" },
  clean: { zh: "已读取 · 未修改", en: "Loaded · unchanged", uk: "Завантажено · без змін" },
  dirty: { zh: "有未保存改动", en: "Unsaved changes", uk: "Є незбережені зміни" },
  saving: { zh: "正在保存 · 后续编辑会保留", en: "Saving · later edits are retained", uk: "Збереження · подальші зміни зберігаються у чернетці" },
  "saved-but-unpublished": { zh: "已保存 · 尚未发布", en: "Saved · not published", uk: "Збережено · не опубліковано" },
  conflict: { zh: "来源已改变 · 本地草稿已保留，请比较后选择", en: "Source changed · local draft retained; compare before choosing", uk: "Джерело змінилося · чернетку збережено; порівняйте версії" },
  "outcome-unknown": { zh: "保存结果未知 · 核实之前不会再次写入", en: "Save outcome unknown · verify before another write", uk: "Результат невідомий · перевірте перед повторним записом" },
  error: { zh: "未保存 · 请检查错误", en: "Not saved · check the error", uk: "Не збережено · перевірте помилку" },
  closed: { zh: "编辑已关闭", en: "Editor closed", uk: "Редактор закрито" },
  verify: { zh: "核实保存结果", en: "Verify save outcome", uk: "Перевірити результат" },
  compare: { zh: "读取远端并比较", en: "Read remote and compare", uk: "Прочитати й порівняти" },
  local: { zh: "保留本地稿并采用新基线", en: "Keep local draft with the new baseline", uk: "Залишити чернетку з новою базою" },
  remote: { zh: "采用远端内容", en: "Use remote content", uk: "Прийняти віддалений вміст" },
  returnTo: { zh: "回到导入", en: "Return to import", uk: "Повернутися до імпорту" },
  auxUnavailable: { zh: "图片上传、机翻和新建食材需要连接真实保存服务", en: "Images, translation and new ingredients require a real connected save service", uk: "Фото, переклад і нові інгредієнти потребують підключення до реального сервісу" },
  auxUnknown: { zh: "图片或食材保存结果未知，资料已保留；请先核实后台结果", en: "Image or ingredient save outcome unknown. Local information is retained; verify the backend outcome first", uk: "Результат збереження фото або інгредієнта невідомий. Локальні дані збережено; спочатку перевірте результат на сервері" },
} as const;
function statusText(key: keyof typeof EDIT_COPY, lang: Lang): string { return EDIT_COPY[key][lang]; }

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

type InlineIngredientFeedback = { kind: "local" } | { kind: "failure"; stage: "upload" | "save"; error: unknown };
// Feedback follows the real inline buffer across paints; it never enters saved JSON.
const inlineIngredientFeedback = new WeakMap<IngredientDraft, InlineIngredientFeedback>();

export interface ComponentDraft {
  /** DOM key（新增时递增），与数组下标无关 */
  key: number;
  ingredientRef: string;
  /** 还没选食材时搜索框里的字 */
  search: string;
  toTaste: boolean;
  /** Legacy schema permits a positive value alongside to-taste; retain that recorded fact. */
  originalToTasteValue?: number;
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
  baseServings: string;
  loaded: boolean;
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
    baseServings: "",
    loaded: false,
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
export function draftFromDish(dish: AnyDish, id: string, blobSha: string | null): DishDraft {
  const d = createDishDraft();
  d.name = makeTri(dish.name);
  d.description = makeTri(dish.description);
  d.id = id;
  d.idTouched = true;
  d.loaded = true;
  d.baseServings = dish.baseServings === undefined ? "" : String(dish.baseServings);
  d.image = dish.image ? { ...dish.image } : null;
  for (const c of dish.components ?? []) {
    const row = newComponent(d, { ingredientRef: c.ingredientRef });
    row.toTaste = c.qty?.unit === "to-taste";
    if (row.toTaste && c.qty?.value !== undefined) row.originalToTasteValue = c.qty.value;
    row.qty = c.qty?.value !== undefined ? String(c.qty.value) : "";
    if (c.qty && !row.toTaste) row.unit = c.qty.unit;
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
 *   schemaVersion "3" · name / description 只写非空语言（description 全空不写）· image 有图才写 · baseServings 可空
 *   · components / steps 为空整个不写（minItems 1）· 未知 qty 省略；已有 to-taste.value 也保留
 *   · prep 只在任一子字段非空时写 · confidence / prep.image / steps[].image / clip 原样写回 · 新菜 provenance 为 manual
 *   · status 只在有值时写（「入库」由调用方置 active）。
 */
export function draftToDish(d: DishDraft): DishV3 {
  const dish: DishV3 = { schemaVersion: "3", name: triToI18n(d.name) ?? {} };
  const desc = triToI18n(d.description);
  if (desc) dish.description = desc;
  if (d.image) dish.image = { ...d.image };
  if (d.baseServings.trim()) dish.baseServings = num(d.baseServings);
  if (d.components.length > 0) {
    dish.components = d.components.map((c) => {
      const out: DishComponentV3 = { ingredientRef: c.ingredientRef.trim() };
      if (c.toTaste) out.qty = { unit: "to-taste", ...(c.originalToTasteValue !== undefined ? { value: c.originalToTasteValue } : {}) };
      else if (c.qty.trim()) out.qty = { value: num(c.qty), unit: c.unit };
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
  if (d.provenance) dish.provenance = { ...d.provenance };
  else if (!d.loaded) dish.provenance = { source: "manual" };
  if (d.status) dish.status = d.status;
  return dish;
}

/** 预览地址：blob: / data: / http(s) 原样；仓库内相对路径挂 BASE_URL（同 prep.ts 的 imgSrc） */
function imgSrc(src: string): string {
  if (/^(https?:[/][/]|blob:|data:)/i.test(src)) return src;
  return `${import.meta.env.BASE_URL}${src.replace(/^[/]+/, "")}`;
}

/** 食材名（按界面语言，回退链 pick）；catalog 没到或没这个食材 → 直接给 id */
function ingredientName(catalog: TeamCatalog | null, ref: string, lang: Lang): string {
  const ing = catalog?.ingredients[ref];
  return (ing ? pick(ing.name, lang) : "") || ref;
}

function techniqueName(catalog: TeamCatalog | null, ref: string, lang: Lang): string {
  const t = catalog?.techniques.find((x) => x.id === ref);
  return (t ? pick(t.name, lang) : "") || ref;
}

function formatQty(c: ComponentDraft, lang: Lang): string {
  if (c.toTaste) return tt(lang, "dish.qty.toTaste");
  const v = c.qty.trim();
  return v ? `${v} ${tt(lang, UNIT_KEY[c.unit])}` : "";
}

/** Page adapter owns raw form inputs; C1 owns conditional writes and their unresolved outcome. */
export function createDishForm(api: TeamMealsApi) {
  type Record = {
    draft: DishDraft;
    source: Source<AnyDish> | null;
    identity: string;
    target: string;
    state: EditState<AnyDish> | null;
    detachedChanges: boolean;
    auxiliary: Map<string, "saving" | "processing">;
    auxiliaryError: unknown;
    auxiliaryUnknown: boolean;
    rawGeneration: number;
  };
  const records = new Map<string, Record>();
  const identities = new Map<string, Record>();
  let active: Record | null = null;
  let currentKey = "";
  let sequence = 0;
  let loadGeneration = 0;
  let context = 0;
  const auth = api.sessionKey();
  const listeners = new Set<(contentChanged: boolean) => void>();
  function notify(record: Record, contentChanged = false): void {
    if (active !== record || !valid()) return;
    for (const listener of listeners) { try { listener(contentChanged); } catch { /* Presentation cannot change a write outcome. */ } }
  }
  function rawPending(record: Record): boolean {
    return !!record.draft.pending || record.draft.components.some(c => c.newIngredient !== null) || record.detachedChanges;
  }
  function imageMeta(pending: PendingImage): ImageMeta {
    return { license: pending.license.trim(), ...(pending.author.trim() ? { author: pending.author.trim() } : {}), ...(pending.sourceUrl.trim() ? { sourceUrl: pending.sourceUrl.trim() } : {}) };
  }
  const session = createEditSession<AnyDish>({
    mode: () => api.mode,
    authSession: () => api.sessionKey(),
    peekAuthSession: () => api.peekSessionKey?.(),
    save: (identity, body, condition) => {
      const id = identities.get(identity.id)?.target;
      if (!id) throw new Error("Missing dish identity");
      return body.status === "draft" ? api.saveDishDraft(id, body, condition) : api.saveDish(id, body, condition);
    },
    read: (identity, options) => api.getDish(identities.get(identity.id)?.target ?? identity.id, options),
  });
  function valid(): boolean { return api.sessionKey() === auth; }
  session.subscribe(state => {
    const record = state.identity ? identities.get(state.identity.id) : null;
    if (!record || state.phase === "closed") return;
    record.state = state;
    record.draft.blobSha = state.source?.blobSha ?? null;
    record.draft.dirty = state.dirty || rawPending(record);
    record.source = state.source;
  });
  function changed(form = active?.draft): void {
    const record = [...records.values()].find(item => item.draft === form);
    if (!record || !valid()) return;
    record.rawGeneration++;
    record.detachedChanges = record !== active;
    record.draft.dirty = true;
    if (record === active) session.edit(draftToDish(record.draft), context);
    record.draft.dirty = !!record.state?.dirty || rawPending(record);
    notify(record);
  }
  /** Auxiliary writes belong to a document, never to one rendering of its form. */
  function beginAuxiliary(key: string, activity: "saving" | "processing" = "saving") {
    const record = active;
    if (!record || !valid() || record.auxiliary.size || record.auxiliaryUnknown || session.getState().operationId) return null;
    record.rawGeneration++;
    record.auxiliary.set(key, activity); record.auxiliaryError = null; notify(record);
    return {
      valid: () => valid() && identities.get(record.identity) === record,
      current: () => valid() && active === record,
      fail(error: unknown) {
        record.auxiliaryError = error;
        record.auxiliaryUnknown = !isApiError(error) || error.status >= 500 || (error.status === 0 && !["unconfigured", "session_changed"].includes(error.code));
      },
      finish(contentChanged = false) { record.rawGeneration++; record.auxiliary.delete(key); notify(record, contentChanged); },
    };
  }
  return {
    session,
    get draft() { return active?.draft ?? null; },
    get key() { return currentKey; },
    get context() { return context; },
    get busy() { return !!active?.auxiliary.size; },
    get processing() { return !!active && [...active.auxiliary.values()].includes("processing"); },
    get auxiliaryError() { return active?.auxiliaryError; },
    get auxiliaryUnknown() { return active?.auxiliaryUnknown ?? false; },
    /** Read-only summary of actual raw buffers; shared reload registration is wired by its owner when available. */
    readAuxiliary(key = currentKey) {
      const record = records.get(key);
      return record ? { generation: record.rawGeneration, dirty: rawPending(record), phase: record.auxiliaryUnknown ? "unknown" as const : record.auxiliary.size ? "busy" as const : "idle" as const } : null;
    },
    subscribe(listener: (contentChanged: boolean) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    beginAuxiliary,
    async load(key: string, seed: { zh?: string } = {}): Promise<DishDraft | null> {
      const generation = ++loadGeneration;
      if (!valid()) return null;
      let record = records.get(key);
      if (!record) {
        const source = key === "new" ? null : await api.getDish(key);
        if (!valid() || generation !== loadGeneration) return null;
        if (!source && key !== "new") return null;
        const form = source ? draftFromDish(source.content, key, source.blobSha) : createDishDraft(seed);
        record = { draft: form, source, identity: key === "new" ? `$new-${++sequence}` : key, target: source ? key : "", state: null, detachedChanges: false, auxiliary: new Map(), auxiliaryError: null, auxiliaryUnknown: false, rawGeneration: 0 };
        records.set(key, record); identities.set(record.identity, record);
      }
      active = record; currentKey = key;
      context = session.open({ kind: "dish", id: record.identity }, record.source?.content ?? draftToDish(record.draft), record.source);
      if (record.detachedChanges) changed(record.draft);
      return record.draft;
    },
    changed,
    refresh() { ++loadGeneration; context = session.refreshView(); return context; },
    detach() { ++loadGeneration; session.invalidate(); active = null; currentKey = ""; },
    /** Only an explicit add-another action discards a resolved new form. */
    newDocument(): boolean {
      if (!valid() || active?.draft.dirty || active?.auxiliary.size || active?.auxiliaryUnknown || session.getState().operationId) return false;
      const previous = records.get("new");
      if (previous && previous !== active && (previous.draft.dirty || previous.auxiliary.size || previous.auxiliaryUnknown || previous.state?.operationId || previous.state?.phase === "conflict")) return true;
      if (previous) { previous.rawGeneration++; identities.delete(previous.identity); }
      records.delete("new"); return true;
    },
    async save(status: "draft" | "active", auxiliary?: Pick<AdminApi, "uploadImage">) {
      if (!active || !valid()) return null;
      const state = session.getState();
      if (state.operationId || state.phase === "conflict" || active.auxiliary.size || active.auxiliaryUnknown) return null;
      const record = active, form = record.draft;
      record.target = record.source ? record.target : form.id.trim();
      form.status = status;
      changed();
      const body = draftToDish(form), pending = form.pending;
      const meta = pending ? imageMeta(pending) : null;
      const operation = beginAuxiliary("dish-save");
      if (!operation) return null;
      try {
        if (pending && meta) {
          if (api.mode !== "real" || !auxiliary) throw new ApiError(0, "unconfigured", "");
          const ref = await auxiliary.uploadImage("dishes", record.target, pending.blob, meta);
          if (!operation.valid()) return null;
          body.image = { ...ref };
          if (form.pending === pending && JSON.stringify(imageMeta(pending)) === JSON.stringify(meta)) {
            URL.revokeObjectURL(pending.previewUrl);
            form.pending = null; form.image = { ...ref }; changed(form);
          }
        }
        // A detached document retains its uploaded image and unsaved draft; do not switch C1's active document.
        if (!operation.current()) return null;
        session.edit(body, context);
        const saving = session.save(context);
        session.edit(draftToDish(form), context); // Later edits remain a separate generation from the submitted snapshot.
        return await saving;
      } catch (error) { operation.fail(error); throw error; }
      finally { operation.finish(true); }
    },
    adopt(source: Source<AnyDish>, keepLocal: boolean): boolean {
      if (!active || !valid() || active.auxiliary.size || active.auxiliaryUnknown) return false;
      const body = keepLocal ? draftToDish(active.draft) : source.content;
      if (!session.replace(body, source, context)) return false;
      context = session.getState().contextId;
      if (!keepLocal) active.draft = draftFromDish(source.content, active.target, source.blobSha);
      active.rawGeneration++;
      active.source = source;
      active.draft.blobSha = source.blobSha;
      active.draft.dirty = session.getState().dirty || rawPending(active);
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// 屏：模块级草稿（推论 A）+ 离开即丢弃
// ---------------------------------------------------------------------------

let draft: DishDraft | null = null;
let draftKey: string | null = null;
let returnTo: string | null = null;
let unwatch: (() => void) | null = null;
let disposePaint: (() => void) | null = null;
let formOwner: ReturnType<typeof createDishForm> | null = null;
let formAuth: number | null = null;
let formApi: TeamMealsApi | null = null;
let renderGeneration = 0;
let paintGeneration = 0;

function discardDraft(): void {
  // Detach only: C1 retains dirty and unresolved records for a later return.
  if (draft?.pending) { URL.revokeObjectURL(draft.pending.previewUrl); draft.pending.previewUrl = ""; }
  for (const c of draft?.components ?? []) {
    if (c.newIngredient?.pending) { URL.revokeObjectURL(c.newIngredient.pending.previewUrl); c.newIngredient.pending.previewUrl = ""; }
  }
  ++renderGeneration;
  ++paintGeneration;
  formOwner?.detach();
  draft = null; draftKey = null; returnTo = null;
  unwatch?.(); unwatch = null;
  disposePaint?.(); disposePaint = null;
}
function isMyHash(hash: string, key: string): boolean {
  const m = /^#[/]?admin[/]dish[/]([^/?#]+)[/]?$/.exec(hash);
  try { return !!m?.[1] && decodeURIComponent(m[1]) === key; } catch { return false; }
}
function watchLeave(key: string): void {
  unwatch?.();
  const onHash = (): void => { if (!isMyHash(location.hash, key)) discardDraft(); };
  const onUnload = (ev: BeforeUnloadEvent): void => {
    if (!draft?.dirty && !formOwner?.busy && !formOwner?.auxiliaryUnknown && !formOwner?.session.getState().operationId) return;
    ev.preventDefault(); ev.returnValue = true;
  };
  window.addEventListener("hashchange", onHash);
  window.addEventListener("beforeunload", onUnload);
  unwatch = () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("beforeunload", onUnload); };
}
export async function render(el: HTMLElement, ctx: PageCtx, rest: string, teamApi: TeamMealsApi = getTeamMealsApi()): Promise<void> {
  const drafts = bindDraftStore(teamApi);
  const lang = ctx.lang;
  const api = getApi();
  const auth = teamApi.sessionKey();
  if (!formOwner || formAuth !== auth || formApi !== teamApi) {
    discardDraft();
    formOwner = createDishForm(teamApi); formAuth = auth; formApi = teamApi;
  }
  const owner = formOwner;
  if (draftKey !== rest) {
    discardDraft(); draftKey = rest;
    const hand = drafts.takeHandoff(); returnTo = hand.returnTo ?? null;
    const load = ++renderGeneration;
    const bar = (): HTMLElement => topBar({ back: adminHref(), title: tt(lang, rest === "new" ? "dish.title.new" : "dish.title.edit") });
    const root = h("div", { class: "adm adm-dish" }, bar(), h("p", { class: "muted" }, adm("adm.loading", undefined, lang)));
    el.append(root);
    watchLeave(rest);
    try {
      const loaded = await owner.load(rest, hand.newDishName ? { zh: hand.newDishName } : {});
      if (!el.isConnected || load !== renderGeneration || auth !== teamApi.sessionKey()) return;
      if (!loaded) { root.replaceChildren(bar(), h("p", { role: "status" }, tt(lang, "dish.notFound"))); draftKey = null; return; }
      draft = loaded;
    } catch (err) {
      if (!el.isConnected || load !== renderGeneration || auth !== teamApi.sessionKey()) return;
      draftKey = null;
      root.replaceChildren(bar(), errorCard(apiMessage(err, lang), () => { el.replaceChildren(); void render(el, ctx, rest, teamApi); }));
      return;
    }
    el.replaceChildren();
  } else if (!draft) {
    // A second language render supersedes any pending first read.
    draftKey = null; el.replaceChildren(); return render(el, ctx, rest, teamApi);
  } else {
    owner.refresh();
  }
  if (draft?.pending && !draft.pending.previewUrl) draft.pending.previewUrl = URL.createObjectURL(draft.pending.blob);
  for (const c of draft?.components ?? []) {
    if (c.newIngredient?.pending && !c.newIngredient.pending.previewUrl) c.newIngredient.pending.previewUrl = URL.createObjectURL(c.newIngredient.pending.blob);
  }
  watchLeave(rest);
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
  const owner = formOwner!;
  const teamApi = formApi!;
  const auth = teamApi.sessionKey();
  const paint = ++paintGeneration;
  const alive = (): boolean => el.isConnected && paint === paintGeneration && auth === teamApi.sessionKey();
  disposePaint?.();
  const L = (key: Key, params?: Params): string => tt(lang, key, params);
  /** 存过一次（blobSha 已有）就按「改菜」画：id 锁定、不查重、带 If-Match */
  const editing = d.blobSha !== null;
  const title = L(editing || rest !== "new" ? "dish.title.edit" : "dish.title.new");
  let catalog: TeamCatalog | null = null;
  let catalogFailed = false;
  const inlineBusyViews: Array<() => void> = [];

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
  const triViews: Array<() => void> = [];
  function changed(): void {
    if (!alive()) return;
    d.dirty = true;
    owner.changed();
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
    translateBtn.disabled = teamApi.mode !== "real";
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
      if (!alive() || teamApi.mode !== "real" || !zh || translating) return;
      if (!manual && (zh === t.translatedFrom || (t.enTouched && t.ukTouched))) return;
      const operation = owner.beginAuxiliary(`translate-${o.name}`, "processing");
      if (!operation) return;
      const names = JSON.stringify([t.zh, t.en, t.uk, t.enTouched, t.ukTouched]);
      const stillOwned = (): boolean => operation.valid() && (t === d.name || t === d.description || d.components.some(c => c.note === t) || d.steps.some(s => s.text === t));
      translating = true;
      const done = busy(translateBtn, L("dish.translating"));
      hint.hidden = true;
      try {
        const r = await api.translate(zh, ["en", "uk"]);
        if (!stillOwned() || names !== JSON.stringify([t.zh, t.en, t.uk, t.enTouched, t.ukTouched])) return;
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
        owner.changed(d);
      } catch {
        // 不阻塞保存（I18nString 只要求至少一种语言）；401 留给保存那一步去锁屏
        if (alive()) { hint.textContent = L("dish.translateFailed"); hint.hidden = false; }
      } finally {
        done();
        translating = false;
        operation.finish(true);
      }
    }
    const el = h("div", { class: "adm-dish-tri" }, zhRow, sub, h("div", { class: "adm-dish-grid2" }, enRow, ukRow), hint);
    triViews.push(() => { if (el.isConnected) { zhInput.value = t.zh; enInput.value = t.en; ukInput.value = t.uk; paintMachine(); } });
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
    // This is a factual field inventory, not numeric procurement/readiness.
    readyChips.replaceChildren(h("span", { class: "chip" }, L("dish.components.count", { n: d.components.length })));
    const keys: string[] = [];
    if (!d.components.length) keys.push("components");
    if (!d.steps.length) keys.push("steps");
    if (!d.baseServings.trim()) keys.push("baseServings");
    for (const c of d.components) {
      if (!c.toTaste && !c.qty.trim()) keys.push(`qty:${c.ingredientRef}`);
      if (catalog && !catalog.ingredients[c.ingredientRef]) keys.push(`ingredient:${c.ingredientRef}`);
    }
    missingBox.replaceChildren(h("ul", { class: "adm-dish-missing-list" }, ...keys.map(k => h("li", {}, missingText(k)))));

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
    if (d.blobSha || owner.session.getState().operationId || d.idTouched) return;
    d.id = slugify(d.name.en);
    idInput.value = d.id;
    refreshDup();
  }
  let dup: { id: string; name: string } | null = null;
  function findDup(): { id: string; name: string } | null {
    if (!catalog || d.blobSha) return null;
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
    text(d.baseServings, { type: "number", min: "1", step: "1", inputmode: "numeric" }, (v) => { d.baseServings = v; }),
    L("dish.baseServings.hint"),
  );

  // ---- 成品图（#23 的压图 + 保存时 uploadImage("dishes", …)） --------------------------------
  const cameraInput = h("input", { type: "file", accept: "image/*", capture: "environment", class: "sr-only adm-dish-file" });
  const pickInput = h("input", { type: "file", accept: "image/*", class: "sr-only adm-dish-file", id: `${ID_PREFIX}-photo-pick` });
  cameraInput.disabled = pickInput.disabled = teamApi.mode !== "real";
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
    if (!alive() || teamApi.mode !== "real") return;
    const operation = owner.beginAuxiliary("dish-photo", "processing");
    if (!operation) return;
    setPhotoMsg(L("dish.photo.compressing"));
    try {
      let out: CompressedImage | null;
      try { out = await compressImage(file); }
      catch {
        if (operation.valid()) operation.fail(new ApiError(400, "image_decode", L("dish.photo.unreadable")));
        return;
      }
      if (!operation.valid()) return;
      if (!out) { operation.fail(new ApiError(400, "image_size", L("dish.photo.tooBig"))); return; }
      dropPending();
      d.pending = { blob: out.blob, width: out.width, height: out.height, previewUrl: URL.createObjectURL(out.blob), license: "own", author: "", sourceUrl: "" };
      d.image = null;
      owner.changed(d);
    } finally {
      if (alive()) setPhotoMsg("");
      operation.finish(true);
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
    if (teamApi.mode !== "real") photoView.append(h("p", { class: "muted" }, statusText("auxUnavailable", lang)));
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
    inlineBusyViews.length = 0;
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
            changed();
            paintComponents();
          },
        });
        create.disabled = teamApi.mode !== "real";
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
    const buffer = c.newIngredient;
    if (teamApi.mode !== "real") return h("p", { role: "status" }, statusText("auxUnavailable", lang));
    if (!buffer) return h("div");
    const ingDraft: IngredientDraft = buffer;
    let taskResultAccepted = false, taskContentChanged = false;
    const form = buildIngredientForm({
      lang,
      api,
      draft: ingDraft,
      editing: !!ingDraft.blobSha,
      catalog,
      idPrefix: `${ID_PREFIX}-c${c.key}-ing`,
      onChange: () => {
        if (taskResultAccepted) taskContentChanged = true;
        owner.changed(d);
      },
      onTaskStart: kind => {
        const operation = owner.beginAuxiliary(`ingredient-${c.key}-${kind}`, "processing");
        if (!operation) return null;
        taskResultAccepted = false; taskContentChanged = false;
        const names = JSON.stringify([ingDraft.zh, ingDraft.en, ingDraft.uk, ingDraft.enTouched, ingDraft.ukTouched]);
        return {
          valid: () => taskResultAccepted = operation.valid() && c.newIngredient === ingDraft && d.components.includes(c)
            && (kind !== "translation" || names === JSON.stringify([ingDraft.zh, ingDraft.en, ingDraft.uk, ingDraft.enTouched, ingDraft.ukTouched])),
          finish: () => { operation.finish(taskContentChanged); taskResultAccepted = false; },
        };
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
        changed();
        paintComponents();
      },
    });
    const operationKey = `ingredient-${c.key}`;
    const syncInline = (): void => {
      const blocked = owner.busy || owner.auxiliaryUnknown || !!owner.session.getState().operationId;
      for (const control of form.el.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>("input, button, select, textarea")) control.disabled = blocked;
      for (const control of msg.querySelectorAll<HTMLButtonElement>("button")) control.disabled = blocked;
      saveBtn.disabled = blocked; cancelBtn.disabled = blocked;
    };
    inlineBusyViews.push(syncInline); syncInline();
    saveBtn.addEventListener("click", () => void saveInline());
    function paintFeedback(): void {
      const feedback = inlineIngredientFeedback.get(ingDraft);
      form.clearErrors(); msg.replaceChildren();
      if (!feedback) return;
      if (feedback.kind === "local") { form.showErrors(form.localErrors()); return; }
      const err = feedback.error;
      if (feedback.stage === "upload") {
        form.showErrors(isApiError(err) && err.hasFieldErrors ? err.errors : [{ path: "/image", code: isApiError(err) ? err.code : "network", message: L("dish.photo.uploadFailed", { msg: apiMessage(err, lang) }) }]);
      } else if (isApiError(err) && (err.hasFieldErrors || err.status === 400)) {
        form.showErrors(err.errors);
      } else {
        msg.append(errorCard(apiMessage(err, lang), owner.auxiliaryUnknown ? undefined : () => void saveInline()));
        syncInline();
      }
    }
    paintFeedback();
    async function saveInline(): Promise<void> {
      if (owner.busy || owner.auxiliaryUnknown || !alive() || teamApi.mode !== "real") return;
      const operation = owner.beginAuxiliary(operationKey);
      if (!operation) return;
      inlineIngredientFeedback.delete(ingDraft);
      form.clearErrors();
      msg.replaceChildren();
      try {
        if (!catalog) {
          try {
            catalog = await teamApi.getCatalog();
            if (!alive()) return;
            form.setCatalog(catalog);
          } catch {
            /* 查不了重也让存 */
          }
        }
        const local = form.localErrors();
        if (local.length > 0) {
          inlineIngredientFeedback.set(ingDraft, { kind: "local" });
          form.showErrors(local);
          return;
        }
        const id = form.id(), body = structuredClone(form.toIngredient()), pending = form.pendingImage();
        const submitted = {
          ...form, id: () => id, toIngredient: () => structuredClone(body), pendingImage: () => pending,
          setImage(ref: ImageRef | null) {
            if (ref) body.image = { ...ref }; else delete body.image;
            const current = form.pendingImage();
            if (operation.valid() && current?.blob === pending?.blob && JSON.stringify(current?.meta) === JSON.stringify(pending?.meta)) form.setImage(ref);
          },
        };
        const out = await submitIngredientForm(api, submitted, ingDraft.blobSha ? { ifMatch: ingDraft.blobSha } : {});
        if (!operation.valid()) return;
        if (out.ok) {
          if (c.newIngredient === ingDraft && d.components.includes(c)) {
            ingDraft.blobSha = out.result.blobSha;
            if (form.id() === id && !form.pendingImage() && JSON.stringify(form.toIngredient()) === JSON.stringify(body)) {
              c.newIngredient = null;
              c.ingredientRef = id;
            }
            owner.changed(d);
          }
          if (!alive()) return;
          try {
            catalog = await teamApi.getCatalog(); // 写入成功后 api 层已失效缓存（§3.5）：这里拿到的就带新食材
          } catch {
            /* 名字先用 id 顶着 */
          }
          if (!alive()) return;
          changed();
          paintComponents();
          paintSteps();
          clearTransient();
          addTransient(notice({ kind: "ok", text: L("dish.newIngredient.saved") }));
          return;
        }
        const err = out.error;
        operation.fail(err);
        inlineIngredientFeedback.set(ingDraft, { kind: "failure", stage: out.stage, error: err });
        if (!alive()) return;
        if (isApiError(err) && err.status === 401) {
          discardDraft();
          sessionExpired(el, lang);
          return;
        }
        paintFeedback();
      } finally {
        // Keep the live form and its focused validation error. A new paint uses
        // the same buffer's feedback when an operation outlives its old form.
        operation.finish(!alive() || !form.el.isConnected);
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

  const draftBtn = button({ label: L("dish.saveDraft"), class: "adm-dish-save-draft", onClick: () => void save("draft") });
  const activeBtn = button({ label: L("dish.activate"), kind: "primary", class: "adm-dish-save-active", onClick: () => void save("active") });
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
  const editStatus = h("div", { class: "card adm-dish-edit-state", role: "status", "aria-live": "polite" });
  const compareBox = h("div", { class: "adm-dish-compare" });
  notices.append(offline, editStatus, compareBox);
  function syncNet(): void {
    const online = navigator.onLine;
    offline.hidden = online;
    const state = owner.session.getState();
    const blocked = !online || owner.busy || owner.auxiliaryUnknown || state.mode === "unconfigured" || !!state.operationId || state.phase === "conflict" || state.phase === "closed";
    draftBtn.disabled = blocked;
    activeBtn.disabled = blocked;
    idInput.readOnly = !!state.source || owner.busy || !!state.operationId;
    cameraInput.disabled = pickInput.disabled = teamApi.mode !== "real" || blocked;
    for (const control of formEl.querySelectorAll<HTMLButtonElement>(".adm-dish-translate")) control.disabled = teamApi.mode !== "real" || blocked;
    for (const syncInline of inlineBusyViews) syncInline();
  }
  function compareDish(value:AnyDish,label:string):HTMLElement {
    return h('section',{},h('h3',{},label),h('p',{},pick(value.name,lang)),h('p',{},`${L('dish.baseServings')}: ${value.baseServings??(lang==='zh'?'未录':lang==='en'?'Not recorded':'Не записано')}`),
      h('p',{},`${value.components?.length??'—'} · ${L('dish.components')} / ${value.steps?.length??'—'} · ${L('dish.steps')}`),
      h('details',{},h('summary',{},lang==='zh'?'完整原始内容':lang==='en'?'Full raw content':'Повні вихідні дані'),h('pre',{class:'adm-dish-json'},JSON.stringify(value,null,2))));
  }
  function syncStatus(): void {
    if (!alive()) return;
    const state = owner.session.getState();
    const phase = owner.busy ? owner.processing ? "processing" : "saving" : d.dirty && (state.phase === "clean" || state.phase === "saved-but-unpublished") ? "dirty" : state.phase;
    editStatus.replaceChildren(h("p", {}, statusText(state.mode, lang)), h("p", {}, statusText(phase, lang)));
    if (owner.auxiliaryUnknown) editStatus.append(h("p", {}, statusText("auxUnknown", lang)));
    if (owner.auxiliaryError) editStatus.append(h("p", {}, apiMessage(owner.auxiliaryError, lang)));
    if (state.source) editStatus.append(h("details", { class: "muted" }, h("summary", {}, state.source.commit.slice(0,8)), h("code", {}, state.source.commit)));
    if (state.error) {
      const e = state.error;
      editStatus.append(h("p", {}, apiMessage(new ApiError(e.status, e.code, e.message, e.errors, e.retryAfter), lang)));
    }
    if (state.phase === "outcome-unknown") {
      const verify = button({ label: statusText("verify", lang), onClick: () => void owner.session.reconcileUnknown(owner.context) });
      verify.disabled = state.recovering;
      editStatus.append(verify);
    }
    if (state.phase === "conflict") editStatus.append(button({ label: statusText("compare", lang), onClick: () => void compareRemote() }));
    if (state.lastSave && !d.dirty && !owner.busy && !owner.auxiliaryUnknown && !state.operationId) {
      editStatus.append(button({ label: L("dish.addAnother"), onClick: () => {
        if (!owner.newDocument()) return;
        discardDraft();
        if (rest !== "new") { location.hash = adminHref("dish", "new"); return; }
        el.replaceChildren(); void render(el, ctx, "new", teamApi);
      } }));
      if (returnTo) editStatus.append(h("a", { class: "adm-btn", href: returnTo }, statusText("returnTo", lang)));
    }
    syncNet();
  }
  async function compareRemote(): Promise<void> {
    const before = owner.session.getState();
    if (!alive() || before.phase !== "conflict") return;
    try {
      const current = await teamApi.getDish(d.id.trim(), { force: true });
      if (!alive()) return;
      if (!current) { compareBox.replaceChildren(h("p", {}, L("dish.notFound"))); return; }
      const remote = await teamApi.getDish(d.id.trim(), { revision: current.commit, force: true });
      if (!alive() || owner.session.getState().phase !== "conflict") return;
      if (!remote || remote.commit !== current.commit || remote.blobSha !== current.blobSha) throw new ApiError(422, "invalid_source", "");
      const adopt = (keepLocal: boolean): void => {
        if (!alive() || !owner.adopt(remote, keepLocal)) return;
        draft = owner.draft; el.replaceChildren(); paintScreen(el, ctx, rest, api, []);
      };
      compareBox.replaceChildren(
        compareDish(draftToDish(d), lang === 'zh' ? '本地修改' : lang === 'en' ? 'Local changes' : 'Локальні зміни'),
        compareDish(remote.content, lang === 'zh' ? '远端内容' : lang === 'en' ? 'Remote content' : 'Віддалені дані'),
        button({ label: statusText("local", lang), onClick: () => adopt(true) }),
        button({ label: statusText("remote", lang), onClick: () => adopt(false) }),
      );
    } catch (err) { if (alive()) compareBox.replaceChildren(errorCard(apiMessage(err, lang))); }
  }
  syncNet();
  const unsubscribeState = owner.session.subscribe(() => {
    if (auth !== teamApi.sessionKey() && el.isConnected) { el.replaceChildren(); sessionExpired(el, lang); return; }
    syncStatus();
  });
  const unsubscribeAuxiliary = owner.subscribe(contentChanged => {
    if (!alive()) return;
    if (contentChanged) {
      paintPhoto(); paintComponents(); paintSteps(); paintReadiness();
      for (const sync of triViews) sync();
      // Retained translation callbacks may have updated the original view's slug.
      // Show the owned target and recompute this view's local duplicate guard too.
      idInput.value = d.id;
      refreshDup();
    }
    syncStatus();
  });
  window.addEventListener("online", syncNet);
  window.addEventListener("offline", syncNet);
  disposePaint = () => {
    unsubscribeState();
    unsubscribeAuxiliary();
    window.removeEventListener("online", syncNet);
    window.removeEventListener("offline", syncNet);
  };

  // Dual-format catalog supplies ingredient search and technique choices.
  void teamApi
    .getCatalog()
    .then((c) => {
      if (!alive()) return;
      catalog = c;
      refreshDup();
      paintComponents();
      paintSteps();
      paintReadiness();
    })
    .catch(() => {
      if (!alive()) return;
      catalogFailed = true;
      paintComponents();
      paintSteps();
    });
  // ---- 保存 ------------------------------------------------------------------------
  /** Blank optional quantities are valid; reject invalid entered numbers and incomplete form controls. */
  function localErrors(): FieldError[] {
    const errs: FieldError[] = [];
    if (!d.blobSha) {
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
      if (!c.toTaste && c.qty.trim() && !(num(c.qty) > 0)) errs.push({ path: `${P}/qty/value`, code: "required", message: L("dish.qty.required") });
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

  async function save(mode: "draft" | "active"): Promise<void> {
    if (owner.busy || owner.auxiliaryUnknown || !alive() || teamApi.mode === "unconfigured" || owner.session.getState().operationId) return;
    if (!navigator.onLine) { syncNet(); return; }
    clearFieldErrors(formEl); clearTransient();
    const local = localErrors();
    if (d.baseServings.trim() && (!Number.isInteger(num(d.baseServings)) || num(d.baseServings) < 1)) local.push({ path: "/baseServings", code: "minimum", message: L("dish.qty.required") });
    if (local.length) { showErrors(local); return; }
    try {
      await owner.save(mode, api);
      if (!alive()) return;
      const state = owner.session.getState();
      if (state.error?.errors.some(error => error.path)) showErrors(state.error.errors.filter(error => error.path));
      // Retain the form, including any later edits. Publication remains a separate action.
    } catch (err) {
      if (alive()) addTransient(errorCard(apiMessage(err, lang)));
    } finally { if (alive()) syncNet(); }
  }
}
