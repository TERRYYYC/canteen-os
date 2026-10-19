// #181 · ADR-0012 §1/§3: freezing a KB revision never turns the original recipe's numbers into qty.
// Every recipe, ingredient, rule and name here is test data, not a kitchen recipe or a chef's rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FakeRepo,makeEnv,bearer,call,WORKER} from './helpers.mjs';
import {estimateShoppingList} from '../../core/dist/index.js';

const {recipeMaterializationFiles}=await import('../dist/knowledge-materialization.js');
const {validateEntity}=await import('../dist/validate.js');
const {stableSerialize}=await import('../dist/serialize.js');
const worker=(await import(WORKER)).default;
/** What main (2a65c63) wrote for three legacy revisions, before #181. */
const golden=JSON.parse(readFileSync(new URL('./fixtures/legacy-materializations.json',import.meta.url)));
const chefRules=readFileSync(new URL('../../../test/fixtures/canteen-quantities/references/chef-rules.json',import.meta.url),'utf8');
const legacy=name=>structuredClone(golden.cases.find(c=>c.name===name));
const PRIVATE='PRIVATE_CHEF_NAME_SENTINEL';

const STANDARD='5a0e7c1d-2b3f-4c5d-8e6f-7a8b9c0d1e2f';
const ROWS=['0d1e2f3a-4b5c-4d6e-8f7a-8b9c0d1e2f3a','1e2f3a4b-5c6d-4e7f-9a8b-9c0d1e2f3a4b','2f3a4b5c-6d7e-4f8a-8b9c-0d1e2f3a4b5c','3a4b5c6d-7e8f-4a9b-9c0d-1e2f3a4b5c6d'];
/** KB standard ingredient revision: yield by a chef rule, grams per piece measured by a named person in the KB. */
const standard=()=>({id:STANDARD,version:1,createdAt:'2026-10-19T00:00:00.000Z',ingredient:{name:{zh:'测试鸡腿肉（夹具）'},aliases:[],baseUnit:'g',
  yield:0.8,yieldSource:{kind:'rule',ruleId:'test-yield'},pcsToGram:250,pcsToGramSource:{kind:'measured',by:PRIVATE,date:'2026-10-18'},
  purchase:{supplier:'测试供应商（夹具）',packSize:1000,packUnit:'g'},trackStock:false}});
/** KB format 3 revision (#182): original recipe and canteen amount kept apart; numbers are decimal strings. */
function format3(){
  return {id:'8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f',version:2,recipe:{title:{zh:'测试菜：食堂用量（夹具）'},recipeFormatVersion:'3',baseServings:1,
    ingredients:[
      {id:ROWS[0],ingredientId:STANDARD,role:'main',name:{zh:'测试鸡腿肉（夹具）'},originalAmount:'鸡腿 500 g',originalQty:{value:'500',unit:'g'},
        qty:{value:'150',unit:'g'},qtySource:{kind:'measured',by:PRIVATE,date:'2026-10-19'},kitchenPrep:{timing:'day-before',size:'2cm',leadTime:{value:'2',unit:'h'}}},
      {id:ROWS[1],role:'seasoning',name:{zh:'测试盐（夹具）'},originalAmount:'一点点',qty:{value:'2',unit:'g'},qtySource:{kind:'rule',ruleId:'test-salt-per-serving'}},
      {id:ROWS[2],name:{zh:'测试葱（夹具）'},originalAmount:'葱 500 g',originalQty:{value:'500',unit:'g'}},
      {id:ROWS[3],name:{zh:'测试胡椒（夹具）'},originalAmount:'适量',qty:{unit:'to-taste'},qtySource:{kind:'specified',by:PRIVATE,date:'2026-10-19'}},
    ],steps:[{id:'4b5c6d7e-8f9a-4b0c-8d1e-2f3a4b5c6d7e',text:{zh:'测试步骤（夹具）'}}],sources:[],assets:[]},media:[],sourceRecords:[]};
}

/** A KB that serves one revision, its pinned standard ingredients and techniques, and its candidate. */
function knowledgeBase(detail,dependencies={ingredients:[],techniques:[]}){
  const reads=[],candidateId='9d0e1f2a-3b4c-4d5e-8f6a-7b8c9d0e1f2a';
  const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const fetch=async url=>{
    const path=new URL(String(url)).pathname;reads.push(path);
    if(path.endsWith('/adoption'))return json({recipeId:detail.id,recipeVersion:detail.version,current:{version:detail.version,archived:false},kitchenApproval:null});
    if(path.endsWith(`/favorites/candidates/${candidateId}`))return json({id:candidateId,status:'needs_review',recipeId:detail.id,recipeVersion:detail.version});
    const dep=/\/api\/v1\/(ingredients|techniques)\/([0-9a-f-]{36})(?:\/revisions\/\d+)?$/.exec(path);
    if(dep&&dep[1]==='ingredients'){const d=dependencies.ingredients.find(x=>x.id===dep[2]);return json({id:d.id,version:d.version,ingredient:d.ingredient,createdAt:d.createdAt});}
    if(dep){const d=dependencies.techniques.find(x=>x.id===dep[2]);return json({id:d.id,version:1,technique:d.technique});}
    return json(detail);
  };
  return {fetch,reads,candidateId};
}
function freezer(repo,detail,dependencies){
  const kb=knowledgeBase(detail,dependencies);
  const {env}=makeEnv(repo,{KNOWLEDGE_BASE_URL:'http://127.0.0.1:4390',__knowledgeFetch:kb.fetch});
  const freeze=(compat=false)=>call(worker,env,'POST',compat?`/knowledge-materializations/${kb.candidateId}`:`/knowledge-materializations/recipes/${detail.id}`,
    {headers:bearer('chef'),body:{recipeVersion:detail.version}});
  return {freeze,kb,env};
}
const repoWith=(files={})=>{const repo=new FakeRepo();repo.commit({'data/techniques.json':'[]\n',...files});return repo;};
/** Change some files at HEAD (null deletes), keeping the rest of the tree. */
function edit(repo,changes){
  const tree=new Map(repo.trees.get(repo.commits.get(repo.head).tree));
  for(const [path,text] of Object.entries(changes)){if(text===null)tree.delete(path);else tree.set(path,repo.addBlob(Buffer.from(text,'utf8')));}
  return repo.commitTree(repo.registerTree(tree),'test edit');
}
const dishOf=fixed=>JSON.parse(fixed.files.find(f=>f.path===`data/dishes/${fixed.dishRef}.json`).text);
function assertRefused(response,repo,head,code){
  assert.equal(response.status,422,JSON.stringify(response.body));
  assert.equal(repo.head,head);assert.equal(repo.writeCalls().length,0);
  for(const error of response.body.errors){
    assert.equal(error.code,code);
    const words=[error.messages.zh,error.messages.en,error.messages.uk];
    assert.equal(new Set(words).size,3,`三语各一句：${JSON.stringify(words)}`);
    assert.equal(error.message,error.messages.zh);
    assert(words.every(text=>text.length>10&&!/[a-z]+_[a-z]+/.test(text)),'人话，不是代码');
  }
  return response.body.errors;
}

test('legacy revisions still freeze to the exact bytes main wrote',async()=>{
  for(const c of golden.cases){
    const fixed=await recipeMaterializationFiles(structuredClone(c.detail),structuredClone(c.dependencies));
    assert.deepEqual(fixed.files,c.files,c.name);
    assert.equal(fixed.snapshotHash,c.snapshotHash,c.name);
    assert.equal(fixed.unresolvedCount,c.unresolvedCount,c.name);
  }
});

test('a legacy version written before #181 replays as unchanged, servings 1 included; a missing file is not rewritten',async()=>{
  for(const c of golden.cases){
    const repo=repoWith({...Object.fromEntries(c.files.map(f=>[f.path,f.text])),...(c.techniques.length?{'data/techniques.json':stableSerialize(c.techniques)}:{})});
    const {freeze}=freezer(repo,c.detail,c.dependencies),head=repo.head;
    for(const compat of [false,true]){
      const replay=await freeze(compat);
      assert.equal(replay.status,200,`${c.name}: ${JSON.stringify(replay.body)}`);
      assert.equal(replay.body.unchanged,true,c.name);assert.equal(repo.head,head,c.name);assert.equal(repo.writeCalls().length,0,c.name);
    }
  }
  // The same per-serving version with one frozen file gone: replay no longer covers it, so the pre-write check applies.
  const c=legacy('servings-1-original-500g'),repo=repoWith(Object.fromEntries(c.files.map(f=>[f.path,f.text])));
  edit(repo,{[c.files[0].path]:null});const head=repo.head;
  assertRefused(await freezer(repo,c.detail,c.dependencies).freeze(),repo,head,'quantity_source_required');
});

test('a legacy revision not yet frozen writes the same bytes as main did',async()=>{
  for(const name of ['mixed-amounts-servings-2','standard-ingredient-and-technique']){
    const c=legacy(name),repo=repoWith(),fixed=await freezer(repo,c.detail,c.dependencies).freeze();
    assert.equal(fixed.status,200,`${name}: ${JSON.stringify(fixed.body)}`);assert.equal(fixed.body.unchanged,false);
    for(const file of c.files)assert.equal(repo.fileText(file.path),file.text,`${name}: ${file.path}`);
  }
});

test('a legacy revision whose servings say 1 is refused before writing, in three languages, on both routes',async()=>{
  const c=legacy('servings-1-original-500g');
  for(const compat of [false,true]){
    const repo=repoWith(),head=repo.head;
    const errors=assertRefused(await freezer(repo,c.detail,c.dependencies).freeze(compat),repo,head,'quantity_source_required');
    // Only the row with a number: "一点点" and an unrecorded amount have no qty to source.
    assert.deepEqual(errors.map(e=>e.path),['/recipe/ingredients/0']);
    assert.equal(errors[0].messages.zh,'份数按每份记的菜，每个用量都要写明出处');
  }
  // Servings 1 without any numeric qty passes the same rule; servings 2 is not counted per serving.
  const textOnly=structuredClone(c.detail);textOnly.recipe.ingredients[0].amount={kind:'text',raw:'鸡腿适量'};
  assert.equal((await freezer(repoWith(),textOnly).freeze()).status,200);
  const twoServings=structuredClone(c.detail);twoServings.recipe.baseServings=2;
  assert.equal((await freezer(repoWith(),twoServings).freeze()).status,200);
});

test('format 3: the original "500 g" stays original; qty is the canteen amount with a source that names only the chef',async()=>{
  const fixed=await recipeMaterializationFiles(format3(),{ingredients:[standard()],techniques:[]});
  const dish=dishOf(fixed);
  assert.deepEqual(dish.components[0].qty,{value:150,unit:'g'});
  assert.deepEqual(dish.components[0].qtySource,{kind:'measured',by:'chef',date:'2026-10-19'});
  assert.equal(dish.components[0].originalAmount,'鸡腿 500 g');assert.deepEqual(dish.components[0].originalQty,{value:500,unit:'g'});
  assert.deepEqual(dish.components[0].prep,{timing:'day-before',size:'2cm',leadTime:{value:2,unit:'h'}});
  assert.deepEqual(dish.components[1].qtySource,{kind:'rule',ruleId:'test-salt-per-serving'});
  // A row with only the original recipe has no qty at all.
  assert.equal(dish.components[2].qty,undefined);assert.equal(dish.components[2].qtySource,undefined);
  assert.deepEqual(dish.components[2].originalQty,{value:500,unit:'g'});
  assert.deepEqual(dish.components[3].qty,{unit:'to-taste'});assert.deepEqual(dish.components[3].qtySource,{kind:'specified',by:'chef',date:'2026-10-19'});
  // 500 appears only as the original recipe, never as anything computed.
  for(const component of dish.components)assert.notEqual(component.qty?.value,500);
  assert.deepEqual(dish.components.flatMap((c,i)=>c.originalQty?.value===500?[i]:[]),[0,2]);
  assert.equal(fixed.unresolvedCount,1,'only the original-only row');
  const ingredient=JSON.parse(fixed.files.find(f=>f.path===`data/ingredients/kbi-${STANDARD.replaceAll('-','')}-v1.json`).text);
  assert.deepEqual(ingredient.yieldSource,{kind:'rule',ruleId:'test-yield'});
  assert.deepEqual(ingredient.pcsToGramSource,{kind:'measured',by:'chef',date:'2026-10-18'});
  assert.deepEqual(fixed.ruleReferences,[
    {ruleId:'test-yield',kind:'yield',path:'/recipe/ingredients/0/ingredientId'},
    {ruleId:'test-salt-per-serving',kind:'per-serving',unit:'g',path:'/recipe/ingredients/1/qtySource'}]);
  assert.deepEqual(fixed.unsourcedQuantities,[]);
  assert(!fixed.files.some(f=>f.text.includes(PRIVATE)),'who measured stays in the KB');
  for(const file of fixed.files)assert.equal(validateEntity(file.path.startsWith('data/dishes/')?'dish':'ingredient',JSON.parse(file.text)).valid,true,file.path);
  assert.deepEqual(await recipeMaterializationFiles(format3(),{ingredients:[standard()],techniques:[]}),fixed,'same inputs, same files');
});

test('format 3 rows that break the KB contract are not frozen',async()=>{
  const deps={ingredients:[standard()],techniques:[]};
  const broken=[
    d=>{delete d.recipe.ingredients[1].qtySource;},                         // qty without its source
    d=>{delete d.recipe.ingredients[1].qty;},                               // source without qty
    d=>{d.recipe.ingredients[1].amount={kind:'exact',value:'2',unit:'g'};}, // a legacy amount in a format 3 row
    d=>{delete d.recipe.ingredients[0].qtySource.by;},                      // measured, but by whom
    d=>{d.recipe.ingredients[1].qtySource={kind:'rule'};},                  // rule without its id
    d=>{d.recipe.ingredients[1].qtySource={kind:'original'};},              // the original recipe is not a source
    d=>{d.recipe.ingredients[1].qty.value='1e3';},                          // not a decimal string
    d=>{d.recipe.ingredients[1].qty.value='0';},
    d=>{d.recipe.ingredients[0].kitchenPrep.leadTime={value:'two',unit:'h'};},
    d=>{d.recipe.unknowns='not a list';},
  ];
  for(const [i,breakIt] of broken.entries()){
    const detail=format3();breakIt(detail);
    await assert.rejects(()=>recipeMaterializationFiles(detail,deps),`case ${i}`);
    const repo=repoWith({'data/chef-rules.json':chefRules}),head=repo.head,response=await freezer(repo,detail,deps).freeze();
    assert.equal(response.status,422,`case ${i}: ${JSON.stringify(response.body)}`);assert.equal(repo.head,head);
  }
});

test('format 3 freezes once its rules check out, and replays unchanged even after the rule list changes',async()=>{
  const deps={ingredients:[standard()],techniques:[]},repo=repoWith({'data/chef-rules.json':chefRules});
  const {freeze}=freezer(repo,format3(),deps),fixed=await freeze();
  assert.equal(fixed.status,200,JSON.stringify(fixed.body));assert.equal(fixed.body.unchanged,false);
  const dish=JSON.parse(repo.fileText(`data/dishes/${fixed.body.dishRef}.json`));
  assert.deepEqual(dish.components[0].qty,{value:150,unit:'g'});
  // Rules are never changed in place (chef-rules.schema.json); even so, a version already frozen is not rechecked.
  edit(repo,{'data/chef-rules.json':'[]\n'});const head=repo.head;
  const replay=await freeze();
  assert.equal(replay.body.unchanged,true,JSON.stringify(replay.body));assert.equal(repo.head,head);
});

test('a value filled by a rule is refused when the rule is missing, of another kind, or in another unit',async()=>{
  const cases=[
    {name:'rule not in the list',change:d=>{d.recipe.ingredients[1].qtySource.ruleId='test-no-such-rule';},words:/不在规则表里/,paths:['/recipe/ingredients/1/qtySource']},
    {name:'qty cites a yield rule',change:d=>{d.recipe.ingredients[1].qtySource.ruleId='test-yield';},words:/引用错了规则/,paths:['/recipe/ingredients/1/qtySource']},
    {name:'qty in kg, rule in g',change:d=>{d.recipe.ingredients[1].qty={value:'0.002',unit:'kg'};},words:/单位要和规则一样/,paths:['/recipe/ingredients/1/qtySource']},
    {name:'yield cites a grams-per-piece rule',dep:i=>{i.yieldSource.ruleId='test-pcs-to-gram';},words:/引用错了规则/,paths:['/recipe/ingredients/0/ingredientId']},
    {name:'grams per piece cites a yield rule',dep:i=>{i.pcsToGramSource={kind:'rule',ruleId:'test-yield'};},words:/引用错了规则/,paths:['/recipe/ingredients/0/ingredientId']},
    {name:'no rule list at all',rules:null,words:/不在规则表里/,paths:['/recipe/ingredients/0/ingredientId','/recipe/ingredients/1/qtySource']},
  ];
  for(const c of cases){
    const detail=format3(),dep=standard();c.change?.(detail);c.dep?.(dep.ingredient);
    const repo=repoWith(c.rules===null?{}:{'data/chef-rules.json':chefRules}),head=repo.head;
    const errors=assertRefused(await freezer(repo,detail,{ingredients:[dep],techniques:[]}).freeze(),repo,head,'rule_reference_invalid');
    assert.deepEqual(errors.map(e=>e.path),c.paths,c.name);
    for(const error of errors)assert.match(error.message,c.words,c.name);
  }
  const repo=repoWith({'data/chef-rules.json':'{not json'}),head=repo.head,unreadable=await freezer(repo,format3(),{ingredients:[standard()],techniques:[]}).freeze();
  assert.equal(unreadable.status,422);assert.match(unreadable.body.errors[0].message,/规则表格式不对/);assert.equal(repo.head,head);
});

test('a format 3 revision with "not said in the video" items waits for #174 instead of dropping them',async()=>{
  const detail=format3();detail.recipe.unknowns=[{kind:'amount',ingredientRowId:ROWS[2],text:'PRIVATE_VIDEO_QUOTE'}];
  const repo=repoWith({'data/chef-rules.json':chefRules}),head=repo.head,{freeze,kb}=freezer(repo,detail,{ingredients:[standard()],techniques:[]});
  const errors=assertRefused(await freeze(),repo,head,'recipe_unknowns_pending');
  assert.equal(errors[0].messages.zh,'这一版带视频里没说清的条目，要等新版本才能排进菜单');
  assert(!kb.reads.some(path=>path.includes('/ingredients/')),'refused before pinning anything');
  await assert.rejects(()=>recipeMaterializationFiles(detail,{ingredients:[standard()],techniques:[]}));
  // An empty list is the same as none (#182 K5).
  const empty=format3();empty.recipe.unknowns=[];
  const ok=await freezer(repoWith({'data/chef-rules.json':chefRules}),empty,{ingredients:[standard()],techniques:[]}).freeze();
  assert.equal(ok.status,200,JSON.stringify(ok.body));
});

test('hand count: 150 g net per serving, servings 1, 100 planned, yield 0.8, engine margin 1.1 → 20 625 g gross, 21 packs through core',async()=>{
  const repo=repoWith({'data/chef-rules.json':chefRules});
  const fixed=await freezer(repo,format3(),{ingredients:[standard()],techniques:[]}).freeze();
  assert.equal(fixed.status,200,JSON.stringify(fixed.body));
  const files=[...repo.trees.get(repo.commits.get(repo.head).tree).keys()];
  const read=prefix=>Object.fromEntries(files.filter(p=>p.startsWith(prefix)).map(p=>[p.slice(prefix.length,-'.json'.length),JSON.parse(repo.fileText(p))]));
  // core lists a bound row under its standard ingredient, an unbound KB row under recipe + row.
  const dishRef=fixed.body.dishRef,chicken=`kbci-${STANDARD.replaceAll('-','')}`,scallion=`kbri-${format3().id.replaceAll('-','')}-${ROWS[2].replaceAll('-','')}`;
  const shop=margin=>{
    // No margin on the plan: the engine uses its own DEFAULT_MARGIN (1.1), as a real menu without one would.
    const plan={schemaVersion:'3',name:{zh:'测试菜单（夹具）'},...(margin===undefined?{}:{margin}),meals:[{date:'2026-10-20',mealType:'lunch',dishRef,plannedServings:100}]};
    const inputs={menuPlans:{'test-week':plan},dishes:read('data/dishes/'),ingredients:read('data/ingredients/'),techniques:[]};
    return estimateShoppingList(inputs,[{menuPlanRef:'test-week',date:'2026-10-20',mealType:'lunch'}],'2026-10-19T09:00:00Z');
  };
  const shopping=shop();
  const line=shopping.items.find(item=>item.ingredientRef===chicken);
  assert.equal(line.status,'complete',JSON.stringify(line));
  const {trace,packs,qty}=line.lines[0].line;
  // net 150 g × 100 ÷ 1 = 15 000 g; ÷ 0.8 = 18 750 g; × 1.1 = 20 625 g gross;
  // 20 625 ÷ 1 000 g per pack = 20.625 → round up 21 (≥ minPacks 1) → 21 × 1 000 = 21 000 g bought.
  assert.deepEqual(trace.netNeed,{value:15000,unit:'g'});
  assert.equal(trace.yieldApplied,0.8);assert.equal(trace.marginApplied,1.1);
  assert.deepEqual(trace.grossNeed,{value:20625,unit:'g'});
  assert.equal(trace.packsRaw,20.625);assert.equal(trace.minPacksApplied,false);
  assert.equal(packs,21);assert.deepEqual(qty,{value:21000,unit:'g'});
  // The 18.75 kg in the issue is the same count with margin 1: 18 750 g gross, 18.75 → 19 packs.
  const one=shop(1).items.find(item=>item.ingredientRef===chicken).lines[0].line;
  assert.deepEqual(one.trace.grossNeed,{value:18750,unit:'g'});assert.equal(one.packs,19);
  // The original "葱 500 g" never reaches the arithmetic: no qty, so it is not counted (not 500 × 100 = 50 kg).
  const original=shopping.items.find(item=>item.ingredientRef===scallion);
  assert.equal(original.status,'unavailable');assert(original.reasons.some(r=>r.code==='missing-qty'),JSON.stringify(original.reasons));
  assert.equal(shopping.budgetStatus,'incomplete');
});
