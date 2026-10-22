import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { Element } from './team-meals-pages-unload-dom.mjs';
const here = dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite/package.json'));
const esbuild = await import(pathToFileURL(viteRequire.resolve('esbuild')));
const dir = await mkdtemp(join(tmpdir(), 'knowledge-web-'));
after(() => rm(dir, { recursive: true, force: true }));
const output = join(dir, 'knowledge.mjs');
const bundle = await esbuild.build({ stdin: { contents: `export {render} from './pages/admin/knowledge'; export * from './api/knowledge'; export * from './pages/admin/knowledge/model'; export {inspectReloadSafety} from './view-models/reload-safety';`, loader: 'ts', resolveDir: join(here, '../src') }, bundle: true, write: false, format: 'esm', platform: 'browser', loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_WORKER_URL': '"/worker"' }, logLevel: 'silent', plugins: [{ name: 'auth-boundary', setup(build) {
  build.onResolve({ filter: /(?:\/admin\/token|\.\/token)$/ }, () => ({ path: 'token', namespace: 'test' }));
  build.onResolve({ filter: /\/router$/ }, () => ({ path: 'router', namespace: 'test' }));
  build.onResolve({ filter: /\/api\/team-meals$/ }, () => ({ path: 'team-meals', namespace: 'test' }));
  build.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'token' ? `export const getToken=()=>globalThis.fixture.token; export const peekToken=getToken; export const getAuthSessionVersion=()=>globalThis.fixture.auth; export const peekAuthSessionVersion=getAuthSessionVersion; export const stripTokenFromRest=x=>x; export const clearToken=()=>{}; export const renderLockScreen=()=>{}; export const onAuthSessionChange=fn=>{globalThis.fixture.authHooks.push(fn);return()=>{};};` : args.path === 'team-meals' ? `export const getTeamMealsApi=()=>globalThis.fixture.teamApi;` : `export const onRoute=fn=>{globalThis.fixture.routeHooks.push(fn);return()=>{};};`, loader: 'js' }));
} }] });
await writeFile(output, bundle.outputFiles[0].text);
const id = '10000000-0000-4000-8000-000000000001';
const id2 = '10000000-0000-4000-8000-000000000002';
const assetId = '20000000-0000-4000-8000-000000000001';
const detail = (overrides = {}) => ({ id, version: 1, createdAt: '2026-09-19T00:00:00.000Z', recipe: { title: { zh: '红烧肉', en: 'Braised pork', uk: 'Тушкована свинина' }, ingredients: [{ id: id2, ingredientId: id2, name: { zh: '盐', en: 'Salt' }, amount: { kind: 'unknown', raw: '未写明' }, role: 'seasoning', preparation: { uk: 'Підготувати' } }], steps: [], sources: [], assets: [] }, media: [], sourceRecords: [], ...overrides });
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', etag: '"v1"', ...headers } });
const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
let serial = 0;
async function setup(handler = () => json(detail()), plans = {}) {
  globalThis.fixture = { token: 'test-only-token', auth: 1, authHooks: [], routeHooks: [], calls: [], handler, teamApi: { sessionKey: () => 1, getPlan: async id => plans[id] ? { content: plans[id] } : null } };
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  globalThis.window = { addEventListener() {}, confirm: () => true };
  globalThis.location = { hash: '#/admin/knowledge' };
  globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => new Element('', String(text)), activeElement: null };
  const body = new Element('body'), el = new Element('main'); body.append(el);
  globalThis.fetch = async (url, init = {}) => { fixture.calls.push({ url: String(url), init }); return fixture.handler(String(url), init); };
  const m = await import(pathToFileURL(output).href + `?run=${++serial}`);
  const flush = async () => { for (let i=0;i<15;i++) await new Promise(resolve => setImmediate(resolve)); };
  const mount = async (rest = id, lang = 'zh', planId = 'week-2026-40') => { await m.render(el, { lang, planId, setReloadCoverage() {} }, rest); await flush(); };
  const all = selector => el.querySelectorAll(selector);
  const click = text => { const control = all('button').find(b => b.textContent === text); assert(control, `button ${text}`); control.click(); };
  const field = (legend, language) => {
    const container = all('fieldset').find(f => f.children[0]?.tagName === 'LEGEND' && f.children[0].textContent === legend);
    assert(container, `fieldset ${legend}`);
    const label = container.querySelectorAll('label').find(f => f.children[0]?.textContent === language);
    return label.querySelector('input,textarea');
  };
  const set = (control, value) => { control.value=value; control.dispatchEvent({ type: 'input' }); };
  return { m, el, body, flush, mount, all, click, field, set, leave() { el.replaceChildren(); location.hash='#/admin/plan'; fixture.routeHooks.forEach(fn=>fn()); } };
}

test('generic materialization transport and kitchen fields are preserved',async()=>{
 const h=await setup();
 const api=h.m.createKnowledgeApi({base:'/worker',token:()=> 'private',session:()=>1,fetch:async(url)=>{assert.equal(url,`/worker/knowledge-materializations/recipes/${id}`);return json({dishRef:'kb-recipe-v1',recipeId:id,recipeVersion:1,commit:'a'.repeat(40)});}});
 await api.send(h.m.createAttempt(`/materializations/recipes/${id}`,'POST',{recipeVersion:1}));
 const recipe={...detail().recipe,recipeFormatVersion:'2',ingredients:[{...detail().recipe.ingredients[0],kitchenPrep:{timing:'before-service',size:'2cm'}}],steps:[{id:id2,text:{zh:'原方10分钟'},techniqueId:id2}]};
 assert.deepEqual(h.m.editable(recipe),recipe);
});

test('full original comparison, direct menu freeze with unknown same-key retry and selected-plan next step',async()=>{
 const recipe={recipeFormatVersion:'2',title:{zh:'厨房修订',en:'Kitchen revision',uk:'Кухонна редакція'},ingredients:[{id:id2,name:{zh:'小米辣'},rawText:'小米辣若干',preparation:{zh:'原方切圈'},amount:{kind:'unknown'}}],steps:[{id:id2,text:{zh:'原方煮10分钟，未给调料量'}}],sources:[],assets:[]};
 let attempts=[];
 const h=await setup((url,init)=>{
  if(url.includes('/source-illustrations'))return json({recipeId:id,recipeVersion:2,illustrations:[],stepLinks:[]});
  if(url.includes('/ingredients?')||url.includes('/techniques?'))return json({items:[],nextCursor:null});
  if(url.endsWith('/adoption'))return json({recipeId:id,recipeVersion:2,current:{version:2,archived:false},origin:{kind:'manual',originalRecipeVersion:1},source:{status:'needs_review'},kitchenApproval:null,issues:['unknown-amount','unmapped-ingredient']});
  if(url.includes('/knowledge-materializations/recipes/')){attempts.push({url,method:init.method,body:init.body,key:new Headers(init.headers).get('Idempotency-Key')});if(attempts.length===1)throw Error('response lost');return json({dishRef:'kb-test-v2',recipeId:id,recipeVersion:2,commit:'a'.repeat(40),unchanged:false},201);}
  if(url.endsWith('/revisions/1'))return json(detail({recipe:{...recipe,title:{zh:'原方'}}}));
  return json(detail({version:2,recipe}),200,{etag:'"v2"'});
 });
 await h.mount();assert.match(h.el.textContent,/原方 v1/);assert.match(h.el.textContent,/原方煮10分钟/);assert.match(h.el.textContent,/原方切圈/);
 // ADR-0011: no kitchen-approval form; the only action is putting the saved version on a menu.
 const labels=h.all('label').map(label=>label.children[0]?.textContent);
 assert(!labels.includes('核定师傅'));assert(!labels.includes('核定说明（未知项与厨房调整）'));
 assert.equal(h.all('input').filter(input=>input.getAttribute('data-testid')==='source-confirmed').length,0);
 assert.equal(h.all('button').filter(b=>b.textContent==='核定已保存版本').length,0);
 assert.doesNotMatch(h.el.textContent,/此保存版本已由厨房核定/);
 const freeze=h.all('button').find(b=>b.textContent==='排进菜单');assert(freeze,'排进菜单');assert.equal(freeze.disabled,false);
 h.click('排进菜单');await h.flush();assert.match(h.el.textContent,/结果尚未确认/);
 assert.equal(h.m.inspectReloadSafety().reason,'unknown');
 await h.mount(id,'en');assert.match(h.el.textContent,/result is unconfirmed/);
 h.click('Verify operation result (same request)');await h.flush();assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);
 assert.equal(attempts[0].url,`/worker/knowledge-materializations/recipes/${id}`);assert.equal(attempts[0].method,'POST');assert.deepEqual(JSON.parse(attempts[0].body),{recipeVersion:2});
 assert.match(h.el.textContent,/Recipe version fixed/);assert.doesNotMatch(h.el.textContent,/approved by the kitchen/);
 assert.equal(fixture.calls.filter(call=>call.url.endsWith('/approve')).length,0,'the editor never calls the approval endpoint');
 h.click('Choose menu dates and servings');assert.equal(location.hash,'#/admin/plan/week-2026-40/select/kb-test-v2');
 assert.equal(recipe.ingredients[0].amount.kind,'unknown');assert.equal(recipe.steps[0].text.zh,'原方煮10分钟，未给调料量');
});

test('explicit shared identity, kitchen preparation and step technique save without rewriting original unknowns',async()=>{
 const canonical=assetId,tech=id2;let stored=detail({recipe:{...detail().recipe,ingredients:[{id:id2,name:{zh:'小米辣'},amount:{kind:'unknown',raw:'若干'},preparation:{zh:'原方切圈'}}],steps:[{id:id2,text:{zh:'煮10分钟'}}]}}),saved;
 const h=await setup((url,init)=>{
  if(url.includes('/source-illustrations'))return json({recipeId:id,recipeVersion:stored.version,illustrations:[],stepLinks:[]});
  if(url.endsWith('/adoption'))return json({recipeId:id,recipeVersion:stored.version,current:{version:stored.version,archived:false},origin:{kind:'manual',originalRecipeVersion:1},source:{status:'needs_review'},kitchenApproval:null,issues:['unknown-amount']});
  if(url.includes('/ingredients?'))return json({items:[{id:canonical,version:1,name:{zh:'明确共享小米辣'}}],nextCursor:null});
  if(url.includes('/techniques?'))return json({items:[{id:tech,version:1,kind:'cut',name:{zh:'切圈'}}],nextCursor:null});
  if(init.method==='PUT'){saved=JSON.parse(init.body);stored={...stored,version:2,recipe:saved};return json(stored,200,{etag:'"v2"'});}
  return json(stored,200,{etag:`"v${stored.version}"`});
 });await h.mount();
 const control=text=>h.all('label').find(row=>row.children[0]?.textContent===text)?.querySelector('input,textarea,select');
 const change=(text,value)=>{const el=control(text);assert(el,text);el.value=value;el.dispatchEvent({type:el.tagName==='SELECT'?'change':'input'});};
 change('对应的标准食材',canonical);change('标准技法（明确选择）',tech);change('厨房准备时机','before-service');change('厨房切配尺寸（未知留空）','2mm');
 h.click('保存菜谱');await h.flush();assert.equal(saved.recipeFormatVersion,'2');assert.equal(saved.ingredients[0].ingredientId,canonical);assert.deepEqual(saved.ingredients[0].kitchenPrep,{techniqueId:tech,timing:'before-service',size:'2mm'});assert.deepEqual(saved.ingredients[0].amount,{kind:'unknown',raw:'若干'});assert.deepEqual(saved.ingredients[0].preparation,{zh:'原方切圈'});assert.equal(saved.steps[0].text.zh,'煮10分钟');
 assert.equal(fixture.calls.filter(call=>call.url.endsWith('/approve')).length,0);
});
test('canonical creation keeps unknown fields absent and lost response uses the same key',async()=>{
 let ingredient,attempts=[];
 const stored=detail({recipe:{...detail().recipe,ingredients:[]}});
 const h=await setup((url,init)=>{
  if(url.includes('/source-illustrations'))return json({recipeId:id,recipeVersion:1,illustrations:[],stepLinks:[]});
  if(url.endsWith('/adoption'))return json({recipeId:id,recipeVersion:1,current:{version:1,archived:false},origin:{kind:'manual',originalRecipeVersion:1},source:{status:'needs_review'},kitchenApproval:null,issues:[]});
  if(url.includes('/ingredients?'))return json({items:ingredient?[{id:assetId,version:1,...ingredient}]:[],nextCursor:null});
  if(url.includes('/techniques?'))return json({items:[],nextCursor:null});
  if(url.endsWith('/ingredients')&&init.method==='POST'){attempts.push({body:init.body,key:new Headers(init.headers).get('Idempotency-Key')});ingredient=JSON.parse(init.body);if(attempts.length===1)throw Error('lost');return json({id:assetId,version:1,ingredient,createdAt:'2026-10-05'},201);}
  return json(stored);
 });await h.mount();h.click('＋ 标准材料');h.set(h.field('标准名称','中文'),'工程小米辣');h.click('保存标准资料新版本');await h.flush();assert.equal(h.m.inspectReloadSafety().reason,'unknown');assert.deepEqual(ingredient,{name:{zh:'工程小米辣'}});
 h.click('确认操作结果（使用同一请求）');await h.flush();assert.deepEqual(attempts[0],attempts[1]);assert.equal(h.all('[data-testid="standard-editor"]').length,0);assert.match(h.el.textContent,/工程小米辣/);
});

test('native field controls have an exact localized accessible label',async()=>{const h=await setup();await h.mount();const control=h.all('label').find(label=>label.children[0]?.textContent==='用量类型').querySelector('select');assert.equal(control.getAttribute('aria-label'),'用量类型');});

test('incomplete price-only purchase input is retained instead of silently omitted',async()=>{
 let writes=0;const stored=detail({recipe:{...detail().recipe,ingredients:[]}});
 const h=await setup((url,init)=>{if(url.includes('/ingredients?')||url.includes('/techniques?'))return json({items:[],nextCursor:null});if(url.endsWith('/ingredients')&&init.method==='POST'){writes++;return json({id:assetId,version:1,ingredient:JSON.parse(init.body)},201);}return json(stored);});await h.mount();h.click('＋ 标准材料');h.set(h.field('标准名称','中文'),'测试材料');const named=text=>h.all('label').find(row=>row.children[0]?.textContent===text).querySelector('input,select');h.set(named('参考价格（未知留空）'),'10');const currency=named('币种');currency.value='USD';currency.dispatchEvent({type:'change'});h.click('保存标准资料新版本');await h.flush();assert.equal(writes,0);assert.equal(named('参考价格（未知留空）').value,'10');assert.equal(currency.value,'USD');assert.equal(h.all('[data-testid="standard-editor"]').length,1);
});

test('workflow paints reuse in-flight source frames and departure aborts their private reads',async()=>{
 const image=defer(),recipe={...detail().recipe,ingredients:[],steps:[]};
 const h=await setup((url,init)=>{
  if(url.includes('/source-illustrations'))return json({recipeId:id,recipeVersion:1,candidateId:id2,illustrations:[{assetId,role:'finished',sourceStepId:null,caption:{zh:'工程参考'},rightsState:'pending'}],stepLinks:[]});
  if(url.includes('/assets/'))return image.promise;
  if(url.includes('/ingredients?')||url.includes('/techniques?'))return json({items:[],nextCursor:null});
  if(url.endsWith('/adoption'))return json({recipeId:id,recipeVersion:1,current:{version:1,archived:false},origin:{kind:'manual',originalRecipeVersion:1},source:{status:'needs_review'},kitchenApproval:null,issues:[]});
  return json(detail({recipe}));
 });
 await h.mount();h.click('重新读取原方与标准资料');await h.flush();
 const reads=fixture.calls.filter(call=>call.url.includes('/assets/'));assert.equal(reads.length,1,'same revision frame is fetched once across metadata/catalog paints');assert.equal(reads[0].init.signal.aborted,false,'metadata paints preserve the original in-flight request');
 h.leave();assert.equal(reads[0].init.signal.aborted,true,'route departure aborts the original private request');image.resolve(new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}}));await h.flush();assert.equal(h.all('img').length,0,'departed view cannot show a late source frame');
});

// #186: 排进菜单 fixes the saved version, so an unsaved edit of any kind holds a new freeze back.
const rowA='30000000-0000-4000-8000-000000000001',stepA='30000000-0000-4000-8000-000000000002',stdTomato='30000000-0000-4000-8000-000000000003';
const format3=()=>({recipeFormatVersion:'3',title:{zh:'测试番茄炒蛋',en:'Test tomato eggs',uk:'Тестові томати з яйцем'},baseServings:1,ingredients:[{id:rowA,name:{zh:'番茄'},role:'main',ingredientId:stdTomato,originalAmount:'两个番茄',qty:{value:'120',unit:'g'},qtySource:{kind:'measured',by:'测试师傅',date:'2026-10-18'},kitchenPrep:{leadTime:{value:'30',unit:'min'}}}],steps:[{id:stepA,text:{zh:'测试步骤：大火炒'}}],unknowns:[{kind:'amount',ingredientRowId:rowA,text:'测试原话：盐少许'}],sources:[],assets:[]});
function store(){
 const kb={stored:detail({recipe:format3()}),freezes:[],saves:[],lose:0};
 kb.handler=(url,init)=>{
  const v=kb.stored.version;
  if(url.includes('/source-illustrations'))return json({recipeId:id,recipeVersion:v,illustrations:[],stepLinks:[]});
  if(url.includes('/ingredients?'))return json({items:[{id:stdTomato,version:1,name:{zh:'番茄'},baseUnit:'g'}],nextCursor:null});
  if(url.includes('/ingredients/'))return json({id:stdTomato,version:1,ingredient:{name:{zh:'番茄'},baseUnit:'g'}});
  if(url.includes('/techniques?'))return json({items:[],nextCursor:null});
  if(url.endsWith('/adoption'))return json({recipeId:id,recipeVersion:v,current:{version:v,archived:false},origin:{kind:'manual',originalRecipeVersion:1},source:{status:'needs_review'},kitchenApproval:null,issues:[]});
  if(url.includes('/knowledge-materializations/recipes/')){const body=JSON.parse(init.body);kb.freezes.push({body,key:new Headers(init.headers).get('Idempotency-Key')});if(kb.lose&&kb.lose--)throw Error('response lost');return json({dishRef:`kb-test-v${body.recipeVersion}`,recipeId:id,recipeVersion:body.recipeVersion,commit:'a'.repeat(40),unchanged:false},201);}
  if(url.endsWith('/assets/upload'))return json({id:assetId,kind:'image',url:`/api/v1/assets/${assetId}/content`,status:'ready'},201);
  if(url.includes('/assets/'))return new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}});
  if(url.endsWith('/revisions/1'))return json(detail({recipe:format3()}));
  if(init.method==='PUT'){const recipe=JSON.parse(init.body);kb.saves.push(recipe);kb.stored={...kb.stored,version:v+1,recipe};return json(kb.stored,200,{etag:`"v${v+1}"`});}
  return json(kb.stored,200,{etag:`"v${v}"`});
 };
 return kb;
}
const freezeButton=h=>h.all('button').find(b=>['排进菜单','Put this version on a menu','Додати цю версію в меню'].includes(b.textContent));
// Reaches the click handler even when the button is (or should already be) disabled.
const press=control=>control.dispatchEvent({type:'click',preventDefault(){}});
const hint=h=>h.all('[data-testid="freeze-unsaved"]').map(el=>el.textContent).join('');
const labelled=(h,text)=>h.all('label').find(row=>row.children[0]?.textContent===text)?.querySelector('input,textarea,select');
const SAVE_FIRST={zh:'先保存改动，再排进菜单。',en:'Save your changes first, then put it on a menu.',uk:'Спочатку збережіть зміни, а потім додайте рецепт у меню.'};

test('any unsaved edit greys out 排进菜单, and a click that still gets through sends no freeze and keeps the input',async t=>{
 const title=h=>h.field('菜名（至少一种语言）','中文');
 const edits=[
  ['recipe field',h=>h.set(title(h),'测试番茄炒蛋（改）'),h=>assert.equal(title(h).value,'测试番茄炒蛋（改）')],
  ['canteen amount',h=>h.set(labelled(h,'每份多少（不知道就留空）'),'150'),h=>assert.equal(labelled(h,'每份多少（不知道就留空）').value,'150')],
  ['lead time',h=>h.set(labelled(h,'提前多久（腌、泡、醒；不知道就留空）'),'45'),h=>assert.equal(labelled(h,'提前多久（腌、泡、醒；不知道就留空）').value,'45')],
  ['deleted unclear item',h=>h.click('删掉这一条'),h=>assert.equal(h.all('[data-testid="recipe-unknown"]').length,0)],
  ['uploaded image not saved yet',async h=>{const upload=h.all('input').find(el=>el.getAttribute('type')==='file');upload.files=[new File([new Uint8Array([1])],'test.png',{type:'image/png'})];upload.dispatchEvent({type:'change'});await h.flush();},h=>assert(h.all('button').some(b=>b.textContent==='移除素材引用'))],
  ['asset link not added yet',h=>h.set(labelled(h,'外部素材网址'),'https://example.com/test.jpg'),h=>assert.equal(labelled(h,'外部素材网址').value,'https://example.com/test.jpg')],
  ['standard being edited',h=>{h.click('＋ 标准材料');h.set(h.field('标准名称','中文'),'测试标准番茄');},h=>assert.equal(h.field('标准名称','中文').value,'测试标准番茄')],
 ];
 for(const [name,edit,kept] of edits)await t.test(name,async()=>{
  const kb=store(),h=await setup(kb.handler);await h.mount();
  assert.equal(freezeButton(h).disabled,false,name);assert.equal(hint(h),'',name);
  await edit(h);
  press(freezeButton(h));await h.flush();
  assert.equal(kb.freezes.length,0,`${name}: no freeze request while unsaved`);
  assert.equal(freezeButton(h).disabled,true,`${name}: greyed out as soon as it changes`);
  assert.equal(hint(h),SAVE_FIRST.zh,name);
  kept(h);assert.equal(kb.saves.length,0,name);assert.equal(kb.stored.version,1,name);
 });
});

test('the save-first hint is trilingual and follows the language of the mounted editor',async()=>{
 const kb=store(),h=await setup(kb.handler);await h.mount();
 h.set(h.field('菜名（至少一种语言）','中文'),'测试番茄炒蛋（改）');
 for(const lang of ['zh','en','uk']){await h.mount(id,lang);const freeze=freezeButton(h);assert.equal(freeze.disabled,true,lang);assert.equal(hint(h),SAVE_FIRST[lang],lang);press(freeze);await h.flush();assert.equal(kb.freezes.length,0,lang);assert.equal(hint(h),SAVE_FIRST[lang],lang);}
 assert.doesNotMatch(h.all('[data-testid="recipe-adoption"]')[0].textContent,/核对|复核|核定/);
});

test('saving makes 排进菜单 clickable again and fixes the newly saved version',async()=>{
 const kb=store(),h=await setup(kb.handler);await h.mount();
 h.set(h.field('菜名（至少一种语言）','中文'),'测试番茄炒蛋（改）');
 assert.equal(freezeButton(h).disabled,true,'greyed out before the save');
 // Undoing the edit by hand is no change either.
 h.set(h.field('菜名（至少一种语言）','中文'),'测试番茄炒蛋');assert.equal(freezeButton(h).disabled,false);assert.equal(hint(h),'');
 h.set(h.field('菜名（至少一种语言）','中文'),'测试番茄炒蛋（改）');
 h.click('保存菜谱');await h.flush();
 assert.equal(kb.saves.length,1);assert.equal(kb.saves[0].title.zh,'测试番茄炒蛋（改）');assert.equal(kb.stored.version,2);
 assert.equal(freezeButton(h).disabled,false,'clickable once saved');assert.equal(hint(h),'');
 h.click('排进菜单');await h.flush();
 assert.deepEqual(kb.freezes.map(call=>call.body),[{recipeVersion:2}]);assert.match(h.el.textContent,/已固定菜谱版本 v2/);
});

test('an unconfirmed freeze retries with its original body and key, and opens no new freeze for a later edit',async()=>{
 const kb=store();kb.lose=1;const h=await setup(kb.handler);await h.mount();
 h.click('排进菜单');await h.flush();assert.match(h.el.textContent,/结果尚未确认/);assert.equal(h.m.inspectReloadSafety().reason,'unknown');
 const unconfirmed=h.all('[data-testid="recipe-adoption"]')[0].textContent;
 // The form is locked while the result is open; an input event that still lands must not reach the request.
 h.set(h.field('菜名（至少一种语言）','中文'),'测试番茄炒蛋（改）');
 h.click('确认操作结果（使用同一请求）');await h.flush();
 assert.equal(kb.freezes.length,2);assert.deepEqual(kb.freezes[1],kb.freezes[0],'same body and Idempotency-Key');assert.deepEqual(kb.freezes[0].body,{recipeVersion:1});assert(kb.freezes[0].key);
 assert.match(h.el.textContent,/已固定菜谱版本 v1/);
 // The edit is still unsaved: confirming the old request is not a way to send a new one.
 const freeze=freezeButton(h);assert.equal(freeze.disabled,true);press(freeze);await h.flush();
 assert.equal(kb.freezes.length,2);assert.equal(hint(h),SAVE_FIRST.zh);assert.equal(kb.saves.length,0);
 assert.equal(h.field('菜名（至少一种语言）','中文').value,'测试番茄炒蛋（改）');
 assert.doesNotMatch(unconfirmed,/核对|复核|核定/);
});
