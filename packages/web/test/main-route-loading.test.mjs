/** Actual main/auth/coverage; only module completion, shell and publication I/O are controlled. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
const web=dirname(fileURLToPath(new URL('../package.json',import.meta.url))), require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const mocks={
 './data':`export const dataApi=globalThis.probe.data;export class PublishedDataError extends Error {}`,
 './i18n':`export const getLang=()=>globalThis.probe.lang;export const t=x=>x;export const onLangChange=fn=>{globalThis.probe.changeLanguage=()=>{globalThis.probe.lang='zh';fn();};};`,
 './pwa':`export const initPwa=(_shell,hooks)=>{globalThis.probe.pwa=hooks;};`,
 './router':`export const normalize=()=>{};export const onRoute=fn=>{const g=globalThis.probe;g.route=fn;fn(g.initialRoute,'first');};`,
 './shell':`export const mountShell=()=>globalThis.probe.shell;`, './theme':`export const applyTheme=()=>{};`,
};
const bundle=await esbuild.build({stdin:{contents:"import './src/main';export {inspectReloadSafety,registerReloadRecords} from './src/view-models/reload-safety';export {clearToken} from './src/admin/token';",resolveDir:web},bundle:true,write:false,format:'iife',globalName:'runtime',platform:'browser',logLevel:'silent',plugins:[{name:'controlled-route-import-completion',setup(b){
 b.onLoad({filter:/\/src\/main\.ts$/},async a=>({loader:'ts',contents:(await readFile(a.path,'utf8')).replace(/import\(["']\.\/pages\/([a-z]+)(?:\.js)?["']\)/g,(_all,route)=>`globalThis.probe.load('${route}')`)}));
 b.onResolve({filter:/./},a=>{
  if(a.path.endsWith('.css'))return {path:a.path,namespace:'empty'};
  if(a.importer!==join(web,'src/main.ts'))return;
  if(a.path.startsWith('./pages/'))return {path:a.path,namespace:'eager-page'};
  if(mocks[a.path])return {path:a.path,namespace:'mock'};
 });
 b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}));
 b.onLoad({filter:/.*/,namespace:'eager-page'},a=>({contents:`globalThis.probe.eager.push('${a.path}');export const render=(el,ctx)=>globalThis.probe.render(el,ctx);`}));
}}]});
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
const flush=()=>new Promise(setImmediate);
const publication={kind:'team-meals',manifest:{commit:'a'.repeat(40),plans:['first']}};
function boot(initialRoute='admin'){
 const g={initialRoute,lang:'en',eager:[],loads:[],renders:[],requests:[],outlets:[],errors:[],ack:true}, values=new Map([['canteenos.token','A'.repeat(43)]]);
 g.render=(el,ctx)=>{g.renders.push({el,ctx});if(g.ack)ctx.setReloadCoverage('tracked');};
 g.load=route=>{const gate=deferred();g.loads.push({route,...gate});return gate.promise;};
 g.finish=index=>g.loads[index].resolve({render:g.render});
 g.data={loadPublication(){const gate=deferred();g.requests.push(gate);return gate.promise;}};
 g.shell={setActive(){},setTitle(){},refresh(){},setBuild(){},newOutlet(){for(const el of g.outlets)el.isConnected=false;const el={isConnected:true,children:[],append(p){this.children.push(p);}};g.outlets.push(el);return el;}};
 runInNewContext(bundle.outputFiles[0].text+';probe.runtime=runtime;',{probe:g,structuredClone,console:{error:e=>g.errors.push(e)},document:{getElementById:()=>({}),createElement:()=>({remove(){}})},sessionStorage:{getItem:k=>values.get(k)??null,removeItem:k=>values.delete(k)}});
 return g;
}
async function ready(route){const g=boot(route);g.requests[0].resolve(publication);await flush();assert.equal(g.loads.length,1,'selected page must wait for its module instead of rendering eagerly');return g;}
test('startup evaluates no unselected page and waits for selected renderer',async()=>{
 const g=boot('prep');assert.equal(g.eager.length,0);assert.equal(g.loads.length,0);
 g.requests[0].resolve(publication);await flush();assert.deepEqual(g.loads.map(x=>x.route),['prep']);assert.equal(g.renders.length,0);
 g.finish(0);await flush();assert.equal(g.renders.length,1);
});
test('route ABA and language changes cannot start late renderers or settle new coverage',async()=>{
 const g=await ready('admin');g.route('purchase','new');g.route('admin','first');g.changeLanguage();g.ack=false;
 for(const index of [0,1,2]){g.finish(index);await flush();assert.equal(g.renders.length,0);}
 assert.equal(g.runtime.inspectReloadSafety().reason,'clear');g.finish(3);await flush();assert.equal(g.renders.length,1);assert.equal(g.renders[0].ctx.lang,'zh');assert.equal(g.runtime.inspectReloadSafety().reason,'untracked');
});
test('auth changed during module load starts only a fresh session context',async()=>{
 const g=await ready('admin');g.runtime.clearToken();g.finish(0);await flush();assert.equal(g.renders.length,0);assert.equal(g.runtime.inspectReloadSafety().reason,'clear');
 assert.equal(g.loads.length,2);g.finish(1);await flush();assert.equal(g.renders.length,1);assert.equal(g.runtime.inspectReloadSafety().reason,'clear');
});
test('winning publication replaces pending editor load but preserves an already started editor',async()=>{
 const g=await ready('purchase');const refresh=g.pwa.refreshPublication();g.requests[1].resolve({...publication,manifest:{...publication.manifest,commit:'b'.repeat(40),plans:['second']}});await refresh;
 g.finish(0);await flush();assert.equal(g.renders.length,0);g.finish(1);await flush();assert.equal(g.renders[0].ctx.planId,'second');const el=g.renders[0].el;
 const next=g.pwa.refreshPublication();g.requests[2].resolve(publication);await next;assert.equal(g.renders.length,1);assert.equal(el.isConnected,true);
});
test('loader rejection and abandoned failure never create orphan coverage or paint new outlet',async()=>{
 const g=await ready('admin');g.route('purchase','new');g.loads[0].reject(Error('old import'));await flush();assert.equal(g.outlets.at(-1).children.length,1);
 g.loads[1].reject(Error('current import'));await flush();assert.equal(g.renders.length,0);assert.equal(g.runtime.inspectReloadSafety().reason,'clear');assert.equal(g.outlets.at(-1).children.at(-1).textContent,'data.notReady');
});
test('loading does not acknowledge an earlier untracked render of the same route',async()=>{
 const g=await ready('admin');g.ack=false;g.finish(0);await flush();assert.equal(g.runtime.inspectReloadSafety().reason,'untracked');g.changeLanguage();assert.equal(g.runtime.inspectReloadSafety().reason,'untracked');
 g.loads[1].reject(Error('new import'));await flush();assert.equal(g.runtime.inspectReloadSafety().reason,'untracked');
});
test('unrelated dirty/pending/unknown owners survive loader waiting, failure and navigation',async()=>{
 for(const [phase,dirty,reason] of [['idle',true,'dirty'],['saving',false,'saving'],['unknown',false,'unknown']]){
  const g=await ready('admin');g.runtime.registerReloadRecords('prior',()=>[{ownerId:'prior',kind:'editor',id:'first',generation:1,phase,dirty}]);g.route('menu','');g.loads[0].reject(Error('abandoned'));await flush();assert.equal(g.runtime.inspectReloadSafety().reason,reason);g.finish(1);await flush();assert.equal(g.runtime.inspectReloadSafety().reason,reason);
 }
});
test('renderer rejection cannot declare a started but unresolved page read-only',async()=>{
 const g=await ready('admin');g.loads[0].resolve({render(){throw Error('owner setup incomplete');}});await flush();assert.equal(g.runtime.inspectReloadSafety().reason,'untracked');
});
