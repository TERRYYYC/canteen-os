import { h } from '../../../dom';
import type { Lang, Recipe, SourceIllustrationLinks, SourceIllustration } from '../../../api/knowledge';
import type { Words } from './ui';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const label=(value:Partial<Record<Lang,string>>|undefined,lang:Lang)=>value?.[lang]||value?.zh||value?.en||value?.uk||'';

export function sourceIllustrationPanel(data:SourceIllustrationLinks,recipe:Recipe,lang:Lang,t:Words,loadImage:(assetId:string,target:HTMLElement,alt:string)=>void):HTMLElement {
  const panel=h('section',{class:'kb-panel kb-source-reference-panel'},
    h('h3',{},t('原片参考图（只读）','Source video frames (read only)','Кадри оригіналу (лише читання)')),
    h('p',{class:'kb-muted'},t('仅供师傅对照原作品；不会写入正式菜谱图片或公开备料页。','For chef source review only. These frames are not saved as recipe images or shown on public prep pages.','Лише для перевірки шефом; кадри не додаються до публічного рецепта.')));
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
      let stepLabel='';let linkedStepId:string|null=null;
      if(role==='step'){
        const link=data.stepLinks.find(row=>row.sourceStepId===image.sourceStepId);
        const index=recipe.steps?.findIndex(step=>step.id===link?.recipeStepId)??-1;
        if(index>=0){linkedStepId=link!.recipeStepId;stepLabel=`${t('当前步骤','Current step','Поточний крок')} ${index+1} · ${label(recipe.steps![index]!.text,lang)}`;}
        else stepLabel=t('未关联到当前步骤','Not linked to a current step','Не пов’язано з поточним кроком');
      }
      const caption=label(image.caption,lang);
      const picture=h('div',{class:'kb-source-reference-picture','data-asset-state':'loading'},t('正在读取原片图…','Loading source frame…','Завантаження кадру…'));
      const figure=h('figure',{class:'kb-source-reference-card',...(linkedStepId?{'data-linked-step-id':linkedStepId}:{})},picture,
        h('figcaption',{},caption?`${caption} · `:'',stepLabel?`${stepLabel} · `:'',image.rightsState==='verified'
          ?t('使用权已核验（仍为内部参考）','Rights verified (still internal reference)','Права перевірено (лише для внутрішнього використання)')
          :t('使用权待核实','Rights not verified','Права не перевірено')));
      group.append(figure);
      if(UUID.test(image.assetId))loadImage(image.assetId,picture,`${caption||heading} · ${t('原片参考图','Source frame','Кадр оригіналу')}`);
      else {picture.setAttribute('data-asset-state','unavailable');picture.textContent=t('图片标识无效','Invalid image identifier','Недійсний ідентифікатор зображення');}
    }
    panel.append(group);
  }
  return panel;
}
