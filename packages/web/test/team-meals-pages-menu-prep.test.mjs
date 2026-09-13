import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, after } from 'node:test';

const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const vr=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(vr.resolve('esbuild')));
const dir=await mkdtemp(join(tmpdir(),'team-menu-prep-'));
after(()=>rm(dir,{recursive:true,force:true}));
async function loadPage(name){
  const entry=join(here,`../src/pages/${name}.ts`),source=await readFile(entry,'utf8');
  const bundle=await esbuild.build({stdin:{contents:source,resolveDir:dirname(entry),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
  const file=join(dir,`${name}.mjs`);await writeFile(file,bundle.outputFiles[0].text);return import(pathToFileURL(file));
}
const prep=await loadPage('prep'),menu=await loadPage('menu');
const revision='a'.repeat(40),other='b'.repeat(40);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function fixture(){
  const image={src:'https://current.invalid/do-not-load.png',license:'CC BY 4.0',author:'Recorded author',sourceUrl:'https://example.org/licence'};
  return freeze({mode:'mock',projection:{projectionVersion:'1',sourceRevision:revision,
    selection:[{menuPlanRef:'week',date:'2026-09-11',mealType:'lunch'},{menuPlanRef:'week',date:'2026-09-11',mealType:'dinner'}],
    menuPlans:{week:{schemaVersion:'3',name:{zh:'示例'},meals:[
      {date:'2026-09-11',mealType:'lunch',dishRef:'dish-a'},
      {date:'2026-09-11',mealType:'lunch',dishRef:'dish-b',plannedServings:4,serviceWindow:'12:00-13:00'},
      {date:'2026-09-11',mealType:'dinner',dishRef:'dish-a',plannedServings:9},
      {date:'2026-09-12',mealType:'lunch',dishRef:'outside'},
    ]}},
    dishes:{'dish-a':{schemaVersion:'3',name:{zh:'甲菜',en:'Dish A',uk:'Страва А'},status:'draft',image,
      components:[{ingredientRef:'tomato',qty:{value:1500,unit:'g'},prep:{techniqueRef:'cut',size:'2 cm',note:{zh:'原备注'},image}},
        {ingredientRef:'tomato'},{ingredientRef:'salt',qty:{unit:'to-taste'}},{ingredientRef:'missing'}],
      steps:[{text:{zh:'第一步原文',en:'First original step',uk:'Перший крок'},techniqueRef:'cut',image,clip:{videoUrl:'https://example.org/watch?v=abc',start:7,end:11}},
        {text:{zh:'第二步原文',en:'Second original step',uk:'Другий крок'},clip:{videoUrl:'javascript:alert(1)',start:12,end:18}}],
      provenance:{source:'video',videoUrl:'https://example.org/watch?v=abc'}},
      'dish-b':{schemaVersion:'2',name:{zh:'乙菜'},baseServings:50,components:[{ingredientRef:'tomato',qty:{value:100,unit:'g'}}],steps:[{text:{zh:'乙菜步骤'}}],status:'active'}},
    ingredients:{tomato:{schemaVersion:'2',name:{zh:'番茄',en:'Tomato',uk:'Помідор'},baseUnit:'g',trackStock:false,role:'main'},salt:{schemaVersion:'2',name:{zh:'盐',en:'Salt',uk:'Сіль'},baseUnit:'g',trackStock:false,role:'seasoning'}},
    techniques:[{id:'cut',kind:'cut',name:{zh:'切块',en:'Cut pieces',uk:'Нарізати'},note:{zh:'来自词表的备注'}}],
    collection:{items:[],issues:[],coverage:{enumeration:'complete',references:'unresolved',recipeCompleteness:'unverified'}},
  }});
}

// Minimal DOM transport for presenter assertions; this is not browser/layout evidence.
class NodeDouble {
  constructor(tag='',text=''){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.parentNode=null;this.connected=false;this.text=text;this.listeners={};this.style={};this.hidden=false;this.open=false;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
  appendChild(child){if(typeof child==='string')child=new NodeDouble('',child);child.parentNode=this;this.children.push(child);return child;}
  append(...children){children.forEach(c=>this.appendChild(c));}prepend(...children){children.reverse().forEach(c=>{c.parentNode=this;this.children.unshift(c);});}
  replaceChildren(...children){this.children.forEach(c=>c.parentNode=null);this.children=[];this.text='';this.append(...children);}
  remove(){if(this.parentNode){const p=this.parentNode;p.children=p.children.filter(c=>c!==this);this.parentNode=null;}}
  get isConnected(){return this.connected||Boolean(this.parentNode?.isConnected);}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}set textContent(v){this.replaceChildren();this.text=String(v);}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}dispatch(type){for(const fn of this.listeners[type]??[])fn({target:this});}
}
const documentDouble={body:new NodeDouble('body'),createElement:tag=>new NodeDouble(tag),createTextNode:text=>new NodeDouble('',text)};
documentDouble.body.connected=true;
const descendants=node=>[node,...node.children.flatMap(descendants)];
const attr=(node,key,value)=>descendants(node).filter(n=>n.getAttribute(key)===(value??n.getAttribute(key))&&n.getAttribute(key)!==null);
const tag=(node,name)=>descendants(node).filter(n=>n.tagName===name.toUpperCase());
function mount(){const root=new NodeDouble('section');documentDouble.body.append(root);return root;}
globalThis.document=documentDouble;
globalThis.MutationObserver=class{observe(){}disconnect(){}};
const options=()=>({lang:'zh',selection:{menuPlanRef:'week',date:'2026-09-11',mealType:'lunch',mealIndex:0},href:(kind,id)=>`#/purchase/list/${kind}/${id}`});
const need=(mod,name)=>assert.equal(typeof mod[name],'function',`${name} must present frozen raw records`);

test('unknown quantity stays unknown; raw quantity units are never scaled or normalized',()=>{
  need(prep,'rawQuantityText');assert.equal(prep.rawQuantityText(undefined,'zh'),'用量未录');
  assert.equal(prep.rawQuantityText({unit:'to-taste'},'zh'),'适量');
  assert.equal(prep.rawQuantityText({value:1500,unit:'g'},'en'),'1500 g');
});
test('row selection respects projection scope and retains multiple dishes and repeated dish occurrences',()=>{
  need(prep,'selectFrozenMealRows');const source=fixture(),before=JSON.stringify(source);
  const rows=prep.selectFrozenMealRows(source,{});assert.deepEqual(rows.map(x=>x.mealIndex),[0,1,2]);
  assert.equal(Object.hasOwn(rows[0].meal,'plannedServings'),false);assert.equal(rows[1].meal.plannedServings,4);
  assert.equal(Object.hasOwn(rows[0].dish,'baseServings'),false);assert.equal(rows[1].dish.baseServings,50);
  assert.equal(rows[0].dish.components.length,4);assert.equal(JSON.stringify(source),before);
  assert.equal(prep.selectFrozenMealRows(source,{mealIndex:1,menuPlanRef:'week'})[0].meal.dishRef,'dish-b');
});
test('invalid revision and mutable source cannot be labelled fixed-source content',()=>{
  need(prep,'selectFrozenMealRows');const source=fixture();
  assert.throws(()=>prep.selectFrozenMealRows(JSON.parse(JSON.stringify(source)),{}),/frozen/i);
  assert.throws(()=>prep.selectFrozenMealRows(freeze({...source,projection:{...source.projection,sourceRevision:'local-preview'}}),{}),/revision/i);
});
test('prep exposes all original components, steps, three names, truth labels and safe source links',()=>{
  need(prep,'renderFrozenPrep');const el=mount(),source=fixture(),before=JSON.stringify(source);
  const dispose=prep.renderFrozenPrep(el,source,options());
  assert.equal(attr(el,'data-component-index').length,4);assert.equal(attr(el,'data-step-index').length,2);
  for(const text of ['番茄','Tomato','Помідор','盐','missing','1500 g','用量未录','适量','第一步原文','第二步原文','2 cm','原备注','切块','来自词表的备注',revision])assert(el.textContent.includes(text),text);
  assert.match(el.textContent,/模拟|Simulation/);assert.doesNotMatch(el.textContent,/已同步|已发布/);
  assert(tag(el,'a').some(a=>a.getAttribute('href')?.startsWith('https://example.org/watch')));
  assert(!tag(el,'a').some(a=>a.getAttribute('href')?.startsWith('javascript:')));
  assert.equal(JSON.stringify(source),before);dispose();el.remove();
});
test('same-version image bytes use exact source pointers and object URLs are revoked on disposal',async()=>{
  need(prep,'renderFrozenPrep');const el=mount(),queries=[],created=[],revoked=[];
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
  URL.createObjectURL=()=>{const url=`blob:test-${created.length}`;created.push(url);return url;};URL.revokeObjectURL=url=>revoked.push(url);
  try{
    const dispose=prep.renderFrozenPrep(el,fixture(),{...options(),asset:async q=>{queries.push(q);return {bytes:new Blob(['image'],{type:'image/png'}),sourceRevision:revision};}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(queries.map(q=>q.pointer).sort(),['/components/0/prep/image','/image','/steps/0/image']);
    assert(queries.every(q=>q.revision===revision&&q.owner==='data/dishes/dish-a.json'));
    assert.equal(created.length,3);assert(tag(el,'img').every(img=>img.getAttribute('src').startsWith('blob:')));
    assert(el.textContent.includes('CC BY 4.0'));assert(el.textContent.includes('Recorded author'));
    dispose();assert.deepEqual(revoked.sort(),created.sort());
  }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;el.remove();}
});
test('wrong-version or late assets never substitute current URLs into an old or repainted view',async()=>{
  need(prep,'renderFrozenPrep');const el=mount(),source=fixture();let release;
  const pending=new Promise(resolve=>{release=resolve;});
  prep.renderFrozenPrep(el,source,{...options(),asset:()=>pending});
  const stop=prep.renderFrozenPrep(el,source,{...options(),lang:'uk',asset:async()=>({bytes:new Blob(['image']),sourceRevision:other})});
  release({bytes:new Blob(['image']),sourceRevision:revision});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(tag(el,'img').length,0);assert(el.textContent.includes('Перший крок'));
  assert(!el.textContent.includes('current.invalid'));stop();el.remove();
});
test('menu summary includes seasonings and repeated rows; opening a row shows the matching complete recipe',()=>{
  need(menu,'renderFrozenMenu');const el=mount();const stop=menu.renderFrozenMenu(el,fixture(),{...options(),selection:{menuPlanRef:'week'}});
  assert.equal(attr(el,'data-meal-index').length,3);assert(el.textContent.includes('盐'));assert(el.textContent.includes('1500 g')===false);
  const panels=tag(el,'details').filter(n=>!n.getAttribute('class'));assert.equal(panels.length,3);panels[1].open=true;panels[1].dispatch('toggle');
  assert(el.textContent.includes('乙菜步骤'));assert(!el.textContent.includes('第一步原文'));
  stop();el.remove();
});
test('an unresolved plan is shown as missing source, not silently represented as an empty menu',()=>{
  const data=JSON.parse(JSON.stringify(fixture()));
  data.projection.selection=[{menuPlanRef:'unresolved-plan',date:'2026-09-11',mealType:'lunch'}];
  data.projection.collection.issues=[{code:'missing-plan',menuPlanRef:'unresolved-plan',date:'2026-09-11',mealType:'lunch'}];
  data.projection.collection.coverage.enumeration='incomplete';
  for(const render of [prep.renderFrozenPrep,menu.renderFrozenMenu]){
    const el=mount(),dispose=render(el,freeze(data),{lang:'zh'});
    assert(el.textContent.includes('unresolved-plan'),'the unresolved original plan reference must remain visible');
    assert(!el.textContent.includes('所选范围没有已录餐食'),'unresolved is not empty');dispose();el.remove();
  }
});
test('technique images resolve by explicit ID, independently of filtered projection positions',async()=>{
  const data=JSON.parse(JSON.stringify(fixture())),image=data.projection.dishes['dish-a'].image;
  data.projection.techniques=[{id:'unselected',kind:'cut',name:{en:'Unused'},image},{...data.projection.techniques[0],image}];
  const el=mount(),queries=[];
  const dispose=prep.renderFrozenPrep(el,freeze(data),{...options(),techniqueAsset:async id=>{queries.push(id);return {bytes:new Blob(['image']),sourceRevision:revision};}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(queries,['cut','cut']);
  assert.equal(tag(el,'img').length,2);dispose();el.remove();
});
test('recipe details show localized issue reasons only for the selected original row',()=>{
  const data=JSON.parse(JSON.stringify(fixture()));
  data.projection.collection.issues=[
    {code:'missing-ingredient',menuPlanRef:'week',date:'2026-09-11',mealType:'lunch',mealIndex:0,dishRef:'dish-a',ingredientRef:'missing'},
    {code:'components-unrecorded',menuPlanRef:'week',date:'2026-09-11',mealType:'lunch',mealIndex:1,dishRef:'dish-b'},
  ];
  const el=mount(),dispose=prep.renderFrozenPrep(el,freeze(data),options());
  const issues=attr(el,'data-source-issue');assert.equal(issues.length,1);assert.match(issues[0].textContent,/食材资料未找到/);
  dispose();el.remove();
});

// MP-R1: a whole projection can be incomplete while the selected slot is empty.
for (const [page, render] of [['prep', prep.renderFrozenPrep], ['menu', menu.renderFrozenMenu]]) {
  for (const [key, unrelated] of [['menuPlanRef', 'other-week'], ['date', '2026-09-15'], ['mealType', 'dinner'], ['mealIndex', 0]]) {
    test(`${page}: empty selection excludes unrelated missing records by ${key}`, () => {
      const selection = { menuPlanRef: 'week', date: '2026-09-16', mealType: 'lunch', mealIndex: 1 };
      const data = JSON.parse(JSON.stringify(fixture()));
      data.projection.selection.push({ menuPlanRef: 'week', date: selection.date, mealType: 'lunch' });
      data.projection.collection.issues = [
        { code: 'empty-selection', menuPlanRef: 'week', date: selection.date, mealType: 'lunch' },
        { code: 'missing-dish', ...selection, [key]: unrelated, dishRef: 'missing-elsewhere' },
      ];
      data.projection.collection.coverage.enumeration = 'incomplete';
      const source = freeze(data), before = JSON.stringify(source), el = mount();
      const dispose = render(el, source, { lang: 'en', selection });
      assert.deepEqual(attr(el, 'data-source-issue').map(x => x.getAttribute('data-source-issue')), ['empty-selection']);
      assert.match(el.textContent, /No recorded meals in this selection/);
      assert.doesNotMatch(el.textContent, /Record unavailable|Some source records are unavailable|missing-elsewhere/);
      assert.equal(JSON.stringify(source), before); dispose(); el.remove();
    });
  }
  test(`${page}: selected missing plan remains unavailable in all languages, including broad selection`, () => {
    const data = JSON.parse(JSON.stringify(fixture()));
    data.projection.menuPlans = {};
    data.projection.collection.issues = [{ code: 'missing-plan', menuPlanRef: 'missing-week', date: '2026-09-16', mealType: 'lunch' }];
    data.projection.collection.coverage.enumeration = 'incomplete';
    for (const lang of ['zh', 'en', 'uk']) for (const selection of [{}, { menuPlanRef: 'missing-week', date: '2026-09-16', mealType: 'lunch', mealIndex: 0 }]) {
      const el = mount(), dispose = render(el, freeze(data), { lang, selection });
      assert.equal(attr(el, 'data-source-issue', 'missing-plan').length, 1);
      assert.match(el.textContent, /missing-week/);
      assert.doesNotMatch(el.textContent, /所选范围没有已录餐食|No recorded meals in this selection|У цьому виборі немає записаних страв/);
      dispose(); el.remove();
    }
  });
  test(`${page}: missing recipe and unrecorded components stay visible on their original row`, () => {
    for (const code of ['missing-dish', 'components-unrecorded']) {
      const data = JSON.parse(JSON.stringify(fixture()));
      if (code === 'missing-dish') delete data.projection.dishes['dish-a'];
      else delete data.projection.dishes['dish-a'].components;
      data.projection.collection.issues = [{ code, ...options().selection, dishRef: 'dish-a' }];
      data.projection.collection.coverage.enumeration = 'incomplete';
      const el = mount(), dispose = render(el, freeze(data), { ...options(), lang: 'en' });
      assert.equal(attr(el, 'data-source-issue', code).length, 1);
      assert.match(el.textContent, /dish-a/);
      assert.doesNotMatch(el.textContent, /No recorded meals in this selection/);
      dispose(); el.remove();
    }
  });
}

// Readability assertions model closed native disclosures, not CSS/layout.
const ordinaryText=node=>node.hidden?'':node.tagName==='DETAILS'&&!node.open?(node.children.find(c=>c.tagName==='SUMMARY')?.textContent??''):node.text+node.children.map(ordinaryText).join(' ');
test('cooking layout leads with original ingredients and full steps; recorded metadata stays accessible after the task',()=>{
 for(const lang of ['zh','en','uk']){
  const el=mount(),source=fixture(),before=JSON.stringify(source),stop=prep.renderFrozenPrep(el,source,{...options(),lang,layout:'cooking'});
  const recipe=attr(el,'data-recipe-meal-index')[0],children=recipe.children;
  assert.equal(tag(el,'h1').length,1);assert.equal(tag(el,'h1')[0].textContent,source.projection.dishes['dish-a'].name[lang]);
  assert(children.findIndex(n=>n.getAttribute('data-component-index')==='0')<children.findIndex(n=>n.tagName==='DETAILS'),'ingredients precede recipe metadata');
  const metadata=tag(recipe,'details').find(n=>n.getAttribute('class')==='prep-recipe-record');assert(metadata,'recipe metadata has a secondary disclosure');
  assert(children.indexOf(metadata)>children.findIndex(n=>n.getAttribute('data-step-index')==='1'),'full steps precede recipe metadata');
  assert.match(metadata.textContent,/CC BY 4.0/);assert.doesNotMatch(ordinaryText(recipe),/CC BY 4.0|Recorded author/);
  assert.deepEqual(attr(el,'data-original-quantity').map(n=>n.textContent),['1500 g',prep.rawQuantityText(undefined,lang),prep.rawQuantityText({unit:'to-taste'},lang),prep.rawQuantityText(undefined,lang)]);
  assert.equal(attr(el,'data-step-index').length,2);assert.match(ordinaryText(el),new RegExp(source.projection.dishes['dish-a'].steps[1].text[lang]));
  assert.equal(JSON.stringify(source),before);stop();el.remove();
 }
});
test('cooking missing quantities and source gaps explain the impact beside the affected task and link to repair',()=>{
 const el=mount(),stop=prep.renderFrozenPrep(el,fixture(),{...options(),layout:'cooking'});
 const quantity=attr(el,'data-component-index','1')[0],missing=attr(el,'data-component-index','3')[0];
 assert.match(ordinaryText(quantity),/用量未录/);assert.match(ordinaryText(quantity),/无法确定.*备料量/);
 assert(tag(quantity,'a').some(n=>n.getAttribute('href')==='#/admin/dish/dish-a'));
 assert.match(ordinaryText(missing),/食材资料未找到/);assert(tag(missing,'a').some(n=>n.getAttribute('href')==='#/admin/ingredient/missing'));
 assert.match(ordinaryText(el),/原配方用量，未缩放/);assert.doesNotMatch(ordinaryText(el),/基准份数未录|计划份数未录|乙菜|≈/);
 const record=tag(el,'details').find(n=>n.getAttribute('class')==='prep-recipe-record');record.open=true;
 assert.match(ordinaryText(record),/基准份数未录.*不能.*换算/);assert.match(ordinaryText(record),/计划份数未录/);
 stop();el.remove();
});
test('Prep long notes have an explicit excerpt and full text while steps stay complete and support records stay secondary',()=>{
 const data=JSON.parse(JSON.stringify(fixture())),state=new Map(),notes={zh:'保留原备注句首，逐项检查原料。'.repeat(8)+'句尾：出餐前再次核对。',en:'Keep the original instruction and check every ingredient. '.repeat(8)+'Final instruction: check before service.',uk:'Збережіть вихідну примітку та перевірте кожен інгредієнт. '.repeat(8)+'Остання вказівка: перевірте перед подачею.'};
 data.projection.techniques[0].note=notes;data.projection.techniques[0].image=data.projection.dishes['dish-a'].image;
 data.projection.dishes['dish-a'].components[0].prep.note=notes;
 data.projection.dishes['dish-a'].steps[0].text=notes;
 const source=freeze(data),before=JSON.stringify(source),el=mount();
 for(const lang of ['zh','en','uk']){
  const stop=prep.renderFrozenPrep(el,source,{...options(),lang,layout:'cooking',disclosureState:state});
  const component=attr(el,'data-component-index','0')[0],note=attr(component,'data-prep-note')[0];assert(note,'long notes expose a native full-text control');
  const summary=tag(note,'summary')[0];assert.match(summary.textContent,/全文|full note|повний текст/);assert(summary.textContent.endsWith('…'));
  assert.match(note.textContent,new RegExp(notes[lang].slice(-20).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(ordinaryText(component),/CC BY 4.0|Recorded author|图片来源与许可|Image source and license|Джерело зображення й ліцензія/);
  const method=attr(el,'data-step-index','0')[0];assert(ordinaryText(method).includes(notes[lang]),'the actual method is never shortened');
  note.open=true;note.dispatch('toggle');stop();
  const next=prep.renderFrozenPrep(el,source,{...options(),lang,layout:'cooking',disclosureState:state});assert.equal(attr(attr(el,'data-component-index','0')[0],'data-prep-note')[0].open,true,'explicit note expansion survives repaint');next();
 }
 assert.equal(JSON.stringify(source),before);el.remove();
});
test('daily prep keeps other languages and technical identifiers out of ordinary reading',()=>{
 const el=mount(),stop=prep.renderFrozenPrep(el,fixture(),options());
 const visible=ordinaryText(el);assert.match(visible,/甲菜/);assert.match(visible,/第一步原文/);assert.match(visible,/1500 g/);
 assert.doesNotMatch(visible,/ZH:|EN:|UK:|First original step|draft|active|manual|aaaaaaaa|Recorded author/);
 assert.match(el.textContent,/First original step/);assert.match(el.textContent,/Recorded author/);stop();el.remove();
});
test('empty prep timing explains unrecorded timing and offers a working reset without inventing tasks',()=>{
 const el=mount();let resets=0;const stop=prep.renderFrozenPrep(el,fixture(),{...options(),timing:'morning',onShowAllTimings:()=>resets++});
 assert.equal(attr(el,'data-component-index').length,0);assert.match(ordinaryText(el),/没有.*准备任务/);assert.match(ordinaryText(el),/4.*准备时机未录/);
 const reset=tag(el,'button').find(n=>n.textContent==='查看全部');assert(reset);reset.dispatch('click');assert.equal(resets,1);assert.equal(attr(el,'data-step-index').length,2);stop();el.remove();
});
test('source warning uses recorded names with date and a repair action; original identifiers remain in support details',()=>{
 const data=JSON.parse(JSON.stringify(fixture()));data.projection.collection.issues=[{code:'components-unrecorded',menuPlanRef:'week',date:'2026-09-11',mealType:'lunch',dishRef:'dish-a',mealIndex:0}];
 const el=mount(),stop=prep.renderFrozenPrep(el,freeze(data),options()),panel=tag(el,'details').find(n=>(n.getAttribute('class')??'').includes('raw-issues'));panel.open=true;
 const visible=ordinaryText(panel);assert.match(visible,/甲菜/);assert.match(visible,/2026-09-11/);assert.match(visible,/补齐资料/);assert.doesNotMatch(visible,/dish-a|components-unrecorded|week/);
 assert(tag(panel,'a').some(n=>n.getAttribute('href')==='#/admin/dish/dish-a'));assert.match(panel.textContent,/dish-a/);stop();el.remove();
});
test('same-version material detail uses human stock state and recipe context instead of IDs',async()=>{
 const details=await loadPage('team-details'),el=mount();el.classList={add(){}};
 const data=JSON.parse(JSON.stringify(fixture()));data.projection.collection.items=[{ingredientRef:'tomato',sources:[{menuPlanRef:'week',date:'2026-09-11',mealType:'lunch',dishRef:'dish-a',mealIndex:0,componentIndex:0}]}];
 const stop=details.renderTeamDetails(el,{lang:'zh',projection:freeze(data).projection,kind:'ingredient',id:'tomato',asset:async()=>{throw Error('unused');},href:(kind,id)=>`#/purchase/list/${kind}/${id}`});
 const visible=ordinaryText(el);assert.match(visible,/甲菜/);assert.match(visible,/2026-09-11/);assert.match(visible,/未启用/);assert.doesNotMatch(visible,/false|tomato|week \/|aaaaaaaa|EN:|UK:/);assert.match(el.textContent,/Tomato/);stop();el.remove();
});
