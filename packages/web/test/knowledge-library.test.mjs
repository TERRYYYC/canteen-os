import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
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
  build.onResolve({ filter: /\/admin\/token$/ }, () => ({ path: 'token', namespace: 'test' }));
  build.onResolve({ filter: /\/router$/ }, () => ({ path: 'router', namespace: 'test' }));
  build.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'token' ? `export const getToken=()=>globalThis.fixture.token; export const peekToken=getToken; export const getAuthSessionVersion=()=>globalThis.fixture.auth; export const peekAuthSessionVersion=getAuthSessionVersion; export const stripTokenFromRest=x=>x; export const onAuthSessionChange=fn=>{globalThis.fixture.authHooks.push(fn);return()=>{};};` : `export const onRoute=fn=>{globalThis.fixture.routeHooks.push(fn);return()=>{};};`, loader: 'js' }));
} }] });
await writeFile(output, bundle.outputFiles[0].text);
const id = '10000000-0000-4000-8000-000000000001';
const id2 = '10000000-0000-4000-8000-000000000002';
const assetId = '20000000-0000-4000-8000-000000000001';
const detail = (overrides = {}) => ({ id, version: 1, createdAt: '2026-09-19T00:00:00.000Z', recipe: { title: { zh: '红烧肉', en: 'Braised pork', uk: 'Тушкована свинина' }, ingredients: [{ id: id2, ingredientId: id2, name: { zh: '盐', en: 'Salt' }, amount: { kind: 'unknown', raw: '未写明' }, role: 'seasoning', preparation: { uk: 'Підготувати' } }], steps: [], sources: [], assets: [] }, media: [], sourceRecords: [], ...overrides });
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', etag: '"v1"', ...headers } });
const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
let serial = 0;
async function setup(handler = () => json(detail())) {
  globalThis.fixture = { token: 'test-only-token', auth: 1, authHooks: [], routeHooks: [], calls: [], handler };
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  globalThis.window = { addEventListener() {}, confirm: () => true };
  globalThis.location = { hash: '#/admin/knowledge' };
  globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => new Element('', String(text)), activeElement: null };
  const body = new Element('body'), el = new Element('main'); body.append(el);
  globalThis.fetch = async (url, init = {}) => { fixture.calls.push({ url: String(url), init }); return fixture.handler(String(url), init); };
  const m = await import(pathToFileURL(output).href + `?run=${++serial}`);
  const flush = async () => { for (let i=0;i<15;i++) await new Promise(resolve => setImmediate(resolve)); };
  const mount = async (rest = id, lang = 'zh') => { await m.render(el, { lang, planId: 'week-2026-40', setReloadCoverage() {} }, rest); await flush(); };
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

test('transport keeps ETag, replay header, new API errors and authenticated gateway path', async () => {
  const h = await setup();
  const api = h.m.createKnowledgeApi({ base: '/gateway', token: () => 'private', session: () => 1, fetch: async (url, init) => { assert.equal(url, '/gateway/knowledge/recipes'); assert.equal(new Headers(init.headers).get('authorization'), 'Bearer private'); assert.equal(init.redirect, 'error'); return json({items:[]}, 200, {etag:'"v7"','idempotency-replayed':'true'}); } });
  const reply = await api.request('/recipes'); assert.equal(reply.etag, '"v7"'); assert.equal(reply.replayed, 'true');
  const denied = h.m.createKnowledgeApi({ base: '/gateway', token: () => 'private', session: () => 1, fetch: async()=>json({error:{code:'FORBIDDEN',message:'denied',details:{role:'buyer'}}},403) });
  await assert.rejects(denied.request('/recipes'), error=>error.status===403 && error.code==='FORBIDDEN' && error.details.role==='buyer');
});
test('a provenance link reads exactly the historical KB version without an editable draft',async()=>{
 const h=await setup(url=>{
   assert.match(url, new RegExp(`/recipes/${id}/revisions/1$`));
   return json(detail({sourceRecords:[{id:'source-1',kind:'web',url:'https://example.org/post',textContent:'original v1'}]}));
 });
 await h.mount(`${id}/revisions/1`);
 assert.match(h.el.textContent,/菜谱固定版本 v1/);
 assert.match(h.el.textContent,/original v1/);
 assert.equal(h.all('textarea').length,0);
 assert.equal(fixture.calls.length,1);
});
test('formal recipe editor keeps a long source behind a short, expandable evidence summary',async()=>{
  const original='00:01 羊腩五斤，油炸后入煲。\n'.repeat(120);
  const recipe={...detail().recipe,sources:[{sourceId:id2}]};
  const h=await setup(()=>json(detail({recipe,sourceRecords:[{id:id2,kind:'web',title:'原收藏视频',author:'原作者',url:'https://example.org/video',textContent:original}]})));
  await h.mount();
  const evidence=h.all('.kb-source-evidence')[0];
  assert(evidence,'long source is placed behind a disclosure');
  assert.equal(evidence.getAttribute('open'),null,'raw source starts collapsed');
  assert.match(evidence.querySelector('summary').textContent,/展开查看原始证据/);
  const excerpt=h.all('.kb-source-excerpt')[0];
  assert(excerpt&&excerpt.textContent.length<140,'chef sees a short source preview');
  assert.equal(evidence.querySelector('p').textContent,original,'full source is available unchanged on expansion');
  assert.deepEqual(recipe.sources,[{sourceId:id2}],'presentation does not alter recipe source references');
});
test('formal editor shows private candidate frames by explicit step link without publishing them',async()=>{
  const otherStep='10000000-0000-4000-8000-000000000003';
  const assets=[1,2,3,4].map(n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
  const recipe={...detail().recipe,steps:[{id:id2,text:{zh:'皮朝下放入煲中'}}],assets:[]};
  const linked={recipeId:id,recipeVersion:1,candidateId:id2,approvedCandidateVersion:1,
    illustrations:[
      {assetId:assets[0],role:'ingredient',sourceStepId:null,caption:{zh:'配料盘'},rightsState:'pending'},
      {assetId:assets[1],role:'step',sourceStepId:id2,caption:{zh:'皮朝下'},rightsState:'pending'},
      {assetId:assets[2],role:'step',sourceStepId:otherStep,caption:{zh:'旧步骤'},rightsState:'pending'},
      {assetId:assets[3],role:'finished',sourceStepId:null,caption:{zh:'成品'},rightsState:'verified'}],
    stepLinks:[{sourceStepId:id2,recipeStepId:id2},{sourceStepId:otherStep,recipeStepId:null}]};
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  URL.createObjectURL=blob=>`blob:private-${blob.size}`;URL.revokeObjectURL=()=>{};
  try{
    const h=await setup(url=>url.includes('/source-illustrations?version=1')?json(linked):url.includes('/assets/')?new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}}):json(detail({recipe})));
    await h.mount();await h.flush();
    const panel=h.all('.kb-source-reference-panel')[0];assert(panel);
    assert.equal(h.all('.kb-form')[0].querySelector('.kb-source-reference-panel'),null,'reference panel is outside the editable recipe form');
    const groups=h.all('.kb-source-reference-group');
    assert(groups.some(group=>group.getAttribute('data-kind')==='ingredient'&&group.textContent.includes('配料盘')));
    assert(groups.some(group=>group.getAttribute('data-kind')==='finished'&&group.textContent.includes('成品')));
    const stepGroup=groups.find(group=>group.getAttribute('data-kind')==='step');
    const steps=stepGroup.querySelectorAll('.kb-source-reference-card');
    assert(steps.some(card=>card.getAttribute('data-linked-step-id')===id2&&card.textContent.includes('皮朝下')));
    assert(steps.some(card=>card.getAttribute('data-linked-step-id')===null&&card.textContent.includes('未关联到当前步骤')));
    const linkedStep=steps.find(card=>card.getAttribute('data-linked-step-id')===id2);
    const stepInput=h.field('步骤说明','中文');
    h.set(stepInput,'改成先焯水再入煲');
    assert.equal(linkedStep.getAttribute('data-linked-step-id'),null,'an unsaved text change unlinks the old frame immediately');
    assert.match(linkedStep.textContent,/未关联到当前步骤/);
    assert.doesNotMatch(linkedStep.textContent,/当前步骤 1 · 改成先焯水再入煲/);
    h.set(stepInput,'皮朝下放入煲中');
    assert.equal(linkedStep.getAttribute('data-linked-step-id'),id2,'restoring saved text restores the explicit link');
    assert.match(panel.textContent,/使用权待核实/);
    assert.deepEqual(recipe.assets,[]);
    assert.equal(fixture.calls.filter(call=>call.url.includes('/assets/')).length,4,'frames load through authenticated asset route');
    assert(fixture.calls.some(call=>call.url.endsWith(`/recipes/${id}/source-illustrations?version=1`)));
  }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
test('saving a new recipe revision rereads its fixed source illustration mapping',async()=>{
  const recipe={...detail().recipe,steps:[{id:id2,text:{zh:'焖煮'}}],assets:[]};
  let saved;
  const h=await setup((url,init)=>{
    if(url.endsWith(`/recipes/${id}/source-illustrations?version=1`))return json({recipeId:id,recipeVersion:1,candidateId:id2,approvedCandidateVersion:1,illustrations:[],stepLinks:[]});
    if(url.endsWith(`/recipes/${id}/source-illustrations?version=2`))return json({recipeId:id,recipeVersion:2,candidateId:id2,approvedCandidateVersion:1,illustrations:[{assetId,role:'step',sourceStepId:id2,caption:{zh:'旧步骤图'},rightsState:'pending'}],stepLinks:[{sourceStepId:id2,recipeStepId:null}]});
    if(url.includes('/assets/'))return new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}});
    if(init.method==='PUT'){saved=JSON.parse(init.body);return json(detail({version:2,recipe:saved}),200,{etag:'"v2"'});}
    return json(detail({recipe}));
  });
  await h.mount();h.set(h.field('菜名（至少一种语言）','中文'),'新版本');h.click('保存菜谱');await h.flush();
  assert(fixture.calls.some(call=>call.url.endsWith(`/recipes/${id}/source-illustrations?version=2`)));
  assert.match(h.el.textContent,/旧步骤图.*未关联到当前步骤/);
  assert.deepEqual(saved.assets,[],'source reference frames never enter publishable recipe assets');
});
test('an approved source exposes a deliberate v2 chef check before freezing its new version',async()=>{
  const candidateId='e2068014-7d9e-4e74-b24d-32f12554e7c4';
  const itemId='c829d4a8-837c-47d0-b62c-7f10d829bb51';
  const captureId='2a132a7d-1835-484e-a270-2617fb124379';
  const item={id:itemId,contentId:'7676372301671218289',kind:'note',url:'https://www.douyin.com/note/7676372301671218289',index:44,author:'test',cardAlt:'test card',displayText:'test card',state:'approved'};
  const candidate={id:candidateId,captureId,status:'approved',recipe:{title:{zh:'测试菜'},ingredients:[],steps:[]},fieldEvidence:{},imageCandidates:[],recipeId:id,recipeVersion:1,reviewer:'test-chef'};
  const h=await setup((url,init)=>{
    if(url.endsWith('/favorites/imports'))return json({items:[]});
    if(url.includes('/favorites/items?'))return json({items:[item],nextCursor:null});
    if(url.endsWith(`/favorites/items/${itemId}`))return json(item);
    if(url.endsWith(`/favorites/items/${itemId}/captures`))return json({items:[{id:captureId,status:'ready',method:'manual_post',capturedAt:'2026-09-27',sha256:'e'.repeat(64),evidence:{sourceUrl:item.url,text:'测试菜 1 克'}}]});
    if(url.endsWith(`/favorites/items/${itemId}/candidates`))return json({items:[candidate]});
    if(url.endsWith(`/recipes/${id}`))return json(detail({version:2}));
    if(url.endsWith(`/knowledge-materializations/${candidateId}`))return json({dishRef:`kb-${id.replaceAll('-','')}-v2`,recipeVersion:2,commit:'a'.repeat(40),unresolvedCount:0,unchanged:false});
    throw Error(`unexpected ${url} ${init?.method}`);
  });
  await h.mount('inbox');
  const source=h.all('.kb-inbox-item')[0];source.open=true;source.dispatchEvent({type:'toggle'});await h.flush();
  assert(h.all('a').some(link=>link.textContent.includes('进入正式菜谱编辑器核定')&&link.getAttribute('href')===`#/admin/knowledge/${id}`));
  assert.match(source.textContent,/来源已审核/);
  assert.match(source.textContent,/厨房条件请在正式菜谱中核对/);
  assert.match(h.el.textContent,/检查菜谱新版本/);
  h.click('检查菜谱新版本');await h.flush();
  assert.match(h.el.textContent,/v2/);
  const name=h.all('input').find(input=>input.getAttribute('placeholder')==='新版本审核人');
  const note=h.all('input').find(input=>input.getAttribute('placeholder')==='与原作品核对的变更说明');
  assert(name&&note);h.set(name,'test-chef-2');h.set(note,'checked v2');
  const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-04T12:00:00Z']));}};
  try{h.click('核对并固定 v2');await h.flush();}finally{globalThis.Date=RealDate;}
  const write=fixture.calls.find(call=>call.url.endsWith(`/knowledge-materializations/${candidateId}`));
  assert.deepEqual(JSON.parse(write.init.body),{recipeVersion:2,reviewer:'test-chef-2',note:'checked v2'});
  assert.match(h.el.textContent,/已固定菜谱版本 v2/);
  assert.doesNotMatch(source.textContent,/厨房用量待核定/);
  assert(h.all('a').some(link=>link.getAttribute('href')===`#/admin/plan/week-2026-40/select/kb-${id.replaceAll('-','')}-v2`));
});

test('inbox searches candidate names and shows a source-only preview before opening a video',async()=>{
  const itemId='c829d4a8-837c-47d0-b62c-7f10d829bb51';
  const thumb='30000000-0000-4000-8000-000000000001';
  const candidateId='e2068014-7d9e-4e74-b24d-32f12554e7c4';
  const item={id:itemId,contentId:'7688940752160196770',kind:'video',url:'https://www.douyin.com/video/7688940752160196770',index:1,author:'原片作者',cardAlt:'',displayText:'',state:'needs_review',candidateSummary:{candidateId,title:{zh:'陈皮排骨',en:'Tangerine peel ribs'},status:'needs_review',ingredientCount:12,stepCount:8,illustrationCount:5,thumbnailAssetId:thumb,unresolvedCount:3}};
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
  URL.createObjectURL=()=> 'blob:inbox-preview';URL.revokeObjectURL=()=>{};
  try{
    const h=await setup(url=>{
      if(url.endsWith('/favorites/imports'))return json({items:[]});
      if(url.includes('/favorites/items?'))return json({items:[item],nextCursor:null});
      if(url.endsWith(`/assets/${thumb}/content`))return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/jpeg'}});
      throw Error(`unexpected ${url}`);
    });
    await h.mount('inbox');
    const search=h.all('input').find(input=>input.getAttribute('type')==='search');
    assert(search,'chef can search by candidate name');
    h.set(search,'陈皮排骨');h.click('搜索菜名');await h.flush();
    const query=fixture.calls.filter(call=>call.url.includes('/favorites/items?')).at(-1).url;
    assert.equal(new URL(query,'http://local.test').searchParams.get('q'),'陈皮排骨');
    const summary=h.all('.kb-inbox-item')[0].querySelector('summary');
    assert.match(summary.textContent,/陈皮排骨/);assert.match(summary.textContent,/12 项食材/);assert.match(summary.textContent,/8 步做法/);assert.match(summary.textContent,/5 张原片参考图/);
    assert.match(summary.textContent,/来源待师傅审核/);
    assert.equal(summary.querySelectorAll('img').length,1);
    assert.equal(h.all('.kb-inbox-candidate').length,0,'detail is not requested until the item opens');
    await h.mount('inbox','en');
    assert.match(h.all('.kb-inbox-item')[0].querySelector('summary').textContent,/Tangerine peel ribs/);
    assert.match(h.all('.kb-inbox-item')[0].querySelector('summary').textContent,/Source awaits chef review/);
  }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
});
test('a late previous name search cannot replace the chef’s current results',async()=>{
  const old=defer(),base={kind:'video',url:'https://www.douyin.com/video/7688940752160196770',author:'原片作者',cardAlt:'',displayText:'',state:'needs_review'};
  const item=(name,index)=>({...base,id:`c829d4a8-837c-47d0-b62c-7f10d829bb5${index}`,contentId:`768894075216019677${index}`,index,candidateSummary:{candidateId:`e2068014-7d9e-4e74-b24d-32f12554e7c${index}`,title:{zh:name},status:'needs_review',ingredientCount:1,stepCount:1,illustrationCount:0,thumbnailAssetId:null,unresolvedCount:0}});
  const h=await setup(url=>{
    if(url.endsWith('/favorites/imports'))return json({items:[]});
    if(url.includes('/favorites/items?')){
      const q=new URL(url,'http://local.test').searchParams.get('q');
      return q==='旧菜'?old.promise:json({items:q==='新菜'?[item('新菜',2)]:[],nextCursor:null});
    }
    throw Error(`unexpected ${url}`);
  });
  await h.mount('inbox');
  const search=h.all('input').find(input=>input.getAttribute('type')==='search');
  h.set(search,'旧菜');h.click('搜索菜名');await h.flush();
  h.set(search,'新菜');h.click('搜索菜名');await h.flush();
  old.resolve(json({items:[item('旧菜',1)],nextCursor:null}));await h.flush();
  assert.equal(h.all('.kb-inbox-item').length,1);
  assert.match(h.all('.kb-inbox-item')[0].textContent,/新菜/);
  assert.doesNotMatch(h.all('.kb-inbox-item')[0].textContent,/旧菜/);
});
test('inbox reference thumbnails wait until visible and are released on route departure',async()=>{
  const previousObserver=globalThis.IntersectionObserver,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
  const seen=[],revoked=[];let observer;
  globalThis.IntersectionObserver=class{constructor(callback){this.callback=callback;observer=this;}observe(element){seen.push(element);}unobserve(){}disconnect(){}};
  URL.createObjectURL=()=> 'blob:visible-source-frame';URL.revokeObjectURL=url=>revoked.push(url);
  try{
    const thumb='30000000-0000-4000-8000-000000000001';
    const h=await setup(url=>{
      if(url.endsWith('/favorites/imports'))return json({items:[]});
      if(url.includes('/favorites/items?'))return json({items:[{id:'c829d4a8-837c-47d0-b62c-7f10d829bb51',contentId:'7688940752160196770',kind:'video',url:'https://www.douyin.com/video/7688940752160196770',index:1,author:'作者',cardAlt:'',displayText:'',state:'needs_review',candidateSummary:{candidateId:'e2068014-7d9e-4e74-b24d-32f12554e7c4',title:{zh:'陈皮排骨'},status:'needs_review',ingredientCount:12,stepCount:8,illustrationCount:5,thumbnailAssetId:thumb,unresolvedCount:0}}],nextCursor:null});
      if(url.endsWith(`/assets/${thumb}/content`))return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/jpeg'}});
      throw Error(`unexpected ${url}`);
    });
    await h.mount('inbox');
    assert.equal(fixture.calls.filter(call=>call.url.includes('/assets/')).length,0,'offscreen images do not fetch');
    assert.equal(seen.length,1);
    observer.callback([{target:seen[0],isIntersecting:true}]);await h.flush();
    assert.equal(fixture.calls.filter(call=>call.url.includes('/assets/')).length,1);
    h.leave();assert.deepEqual(revoked,['blob:visible-source-frame']);
  }finally{globalThis.IntersectionObserver=previousObserver;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
});
test('the inbox labels CSV coverage as source-card intake, not recipe-analysis progress',async()=>{
  const h=await setup(url=>{
    if(url.endsWith('/favorites/imports'))return json({items:[{id:'batch',claimedCount:264,validCount:257,coverageGap:7,rejectedCount:0}]});
    if(url.includes('/favorites/items?'))return json({items:[],nextCursor:null});
    throw Error(`unexpected ${url}`);
  });
  await h.mount('inbox');
  assert.match(h.el.textContent,/收藏卡片入箱/);
  assert.match(h.el.textContent,/不是已解析菜谱数/);
});
test('chef reading order is search, source list, then collapsed CSV administration',async()=>{
  const h=await setup(url=>url.endsWith('/favorites/imports')?json({items:[]}):json({items:[],nextCursor:null}));
  await h.mount('inbox');
  const sections=h.all('.kb-panel');
  const search=sections.find(section=>section.querySelector('.kb-inbox-search'));
  const list=sections.find(section=>section.querySelector('.kb-inbox-list'));
  const csv=h.all('.kb-inbox-import')[0];
  assert(search&&list&&csv,'all three areas remain accessible');
  assert(sections.indexOf(search)<sections.indexOf(list));
  assert(sections.indexOf(list)<sections.indexOf(csv));
  assert.equal(csv.getAttribute('open'),null,'management import starts closed');
  assert.match(csv.querySelector('summary').textContent,/导入收藏 CSV/);
  assert(csv.querySelectorAll('input').some(input=>input.getAttribute('type')==='file'),'CSV file control remains available after opening');
});
for(const decision of ['approve','reject'])test(`inbox summary reflects ${decision} immediately after source review`,async()=>{
  const itemId='c829d4a8-837c-47d0-b62c-7f10d829bb51',captureId='2a132a7d-1835-484e-a270-2617fb124379',candidateId='e2068014-7d9e-4e74-b24d-32f12554e7c4';
  let state='needs_review';
  const recipe={title:{zh:'陈皮排骨'},ingredients:[{id:id2,name:{zh:'排骨'},amount:{kind:'unknown'}}],steps:[{id,text:{zh:'焖煮'}}]};
  const candidate=()=>({id:candidateId,captureId,status:state,recipe,fieldEvidence:{},imageCandidates:[],illustrations:[],...(state==='approved'?{recipeId:id,recipeVersion:1}:{} )});
  const item=()=>({id:itemId,contentId:'7688940752160196770',kind:'video',url:'https://www.douyin.com/video/7688940752160196770',index:1,author:'作者',cardAlt:'',displayText:'',state,candidateSummary:{candidateId,title:recipe.title,status:'needs_review',ingredientCount:1,stepCount:1,illustrationCount:0,thumbnailAssetId:null,unresolvedCount:0}});
  const h=await setup((url,init)=>{
    if(url.endsWith('/favorites/imports'))return json({items:[]});
    if(url.includes('/favorites/items?'))return json({items:[item()],nextCursor:null});
    if(url.endsWith(`/favorites/items/${itemId}`))return json(item());
    if(url.endsWith(`/favorites/items/${itemId}/captures`))return json({items:[{id:captureId,status:'ready',method:'manual_post',capturedAt:'2026-09-27',sha256:'e'.repeat(64),evidence:{sourceUrl:item().url,text:'陈皮排骨'}}]});
    if(url.endsWith(`/favorites/items/${itemId}/candidates`))return json({items:[candidate()]});
    if(url.endsWith(`/favorites/candidates/${candidateId}/review`)&&init.method==='POST'){state=decision==='approve'?'approved':'rejected';return json(candidate());}
    throw Error(`unexpected ${url}`);
  });
  await h.mount('inbox');const source=h.all('.kb-inbox-item')[0];
  source.open=true;source.dispatchEvent({type:'toggle'});await h.flush();
  assert.match(source.querySelector('summary').textContent,/来源待师傅审核/);
  const reviewer=h.all('input').find(input=>input.getAttribute('placeholder')==='审核人');h.set(reviewer,'主厨');
  h.click(decision==='approve'?'批准并保存独立菜谱':'退回');await h.flush();
  assert.match(source.querySelector('summary').textContent,decision==='approve'?/来源已审核/:/审核退回/);
  assert.doesNotMatch(source.querySelector('summary').textContent,/来源待师傅审核/);
});
test('an empty formal library points the chef to review existing source proposals',async()=>{
  const h=await setup(url=>{assert.match(url,/\/recipes\?limit=20$/);return json({items:[],nextCursor:null});});
  await h.mount('');
  assert(h.all('a').some(link=>link.getAttribute('href')==='#/admin/knowledge/inbox'&&link.textContent.includes('打开收藏收件箱审核草稿')));
});

test('video inbox presents the whole recipe and complete source video before technical evidence',async()=>{
  const itemId='c829d4a8-837c-47d0-b62c-7f10d829bb51',captureId='2a132a7d-1835-484e-a270-2617fb124379';
  const item={id:itemId,contentId:'7688143729379205275',kind:'video',url:'https://www.douyin.com/video/7688143729379205275',index:2,author:'test',cardAlt:'羊腩煲',displayText:'羊腩煲',state:'needs_review'};
  const capture={id:captureId,status:'ready',method:'video_analysis',capturedAt:'2026-09-28',sha256:'e'.repeat(64),evidence:{sourceUrl:item.url,
    media:{sha256:'a'.repeat(64),durationMs:263848,byteCount:21000000,sourceMethod:'browser_playback'},segments:[{id:'one',kind:'subtitle',locator:'00:12',text:'羊腩5斤',startMs:12000,endMs:13000}]}};
  const candidate={id:'e2068014-7d9e-4e74-b24d-32f12554e7c4',captureId,status:'needs_review',recipe:{title:{zh:'古法羊腩煲'},ingredients:[
    {id:id2,name:{zh:'羊腩'},amount:{kind:'exact',value:'5',unit:'斤',raw:'5斤'},preparation:{zh:'带皮带骨'}},
    {id:assetId,name:{zh:'高汤'},amount:{kind:'unknown'}}],steps:[{id,name:'',text:{zh:'炸至表面金黄'}},{id:id2,text:{zh:'放入煲锅煲熟'}}]},
    fieldEvidence:{},imageCandidates:[],unresolved:['煲煮火力和时长未说明']};
  const h=await setup(url=>{
    if(url.endsWith('/favorites/imports'))return json({items:[]});
    if(url.includes('/favorites/items?'))return json({items:[item],nextCursor:null});
    if(url.endsWith(`/favorites/items/${itemId}`))return json(item);
    if(url.endsWith(`/favorites/items/${itemId}/captures`))return json({items:[capture]});
    if(url.endsWith(`/favorites/items/${itemId}/candidates`))return json({items:[candidate]});
    throw Error(`unexpected ${url}`);
  });
  await h.mount('inbox');
  const source=h.all('.kb-inbox-item')[0];source.open=true;source.dispatchEvent({type:'toggle'});await h.flush();
  assert.equal(h.all('.kb-recipe-ingredient').length,2);
  assert.equal(h.all('.kb-recipe-step').length,2);
  assert.match(h.el.textContent,/煲煮火力和时长未说明/);
  assert(h.all('a').some(link=>link.textContent.includes('完整原视频')&&link.getAttribute('href')===item.url));
  assert(h.all('details').some(detail=>detail.textContent.includes('AI 提取依据')));
  assert.equal(h.all('.kb-inbox-candidate')[0].getAttribute('open'),'');
  assert(source.textContent.indexOf('完整做法')<source.textContent.indexOf('作品正文或字幕'));
});
test('transport refuses missing configuration/auth and discards a late prior-session body', async () => {
  const h=await setup(); let calls=0;
  await assert.rejects(h.m.createKnowledgeApi({base:'',fetch:async()=>{calls++;}}).request('/recipes'),e=>e.status===503);
  await assert.rejects(h.m.createKnowledgeApi({base:'/w',token:()=>null,fetch:async()=>{calls++;}}).request('/recipes'),e=>e.status===401); assert.equal(calls,0);
  const held=defer();let session=1;
  const api=h.m.createKnowledgeApi({base:'/w',session:()=>session,token:()=> 'same',fetch:async()=>{await held.promise;return json(detail());}});
  const request=api.request('/recipes');session=2;held.resolve();await assert.rejects(request,e=>e.code==='session_changed');
});
test('list search and cursor paging preserve same-name independent UUIDs', async () => {
  const h=await setup(url=>json({items:[{id:url.includes('cursor=')?id2:id,title:{zh:'红烧肉'},version:1}],nextCursor:url.includes('cursor=')?null:'cursor-safe'}));
  await h.mount(''); assert.equal(h.all('.kb-card').length,1);h.click('继续加载');await h.flush();assert.equal(h.all('.kb-card').length,2);
  const search=h.all('input')[0];h.set(search,'红烧肉');h.click('搜索');await h.flush();assert(fixture.calls.at(-1).url.includes('q='));
});
test('recipe list shows an authenticated cover and an honest missing-image state', async () => {
  const revoked=[], originalCreate=URL.createObjectURL, originalRevoke=URL.revokeObjectURL;
  URL.createObjectURL=()=> 'blob:recipe-cover'; URL.revokeObjectURL=url=>revoked.push(url);
  try {
    const h=await setup(url=>url.includes('/assets/')
      ? new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}})
      : json({items:[
        {id,title:{zh:'红烧肉'},version:2,cover:{assetId,kind:'image',url:`/api/v1/assets/${assetId}/content`,status:'ready'}},
        {id:id2,title:{zh:'无图菜'},version:1},
      ],nextCursor:null}));
    await h.mount('');
    assert.equal(h.all('.kb-card').length,2);
    assert.equal(h.all('.kb-card')[0].querySelectorAll('img').length,1);
    assert.equal(h.all('.kb-card')[0].querySelectorAll('img')[0].getAttribute('src'),'blob:recipe-cover');
    assert.equal(h.all('.kb-card')[0].querySelector('.kb-card-cover').getAttribute('data-asset-state'),'loading');
    h.all('.kb-card')[0].querySelector('img').dispatchEvent({type:'error'});
    assert.match(h.all('.kb-card')[0].textContent,/图片未载入/);
    assert.deepEqual(revoked,['blob:recipe-cover']);
    assert.equal(h.all('.kb-card')[1].querySelectorAll('img').length,0);
    assert.match(h.all('.kb-card')[1].textContent,/未录图片/);
    assert.equal(fixture.calls.filter(c=>c.url.includes('/assets/')).length,1);
    h.leave();assert.deepEqual(revoked,['blob:recipe-cover']);
  } finally { URL.createObjectURL=originalCreate; URL.revokeObjectURL=originalRevoke; }
});
test('external image covers render with no referrer and local covers load only when visible, two at a time', async () => {
  const previous=globalThis.IntersectionObserver, held=[], observers=[];
  globalThis.IntersectionObserver=class { constructor(callback){this.callback=callback;observers.push(this);} observe(){} disconnect(){} };
  try {
    const h=await setup(url=>url.includes('/assets/') ? new Promise(resolve=>held.push(resolve)) : json({items:[
      {id,title:{zh:'一'},version:1,cover:{assetId,kind:'image',url:`/api/v1/assets/${assetId}/content`,status:'ready'}},
      {id:id2,title:{zh:'二'},version:1,cover:{assetId,kind:'image',url:`/api/v1/assets/${assetId}/content`,status:'ready'}},
      {id:'10000000-0000-4000-8000-000000000003',title:{zh:'三'},version:1,cover:{assetId,kind:'image',url:`/api/v1/assets/${assetId}/content`,status:'ready'}},
      {id:'10000000-0000-4000-8000-000000000004',title:{zh:'四'},version:1,cover:{assetId,kind:'image',url:'https://example.test/cover.jpg',status:'ready'}},
    ],nextCursor:null}));
    await h.mount('');
    assert.equal(held.length,0,'offscreen local image requests must not start');
    const covers=h.all('.kb-card-cover');
    assert.equal(covers[3].querySelector('img')?.getAttribute('referrerpolicy'),'no-referrer');
    assert.equal(covers[3].querySelector('img')?.getAttribute('src'),'https://example.test/cover.jpg');
    observers[0].callback(covers.slice(0,3).map(target=>({target,isIntersecting:true})));
    await h.flush();assert.equal(held.length,2,'visible authenticated image requests are bounded');
    held.shift()(new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}}));
    await h.flush();assert.equal(held.length,2,'the third image starts after a slot is released');
    covers[0].querySelector('img').dispatchEvent({type:'load'});
    assert.equal(covers[0].getAttribute('data-asset-state'),'available');
    observers[0].callback([{target:covers[0],isIntersecting:false}]);
    assert.equal(covers[0].getAttribute('data-asset-state'),'deferred');
    assert.equal(covers[0].querySelectorAll('img').length,0);
    observers[0].callback([{target:covers[1],isIntersecting:false}]);
    assert.equal(fixture.calls.filter(c=>c.url.includes('/assets/'))[1].init.signal.aborted,true,'offscreen image request is cancelled');
    h.leave();
    while(held.length)held.shift()(new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}}));
    await h.flush();
  } finally { if(previous===undefined)delete globalThis.IntersectionObserver;else globalThis.IntersectionObserver=previous; }
});
test('loading another page keeps earlier cover reads alive and releases slots for later covers', async () => {
  const previous=globalThis.IntersectionObserver, held=[], observers=[];
  globalThis.IntersectionObserver=class { constructor(callback){this.callback=callback;observers.push(this);} observe(){} disconnect(){} };
  const card=(key,name)=>({id:key,title:{zh:name},version:1,cover:{assetId,kind:'image',url:`/api/v1/assets/${key}/content`,status:'ready'}});
  const picture=()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
  try {
    const h=await setup(url=>url.includes('/assets/') ? new Promise(resolve=>held.push(resolve)) : json(url.includes('cursor=')
      ? {items:[card('10000000-0000-4000-8000-000000000003','三')],nextCursor:null}
      : {items:[card(id,'一'),card(id2,'二')],nextCursor:'next-page'}));
    await h.mount('');
    let covers=h.all('.kb-card-cover');
    observers[0].callback(covers.map(target=>({target,isIntersecting:true})));
    await h.flush(); assert.equal(held.length,2);
    h.click('继续加载'); await h.flush();
    covers=h.all('.kb-card-cover'); assert.equal(covers.length,3);
    observers[0].callback([{target:covers[2],isIntersecting:true}]);
    await h.flush(); assert.equal(held.length,2,'third read waits for an active slot');
    held.shift()(picture()); await h.flush();
    assert.equal(covers[0].querySelectorAll('img').length,1,'first-page cover still renders');
    assert.equal(held.length,2,'second-page cover starts when the first read completes');
    const oldImage=covers[0].querySelector('img');
    observers[0].callback([{target:covers[0],isIntersecting:false}]);
    oldImage.dispatchEvent({type:'load'});
    assert.equal(covers[0].getAttribute('data-asset-state'),'deferred','late image event cannot change offscreen state');
    assert.equal(covers[0].querySelectorAll('img').length,0);
    held.shift()(picture()); held.shift()(picture()); await h.flush();
    observers[0].callback([{target:covers[0],isIntersecting:true}]);
    await h.flush(); assert.equal(held.length,1,'offscreen cover fetches again after reentry');
    h.leave(); held.shift()(picture()); await h.flush();
  } finally { if(previous===undefined)delete globalThis.IntersectionObserver;else globalThis.IntersectionObserver=previous; }
});
test('save preserves untouched languages, UUIDs, ingredient references and unknown quantities', async () => {
  let saved;
  const h=await setup((url,init)=>{if(init.method==='PUT'){saved=JSON.parse(init.body);assert.equal(new Headers(init.headers).get('if-match'),'"v1"');assert(new Headers(init.headers).get('idempotency-key'));return json(detail({version:2,recipe:saved}),200,{etag:'"v2"'});}return json(detail());});
  await h.mount();h.set(h.field('菜名（至少一种语言）','中文'),'红烧肉第二种');h.click('保存菜谱');await h.flush();
  assert.equal(saved.title.en,'Braised pork');assert.equal(saved.title.uk,'Тушкована свинина');assert.equal(saved.ingredients[0].id,id2);assert.equal(saved.ingredients[0].ingredientId,id2);assert.deepEqual(saved.ingredients[0].amount,{kind:'unknown',raw:'未写明'});assert.equal(saved.ingredients[0].preparation.uk,'Підготувати');assert.match(h.el.textContent,/已保存，每次修改/);
});
test('conflict retains input, history is read-only and newest selection wins', async () => {
  const a=defer(),b=defer();
  const h=await setup((url,init)=>{if(init.method==='PUT')return json({error:{code:'VERSION_CONFLICT',message:'changed'}},409);if(url.endsWith('/revisions'))return json({items:[{version:1,createdAt:'old'},{version:2,createdAt:'new'}]});if(url.endsWith('/revisions/1'))return a.promise;if(url.endsWith('/revisions/2'))return b.promise;return json(detail());});
  await h.mount();h.set(h.field('菜名（至少一种语言）','中文'),'保留草稿');h.click('保存菜谱');await h.flush();assert.equal(h.field('菜名（至少一种语言）','中文').value,'保留草稿');assert.match(h.el.textContent,/已有更新/);
  h.click('历史版本');await h.flush();h.click('v1 · old');h.click('v2 · new');b.resolve(json(detail({version:2,recipe:{title:{zh:'latest-only'}}})));await h.flush();a.resolve(json(detail({recipe:{title:{zh:'stale-only'}}})));await h.flush();assert.match(h.el.textContent,/latest-only/);assert.doesNotMatch(h.el.textContent,/stale-only/);assert.equal(h.field('菜名（至少一种语言）','中文').value,'保留草稿');
});
test('unknown new-save retries exact request/key and does not create duplicate recipe', async () => {
  let writes=0, first;
  const h=await setup((url,init)=>{if(init.method==='POST'){writes++;if(writes===1){first=init;throw new TypeError('lost response');}assert.equal(init.body,first.body);assert.equal(new Headers(init.headers).get('idempotency-key'),new Headers(first.headers).get('idempotency-key'));return json(detail({recipe:JSON.parse(init.body)}),201);}return json(detail());});
  await h.mount('new');h.set(h.field('菜名（至少一种语言）','中文'),'同名');h.click('保存菜谱');await h.flush();assert.match(h.el.textContent,/保存结果暂时无法确认/);assert.equal(h.m.inspectReloadSafety().reason,'unknown');h.click('核对保存结果');await h.flush();assert.equal(writes,2);assert.equal(location.hash,`#/admin/knowledge/${id}`);assert.equal(h.m.inspectReloadSafety().reason,'clear');
  await h.mount('new');assert.equal(h.field('菜名（至少一种语言）','中文').value,'','another independent new draft is supported');
});
test('late create completion updates cached draft but does not navigate away from another task', async () => {
  const held=defer();const h=await setup(()=>held.promise);await h.mount('new');h.set(h.field('菜名（至少一种语言）','中文'),'晚到');h.click('保存菜谱');await h.flush();h.leave();held.resolve(json(detail(),201));await h.flush();assert.equal(location.hash,'#/admin/plan');await h.mount(id);assert.equal(fixture.calls.filter(call=>call.url.endsWith(`/recipes/${id}`)).length,0,'cached draft avoids a redundant recipe read');assert.equal(fixture.calls.filter(call=>call.url.endsWith(`/recipes/${id}/source-illustrations?version=1`)).length,1);assert.equal(h.field('菜名（至少一种语言）','中文').value,'红烧肉');
});
test('language change while saving preserves inputs and refreshes the current editor on completion',async()=>{
  const held=defer();const h=await setup((url,init)=>init.method==='PUT'?held.promise:json(detail()));await h.mount();h.set(h.field('菜名（至少一种语言）','中文'),'语言切换草稿');h.click('保存菜谱');await h.flush();await h.mount(id,'en');assert.equal(h.field('Title (at least one language)','中文').value,'语言切换草稿');held.resolve(json(detail({version:2,recipe:{...detail().recipe,title:{zh:'语言切换草稿',en:'Braised pork',uk:'Тушкована свинина'}}}),200,{etag:'"v2"'}));await h.flush();assert.match(h.el.textContent,/Saved\. Each edit/);assert.equal(h.m.inspectReloadSafety().reason,'clear');
});
test('source/external image uploads are references and draft save omits top-level imported evidence',async()=>{
  let saved;const h=await setup((url,init)=>{if(url.endsWith('/sources'))return json({id:id2,kind:'text',textContent:'original source'},201);if(url.endsWith('/assets/external'))return json({id:assetId,kind:'image',url:'https://example.invalid/picture.jpg',status:'ready'},201);if(init.method==='PUT'){saved=JSON.parse(init.body);return json(detail({recipe:saved}));}return json(detail({legacy:{rawText:'original protected'}}));});
  await h.mount();const sourceLabel=h.all('label').find(l=>l.children[0]?.textContent==='来源原文');h.set(sourceLabel.querySelector('textarea'),'original source');h.click('添加这份资料');await h.flush();const assetLabel=h.all('label').find(l=>l.children[0]?.textContent==='外部素材网址');h.set(assetLabel.querySelector('input'),'https://example.invalid/picture.jpg');h.click('添加外链素材');await h.flush();h.click('保存菜谱');await h.flush();assert.deepEqual(saved.sources,[{sourceId:id2}]);assert.deepEqual(saved.assets,[{assetId,role:'reference'}]);assert(!('legacy' in saved));
});
test('authenticated image reads remap through gateway and object URLs are revoked on leaving', async()=>{
  const revoked=[],created=[],originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  URL.createObjectURL=()=>{created.push('blob:fixture');return 'blob:fixture';};URL.revokeObjectURL=url=>revoked.push(url);
  try{const h=await setup(url=>url.includes('/assets/')?new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}}):json(detail({recipe:{...detail().recipe,assets:[{assetId,role:'cover'}]},media:[{assetId,kind:'image',url:`/api/v1/assets/${assetId}/content`,status:'ready'}]})));await h.mount();assert.equal(created.length,1);const call=fixture.calls.find(c=>c.url.includes('/assets/'));assert.equal(call.url,`/worker/knowledge/assets/${assetId}/content`);assert.equal(new Headers(call.init.headers).get('authorization'),'Bearer test-only-token');assert.equal(h.all('img')[0].getAttribute('src'),'blob:fixture');h.leave();assert(revoked.includes('blob:fixture'));}finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;}
});
test('a local KB image requires an explicit rights record before the edited recipe is saved',async()=>{
  let rightsBody;
  const h=await setup((url,init)=>{
    if(url.endsWith(`/assets/${assetId}/rights`)){rightsBody=JSON.parse(init.body);return json({id:assetId,kind:'image',url:`/api/v1/assets/${assetId}/content`,status:'ready',rights:rightsBody});}
    if(url.endsWith(`/assets/${assetId}/content`))return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
    return json(detail({recipe:{...detail().recipe,assets:[{assetId,role:'cover'}]},media:[{assetId,kind:'image',url:`/api/v1/assets/${assetId}/content`,status:'ready'}]}));
  });
  await h.mount();
  assert.match(h.el.textContent,/确认图片使用许可/);
  const license=h.all('input').find(input=>input.getAttribute('placeholder')==='own 或许可名称');
  const author=h.all('input').find(input=>input.getAttribute('placeholder')==='图片作者');
  assert(license&&author);h.set(license,'own');h.set(author,'test-chef');
  h.click('确认图片使用许可');await h.flush();
  assert.deepEqual(rightsBody,{license:'own',author:'test-chef'});
  assert.match(h.el.textContent,/许可资料已固定.*保存菜谱/);
});
test('a legacy local image with only a license can complete its missing author in the editor',async()=>{
  let rightsBody;
  const h=await setup((url,init)=>{
    if(url.endsWith(`/assets/${assetId}/rights`)){rightsBody=JSON.parse(init.body);return json({id:assetId,kind:'image',url:`/api/v1/assets/${assetId}/content`,status:'ready',rights:rightsBody});}
    if(url.endsWith(`/assets/${assetId}/content`))return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
    return json(detail({recipe:{...detail().recipe,assets:[{assetId,role:'cover'}]},media:[{assetId,kind:'image',url:`/api/v1/assets/${assetId}/content`,status:'ready',rights:{license:'own',sourceUrl:'images/old-photo.png'}}]}));
  });
  await h.mount();
  const license=h.all('input').find(input=>input.getAttribute('placeholder')==='own 或许可名称');
  const author=h.all('input').find(input=>input.getAttribute('placeholder')==='图片作者');
  assert(license&&author,'incomplete legacy rights need an editable completion path');
  assert.equal(license.value,'own');h.set(author,'legacy photographer');
  h.click('确认图片使用许可');await h.flush();
  assert.deepEqual(rightsBody,{license:'own',author:'legacy photographer',sourceUrl:'images/old-photo.png'});
});
test('legacy evidence is displayed without entering editable recipe and unavailable errors are explicit',async()=>{
  const h=await setup(url=>url.endsWith('/legacy')?json({recipeId:id,version:1,evidence:{rawText:'untouched original',warnings:[{message:'unverified'}]}}):json(detail()));await h.mount();h.click('导入原文');await h.flush();assert.match(h.el.textContent,/untouched original/);assert.match(h.el.textContent,/unverified/);
  h.leave();fixture.handler=()=>json({error:{code:'KB_UNAVAILABLE',message:'offline'}},503);await h.mount(id2);assert.match(h.el.textContent,/菜谱知识库暂时无法连接/);
});
test('auth replacement immediately removes old private draft and its late read is discarded',async()=>{
  const h=await setup();await h.mount();h.set(h.field('菜名（至少一种语言）','中文'),'private draft');fixture.auth++;fixture.authHooks.forEach(fn=>fn());assert.equal(h.el.textContent,'');await h.mount();assert.equal(h.field('菜名（至少一种语言）','中文').value,'红烧肉');
});
test('decimal precision stays textual and deleting a step converts links to references',async()=>{
  const h=await setup();const recipe=detail().recipe;recipe.ingredients[0].amount={kind:'exact',value:'0.12345678901234567890123456789',unit:'g'};assert.equal(h.m.validate(recipe),null);assert.equal(h.m.editable(recipe).ingredients[0].amount.value,'0.12345678901234567890123456789');recipe.steps=[{id:id2,text:{zh:'切'}}];recipe.assets=[{assetId,role:'step',stepId:id2,clip:{start:0,end:2}}];h.m.removeStep(recipe,id2);assert.deepEqual(recipe.assets,[{assetId,role:'reference',clip:{start:0,end:2}}]);
});
test('a pre-save history list cannot cache an obsolete version after save succeeds', async()=>{
  const oldList=defer();let listReads=0;
  const h=await setup((url,init)=>{
    if(url.endsWith('/revisions')){listReads++;return listReads===1?oldList.promise:json({items:[{version:1,createdAt:'old'},{version:2,createdAt:'new'}]});}
    if(init.method==='PUT')return json(detail({version:2,recipe:JSON.parse(init.body)}),200,{etag:'"v2"'});
    return json(detail());
  });
  await h.mount();h.set(h.field('菜名（至少一种语言）','中文'),'新版本');h.click('历史版本');await h.flush();h.click('保存菜谱');await h.flush();
  oldList.resolve(json({items:[{version:1,createdAt:'old'}]}));await h.flush();h.click('历史版本');h.click('历史版本');await h.flush();
  assert(listReads>=2,'saving must invalidate the older in-flight history list');assert(h.all('button').some(b=>b.textContent==='v2 · new'));
});
test('save completion invalidates history loaded by a newer language render',async()=>{
  const write=defer();let version=1,listReads=0;
  const h=await setup((url,init)=>{if(init.method==='PUT')return write.promise;if(url.endsWith('/revisions')){listReads++;return json({items:[{version,createdAt:version===1?'old':'new'}]});}return json(detail());});
  await h.mount();h.set(h.field('菜名（至少一种语言）','中文'),'跨语言保存');h.click('保存菜谱');await h.flush();await h.mount(id,'en');h.click('Revision history');await h.flush();assert(h.all('button').some(b=>b.textContent==='v1 · old'));
  version=2;write.resolve(json(detail({version:2}),200,{etag:'"v2"'}));await h.flush();
  assert(listReads>=2,'the currently mounted language render must invalidate its cached history');assert(h.all('button').some(b=>b.textContent==='v2 · new'));assert(!h.all('button').some(b=>b.textContent==='v1 · old'));
});

function inboxPictureFixture(imageHandler){
 const itemId='c829d4a8-837c-47d0-b62c-7f10d829bb51',captureId='2a132a7d-1835-484e-a270-2617fb124379',stepId='49e04de3-bdc5-4b8b-9760-423dad360b5a';
 const item={id:itemId,contentId:'7688940752160196770',kind:'video',url:'https://www.douyin.com/video/7688940752160196770',index:1,author:'原片作者',cardAlt:'原片',displayText:'原片',state:'needs_review'};
 const illustration=role=>({id:role,assetId,url:`/api/v1/assets/${assetId}/content`,imageSha256:'b'.repeat(64),sourceMediaSha256:'a'.repeat(64),frameMs:1500,role,stepId,caption:{zh:`${role}原片图`,uk:`${role} оригінал`},sourceUrl:item.url,author:item.author,rightsState:'unknown'});
 const candidate={id:'e2068014-7d9e-4e74-b24d-32f12554e7c4',captureId,status:'needs_review',recipe:{title:{zh:'陈皮排骨'},ingredients:[{id:id2,name:{zh:'排骨'},amount:{kind:'text',raw:'两斤'}}],steps:[{id:stepId,text:{zh:'煸排骨'}}]},fieldEvidence:{},imageCandidates:[],illustrations:['ingredient','step','finished'].map(illustration)};
 return (url,init)=>{
  if(url.endsWith('/favorites/imports'))return json({items:[]});
  if(url.includes('/favorites/items?'))return json({items:[item],nextCursor:null});
  if(url.endsWith(`/favorites/items/${itemId}`))return json(item);
  if(url.endsWith(`/favorites/items/${itemId}/captures`))return json({items:[{id:captureId,status:'ready',method:'video_analysis',capturedAt:'2026-10-01',sha256:'c'.repeat(64),evidence:{sourceUrl:item.url,media:{sha256:'a'.repeat(64),durationMs:10000,byteCount:10000,sourceMethod:'f2'},segments:[]}}]});
  if(url.endsWith(`/favorites/items/${itemId}/candidates`))return json({items:[candidate]});
  if(url.endsWith(`/assets/${assetId}/content`))return imageHandler(url,init);
  throw Error(`unexpected ${url}`);
 };
}
async function openPictureInbox(h){await h.mount('inbox');const item=h.all('.kb-inbox-item')[0];item.open=true;item.dispatchEvent({type:'toggle'});await h.flush();}
test('inbox shows source images by ingredient, actual step and final output; access change revokes blobs',async()=>{
 const created=[],revoked=[];const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 URL.createObjectURL=()=>{const url=`blob:inbox-${created.length}`;created.push(url);return url;};URL.revokeObjectURL=url=>revoked.push(url);
 try{
  const h=await setup(inboxPictureFixture((url,init)=>{assert.equal(new Headers(init.headers).get('authorization'),'Bearer test-only-token');return new Response('image',{headers:{'Content-Type':'image/png'}});}));
  await openPictureInbox(h);
  assert.equal(h.all('.kb-reference-image').length,3);assert.equal(h.all('img').length,3);
  assert.equal(h.all('.kb-recipe-ingredients').length,1);
  const step=h.all('.kb-recipe-step')[0];assert.equal(step.querySelectorAll('.kb-reference-image').length,1);assert.equal(step.querySelectorAll('img').length,1);
  assert.match(h.el.textContent,/原片参考图/);assert.match(h.el.textContent,/使用权待核实/);
  fixture.auth++;fixture.authHooks.forEach(fn=>fn());assert.equal(revoked.length,3);
 }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
});
test('inbox aborts pending source-image requests on route departure and discards late blobs',async()=>{
 const pending=defer(),signals=[];let created=0;const oldCreate=URL.createObjectURL;URL.createObjectURL=()=>{created++;return 'blob:late';};
 try{
  const h=await setup(inboxPictureFixture((url,init)=>{signals.push(init.signal);return pending.promise;}));await openPictureInbox(h);assert.equal(signals.length,3);
  h.leave();assert(signals.every(signal=>signal.aborted));pending.resolve(new Response('image',{headers:{'Content-Type':'image/png'}}));await h.flush();assert.equal(created,0);assert.equal(h.all('img').length,0);
 }finally{URL.createObjectURL=oldCreate;}
});
test('inbox source-image failure offers a retry and decode failure releases its blob',async()=>{
 let reads=0;const revoked=[];const oldRevoke=URL.revokeObjectURL;URL.revokeObjectURL=url=>revoked.push(url);
 try{
  const h=await setup(inboxPictureFixture(()=>{reads++;return reads<=3?json({error:{message:'failed'}},503):new Response('image',{headers:{'Content-Type':'image/png'}});}));
  await openPictureInbox(h);assert.match(h.el.textContent,/图片未加载/);h.click('重试图片');await h.flush();assert.equal(h.all('img').length,1);
  h.all('img')[0].dispatchEvent({type:'error'});assert.equal(revoked.length,1);assert.match(h.el.textContent,/图片未加载/);h.leave();
 }finally{URL.revokeObjectURL=oldRevoke;}
});

test('inbox releases only refreshed item image blobs before replacing its detail',async()=>{
 const created=[],revoked=[];const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 URL.createObjectURL=()=>{const url=`blob:refresh-${created.length}`;created.push(url);return url;};URL.revokeObjectURL=url=>revoked.push(url);
 try{
  const h=await setup(inboxPictureFixture(()=>new Response('image',{headers:{'Content-Type':'image/png'}})));await openPictureInbox(h);assert.equal(created.length,3);
  h.click('记录卡片为待核验线索');await h.flush();assert.equal(created.length,6);assert.equal(h.all('img').length,3);assert.equal(revoked.length,3);h.leave();assert.equal(revoked.length,6);
 }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
});
test('inbox detail refresh aborts old image reads while retaining new reads in the same route',async()=>{
 const signals=[],ready=defer();let created=0;const oldCreate=URL.createObjectURL;URL.createObjectURL=()=>`blob:pending-refresh-${created++}`;
 try{
  const h=await setup(inboxPictureFixture((url,init)=>{signals.push(init.signal);return ready.promise.then(()=>new Response('image',{headers:{'Content-Type':'image/png'}}));}));await openPictureInbox(h);assert.equal(signals.length,3);
  h.click('记录卡片为待核验线索');await h.flush();assert.equal(signals.length,6);assert(signals.slice(0,3).every(x=>x.aborted));assert(signals.slice(3).every(x=>!x.aborted));
  ready.resolve();await h.flush();assert.equal(created,3);assert.equal(h.all('img').length,3);h.leave();
 }finally{URL.createObjectURL=oldCreate;}
});
