import { h, replace } from '../../../dom';
import { onRoute } from '../../../router';
import { onAuthSessionChange } from '../../../admin/token';
import type { PageCtx } from '../../../types';
import { getKnowledgeApi, KnowledgeError, type I18n, type Recipe } from '../../../api/knowledge';
import { contractErrorText } from '../../../admin/kit';
import { bindInboxValue, inboxBuffer, writeInbox } from './inbox-state';
import './inbox.css';
import { words, button, field, safeExternal } from './ui';
import { parseFavoritesCsv, type FavoriteCsvRow } from './favorites-csv';

type Batch = { id: string; claimedCount: number; submittedCount: number; validCount: number; insertedCount: number; rejectedCount: number; coverageGap: number; importedAt: string; replayed?: boolean; rejections?: { rowNumber: number; code: string }[] };
type CandidateSummary = { candidateId:string; title:I18n; status:string; ingredientCount:number; stepCount:number; illustrationCount:number; thumbnailAssetId?:string|null; unresolvedCount:number };
type Item = { id: string; contentId: string; kind: 'video' | 'note'; url: string; index: number; author: string; cardAlt: string; displayText: string; state: string; candidateSummary?:CandidateSummary|null; lastError?: string; classification?: { reviewer:string;reason:string;createdAt:string } };
type Capture = { id: string; status: string; method: string; sha256: string; capturedAt: string; evidence: { sourceUrl: string; text?: string; media?: { sha256:string; durationMs:number; byteCount:number; sourceMethod:string }; segments?: { id?:string; kind: string; locator: string; text: string; startMs?:number; endMs?:number }[]; images?: { url: string; role: string; licenseStatus: string; sourceUrl: string; locator?: string }[] } };
type Illustration = { id:string; assetId:string; url:string; sourceMediaSha256:string; frameMs:number; role:'ingredient'|'step'|'finished'; stepId:string; caption:{zh?:string;en?:string;uk?:string}; sourceUrl:string; author:string; rightsState:'unknown' };
const imageControllers=new Set<AbortController>(), imageUrls=new Set<string>();
const previewLoads=new Map<Element,()=>void>();
let previewObserver:IntersectionObserver|null=null;
let imageEpoch=0;
function releaseInboxImages():void { imageEpoch++;previewObserver?.disconnect();previewObserver=null;previewLoads.clear();for(const controller of imageControllers)controller.abort();imageControllers.clear();for(const url of imageUrls)URL.revokeObjectURL(url);imageUrls.clear(); }
onRoute(releaseInboxImages,false);
onAuthSessionChange(releaseInboxImages);
type Candidate = { id: string; captureId: string; status: string; recipe: Recipe; fieldEvidence: unknown; imageCandidates: unknown[]; illustrations?:Illustration[]; unresolved?:string[]; recipeId?: string; recipeVersion?: number; reviewer?: string; reviewNote?: string };
const stateName: Record<string, [string,string,string]> = {
  evidence_pending:['等待作品正文','Waiting for source text','Очікування тексту джерела'],
  evidence_ready:['已有作品证据','Source evidence ready','Джерело перевірено'],
  needs_review:['来源待师傅审核','Source awaits chef review','Джерело очікує перевірки шефа'],
  approved:['来源已审核','Source approved','Джерело схвалено'],
  blocked_auth:['访问受限','Access restricted','Доступ обмежено'],
  unavailable:['作品不可用','Source unavailable','Джерело недоступне'],
  non_recipe:['非菜谱','Not a recipe','Не рецепт'],
  rejected:['审核退回','Returned by reviewer','Повернуто на доопрацювання'],
};
let inboxGeneration = 0, mountedInbox: HTMLElement | null = null;
onRoute(() => { inboxGeneration++; mountedInbox = null; }, false);
onAuthSessionChange(() => { inboxGeneration++; if (mountedInbox?.isConnected) replace(mountedInbox); });
const lines = (value: string) => value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const duration = (ms:number) => `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
function amountLabel(value:NonNullable<Recipe['ingredients']>[number]['amount'], unknown:string):string {
  if(value.kind==='exact')return `${value.value} ${value.unit}`;
  return value.raw || unknown;
}

function amount(raw: string): { kind: 'unknown'; raw?: string } | { kind: 'to_taste' | 'text'; raw: string } | { kind: 'exact'; value: string; unit: string; raw: string } {
  if (!raw) return { kind:'unknown' };
  if (raw === '适量') return { kind:'to_taste',raw };
  const match = /^(?:([1-9]\d*(?:\.\d+)?)|(0\.\d*[1-9]\d*))\s*(\S.*)$/.exec(raw);
  if (match && !/[\-~～至到]/.test(match[3]!)) return { kind:'exact',value:match[1] ?? match[2]!,unit:match[3]!.trim(),raw };
  return { kind:'text',raw };
}

function recipeProposal(title: string, titleQuote: string, ingredientsText: string, stepsText: string) {
  const ingredients = lines(ingredientsText).map(line => {
    const [name,raw,quote,locator] = line.split('|').map(x => x.trim());
    if (!name || !quote || !locator) throw new Error('每行食材须写：名称 | 原方用量 | 原文引句 | 位置');
    return { value: { id:crypto.randomUUID(),name:{ zh:name },amount:amount(raw ?? ''),rawText:quote }, evidence:{ quote,locator } };
  });
  const steps = lines(stepsText).map(line => {
    const [description,quote,locator] = line.split('|').map(x => x.trim());
    if (!description || !quote || !locator) throw new Error('每行步骤须写：步骤说明 | 原文引句 | 位置');
    return { value:{ id:crypto.randomUUID(),text:{ zh:description } }, evidence:{ quote,locator } };
  });
  if (!title.trim() || !titleQuote.trim()) throw new Error('请填写菜名及菜名的原文引句。');
  return { recipe:{ title:{ zh:title.trim() }, tags:[],ingredients:ingredients.map(x => x.value),steps:steps.map(x => x.value),sources:[],assets:[] },
    fieldEvidence:{ title:{ quote:titleQuote.trim(),locator:'作品正文或字幕' },ingredients:ingredients.map(x => x.evidence),steps:steps.map(x => x.evidence) } };
}

export async function renderInbox(root: HTMLElement, ctx: PageCtx, active: () => boolean): Promise<void> {
  releaseInboxImages();
  const generation = ++inboxGeneration; mountedInbox = root;
  const current = () => generation === inboxGeneration && active();
  ctx.setReloadCoverage?.('tracked');
  const t = words(ctx.lang), api = getKnowledgeApi();
  const errorText = (error: unknown): string => {
    if (error instanceof KnowledgeError) {
      if (error.status === 401) return t('访问会话已失效或更换，请重新打开师傅链接。','Your access session expired or changed. Reopen the chef link.','Сеанс доступу закінчився або змінився. Відкрийте посилання шефа.');
      if (error.status === 403) return t('当前权限不能执行此操作，输入已保留。','This access cannot perform this action. Your input is preserved.','Цей доступ не дозволяє дію. Введені дані збережено.');
      if (error.uncertain) return t('操作结果暂时无法确认，输入已保留。请核对或重试原请求。','The result is unconfirmed. Your input is preserved. Check or retry the original request.','Результат не підтверджено. Дані збережено. Перевірте або повторіть початковий запит.');
      return contractErrorText(error.code, ctx.lang) ?? t('操作未完成，输入已保留；可展开查看具体原因。','The action failed. Your input is preserved; expand the details for the cause.','Дію не виконано. Дані збережено; розгорніть подробиці.');
    }
    return error instanceof Error ? error.message : t('请求未完成，请重试。','Request failed. Retry.','Запит не виконано. Повторіть.');
  };
  function showError(target: HTMLElement, error: unknown) {
    replace(target, h('p', {role:'alert'}, errorText(error)), error instanceof Error ? h('details',{class:'kb-inbox-error-support'},h('summary',{},t('查看错误详情','Error details','Подробиці помилки')),
      h('pre',{},error instanceof KnowledgeError ? JSON.stringify({status:error.status,code:error.code,message:error.message,details:error.details},null,2) : error.message)) : null);
  }
  const stateText=(value:string)=>{const labels=stateName[value];return labels?t(...labels):t('待核对','Needs review','Потребує перевірки');};
  const titleText=(value:I18n|undefined)=>value?.[ctx.lang]||value?.zh||value?.en||value?.uk||'';
  const importBuffer=inboxBuffer('favorites-import');
  importBuffer.refresh=()=>{if(current()){updateImportControls();importRetryNotice();if(!importBuffer.error)void Promise.all([loadBatches(),loadItems(true)]);}};
  let csvRows=importBuffer.extras.csvRows as FavoriteCsvRow[]|undefined, prepared=importBuffer.extras.prepared as Batch|undefined, loading=false, cursor:string|null=null, searchTerm='', listEpoch=0, fileReadEpoch=0;
  const info = h('div'), cards = h('div', { class:'kb-inbox-list' }), batchInfo = h('div');
  const searchInput=h('input',{type:'search',placeholder:t('例如：陈皮排骨','For example: tangerine peel ribs','Наприклад: реберця')}) as HTMLInputElement;
  const searchButton=button(t('搜索菜名','Search recipe names','Пошук за назвою'),()=>{searchTerm=searchInput.value.trim();void loadItems(true);});
  const searchForm=h('form',{class:'kb-inbox-search'},field(t('按菜名搜索待审核做法','Search recipe candidates by name','Пошук рецептів за назвою'),searchInput),searchButton);
  searchForm.addEventListener('submit',event=>{event.preventDefault();searchTerm=searchInput.value.trim();void loadItems(true);});
  const file = h('input',{ type:'file',accept:'.csv,text/csv' }) as HTMLInputElement;
  const claimed = h('input',{ type:'number',min:'0',step:'1' }) as HTMLInputElement;
  bindInboxValue(importBuffer,'claimed',claimed,'');
  const inspect = button(t('检查 CSV','Inspect CSV','Перевірити CSV'),()=>void prepare(),true);
  const apply = button(t('确认入箱','Add to inbox','Додати до вхідних'),()=>void importRows()); apply.disabled = !prepared || importBuffer.busy || importBuffer.unknown;
  const more = button(t('继续加载','Load more','Завантажити ще'),()=>void loadItems(false)); more.hidden = true;
  root.append(h('div',{class:'kb-header'},h('h2',{},t('抖音收藏收件箱','Douyin favorites inbox','Вхідні обраного Douyin')),h('a',{class:'kb-link',href:'#/admin/knowledge'},t('返回菜谱库','Back to recipe library','До бібліотеки рецептів'))),
    h('p',{class:'kb-muted'},t('先找菜、打开作品核对完整做法，再审核来源。保存菜谱不会自动发布菜单。','Find a recipe, inspect the full source, then review it. Saving never publishes a menu.','Знайдіть рецепт, перевірте джерело й лише тоді схвалюйте. Збереження не публікує меню.')),
    h('section',{class:'kb-panel'},h('h3',{},t('找一款做法','Find a recipe','Знайти рецепт')),searchForm,
      h('p',{class:'kb-muted'},t('列表显示原片参考图与做法摘要；图片使用权待核实。来源审核与厨房用量核定是两步。','The list shows source-frame previews and recipe summaries. Image rights still need review. Source approval and kitchen quantities are separate steps.','Список показує кадри оригіналу й короткий опис. Права на зображення ще не перевірено. Джерело і кухонні кількості перевіряються окремо.'))),
    h('section',{class:'kb-panel'},h('h3',{},t('待处理作品','Source items','Джерела')),cards,more),
    h('details',{class:'kb-panel kb-inbox-import'},h('summary',{},t('导入收藏 CSV（管理）','Import favorites CSV (administration)','Імпорт CSV (керування)')),
      h('div',{class:'kb-inbox-import-body'},h('div',{class:'kb-actions'},field(t('CSV 文件','CSV file','Файл CSV'),file),field(t('收藏夹页面计数','Collection count','Кількість у колекції'),claimed),inspect,apply),
        h('p',{class:'kb-muted'},t('检查不会写库。卡片文字只作为线索，不能直接批准成菜谱。','Inspection does not write. Card text is a lead, not verified recipe evidence.','Перевірка не записує дані. Текст картки — лише підказка.')),info,batchInfo)));
  function updateImportControls(){const locked=importBuffer.busy||importBuffer.unknown;file.disabled=locked;claimed.disabled=locked;inspect.disabled=locked||loading;apply.disabled=locked||loading||!importBuffer.extras.prepared;}
  updateImportControls();
  file.addEventListener('change',async()=>{if(importBuffer.busy||importBuffer.unknown)return;const epoch=++fileReadEpoch;importBuffer.generation++;delete importBuffer.extras.file;delete importBuffer.extras.csvRows;prepared=undefined;delete importBuffer.extras.prepared;apply.disabled=true;csvRows=undefined;replace(info);
    const selected=file.files?.[0];if(!selected)return;
    try { const parsed=parseFavoritesCsv(await selected.text());if(!current()||epoch!==fileReadEpoch)return;csvRows=parsed;importBuffer.extras.file=selected;importBuffer.extras.csvRows=csvRows;importBuffer.generation++;replace(info,h('p',{role:'status'},`${selected.name} · ${csvRows.length} ${t('条卡片','cards','карток')}`)); }
    catch(error){if(current()&&epoch===fileReadEpoch)replace(info,h('p',{role:'alert'},errorText(error))); }
  });
  claimed.addEventListener('input',()=>{prepared=undefined;delete importBuffer.extras.prepared;apply.disabled=true;});
  const retainedFile=importBuffer.extras.file as File|undefined;
  if(retainedFile)replace(info,h('p',{role:'status'},`${t('已选择文件','Selected file','Вибраний файл')}: ${retainedFile.name}`));
  function importRetryNotice(){if(importBuffer.error)showError(info,importBuffer.error);if(importBuffer.unknown)info.append(button(t('核对或重试原请求','Check or retry original request','Перевірити або повторити початковий запит'),()=>void retryImport()));}
  importRetryNotice();
  async function prepare() {
    if (importBuffer.busy||importBuffer.unknown)return;
    if (!csvRows || loading) { if (!csvRows) replace(info,h('p',{role:'alert'},t('请先选择收藏 CSV。','Choose a favorites CSV first.','Спочатку виберіть CSV.'))); return; }
    const count=Number(claimed.value);if(!claimed.value.trim()||!Number.isSafeInteger(count)||count<0){replace(info,h('p',{role:'alert'},t('页面计数必须是非负整数。','The collection count must be a whole number.','Кількість має бути цілим числом.')));return;}
    const inspectionGeneration=importBuffer.generation;loading=true;updateImportControls();
    try { const { data }=await api.request<Batch>('/favorites/import/prepare',{method:'POST',body:JSON.stringify({folder:csvRows[0]?.folder??'吃的',claimedCount:count,rows:csvRows})});
      if(!current()||inspectionGeneration!==importBuffer.generation)return;prepared=data;importBuffer.extras.prepared=data;apply.disabled=false;
      replace(info,h('p',{role:'status'},`${t('有效','Valid','Коректні')} ${data.validCount} · ${t('坏行','Rejected rows','Відхилені рядки')} ${data.rejectedCount} · ${t('差额待查','Gap to inspect','Різниця')} ${data.coverageGap}`),
        ...(data.rejections?.length?[h('details',{},h('summary',{},t('查看坏行','View rejected rows','Переглянути відхилення')),h('pre',{},JSON.stringify(data.rejections,null,2)))]:[])); }
    catch(error){if(current())replace(info,h('p',{role:'alert'},errorText(error)));}
    finally{loading=false;if(current())updateImportControls();}
  }
  async function importRows() {
    if(!prepared||!csvRows||loading||importBuffer.busy||importBuffer.unknown)return;loading=true;file.disabled=true;claimed.disabled=true;inspect.disabled=true;apply.disabled=true;
    try {const data=await writeInbox<Batch>(importBuffer,'/favorites/import/apply',{folder:csvRows[0]?.folder??'吃的',claimedCount:Number(claimed.value),rows:csvRows},['claimed']);
      delete importBuffer.extras.file;
      if(!current())return;replace(info,h('p',{role:'status'},`${t('已入箱','Imported','Імпортовано')} ${data.validCount} · ${t('本次新建','New this time','Нових')} ${data.replayed?0:data.insertedCount} · ${t('差额待查','Gap','Різниця')} ${data.coverageGap}${data.replayed?` · ${t('重复导入已识别','Repeat import recognized','Повторний імпорт розпізнано')}`:''}`));await Promise.all([loadBatches(),loadItems(true)]);}
    catch(error){if(current()){showError(info,error);if(importBuffer.unknown)info.append(button(t('核对或重试原请求','Check or retry original request','Перевірити або повторити початковий запит'),()=>void retryImport()));}}
    finally{loading=false;if(current())updateImportControls();}
  }
  async function retryImport(){if(importBuffer.busy)return;try{await writeInbox(importBuffer);delete importBuffer.extras.file;if(current()){replace(info,h('p',{role:'status'},t('原导入请求已确认。','Original import confirmed.','Початковий імпорт підтверджено.')));await Promise.all([loadBatches(),loadItems(true)]);}}catch(error){if(current())importRetryNotice();}finally{if(current())updateImportControls();}}
  async function loadBatches(){try{const {data}=await api.request<{items:Batch[]}>('/favorites/imports');if(!current())return;
    const latest=data.items[0];replace(batchInfo,latest?h('p',{class:'kb-status'},`${t('收藏卡片入箱','Source cards imported','Імпортовано картки джерел')}: ${latest.validCount}/${latest.claimedCount} · ${t('差额','Gap','Різниця')} ${latest.coverageGap} · ${t('坏行','Rejected','Відхилено')} ${latest.rejectedCount} · ${t('这是收藏 CSV 覆盖数，不是已解析菜谱数。','This counts imported CSV cards, not analyzed recipes.','Це кількість карток CSV, а не проаналізованих рецептів.')}`):h('p',{class:'kb-muted'},t('尚未导入收藏。','No favorites imported yet.','Ще нічого не імпортовано.')));
  }catch(error){if(current())replace(batchInfo,h('p',{role:'alert'},errorText(error)));}}
  async function loadItems(reset:boolean){if(reset){listEpoch++;releaseInboxImages();cursor=null;replace(cards);}const epoch=listEpoch,params=new URLSearchParams({limit:'50',folder:'吃的'});if(searchTerm)params.set('q',searchTerm);if(cursor)params.set('cursor',cursor);
    try{const {data}=await api.request<{items:Item[];nextCursor:string|null}>(`/favorites/items?${params}`);if(!current()||epoch!==listEpoch)return;
      for(const item of data.items)cards.append(renderItem(item));cursor=data.nextCursor;more.hidden=!cursor;
      if(reset&&!data.items.length)cards.append(h('p',{class:'kb-muted'},searchTerm?t('没有找到这个菜名的草稿。','No candidate matches that recipe name.','За цією назвою рецептів не знайдено.'):t('收件箱还没有作品。','The inbox is empty.','Вхідні порожні.')));
    }catch(error){if(current()&&epoch===listEpoch)cards.append(h('p',{role:'alert'},errorText(error)));}}
  function previewImage(assetId:string,title:string):{element:HTMLElement;dispose:()=>void}{
    const frame=h('span',{class:'kb-inbox-preview','data-asset-state':'loading'},t('原片参考图读取中','Loading source frame','Завантаження кадру'));
    const controller=new AbortController(),epoch=imageEpoch;let objectUrl:string|undefined,started=false;
    imageControllers.add(controller);
    function dispose(){previewObserver?.unobserve(frame);previewLoads.delete(frame);controller.abort();imageControllers.delete(controller);if(objectUrl&&imageUrls.delete(objectUrl))URL.revokeObjectURL(objectUrl);objectUrl=undefined;}
    function load(){if(started||controller.signal.aborted||epoch!==imageEpoch||!current()||!frame.isConnected)return;started=true;
      void api.image(`/api/v1/assets/${assetId}/content`,controller.signal).then(blob=>{
        if(controller.signal.aborted||epoch!==imageEpoch||!current()||!frame.isConnected)return;
        objectUrl=URL.createObjectURL(blob);imageUrls.add(objectUrl);
        const img=h('img',{src:objectUrl,alt:`${title} · ${t('原片参考图，使用权待核实','Source frame, rights unverified','Кадр оригіналу, права не перевірено')}`,loading:'lazy'});
        img.addEventListener('error',()=>{if(!controller.signal.aborted){dispose();frame.setAttribute('data-asset-state','unavailable');replace(frame,t('原片参考图未载入','Source frame unavailable','Кадр недоступний'));}});
        frame.setAttribute('data-asset-state','available');replace(frame,img);
      }).catch(()=>{if(!controller.signal.aborted&&epoch===imageEpoch&&frame.isConnected){frame.setAttribute('data-asset-state','unavailable');replace(frame,t('原片参考图未载入','Source frame unavailable','Кадр недоступний'));}}).finally(()=>imageControllers.delete(controller));
    }
    if(typeof IntersectionObserver==='undefined')queueMicrotask(load);
    else{
      if(!previewObserver)previewObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const ready=previewLoads.get(entry.target);if(ready){previewObserver?.unobserve(entry.target);previewLoads.delete(entry.target);ready();}}},{rootMargin:'160px 0px'});
      previewLoads.set(frame,load);
      queueMicrotask(()=>{if(!controller.signal.aborted&&epoch===imageEpoch&&frame.isConnected)previewObserver?.observe(frame);});
    }
    return {element:frame,dispose};
  }
  function renderItem(item:Item):HTMLElement{
    const body=h('div');let disposePreview=()=>{};
    function summaryParts():HTMLElement[]{
      const candidate=item.candidateSummary,title=titleText(candidate?.title);
      const status=stateText(candidate?.status??item.state);
      const label=h('span',{class:'kb-inbox-summary-text'},h('strong',{},title||`#${item.index} · ${item.author}`),
        h('small',{},`${status} · #${item.index} · ${item.author} · ${item.kind==='note'?t('图文','Photo post','Фото'):t('视频','Video','Відео')}`));
      if(!candidate)return [h('span',{class:'kb-inbox-badge'},status),label];
      label.append(h('small',{},`${candidate.ingredientCount} ${t('项食材','ingredients','інгредієнтів')} · ${candidate.stepCount} ${t('步做法','steps','кроків')} · ${candidate.illustrationCount} ${t('张原片参考图','source frames','кадрів оригіналу')}`));
      if(candidate.status==='approved')label.append(h('small',{},t('厨房条件请在正式菜谱中核对','Check kitchen conditions in the formal recipe','Перевірте кухонні умови в рецепті')));
      const assetId=candidate.thumbnailAssetId;
      if(assetId&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(assetId)){
        const preview=previewImage(assetId,title||t('菜谱','Recipe','Рецепт'));disposePreview=preview.dispose;
        return [preview.element,label];
      }
      return [h('span',{class:'kb-inbox-preview','data-asset-state':'not-recorded'},t('无参考图','No source frame','Немає кадру')),label];
    }
    const summary=h('summary',{},...summaryParts());
    const detail=h('details',{class:'kb-inbox-item'},summary,body);let loaded=false,detailGeneration=0;
    const buffer=inboxBuffer(`source:${item.id}`);
    const refresh=()=>{if(current()&&detail.isConnected&&detail.open)void loadDetail();};
    buffer.refresh=refresh;
    const detailImageDisposers=new Set<()=>void>();
    detail.addEventListener('toggle',()=>{if(detail.open&&!loaded){loaded=true;void loadDetail();}});
    async function loadDetail(){const readGeneration=++detailGeneration;for(const dispose of detailImageDisposers)dispose();detailImageDisposers.clear();replace(body,h('p',{},t('正在读取证据…','Loading evidence…','Завантаження…')));
      try{const [itemReply,captures,candidates]=await Promise.all([api.request<Item>(`/favorites/items/${item.id}`),api.request<{items:Capture[]}>(`/favorites/items/${item.id}/captures`),api.request<{items:Candidate[]}>(`/favorites/items/${item.id}/candidates`)]);
        if(!current()||!detail.isConnected||readGeneration!==detailGeneration)return;Object.assign(item,itemReply.data);
        const previous=item.candidateSummary;
        const selected=candidates.data.items.find(candidate=>candidate.id===previous?.candidateId)??candidates.data.items[0];
        if(selected){
          const illustrations=selected.illustrations??[];
          item.candidateSummary={candidateId:selected.id,title:selected.recipe.title,status:selected.status,
            ingredientCount:selected.recipe.ingredients?.length??0,stepCount:selected.recipe.steps?.length??0,
            illustrationCount:illustrations.length,thumbnailAssetId:previous?.candidateId===selected.id?previous.thumbnailAssetId??null:null,
            unresolvedCount:selected.unresolved?.length??0};
        }else item.candidateSummary=null;
        disposePreview();disposePreview=()=>{};replace(summary,...summaryParts());
        paint(captures.data.items,candidates.data.items);
      }catch(error){if(current()&&detail.isConnected&&readGeneration===detailGeneration)replace(body,h('p',{role:'alert'},errorText(error)),button(t('重试','Retry','Повторити'),()=>void loadDetail()));}}
    function paint(captures:Capture[],candidates:Candidate[]){
      const link=safeExternal(item.url);
      const postText=h('textarea',{rows:'6',placeholder:t('粘贴人工核对的原帖正文或字幕','Paste checked post text or transcript','Вставте перевірений текст')}) as HTMLTextAreaElement;
      const locator=h('input',{type:'text',value:'作品正文'}) as HTMLInputElement;
      const method=h('select',{},h('option',{value:'manual_post'},t('原作品正文','Original post text','Текст допису')),h('option',{value:'manual_transcript'},t('人工字幕','Manual transcript','Субтитри'))) as HTMLSelectElement;
      const images=h('textarea',{rows:'3',placeholder:'图片 URL | preview/finished/step/ingredient | unknown/granted/restricted | 位置'}) as HTMLTextAreaElement;
      const captureNotice=h('div');
      const captureButton=button(t('保存作品证据','Save source evidence','Зберегти доказ'),()=>void saveCapture());
      const cardButton=button(t('记录卡片为待核验线索','Save card as unverified lead','Зберегти картку як підказку'),()=>void saveCard());
      const failureText=h('input',{type:'text',placeholder:t('例如：匿名请求 HTTP 403','For example: anonymous request HTTP 403','Наприклад: HTTP 403')}) as HTMLInputElement;
      const failureType=h('select',{},h('option',{value:'blocked_auth'},t('需要授权 / 访问受限','Access restricted','Доступ обмежено')),h('option',{value:'unavailable'},t('作品不可用','Post unavailable','Допис недоступний'))) as HTMLSelectElement;
      const failureButton=button(t('记录采集失败','Record capture failure','Записати помилку'),()=>void saveFailure());
      const nonRecipeReviewer=h('input',{type:'text',placeholder:t('审核人','Reviewer','Рецензент')}) as HTMLInputElement;
      const nonRecipeReason=h('input',{type:'text',placeholder:t('为什么不是配方','Why this is not a recipe','Чому це не рецепт')}) as HTMLInputElement;
      const readyCapture=captures.find(c=>c.status==='ready');
      const nonRecipeButton=button(t('标为非菜谱','Mark non-recipe','Не рецепт'),()=>void classify());nonRecipeButton.disabled=!readyCapture||item.state==='approved';
      const imageInfo=captures.flatMap(c=>c.evidence.images??[]).map(i=>h('li',{},`${i.role} · ${i.licenseStatus} · `,h('a',{href:i.url,target:'_blank',rel:'noopener noreferrer'},i.url)));
      const management=h('details',{class:'kb-inbox-management'},h('summary',{},t('采集补录与管理','Source collection and administration','Збирання джерел і керування')),
        h('div',{class:'kb-inbox-management-body'},h('p',{class:'kb-muted'},t('维护来源时展开；这里的记录不代替厨房核定。','Expand to maintain sources. These records do not grant kitchen approval.','Розгорніть для роботи з джерелами. Ці записи не замінюють кухонне схвалення.')),
          h('details',{},h('summary',{},t('收藏卡片原文（未核验）','Saved card text (unverified)','Текст картки (неперевірено)')),h('pre',{},item.cardAlt),h('pre',{},item.displayText)),
          h('div',{class:'kb-actions'},cardButton),field(t('作品正文或字幕','Post text or transcript','Текст або субтитри'),postText),
          h('div',{class:'kb-actions'},field(t('来源位置','Source location','Місце джерела'),locator),field(t('来源方式','Evidence type','Тип джерела'),method),captureButton),
          field(t('图片候选：URL | 角色 | 许可状态 | 位置（可留空）','Image candidates: URL | role | license | locator (optional)','Зображення: URL | роль | дозвіл | місце'),images),captureNotice,
          h('h4',{},t('记录访问失败或非菜谱','Record access failure or non-recipe','Записати помилку або не рецепт')),
          h('div',{class:'kb-actions'},failureType,failureText,failureButton),
          h('p',{class:'kb-muted'},t('非菜谱判断需要先核对作品正文。','Non-recipe decisions require checked post evidence.','Для рішення потрібен перевірений допис.')),
          h('div',{class:'kb-actions'},nonRecipeReviewer,nonRecipeReason,nonRecipeButton),
          h('h4',{},t('已存证据','Saved evidence','Збережені докази')),
          ...captures.map(c=>h('details',{},h('summary',{},`${c.status==='card_only'?t('卡片线索','Card lead','Картка'):c.status} · ${c.method} · ${c.capturedAt}`),
            c.evidence.media?h('p',{class:'kb-muted'},`${t('完整媒体','Full media','Повне відео')} ${duration(c.evidence.media.durationMs)} · SHA-256 ${c.evidence.media.sha256}`):null,
            h('pre',{},c.evidence.text??''),h('details',{},h('summary',{},t('展开音画记录','Timed source observations','Записи джерела')),h('pre',{},JSON.stringify(c.evidence.segments??[],null,2))),h('small',{},c.sha256))),
          ...(imageInfo.length?[h('h4',{},t('图片候选（不自动当成菜照）','Image candidates','Кандидати зображень')),h('ul',{},...imageInfo)]:[]),
          h('h4',{},t('手动生成待审核草稿','Create a review draft manually','Створити чернетку вручну')),proposalForm(captures)));
      const unavailable=!readyCapture||item.state==='blocked_auth'||item.state==='unavailable'||item.kind==='note'&&!candidates.length;
      const recovery=button(t('补充来源或记录采集失败','Add source or record capture failure','Додати джерело або записати помилку'),()=>{management.open=true;management.scrollIntoView({block:'start'});postText.focus();});
      replace(body,
        ...(candidates.length?[h('h4',{},t('待审核菜谱草稿','Recipe proposals','Чернетки рецептів')),...candidates.map(c=>candidateView(c,captures))]:[h('p',{class:'kb-muted'},t('还没有菜谱草稿，请补充已核对的来源资料。','No recipe draft yet. Add checked source evidence.','Чернетки ще немає. Додайте перевірене джерело.'))]),
        unavailable?h('section',{class:'kb-inbox-recovery'},h('p',{role:'status'},!readyCapture?t('尚无完整来源，不能确认这份草稿。','The complete source is missing; this draft cannot be confirmed.','Повного джерела немає; чернетку не можна підтвердити.'):t('采集需要处理，可补充来源或记录失败原因。','The source needs attention. Add evidence or record the capture failure.','Джерело потребує уваги. Додайте докази або запишіть помилку.')),
          item.lastError?h('p',{role:'alert'},item.lastError):null,recovery):null,
        link?h('a',{href:link,target:'_blank',rel:'noopener noreferrer'},t('打开原作品','Open original post','Відкрити оригінал')):h('span',{},item.url),
        item.classification?h('p',{class:'kb-status'},`${t('非菜谱判定','Non-recipe decision','Не рецепт')}: ${item.classification.reason} · ${item.classification.reviewer}`):null,management);
      for(const [key,control]of Object.entries({postText,locator,method,images,failureText,failureType,nonRecipeReviewer,nonRecipeReason}))bindInboxValue(buffer,key,control);
      function attemptNotice(target:HTMLElement){if(buffer.error)showError(target,buffer.error);if(buffer.unknown)target.append(button(t('核对或重试原请求','Check or retry original request','Перевірити або повторити початковий запит'),()=>void retry()));}
      async function retry(){if(buffer.busy)return;try{await writeInbox(buffer);if(current())await loadDetail();}catch(error){if(current()){showError(captureNotice,error);attemptNotice(captureNotice);}}}
      if(buffer.error)attemptNotice(captureNotice);
      for(const b of [captureButton,cardButton,failureButton,nonRecipeButton])b.disabled=b.disabled||buffer.busy||buffer.unknown;
      async function saveCapture(){if(!current()||buffer.busy||buffer.unknown)return;const text=postText.value.trim();if(!text){replace(captureNotice,h('p',{role:'alert'},t('请先填写核对过的原文。','Add checked source text first.','Спочатку додайте перевірений текст.')));return;}
        captureButton.disabled=true;try{const imageRows=lines(images.value).map(line=>{const [url,role,licenseStatus,imageLocator]=line.split('|').map(x=>x.trim());
          if(!url||!['preview','finished','step','ingredient'].includes(role??'')||!['unknown','granted','restricted'].includes(licenseStatus??''))throw new Error('图片须写 URL | preview/finished/step/ingredient | unknown/granted/restricted | 位置');
          return {url,role,licenseStatus,sourceUrl:item.url,locator:imageLocator??''};});
          await writeInbox(buffer,`/favorites/items/${item.id}/captures`,{method:method.value,status:'ready',evidence:{sourceUrl:item.url,text,segments:[{kind:method.value==='manual_post'?'post_text':'subtitle',locator:locator.value.trim()||'作品正文',text}],images:imageRows}},['postText','locator','method','images']);if(current())await loadDetail();}
        catch(error){if(current()){showError(captureNotice,error);attemptNotice(captureNotice);}}finally{captureButton.disabled=buffer.busy||buffer.unknown;}}
      async function saveCard(){if(!current()||buffer.busy||buffer.unknown)return;cardButton.disabled=true;try{await writeInbox(buffer,`/favorites/items/${item.id}/captures`,{method:'card',status:'card_only',evidence:{sourceUrl:item.url,text:item.cardAlt}});if(current())await loadDetail();}
        catch(error){if(current()){showError(captureNotice,error);attemptNotice(captureNotice);}}finally{cardButton.disabled=buffer.busy||buffer.unknown;}}
      async function saveFailure(){if(!current()||buffer.busy||buffer.unknown)return;failureButton.disabled=true;try{await writeInbox(buffer,`/favorites/items/${item.id}/captures`,{method:'platform_error',status:failureType.value,evidence:{sourceUrl:item.url,error:failureText.value.trim()}},['failureType','failureText']);if(current())await loadDetail();}
        catch(error){if(current()){showError(captureNotice,error);attemptNotice(captureNotice);}}finally{failureButton.disabled=buffer.busy||buffer.unknown;}}
      async function classify(){if(!current()||buffer.busy||buffer.unknown||!readyCapture)return;nonRecipeButton.disabled=true;try{await writeInbox(buffer,`/favorites/items/${item.id}/classify`,{decision:'non_recipe',captureId:readyCapture.id,reviewer:nonRecipeReviewer.value,reason:nonRecipeReason.value},['nonRecipeReviewer','nonRecipeReason']);if(current())await loadDetail();}
        catch(error){if(current()){showError(captureNotice,error);attemptNotice(captureNotice);}}finally{nonRecipeButton.disabled=buffer.busy||buffer.unknown;}}
    }
    function proposalForm(captures:Capture[]):HTMLElement{
      const eligible=captures.filter(c=>['ready','card_only'].includes(c.status));if(!eligible.length)return h('p',{class:'kb-muted'},t('先保存来源证据或卡片线索。','Save evidence or a card lead first.','Спочатку збережіть доказ або картку.'));
      const captureSelect=h('select',{},...eligible.map(c=>h('option',{value:c.id},`${c.status} · ${c.capturedAt}`))) as HTMLSelectElement;
      const title=h('input',{type:'text'}) as HTMLInputElement,titleQuote=h('input',{type:'text'}) as HTMLInputElement;
      const ingredients=h('textarea',{rows:'5',placeholder:'食材名 | 原方用量 | 原文引句 | 位置'}) as HTMLTextAreaElement;
      const steps=h('textarea',{rows:'5',placeholder:'步骤说明 | 原文引句 | 位置'}) as HTMLTextAreaElement;
      const feedback=h('div'),create=button(t('生成待审核草稿','Create review draft','Створити чернетку'),()=>void propose(),true);
      const proposalBuffer=inboxBuffer(`proposal:${item.id}`);
      proposalBuffer.refresh=refresh;
      for(const [key,control]of Object.entries({captureSelect,title,titleQuote,ingredients,steps}))bindInboxValue(proposalBuffer,key,control);
      create.disabled=proposalBuffer.busy||proposalBuffer.unknown;
      async function propose(){if(!current()||proposalBuffer.busy||proposalBuffer.unknown)return;create.disabled=true;try{
        const selected=eligible.find(c=>c.id===captureSelect.value)!;
        const attempt={captureId:selected.id,...recipeProposal(title.value,titleQuote.value,ingredients.value,steps.value),imageCandidates:(selected.evidence.images??[]).map(i=>({url:i.url,role:i.role,licenseStatus:i.licenseStatus}))};
        await writeInbox(proposalBuffer,`/favorites/items/${item.id}/candidates`,attempt,['captureSelect','title','titleQuote','ingredients','steps']);if(current())await loadDetail();
      }catch(error){if(current()){showError(feedback,error);if(proposalBuffer.unknown)feedback.append(button(t('核对或重试原请求','Check or retry original request','Перевірити або повторити початковий запит'),()=>void retryProposal()));}}finally{create.disabled=proposalBuffer.busy||proposalBuffer.unknown;}}
      async function retryProposal(){if(proposalBuffer.busy)return;try{await writeInbox(proposalBuffer);if(current())await loadDetail();}catch(error){if(current())proposalNotice();}}
      function proposalNotice(){if(proposalBuffer.error)showError(feedback,proposalBuffer.error);if(proposalBuffer.unknown)feedback.append(button(t('核对或重试原请求','Check or retry original request','Перевірити або повторити початковий запит'),()=>void retryProposal()));}
      proposalNotice();
      return h('div',{class:'kb-inbox-proposal'},field(t('使用哪次来源','Evidence version','Версія доказу'),captureSelect),field(t('菜名','Recipe name','Назва рецепта'),title),
        field(t('菜名的原文引句','Title quote','Цитата назви'),titleQuote),field(t('食材：每行名称 | 原方用量 | 引句 | 位置','Ingredients: name | original amount | quote | locator','Інгредієнти'),ingredients),
        field(t('步骤：每行步骤 | 引句 | 位置','Steps: action | quote | locator','Кроки'),steps),create,feedback);
    }
    function sourceFigure(image:Illustration):HTMLElement {
      const caption=image.caption[ctx.lang]??image.caption.zh??image.caption.en??image.caption.uk??'';
      const picture=h('div',{class:'kb-reference-picture'}), figure=h('figure',{class:'kb-reference-image','data-role':image.role,'data-step-id':image.stepId},picture,
        h('figcaption',{},caption,h('small',{},`${image.author} · ${t('原片参考图','Source video frame','Кадр оригіналу')} · ${t('使用权待核实','Rights not verified','Права не перевірено')}`)));
      let controller:AbortController|undefined,objectUrl:string|undefined,disposed=false;
      function revoke(){if(objectUrl&&imageUrls.delete(objectUrl))URL.revokeObjectURL(objectUrl);objectUrl=undefined;}
      detailImageDisposers.add(()=>{disposed=true;controller?.abort();if(controller)imageControllers.delete(controller);revoke();});
      function failed(){revoke();if(current()&&figure.isConnected)replace(picture,h('p',{role:'alert'},t('图片未加载，可重试。','Image did not load. Retry.','Зображення не завантажено. Спробуйте знову.')),button(t('重试图片','Retry image','Повторити зображення'),()=>void load()));}
      async function load(){
        if(disposed||!current()||!figure.isConnected)return;
        controller?.abort();revoke();const currentEpoch=imageEpoch,read=new AbortController();controller=read;imageControllers.add(read);
        replace(picture,h('p',{role:'status'},t('正在加载原片图…','Loading source frame…','Завантаження кадру…')));
        try{
          const blob=await api.image(image.url,read.signal);
          if(read.signal.aborted||currentEpoch!==imageEpoch||!current()||!figure.isConnected)return;
          objectUrl=URL.createObjectURL(blob);imageUrls.add(objectUrl);
          const img=h('img',{src:objectUrl,alt:caption,loading:'lazy'});
          img.addEventListener('error',()=>{if(currentEpoch===imageEpoch&&!read.signal.aborted)failed();});
          replace(picture,img);
        }catch{if(!read.signal.aborted&&currentEpoch===imageEpoch)failed();}
        finally{imageControllers.delete(read);}
      }
      queueMicrotask(()=>void load());
      return figure;
    }
    function candidateView(candidate:Candidate,captures:Capture[]):HTMLElement{
      const source=captures.find(c=>c.id===candidate.captureId);
      const reviewBuffer=inboxBuffer(`review:${candidate.id}`);
      reviewBuffer.refresh=refresh;
      const reviewer=h('input',{type:'text'}) as HTMLInputElement;
      const note=h('textarea',{rows:'3'}) as HTMLTextAreaElement;
      bindInboxValue(reviewBuffer,'reviewer',reviewer);bindInboxValue(reviewBuffer,'note',note);
      const result=h('div');
      function reviewError(error:unknown){showError(result,error);if(reviewBuffer.unknown)result.append(button(t('核对或重试原请求','Check or retry original request','Перевірити або повторити початковий запит'),()=>void retryReview()));}
      async function review(decision:'approve'|'reject'){
        if(reviewBuffer.busy||reviewBuffer.unknown)return;
        if(!reviewer.value.trim()){replace(result,h('p',{role:'alert'},t('请填写来源核对人。','Enter the source reviewer.','Вкажіть, хто перевірив джерело.')));reviewer.focus();return;}
        try{await writeInbox(reviewBuffer,`/favorites/candidates/${candidate.id}/review`,{decision,reviewer:reviewer.value.trim(),note:note.value.trim()},['reviewer','note']);if(current())await loadDetail();}
        catch(error){if(current())reviewError(error);}}
      async function retryReview(){if(reviewBuffer.busy)return;try{await writeInbox(reviewBuffer);if(current())await loadDetail();}catch(error){if(current())reviewError(error);}}
      if(reviewBuffer.error)reviewError(reviewBuffer.error);
      const completeVideo=safeExternal(item.url);
      const ingredients=candidate.recipe.ingredients??[],steps=candidate.recipe.steps??[],unresolved=candidate.unresolved??[];
      const illustrations=candidate.illustrations??[];
      const sourceImages=(role:Illustration['role'],stepId?:string)=>illustrations.filter(image=>image.role===role&&(!stepId||image.stepId===stepId)).map(sourceFigure);
      const row=h('details',{class:'kb-inbox-candidate',open:true},h('summary',{},`${titleText(candidate.recipe.title)} · ${stateText(candidate.status)}`),
        h('div',{class:'kb-full-recipe'},
          h('div',{class:'kb-full-recipe-head'},h('h3',{},titleText(candidate.recipe.title)),
            h('p',{class:'kb-muted'},candidate.recipe.baseServings
              ?`${t('原方','Original yield','Оригінал')} ${candidate.recipe.baseServings} ${t('份','servings','порцій')}`
              :t('原方份数待师傅核定','Original serving count awaits cook verification','Кількість порцій очікує перевірки кухаря')),
            completeVideo?h('a',{href:completeVideo,target:'_blank',rel:'noopener noreferrer',class:'kb-full-video'},t('▶ 观看完整原视频','▶ Watch the complete source video','▶ Переглянути повне відео')):h('span',{},item.url),
            source?.evidence.media?h('small',{},`${t('视频','Video','Відео')} ${duration(source.evidence.media.durationMs)}`):h('span')),
          h('div',{class:'kb-full-recipe-grid'},
            h('section',{},h('h4',{},`${t('全部食材与调料','All ingredients and seasonings','Усі інгредієнти')} · ${ingredients.length}`),
              h('ul',{class:'kb-recipe-ingredients'},...ingredients.map(ingredient=>h('li',{class:'kb-recipe-ingredient'},
                h('strong',{},titleText(ingredient.name)),
                h('span',{},amountLabel(ingredient.amount,t('用量未说明','Amount not stated','Кількість не вказана'))),
                ingredient.preparation?h('small',{},titleText(ingredient.preparation)):h('span')))),h('div',{class:'kb-reference-images'},...sourceImages('ingredient'))),
            h('section',{},h('h4',{},`${t('完整做法','Complete method','Повний спосіб')} · ${steps.length}`),
              h('ol',{class:'kb-recipe-steps'},...steps.map(step=>h('li',{class:'kb-recipe-step','data-step-id':step.id},h('p',{},titleText(step.text)),...sourceImages('step',step.id)))),h('div',{class:'kb-reference-images kb-reference-finished'},...sourceImages('finished')))),
          unresolved.length?h('section',{class:'kb-recipe-unresolved'},h('h4',{},`${t('来源仍需核实的事项','Questions left by the source','Питання щодо джерела')} · ${unresolved.length}`),
            h('ul',{},...unresolved.slice(0,10).map(value=>h('li',{},value))),
            unresolved.length>10?h('details',{},h('summary',{},`${t('更多逐字段核对点','More field questions','Більше питань')} · ${unresolved.length-10}`),
              h('ul',{},...unresolved.slice(10).map(value=>h('li',{},value)))):null):h('span'),
          h('details',{class:'kb-recipe-technical'},h('summary',{},t('查看 AI 提取依据与媒体指纹','AI extraction evidence and media hash','Докази витягу та хеш відео')),
            h('pre',{},JSON.stringify({fieldEvidence:candidate.fieldEvidence,imageCandidates:candidate.imageCandidates,illustrations:candidate.illustrations,media:source?.evidence.media},null,2)))));
      if(candidate.recipeId){
        row.append(h('section',{class:'kb-inbox-next'},h('h4',{},t('下一步：正式菜谱与厨房核定','Next: formal recipe and kitchen approval','Далі: рецепт і кухонне схвалення')),
          h('p',{},t('来源已确认并保存独立菜谱，尚不代表厨房核定。进入编辑器核对原方、厨房修订和未知条件，再明确批准并采用到所选计划。','The source is confirmed and saved as a recipe. Kitchen approval is separate. Open the editor to review original and kitchen changes, preserve unknowns, then explicitly approve and adopt into the selected plan.','Джерело підтверджено й рецепт збережено. Кухонне схвалення — окремий крок. Перевірте оригінал, зміни та невідомі умови в редакторі, потім схваліть і додайте до обраного плану.')),
          h('a',{class:'kb-full-video',href:`#/admin/knowledge/${candidate.recipeId}`},t('进入正式菜谱编辑器核定','Open recipe editor for kitchen approval','Відкрити редактор для кухонного схвалення')),
          h('a',{class:'kb-link',href:`#/admin/knowledge/${candidate.recipeId}/revisions/${candidate.recipeVersion}`},`${t('查看来源确认时的原方','Original recipe at source confirmation','Оригінал на час підтвердження')} v${candidate.recipeVersion}`)));
      } else if(candidate.status==='needs_review'){
        const approve=button(t('确认来源并保存菜谱','Confirm source and save recipe','Підтвердити джерело й зберегти рецепт'),()=>void review('approve'),true);
        const reject=button(t('退回','Reject','Відхилити'),()=>void review('reject'));
        approve.disabled=source?.status!=='ready'||reviewBuffer.busy||reviewBuffer.unknown;reject.disabled=reviewBuffer.busy||reviewBuffer.unknown;
        row.append(h('section',{class:'kb-inbox-source-review'},h('h4',{},t('来源确认','Source confirmation','Підтвердження джерела')),
          h('p',{class:'kb-muted'},t('核对原片与完整做法，未说明的用量和时间继续保留。这里仅确认来源；厨房核定与菜单采用在正式菜谱中进行。','Check the source and complete recipe. Keep unstated amounts and times unknown. This confirms the source only; kitchen approval and menu adoption happen in the formal recipe.','Звірте джерело й повний рецепт. Невказані кількості та час залишаються невідомими. Тут підтверджується лише джерело; кухонне схвалення і планування — у рецепті.')),
          field(t('来源核对人','Source reviewer','Хто перевірив джерело'),reviewer),field(t('来源核对备注','Source review note','Примітка про джерело'),note),h('div',{class:'kb-actions'},approve,reject),
          source?.status!=='ready'?h('p',{role:'alert'},t('来源尚不完整，请通过采集管理补充已核对的原作品。','The source is incomplete. Add checked original evidence through source administration.','Джерело неповне. Додайте перевірені докази через керування джерелами.')):null,result));
      }
      return row;
    }
    return detail;
  }
  await Promise.all([loadBatches(),loadItems(true)]);
}
