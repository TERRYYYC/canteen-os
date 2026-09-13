import assert from 'node:assert/strict';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root='/private/tmp/rcq-review-import-1a0668e-wybc_s5s';
const dir=root+'/docs/field-test/team-meals/page-repair-6bb';
const {createPageFixture,currentFiles}=await import(pathToFileURL(root+'/packages/web/test/e2e/team-meals/page-fixture.mjs'));
const {WORKER,TOKENS}=await import(pathToFileURL(root+'/packages/worker/test/helpers.mjs'));
const worker=(await import(WORKER)).default;
const ledger=JSON.parse(await readFile(dir+'/ledger.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixture=createPageFixture();
const before=Object.fromEntries(Object.entries(fixture.files).map(([p,b])=>[p,hash(b)]));
const result={reviewedHeadSha:'1a0668ef4eb985d908f3fc44348bd9a2d9008595',layer:'independent real Worker replay plus saved-DOM/raw-row checks; no browser rerun',nativeFetch:'disabled',requests:[],captures:{},conditionChain:[],finalRows:[]};
globalThis.fetch=()=>{throw new Error('Review must not use native network');};
try {
 assert.equal(fixture.revision,ledger.metadata.fixtureRevision);
 assert.deepEqual(ledger.controls,[{action:'hold-next',path:'/plan/team-week'},{action:'release'}]);
 let priorBlob;
 for(const row of ledger.requests){
  const headers={Authorization:`Bearer ${TOKENS.chef}`};
  if(row.ifMatch)headers['If-Match']=row.ifMatch;
  if(row.ifNoneMatch)headers['If-None-Match']=row.ifNoneMatch;
  if(row.body)headers['Content-Type']='application/json';
  if(row.method==='POST'){
   assert.equal(row.ifMatch,priorBlob,`request ${row.id}: original C conditional chain`);
   assert.equal(row.ifNoneMatch,null);
   result.conditionChain.push({requestId:row.id,ifMatch:row.ifMatch,priorAcknowledgedBlob:priorBlob});
  }
  const response=await worker.fetch(new Request(`https://worker.example.invalid${row.path}${row.search}`,{method:row.method,headers,body:row.body?JSON.stringify(row.body):undefined}),fixture.env);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(response.status,row.status,`request ${row.id}: status`);
  assert.deepEqual(Object.fromEntries(response.headers),row.responseHeaders,`request ${row.id}: headers`);
  assert.equal(hash(bytes),row.responseSha256,`request ${row.id}: response bytes`);
  assert.equal(fixture.repo.head,row.head,`request ${row.id}: head`);
  const body=JSON.parse(bytes);
  if(row.id===1||row.method==='POST')priorBlob=body.blobSha;
  result.requests.push({id:row.id,method:row.method,path:row.path,status:response.status,responseSha256:hash(bytes),head:fixture.repo.head,verified:'status, headers, full response bytes and resulting head exact'});
 }
 result.finalFiles=Object.fromEntries(Object.entries(currentFiles(fixture.repo)).map(([p,b])=>[p,hash(b)]));
 assert.deepEqual(result.finalFiles,Object.fromEntries(Object.entries(ledger.files).map(([p,v])=>[p,v.sha256])));
 result.changedFiles=Object.keys(result.finalFiles).filter(p=>result.finalFiles[p]!==before[p]);
 assert.deepEqual(result.changedFiles,['data/menu-plans/team-week.json']);
 const postRows=ledger.requests.filter(r=>r.method==='POST');
 assert.deepEqual(postRows.map(r=>r.id),[3,6,8]);
 assert.deepEqual(ledger.requests.filter(r=>r.path.startsWith('/source/')).map(r=>r.id),[1,10]);
 const six=postRows[1].body,seven=postRows[2].body;
 assert.equal(six.meals.length,6);assert.equal(seven.meals.length,7);
 assert.ok(six.meals.every(m=>m.date!=='2026-09-17'));
 assert.deepEqual(seven.meals.slice(0,6),six.meals);
 assert.deepEqual(seven.meals[6],{date:'2026-09-17',mealType:'lunch',dishRef:'first-dish'});
 assert.ok(seven.meals.every(m=>!Object.hasOwn(m,'plannedServings')));
 assert.ok(!seven.meals.some(m=>m.dishRef==='second-dish'));
 assert.ok(seven.meals.some(m=>m.date==='2026-09-16'&&m.mealType==='breakfast'));
 assert.deepEqual(seven.name,postRows[0].body.name);
 assert.deepEqual(seven,ledger.requests.find(r=>r.id===10).response.content);
 const dom=async name=>readFile(dir+'/'+name+'.txt','utf8');
 const counts=value=>[...value.matchAll(/spinbutton "份数（选填）"(?: \[active\])?(?:: "([^"]*)")?/g)].map(m=>m[1]??'');
 for(const [name,expected] of [
  ['T01-import-unrelated-edit-before',['11','']],['T01-import-unrelated-edit-lost',['11','']],
  ['T01-import-unrelated-all-dates',['11','','','2','']],
  ['T01-invalid-after-sort',['','13.7','','','2','']],['T01-matched-omitted-keeps-invalid',['','13.7','','','2','']],
  ['T01-explicit-seven-keeps-other-edits',['','7','','2','','']],['T01-explicit-blank-immediate',['','7','','2','','']],
  ['T01-explicit-blank-keyboard',['','7','','','','']],['T01-explicit-clear-applied',['','','','','','']],
  ['T01-final-source-reloaded',['','','','','','','']]
 ]){const actual=counts(await dom(name));assert.deepEqual(actual,expected,name);result.captures[name]=actual;}
 const sorted=await dom('T01-invalid-after-sort');
 const sept14=sorted.split('heading "2026-09-14 · 午餐"')[1].split('heading "2026-09-15')[0];
 assert.equal((sept14.match(/"13\.7"/g)||[]).length,1);
 assert.ok(sorted.includes('button "保存计划" [disabled]'));
 for(const lang of ['en','uk']){const text=await dom('T01-invalid-language-'+lang);assert.equal((text.match(/"13\.7"/g)||[]).length,1);result.captures['raw-'+lang]='13.7 retained once';}
 const pending=await dom('T07-import-before-old-ack'),after=await dom('T07-import-after-old-ack');
 assert.ok(pending.includes('正在保存，可继续编辑')&&pending.includes('2026-09-17 · 午餐'));
 assert.ok(after.includes('有未保存的修改')&&after.includes('2026-09-17 · 午餐')&&after.includes(postRows[1].response.commit.slice(0,8)));
 result.captures.lateAck='seventh later meal visible during saving and remains dirty after original six-row ACK';
 const visible=JSON.parse(await readFile(dir+'/T01-final-visible-rows.json'));
 assert.equal(visible.length,7);assert.deepEqual(visible.map(r=>Number(r.index)).sort(),[0,1,2,3,4,5,6]);
 for(const row of visible){assert.equal(row.dish,seven.meals[Number(row.index)].dishRef);assert.equal(row.value,'');}
 result.finalRows=seven.meals;result.finalVisibleRows=visible;result.finalHead=fixture.repo.head;
 result.transportScope='Hold/release flags and before/after states verified from captures; this replay validates handler outputs, not wall-clock/browser timing.';
 await writeFile('/private/tmp/rcq-import-1a0668e-replay-result.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({reviewedHeadSha:result.reviewedHeadSha,layer:result.layer,requests:result.requests.length,postIds:postRows.map(r=>r.id),sourceIds:[1,10],statusHeadersAndResponseBytes:'all exact',finalFiles:Object.keys(result.finalFiles).length,changedFiles:result.changedFiles,finalRows:result.finalRows.length,allFinalCounts:'absent, no zero/default',finalHead:result.finalHead,rawAndLateAck:'captured predicates exact',nativeFetch:result.nativeFetch}));
}finally{await rm(fixture.root,{recursive:true,force:true});}
