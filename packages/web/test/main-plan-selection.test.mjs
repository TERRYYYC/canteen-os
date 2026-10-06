/** Real application owner; only page presentation and public I/O are controlled. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
const web=dirname(fileURLToPath(new URL('../package.json',import.meta.url))),require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const mocks={
 './data':`export const dataApi=globalThis.probe.data;export class PublishedDataError extends Error {}`,
 './i18n':`export const getLang=()=>globalThis.probe.lang;export const t=x=>x;export const onLangChange=fn=>{globalThis.probe.changeLanguage=lang=>{globalThis.probe.lang=lang;fn();};};`,
 './pwa':`export const initPwa=(_shell,hooks)=>{globalThis.probe.pwa=hooks;};`,
 './router':`export const normalize=()=>{};export const hrefOf=(page,rest='')=>'#/'+page+(rest?'/'+encodeURIComponent(rest):'');export const onRoute=fn=>{const g=globalThis.probe;g.route=fn;fn(g.initialRoute,g.initialRest,g.initialPlan);};`,
 './shell':`export const mountShell=()=>globalThis.probe.shell;`,
};
const bundle=await esbuild.build({stdin:{contents:"import './src/main';export {clearToken} from './src/admin/token';",resolveDir:web},bundle:true,write:false,format:'iife',globalName:'runtime',platform:'browser',logLevel:'silent',plugins:[{name:'controlled-main',setup(b){
 b.onResolve({filter:/./},a=>{if(a.path.endsWith('.css'))return {path:a.path,namespace:'empty'};if(a.importer!==join(web,'src/main.ts'))return;if(a.path.startsWith('./pages/'))return {path:a.path,namespace:'page'};if(mocks[a.path])return {path:a.path,namespace:'mock'};});
 b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}));
 b.onLoad({filter:/.*/,namespace:'page'},()=>({contents:`export function render(el,ctx){globalThis.probe.renders.push({el,ctx});ctx.setReloadCoverage('tracked');}`}));
}}]});
const tick=()=>new Promise(setImmediate);
async function flush(){for(let i=0;i<4;i++)await tick();}
const old={schemaVersion:'3',name:{zh:'旧演示',en:'Old demo',uk:'Старе демо'},dateRange:{start:'2026-09-12',end:'2026-09-13'},meals:[]};
const fresh={schemaVersion:'3',name:{zh:'本周真实计划',en:'This week',uk:'Цей тиждень'},dateRange:{start:'2026-10-05',end:'2026-10-11'},meals:[]};
const publication={kind:'team-meals',manifest:{commit:'a'.repeat(40),plans:['team-week','week-2026-41']}};
function boot({route='menu',rest='',plan,records={'team-week':old,'week-2026-41':fresh},storage=new Map(),load}={}){
 const g={initialRoute:route,initialRest:rest,initialPlan:plan,lang:'en',renders:[],selections:[],storage};
 g.data={loadPublication:async()=>publication,loadPublishedTeamPlan:load??(async(p,id)=>({planId:id,projection:{menuPlans:{[id]:records[id]}}}))};
 g.shell={setActive(){},setTitle(){},refresh(){},setBuild(){},setPlanSelection(value,choose){g.selections.push(value);g.choose=choose;},newOutlet(){if(g.outlet)g.outlet.isConnected=false;return g.outlet={isConnected:true,append(){}};}};
 const FixedDate=class extends Date {constructor(...args){super(...(args.length?args:['2026-10-06T12:00:00Z']));}static now(){return Date.parse('2026-10-06T12:00:00Z');}};
 runInNewContext(bundle.outputFiles[0].text+';probe.runtime=runtime;',{probe:g,Date:FixedDate,URLSearchParams,structuredClone,console,location:{hash:'#/'+route},history:{state:null,replaceState(_s,_t,hash){g.hash=hash;}},document:{getElementById:()=>({}),createElement:()=>({remove(){}})},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 return g;
}
test('ordinary entry resolves real current dates while the lexically first old demo remains published',async()=>{
 const g=boot();await flush();assert.equal(g.renders.at(-1).ctx.planId,'week-2026-41');
});
test('explicit historical choice survives routes, all languages, refresh and copyable public deep links',async()=>{
 const storage=new Map(),g=boot({plan:'team-week',storage});await flush();assert.equal(g.renders.at(-1).ctx.planId,'team-week');
 for(const [route,rest] of [['admin','plan/team-week'],['prep','2026-09-12/lunch/tomato'],['purchase','new'],['menu','2026-09-12']]){g.route(route,rest);await flush();assert.equal(g.renders.at(-1).ctx.planId,'team-week');assert.equal(g.renders.at(-1).ctx.rest,rest);}
 for(const lang of ['zh','uk','en']){g.changeLanguage(lang);await flush();assert.equal(g.renders.at(-1).ctx.planId,'team-week');}
 assert.match(g.renders.at(-1).ctx.planSelection.href('prep','2026-09-12/lunch'),/\?plan=team-week$/);
 const refreshed=boot({storage});await flush();assert.equal(refreshed.renders.at(-1).ctx.planId,'team-week');
});
test('explicit newly opened unpublished plan continues to public and shopping entry without substituting demo',async()=>{
 const g=boot({route:'admin',rest:'plan/week-2026-42/select/kb-'+ 'a'.repeat(32)+'-v1'});await flush();
 assert.equal(g.renders.at(-1).ctx.planId,'week-2026-42');
 g.route('menu','');await flush();assert.equal(g.renders.at(-1).ctx.planId,'week-2026-42');
 g.route('purchase','new');await flush();assert.equal(g.renders.at(-1).ctx.planId,'week-2026-42');
});
test('only expired plans never silently become current; user must choose or create',async()=>{
 const g=boot({records:{'team-week':old,'week-2026-41':old}});await flush();assert.equal(g.renders.at(-1).ctx.planId,null);
});
test('late date resolution cannot replace explicit selection or a newer route',async()=>{
 let release;const pending=new Promise(r=>release=r),g=boot({load:async(_p,id)=>{await pending;return {planId:id,projection:{menuPlans:{[id]:id==='team-week'?old:fresh}}};}});
 await tick();g.route('prep','2026-09-12/lunch','team-week');release();await flush();
 assert.equal(g.renders.at(-1).ctx.route,'prep');assert.equal(g.renders.at(-1).ctx.planId,'team-week');
 assert.equal(g.renders.some(r=>r.ctx.route==='menu'),false);
});
test('private title is memory-only, clears on auth change, and an abandoned callback cannot reset new selection',async()=>{
 const storage=new Map(),g=boot({route:'admin',rest:'plan/week-2026-42',storage});await flush();const oldCtx=g.renders.at(-1).ctx;
 oldCtx.planSelection.select('week-2026-42',{en:'Private draft title'});
 assert.ok(g.selections.at(-1).choices.some(choice=>choice.name?.en==='Private draft title'));
 assert.deepEqual([...storage.values()],['week-2026-42']);
 g.runtime.clearToken();g.route('menu','','team-week');await flush();
 assert.equal(g.selections.at(-1).choices.some(choice=>choice.name?.en==='Private draft title'),false);
 oldCtx.planSelection.select('week-2026-42',{en:'Late secret'});
 assert.equal(g.selections.at(-1).id,'team-week');assert.equal(g.selections.at(-1).choices.some(choice=>choice.name?.en==='Late secret'),false);
});
test('a plan response arriving between user selection and hashchange cannot restore the previous plan',async()=>{
 const g=boot({route:'admin',rest:'plan/team-week'});await flush();const old=g.renders.at(-1).ctx;
 g.choose('week-2026-42');old.planSelection.select('team-week',{en:'Late previous plan'});
 assert.equal(g.selections.at(-1).id,'week-2026-42');
 g.route('admin','plan/week-2026-42','week-2026-42');await flush();assert.equal(g.renders.at(-1).ctx.planId,'week-2026-42');
});
