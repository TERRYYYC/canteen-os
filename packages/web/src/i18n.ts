/**
 * 界面语言（UI chrome 文案）与内容语言（三张单 JSON 里的 I18nString）共用同一个开关：
 * 右上角下拉 UA / 中 / EN（screens-v2.html：语言下拉只切内容语言，不切页面）。
 *
 *   getLang() / setLang(l) / onLangChange(fn)   —— 记在 localStorage "canteenos.lang"（try/catch，隐私模式下静默）
 *   t(key, params?)                             —— UI 小字典（本文件），缺键时回退 uk，再回退键名
 *   pick(s, lang)                               —— 内容取值：lang → zh → en → uk → ""（docs/i18n.md 的 fallback 链）
 *
 * 文案规则（execution-brief §4.7）：中文用人话；乌克兰语的备料动作词只从 techniques.json 取——
 * 这里只有页面壳文案，不含任何技法词。
 */
import type { I18nString } from "@canteenos/core";

export type Lang = "uk" | "zh" | "en";

export const LANGS: readonly Lang[] = ["uk", "zh", "en"];
/** 下拉里的短标签（设计稿 .dd：UA / 中 / EN） */
export const LANG_CHIP: Record<Lang, string> = { uk: "UA", zh: "中", en: "EN" };
/** 下拉展开后的全名（用自己的语言写，选语言时不需要先懂别的语言） */
export const LANG_NAME: Record<Lang, string> = { uk: "Українська", zh: "中文", en: "English" };
/** <html lang> / Intl locale */
export const LANG_TAG: Record<Lang, string> = { uk: "uk", zh: "zh-Hans", en: "en" };

export const DEFAULT_LANG: Lang = "uk";
const STORAGE_KEY = "canteenos.lang";

// ---------------------------------------------------------------------------
// UI 字典
// ---------------------------------------------------------------------------

const DICT = {
  "app.name": { uk: "CanteenOS", zh: "CanteenOS", en: "CanteenOS" },
  "app.tagline": { uk: "Кухня · 1 заклад", zh: "厨房 · 1 家", en: "Kitchen · 1 site" },

  // 顶栏标题（screens-v2.html .appbar .t）
  "page.prep": { uk: "Підготовка", zh: "备料", en: "Prep" },
  "page.purchase": { uk: "Закупівля", zh: "采购单", en: "Purchasing" },
  "page.menu": { uk: "Меню", zh: "菜单", en: "Menu" },
  "page.admin": { uk: "Кабінет шефа", zh: "师傅后台", en: "Back office" },
  "page.qr": { uk: "QR-коди", zh: "二维码", en: "QR codes" },

  // 抽屉条目（screens-v2.html .drawer .di：l1 名字 / l2 角色，乌/中双写照稿）
  "drawer.prep": { uk: "Підготовка", zh: "备料单", en: "Prep" },
  "drawer.prep.role": { uk: "для помічника кухаря · 帮厨", zh: "帮厨 · помічник", en: "for the prep cook · 帮厨" },
  "drawer.purchase": { uk: "Закупівля · 采购单", zh: "采购单", en: "Purchasing · 采购单" },
  "drawer.purchase.role": { uk: "для закупівельника · 采购员", zh: "采购员", en: "for the buyer · 采购员" },
  "drawer.menu": { uk: "Меню", zh: "菜单", en: "Menu" },
  "drawer.menu.role": { uk: "для гостей · 顾客", zh: "顾客", en: "for guests · 顾客" },
  "drawer.plan": { uk: "План меню · 菜单计划", zh: "菜单计划", en: "Menu plan · 菜单计划" },
  "drawer.plan.role": { uk: "для шефа · 师傅", zh: "师傅", en: "for the chef · 师傅" },
  "drawer.plan.later": { uk: "2-й етап", zh: "2-й етап", en: "2-й етап" },
  "drawer.open": { uk: "Відкрити меню розділів", zh: "打开目录", en: "Open sections menu" },
  "drawer.close": { uk: "Закрити меню розділів", zh: "关闭目录", en: "Close sections menu" },
  "drawer.title": { uk: "Розділи", zh: "目录", en: "Sections" },

  // 抽屉底部（builtAt + 在线/离线）
  "foot.updated": { uk: "Дані оновлено", zh: "数据更新于", en: "Data updated" },
  "foot.updated.unknown": { uk: "невідомо", zh: "未知", en: "unknown" },
  "foot.online": { uk: "Онлайн", zh: "在线", en: "Online" },
  "foot.offline": { uk: "Офлайн · без мережі", zh: "离线 · 无网络", en: "Offline · no network" },

  // 主题三态
  "theme.label": { uk: "Тема", zh: "外观", en: "Theme" },
  "theme.system": { uk: "Як у системі", zh: "跟随系统", en: "System" },
  "theme.light": { uk: "Світла", zh: "浅色", en: "Light" },
  "theme.dark": { uk: "Темна", zh: "深色", en: "Dark" },

  "lang.label": { uk: "Мова", zh: "语言", en: "Language" },

  // 数据层状态（页面占位共用）
  "data.loading": { uk: "Завантаження…", zh: "加载中…", en: "Loading…" },
  "data.notReady": { uk: "Дані ще не готові", zh: "数据未就绪", en: "Data not ready yet" },
  "data.days": { uk: "Дані завантажено: {n} дн.", zh: "数据已加载 {n} 天", en: "Data loaded: {n} days" },
  "data.orders": { uk: "Замовлень постачальникам: {n}", zh: "供应商采购单 {n} 张", en: "Supplier orders: {n}" },
  "data.plan": { uk: "План", zh: "菜单计划", en: "Plan" },

  // PWA（#12）：抽屉底部第三态、新版本提示条、离线就绪、iOS 加到主屏幕提示（设计稿 screens-v2.html .foot 文案）
  "foot.offlineCached": { uk: "Офлайн-копія збережена", zh: "已存离线副本", en: "Offline copy saved" },
  "update.available": { uk: "Є нова версія", zh: "有新版本", en: "New version available" },
  "update.reload": { uk: "Оновити", zh: "点此刷新", en: "Reload" },
  "offline.ready": { uk: "Збережено для роботи без мережі", zh: "已保存，断网也能看", en: "Saved for offline use" },
  "ios.addToHome": {
    uk: "Додайте на екран «Додому», щоб працювало без мережі: Поділитися → На екран «Додому»",
    zh: "加到主屏幕可离线使用：分享 → 添加到主屏幕",
    en: "Add to Home Screen to use offline: Share → Add to Home Screen",
  },
  "ios.dismiss": { uk: "Закрити", zh: "关闭", en: "Dismiss" },
} as const satisfies Record<string, Record<Lang, string>>;

export type UiKey = keyof typeof DICT;

export type TParams = Record<string, string | number>;

/** UI 文案（当前语言）；{n} 之类占位用 params 填 */
export function t(key: UiKey, params?: TParams, lang: Lang = current): string {
  const entry = DICT[key] as Record<Lang, string> | undefined;
  let s = entry?.[lang] ?? entry?.[DEFAULT_LANG] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/** 内容取值：lang → zh → en → uk → ""（core 的 I18nString 至少有一种语言） */
export function pick(s: I18nString | undefined | null, lang: Lang = current): string {
  if (!s) return "";
  return s[lang] ?? s.zh ?? s.en ?? s.uk ?? "";
}

// ---------------------------------------------------------------------------
// 当前语言 + 持久化
// ---------------------------------------------------------------------------

function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function fromNavigator(): Lang | null {
  const tags = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const tag of tags) {
    const p = (tag ?? "").toLowerCase().split("-")[0];
    if (isLang(p)) return p;
  }
  return null;
}

let current: Lang = readStored() ?? fromNavigator() ?? DEFAULT_LANG;

type Listener = (lang: Lang) => void;
const listeners = new Set<Listener>();

export function getLang(): Lang {
  return current;
}

/** 切换语言并记住；同值不触发回调。localStorage 不可用（隐私模式等）时只切不记，不报错。 */
export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* 记不住就算了：本次会话仍然生效 */
  }
  for (const l of listeners) l(lang);
}

/** 订阅语言变化（不立即调用）；返回取消函数 */
export function onLangChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
