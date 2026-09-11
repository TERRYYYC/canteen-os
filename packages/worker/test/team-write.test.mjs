import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeRepo, WORKER, bearer, call, makeEnv, planFixture } from './helpers.mjs';
const worker = (await import(WORKER)).default;
const path = 'data/menu-plans/week-43.json';
function setup(existing = false) {
  const repo = new FakeRepo();
  repo.commit({ 'data/techniques.json': '[]', ...(existing ? { [path]: JSON.stringify(planFixture()) } : {}) });
  return { repo, env: makeEnv(repo).env };
}
for (const existing of [false, true]) test(`B1 required precondition existing=${existing}`, async () => {
  const {repo, env} = setup(existing);
  const r = await call(worker, env, 'POST', '/plan/week-43', {headers: bearer('chef'), body:planFixture()});
  assert.equal(r.status,428); assert.equal(r.body.errors[0].code,'precondition_required');
  assert.equal(repo.writeCalls().length,0);
});
for (const headers of [{ 'If-Match':'*'}, {'If-Match':'W/"'+'a'.repeat(40)+'"'}, {'If-Match':'"'+'a'.repeat(40)+'", "'+'b'.repeat(40)+'"'}, {'If-Match':''}, {'If-Match':'"'+'a'.repeat(40)}, {'If-None-Match':'abc'}, {'If-Match':'a'.repeat(40),'If-None-Match':'*'}]) test(`B1 reject malformed precondition ${JSON.stringify(headers)}`,async()=>{
  const {repo,env}=setup();
  const r=await call(worker,env,'POST','/plan/week-43',{headers:{...bearer('chef'),...headers},body:planFixture()});
  assert.equal(r.status,400);assert.equal(r.body.errors[0].code,'invalid_precondition');assert.equal(repo.writeCalls().length,0);
});
test('B1 quoted current lock accepted, stale lock checked before idempotence',async()=>{
  const {repo,env}=setup(true); const sha=repo.trees.get(repo.commits.get(repo.head).tree).get(path);
  const r=await call(worker,env,'POST','/plan/week-43',{headers:{...bearer('chef'),'If-Match':`"${sha}"`},body:planFixture()});
  assert.equal(r.status,200);
  const bad=await call(worker,env,'POST','/plan/week-43',{headers:{...bearer('chef'),'If-Match':'0'.repeat(40)},body:planFixture()});
  assert.equal(bad.status,409);
});
test('B1 simultaneous create has one winner and does not overwrite it', async()=>{
  const {repo,env}=setup(); const old=repo.head;
  const requests=[1.2,1.3].map(margin=>call(worker,env,'POST','/plan/week-43',{headers:{...bearer('chef'),'If-None-Match':'*'},body:planFixture({margin})}));
  const results=await Promise.all(requests);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const win=results.findIndex(r=>r.status===200);assert.equal(JSON.parse(repo.fileText(path)).margin,[1.2,1.3][win]);
  assert.deepEqual(repo.commits.get(repo.head).parents,[old]);
});
for(const route of ['/dish/test','/dish/test/draft']) test(`B1 mandatory lock on ${route}`,async()=>{
  const {repo,env}=setup();const r=await call(worker,env,'POST',route,{headers:bearer('chef'),body:{name:{zh:'菜'}}});
  assert.equal(r.status,428);assert.equal(repo.writeCalls().length,0);
});
test('B1 write semantic reads use the attempt head, never mutable branch',async()=>{
  const {repo,env}=setup();const head=repo.head;
  const r=await call(worker,env,'POST','/plan/week-43',{headers:{...bearer('chef'),'If-None-Match':'*'},body:planFixture()});
  assert.equal(r.status,200);
  const trees=repo.calls.filter(c=>c.method==='GET'&&c.path.includes('/git/trees/'));
  assert.ok(trees.length>0);assert.ok(trees.every(c=>c.path.endsWith('/'+head)));
  assert.equal(repo.calls.filter(c=>c.path.endsWith('/git/ref/heads/main')).length,1);
});
