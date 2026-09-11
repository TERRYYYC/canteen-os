import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root='/private/tmp/rcq-review-copy-810df70-1q6ohxtf';
const {createPageFixture,currentFiles,json,fixedAt}=await import(pathToFileURL(root+'/packages/web/test/e2e/team-meals/page-fixture.mjs'));
const {WORKER,TOKENS}=await import(pathToFileURL(root+'/packages/worker/test/helpers.mjs'));
const {PNG_B}=await import(pathToFileURL(root+'/packages/worker/test/image-fixtures.mjs'));
const {projectTeamMeals,estimateShoppingList}=await import(pathToFileURL(root+'/packages/core/dist/index.js'));
const worker=(await import(WORKER)).default;
const readJson=async p=>JSON.parse(await readFile(root+'/'+p,'utf8'));
const repair=await readJson('docs/field-test/team-meals/page-repair-5049/ledger.json');
const baseBytes=await readFile(root+'/docs/field-test/team-meals/page-browser/ledger-842-page-run.json');
const base=JSON.parse(baseBytes);
const week=await readJson('docs/field-test/team-meals/page-additional-842/T01-week-handler-delta.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(baseBytes),week.priorLedgerSha256);
globalThis.fetch=()=>{throw new Error('Review must not use native network');};
const results={reviewedHeadSha:'810df706519c92622d4706b03c69484ba2fb9911',layer:'real Worker replay and actual formatter comparison; not a new browser run',nativeFetch:'disabled',repair:{requests:[]},week:{requests:[]},formattedLanguages:[]};
function changeMetadata(fixture){
 const files=currentFiles(fixture.repo),ingredient=JSON.parse(files['data/ingredients/tomato.json']);
 ingredient.name={zh:'番茄 B版',en:'Tomato revision B',uk:'Томат версії B'};
 files['data/ingredients/tomato.json']=json(ingredient);files['data/ingredients/pattern.png']=PNG_B;
 fixture.repo.commit(files,'L1 external metadata/image change');
}
const fileHashes=f=>Object.fromEntries(Object.entries(currentFiles(f.repo)).map(([p,b])=>[p,hash(b)]));
async function replayOne(fixture,row){
 const headers={Authorization:`Bearer ${TOKENS.chef}`};
 if(row.ifMatch)headers['If-Match']=row.ifMatch;
 if(row.ifNoneMatch)headers['If-None-Match']=row.ifNoneMatch;
 if(row.body)headers['Content-Type']='application/json';
 const response=await worker.fetch(new Request(`https://worker.example.invalid${row.path}${row.search}`,{method:row.method,headers,body:row.body?JSON.stringify(row.body):undefined}),fixture.env);
 const bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(response.status,row.status,`request ${row.id} status`);
 assert.equal(hash(bytes),row.responseSha256,`request ${row.id} response bytes`);
 assert.deepEqual(Object.fromEntries(response.headers),row.responseHeaders,`request ${row.id} headers`);
 assert.equal(fixture.repo.head,row.head,`request ${row.id} resulting head`);
 return {id:row.id,method:row.method,path:row.path,status:response.status,responseSha256:hash(bytes),head:fixture.repo.head,statusHeadersAndBytes:'exact'};
}
const fixture=createPageFixture(),weekFixture=createPageFixture();
const bundleDir=await mkdtemp(join(tmpdir(),'rcq-copy-formatter-review-'));
try{
 assert.equal(fixture.revision,repair.metadata.fixtureRevision);
 for(const row of repair.requests){if(row.id===9)changeMetadata(fixture);results.repair.requests.push(await replayOne(fixture,row));}
 results.repair.finalFiles=fileHashes(fixture);
 assert.deepEqual(results.repair.finalFiles,Object.fromEntries(Object.entries(repair.files).map(([p,v])=>[p,v.sha256])));
 results.repair.finalHead=fixture.repo.head;
 const require=createRequire(root+'/packages/web/package.json');
 const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')));
 const bundle=await esbuild.build({stdin:{contents:'export {shoppingCopy} from "./src/pages/shopping-copy.ts";',resolveDir:root+'/packages/web'},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
 const entry=join(bundleDir,'copy.mjs');await writeFile(entry,bundle.outputFiles[0].text);
 const {shoppingCopy}=await import(pathToFileURL(entry));
 const list=repair.requests.find(r=>r.id===8).body;
 const revision=list.basis.sourceRevision;
 const plan=JSON.parse(fixture.repo.fileText('data/menu-plans/team-week.json',revision));
 const catalog=repair.requests.find(r=>r.id===4).response;
 assert.equal(catalog.commit,revision);
 const inputs={menuPlans:{'team-week':plan},dishes:catalog.dishes,ingredients:catalog.ingredients,techniques:catalog.techniques};
 const projection=projectTeamMeals(inputs,list.basis),estimate=estimateShoppingList(inputs,list.basis.selection,fixedAt);
 for(const lang of ['zh','en','uk']){
  const text=shoppingCopy(list,projection,lang,estimate);
  for(const stem of ['T08-original-lunch-native-','T08-original-lunch-fallback-','T08-bound-A-unapplied-B-native-'])assert.equal(text,await readFile(root+'/docs/field-test/team-meals/page-repair-5049/'+stem+lang+'.txt','utf8'),`${lang}:${stem}`);
  results.formattedLanguages.push({lang,utf8Bytes:Buffer.byteLength(text),sha256:hash(text),nativeFallbackAndAAfterB:'exact actual-formatter match'});
 }
 let beforeWeek;
 for(const row of [...base.requests,...week.requests]){
  if(row.id===12)changeMetadata(weekFixture);
  results.week.requests.push(await replayOne(weekFixture,row));
  if(row.id===52){beforeWeek=fileHashes(weekFixture);assert.deepEqual(beforeWeek,Object.fromEntries(Object.entries(base.files).map(([p,v])=>[p,v.sha256])));}
 }
 const afterWeek=fileHashes(weekFixture);
 results.week.changedFiles=Object.keys(afterWeek).filter(p=>afterWeek[p]!==beforeWeek[p]);
 assert.deepEqual(results.week.changedFiles,week.changedFiles);
 assert.deepEqual(results.week.changedFiles,['data/menu-plans/empty-check.json']);
 assert.equal(weekFixture.repo.head,week.head);
 const planAfter=JSON.parse(weekFixture.repo.fileText('data/menu-plans/empty-check.json'));
 assert.deepEqual(planAfter,week.requests[0].body);
 assert.equal(planAfter.meals.length,3);assert.ok(planAfter.meals.every(m=>!Object.hasOwn(m,'plannedServings')));
 results.week.finalFiles=afterWeek;results.week.finalHead=weekFixture.repo.head;results.week.originalPrefixRequests=52;results.week.additionalRequests=4;results.week.originalLedgerSha256=hash(baseBytes);
 await writeFile('/private/tmp/rcq-copy-810df70-replay-result.json',JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify({reviewedHeadSha:results.reviewedHeadSha,layer:results.layer,repairRequests:results.repair.requests.length,repairFiles:Object.keys(results.repair.finalFiles).length,formattedLanguages:results.formattedLanguages,weekPrefix:52,weekAdded:4,weekChangedFiles:results.week.changedFiles,allStatusHeadersAndResponseBytes:'exact',nativeFetch:'disabled'}));
}finally{await rm(fixture.root,{recursive:true,force:true});await rm(weekFixture.root,{recursive:true,force:true});await rm(bundleDir,{recursive:true,force:true});}
