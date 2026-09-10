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

for (const content of ['', '<html>broken image</html>', 'not an image']) test(`B1 review: invalid image bytes ${content}`, async()=>{
 const repo=new FakeRepo();const sha=repo.commit({'data/ingredients/salt.json':JSON.stringify(ingredientFixture({image:{src:'salt.jpg',license:'CC0'}})),'data/ingredients/salt.jpg':content});
 const env=makeEnv(repo).env;const r=await call(worker,env,'GET',`/asset?revision=${sha}&owner=data/ingredients/salt.json&pointer=/image`,{headers:bearer('buyer')});
 assert.equal(r.status,422);assert.equal(r.body.errors[0].code,'asset_unavailable');
});
test('B1 review: PNG bytes cannot be served under JPEG reference',async()=>{
 const {PNG_A}=await import('./image-fixtures.mjs');const repo=new FakeRepo();const sha=repo.commit({'data/ingredients/salt.json':JSON.stringify(ingredientFixture({image:{src:'salt.jpg',license:'CC0'}})),'data/ingredients/salt.jpg':PNG_A});
 const r=await call(worker,makeEnv(repo).env,'GET',`/asset?revision=${sha}&owner=data/ingredients/salt.json&pointer=/image`,{headers:bearer('buyer')});assert.equal(r.status,422);assert.equal(r.body.errors[0].code,'asset_unavailable');
});
test('B1 review: truncated PNG, JPEG and WebP containers are rejected',async()=>{
 const {PNG_A,JPEG,WEBP}=await import('./image-fixtures.mjs');
 for(const [ext,bytes] of [['png',PNG_A.subarray(0,24)],['png',PNG_A.subarray(0,-12)],['jpg',JPEG.subarray(0,-2)],['webp',WEBP.subarray(0,-1)]]){
 const repo=new FakeRepo();const sha=repo.commit({'data/ingredients/salt.json':JSON.stringify(ingredientFixture({image:{src:`salt.${ext}`,license:'CC0'}})),[`data/ingredients/salt.${ext}`]:bytes});
 const r=await call(worker,makeEnv(repo).env,'GET',`/asset?revision=${sha}&owner=data/ingredients/salt.json&pointer=/image`,{headers:bearer('buyer')});assert.equal(r.status,422,ext);assert.equal(r.body.errors[0].code,'asset_unavailable');
 }
});
test('B1 review: complete supported image containers preserve exact bytes',async()=>{
 const {PNG_A,JPEG,WEBP}=await import('./image-fixtures.mjs');
 for(const [ext,bytes,mime] of [['png',PNG_A,'image/png'],['jpg',JPEG,'image/jpeg'],['webp',WEBP,'image/webp']]){
 const repo=new FakeRepo();const sha=repo.commit({'data/ingredients/salt.json':JSON.stringify(ingredientFixture({image:{src:`salt.${ext}`,license:'CC0'}})),[`data/ingredients/salt.${ext}`]:bytes});
 const response=await worker.fetch(new Request(`https://worker.example/asset?revision=${sha}&owner=data/ingredients/salt.json&pointer=/image`,{headers:bearer('buyer')}),makeEnv(repo).env);
 assert.equal(response.status,200,ext);assert.equal(response.headers.get('Content-Type'),mime);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
 }
});
