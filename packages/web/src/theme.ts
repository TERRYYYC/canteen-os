/**
 * 主题三态：system（默认，跟 prefers-color-scheme）/ light / dark。
 * 记在 localStorage "canteenos.theme"（try/catch）；写到 <html data-theme>，CSS 见 tokens.css。
 * index.html 里有一段同逻辑的内联脚本在首屏前先贴 data-theme，避免闪屏。
 */
export type Theme = "system" | "light" | "dark";

export const THEMES: readonly Theme[] = ["system", "light", "dark"];
const STORAGE_KEY = "canteenos.theme";

function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

let current: Theme = (() => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isTheme(v) ? v : "system";
  } catch {
    return "system";
  }
})();

export function getTheme(): Theme {
  return current;
}

/** 把当前主题贴到 <html>：system → 去掉 data-theme（交给媒体查询） */
export function applyTheme(theme: Theme = current): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

type Listener = (theme: Theme) => void;
const listeners = new Set<Listener>();

export function setTheme(theme: Theme): void {
  current = theme;
  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* 隐私模式：只在本次会话生效 */
  }
  applyTheme(theme);
  for (const l of listeners) l(theme);
}

export function onThemeChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
