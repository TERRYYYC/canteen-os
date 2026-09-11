// Environment-only preload: keep every existing business test and verify cleanup after its file.
import assert from 'node:assert/strict';
import {after} from 'node:test';
const keys=['window','document','location','localStorage','sessionStorage','navigator','HTMLElement','MutationObserver','fixture','setTimeout','clearTimeout','setInterval','clearInterval'];
const original=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const eventDescriptor=Object.getOwnPropertyDescriptor(Event.prototype,'returnValue');
after(()=>{
 for(const [key,descriptor] of original)assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,key),descriptor,`Restore original global descriptor: ${key}`);
 assert.deepEqual(Object.getOwnPropertyDescriptor(Event.prototype,'returnValue'),eventDescriptor,'Do not modify native Event.prototype');
 console.log(`BROWSER_GLOBAL_DESCRIPTORS_RESTORED ${process.version}: ${keys.length} globals; native Event.prototype unchanged`);
});
