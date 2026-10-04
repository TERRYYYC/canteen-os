import { datedPlanIdOfDate } from '@canteenos/core';
import { localDateIso } from '../../../local-date';
import { h, replace } from '../../../dom';
import { onRoute } from '../../../router';
import { onAuthSessionChange } from '../../../admin/token';
import type { PageCtx } from '../../../types';
import { getKnowledgeApi, type I18n, type Recipe } from '../../../api/knowledge';
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
const errorText = (error: unknown) => error instanceof Error ? error.message : '请求未完成，请重试。';
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
  const t = words(ctx.lang), api = getKnowledgeApi();
  const stateText=(value:string)=>{const labels=stateName[value];return labels?t(...labels):t('待核对','Needs review','Потребує перевірки');};
  const titleText=(value:I18n|undefined)=>value?.[ctx.lang]||value?.zh||value?.en||value?.uk||'';
  let csvRows: FavoriteCsvRow[] | null = null, prepared: Batch | null = null, loading = false, cursor: string | null = null, searchTerm = '', listEpoch = 0;
  const info = h('div'), cards = h('div', { class:'kb-inbox-list' }), batchInfo = h('div');
  const searchInput=h('input',{type:'search',placeholder:t('例如：陈皮排骨','For example: tangerine peel ribs','Наприклад: реберця')}) as HTMLInputElement;
  const searchButton=button(t('搜索菜名','Search recipe names','Пошук за назвою'),()=>{searchTerm=searchInput.value.trim();void loadItems(true);});
  const searchForm=h('form',{class:'kb-inbox-search'},field(t('按菜名搜索待审核做法','Search recipe candidates by name','Пошук рецептів за назвою'),searchInput),searchButton);
  searchForm.addEventListener('submit',event=>{event.preventDefault();searchTerm=searchInput.value.trim();void loadItems(true);});
  const file = h('input',{ type:'file',accept:'.csv,text/csv' }) as HTMLInputElement;
  const claimed = h('input',{ type:'number',min:'0',step:'1',value:'264' }) as HTMLInputElement;
  const inspect = button(t('检查 CSV','Inspect CSV','Перевірити CSV'),()=>void prepare(),true);
  const apply = button(t('确认入箱','Add to inbox','Додати до вхідних'),()=>void importRows()); apply.disabled = true;
  const more = button(t('继续加载','Load more','Завантажити ще'),()=>void loadItems(false)); more.hidden = true;
  root.append(h('div',{class:'kb-header'},h('h2',{},t('抖音收藏收件箱','Douyin favorites inbox','Вхідні обраного Douyin')),h('a',{class:'kb-link',href:'#/admin/knowledge'},t('返回菜谱库','Back to recipe library','До бібліотеки рецептів'))),
    h('p',{class:'kb-muted'},t('先找菜、打开作品核对完整做法，再审核来源。保存菜谱不会自动发布菜单。','Find a recipe, inspect the full source, then review it. Saving never publishes a menu.','Знайдіть рецепт, перевірте джерело й лише тоді схвалюйте. Збереження не публікує меню.')),
    h('section',{class:'kb-panel'},h('h3',{},t('找一款做法','Find a recipe','Знайти рецепт')),searchForm,
      h('p',{class:'kb-muted'},t('列表显示原片参考图与做法摘要；图片使用权待核实。来源审核与厨房用量核定是两步。','The list shows source-frame previews and recipe summaries. Image rights still need review. Source approval and kitchen quantities are separate steps.','Список показує кадри оригіналу й короткий опис. Права на зображення ще не перевірено. Джерело і кухонні кількості перевіряються окремо.'))),
    h('section',{class:'kb-panel'},h('h3',{},t('待处理作品','Source items','Джерела')),cards,more),
    h('details',{class:'kb-panel kb-inbox-import'},h('summary',{},t('导入收藏 CSV（管理）','Import favorites CSV (administration)','Імпорт CSV (керування)')),
      h('div',{class:'kb-inbox-import-body'},h('div',{class:'kb-actions'},field(t('CSV 文件','CSV file','Файл CSV'),file),field(t('收藏夹页面计数','Collection count','Кількість у колекції'),claimed),inspect,apply),
        h('p',{class:'kb-muted'},t('检查不会写库。卡片文字只作为线索，不能直接批准成菜谱。','Inspection does not write. Card text is a lead, not verified recipe evidence.','Перевірка не записує дані. Текст картки — лише підказка.')),info,batchInfo)));
  file.addEventListener('change',async()=>{ prepared=null;apply.disabled=true;csvRows=null;replace(info);
    const selected=file.files?.[0];if(!selected)return;
    try { csvRows=parseFavoritesCsv(await selected.text()); replace(info,h('p',{role:'status'},`${selected.name} · ${csvRows.length} ${t('条卡片','cards','карток')}`)); }
    catch(error){ replace(info,h('p',{role:'alert'},errorText(error))); }
  });
  claimed.addEventListener('input',()=>{prepared=null;apply.disabled=true;});
  async function prepare() {
    if (!csvRows || loading) { if (!csvRows) replace(info,h('p',{role:'alert'},t('请先选择收藏 CSV。','Choose a favorites CSV first.','Спочатку виберіть CSV.'))); return; }
    const count=Number(claimed.value);if(!Number.isSafeInteger(count)||count<0){replace(info,h('p',{role:'alert'},t('页面计数必须是非负整数。','The collection count must be a whole number.','Кількість має бути цілим числом.')));return;}
    loading=true;inspect.disabled=true;apply.disabled=true;
    try { const { data }=await api.request<Batch>('/favorites/import/prepare',{method:'POST',body:JSON.stringify({folder:csvRows[0]?.folder??'吃的',claimedCount:count,rows:csvRows})});
      if(!active())return;prepared=data;apply.disabled=false;
      replace(info,h('p',{role:'status'},`${t('有效','Valid','Коректні')} ${data.validCount} · ${t('坏行','Rejected rows','Відхилені рядки')} ${data.rejectedCount} · ${t('差额待查','Gap to inspect','Різниця')} ${data.coverageGap}`),
        ...(data.rejections?.length?[h('details',{},h('summary',{},t('查看坏行','View rejected rows','Переглянути відхилення')),h('pre',{},JSON.stringify(data.rejections,null,2)))]:[])); }
    catch(error){if(active())replace(info,h('p',{role:'alert'},errorText(error)));}
    finally{loading=false;inspect.disabled=false;}
  }
  async function importRows() {
    if(!prepared||!csvRows||loading)return;loading=true;apply.disabled=true;
    try {const {data}=await api.request<Batch>('/favorites/import/apply',{method:'POST',body:JSON.stringify({folder:csvRows[0]?.folder??'吃的',claimedCount:Number(claimed.value),rows:csvRows})});
      if(!active())return;replace(info,h('p',{role:'status'},`${t('已入箱','Imported','Імпортовано')} ${data.validCount} · ${t('本次新建','New this time','Нових')} ${data.replayed?0:data.insertedCount} · ${t('差额待查','Gap','Різниця')} ${data.coverageGap}${data.replayed?` · ${t('重复导入已识别','Repeat import recognized','Повторний імпорт розпізнано')}`:''}`));await Promise.all([loadBatches(),loadItems(true)]);}
    catch(error){if(active())replace(info,h('p',{role:'alert'},`${errorText(error)} ${t('文件和预览仍保留，可用同一文件重试。','The file is retained; retry the same import.','Файл збережено; повторіть імпорт.')}`));}
    finally{loading=false;apply.disabled=false;}
  }
  async function loadBatches(){try{const {data}=await api.request<{items:Batch[]}>('/favorites/imports');if(!active())return;
    const latest=data.items[0];replace(batchInfo,latest?h('p',{class:'kb-status'},`${t('收藏卡片入箱','Source cards imported','Імпортовано картки джерел')}: ${latest.validCount}/${latest.claimedCount} · ${t('差额','Gap','Різниця')} ${latest.coverageGap} · ${t('坏行','Rejected','Відхилено')} ${latest.rejectedCount} · ${t('这是收藏 CSV 覆盖数，不是已解析菜谱数。','This counts imported CSV cards, not analyzed recipes.','Це кількість карток CSV, а не проаналізованих рецептів.')}`):h('p',{class:'kb-muted'},t('尚未导入收藏。','No favorites imported yet.','Ще нічого не імпортовано.')));
  }catch(error){if(active())replace(batchInfo,h('p',{role:'alert'},errorText(error)));}}
  async function loadItems(reset:boolean){if(reset){listEpoch++;releaseInboxImages();cursor=null;replace(cards);}const epoch=listEpoch,params=new URLSearchParams({limit:'50',folder:'吃的'});if(searchTerm)params.set('q',searchTerm);if(cursor)params.set('cursor',cursor);
    try{const {data}=await api.request<{items:Item[];nextCursor:string|null}>(`/favorites/items?${params}`);if(!active()||epoch!==listEpoch)return;
      for(const item of data.items)cards.append(renderItem(item));cursor=data.nextCursor;more.hidden=!cursor;
      if(reset&&!data.items.length)cards.append(h('p',{class:'kb-muted'},searchTerm?t('没有找到这个菜名的草稿。','No candidate matches that recipe name.','За цією назвою рецептів не знайдено.'):t('收件箱还没有作品。','The inbox is empty.','Вхідні порожні.')));
    }catch(error){if(active()&&epoch===listEpoch)cards.append(h('p',{role:'alert'},errorText(error)));}}
  function previewImage(assetId:string,title:string):{element:HTMLElement;dispose:()=>void}{
    const frame=h('span',{class:'kb-inbox-preview','data-asset-state':'loading'},t('原片参考图读取中','Loading source frame','Завантаження кадру'));
    const controller=new AbortController(),epoch=imageEpoch;let objectUrl:string|undefined,started=false;
    imageControllers.add(controller);
    function dispose(){previewObserver?.unobserve(frame);previewLoads.delete(frame);controller.abort();imageControllers.delete(controller);if(objectUrl&&imageUrls.delete(objectUrl))URL.revokeObjectURL(objectUrl);objectUrl=undefined;}
    function load(){if(started||controller.signal.aborted||epoch!==imageEpoch||!active()||!frame.isConnected)return;started=true;
      void api.image(`/api/v1/assets/${assetId}/content`,controller.signal).then(blob=>{
        if(controller.signal.aborted||epoch!==imageEpoch||!active()||!frame.isConnected)return;
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
    const detail=h('details',{class:'kb-inbox-item'},summary,body);let loaded=false;
    const detailImageDisposers=new Set<()=>void>();
    detail.addEventListener('toggle',()=>{if(detail.open&&!loaded){loaded=true;void loadDetail();}});
    async function loadDetail(){for(const dispose of detailImageDisposers)dispose();detailImageDisposers.clear();replace(body,h('p',{},t('正在读取证据…','Loading evidence…','Завантаження…')));
      try{const [current,captures,candidates]=await Promise.all([api.request<Item>(`/favorites/items/${item.id}`),api.request<{items:Capture[]}>(`/favorites/items/${item.id}/captures`),api.request<{items:Candidate[]}>(`/favorites/items/${item.id}/candidates`)]);
        if(!active()||!detail.isConnected)return;Object.assign(item,current.data);
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
      }catch(error){if(active())replace(body,h('p',{role:'alert'},errorText(error)),button(t('重试','Retry','Повторити'),()=>void loadDetail()));}}
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
      replace(body,link?h('a',{href:link,target:'_blank',rel:'noopener noreferrer'},t('打开原作品','Open original post','Відкрити оригінал')):h('span',{},item.url),
        h('details',{},h('summary',{},t('收藏卡片原文（未核验）','Saved card text (unverified)','Текст картки (неперевірено)')),h('pre',{},item.cardAlt),h('pre',{},item.displayText)),
        item.lastError?h('p',{role:'alert'},item.lastError):h('p',{class:'kb-muted'},readyCapture
          ?t('已有作品证据；下方先显示完整菜谱和原视频，未定条件列在菜谱后。','Source evidence is saved. The full recipe and video appear below, followed by unresolved conditions.','Доказ збережено. Нижче повний рецепт, відео та невирішені питання.')
          :t('尚无原作品正文；失败和未知用量保持可见。','No source post text yet. Failures and unknown amounts remain visible.','Текст оригіналу ще не отримано.')),
        item.classification?h('p',{class:'kb-status'},`${t('非菜谱判定','Non-recipe decision','Не рецепт')}: ${item.classification.reason} · ${item.classification.reviewer}`):h('span'),
        ...(candidates.length?[h('h4',{},t('待审核菜谱草稿','Recipe proposals','Чернетки рецептів')),...candidates.map(c=>candidateView(c,captures))]:[]),
        h('div',{class:'kb-actions'},cardButton),field(t('作品正文或字幕','Post text or transcript','Текст або субтитри'),postText),
        h('div',{class:'kb-actions'},field(t('来源位置','Source location','Місце джерела'),locator),field(t('来源方式','Evidence type','Тип джерела'),method),captureButton),
        field(t('图片候选：URL | 角色 | 许可状态 | 位置（可留空）','Image candidates: URL | role | license | locator (optional)','Зображення: URL | роль | дозвіл | місце'),images),captureNotice,
        h('details',{},h('summary',{},t('记录访问失败或非菜谱','Record access failure or non-recipe','Записати помилку або не рецепт')),
          h('div',{class:'kb-actions'},failureType,failureText,failureButton),
          h('p',{class:'kb-muted'},t('非菜谱判断需要先核对作品正文。','Non-recipe decisions require checked post evidence.','Для рішення потрібен перевірений допис.')),
          h('div',{class:'kb-actions'},nonRecipeReviewer,nonRecipeReason,nonRecipeButton)),
        h('h4',{},t('已存证据','Saved evidence','Збережені докази')),
        ...captures.map(c=>h('details',{},h('summary',{},`${c.status==='card_only'?t('卡片线索','Card lead','Картка'):c.status} · ${c.method} · ${c.capturedAt}`),
          c.evidence.media?h('p',{class:'kb-muted'},`${t('完整媒体','Full media','Повне відео')} ${duration(c.evidence.media.durationMs)} · ${c.evidence.segments?.length??0} ${t('条音画记录','timed observations','записів')} · SHA-256 ${c.evidence.media.sha256}`):h('pre',{},c.evidence.text??''),
          h('small',{},c.sha256))),
        ...(imageInfo.length?[h('h4',{},t('图片候选（不自动当成菜照）','Image candidates','Кандидати зображень')),h('ul',{},...imageInfo)]:[]),
        h('h4',{},t('手动生成待审核草稿','Create a review draft manually','Створити чернетку вручну')),proposalForm(captures));
      async function saveCapture(){const text=postText.value.trim();if(!text){replace(captureNotice,h('p',{role:'alert'},t('请先填写核对过的原文。','Add checked source text first.','Спочатку додайте перевірений текст.')));return;}
        captureButton.disabled=true;try{const imageRows=lines(images.value).map(line=>{const [url,role,licenseStatus,imageLocator]=line.split('|').map(x=>x.trim());
          if(!url||!['preview','finished','step','ingredient'].includes(role??'')||!['unknown','granted','restricted'].includes(licenseStatus??''))throw new Error('图片须写 URL | preview/finished/step/ingredient | unknown/granted/restricted | 位置');
          return {url,role,licenseStatus,sourceUrl:item.url,locator:imageLocator??''};});
          await api.request(`/favorites/items/${item.id}/captures`,{method:'POST',body:JSON.stringify({method:method.value,status:'ready',evidence:{sourceUrl:item.url,text,segments:[{kind:method.value==='manual_post'?'post_text':'subtitle',locator:locator.value.trim()||'作品正文',text}],images:imageRows}})});if(active())await loadDetail();}
        catch(error){if(active())replace(captureNotice,h('p',{role:'alert'},errorText(error)));}finally{captureButton.disabled=false;}}
      async function saveCard(){cardButton.disabled=true;try{await api.request(`/favorites/items/${item.id}/captures`,{method:'POST',body:JSON.stringify({method:'card',status:'card_only',evidence:{sourceUrl:item.url,text:item.cardAlt}})});if(active())await loadDetail();}
        catch(error){if(active())replace(captureNotice,h('p',{role:'alert'},errorText(error)));}finally{cardButton.disabled=false;}}
      async function saveFailure(){failureButton.disabled=true;try{await api.request(`/favorites/items/${item.id}/captures`,{method:'POST',body:JSON.stringify({method:'platform_error',status:failureType.value,evidence:{sourceUrl:item.url,error:failureText.value.trim()}})});if(active())await loadDetail();}
        catch(error){if(active())replace(captureNotice,h('p',{role:'alert'},errorText(error)));}finally{failureButton.disabled=false;}}
      async function classify(){if(!readyCapture)return;nonRecipeButton.disabled=true;try{await api.request(`/favorites/items/${item.id}/classify`,{method:'POST',body:JSON.stringify({decision:'non_recipe',captureId:readyCapture.id,reviewer:nonRecipeReviewer.value,reason:nonRecipeReason.value})});if(active())await loadDetail();}
        catch(error){if(active())replace(captureNotice,h('p',{role:'alert'},errorText(error)));}finally{nonRecipeButton.disabled=false;}}
    }
    function proposalForm(captures:Capture[]):HTMLElement{
      const eligible=captures.filter(c=>['ready','card_only'].includes(c.status));if(!eligible.length)return h('p',{class:'kb-muted'},t('先保存来源证据或卡片线索。','Save evidence or a card lead first.','Спочатку збережіть доказ або картку.'));
      const captureSelect=h('select',{},...eligible.map(c=>h('option',{value:c.id},`${c.status} · ${c.capturedAt}`))) as HTMLSelectElement;
      const title=h('input',{type:'text'}) as HTMLInputElement,titleQuote=h('input',{type:'text'}) as HTMLInputElement;
      const ingredients=h('textarea',{rows:'5',placeholder:'食材名 | 原方用量 | 原文引句 | 位置'}) as HTMLTextAreaElement;
      const steps=h('textarea',{rows:'5',placeholder:'步骤说明 | 原文引句 | 位置'}) as HTMLTextAreaElement;
      const feedback=h('div'),create=button(t('生成待审核草稿','Create review draft','Створити чернетку'),()=>void propose(),true);
      let attempt: unknown;
      for(const control of [captureSelect,title,titleQuote,ingredients,steps])control.addEventListener('input',()=>{attempt=undefined;});
      async function propose(){create.disabled=true;try{
        const selected=eligible.find(c=>c.id===captureSelect.value)!;
        attempt??={captureId:selected.id,...recipeProposal(title.value,titleQuote.value,ingredients.value,steps.value),imageCandidates:(selected.evidence.images??[]).map(i=>({url:i.url,role:i.role,licenseStatus:i.licenseStatus}))};
        await api.request(`/favorites/items/${item.id}/candidates`,{method:'POST',body:JSON.stringify(attempt)});if(active())await loadDetail();
      }catch(error){if(active())replace(feedback,h('p',{role:'alert'},errorText(error)));}finally{create.disabled=false;}}
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
      function failed(){revoke();if(active()&&figure.isConnected)replace(picture,h('p',{role:'alert'},t('图片未加载，可重试。','Image did not load. Retry.','Зображення не завантажено. Спробуйте знову.')),button(t('重试图片','Retry image','Повторити зображення'),()=>void load()));}
      async function load(){
        if(disposed||!active()||!figure.isConnected)return;
        controller?.abort();revoke();const currentEpoch=imageEpoch,read=new AbortController();controller=read;imageControllers.add(read);
        replace(picture,h('p',{role:'status'},t('正在加载原片图…','Loading source frame…','Завантаження кадру…')));
        try{
          const blob=await api.image(image.url,read.signal);
          if(read.signal.aborted||currentEpoch!==imageEpoch||!active()||!figure.isConnected)return;
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
      const reviewer=h('input',{type:'text',placeholder:t('审核人','Reviewer','Рецензент')}) as HTMLInputElement;
      const note=h('input',{type:'text',placeholder:t('审核备注','Review note','Примітка')}) as HTMLInputElement;
      const result=h('div');
      async function review(decision:'approve'|'reject'){
        try{await api.request(`/favorites/candidates/${candidate.id}/review`,{method:'POST',body:JSON.stringify({decision,reviewer:reviewer.value,note:note.value})});if(active())await loadDetail();}
        catch(error){if(active())replace(result,h('p',{role:'alert'},errorText(error)));}}
      const completeVideo=safeExternal(item.url);
      const ingredients=candidate.recipe.ingredients??[],steps=candidate.recipe.steps??[],unresolved=candidate.unresolved??[];
      const illustrations=candidate.illustrations??[];
      const sourceImages=(role:Illustration['role'],stepId?:string)=>illustrations.filter(image=>image.role===role&&(!stepId||image.stepId===stepId)).map(sourceFigure);
      const row=h('details',{class:'kb-inbox-candidate',open:true},h('summary',{},`${titleText(candidate.recipe.title)} · ${stateText(candidate.status)}`),
        h('div',{class:'kb-full-recipe'},
          h('div',{class:'kb-full-recipe-head'},h('h3',{},candidate.recipe.title.zh??candidate.recipe.title.en??''),
            h('p',{class:'kb-muted'},candidate.recipe.baseServings
              ?`${t('原方','Original yield','Оригінал')} ${candidate.recipe.baseServings} ${t('份','servings','порцій')}`
              :t('原方份数待师傅核定','Original serving count awaits cook verification','Кількість порцій очікує перевірки кухаря')),
            completeVideo?h('a',{href:completeVideo,target:'_blank',rel:'noopener noreferrer',class:'kb-full-video'},t('▶ 观看完整原视频','▶ Watch the complete source video','▶ Переглянути повне відео')):h('span',{},item.url),
            source?.evidence.media?h('small',{},`${t('视频','Video','Відео')} ${duration(source.evidence.media.durationMs)} · ${source.evidence.segments?.length??0} ${t('条音画记录','timed observations','записів')}`):h('span')),
          h('div',{class:'kb-full-recipe-grid'},
            h('section',{},h('h4',{},`${t('全部食材与调料','All ingredients and seasonings','Усі інгредієнти')} · ${ingredients.length}`),
              h('ul',{class:'kb-recipe-ingredients'},...ingredients.map(ingredient=>h('li',{class:'kb-recipe-ingredient'},
                h('strong',{},ingredient.name.zh??ingredient.name.en??ingredient.name.uk??''),
                h('span',{},amountLabel(ingredient.amount,t('用量未说明','Amount not stated','Кількість не вказана'))),
                ingredient.preparation?h('small',{},ingredient.preparation.zh??ingredient.preparation.en??ingredient.preparation.uk??''):h('span')))),h('div',{class:'kb-reference-images'},...sourceImages('ingredient'))),
            h('section',{},h('h4',{},`${t('完整做法','Complete method','Повний спосіб')} · ${steps.length}`),
              h('ol',{class:'kb-recipe-steps'},...steps.map(step=>h('li',{class:'kb-recipe-step','data-step-id':step.id},h('p',{},step.text.zh??step.text.en??step.text.uk??''),...sourceImages('step',step.id)))),h('div',{class:'kb-reference-images kb-reference-finished'},...sourceImages('finished')))),
          unresolved.length?h('section',{class:'kb-recipe-unresolved'},h('h4',{},`${t('来源仍需核实的事项','Questions left by the source','Питання щодо джерела')} · ${unresolved.length}`),
            h('ul',{},...unresolved.slice(0,10).map(value=>h('li',{},value))),
            unresolved.length>10?h('details',{},h('summary',{},`${t('更多逐字段核对点','More field questions','Більше питань')} · ${unresolved.length-10}`),
              h('ul',{},...unresolved.slice(10).map(value=>h('li',{},value)))):null):h('span'),
          h('details',{class:'kb-recipe-technical'},h('summary',{},t('查看 AI 提取依据与媒体指纹','AI extraction evidence and media hash','Докази витягу та хеш відео')),
            h('pre',{},JSON.stringify({fieldEvidence:candidate.fieldEvidence,imageCandidates:candidate.imageCandidates,illustrations:candidate.illustrations,media:source?.evidence.media},null,2)))));
      if(candidate.recipeId){
        const materialNotice=h('div'),newVersion=h('div');
        const material=button(t('固定此版本供菜单使用','Freeze this version for menus','Зафіксувати версію для меню'),()=>void materialize());
        async function materialize(){material.disabled=true;try{
          const {data}=await api.request<{dishRef:string;recipeVersion:number;commit:string;unchanged:boolean;unresolvedCount:number}>(`/materializations/${candidate.id}`,{method:'POST',body:'{}'});
          if(active())showFrozen(data);
        }catch(error){if(active())replace(materialNotice,h('p',{role:'alert'},errorText(error)));}finally{material.disabled=false;}}
        function showFrozen(data:{dishRef:string;recipeVersion:number;commit:string;unresolvedCount:number}){
          const currentWeek=datedPlanIdOfDate(localDateIso());
          replace(materialNotice,h('p',{role:'status'},`${t('已固定菜谱版本','Recipe version frozen','Версію зафіксовано')} v${data.recipeVersion} · ${data.dishRef} · ${data.commit.slice(0,12)} · ${t('来源与用量待确认项','Source and amount questions','Питання щодо джерела й кількості')} ${data.unresolvedCount}`),
            currentWeek?h('a',{href:`#/admin/plan/${currentWeek}/select/${encodeURIComponent(data.dishRef)}`},t('到本周菜单安排这道菜','Schedule in this week’s menu','Запланувати в меню цього тижня')):null);
        }
        const check=button(t('检查菜谱新版本','Check newer recipe version','Перевірити нову версію'),()=>void checkCurrent());
        async function checkCurrent(){check.disabled=true;replace(newVersion,h('p',{role:'status'},t('正在读取最新版本…','Loading latest version…','Завантаження…')));
          try{const {data}=await api.request<{id:string;version:number}>(`/recipes/${candidate.recipeId}`);
            if(!active())return;
            if(data.id!==candidate.recipeId||!Number.isSafeInteger(data.version))throw new Error('菜谱版本响应不完整');
            if(data.version<=candidate.recipeVersion!){replace(newVersion,h('p',{role:'status'},t('目前没有比已审核版本更新的菜谱。','No newer recipe revision yet.','Нової версії ще немає.')));return;}
            const version=data.version;
            const newReviewer=h('input',{type:'text',placeholder:'新版本审核人'}) as HTMLInputElement;
            const newNote=h('input',{type:'text',placeholder:'与原作品核对的变更说明'}) as HTMLInputElement;
            const freeze=button(`${t('核对并固定','Check and freeze','Перевірити й зафіксувати')} v${version}`,()=>void freezeVersion(),true);
            async function freezeVersion(){if(!newReviewer.value.trim()||!newNote.value.trim()){replace(materialNotice,h('p',{role:'alert'},t('请填写审核人和与原作品核对的变更说明。','Enter reviewer and source comparison note.','Вкажіть рецензента й пояснення.')));return;}
              freeze.disabled=true;try{const {data:fixed}=await api.request<{dishRef:string;recipeVersion:number;commit:string;unresolvedCount:number}>(`/materializations/${candidate.id}`,{method:'POST',body:JSON.stringify({recipeVersion:version,reviewer:newReviewer.value.trim(),note:newNote.value.trim()})});
                if(active())showFrozen(fixed);
              }catch(error){if(active())replace(materialNotice,h('p',{role:'alert'},errorText(error)));}finally{freeze.disabled=false;}}
            replace(newVersion,h('p',{},t('请先查看这个只读版本并对照原作品，再确认用于菜单。','Inspect this frozen KB revision against the source before using it in a menu.','Звірте цю версію з оригіналом.')),
              h('a',{href:`#/admin/knowledge/${candidate.recipeId}/revisions/${version}`},`${t('打开菜谱版本','Open recipe version','Відкрити рецепт')} v${version}`),
              field(t('新版本审核人','Reviewer for new revision','Рецензент нової версії'),newReviewer),
              field(t('与原作品核对的变更说明','Source comparison note','Пояснення змін'),newNote),freeze);
          }catch(error){if(active())replace(newVersion,h('p',{role:'alert'},errorText(error)));}finally{check.disabled=false;}}
        row.append(h('p',{class:'kb-status'},t('来源已审核；厨房条件请在正式菜谱中核对。若要固定新版本，请检查原方份数、未知用量和切配条件。','Source approved; check kitchen conditions in the formal recipe. Before freezing a newer version, review servings, unknown amounts and preparation.','Джерело схвалено; перевірте кухонні умови в рецепті перед фіксацією нової версії.')),
          h('a',{href:`#/admin/knowledge/${candidate.recipeId}`},t('进入正式菜谱编辑器核定','Open recipe editor to verify quantities','Відкрити редактор рецепта для перевірки')),
          h('a',{href:`#/admin/knowledge/${candidate.recipeId}/revisions/${candidate.recipeVersion}`},`${t('打开菜谱版本','Open recipe version','Відкрити рецепт')} v${candidate.recipeVersion}`),
          h('div',{class:'kb-actions'},material,check),newVersion,materialNotice);
      }
      else if(candidate.status==='needs_review')row.append(field(t('审核人','Reviewer','Рецензент'),reviewer),field(t('审核备注','Review note','Примітка'),note),
        h('div',{class:'kb-actions'},button(t('批准并保存独立菜谱','Approve and save recipe','Схвалити рецепт'),()=>void review('approve'),true),button(t('退回','Reject','Відхилити'),()=>void review('reject'))),
        source?.status==='card_only'?h('p',{role:'alert'},t('只有卡片线索，需先核对原帖才能批准。','Card only: check the original post before approval.','Лише картка: перевірте оригінал.')):h('span'),result);
      return row;
    }
    return detail;
  }
  await Promise.all([loadBatches(),loadItems(true)]);
}
