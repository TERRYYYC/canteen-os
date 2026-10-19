import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { ApiError, attemptFor, errorMessage, request, sendAttempt } from './api';
import type { Attempt } from './api';
import type { Amount, Ingredient, Media, Recipe, RecipeDetail, Source } from './types';
import { label, newRecipe } from './types';
import { date, I18nField, move, OrderButtons } from './Fields';
import { MediaPanel, newMediaDraft } from './MediaPanel';
import type { MediaDraft } from './MediaPanel';
import { History } from './History';
import { countAt, isFormatThree, newRow, QuantityFields, rowProblem, UnknownsPanel, withoutPosition } from './Quantities';

interface Draft { recipe: Recipe; version?: number; media: Media[]; sources: Source[]; mediaDraft?: MediaDraft; attempt?: Attempt }
const storageKey = (id?: string) => `shiwèi:draft:${id || 'new'}`;
function readDraft(id?: string): Draft | null { try { const raw = sessionStorage.getItem(storageKey(id)); const draft = raw ? JSON.parse(raw) : null; return draft?.recipe?.title && Array.isArray(draft.media) && Array.isArray(draft.sources) ? draft : null; } catch { return null; } }
function clearDraft(id?: string) { try { sessionStorage.removeItem(storageKey(id)); } catch { /* Saving still works when browser storage is unavailable. */ } }

export function Editor({ id, guard, onBack, onSaved, onArchived }: { id?: string; guard: MutableRefObject<(() => boolean) | null>; onBack: () => void; onSaved: (id: string, created: boolean) => void; onArchived: () => void }) {
  const [recipe, setRecipe] = useState<Recipe>(newRecipe);
  const [baseline, setBaseline] = useState('');
  const [version, setVersion] = useState<number | undefined>();
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [archived, setArchived] = useState(false);
  const [media, setMedia] = useState<Media[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [mediaDraft, setMediaDraft] = useState<MediaDraft>(newMediaDraft);
  const pendingMedia = Object.values(mediaDraft).some(value => value.trim());
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [assetBusy, setAssetBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const attempt = useRef<Attempt | undefined>(undefined);
  const dirty = ready && (JSON.stringify(recipe) !== baseline || pendingMedia);

  function adopt(detail: RecipeDetail) {
    setMediaDraft(newMediaDraft());
    setRecipe(structuredClone(detail.recipe)); setBaseline(JSON.stringify(detail.recipe)); setVersion(detail.version); setUpdatedAt(detail.updatedAt || detail.createdAt); setArchived(Boolean(detail.archivedAt)); setMedia(detail.media || []); setSources(detail.sourceRecords || detail.sources || []);
  }
  useEffect(() => {
    const controller = new AbortController(); setReady(false); setLoading(Boolean(id)); setLoadError('');
    async function load() {
      try {
        if (id) { const detail = await request<RecipeDetail>(`/recipes/${encodeURIComponent(id)}`, { signal: controller.signal }); if (controller.signal.aborted) return; adopt(detail); }
        else { const initial = newRecipe(); setRecipe(initial); setBaseline(JSON.stringify(initial)); }
        const draft = readDraft(id);
        if (draft) { setRecipe(draft.recipe); setVersion(draft.version); setMedia(draft.media); setSources(draft.sources); setMediaDraft({ ...newMediaDraft(), ...draft.mediaDraft }); attempt.current = draft.attempt; setUnknown(Boolean(draft.attempt)); setNotice(draft.attempt ? '已恢复上次未确认的保存请求，请先核对保存结果。' : '已恢复此标签页内的未保存内容。'); }
        setReady(true);
      } catch (e) { if (!controller.signal.aborted) setLoadError(errorMessage(e)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [id, reload]);
  useEffect(() => {
    if (!ready) return;
    try { if (dirty || unknown) sessionStorage.setItem(storageKey(id), JSON.stringify({ recipe, version, media, sources, mediaDraft, ...(unknown && attempt.current ? { attempt: attempt.current } : {}) } satisfies Draft)); else clearDraft(id); }
    catch { /* A full/disabled session storage must never prevent saving to the API. */ }
  }, [recipe, version, media, sources, mediaDraft, dirty, unknown, id, ready]);
  useEffect(() => {
    guard.current = () => { if (busy || assetBusy) { window.alert('正在保存，请稍等片刻。'); return false; } return !(dirty || unknown) || window.confirm(unknown ? '保存结果还未确认，稍后可回到此页继续核对。确定离开？' : '有尚未保存的内容，确定离开？此标签页会尽量保留草稿。'); };
    function beforeUnload(e: BeforeUnloadEvent) { if (dirty || unknown || busy || assetBusy) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', beforeUnload);
    return () => { guard.current = null; window.removeEventListener('beforeunload', beforeUnload); };
  }, [dirty, unknown, busy, assetBusy, guard]);
  function change(next: Recipe) { setRecipe(next); setError(''); setNotice(''); }
  function validate(): string | null {
    if (pendingMedia) return '还有视频链接或来源资料尚未添加。请先点击“添加视频”或“添加这份资料”，也可以清空这些输入后保存。';
    if (!label(recipe.title).trim()) return '至少填写一种语言的菜名。';
    if (recipe.baseServings !== undefined && (!Number.isSafeInteger(recipe.baseServings) || recipe.baseServings < 1)) return '份量应为正整数，也可以留空。';
    for (const [i, ingredient] of (recipe.ingredients || []).entries()) {
      if (!label(ingredient.name).trim()) return `请补充第 ${i + 1} 项食材的名称，或移除空行。`;
      if (isFormatThree(recipe)) { const problem = rowProblem(ingredient, i + 1); if (problem) return problem; continue; }
      const amount = ingredient.amount;
      if (!amount) return `第 ${i + 1} 项食材缺少用量记录。`;
      if (amount.kind === 'exact' && (!/^(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$/.test(amount.value) || !amount.unit.trim())) return `第 ${i + 1} 项食材请填写正数用量和单位。`;
      if (['to_taste', 'text'].includes(amount.kind) && !amount.raw?.trim()) return `请保留第 ${i + 1} 项食材的用量原文。`;
    }
    for (const [i, step] of (recipe.steps || []).entries()) if (!label(step.text).trim()) return `请补充步骤 ${i + 1}，或移除空步骤。`;
    for (const ref of recipe.assets || []) {
      if (ref.role === 'step' && !recipe.steps?.some(s => s.id === ref.stepId)) return '请为步骤素材选择对应的做法步骤。';
      if (ref.clip && (!Number.isFinite(ref.clip.start) || !Number.isFinite(ref.clip.end) || ref.clip.start < 0 || ref.clip.end <= ref.clip.start)) return '视频片段的结束时间必须晚于开始时间。';
    }
    return null;
  }
  async function runSave(operation: Attempt) {
    attempt.current = operation; setBusy(true); setError(''); setNotice('');
    // Persist the exact request before dispatch: reloading during a response loss must reuse its key.
    try { sessionStorage.setItem(storageKey(id), JSON.stringify({ recipe, version, media, sources, mediaDraft, attempt: operation } satisfies Draft)); } catch { /* optional recovery */ }
    try {
      const result = await sendAttempt<RecipeDetail>(operation);
      attempt.current = undefined; clearDraft(id); setUnknown(false); setConflict(false); adopt(result);
      if (operation.path.endsWith('/archive')) { onArchived(); return; }
      setNotice('已保存，所有资料都收好了。'); onSaved(result.id, !id);
    } catch (e) {
      const uncertain = e instanceof ApiError && e.uncertain;
      const isConflict = e instanceof ApiError && [409, 412].includes(e.status);
      setUnknown(uncertain); setConflict(isConflict);
      if (!uncertain) { attempt.current = undefined; try { sessionStorage.setItem(storageKey(id), JSON.stringify({ recipe, version, media, sources, mediaDraft } satisfies Draft)); } catch { /* optional recovery */ } }
      setError(uncertain ? '保存结果暂时无法确认。内容已保留，请点击“核对保存结果”；不会重复新建菜谱。' : isConflict ? '这款菜谱已有更新。你的输入已保留，先查看最新版本再决定如何处理。' : errorMessage(e));
    } finally { setBusy(false); }
  }
  function save() {
    if (unknown && attempt.current) { void runSave(attempt.current); return; }
    const invalid = validate(); if (invalid) { setError(invalid); return; }
    void runSave(attemptFor(attempt.current, id ? `/recipes/${id}` : '/recipes', id ? 'PUT' : 'POST', recipe, id ? version : undefined));
  }
  async function loadLatest() {
    if (!id || !window.confirm('加载最新版本会替换当前未保存的输入。建议先复制需要保留的内容。确定加载？')) return;
    clearDraft(id); attempt.current = undefined; setUnknown(false); setConflict(false); setNotice(''); setError(''); setReload(x => x + 1);
  }
  function archive() {
    if (busy || assetBusy || unknown) return;
    if (!id || !window.confirm(dirty ? '有未保存的修改，归档不会保存这些修改。确定归档这款菜谱？' : '归档后，这款菜谱将不再出现在菜谱库中。确定归档？')) return;
    void runSave(attemptFor(undefined, `/recipes/${id}/archive`, 'POST', {}, version));
  }
  function ingredientChange(index: number, ingredient: Ingredient) { change({ ...recipe, ingredients: recipe.ingredients?.map((v, i) => i === index ? ingredient : v) }); }
  // Unclear entries of a removed step or row stay, without the position that no longer exists.
  function unknownsWithout(key: 'stepId' | 'ingredientRowId', rowId: string, what: string): Pick<Recipe, 'unknowns'> | null {
    const count = countAt(recipe, key, rowId);
    if (count && !window.confirm(`这${what}有 ${count} 条没说清的地方。移除后这些条目仍保留，只是不再指向这${what}。继续？`)) return null;
    return recipe.unknowns ? { unknowns: withoutPosition(recipe.unknowns, key, rowId) } : {};
  }
  if (loading) return <p className="loading" role="status">正在打开菜谱…</p>;
  if (loadError) return <div className="notice error" role="alert">{loadError}<button onClick={() => setReload(x => x + 1)}>重新加载</button><button onClick={onBack}>返回菜谱库</button></div>;
  const disabled = busy || unknown || archived;
  return <><button className="back quiet" onClick={onBack}>← 返回菜谱库</button><div className="editor-heading"><div><p className="eyebrow">{id ? 'RECIPE NOTEBOOK' : 'A NEW RECIPE'}</p><h1>{id ? label(recipe.title) || '编辑菜谱' : '收藏一款新做法'}</h1><p className="muted">{id ? `第 ${version ?? '—'} 版 · ${date(updatedAt)}` : '只填菜名也可以。其余的，等灵感来的时候再补。'}</p></div>{id && <button onClick={() => setHistoryOpen(v => !v)}>{historyOpen ? '收起历史' : '查看历史版本'}</button>}</div>
    {notice && <p className="notice success" role="status">{notice}</p>}{archived && <p className="notice">此菜谱已归档，内容只读。</p>}{error && <div className="notice error" role="alert">{error}{conflict && <div className="actions"><button onClick={() => setHistoryOpen(true)}>查看已保存版本</button><button onClick={() => void loadLatest()}>放弃输入并加载最新版本</button></div>}</div>}
    {unknown && <div className="notice"><p>核对完成前，暂时锁定编辑，避免重复保存不同内容。</p><button className="primary" disabled={busy} onClick={save}>{busy ? '正在核对…' : '核对保存结果'}</button></div>}
    {historyOpen && id && <History key={`${id}-${conflict}`} id={id} version={version || 1} />}
    <div className="editor-layout"><aside className="editor-index"><span>这份菜谱</span><a href="#basic" onClick={e => { e.preventDefault(); document.getElementById('basic')?.scrollIntoView({ behavior: 'smooth' }); }}>01 基本信息</a><a href="#ingredients" onClick={e => { e.preventDefault(); document.getElementById('ingredients')?.scrollIntoView({ behavior: 'smooth' }); }}>02 食材与调料</a><a href="#steps" onClick={e => { e.preventDefault(); document.getElementById('steps')?.scrollIntoView({ behavior: 'smooth' }); }}>03 做法步骤</a>{(isFormatThree(recipe) || recipe.unknowns) && <a href="#unknowns" onClick={e => { e.preventDefault(); document.getElementById('unknowns')?.scrollIntoView({ behavior: 'smooth' }); }}>没说清的地方</a>}<p>不确定的用量<br />可以先留空。</p></aside><div className="editor-content"><fieldset disabled={disabled} className="editor-fields">
    <section className="panel" id="basic"><div className="section-heading"><span className="section-number">01</span><div><h2>基本信息</h2><p>给这款做法一个名字，同名也没有关系。</p></div></div><I18nField title="菜名" required value={recipe.title} onChange={title => change({ ...recipe, title })} /><I18nField title="一句话描述 / 备注" multiline value={recipe.description} onChange={description => { const next = { ...recipe }; if (Object.keys(description).length) next.description = description; else delete next.description; change(next); }} /><div className="two-col"><label className="field"><span>标签（用逗号分隔）</span><input value={(recipe.tags || []).join('，')} onChange={e => change({ ...recipe, tags: [...new Set(e.target.value.split(/[,，]/).map(v => v.trim()))] })} onBlur={() => change({ ...recipe, tags: recipe.tags?.filter(Boolean) })} placeholder="家常菜，收藏，周末" /></label><label className="field"><span>份量（可留空）</span><input type="number" min="1" step="1" value={recipe.baseServings ?? ''} onChange={e => { const next = { ...recipe }; if (e.target.value === '') delete next.baseServings; else next.baseServings = Number(e.target.value); change(next); }} placeholder="未知" /></label></div></section>
    <section className="panel" id="ingredients"><div className="section-heading"><span className="section-number">02</span><div><h2>食材与调料</h2><p>按原方记录，少许、适量和未知各自保留。</p></div></div>{recipe.ingredients?.map((ingredient, index) => <div className="ingredient-row" key={ingredient.id}><div className="row-top"><strong>食材 {index + 1}</strong><OrderButtons index={index} count={recipe.ingredients!.length} onMove={by => change({ ...recipe, ingredients: move(recipe.ingredients!, index, by) })} onRemove={() => { const kept = unknownsWithout('ingredientRowId', ingredient.id, '项食材'); if (kept) change({ ...recipe, ...kept, ingredients: recipe.ingredients?.filter((_, i) => i !== index) }); }} /></div><div className="ingredient-name"><I18nField title="食材名称" value={ingredient.name} onChange={name => ingredientChange(index, { ...ingredient, name })} /><label className="field"><span>类型</span><select value={ingredient.role || 'unspecified'} onChange={e => ingredientChange(index, { ...ingredient, role: e.target.value as Ingredient['role'] })}><option value="unspecified">未分类</option><option value="main">食材</option><option value="seasoning">调料</option></select></label></div>{isFormatThree(recipe) ? <QuantityFields row={ingredient} onChange={row => ingredientChange(index, row)} /> : ingredient.amount && <AmountField amount={ingredient.amount} onChange={amount => ingredientChange(index, { ...ingredient, amount })} />}<details className="ingredient-notes"><summary>原文与预处理{ingredient.rawText || ingredient.preparation ? ' · 已填写' : '（可选）'}</summary><label className="field"><span>配料原文</span><textarea value={ingredient.rawText || ''} onChange={e => ingredientChange(index, { ...ingredient, rawText: e.target.value })} /></label><I18nField title="预处理" value={ingredient.preparation} onChange={preparation => { const next = { ...ingredient }; if (Object.keys(preparation).length) next.preparation = preparation; else delete next.preparation; ingredientChange(index, next); }} /></details></div>)}<button className="add-row" onClick={() => change({ ...recipe, ingredients: [...(recipe.ingredients || []), newRow(recipe)] })}>＋ 添加食材或调料</button></section>
    <section className="panel" id="steps"><div className="section-heading"><span className="section-number">03</span><div><h2>做法步骤</h2><p>把每一步的火候、时间和小诀窍都留下。</p></div></div>{recipe.steps?.map((step, index) => <div className="step-row" key={step.id}><div className="row-top"><strong>步骤 {index + 1}</strong><OrderButtons index={index} count={recipe.steps!.length} onMove={by => change({ ...recipe, steps: move(recipe.steps!, index, by) })} onRemove={() => { const linked = recipe.assets?.some(a => a.role === 'step' && a.stepId === step.id); if (linked && !window.confirm('这一步关联了素材。移除步骤后，素材将保留为参考资料。继续？')) return; const kept = unknownsWithout('stepId', step.id, '一步'); if (!kept) return; change({ ...recipe, ...kept, steps: recipe.steps?.filter((_, i) => i !== index), assets: recipe.assets?.map(a => { if (a.role !== 'step' || a.stepId !== step.id) return a; const next = { ...a, role: 'reference' as const }; delete next.stepId; return next; }) }); }} /></div><I18nField title="步骤说明" multiline value={step.text} onChange={text => change({ ...recipe, steps: recipe.steps?.map((s, i) => i === index ? { ...s, text } : s) })} /></div>)}<button className="add-row" onClick={() => change({ ...recipe, steps: [...(recipe.steps || []), { id: crypto.randomUUID(), text: {} }] })}>＋ 添加一个步骤</button></section>
    {(isFormatThree(recipe) || recipe.unknowns) && <section className="panel" id="unknowns"><div className="section-heading"><span className="section-number">注</span><div><h2>没说清的地方</h2><p>原方里没说清的地方，原话只在这里看得到。问清一条就删掉一条，保存成新版本。</p></div></div><UnknownsPanel recipe={recipe} onChange={change} /></section>}
    <MediaPanel recipe={recipe} media={media} sources={sources} onChange={change} onMedia={item => { setMedia(prev => [...prev.filter(m => m.assetId !== item.assetId), item]); setRecipe(prev => ({ ...prev, assets: [...(prev.assets || []), { assetId: item.assetId, role: 'reference' }] })); }} onSource={item => { setSources(prev => [...prev.filter(s => s.id !== item.id), item]); setRecipe(prev => ({ ...prev, sources: [...(prev.sources || []), { sourceId: item.id }] })); }} onBusy={setAssetBusy} draft={mediaDraft} onDraftChange={setMediaDraft} />
    </fieldset><div className="savebar"><div><strong>{unknown ? '等待确认保存结果' : dirty ? '有内容尚未保存' : id ? '内容已保存' : '准备好就收藏吧'}</strong><span>{id ? '每次保存都会保留历史版本' : '每款做法都会独立保存'}</span></div><button className="primary" onClick={save} disabled={busy || assetBusy || archived || (!unknown && !!id && !dirty)}>{busy ? '保存中…' : unknown ? '核对保存结果' : id ? '保存修改' : '收藏这款菜谱'}</button></div>{id && !archived && <div className="archive-area"><button className="quiet danger" disabled={disabled || assetBusy} onClick={archive}>归档这款菜谱</button><span>从菜谱库中收起，保留历史记录。</span></div>}</div></div>
  </>;
}

function AmountField({ amount, onChange }: { amount: Amount; onChange: (amount: Amount) => void }) {
  function mode(kind: Amount['kind']) {
    if (kind === 'unknown') onChange({ kind, ...(amount.raw ? { raw: amount.raw } : {}) });
    else if (kind === 'exact') onChange({ kind, value: '', unit: '', ...(amount.raw ? { raw: amount.raw } : {}) });
    else onChange({ kind, raw: amount.raw || (kind === 'to_taste' ? '适量' : '') });
  }
  return <div className="amount-fields"><label className="field"><span>用量记录</span><select value={amount.kind} onChange={e => mode(e.target.value as Amount['kind'])}><option value="unknown">未知 / 暂未填写</option><option value="exact">准确用量</option><option value="to_taste">适量</option><option value="text">按原文描述</option></select></label>{amount.kind === 'exact' && <><label className="field"><span>数量</span><input inputMode="decimal" value={amount.value} onChange={e => onChange({ ...amount, value: e.target.value })} placeholder="例如 0.5" /></label><label className="field"><span>单位</span><input value={amount.unit} onChange={e => onChange({ ...amount, unit: e.target.value })} placeholder="克 / 勺 / 个" /></label></>}<label className="field amount-raw"><span>{amount.kind === 'unknown' || amount.kind === 'exact' ? '用量原文（可选）' : '用量原文'}</span><input value={amount.raw || ''} onChange={e => onChange({ ...amount, raw: e.target.value })} placeholder={amount.kind === 'text' ? '例如 一小把' : amount.kind === 'to_taste' ? '例如 适量' : '保留原来的表达'} /></label></div>;
}
