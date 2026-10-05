import assert from 'node:assert/strict';
import {test, after} from 'node:test';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createSchemaValidators} from '../../../scripts/validate-schemas.mjs';

const root=dirname(fileURLToPath(new URL('../../../package.json',import.meta.url)));
const web=join(root,'packages/web'), fixtures=join(root,'test/fixtures/contracts');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const semantic=read(join(fixtures,'semantic-expectations.json'));
const oracle=read(join(fixtures,'golden-expectations.json'));
const validators=createSchemaValidators({schemaDir:join(root,'schemas')});
function valid(kind,value){const r=validators.validateEntity(kind,value);assert.equal(r.valid,true,JSON.stringify(r.errors));}
function fixture(name='boundaries') {
 const base=join(fixtures,'valid',name,'data');
 const map=sub=>Object.fromEntries(readdirSync(join(base,sub)).filter(f=>f.endsWith('.json')).map(f=>[f.slice(0,-5),read(join(base,sub,f))]));
 return {menuPlans:map('menu-plans'),dishes:map('dishes'),ingredients:map('ingredients'),techniques:read(join(base,'techniques.json'))};
}
function formats(inputs) {
 for(const [kind,records] of [['plan',inputs.menuPlans],['dish',inputs.dishes],['ingredient',inputs.ingredients]]) for(const value of Object.values(records)) valid(kind,value);
 valid('techniques',inputs.techniques);
}
const require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'team-view-'));
after(()=>rm(dir,{recursive:true,force:true}));
const entry=existsSync(join(web,'src/view-models/team-meals.ts'))?"export * from './src/view-models/team-meals';":'';
const bundled=await esbuild.build({stdin:{contents:`export * from './src/api/team-meals';${entry}`,resolveDir:web},bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env.VITE_WORKER_URL':'""'},logLevel:'silent'});
await writeFile(join(dir,'view.mjs'),bundled.outputFiles[0].text);
const mod=await import(pathToFileURL(join(dir,'view.mjs')).href);
// Q's tokens identify injected mock scenarios only; they do not assert historical Git trees.
const {a:A,b:B,c:C}=semantic.revisionTokens, AT=semantic.fixedAt;
const selection=[{menuPlanRef:'team-week',date:'2026-09-14',mealType:'lunch'}];
const request=(revision=A,scope=selection)=>({revision,selection:scope,at:AT});
const copy=x=>structuredClone(x), ids=x=>x.items.map(i=>i.ingredientRef);
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
const error=(status,code)=>json({ok:false,errors:[{path:'',code,message:code}]},status);
function setup(revisions={[A]:fixture()}, options={}) {
 for(const inputs of Object.values(revisions)) formats(inputs);
 let principal='one';const calls=[];
 const api=mod.createTeamMealsApi('https://worker.example.invalid',{mode:'mock',token:()=>`token-${principal}`,
  fetch:async(url,init)=>{
   const u=new URL(url);calls.push({url:u,method:init.method});
   const custom=await options.respond?.(u,init,calls.length);
   if(custom) return custom;
   assert.equal(init.method,'GET','view-model must not write');
   const revision=u.searchParams.get('revision')??options.head??B;
   if(u.pathname.startsWith('/source/shopping-list/')) return options.list?json({content:options.list,commit:revision,blobSha:C}):error(404,'not_found');
   const inputs=revisions[revision];if(!inputs) return error(422,'revision_unavailable');
   if(u.pathname==='/catalog') return json({commit:revision,...inputs,suppliers:[],translations:{machine:0,human:0,stale:0}});
   if(u.pathname.startsWith('/source/plan/')) {
    const content=inputs.menuPlans[decodeURIComponent(u.pathname.split('/').at(-1))];
    return content?json({content,commit:revision,blobSha:A}):error(404,'not_found');
   }
   if(u.pathname==='/asset') return new Response(`image-${revision}`,{headers:{'Content-Type':'image/png','X-Source-Revision':revision}});
   throw new Error(`Unexpected request ${u}`);
  }});
 assert.equal(typeof mod.createTeamMealsViewModel,'function','C2a factory must exist');
 const vm=mod.createTeamMealsViewModel(api);
 after(()=>{vm.dispose();api.dispose();});
 return {api,vm,calls,changeAuth:()=>{principal='two';}};
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}

test('explicit list2 uses shared identities; existing list1 keeps concrete candidates',async()=>{
 const input=fixture();const canonical='52d1955b-e1a9-44e8-a674-a3b3055a1130';
 input.ingredients.salt={schemaVersion:'3',name:{zh:'盐'},trackStock:false,canonicalIngredientId:canonical,canonicalIngredientVersion:1};
 input.ingredients['salt-second']=copy(input.ingredients.salt);
 const dish=Object.values(input.dishes).find(d=>d.components?.some(c=>c.ingredientRef==='salt'));
 dish.components.push({...copy(dish.components.find(c=>c.ingredientRef==='salt')),ingredientRef:'salt-second'});
 const {vm}=setup({[A]:input});const v2=await vm.loadSaved({...request(),shoppingListVersion:'2'});
 const list2=vm.createList('list2',v2);assert.equal(list2.shoppingListVersion,'2');assert.equal(list2.items.filter(i=>i.ingredientRef==='kbci-'+canonical.replaceAll('-','')).length,1);
 const group=list2.items.find(i=>i.ingredientRef.startsWith('kbci-'));assert.deepEqual(group.snapshotRefs,['salt','salt-second']);
 assert.equal(vm.decide(list2,v2,group.ingredientRef,'buy',true).items.find(i=>i.ingredientRef===group.ingredientRef).bought,true);
 const oldView=await vm.loadSaved(request()),old=vm.createList('list1',oldView);assert.equal(old.shoppingListVersion,'1');assert(old.items.some(i=>i.ingredientRef==='salt'));assert(old.items.some(i=>i.ingredientRef==='salt-second'));assert(oldView.projection.collection.items.some(i=>i.ingredientRef==='salt-second'));
 assert(oldView.estimate.items.some(i=>i.ingredientRef==='salt-second'));
});
