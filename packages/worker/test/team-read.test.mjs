import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FakeRepo,WORKER,REPO,bearer,call,makeEnv,makeFetch,ingredientFixture} from './helpers.mjs';
const worker=(await import(WORKER)).default;
const owner='data/ingredients/tomato.json';
const img='data/ingredients/tomato.jpg';
const entity=(name)=>JSON.stringify(ingredientFixture({name:{zh:name},image:{src:'tomato.jpg',license:'CC0'}}));
function setup(){
 const repo=new FakeRepo();const a=repo.commit({[owner]:entity('A'),[img]:'image-A','data/techniques.json':'[]'});
 const b=repo.commit({[owner]:entity('B'),[img]:'image-B','data/techniques.json':'[]'});
 const env=makeEnv(repo).env;return {repo,a,b,env};
}
for(const endpoint of ['/source/ingredient/tomato','/catalog']){
 test(`B1 ${endpoint} pins explicit revision`,async()=>{const {repo,a,env}=setup();
 const r=await call(worker,env,'GET',`${endpoint}?revision=${a}`,{headers:bearer('buyer')});assert.equal(r.status,200);assert.equal(r.body.commit,a);
 assert.equal((r.body.content??r.body.ingredients.tomato).name.zh,'A');assert.equal(repo.writeCalls().length,0);
 });
 for(const bad of ['main','abcd','A'.repeat(40),''])test(`B1 ${endpoint} invalid revision ${bad}`,async()=>{
 const {env}=setup();const r=await call(worker,env,'GET',`${endpoint}?revision=${bad}`,{headers:bearer('buyer')});assert.equal(r.status,400);assert.equal(r.body.errors[0].code,'invalid_revision');
 });
 test(`B1 ${endpoint} rejects nonancestor and missing revision`,async()=>{
 const {repo,a,b,env}=setup();repo.head=a;const fork=repo.commit({[owner]:entity('fork')});repo.head=b;
 for(const sha of [fork,'0'.repeat(40)]){const r=await call(worker,env,'GET',`${endpoint}?revision=${sha}`,{headers:bearer('buyer')});assert.equal(r.status,422);assert.equal(r.body.errors[0].code,'revision_unavailable');}
 });
 for(const bad of ['{bad',JSON.stringify({name:{zh:'broken'}})])test(`B1 ${endpoint} stored invalid source is explicit`,async()=>{
 const {repo,env}=setup();repo.commit({[owner]:bad,'data/techniques.json':'[]'});
 const r=await call(worker,env,'GET',endpoint,{headers:bearer('buyer')});assert.equal(r.status,422);assert.equal(r.body.errors[0].code,'invalid_source');
 });
}
test('B1 network and authorization upstream failures do not become absent revision',async()=>{
 for(const failure of ['throw',403]){const {repo,a}=setup();const real=makeFetch(repo);const env=makeEnv(repo,{__fetch:async(input,init)=>{
 if(String(input).includes(`/commits/${a}`)){if(failure==='throw')throw new TypeError('network');return new Response('{}',{status:failure});}return real(input,init);
 }}).env;
 const r=await call(worker,env,'GET',`/catalog?revision=${a}`,{headers:bearer('buyer')});assert.equal(r.status,502);assert.equal(r.body.errors[0].code,'upstream_error');}
});
test('B1 catalog tree truncation fails closed',async()=>{const {repo,env}=setup();const real=env.__fetch;env.__fetch=async(i,init)=>String(i).includes('/git/trees/')?new Response(JSON.stringify({truncated:true,tree:[]})):real(i,init);
 const r=await call(worker,env,'GET','/catalog',{headers:bearer('buyer')});assert.equal(r.status,502);
});
function url(a,ownerPath=owner,pointer='/image'){return `/asset?revision=${a}&owner=${encodeURIComponent(ownerPath)}&pointer=${encodeURIComponent(pointer)}`;}
test('B1 asset returns historical bytes and version header',async()=>{const {env,a}=setup();const res=await worker.fetch(new Request(`https://worker.example${url(a)}`,{headers:bearer('buyer')}),env);
 assert.equal(res.status,200);assert.equal(await res.text(),'image-A');assert.equal(res.headers.get('X-Source-Revision'),a);assert.equal(res.headers.get('Content-Type'),'image/jpeg');
});
test('B1 asset missing historical bytes has no current fallback',async()=>{const {repo,env}=setup();const a=repo.commit({[owner]:entity('missing')});repo.commit({[owner]:entity('current'),[img]:'current'});
 const r=await call(worker,env,'GET',url(a),{headers:bearer('buyer')});assert.equal(r.status,422);assert.equal(r.body.errors[0].code,'asset_unavailable');
});
for(const src of ['https://example.com/a.jpg','../../secrets.jpg','/data/ingredients/tomato.jpg'])test(`B1 asset path restriction ${src}`,async()=>{const {repo,env}=setup();const a=repo.commit({[owner]:JSON.stringify(ingredientFixture({image:{src,license:'CC0'}})),[img]:'unused'});
 const r=await call(worker,env,'GET',url(a),{headers:bearer('buyer')});assert.equal(r.status,422);assert.equal(r.body.errors[0].code,src.startsWith('https:')?'external_asset_unpinned':'asset_unavailable');
});
test('B1 asset validates owner and schema pointer; auth runs first',async()=>{const {env,a,repo}=setup();for(const u of [url(a,'README.md'),url(a,owner,'/name'),url(a,owner,'/components/0/prep/image')]){
 const r=await call(worker,env,'GET',u,{headers:bearer('buyer')});assert.equal(r.status,422);
 }repo.calls=[];const r=await call(worker,env,'GET',url('bad'));assert.equal(r.status,401);assert.equal(repo.calls.length,0);
});
