/** Menu-only hierarchy over the original recipe presenter; no new data or quantity logic. */
import {h} from '../dom';
import {renderFrozenPrep,type FrozenMealSource,type FrozenMealRenderOptions} from './prep';
const has=(el:Element,name:string)=>(el.getAttribute('class')??'').split(' ').includes(name);
const move=(el:Element|undefined):Element|undefined=>{el?.remove();return el;};
export function renderMenuRecipe(el:HTMLElement,source:FrozenMealSource,options:FrozenMealRenderOptions):()=>void {
  const stop=renderFrozenPrep(el,source,options),root=el.children[0];
  if(!root)return stop;
  root.setAttribute('class',`${root.getAttribute('class')??''} menu-recipe`);
  const {lang}=options,word=(zh:string,en:string,uk:string)=>lang==='zh'?zh:lang==='en'?en:uk;
  for(const section of Array.from(root.children).filter(node=>node.getAttribute('data-recipe-meal-index')!==null)){
    const original=Array.from(section.children),[head,planned,names,base,status,description,hero]=original;
    if(!hero||hero.tagName!=='FIGURE')continue; // Missing records keep the original explicit state.
    hero.setAttribute('class','menu-recipe-hero');
    const provenance=h('details',{class:'menu-recipe-provenance'},h('summary',{},word('记录、译名与来源','Record, translations & source','Запис, переклади й джерело')));
    for(const caption of Array.from(hero.children).filter(node=>node.tagName==='FIGCAPTION')){
      provenance.append(h('div',{class:'menu-recipe-image-record'},...Array.from(caption.children).map(node=>move(node)!)));caption.remove();
    }
    for(const node of [planned,names,base,status])if(node)provenance.append(move(node)!);
    if(description&&!description.textContent?.trim())description.textContent=word('介绍尚未录入','Description not recorded','Опис ще не записано');
    const about=h('div',{'data-menu-recipe-panel':'about'},move(description));
    const ingredients=h('div',{'data-menu-recipe-panel':'ingredients'}),steps=h('div',{'data-menu-recipe-panel':'steps'});
    let stepArea=false;
    for(const node of original.slice(7)){
      if(node.tagName==='H3'&&has(node,'section-label')){
        if(ingredients.children.length)stepArea=true;
        (stepArea?steps:ingredients).append(move(node)!);continue;
      }
      if(node.getAttribute('data-component-index')!==null){
        const parts=Array.from(node.children),title=parts.find(n=>n.tagName==='H4'),quantity=parts.find(n=>n.getAttribute('data-original-quantity')!==null);
        const summary=h('summary',{},move(title),move(quantity));
        const details=h('details',{class:'menu-component-details'},summary,h('div',{},...Array.from(node.children).map(n=>move(n)!)));
        node.replaceChildren(details);ingredients.append(move(node)!);continue;
      }
      if(node.getAttribute('data-step-index')!==null){
        const body=Array.from(node.children).find(n=>has(n,'tx'));
        if(body){const extra=Array.from(body.children).slice(1);if(extra.length)body.append(h('details',{class:'menu-step-details'},h('summary',{},word('图示、译文与来源','Images, translations & source','Зображення, переклади й джерело')),...extra.map(n=>move(n)!)));}
        steps.append(move(node)!);continue;
      }
      if(stepArea)provenance.append(move(node)!);else ingredients.append(move(node)!);
    }
    if(!Array.from(steps.children).some(node=>node.getAttribute('data-step-index')!==null)){
      const missing=Array.from(provenance.children).find(node=>node.getAttribute('role')==='status')??h('p',{role:'status'});
      missing.textContent=word('做法尚未录入','Steps not recorded','Кроки ще не записано');steps.append(move(missing)!);
    }
    const tabs=h('div',{class:'menu-recipe-tabs',role:'group','aria-label':word('菜品详情','Recipe details','Деталі рецепта')});
    const panels={about,ingredients,steps};
    const select=(key:keyof typeof panels)=>{for(const [name,panel] of Object.entries(panels))panel.hidden=name!==key;for(const button of Array.from(tabs.children))button.setAttribute('aria-pressed',String(button.getAttribute('data-menu-recipe-tab')===key));};
    for(const [key,label] of [['about',word('介绍','About','Про страву')],['ingredients',word('食材与调料','Ingredients','Інгредієнти')],['steps',word('做法','Steps','Кроки')]] as const){
      const button=h('button',{type:'button','data-menu-recipe-tab':key},label);button.addEventListener('click',()=>{if(el.isConnected)select(key);});tabs.append(button);
    }
    section.replaceChildren(move(hero)!,move(head)!,tabs,about,ingredients,steps,provenance);select('about');
  }
  for(const node of Array.from(root.children).filter(node=>has(node,'raw-source')||has(node,'raw-issues')))root.append(move(node)!);
  return stop;
}
