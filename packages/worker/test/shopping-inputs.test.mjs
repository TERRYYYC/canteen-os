import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FakeRepo,makeFetch,REPO} from './helpers.mjs';
import {GitHubClient} from '../dist/github.js';
// The module is loaded inside each test so the first red run exposes the missing adapter.
const path='data/menu-plans/team.json';
const selection=[{menuPlanRef:'team',date:'2026-10-19',mealType:'lunch'}];
const plan={schemaVersion:'3',meals:[{date:'2026-10-19',mealType:'lunch',dishRef:'soup'}]};
const dish={schemaVersion:'3',name:{zh:'汤'},components:[{ingredientRef:'salt'}]};
const ingredient={schemaVersion:'2',name:{zh:'盐'},baseUnit:'g',trackStock:false};
const files=()=>({[path]:JSON.stringify(plan),'data/dishes/soup.json':JSON.stringify(dish),'data/ingredients/salt.json':JSON.stringify(ingredient),'data/techniques.json':'[]'});
function client(repo, extra={}) {return new GitHubClient({repo:REPO,branch:'main',apiBase:'https://api.github.com',token:'test',fetch:makeFetch(repo,extra)});}
async function load(gh,basis){return (await import('../dist/shopping-inputs.js')).loadShoppingInputs(gh,basis);}
test('B2 shopping inputs come entirely from their saved source revision',async()=>{
 const repo=new FakeRepo();const revision=repo.commit(files());repo.commit({[path]:JSON.stringify({...plan,meals:[]}),'data/dishes/soup.json':'broken','data/ingredients/salt.json':'broken'});
 const inputs=await load(client(repo),{sourceRevision:revision,selection});
 assert.deepEqual(inputs,{menuPlans:{team:plan},dishes:{soup:dish},ingredients:{salt:ingredient},techniques:[]});
 assert.equal(repo.writeCalls().length,0);assert.equal(repo.calls.filter(c=>c.path.includes('/ref/')).length,0);
});
test('B2 shopping inputs reject missing selected plan as unavailable basis',async()=>{
 const repo=new FakeRepo();const data=files();delete data[path];const revision=repo.commit(data);
 await assert.rejects(load(client(repo),{sourceRevision:revision,selection}),e=>e.status===422&&e.errors[0].code==='basis_unavailable'&&e.errors[0].path==='/basis/selection/0/menuPlanRef');assert.equal(repo.writeCalls().length,0);
});
for(const brokenPath of [path,'data/dishes/soup.json','data/ingredients/salt.json','data/techniques.json'])test(`B2 shopping inputs reject malformed source ${brokenPath}`,async()=>{
 const repo=new FakeRepo();const revision=repo.commit({...files(),[brokenPath]:'{'});
 await assert.rejects(load(client(repo),{sourceRevision:revision,selection}),e=>e.status===422&&e.errors[0].code==='invalid_source'&&e.errors[0].path===brokenPath);
});
test('B2 shopping inputs preserve unresolved refs as absent records',async()=>{
 const repo=new FakeRepo();const revision=repo.commit({[path]:JSON.stringify(plan),'data/dishes/soup.json':JSON.stringify(dish),'data/techniques.json':'[]'});
 const inputs=await load(client(repo),{sourceRevision:revision,selection});assert.deepEqual(inputs.ingredients,{});assert.deepEqual(inputs.dishes.soup,dish);
});
test('B2 empty v3 plan remains a real selected plan',async()=>{
 const repo=new FakeRepo();const empty={schemaVersion:'3',meals:[]};const revision=repo.commit({[path]:JSON.stringify(empty),'data/techniques.json':'[]'});
 const inputs=await load(client(repo),{sourceRevision:revision,selection});assert.deepEqual(inputs.menuPlans,{team:empty});
});
test('B2 shopping source read failures remain upstream errors',async()=>{
 const repo=new FakeRepo();const revision=repo.commit(files());const gh=client(repo,{[`GET /repos/${REPO}/git/trees/${revision}`]:()=>new Response('{}',{status:403})});
 await assert.rejects(load(gh,{sourceRevision:revision,selection}),e=>e.name==='UpstreamError'&&e.status===403);
});
