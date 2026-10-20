import type { I18n, Lang } from './types';
import { localized } from './types';

export function I18nField({ title, value, onChange, multiline = false, required = false }: { title: string; value?: I18n; onChange: (value: I18n) => void; multiline?: boolean; required?: boolean }) {
  function field(lang: Lang, name: string) {
    const props = { value: value?.[lang] || '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(localized(value, lang, e.target.value)) };
    return <label className="field"><span>{name}</span>{multiline ? <textarea rows={3} {...props} /> : <input {...props} />}</label>;
  }
  return <div className="i18n-field">{field('zh', `${title}${required ? ' *' : ''}`)}<details className="translations"><summary>其他语言{value?.en || value?.uk ? ' · 已填写' : ''}</summary>{field('en', `${title}（英语）`)}{field('uk', `${title}（乌克兰语）`)}</details></div>;
}

export function date(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function move<T>(items: T[], from: number, by: number): T[] {
  const next = [...items];
  if (from + by < 0 || from + by >= next.length) return next;
  [next[from], next[from + by]] = [next[from + by], next[from]];
  return next;
}

export function OrderButtons({ index, count, onMove, onRemove }: { index: number; count: number; onMove: (by: number) => void; onRemove: () => void }) {
  return <div className="row-actions"><button type="button" className="quiet" aria-label="上移" disabled={index === 0} onClick={() => onMove(-1)}>↑</button><button type="button" className="quiet" aria-label="下移" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button><button type="button" className="quiet danger" onClick={onRemove}>移除</button></div>;
}
