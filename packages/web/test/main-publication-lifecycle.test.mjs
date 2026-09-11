/** Actual main + actual auth/coverage; only presentation and publication I/O are controlled. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
const web=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const mocks={
 './data':`const g=globalThis.probe;export const dataApi=g.data;export class PublishedDataError extends Error {constructor(code,stage,url,status){super(code);Object.assign(this,{code,stage,url,status})}}`,
 './i18n':`export const getLang=()=> 'en';export const t=x=>x;export const onLangChange=fn=>{globalThis.probe.changeLanguage=fn;};`,
 './pwa':`export const initPwa=(_shell,hooks)=>{globalThis.probe.pwa=hooks;};`,
 './router':`export const normalize=()=>{};export const onRoute=fn=>{const g=globalThis.probe;g.route=fn;fn(g.initialRoute,'first');};`,
 './shell':`export const mountShell=()=>globalThis.probe.shell;`,
 './theme':`export const applyTheme=()=>{};`,
};
const bundle=await esbuild.build({stdin:{contents:"import './src/main';export {inspectReloadSafety,registerReloadRecords} from './src/view-models/reload-safety';export {clearToken} from './src/admin/token';",resolveDir:web},bundle:true,write:false,format:'iife',globalName:'runtime',platform:'browser',logLevel:'silent',plugins:[{name:'controlled-main-surfaces',setup(build){
 build.onResolve({filter:/./},args=>{
  if(args.path.endsWith('.css'))return {path:args.path,namespace:'empty'};
  if(args.importer!==join(web,'src/main.ts'))return;
  if(args.path.startsWith('./pages/'))return {path:args.path,namespace:'pages'};
  if(mocks[args.path])return {path:args.path,namespace:'mock'};
 });
 build.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));
 build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path]}));
 build.onLoad({filter:/.*/,namespace:'pages'},()=>({contents:`export function render(el,ctx){globalThis.probe.renders.push({el,ctx});ctx.setReloadCoverage('tracked');}`}));
}}]});
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
const flush=()=>new Promise(setImmediate);
function boot(initialRoute){
 const g={initialRoute,renders:[],requests:[]},values=new Map([['canteenos.token','A'.repeat(43)]]);
 g.data={loadPublication(){const request=deferred();g.requests.push(request);return request.promise;}};
 g.shell={setActive(){},setTitle(){},refresh(){},setBuild(){},newOutlet(){return {isConnected:true,append(){}};}};
 runInNewContext(bundle.outputFiles[0].text+';probe.runtime=runtime;',{probe:g,structuredClone,console,document:{getElementById:()=>({}),createElement:()=>({})},sessionStorage:{getItem:k=>values.get(k)??null,removeItem:k=>values.delete(k)}});
 return g;
}
const publication={kind:'team-meals',manifest:{commit:'a'.repeat(40),builtAt:'2026-09-11',plans:['first']}};
test('shell-only loading is read-only across auth changes before the first page starts',async()=>{
 for(const route of ['admin','purchase']){
  const g=boot(route);assert.equal(g.renders.length,0);g.runtime.clearToken();
  g.requests[0].resolve(publication);await flush();
  assert.equal(g.renders.length,1);assert.equal(g.runtime.inspectReloadSafety().reason,'clear',route);
 }
});
test('leaving or redrawing a shell-only loading route does not orphan page coverage',async()=>{
 const g=boot('admin');g.changeLanguage();g.route('purchase','second');g.route('menu','');
 g.requests[0].resolve(publication);await flush();
 assert.equal(g.renders.length,1);assert.equal(g.runtime.inspectReloadSafety().reason,'clear');
});
test('loading coverage never retires an unrelated unresolved owner',async()=>{
 const g=boot('admin');g.runtime.registerReloadRecords('unresolved-owner',()=>[{ownerId:'unresolved-owner',kind:'unknown',id:'previous-session-save',generation:1,dirty:false,phase:'unknown',pending:true}]);
 g.runtime.clearToken();g.requests[0].reject(Error('Unavailable initial publication'));await flush();
 assert.equal(g.renders.length,1);assert.equal(g.runtime.inspectReloadSafety().reason,'unknown');
 assert.equal(g.runtime.inspectReloadSafety().records.some(r=>r.ownerId==='unresolved-owner'),true);
});
