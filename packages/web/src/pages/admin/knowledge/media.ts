import { h } from '../../../dom';
import { getKnowledgeApi, type Media, type Source, type RecipeDetail } from '../../../api/knowledge';
import { button, field, input, select, section, safeExternal, jsonEvidence, type Words } from './ui';
import type { Draft } from './model';

export interface MediaView {
  t: Words; current(): boolean; image(url: string, target: HTMLElement): void;
  changed(repaint?: boolean): void; paint(): void; error(error: unknown): string;
}
export function showMedia(media: Media[], view: MediaView): HTMLElement {
  const { t } = view;
  return h('div', {}, ...media.map(item => {
    const card = h('div', { class: 'kb-row' });
    const external = safeExternal(item.url);
    if (item.kind === 'image') {
      if (external) card.append(h('img', { src: external, alt: t('菜谱图片', 'Recipe image', 'Зображення рецепта'), loading: 'lazy', referrerpolicy: 'no-referrer' }));
      else if (item.url?.startsWith('/api/v1/assets/')) view.image(item.url, card);
    }
    if (external) card.append(h('a', { href: external, target: '_blank', rel: 'noopener noreferrer' }, item.kind === 'video' ? t('打开视频', 'Open video', 'Відкрити відео') : t('打开原图', 'Open image', 'Відкрити зображення')));
    card.append(jsonEvidence({ assetId: item.assetId }, t('资料标识', 'Record identifiers', 'Ідентифікатори запису')));
    if (item.clip) card.append(h('p', {}, `${item.clip.start}–${item.clip.end} s`));
    if (item.rights) card.append(h('small', {}, `${item.rights.license}${item.rights.author ? ` · ${item.rights.author}` : ''}`));
    return card;
  }));
}
export function readonlyDetail(detail: RecipeDetail, view: MediaView): HTMLElement {
  const { t } = view;
  // A historical revision is self-contained; never resolve its source records against current ones.
  return h('div', {}, jsonEvidence(detail.recipe, t('菜谱完整内容（只读）', 'Complete recipe (read only)', 'Повний рецепт (лише читання)')),
    showMedia(detail.media || [], view), jsonEvidence(detail.sourceRecords || detail.sources || [], t('当时的来源', 'Sources at this revision', 'Джерела цієї версії')),
    detail.legacy ? jsonEvidence(detail.legacy, t('当时的导入原文', 'Imported evidence at this revision', 'Імпортовані дані цієї версії')) : null);
}
export function mediaEditor(draft: Draft, view: MediaView): HTMLElement[] {
  const { t } = view, recipe = draft.recipe;
  const textField = (key: string, title: string, multiline = false) => field(title, input(draft.pending[key] || '', value => { draft.pending[key] = value; view.changed(); }, multiline));
  async function add(kind: 'source' | 'external' | 'upload', file?: File) {
    if (draft.busy || draft.unknown) return;
    if (kind === 'external' && !safeExternal(draft.pending.assetUrl)) { draft.error = t('请输入完整的 http/https 网址。', 'Enter a complete http/https URL.', 'Введіть повну адресу http/https.'); view.paint(); return; }
    if (kind === 'source' && ((draft.pending.sourceUrl?.trim() && !safeExternal(draft.pending.sourceUrl)) || (!draft.pending.sourceText?.trim() && !safeExternal(draft.pending.sourceUrl)))) { draft.error = t('请填写来源文字或网址。', 'Enter source text or a URL.', 'Введіть текст джерела або URL.'); view.paint(); return; }
    if (file && (file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { draft.error = t('请选择不超过 8 MiB 的 JPEG、PNG 或 WebP 图片。', 'Choose a JPEG, PNG or WebP image up to 8 MiB.', 'Виберіть JPEG, PNG або WebP до 8 MiB.'); view.paint(); return; }
    const api = getKnowledgeApi(), operation = draft.registration.beginOperation('write');
    draft.busy = true; draft.error = ''; view.paint();
    try {
      if (kind === 'source') {
        const value = { kind: draft.pending.sourceUrl?.trim() ? 'web' : 'text', ...(draft.pending.sourceTitle?.trim() ? { title: draft.pending.sourceTitle } : {}), ...(draft.pending.sourceAuthor?.trim() ? { author: draft.pending.sourceAuthor } : {}), ...(draft.pending.sourceText?.trim() ? { textContent: draft.pending.sourceText } : {}), ...(draft.pending.sourceUrl?.trim() ? { url: draft.pending.sourceUrl.trim() } : {}) };
        const { data } = await api.request<Source>('/sources', { method: 'POST', body: JSON.stringify(value) });
        if (!view.current()) return;
        draft.sources.push(data); (recipe.sources ??= []).push({ sourceId: data.id });
        for (const key of ['sourceTitle', 'sourceAuthor', 'sourceText', 'sourceUrl']) delete draft.pending[key];
      } else {
        let body: FormData | string;
        if (file) { body = new FormData(); body.append('file', file); }
        else body = JSON.stringify({ kind: draft.pending.assetKind || 'video', url: draft.pending.assetUrl?.trim() });
        const { data } = await api.request<{ id: string; kind: string; url: string; status: string }>(file ? '/assets/upload' : '/assets/external', { method: 'POST', body });
        if (!view.current()) return;
        draft.media.push({ assetId: data.id, kind: data.kind, url: data.url, status: data.status });
        (recipe.assets ??= []).push({ assetId: data.id, role: 'reference' });
        if (!file) { delete draft.pending.assetUrl; delete draft.pending.assetKind; }
      }
      draft.generation++;
      draft.notice = t('资料已添加到当前编辑内容，请保存菜谱。', 'Added to this draft. Save the recipe to attach it.', 'Додано до чернетки. Збережіть рецепт.');
    } catch (error) { if (view.current()) draft.error = view.error(error); }
    finally { draft.registration.settleOperation(operation, 'completed'); draft.busy = false; if (view.current()) view.paint(); }
  }
  const materialRows = (recipe.assets || []).map((ref, index) => {
    const media = draft.media.find(m => m.assetId === ref.assetId);
    const controls = h('div', { class: 'kb-row' }, media ? showMedia([{ ...media, ...ref }], view) : h('p', {}, t('素材资料', 'Asset', 'Матеріал')));
    controls.append(field(t('用途', 'Use', 'Призначення'), select(ref.role, [['cover', t('封面', 'Cover', 'Обкладинка')], ['reference', t('参考', 'Reference', 'Довідка')], ['step', t('步骤', 'Step', 'Крок')]], value => {
      ref.role = value as typeof ref.role;
      if (value !== 'step') delete ref.stepId; else ref.stepId = recipe.steps?.[0]?.id;
      view.changed(true);
    })));
    if (ref.role === 'step') controls.append(field(t('关联步骤', 'Linked step', "Пов’язаний крок"), select(ref.stepId || '', [['', t('请选择步骤', 'Choose a step', 'Виберіть крок')], ...(recipe.steps || []).map((step, i) => [step.id, `${i + 1}. ${Object.values(step.text).find(Boolean) || ''}`] as [string, string])], value => { ref.stepId = value; view.changed(); })));
    if (media?.kind === 'video') {
      const clip = h('input', { type: 'checkbox', checked: !!ref.clip });
      clip.addEventListener('change', () => { if (clip.checked) ref.clip = { start: 0, end: 1 }; else delete ref.clip; view.changed(true); });
      controls.append(field(t('记录视频片段', 'Record video clip', 'Записати фрагмент відео'), clip));
      if (ref.clip) controls.append(h('div', { class: 'kb-grid' }, field(t('开始秒数', 'Start (seconds)', 'Початок (секунди)'), input(String(ref.clip.start), value => { ref.clip!.start = value.trim() ? Number(value) : NaN; view.changed(); })), field(t('结束秒数', 'End (seconds)', 'Кінець (секунди)'), input(String(ref.clip.end), value => { ref.clip!.end = value.trim() ? Number(value) : NaN; view.changed(); }))));
    }
    controls.append(button(t('移除素材引用', 'Remove asset reference', 'Вилучити посилання на матеріал'), () => { recipe.assets!.splice(index, 1); view.changed(true); }));
    return controls;
  });
  const upload = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  upload.addEventListener('change', () => { const file = upload.files?.[0]; if (file) void add('upload', file); });
  const material = section(t('图片与视频', 'Images and videos', 'Зображення та відео'), ...materialRows,
    h('div', { class: 'kb-grid' }, field(t('素材类型', 'Asset type', 'Тип матеріалу'), select(draft.pending.assetKind || 'video', [['video', t('视频', 'Video', 'Відео')], ['image', t('图片', 'Image', 'Зображення')]], value => { draft.pending.assetKind = value; view.changed(); })), textField('assetUrl', t('外部素材网址', 'External asset URL', 'Зовнішня адреса матеріалу'))),
    button(t('添加外链素材', 'Add external asset', 'Додати зовнішній матеріал'), () => void add('external')),
    field(t('上传图片（最多 8 MiB）', 'Upload image (up to 8 MiB)', 'Завантажити зображення (до 8 MiB)'), upload));
  const sourceRows = (recipe.sources || []).map((ref, index) => {
    const source = draft.sources.find(s => s.id === ref.sourceId), url = safeExternal(source?.url);
    return h('div', { class: 'kb-row' }, h('strong', {}, source?.title || source?.url || t('来源资料', 'Source', 'Джерело')), source?.author ? h('p', {}, source.author) : null,
      url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, url) : null,
      source?.textContent ? h('p', { style: 'white-space:pre-wrap' }, source.textContent) : null,
      ref.evidence ? jsonEvidence(ref.evidence, t('引用原始证据', 'Reference evidence', 'Дані посилання')) : null,
      button(t('移除来源引用', 'Remove source reference', 'Вилучити посилання на джерело'), () => { recipe.sources!.splice(index, 1); view.changed(true); }));
  });
  return [material, section(t('来源资料', 'Sources', 'Джерела'), ...sourceRows, textField('sourceTitle', t('来源标题', 'Source title', 'Назва джерела')), textField('sourceAuthor', t('作者', 'Author', 'Автор')), textField('sourceUrl', t('来源网址', 'Source URL', 'URL джерела')), textField('sourceText', t('来源原文', 'Source text', 'Текст джерела'), true), button(t('添加这份资料', 'Add source', 'Додати джерело'), () => void add('source')))];
}
