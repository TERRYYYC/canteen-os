import { useEffect, useState } from 'react';
import { request, errorMessage } from './api';
import type { Amount, RecipeDetail, Revision } from './types';
import { httpUrl, label } from './types';
import { date } from './Fields';
import { leadTimeText, quantityText, sourceText, UnknownsPanel } from './Quantities';

const legacyAmount = (a: Amount) => a.kind === 'exact' ? `${a.value} ${a.unit}` : a.kind === 'unknown' ? a.raw || '用量未知' : a.raw;

export function History({ id, version }: { id: string; version: number }) {
  const [items, setItems] = useState<Revision[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { const c = new AbortController(); setLoading(true); request<{ items: Revision[] }>(`/recipes/${id}/revisions`, { signal: c.signal }).then(r => { setItems(r.items); setSelected(r.items[0]?.version ?? null); }).catch(e => { if (!c.signal.aborted) setError(errorMessage(e)); }).finally(() => { if (!c.signal.aborted) setLoading(false); }); return () => c.abort(); }, [id, version]);
  useEffect(() => { if (selected === null) return; const c = new AbortController(); setDetail(null); setError(''); setLoading(true); request<RecipeDetail>(`/recipes/${id}/revisions/${selected}`, { signal: c.signal }).then(setDetail).catch(e => { if (!c.signal.aborted) setError(errorMessage(e)); }).finally(() => { if (!c.signal.aborted) setLoading(false); }); return () => c.abort(); }, [id, selected]);
  return <section className="panel history"><div className="section-heading"><span className="section-number">↶</span><div><h2>历史版本</h2><p>每一次保存都留下记录，以下内容只读。</p></div></div><label className="field"><span>选择版本</span><select value={selected ?? ''} onChange={e => setSelected(Number(e.target.value))}>{items.map(r => <option value={r.version} key={r.version}>第 {r.version} 版 · {date(r.createdAt)}</option>)}</select></label>{loading && <p role="status">正在读取历史…</p>}{error && <p className="notice error" role="alert">{error}</p>}{detail && <Snapshot detail={detail} />}</section>;
}

function Snapshot({ detail }: { detail: RecipeDetail }) {
  const r = detail.recipe;
  return <div className="snapshot"><p className="eyebrow">第 {detail.version} 版 · {date(detail.createdAt)}</p><h2>{label(r.title)}</h2><p className="preserve-lines">{label(r.description)}</p><div className="tags">{r.tags?.map(t => <span className="tag" key={t}>{t}</span>)}</div><p className="muted">份量：{r.baseServings ? `${r.baseServings} 人份` : '未知'}</p><h3>食材与调料</h3>{r.ingredients?.length ? <ul className="snapshot-ingredients">{r.ingredients.map(i => <li key={i.id}><span>{label(i.name)}{i.role === 'seasoning' && <small> · 调料</small>}</span><span>{i.amount ? legacyAmount(i.amount) : <>{i.qty ? `${quantityText(i.qty)} · ${sourceText(i.qtySource)}` : '食堂用量未定'}{i.originalAmount && <small> · 原方 {i.originalAmount}{i.originalQty ? `（${quantityText(i.originalQty)}）` : ''}</small>}{i.kitchenPrep?.leadTime && <small> · {leadTimeText(i.kitchenPrep.leadTime)}</small>}</>}</span></li>)}</ul> : <p className="muted">还未补充</p>}{r.unknowns?.length ? <><h3>没说清的地方</h3><UnknownsPanel recipe={r} readOnly /></> : null}<h3>做法</h3><ol className="snapshot-steps">{r.steps?.map(s => <li key={s.id}>{label(s.text)}</li>)}</ol><h3>图片与视频</h3><div className="snapshot-media">{(detail.media || []).map((asset, i) => { const url = httpUrl(asset.url); return <div key={`${asset.assetId}-${i}`}>{asset.kind === 'image' && url && <img src={url} alt="这一版本保存的菜谱图片" />}{url && <a href={url} target="_blank" rel="noopener noreferrer">{asset.kind === 'video' ? '打开视频 ↗' : '查看图片 ↗'}</a>}{asset.clip && <p>{asset.clip.start}–{asset.clip.end} 秒</p>}</div>; })}</div><h3>资料来源</h3>{r.sources?.map((ref, i) => { const source = (detail.sourceRecords || detail.sources)?.find(s => s.id === ref.sourceId); const url = httpUrl(source?.url); return <div className="source-card" key={`${ref.sourceId}-${i}`}><div><strong>{source?.title || `来源资料 ${i + 1}`}</strong>{source?.author && <p>{source.author}</p>}{url && <p><a href={url} target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a></p>}{source?.textContent && <blockquote>{source.textContent}</blockquote>}{!source && <p className="muted">此版本已关联来源，服务尚未返回当时的来源内容。</p>}</div></div>; })}</div>;
}
