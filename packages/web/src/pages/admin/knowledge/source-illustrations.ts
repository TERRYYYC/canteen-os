import { h } from '../../../dom';
import type { Lang, Recipe, SourceIllustrationLinks, SourceIllustration } from '../../../api/knowledge';
import type { Words } from './ui';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const label=(value:Partial<Record<Lang,string>>|undefined,lang:Lang)=>value?.[lang]||value?.zh||value?.en||value?.uk||'';

export function syncSourceIllustrationLinks(panel:HTMLElement,data:SourceIllustrationLinks,recipe:Recipe,saved:Recipe,lang:Lang,t:Words):void {
  for(const card of panel.querySelectorAll<HTMLElement>('.kb-source-reference-card[data-source-step-id]')){
    const link=data.stepLinks.find(row=>row.sourceStepId===card.getAttribute('data-source-step-id'));
    const savedStep=saved.steps?.find(step=>step.id===link?.recipeStepId);
    const index=recipe.steps?.findIndex(step=>step.id===link?.recipeStepId)??-1;
    const currentStep=index>=0?recipe.steps![index]:undefined;
    const unchanged=!!savedStep&&!!currentStep&&(['zh','en','uk'] as const).every(language=>(currentStep.text[language]??'')===(savedStep.text[language]??''));
    const note=card.querySelector<HTMLElement>('.kb-source-step-link');
    if(unchanged){
      card.setAttribute('data-linked-step-id',currentStep!.id);
      if(note)note.textContent=`${t('当前步骤','Current step','Поточний крок')} ${index+1} · ${label(currentStep!.text,lang)}`;
    }else{
      card.removeAttribute('data-linked-step-id');
      if(note)note.textContent=t('未关联到当前步骤','Not linked to a current step','Не пов’язано з поточним кроком');
    }
  }
}

export function sourceIllustrationPanel(data:SourceIllustrationLinks,recipe:Recipe,saved:Recipe,lang:Lang,t:Words,loadImage:(assetId:string,target:HTMLElement,alt:string)=>void):HTMLElement {
  const panel=h('section',{class:'kb-panel kb-source-reference-panel'},
    h('h3',{},t('原片参考图（只读）','Source video frames (read only)','Кадри оригіналу (лише читання)')),
    h('p',{class:'kb-muted'},t('仅供师傅对照原作品；改动步骤文字会解除旧图关联，保存后按新版本重读。图片不会写入正式菜谱或公开备料页。','For chef source review only. Changing step text unlinks its old frame; saving rereads the new revision. Frames are not published.','Лише для шефа. Зміна кроку від’єднує старий кадр; після збереження зв’язки оновляться. Кадри не публікуються.')));
  if(!data.candidateId){panel.append(h('p',{class:'kb-muted'},t('这版菜谱没有关联已审核候选的原片参考图。','No approved source frames are linked to this revision.','До цієї версії не прив’язано перевірених кадрів.')));return panel;}
  if(!data.illustrations.length){panel.append(h('p',{class:'kb-muted'},t('已关联来源，但尚无原片参考图。','The source is linked, but has no reference frames.','Джерело прив’язано, але кадрів немає.')));return panel;}
  const groups:[SourceIllustration['role'],string][]=[
    ['ingredient',t('配料参考','Ingredient reference','Інгредієнти')],
    ['step',t('步骤参考','Step reference','Кроки')],
    ['finished',t('成品参考','Finished dish reference','Готова страва')],
  ];
  for(const [role,heading] of groups){
    const illustrations=data.illustrations.filter(image=>image.role===role);
    if(!illustrations.length)continue;
    const group=h('div',{class:'kb-source-reference-group','data-kind':role},h('h4',{},heading));
    for(const image of illustrations){
      const caption=label(image.caption,lang);
      const picture=h('div',{class:'kb-source-reference-picture','data-asset-state':'loading'},t('正在读取原片图…','Loading source frame…','Завантаження кадру…'));
      const figure=h('figure',{class:'kb-source-reference-card',...(role==='step'?{'data-source-step-id':image.sourceStepId??''}:{})},picture,
        h('figcaption',{},caption?`${caption} · `:'',role==='step'?h('span',{class:'kb-source-step-link'}):null,role==='step'?' · ':'',image.rightsState==='verified'
          ?t('使用权已核验（仍为内部参考）','Rights verified (still internal reference)','Права перевірено (лише для внутрішнього використання)')
          :t('使用权待核实','Rights not verified','Права не перевірено')));
      group.append(figure);
      if(UUID.test(image.assetId))loadImage(image.assetId,picture,`${caption||heading} · ${t('原片参考图','Source frame','Кадр оригіналу')}`);
      else {picture.setAttribute('data-asset-state','unavailable');picture.textContent=t('图片标识无效','Invalid image identifier','Недійсний ідентифікатор зображення');}
    }
    panel.append(group);
  }
  syncSourceIllustrationLinks(panel,data,recipe,saved,lang,t);
  return panel;
}
