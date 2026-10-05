import { h } from '../../../dom';
import type { Lang } from '../../../i18n';
import type { I18n } from '../../../api/knowledge';
export const words = (lang: Lang) => (zh: string, en: string, uk: string) => ({ zh, en, uk })[lang];
export type Words = ReturnType<typeof words>;
export function button(text: string, action: () => void, primary = false): HTMLButtonElement {
  const el = h('button', { type: 'button', class: primary ? 'kb-primary' : '' }, text);
  el.addEventListener('click', action); return el;
}
export function field(text: string, control: HTMLElement): HTMLLabelElement { if(['INPUT','TEXTAREA','SELECT'].includes(control.tagName)&&!control.getAttribute('aria-label'))control.setAttribute('aria-label',text); return h('label', { class: 'kb-field' }, h('span', {}, text), control); }
export function input(value: string, change: (value: string) => void, multiline = false): HTMLInputElement | HTMLTextAreaElement {
  const el = multiline ? h('textarea', { rows: 3 }) : h('input', { type: 'text' });
  el.value = value; el.addEventListener('input', () => change(el.value)); return el;
}
export function select(value: string, options: [string, string][], change: (value: string) => void): HTMLSelectElement {
  const el = h('select', {}, ...options.map(([id, text]) => h('option', { value: id }, text)));
  el.value = value; el.addEventListener('change', () => change(el.value)); return el;
}
export function multilingual(title: string, value: I18n | undefined, change: (value: I18n) => void, multiline = false): HTMLElement {
  const local = { ...value };
  return h('fieldset', { class: 'kb-languages' }, h('legend', {}, title), ...(['zh', 'en', 'uk'] as const).map(lang => field(({ zh: '中文', en: 'English', uk: 'Українська' })[lang], input(local[lang] || '', text => {
    if (text.trim()) local[lang] = text; else delete local[lang]; change({ ...local });
  }, multiline))));
}
export function section(title: string, ...children: HTMLElement[]): HTMLElement { return h('section', { class: 'kb-panel' }, h('h3', {}, title), ...children); }
export function order<T>(items: T[], index: number, change: () => void, remove: () => void, t: Words): HTMLElement {
  const up = button(t('上移', 'Move up', 'Вгору'), () => { [items[index - 1], items[index]] = [items[index]!, items[index - 1]!]; change(); });
  const down = button(t('下移', 'Move down', 'Вниз'), () => { [items[index + 1], items[index]] = [items[index]!, items[index + 1]!]; change(); });
  up.disabled = index === 0; down.disabled = index === items.length - 1;
  return h('div', { class: 'kb-actions' }, up, down, button(t('移除', 'Remove', 'Вилучити'), remove));
}
export function safeExternal(url?: string): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null; } catch { return null; }
}
export function jsonEvidence(value: unknown, title: string): HTMLElement {
  return h('details', { class: 'kb-evidence' }, h('summary', {}, title), h('pre', {}, JSON.stringify(value, null, 2)));
}
