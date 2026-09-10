import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FakeRepo,WORKER,makeEnv,makeFetch,bearer,call,ingredientFixture} from './helpers.mjs';
const worker=(await import(WORKER)).default;
test('B1 malformed upstream JSON remains upstream_error',async()=>{
 const repo=new FakeRepo();repo.commit({'data/techniques.json':'[]'});const env=makeEnv(repo,{__fetch:async()=>new Response('{bad',{status:200})}).env;
 const r=await call(worker,env,'GET','/catalog',{headers:bearer('buyer')});assert.equal(r.status,502);assert.equal(r.body.errors[0].code,'upstream_error');
});
test('B1 asset rejects symlink mode despite image owner/pointer being valid',async()=>{
 const repo=new FakeRepo();const sha=repo.commit({'data/ingredients/salt.json':JSON.stringify(ingredientFixture({image:{src:'salt.jpg',license:'CC0'}})),'data/ingredients/salt.jpg':'link-target'});
 const real=makeFetch(repo);const env=makeEnv(repo,{__fetch:async(i,init)=>{const r=await real(i,init);if(String(i).includes('/git/trees/')){const b=await r.json();b.tree.find(e=>e.path.endsWith('.jpg')).mode='120000';return new Response(JSON.stringify(b));}return r;}}).env;
 const r=await call(worker,env,'GET',`/asset?revision=${sha}&owner=data/ingredients/salt.json&pointer=/image`,{headers:bearer('buyer')});assert.equal(r.status,422);assert.equal(r.body.errors[0].code,'asset_unavailable');
});
test('B1 omitted revision captures one H even if branch advances while reading',async()=>{
 const repo=new FakeRepo();const files={'data/ingredients/salt.json':JSON.stringify(ingredientFixture({name:{zh:'old'}}))};const a=repo.commit(files);
 const real=makeFetch(repo);let advanced=false;const env=makeEnv(repo,{__fetch:async(i,init)=>{const r=await real(i,init);if(String(i).includes('/git/ref/')&&!advanced){advanced=true;repo.commit({'data/ingredients/salt.json':JSON.stringify(ingredientFixture({name:{zh:'new'}}))});}return r;}}).env;
 const r=await call(worker,env,'GET','/catalog',{headers:bearer('buyer')});assert.equal(r.status,200);assert.equal(r.body.commit,a);assert.equal(r.body.ingredients.salt.name.zh,'old');
 assert.equal(repo.calls.filter(c=>c.path.includes('/git/ref/')).length,1);
});
