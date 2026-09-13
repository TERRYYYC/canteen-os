// Independent environment probe only; no product assertions or production edits.
import assert from 'node:assert/strict';
import {setup} from './packages/web/test/team-meals-pages-guard-harness.mjs';
const keys=['window','document','location','localStorage','sessionStorage','navigator','HTMLElement','MutationObserver','fixture','setTimeout','clearTimeout','setInterval','clearInterval'];
const descriptor=k=>Object.getOwnPropertyDescriptor(globalThis,k),outer=new Map(keys.map(k=>[k,descriptor(k)]));
const eventPrototype=Object.getOwnPropertyDescriptors(Event.prototype),report={execPath:process.execPath,node:process.version,platform:process.platform,arch:process.arch,results:[]};
function sameGlobals(expected){for(const [key,value]of expected)assert.deepEqual(descriptor(key),value,key);assert.deepEqual(Object.getOwnPropertyDescriptors(Event.prototype),eventPrototype);}
try{
 for(const mode of ['original','absent','custom-getter']){
  if(mode==='absent')delete globalThis.navigator;
  if(mode==='custom-getter')Object.defineProperty(globalThis,'navigator',{configurable:true,enumerable:false,get:()=>({marker:'sentinel'})});
  const expected=new Map(keys.map(k=>[k,descriptor(k)]));
  const s=await setup();
  assert.equal(s.unload(),false);
  let observed;const legacyVeto=e=>{observed=e;assert.equal(e.returnValue,'');assert.equal(Object.hasOwn(e,'returnValue'),true);e.returnValue=7;assert.equal(e.returnValue,'7');};
  window.addEventListener('beforeunload',legacyVeto);assert.equal(s.unload(),true);assert.equal(observed.defaultPrevented,false);window.removeEventListener('beforeunload',legacyVeto);
  const prevent=e=>e.preventDefault();window.addEventListener('beforeunload',prevent);assert.equal(s.unload(),true);window.removeEventListener('beforeunload',prevent);
  const empty=e=>{e.returnValue='';};window.addEventListener('beforeunload',empty);assert.equal(s.unload(),false);window.removeEventListener('beforeunload',empty);
  s.cleanup();sameGlobals(expected);report.results.push({mode,normalCleanup:true,instanceDOMString:true,legacyNonemptyVeto:true,preventDefaultVeto:true,emptyDoesNotVeto:true,eventPrototypeUnchanged:true});
  const failing=await setup(),sentinel=new Error('Independent cleanup exception');failing.legacy.dispose=()=>{throw sentinel;};assert.throws(()=>failing.cleanup(),e=>e===sentinel);sameGlobals(expected);report.results.push({mode,cleanupExceptionPropagates:true,descriptorsRestoredAfterException:true});
  const initial=outer.get('navigator');if(initial)Object.defineProperty(globalThis,'navigator',initial);else delete globalThis.navigator;
 }
 sameGlobals(outer);console.log(JSON.stringify(report,null,2));
}finally{for(const [key,value]of outer){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
