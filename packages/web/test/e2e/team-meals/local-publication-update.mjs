/** Explicit local build step, invoked after reading the actual Plan save commit. */
import assert from 'node:assert/strict';
const [address,expectedRevision,...extra]=process.argv.slice(2);
assert.ok(address&&expectedRevision&&!extra.length,'Usage: node local-publication-update.mjs http://127.0.0.1:PORT/ SAVED_COMMIT');
const url=new URL(address);
assert.ok(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&!url.username&&!url.password);
assert.ok(!['3003','3004','4275','6399'].includes(url.port));
assert.match(expectedRevision,/^[0-9a-f]{40}$/);
const response=await fetch(new URL('/__local-publication',url),{method:'POST',redirect:'error',
  headers:{'Content-Type':'application/json','X-RCQ-Local-Build':'1'},body:JSON.stringify({expectedRevision}),signal:AbortSignal.timeout(30000)});
console.log(JSON.stringify(await response.json(),null,2));
if(!response.ok)process.exitCode=1;
