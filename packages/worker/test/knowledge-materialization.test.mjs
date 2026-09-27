import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PNG_A,PNG_B} from './image-fixtures.mjs';
import {FakeRepo,makeEnv,bearer,call,WORKER} from './helpers.mjs';
import {projectTeamMeals,estimateShoppingList} from '../../core/dist/index.js';

const { materializationFiles } = await import('../dist/knowledge-materialization.js');
const { validateEntity } = await import('../dist/validate.js');
const recipeId = '3f4c6638-dcf8-4231-966c-1c5e2816c059';
const candidateId = 'e2068014-7d9e-4e74-b24d-32f12554e7c4';
const ingredientId = '70a8bc39-50d6-47cc-8b3e-0f788c602b6a';
const stepId = 'c6d97786-92e5-4547-8e62-82225f4d27f0';
const detail = { id:recipeId,version:1,recipe:{title:{zh:'测试菜'},baseServings:2,tags:[],description:{zh:'经核对'},
  ingredients:[{id:ingredientId,name:{zh:'肉'},amount:{kind:'exact',value:'1000',unit:'克',raw:'1000 克'},rawText:'肉 1000 克'},
    {id:'a1590617-581a-4d6d-9e75-0be1b241a2d7',name:{zh:'酱油'},amount:{kind:'exact',value:'3',unit:'勺',raw:'3 勺'},rawText:'酱油 3 勺'},
    {id:'33f335cf-24a0-4e36-9800-544e33aa8b5c',name:{zh:'胡椒粉'},amount:{kind:'to_taste',raw:'适量'},rawText:'胡椒粉适量'}],
  steps:[{id:stepId,text:{zh:'烤熟'}}],sources:[],assets:[]},media:[],sourceRecords:[] };
const approved = {id:candidateId,status:'approved',recipeId,recipeVersion:1,reviewer:'test-chef'};
const worker=(await import(WORKER)).default;

test('approved version becomes a deterministic immutable dish and preserves unconvertible original amounts', async () => {
  const first=await materializationFiles(approved,detail);
  const again=await materializationFiles(approved,detail);
  assert.deepEqual(first,again);
  assert.match(first.dishRef,/^kb-[0-9a-f]{32}-v1$/);
  assert.equal(first.files.length,4);
  const dish=JSON.parse(first.files.find(x=>x.path===`data/dishes/${first.dishRef}.json`).text);
  assert.equal(dish.status,'active');
  assert.deepEqual(dish.provenance,{source:'knowledge',recipeId,recipeVersion:1,candidateId,snapshotHash:first.snapshotHash});
  assert.equal(dish.components[0].qty.value,1000);
  assert.equal(dish.components[0].qty.unit,'g');
  assert.equal(dish.components[1].qty,undefined);
  assert.equal(dish.components[1].originalAmount,'3 勺');
  assert.deepEqual(dish.components[2].qty,{unit:'to-taste'});
  assert.equal(dish.components[2].originalAmount,'适量');
});

test('precise recorded decimals remain numeric and missing raw text still has an original amount',async()=>{
  const changed=structuredClone(detail);
  changed.recipe.ingredients[0].amount={kind:'exact',value:'0.33333',unit:'kg'};
  const fixed=await materializationFiles(approved,changed);
  const dish=JSON.parse(fixed.files.find(file=>file.path===`data/dishes/${fixed.dishRef}.json`).text);
  assert.deepEqual(dish.components[0].qty,{value:0.33333,unit:'kg'});
  assert.equal(dish.components[0].originalAmount,'0.33333 kg');
});

test('approved preparation and original field evidence remain in immutable menu inputs',async()=>{
  const changed=structuredClone(detail);
  changed.recipe.ingredients[0].preparation={zh:'浸泡一夜'};
  changed.recipe.sources=[{sourceId:'source-1',evidence:{captureHash:'e'.repeat(64),fieldEvidence:{title:{quote:'测试菜',locator:'post'},ingredients:[{quote:'肉 1000 克',locator:'post'}],steps:[{quote:'烤熟',locator:'post'}]}}}];
  changed.sourceRecords=[{id:'source-1',kind:'web',title:'原贴',author:'作者',url:'https://example.org/post',textContent:'测试菜 肉 1000 克 烤熟'}];
  const fixed=await materializationFiles(approved,changed);
  const dish=JSON.parse(fixed.files.find(file=>file.path===`data/dishes/${fixed.dishRef}.json`).text);
  assert.deepEqual(dish.components[0].originalPreparation,{zh:'浸泡一夜'});
  assert.equal(dish.provenance.evidence.sourceRecords[0].textContent,'测试菜 肉 1000 克 烤熟');
  assert.equal(dish.provenance.evidence.sourceRefs[0].evidence.fieldEvidence.ingredients[0].quote,'肉 1000 克');
  assert.equal(validateEntity('dish',dish).valid,true);
});

test('unapproved or mismatched candidate never becomes a menu dish', async () => {
  await assert.rejects(()=>materializationFiles({...approved,status:'needs_review'},detail));
  await assert.rejects(()=>materializationFiles({...approved,recipeVersion:2},detail));
});

test('authorized materialization writes versioned Git inputs atomically and replays without a new commit', async()=>{
  const repo=new FakeRepo();repo.commit({'README.md':'base'});
  const seen=[];
  const {env}=makeEnv(repo,{KNOWLEDGE_BASE_URL:'http://127.0.0.1:4390',__knowledgeFetch:async input=>{
    seen.push(String(input));
    const value=String(input).endsWith(`/favorites/candidates/${candidateId}`)?approved:detail;
    return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  }});
  const send=(role='chef')=>worker.fetch(new Request(`http://worker.example/knowledge-materializations/${candidateId}`,{
    method:'POST',headers:{...bearer(role),'Content-Type':'application/json'},body:'{}'}),env);
  assert.equal((await send('buyer')).status,403);
  const response=await send();const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.unchanged,false);
  assert.deepEqual(seen,[`http://127.0.0.1:4390/api/v1/favorites/candidates/${candidateId}`,`http://127.0.0.1:4390/api/v1/recipes/${recipeId}/revisions/1`]);
  assert.equal(JSON.parse(repo.fileText(`data/dishes/${body.dishRef}.json`)).provenance.snapshotHash,body.snapshotHash);
  assert.equal(repo.head,body.commit);
  assert.equal((await send()).status,200);
  const replay=await (await send()).json();assert.equal(replay.unchanged,true);assert.equal(repo.head,body.commit);
});

test('a chef checks edited KB v2 against the approved source before a new frozen menu input exists',async()=>{
  const repo=new FakeRepo();repo.commit({'README.md':'base'});
  const original=structuredClone(detail);
  original.recipe.sources=[{sourceId:'source-1',evidence:{captureHash:'e'.repeat(64)}}];
  const edited=structuredClone(original);edited.version=2;edited.recipe.title={zh:'测试菜改良版'};
  edited.recipe.ingredients[0].amount={kind:'exact',value:'900',unit:'克',raw:'900 克'};
  const seen=[];
  const {env}=makeEnv(repo,{KNOWLEDGE_BASE_URL:'http://127.0.0.1:4390',__knowledgeFetch:async input=>{
    const url=String(input);seen.push(url);
    const value=url.endsWith(`/favorites/candidates/${candidateId}`)?approved:url.endsWith('/revisions/1')?original:edited;
    return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  }});
  const route=`/knowledge-materializations/${candidateId}`;
  const checked={recipeVersion:2,reviewer:'test-chef-2',note:'Checked the changed v2 against the original post'};
  const premature=await call(worker,env,'POST',route,{headers:bearer('chef'),body:{recipeVersion:2}});
  assert.equal(premature.status,400);
  assert.equal(repo.head!==null,true);
  const fixed=await call(worker,env,'POST',route,{headers:bearer('chef'),body:checked});
  assert.equal(fixed.status,200,JSON.stringify(fixed.body));
  assert.match(fixed.body.dishRef,/-v2$/);
  assert.equal(fixed.body.recipeVersion,2,'the response must report the revision actually frozen');
  assert.deepEqual(seen.slice(-3),[
    `http://127.0.0.1:4390/api/v1/favorites/candidates/${candidateId}`,
    `http://127.0.0.1:4390/api/v1/recipes/${recipeId}/revisions/1`,
    `http://127.0.0.1:4390/api/v1/recipes/${recipeId}/revisions/2`,
  ]);
  const dish=JSON.parse(repo.fileText(`data/dishes/${fixed.body.dishRef}.json`));
  assert.equal(dish.provenance.recipeVersion,2);
  assert.deepEqual(dish.provenance.review,{reviewer:checked.reviewer,note:checked.note,approvedCandidateVersion:1});
  assert.equal(dish.components[0].qty.value,900);
  assert.equal((await call(worker,env,'POST',route,{headers:bearer('chef'),body:checked})).body.unchanged,true);
  const detached=structuredClone(edited);detached.recipe.sources=[];
  env.__knowledgeFetch=async input=>new Response(JSON.stringify(String(input).endsWith(`/favorites/candidates/${candidateId}`)?approved:String(input).endsWith('/revisions/1')?original:detached),{headers:{'Content-Type':'application/json'}});
  assert.equal((await call(worker,env,'POST',route,{headers:bearer('chef'),body:{...checked,recipeVersion:3}})).status,422);
  assert.equal((await call(worker,env,'POST',route,{headers:bearer('chef'),body:{...checked,note:'Changed approval'}})).status,422);
});

test('licensed local KB image bytes and rights are pinned with the same dish revision',async()=>{
  const bytes=PNG_A;
  const assetId='c8e7724a-77fd-45bd-a9d0-b0ed829aa8e1';
  const withImage=structuredClone(detail);
  withImage.recipe.assets=[{assetId,role:'cover'}];
  withImage.media=[{assetId,kind:'image',role:'cover',status:'ready',url:`/api/v1/assets/${assetId}/content`,sha256:createHash('sha256').update(bytes).digest('hex'),rights:{license:'own',author:'test-chef'}}];
  const repo=new FakeRepo();repo.commit({'README.md':'base'});
  const seen=[];
  const {env}=makeEnv(repo,{KNOWLEDGE_BASE_URL:'http://127.0.0.1:4390',__knowledgeFetch:async input=>{
    const url=String(input);seen.push(url);
    return url.endsWith(`/assets/${assetId}/content`)
      ? new Response(bytes,{headers:{'Content-Type':'image/png'}})
      : new Response(JSON.stringify(url.endsWith(`/favorites/candidates/${candidateId}`)?approved:withImage),{headers:{'Content-Type':'application/json'}});
  }});
  const fixed=await call(worker,env,'POST',`/knowledge-materializations/${candidateId}`,{headers:bearer('chef'),body:{}});
  assert.equal(fixed.status,200,JSON.stringify(fixed.body));
  assert(seen.some(url=>url.endsWith(`/assets/${assetId}/content`)));
  const path=`data/dishes/${fixed.body.dishRef}.json`;
  const dish=JSON.parse(repo.fileText(path));
  assert.deepEqual(dish.image,{src:`${fixed.body.dishRef}/images/cover.png`,license:'own',author:'test-chef'});
  const assetPath=`data/dishes/${fixed.body.dishRef}/images/cover.png`;
  const tree=repo.trees.get(repo.commits.get(repo.head).tree);
  assert.deepEqual(repo.blobs.get(tree.get(assetPath)),bytes);
  const image=await worker.fetch(new Request(`https://worker.example/asset?revision=${fixed.body.commit}&owner=${encodeURIComponent(path)}&pointer=%2Fimage`,{headers:bearer('chef')}),env);
  assert.equal(image.status,200);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
  const frozenHead=repo.head;
  env.__knowledgeFetch=async input=>String(input).endsWith(`/assets/${assetId}/content`)
    ? new Response(PNG_B,{headers:{'Content-Type':'image/png'}})
    : new Response(JSON.stringify(String(input).endsWith(`/favorites/candidates/${candidateId}`)?approved:withImage),{headers:{'Content-Type':'application/json'}});
  const changed=await call(worker,env,'POST',`/knowledge-materializations/${candidateId}`,{headers:bearer('chef'),body:{}});
  assert.equal(changed.status,422,'a changed KB image must not silently reuse a frozen dish');
  assert.equal(repo.head,frozenHead);
});

test('external or rights-pending KB artwork remains evidence, not a published dish image',async()=>{
  const pending=structuredClone(detail);
  const assetId='c8e7724a-77fd-45bd-a9d0-b0ed829aa8e1';
  pending.recipe.assets=[{assetId,role:'cover'}];
  pending.media=[{assetId,kind:'image',role:'reference',status:'ready',url:'https://example.org/temporary.jpg',rights:{license:'CC BY 4.0',author:'artist',sourceUrl:'https://example.org/source'}}];
  const repo=new FakeRepo();repo.commit({'README.md':'base'});
  const seen=[];
  const {env}=makeEnv(repo,{KNOWLEDGE_BASE_URL:'http://127.0.0.1:4390',__knowledgeFetch:async input=>{
    seen.push(String(input));return new Response(JSON.stringify(String(input).endsWith(`/favorites/candidates/${candidateId}`)?approved:pending),{headers:{'Content-Type':'application/json'}});
  }});
  const fixed=await call(worker,env,'POST',`/knowledge-materializations/${candidateId}`,{headers:bearer('chef'),body:{}});
  assert.equal(fixed.status,200,JSON.stringify(fixed.body));
  const dish=JSON.parse(repo.fileText(`data/dishes/${fixed.body.dishRef}.json`));
  assert.equal(dish.image,undefined);
  assert.equal(dish.provenance.evidence.media[0].url,'https://example.org/temporary.jpg');
  assert.equal(dish.provenance.evidence.media[0].selectedRole,'cover','snapshot records the recipe role without overwriting the asset’s original role');
  assert.equal(seen.length,2,'external artwork was never fetched for Git publication');
});

test('approved version survives menu save and publish as the exact prep and purchase source',async()=>{
  const repo=new FakeRepo();repo.commit({'data/techniques.json':'[]\n'});
  const {env}=makeEnv(repo,{PUBLISH_MODE:'push-trigger',PUBLISH_CLAIM_TIMEOUT_MS:'0',KNOWLEDGE_BASE_URL:'http://127.0.0.1:4390',
    __knowledgeFetch:async input=>new Response(JSON.stringify(String(input).includes('/favorites/candidates/')?approved:detail),{headers:{'Content-Type':'application/json'}})});
  const fixed=await call(worker,env,'POST',`/knowledge-materializations/${candidateId}`,{headers:bearer('chef'),body:{}});
  assert.equal(fixed.status,200,JSON.stringify(fixed.body));
  const dishRef=fixed.body.dishRef;
  const plan={schemaVersion:'3',name:{zh:'测试菜单'},meals:[{date:'2026-10-19',mealType:'lunch',dishRef,plannedServings:4}]};
  const saved=await call(worker,env,'POST','/plan/team-week',{headers:{...bearer('chef'),'If-None-Match':'*'},body:plan});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  const published=await call(worker,env,'POST','/publish',{headers:bearer('chef')});
  assert.equal(published.status,200,JSON.stringify(published.body));
  const revision=repo.head;
  const catalog=await call(worker,env,'GET',`/catalog?revision=${revision}`,{headers:bearer('buyer')});
  const frozen=await call(worker,env,'GET',`/source/plan/team-week?revision=${revision}`,{headers:bearer('buyer')});
  assert.equal(catalog.status,200,JSON.stringify(catalog.body));
  assert.equal(frozen.status,200,JSON.stringify(frozen.body));
  assert.equal(frozen.body.content.meals[0].dishRef,dishRef);
  const inputs={menuPlans:{'team-week':frozen.body.content},dishes:catalog.body.dishes,ingredients:catalog.body.ingredients,techniques:catalog.body.techniques};
  const selection=[{menuPlanRef:'team-week',date:'2026-10-19',mealType:'lunch'}];
  const projected=projectTeamMeals(inputs,{sourceRevision:revision,selection});
  const meat=projected.collection.items.find(item=>item.sources.some(source=>source.originalAmount==='1000 克'));
  assert.equal(meat.sources[0].scaledQty.value,2000);
  assert.equal(meat.sources[0].scaledQty.unit,'g');
  assert.equal(projected.dishes[dishRef].provenance.recipeVersion,1);
  assert.equal(projected.collection.items.find(item=>item.sources.some(source=>source.originalAmount==='3 勺')).sources[0].scaledQty,undefined);
  const shopping=estimateShoppingList(inputs,selection,'2026-10-19T09:00:00Z');
  assert.equal(shopping.budgetStatus,'incomplete');
  assert.equal(shopping.items.find(item=>item.ingredientRef===meat.ingredientRef).status,'unavailable');
});
