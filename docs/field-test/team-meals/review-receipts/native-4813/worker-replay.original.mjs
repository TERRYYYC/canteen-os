import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPageFixture,currentFiles,json} from '/private/tmp/rcq-review-native-4813-qr6b7sou/packages/web/test/e2e/team-meals/page-fixture.mjs';
import {WORKER,TOKENS} from '/private/tmp/rcq-review-native-4813-qr6b7sou/packages/worker/test/helpers.mjs';
import {PNG_B} from '/private/tmp/rcq-review-native-4813-qr6b7sou/packages/worker/test/image-fixtures.mjs';
const worker=(await import(WORKER)).default;
const ledger=JSON.parse(await readFile('/private/tmp/rcq-review-native-4813-qr6b7sou/docs/field-test/team-meals/page-browser/ledger-842-page-run.json'));
const fixture=createPageFixture();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
globalThis.fetch=()=>{throw new Error('Independent review must not use native network');};
try {
 assert.equal(fixture.revision,ledger.metadata.fixtureRevision);
 for(const row of ledger.requests) {
  if(row.id===12) {
   // Replay the sole recorded external model mutation at its observed head boundary.
   const files=currentFiles(fixture.repo),ingredient=JSON.parse(files['data/ingredients/tomato.json']);
   ingredient.name={zh:'番茄 B版',en:'Tomato revision B',uk:'Томат версії B'};
   files['data/ingredients/tomato.json']=json(ingredient);
   files['data/ingredients/pattern.png']=PNG_B;
   fixture.repo.commit(files,'L1 external metadata/image change');
  }
  const headers={Authorization:`Bearer ${TOKENS.chef}`};
  if(row.ifMatch)headers['If-Match']=row.ifMatch;
  if(row.ifNoneMatch)headers['If-None-Match']=row.ifNoneMatch;
  if(row.body)headers['Content-Type']='application/json';
  const response=await worker.fetch(new Request(`https://worker.example.invalid${row.path}${row.search}`,{method:row.method,headers,body:row.body?JSON.stringify(row.body):undefined}),fixture.env);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(response.status,row.status,`request ${row.id} status`);
  assert.equal(hash(bytes),row.responseSha256,`request ${row.id} body bytes`);
  assert.deepEqual(Object.fromEntries(response.headers),row.responseHeaders,`request ${row.id} headers`);
  assert.equal(fixture.repo.head,row.head,`request ${row.id} repository head`);
 }
 assert.equal(fixture.repo.head,ledger.head);
 assert.deepEqual(Object.fromEntries(Object.entries(currentFiles(fixture.repo)).map(([file,bytes])=>[file,hash(bytes)])),Object.fromEntries(Object.entries(ledger.files).map(([file,e])=>[file,e.sha256])));
 console.log(JSON.stringify({reviewHead:'4813ebb2cb57330554f793a60d9d7d7ea09fa405',layer:'independent replay of captured requests through real Worker, not a browser replay',responses:ledger.requests.length,statusHeadersAndResponseBytes:'all exact',finalFiles:Object.keys(ledger.files).length,finalHead:fixture.repo.head,nativeFetch:'disabled'}));
}finally{await rm(fixture.root,{recursive:true,force:true});}
