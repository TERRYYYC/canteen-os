import test from 'node:test';
import assert from 'node:assert/strict';
import { runTranslate } from './translate.mjs';
test('automatic translation never rewrites frozen recipe, ingredient or technique snapshots',async()=>{
  const files=[{path:'data/dishes/kb-recipe-v1.json',data:{name:{zh:'冻结菜'}}},{path:'data/ingredients/kbi-shared-v1.json',data:{name:{zh:'冻结食材'}}},
    {path:'data/techniques.json',data:[{id:'kbt-frozen-hash',name:{zh:'冻结技法'}},{id:'cut',name:{zh:'切'}}]}];
  const before=structuredClone(files);let requests=[];
  const result=await runTranslate({files,translator:{async translate(texts,lang){requests.push(...texts);return texts.map(x=>`${lang} ${x}`);}}});
  assert.deepEqual(files[0],before[0]);assert.deepEqual(files[1],before[1]);assert.deepEqual(files[2].data[0],before[2].data[0]);
  assert.deepEqual(new Set(requests),new Set(['切']));assert.deepEqual(result.changedFiles,['data/techniques.json']);
});
