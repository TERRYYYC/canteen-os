/** Native SQLite library. Drafts survive routes/language changes within one access session. */
import './knowledge.css';
import './knowledge/adoption.css';
import { h, replace } from '../../dom';
import type { PageCtx } from '../../types';
import { getAuthSessionVersion, onAuthSessionChange } from '../../admin/token';
import { onRoute } from '../../router';
import { getKnowledgeApi, KnowledgeError, createAttempt, type RecipeDetail, type RecipeList, type Revision, type SourceIllustrationLinks } from '../../api/knowledge';
import { registerAuxiliaryEdits } from '../../view-models/reload-safety';
import { words, button, field, input, select, multilingual, section, order, jsonEvidence, safeExternal, type Words } from './knowledge/ui';
import { fresh, editable, dirty, pending, validate, removeStep, type Draft } from './knowledge/model';
import { mediaEditor, readonlyDetail, type MediaView } from './knowledge/media';
import {workflowPanel,kitchenFields,workflowBlocked} from './knowledge/adoption';
import {contractErrorText} from '../../admin/kit';
import { sourceIllustrationPanel, syncSourceIllustrationLinks } from './knowledge/source-illustrations';

const drafts = new Map<string, Draft>();
let mounted: HTMLElement | null = null;
const urls = new Set<string>();
const coverControllers = new Set<AbortController>();
let coverObserver: IntersectionObserver | null = null;
function releaseImages() { coverObserver?.disconnect(); coverObserver = null; for (const controller of coverControllers) controller.abort(); coverControllers.clear(); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); }
onRoute(releaseImages, false);
onAuthSessionChange(() => {
  for (const draft of drafts.values()) draft.registration.dispose();
  drafts.clear(); releaseImages();
  if (mounted?.isConnected) replace(mounted);
});
window.addEventListener('beforeunload', event => {
  if ([...drafts.values()].some(d => dirty(d) || d.busy || d.unknown || workflowBlocked(d))) { event.preventDefault(); event.returnValue = ''; }
});
function message(error: unknown, t: Words, lang: PageCtx['lang']): string {
  if (error instanceof KnowledgeError) {
    const primary=contractErrorText(error.code,lang);if(primary)return primary;
    if (error.status === 401) return t('访问链接已失效或会话已更换，请重新打开授权链接。', 'Your access link expired or changed. Reopen an authorized link.', 'Посилання доступу недійсне або сеанс змінено. Відкрийте посилання знову.');
    if (error.status === 403) return t('当前权限只能查看菜谱，不能修改。输入仍保留。', 'This access is read only. Your input is preserved.', 'Цей доступ лише для читання. Введені дані збережено.');
    if (error.uncertain) return t('菜谱知识库暂时无法连接。请重试；当前输入已保留。', 'The recipe library is unavailable. Retry; your input is preserved.', 'Бібліотека рецептів недоступна. Спробуйте знову; введені дані збережено.');
    return `${t('操作未完成', 'Request failed', 'Запит не виконано')} (${error.status} / ${error.code}): ${error.message}`;
  }
  return t('操作未完成，请重试。', 'Request failed. Please retry.', 'Запит не виконано. Спробуйте знову.');
}
const href = (id = '') => `#/admin/knowledge${id ? `/${encodeURIComponent(id)}` : ''}`;
function label(value: Record<string, string | undefined> | undefined, lang: string): string { return value?.[lang] || value?.zh || value?.en || value?.uk || ''; }
function status(text: string, error = false): HTMLElement { return h('p', { class: 'kb-status', role: error ? 'alert' : 'status' }, text); }
export async function render(el: HTMLElement, ctx: PageCtx, rest: string): Promise<void> {
  releaseImages();
  const root = h('div', { class: 'kb', 'data-testid': 'knowledge-library' });
  replace(el, root); mounted = root;
  const t = words(ctx.lang), auth = getAuthSessionVersion();
  const active = () => root.isConnected && getAuthSessionVersion() === auth;
  if (rest === 'inbox') { ctx.setReloadCoverage?.('read-only'); const { renderInbox } = await import('./knowledge/inbox.js'); if(active()) await renderInbox(root,ctx,active); return; }
  const historical=/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/revisions\/([1-9][0-9]*)$/.exec(rest);
  if(historical){
    ctx.setReloadCoverage?.('read-only');
    const [,recipeId,version]=historical;
    root.append(status(t('正在读取固定菜谱版本…','Loading frozen recipe version…','Завантаження версії рецепта…')));
    try{
      const {data}=await getKnowledgeApi().request<RecipeDetail>(`/recipes/${recipeId}/revisions/${version}`);
      if(!active())return;
      const view:MediaView={t,current:active,changed(){},paint(){},error:error=>message(error,t,ctx.lang),image(url,target){
        void getKnowledgeApi().image(url).then(blob=>{
          if(!active()||!target.isConnected)return;
          const objectUrl=URL.createObjectURL(blob);urls.add(objectUrl);
          target.prepend(h('img',{src:objectUrl,alt:t('菜谱图片','Recipe image','Зображення рецепта')}));
        }).catch(error=>{if(active()&&target.isConnected)target.append(status(message(error,t,ctx.lang),true));});
      }};
      replace(root,h('div',{class:'kb-header'},h('h2',{},`${t('菜谱固定版本','Frozen recipe version','Версія рецепта')} v${data.version}`),h('a',{href:href(recipeId)},t('打开当前菜谱','Open current recipe','Відкрити поточний рецепт'))),readonlyDetail(data,view));
    }catch(error){if(active())replace(root,status(message(error,t,ctx.lang),true),h('a',{href:href(recipeId)},t('返回菜谱','Back to recipe','Назад до рецепта')));}
    return;
  }
  if (!rest) { ctx.setReloadCoverage?.('read-only'); await library(root, ctx, active); return; }
  if (rest !== 'new' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(rest)) {
    root.append(status(t('无效的菜谱标识。', 'Invalid recipe ID.', 'Недійсний ідентифікатор рецепта.'), true)); ctx.setReloadCoverage?.('read-only'); return;
  }
  const key = rest;
  let draft = drafts.get(key);
  if (!draft) {
    root.append(status(t('正在读取菜谱…', 'Loading recipe…', 'Завантаження рецепта…')));
    try {
      const response = key === 'new' ? null : await getKnowledgeApi().request<RecipeDetail>(`/recipes/${key}`);
      if (!active()) { ctx.setReloadCoverage?.('read-only'); return; }
      const recipe = response ? editable(response.data.recipe) : fresh();
      const owner: Draft = { key, recipe, baseline: JSON.stringify(recipe), detail: response?.data, etag: response?.etag || undefined,
        media: response?.data.media || [], sources: response?.data.sourceRecords || response?.data.sources || [], pending: {}, busy: false, unknown: false, conflict: false, error: '', notice: '', generation: 0, historyEpoch: 0,
        registration: registerAuxiliaryEdits({ ownerId: `knowledge:${key}:${crypto.randomUUID()}`, identity: { kind: 'knowledge-recipe', id: key }, operationTracking: 'tickets', read: () => ({ generation: owner.generation, dirty: dirty(owner), phase: owner.unknown||owner.workflow?.unknown ? 'unknown' : owner.busy||owner.workflow?.busy ? 'busy' : 'idle' }) }) };
      draft = owner; drafts.set(key, owner);
    } catch (error) {
      if (active()) replace(root, status(message(error, t, ctx.lang), true), button(t('重新读取', 'Retry', 'Спробувати знову'), () => void render(el, ctx, rest)), h('a', { href: href() }, t('返回菜谱库', 'Back to library', 'До бібліотеки')));
      ctx.setReloadCoverage?.('read-only'); return;
    }
  }
  ctx.setReloadCoverage?.('tracked');
  editor(root, ctx, draft, auth);
}

async function library(root: HTMLElement, ctx: PageCtx, active: () => boolean) {
  const t = words(ctx.lang), title = t('菜谱知识库', 'Recipe library', 'Бібліотека рецептів');
  const results = h('div', { class: 'kb-grid' }), info = h('div'), more = button(t('继续加载', 'Load more', 'Завантажити ще'), () => void load(false));
  let query = '', tag = '', cursor: string | null = null, generation = 0, listEpoch = 0, loading = false;
  type CoverTask = { element: HTMLElement; url: string; name: string; listEpoch: number; visible: boolean; fetching: boolean; queued: boolean; failed: boolean; epoch: number; objectUrl?: string; controller?: AbortController };
  const covers = new Map<Element, CoverTask>(), queue: CoverTask[] = [];
  let imageReads = 0;
  function showImage(element: HTMLElement, src: string, name: string, coverEpoch: number, objectUrl?: string) {
    if (!active() || coverEpoch !== listEpoch || !element.isConnected) return;
    const img = h('img', { alt: `${name} · ${t('封面', 'Cover', 'Обкладинка')}`, loading: 'lazy', ...(objectUrl ? {} : { referrerpolicy: 'no-referrer' }) });
    img.addEventListener('load', () => { if (active() && coverEpoch === listEpoch && img.parentNode === element && img.isConnected) element.setAttribute('data-asset-state', 'available'); });
    img.addEventListener('error', () => {
      if (objectUrl) { URL.revokeObjectURL(objectUrl); urls.delete(objectUrl); }
      if (active() && coverEpoch === listEpoch && img.parentNode === element && img.isConnected) {
        element.setAttribute('data-asset-state', 'unavailable');
        replace(element, h('span', {}, t('图片未载入', 'Image unavailable', 'Зображення недоступне')));
      }
    });
    img.setAttribute('src', src);
    replace(element, img);
  }
  function pumpImages() {
    while (imageReads < 2 && queue.length) {
      const task = queue.shift()!; task.queued = false;
      if (!task.visible || task.fetching || task.failed || task.objectUrl || !active() || task.listEpoch !== listEpoch) continue;
      task.fetching = true; imageReads++;
      const epoch = task.epoch;
      const controller = new AbortController(); task.controller = controller; coverControllers.add(controller);
      void getKnowledgeApi().image(task.url, controller.signal).then(blob => {
        if (!task.visible || task.epoch !== epoch || !active() || task.listEpoch !== listEpoch || !task.element.isConnected) return;
        const objectUrl = URL.createObjectURL(blob); task.objectUrl = objectUrl; urls.add(objectUrl);
        showImage(task.element, objectUrl, task.name, task.listEpoch, objectUrl);
      }).catch(() => {
        if (!task.visible || task.epoch !== epoch || !active() || task.listEpoch !== listEpoch || !task.element.isConnected) return;
        task.failed = true; task.element.setAttribute('data-asset-state', 'unavailable');
        replace(task.element, h('span', {}, t('图片未载入', 'Image unavailable', 'Зображення недоступне')));
      }).finally(() => {
        coverControllers.delete(controller); if (task.controller === controller) task.controller = undefined;
        task.fetching = false; if (task.listEpoch === listEpoch) imageReads--;
        if (task.visible && !task.failed && !task.objectUrl && task.listEpoch === listEpoch) enqueueImage(task);
        pumpImages();
      });
    }
  }
  function enqueueImage(task: CoverTask) { if (!task.queued && !task.fetching && !task.failed && !task.objectUrl) { task.queued = true; queue.push(task); pumpImages(); } }
  function observeImage(task: CoverTask) {
    covers.set(task.element, task);
    if (typeof IntersectionObserver === 'undefined') { task.visible = true; enqueueImage(task); return; }
    if (!coverObserver) coverObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const item = covers.get(entry.target); if (!item) continue;
        item.visible = entry.isIntersecting;
        if (item.visible) { item.element.setAttribute('data-asset-state', 'loading'); enqueueImage(item); }
        else {
          item.epoch++; item.failed = false;
          item.controller?.abort();
          if (item.objectUrl) { URL.revokeObjectURL(item.objectUrl); urls.delete(item.objectUrl); item.objectUrl = undefined; }
          item.element.setAttribute('data-asset-state', 'deferred');
          replace(item.element, h('span', {}, t('图片待显示', 'Image loads on view', 'Зображення завантажиться під час перегляду')));
        }
      }
    }, { rootMargin: '160px 0px' });
    coverObserver.observe(task.element);
  }
  const search = input('', value => { query = value; }); search.setAttribute('type', 'search');
  const tagInput = input('', value => { tag = value; });
  const form = h('form', { class: 'kb-panel' }, h('div', { class: 'kb-grid' }, field(t('搜索名称或内容', 'Search name or content', 'Пошук за назвою або вмістом'), search), field(t('标签', 'Tag', 'Мітка'), tagInput)), button(t('搜索', 'Search', 'Шукати'), () => void load(true), true));
  form.addEventListener('submit', event => { event.preventDefault(); void load(true); });
  root.append(h('div', { class: 'kb-header' }, h('h2', {}, title), h('a', { class: 'kb-link', href: href('inbox') }, t('收藏收件箱', 'Favorites inbox', 'Вхідні обраного')), h('a', { class: 'kb-link', href: href('new') }, t('＋ 收藏新做法', '＋ New recipe', '＋ Новий рецепт'))),
    h('p', { class: 'kb-muted' }, t('同一道菜可以收藏多款做法，每款独立保存。这里的修改不会自动替换已发布菜单中的版本。', 'Keep several versions of a dish as independent recipes. Edits here do not replace published menu versions.', 'Зберігайте різні способи приготування як окремі рецепти. Зміни тут не замінюють версії в опублікованому меню.')),
    form, info, results, more);
  let filter = { q: '', tag: '' }, seen = new Set<string>();
  async function load(reset: boolean) {
    if (loading && !reset) return;
    const current = ++generation;
    if (reset) { listEpoch++; cursor = null; filter = { q: query.trim(), tag: tag.trim() }; seen = new Set(); covers.clear(); queue.length = 0; imageReads = 0; releaseImages(); replace(results); }
    loading = true; more.disabled = true; replace(info, status(t('正在加载…', 'Loading…', 'Завантаження…')));
    const params = new URLSearchParams({ limit: '20' });
    if (filter.q) params.set('q', filter.q); if (filter.tag) params.set('tag', filter.tag); if (cursor) params.set('cursor', cursor);
    try {
      const { data } = await getKnowledgeApi().request<RecipeList>(`/recipes?${params}`);
      if (!active() || current !== generation) return;
      for (const item of data.items) {
        if (seen.has(item.id)) continue; seen.add(item.id);
        const localCover = item.cover?.kind === 'image' && item.cover.url?.startsWith('/api/v1/assets/');
        const externalCover = !localCover && item.cover?.kind === 'image' ? safeExternal(item.cover.url) : null;
        const cover = h('div', { class: 'kb-card-cover', 'data-asset-state': localCover || externalCover ? 'loading' : item.cover ? 'unavailable' : 'not-recorded' },
          h('span', {}, localCover || externalCover ? t('图片读取中', 'Loading image', 'Завантаження зображення') : item.cover ? t('图片未载入', 'Image unavailable', 'Зображення недоступне') : t('未录图片', 'No image recorded', 'Зображення не записано')));
        results.append(h('a', { class: 'kb-card', href: href(item.id), 'data-recipe-id': item.id }, cover,
          h('div', { class: 'kb-card-body' }, h('h3', {}, label(item.title, ctx.lang)), h('p', {}, label(item.description, ctx.lang)),
            h('small', {}, `${(item.tags || []).join(' · ')} · v${item.version}`), h('small', { class: 'kb-identity' }, item.updatedAt ? new Date(item.updatedAt).toLocaleDateString(ctx.lang) : ''))));
        if (localCover) observeImage({ element: cover, url: item.cover!.url, name: label(item.title, ctx.lang), listEpoch, visible: false, fetching: false, queued: false, failed: false, epoch: 0 });
        else if (externalCover) showImage(cover, externalCover, label(item.title, ctx.lang), listEpoch);
      }
      cursor = data.nextCursor;
      replace(info, ...(!seen.size ? [status(t('这里还没有符合条件的正式菜谱。已导入的视频草稿要先由师傅审核。', 'No formal recipe matches. A chef must review imported video drafts first.', 'Відповідного затвердженого рецепта немає. Імпортовані відео спершу перевіряє шеф.')),
        h('a',{href:href('inbox')},t('打开收藏收件箱审核草稿','Open favorites inbox to review drafts','Відкрити вхідні для перевірки чернеток'))] : []));
      more.hidden = !cursor;
    } catch (error) {
      if (active() && current === generation) replace(info, status(message(error, t, ctx.lang), true), button(t('重试', 'Retry', 'Спробувати знову'), () => void load(reset)));
    } finally { if (current === generation) { loading = false; more.disabled = false; } }
  }
  await load(true);
}

function editor(root: HTMLElement, ctx: PageCtx, draft: Draft, auth: number) {
  draft.lang = ctx.lang;
  const t: Words = (zh, en, uk) => words(draft.lang || ctx.lang)(zh, en, uk), api = getKnowledgeApi();
  const current = () => getAuthSessionVersion() === auth && [...drafts.values()].includes(draft);
  let historyOpen = false, historyLoaded = false, evidenceOpen = false;
  let revisionRequest = 0, historyRequest = 0, seenHistoryEpoch = draft.historyEpoch;
  let history: Revision[] = [], selected: RecipeDetail | undefined, historicalError = '', evidence: unknown;
  let referenceVersion = 0, referenceRequest = 0, references: SourceIllustrationLinks | undefined, referenceError = '';
  let statusLabel: HTMLElement, saveButton: HTMLButtonElement;
  function changed(repaint = false) { draft.generation++; draft.notice = ''; draft.error = ''; draft.supportError=undefined; if (repaint) paint(); else {
    if(references&&draft.detail){const panel=root.querySelector<HTMLElement>('.kb-source-reference-panel');if(panel)syncSourceIllustrationLinks(panel,references,draft.recipe,draft.detail.recipe,ctx.lang,t);}
    updateStatus();
  } }
  function updateStatus() {
    if (statusLabel) statusLabel.textContent = draft.unknown ? t('保存结果待确认', 'Save result unconfirmed', 'Результат збереження не підтверджено') : dirty(draft) ? t('有内容尚未保存', 'Unsaved changes', 'Є незбережені зміни') : t('内容已保存', 'Saved', 'Збережено');
    if (saveButton) saveButton.disabled = draft.busy || workflowBlocked(draft) || !!draft.detail?.archivedAt || (!draft.unknown && !!draft.detail && !(JSON.stringify(draft.recipe)!==draft.baseline||pending(draft)||draft.rightsChanged));
  }
  const view: MediaView = { t, current, changed, paint, error: error => message(error, t, ctx.lang), image(url, target) {
    void api.image(url).then(blob => {
      if (!current() || !target.isConnected) return;
      const objectUrl = URL.createObjectURL(blob); urls.add(objectUrl);
      target.prepend(h('img', { src: objectUrl, alt: t('菜谱图片', 'Recipe image', 'Зображення рецепта') }));
    }).catch(error => { if (current() && target.isConnected) target.append(status(message(error, t, ctx.lang), true)); });
  } };
  function adopt(detail: RecipeDetail, etag: string | null) {
    // Shared across language/route renders: all lists and snapshots belong to this epoch.
    draft.historyEpoch++;
    draft.recipe = editable(detail.recipe); draft.baseline = JSON.stringify(draft.recipe); draft.detail = detail;
    draft.etag = etag || undefined; draft.media = detail.media || []; draft.sources = detail.sourceRecords || detail.sources || []; draft.pending = {}; draft.rightsChanged = false; draft.generation++;
    referenceRequest++;referenceVersion=0;references=undefined;referenceError='';
  }
  async function loadReferences(version:number){
    if(!draft.detail)return;
    const recipeId=draft.detail.id,request=++referenceRequest;
    referenceVersion=version;references=undefined;referenceError='';
    try{
      const {data}=await api.request<SourceIllustrationLinks>(`/recipes/${recipeId}/source-illustrations?version=${version}`);
      if(!current()||!root.isConnected||request!==referenceRequest||draft.detail?.version!==version)return;
      if(data.recipeId!==recipeId||data.recipeVersion!==version||!Array.isArray(data.illustrations)||!Array.isArray(data.stepLinks))throw new Error('Reference mapping does not match this recipe revision');
      references=data;
    }catch(error){
      if(!current()||!root.isConnected||request!==referenceRequest||draft.detail?.version!==version)return;
      referenceError=error instanceof KnowledgeError&&error.status===403
        ?t('原片参考图仅师傅可查看。','Source frames are available only to chefs.','Кадри доступні лише шефам.')
        :t('原片参考图暂时无法读取，请重试。','Source frames could not be loaded. Retry.','Не вдалося завантажити кадри. Спробуйте ще раз.');
    }
    if(current()&&root.isConnected&&request===referenceRequest)paint();
  }
  function referenceImage(assetId:string,target:HTMLElement,alt:string){
    const controller=new AbortController(),version=draft.detail?.version;
    coverControllers.add(controller);
    void api.image(`/api/v1/assets/${assetId}/content`,controller.signal).then(blob=>{
      if(controller.signal.aborted||!current()||!target.isConnected||draft.detail?.version!==version)return;
      const objectUrl=URL.createObjectURL(blob);urls.add(objectUrl);
      const image=h('img',{src:objectUrl,alt,loading:'lazy'});
      image.addEventListener('error',()=>{
        if(urls.delete(objectUrl))URL.revokeObjectURL(objectUrl);
        if(!controller.signal.aborted&&target.isConnected){target.setAttribute('data-asset-state','unavailable');replace(target,t('原片图未载入','Source frame unavailable','Кадр недоступний'));}
      });
      target.setAttribute('data-asset-state','available');replace(target,image);
    }).catch(()=>{
      if(!controller.signal.aborted&&current()&&target.isConnected){target.setAttribute('data-asset-state','unavailable');replace(target,t('原片图未载入','Source frame unavailable','Кадр недоступний'));}
    }).finally(()=>coverControllers.delete(controller));
  }
  async function save(archive = false) {
    if (draft.busy || workflowBlocked(draft) || draft.detail?.archivedAt) return;
    if (!draft.unknown) {
      if (!archive) {
        const invalid = validate(draft.recipe);
        if (pending(draft) || invalid) {
          draft.error = pending(draft) ? t('还有来源或外链素材未添加。请先添加，或清空这些输入。', 'Add the pending source or asset, or clear its fields first.', 'Спочатку додайте джерело чи матеріал або очистіть їхні поля.') : t('请检查菜名、食材、数量、步骤及片段；至少一种语言有内容，精确用量是正数，片段结束晚于开始。', 'Check the title, ingredients, amounts, steps and clips. Required text needs one language; exact quantities must be positive and clips must end after they start.', 'Перевірте назву, інгредієнти, кількості, кроки та фрагменти. Обов’язковий текст потрібен хоча б однією мовою; кількості мають бути додатними.'); paint(); return;
        }
      }
      if (draft.detail && !draft.etag) { draft.error = t('服务未返回保存版本，请重新读取后再保存。', 'The server did not return a version tag. Reload before saving.', 'Сервер не повернув позначку версії. Завантажте знову.'); paint(); return; }
      if (archive && !window.confirm(t('归档会从列表收起这款菜谱，保留历史；未保存修改不会被保存。继续？', 'Archive this recipe and keep its history? Unsaved edits will not be saved.', 'Архівувати рецепт зі збереженням історії? Незбережені зміни не збережуться.'))) return;
      const id = draft.detail?.id;
      draft.attempt = createAttempt(id ? `/recipes/${id}${archive ? '/archive' : ''}` : '/recipes', id && !archive ? 'PUT' : 'POST', archive ? {} : draft.recipe, draft.etag);
      draft.ticket = draft.registration.beginOperation('write');
    }
    if (!draft.attempt) return;
    draft.busy = true; draft.error = ''; paint();
    try {
      const result = await api.send<RecipeDetail>(draft.attempt);
      if (draft.ticket) draft.registration.settleOperation(draft.ticket, 'completed');
      draft.ticket = undefined;
      if (!current()) return;
      draft.attempt = undefined; draft.unknown = false; draft.conflict = false;
      adopt(result.data, result.etag);
      draft.notice = t('已保存，每次修改都有历史版本。', 'Saved. Each edit keeps a historical revision.', 'Збережено. Кожна зміна має історичну версію.');
      if (draft.key === 'new') { drafts.delete('new'); draft.key = result.data.id; drafts.set(draft.key, draft); if (draft.mount?.isConnected && mounted === draft.mount) location.hash = href(draft.key); }
    } catch (error) {
      if (!current()) { if (draft.ticket) draft.registration.settleOperation(draft.ticket, 'failed'); return; }
      const uncertain = error instanceof KnowledgeError && error.uncertain;
      draft.unknown = uncertain;
      draft.conflict = error instanceof KnowledgeError && [409, 412].includes(error.status);
      if (uncertain && draft.ticket) draft.registration.markUnknown(draft.ticket);
      else { if (draft.ticket) draft.registration.settleOperation(draft.ticket, 'failed'); draft.ticket = undefined; draft.attempt = undefined; }
      draft.error = uncertain ? t('保存结果暂时无法确认。输入已保留；点击“核对保存结果”将重放同一请求，避免重复新建。', 'The save result is unknown. Input is preserved. Check the save result to replay the same request without creating duplicates.', 'Результат збереження невідомий. Дані збережено. Перевірте результат, повторивши той самий запит без дублювання.') : draft.conflict ? t('这款菜谱已有更新。你的输入已保留；先看历史，再决定是否重新读取。', 'This recipe has changed. Your input is preserved. Review history before reloading.', 'Рецепт уже змінено. Ваші дані збережено. Перегляньте історію перед оновленням.') : message(error, t, ctx.lang);
    } finally { draft.busy = false; if (current()) paint(); }
  }
  async function loadHistory() {
    historyOpen = !historyOpen; paint();
    if (!historyOpen || historyLoaded || !draft.detail) return;
    await refreshHistory();
  }
  async function refreshHistory() {
    if (!draft.detail) return;
    const request = ++historyRequest, version = draft.detail.version, epoch = draft.historyEpoch;
    try { const response = await api.request<{ items: Revision[] }>(`/recipes/${draft.detail.id}/revisions`); if (!current() || request !== historyRequest || epoch !== draft.historyEpoch || draft.detail.version !== version) return; history = response.data.items; historyLoaded = true; historicalError = ''; }
    catch (error) { if (request === historyRequest && epoch === draft.historyEpoch) historicalError = message(error, t, ctx.lang); }
    if (current() && request === historyRequest && epoch === draft.historyEpoch) paint();
  }
  async function revision(version: number) {
    if (!draft.detail) return;
    const request = ++revisionRequest, epoch = draft.historyEpoch;
    try { const response = await api.request<RecipeDetail>(`/recipes/${draft.detail.id}/revisions/${version}`); if (!current() || request !== revisionRequest || epoch !== draft.historyEpoch) return; selected = response.data; historicalError = ''; }
    catch (error) { if (request === revisionRequest && epoch === draft.historyEpoch) historicalError = message(error, t, ctx.lang); }
    if (current() && request === revisionRequest && epoch === draft.historyEpoch) paint();
  }
  async function legacy() {
    evidenceOpen = !evidenceOpen;
    if (evidenceOpen && evidence === undefined && draft.detail) {
      try { const response = await api.request<{ evidence: unknown }>(`/recipes/${draft.detail.id}/legacy`); if (!current()) return; evidence = response.data.evidence; }
      catch (error) { draft.error = message(error, t, ctx.lang); }
    }
    if (current()) paint();
  }
  async function reload() {
    if (!draft.detail || draft.busy || draft.unknown || workflowBlocked(draft) || !window.confirm(t('重新读取将放弃当前未保存输入。确定继续？', 'Reload and discard unsaved input?', 'Завантажити знову та відкинути незбережені дані?'))) return;
    const operation = draft.registration.beginOperation('read'); draft.busy = true; paint();
    try { const response = await api.request<RecipeDetail>(`/recipes/${draft.detail.id}`); if (!current()) return; adopt(response.data, response.etag); draft.error = ''; draft.conflict = false; }
    catch (error) { if (current()) draft.error = message(error, t, ctx.lang); }
    finally { draft.registration.settleOperation(operation, 'completed'); draft.busy = false; if (current()) paint(); }
  }
  function paint() {
    if (!current()) return;
    if (!root.isConnected) { if (draft.repaint && draft.repaint !== paint) draft.repaint(); return; }
    if (seenHistoryEpoch !== draft.historyEpoch) {
      seenHistoryEpoch = draft.historyEpoch; historyRequest++; revisionRequest++;
      historyLoaded = false; history = []; selected = undefined; historicalError = '';
      if (historyOpen) void refreshHistory();
    }
    if(draft.detail&&referenceVersion!==draft.detail.version)void loadReferences(draft.detail.version);
    releaseImages();
    const recipe = draft.recipe;
    const header = h('div', { class: 'kb-header' }, h('div', {}, h('a', { href: href() }, t('← 返回菜谱库', '← Back to library', '← До бібліотеки')), h('h2', {}, label(recipe.title, ctx.lang) || t('收藏新做法', 'New recipe', 'Новий рецепт')), h('small', {}, draft.detail ? `v${draft.detail.version}` : t('同名也会独立保存', 'A matching name still creates an independent recipe', 'Однакова назва також створює окремий рецепт'))));
    if (draft.detail) header.append(button(t('历史版本', 'Revision history', 'Історія версій'), () => void loadHistory()), button(t('导入原文', 'Imported evidence', 'Імпортовані дані'), () => void legacy()));
    const notices = h('div', {}, draft.error ? status(draft.error, true) : null, draft.notice ? status(draft.notice) : null, draft.detail?.archivedAt ? status(t('已归档，内容只读。', 'Archived; read only.', 'Архівовано; лише читання.')) : null);
    if(draft.error&&draft.supportError)notices.append(jsonEvidence(draft.supportError,t('技术支持详情','Support details','Деталі для підтримки')));
    if (draft.detail && !draft.unknown&&!workflowBlocked(draft)) notices.append(button(t('放弃输入并重新读取', 'Discard input and reload', 'Відкинути дані й оновити'), () => void reload()));
    const historical = h('div');
    if (draft.detail) historical.append(jsonEvidence({ recipeId: draft.detail.id, version: draft.detail.version }, t('资料标识', 'Record identifiers', 'Ідентифікатори запису')));
    if (historyOpen) historical.append(section(t('历史版本（只读）', 'Revision history (read only)', 'Історія версій (лише читання)'), h('div', { class: 'kb-actions' }, ...history.map(item => button(`v${item.version} · ${item.createdAt}`, () => void revision(item.version)))), historicalError ? status(historicalError, true) : h('span'), selected ? readonlyDetail(selected, view) : h('p', {}, t('选择版本查看当时内容。', 'Select a revision to inspect its saved content.', 'Виберіть версію, щоб переглянути збережений вміст.'))));
    if (evidenceOpen) historical.append(section(t('导入原文（只读，不随编辑改变）', 'Imported evidence (read only)', 'Імпортовані дані (лише читання)'), evidence ? jsonEvidence(evidence, t('展开完整来源、原始资料和关联记录', 'Expand complete source and original records', 'Розгорнути джерело та оригінальні записи')) : status(t('这款菜谱没有旧系统导入记录。', 'This recipe has no legacy import record.', 'Для цього рецепта немає запису імпорту.'))));
    const workflow=workflowPanel(draft,ctx,current,paint,()=>changed());
    const base = section(t('基本信息', 'Basics', 'Основне'), multilingual(t('菜名（至少一种语言）', 'Title (at least one language)', 'Назва (хоча б однією мовою)'), recipe.title, value => { recipe.title = value; changed(); }), multilingual(t('说明与备注', 'Description and notes', 'Опис і примітки'), recipe.description, value => { if (Object.keys(value).length) recipe.description = value; else delete recipe.description; changed(); }, true), h('div', { class: 'kb-grid' }, field(t('标签（逗号分隔）', 'Tags (comma separated)', 'Мітки (через кому)'), input((recipe.tags || []).join(', '), value => { recipe.tags = [...new Set(value.split(/[,，]/).map(v => v.trim()).filter(Boolean))]; changed(); })), field(t('基础份数（未知可留空）', 'Base servings (blank if unknown)', 'Базові порції (порожньо, якщо невідомо)'), input(recipe.baseServings === undefined ? '' : String(recipe.baseServings), value => { if (!value.trim()) delete recipe.baseServings; else recipe.baseServings = Number(value); changed(); }))));
    const ingredients = section(t('食材与调料', 'Ingredients and seasonings', 'Інгредієнти та приправи'));
    (recipe.ingredients || []).forEach((row, index) => {
      const amount = row.amount;
      const quantity = h('div', { class: 'kb-grid' }, field(t('用量类型', 'Amount type', 'Тип кількості'), select(amount.kind, [['unknown', t('未知', 'Unknown', 'Невідомо')], ['exact', t('精确用量', 'Exact', 'Точна')], ['to_taste', t('适量', 'To taste', 'За смаком')], ['text', t('原文描述', 'Original description', 'Оригінальний опис')]], kind => {
        row.amount = kind === 'exact' ? { kind, value: '', unit: '', ...(amount.raw ? { raw: amount.raw } : {}) } : kind === 'unknown' ? { kind, ...(amount.raw ? { raw: amount.raw } : {}) } : { kind: kind as 'to_taste' | 'text', raw: amount.raw || (kind === 'to_taste' ? t('适量', 'to taste', 'за смаком') : '') }; changed(true);
      })));
      if (amount.kind === 'exact') quantity.append(field(t('数量（保留原精度）', 'Quantity (preserve precision)', 'Кількість (збереження точності)'), input(amount.value, value => { amount.value = value; changed(); })), field(t('单位', 'Unit', 'Одиниця'), input(amount.unit, value => { amount.unit = value; changed(); })));
      quantity.append(field(t('用量原文', 'Original amount text', 'Оригінальний текст кількості'), input(amount.raw || '', value => { amount.raw = value; changed(); })));
      ingredients.append(h('div', { class: 'kb-row' }, h('strong', {}, `${index + 1}`), order(recipe.ingredients!, index, () => changed(true), () => { recipe.ingredients!.splice(index, 1); changed(true); }, t),
        multilingual(t('食材名称', 'Ingredient name', 'Назва інгредієнта'), row.name, value => { row.name = value; changed(); }), field(t('类型', 'Role', 'Роль'), select(row.role || 'unspecified', [['unspecified', t('未分类', 'Unspecified', 'Не визначено')], ['main', t('食材', 'Ingredient', 'Інгредієнт')], ['seasoning', t('调料', 'Seasoning', 'Приправа')]], value => { row.role = value as typeof row.role; changed(); })), quantity,
        field(t('配料原文', 'Original ingredient text', 'Оригінальний текст інгредієнта'), input(row.rawText || '', value => { row.rawText = value; changed(); }, true)), multilingual(t('预处理', 'Preparation', 'Підготовка'), row.preparation, value => { if (Object.keys(value).length) row.preparation = value; else delete row.preparation; changed(); }, true),kitchenFields(draft,ctx,()=>changed(),index)));
    });
    ingredients.append(button(t('＋ 添加食材或调料', '＋ Add ingredient or seasoning', '＋ Додати інгредієнт чи приправу'), () => { (recipe.ingredients ??= []).push({ id: crypto.randomUUID(), name: {}, role: 'unspecified', amount: { kind: 'unknown' } }); changed(true); }));
    const steps = section(t('做法步骤', 'Steps', 'Кроки'));
    (recipe.steps || []).forEach((step, index) => steps.append(h('div', { class: 'kb-row' }, h('strong', {}, `${index + 1}`), order(recipe.steps!, index, () => changed(true), () => {
      if (recipe.assets?.some(asset => asset.stepId === step.id) && !window.confirm(t('移除步骤后，关联素材将保留为参考资料。继续？', 'Remove this step and keep its assets as references?', 'Вилучити крок і залишити матеріали як довідкові?'))) return;
      removeStep(recipe, step.id); changed(true);
    }, t), multilingual(t('步骤说明', 'Step instructions', 'Опис кроку'), step.text, value => { step.text = value; changed(); }, true),kitchenFields(draft,ctx,()=>changed(),undefined,index))));
    steps.append(button(t('＋ 添加步骤', '＋ Add step', '＋ Додати крок'), () => { (recipe.steps ??= []).push({ id: crypto.randomUUID(), text: {} }); changed(true); }));
    const disabled=draft.busy||draft.unknown||workflowBlocked(draft)||!!draft.detail?.archivedAt;
    const recipeForm=h('fieldset',{class:'kb-form',disabled},base,ingredients,steps);
    const referencePanel=draft.detail
      ?referenceError
        ?h('section',{class:'kb-panel kb-source-reference-panel'},h('h3',{},t('原片参考图（只读）','Source video frames (read only)','Кадри оригіналу (лише читання)')),
          status(referenceError,true),button(t('重试参考图','Retry source frames','Повторити кадри'),()=>{referenceVersion=0;paint();}))
        :references
          ?sourceIllustrationPanel(references,recipe,draft.detail.recipe,ctx.lang,t,referenceImage)
          :section(t('原片参考图（只读）','Source video frames (read only)','Кадри оригіналу (лише читання)'),status(t('正在读取原片参考图…','Loading source frames…','Завантаження кадрів…')))
      :null;
    const mediaForm=h('fieldset',{class:'kb-form',disabled},...mediaEditor(draft,view));
    statusLabel = h('span', { role: 'status' });
    saveButton = button(draft.unknown ? t('核对保存结果', 'Check save result', 'Перевірити збереження') : t('保存菜谱', 'Save recipe', 'Зберегти рецепт'), () => void save(), true);
    const footer = h('div', { class: 'kb-savebar' }, statusLabel, saveButton);
    replace(root, header, notices, historical, workflow, recipeForm, referencePanel, mediaForm, footer);
    if (draft.detail && !draft.detail.archivedAt) {
      const archive = button(t('归档这款菜谱', 'Archive recipe', 'Архівувати рецепт'), () => void save(true)); archive.disabled = draft.busy || draft.unknown || workflowBlocked(draft); root.append(h('p', {}, archive));
    }
    updateStatus();
  }
  draft.mount = root; draft.repaint = paint;
  paint();
}
