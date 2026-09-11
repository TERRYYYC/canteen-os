// Session-only design fixtures. These never write production data/ or call a backend.
export const L = (zh, en, uk) => ({ zh, en, uk });
export const ingredients = {
  chicken: {
    name: L("鸡胸肉", "Chicken breast", "Куряче філе"),
    baseUnit: "g",
    yield: 0.9,
    trackStock: false,
    purchase: {
      supplier: "Fresh Market",
      packSize: 2000,
      packUnit: "g",
      price: 340,
    },
    role: "main",
  },
  butter: {
    name: L("黄油", "Butter", "Вершкове масло"),
    baseUnit: "g",
    yield: 1,
    trackStock: true,
    onHand: 500,
    purchase: {
      supplier: "Pantry & Co.",
      packSize: 500,
      packUnit: "g",
      price: 145,
    },
    role: "seasoning",
  },
  crumbs: {
    name: L("面包糠", "Breadcrumbs", "Панірувальні сухарі"),
    baseUnit: "g",
    yield: 1,
    trackStock: true,
    onHand: 1000,
    purchase: {
      supplier: "Pantry & Co.",
      packSize: 1000,
      packUnit: "g",
      price: 65,
    },
    role: "seasoning",
  },
  broccoli: {
    name: L("西兰花", "Broccoli", "Броколі"),
    baseUnit: "g",
    yield: 0.85,
    trackStock: false,
    purchase: {
      supplier: "Fresh Market",
      packSize: 5000,
      packUnit: "g",
      price: 400,
    },
    role: "main",
  },
  carrot: {
    name: L("胡萝卜", "Carrot", "Морква"),
    baseUnit: "g",
    yield: 0.9,
    trackStock: false,
    purchase: {
      supplier: "Fresh Market",
      packSize: 5000,
      packUnit: "g",
      price: 150,
    },
    role: "main",
  },
  tomato: {
    name: L("番茄", "Tomato", "Помідори"),
    baseUnit: "g",
    yield: 0.95,
    trackStock: false,
    purchase: {
      supplier: "Fresh Market",
      packSize: 5000,
      packUnit: "g",
      price: 300,
    },
    role: "main",
  },
  oil: {
    name: L("植物油", "Vegetable oil", "Рослинна олія"),
    baseUnit: "ml",
    yield: 1,
    trackStock: true,
    onHand: 2000,
    purchase: {
      supplier: "Pantry & Co.",
      packSize: 5000,
      packUnit: "ml",
      price: 320,
    },
    role: "seasoning",
  },
  salt: {
    name: L("盐", "Salt", "Сіль"),
    baseUnit: "g",
    yield: 1,
    trackStock: true,
    onHand: 1000,
    purchase: {
      supplier: "Pantry & Co.",
      packSize: 1000,
      packUnit: "g",
      price: 30,
    },
    role: "seasoning",
  },
};
export const dishes = [
  {
    id: "kyiv",
    name: L("基辅鸡肉卷", "Chicken Kyiv", "Котлета по-київськи"),
    category: "main",
    image: "assets/chicken-kyiv.jpg",
    time: 45,
    rating: 4.8,
    reviews: 92,
    baseServings: 1,
    allergens: L("乳制品 · 麸质", "Dairy · Gluten", "Молоко · Глютен"),
    region: L("乌克兰风味", "Ukrainian", "Українська кухня"),
    description: L(
      "金黄酥脆的外皮，裹着鲜嫩鸡胸与融化的香草黄油。搭配时蔬，每一口都温暖满足。",
      "Golden, crisp chicken filled with fragrant herb butter. Served with seasonal vegetables for a comforting, balanced meal.",
      "Ніжне куряче філе з ароматним трав’яним маслом у золотистій хрусткій скоринці. Подається із сезонними овочами.",
    ),
    components: [
      { ingredientRef: "chicken", qty: { value: 200, unit: "g" } },
      { ingredientRef: "butter", qty: { value: 25, unit: "g" } },
      { ingredientRef: "crumbs", qty: { value: 30, unit: "g" } },
    ],
    steps: [
      L(
        "将鸡胸肉拍平，厚度均匀。",
        "Flatten the chicken evenly.",
        "Рівномірно відбийте куряче філе.",
      ),
      L(
        "放入香草黄油，卷紧并封好边缘。",
        "Add herb butter, roll tightly and seal.",
        "Додайте трав’яне масло, щільно загорніть і закрийте краї.",
      ),
      L(
        "裹上面包糠，冷藏定型。",
        "Coat in breadcrumbs and chill.",
        "Обкачайте в сухарях та охолодіть.",
      ),
      L(
        "煎至金黄后烤熟；出餐前由厨师确认熟度。",
        "Fry until golden, then finish in the oven. The chef checks doneness.",
        "Обсмажте до золотистого кольору й доведіть у духовці. Кухар перевіряє готовність.",
      ),
    ],
  },
  {
    id: "vegetables",
    name: L("田园时蔬", "Vegetable Stir-fry", "Овочеве соте"),
    category: "vegetarian",
    image: "assets/vegetables.jpg",
    time: 20,
    rating: 4.7,
    reviews: 64,
    baseServings: 1,
    allergens: L(
      "请确认交叉接触风险",
      "Check cross-contact risks",
      "Уточніть ризик перехресного контакту",
    ),
    region: L("清新轻食", "Fresh & light", "Легка страва"),
    description: L(
      "西兰花与胡萝卜轻炒，保留蔬菜的自然甜味和爽脆口感。",
      "Lightly sautéed broccoli and carrots, full of natural sweetness and crunch.",
      "Легко обсмажені броколі та морква з природною солодкістю і хрусткою текстурою.",
    ),
    components: [
      { ingredientRef: "broccoli", qty: { value: 150, unit: "g" } },
      { ingredientRef: "carrot", qty: { value: 80, unit: "g" } },
      { ingredientRef: "oil", qty: { value: 10, unit: "ml" } },
      { ingredientRef: "salt", qty: { value: 2, unit: "g" } },
    ],
    steps: [
      L(
        "清洗蔬菜，将西兰花分成小朵。",
        "Wash and cut the broccoli into florets.",
        "Помийте овочі, розберіть броколі на суцвіття.",
      ),
      L(
        "胡萝卜切片，按出餐时间备料。",
        "Slice the carrots just before cooking.",
        "Наріжте моркву скибочками перед приготуванням.",
      ),
      L(
        "少油快速翻炒，调味后及时出餐。",
        "Stir-fry, season and serve promptly.",
        "Швидко обсмажте, приправте та подавайте.",
      ),
    ],
  },
  {
    id: "soup",
    name: L("罗勒番茄汤", "Tomato & Basil Soup", "Томатний суп із базиліком"),
    category: "soup",
    image: "assets/tomato-soup.jpg",
    time: 30,
    rating: 4.6,
    reviews: 48,
    baseServings: 1,
    allergens: L("乳制品", "Dairy", "Молоко"),
    region: L("暖心汤品", "Comfort bowl", "Затишний смак"),
    description: L(
      "成熟番茄慢煮，加入少量黄油与罗勒，浓郁又清爽。",
      "Slow-simmered ripe tomatoes with a little butter and fresh basil.",
      "Стиглі помідори, повільно зварені з невеликою кількістю масла та свіжим базиліком.",
    ),
    components: [
      { ingredientRef: "tomato", qty: { value: 180, unit: "g" } },
      { ingredientRef: "butter", qty: { value: 10, unit: "g" } },
      { ingredientRef: "salt", qty: { value: 2, unit: "g" } },
    ],
    steps: [
      L(
        "番茄洗净切块。",
        "Wash and chop the tomatoes.",
        "Помийте й наріжте помідори.",
      ),
      L(
        "黄油融化，加入番茄慢煮。",
        "Melt butter and simmer with tomatoes.",
        "Розтопіть масло, додайте помідори й тушкуйте.",
      ),
      L(
        "打成细腻浓汤，调味并装碗。",
        "Blend smooth, season and serve.",
        "Подрібніть до однорідності, приправте й подавайте.",
      ),
    ],
  },
];
export const initialPlan = () => [
  { date: "2026-09-10", meal: "lunch", dishRef: "kyiv", servings: 80 },
  { date: "2026-09-10", meal: "lunch", dishRef: "vegetables", servings: 60 },
  { date: "2026-09-10", meal: "lunch", dishRef: "soup", servings: 60 },
  { date: "2026-09-11", meal: "lunch", dishRef: "kyiv", servings: 70 },
  { date: "2026-09-11", meal: "lunch", dishRef: "vegetables", servings: 70 },
  { date: "2026-09-11", meal: "dinner", dishRef: "soup", servings: 40 },
];
// Deliberately small, reviewable prototype calculation; not a replacement for core.
export function procurement(
  plan,
  catalog = dishes,
  stock = ingredients,
  margin = 1.1,
) {
  const sums = new Map(),
    pending = [];
  for (const meal of plan) {
    const dish = catalog.find((d) => d.id === meal.dishRef);
    if (dish?.draft || !dish?.baseServings || !Array.isArray(dish.components)) {
      pending.push({ dishRef: meal.dishRef, reason: "incomplete" });
      continue;
    }
    for (const c of dish.components) {
      const item = stock[c.ingredientRef];
      if (c.qty?.unit === "to-taste") continue;
      if (
        !item?.purchase ||
        !Number.isFinite(c.qty?.value) ||
        c.qty.value < 0 ||
        c.qty.unit !== item.baseUnit
      ) {
        pending.push({ ingredientRef: c.ingredientRef, reason: "unresolved" });
        continue;
      }
      const old = sums.get(c.ingredientRef) || { net: 0, from: [] };
      old.net += (c.qty.value * meal.servings) / dish.baseServings;
      old.from.push({
        dishRef: meal.dishRef,
        servings: meal.servings,
        date: meal.date,
      });
      sums.set(c.ingredientRef, old);
    }
  }
  const lines = [...sums].map(([id, s]) => {
    const item = stock[id],
      y = item.baseUnit === "pcs" ? 1 : item.yield || 1;
    const gross = (s.net / y) * margin,
      onHand = item.trackStock ? item.onHand || 0 : 0,
      need = Math.max(0, gross - onHand);
    const packs =
      need > 0
        ? Math.max(
            item.purchase.minPacks || 1,
            Math.ceil((need - 1e-8) / item.purchase.packSize),
          )
        : 0;
    return {
      id,
      ...s,
      yield: y,
      margin,
      onHand,
      gross,
      need,
      packs,
      quantity: packs * item.purchase.packSize,
      amount: packs * item.purchase.price,
      item,
    };
  });
  return { lines, pending, total: lines.reduce((a, b) => a + b.amount, 0) };
}
export function readDraft(text) {
  const value = JSON.parse(text);
  const obj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (
    !obj(value) ||
    value.schemaVersion !== "2" ||
    !obj(value.name) ||
    !Object.entries(value.name).every(
      ([k, v]) =>
        ["zh", "en", "uk"].includes(k) &&
        typeof v === "string" &&
        v.length <= 500,
    ) ||
    !Object.values(value.name).some((v) => v.trim())
  )
    throw new Error("invalid-draft");
  if (
    value.baseServings !== undefined &&
    (!Number.isInteger(value.baseServings) ||
      value.baseServings < 1 ||
      value.baseServings > 10000)
  )
    throw new Error("invalid-servings");
  if (
    value.components !== undefined &&
    (!Array.isArray(value.components) ||
      value.components.length > 100 ||
      !value.components.every(
        (c) =>
          obj(c) &&
          typeof c.ingredientRef === "string" &&
          /^[a-z0-9][a-z0-9-]*$/.test(c.ingredientRef) &&
          obj(c.qty) &&
          ((c.qty.unit === "to-taste" && c.qty.value === undefined) ||
            (Number.isFinite(c.qty.value) && c.qty.value >= 0)) &&
          typeof c.qty.unit === "string" &&
          [
            "g",
            "kg",
            "ml",
            "l",
            "pcs",
            "pack",
            "to-taste",
            "tbsp",
            "tsp",
            "pinch",
          ].includes(c.qty.unit),
      ))
  )
    throw new Error("invalid-components");
  if (
    value.steps !== undefined &&
    (!Array.isArray(value.steps) ||
      value.steps.length > 100 ||
      !value.steps.every(
        (s) =>
          obj(s) &&
          obj(s.text) &&
          Object.values(s.text).every(
            (v) => typeof v === "string" && v.length <= 5000,
          ),
      ))
  )
    throw new Error("invalid-steps");
  // Imported text is previewed and escaped. Full schema validation remains an external ingest gate.
  return {
    id: "imported-" + Date.now(),
    name: {
      zh: value.name.zh || "",
      en: value.name.en || "",
      uk: value.name.uk || "",
    },
    category: "main",
    image: "assets/chicken-kyiv.jpg",
    time: 0,
    rating: 0,
    reviews: 0,
    baseServings: value.baseServings,
    components: Array.isArray(value.components) ? value.components : [],
    allergens: L(
      "待厨师核验",
      "Chef review required",
      "Потрібна перевірка кухаря",
    ),
    description: L(
      "导入草稿；图片为演示图。",
      "Imported draft; illustration is a demo image.",
      "Імпортована чернетка; зображення демонстраційне.",
    ),
    region: L("待复核", "Needs review", "На перевірці"),
    steps: (value.steps || []).map((s) => s.text),
    sourceDocument: value,
    draft: true,
  };
}
