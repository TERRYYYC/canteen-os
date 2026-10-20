import { useState } from 'react';
import { errorMessage, request } from './api';
import type { AssetRef, Media, Recipe, Source } from './types';
import { httpUrl, label } from './types';

export interface MediaDraft { video: string; sourceTitle: string; sourceUrl: string; sourceText: string; sourceAuthor: string }
export const newMediaDraft = (): MediaDraft => ({ video: '', sourceTitle: '', sourceUrl: '', sourceText: '', sourceAuthor: '' });

export function MediaPanel({ recipe, media, sources, onChange, onMedia, onSource, onBusy, draft, onDraftChange }: { recipe: Recipe; media: Media[]; sources: Source[]; onChange: (recipe: Recipe) => void; onMedia: (media: Media) => void; onSource: (source: Source) => void; onBusy: (busy: boolean) => void; draft: MediaDraft; onDraftChange: (draft: MediaDraft) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { video, sourceTitle, sourceUrl, sourceText, sourceAuthor } = draft;
  async function addAsset(file?: File) {
    if (!file && !video.trim()) return;
    setBusy(true); onBusy(true); setError('');
    try {
      let asset: { id: string; kind: string; url: string; status: string };
      if (file) {
        if (file.size > 8 * 1024 * 1024) throw new Error('图片需小于 8 MiB。');
        const data = new FormData(); data.append('file', file);
        asset = await request('/assets/upload', { method: 'POST', body: data });
      } else {
        if (!/^https?:\/\//i.test(video.trim())) throw new Error('请填写以 http:// 或 https:// 开头的视频链接。');
        asset = await request('/assets/external', { method: 'POST', body: JSON.stringify({ kind: 'video', url: video.trim() }) });
      }
      onMedia({ assetId: asset.id, kind: asset.kind, url: asset.url, status: asset.status });
      if (!file) onDraftChange({ ...draft, video: '' });
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); onBusy(false); }
  }
  async function addSource() {
    setBusy(true); onBusy(true); setError('');
    try {
      if (!sourceUrl.trim() && !sourceText.trim()) throw new Error('填写来源链接或摘录原文即可添加。');
      if (sourceUrl.trim() && !/^https?:\/\//i.test(sourceUrl.trim())) throw new Error('来源链接需以 http:// 或 https:// 开头。');
      const source = await request<Source>('/sources', { method: 'POST', body: JSON.stringify({ kind: sourceUrl.trim() ? 'web' : 'text', ...(sourceTitle.trim() ? { title: sourceTitle.trim() } : {}), ...(sourceAuthor.trim() ? { author: sourceAuthor.trim() } : {}), ...(sourceUrl.trim() ? { url: sourceUrl.trim() } : {}), ...(sourceText.trim() ? { textContent: sourceText.trim() } : {}) }) });
      onSource(source);
      onDraftChange({ ...draft, sourceTitle: '', sourceUrl: '', sourceText: '', sourceAuthor: '' });
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); onBusy(false); }
  }
  function update(index: number, value: AssetRef) { onChange({ ...recipe, assets: recipe.assets?.map((a, i) => i === index ? value : a) }); }
  return <fieldset disabled={busy} className="media-section"><section className="panel"><div className="section-heading"><span className="section-number">04</span><div><h2>图片与视频</h2><p>留下成品、过程，或者值得反复看的教程。</p></div></div>
    <div className="asset-list">{recipe.assets?.map((ref, index) => {
      const asset = media.find(m => m.assetId === ref.assetId);
      const safe = httpUrl(asset?.url);
      return <article className="asset" key={`${ref.assetId}-${index}`}><div className="asset-preview">{asset?.kind === 'image' && safe ? <img src={safe} alt="菜谱参考图片" loading="lazy" /> : <span>{asset?.kind === 'video' ? '▶ 视频资料' : '图片资料'}</span>}</div><div className="asset-info">{safe && <a href={safe} target="_blank" rel="noopener noreferrer">{asset?.kind === 'video' ? '打开视频链接 ↗' : '查看原图 ↗'}</a>}{asset?.kind === 'video' && <small>视频保存在原平台，链接已登记。</small>}
        <label className="field"><span>用途</span><select value={ref.role} onChange={e => { const role = e.target.value as AssetRef['role']; const next = { ...ref, role }; if (role === 'step') next.stepId = recipe.steps?.[0]?.id; else delete next.stepId; update(index, next); }}><option value="reference">参考资料</option><option value="cover">封面</option><option value="step" disabled={!recipe.steps?.length}>步骤配图 / 视频</option></select></label>
        {ref.role === 'step' && <label className="field"><span>关联步骤</span><select value={ref.stepId || ''} onChange={e => update(index, { ...ref, stepId: e.target.value })}>{recipe.steps?.map((s, i) => <option value={s.id} key={s.id}>步骤 {i + 1} · {label(s.text).slice(0, 28) || '待补充'}</option>)}</select></label>}
        {asset?.kind === 'video' && <details><summary>视频片段{ref.clip ? ' · 已设置' : '（可选）'}</summary><label className="check"><input type="checkbox" checked={Boolean(ref.clip)} onChange={e => { const next = { ...ref }; if (e.target.checked) next.clip = { start: 0, end: 1 }; else delete next.clip; update(index, next); }} />记录片段时间</label>{ref.clip && <div className="two-col"><label className="field"><span>开始（秒）</span><input type="number" min="0" step="any" value={ref.clip.start} onChange={e => update(index, { ...ref, clip: { start: Number(e.target.value), end: ref.clip!.end } })} /></label><label className="field"><span>结束（秒）</span><input type="number" min="0" step="any" value={ref.clip.end} onChange={e => update(index, { ...ref, clip: { start: ref.clip!.start, end: Number(e.target.value) } })} /></label></div>}</details>}
        <button className="quiet danger" type="button" onClick={() => onChange({ ...recipe, assets: recipe.assets?.filter((_, i) => i !== index) })}>移除关联</button></div></article>;
    })}</div>
    <div className="upload-area"><label className="upload-button">＋ 上传图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void addAsset(file); }} /></label><span>JPG、PNG、WebP · 最大 8 MiB</span></div>
    <div className="inline-add"><label className="field"><span>视频链接</span><input type="url" value={video} onChange={e => onDraftChange({ ...draft, video: e.target.value })} placeholder="https://…" /></label><button type="button" onClick={() => void addAsset()} disabled={!video.trim()}>添加视频</button></div>
  </section><section className="panel"><div className="section-heading"><span className="section-number">05</span><div><h2>资料来源</h2><p>记下出处，也保留原来的表达。</p></div></div>
    {recipe.sources?.map((ref, index) => { const source = sources.find(s => s.id === ref.sourceId); const safe = httpUrl(source?.url); return <article className="source-card" key={`${ref.sourceId}-${index}`}><div><strong>{source?.title || `来源资料 ${index + 1}`}</strong>{source?.author && <p className="muted">{source.author}</p>}{safe && <a href={safe} target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a>}{source?.textContent && <blockquote>{source.textContent}</blockquote>}{!source && <p className="muted">已关联这份资料；来源内容尚未由服务返回。</p>}{ref.evidence && <details><summary>原始证据</summary><pre className="evidence">{JSON.stringify(ref.evidence, null, 2)}</pre></details>}</div><button className="quiet danger" type="button" onClick={() => onChange({ ...recipe, sources: recipe.sources?.filter((_, i) => i !== index) })}>移除关联</button></article>; })}
    <details className="add-source"><summary>＋ 添加来源</summary><div className="two-col"><label className="field"><span>资料名称</span><input value={sourceTitle} onChange={e => onDraftChange({ ...draft, sourceTitle: e.target.value })} /></label><label className="field"><span>作者 / 发布者</span><input value={sourceAuthor} onChange={e => onDraftChange({ ...draft, sourceAuthor: e.target.value })} /></label></div><label className="field"><span>来源链接</span><input type="url" value={sourceUrl} onChange={e => onDraftChange({ ...draft, sourceUrl: e.target.value })} placeholder="https://…" /></label><label className="field"><span>原文或笔记</span><textarea rows={4} value={sourceText} onChange={e => onDraftChange({ ...draft, sourceText: e.target.value })} /></label><button type="button" onClick={() => void addSource()}>添加这份资料</button></details>
  </section>{busy && <p role="status" className="notice">正在保存素材资料…</p>}{error && <p role="alert" className="notice error">{error} 如果刚才连接中断，请先检查是否已添加成功。</p>}</fieldset>;
}
