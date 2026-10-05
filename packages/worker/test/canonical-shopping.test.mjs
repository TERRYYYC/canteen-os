import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeRepo,makeEnv,bearer,call,WORKER} from './helpers.mjs';
const worker=(await import(WORKER)).default;
const id='52d1955b-e1a9-44e8-a674-a3b3055a1130',key=`kbci-${id.replaceAll('-','')}`;
test('list2 locks shared decisions to all exact snapshots and rejects downgrade/forged dependency sets',async()=>{
  const repo=new FakeRepo();const ingredient={schemaVersion:'3',name:{zh:'小米辣'},trackStock:false,canonicalIngredientId:id,canonicalIngredientVersion:1};
  const files={'data/techniques.json':'[]','data/menu-plans/team.json':JSON.stringify({schemaVersion:'3',meals:[{date:'2026-10-05',mealType:'lunch',dishRef:'one'},{date:'2026-10-05',mealType:'lunch',dishRef:'two'}]})};
  for(const [dish,ref] of [['one','first'],['two','second']]){files[`data/dishes/${dish}.json`]=JSON.stringify({schemaVersion:'3',name:{zh:dish},components:[{ingredientRef:ref}]});files[`data/ingredients/${ref}.json`]=JSON.stringify(ingredient);}
  const revision=repo.commit(files),{env}=makeEnv(repo);
  const list={shoppingListVersion:'2',id:'trip',basis:{sourceRevision:revision,selection:[{menuPlanRef:'team',date:'2026-10-05',mealType:'lunch'}]},items:[{ingredientRef:key,snapshotRefs:['first','second'],decision:'check'}]};
  const post=(body,headers)=>call(worker,env,'POST','/shopping-list/trip',{headers:{...bearer('buyer'),...headers},body});
  let saved=await post(list,{'If-None-Match':'*'});assert.equal(saved.status,200,JSON.stringify(saved.body));
  const forged=structuredClone(list);forged.items[0].snapshotRefs=['first'];
  assert.equal((await post(forged,{'If-Match':saved.body.blobSha})).status,400);
  const next=structuredClone(list);next.items[0].decision='buy';next.items[0].bought=true;
  saved=await post(next,{'If-Match':saved.body.blobSha});assert.equal(saved.status,200,JSON.stringify(saved.body));
  const stored=await call(worker,env,'GET','/source/shopping-list/trip',{headers:bearer('buyer')});assert.deepEqual(stored.body.content,next);
  const oldClient={...list,shoppingListVersion:'1',items:[{ingredientRef:'first',decision:'check'},{ingredientRef:'second',decision:'check'}]};
  const downgrade=await post(oldClient,{'If-Match':saved.body.blobSha});assert.equal(downgrade.status,409);assert.equal(downgrade.body.errors[0].code,'format_downgrade');
  for(const [path,bytes]of Object.entries(files))assert.equal(repo.fileText(path),bytes,'manual decisions change no knowledge source');
});
