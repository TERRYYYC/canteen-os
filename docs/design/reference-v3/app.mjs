import {
  L,
  ingredients,
  dishes,
  initialPlan,
  procurement,
  readDraft,
} from "./model.mjs";
const state = {
  lang: "zh",
  route: "home",
  view: "app",
  dish: "kyiv",
  category: "all",
  kb: "dishes",
  query: "",
  period: "day",
  planPeriod: "day",
  date: "2026-09-10",
  meal: "lunch",
  plan: initialPlan(),
  rating: 0,
  tags: [],
  feedback: [],
  source: "customer",
  comment: "",
  videoUrl: "",
  cart: [],
  ordered: false,
  importStage: 0,
  importKind: "video",
  draft: null,
  confirmed: false,
  reportPeriod: "week",
  detailTab: "about",
  cookTab: "recipe",
  checked: new Set(),
  favorites: new Set(),
};
const t = (x) =>
  typeof x === "string" ? x : x?.[state.lang] || x?.zh || x?.en || x?.uk || "";
const u = (zh, en, uk) => t(L(zh, en, uk));
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name, cls = "") =>
  `<i class="${name.endsWith("-fill") ? "ph-fill" : "ph"} ph-${name.replace(/-fill$/, "")} ${cls}" aria-hidden="true"></i>`;
const txt = (x) => esc(t(x));
const componentQuantity = (c, base = 1) =>
  c.qty.unit === "to-taste"
    ? u("适量", "To taste", "За смаком")
    : esc(Number((c.qty.value / base).toFixed(2))) + " " + esc(c.qty.unit);
const dish = () => dishes.find((d) => d.id === state.dish) || dishes[0];
const titles = {
  home: L("今日食堂", "Home", "Сьогодні"),
  menu: L("菜单", "Menu", "Меню"),
  detail: L("菜品详情", "Dish detail", "Про страву"),
  cook: L("烹饪指南", "How to cook", "Як приготувати"),
  feedback: L("用餐反馈", "Feedback", "Відгук"),
  knowledge: L("菜品知识库", "Dish knowledge", "База страв"),
  import: L("视频导入", "AI video import", "Імпорт відео"),
  plan: L("菜单计划", "Menu plan", "План меню"),
  purchase: L("采购清单", "Purchase list", "Закупівлі"),
  report: L("运营报告", "Kitchen report", "Звіт кухні"),
};
const routeIcons = {
  home: "house",
  menu: "calendar-blank",
  detail: "bowl-food",
  cook: "chef-hat",
  feedback: "star",
  knowledge: "books",
  import: "video-camera",
  plan: "calendar-dots",
  purchase: "shopping-cart",
  report: "chart-bar",
};
const dates = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
];
const categoryNames = {
  all: L("全部", "All", "Усі"),
  main: L("主菜", "Main", "Основні"),
  vegetarian: L("素食", "Vegetarian", "Овочеві"),
  soup: L("汤品", "Soup", "Супи"),
};
const tagNames = [
  L("味道很棒", "Delicious", "Смачно"),
  L("清爽健康", "Feels healthy", "Легка страва"),
  L("份量正好", "Portion OK", "Порція добра"),
  L("有点咸", "Too salty", "Засолоно"),
  L("有点油", "Too oily", "Зажирно"),
  L("其他建议", "Other", "Інше"),
];
const navBtn = (route, label, cls = "") =>
  `<button class="${cls}" data-go="${route}">${esc(label)}</button>`;
function status() {
  return `<div class="statusbar"><b>9:41</b><span>${icon("cell-signal-full")}${icon("wifi-high")}${icon("battery-full")}</span></div>`;
}
function head(route) {
  return `<header class="app-head">${route === "home" ? `<div class="brand-in">${icon("plant")}<span><b>CanteenOS</b><small>Good Food. Better People.</small></span></div>` : `<button class="icon-btn" data-go="${["detail", "cook", "feedback"].includes(route) ? "menu" : "home"}" aria-label="${u("返回", "Back", "Назад")}">${icon("arrow-left")}</button><b>${txt(titles[route])}</b>`}<select class="language" data-language aria-label="${u("语言", "Language", "Мова")}"><option value="zh" ${state.lang === "zh" ? "selected" : ""}>中文</option><option value="en" ${state.lang === "en" ? "selected" : ""}>EN</option><option value="uk" ${state.lang === "uk" ? "selected" : ""}>УКР</option></select></header>`;
}
function bottom(route) {
  return `<nav class="bottom-nav" aria-label="${u("主导航", "Main navigation", "Основна навігація")}">${["home", "menu", "knowledge", "plan"].map((r) => `<button class="${r === route ? "active" : ""}" data-go="${r}">${icon(routeIcons[r])}<span>${txt(titles[r])}</span></button>`).join("")}</nav>`;
}
function badge(label, cls = "") {
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
function stars(n = 5, interactive = false) {
  return `<div class="stars ${interactive ? "interactive" : ""}">${[1, 2, 3, 4, 5].map((v) => (interactive ? `<button type="button" data-rate="${v}" aria-label="${v} ${u("星", "stars", "зірок")}" aria-pressed="${state.rating === v}">${icon(v <= n ? "star-fill" : "star", v <= n ? "filled" : "")}</button>` : icon(v <= Math.round(n) ? "star-fill" : "star", v <= Math.round(n) ? "filled" : ""))).join("")}</div>`;
}
function section(title, action = "", route = "") {
  return `<div class="section-title"><h3>${esc(title)}</h3>${action ? navBtn(route, action + " ›", "text-btn") : ""}</div>`;
}
function row(d, action = "detail") {
  return `<button class="dish-row" data-dish="${d.id}" data-target="${action}"><img src="${d.image}" alt="${txt(d.name)}"><span class="row-main"><strong>${txt(d.name)}</strong><span>${badge(t(categoryNames[d.category] || categoryNames.main))}${d.draft ? badge(u("待复核", "Draft", "Чернетка"), "amber") : badge(d.id === "kyiv" ? u("人气之选", "Popular", "Популярне") : d.time + " " + u("分钟", "min", "хв"), "quiet")}</span></span>${icon("caret-right")}</button>`;
}
function foodCard(d) {
  return `<button class="food-card" data-dish="${d.id}" data-target="detail"><img src="${d.image}" alt="${txt(d.name)}"><span class="food-caption"><strong>${txt(d.name)}</strong><span>${badge(t(categoryNames[d.category]))}<small>${icon("star-fill")} ${d.rating}</small></span></span></button>`;
}
function period(type = "period") {
  const p = state[type];
  return `<div class="segmented">${[
    ["day", u("每日", "Daily", "День")],
    ["week", u("每周", "Weekly", "Тиждень")],
    ["month", u("每月", "Monthly", "Місяць")],
  ]
    .map(
      ([v, l]) =>
        `<button data-period="${v}" data-kind="${type}" aria-pressed="${p === v}">${l}</button>`,
    )
    .join("")}</div>`;
}
function dateBar() {
  return `<div class="date-bar">${dates.map((v, i) => `<button data-date="${v}" class="${state.date === v ? "active" : ""}"><span>${u(["周一", "周二", "周三", "周四", "周五"][i], ["Mon", "Tue", "Wed", "Thu", "Fri"][i], ["Пн", "Вт", "Ср", "Чт", "Пт"][i])}</span><b>${7 + i}</b></button>`).join("")}</div>`;
}
function mealTabs() {
  return `<div class="chips meal-chips">${["lunch", "dinner"].map((x) => `<button data-meal="${x}" class="${state.meal === x ? "selected" : ""}">${x === "lunch" ? u("午餐", "Lunch", "Обід") : u("晚餐", "Dinner", "Вечеря")}<small>${x === "lunch" ? "12:00–14:00" : "18:00–19:30"}</small></button>`).join("")}</div>`;
}
function filters() {
  return `<div class="chips filters">${Object.entries(categoryNames)
    .map(
      ([key, val]) =>
        `<button data-category="${key}" class="${state.category === key ? "selected" : ""}">${txt(val)}</button>`,
    )
    .join("")}</div>`;
}
function home() {
  return `<div class="home-hero"><img src="assets/chicken-kyiv.jpg" alt="${txt(dishes[0].name)}"><div class="hero-copy"><span>${u("每一餐，都用心", "MADE WITH CARE", "ПРИГОТОВЛЕНО З ТУРБОТОЮ")}</span><h1>${u("好好吃饭，<br>好好生活。", "Good Food.<br>Brighter People.", "Добра їжа.<br>Кращий день.")}</h1><p>${u("健康 · 美味 · 可持续", "Healthy · Tasty · Sustainable", "Корисно · Смачно · Стало")}</p></div><button class="hero-link" data-dish="kyiv" data-target="detail" aria-label="${u("查看菜品", "View dish", "Переглянути страву")}">${icon("arrow-up-right")}</button></div>
 <div class="shortcuts">${[
   ["menu", "calendar-check", u("看菜单", "Menu", "Меню"), "green"],
   ["order", "shopping-cart", u("点餐", "Order", "Замовити"), "orange"],
   ["knowledge", "book-open", u("知识库", "Knowledge", "База страв"), "blue"],
   ["report", "dots-three", u("报告", "Reports", "Звіти"), "gray"],
 ]
   .map(
     ([a, i, l, c]) =>
       `<button ${a === "order" ? 'data-action="order-start"' : `data-go="${a}"`}><span class="shortcut-icon ${c}">${icon(i)}</span><b>${l}</b></button>`,
   )
   .join("")}</div>
 <div class="service-note">${icon("sun")}<span>${u("周四午餐", "Thursday lunch", "Обід у четвер")}<b>12:00–14:00</b></span>${badge(u("供应中", "Serving now", "Подаємо"))}</div>
 ${section(u("今日精选", "Today’s highlights", "Сьогодні в меню"), u("全部", "See all", "Усе"), "menu")}<div class="food-grid">${dishes.slice(0, 2).map(foodCard).join("")}</div>
 <button class="invitation" data-go="feedback">${icon("chat-circle-text")}<span><b>${u("这一餐，吃得怎么样？", "How was your meal?", "Як вам сьогоднішня страва?")}</b><small>${u("你的反馈，让下次更好", "A little feedback makes a better next meal.", "Ваш відгук допоможе нам стати кращими.")}</small></span>${icon("arrow-right")}</button>`;
}
function menu() {
  let list = state.plan.filter(
    (p) => p.date === state.date && p.meal === state.meal && p.servings > 0,
  );
  let ids = [...new Set(list.map((p) => p.dishRef))];
  let visible = dishes.filter(
    (d) =>
      ids.includes(d.id) &&
      (state.category === "all" || state.category === d.category),
  );
  return `${period()}${state.period === "day" ? `${dateBar()}${mealTabs()}${filters()}<div class="dish-list">${visible.length ? visible.map((d) => row(d)).join("") : `<div class="empty">${icon("calendar-blank")}<b>${u("这餐还未安排菜品", "No dishes planned for this meal", "Цей прийом їжі ще не заплановано")}</b><span>${u("试试 9 月 10 日的午餐", "Try lunch on September 10", "Спробуйте обід 10 вересня")}</span></div>`}</div>` : menuOverview()}
 <div class="soft-note">${icon("info")} ${u("含演示菜单；过敏原与供应情况请向食堂确认。", "Demo menu. Confirm allergens and availability with the kitchen.", "Демонстраційне меню. Уточніть алергени та наявність на кухні.")}</div>
 ${state.cart.length ? `<button class="primary sticky-action" data-action="order-confirm">${icon("shopping-cart")} ${u("确认点餐", "Confirm order", "Підтвердити замовлення")} · ${state.cart.length}</button>` : ""}${state.ordered ? `<div class="success-note">${icon("check-circle")} ${u("演示订单已确认 · 到窗口取餐", "Demo order confirmed · Collect at the counter", "Демо-замовлення підтверджено · Заберіть на видачі")}</div>` : ""}`;
}
function menuOverview() {
  return `<div class="overview-label">${state.period === "week" ? u("9 月 7 日 — 13 日", "September 7–13", "7–13 вересня") : u("2026 年 9 月", "September 2026", "Вересень 2026")}</div>${[
    ...new Set(state.plan.filter((p) => p.servings > 0).map((p) => p.date)),
  ]
    .sort()
    .map(
      (date) =>
        `<button class="day-summary" data-date="${date}" data-action="open-day"><b>${date.slice(5).replace("-", " / ")}</b><span>${[...new Set(state.plan.filter((x) => x.date === date && x.servings > 0).map((x) => t(dishes.find((d) => d.id === x.dishRef)?.name)))].join(" · ")}</span>${icon("caret-right")}</button>`,
    )
    .join(
      "",
    )}<p class="soft-note">${u("其他日期尚未发布菜单", "Menus for other dates have not been published.", "Меню на інші дати ще не опубліковано.")}</p>`;
}
function detail() {
  const d = dish();
  return `<div class="detail-photo"><img src="${d.image}" alt="${txt(d.name)}"><button class="favorite icon-btn ${state.favorites.has(d.id) ? "on" : ""}" data-action="favorite" aria-label="${u("收藏", "Favorite", "Обране")}" aria-pressed="${state.favorites.has(d.id)}">${icon(state.favorites.has(d.id) ? "heart-fill" : "heart")}</button></div><div class="dish-title"><h2>${txt(d.name)}</h2><p class="subname">${esc(state.lang === "en" ? d.name.uk : d.name.en)}</p><div>${badge(t(categoryNames[d.category]))}${badge(t(d.region), "quiet")}${d.draft ? badge(u("待复核", "Draft", "Чернетка"), "amber") : badge(u("人气之选", "Popular", "Популярне"))}</div></div>
 <div class="underline-tabs">${[
   ["about", u("介绍", "About", "Про страву")],
   ["ingredients", u("食材", "Ingredients", "Інгредієнти")],
   ["nutrition", u("营养", "Nutrition", "Поживність")],
 ]
   .map(
     ([v, l]) =>
       `<button data-detail-tab="${v}" class="${state.detailTab === v ? "on" : ""}">${l}</button>`,
   )
   .join("")}</div>
 ${state.detailTab === "about" ? `<p class="description">${txt(d.description)}</p><div class="allergens">${icon("warning-circle")} ${txt(d.allergens)}</div>` : state.detailTab === "ingredients" ? `<div class="ingredients-list">${d.components.map((c) => `<div><span>${txt(ingredients[c.ingredientRef]?.name || L(c.ingredientRef, c.ingredientRef, c.ingredientRef))}</span><b>${componentQuantity(c, Number(d.baseServings) || 1)}</b></div>`).join("")}</div><p class="soft-note">${u("每 1 份基准用量；采购量含损耗与备量。", "Base quantities per serving; purchasing includes yield and buffer.", "Базові кількості на порцію; закупівлі враховують вихід і запас.")}</p>` : `<div class="empty compact">${icon("leaf")}<b>${u("营养数据待核算", "Nutrition data pending", "Поживність ще не розраховано")}</b><span>${u("确认配方后，由营养师复核", "To be reviewed after the recipe is confirmed", "Буде перевірено після затвердження рецепта")}</span></div>`}
 <button class="outline wide" data-go="cook">${icon("chef-hat")} ${u("查看做法", "How to cook", "Як приготувати")}<span>${d.time || "—"} ${u("分钟", "min", "хв")}</span></button>
 <div class="rating-block"><b>${u("这道菜，你喜欢吗？", "Rate this dish", "Оцініть страву")}</b><button class="rating-link" data-go="feedback">${stars(d.rating)}<span><b>${d.rating || "—"}</b> (${d.reviews} ${u("条评价", "reviews", "відгуків")})</span></button></div>
 <button class="primary wide" data-action="add-order" ${d.draft ? "disabled" : ""}>${icon("plus")} ${u("加入点餐", "Add to my order", "Додати до замовлення")}</button>`;
}
function cook() {
  const d = dish();
  return `<h2 class="cook-name">${txt(d.name)}</h2><div class="underline-tabs"><button data-cook-tab="recipe" class="${state.cookTab === "recipe" ? "on" : ""}">${u("图文步骤", "Recipe", "Рецепт")}</button><button data-cook-tab="video" class="${state.cookTab === "video" ? "on" : ""}">${u("视频来源", "Video", "Відео")}</button></div>${state.cookTab === "video" ? `<div class="video-still"><img src="${d.image}" alt="${txt(d.name)}">${icon("play-circle")}</div><div class="soft-note">${u("本原型暂不播放视频。标准文件的原始来源与时间点会随导入文档保留，当前仅预览图文。", "This prototype does not play video. Source metadata and timestamps remain in the imported document; only recipe text is previewed.", "Прототип не відтворює відео. Джерела й часові мітки зберігаються в імпортованому документі; показано лише текст рецепта.")}</div>${navBtn("import", u("从视频导入菜品", "Import from a video", "Імпортувати з відео"), "outline wide")}` : `<div class="cook-metrics"><div>${icon("timer")}<b>20 ${u("分钟", "min", "хв")}</b><small>${u("准备", "Prep time", "Підготовка")}</small></div><div>${icon("cooking-pot")}<b>${Math.max(0, d.time - 20)} ${u("分钟", "min", "хв")}</b><small>${u("烹饪", "Cook time", "Готування")}</small></div><div>${icon("chef-hat")}<b>${u("中等", "Medium", "Середньо")}</b><small>${u("难度", "Difficulty", "Складність")}</small></div></div><details class="recipe-ingredients"><summary>${u("食材", "Ingredients", "Інгредієнти")} <span>(${u("每份", "per serving", "на порцію")})</span></summary><div class="ingredients-list">${d.components.map((c) => `<div><span>${txt(ingredients[c.ingredientRef]?.name || c.ingredientRef)}</span><b>${componentQuantity(c, Number(d.baseServings) || 1)}</b></div>`).join("")}</div></details>${section(u("烹饪步骤", "Cooking steps", "Кроки приготування"))}<div class="cooking-steps">${d.steps.length ? d.steps.map((s, i) => `<label class="cooking-step ${state.checked.has(d.id + i) ? "done" : ""}"><input type="checkbox" data-step="${d.id + i}" ${state.checked.has(d.id + i) ? "checked" : ""}><span class="step-num">${i + 1}</span><span><b>${u("步骤", "Step", "Крок")} ${i + 1}</b><span>${txt(s)}</span></span></label>`).join("") : `<p class="soft-note">${u("步骤待厨师补全", "Steps need a chef’s review", "Кроки має доповнити кухар")}</p>`}</div><div class="soft-note">${icon("check-square")} ${u("点击步骤可标记完成，仅保留在本次体验中。", "Tap a step to mark it complete in this demo session.", "Позначайте виконані кроки в цьому демо-сеансі.")}</div>`}`;
}
function feedback() {
  const d = dish();
  return `<div class="feedback-dish"><img src="${d.image}" alt="${txt(d.name)}"><span><b>${txt(d.name)}</b><small>${u("这一餐，吃得怎么样？", "How was your meal?", "Як вам страва?")}</small></span></div><form id="feedback-form"><div class="feedback-stars">${stars(state.rating, true)}<small>${state.rating ? state.rating + "/5" : u("点亮星星，告诉我们", "Tap a star to rate", "Натисніть на зірку")}</small></div><div class="feedback-tags">${tagNames.map((v, i) => `<button type="button" data-tag="${i}" class="${state.tags.includes(i) ? "on" : ""}" aria-pressed="${state.tags.includes(i)}">${icon(["smiley", "leaf", "bowl-food", "flask", "drop", "dots-three"][i])}<span>${txt(v)}</span></button>`).join("")}</div><label class="field"><span>${u("反馈身份", "Your perspective", "Ваша роль")}</span><select name="source" data-source>${[
    ["customer", u("顾客", "Customer", "Відвідувач")],
    ["chef", u("厨师", "Chef", "Кухар")],
    ["buyer", u("采购员", "Purchaser", "Закупівельник")],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}" ${v === state.source ? "selected" : ""}>${l}</option>`,
    )
    .join(
      "",
    )}</select></label><textarea name="comment" data-comment maxlength="500" placeholder="${u("还有什么想告诉我们？（选填）", "Share your thoughts (optional)…", "Ваші думки (необов’язково)…")}">${esc(state.comment)}</textarea><button class="primary wide" type="submit" ${!state.rating ? "disabled" : ""}>${u("提交反馈", "Submit feedback", "Надіслати відгук")}</button><p class="soft-note">${u("匿名体验 · 反馈仅在本次演示中保存", "Anonymous demo · Feedback stays in this session", "Анонімне демо · Відгук зберігається лише в цьому сеансі")}</p></form>`;
}
function knowledge() {
  const arr = dishes.filter(
    (d) =>
      (state.category === "all" || d.category === state.category) &&
      Object.values(d.name).some((v) =>
        v.toLowerCase().includes(state.query.toLowerCase()),
      ),
  );
  return `<p class="page-lede">${u("让每一道好菜，都成为可复用的经验。", "Good recipes become shared kitchen knowledge.", "Хороші рецепти стають спільним досвідом кухні.")}</p><label class="searchbox">${icon("magnifying-glass")}<input data-search value="${esc(state.query)}" placeholder="${u("搜索菜品、食材或调料…", "Search dishes or ingredients…", "Пошук страв та інгредієнтів…")}" aria-label="${u("搜索知识库", "Search knowledge base", "Пошук у базі")}"></label><div class="underline-tabs">${[
    ["dishes", u("菜品", "Dishes", "Страви")],
    ["ingredients", u("食材", "Ingredients", "Інгредієнти")],
    ["seasoning", u("调料", "Seasonings", "Приправи")],
  ]
    .map(
      ([v, l]) =>
        `<button data-kb="${v}" class="${state.kb === v ? "on" : ""}">${l}</button>`,
    )
    .join("")}</div>${
    state.kb === "dishes"
      ? `${filters()}<div class="small-label">${arr.length} ${u("道菜品 · 中 / EN / УКР", "dishes · 中文 / EN / УКР", "страви · 中文 / EN / УКР")}</div><div class="dish-list">${arr.map((d) => row(d)).join("") || `<p class="empty">${u("没有匹配菜品", "No dishes found", "Страв не знайдено")}</p>`}</div>`
      : `<div class="stock-list">${Object.values(ingredients)
          .filter(
            (i) =>
              (state.kb === "seasoning"
                ? i.role === "seasoning"
                : i.role === "main") &&
              Object.values(i.name).some((v) =>
                v.toLowerCase().includes(state.query.toLowerCase()),
              ),
          )
          .map(
            (i) =>
              `<details class="stock-item"><summary><span class="ingredient-icon">${icon(i.role === "seasoning" ? "jar" : "carrot")}</span><span><b>${txt(i.name)}</b><small>${esc(i.name.en)} · ${i.purchase.packSize / 1000} ${i.baseUnit === "ml" ? "L" : "kg"}</small></span>${icon("caret-down")}</summary><div class="stock-detail"><p>${u("供应商", "Supplier", "Постачальник")}: ${i.purchase.supplier}</p><p>${u("净料率", "Usable yield", "Корисний вихід")}: ${Math.round(i.yield * 100)}%</p><p>${u("现有量", "On hand", "У наявності")}: ${i.trackStock ? i.onHand / 1000 + " " + (i.baseUnit === "ml" ? "L" : "kg") : u("鲜料按需采购", "Buy fresh as needed", "Купувати свіжим за потребою")}</p>${badge("中文 / English / Українська")}</div></details>`,
          )
          .join("")}</div>`
  }<button class="import-banner" data-go="import">${icon("video-camera")}<span><b>${u("把做菜视频，变成厨房知识", "Turn a video into kitchen knowledge", "Перетворіть відео на рецепт")}</b><small>${u("解析 · 复核 · 入库", "Import · Review · Save", "Імпорт · Перевірка · Збереження")}</small></span>${icon("arrow-up-right")}</button>`;
}
function importer() {
  return `<div class="flow-steps">${[u("导入", "Import", "Імпорт"), u("复核", "Review", "Перевірка"), u("入库", "Save", "Збереження")].map((x, i) => `<span class="${state.importStage >= i ? "active" : ""}"><b>${i + 1}</b>${x}</span>`).join("")}</div>${state.importStage === 0 ? `<div class="import-intro">${icon("video-camera")}<h2>${u("好菜，从一个视频开始", "Great food starts with a video", "Хороша страва починається з відео")}</h2><p>${u("把食材、用量和做法，整理成三语菜谱。", "Bring ingredients, quantities and cooking steps into a trilingual recipe.", "Зберіть інгредієнти, кількості та кроки в тримовний рецепт.")}</p></div><div class="segmented"><button data-import-kind="video" aria-pressed="${state.importKind === "video"}">${u("视频链接", "Video link", "Посилання")}</button><button data-import-kind="file" aria-pressed="${state.importKind === "file"}">${u("标准文件", "Recipe file", "Файл рецепта")}</button></div>${state.importKind === "video" ? `<label class="field"><span>${u("粘贴做菜视频链接", "Cooking video URL", "Посилання на кулінарне відео")}</span><input id="video-url" type="url" value="${esc(state.videoUrl)}" placeholder="https://…"></label><div class="notice">${icon("info")}<span>${u("本原型展示解析流程。点击后加载示例结果，视频不会被上传或分析。", "This prototype loads a sample extraction. Your video is not uploaded or analyzed.", "Прототип завантажує приклад результату. Відео не надсилається й не аналізується.")}</span></div><button class="primary wide" data-action="demo-import">${icon("sparkle")} ${u("体验示例解析", "Try sample extraction", "Спробувати приклад")}</button>` : `<label class="upload-zone">${icon("file-arrow-up")}<b>${u("选择菜品 JSON 文件", "Choose a dish JSON file", "Виберіть JSON-файл страви")}</b><span>${u("兼容 schemaVersion 2 · 预览后再入库", "schemaVersion 2 · Preview before saving", "schemaVersion 2 · Перегляд перед збереженням")}</span><input type="file" accept=".json,application/json" data-import-file></label><p class="soft-note">${u("可接收外部 skill 的输出。本地仅预检结构；正式导入须通过仓库 schema 校验。", "Accepts external skill output. This demo only prechecks structure; repository schema validation is required for production.", "Приймає результат зовнішнього skill. Демо перевіряє лише структуру; для робочого імпорту потрібна валідація схеми.")}</p>`}${section(u("你将得到", "What you’ll get", "Ви отримаєте"))}<div class="benefits">${[u("食材与调料清单", "Ingredients & seasonings", "Інгредієнти та приправи"), u("可追溯的烹饪步骤", "Traceable cooking steps", "Кроки з посиланнями"), u("中文、英文、乌克兰语", "Chinese, English & Ukrainian", "Китайська, англійська та українська"), u("采购前的待确认项", "Checks before purchasing", "Перевірки перед закупівлею")].map((s) => `<div>${icon("check-circle")}${s}</div>`).join("")}</div>` : state.importStage === 1 ? reviewImport() : `<div class="import-success">${icon("check-circle")}<h2>${u("已加入演示知识库", "Saved to the demo library", "Збережено в демо-базі")}</h2><p>${u("菜品仍为待复核草稿。补齐用量、食材映射与采购规格后，才能加入正式菜单。", "The dish remains a draft. Confirm quantities, ingredient mappings and purchase specs before scheduling it.", "Страва залишається чернеткою. Перевірте кількості, інгредієнти й закупівельні одиниці перед плануванням.")}</p><button class="primary wide" data-go="knowledge">${u("查看知识库", "Open knowledge base", "Відкрити базу страв")}</button><button class="outline wide" data-action="reset-import">${u("继续导入", "Import another", "Імпортувати ще")}</button></div>`}`;
}
function reviewImport() {
  const d = state.draft || dishes[0];
  return `<div class="feedback-dish"><img src="${d.image}" alt="${txt(d.name)}"><span><b>${txt(d.name)}</b><small>${u("解析草稿 · 尚未入库", "Extracted draft · Not saved yet", "Чернетка · Ще не збережено")}</small></span></div><div class="notice amber">${icon("warning-circle")}<span>${u("请确认基础份数、食材用量和采购规格。AI 估计值不能直接下单。", "Confirm servings, quantities and purchase specs. AI estimates cannot be ordered directly.", "Перевірте порції, кількості й закупівельні одиниці. Оцінки ШІ не є готовим замовленням.")}</span></div><label class="field"><span>${u("配方基础份数", "Recipe base servings", "Базова кількість порцій")}</span><input type="number" id="base-servings" min="1" max="10000" value="${d.baseServings || 1}"></label><div class="review-languages">${["zh", "en", "uk"].map((l) => `<div><span>${{ zh: "中文", en: "EN", uk: "УКР" }[l]}</span><b>${esc(d.name[l] || u("待翻译", "Translation needed", "Потрібен переклад"))}</b>${icon(d.name[l] ? "check" : "warning-circle")}</div>`).join("")}</div>${section(u("食材核对", "Ingredient review", "Перевірка інгредієнтів"))}<div class="ingredients-list">${d.components.map((c) => `<div><span>${txt(ingredients[c.ingredientRef]?.name || c.ingredientRef)}</span><b>${componentQuantity(c)}</b>${badge(ingredients[c.ingredientRef] ? u("已匹配", "Matched", "Зіставлено") : u("待匹配", "Unmatched", "Не зіставлено"), ingredients[c.ingredientRef] ? "" : "amber")}</div>`).join("") || `<p>${u("缺少配料，保存后需补全", "Missing ingredients; complete after saving", "Інгредієнти відсутні; доповніть після збереження")}</p>`}</div><label class="confirm-check"><input type="checkbox" data-confirm-review ${state.confirmed ? "checked" : ""}><span>${u("我知道这是待复核草稿，尚不能用于采购", "I understand this is a draft, not ready for procurement", "Я розумію, що це чернетка, не готова до закупівлі")}</span></label><button class="primary wide" data-action="save-import" ${state.confirmed ? "" : "disabled"}>${u("保存为草稿", "Save as draft", "Зберегти чернетку")}</button>`;
}
function planRows() {
  let rows = state.plan
    .map((p, i) => ({ ...p, i }))
    .filter((p) => (state.planPeriod === "day" ? p.date === state.date : true));
  if (!rows.length)
    return `<div class="empty">${u("这一天还没有菜品", "No dishes planned yet", "Страви ще не заплановано")}</div>`;
  return rows
    .map((p) => {
      const d = dishes.find((d) => d.id === p.dishRef);
      return `<div class="plan-row"><img src="${d.image}" alt="${txt(d.name)}"><span><b>${txt(d.name)}</b><small>${p.date.slice(5)} · ${p.meal === "lunch" ? u("午餐", "Lunch", "Обід") : u("晚餐", "Dinner", "Вечеря")}</small></span><div class="stepper"><button data-adjust="-10" data-row="${p.i}" aria-label="${u("减少10份", "Decrease by 10", "Зменшити на 10")}">${icon("minus")}</button><b>${p.servings}</b><button data-adjust="10" data-row="${p.i}" aria-label="${u("增加10份", "Increase by 10", "Збільшити на 10")}">${icon("plus")}</button></div></div>`;
    })
    .join("");
}
function scopePlan() {
  return state.planPeriod === "day"
    ? state.plan.filter((p) => p.date === state.date)
    : state.plan;
}
function plan() {
  const servings = scopePlan().reduce((n, p) => n + p.servings, 0);
  return `${period("planPeriod")}${state.planPeriod === "day" ? dateBar() : `<div class="overview-label">${state.planPeriod === "week" ? u("9 月 7 日 — 13 日", "September 7–13", "7–13 вересня") : u("2026 年 9 月", "September 2026", "Вересень 2026")}</div>`}<div class="plan-summary"><div>${icon("calendar-dots")}<b>${u("备餐计划", "Kitchen plan", "План кухні")}</b></div><span><b>${servings}</b> ${u("菜品份数", "dish portions", "порцій страв")}</span></div><p class="small-label">${u("份数按每道菜计算，不等于用餐人数", "Portions per dish, not the number of diners", "Порції страв, не кількість відвідувачів")}</p><div class="plan-list">${planRows()}</div><div class="add-plan"><select id="plan-dish" aria-label="${u("选择菜品", "Choose dish", "Вибрати страву")}">${dishes
    .filter((d) => !d.draft)
    .map((d) => `<option value="${d.id}">${txt(d.name)}</option>`)
    .join(
      "",
    )}</select><button class="outline" data-action="plan-add">${icon("plus")} ${u("加菜", "Add", "Додати")}</button></div><div class="notice">${icon("arrows-clockwise")}<span>${u("改份数后，食材需求与采购预算会自动重算。", "Ingredient needs and purchasing estimates update with portions.", "Потреби й бюджет закупівель оновлюються разом із порціями.")}</span></div><button class="primary wide" data-go="purchase">${icon("shopping-cart")} ${u("生成采购清单", "Generate purchase list", "Сформувати закупівлі")}</button>`;
}
function formatQ(v, unit) {
  return unit === "g"
    ? (v / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " kg"
    : unit === "ml"
      ? (v / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
        " L"
      : v + " " + unit;
}
function purchase() {
  const result = procurement(scopePlan());
  const groups = [
    ...new Set(result.lines.map((l) => l.item.purchase.supplier)),
  ];
  return `<div class="purchase-intro"><span class="tiny-label">${u("来自菜单计划", "FROM YOUR MENU PLAN", "З ПЛАНУ МЕНЮ")}</span><h2>${u("买什么，一目了然。", "Everything your kitchen needs.", "Усе, що потрібно кухні.")}</h2><p>${state.planPeriod === "day" ? state.date : state.planPeriod === "week" ? u("9 月 7 日 — 13 日", "September 7–13", "7–13 вересня") : u("2026 年 9 月", "September 2026", "Вересень 2026")} · ${scopePlan().reduce((n, p) => n + p.servings, 0)} ${u("菜品份数", "dish portions", "порцій страв")}</p></div><div class="purchase-metrics"><div><small>${u("食材种类", "Ingredients", "Інгредієнтів")}</small><b>${result.lines.filter((l) => l.packs > 0).length}</b></div><div><small>${u("预计采购金额", "Estimated cost", "Орієнтовна сума")}</small><b>₴${result.total.toLocaleString()}</b></div></div><div class="small-label">${u("示例价格 · 含 10% 备量 · 按整包装采购", "Sample prices · 10% buffer · Whole packs", "Приклад цін · Запас 10% · Цілі упаковки")}</div>${groups
    .map(
      (g) =>
        `<section class="supplier"><h3>${icon("storefront")} ${g}</h3>${result.lines
          .filter((l) => l.item.purchase.supplier === g)
          .map(
            (l) =>
              `<details class="purchase-line"><summary><span><b>${txt(l.item.name)}</b><small>${l.packs ? l.packs + " × " + formatQ(l.item.purchase.packSize, l.item.baseUnit) : u("现有库存足够", "Covered by stock", "Запасу достатньо")}</small></span><strong>${formatQ(l.quantity, l.item.baseUnit)}</strong>${icon("caret-down")}</summary><div class="trace"><h4>${u("采购量怎么算？", "How is this calculated?", "Як це розраховано?")}</h4><div><span>${u("配方净用量", "Recipe need", "За рецептом")}</span><b>${formatQ(l.net, l.item.baseUnit)}</b></div><div><span>${u("可用比例", "Usable yield", "Корисний вихід")}</span><b>÷ ${l.yield * 100}%</b></div><div><span>${u("备量系数", "Buffer", "Запас")}</span><b>× ${l.margin}</b></div><div><span>${u("可用库存", "On hand", "У наявності")}</span><b>− ${formatQ(l.onHand, l.item.baseUnit)}</b></div><div><span>${u("需要补货", "To replenish", "Поповнити")}</span><b>${formatQ(l.need, l.item.baseUnit)}</b></div><div class="trace-total"><span>${u("整包采购", "Whole-pack purchase", "Цілими упаковками")}</span><b>${l.packs} × ${formatQ(l.item.purchase.packSize, l.item.baseUnit)}</b></div><small>${u("来源", "Source", "Джерело")}: ${l.from.map((f) => txt(dishes.find((d) => d.id === f.dishRef)?.name) + " × " + f.servings).join(" + ")}</small></div></details>`,
          )
          .join("")}</section>`,
    )
    .join(
      "",
    )}${result.pending.length ? `<div class="notice amber">${result.pending.length} ${u("项待补全，不计入采购金额", "items unresolved; excluded from total", "позицій потребують уточнення; не включено в суму")}</div>` : ""}<button class="primary wide" data-action="copy-purchase">${icon("copy")} ${u("复制采购清单", "Copy purchase list", "Копіювати список")}</button><button class="outline wide" data-action="download-csv">${icon("download-simple")} ${u("导出 CSV", "Export CSV", "Експортувати CSV")}</button><div id="copy-fallback"></div>`;
}
function report() {
  const added = state.feedback.filter((f) => f.source === "customer"),
    baseCount = state.reportPeriod === "week" ? 204 : 816,
    baseRating = state.reportPeriod === "week" ? 4.7 : 4.6;
  const avg = (
    (baseCount * baseRating + added.reduce((a, b) => a + b.rating, 0)) /
    (baseCount + added.length)
  ).toFixed(1);
  return `<div class="segmented"><button data-report="week" aria-pressed="${state.reportPeriod === "week"}">${u("每周", "Weekly", "Тиждень")}</button><button data-report="month" aria-pressed="${state.reportPeriod === "month"}">${u("每月", "Monthly", "Місяць")}</button></div><div class="overview-label">${state.reportPeriod === "week" ? u("9 月 7 日 — 13 日", "September 7–13", "7–13 вересня") : u("2026 年 9 月", "September 2026", "Вересень 2026")}</div><div class="report-grid"><div class="report-metric">${icon("star")}<small>${u("顾客平均评分", "Average rating", "Середня оцінка")}</small><b>${avg}<em>/ 5</em></b><span>n = ${baseCount + added.length}</span></div><div class="report-metric">${icon("bowl-food")}<small>${u("最受欢迎", "Most loved", "Улюблена страва")}</small><img src="assets/chicken-kyiv.jpg" alt="${txt(dishes[0].name)}"><strong>${txt(dishes[0].name)}</strong></div></div>${section(u("每一餐，听见更多声音", "Every meal tells a story", "Кожна страва має відгук"))}<div class="feedback-bars">${[u("口味满意", "Taste satisfaction", "Задоволені смаком"), u("份量合适", "Portion satisfaction", "Задоволені порцією"), u("出餐及时", "Served on time", "Подано вчасно")].map((x, i) => `<div><span>${x}<b>${[88, 82, 94][i]}%</b></span><meter min="0" max="100" value="${[88, 82, 94][i]}">${[88, 82, 94][i]}%</meter></div>`).join("")}</div><div class="notice">${icon("leaf")}<span>${u("下周可以试试：保留基辅鸡肉卷，增加一道清淡蔬菜。", "Next week: keep Chicken Kyiv and add another light vegetable dish.", "Наступного тижня: залиште котлету по-київськи й додайте легку овочеву страву.")}</span></div><div class="sources"><b>${u("多方反馈", "Team perspectives", "Відгуки команди")}</b><span>${u("顾客", "Customers", "Відвідувачі")} ${baseCount + added.length} · ${u("厨师", "Chefs", "Кухарі")} ${3 + state.feedback.filter((f) => f.source === "chef").length} · ${u("采购", "Buyers", "Закупівельники")} ${2 + state.feedback.filter((f) => f.source === "buyer").length}</span></div><p class="soft-note">${u("运营指标为示例；新反馈计入本次演示。满意度按有效问卷统计，与菜品星级分开。", "Operational metrics are sample data; new feedback is session-only. Survey satisfaction and dish stars are separate measures.", "Операційні показники демонстраційні; нові відгуки діють у межах сеансу. Задоволеність і зіркові оцінки — різні показники.")}</p><button class="outline wide" data-action="download-report">${icon("download-simple")} ${u("导出报告", "Export report", "Експортувати звіт")}</button>`;
}
const screens = {
  home,
  menu,
  detail,
  cook,
  feedback,
  knowledge,
  import: importer,
  plan,
  purchase,
  report,
};
function phone(route) {
  return `<div class="phone"><div class="phone-screen">${status()}${head(route)}<main class="screen-content ${route}" data-screen="${route}">${screens[route]()}</main>${bottom(route)}<div class="home-indicator"></div></div></div>`;
}
function render() {
  const scrolls = new Map(
    [...document.querySelectorAll("[data-screen]")].map((e) => [
      e.dataset.screen,
      e.scrollTop,
    ]),
  );
  document.documentElement.lang = state.lang;
  document.title = `CanteenOS · ${t(titles[state.route])}`;
  const routes = Object.keys(titles);
  document.getElementById("app").innerHTML =
    `<header class="studio-header"><a class="studio-brand" href="#home">${icon("plant")}<b>CanteenOS</b><span>${u("产品体验设计", "PRODUCT EXPERIENCE", "ДИЗАЙН ПРОДУКТУ")}</span></a><div class="studio-actions"><span class="prototype-label">${u("高保真原型 · 演示数据", "HI-FI PROTOTYPE · DEMO DATA", "ПРОТОТИП · ДЕМО-ДАНІ")}</span><div class="view-toggle"><button data-view="app" aria-pressed="${state.view === "app"}">${icon("device-mobile")} ${u("交互体验", "Try the app", "Спробувати")}</button><button data-view="board" aria-pressed="${state.view === "board"}">${icon("squares-four")} ${u("全部画板", "All screens", "Усі екрани")}</button></div></div></header><div class="studio ${state.view}"><aside class="rail"><div class="brand-story"><span class="tiny-label">ONE CANTEEN. THREE LANGUAGES.</span><h1>${u("从厨房，<br>到每一个人。", "From the kitchen,<br>to everyone.", "Від кухні —<br>до кожного.")}</h1><p>${u("让好菜被记住，让协作更轻松。", "Good food, shared knowledge,<br>and a kitchen in sync.", "Добра їжа, спільний досвід<br>і злагоджена кухня.")}</p></div><div class="rail-langs">${[
      ["zh", "中文"],
      ["en", "EN"],
      ["uk", "УКР"],
    ]
      .map(
        ([v, l]) =>
          `<button data-lang="${v}" aria-pressed="${state.lang === v}">${l}</button>`,
      )
      .join(
        "",
      )}</div><nav class="screen-navigation">${routes.map((r, i) => `<button data-go="${r}" class="${state.route === r && state.view === "app" ? "active" : ""}"><span class="screen-number">${String(i + 1).padStart(2, "0")}</span>${txt(titles[r])}${icon("arrow-up-right")}</button>`).join("")}</nav><a class="handoff-link" href="PRODUCT-HANDOFF.md" target="_blank">${icon("notebook")} ${u("产品框架与协作说明", "Product & team handoff", "Опис продукту та співпраці")} ${icon("arrow-up-right")}</a><a class="repo-link" href="https://github.com/TERRYYYC/canteen-os" target="_blank" rel="noreferrer">${icon("github-logo")} TERRYYYC / canteen-os</a></aside>${
      state.view === "board"
        ? `<div class="design-board">${routes.map((r, i) => `<section class="artboard"><div class="artboard-label"><span>${i + 1}</span><div><h2>${txt(titles[r])}</h2><p>${["home", "menu", "detail", "feedback"].includes(r) ? u("顾客体验", "Customer experience", "Досвід відвідувача") : u("厨房协作", "Kitchen workspace", "Спільна робота кухні")}</p></div><button class="icon-btn" data-go="${r}" aria-label="${u("打开", "Open", "Відкрити")}">${icon("arrows-out-simple")}</button></div>${phone(r)}</section>`).join("")}</div>`
        : `<section class="stage"><div class="stage-label"><span class="live-dot"></span>${u("点击屏幕，体验完整流程", "TAP THE SCREEN. EXPLORE THE FLOW.", "НАТИСКАЙТЕ, ЩОБ СПРОБУВАТИ.")}<span>${String(routes.indexOf(state.route) + 1).padStart(2, "0")} / 10</span></div>${phone(state.route)}<p class="stage-caption">Good Food. Brighter People.</p></section><aside class="context-panel"><span class="tiny-label">${u("贯穿每一餐", "CONNECTED BY EVERY MEAL", "ОБ’ЄДНАНІ КОЖНОЮ СТРАВОЮ")}</span><h2>${u("一道好菜的<br>完整旅程。", "A good meal.<br>A complete journey.", "Хороша страва.<br>Повний шлях.")}</h2><div class="journey">${[
            [
              "import",
              u("从视频汲取灵感", "Capture inspiration", "Знайдіть натхнення"),
              u(
                "食材、做法与来源，一起保留",
                "Ingredients, steps and sources together",
                "Інгредієнти, кроки й джерела разом",
              ),
            ],
            [
              "knowledge",
              u("沉淀厨房知识", "Build kitchen knowledge", "Зберігайте знання"),
              u(
                "厨师与采购，共用三语菜品库",
                "A trilingual library for chefs and buyers",
                "Тримовна база для кухарів і закупівельників",
              ),
            ],
            [
              "plan",
              u(
                "排好菜单，买对食材",
                "Plan meals. Buy what’s needed.",
                "Плануйте й купуйте потрібне",
              ),
              u(
                "份数、损耗、库存与包装取整",
                "Portions, yield, stock and whole packs",
                "Порції, вихід, залишки й упаковки",
              ),
            ],
            [
              "feedback",
              u(
                "把反馈带回厨房",
                "Bring feedback to the kitchen",
                "Поверніть відгуки на кухню",
              ),
              u(
                "听见顾客，也听见一线同事",
                "Hear from diners and the kitchen team",
                "Почуйте відвідувачів і команду",
              ),
            ],
          ]
            .map(
              ([r, a, b], i) =>
                `<button data-go="${r}" class="journey-step ${state.route === r ? "active" : ""}"><span>${String(i + 1).padStart(2, "0")}</span><div><b>${a}</b><p>${b}</p></div></button>`,
            )
            .join(
              "",
            )}</div><div class="context-note">${icon("cursor-click")}<p>${u("试试看：进入菜单计划，增加 10 份菜，再查看采购单里的变化。", "Try this: add 10 portions in Menu plan, then see your purchase list update.", "Спробуйте: додайте 10 порцій у плані й перегляньте зміни в закупівлях.")}</p></div><div class="session-note">${u("交互仅作用于本次演示", "Changes stay in this demo session", "Зміни діють лише в демо-сеансі")}</div></aside>`
    }</div>`;
  for (const el of document.querySelectorAll("[data-screen]"))
    el.scrollTop = scrolls.get(el.dataset.screen) || 0;
}
function go(r) {
  if (!screens[r]) return;
  state.route = r;
  state.view = "app";
  history.replaceState(null, "", "#" + r);
  render();
}
let toastTimer;
function toast(s) {
  const el = document.getElementById("toast");
  el.textContent = s;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function purchaseText() {
  const r = procurement(scopePlan());
  return `${u("演示采购清单", "DEMO PURCHASE LIST", "ДЕМО-СПИСОК ЗАКУПІВЕЛЬ")}\n${r.lines
    .filter((l) => l.packs > 0)
    .map(
      (l) =>
        `${l.item.purchase.supplier} · ${t(l.item.name)} · ${l.packs} × ${formatQ(l.item.purchase.packSize, l.item.baseUnit)}`,
    )
    .join("\n")}\n${u("预计", "Estimate", "Орієнтовно")}: ₴${r.total}`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const a = b.dataset;
  if (a.go) {
    go(a.go);
    return;
  }
  if (a.dish) {
    state.dish = a.dish;
    state.detailTab = "about";
    go(a.target || "detail");
    return;
  }
  if (a.lang) {
    state.lang = a.lang;
    render();
    return;
  }
  if (a.view) {
    state.view = a.view;
    render();
    return;
  }
  if (a.rate) {
    state.rating = +a.rate;
    render();
    return;
  }
  if (a.tag) {
    const v = +a.tag;
    state.tags = state.tags.includes(v)
      ? state.tags.filter((n) => n !== v)
      : [...state.tags, v];
    render();
    return;
  }
  if (a.period) {
    state[a.kind] = a.period;
    render();
    return;
  }
  if (a.date) {
    state.date = a.date;
    if (a.action === "open-day") state.period = "day";
    render();
    return;
  }
  if (a.meal) {
    state.meal = a.meal;
    render();
    return;
  }
  if (a.category) {
    state.category = a.category;
    render();
    return;
  }
  if (a.kb) {
    state.kb = a.kb;
    render();
    return;
  }
  if (a.detailTab) {
    state.detailTab = a.detailTab;
    render();
    return;
  }
  if (a.cookTab) {
    state.cookTab = a.cookTab;
    render();
    return;
  }
  if (a.importKind) {
    state.importKind = a.importKind;
    render();
    return;
  }
  if (a.report) {
    state.reportPeriod = a.report;
    render();
    return;
  }
  if (a.adjust) {
    const p = state.plan[+a.row];
    p.servings = Math.max(0, Math.min(5000, p.servings + Number(a.adjust)));
    render();
    return;
  }
  if (a.action === "favorite") {
    const id = dish().id;
    state.favorites.has(id)
      ? state.favorites.delete(id)
      : state.favorites.add(id);
    render();
  }
  if (a.action === "order-start") {
    state.date = "2026-09-10";
    state.meal = "lunch";
    state.category = "all";
    go("menu");
    toast(
      u(
        "选择一道菜，再加入点餐",
        "Choose a dish to add to your order",
        "Виберіть страву для замовлення",
      ),
    );
  }
  if (a.action === "add-order") {
    state.cart.push(dish().id);
    go("menu");
    toast(u("已加入本次点餐", "Added to your order", "Додано до замовлення"));
  }
  if (a.action === "order-confirm") {
    state.ordered = true;
    state.cart = [];
    render();
    toast(
      u(
        "演示订单已确认",
        "Demo order confirmed",
        "Демо-замовлення підтверджено",
      ),
    );
  }
  if (a.action === "demo-import") {
    state.draft = {
      ...dishes[0],
      id: "video-draft-" + Date.now(),
      name: L(
        "香草鸡肉卷 · 导入草稿",
        "Herb chicken · imported draft",
        "Курячий рулет · чернетка",
      ),
      draft: true,
      rating: 0,
      reviews: 0,
      region: L("待复核", "Needs review", "На перевірці"),
    };
    state.importStage = 1;
    state.confirmed = false;
    render();
  }
  if (a.action === "save-import") {
    const v = Number(document.getElementById("base-servings").value);
    if (!Number.isInteger(v) || v < 1 || v > 10000) {
      toast(
        u(
          "请输入 1–10000 的整数份数",
          "Enter 1–10000 whole servings",
          "Введіть ціле число від 1 до 10000",
        ),
      );
      return;
    }
    state.draft.baseServings = v;
    dishes.push({ ...state.draft, draft: true });
    state.importStage = 2;
    render();
  }
  if (a.action === "reset-import") {
    state.importStage = 0;
    state.draft = null;
    render();
  }
  if (a.action === "plan-add") {
    const id = document.getElementById("plan-dish").value;
    const old = state.plan.find(
      (p) => p.date === state.date && p.dishRef === id && p.meal === "lunch",
    );
    if (old) old.servings += 10;
    else
      state.plan.push({
        date: state.date,
        meal: "lunch",
        dishRef: id,
        servings: 10,
      });
    render();
    toast(u("午餐计划已更新", "Lunch plan updated", "План обіду оновлено"));
  }
  if (a.action === "copy-purchase") {
    const text = purchaseText();
    try {
      await navigator.clipboard.writeText(text);
      toast(u("采购单已复制", "Purchase list copied", "Список скопійовано"));
    } catch {
      document.getElementById("copy-fallback").innerHTML =
        `<label class="field"><span>${u("请手动复制", "Copy manually", "Скопіюйте вручну")}</span><textarea readonly>${esc(text)}</textarea></label>`;
      document.querySelector("#copy-fallback textarea").select();
    }
  }
  if (a.action === "download-csv") {
    const result = procurement(scopePlan());
    const cell = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    download(
      "canteenos-demo-purchase.csv",
      "\uFEFF" +
        [
          [
            "supplier",
            "ingredient",
            "packs",
            "packQuantity",
            "unit",
            "amount_UAH",
          ],
          ...result.lines
            .filter((l) => l.packs > 0)
            .map((l) => [
              l.item.purchase.supplier,
              t(l.item.name),
              l.packs,
              l.item.purchase.packSize,
              l.item.baseUnit,
              l.amount,
            ]),
        ]
          .map((r) => r.map(cell).join(","))
          .join("\r\n"),
      "text/csv;charset=utf-8",
    );
    toast(u("已导出示例 CSV", "Demo CSV exported", "Демо-CSV експортовано"));
  }
  if (a.action === "download-report") {
    download(
      "canteenos-demo-report.json",
      JSON.stringify(
        {
          mode: "demo",
          period: state.reportPeriod,
          feedback: state.feedback,
          procurement: procurement(scopePlan()),
          note: "Operational cards contain illustrative data, not observed performance.",
        },
        null,
        2,
      ),
      "application/json",
    );
    toast(
      u("演示报告已导出", "Demo report exported", "Демо-звіт експортовано"),
    );
  }
});
document.addEventListener("change", async (e) => {
  const el = e.target;
  if (el.matches("[data-language]")) {
    state.lang = el.value;
    render();
  }
  if (el.matches("[data-source]")) state.source = el.value;
  if (el.matches("[data-step]")) {
    el.checked
      ? state.checked.add(el.dataset.step)
      : state.checked.delete(el.dataset.step);
    el.closest(".cooking-step").classList.toggle("done", el.checked);
  }
  if (el.matches("[data-confirm-review]")) {
    state.confirmed = el.checked;
    document.querySelector('[data-action="save-import"]').disabled =
      !el.checked;
  }
  if (el.matches("[data-import-file]")) {
    const f = el.files[0];
    if (!f) return;
    if (f.size > 1000000) {
      toast(
        u(
          "文件须小于 1 MB",
          "File must be smaller than 1 MB",
          "Файл має бути меншим за 1 МБ",
        ),
      );
      return;
    }
    try {
      state.draft = readDraft(await f.text());
      state.importStage = 1;
      state.confirmed = false;
      render();
    } catch {
      toast(
        u(
          "无法导入：请选择含三语名称对象的 v2 菜品 JSON",
          "Cannot import: choose a v2 dish JSON with a name object",
          "Не вдалося імпортувати: потрібен JSON v2 з об’єктом name",
        ),
      );
    }
  }
});
document.addEventListener("input", (e) => {
  if (e.target.matches("[data-comment]")) state.comment = e.target.value;
  if (e.target.id === "base-servings" && state.draft)
    state.draft.baseServings = e.target.value;
  if (e.target.id === "video-url") state.videoUrl = e.target.value;
  if (e.target.matches("[data-search]")) {
    const pos = e.target.selectionStart;
    state.query = e.target.value;
    render();
    const input = document.querySelector("[data-search]");
    input.focus();
    input.setSelectionRange(pos, pos);
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "feedback-form") return;
  e.preventDefault();
  if (!state.rating) return;
  const data = new FormData(e.target);
  state.feedback.push({
    dishRef: state.dish,
    rating: state.rating,
    tags: [...state.tags],
    source: data.get("source"),
    comment: data.get("comment"),
  });
  state.rating = 0;
  state.tags = [];
  state.comment = "";
  go("report");
  toast(
    u(
      "谢谢，已收到你的演示反馈",
      "Thank you! Demo feedback received",
      "Дякуємо! Демо-відгук отримано",
    ),
  );
});
window.addEventListener("hashchange", () => {
  const route = location.hash.slice(1);
  if (screens[route]) go(route);
});
if (screens[location.hash.slice(1)]) state.route = location.hash.slice(1);
render();
